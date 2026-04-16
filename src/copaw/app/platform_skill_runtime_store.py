# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from ..constant import WORKING_DIR

_STORE_PATH = WORKING_DIR / "platform_skill_runtime.json"
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
    items = data.get("items")
    if not isinstance(items, list):
        data["items"] = []
    data.setdefault("version", 1)
    return data


def _save_store(data: Dict[str, Any]) -> None:
    _STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
    _STORE_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _normalize_item(item: Dict[str, Any]) -> Dict[str, Any]:
    now = time.time()
    return {
        "id": str(item.get("id") or str(uuid.uuid4())),
        "name": str(item.get("name") or "").strip(),
        "description": str(item.get("description") or "").strip(),
        "content": str(item.get("content") or "").strip(),
        "department": str(item.get("department") or "").strip(),
        "source_chat_id": str(item.get("source_chat_id") or "").strip(),
        "source_session_id": str(item.get("source_session_id") or "").strip(),
        "source_user_id": str(item.get("source_user_id") or "").strip(),
        "published_trigger_key": str(item.get("published_trigger_key") or "").strip(),
        "status": str(item.get("status") or "candidate").strip(),
        "created_at": float(item.get("created_at") or now),
        "updated_at": float(item.get("updated_at") or now),
    }


async def list_runtime_skills(
    *,
    department: str = "",
    status: str = "",
    limit: int = 200,
) -> List[Dict[str, Any]]:
    async with _LOCK:
        data = _ensure_store()
        items = [
            _normalize_item(x) for x in data.get("items", []) if isinstance(x, dict)
        ]
    filtered = items
    dept = str(department or "").strip()
    if dept:
        filtered = [x for x in filtered if x.get("department") == dept]
    st = str(status or "").strip()
    if st:
        filtered = [x for x in filtered if x.get("status") == st]
    filtered.sort(key=lambda x: float(x.get("updated_at") or 0), reverse=True)
    return filtered[: max(1, min(limit, 1000))]


async def get_runtime_skill(skill_id: str) -> Optional[Dict[str, Any]]:
    async with _LOCK:
        data = _ensure_store()
        for raw in data.get("items", []):
            if not isinstance(raw, dict):
                continue
            item = _normalize_item(raw)
            if item["id"] == skill_id:
                return item
    return None


async def upsert_runtime_skill(item: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_item(item)
    normalized["updated_at"] = time.time()
    async with _LOCK:
        data = _ensure_store()
        rows = [x for x in data.get("items", []) if isinstance(x, dict)]
        replaced = False
        for idx, raw in enumerate(rows):
            cur = _normalize_item(raw)
            if cur["id"] == normalized["id"]:
                rows[idx] = normalized
                replaced = True
                break
        if not replaced:
            rows.append(normalized)
        data["items"] = rows
        _save_store(data)
    return normalized


async def update_runtime_skill(skill_id: str, updates: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    sid = str(skill_id or "").strip()
    if not sid:
        return None
    async with _LOCK:
        data = _ensure_store()
        rows = [x for x in data.get("items", []) if isinstance(x, dict)]
        for idx, raw in enumerate(rows):
            cur = _normalize_item(raw)
            if cur["id"] != sid:
                continue
            merged = dict(cur)
            for key, value in updates.items():
                if value is None:
                    continue
                merged[key] = value
            merged["updated_at"] = time.time()
            rows[idx] = _normalize_item(merged)
            data["items"] = rows
            _save_store(data)
            return rows[idx]
    return None
