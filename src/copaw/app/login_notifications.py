# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import re
import uuid
from pathlib import Path
from typing import Any

from ..constant import WORKING_DIR
from .auth_db import get_user_name_by_id_or_profile_id, get_users_by_name
from .message_queue_store import MessageQueueStore
from ..agents.notification_llm import rewrite_notification_message

_TABLE_ROW_RE = re.compile(r"^\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|")
_DETAIL_SENDER_ID_RE = re.compile(r"\*\*发送人\*\*:\s*[^\n]*?user_id:\s*(\d+)", re.IGNORECASE)
_DETAIL_BLOCK_RE = re.compile(r"^###\s+([^\n]+)$")
_DETAIL_STATUS_RE = re.compile(r"\*\*消息状态\*\*:\s*([^\n]+)")
_DETAIL_TRANSITIONS_RE = re.compile(r"\*\*状态流转\*\*:\s*(.*)")
_DETAIL_CONTENT_RE = re.compile(r"\*\*消息内容\*\*:\s*(.*)")

_UNREAD_KEYWORDS = ("待处理", "待转告", "未读")


def _normalize_name(name: str) -> str:
    cleaned = re.sub(r"[（(].*?[）)]", "", str(name or ""))
    cleaned = re.sub(r"\s+", "", cleaned)
    return cleaned.strip()


def _is_unread(status: str) -> bool:
    return any(key in status for key in _UNREAD_KEYWORDS)


def _parse_unread_messages(content: str) -> list[dict[str, Any]]:
    unread: list[dict[str, Any]] = []
    for line in content.splitlines():
        match = _TABLE_ROW_RE.match(line.strip())
        if not match:
            continue
        msg_id, sender, date, msg_content, status = (p.strip() for p in match.groups())
        if msg_id.lower() in {"消息id", "msg_id"}:
            continue
        if not _is_unread(status):
            continue
        unread.append(
            {
                "id": msg_id,
                "sender": sender,
                "date": date,
                "content": msg_content,
                "status": status,
                "sender_id": "",
            },
        )

    if not unread:
        return unread

    # Try to enrich sender_id and details from detail blocks.
    detail_sender_map: dict[str, str] = {}
    detail_text_map: dict[str, str] = {}
    detail_content_map: dict[str, str] = {}
    current_msg_id = ""
    collecting_section = ""
    detail_lines: list[str] = []
    for line in content.splitlines():
        header_match = _DETAIL_BLOCK_RE.match(line.strip())
        if header_match:
            if current_msg_id and detail_lines:
                detail_text_map[current_msg_id] = "\n".join(detail_lines).strip()
            current_msg_id = header_match.group(1).strip()
            collecting_section = ""
            detail_lines = []
            continue
        if not current_msg_id:
            continue
        sender_match = _DETAIL_SENDER_ID_RE.search(line)
        if sender_match:
            detail_sender_map[current_msg_id] = sender_match.group(1).strip()
        status_match = _DETAIL_STATUS_RE.search(line)
        if status_match:
            continue
        content_match = _DETAIL_CONTENT_RE.match(line.strip())
        if content_match:
            collecting_section = "content"
            detail_lines.append(content_match.group(1).strip())
            detail_content_map[current_msg_id] = content_match.group(1).strip()
            continue
        if line.startswith("**具体要求**"):
            collecting_section = "requirements"
            continue
        if line.startswith("**备注**:"):
            collecting_section = "notes"
            detail_lines.append(line.replace("**备注**:", "").strip())
            continue
        if line.startswith("**会议信息**"):
            collecting_section = "meeting"
            continue
        if line.startswith("**文档关键要点**"):
            collecting_section = "highlights"
            continue
        if collecting_section in {"requirements", "meeting", "highlights"}:
            stripped = line.strip()
            if stripped:
                detail_lines.append(stripped)
            continue

    if current_msg_id and detail_lines:
        detail_text_map[current_msg_id] = "\n".join(detail_lines).strip()

    for msg in unread:
        msg_id = msg.get("id", "")
        if msg_id in detail_sender_map:
            msg["sender_id"] = detail_sender_map[msg_id]
        elif msg.get("sender"):
            users = get_users_by_name(str(msg["sender"]))
            if len(users) == 1:
                msg["sender_id"] = str(users[0]["id"])
        if msg_id in detail_text_map:
            msg["detail"] = detail_text_map[msg_id]
        if msg_id in detail_content_map:
            msg["detail_content"] = detail_content_map[msg_id]

    return unread


def _load_user_messages(user_id: str, working_dir: Path) -> list[dict[str, Any]]:
    messages_path = working_dir / "users" / str(user_id) / "messages.md"
    if not messages_path.exists():
        return []
    try:
        content = messages_path.read_text(encoding="utf-8")
    except Exception:
        return []
    return _parse_unread_messages(content)


