# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import time
import os
import json
import mimetypes
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ...constant import WORKING_DIR
from ..auth_db import get_user_name_by_id_or_profile_id
from ..event_logger import log_event
from .auth import _decode_token, get_current_user

router = APIRouter(prefix="/chat-files", tags=["chat-files"])
_FILES_ROOT = Path("/home/featurize/work/aifscie/files")
_UPLOAD_DEBUG_LOG = WORKING_DIR / "upload_debug.log"
_ALLOWED_LOCAL_ROOTS = [
    WORKING_DIR.resolve(),
    Path("/home/featurize/work/aifscie/CoPaw/downloads").resolve(),
]


def _safe_filename(name: str) -> str:
    base = os.path.basename((name or "").strip()) or "file.bin"
    cleaned = "".join(ch for ch in base if ch not in "\\/:*?\"<>|\n\r\t")
    return cleaned[:200] or "file.bin"


def _safe_dirname(name: str) -> str:
    base = (name or "").strip() or "user"
    cleaned = "".join(ch for ch in base if ch not in "\\/:*?\"<>|\n\r\t")
    cleaned = cleaned.replace(" ", "_")
    return cleaned[:100] or "user"


def _append_manifest(
    *,
    user_dir: Path,
    record: dict,
) -> None:
    user_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = user_dir / "manifest.json"
    try:
        if manifest_path.exists():
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                data = []
        else:
            data = []
    except Exception:
        data = []
    data.append(record)
    try:
        manifest_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception:
        pass


def _append_upload_debug(record: dict) -> None:
    try:
        _UPLOAD_DEBUG_LOG.parent.mkdir(parents=True, exist_ok=True)
        with _UPLOAD_DEBUG_LOG.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except Exception:
        pass


def _guess_mime(upload: UploadFile) -> str:
    if upload.content_type and upload.content_type.strip():
        return upload.content_type.strip()
    return "application/octet-stream"


def _guess_mime_from_path(path: Path) -> str:
    mime, _ = mimetypes.guess_type(str(path))
    return mime or "application/octet-stream"


def _resolve_local_path(raw_path: str) -> Path:
    target_path = Path(raw_path).expanduser()
    if not target_path.is_absolute():
        target_path = (WORKING_DIR / target_path).resolve()
    else:
        target_path = target_path.resolve()

    if target_path.exists():
        if not any(str(target_path).startswith(str(root)) for root in _ALLOWED_LOCAL_ROOTS):
            raise HTTPException(status_code=403, detail="Forbidden")
        return target_path

    # Fallback: if only a filename was provided, search within WORKING_DIR
    raw_str = str(raw_path).strip()
    if raw_str and "/" not in raw_str and "\\" not in raw_str:
        candidates = list(WORKING_DIR.rglob(raw_str))
        candidates = [c for c in candidates if c.is_file()]
        if candidates:
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            target_path = candidates[0].resolve()
            if not any(str(target_path).startswith(str(root)) for root in _ALLOWED_LOCAL_ROOTS):
                raise HTTPException(status_code=403, detail="Forbidden")
            return target_path

    if not any(str(target_path).startswith(str(root)) for root in _ALLOWED_LOCAL_ROOTS):
        raise HTTPException(status_code=403, detail="Forbidden")
    return target_path


def _get_store():
    from .._app import app

    store = getattr(app.state, "chat_file_store", None)
    if store is None:
        raise HTTPException(status_code=503, detail="chat file store not initialized")
    return store


