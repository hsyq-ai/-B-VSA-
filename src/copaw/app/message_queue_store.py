# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any


class MessageQueueStore:
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
CREATE TABLE IF NOT EXISTS push_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_push_messages_user_id
ON push_messages(user_id, id);

CREATE TABLE IF NOT EXISTS push_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    source_user_name TEXT,
    target_user_name TEXT,
    status TEXT NOT NULL,
    detail TEXT,
    task_id TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""
            )
            self._ensure_push_events_columns(conn)

    def _ensure_push_events_columns(self, conn: sqlite3.Connection) -> None:
        cols = {
            str(r["name"])
            for r in conn.execute("PRAGMA table_info(push_events)").fetchall()
        }

        def add(column: str, ddl: str) -> None:
            if column in cols:
                return
            conn.execute(f"ALTER TABLE push_events ADD COLUMN {ddl}")
            cols.add(column)

        add("trace_id", "trace_id TEXT")
        add("conversation_key", "conversation_key TEXT")
        add("route_result", "route_result TEXT")

        conn.execute(
            """
CREATE INDEX IF NOT EXISTS idx_push_events_user_created
ON push_events(user_id, id)
"""
        )
        conn.execute(
            """
CREATE INDEX IF NOT EXISTS idx_push_events_trace_created
ON push_events(trace_id, id)
"""
        )
        conn.execute(
            """
CREATE INDEX IF NOT EXISTS idx_push_events_conversation_created
ON push_events(conversation_key, id)
"""
        )
        conn.execute(
            """
CREATE INDEX IF NOT EXISTS idx_push_events_route_created
ON push_events(route_result, id)
"""
        )

    def enqueue_message(self, user_id: str, payload: dict[str, Any]) -> None:
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    "INSERT INTO push_messages (user_id, payload) VALUES (?, ?)",
                    (str(user_id), json.dumps(payload, ensure_ascii=False)),
                )

    def pull_messages(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        uid = str(user_id)
        with self._lock:
            with self._get_conn() as conn:
                rows = conn.execute(
                    """
SELECT id, payload FROM push_messages
WHERE user_id = ?
ORDER BY id ASC
LIMIT ?
""",
                    (uid, int(limit)),
                ).fetchall()
                if not rows:
                    return []
                ids = [int(r["id"]) for r in rows]
                conn.executemany(
                    "DELETE FROM push_messages WHERE id = ?",
                    [(mid,) for mid in ids],
                )
        messages: list[dict[str, Any]] = []
        for r in rows:
            try:
                messages.append(json.loads(str(r["payload"])))
            except Exception:
                messages.append({"text": str(r["payload"])})
        return messages

    def pending_count(self, user_id: str) -> int:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT COUNT(1) AS c FROM push_messages WHERE user_id = ?",
                (str(user_id),),
            ).fetchone()
            return int(row["c"]) if row else 0

    def record_event(
        self,
        *,
        status: str,
        user_id: str = "",
        source_user_name: str = "",
        target_user_name: str = "",
        detail: str = "",
        task_id: str = "",
        trace_id: str = "",
        conversation_key: str = "",
        route_result: str = "",
    ) -> None:
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO push_events (
    user_id, source_user_name, target_user_name,
    status, detail, task_id, trace_id, conversation_key, route_result
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        str(user_id or ""),
                        str(source_user_name or ""),
                        str(target_user_name or ""),
                        str(status or ""),
                        str(detail or ""),
                        str(task_id or ""),
                        str(trace_id or ""),
                        str(conversation_key or ""),
                        str(route_result or ""),
                    ),
                )

    def recent_events(self, user_id: str = "", limit: int = 10) -> list[dict[str, Any]]:
        with self._get_conn() as conn:
            if user_id:
                rows = conn.execute(
                    """
SELECT user_id, source_user_name, target_user_name, status, detail, task_id,
       trace_id, conversation_key, route_result, created_at
FROM push_events
WHERE user_id = ?
ORDER BY id DESC
LIMIT ?
""",
                    (str(user_id), int(limit)),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
SELECT user_id, source_user_name, target_user_name, status, detail, task_id,
       trace_id, conversation_key, route_result, created_at
FROM push_events
ORDER BY id DESC
LIMIT ?
""",
                    (int(limit),),
                ).fetchall()
        return [dict(r) for r in rows]

    def recent_route_events(
        self,
        *,
        user_id: str = "",
        days: int = 30,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        safe_days = max(int(days or 0), 1)
        safe_limit = max(int(limit or 0), 1)
        with self._get_conn() as conn:
            if user_id:
                rows = conn.execute(
                    """
SELECT user_id, source_user_name, target_user_name, status, detail, task_id,
       trace_id, conversation_key, route_result, created_at
FROM push_events
WHERE user_id = ?
  AND datetime(created_at) >= datetime('now', ?)
ORDER BY id DESC
LIMIT ?
""",
                    (str(user_id), f"-{safe_days} days", safe_limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
SELECT user_id, source_user_name, target_user_name, status, detail, task_id,
       trace_id, conversation_key, route_result, created_at
FROM push_events
WHERE datetime(created_at) >= datetime('now', ?)
ORDER BY id DESC
LIMIT ?
""",
                    (f"-{safe_days} days", safe_limit),
                ).fetchall()
        return [dict(r) for r in rows]

    def cleanup_old_route_events(self, *, keep_days: int = 30) -> int:
        safe_days = max(int(keep_days or 0), 1)
        with self._lock:
            with self._get_conn() as conn:
                cur = conn.execute(
                    """
DELETE FROM push_events
WHERE datetime(created_at) < datetime('now', ?)
""",
                    (f"-{safe_days} days",),
                )
                return int(cur.rowcount or 0)

    def duplicate_hit_stats(
        self,
        *,
        user_id: str = "",
        days: int = 30,
    ) -> dict[str, int]:
        safe_days = max(int(days or 0), 1)
        with self._get_conn() as conn:
            if user_id:
                row = conn.execute(
                    """
SELECT COUNT(1) AS c
FROM push_events
WHERE user_id = ?
  AND route_result = 'duplicate_hit'
  AND datetime(created_at) >= datetime('now', ?)
""",
                    (str(user_id), f"-{safe_days} days"),
                ).fetchone()
            else:
                row = conn.execute(
                    """
SELECT COUNT(1) AS c
FROM push_events
WHERE route_result = 'duplicate_hit'
  AND datetime(created_at) >= datetime('now', ?)
""",
                    (f"-{safe_days} days",),
                ).fetchone()
        return {"duplicate_hit_count": int(row["c"]) if row else 0}

    def has_event(self, *, status: str, task_id: str, user_id: str = "") -> bool:
        if not status or not task_id:
            return False
        with self._get_conn() as conn:
            if user_id:
                row = conn.execute(
                    """
SELECT 1 FROM push_events
WHERE status = ? AND task_id = ? AND user_id = ?
LIMIT 1
""",
                    (str(status), str(task_id), str(user_id)),
                ).fetchone()
            else:
                row = conn.execute(
                    """
SELECT 1 FROM push_events
WHERE status = ? AND task_id = ?
LIMIT 1
""",
                    (str(status), str(task_id)),
                ).fetchone()
        return row is not None
