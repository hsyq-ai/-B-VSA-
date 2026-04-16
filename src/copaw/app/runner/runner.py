# -*- coding: utf-8 -*-
# pylint: disable=unused-argument too-many-branches too-many-statements
from __future__ import annotations

import asyncio
import inspect
import json
import logging
import time
from pathlib import Path
from typing import Any

from agentscope.message import Msg, TextBlock
from agentscope.pipeline import stream_printing_messages
from agentscope_runtime.engine.runner import Runner
from agentscope_runtime.engine.schemas.agent_schemas import AgentRequest
from dotenv import load_dotenv

from .command_dispatch import (
    _get_last_user_text,
    _is_command,
    run_command_path,
)
from .query_error_dump import write_query_error_dump
from .session import SafeJSONSession
from .utils import build_env_context
from ..channels.schema import DEFAULT_CHANNEL
from ...agents.memory import MemoryManager
from ...agents.react_agent import CoPawAgent
from ...security.tool_guard.models import TOOL_GUARD_DENIED_MARK
from ...config import load_config
from ...constant import (
    TOOL_GUARD_APPROVAL_TIMEOUT_SECONDS,
    WORKING_DIR,
)
from ...security.tool_guard.approval import ApprovalDecision

logger = logging.getLogger(__name__)


class AgentRunner(Runner):
    def __init__(self) -> None:
        super().__init__()
        self.framework_type = "agentscope"
        self._chat_manager = None  # Store chat_manager reference
        self._mcp_manager = None  # MCP client manager for hot-reload
        self._agent_os_store: Any = None
        self._room_store: Any = None
        self.memory_manager: MemoryManager | None = None
        # 并发控制锁，防止多用户同时访问时 memory_manager 状态污染
        self._memory_lock = asyncio.Lock()

    def set_chat_manager(self, chat_manager):
        """Set chat manager for auto-registration.

        Args:
            chat_manager: ChatManager instance
        """
        self._chat_manager = chat_manager

    def set_mcp_manager(self, mcp_manager):
        """Set MCP client manager for hot-reload support.

        Args:
            mcp_manager: MCPClientManager instance
        """
        self._mcp_manager = mcp_manager

    def set_agent_os_context(self, *, agent_os_store=None, room_store=None) -> None:
        """Inject Agent OS collaboration stores for context hydration."""
        self._agent_os_store = agent_os_store
        self._room_store = room_store

    def _build_collab_context(self, *, session_id: str, user_id: str) -> str:
        room_store = self._room_store
        agent_os_store = self._agent_os_store
        if not session_id or not user_id or room_store is None:
            return ""
        try:
            room = room_store.get_room_by_session(session_id)
        except Exception:
            logger.debug("Failed to resolve room by session", exc_info=True)
            room = None
        if not room:
            return ""
        parts = [
            "- 当前协作上下文:",
            f"  - room_id: {str(room.get('room_id') or '')}",
            f"  - room_title: {str(room.get('title') or '')}",
            f"  - room_type: {str(room.get('room_type') or '')}",
            f"  - trace_id: {str(room.get('trace_id') or '')}",
        ]
        if agent_os_store is not None:
            try:
                plan = agent_os_store.get_latest_plan_for_session(
                    owner_user_id=str(user_id or ""),
                    session_id=str(session_id or ""),
                )
            except Exception:
                logger.debug("Failed to resolve latest plan for session", exc_info=True)
                plan = None
            if plan:
                parts.extend(
                    [
                        f"  - plan_id: {str(plan.get('plan_id') or '')}",
                        f"  - plan_title: {str(plan.get('title') or '')}",
                        f"  - plan_status: {str(plan.get('status') or '')}",
                    ]
                )
                steps = plan.get("steps") if isinstance(plan.get("steps"), list) else []
                if steps:
                    parts.append("  - plan_steps:")
                    for index, step in enumerate(steps[:8], start=1):
                        if not isinstance(step, dict):
                            continue
                        step_title = str(step.get("title") or step.get("description") or f"步骤{index}")
                        step_status = str(step.get("status") or "pending")
                        parts.append(f"    {index}. {step_title} [{step_status}]")
        return "====================\n" + "\n".join(parts) + "\n===================="

    async def _emit_progress(self, progress_callback=None, **payload) -> None:
        if progress_callback is None:
            return
        data = {key: value for key, value in payload.items() if value is not None}
        try:
            result = progress_callback(data)
            if inspect.isawaitable(result):
                await result
        except Exception:
            logger.debug("progress callback failed", exc_info=True)

    _APPROVAL_TIMEOUT_SECONDS = TOOL_GUARD_APPROVAL_TIMEOUT_SECONDS

    async def _resolve_pending_approval(
        self,
        session_id: str,
        query: str | None,
    ) -> tuple[Msg | None, bool]:
        """Check for a pending tool-guard approval for *session_id*.

        Returns ``(response_msg, was_consumed)``:

        - ``(None, False)`` — no pending approval, continue normally.
        - ``(Msg, True)``   — denied; yield the Msg and stop.
        - ``(None, True)``  — approved; skip the command path and let
          the message reach the agent so the LLM can re-call the tool.
        """
        if not session_id:
            return None, False

        from ..approvals import get_approval_service

        svc = get_approval_service()
        pending = await svc.get_pending_by_session(session_id)
        if pending is None:
            return None, False

        elapsed = time.time() - pending.created_at
        if elapsed > self._APPROVAL_TIMEOUT_SECONDS:
            await svc.resolve_request(
                pending.request_id,
                ApprovalDecision.TIMEOUT,
            )
            return (
                Msg(
                    name="Friday",
                    role="assistant",
                    content=[
                        TextBlock(
                            type="text",
                            text=(
                                f"⏰ Tool `{pending.tool_name}` approval "
                                f"timed out ({int(elapsed)}s) — denied.\n"
                                f"工具 `{pending.tool_name}` 审批超时"
                                f"（{int(elapsed)}s），已拒绝执行。"
                            ),
                        ),
                    ],
                ),
                True,
            )

        normalized = (query or "").strip().lower()
        if normalized in ("/daemon approve", "/approve"):
            await svc.resolve_request(
                pending.request_id,
                ApprovalDecision.APPROVED,
            )
            return None, True

        await svc.resolve_request(
            pending.request_id,
            ApprovalDecision.DENIED,
        )
        return (
            Msg(
                name="Friday",
                role="assistant",
                content=[
                    TextBlock(
                        type="text",
                        text=(
                            f"❌ Tool `{pending.tool_name}` denied.\n"
                            f"工具 `{pending.tool_name}` 已拒绝执行。"
                        ),
                    ),
                ],
            ),
            True,
        )

    async def query_handler(
        self,
        msgs,
        request: AgentRequest = None,
        progress_callback=None,
        **kwargs,
    ):
        """
        Handle agent query.
        """
        query = _get_last_user_text(msgs)
        session_id = getattr(request, "session_id", "") or ""
        await self._emit_progress(
            progress_callback,
            stage="request_received",
            summary="请求已进入智能体执行通道",
            detail="后端正在校验会话、用户与执行上下文。",
            percent=12,
        )

        (
            approval_response,
            approval_consumed,
        ) = await self._resolve_pending_approval(session_id, query)
        if approval_response is not None:
            yield approval_response, True
            user_id = getattr(request, "user_id", "") or ""
            await self._cleanup_denied_session_memory(
                session_id,
                user_id,
                denial_response=approval_response,
            )
            return

        if not approval_consumed and query and _is_command(query):
            logger.info("Command path: %s", query.strip()[:50])
            await self._emit_progress(
                progress_callback,
                stage="command_routing",
                summary="识别为命令型请求",
                detail="正在切换到命令执行路径。",
                percent=20,
            )
            async for msg, last in run_command_path(request, msgs, self):
                yield msg, last
            return

        agent = None
        chat = None
        session_state_loaded = False
        try:
            session_id = request.session_id
            user_id = request.user_id
            channel = getattr(request, "channel", DEFAULT_CHANNEL)

            logger.info(
                "Handle agent query:\n%s",
                json.dumps(
                    {
                        "session_id": session_id,
                        "user_id": user_id,
                        "channel": channel,
                        "msgs_len": len(msgs) if msgs else 0,
                        "msgs_str": str(msgs)[:300] + "...",
                    },
                    ensure_ascii=False,
                    indent=2,
                ),
            )
            await self._emit_progress(
                progress_callback,
                stage="preparing_context",
                summary="正在装载环境与路由上下文",
                detail="开始确定会话目录、渠道与工作区范围。",
                percent=22,
            )

            env_context = build_env_context(
                session_id=session_id,
                user_id=user_id,
                channel=channel,
                working_dir=str(WORKING_DIR),
            )
            collab_context = self._build_collab_context(
                session_id=str(session_id or ""),
                user_id=str(user_id or ""),
            )
            if collab_context:
                env_context = env_context + "\n" + collab_context

            # Get MCP clients from manager (hot-reloadable)
            mcp_clients = []
            if self._mcp_manager is not None:
                mcp_clients = await self._mcp_manager.get_clients()

            config = load_config()
            max_iters = config.agents.running.max_iters
            max_input_length = config.agents.running.max_input_length

            await self._emit_progress(
                progress_callback,
                stage="loading_memory",
                summary="正在绑定用户记忆与模型配置",
                detail="准备加载档案、公共记忆以及可用能力清单。",
                percent=34,
            )

            # 配置 MemoryManager 的 profile_id 隔离（阶段一：并发安全版本）
            if self.memory_manager is not None:
                # 使用异步锁保护，防止多用户并发时状态污染
                async with self._memory_lock:
                    # 设置当前请求的 profile_id，确保记忆检索隔离
                    self.memory_manager.set_current_profile_id(user_id)
                    logger.info(
                        "[Memory Isolation] Set profile_id=%s for session=%s (lock acquired)",
                        user_id,
                        session_id,
                    )

            agent = CoPawAgent(
                env_context=env_context,
                mcp_clients=mcp_clients,
                memory_manager=self.memory_manager,
                request_context={
                    "session_id": session_id,
                    "user_id": user_id,
                    "channel": channel,
                },
                max_iters=max_iters,
                max_input_length=max_input_length,
            )
            await agent.register_mcp_clients()
            agent.set_console_output_enabled(enabled=False)
            await self._emit_progress(
                progress_callback,
                stage="agent_ready",
                summary="智能体实例已准备完成",
                detail="会话技能、工具连接和执行参数均已装载。",
                percent=46,
            )

            logger.debug(
                f"Agent Query msgs {msgs}",
            )

            name = "New Chat"
            if len(msgs) > 0:
                content = msgs[0].get_text_content()
                if content:
                    name = msgs[0].get_text_content()[:10]
                else:
                    name = "Media Message"

            if self._chat_manager is not None:
                chat = await self._chat_manager.get_or_create_chat(
                    session_id,
                    user_id,
                    channel,
                    name=name,
                )

            try:
                await self.session.load_session_state(
                    session_id=session_id,
                    user_id=user_id,
                    agent=agent,
                )
            except KeyError as e:
                logger.warning(
                    "load_session_state skipped (state schema mismatch): %s; "
                    "will save fresh state on completion to recover file",
                    e,
                )
            session_state_loaded = True
            await self._emit_progress(
                progress_callback,
                stage="session_loaded",
                summary="会话状态与历史上下文已恢复",
                detail="正在重建系统提示词并进入实际推理阶段。",
                percent=58,
            )

            # Rebuild system prompt so it always reflects the latest
            # AGENTS.md / SOUL.md / PROFILE.md, not the stale one saved
            # in the session state.
            agent.rebuild_sys_prompt()
            await self._emit_progress(
                progress_callback,
                stage="agent_thinking",
                summary="模型开始思考并规划执行路径",
                detail="如涉及工具调用或多步推理，此阶段耗时会更长。",
                percent=68,
            )

            first_response_emitted = False
            async for msg, last in stream_printing_messages(
                agents=[agent],
                coroutine_task=agent(msgs),
            ):
                if not first_response_emitted:
                    preview = ""
                    try:
                        preview = str(msg.get_text_content() or "").strip()
                    except Exception:
                        preview = ""
                    await self._emit_progress(
                        progress_callback,
                        stage="first_response",
                        summary="已收到首条模型输出",
                        detail=(preview[:120] if preview else "模型已开始回传结果，正在继续整理内容。"),
                        percent=82,
                    )
                    first_response_emitted = True
                yield msg, last

        except asyncio.CancelledError as exc:
            logger.info(f"query_handler: {session_id} cancelled!")
            await self._emit_progress(
                progress_callback,
                stage="cancelled",
                summary="执行被中断",
                detail="当前会话已收到取消信号。",
                status="error",
            )
            if agent is not None:
                await agent.interrupt()
            raise RuntimeError("Task has been cancelled!") from exc
        except Exception as e:
            await self._emit_progress(
                progress_callback,
                stage="failed",
                summary="执行过程中出现异常",
                detail=str(e),
                status="error",
            )
            debug_dump_path = write_query_error_dump(
                request=request,
                exc=e,
                locals_=locals(),
            )
            path_hint = (
                f"\n(Details:  {debug_dump_path})" if debug_dump_path else ""
            )
            logger.exception(f"Error in query handler: {e}{path_hint}")
            if debug_dump_path:
                setattr(e, "debug_dump_path", debug_dump_path)
                if hasattr(e, "add_note"):
                    e.add_note(
                        f"(Details:  {debug_dump_path})",
                    )
                suffix = f"\n(Details:  {debug_dump_path})"
                e.args = (
                    (f"{e.args[0]}{suffix}" if e.args else suffix.strip()),
                ) + e.args[1:]
            raise
        finally:
            if agent is not None and session_state_loaded:
                await self._emit_progress(
                    progress_callback,
                    stage="finalizing",
                    summary="正在写回会话状态与持久化结果",
                    detail="模型输出已完成，正在刷新会话快照。",
                    percent=92,
                )
                await self.session.save_session_state(
                    session_id=session_id,
                    user_id=user_id,
                    agent=agent,
                )

            if self._chat_manager is not None and chat is not None:
                await self._chat_manager.update_chat(chat)

    async def _cleanup_denied_session_memory(
        self,
        session_id: str,
        user_id: str,
        denial_response: "Msg | None" = None,
    ) -> None:
        """Clean up session memory after a tool-guard denial.

        In the deny path (no agent is created), this method:

        1. Removes the LLM denial explanation (the assistant message
           immediately following the last marked entry).
        2. Strips ``TOOL_GUARD_DENIED_MARK`` from all marks lists so
           the kept tool-call info becomes normal memory entries.
        3. Appends *denial_response* (e.g. "❌ Tool denied") to the
           persisted session memory.
        """
        if not hasattr(self, "session") or self.session is None:
            return

        path = self.session._get_save_path(  # pylint: disable=protected-access
            session_id,
            user_id,
        )
        if not Path(path).exists():
            return

        try:
            with open(
                path,
                "r",
                encoding="utf-8",
                errors="surrogatepass",
            ) as f:
                states = json.load(f)

            agent_state = states.get("agent", {})
            memory_state = agent_state.get("memory", {})
            content = memory_state.get("content", [])

            if not content:
                return

            def _is_marked(entry):
                return (
                    isinstance(entry, list)
                    and len(entry) >= 2
                    and isinstance(entry[1], list)
                    and TOOL_GUARD_DENIED_MARK in entry[1]
                )

            last_marked_idx = -1
            for i, entry in enumerate(content):
                if _is_marked(entry):
                    last_marked_idx = i

            modified = False

            if last_marked_idx >= 0 and last_marked_idx + 1 < len(content):
                next_entry = content[last_marked_idx + 1]
                if (
                    isinstance(next_entry, list)
                    and len(next_entry) >= 1
                    and isinstance(next_entry[0], dict)
                    and next_entry[0].get("role") == "assistant"
                ):
                    del content[last_marked_idx + 1]
                    modified = True

            for entry in content:
                if _is_marked(entry):
                    entry[1].remove(TOOL_GUARD_DENIED_MARK)
                    modified = True

            if denial_response is not None:
                ts = getattr(denial_response, "timestamp", None)
                msg_dict = {
                    "id": getattr(denial_response, "id", ""),
                    "name": getattr(denial_response, "name", "Friday"),
                    "role": getattr(denial_response, "role", "assistant"),
                    "content": denial_response.content,
                    "metadata": getattr(
                        denial_response,
                        "metadata",
                        None,
                    ),
                    "timestamp": str(ts) if ts is not None else "",
                }
                content.append([msg_dict, []])
                modified = True

            if modified:
                with open(
                    path,
                    "w",
                    encoding="utf-8",
                    errors="surrogatepass",
                ) as f:
                    json.dump(states, f, ensure_ascii=False)
                logger.info(
                    "Tool guard: cleaned up denied session memory in %s",
                    path,
                )
        except Exception:  # pylint: disable=broad-except
            logger.warning(
                "Failed to clean up denied messages from session %s",
                session_id,
                exc_info=True,
            )

    async def init_handler(self, *args, **kwargs):
        """
        Init handler.
        """
        # Load environment variables from .env file
        env_path = Path(__file__).resolve().parents[4] / ".env"
        if env_path.exists():
            load_dotenv(env_path)
            logger.debug(f"Loaded environment variables from {env_path}")
        else:
            logger.debug(
                f".env file not found at {env_path}, "
                "using existing environment variables",
            )

        session_dir = str(WORKING_DIR / "sessions")
        self.session = SafeJSONSession(save_dir=session_dir)

        try:
            if self.memory_manager is None:
                self.memory_manager = MemoryManager(
                    working_dir=str(WORKING_DIR),
                )
            await self.memory_manager.start()
        except Exception as e:
            logger.exception(f"MemoryManager start failed: {e}")

    async def shutdown_handler(self, *args, **kwargs):
        """
        Shutdown handler.
        """
        try:
            if self.memory_manager is not None:
                await self.memory_manager.close()
        except Exception as e:
            logger.warning(f"MemoryManager stop failed: {e}")
