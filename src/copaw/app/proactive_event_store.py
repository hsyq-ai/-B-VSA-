# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any


class ProactiveEventStore:
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
CREATE TABLE IF NOT EXISTS proactive_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proactive_events_user_id
ON proactive_events(user_id, id);
"""
            )

    def enqueue_event(
        self,
        user_id: str,
        payload: dict[str, Any],
        *,
        dedupe_window_seconds: int = 20,
    ) -> bool:
        payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        comparable_payload = dict(payload or {})
        comparable_payload.pop("ts", None)
        with self._lock:
            with self._get_conn() as conn:
                if int(dedupe_window_seconds) > 0:
                    recent_rows = conn.execute(
                        """
SELECT payload FROM proactive_events
WHERE user_id = ?
  AND created_at >= datetime('now', ?)
ORDER BY id DESC
LIMIT 50
""",
                        (str(user_id), f"-{int(dedupe_window_seconds)} seconds"),
                    ).fetchall()
                    for row in recent_rows:
                        try:
                            existing = json.loads(str(row["payload"]))
                            if isinstance(existing, dict):
                                existing = dict(existing)
                                existing.pop("ts", None)
                            if existing == comparable_payload:
                                return False
                        except Exception:
                            continue
                conn.execute(
                    "INSERT INTO proactive_events (user_id, payload) VALUES (?, ?)",
                    (str(user_id), payload_json),
                )
        return True

    def pull_events(self, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
        uid = str(user_id)
        with self._lock:
            with self._get_conn() as conn:
                rows = conn.execute(
                    """
SELECT id, payload FROM proactive_events
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
                    "DELETE FROM proactive_events WHERE id = ?",
                    [(event_id,) for event_id in ids],
                )
        events: list[dict[str, Any]] = []
        for row in rows:
            try:
                events.append(json.loads(str(row["payload"])))
            except Exception:
                events.append({"title": "主动提醒", "summary": str(row["payload"])})
        return events

    def pending_count(self, user_id: str) -> int:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT COUNT(1) AS c FROM proactive_events WHERE user_id = ?",
                (str(user_id),),
            ).fetchone()
            return int(row["c"]) if row else 0
