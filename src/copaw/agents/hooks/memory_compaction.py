# -*- coding: utf-8 -*-
"""Memory compaction hook for managing context window.

This hook monitors token usage and automatically compacts older messages
when the context window approaches its limit, preserving recent messages
and the system prompt.
"""
import logging
from typing import TYPE_CHECKING, Any

from agentscope.agent._react_agent import _MemoryMark, ReActAgent

from copaw.config import load_config
from copaw.constant import MEMORY_COMPACT_KEEP_RECENT
from ..utils import (
    check_valid_messages,
    safe_count_str_tokens,
)

if TYPE_CHECKING:
    from agentscope.message import Msg
    from ..memory import MemoryManager
    from reme.memory.file_based import ReMeInMemoryMemory

logger = logging.getLogger(__name__)


def _extract_msg_text(msg: "Msg") -> str:
    content = getattr(msg, "content", "")
    if isinstance(content, str):
        return content

    if not isinstance(content, list):
        return ""

    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
            continue

        if not isinstance(block, dict):
            continue

        block_type = block.get("type")
        if block_type == "tool_result":
            output = block.get("output", "")
            if isinstance(output, str) and output:
                parts.append(output)
            elif isinstance(output, list):
                for sub in output:
                    if isinstance(sub, dict):
                        text = sub.get("text") or sub.get("content", "")
                        if text:
                            parts.append(str(text))
            continue

        text = block.get("text") or block.get("content", "")
        if text:
            parts.append(str(text))

    return "\n".join(parts)


def _estimate_messages_tokens(messages: list["Msg"]) -> int:
    if not messages:
        return 0
    joined = "\n\n".join(_extract_msg_text(msg) for msg in messages)
    return safe_count_str_tokens(joined)


def _build_fallback_summary(
    messages: list["Msg"],
    language: str,
    max_chars: int,
) -> str:
    if not messages:
        return ""

    lines: list[str] = []
    remaining = max(max_chars, 120)

    for msg in messages:
        role = getattr(msg, "role", "unknown")
        text = _extract_msg_text(msg).strip().replace("\n", " ")
        if not text:
            continue

        snippet = text[:220]
        prefix = "用户" if role == "user" else "助手" if role == "assistant" else role
        line = f"- [{prefix}] {snippet}"

        if len(line) + 1 > remaining:
            break

        lines.append(line)
        remaining -= len(line) + 1

    if not lines:
        return ""

    if language == "zh":
        head = "【系统自动截断摘要】以下为被截断历史的关键片段："
    else:
        head = "[Auto Truncation Summary] Key snippets from truncated history:"

    body = "\n".join(lines)
    text = f"{head}\n{body}"
    return text[:max_chars]


def _select_messages_for_hard_truncate(
    messages: list["Msg"],
    budget_tokens: int,
    keep_recent: int,
) -> list["Msg"]:
    total = len(messages)
    if total <= keep_recent:
        return []

    max_cut = max(total - keep_recent, 0)
    if max_cut <= 0:
        return []

    candidate_cut = None
    for cut in range(1, max_cut + 1):
        tail = messages[cut:]
        if not check_valid_messages(tail):
            continue
        if _estimate_messages_tokens(tail) <= budget_tokens:
            candidate_cut = cut
            break

    if candidate_cut is None:
        for cut in range(max_cut, 0, -1):
            if check_valid_messages(messages[cut:]):
                candidate_cut = cut
                break

    if candidate_cut is None:
        return []

    return messages[:candidate_cut]


