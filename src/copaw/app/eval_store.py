# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class EvalStore:
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
CREATE TABLE IF NOT EXISTS eval_run (
    eval_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL DEFAULT '',
    room_id TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    dataset TEXT NOT NULL DEFAULT '',
    metric TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_run_owner_created
ON eval_run(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_eval_run_trace_created
ON eval_run(trace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS replay_run (
    replay_id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL DEFAULT '',
    room_id TEXT NOT NULL DEFAULT '',
    owner_user_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'queued',
    source TEXT NOT NULL DEFAULT 'manual',
    summary TEXT NOT NULL DEFAULT '',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_replay_run_owner_created
ON replay_run(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_replay_run_trace_created
ON replay_run(trace_id, created_at DESC);
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

    def _normalize_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        item["metadata"] = self._parse_json(item.get("metadata"))
        return item

    def create_eval(
        self,
        *,
        trace_id: str = "",
        room_id: str = "",
        owner_user_id: str = "",
        title: str = "",
        status: str = "queued",
        dataset: str = "",
        metric: str = "",
        summary: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = self._now_iso()
        item = {
            "eval_id": str(uuid.uuid4()),
            "trace_id": str(trace_id or str(uuid.uuid4())),
            "room_id": str(room_id or ""),
            "owner_user_id": str(owner_user_id or ""),
            "title": str(title or "链路评测"),
            "status": str(status or "queued"),
            "dataset": str(dataset or ""),
            "metric": str(metric or ""),
            "summary": str(summary or ""),
            "metadata": metadata or {},
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO eval_run (
    eval_id, trace_id, room_id, owner_user_id, title, status,
    dataset, metric, summary, metadata, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        item["eval_id"],
                        item["trace_id"],
                        item["room_id"],
                        item["owner_user_id"],
                        item["title"],
                        item["status"],
                        item["dataset"],
                        item["metric"],
                        item["summary"],
                        self._json_text(item["metadata"]),
                        item["created_at"],
                        item["updated_at"],
                    ),
                )
        return item

    def list_evals(
        self,
        *,
        owner_user_id: str = "",
        trace_id: str = "",
        status: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        clauses: list[str] = []
        params: list[Any] = []
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if trace_id:
            clauses.append("trace_id = ?")
            params.append(str(trace_id))
        if status:
            clauses.append("status = ?")
            params.append(str(status))
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(safe_limit)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT * FROM eval_run
{where_sql}
ORDER BY created_at DESC
LIMIT ?
""",
                tuple(params),
            ).fetchall()
        return [self._normalize_row(row) or {} for row in rows]

    def create_replay(
        self,
        *,
        trace_id: str = "",
        room_id: str = "",
        owner_user_id: str = "",
        title: str = "",
        status: str = "queued",
        source: str = "manual",
        summary: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        now = self._now_iso()
        item = {
            "replay_id": str(uuid.uuid4()),
            "trace_id": str(trace_id or str(uuid.uuid4())),
            "room_id": str(room_id or ""),
            "owner_user_id": str(owner_user_id or ""),
            "title": str(title or "链路回放"),
            "status": str(status or "queued"),
            "source": str(source or "manual"),
            "summary": str(summary or ""),
            "metadata": metadata or {},
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO replay_run (
    replay_id, trace_id, room_id, owner_user_id, title, status,
    source, summary, metadata, created_at, updated_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        item["replay_id"],
                        item["trace_id"],
                        item["room_id"],
                        item["owner_user_id"],
                        item["title"],
                        item["status"],
                        item["source"],
                        item["summary"],
                        self._json_text(item["metadata"]),
                        item["created_at"],
                        item["updated_at"],
                    ),
                )
        return item

    def list_replays(
        self,
        *,
        owner_user_id: str = "",
        trace_id: str = "",
        status: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        clauses: list[str] = []
        params: list[Any] = []
        if owner_user_id:
            clauses.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if trace_id:
            clauses.append("trace_id = ?")
            params.append(str(trace_id))
        if status:
            clauses.append("status = ?")
            params.append(str(status))
        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(safe_limit)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT * FROM replay_run
{where_sql}
ORDER BY created_at DESC
LIMIT ?
""",
                tuple(params),
            ).fetchall()
        return [self._normalize_row(row) or {} for row in rows]
