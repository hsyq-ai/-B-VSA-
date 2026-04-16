# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ObservabilityStore:
    def __init__(self, db_path: Path) -> None:
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._get_conn() as conn:
            conn.executescript(
                """
CREATE TABLE IF NOT EXISTS trace_event (
    event_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    room_id TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL DEFAULT '',
    event_type TEXT NOT NULL,
    actor_user_id TEXT NOT NULL DEFAULT '',
    actor_agent_id TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trace_event_trace_created
ON trace_event(trace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trace_event_owner_created
ON trace_event(owner_user_id, created_at DESC);
"""
            )

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _json_text(value: Any) -> str:
        try:
            return json.dumps(value if value is not None else {}, ensure_ascii=False)
        except Exception:
            return "{}"

    @staticmethod
    def _parse_json(raw: Any) -> dict[str, Any]:
        if isinstance(raw, dict):
            return raw
        if not raw:
            return {}
        try:
            parsed = json.loads(str(raw))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            return {}
        return {}

    def record_event(
        self,
        *,
        trace_id: str,
        room_id: str = "",
        owner_user_id: str = "",
        event_type: str,
        actor_user_id: str = "",
        actor_agent_id: str = "",
        status: str = "",
        summary: str = "",
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        final_trace_id = str(trace_id or "").strip()
        if not final_trace_id:
            final_trace_id = str(uuid.uuid4())
        item = {
            "event_id": str(uuid.uuid4()),
            "trace_id": final_trace_id,
            "room_id": str(room_id or ""),
            "owner_user_id": str(owner_user_id or ""),
            "event_type": str(event_type or "trace.event"),
            "actor_user_id": str(actor_user_id or ""),
            "actor_agent_id": str(actor_agent_id or ""),
            "status": str(status or ""),
            "summary": str(summary or ""),
            "payload": payload or {},
            "created_at": self._now_iso(),
        }
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO trace_event (
    event_id, trace_id, room_id, owner_user_id, event_type,
    actor_user_id, actor_agent_id, status, summary, payload, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        item["event_id"],
                        item["trace_id"],
                        item["room_id"],
                        item["owner_user_id"],
                        item["event_type"],
                        item["actor_user_id"],
                        item["actor_agent_id"],
                        item["status"],
                        item["summary"],
                        self._json_text(item["payload"]),
                        item["created_at"],
                    ),
                )
        return item

    def list_trace_events(
        self,
        *,
        trace_id: str,
        owner_user_id: str = "",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        params: list[Any] = [str(trace_id or "")]
        owner_clause = ""
        if owner_user_id:
            owner_clause = " AND owner_user_id = ?"
            params.append(str(owner_user_id))
        params.append(safe_limit)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT * FROM trace_event
WHERE trace_id = ?{owner_clause}
ORDER BY created_at ASC
LIMIT ?
""",
                tuple(params),
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["payload"] = self._parse_json(item.get("payload"))
            items.append(item)
        return items

    def list_traces(
        self,
        *,
        owner_user_id: str = "",
        room_id: str = "",
        status: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        fetch_limit = max(safe_limit * 200, 2000)
        clauses: list[str] = []
        params: list[Any] = []
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if room_id:
            clauses.append("room_id = ?")
            params.append(str(room_id))
        if status:
            clauses.append("status = ?")
            params.append(str(status))
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(fetch_limit)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT * FROM trace_event
{where_sql}
ORDER BY created_at DESC
LIMIT ?
""",
                tuple(params),
            ).fetchall()
        traces: dict[str, dict[str, Any]] = {}
        ordered_ids: list[str] = []
        for row in rows:
            item = dict(row)
            trace_key = str(item.get("trace_id") or "").strip()
            if not trace_key:
                continue
            if trace_key not in traces:
                if len(ordered_ids) >= safe_limit:
                    continue
                traces[trace_key] = {
                    "trace_id": trace_key,
                    "room_id": str(item.get("room_id") or ""),
                    "owner_user_id": str(item.get("owner_user_id") or ""),
                    "latest_event_type": str(item.get("event_type") or ""),
                    "latest_status": str(item.get("status") or ""),
                    "latest_summary": str(item.get("summary") or ""),
                    "last_event_at": str(item.get("created_at") or ""),
                    "started_at": str(item.get("created_at") or ""),
                    "event_count": 0,
                }
                ordered_ids.append(trace_key)
            traces[trace_key]["event_count"] += 1
            traces[trace_key]["started_at"] = str(item.get("created_at") or traces[trace_key]["started_at"])
            if not traces[trace_key].get("room_id"):
                traces[trace_key]["room_id"] = str(item.get("room_id") or "")
        return [traces[trace_id] for trace_id in ordered_ids]

    def get_trace_summary(self, *, trace_id: str, owner_user_id: str = "") -> dict[str, Any]:
        items = self.list_trace_events(trace_id=trace_id, owner_user_id=owner_user_id, limit=500)
        status_counts: dict[str, int] = {}
        room_id = ""
        for item in items:
            status = str(item.get("status") or "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            room_id = room_id or str(item.get("room_id") or "")
        return {
            "trace_id": str(trace_id or ""),
            "room_id": room_id,
            "event_count": len(items),
            "status_counts": status_counts,
            "items": items,
        }
