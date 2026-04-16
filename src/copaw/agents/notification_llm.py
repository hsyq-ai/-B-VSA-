# -*- coding: utf-8 -*-
"""LLM utilities for notification rewriting and reply intent detection."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


def _extract_text_from_chunk(chunk: Any) -> str:
    """从 stream chunk 中提取文本。支持 content 为 str 或 list[dict]"""
    c = getattr(chunk, "content", None)
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return "".join(
            b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"
        )
    return ""


async def rewrite_notification_message(
    source_user_name: str,
    target_user_name: str,
    raw_message: str,
) -> str:
    """Use LLM to rewrite a notification in a natural, butler-style tone.

    Args:
        source_user_name: Who sent the message
        target_user_name: Who receives it
        raw_message: The original message content

    Returns:
        Rewritten message, or fallback on LLM failure.
    """
    fallback = f"{source_user_name} 对您说：{raw_message}"

    try:
        from copaw.providers.provider_manager import ProviderManager

        model = ProviderManager.get_active_chat_model()
    except Exception as e:
        logger.warning("Notification rewrite: no active model, using fallback: %s", e)
        return fallback

    prompt = f"""你是AI管家。来源用户「{source_user_name}」给目标用户「{target_user_name}」发了一条消息，内容如下：

「{raw_message}」

请用管家的口吻，以第二人称（你/您）称呼目标用户，自然转述这条消息，并询问是否需要协助。只输出转述内容，不要其他解释，不要加引号。"""

    try:
        messages = [{"role": "user", "content": prompt}]
        # 使用 stream=True 避免部分 API（如 DashScope）在 stream=False 时报 stream_options 错误
        # agentscope 解析后的每个 chunk 是累计的完整内容，只取最后一个
        resp = await model(messages, stream=True)
        text = ""
        if hasattr(resp, "__aiter__"):
            async for chunk in resp:
                chunk_text = _extract_text_from_chunk(chunk)
                if chunk_text:
                    text = chunk_text  # 覆盖：每个 chunk 已是累计全文
        result = text.strip() if text else fallback
        return result[:500] if result else fallback
    except Exception as e:
        logger.warning("Notification rewrite failed, using fallback: %s", e)
        return fallback


async def rewrite_reply_message(
    source_user_name: str,
    target_user_name: str,
    reply_content: str,
) -> str:
    """Use LLM to rewrite a reply notification for the original sender.

    Args:
        source_user_name: Who is replying (e.g. 贺柏鑫)
        target_user_name: Who receives the reply (e.g. 陈文豪)
        reply_content: The reply content (e.g. 知道了)

    Returns:
        Rewritten message for the target user.
    """
    fallback = f"{source_user_name} 回复：{reply_content}"

    try:
        from copaw.providers.provider_manager import ProviderManager

        model = ProviderManager.get_active_chat_model()
    except Exception as e:
        logger.warning("Reply rewrite: no active model, using fallback: %s", e)
        return fallback

    prompt = f"""你是AI管家。「{source_user_name}」对「{target_user_name}」的回复是：「{reply_content}」。

