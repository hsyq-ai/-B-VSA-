# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import re
import time
from typing import Any, Dict, Optional

from agentscope.memory import InMemoryMemory

from .platform_skill_audit_store import append_platform_skill_audit
from .platform_skill_runtime_store import get_runtime_skill, upsert_runtime_skill
from .runner.utils import agentscope_msg_to_message
from .channels.schema import DEFAULT_CHANNEL

logger = logging.getLogger(__name__)

_SCHEDULER: "SessionEvolutionScheduler | None" = None
_SCHEDULER_LOCK = asyncio.Lock()


def _slugify(text: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fa5]+", "-", str(text or "").strip()).strip("-")
    return slug[:36] or "session-skill"


def _safe_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(_safe_text(v) for v in value.values())
    if isinstance(value, list):
        return " ".join(_safe_text(v) for v in value)
    return str(value or "")


def _extract_message_text(msg: Any) -> tuple[str, str]:
    if hasattr(msg, "model_dump"):
        data = msg.model_dump()  # type: ignore[attr-defined]
    elif isinstance(msg, dict):
        data = msg
    else:
        data = {}
    role = str(data.get("role") or "")
    content = data.get("content")
    if isinstance(content, str):
        return role, content.strip()
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if "text" in block:
                    parts.append(str(block.get("text") or "").strip())
                elif "data" in block:
                    parts.append(_safe_text(block.get("data")))
        return role, " ".join([x for x in parts if x]).strip()
    return role, _safe_text(content).strip()


def _lookup_department(user_id: str) -> str:
    try:
        from .auth_db import _get_conn  # type: ignore[attr-defined]

        with _get_conn() as conn:  # type: ignore[attr-defined]
            row = conn.execute(
                """
SELECT ep.department AS department
FROM users u
LEFT JOIN employee_profiles ep ON ep.id = u.profile_id
WHERE u.id = ?
""",
                (user_id,),
            ).fetchone()
            if row:
                return str(row["department"] or "").strip()
    except Exception:
        logger.exception("Failed to lookup department for user_id=%s", user_id)
    return ""


async def evolve_skill_candidate_for_chat(
    *,
    chat_manager: Any,
    session: Any,
    session_id: str,
    user_id: str,
    channel: str = DEFAULT_CHANNEL,
) -> Optional[Dict[str, Any]]:
    if not session_id or not user_id:
        return None
    chat = await chat_manager.get_chat_by_id(session_id=session_id, user_id=user_id, channel=channel)
    chat_id = str(chat.id) if chat else ""
    state = await session.get_session_state_dict(session_id, user_id, allow_not_exist=True)
    memories = state.get("agent", {}).get("memory", []) if isinstance(state, dict) else []
    if not isinstance(memories, list) or not memories:
        return None

    memory = InMemoryMemory()
    memory.load_state_dict(memories)
    msgs = await memory.get_memory()
    converted = agentscope_msg_to_message(msgs)

    last_user_text = ""
    last_assistant_text = ""
    for msg in converted:
        role, text = _extract_message_text(msg)
        if role == "user" and text:
            last_user_text = text
        elif role == "assistant" and text:
            last_assistant_text = text

    if not last_user_text and not last_assistant_text:
        return None

    seed = f"{session_id}|{last_user_text[:120]}|{last_assistant_text[:120]}"
    digest = hashlib.md5(seed.encode("utf-8")).hexdigest()[:12]
    existing = await get_runtime_skill(digest)
    department = _lookup_department(user_id)
    name_seed = _slugify(last_user_text[:24] or "session-insight")
    skill_name = f"{name_seed}-{digest}"

    content = (
        f"## 会话经验：{last_user_text[:40] or '通用任务'}\n\n"
        "1. 先复述用户目标与约束，确认成功标准。\n"
        "2. 给出可执行步骤，并标注关键输入和潜在风险。\n"
        "3. 产出可复用模板（清单/命令/结构化输出格式）。\n"
        "4. 最后给出下一步建议与验证方法。\n\n"
        f"### 会话触发语句\n{last_user_text[:300] or '（无）'}\n\n"
        f"### 会话有效回复片段\n{last_assistant_text[:600] or '（无）'}\n\n"
        "**Anti-pattern**：只给结论，不给执行路径和验证标准。"
    )

    item = await upsert_runtime_skill(
        {
            "id": digest,
            "name": skill_name,
            "description": (
                f"当用户任务接近“{(last_user_text[:32] or '通用任务')}”时触发，"
                "优先输出步骤化、可验证的执行方案。"
            ),
            "content": content,
            "department": department,
            "source_chat_id": chat_id,
            "source_session_id": session_id,
            "source_user_id": user_id,
            "status": "candidate",
            "updated_at": time.time(),
        }
    )
    await append_platform_skill_audit(
        {
            "action": "auto_evolve_refresh" if existing else "auto_evolve_create",
            "skill_id": str(item.get("id") or digest),
            "skill_name": str(item.get("name") or ""),
            "status_from": str(existing.get("status") or "") if existing else "",
            "status_to": str(item.get("status") or ""),
            "source_chat_id": chat_id,
            "actor_user_id": "system",
            "actor_name": "system-auto-evolver",
            "note": "会话后自动演化生成候选技能",
        }
    )
    return item


