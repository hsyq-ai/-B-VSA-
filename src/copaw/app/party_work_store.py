# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional
from uuid import uuid4

from ..constant import WORKING_DIR


DB_PATH = WORKING_DIR / "party_work.db"


@dataclass(frozen=True)
class PartyTable:
    key: str
    table_name: str


PARTY_TABLES: Dict[str, PartyTable] = {
    "affairs": PartyTable(key="affairs", table_name="party_affairs"),
    "activity-collab": PartyTable(
        key="activity-collab",
        table_name="party_activity_collab",
    ),
    "member-evaluation": PartyTable(
        key="member-evaluation",
        table_name="party_member_evaluation",
    ),
    "branch-ranking": PartyTable(key="branch-ranking", table_name="party_branch_ranking"),
    "directive-center": PartyTable(
        key="directive-center",
        table_name="party_directive_center",
    ),
    "organization-care": PartyTable(
        key="organization-care",
        table_name="party_organization_care",
    ),
    "learning-coach": PartyTable(key="learning-coach", table_name="party_learning_coach"),
}


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_party_work_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with _get_conn() as conn:
        for cfg in PARTY_TABLES.values():
            conn.execute(
                f"""
CREATE TABLE IF NOT EXISTS {cfg.table_name} (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    department TEXT,
    created_by_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
)
"""
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{cfg.table_name}_updated ON {cfg.table_name}(updated_at DESC)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{cfg.table_name}_dept ON {cfg.table_name}(department)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{cfg.table_name}_creator ON {cfg.table_name}(created_by_user_id)"
            )


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _is_admin(current: Dict[str, Any]) -> bool:
    return str(current.get("role") or "").strip() == "admin"


def _current_user_id(current: Dict[str, Any]) -> str:
    return str(current.get("user_id") or "").strip()


def _current_department(current: Dict[str, Any]) -> str:
    return str(current.get("department") or "").strip()


def _table_name(module_key: str) -> str:
    cfg = PARTY_TABLES.get(module_key)
    if cfg is None:
        raise ValueError(f"unsupported module: {module_key}")
    return cfg.table_name


def _pick_department(module_key: str, payload: Dict[str, Any], current: Dict[str, Any]) -> str:
    if module_key == "organization-care":
        from_payload = str(payload.get("department") or "").strip()
        if from_payload:
            return from_payload
    return _current_department(current)


def _load_payload(row: sqlite3.Row) -> Dict[str, Any]:
    parsed = json.loads(str(row["payload"] or "{}"))
    if not isinstance(parsed, dict):
        parsed = {}
    parsed["id"] = str(row["id"])
    parsed["created_at"] = str(row["created_at"])
    parsed["updated_at"] = str(row["updated_at"])
    return parsed


def _accessible(row: sqlite3.Row, current: Dict[str, Any]) -> bool:
    if _is_admin(current):
        return True
    current_uid = _current_user_id(current)
    row_uid = str(row["created_by_user_id"] or "").strip()
    if current_uid and row_uid and current_uid == row_uid:
        return True
    current_dept = _current_department(current)
    row_dept = str(row["department"] or "").strip()
    return bool(current_dept and row_dept and current_dept == row_dept)


def _filter_items(items: Iterable[Dict[str, Any]], filters: Dict[str, str]) -> List[Dict[str, Any]]:
    cleaned = {
        str(k): str(v).strip()
        for k, v in (filters or {}).items()
        if str(v).strip() and str(k) not in {"page", "page_size"}
    }
    if not cleaned:
        return list(items)

    q = cleaned.pop("q", "")

    def match(item: Dict[str, Any]) -> bool:
        for k, v in cleaned.items():
            if str(item.get(k) or "") != v:
                return False
        if q:
            haystack = json.dumps(item, ensure_ascii=False).lower()
            if q.lower() not in haystack:
                return False
        return True

    return [item for item in items if match(item)]


def list_items(module_key: str, current: Dict[str, Any], filters: Dict[str, str]) -> List[Dict[str, Any]]:
    table = _table_name(module_key)
    with _get_conn() as conn:
        rows = conn.execute(
            f"SELECT * FROM {table} ORDER BY updated_at DESC, created_at DESC"
        ).fetchall()

    items: List[Dict[str, Any]] = []
    for row in rows:
        if not _accessible(row, current):
            continue
        items.append(_load_payload(row))
    return _filter_items(items, filters)


def get_item(module_key: str, item_id: str, current: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    table = _table_name(module_key)
    with _get_conn() as conn:
        row = conn.execute(
            f"SELECT * FROM {table} WHERE id = ? LIMIT 1",
            (item_id,),
        ).fetchone()
    if row is None or not _accessible(row, current):
        return None
    return _load_payload(row)


def create_item(module_key: str, payload: Dict[str, Any], current: Dict[str, Any]) -> Dict[str, Any]:
    now = _now_iso()
    item_id = str(payload.get("id") or f"party-{uuid4().hex}")
    table = _table_name(module_key)
    stored = dict(payload)
    stored.pop("id", None)
    stored.pop("created_at", None)
    stored.pop("updated_at", None)

    department = _pick_department(module_key, payload, current)
    with _get_conn() as conn:
        conn.execute(
            f"""
INSERT INTO {table} (id, payload, department, created_by_user_id, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
""",
            (
                item_id,
                json.dumps(stored, ensure_ascii=False),
                department,
                _current_user_id(current),
                now,
                now,
            ),
        )
    created = dict(stored)
    created["id"] = item_id
    created["created_at"] = now
    created["updated_at"] = now
    return created


def update_item(
    module_key: str,
    item_id: str,
    payload: Dict[str, Any],
    current: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    table = _table_name(module_key)
    with _get_conn() as conn:
        row = conn.execute(
            f"SELECT * FROM {table} WHERE id = ? LIMIT 1",
            (item_id,),
        ).fetchone()
        if row is None or not _accessible(row, current):
            return None

        current_payload = json.loads(str(row["payload"] or "{}"))
        if not isinstance(current_payload, dict):
            current_payload = {}

        merged = dict(current_payload)
        for k, v in payload.items():
            if k in {"id", "created_at", "updated_at"}:
                continue
            merged[k] = v

        next_department = _pick_department(module_key, merged, current)
        now = _now_iso()
        conn.execute(
            f"""
UPDATE {table}
SET payload = ?, department = ?, updated_at = ?
WHERE id = ?
""",
            (
                json.dumps(merged, ensure_ascii=False),
                next_department,
                now,
                item_id,
            ),
        )

    merged["id"] = item_id
    merged["created_at"] = str(row["created_at"])
    merged["updated_at"] = now
    return merged


def export_csv(module_key: str, current: Dict[str, Any], filters: Dict[str, str]) -> str:
    items = list_items(module_key, current, filters)
    if not items:
        return "id\n"

    all_keys: List[str] = []
    key_seen = set()
    for item in items:
        for k in item.keys():
            if k not in key_seen:
                key_seen.add(k)
                all_keys.append(k)

    def _escape(value: Any) -> str:
        raw = str(value if value is not None else "")
        if any(c in raw for c in [",", "\n", '"']):
            return '"' + raw.replace('"', '""') + '"'
        return raw

    lines = [",".join(all_keys)]
    for item in items:
        lines.append(",".join(_escape(item.get(k, "")) for k in all_keys))
    return "\n".join(lines)