请用管家的口吻，以第二人称称呼目标用户，自然转述这条回复，并询问是否需要其他帮助。只输出转述内容，不要其他解释，不要加引号。"""

    try:
        messages = [{"role": "user", "content": prompt}]
        resp = await model(messages, stream=True)
        text = ""
        if hasattr(resp, "__aiter__"):
            async for chunk in resp:
                chunk_text = _extract_text_from_chunk(chunk)
                if chunk_text:
                    text = chunk_text
        result = text.strip() if text else fallback
        return result[:500] if result else fallback
    except Exception as e:
        logger.warning("Reply rewrite failed, using fallback: %s", e)
        return fallback


async def draft_mailbox_auto_reply(
    *,
    source_user_name: str,
    target_agent_name: str,
    title: str,
    raw_message: str,
    intent: str = "",
    scene_label: str = "",
    scene_prompt: str = "",
) -> str:
    """Generate a concise agent-style reply for a mailbox task."""
    raw_message = str(raw_message or "").strip()
    title = str(title or "新任务").strip()
    intent = str(intent or "").strip()
    scene_label = str(scene_label or "").strip()
    scene_prompt = str(scene_prompt or "").strip()
    fallback_lines = [
        f"【自动回执】{target_agent_name} 已收到来自 {source_user_name} 的 {title}。",
        "我会先基于当前上下文整理要点，再推进下一步。",
    ]
    if intent:
        fallback_lines.append(f"任务意图：{intent}")
    if raw_message:
        snippet = raw_message.replace("\n", " ").strip()
        if len(snippet) > 180:
            snippet = snippet[:180] + "..."
        fallback_lines.append(f"任务摘要：{snippet}")
    if scene_label or scene_prompt:
        fallback_lines.append(
            f"场景联动：{scene_label or '未命名场景'}，我会按当前场景提示继续推进。",
        )
    else:
        fallback_lines.append("后续动作：识别阻塞、补充缺失信息、给出下一步建议。")
    fallback = "\n".join(fallback_lines)

    try:
        from copaw.providers.provider_manager import ProviderManager

        model = ProviderManager.get_active_chat_model()
    except Exception as e:
        logger.warning("Mailbox auto reply: no active model, using fallback: %s", e)
        return fallback

    prompt = f"""你是企业员工的数字分身，需要为一条邮箱任务生成“自动回执”。

发起人：{source_user_name}
接收方数字分身：{target_agent_name}
任务标题：{title}
任务意图：{intent or "未指定"}
场景标签：{scene_label or "无"}
场景提示：{scene_prompt or "无"}
任务原文：
{raw_message or "（空）"}

要求：
1. 先明确“已收到”。
2. 用 1-2 句概括你理解到的任务重点。
3. 给出 2-3 个下一步动作或要追问的信息。
4. 语气像一个认真、主动的助理，不要写长篇分析，不要分点过多。
5. 直接输出回执正文，不要额外解释，不要加引号。
"""

    try:
        messages = [{"role": "user", "content": prompt}]

        async def _run() -> str:
            resp = await model(messages, stream=True)
            text = ""
            if hasattr(resp, "__aiter__"):
                async for chunk in resp:
                    chunk_text = _extract_text_from_chunk(chunk)
                    if chunk_text:
                        text = chunk_text
            return text.strip()

        text = await asyncio.wait_for(_run(), timeout=30)
        if not text:
            return fallback
        return text[:800]
    except Exception as e:
        logger.warning("Mailbox auto reply failed, using fallback: %s", e)
        return fallback


async def detect_reply_forward_intent(
    user_message: str,
    session_push_source: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Use LLM to detect if the user wants to forward a reply to someone.

    Args:
        user_message: The user's message (e.g. "你告诉他 知道了")
        session_push_source: Optional {source_user_id, source_user_name} from session meta

    Returns:
        If intent detected: {"target_user_name": str, "reply_content": str}
        Otherwise None.
    """
    if not user_message or len(user_message.strip()) < 2:
        return None

    try:
        from copaw.providers.provider_manager import ProviderManager

        model = ProviderManager.get_active_chat_model()
    except Exception as e:
        logger.warning("Reply intent: no active model: %s", e)
        return None

    ctx = ""
    if session_push_source:
        name = session_push_source.get("source_user_name") or "对方"
        ctx = f"当前会话来自「{name}」的推送，用户说「他」时可能指{name}。"
    else:
        ctx = "当前会话没有明确的推送来源。"

    prompt = f"""判断用户是否在请求「把回复转告给某人」。

用户消息：「{user_message}」
{ctx}

如果用户是在请求转告回复（如「你告诉他知道了」「回复他好的」「转告陈文豪收到了」等），输出JSON：{{"is_reply_forward": true, "target_user_name": "目标用户名", "reply_content": "要转告的回复内容"}}
如果目标用户名在上下文中明确（如「他」指推送来源），用该名字；否则从用户消息中解析。
如果用户不是在请求转告，输出：{{"is_reply_forward": false}}

只输出JSON，不要其他内容。"""

    try:
        messages = [{"role": "user", "content": prompt}]
        resp = await model(messages, stream=True)
        text = ""
        if hasattr(resp, "__aiter__"):
            async for chunk in resp:
                chunk_text = _extract_text_from_chunk(chunk)
                if chunk_text:
                    text = chunk_text
        raw = text.strip()

        if not raw:
            return None
        # 尝试提取 JSON
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            obj = json.loads(raw[start:end])
            if obj.get("is_reply_forward") and obj.get("target_user_name") and obj.get("reply_content"):
                return {
                    "target_user_name": str(obj["target_user_name"]).strip(),
                    "reply_content": str(obj["reply_content"]).strip(),
                }
    except Exception as e:
        logger.warning("Reply intent detection failed: %s", e)
    return None


