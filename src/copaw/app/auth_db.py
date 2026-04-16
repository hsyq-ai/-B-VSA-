import re
import sqlite3
from pathlib import Path
from typing import Optional

from ..constant import WORKING_DIR


DB_PATH = WORKING_DIR / "auth.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_employee_profile_columns(conn: sqlite3.Connection) -> None:
    cols = {
        str(r["name"])
        for r in conn.execute("PRAGMA table_info(employee_profiles)").fetchall()
    }

    def add(col: str, ddl: str) -> None:
        if col in cols:
            return
        conn.execute(f"ALTER TABLE employee_profiles ADD COLUMN {ddl}")
        cols.add(col)

    add("english_name", "english_name TEXT")
    add("nickname", "nickname TEXT")
    add("aliases", "aliases TEXT")
    add("title", "title TEXT")
    add("is_executive", "is_executive INTEGER DEFAULT 0")


def init_auth_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        conn.executescript(
            """
CREATE TABLE IF NOT EXISTS employee_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    department TEXT,
    position TEXT,
    extra_meta TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee',
    status TEXT NOT NULL DEFAULT 'pending',
    profile_id INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (profile_id) REFERENCES employee_profiles(id)
);
"""
        )
        _ensure_employee_profile_columns(conn)


def get_admin_count() -> int:
    with _get_conn() as conn:
        cur = conn.execute(
            "SELECT COUNT(1) AS c FROM users WHERE role = 'admin'",
        )
        row = cur.fetchone()
        return int(row["c"]) if row else 0


def get_user_by_phone(phone: str) -> Optional[sqlite3.Row]:
    with _get_conn() as conn:
        cur = conn.execute("SELECT * FROM users WHERE phone = ?", (phone,))
        return cur.fetchone()


def get_users_by_name(name: str) -> list[sqlite3.Row]:
    normalized = str(name or "").strip()
    if not normalized:
        return []
    with _get_conn() as conn:
        try:
            cur = conn.execute(
                """
SELECT u.*
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE LOWER(u.name) = LOWER(?)
   OR LOWER(COALESCE(ep.english_name, '')) = LOWER(?)
   OR LOWER(COALESCE(ep.nickname, '')) = LOWER(?)
   OR LOWER(COALESCE(ep.aliases, '')) LIKE LOWER(?)
""",
                (normalized, normalized, normalized, f"%{normalized}%"),
            )
        except sqlite3.OperationalError:
            cur = conn.execute(
                """
SELECT u.*
FROM users u
WHERE LOWER(u.name) = LOWER(?)
""",
                (normalized,),
            )
        return cur.fetchall()


def get_user_name_by_id_or_profile_id(val: str) -> str:
    """根据 users.id 或 users.profile_id 查找用户姓名（含尊称逻辑）"""
    if not val:
        return "用户"
    with _get_conn() as conn:
        try:
            cur = conn.execute(
                """
SELECT u.name AS name, ep.department AS department, ep.is_executive AS is_executive
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.id = ? OR u.profile_id = ?
LIMIT 1
""",
                (val, val),
            )
        except sqlite3.OperationalError:
            cur = conn.execute(
                """
SELECT u.name AS name, ep.department AS department, 0 AS is_executive
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.id = ? OR u.profile_id = ?
LIMIT 1
""",
                (val, val),
            )
        row = cur.fetchone()
        if not row:
            return "用户"
        name = str(row["name"] or "").strip()
        department = str(row["department"] or "").strip()
        is_exec = int(row["is_executive"] or 0)
        if name and (department == "总裁办" or is_exec == 1):
            return f"{name[0]}总"
        return name or "用户"


