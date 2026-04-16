# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class ArtifactStore:
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
CREATE TABLE IF NOT EXISTS artifact (
    artifact_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL DEFAULT '',
    trace_id TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL DEFAULT '',
    step_id TEXT NOT NULL DEFAULT '',
    artifact_type TEXT NOT NULL DEFAULT 'note',
    title TEXT NOT NULL DEFAULT '',
    uri TEXT NOT NULL DEFAULT '',
    mime_type TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_artifact_room_created
ON artifact(room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_trace_created
ON artifact(trace_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_artifact_owner_created
ON artifact(owner_user_id, created_at DESC);
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

    @staticmethod
    def _normalize(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        try:
            item["metadata"] = json.loads(str(item.get("metadata") or "{}"))
            if not isinstance(item["metadata"], dict):
                item["metadata"] = {}
        except Exception:
            item["metadata"] = {}
        return item

    def create_artifact(
        self,
        *,
        artifact_id: str = "",
        room_id: str = "",
        trace_id: str = "",
        owner_user_id: str = "",
        step_id: str = "",
        artifact_type: str = "note",
        title: str = "",
        uri: str = "",
        mime_type: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = self._now_iso()
        final_id = str(artifact_id or uuid.uuid4())
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO artifact (
    artifact_id, room_id, trace_id, owner_user_id, step_id,
    artifact_type, title, uri, mime_type, metadata, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        final_id,
                        str(room_id or ""),
                        str(trace_id or ""),
                        str(owner_user_id or ""),
                        str(step_id or ""),
                        str(artifact_type or "note"),
                        str(title or ""),
                        str(uri or ""),
                        str(mime_type or ""),
                        self._json_text(metadata or {}),
                        now,
                        now,
                    ),
                )
        return self.get_artifact(final_id) or {
            "artifact_id": final_id,
            "room_id": str(room_id or ""),
            "trace_id": str(trace_id or ""),
            "owner_user_id": str(owner_user_id or ""),
            "step_id": str(step_id or ""),
            "artifact_type": str(artifact_type or "note"),
            "title": str(title or ""),
            "uri": str(uri or ""),
            "mime_type": str(mime_type or ""),
            "metadata": metadata or {},
            "created_at": now,
            "updated_at": now,
        }

    def get_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        with self._get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM artifact WHERE artifact_id = ? LIMIT 1",
                (str(artifact_id or ""),),
            ).fetchone()
        return self._normalize(row)

    def list_artifacts(
        self,
        *,
        owner_user_id: str = "",
        room_id: str = "",
        trace_id: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses = []
        params: list[Any] = []
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if room_id:
            clauses.append("room_id = ?")
            params.append(str(room_id))
        if trace_id:
            clauses.append("trace_id = ?")
            params.append(str(trace_id))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        safe_limit = max(int(limit or 0), 1)
        query = f"SELECT * FROM artifact {where} ORDER BY created_at DESC LIMIT ?"
        with self._get_conn() as conn:
            rows = conn.execute(query, (*params, safe_limit)).fetchall()
        return [self._normalize(row) or {} for row in rows]
