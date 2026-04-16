# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class AgentOSStore:
    def __init__(self, db_path: Path, runtime_root: Path) -> None:
        self._db_path = db_path
        self._runtime_root = runtime_root
        self._lock = threading.Lock()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._runtime_root.mkdir(parents=True, exist_ok=True)
        with self._get_conn() as conn:
            conn.executescript(
                """
CREATE TABLE IF NOT EXISTS agent_registry (
    agent_id TEXT PRIMARY KEY,
    agent_type TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    owner_profile_id TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    sandbox_ref TEXT NOT NULL,
    memory_root TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_registry_owner
ON agent_registry(owner_user_id, agent_type, status);

CREATE TABLE IF NOT EXISTS iap_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    msg_id TEXT NOT NULL UNIQUE,
    trace_id TEXT NOT NULL,
    from_agent_id TEXT NOT NULL,
    to_agent_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    intent TEXT NOT NULL,
    payload TEXT NOT NULL,
    route_result TEXT NOT NULL DEFAULT 'queued',
    error_code TEXT NOT NULL DEFAULT '',
    response_payload TEXT NOT NULL DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_iap_owner_created
ON iap_messages(owner_user_id, id);

CREATE INDEX IF NOT EXISTS idx_iap_trace_created
ON iap_messages(trace_id, id);

CREATE TABLE IF NOT EXISTS agent_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id TEXT NOT NULL UNIQUE,
    owner_user_id TEXT NOT NULL,
    room_id TEXT NOT NULL DEFAULT '',
    trace_id TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    goal TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    source TEXT NOT NULL DEFAULT 'manual',
    steps_json TEXT NOT NULL DEFAULT '[]',
    metadata TEXT NOT NULL DEFAULT '{}',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_plans_owner_created
ON agent_plans(owner_user_id, id);

CREATE INDEX IF NOT EXISTS idx_agent_plans_session_created
ON agent_plans(session_id, id);

CREATE INDEX IF NOT EXISTS idx_agent_plans_room_created
ON agent_plans(room_id, id);

CREATE INDEX IF NOT EXISTS idx_agent_plans_trace_created
ON agent_plans(trace_id, id);
"""
            )

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
    def _json_text(raw: Any) -> str:
        try:
            return json.dumps(raw if raw is not None else {}, ensure_ascii=False)
        except Exception:
            return "{}"

    @staticmethod
    def _parse_list_json(raw: Any) -> list[Any]:
        if isinstance(raw, list):
            return raw
        if not raw:
            return []
        try:
            parsed = json.loads(str(raw))
            if isinstance(parsed, list):
                return parsed
        except Exception:
            return []
        return []

    @staticmethod
    def _now_iso() -> str:
        return datetime.now(timezone.utc).isoformat()

    @staticmethod
    def _safe_segment(value: str) -> str:
        cleaned = "".join(ch for ch in str(value or "") if ch.isalnum() or ch in {"-", "_"})
        return cleaned or "unknown"

    def _agent_runtime_root(self, agent: dict[str, Any] | None) -> Path | None:
        if not agent:
            return None
        sandbox_ref = str(agent.get("sandbox_ref") or "").strip()
        if not sandbox_ref:
            return None
        try:
            return Path(sandbox_ref).resolve().parent
        except Exception:
            return None

    def _ensure_mailbox_files(self, mailbox_root: Path, *, owner_label: str) -> None:
        mailbox_root.mkdir(parents=True, exist_ok=True)
        for name in (
            "inbox.md",
            "outbox.md",
            "tasks.md",
            "receipts.md",
            "inbox.jsonl",
            "outbox.jsonl",
            "tasks.jsonl",
            "receipts.jsonl",
        ):
            path = mailbox_root / name
            if not path.exists():
                if path.suffix == ".md":
                    path.write_text(
                        f"# {owner_label} Mailbox {name.replace('.md', '').upper()}\n\n",
                        encoding="utf-8",
                    )
                else:
                    path.write_text("", encoding="utf-8")

    def ensure_agent_mailbox(self, agent_id: str) -> dict[str, Any] | None:
        agent = self.get_agent(agent_id)
        runtime_root = self._agent_runtime_root(agent)
        if runtime_root is None:
            return None
        mailbox_root = runtime_root / "mailbox"
        owner_label = str(agent.get("agent_id") or agent_id or "agent")
        self._ensure_mailbox_files(mailbox_root, owner_label=owner_label)
        return {
            "mailbox_root": str(mailbox_root),
            "inbox_md": str(mailbox_root / "inbox.md"),
            "outbox_md": str(mailbox_root / "outbox.md"),
            "tasks_md": str(mailbox_root / "tasks.md"),
            "receipts_md": str(mailbox_root / "receipts.md"),
            "inbox_jsonl": str(mailbox_root / "inbox.jsonl"),
            "outbox_jsonl": str(mailbox_root / "outbox.jsonl"),
            "tasks_jsonl": str(mailbox_root / "tasks.jsonl"),
            "receipts_jsonl": str(mailbox_root / "receipts.jsonl"),
        }

    def _append_mailbox_entry(
        self,
        *,
        agent_id: str,
        direction: str,
        envelope: dict[str, Any],
    ) -> dict[str, Any] | None:
        mailbox = self.ensure_agent_mailbox(agent_id)
        if mailbox is None:
            return None
        direction_key = str(direction or "").strip().lower()
        if direction_key not in {"inbox", "outbox", "tasks", "receipts"}:
            direction_key = "inbox"
        md_path = Path(str(mailbox[f"{direction_key}_md"]))
        jsonl_path = Path(str(mailbox[f"{direction_key}_jsonl"]))
        entry = dict(envelope or {})
        entry.setdefault("mailbox_direction", direction_key)
        entry.setdefault("mailbox_id", str(entry.get("mailbox_id") or uuid.uuid4()))
        entry.setdefault("created_at", self._now_iso())
        default_status = "pending" if direction_key in {"inbox", "tasks"} else "sent"
        entry.setdefault("status", default_status)
        entry.setdefault("title", str(entry.get("title") or entry.get("intent") or "未命名任务"))
        entry.setdefault("summary", str(entry.get("summary") or entry.get("text") or ""))
        entry.setdefault("text", str(entry.get("text") or entry.get("summary") or ""))
        entry.setdefault("intent", str(entry.get("intent") or "agent.message"))

        payload_text = json.dumps(entry, ensure_ascii=False)
        with self._lock:
            jsonl_path.parent.mkdir(parents=True, exist_ok=True)
            with jsonl_path.open("a", encoding="utf-8") as f:
                f.write(payload_text + "\n")
            with md_path.open("a", encoding="utf-8") as f:
                f.write(f"### {entry['title']}\n")
                f.write(f"- **mailbox_id**: `{entry['mailbox_id']}`\n")
                f.write(f"- **created_at**: {entry['created_at']}\n")
                f.write(f"- **direction**: {entry['mailbox_direction']}\n")
                f.write(f"- **status**: {entry['status']}\n")
                if entry.get("from_agent_id"):
                    f.write(f"- **from_agent_id**: `{entry['from_agent_id']}`\n")
                if entry.get("to_agent_id"):
                    f.write(f"- **to_agent_id**: `{entry['to_agent_id']}`\n")
                if entry.get("source_user_name"):
                    f.write(f"- **source_user_name**: {entry['source_user_name']}\n")
                if entry.get("intent"):
                    f.write(f"- **intent**: `{entry['intent']}`\n")
                if entry.get("trace_id"):
                    f.write(f"- **trace_id**: `{entry['trace_id']}`\n")
                if entry.get("conversation_key"):
                    f.write(f"- **conversation_key**: `{entry['conversation_key']}`\n")
                if entry.get("task_id"):
                    f.write(f"- **task_id**: `{entry['task_id']}`\n")
                if entry.get("summary"):
                    f.write(f"- **summary**: {entry['summary']}\n")
                if entry.get("text") and entry.get("text") != entry.get("summary"):
                    f.write("\n**正文**\n\n")
                    f.write(f"{entry['text']}\n")
                f.write("\n")
        return entry

    def append_agent_inbox_entry(self, agent_id: str, envelope: dict[str, Any]) -> dict[str, Any] | None:
        return self._append_mailbox_entry(agent_id=agent_id, direction="inbox", envelope=envelope)

    def append_agent_outbox_entry(self, agent_id: str, envelope: dict[str, Any]) -> dict[str, Any] | None:
        return self._append_mailbox_entry(agent_id=agent_id, direction="outbox", envelope=envelope)

    def append_agent_task_entry(self, agent_id: str, envelope: dict[str, Any]) -> dict[str, Any] | None:
        return self._append_mailbox_entry(agent_id=agent_id, direction="tasks", envelope=envelope)

    def append_agent_receipt_entry(self, agent_id: str, envelope: dict[str, Any]) -> dict[str, Any] | None:
        return self._append_mailbox_entry(agent_id=agent_id, direction="receipts", envelope=envelope)

    def list_agent_mailbox_entries(
        self,
        *,
        agent_id: str,
        direction: str = "inbox",
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        mailbox = self.ensure_agent_mailbox(agent_id)
        if mailbox is None:
            return []
        direction_key = "inbox" if direction == "inbox" else "outbox"
        jsonl_path = Path(str(mailbox[f"{direction_key}_jsonl"]))
        if not jsonl_path.exists():
            return []
        try:
            lines = [line.strip() for line in jsonl_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        except Exception:
            return []
        items: list[dict[str, Any]] = []
        for raw in lines[-max(int(limit or 0), 1):]:
            try:
                items.append(json.loads(raw))
            except Exception:
                items.append({"text": raw})
        return items

    @staticmethod
    def build_collab_conversation_key(
        *,
        from_agent_id: str,
        to_agent_id: str,
        topic: str,
    ) -> str:
        seed = str(topic or "").strip().lower()
        if not seed:
            seed = f"{from_agent_id}:{to_agent_id}"
        digest = hashlib.md5(seed.encode("utf-8")).hexdigest()[:12]
        return f"collab:{from_agent_id}:{to_agent_id}:{digest}"

    def upsert_agent(
        self,
        *,
        agent_id: str,
        agent_type: str,
        owner_user_id: str,
        owner_profile_id: str = "",
        status: str = "active",
        sandbox_ref: str,
        memory_root: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if not agent_id:
            raise ValueError("agent_id is required")
        if not owner_user_id:
            raise ValueError("owner_user_id is required")
        payload = self._json_text(metadata or {})
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO agent_registry (
    agent_id, agent_type, owner_user_id, owner_profile_id,
    status, sandbox_ref, memory_root, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_id) DO UPDATE SET
    agent_type = excluded.agent_type,
    owner_user_id = excluded.owner_user_id,
    owner_profile_id = excluded.owner_profile_id,
    status = excluded.status,
    sandbox_ref = excluded.sandbox_ref,
    memory_root = excluded.memory_root,
    metadata = excluded.metadata,
    updated_at = CURRENT_TIMESTAMP
""",
                    (
                        str(agent_id),
                        str(agent_type),
                        str(owner_user_id),
                        str(owner_profile_id or ""),
                        str(status or "active"),
                        str(sandbox_ref or ""),
                        str(memory_root or ""),
                        payload,
                    ),
                )
        return self.get_agent(str(agent_id)) or {}

    def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        if not agent_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                """
SELECT agent_id, agent_type, owner_user_id, owner_profile_id, status,
       sandbox_ref, memory_root, metadata, created_at, updated_at
FROM agent_registry
WHERE agent_id = ?
LIMIT 1
""",
                (str(agent_id),),
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["metadata"] = self._parse_json(result.get("metadata"))
        return result

    def list_agents(
        self,
        *,
        owner_user_id: str = "",
        agent_type: str = "",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        where_sql = []
        params: list[Any] = []
        if owner_user_id:
            where_sql.append("owner_user_id = ?")
            params.append(str(owner_user_id))
        if agent_type:
            where_sql.append("agent_type = ?")
            params.append(str(agent_type))
        where_clause = f"WHERE {' AND '.join(where_sql)}" if where_sql else ""
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT agent_id, agent_type, owner_user_id, owner_profile_id, status,
       sandbox_ref, memory_root, metadata, created_at, updated_at
FROM agent_registry
{where_clause}
ORDER BY updated_at DESC, created_at DESC
LIMIT ?
""",
                [*params, safe_limit],
            ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            rec = dict(row)
            rec["metadata"] = self._parse_json(rec.get("metadata"))
            items.append(rec)
        return items

    def ensure_system_agent(self) -> dict[str, Any]:
        system_root = self._runtime_root / "system"
        memory_root = system_root / "memory"
        sandbox_root = system_root / "sandbox"
        memory_root.mkdir(parents=True, exist_ok=True)
        sandbox_root.mkdir(parents=True, exist_ok=True)
        agent = self.upsert_agent(
            agent_id="so:enterprise",
            agent_type="SO",
            owner_user_id="system",
            status="active",
            sandbox_ref=str(sandbox_root),
            memory_root=str(memory_root),
            metadata={"scope": "organization"},
        )
        self.ensure_agent_mailbox(str(agent.get("agent_id") or "so:enterprise"))
        return agent

    def ensure_user_pia(
        self,
        *,
        user_id: str,
        profile_id: str = "",
        department: str = "",
    ) -> dict[str, Any]:
        safe_user = self._safe_segment(str(user_id or ""))
        if not safe_user:
            raise ValueError("user_id is required")
        user_root = self._runtime_root / "users" / safe_user
        memory_root = user_root / "memory"
        sandbox_root = user_root / "sandbox"
        memory_root.mkdir(parents=True, exist_ok=True)
        sandbox_root.mkdir(parents=True, exist_ok=True)
        self.ensure_system_agent()
        agent = self.upsert_agent(
            agent_id=f"pia:{safe_user}",
            agent_type="PIA",
            owner_user_id=safe_user,
            owner_profile_id=str(profile_id or ""),
            status="active",
            sandbox_ref=str(sandbox_root),
            memory_root=str(memory_root),
            metadata={
                "department": str(department or ""),
            },
        )
        self.ensure_agent_mailbox(str(agent.get("agent_id") or f"pia:{safe_user}"))
        return agent

    def ensure_user_vsa(
        self,
        *,
        user_id: str,
        profile_id: str = "",
        department: str = "",
    ) -> dict[str, Any]:
        safe_user = self._safe_segment(str(user_id or ""))
        if not safe_user:
            raise ValueError("user_id is required")
        user_root = self._runtime_root / "users" / safe_user / "voice_secretary"
        memory_root = user_root / "memory"
        sandbox_root = user_root / "sandbox"
        memory_root.mkdir(parents=True, exist_ok=True)
        sandbox_root.mkdir(parents=True, exist_ok=True)
        self.ensure_system_agent()
        agent = self.upsert_agent(
            agent_id=f"vsa:{safe_user}",
            agent_type="VSA",
            owner_user_id=safe_user,
            owner_profile_id=str(profile_id or ""),
            status="active",
            sandbox_ref=str(sandbox_root),
            memory_root=str(memory_root),
            metadata={
                "department": str(department or ""),
                "channel": "voice_secretary",
            },
        )
        self.ensure_agent_mailbox(str(agent.get("agent_id") or f"vsa:{safe_user}"))
        return agent

    def find_recent_duplicate(
        self,
        *,
        trace_id: str,
        from_agent_id: str,
        to_agent_id: str,
        intent: str,
        owner_user_id: str,
        lookback_minutes: int = 30,
    ) -> dict[str, Any] | None:
        if not trace_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                """
SELECT msg_id, trace_id, from_agent_id, to_agent_id, owner_user_id, intent,
       route_result, created_at
FROM iap_messages
WHERE trace_id = ?
  AND from_agent_id = ?
  AND to_agent_id = ?
  AND intent = ?
  AND owner_user_id = ?
  AND datetime(created_at) >= datetime('now', ?)
ORDER BY id DESC
LIMIT 1
""",
                (
                    str(trace_id),
                    str(from_agent_id),
                    str(to_agent_id),
                    str(intent),
                    str(owner_user_id),
                    f"-{max(int(lookback_minutes or 0), 1)} minutes",
                ),
            ).fetchone()
        return dict(row) if row else None

    def create_iap_message(
        self,
        *,
        from_agent_id: str,
        to_agent_id: str,
        owner_user_id: str,
        intent: str,
        payload: dict[str, Any] | None = None,
        trace_id: str = "",
        route_result: str = "queued",
    ) -> dict[str, Any]:
        msg_id = str(uuid.uuid4())
        safe_trace_id = str(trace_id or msg_id)
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO iap_messages (
    msg_id, trace_id, from_agent_id, to_agent_id, owner_user_id,
    intent, payload, route_result
) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        msg_id,
                        safe_trace_id,
                        str(from_agent_id or ""),
                        str(to_agent_id or ""),
                        str(owner_user_id or ""),
                        str(intent or ""),
                        self._json_text(payload or {}),
                        str(route_result or "queued"),
                    ),
                )
        return self.get_iap_message(msg_id) or {}

    def get_iap_message(self, msg_id: str) -> dict[str, Any] | None:
        if not msg_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                """
SELECT msg_id, trace_id, from_agent_id, to_agent_id, owner_user_id,
       intent, payload, route_result, error_code, response_payload,
       created_at, updated_at
FROM iap_messages
WHERE msg_id = ?
LIMIT 1
""",
                (str(msg_id),),
            ).fetchone()
        if not row:
            return None
        rec = dict(row)
        rec["payload"] = self._parse_json(rec.get("payload"))
        rec["response_payload"] = self._parse_json(rec.get("response_payload"))
        return rec

    def update_iap_result(
        self,
        *,
        msg_id: str,
        route_result: str,
        error_code: str = "",
        response_payload: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        if not msg_id:
            return None
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
UPDATE iap_messages
SET route_result = ?,
    error_code = ?,
    response_payload = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE msg_id = ?
""",
                    (
                        str(route_result or ""),
                        str(error_code or ""),
                        self._json_text(response_payload or {}),
                        str(msg_id),
                    ),
                )
        return self.get_iap_message(str(msg_id))

    def list_iap_messages(
        self,
        *,
        owner_user_id: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        safe_limit = max(int(limit or 0), 1)
        with self._get_conn() as conn:
            if owner_user_id:
                rows = conn.execute(
                    """
SELECT msg_id, trace_id, from_agent_id, to_agent_id, owner_user_id,
       intent, payload, route_result, error_code, response_payload,
       created_at, updated_at
FROM iap_messages
WHERE owner_user_id = ?
ORDER BY id DESC
LIMIT ?
""",
                    (str(owner_user_id), safe_limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
SELECT msg_id, trace_id, from_agent_id, to_agent_id, owner_user_id,
       intent, payload, route_result, error_code, response_payload,
       created_at, updated_at
FROM iap_messages
ORDER BY id DESC
LIMIT ?
""",
                    (safe_limit,),
                ).fetchall()
        items: list[dict[str, Any]] = []
        for row in rows:
            rec = dict(row)
            rec["payload"] = self._parse_json(rec.get("payload"))
            rec["response_payload"] = self._parse_json(rec.get("response_payload"))
            items.append(rec)
        return items

    def summarize_iap(self, *, owner_user_id: str = "") -> dict[str, Any]:
        where_sql = ""
        params: list[Any] = []
        if owner_user_id:
            where_sql = "WHERE owner_user_id = ?"
            params.append(str(owner_user_id))
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT route_result, COUNT(1) AS c
FROM iap_messages
{where_sql}
GROUP BY route_result
""",
                params,
            ).fetchall()
        by_result = {str(row["route_result"] or "unknown"): int(row["c"] or 0) for row in rows}
        return {
            "total": int(sum(by_result.values())),
            "by_route_result": by_result,
        }

    def _normalize_plan_row(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        item = dict(row)
        item["steps"] = self._parse_list_json(item.pop("steps_json", "[]"))
        item["metadata"] = self._parse_json(item.get("metadata"))
        return item

    def create_plan(
        self,
        *,
        owner_user_id: str,
        title: str,
        goal: str,
        room_id: str = "",
        trace_id: str = "",
        session_id: str = "",
        status: str = "draft",
        source: str = "manual",
        steps: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        plan_id = str(uuid.uuid4())
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
INSERT INTO agent_plans (
    plan_id, owner_user_id, room_id, trace_id, session_id,
    title, goal, status, source, steps_json, metadata
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
""",
                    (
                        plan_id,
                        str(owner_user_id or ""),
                        str(room_id or ""),
                        str(trace_id or ""),
                        str(session_id or ""),
                        str(title or ""),
                        str(goal or ""),
                        str(status or "draft"),
                        str(source or "manual"),
                        self._json_text(steps or []),
                        self._json_text(metadata or {}),
                    ),
                )
        return self.get_plan(plan_id) or {}

    def get_plan(self, plan_id: str) -> dict[str, Any] | None:
        if not plan_id:
            return None
        with self._get_conn() as conn:
            row = conn.execute(
                """
SELECT plan_id, owner_user_id, room_id, trace_id, session_id,
       title, goal, status, source, steps_json, metadata,
       created_at, updated_at
FROM agent_plans
WHERE plan_id = ?
LIMIT 1
""",
                (str(plan_id),),
            ).fetchone()
        return self._normalize_plan_row(row)

    def list_plans(
        self,
        *,
        owner_user_id: str = "",
        room_id: str = "",
        trace_id: str = "",
        session_id: str = "",
        status: str = "",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
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
        if session_id:
            clauses.append("session_id = ?")
            params.append(str(session_id))
        if status:
            clauses.append("status = ?")
            params.append(str(status))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        safe_limit = max(int(limit or 0), 1)
        with self._get_conn() as conn:
            rows = conn.execute(
                f"""
SELECT plan_id, owner_user_id, room_id, trace_id, session_id,
       title, goal, status, source, steps_json, metadata,
       created_at, updated_at
FROM agent_plans
{where}
ORDER BY id DESC
LIMIT ?
""",
                (*params, safe_limit),
            ).fetchall()
        return [self._normalize_plan_row(row) or {} for row in rows]

    def update_plan_status(
        self,
        *,
        plan_id: str,
        status: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        if not plan_id:
            return None
        current = self.get_plan(plan_id)
        if current is None:
            return None
        merged_metadata = self._parse_json(current.get("metadata"))
        if isinstance(metadata, dict):
            merged_metadata.update(metadata)
        with self._lock:
            with self._get_conn() as conn:
                conn.execute(
                    """
UPDATE agent_plans
SET status = ?,
    metadata = ?,
    updated_at = CURRENT_TIMESTAMP
WHERE plan_id = ?
""",
                    (
                        str(status or current.get("status") or "draft"),
                        self._json_text(merged_metadata),
                        str(plan_id),
                    ),
                )
        return self.get_plan(plan_id)

    def get_latest_plan_for_session(
        self,
        *,
        owner_user_id: str,
        session_id: str,
    ) -> dict[str, Any] | None:
        items = self.list_plans(
            owner_user_id=str(owner_user_id or ""),
            session_id=str(session_id or ""),
            limit=1,
        )
        return items[0] if items else None
