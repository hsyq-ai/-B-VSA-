# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import os
import logging
import re
import uuid
from typing import Any

from ..constant import WORKING_DIR
from .agent_os_store import AgentOSStore
from .auth_db import (
    get_active_user_directory,
    get_active_user_names,
    get_active_users,
    get_user_context_by_user_id,
    get_user_name_by_id_or_profile_id,
    get_users_by_name,
    parse_notify_command,
)
from .message_queue_store import MessageQueueStore
from ..agents.notification_llm import detect_notify_intent, rewrite_notification_message
from .sandbox_manager import ensure_employee_sandbox_started
from .event_logger import log_event
from .agent_os_projection import project_agent_os_event

logger = logging.getLogger(__name__)
EVENT_BUS_FILE = WORKING_DIR / "event_bus.md"
_EVENT_BUS_WRITE_LOCK = asyncio.Lock()


def _normalize_name(name: str) -> str:
    cleaned = re.sub(r"[（(].*?[）)]", "", str(name or ""))
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned.strip()


def _resolve_target_user(target_user: str) -> tuple[str, str] | None:
    if not target_user:
        return None
    users = get_users_by_name(str(target_user))
    if len(users) == 1:
        return str(users[0]["id"]), str(users[0]["name"])
    if len(users) > 1:
        return str(users[0]["id"]), str(users[0]["name"])
    normalized = _normalize_name(target_user)
    if not normalized:
        return None
    matches: list[tuple[str, str]] = []
    for row in get_active_users():
        name = str(row["name"] or "")
        norm = _normalize_name(name)
        if not norm:
            continue
        if normalized in norm or norm in normalized:
            matches.append((str(row["id"]), name))
    if len(matches) == 1:
        return matches[0]
    if matches:
        return matches[0]
    return None


async def _ensure_direct_chat(
    *,
    chat_manager: Any,
    owner_user_id: str,
    owner_user_name: str,
    peer_user_id: str,
    peer_user_name: str,
) -> tuple[str, str, str] | None:
    if not chat_manager or not owner_user_id or not peer_user_id:
        return None
    low, high = sorted([str(owner_user_id), str(peer_user_id)])
    session_id = f"console:dm:{low}:{high}"
    display_name = f"{peer_user_name} ↔ {owner_user_name}"
    try:
        spec = await chat_manager.get_or_create_chat(
            session_id=session_id,
            user_id=str(owner_user_id),
            channel="console",
            name=display_name,
        )
        # Keep display name updated when users rename / aliases change.
        if str(getattr(spec, "name", "") or "") != display_name:
            spec.name = display_name
            await chat_manager.update_chat(spec)
        return str(spec.id), session_id, display_name
    except Exception:
        logger.exception(
            "Failed to ensure direct chat owner=%s peer=%s",
            owner_user_id,
            peer_user_id,
        )
        return None


def _build_notification_thread_keys(
    *,
    task_id: str,
    source_user_id: str,
    target_user_id: str,
) -> tuple[str, str]:
    if task_id:
        key = f"notif:{task_id}"
        return key, f"console:notif:{task_id}"
    low, high = sorted([str(source_user_id or ""), str(target_user_id or "")])
    pair_key = f"{low}:{high}".strip(":")
    if not pair_key:
        pair_key = str(uuid.uuid4())
    return pair_key, f"console:dm:{pair_key}"


