from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional
import logging
import hashlib
import hmac
import os

from fastapi import APIRouter, Body, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from pydantic import BaseModel, Field

from ...constant import WORKING_DIR
from ..auth_db import (
    init_auth_db,
    get_admin_count,
    get_user_by_phone,
    get_users_by_name,
)

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/auth", tags=["auth"])

_JWT_SECRET_PATH = WORKING_DIR / "auth_jwt_secret"
_JWT_ALG = "HS256"
_JWT_EXPIRE_DAYS = 7
_PWD_SALT_ENV = "COPAW_AUTH_SALT"
_PUBLIC_MEMORY = WORKING_DIR / "memory" / "public" / "MEMORY.md"
_EMPLOYEE_MEMORY_ROOT = WORKING_DIR / "memory" / "employees"


def _ensure_jwt_secret() -> str:
    if _JWT_SECRET_PATH.is_file():
        return _JWT_SECRET_PATH.read_text().strip()
    secret = os.urandom(32).hex()
    _JWT_SECRET_PATH.write_text(secret)
    return secret


def _get_jwt_secret() -> str:
    return _ensure_jwt_secret()


def _hash_password(password: str) -> str:
    salt = os.environ.get(_PWD_SALT_ENV, "copaw_auth_salt")
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()


def _verify_password(password: str, password_hash: str) -> bool:
    return hmac.compare_digest(_hash_password(password), password_hash)


def _ensure_memory_dirs() -> None:
    _PUBLIC_MEMORY.parent.mkdir(parents=True, exist_ok=True)
    _EMPLOYEE_MEMORY_ROOT.mkdir(parents=True, exist_ok=True)
    if not _PUBLIC_MEMORY.exists():
        _PUBLIC_MEMORY.write_text(
            "# 公司公共档案\n\n在这里记录公司简介、规章制度、产品信息等公共内容。\n",
            encoding="utf-8",
        )


def _employee_memory_path(profile_id: int) -> Path:
    p = _EMPLOYEE_MEMORY_ROOT / str(profile_id) / "MEMORY.md"
    p.parent.mkdir(parents=True, exist_ok=True)
    return p


def _ensure_employee_memory(profile_id: int, display_name: str) -> None:
    p = _employee_memory_path(profile_id)
    if not p.exists():
        p.write_text(
            f"# {display_name}的档案\n\n（在这里记录本员工的个人档案、岗位信息、项目经历等）\n",
            encoding="utf-8",
        )


def _check_user_profile_status(profile_id: int) -> bool:
    """
    检测用户档案完成状态
    
    Args:
        profile_id: 用户档案 ID
    
    Returns:
        bool: True 表示已有完整档案，False 表示需要完善
    """
    p = _employee_memory_path(profile_id)
    
    # 如果文件不存在，说明需要创建
    if not p.exists():
        return False
    
    # 读取档案内容
    try:
        content = p.read_text(encoding="utf-8")
        
        # 判断是否为默认模板
        is_default_template = (
            "（在这里记录本员工的个人档案" in content or
            len(content.strip()) < 100 or
            content.count('#') < 3  # 标题数量不足
        )
        
        return not is_default_template  # True 表示已有完整档案
        
    except Exception:
        return False


def _load_employee_memory(profile_id: int) -> str:
    """
    加载员工私有档案内容
    
    Args:
        profile_id: 用户档案 ID
    
    Returns:
        str: 档案内容，如果不存在则返回空字符串
    """
    p = _employee_memory_path(profile_id)
    if p.exists():
        try:
            return p.read_text(encoding="utf-8")
        except Exception:
            logger.warning(f"Failed to load employee memory for profile {profile_id}")
    return ""


def _load_public_memory() -> str:
    """
    加载公共记忆内容
    
    Returns:
        str: 公共记忆内容，如果不存在则返回空字符串
    """
    from ...constant import WORKING_DIR
    public_memory_path = WORKING_DIR / "memory" / "public" / "MEMORY.md"
    if public_memory_path.exists():
        try:
            return public_memory_path.read_text(encoding="utf-8")
        except Exception:
            logger.warning("Failed to load public memory")
    return ""