async def schedule_session_evolution(
    *,
    session_id: str,
    user_id: str,
    channel: str = DEFAULT_CHANNEL,
    delay_seconds: int = 120,
    app: Any = None,
    chat_manager: Any = None,
    session: Any = None,
) -> None:
    if not session_id or not user_id:
        return
    scheduler = await get_session_evolution_scheduler()
    key = f"{channel}:{user_id}:{session_id}"
    await scheduler.enqueue(
        key=key,
        payload={
            "session_id": str(session_id),
            "user_id": str(user_id),
            "channel": str(channel or DEFAULT_CHANNEL),
            "app": app,
            "chat_manager": chat_manager,
            "session": session,
        },
        delay_seconds=max(10, int(delay_seconds)),
    )


class SessionEvolutionScheduler:
    def __init__(
        self,
        *,
        max_pending: int = 2000,
        max_retries: int = 3,
        retry_base_seconds: int = 8,
        retry_max_seconds: int = 60,
        idle_poll_seconds: float = 0.5,
    ) -> None:
        self.max_pending = max(100, int(max_pending))
        self.max_retries = max(0, int(max_retries))
        self.retry_base_seconds = max(1, int(retry_base_seconds))
        self.retry_max_seconds = max(self.retry_base_seconds, int(retry_max_seconds))
        self.idle_poll_seconds = max(0.1, float(idle_poll_seconds))
        self._lock = asyncio.Lock()
        self._entries: Dict[str, Dict[str, Any]] = {}
        self._last_errors: list[Dict[str, Any]] = []
        self._loop_task: asyncio.Task | None = None
        self._stopping = False
        self._started_at = 0.0

        self._total_enqueued = 0
        self._total_deduped = 0
        self._total_dropped = 0
        self._total_started = 0
        self._total_succeeded = 0
        self._total_failed = 0
        self._total_retried = 0

    async def start(self) -> None:
        if self._loop_task and not self._loop_task.done():
            return
        self._stopping = False
        self._started_at = time.time()
        self._loop_task = asyncio.create_task(self._run_loop())
        logger.info("SessionEvolutionScheduler started")

    async def stop(self) -> None:
        self._stopping = True
        task = self._loop_task
        if task and not task.done():
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.exception("SessionEvolutionScheduler stop failed")
        async with self._lock:
            self._entries.clear()
        self._loop_task = None
        logger.info("SessionEvolutionScheduler stopped")

    async def enqueue(self, *, key: str, payload: Dict[str, Any], delay_seconds: int) -> None:
        due_at = time.monotonic() + max(10, int(delay_seconds))
        now = time.time()
        async with self._lock:
            existing = self._entries.get(key)
            if existing is not None:
                self._total_deduped += 1
                existing["payload"] = payload
                existing["last_enqueue_at"] = now
                existing["attempt"] = 0
                if str(existing.get("state") or "") == "running":
                    existing["reschedule_due_at"] = due_at
                else:
                    existing["state"] = "pending"
                    existing["due_at"] = due_at
                    existing["reschedule_due_at"] = 0.0
                return

            pending_count = sum(
                1 for item in self._entries.values() if str(item.get("state") or "") == "pending"
            )
            if pending_count >= self.max_pending:
                self._total_dropped += 1
                self._remember_error_locked(
                    key=key,
                    error=f"queue overflow: pending={pending_count}, max_pending={self.max_pending}",
                )
                logger.warning(
                    "SessionEvolutionScheduler dropped task key=%s pending=%s max_pending=%s",
                    key,
                    pending_count,
                    self.max_pending,
                )
                return

            self._total_enqueued += 1
            self._entries[key] = {
                "key": key,
                "payload": payload,
                "state": "pending",
                "due_at": due_at,
                "created_at": now,
                "last_enqueue_at": now,
                "started_at": 0.0,
                "attempt": 0,
                "reschedule_due_at": 0.0,
                "last_error": "",
            }

    async def status(self) -> Dict[str, Any]:
        now_mono = time.monotonic()
        now = time.time()
        async with self._lock:
            pending = [x for x in self._entries.values() if str(x.get("state") or "") == "pending"]
            running = [x for x in self._entries.values() if str(x.get("state") or "") == "running"]
            next_due_in = None
            if pending:
                due = min(float(x.get("due_at") or now_mono) for x in pending)
                next_due_in = max(0.0, due - now_mono)
            return {
                "running": bool(self._loop_task and not self._loop_task.done()),
                "started_at": self._started_at,
                "uptime_seconds": max(0.0, now - self._started_at) if self._started_at else 0.0,
                "max_pending": self.max_pending,
                "max_retries": self.max_retries,
                "retry_base_seconds": self.retry_base_seconds,
                "retry_max_seconds": self.retry_max_seconds,
                "pending_count": len(pending),
                "running_count": len(running),
                "total_enqueued": self._total_enqueued,
                "total_deduped": self._total_deduped,
                "total_dropped": self._total_dropped,
                "total_started": self._total_started,
                "total_succeeded": self._total_succeeded,
                "total_failed": self._total_failed,
                "total_retried": self._total_retried,
                "next_due_in_seconds": next_due_in,
                "running_keys": [str(x.get("key") or "") for x in running[:5]],
                "pending_keys": [str(x.get("key") or "") for x in pending[:10]],
                "last_errors": list(self._last_errors[-10:]),
            }

    async def _run_loop(self) -> None:
        try:
            while not self._stopping:
                picked = await self._pick_due_task()
                if picked is None:
                    await asyncio.sleep(self.idle_poll_seconds)
                    continue
                await self._run_one(picked)
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("SessionEvolutionScheduler loop crashed")

    async def _pick_due_task(self) -> Optional[Dict[str, Any]]:
        now = time.monotonic()
        async with self._lock:
            due_items = [
                item
                for item in self._entries.values()
                if str(item.get("state") or "") == "pending" and float(item.get("due_at") or 0) <= now
            ]
            if not due_items:
                return None
            due_items.sort(key=lambda x: float(x.get("due_at") or 0))
            target = due_items[0]
            target["state"] = "running"
            target["started_at"] = time.time()
            target["last_error"] = ""
            self._total_started += 1
            return {
                "key": str(target.get("key") or ""),
                "payload": dict(target.get("payload") or {}),
            }

    async def _run_one(self, job: Dict[str, Any]) -> None:
        key = str(job.get("key") or "")
        payload = dict(job.get("payload") or {})
        try:
            await self._execute_payload(payload)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("SessionEvolutionScheduler run failed key=%s", key)
            await self._mark_failure(key=key, error=str(exc))
        else:
            await self._mark_success(key=key)

    async def _execute_payload(self, payload: Dict[str, Any]) -> None:
        session_id = str(payload.get("session_id") or "")
        user_id = str(payload.get("user_id") or "")
        channel = str(payload.get("channel") or DEFAULT_CHANNEL)
        if not session_id or not user_id:
            return

        chat_manager = payload.get("chat_manager")
        session = payload.get("session")
        app = payload.get("app")
        if app is not None:
            try:
                chat_manager = getattr(app.state, "chat_manager", None)
                runner = getattr(app.state, "runner", None)
                session = getattr(runner, "session", None) if runner is not None else None
            except Exception:
                logger.exception("Failed to resolve app state for session evolution")

        if chat_manager is None or session is None:
            raise RuntimeError("chat_manager/session unavailable")

        await evolve_skill_candidate_for_chat(
            chat_manager=chat_manager,
            session=session,
            session_id=session_id,
            user_id=user_id,
            channel=channel,
        )

    async def _mark_success(self, *, key: str) -> None:
        async with self._lock:
            item = self._entries.get(key)
            if item is None:
                return
            self._total_succeeded += 1
            reschedule_due_at = float(item.get("reschedule_due_at") or 0.0)
            if reschedule_due_at > 0.0 and not self._stopping:
                item["state"] = "pending"
                item["due_at"] = reschedule_due_at
                item["started_at"] = 0.0
                item["reschedule_due_at"] = 0.0
                item["attempt"] = 0
                return
            self._entries.pop(key, None)

    async def _mark_failure(self, *, key: str, error: str) -> None:
        async with self._lock:
            item = self._entries.get(key)
            if item is None:
                return
            attempt = int(item.get("attempt") or 0) + 1
            item["attempt"] = attempt
            item["last_error"] = str(error or "")[:600]
            if attempt <= self.max_retries and not self._stopping:
                backoff = min(
                    self.retry_max_seconds,
                    self.retry_base_seconds * (2 ** max(0, attempt - 1)),
                )
                item["state"] = "pending"
                item["due_at"] = time.monotonic() + float(backoff)
                item["started_at"] = 0.0
                self._total_retried += 1
                return
            self._total_failed += 1
            self._remember_error_locked(key=key, error=error)
            self._entries.pop(key, None)

    def _remember_error_locked(self, *, key: str, error: str) -> None:
        self._last_errors.append(
            {
                "ts": time.time(),
                "key": key,
                "error": str(error or "")[:600],
            }
        )
        if len(self._last_errors) > 100:
            self._last_errors = self._last_errors[-100:]