class MemoryCompactionHook:
    """Hook for automatic memory compaction when context is full.

    This hook monitors the token count of messages and triggers compaction
    when it exceeds the threshold. It preserves the system prompt and recent
    messages while summarizing older conversation history.
    """

    def __init__(self, memory_manager: "MemoryManager"):
        """Initialize memory compaction hook.

        Args:
            memory_manager: Memory manager instance for compaction
        """
        self.memory_manager = memory_manager

    async def __call__(
        self,
        agent: ReActAgent,
        kwargs: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Pre-reasoning hook to check and compact memory if needed.

        This hook extracts system prompt messages and recent messages,
        builds an estimated full context prompt, and triggers compaction
        when the total estimated token count exceeds the threshold.

        Memory structure:
            [System Prompt (preserved)] + [Compactable (counted)] +
            [Recent (preserved)]

        Args:
            agent: The agent instance
            kwargs: Input arguments to the _reasoning method

        Returns:
            None (hook doesn't modify kwargs)
        """
        del kwargs
        try:
            memory: "ReMeInMemoryMemory" = agent.memory
            token_counter = self.memory_manager.token_counter
            config = load_config()

            system_prompt = agent.sys_prompt
            compressed_summary = memory.get_compressed_summary()
            fixed_token_count = safe_count_str_tokens(
                system_prompt + compressed_summary,
            )

            memory_compact_threshold = config.agents.running.memory_compact_threshold
            left_compact_threshold = memory_compact_threshold - fixed_token_count

            if left_compact_threshold <= 0:
                logger.warning(
                    "The memory_compact_threshold is set too low; "
                    "the combined token length of system_prompt and "
                    "compressed_summary exceeds the configured threshold. "
                    "Alternatively, you could use /clear to reset the context "
                    "and compressed_summary, ensuring the total remains "
                    "below the threshold.",
                )
                return None

            messages = await memory.get_memory(prepend_summary=False)

            enable_tool_result_compact = (
                config.agents.running.enable_tool_result_compact
            )
            tool_result_compact_keep_n = (
                config.agents.running.tool_result_compact_keep_n
            )
            if enable_tool_result_compact and tool_result_compact_keep_n > 0:
                compact_msgs = messages[:-tool_result_compact_keep_n]
                await self.memory_manager.compact_tool_result(compact_msgs)

            memory_compact_reserve = config.agents.running.memory_compact_reserve

            (
                messages_to_compact,
                _,
                is_valid,
            ) = await self.memory_manager.check_context(
                messages=messages,
                memory_compact_threshold=left_compact_threshold,
                memory_compact_reserve=memory_compact_reserve,
                token_counter=token_counter,
            )

            if not messages_to_compact:
                return None

            if not is_valid:
                logger.warning(
                    "Please include the output of the /history command when "
                    "reporting the bug to the community. Invalid "
                    "messages=%s",
                    messages,
                )
                keep_length: int = MEMORY_COMPACT_KEEP_RECENT
                messages_length = len(messages)
                while keep_length > 0 and not check_valid_messages(
                    messages[max(messages_length - keep_length, 0) :],
                ):
                    keep_length -= 1

                if keep_length > 0:
                    messages_to_compact = messages[
                        : max(messages_length - keep_length, 0)
                    ]
                else:
                    messages_to_compact = messages

            if not messages_to_compact:
                return None

            max_rounds = config.agents.running.memory_compact_max_rounds
            compaction_round = 0
            last_compaction_exception: Exception | None = None

            while messages_to_compact and compaction_round < max_rounds:
                compaction_round += 1
                previous_summary = memory.get_compressed_summary()
                self.memory_manager.add_async_summary_task(
                    messages=messages_to_compact,
                )

                try:
                    compact_content = await self.memory_manager.compact_memory(
                        messages=messages_to_compact,
                        previous_summary=previous_summary,
                    )
                    if not compact_content or not compact_content.strip():
                        logger.warning(
                            "Compaction round %d returned empty summary",
                            compaction_round,
                        )
                        break

                    await memory.update_compressed_summary(compact_content)
                    updated_count = await memory.update_messages_mark(
                        new_mark=_MemoryMark.COMPRESSED,
                        msg_ids=[msg.id for msg in messages_to_compact],
                    )
                    logger.info(
                        "Compaction round %d: marked %d messages",
                        compaction_round,
                        updated_count,
                    )
                except Exception as e:
                    last_compaction_exception = e
                    logger.error(
                        "Compaction round %d failed: %s",
                        compaction_round,
                        e,
                        exc_info=True,
                    )
                    break

                messages = await memory.get_memory(prepend_summary=False)
                (
                    messages_to_compact,
                    _,
                    is_valid,
                ) = await self.memory_manager.check_context(
                    messages=messages,
                    memory_compact_threshold=left_compact_threshold,
                    memory_compact_reserve=memory_compact_reserve,
                    token_counter=token_counter,
                )

                if not is_valid:
                    logger.warning(
                        "Messages invalid after compaction round %d; "
                        "stop iterative compaction",
                        compaction_round,
                    )
                    break

            still_over_budget = bool(messages_to_compact)
            hard_truncate_enabled = config.agents.running.memory_hard_truncate_enabled

            if still_over_budget and hard_truncate_enabled:
                keep_recent = max(
                    MEMORY_COMPACT_KEEP_RECENT,
                    config.agents.running.memory_min_recent_messages,
                )
                hard_budget = max(left_compact_threshold - memory_compact_reserve, 1)
                hard_truncate_msgs = _select_messages_for_hard_truncate(
                    messages=messages,
                    budget_tokens=hard_budget,
                    keep_recent=keep_recent,
                )

                if hard_truncate_msgs:
                    fallback_summary = _build_fallback_summary(
                        hard_truncate_msgs,
                        language=config.agents.language,
                        max_chars=config.agents.running.memory_fallback_summary_chars,
                    )
                    if fallback_summary:
                        prev_summary = memory.get_compressed_summary()
                        merged_summary = (
                            f"{prev_summary}\n\n{fallback_summary}"
                            if prev_summary
                            else fallback_summary
                        )
                        await memory.update_compressed_summary(merged_summary)

                    updated_count = await memory.update_messages_mark(
                        new_mark=_MemoryMark.COMPRESSED,
                        msg_ids=[msg.id for msg in hard_truncate_msgs],
                    )
                    logger.warning(
                        "Hard truncation activated, marked %d messages. "
                        "compaction_exception=%s",
                        updated_count,
                        type(last_compaction_exception).__name__
                        if last_compaction_exception
                        else "none",
                    )

        except Exception as e:
            logger.error(
                "Failed to compact memory in pre_reasoning hook: %s",
                e,
                exc_info=True,
            )

        return None