def _create_token(payload: dict[str, Any]) -> str:
    to_encode = payload.copy()
    expire = datetime.utcnow() + timedelta(days=_JWT_EXPIRE_DAYS)
    to_encode["exp"] = expire
    return jwt.encode(to_encode, _get_jwt_secret(), algorithm=_JWT_ALG)


def _decode_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _get_jwt_secret(), algorithms=[_JWT_ALG])
    except jwt.PyJWTError as exc:  # type: ignore[attr-defined]
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


security = HTTPBearer(auto_error=False)


class PasswordResetBody(BaseModel):
    new_password: str = Field(..., min_length=6)


class RoleBody(BaseModel):
    role: str = Field(..., pattern="^(employee|admin)$")


class StatusBody(BaseModel):
    status: str = Field(..., pattern="^(pending|active|disabled|rejected)$")


class DepartmentBody(BaseModel):
    department: str = Field(default="")


class MemoryBody(BaseModel):
    content: str = Field(...)


class AdminEmployeeProfileBody(BaseModel):
    english_name: Optional[str] = Field(default="")
    nickname: Optional[str] = Field(default="")
    aliases: Optional[str] = Field(default="")
    title: Optional[str] = Field(default="")
    department: Optional[str] = Field(default="")
    position: Optional[str] = Field(default="")
    is_executive: Optional[int] = Field(default=0)


def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict[str, Any]:
    if not creds:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    token = creds.credentials
    data = _decode_token(token)
    if data.get("status") != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Inactive user",
        )
    return data


@router.on_event("startup")
def _on_startup() -> None:
    init_auth_db()
    _ensure_memory_dirs()


@router.post("/register")
def register(
    name: str,
    phone: str,
    password: str,
    confirm_password: str,
) -> dict[str, Any]:
    if not name or not phone or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="name, phone and password are required",
        )
    if password != confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )
    if get_user_by_phone(phone):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Phone already registered",
        )

    # Lazy import to avoid circular deps
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        cur = conn.execute(
            """
INSERT INTO employee_profiles (name, phone)
VALUES (?, ?)
""",
            (name, phone),
        )
        profile_id = cur.lastrowid

        # If there is no admin yet, first registered user becomes active admin.
        role = "employee"
        status_val = "pending"
        if get_admin_count() == 0:
            role = "admin"
            status_val = "active"

        conn.execute(
            """
INSERT INTO users (name, phone, password_hash, role, status, profile_id)
VALUES (?, ?, ?, ?, ?, ?)
""",
            (name, phone, _hash_password(password), role, status_val, profile_id),
        )
    _ensure_employee_memory(profile_id, name)

    if status_val == "active":
        return {"message": "registered as admin", "auto_active": True}
    return {"message": "registered, waiting for approval", "auto_active": False}


@router.post("/login")
def login(identifier: str, password: str) -> dict[str, Any]:
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    user_row = None
    # Very simple phone detection
    if identifier.isdigit() and len(identifier) >= 6:
        user_row = get_user_by_phone(identifier)
    if user_row is None:
        users = get_users_by_name(identifier)
        if len(users) == 1:
            user_row = users[0]
        elif len(users) > 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Multiple users with same name, please login with phone",
            )
    if user_row is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if not _verify_password(password, user_row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )
    if user_row["status"] != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not approved or disabled",
        )

    with _get_conn() as conn:  # type: ignore[attr-defined]
        prof = conn.execute(
            "SELECT * FROM employee_profiles WHERE id = ?",
            (user_row["profile_id"],),
        ).fetchone()

    token = _create_token(
        {
            "user_id": user_row["id"],
            "profile_id": user_row["profile_id"],
            "name": user_row["name"],
            "phone": user_row["phone"],
            "role": user_row["role"],
            "status": user_row["status"],
            "department": prof["department"] if prof else None,
        },
    )
    
    # 预加载用户档案和公共档案
    profile_id = int(user_row["profile_id"])
    user_profile_content = _load_employee_memory(profile_id)
    public_memory_content = _load_public_memory()
    
    logger.info(
        "[Login] Loaded archives for user=%s (profile_id=%s): "
        "user_profile_len=%d, public_memory_len=%d",
        user_row["name"],
        profile_id,
        len(user_profile_content),
        len(public_memory_content),
    )
    
    return {
        "token": token,
        "user_profile": user_profile_content,
        "public_memory": public_memory_content,
        "hasCompleteProfile": _check_user_profile_status(profile_id)
    }


