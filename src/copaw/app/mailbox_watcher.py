# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..constant import WORKING_DIR
from ..agents.notification_llm import draft_mailbox_auto_reply
from .agent_os_projection import project_agent_os_event

logger = logging.getLogger(__name__)

_POLL_INTERVAL_ENV = "COPAW_MAILBOX_WATCHER_POLL_SECONDS"
_ENABLE_ENV = "COPAW_MAILBOX_WATCHER"


def _env_enabled(value: str | None, *, default: bool = True) -> bool:
    if value is None:
        return default
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def should_start_mailbox_watcher() -> bool:
    """Return True when the current process should watch its own mailbox."""
    role = str(os.getenv("AGENT_ROLE", "")).strip().lower()
    if role in {"so", "employee"}:
        return _env_enabled(os.getenv(_ENABLE_ENV), default=True)
    # 主机进程（无 AGENT_ROLE）也可以启动超级观察者模式
    # 条件：环境变量显式启用 OR 存在 agent_os_runtime 目录
    if _env_enabled(os.getenv(_ENABLE_ENV), default=False):
        return True
    # 自动检测：如果 working dir 下有 agent_os_runtime，说明是主机进程
    runtime_dir = WORKING_DIR / "agent_os_runtime"
    if runtime_dir.exists():
        return True
    return False


def current_agent_identity() -> dict[str, str]:
    role = str(os.getenv("AGENT_ROLE", "")).strip().lower()
    owner_user_id = str(os.getenv("OWNER_USER_ID", "")).strip()
    agent_id = str(os.getenv("COPAW_AGENT_ID", "")).strip()
    if not agent_id:
        if role == "so":
            agent_id = "so:enterprise"
            owner_user_id = owner_user_id or "system"
        elif role == "employee":
            agent_id = f"pia:{owner_user_id}" if owner_user_id else ""
        else:
            # 主机进程（超级观察者模式）：监控所有用户的 inbox
            agent_id = "so:enterprise"
            owner_user_id = owner_user_id or "system"
            role = "so"
    return {
        "agent_id": agent_id,
        "agent_role": role,
        "owner_user_id": owner_user_id,
    }


@dataclass(slots=True)
class _WatcherState:
    inbox_offset: int = 0
    last_inbox_size: int = 0


