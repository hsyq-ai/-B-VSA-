# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
import time
import uuid
from typing import Any, Dict, List

from ..constant import WORKING_DIR

_STORE_PATH = WORKING_DIR / "platform_skill_audits.json"
_LOCK = asyncio.Lock()


def _ensure_store() -> Dict[str, Any]:
    if not _STORE_PATH.exists():
        return {"version": 1, "items": []}
    try:
        data = json.loads(_STORE_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {"version": 1, "items": []}
    if not isinstance(data, dict):
        return {"version": 1, "items": []}
    if not isinstance(data.get("items"), list):
        data["items"] = []
    data.setdefault("version", 1)
    return data


def _save_store(data: Dict[str, Any]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _STORE_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _normalize(entry: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(entry.get("id") or str(uuid.uuid4())),
        "ts": float(entry.get("ts") or time.time()),
        "action": str(entry.get("action") or "").strip(),
        "skill_id": str(entry.get("skill_id") or "").strip(),
        "skill_name": str(entry.get("skill_name") or "").strip(),
        "status_from": str(entry.get("status_from") or "").strip(),
        "status_to": str(entry.get("status_to") or "").strip(),
        "trigger_key": str(entry.get("trigger_key") or "").strip(),
        "source_chat_id": str(entry.get("source_chat_id") or "").strip(),
        "actor_user_id": str(entry.get("actor_user_id") or "").strip(),
        "actor_name": str(entry.get("actor_name") or "").strip(),
        "note": str(entry.get("note") or "").strip(),
    }


async def append_platform_skill_audit(entry: Dict[str, Any]) -> Dict[str, Any]:
    item = _normalize(entry)
    async with _LOCK:
        data = _ensure_store()
        rows = [x for x in data.get("items", []) if isinstance(x, dict)]
        rows.append(item)
        rows = rows[-2000:]
        data["items"] = rows
        _save_store(data)
    return item


async def list_platform_skill_audits(*, skill_id: str = "", limit: int = 200) -> List[Dict[str, Any]]:
    sid = str(skill_id or "").strip()
    async with _LOCK:
        data = _ensure_store()
        rows = [_normalize(x) for x in data.get("items", []) if isinstance(x, dict)]
    if sid:
        rows = [x for x in rows if x.get("skill_id") == sid]
    rows.sort(key=lambda x: float(x.get("ts") or 0), reverse=True)
    return rows[: max(1, min(limit, 1000))]