@router.get("/me")
def me(current=Depends(get_current_user)) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    return current


@router.get("/me/profile/status")
def get_profile_status(current=Depends(get_current_user)) -> dict[str, Any]:  # type: ignore[no-untyped-def]
    """
    获取当前用户的档案完成状态
    """
    profile_id = int(current.get("profile_id", 0))
    has_complete_profile = _check_user_profile_status(profile_id)
    
    return {
        "hasCompleteProfile": has_complete_profile,
        "department": current.get("department"),
        "profile_id": profile_id
    }


@router.put("/me/profile")
def update_user_profile(
    body: dict[str, Any],
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    """
    更新用户档案信息
    """
    from ..auth_db import _get_conn  # type: ignore[attr-defined]
    
    profile_id = int(current.get("profile_id", 0))
    name = current.get("name", "用户")
    phone = current.get("phone", "")
    
    # 提取表单数据
    department = str(body.get("department", ""))
    position = str(body.get("position", ""))
    work_background = str(body.get("workBackground", ""))
    tools = str(body.get("tools", ""))
    help_expectation = str(body.get("helpExpectation", ""))
    communication_style = str(body.get("communicationStyle", ""))
    
    # 更新数据库中的员工档案
    with _get_conn() as conn:  # type: ignore[attr-defined]
        conn.execute(
            """
            UPDATE employee_profiles 
            SET department = ?, position = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (department, position, profile_id)
        )
    
    # 生成完整的档案内容
    profile_content = f"""# {name}的档案

## 基本信息
- **姓名**：{name}
- **手机号**：{phone}
- **部门**：{department}
- **职位**：{position}

## 工作背景
{work_background if work_background else '（暂无详细信息）'}

## 常用工具
{tools if tools else '（暂无详细信息）'}

## 期望帮助
{help_expectation if help_expectation else '（暂无详细信息）'}

## 沟通偏好
{communication_style if communication_style else '（暂无详细信息）'}

## 项目经历
（在这里补充参与的项目和成就）

## 个人成长
（在这里记录学习计划和成长轨迹）
"""
    
    # 写入档案文件
    p = _employee_memory_path(profile_id)
    p.write_text(profile_content, encoding="utf-8")
    
    return {
        "success": True,
        "message": "档案已更新",
        "profile_id": profile_id
    }


@router.get("/admin/users")
def list_users(current=Depends(get_current_user)) -> list[dict[str, Any]]:  # type: ignore[no-untyped-def]
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        rows = conn.execute(
            """
            SELECT
                u.id,
                u.name,
                u.phone,
                u.role,
                u.status,
                u.profile_id,
                u.created_at,
                ep.department AS department,
                ep.position AS position,
                ep.english_name AS english_name,
                ep.nickname AS nickname,
                ep.aliases AS aliases,
                ep.title AS title,
                ep.is_executive AS is_executive
            FROM users u
            LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
            ORDER BY u.created_at DESC
            """,
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/admin/users/{user_id}/approve")
def approve_user(
    user_id: int,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        cur = conn.execute(
            "SELECT * FROM users WHERE id = ?",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        new_role = row["role"]
        if get_admin_count() == 0:
            new_role = "admin"
        conn.execute(
            "UPDATE users SET status = 'active', role = ? WHERE id = ?",
            (new_role, user_id),
        )
        profile_row = conn.execute(
            "SELECT id, name, phone, department, position FROM employee_profiles WHERE id = ?",
            (row["profile_id"],),
        ).fetchone()
    
    # 更新员工档案文件
    if profile_row:
        profile_id = int(profile_row["id"])
        name = str(profile_row["name"])
        phone = str(profile_row["phone"])
        department = str(profile_row["department"] or "未设置")
        position = str(profile_row["position"] or "未设置")
        
        # 生成档案内容
        profile_content = f"""# {name}的档案

## 基本信息
- **姓名**：{name}
- **手机号**：{phone}
- **部门**：{department}
- **职位**：{position}

## 工作背景
（在这里补充员工的工作职责、项目经历等）

## 个人偏好
（在这里记录员工的沟通偏好、工作习惯等）
"""
        
        # 写入档案文件
        p = _employee_memory_path(profile_id)
        p.write_text(profile_content, encoding="utf-8")
    
    return {"message": "approved", "role": new_role}


@router.post("/admin/users/{user_id}/reject")
def reject_user(
    user_id: int,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute("UPDATE users SET status = 'rejected' WHERE id = ?", (user_id,))
    return {"message": "rejected"}


@router.post("/admin/users/{user_id}/status")
def update_user_status(
    user_id: int,
    body: StatusBody = Body(...),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (body.status, user_id),
        )
    return {"message": "updated", "status": body.status}


@router.post("/admin/users/{user_id}/role")
def update_user_role(
    user_id: int,
    body: RoleBody = Body(...),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (body.role, user_id),
        )
    return {"message": "updated", "role": body.role}


@router.post("/admin/users/{user_id}/reset-password")
def reset_password(
    user_id: int,
    body: PasswordResetBody = Body(...),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (_hash_password(body.new_password), user_id),
        )
    return {"message": "password reset"}


@router.post("/admin/users/{user_id}/department")
def update_user_department(
    user_id: int,
    body: DepartmentBody = Body(...),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    department = str(body.department or "").strip()
    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT profile_id FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        conn.execute(
            "UPDATE employee_profiles SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (department, row["profile_id"]),
        )
    return {"message": "department updated", "department": department}


@router.put("/admin/users/{profile_id}/profile")
def update_admin_employee_profile(
    profile_id: int,
    body: AdminEmployeeProfileBody = Body(...),
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    _require_admin(current)
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    english_name = str(body.english_name or "").strip()
    nickname = str(body.nickname or "").strip()
    aliases = str(body.aliases or "").strip()
    title = str(body.title or "").strip()
    department = str(body.department or "").strip()
    position = str(body.position or "").strip()
    is_executive = 1 if int(body.is_executive or 0) else 0

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT id FROM employee_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        conn.execute(
            """
            UPDATE employee_profiles
            SET english_name = ?,
                nickname = ?,
                aliases = ?,
                title = ?,
                department = ?,
                position = ?,
                is_executive = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """,
            (
                english_name,
                nickname,
                aliases,
                title,
                department,
                position,
                is_executive,
                profile_id,
            ),
        )

    return {
        "message": "profile updated",
        "profile_id": profile_id,
        "department": department,
        "position": position,
    }


def _require_admin(current: dict[str, Any]) -> None:
    if current.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/admin/memory/public")
def get_public_memory(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, str]:
    _require_admin(current)
    _ensure_memory_dirs()
    return {"content": _PUBLIC_MEMORY.read_text(encoding="utf-8")}


@router.put("/admin/memory/public")
def put_public_memory(
    body: MemoryBody,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    _require_admin(current)
    _ensure_memory_dirs()
    _PUBLIC_MEMORY.write_text(body.content, encoding="utf-8")
    return {"written": True}


@router.get("/admin/memory/employee/{profile_id}")
def get_employee_memory(
    profile_id: int,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, str]:
    _require_admin(current)
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT name FROM employee_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        _ensure_employee_memory(profile_id, str(row["name"]))
    p = _employee_memory_path(profile_id)
    return {"content": p.read_text(encoding="utf-8")}


@router.put("/admin/memory/employee/{profile_id}")
def put_employee_memory(
    profile_id: int,
    body: MemoryBody,
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    _require_admin(current)
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT name FROM employee_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
    _ensure_employee_memory(profile_id, str(row["name"]))
    _employee_memory_path(profile_id).write_text(body.content, encoding="utf-8")
    return {"written": True}


@router.get("/me/memory-context")
def get_my_memory_context(
    current=Depends(get_current_user),  # type: ignore[no-untyped-def]
) -> dict[str, Any]:
    profile_id = int(current.get("profile_id"))
    from ..auth_db import _get_conn  # type: ignore[attr-defined]

    with _get_conn() as conn:  # type: ignore[attr-defined]
        row = conn.execute(
            "SELECT name FROM employee_profiles WHERE id = ?",
            (profile_id,),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
    _ensure_memory_dirs()
    _ensure_employee_memory(profile_id, str(row["name"]))
    return {
        "public_memory": str(_PUBLIC_MEMORY),
        "private_memory": str(_employee_memory_path(profile_id)),
        "scope": "self+public",
    }