async def append_notification_task(
    *,
    source_user_name: str,
    source_user_id: str = "",
    target_user_name: str,
    message_content: str,
    already_rewritten: bool,
) -> str:
    task_id = str(uuid.uuid4())
    payload = message_content
    if already_rewritten:
        payload = f"【已改写】{message_content}"
    line = (
        f"- [ ] @通知Agent: 用户 @{source_user_name} 请 @{target_user_name} "
        f"{payload} <!--task_id:{task_id}-->\n"
    )
    if os.getenv("COPAW_EVENT_CONSUMER", "").strip() == "1":
        log_event(
            event_type="agent_task",
            actor_user_id=str(source_user_id or ""),
            session_id="",
            payload={
                "agent_name": "@通知Agent",
                "task_line": line.strip(),
                "task_id": task_id,
                "source_user_name": source_user_name,
                "target_user_name": target_user_name,
            },
            summary=f"调度任务：@通知Agent {target_user_name}",
            intent_tag="agent.task",
            source="event_stream",
        )
    else:
        async with _EVENT_BUS_WRITE_LOCK:
            EVENT_BUS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(EVENT_BUS_FILE, "a", encoding="utf-8") as f:
                f.write(line)
    logger.info(
        "Notification task appended",
        extra={
            "task_id": task_id,
            "source_user_name": source_user_name,
            "target_user_name": target_user_name,
        },
    )
    return task_id


