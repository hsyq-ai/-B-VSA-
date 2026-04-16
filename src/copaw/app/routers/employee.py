# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ...constant import WORKING_DIR
from .auth import get_current_user

router = APIRouter(prefix="/employee", tags=["employee"])

_LOCK = threading.Lock()
_INBOX_DIR = WORKING_DIR / "inbox_status"
_SESSIONS_DIR = WORKING_DIR / "session_seen"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


class InboxStatusUpdate(BaseModel):
    session_id: str
    status: str


class SessionSeenUpdate(BaseModel):
    session_id: str
    last_seen: Optional[str] = None


@router.get("/inbox/status")
def get_inbox_status(
    request: Request,
    session_ids: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    path = _INBOX_DIR / f"{user_id}.json"
    with _LOCK:
        data = _load_json(path)
    session_id_list = [
        item.strip()
        for item in str(session_ids or "").split(",")
        if item and item.strip()
    ]
    if session_id_list:
        unread_status_count = 0
        for sid in session_id_list:
            record = data.get(sid, {})
            status = str(record.get("status") or "待办")
            if status != "已完成":
                unread_status_count += 1
    else:
        unread_status_count = sum(
            1
            for record in data.values()
            if isinstance(record, dict)
            and str(record.get("status") or "待办") != "已完成"
        )
    pending_queue_count = 0
    try:
        store = getattr(request.app.state, "message_store", None)
        if store is not None:
            pending_queue_count = int(store.pending_count(user_id))
    except Exception:
        pending_queue_count = 0
    return {
        "status_map": data,
        "status_unread_count": unread_status_count,
        "pending_queue_count": pending_queue_count,
        "unread_count": unread_status_count + pending_queue_count,
    }


@router.post("/inbox/status")
def update_inbox_status(
    payload: InboxStatusUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    session_id = str(payload.session_id or "")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    status = str(payload.status or "").strip() or "待办"
    actor = str(current_user.get("name") or "") or "我"
    now = _now_iso()

    path = _INBOX_DIR / f"{user_id}.json"
    with _LOCK:
        data = _load_json(path)
        record = data.get(session_id, {}) if isinstance(data.get(session_id), dict) else {}
        history = record.get("history") if isinstance(record.get("history"), list) else []
        history.insert(0, {"status": status, "ts": now, "by": actor})
        data[session_id] = {
            "status": status,
            "updated_at": now,
            "updated_by": actor,
            "history": history[:100],
        }
        _save_json(path, data)
    status_unread_count = sum(
        1
        for record in data.values()
        if isinstance(record, dict)
        and str(record.get("status") or "待办") != "已完成"
    )
    pending_queue_count = 0
    try:
        store = getattr(request.app.state, "message_store", None)
        if store is not None:
            pending_queue_count = int(store.pending_count(user_id))
    except Exception:
        pending_queue_count = 0
    return {
        "session_id": session_id,
        **data[session_id],
        "status_unread_count": status_unread_count,
        "pending_queue_count": pending_queue_count,
        "unread_count": status_unread_count + pending_queue_count,
    }


@router.get("/inbox/history")
def get_inbox_history(
    session_id: str = Query(default=""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    path = _INBOX_DIR / f"{user_id}.json"
    with _LOCK:
        data = _load_json(path)
    record = data.get(session_id, {}) if isinstance(data.get(session_id), dict) else {}
    return {"session_id": session_id, "history": record.get("history", [])}


@router.get("/sessions/seen")
def get_session_seen(current_user: dict = Depends(get_current_user)) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    path = _SESSIONS_DIR / f"{user_id}.json"
    with _LOCK:
        data = _load_json(path)
    return {"seen_map": data}


@router.post("/sessions/seen")
def update_session_seen(
    payload: SessionSeenUpdate,
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    session_id = str(payload.session_id or "")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")
    last_seen = str(payload.last_seen or "") or _now_iso()
    path = _SESSIONS_DIR / f"{user_id}.json"
    with _LOCK:
        data = _load_json(path)
        data[session_id] = last_seen
        _save_json(path, data)
    return {"session_id": session_id, "last_seen": last_seen}


@router.get("/search")
def global_search(
    q: str = Query(default="", max_length=100),
    current_user: dict = Depends(get_current_user),
) -> dict:
    user_id = str(current_user.get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")
    
    query = q.strip().lower()
    
    # 模拟系统内全量功能、指令与专家的可检索列表
    all_features = [
        {"id": "sys_1", "title": "红智秘书", "type": "功能", "path": "/app/secretary", "icon": "MessagesSquare"},
        {"id": "sys_2", "title": "智能工作台", "type": "功能", "path": "/app/research-experiment", "icon": "Zap"},
        {"id": "sys_3", "title": "会话记忆", "type": "记忆", "path": "/app/sessions", "icon": "Brain"},
        {"id": "sys_4", "title": "系统设置", "type": "设置", "path": "/app/settings", "icon": "Settings"},
        {"id": "sys_5", "title": "个人档案", "type": "设置", "path": "/app/profile", "icon": "User"},
        {"id": "sys_6", "title": "消息中心", "type": "功能", "path": "/app/inbox", "icon": "Bell"},
        
        {"id": "party_1", "title": "党建指令中心", "type": "场景", "path": "/app/party/directive-center", "icon": "FileText"},
        {"id": "party_2", "title": "考核备案", "type": "场景", "path": "/app/party/archive", "icon": "ClipboardCheck"},
        {"id": "party_3", "title": "党务代办", "type": "场景", "path": "/app/party/party-affairs", "icon": "ClipboardList"},
        {"id": "party_4", "title": "党员测评", "type": "场景", "path": "/app/party/member-evaluation", "icon": "Target"},
        {"id": "party_5", "title": "支部评比", "type": "场景", "path": "/app/party/branch-ranking", "icon": "LayoutDashboard"},
        {"id": "party_6", "title": "活动协同", "type": "场景", "path": "/app/party/activity-collab", "icon": "UsersRound"},
        {"id": "party_7", "title": "组织关怀", "type": "场景", "path": "/app/party/organization-care", "icon": "HeartHandshake"},
        {"id": "party_8", "title": "思政辅导", "type": "场景", "path": "/app/party/learning-coach", "icon": "Brain"},
        
        {"id": "expert_1", "title": "课题秘书 (数字专家)", "type": "专家", "path": "/app/expert/digital-fallback-digital-research-secretary", "icon": "Bot"},
        {"id": "expert_2", "title": "文献情报员 (数字专家)", "type": "专家", "path": "/app/expert/digital-fallback-digital-literature-intel", "icon": "Bot"},
        {"id": "expert_3", "title": "实验管家 (数字专家)", "type": "专家", "path": "/app/expert/digital-fallback-digital-experiment-steward", "icon": "Bot"},
        {"id": "expert_4", "title": "数据专员 (数字专家)", "type": "专家", "path": "/app/expert/digital-fallback-digital-data-specialist", "icon": "Bot"},
    ]
    
    if not query:
        return {"items": all_features[:8]}
        
    results = [
        item for item in all_features 
        if query in item["title"].lower() or query in item["type"].lower()
    ]
    
    return {"items": results}