def _mark_message_delivered(
    *,
    messages_path: Path,
    message_id: str,
    status_label: str,
) -> None:
    if not messages_path.exists() or not message_id:
        return
    try:
        content = messages_path.read_text(encoding="utf-8")
    except Exception:
        return
    updated_lines: list[str] = []
    current_msg_id = ""
    in_target_block = False
    transitions_written = False
    raw_status = ""
    timestamp = ""
    try:
        from datetime import datetime

        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    except Exception:
        timestamp = ""
    row_pattern = re.compile(rf"^\|\s*{re.escape(message_id)}\s*\|")
    for line in content.splitlines():
        header_match = _DETAIL_BLOCK_RE.match(line.strip())
        if header_match:
            current_msg_id = header_match.group(1).strip()
            in_target_block = current_msg_id == message_id
            transitions_written = False
            raw_status = ""
            updated_lines.append(line)
            continue
        if row_pattern.match(line):
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) >= 5:
                raw_status = parts[4]
                base_status = re.sub(r"（流转:.*?）", "", raw_status).strip()
                transition_note = ""
                if timestamp:
                    transition_note = f"{timestamp} {base_status} -> {status_label}"
                status_cell = status_label
                if transition_note:
                    status_cell = f"{status_label}（流转: {transition_note}）"
                parts[4] = status_cell
                line = "| " + " | ".join(parts) + " |"
            updated_lines.append(line)
            continue
        status_match = _DETAIL_STATUS_RE.match(line.strip())
        if in_target_block and status_match:
            raw_status = status_match.group(1).strip()
            updated_lines.append(f"**消息状态**: {status_label}")
            continue
        if in_target_block and _DETAIL_TRANSITIONS_RE.match(line.strip()):
            transitions_written = True
            history = line.split(":", 1)[1].strip()
            entry = f"{timestamp} {raw_status} -> {status_label}".strip()
            if entry and entry not in history:
                history = f"{history} | {entry}" if history else entry
            updated_lines.append(f"**状态流转**: {history}")
            continue
        updated_lines.append(line)
    if in_target_block and not transitions_written and (raw_status or status_label):
        entry = f"{timestamp} {raw_status} -> {status_label}".strip()
        transitions_line = f"**状态流转**: {entry}" if entry else f"**状态流转**: {status_label}"
        # Insert before the block separator if present, else append.
        for idx in range(len(updated_lines) - 1, -1, -1):
            if updated_lines[idx].strip().startswith("---"):
                updated_lines.insert(idx, transitions_line)
                transitions_written = True
                break
        if not transitions_written:
            updated_lines.append(transitions_line)
    try:
        messages_path.write_text("\n".join(updated_lines) + "\n", encoding="utf-8")
    except Exception:
        return


async def enqueue_inbox_notifications(
    *,
    store: MessageQueueStore,
    user_id: str,
    user_name: str,
    status: str,
    working_dir: Path = WORKING_DIR,
) -> int:
    messages_path = working_dir / "users" / str(user_id) / "messages.md"
    unread = _load_user_messages(user_id, working_dir)
    if not unread:
        return 0

    delivered = 0
    for msg in unread:
        msg_id = str(msg.get("id", "")).strip()
        if msg_id and store.has_event(status=status, task_id=msg_id, user_id=user_id):
            continue
        sender_name = str(msg.get("sender", "")).strip() or "未知发送人"
        content = str(msg.get("content", "")).strip()
        date = str(msg.get("date", "")).strip()
        detail_text = str(msg.get("detail", "")).strip()
        text = f"来自 {sender_name} 的未读消息"
        raw_message = detail_text or content
        raw_summary_parts: list[str] = []
        if content:
            raw_summary_parts.append(content)
        if detail_text:
            raw_summary_parts.append(detail_text)
        raw_summary = "\n".join([p for p in raw_summary_parts if p])
        if raw_summary:
            raw_message = raw_summary
        if raw_message.startswith("【已改写】"):
            raw_message = raw_message[5:].strip()
        try:
            rewritten = await rewrite_notification_message(
                source_user_name=sender_name,
                target_user_name=user_name or "你",
                raw_message=raw_message or text,
            )
            text = rewritten or text
        except Exception:
            text = f"来自 {sender_name} 的未读消息"
            if date or content:
                text += f"（{date}）: {content}" if date else f": {content}"

        payload: dict[str, Any] = {
            "text": text,
            "message_id": msg_id,
            "message_date": date,
            "message_summary": (detail_text or content)[:400],
        }
        route_key_seed = msg_id or str(uuid.uuid4())
        route_key = f"inbox:{user_id}:{route_key_seed}"
        payload["trace_id"] = route_key
        payload["intent_type"] = "inbox.unread"
        payload["target_agent_id"] = f"pia:{user_id}"
        payload["push_conversation_key"] = f"notif:{route_key}"
        payload["push_session_id"] = f"console:notif:{route_key}"
        sender_id = str(msg.get("sender_id", "")).strip()
        if sender_id:
            payload["source_user_id"] = sender_id
            payload["source_user_name"] = sender_name
            payload["source_agent_id"] = f"pia:{sender_id}"
        else:
            payload["source_agent_id"] = "system"

        store.enqueue_message(user_id, payload)
        status_label = "已提醒"
        _mark_message_delivered(
            messages_path=messages_path,
            message_id=msg_id,
            status_label=status_label,
        )
        store.record_event(
            status=status,
            user_id=user_id,
            source_user_name=sender_name,
            target_user_name=user_name,
            detail="login inbox notification",
            task_id=msg_id,
            trace_id=route_key,
            conversation_key=str(payload.get("push_conversation_key") or ""),
            route_result="routed",
        )
        delivered += 1
    return delivered