def get_user_context_by_user_id(user_id: str) -> Optional[dict[str, str]]:
    if not user_id:
        return None
    with _get_conn() as conn:
        try:
            row = conn.execute(
                """
SELECT u.id AS user_id, u.name AS user_name, u.profile_id AS profile_id,
       ep.department AS department, ep.position AS position,
       ep.english_name AS english_name, ep.nickname AS nickname,
       ep.aliases AS aliases, ep.title AS title, ep.is_executive AS is_executive
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.id = ?
LIMIT 1
""",
                (user_id,),
            ).fetchone()
        except sqlite3.OperationalError:
            row = conn.execute(
                """
SELECT u.id AS user_id, u.name AS user_name, u.profile_id AS profile_id,
       ep.department AS department, ep.position AS position,
       '' AS english_name, '' AS nickname, '' AS aliases, '' AS title, 0 AS is_executive
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.id = ?
LIMIT 1
""",
                (user_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "user_id": str(row["user_id"]),
            "user_name": str(row["user_name"] or ""),
            "profile_id": str(row["profile_id"] or ""),
            "department": str(row["department"] or ""),
            "position": str(row["position"] or ""),
            "english_name": str(row["english_name"] or ""),
            "nickname": str(row["nickname"] or ""),
            "aliases": str(row["aliases"] or ""),
            "title": str(row["title"] or ""),
            "is_executive": str(row["is_executive"] or ""),
        }


def get_employee_count() -> int:
    """统计当前公司员工总数（status='active' 的用户）"""
    with _get_conn() as conn:
        cur = conn.execute(
            "SELECT COUNT(1) AS c FROM users WHERE status = 'active'",
        )
        row = cur.fetchone()
        return int(row["c"]) if row else 0


def _split_aliases(raw: str) -> list[str]:
    if not raw:
        return []
    parts = re.split(r"[,，;/；|\\n\\t]+", str(raw))
    return [p.strip() for p in parts if p.strip()]


def get_active_user_names() -> list[str]:
    with _get_conn() as conn:
        try:
            cur = conn.execute(
                """
SELECT u.name AS name, ep.english_name AS english_name,
       ep.nickname AS nickname, ep.aliases AS aliases
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.status = 'active'
""",
            )
        except sqlite3.OperationalError:
            cur = conn.execute(
                """
SELECT u.name AS name, '' AS english_name, '' AS nickname, '' AS aliases
FROM users u
WHERE u.status = 'active'
""",
            )
        names: list[str] = []
        for r in cur.fetchall():
            base = str(r["name"] or "").strip()
            if base:
                names.append(base)
            for alt in [
                str(r["english_name"] or "").strip(),
                str(r["nickname"] or "").strip(),
            ]:
                if alt:
                    names.append(alt)
            names.extend(_split_aliases(str(r["aliases"] or "")))
        return names


def get_active_users() -> list[sqlite3.Row]:
    with _get_conn() as conn:
        cur = conn.execute(
            "SELECT id, name FROM users WHERE status = 'active'",
        )
        return cur.fetchall()


def get_active_user_directory() -> list[dict[str, str]]:
    """Return active users with department and position for intent parsing."""
    with _get_conn() as conn:
        try:
            cur = conn.execute(
                """
SELECT u.id AS user_id, u.name AS name,
       ep.department AS department, ep.position AS position
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.status = 'active'
""",
            )
        except sqlite3.OperationalError:
            cur = conn.execute(
                """
SELECT u.id AS user_id, u.name AS name,
       '' AS department, '' AS position
FROM users u
WHERE u.status = 'active'
""",
            )
        rows = []
        for row in cur.fetchall():
            rows.append(
                {
                    "user_id": str(row["user_id"] or ""),
                    "name": str(row["name"] or ""),
                    "department": str(row["department"] or ""),
                    "position": str(row["position"] or ""),
                },
            )
        return rows


def parse_notify_command(user_message: str) -> Optional[tuple[str, str]]:
    if not user_message:
        return None
    text = user_message.strip()
    prefix_match = re.match(r"^(?:请|麻烦|辛苦)?\s*(通知|告诉|转告|告知|让)\s*", text)
    if not prefix_match:
        return None
    rest = text[prefix_match.end() :].lstrip()
    rest = re.sub(r"^(一下|下|帮我|帮忙|麻烦|辛苦)\s*", "", rest)
    if rest.startswith("@"):
        rest = rest[1:].lstrip()
    if not rest:
        return None

    rest_lower = rest.lower()
    for name in sorted(get_active_user_names(), key=len, reverse=True):
        if rest_lower.startswith(name.lower()):
            content = rest[len(name) :].strip()
            if content:
                return name, content

    fallback = re.match(r"^([^\s，。,；;:：]+)\s+(.+)$", rest, re.DOTALL)
    if fallback:
        target_user = fallback.group(1).strip()
        content = fallback.group(2).strip()
        if target_user and content:
            return target_user, content
    return None
