# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
import threading
import uuid
from pathlib import Path
from typing import Optional


class ChatFileStore:
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
CREATE TABLE IF NOT EXISTS chat_files (
    file_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_files_user_session
ON chat_files(user_id, session_id, created_at);
"""
            )

    def create_file(
        self,
        *,
        user_id: str,
        session_id: str,
        original_name: str,
        mime_type: str,
        file_size: int,
        storage_path: str,
    ) -> str:
        file_id = str(uuid.uuid4())
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO chat_files (
    file_id, user_id, session_id, original_name,
    mime_type, file_size, storage_path
) VALUES (?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        file_id,
                        str(user_id),
                        str(session_id),
                        str(original_name),
                        str(mime_type),
                        int(file_size),
                        str(storage_path),
                    ),
                )
        return file_id

    def get_file(self, file_id: str) -> Optional[dict]:
        with self._get_conn() as conn:
            row = conn.execute(
                """
SELECT file_id, user_id, session_id, original_name, mime_type, file_size, storage_path, created_at
FROM chat_files
WHERE file_id = ?
LIMIT 1
""",
                (str(file_id),),
            ).fetchone()
            return dict(row) if row else None

    def list_files_by_session(self, *, user_id: str, session_id: str, limit: int = 200) -> list[dict]:
        with self._get_conn() as conn:
            rows = conn.execute(
                """
SELECT file_id, user_id, session_id, original_name, mime_type, file_size, created_at
FROM chat_files
WHERE user_id = ? AND session_id = ?
ORDER BY created_at DESC
LIMIT ?
""",
                (str(user_id), str(session_id), int(limit)),
            ).fetchall()
            return [dict(r) for r in rows]