async def enqueue_inbox_login_notifications(
    *,
    store: MessageQueueStore,
    user_id: str,
    user_name: str,
    working_dir: Path = WORKING_DIR,
) -> int:
    return await enqueue_inbox_notifications(
        store=store,
        user_id=user_id,
        user_name=user_name,
        status="login_inbox",
        working_dir=working_dir,
    )


async def enqueue_sender_login_notifications(
    *,
    store: MessageQueueStore,
    sender_user_id: str,
    sender_name: str,
    working_dir: Path = WORKING_DIR,
) -> int:
    users_dir = working_dir / "users"
    if not users_dir.exists():
        return 0

    delivered = 0
    for entry in users_dir.iterdir():
        if not entry.is_dir():
            continue
        target_user_id = entry.name
        if target_user_id == str(sender_user_id):
            continue
        messages_path = entry / "messages.md"
        unread = _load_user_messages(target_user_id, working_dir)
        for msg in unread:
            sender_raw = str(msg.get("sender", "")).strip()
            normalized_sender = _normalize_name(sender_raw)
            normalized_login = _normalize_name(sender_name)
            if not normalized_sender or not normalized_login:
                continue
            if normalized_login not in normalized_sender and normalized_sender not in normalized_login:
                continue
            msg_id = str(msg.get("id", "")).strip()
            if msg_id and store.has_event(
                status="login_outbox",
                task_id=msg_id,
                user_id=target_user_id,
            ):
                continue
            content = str(msg.get("content", "")).strip()
            date = str(msg.get("date", "")).strip()
            detail_text = str(msg.get("detail", "")).strip()
            target_user_name = get_user_name_by_id_or_profile_id(str(target_user_id))
            text = f"来自 {sender_name} 的消息"
            raw_message = detail_text or content
            raw_summary_parts: list[str] = []
            if content:
                raw_summary_parts.append(content)
            if detail_text:
                raw_summary_parts.append(detail_text)
            raw_summary = "\n".join([p for p in raw_summary_parts if p])
            if raw_summary:
                raw_message = raw_summary
            if raw_message.startswith("【已改写】"):
                raw_message = raw_message[5:].strip()
            try:
                rewritten = await rewrite_notification_message(
                    source_user_name=sender_name,
                    target_user_name=target_user_name or "你",
                    raw_message=raw_message or text,
                )
                text = rewritten or text
            except Exception:
                text = f"来自 {sender_name} 的消息"
                if date or content:
                    text += f"（{date}）: {content}" if date else f": {content}"

            payload: dict[str, Any] = {
                "text": text,
                "source_user_id": str(sender_user_id),
                "source_user_name": sender_name,
                "message_id": msg_id,
                "message_date": date,
                "message_summary": (detail_text or content)[:400],
            }
            outbox_seed = msg_id or str(uuid.uuid4())
            outbox_trace = f"inbox:{target_user_id}:{outbox_seed}"
            payload["trace_id"] = outbox_trace
            payload["intent_type"] = "inbox.outbox"
            payload["source_agent_id"] = f"pia:{sender_user_id}"
            payload["target_agent_id"] = f"pia:{target_user_id}"
            payload["push_conversation_key"] = f"notif:{outbox_trace}"
            payload["push_session_id"] = f"console:notif:{outbox_trace}"
            store.enqueue_message(target_user_id, payload)
            status_label = "已投递"
            _mark_message_delivered(
                messages_path=messages_path,
                message_id=msg_id,
                status_label=status_label,
            )
            store.record_event(
                status="login_outbox",
                user_id=target_user_id,
                source_user_name=sender_name,
                target_user_name="",
                detail="sender login delivery",
                task_id=msg_id,
                trace_id=outbox_trace,
                conversation_key=str(payload.get("push_conversation_key") or ""),
                route_result="routed",
            )
            delivered += 1
    return delivered


def login_message_delivery_enabled() -> bool:
    return str(os.getenv("COPAW_LOGIN_OUTBOX_DELIVERY", "")).strip() in {"1", "true", "yes"}