def _parse_int_env(name: str, default: int) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        return int(raw)
    except Exception:
        return default


def _parse_float_env(name: str, default: float) -> float:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return default
    try:
        return float(raw)
    except Exception:
        return default


async def get_session_evolution_scheduler() -> SessionEvolutionScheduler:
    global _SCHEDULER
    async with _SCHEDULER_LOCK:
        if _SCHEDULER is None:
            _SCHEDULER = SessionEvolutionScheduler(
                max_pending=_parse_int_env("COPAW_EVOLUTION_MAX_PENDING", 2000),
                max_retries=_parse_int_env("COPAW_EVOLUTION_MAX_RETRIES", 3),
                retry_base_seconds=_parse_int_env("COPAW_EVOLUTION_RETRY_BASE_SECONDS", 8),
                retry_max_seconds=_parse_int_env("COPAW_EVOLUTION_RETRY_MAX_SECONDS", 60),
                idle_poll_seconds=_parse_float_env("COPAW_EVOLUTION_IDLE_POLL_SECONDS", 0.5),
            )
            await _SCHEDULER.start()
        elif not _SCHEDULER._loop_task or _SCHEDULER._loop_task.done():
            await _SCHEDULER.start()
        return _SCHEDULER


async def start_session_evolution_scheduler() -> None:
    await get_session_evolution_scheduler()


async def stop_session_evolution_scheduler() -> None:
    global _SCHEDULER
    async with _SCHEDULER_LOCK:
        scheduler = _SCHEDULER
        _SCHEDULER = None
    if scheduler is not None:
        await scheduler.stop()


async def get_session_evolution_scheduler_status() -> Dict[str, Any]:
    scheduler = await get_session_evolution_scheduler()
    return await scheduler.status()