async def detect_notify_intent(
    user_message: str,
    *,
    user_directory: list[dict[str, str]] | None = None,
    department_names: list[str] | None = None,
) -> dict[str, Any] | None:
    """Use LLM to detect notification intent and extract targets/content.

    Returns:
        {"is_notify": bool, "targets": [{"name": str, "department": str}], "content": str,
         "intent": str, "time": str}
    """
    if not user_message or len(user_message.strip()) < 2:
        return None

    try:
        from copaw.providers.provider_manager import ProviderManager

        model = ProviderManager.get_active_chat_model()
    except Exception as e:
        logger.warning("Notify intent: no active model: %s", e)
        return None

    directory = user_directory or []
    dept_list = department_names or []
    if not dept_list:
        dept_list = sorted(
            {
                str(item.get("department") or "").strip()
                for item in directory
                if str(item.get("department") or "").strip()
            },
        )
    candidate_lines = []
    for item in directory[:120]:
        name = str(item.get("name") or "").strip()
        dept = str(item.get("department") or "").strip()
        if not name:
            continue
        candidate_lines.append(f"- {name}{f'（{dept}）' if dept else ''}")
    candidate_block = "\n".join(candidate_lines) if candidate_lines else "（无）"
    dept_block = "、".join([d for d in dept_list if d][:30]) or "（无）"

    prompt = f"""判断用户是否在发起“通知/转告/协同/会议通知/活动安排/投票”等消息分发意图，并抽取接收对象与通知内容。

用户原话：
「{user_message}」

候选员工名单（姓名+部门）：
{candidate_block}

已有部门列表：
{dept_block}

输出JSON（只输出JSON，不要其他内容）：
如果是通知意图：
{{
  "is_notify": true,
  "targets": [{{"name": "目标姓名或空", "department": "目标部门或空"}}],
  "content": "要通知的核心内容（去掉称呼/对象/客套）",
  "intent": "meeting|collab|event|vote|notify|other",
  "time": "时间信息（可空）"
}}
如果不是通知意图：
{{"is_notify": false}}

规则：
1) 如果识别到具体姓名，优先填 name；部门可空。
2) 如果只说了部门（如“通知研发部”），name留空，department填写。
3) 若信息不足（未提及对象），仍输出 is_notify=true，但 targets 为空数组。
"""

    try:
        messages = [{"role": "user", "content": prompt}]
        resp = await model(messages, stream=True)
        text = ""
        if hasattr(resp, "__aiter__"):
            async for chunk in resp:
                chunk_text = _extract_text_from_chunk(chunk)
                if chunk_text:
                    text = chunk_text
        raw = text.strip()
        if not raw:
            return None
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            obj = json.loads(raw[start:end])
            return obj if isinstance(obj, dict) else None
    except Exception as e:
        logger.warning("Notify intent detection failed: %s", e)
    return None