async def dispatch_notify_command(
    *,
    user_message: str,
    current_user_id: str,
    message_store: MessageQueueStore | None = None,
    agent_os_store: AgentOSStore | None = None,
    room_store: Any = None,
    observability_store: Any = None,
    chat_manager: Any = None,
) -> dict[str, Any] | None:
    use_event_consumer = os.getenv("COPAW_EVENT_CONSUMER", "").strip() == "1"
    message_text = str(user_message or "").strip()
    parsed = parse_notify_command(message_text)
    target_users: list[str] = []
    message_content = ""
    intent_hint = "notify"
    if parsed:
        target_users = [parsed[0]]
        message_content = parsed[1]
    else:
        directory = get_active_user_directory()
        dept_names = sorted(
            {
                str(item.get("department") or "").strip()
                for item in directory
                if str(item.get("department") or "").strip()
            },
        )
        intent = await detect_notify_intent(
            message_text,
            user_directory=directory,
            department_names=dept_names,
        )
        if not intent or not intent.get("is_notify"):
            return None
        intent_hint = str(intent.get("intent") or "notify")
        message_content = str(intent.get("content") or "").strip() or message_text
        raw_targets = intent.get("targets") or []
        if isinstance(raw_targets, dict):
            raw_targets = [raw_targets]
        if isinstance(raw_targets, list):
            for item in raw_targets:
                if not isinstance(item, dict):
                    continue
                name = str(item.get("name") or "").strip()
                dept = str(item.get("department") or "").strip()
                if name:
                    target_users.append(name)
                elif dept:
                    dept_users = [
                        str(u.get("name") or "").strip()
                        for u in directory
                        if str(u.get("department") or "").strip() == dept
                    ]
                    target_users.extend([u for u in dept_users if u])
        target_users = [t for t in target_users if t]
        if not target_users:
            return {
                "task_id": "",
                "target_user": "",
                "message_content": message_content,
                "confirmation": "我可以帮你直接把通知发出去，但还没识别到接收人。你希望通知谁？可以说姓名或部门，我来帮你发。",
                "delivered": False,
                "needs_clarification": True,
                "intent": intent_hint,
            }

    if not message_content:
        return None
    current_user_name = get_user_name_by_id_or_profile_id(str(current_user_id))
    async def _dispatch_to_target(target_user: str) -> dict[str, Any]:
        task_id = await append_notification_task(
            source_user_name=current_user_name,
            source_user_id=str(current_user_id),
            target_user_name=target_user,
            message_content=message_content,
            already_rewritten=False,
        )
        log_event(
            event_type="notification",
            actor_user_id=str(current_user_id),
            session_id="",
            payload={
                "target_user": target_user,
                "text": message_content,
                "mode": "notify",
                "task_id": task_id,
                "intent": intent_hint,
            },
            summary=f"通知 {target_user}：{message_content[:120]}",
            intent_tag="notify.send",
            source="console:notify",
        )
        delivered = False
        target_user_id = ""
        resolved_target_name = target_user
        resolved = _resolve_target_user(target_user)
        if resolved:
            target_user_id, resolved_target_name = resolved
        if (not use_event_consumer) and target_user_id:
            from_agent_id = f"pia:{current_user_id}"
            to_agent_id = f"pia:{target_user_id}"
            text = f"来自 {current_user_name} 的通知：{message_content}"
            try:
                target_ctx = get_user_context_by_user_id(str(target_user_id)) or {}
                await ensure_employee_sandbox_started(
                    user_id=str(target_user_id),
                    profile_id=str(target_ctx.get("profile_id") or ""),
                    user_name=str(target_ctx.get("user_name") or resolved_target_name or ""),
                )
                rewritten = await rewrite_notification_message(
                    source_user_name=current_user_name,
                    target_user_name=resolved_target_name,
                    raw_message=message_content,
                )
                if rewritten:
                    text = rewritten
            except Exception:
                logger.exception("Failed to rewrite notification message")
            conversation_key, chat_session_id = _build_notification_thread_keys(
                task_id=task_id,
                source_user_id=str(current_user_id),
                target_user_id=target_user_id,
            )
            chat_id = ""
            payload = {
                "text": text,
                "source_user_id": str(current_user_id),
                "source_user_name": current_user_name,
                "message_id": task_id,
                "trace_id": task_id,
                "intent_type": "notify.send",
                "source_agent_id": from_agent_id,
                "target_agent_id": to_agent_id,
                "message_summary": message_content[:400],
                "push_chat_id": chat_id,
                "push_session_id": chat_session_id,
                "push_conversation_key": conversation_key,
            }
            try:
                if agent_os_store is not None:
                    agent_os_store.append_agent_outbox_entry(
                        from_agent_id,
                        {
                            "mailbox_id": task_id,
                            "title": f"通知发给 {resolved_target_name}",
                            "intent": "notify.send",
                            "status": "sent",
                            "from_agent_id": from_agent_id,
                            "to_agent_id": to_agent_id,
                            "source_user_id": str(current_user_id),
                            "source_user_name": current_user_name,
                            "task_id": task_id,
                            "trace_id": task_id,
                            "conversation_key": conversation_key,
                            "summary": message_content[:400],
                            "text": text,
                        },
                    )
                    agent_os_store.append_agent_inbox_entry(
                        to_agent_id,
                        {
                            "mailbox_id": task_id,
                            "title": f"来自 {current_user_name} 的通知",
                            "intent": "notify.send",
                            "status": "pending",
                            "from_agent_id": from_agent_id,
                            "to_agent_id": to_agent_id,
                            "source_user_id": str(current_user_id),
                            "source_user_name": current_user_name,
                            "task_id": task_id,
                            "trace_id": task_id,
                            "conversation_key": conversation_key,
                            "summary": message_content[:400],
                            "text": text,
                        },
                    )
                if message_store is not None:
                    message_store.enqueue_message(target_user_id, payload)
                    message_store.record_event(
                        status="notify_dispatch",
                        user_id=target_user_id,
                        source_user_name=current_user_name,
                        target_user_name=resolved_target_name,
                        detail="direct notify dispatch",
                        task_id=task_id,
                        trace_id=task_id,
                        conversation_key=conversation_key,
                        route_result="routed",
                    )
                project_agent_os_event(
                    room_store=room_store,
                    observability_store=observability_store,
                    owner_user_id=str(current_user_id),
                    event_type="notify.dispatched",
                    summary=f"通知已发送给 {resolved_target_name}",
                    room_key=conversation_key,
                    room_title=f"通知协作：{resolved_target_name}",
                    room_type="notify",
                    trace_id=task_id,
                    session_id=chat_session_id,
                    actor_user_id=str(current_user_id),
                    actor_user_name=current_user_name,
                    actor_agent_id=from_agent_id,
                    target_user_id=target_user_id,
                    target_user_name=resolved_target_name,
                    target_agent_id=to_agent_id,
                    trace_status="routed",
                    payload={
                        "task_id": task_id,
                        "text": text,
                        "message_summary": message_content[:400],
                        "intent": "notify.send",
                    },
                    room_metadata={
                        "conversation_key": conversation_key,
                        "notification_mode": "notify.send",
                    },
                )
                delivered = True
            except Exception:
                logger.exception("Failed to enqueue notify message to user %s", target_user_id)
        return {
            "task_id": task_id,
            "target_user": target_user,
            "message_content": message_content,
            "resolved_target_name": resolved_target_name,
            "delivered": delivered,
        }

    results = []
    seen_targets: set[str] = set()
    for target_user in target_users:
        if not target_user or target_user in seen_targets:
            continue
        seen_targets.add(target_user)
        results.append(await _dispatch_to_target(target_user))
    if not results:
        return None

    preview = message_content[:40] + ("..." if len(message_content) > 40 else "")
    target_names = [r.get("resolved_target_name") or r.get("target_user") for r in results]
    target_names = [t for t in target_names if t]
    delivered_any = any(r.get("delivered") for r in results)
    if use_event_consumer:
        delivered_note = "（已进入调度队列）"
    else:
        delivered_note = "（已投递到对方新会话）" if delivered_any else ""
    if len(target_names) == 1:
        confirmation = (
            f"明白了～我这就把提醒转给{target_names[0]}：{preview}{delivered_note}。"
            "如需我再润色成更礼貌的口吻，也可以继续告诉我。"
        )
    else:
        confirmation = (
            f"好的，我已把通知发给{', '.join(target_names)}（共{len(target_names)}人）{delivered_note}。"
            "需要我再补一版更正式的措辞也可以告诉我。"
        )
    first = results[0]
    return {
        "task_id": first.get("task_id", ""),
        "target_user": ",".join(target_names),
        "message_content": message_content,
        "confirmation": confirmation,
        "source_user_name": current_user_name,
        "delivered": delivered_any,
        "intent": intent_hint,
    }