def _load_manifest(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _iter_manifests(user_dir: Path, scope: str) -> list[Path]:
    manifests: list[Path] = []
    if scope == "user":
        m = user_dir / "manifest.json"
        if m.exists():
            manifests.append(m)
        return manifests
    if user_dir.exists():
        m = user_dir / "manifest.json"
        if m.exists():
            manifests.append(m)
    if _FILES_ROOT.exists():
        for entry in _FILES_ROOT.iterdir():
            if not entry.is_dir():
                continue
            m = entry / "manifest.json"
            if m.exists() and m not in manifests:
                manifests.append(m)
    return manifests


def _match_query(name: str, q: str) -> bool:
    if not q:
        return True
    return q in name.lower()


def _validate_download_access(
    *,
    owner_user_id: str,
    authorization: Optional[str],
    access_token: Optional[str],
) -> None:
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token and access_token:
        token = access_token.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    current = _decode_token(token)
    if current.get("status") != "active":
        raise HTTPException(status_code=401, detail="Inactive user")
    current_user_id = str(current.get("user_id") or "")
    if current_user_id != str(owner_user_id):
        raise HTTPException(status_code=403, detail="Forbidden")


def _validate_download_token(
    *,
    authorization: Optional[str],
    access_token: Optional[str],
) -> dict:
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
    if not token and access_token:
        token = access_token.strip()
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    current = _decode_token(token)
    if current.get("status") != "active":
        raise HTTPException(status_code=401, detail="Inactive user")
    return current


class RegisterLocalFilePayload(BaseModel):
    session_id: str = Field(..., min_length=1)
    path: str = Field(..., min_length=1)
    original_name: Optional[str] = None


@router.post("/upload")
async def upload_chat_file(
    session_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    session_id = str(session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="empty file")
    if len(raw) > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file too large")

    original_name = _safe_filename(file.filename or "file.bin")
    ext = Path(original_name).suffix
    digest = hashlib.sha256(raw).hexdigest()[:16]
    upload_id = f"{int(time.time() * 1000)}-{digest}"
    storage_name = f"{upload_id}{ext}"
    uploader_name = get_user_name_by_id_or_profile_id(user_id)
    user_dirname = _safe_dirname(uploader_name or user_id)
    storage_dir = _FILES_ROOT / user_dirname
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / storage_name
    storage_path.write_bytes(raw)

    _append_upload_debug(
        {
            "ts": int(time.time() * 1000),
            "user_id": user_id,
            "uploader": uploader_name,
            "session_id": session_id,
            "original_name": original_name,
            "size": len(raw),
            "mime_type": _guess_mime(file),
            "upload_id": upload_id,
            "storage_path": str(storage_path),
        }
    )

    _append_manifest(
        user_dir=storage_dir,
        record={
            "upload_id": upload_id,
            "original_name": original_name,
            "uploader": uploader_name,
            "user_id": user_id,
            "session_id": session_id,
            "storage_path": str(storage_path),
            "timestamp_ms": int(time.time() * 1000),
        },
    )

    store = _get_store()
    file_id = store.create_file(
        user_id=user_id,
        session_id=session_id,
        original_name=original_name,
        mime_type=_guess_mime(file),
        file_size=len(raw),
        storage_path=str(storage_path),
    )

    log_event(
        event_type="file_upload",
        actor_user_id=str(user_id),
        session_id=session_id,
        payload={
            "file_id": str(file_id),
            "upload_id": upload_id,
            "original_name": original_name,
            "mime_type": _guess_mime(file),
            "size": len(raw),
            "storage_path": str(storage_path),
        },
        summary=f"上传文件：{original_name}",
        intent_tag="file.upload",
        source="console:upload",
    )

    return {
        "file_id": file_id,
        "name": original_name,
        "size": len(raw),
        "mime_type": _guess_mime(file),
        "session_id": session_id,
        "uploader": uploader_name,
        "upload_id": upload_id,
        "url": f"/api/chat-files/{file_id}/download",
        "message_hint": f"[file:{upload_id}] {original_name}",
    }


@router.post("/register-local")
def register_local_file(
    payload: RegisterLocalFilePayload,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    session_id = str(payload.session_id or "").strip()
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    raw_path = str(payload.path or "").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="path is required")
    target_path = _resolve_local_path(raw_path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="file not found")

    file_size = int(target_path.stat().st_size)
    if file_size <= 0:
        raise HTTPException(status_code=400, detail="empty file")
    if file_size > 50 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="file too large")

    original_name = _safe_filename(payload.original_name or target_path.name or "file.bin")
    ext = Path(original_name).suffix or target_path.suffix

    hasher = hashlib.sha256()
    with target_path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()[:16]
    upload_id = f"{int(time.time() * 1000)}-{digest}"
    storage_name = f"{upload_id}{ext}"

    uploader_name = get_user_name_by_id_or_profile_id(user_id)
    user_dirname = _safe_dirname(uploader_name or user_id)
    storage_dir = _FILES_ROOT / user_dirname
    storage_dir.mkdir(parents=True, exist_ok=True)
    storage_path = storage_dir / storage_name
    shutil.copy2(target_path, storage_path)

    _append_manifest(
        user_dir=storage_dir,
        record={
            "upload_id": upload_id,
            "original_name": original_name,
            "uploader": uploader_name,
            "user_id": user_id,
            "session_id": session_id,
            "storage_path": str(storage_path),
            "source_path": str(target_path),
            "timestamp_ms": int(time.time() * 1000),
        },
    )

    store = _get_store()
    file_id = store.create_file(
        user_id=user_id,
        session_id=session_id,
        original_name=original_name,
        mime_type=_guess_mime_from_path(target_path),
        file_size=file_size,
        storage_path=str(storage_path),
    )

    log_event(
        event_type="file_register_local",
        actor_user_id=str(user_id),
        session_id=session_id,
        payload={
            "file_id": str(file_id),
            "upload_id": upload_id,
            "original_name": original_name,
            "file_size": file_size,
            "source_path": str(target_path),
            "storage_path": str(storage_path),
        },
        summary=f"入库文件：{original_name}",
        intent_tag="file.register_local",
        source="console:local",
    )

    return {
        "file_id": file_id,
        "name": original_name,
        "size": file_size,
        "mime_type": _guess_mime_from_path(target_path),
        "session_id": session_id,
        "upload_id": upload_id,
        "url": f"/api/chat-files/{file_id}/download",
    }


@router.get("/session/{session_id}")
def list_session_files(
    session_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    store = _get_store()
    return {"files": store.list_files_by_session(user_id=user_id, session_id=str(session_id))}


@router.get("/search")
def search_chat_files(
    q: str = Query(default=""),
    scope: str = Query(default="user"),
    limit: int = Query(default=20, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    uploader_name = get_user_name_by_id_or_profile_id(user_id)
    user_dirname = _safe_dirname(uploader_name or user_id)
    user_dir = _FILES_ROOT / user_dirname
    query = (q or "").strip().lower()
    manifests = _iter_manifests(user_dir, scope)
    results: list[dict] = []
    store = _get_store()
    for manifest in manifests:
        for rec in reversed(_load_manifest(manifest)):
            name = str(rec.get("original_name") or "").lower()
            if not _match_query(name, query):
                continue
            file_id = str(rec.get("upload_id") or rec.get("file_id") or "")
            meta = store.get_file(file_id) if file_id else None
            info = meta or rec
            results.append(
                {
                    "file_id": str(info.get("file_id") or file_id),
                    "upload_id": str(info.get("upload_id") or file_id),
                    "original_name": str(info.get("original_name") or rec.get("original_name") or ""),
                    "mime_type": str(info.get("mime_type") or rec.get("mime_type") or ""),
                    "file_size": int(info.get("file_size") or rec.get("file_size") or 0),
                    "session_id": str(info.get("session_id") or rec.get("session_id") or ""),
                    "storage_path": str(info.get("storage_path") or rec.get("storage_path") or ""),
                    "uploader": str(info.get("uploader") or rec.get("uploader") or uploader_name or ""),
                    "timestamp_ms": int(info.get("timestamp_ms") or rec.get("timestamp_ms") or 0),
                    "download_url": f"/api/chat-files/{file_id}/download",
                }
            )
            if len(results) >= limit:
                return {"files": results}
    return {"files": results}


@router.get("/local-download")
def download_local_file(
    path: str = Query(...),
    access_token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
) -> FileResponse:
    _validate_download_token(
        authorization=authorization,
        access_token=access_token,
    )
    raw_path = str(path or "").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="path is required")
    target_path = _resolve_local_path(raw_path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    return FileResponse(
        str(target_path),
        media_type="application/octet-stream",
        filename=target_path.name,
    )


@router.get("/local-meta")
def get_local_file_meta(
    path: str = Query(...),
    access_token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
) -> dict:
    _validate_download_token(
        authorization=authorization,
        access_token=access_token,
    )
    raw_path = str(path or "").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail="path is required")
    target_path = _resolve_local_path(raw_path)
    if not target_path.exists() or not target_path.is_file():
        raise HTTPException(status_code=404, detail="file not found")
    stat = target_path.stat()
    return {
        "path": raw_path,
        "name": target_path.name,
        "size": int(stat.st_size),
        "modified_at": int(stat.st_mtime),
        "modified_at_ms": int(stat.st_mtime * 1000),
    }


@router.get("/{file_id}/download")
def download_chat_file(
    file_id: str,
    access_token: Optional[str] = Query(default=None),
    authorization: Optional[str] = Header(default=None),
) -> FileResponse:
    store = _get_store()
    meta = store.get_file(file_id)
    if not meta:
        raise HTTPException(status_code=404, detail="file not found")
    _validate_download_access(
        owner_user_id=str(meta.get("user_id") or ""),
        authorization=authorization,
        access_token=access_token,
    )
    p = Path(str(meta.get("storage_path") or "")).resolve()
    if not p.exists() or not p.is_file():
        raise HTTPException(status_code=404, detail="file missing")
    return FileResponse(
        str(p),
        media_type=str(meta.get("mime_type") or "application/octet-stream"),
        filename=str(meta.get("original_name") or p.name),
    )