class MailboxWatcher:
    def __init__(
        self,
        *,
        app,
        agent_os_store,
        message_store=None,
        agent_id: str,
        owner_user_id: str,
        agent_role: str,
        poll_interval: float = 1.5,
    ) -> None:
        self._app = app
        self._agent_os_store = agent_os_store
        self._message_store = message_store
        self._agent_id = str(agent_id or "").strip()
        self._owner_user_id = str(owner_user_id or "").strip()
        self._agent_role = str(agent_role or "").strip().lower()
        self._poll_interval = max(float(poll_interval or 0), 0.5)
        self._stop_event = asyncio.Event()
        self._state = _WatcherState()
        self._mailbox: dict[str, Any] | None = None
        self._mailbox_root = self._resolve_mailbox_root()
        self._state_path = self._mailbox_root / ".watcher_state.json"

    _SHARED_MOUNT = Path("/app/agent_os_shared")

    def _resolve_mailbox_root(self) -> Path:
        # 优先检查容器共享挂载（主机进程的 agent_os_runtime 只读映射）
        if self._SHARED_MOUNT.exists() and self._owner_user_id:
            shared_user_mailbox = self._SHARED_MOUNT / str(self._owner_user_id) / "mailbox"
            if shared_user_mailbox.exists():
                logger.info(
                    "Using shared mailbox mount for user=%s: %s",
                    self._owner_user_id,
                    shared_user_mailbox,
                )
                return shared_user_mailbox
        # fallback: 默认 working 目录下的 mailbox
        return WORKING_DIR / "mailbox"

    def _load_state(self) -> None:
        try:
            if self._state_path.exists():
                data = json.loads(self._state_path.read_text(encoding="utf-8"))
                self._state.inbox_offset = int(data.get("inbox_offset") or 0)
                self._state.last_inbox_size = int(data.get("last_inbox_size") or 0)
        except Exception:
            logger.debug("Failed to load mailbox watcher state", exc_info=True)

    def _save_state(self, *, inbox_offset: int, inbox_size: int) -> None:
        try:
            self._state_path.parent.mkdir(parents=True, exist_ok=True)
            self._state_path.write_text(
                json.dumps(
                    {
                        "agent_id": self._agent_id,
                        "owner_user_id": self._owner_user_id,
                        "agent_role": self._agent_role,
                        "inbox_offset": int(inbox_offset),
                        "last_inbox_size": int(inbox_size),
                    },
                    ensure_ascii=False,
                ),
                encoding="utf-8",
            )
        except Exception:
            logger.debug("Failed to save mailbox watcher state", exc_info=True)

    def _ensure_mailbox(self) -> dict[str, Any] | None:
        if self._mailbox is not None:
            return self._mailbox
        if not self._agent_os_store or not self._agent_id:
            return None
        try:
            mailbox = self._agent_os_store.ensure_agent_mailbox(self._agent_id)
        except Exception:
            logger.exception("Failed to ensure mailbox for %s", self._agent_id)
            return None
        self._mailbox = mailbox
        return mailbox

    def _source_name(self, envelope: dict[str, Any]) -> str:
        source_name = str(envelope.get("source_user_name") or "").strip()
        if source_name:
            return source_name
        source_agent_id = str(envelope.get("from_agent_id") or envelope.get("source_agent_id") or "").strip()
        if source_agent_id == "so:enterprise":
            return "系统Agent"
        if source_agent_id.startswith("pia:"):
            return f"虚拟员工{source_agent_id.split(':', 1)[1]}"
        if source_agent_id:
            return source_agent_id
        return "系统"

    def _target_user_name(self) -> str:
        if self._agent_role == "so":
            return "系统Agent"
        if self._agent_role == "employee" and self._owner_user_id:
            return f"员工{self._owner_user_id}"
        return "Agent"

    def _agent_display_name(self) -> str:
        if self._agent_role == "so":
            return "系统Agent"
        if self._agent_role == "employee" and self._owner_user_id:
            return f"员工{self._owner_user_id} 的数字分身"
        if self._agent_id:
            return self._agent_id
        return "Agent"

    def _summary_text(self, envelope: dict[str, Any]) -> str:
        title = str(envelope.get("title") or envelope.get("intent") or "新任务").strip()
        summary = str(envelope.get("summary") or envelope.get("text") or "").strip()
        source_name = self._source_name(envelope)
        intent = str(envelope.get("intent") or "").strip()
        prefix = f"【新收件】{title}"
        if source_name:
            prefix = f"【新收件】来自 {source_name} 的 {title}"
        if summary:
            return f"{prefix}\n{summary}"
        if intent:
            return f"{prefix}\n意图：{intent}"
        return prefix

    async def _build_auto_reply(self, envelope: dict[str, Any]) -> str:
        title = str(envelope.get("title") or envelope.get("intent") or "新任务").strip()
        text = str(envelope.get("text") or envelope.get("summary") or "").strip()
        source_name = self._source_name(envelope)
        target_name = self._target_user_name()
        intent = str(envelope.get("intent") or "").strip()
        scene_label = str(envelope.get("scene_label") or envelope.get("title") or "").strip()
        scene_prompt = str(envelope.get("scene_prompt") or envelope.get("prompt") or "").strip()
        return await draft_mailbox_auto_reply(
            source_user_name=source_name,
            target_agent_name=target_name,
            title=title,
            raw_message=text,
            intent=intent,
            scene_label=scene_label,
            scene_prompt=scene_prompt,
        )

    def _should_auto_reply(self, envelope: dict[str, Any]) -> bool:
        intent = str(envelope.get("intent") or envelope.get("intent_type") or "").strip()
        if not intent:
            return True
        if intent in {"mailbox.auto_reply", "scene.agent_link.summary"}:
            return False
        if intent.startswith("mailbox.ack") or intent.startswith("mailbox.receipt"):
            return False
        return True

    def _append_peer_mailbox_entry(
        self,
        *,
        agent_id: str,
        direction: str,
        envelope: dict[str, Any],
    ) -> None:
        if not self._agent_os_store or not agent_id:
            return
        try:
            if direction == "inbox":
                self._agent_os_store.append_agent_inbox_entry(agent_id, envelope)
            elif direction == "outbox":
                self._agent_os_store.append_agent_outbox_entry(agent_id, envelope)
            elif direction == "tasks":
                self._agent_os_store.append_agent_task_entry(agent_id, envelope)
            elif direction == "receipts":
                self._agent_os_store.append_agent_receipt_entry(agent_id, envelope)
        except Exception:
            logger.exception("Failed to append peer mailbox entry for %s", agent_id)

    async def _emit_followup_reply(
        self,
        envelope: dict[str, Any],
        *,
        reply_text: str,
    ) -> None:
        if not reply_text:
            return
        source_user_id = str(envelope.get("source_user_id") or "").strip()
        source_agent_id = str(envelope.get("from_agent_id") or envelope.get("source_agent_id") or "").strip()
        if not source_user_id and not source_agent_id:
            return
        source_name = str(envelope.get("source_user_name") or "").strip() or self._source_name(envelope)
        source_target_name = source_name or "发起方"
        reply_id = str(uuid.uuid4())
        conversation_key = str(envelope.get("conversation_key") or f"mailbox:{self._agent_id}:{reply_id}")
        reply_payload = {
            "text": reply_text,
            "source_user_id": self._owner_user_id,
            "source_user_name": self._agent_display_name(),
            "message_id": reply_id,
            "trace_id": str(envelope.get("trace_id") or reply_id),
            "intent_type": "mailbox.auto_reply",
            "source_agent_id": self._agent_id,
            "target_agent_id": source_agent_id or f"pia:{source_user_id}",
            "push_conversation_key": conversation_key,
            "push_session_id": f"console:mailbox:{conversation_key}:reply",
            "push_chat_id": f"mailbox-reply:{self._agent_id}:{reply_id}",
            "message_summary": reply_text[:400],
        }
        source_agent = source_agent_id or (f"pia:{source_user_id}" if source_user_id else "")
        if source_agent:
            self._append_peer_mailbox_entry(
                agent_id=source_agent,
                direction="inbox",
                envelope={
                    "mailbox_id": reply_id,
                    "title": f"来自 {self._agent_display_name()} 的自动回执",
                    "intent": "mailbox.auto_reply",
                    "status": "pending",
                    "from_agent_id": self._agent_id,
                    "to_agent_id": source_agent,
                    "source_user_id": self._owner_user_id,
                    "source_user_name": self._agent_display_name(),
                    "task_id": envelope.get("task_id") or envelope.get("mailbox_id") or reply_id,
                    "trace_id": str(envelope.get("trace_id") or reply_id),
                    "conversation_key": conversation_key,
                    "summary": reply_text[:400],
                    "text": reply_text,
                },
            )
            self._append_peer_mailbox_entry(
                agent_id=source_agent,
                direction="outbox",
                envelope={
                    "mailbox_id": reply_id,
                    "title": f"自动回执给 {source_target_name}",
                    "intent": "mailbox.auto_reply",
                    "status": "sent",
                    "from_agent_id": self._agent_id,
                    "to_agent_id": source_agent,
                    "source_user_id": self._owner_user_id,
                    "source_user_name": self._agent_display_name(),
                    "task_id": envelope.get("task_id") or envelope.get("mailbox_id") or reply_id,
                    "trace_id": str(envelope.get("trace_id") or reply_id),
                    "conversation_key": conversation_key,
                    "summary": reply_text[:400],
                    "text": reply_text,
                },
            )
        if self._message_store is None:
            return
        try:
            self._message_store.enqueue_message(source_user_id or self._owner_user_id, reply_payload)
            self._message_store.record_event(
                status="mailbox_reply",
                user_id=source_user_id or self._owner_user_id,
                source_user_name=self._agent_display_name(),
                target_user_name=source_target_name,
                detail=reply_text[:300],
                task_id=reply_id,
                trace_id=str(envelope.get("trace_id") or reply_id),
                conversation_key=conversation_key,
                route_result="mailbox_replied",
            )
            project_agent_os_event(
                app=self._app,
                owner_user_id=source_user_id or self._owner_user_id,
                event_type="mailbox.auto_reply",
                summary=f"{self._agent_display_name()} 已发送自动回执",
                room_key=conversation_key,
                room_title=str(envelope.get("title") or "邮箱协作"),
                room_type="mailbox",
                trace_id=str(envelope.get("trace_id") or reply_id),
                session_id=str(reply_payload.get("push_session_id") or ""),
                actor_user_id=self._owner_user_id,
                actor_user_name=self._agent_display_name(),
                actor_agent_id=self._agent_id,
                target_user_id=source_user_id,
                target_user_name=source_target_name,
                target_agent_id=source_agent,
                trace_status="mailbox_replied",
                payload={
                    "mailbox_id": reply_id,
                    "intent": "mailbox.auto_reply",
                    "summary": reply_text[:400],
                    "text": reply_text,
                },
                room_metadata={
                    "conversation_key": conversation_key,
                    "mailbox_mode": "auto_reply",
                },
            )
        except Exception:
            logger.exception("Failed to enqueue auto reply for %s", self._agent_id)

    def _append_receipt(self, envelope: dict[str, Any], *, status: str, note: str) -> None:
        if not self._agent_os_store or not self._agent_id:
            return
        try:
            self._agent_os_store.append_agent_receipt_entry(
                self._agent_id,
                {
                    "mailbox_id": envelope.get("mailbox_id") or str(uuid.uuid4()),
                    "title": str(envelope.get("title") or "收件回执"),
                    "intent": str(envelope.get("intent") or ""),
                    "status": status,
                    "from_agent_id": envelope.get("from_agent_id") or envelope.get("source_agent_id") or "",
                    "to_agent_id": envelope.get("to_agent_id") or self._agent_id,
                    "task_id": envelope.get("task_id") or envelope.get("mailbox_id") or "",
                    "trace_id": envelope.get("trace_id") or "",
                    "conversation_key": envelope.get("conversation_key") or "",
                    "summary": note,
                    "text": str(envelope.get("text") or ""),
                },
            )
        except Exception:
            logger.exception("Failed to append receipt for %s", self._agent_id)

    def _append_task(self, envelope: dict[str, Any], *, status: str, note: str) -> None:
        if not self._agent_os_store or not self._agent_id:
            return
        try:
            self._agent_os_store.append_agent_task_entry(
                self._agent_id,
                {
                    "mailbox_id": envelope.get("mailbox_id") or str(uuid.uuid4()),
                    "title": str(envelope.get("title") or "任务"),
                    "intent": str(envelope.get("intent") or ""),
                    "status": status,
                    "from_agent_id": envelope.get("from_agent_id") or envelope.get("source_agent_id") or "",
                    "to_agent_id": envelope.get("to_agent_id") or self._agent_id,
                    "task_id": envelope.get("task_id") or envelope.get("mailbox_id") or "",
                    "trace_id": envelope.get("trace_id") or "",
                    "conversation_key": envelope.get("conversation_key") or "",
                    "summary": note,
                    "text": str(envelope.get("text") or ""),
                },
            )
        except Exception:
            logger.exception("Failed to append task entry for %s", self._agent_id)

    async def _emit_push_message(self, envelope: dict[str, Any], *, note: str) -> None:
        if self._message_store is None or not self._owner_user_id:
            return
        message_id = str(envelope.get("mailbox_id") or envelope.get("task_id") or uuid.uuid4())
        trace_id = str(envelope.get("trace_id") or message_id)
        conversation_key = str(envelope.get("conversation_key") or f"mailbox:{self._agent_id}:{message_id}")
        source_agent_id = str(envelope.get("from_agent_id") or envelope.get("source_agent_id") or "")
        target_agent_id = str(envelope.get("to_agent_id") or self._agent_id)
        payload = {
            "text": note,
            "source_user_id": str(envelope.get("source_user_id") or ""),
            "source_user_name": self._source_name(envelope),
            "message_id": message_id,
            "trace_id": trace_id,
            "intent_type": str(envelope.get("intent") or "mailbox.inbox"),
            "source_agent_id": source_agent_id,
            "target_agent_id": target_agent_id,
            "push_conversation_key": conversation_key,
            "push_session_id": f"console:mailbox:{conversation_key}",
            "push_chat_id": f"mailbox:{self._agent_id}:{message_id}",
            "message_summary": note[:400],
        }
        try:
            self._message_store.enqueue_message(self._owner_user_id, payload)
            self._message_store.record_event(
                status="mailbox_inbox",
                user_id=self._owner_user_id,
                source_user_name=self._source_name(envelope),
                target_user_name=self._target_user_name(),
                detail=note[:300],
                task_id=message_id,
                trace_id=trace_id,
                conversation_key=conversation_key,
                route_result="mailbox_routed",
            )
            project_agent_os_event(
                app=self._app,
                owner_user_id=str(envelope.get("source_user_id") or self._owner_user_id),
                event_type="mailbox.inbox",
                summary=note[:300] or "收到新的邮箱消息",
                room_key=conversation_key,
                room_title=str(envelope.get("title") or "邮箱协作"),
                room_type="mailbox",
                trace_id=trace_id,
                session_id=str(payload.get("push_session_id") or ""),
                actor_user_id=str(envelope.get("source_user_id") or ""),
                actor_user_name=self._source_name(envelope),
                actor_agent_id=source_agent_id,
                target_user_id=self._owner_user_id,
                target_user_name=self._target_user_name(),
                target_agent_id=target_agent_id,
                trace_status="mailbox_routed",
                payload={
                    "mailbox_id": message_id,
                    "intent": str(envelope.get("intent") or "mailbox.inbox"),
                    "summary": note[:400],
                    "text": str(envelope.get("text") or note),
                },
                room_metadata={
                    "conversation_key": conversation_key,
                    "mailbox_mode": "inbox",
                },
            )
        except Exception:
            logger.exception("Failed to enqueue mailbox push message for %s", self._owner_user_id)

    async def _handle_envelope(self, envelope: dict[str, Any]) -> None:
        mailbox_id = str(envelope.get("mailbox_id") or envelope.get("task_id") or uuid.uuid4())
        envelope["mailbox_id"] = mailbox_id
        envelope.setdefault("status", "pending")
        envelope.setdefault("created_at", envelope.get("created_at") or "")
        note = self._summary_text(envelope)
        self._append_task(envelope, status="queued", note=note)
        self._append_receipt(envelope, status="received", note=note)

        # ---- VSA 任务特殊路径：执行并返回结果，而不是只发回执 ----
        intent = str(envelope.get("intent") or "")
        if intent.startswith("vsa."):
            await self._handle_vsa_task(envelope)
            return

        # 常规 IAP 消息：走原有回执流程
        await self._emit_push_message(envelope, note=note)

        if not self._should_auto_reply(envelope):
            self._append_receipt(envelope, status="acknowledged", note=note)
            return

        auto_reply = await self._build_auto_reply(envelope)
        self._append_receipt(envelope, status="acknowledged", note=auto_reply)
        await self._emit_followup_reply(envelope, reply_text=auto_reply)
        self._append_task(envelope, status="followup_sent", note=auto_reply)

    async def _handle_vsa_task(self, envelope: dict[str, Any]) -> None:
        """消费 VSA 投递的任务：通过 LLM 执行并推送结果。

        与普通回执不同，这里会尝试真正完成任务（写文档、查状态等），
        并把执行结果推回给用户。
        """
        # VSA envelope 的数据结构：任务内容在 text/summary 字段
        # （不是 payload.forward_content，那只在 IAP body 里有）
        payload = envelope.get("payload") or {}
        forward_content = str(
            payload.get("forward_content") or payload.get("content") or ""
        ).strip()
        if not forward_content:
            # 从 text/summary 提取实际任务内容（去掉"任务下发"等前缀）
            raw_text = str(envelope.get("text") or envelope.get("summary") or "").strip()
            # 去掉常见前缀如 "【任务下发】语音秘书转办\n"
            for prefix in ["【任务下发】语音秘书转办", "【任务下发】", "语音秘书转办"]:
                if raw_text.startswith(prefix):
                    raw_text = raw_text[len(prefix):].strip()
            forward_content = raw_text

        function_id = str(payload.get("function_id") or "")
        scene_prompt = str(payload.get("scene_prompt") or payload.get("prompt") or "")
        trace_id = str(envelope.get("trace_id") or "")

        if not forward_content and not scene_prompt:
            logger.info("VSA envelope has no actionable content, skipping: %s", trace_id)
            return

        logger.info(
            "Executing VSA task: function=%s trace=%s user=%s",
            function_id or "(none)",
            trace_id,
            self._owner_user_id,
        )

        # 标记任务为"执行中"
        self._append_task(envelope, status="executing", note=f"[执行中] {forward_content[:200]}")
        self._append_receipt(envelope, status="executing", note="PIA 正在处理 VSA 任务...")

        try:
            result_text = await self._execute_vsa_task(
                forward_content=forward_content,
                function_id=function_id,
                scene_prompt=scene_prompt,
                envelope=envelope,
            )
        except Exception:
            logger.exception("VSA task execution failed: %s", trace_id)
            result_text = f"任务「{forward_content[:100]}」处理遇到问题，我会稍后重试。"

        # 推送执行结果给用户（通过 message_store）
        await self._push_vsa_result(
            envelope=envelope,
            result_text=result_text,
            trace_id=trace_id,
        )

        self._append_task(envelope, status="completed", note=result_text[:400])
        self._append_receipt(envelope, status="completed", note=result_text[:400])
        logger.info("VSA task completed: trace=%s result_len=%d", trace_id, len(result_text))

    async def _execute_vsa_task(
        self,
        *,
        forward_content: str,
        function_id: str,
        scene_prompt: str,
        envelope: dict[str, Any],
    ) -> str:
        """调用 LLM 执行 VSA 投递的具体任务。

        返回执行结果的文字描述（可包含文档内容、数据查询结果等）。
        """
        fallback = (
            f"已收到您的指令：「{forward_content[:150]}」。"
            f"\n\n我正在为您处理{f'【{function_id}】' if function_id else ''}相关事项，"
            f"稍后会把完整结果发送给您。"
        )

        try:
            from ..providers.provider_manager import ProviderManager

            model = ProviderManager.get_active_chat_model()
        except Exception as e:
            logger.warning("VSA task: no active model, using fallback: %s", e)
            return fallback

        target_name = self._target_user_name()
        source_name = self._source_name(envelope)

        prompt = f"""你是企业员工「{target_name}」的数字分身(PIA)。

用户（或语音秘书）刚给你分配了一项任务，请立即执行：

## 任务内容
{forward_content}

## 任务类型
{function_id or '通用任务'}

## 场景提示
{scene_prompt or '无'}

## 要求
1. **直接执行任务**——如果任务是"写文档"，就输出文档内容；如果是"查部门状态"，就给出具体数据；如果是"设提醒"，就确认设置。
2. 输出格式清晰、结构化。
3. 如果任务需要更多信息才能完成，列出需要补充的内容。
4. 用中文回复，语气专业且主动。

请直接输出执行结果："""

        try:
            messages = [{"role": "user", "content": prompt}]

            async def _run() -> str:
                resp = await model(messages, stream=True)
                text = ""
                if hasattr(resp, "__aiter__"):
                    async for chunk in resp:
                        c = getattr(chunk, "content", None)
                        if isinstance(c, str):
                            chunk_text = c
                        elif isinstance(c, list):
                            chunk_text = "".join(
                                b.get("text", "") for b in c
                                if isinstance(b, dict) and b.get("type") == "text"
                            )
                        else:
                            chunk_text = ""
                        if chunk_text:
                            text = chunk_text  # agentscope 每个chunk是累计全文
                return text.strip()

            text = await asyncio.wait_for(_run(), timeout=60)
            return text[:2000] if text else fallback
        except Exception as e:
            logger.warning("VSA task LLM execution failed: %s", e)
            return fallback

    async def _push_vsa_result(
        self,
        *,
        envelope: dict[str, Any],
        result_text: str,
        trace_id: str,
    ) -> None:
        """将 VSA 任务执行结果推送给用户。"""
        if self._message_store is None or not self._owner_user_id:
            return

        mailbox_id = str(envelope.get("mailbox_id") or trace_id)
        conversation_key = str(
            envelope.get("conversation_key") or f"vsa-task:{self._agent_id}:{mailbox_id}"
        )

        payload = {
            "text": result_text,
            "source_user_id": self._owner_user_id,
            "source_user_name": self._agent_display_name(),
            "message_id": str(uuid.uuid4()),
            "trace_id": trace_id,
            "intent_type": "vsa.task_result",
            "source_agent_id": self._agent_id,
            "target_agent_id": str(envelope.get("from_agent_id") or ""),
            "push_conversation_key": conversation_key,
            "push_session_id": f"console:vsa-task:{conversation_key}",
            "push_chat_id": f"vsa-result:{self._agent_id}:{mailbox_id}",
            "message_summary": result_text[:400],
        }

        try:
            self._message_store.enqueue_message(self._owner_user_id, payload)
            self._message_store.record_event(
                status="vsa_task_completed",
                user_id=self._owner_user_id,
                source_user_name=self._agent_display_name(),
                target_user_name=self._source_name(envelope),
                detail=result_text[:300],
                task_id=mailbox_id,
                trace_id=trace_id,
                conversation_key=conversation_key,
                route_result="vsa_executed",
            )
            project_agent_os_event(
                app=self._app,
                owner_user_id=self._owner_user_id,
                event_type="vsa.task_result",
                summary=result_text[:300] or "VSA任务已完成",
                room_key=conversation_key,
                room_title=str(envelope.get("title") or "VSA任务"),
                room_type="vsa_task",
                trace_id=trace_id,
                session_id=str(payload.get("push_session_id") or ""),
                actor_user_id=self._owner_user_id,
                actor_user_name=self._agent_display_name(),
                actor_agent_id=self._agent_id,
                target_user_id=str(envelope.get("source_user_id") or ""),
                target_user_name=self._source_name(envelope),
                target_agent_id=str(envelope.get("from_agent_id") or ""),
                trace_status="vsa_executed",
                payload={
                    "mailbox_id": mailbox_id,
                    "intent": str(envelope.get("intent") or "vsa.voice_command"),
                    "summary": result_text[:400],
                    "text": result_text,
                },
                room_metadata={
                    "conversation_key": conversation_key,
                    "vsa_mode": "task_executed",
                },
            )
        except Exception:
            logger.exception("Failed to push VSA result for %s", self._owner_user_id)

    def _read_inbox_lines(self) -> tuple[list[str], int]:
        # 优先从共享挂载路径读取 inbox
        shared_inbox = self._resolve_shared_inbox_path()
        if shared_inbox is not None:
            return self._read_inbox_from_path(shared_inbox)

        # fallback: 从 agent_os_store 的 mailbox 读取
        mailbox = self._ensure_mailbox()
        if mailbox is None:
            return [], 0
        inbox_path = Path(str(mailbox.get("inbox_jsonl") or self._mailbox_root / "inbox.jsonl"))
        return self._read_inbox_from_path(inbox_path)

    def _resolve_shared_inbox_path(self) -> Path | None:
        """尝试从容器共享挂载解析 inbox.jsonl 路径。"""
        if not self._SHARED_MOUNT.exists() or not self._owner_user_id:
            return None
        shared_inbox = self._SHARED_MOUNT / str(self._owner_user_id) / "mailbox" / "inbox.jsonl"
        if shared_inbox.exists():
            return shared_inbox
        return None

    def _read_inbox_from_path(self, inbox_path: Path) -> tuple[list[str], int]:
        """从指定路径读取 inbox 内容。"""
        inbox_path.parent.mkdir(parents=True, exist_ok=True)
        inbox_path.touch(exist_ok=True)
        file_size = inbox_path.stat().st_size
        offset = self._state.inbox_offset
        if offset > file_size:
            offset = 0
        if offset == 0 and self._state.last_inbox_size == 0:
            # First boot starts from the end to avoid replaying historical backlog.
            offset = file_size
        try:
            with inbox_path.open("r", encoding="utf-8") as f:
                f.seek(offset)
                lines = f.readlines()
                new_offset = f.tell()
        except Exception:
            logger.exception("Failed to read inbox mailbox for %s", self._agent_id)
            return [], file_size
        return lines, new_offset

    def _discover_user_inboxes(self) -> list[tuple[str, Path]]:
        """发现所有用户的 inbox 路径（超级观察者模式用）。

        返回 [(user_id, inbox_path), ...]
        """
        runtime_dir = WORKING_DIR / "agent_os_runtime" / "users"
        if not runtime_dir.exists():
            return []
        results: list[tuple[str, Path]] = []
        try:
            for entry in sorted(runtime_dir.iterdir()):
                if not entry.is_dir():
                    continue
                user_id = entry.name
                # 跳过 vsa 子目录（如 users/7/voice_secretary/）
                inbox = entry / "mailbox" / "inbox.jsonl"
                if inbox.exists() and inbox.stat().st_size > 0:
                    results.append((user_id, inbox))
        except Exception:
            logger.exception("Failed to discover user inboxes")
        return results

    async def run(self) -> None:
        self._load_state()

        # 判断是否为超级观察者模式（主机进程，agent_role=so, 无容器隔离）
        is_super_watcher = self._is_super_watcher_mode()

        if is_super_watcher:
            await self._run_super_watcher()
        else:
            await self._run_single_watcher()

    def _is_super_watcher_mode(self) -> bool:
        """判断是否运行在超级观察者模式（监控所有用户 inbox）。"""
        # 如果 agent_os_runtime/users/ 目录存在，说明是主机进程
        runtime_users = WORKING_DIR / "agent_os_runtime" / "users"
        return self._agent_role == "so" and runtime_users.exists()

    async def _run_super_watcher(self) -> None:
        """超级观察者模式：轮询所有用户的 inbox。"""
        logger.info(
            "Super mailbox watcher started for agent_id=%s — monitoring ALL users",
            self._agent_id,
        )
        # 每个用户维护独立的偏移状态
        user_offsets: dict[str, _WatcherState] = {}
        while not self._stop_event.is_set():
            try:
                user_inboxes = self._discover_user_inboxes()
                for user_id, inbox_path in user_inboxes:
                    if user_id not in user_offsets:
                        user_offsets[user_id] = _WatcherState()
                    await self._poll_user_inbox(
                        user_id=user_id,
                        inbox_path=inbox_path,
                        state=user_offsets[user_id],
                    )
            except Exception:
                logger.exception("Super watcher loop error for %s", self._agent_id)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_interval)
            except asyncio.TimeoutError:
                pass

    async def _poll_user_inbox(
        self,
        *,
        user_id: str,
        inbox_path: Path,
        state: _WatcherState,
    ) -> None:
        """轮询单个用户的 inbox 并处理新消息。"""
        try:
            file_size = inbox_path.stat().st_size
            offset = state.inbox_offset
            if offset > file_size:
                offset = 0
            if offset == 0 and state.last_inbox_size == 0:
                # 首次启动从末尾开始，避免重放历史消息
                offset = file_size
            if offset == file_size:
                state.last_inbox_size = file_size
                return

            lines: list[str] = []
            with inbox_path.open("r", encoding="utf-8") as f:
                f.seek(offset)
                lines = f.readlines()
                new_offset = f.tell()

            for line in lines:
                raw = line.strip()
                if not raw:
                    continue
                try:
                    envelope = json.loads(raw)
                except Exception:
                    logger.warning("Skip malformed envelope for user=%s: %s", user_id, raw[:200])
                    continue
                if not isinstance(envelope, dict):
                    continue

                # 临时切换 owner_user_id 以正确推送结果
                old_owner = self._owner_user_id
                self._owner_user_id = user_id
                try:
                    await self._handle_envelope(envelope)
                finally:
                    self._owner_user_id = old_owner

            state.inbox_offset = new_offset
            state.last_inbox_size = new_offset
        except Exception:
            logger.exception("Failed to poll inbox for user=%s", user_id)

    async def _run_single_watcher(self) -> None:
        """单用户观察者模式（容器内运行）。"""
        mailbox = self._ensure_mailbox()
        if mailbox is None:
            logger.info("Mailbox watcher disabled: no mailbox for %s", self._agent_id or "-")
            return
        logger.info(
            "Mailbox watcher started for agent_id=%s role=%s mailbox_root=%s",
            self._agent_id or "-",
            self._agent_role or "-",
            self._mailbox_root,
        )
        while not self._stop_event.is_set():
            try:
                lines, new_offset = self._read_inbox_lines()
                if lines:
                    for line in lines:
                        raw = line.strip()
                        if not raw:
                            continue
                        try:
                            envelope = json.loads(raw)
                        except Exception:
                            logger.warning(
                                "Skip malformed mailbox envelope for %s: %s",
                                self._agent_id,
                                raw[:200],
                            )
                            continue
                        if not isinstance(envelope, dict):
                            continue
                        await self._handle_envelope(envelope)
                self._state.inbox_offset = new_offset
                self._state.last_inbox_size = new_offset
                self._save_state(inbox_offset=new_offset, inbox_size=new_offset)
            except Exception:
                logger.exception("Mailbox watcher loop error for %s", self._agent_id)
            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._poll_interval)
            except asyncio.TimeoutError:
                pass

    async def stop(self) -> None:
        self._stop_event.set()


def build_mailbox_watcher(app) -> MailboxWatcher | None:
    if not should_start_mailbox_watcher():
        return None
    if app is None:
        return None
    identity = current_agent_identity()
    agent_id = str(identity.get("agent_id") or "").strip()
    if not agent_id:
        return None
    store = getattr(app.state, "agent_os_store", None)
    if store is None:
        return None
    message_store = getattr(app.state, "message_store", None)
    return MailboxWatcher(
        app=app,
        agent_os_store=store,
        message_store=message_store,
        agent_id=agent_id,
        owner_user_id=str(identity.get("owner_user_id") or ""),
        agent_role=str(identity.get("agent_role") or ""),
        poll_interval=float(os.getenv(_POLL_INTERVAL_ENV, "1.5")),
    )
