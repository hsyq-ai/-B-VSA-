# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class RoomStore:
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
CREATE TABLE IF NOT EXISTS room (
    room_id TEXT PRIMARY KEY,
    room_key TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    room_type TEXT NOT NULL DEFAULT 'collab',
    status TEXT NOT NULL DEFAULT 'active',
    owner_user_id TEXT NOT NULL DEFAULT '',
    source_agent_id TEXT NOT NULL DEFAULT '',
    target_agent_id TEXT NOT NULL DEFAULT '',
    trace_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_owner_created
ON room(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_trace_created
ON room(trace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_member (
    room_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_type TEXT NOT NULL DEFAULT 'user',
    role TEXT NOT NULL DEFAULT '',
    display_name TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (room_id, member_id, member_type)
);

CREATE INDEX IF NOT EXISTS idx_room_member_room_created
ON room_member(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS room_event (
    event_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    actor_user_id TEXT NOT NULL DEFAULT '',
    actor_agent_id TEXT NOT NULL DEFAULT '',
    trace_id TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_room_event_room_created
ON room_event(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_room_event_trace_created
ON room_event(trace_id, created_at DESC);
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

    def _normalize_room(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        item["metadata"] = self._parse_json(item.get("metadata"))
        return item

    def ensure_room(
        self,
        *,
        room_key: str,
        title: str = "",
        room_type: str = "collab",
        status: str = "active",
        owner_user_id: str = "",
        source_agent_id: str = "",
        target_agent_id: str = "",
        trace_id: str = "",
        session_id: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        normalized_key = str(room_key or "").strip()
        if not normalized_key:
            normalized_key = f"room:{uuid.uuid4()}"
        existing = self.get_room_by_key(normalized_key)
        if existing is not None:
            return existing
        now = self._now_iso()
        room_id = str(uuid.uuid4())
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO room (
    room_id, room_key, title, room_type, status, owner_user_id,
    source_agent_id, target_agent_id, trace_id, session_id, metadata,
    created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        room_id,
                        normalized_key,
                        str(title or normalized_key),
                        str(room_type or "collab"),
                        str(status or "active"),
                        str(owner_user_id or ""),
                        str(source_agent_id or ""),
                        str(target_agent_id or ""),
                        str(trace_id or ""),
                        str(session_id or ""),
                        self._json_text(metadata or {}),
                        now,
                        now,
                    ),
                )
        return self.get_room(room_id) or {
            "room_id": room_id,
            "room_key": normalized_key,
            "title": str(title or normalized_key),
            "room_type": str(room_type or "collab"),
            "status": str(status or "active"),
            "owner_user_id": str(owner_user_id or ""),
            "source_agent_id": str(source_agent_id or ""),
            "target_agent_id": str(target_agent_id or ""),
            "trace_id": str(trace_id or ""),
            "session_id": str(session_id or ""),
            "metadata": metadata or {},
            "created_at": now,
            "updated_at": now,
        }

    def get_room(self, room_id: str) -> dict[str, Any] | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM room WHERE room_id = ? LIMIT 1",
                (str(room_id or ""),),
            ).fetchone()
        return self._normalize_room(row)

    def get_room_by_key(self, room_key: str) -> dict[str, Any] | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM room WHERE room_key = ? LIMIT 1",
                (str(room_key or ""),),
            ).fetchone()
        return self._normalize_room(row)

    def get_room_by_session(self, session_id: str) -> dict[str, Any] | None:
        if not session_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM room WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1",
                (str(session_id or ""),),
            ).fetchone()
        return self._normalize_room(row)

    def get_room_by_trace(self, trace_id: str) -> dict[str, Any] | None:
        if not trace_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM room WHERE trace_id = ? ORDER BY updated_at DESC LIMIT 1",
                (str(trace_id or ""),),
            ).fetchone()
        return self._normalize_room(row)

    def list_rooms(
        self,
        *,
        owner_user_id: str = "",
        status: str = "",
        room_type: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if status:
            clauses.append("status = ?")
            params.append(str(status))
        if room_type:
            clauses.append("room_type = ?")
            params.append(str(room_type))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        safe_limit = max(int(limit or 0), 1)
        query = f"SELECT * FROM room {where} ORDER BY updated_at DESC LIMIT ?"
        with self._get_conn() as conn:
            rows = conn.execute(query, (*params, safe_limit)).fetchall()
        return [self._normalize_room(row) or {} for row in rows]

    def upsert_member(
        self,
        *,
        room_id: str,
        member_id: str,
        member_type: str = "user",
        role: str = "",
        display_name: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if not room_id or not member_id:
            return
        now = self._now_iso()
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO room_member (
    room_id, member_id, member_type, role, display_name, metadata, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(room_id, member_id, member_type) DO UPDATE SET
    role = excluded.role,
    display_name = excluded.display_name,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at
""",
                    (
                        str(room_id),
                        str(member_id),
                        str(member_type or "user"),
                        str(role or ""),
                        str(display_name or member_id),
                        self._json_text(metadata or {}),
                        now,
                        now,
                    ),
                )
                conn.execute(
                    "UPDATE room SET updated_at = ? WHERE room_id = ?",
                    (now, str(room_id)),
                )

    def list_members(self, room_id: str) -> list[dict[str, Any]]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM room_member WHERE room_id = ? ORDER BY created_at ASC",
                (str(room_id or ""),),
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            item = dict(row)
            item["metadata"] = self._parse_json(item.get("metadata"))
            items.append(item)
        return items

    def append_event(
        self,
        *,
        room_id: str,
        event_type: str,
        actor_user_id: str = "",
        actor_agent_id: str = "",
        trace_id: str = "",
        summary: str = "",
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        event_id = str(uuid.uuid4())
        now = self._now_iso()
        item = {
            "event_id": event_id,
            "room_id": str(room_id or ""),
            "event_type": str(event_type or "room.event"),
            "actor_user_id": str(actor_user_id or ""),
            "actor_agent_id": str(actor_agent_id or ""),
            "trace_id": str(trace_id or ""),
            "summary": str(summary or ""),
            "payload": payload or {},
            "created_at": now,
        }
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO room_event (
    event_id, room_id, event_type, actor_user_id, actor_agent_id,
    trace_id, summary, payload, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        item["event_id"],
                        item["room_id"],
                        item["event_type"],
                        item["actor_user_id"],
                        item["actor_agent_id"],
                        item["trace_id"],
                        item["summary"],
                        self._json_text(item["payload"]),
                        item["created_at"],
                    ),
                )
                conn.execute(
                    "UPDATE room SET updated_at = ? WHERE room_id = ?",
                    (now, str(room_id)),
                )
        return item

    def list_events(self, room_id: str, *, limit: int = 200) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        with self._get_conn() as conn:
            rows = conn.execute(
                """
SELECT * FROM room_event
WHERE room_id = ?
ORDER BY created_at DESC
LIMIT ?
""",
                (str(room_id or ""), safe_limit),
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in reversed(rows):
            item = dict(row)
            item["payload"] = self._parse_json(item.get("payload"))
            items.append(item)
        return items