async def dispatch_reply_forward(
    *,
    current_user_id: str,
    current_user_name: str,
    target_user_name: str,
    rewritten_message: str,
    message_store: MessageQueueStore | None = None,
    agent_os_store: AgentOSStore | None = None,
    room_store: Any = None,
    observability_store: Any = None,
    chat_manager: Any = None,
) -> dict[str, Any]:
    use_event_consumer = os.getenv("COPAW_EVENT_CONSUMER", "").strip() == "1"
    task_id = await append_notification_task(
        source_user_name=current_user_name,
        source_user_id=str(current_user_id),
        target_user_name=target_user_name,
        message_content=rewritten_message,
        already_rewritten=True,
    )
    log_event(
        event_type="notification",
        actor_user_id=str(current_user_id),
        session_id="",
        payload={
            "target_user": target_user_name,
            "text": rewritten_message,
            "mode": "reply_forward",
            "task_id": task_id,
        },
        summary=f"回复转发 {target_user_name}：{rewritten_message[:120]}",
        intent_tag="notify.reply_forward",
        source="console:notify",
    )
    delivered = False
    target_user_id = ""
    resolved_target_name = target_user_name
    resolved = _resolve_target_user(target_user_name)
    if resolved:
        target_user_id, resolved_target_name = resolved
    if (not use_event_consumer) and target_user_id:
        from_agent_id = f"pia:{current_user_id}"
        to_agent_id = f"pia:{target_user_id}"
        conversation_key, chat_session_id = _build_notification_thread_keys(
            task_id=task_id,
            source_user_id=str(current_user_id),
            target_user_id=target_user_id,
        )
        chat_id = ""
        payload = {
            "text": rewritten_message,
            "source_user_id": str(current_user_id),
            "source_user_name": current_user_name,
            "message_id": task_id,
            "trace_id": task_id,
            "intent_type": "notify.reply_forward",
            "source_agent_id": from_agent_id,
            "target_agent_id": to_agent_id,
            "message_summary": rewritten_message[:400],
            "push_chat_id": chat_id,
            "push_session_id": chat_session_id,
            "push_conversation_key": conversation_key,
        }
        try:
            target_ctx = get_user_context_by_user_id(str(target_user_id)) or {}
            await ensure_employee_sandbox_started(
                user_id=str(target_user_id),
                profile_id=str(target_ctx.get("profile_id") or ""),
                user_name=str(target_ctx.get("user_name") or resolved_target_name or ""),
            )
            if agent_os_store is not None:
                agent_os_store.append_agent_outbox_entry(
                    from_agent_id,
                    {
                        "mailbox_id": task_id,
                        "title": f"回复转发给 {resolved_target_name}",
                        "intent": "notify.reply_forward",
                        "status": "sent",
                        "from_agent_id": from_agent_id,
                        "to_agent_id": to_agent_id,
                        "source_user_id": str(current_user_id),
                        "source_user_name": current_user_name,
                        "task_id": task_id,
                        "trace_id": task_id,
                        "conversation_key": conversation_key,
                        "summary": rewritten_message[:400],
                        "text": rewritten_message,
                    },
                )
                agent_os_store.append_agent_inbox_entry(
                    to_agent_id,
                    {
                        "mailbox_id": task_id,
                        "title": f"来自 {current_user_name} 的回复",
                        "intent": "notify.reply_forward",
                        "status": "pending",
                        "from_agent_id": from_agent_id,
                        "to_agent_id": to_agent_id,
                        "source_user_id": str(current_user_id),
                        "source_user_name": current_user_name,
                        "task_id": task_id,
                        "trace_id": task_id,
                        "conversation_key": conversation_key,
                        "summary": rewritten_message[:400],
                        "text": rewritten_message,
                    },
                )
            if message_store is not None:
                message_store.enqueue_message(target_user_id, payload)
                message_store.record_event(
                    status="reply_forward",
                    user_id=target_user_id,
                    source_user_name=current_user_name,
                    target_user_name=resolved_target_name,
                    detail="reply forward dispatch",
                    task_id=task_id,
                    trace_id=task_id,
                    conversation_key=conversation_key,
                    route_result="routed",
                )
            project_agent_os_event(
                room_store=room_store,
                observability_store=observability_store,
                owner_user_id=str(current_user_id),
                event_type="notify.reply_forwarded",
                summary=f"回复已转发给 {resolved_target_name}",
                room_key=conversation_key,
                room_title=f"通知协作：{resolved_target_name}",
                room_type="notify",
                trace_id=task_id,
                session_id=chat_session_id,
                actor_user_id=str(current_user_id),
                actor_user_name=current_user_name,
                actor_agent_id=from_agent_id,
                target_user_id=target_user_id,
                target_user_name=resolved_target_name,
                target_agent_id=to_agent_id,
                trace_status="routed",
                payload={
                    "task_id": task_id,
                    "text": rewritten_message,
                    "intent": "notify.reply_forward",
                },
                room_metadata={
                    "conversation_key": conversation_key,
                    "notification_mode": "notify.reply_forward",
                },
            )
            delivered = True
        except Exception:
            logger.exception("Failed to enqueue reply forward to user %s", target_user_id)
    delivered_note = "（已投递到对方新会话）" if delivered else ""
    confirmation = (
        f"收到，我会把你的回复转达给{target_user_name}{delivered_note}。"
        "如果你愿意，我还可以帮你补一版更正式的措辞。"
    )
    return {
        "task_id": task_id,
        "target_user": target_user_name,
        "confirmation": confirmation,
        "delivered": delivered,
    }


def build_notify_target_hint() -> str:
    active_users = get_active_user_names()
    name_hint = "、".join(active_users[:5]) if active_users else "暂无可用用户名"
    return (
        "我可以帮你把通知发出去，但还没识别到接收人。"
        f"你可以直接说姓名或部门，比如：通知 {name_hint} …，我来帮你发。"
    )
