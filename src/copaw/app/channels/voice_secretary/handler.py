# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import os
import time
import uuid
from typing import Any

from fastapi import WebSocket

from ....agents.voice_secretary import VoiceSecretaryAgent
from ...tts_client import TTSClient, get_tts_client
from .duplug_client import DuplugClient
from .session import VoiceSecretarySession, VoiceSecretarySessionManager

logger = logging.getLogger(__name__)


class VoiceSecretaryHandler:
    FALLBACK_IDLE_STREAK = 10
    FALLBACK_STAGNANT_TURNS = 18
    FALLBACK_MIN_TEXT_LEN = 3
    FALLBACK_FILTER_WORDS = {
        "嗯",
        "嗯嗯",
        "啊",
        "哦",
        "喂",
        "对",
        "对呀",
        "对啊",
        "好的",
        "没事",
        "行",
        "可以",
        "是吗",
        "什么",
        "什么啊",
    }
    PROCESS_TIMEOUT_SECONDS = max(
        float(os.getenv("COPAW_VSA_PROCESS_TIMEOUT_SECONDS", "12.0") or 12.0),
        3.0,
    )

    def __init__(
        self,
        *,
        ws: WebSocket,
        current_user: dict[str, Any],
        duplug_client: DuplugClient,
        session_mgr: VoiceSecretarySessionManager,
    ) -> None:
        self.ws = ws
        self.current_user = dict(current_user or {})
        self.duplug_client = duplug_client
        self.session_mgr = session_mgr
        self.user_id = str(self.current_user.get("user_id") or "").strip()
        self.agent_id = f"vsa:{self.user_id}"
        self.session: VoiceSecretarySession | None = None
        self.tts_client: TTSClient = get_tts_client()
        self._send_lock = asyncio.Lock()
        self._tts_task: asyncio.Task[None] | None = None
        self._tts_request_id = ""
        self._closed = False
        self._fallback_commit_enabled = str(
            os.getenv("COPAW_VSA_FALLBACK_COMMIT_ENABLED", "1")
        ).strip().lower() in {"1", "true", "yes", "on"}
        self._fallback_post_tts_guard_seconds = max(
            float(os.getenv("COPAW_VSA_FALLBACK_POST_TTS_GUARD_SECONDS", "1.5") or 1.5),
            0.0,
        )

    async def _send_json(self, payload: dict[str, Any]) -> None:
        if self._closed:
            return
        async with self._send_lock:
            await self.ws.send_json(payload)

    async def _send_status(self, phase: str, text: str) -> None:
        await self._send_json(
            {
                "type": "assistant_status",
                "phase": str(phase or "processing"),
                "text": str(text or ""),
                "sessionId": str(self.session.session_id if self.session else ""),
            }
        )

    async def _send_audio_event(self, event_type: str, request_id: str, **payload: Any) -> None:
        if self.session is None or not request_id:
            return
        await self._send_json(
            {
                "type": event_type,
                "sessionId": self.session.session_id,
                "requestId": request_id,
                **payload,
            }
        )

    def _extract_turn_text(self, turn_state: dict[str, Any]) -> str:
        return str(turn_state.get("text") or turn_state.get("asr_buffer") or turn_state.get("asr_segment") or "").strip()

    @staticmethod
    def _compact_text(value: str) -> str:
        text = str(value or "").strip().lower()
        return "".join(ch for ch in text if ch.isalnum() or ("\u4e00" <= ch <= "\u9fff"))

    def _should_fallback_commit(self, *, state_name: str, candidate_text: str) -> bool:
        if self.session is None or not candidate_text or bool(self.session.processing):
            return False
        if not self._fallback_commit_enabled:
            return False
        if candidate_text == self.session.last_committed_text:
            return False
        if self._tts_task and not self._tts_task.done():
            return False
        if self.session.current_tts_request_id:
            return False
        post_tts_delta = time.time() - float(self.session.last_tts_end_at or 0.0)
        if post_tts_delta >= 0 and post_tts_delta < self._fallback_post_tts_guard_seconds:
            return False

        compact = self._compact_text(candidate_text)
        if not compact:
            return False
        if compact in self.FALLBACK_FILTER_WORDS:
            return False
        if len(compact) < self.FALLBACK_MIN_TEXT_LEN:
            return False

        if state_name == "idle" and self.session.idle_streak >= self.FALLBACK_IDLE_STREAK:
            return True
        return self.session.stagnant_turn_count >= self.FALLBACK_STAGNANT_TURNS

    async def _interrupt_tts(self, reason: str, *, notify_client: bool = True) -> None:
        task = self._tts_task
        request_id = self._tts_request_id
        if not task or task.done() or not request_id:
            self._tts_task = None
            self._tts_request_id = ""
            if self.session is not None:
                self.session = self.session_mgr.update_session(
                    self.session.session_id,
                    current_tts_request_id="",
                ) or self.session
            return
        if notify_client:
            await self._send_audio_event("assistant_audio_interrupt", request_id, reason=str(reason or "interrupted"))
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task
        self._tts_task = None
        self._tts_request_id = ""
        if self.session is not None:
            self.session = self.session_mgr.update_session(
                self.session.session_id,
                current_tts_request_id="",
            ) or self.session

    async def _synthesize_tts_streaming(self, *, request_id: str, text: str) -> None:
        """流式 TTS：逐块推送 PCM 音频到前端，首块延迟低。"""
        if self.session is None:
            return
        try:
            logger.info("TTS stream start user=%s provider=%s text=%s", self.user_id, self.tts_client.provider, text[:80])
            await self._send_status("synthesizing", "正在合成语音...")
            self.session = self.session_mgr.update_session(
                self.session.session_id,
                status="speaking",
                processing=False,
                current_tts_request_id=request_id,
            ) or self.session
            first_chunk = True
            async for event in self.tts_client.stream_synthesize(text):
                if self._closed or self._tts_request_id != request_id:
                    return
                if event.get("event") == "start":
                    await self._send_audio_event("assistant_audio_stream_start", request_id, audio=event)
                    continue
                if event.get("event") == "chunk":
                    if first_chunk:
                        logger.info("TTS stream first chunk user=%s seq=%s", self.user_id, event.get("seq"))
                        first_chunk = False
                    await self._send_audio_event("assistant_audio_stream_chunk", request_id, audio=event)
                    continue
                if event.get("event") == "end":
                    await self._send_audio_event("assistant_audio_stream_end", request_id)
                    continue
                if event.get("event") == "error":
                    await self._send_audio_event("assistant_audio_error", request_id, error=str(event.get("error", "stream synthesis failed")))
            logger.info("TTS stream done user=%s", self.user_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("VoiceSecretary stream tts failed user=%s", self.user_id)
            await self._send_audio_event("assistant_audio_error", request_id, error=str(exc or "tts stream failed"))
        finally:
            if self.session is not None and self._tts_request_id == request_id:
                next_status = self.session.status
                if next_status == "speaking":
                    next_status = "idle"
                self.session = self.session_mgr.update_session(
                    self.session.session_id,
                    status=next_status,
                    current_tts_request_id="",
                    last_tts_end_at=time.time(),
                ) or self.session
                self._tts_request_id = ""
                self._tts_task = None

    async def _start_tts_response(self, spoken_text: str) -> None:
        if self.session is None or not spoken_text:
            logger.info("TTS skip session=%s text=%s", bool(self.session), spoken_text[:60] if spoken_text else "")
            return
        logger.info("TTS start response user=%s text=%s", self.user_id, spoken_text[:80])
        await self._interrupt_tts("superseded_by_new_result")
        request_id = f"tts-{uuid.uuid4().hex[:10]}"
        self._tts_request_id = request_id
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            current_tts_request_id=request_id,
        ) or self.session
        self._tts_task = asyncio.create_task(self._synthesize_tts_streaming(request_id=request_id, text=spoken_text))

    async def _handle_turn_state(self, response: dict[str, Any]) -> None:
        if self.session is None:
            return
        turn_state = response.get("state") if isinstance(response.get("state"), dict) else {}
        state_name = str(turn_state.get("state") or "idle")
        if state_name != "idle" and self._tts_task and not self._tts_task.done():
            await self._interrupt_tts("user_barge_in")
        observed_text = self._extract_turn_text(turn_state)
        candidate_text = observed_text or self.session.last_candidate_text
        stagnant_turn_count = 0
        if candidate_text:
            stagnant_turn_count = self.session.stagnant_turn_count + 1 if candidate_text == self.session.last_candidate_text else 1
        idle_streak = self.session.idle_streak + 1 if state_name == "idle" and candidate_text else 0
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            status=state_name,
            last_candidate_text=candidate_text,
            stagnant_turn_count=stagnant_turn_count,
            idle_streak=idle_streak,
            last_turn_state=turn_state,
        ) or self.session
        await self._send_json(
            {
                "type": "turn_state",
                "sessionId": self.session.session_id,
                "turnState": turn_state,
            }
        )
        if state_name == "speak":
            text = candidate_text
            if text and not bool(self.session.processing):
                await self._process_turn(text=text, turn_state=turn_state)
            return
        if self._should_fallback_commit(state_name=state_name, candidate_text=candidate_text):
            logger.info(
                "VoiceSecretary fallback commit user=%s session=%s state=%s idle_streak=%s stagnant_turns=%s text=%s",
                self.user_id,
                self.session.session_id,
                state_name,
                self.session.idle_streak,
                self.session.stagnant_turn_count,
                candidate_text[:120],
            )
            fallback_turn_state = dict(turn_state or {})
            fallback_turn_state.setdefault("text", candidate_text)
            fallback_turn_state["fallback_commit"] = True
            await self._process_turn(text=candidate_text, turn_state=fallback_turn_state)

    async def _process_turn(self, *, text: str, turn_state: dict[str, Any]) -> None:
        if self.session is None:
            return
        await self._interrupt_tts("superseded_by_new_turn")
        agent = VoiceSecretaryAgent(
            request_context=self.ws,
            current_user=self.current_user,
            session_id=self.session.session_id,
        )
        # 极短文本/空文本快速过滤（性能优化，避免对 ASR 噪声调 LLM）
        if agent.should_ignore_utterance(text):
            logger.info(
                "VSA quick-filter: user=%s session=%s text=%s",
                self.user_id,
                self.session.session_id,
                str(text or "")[:120],
            )
            self.session = self.session_mgr.update_session(
                self.session.session_id,
                status="idle",
                processing=False,
                last_candidate_text=text,
                last_committed_text=text,
                stagnant_turn_count=0,
                idle_streak=0,
                last_turn_state=turn_state,
            ) or self.session
            await self._send_json(
                {
                    "type": "assistant_ignored",
                    "sessionId": self.session.session_id,
                    "originalText": str(text or ""),
                }
            )
            return
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            status="processing",
            processing=True,
            last_user_text=text,
            last_candidate_text=text,
            last_committed_text=text,
            stagnant_turn_count=0,
            idle_streak=0,
            last_turn_state=turn_state,
        ) or self.session
        await self._send_status("intent_classifying", "正在判断你的意图...")
        try:
            result = await asyncio.wait_for(
                agent.process_voice_command(
                    text,
                    {
                        "duplug_state": turn_state,
                        "session_id": self.session.session_id,
                        "agent_id": self.agent_id,
                    },
                ),
                timeout=self.PROCESS_TIMEOUT_SECONDS,
            )
        except asyncio.TimeoutError:
            logger.warning(
                "VSA process timeout user=%s session=%s timeout=%.2fs text=%s",
                self.user_id,
                self.session.session_id,
                self.PROCESS_TIMEOUT_SECONDS,
                str(text or "")[:120],
            )
            spoken = "我这次处理有点慢，先给你一个快速答复。你可以再说一遍：今天星期几。"
            self.session = self.session_mgr.update_session(
                self.session.session_id,
                status="idle",
                processing=False,
                last_spoken=spoken,
            ) or self.session
            await self._send_json(
                {
                    "type": "assistant_result",
                    "sessionId": self.session.session_id,
                    "spoken": spoken,
                    "screen": {
                        "kind": "voice_secretary_result",
                        "title": "语音秘书回复",
                        "summary": spoken,
                        "originalText": str(text or ""),
                        "intent": "chat",
                    },
                    "route_result": "vsa_handled",
                    "target_agent_id": self.agent_id,
                }
            )
            await self._send_status("result_ready", "已生成结果，准备播报...")
            await self._start_tts_response(spoken)
            return
        except Exception as exc:
            logger.exception("VSA process failed user=%s", self.user_id)
            self.session = self.session_mgr.update_session(
                self.session.session_id,
                status="error",
                processing=False,
            ) or self.session
            await self._send_json(
                {
                    "type": "assistant_error",
                    "sessionId": self.session.session_id,
                    "error": str(exc or "Voice secretary processing failed"),
                }
            )
            return
        spoken = str(result.spoken or "").strip()
        route_result = str(result.route_result or "")
        if route_result == "vsa_handled":
            await self._send_status("generating_reply", "正在生成回复...")
        else:
            await self._send_status("task_handoff", "任务已接管，正在分发...")
            await self._send_status("task_executing", "任务执行中，正在整理结果...")
        # VSA 自己处理的（greeting/chat/self_handle）→ 不进聊天区，只语音播报
        is_vsa_handled = route_result == "vsa_handled"
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            status="idle" if is_vsa_handled or not spoken else "processing",
            processing=False,
            last_screen=result.screen,
            last_spoken=spoken,
        ) or self.session
        await self._send_json(
            {
                "type": "assistant_result",
                "sessionId": self.session.session_id,
                **result.to_dict(),
            }
        )
        await self._send_status("result_ready", "已生成结果，准备播报...")
        if spoken:
            await self._start_tts_response(spoken)

    async def _handle_text_payload(self, raw: str) -> None:
        try:
            payload = json.loads(raw or "{}")
        except Exception:
            await self._send_json({"type": "assistant_error", "error": "Invalid JSON payload"})
            return
        message_type = str(payload.get("type") or "").strip()
        if message_type == "ping":
            await self._send_json({"type": "pong"})
            return
        if message_type == "activate":
            await self._handle_activate()
            return
        if message_type == "proactive_event":
            await self._handle_proactive_event(payload)
            return
        if message_type not in {"audio_chunk", "audio"}:
            return
        audio = str(payload.get("audio") or "").strip()
        if not audio or self.session is None:
            return
        response = await self.duplug_client.feed_audio(session_id=self.session.session_id, audio_base64=audio)
        if response:
            await self._handle_turn_state(response)

    async def _handle_proactive_event(self, payload: dict[str, Any]) -> None:
        if self.session is None:
            return
        event = payload.get("event") if isinstance(payload.get("event"), dict) else {}
        title = str(event.get("title") or "新消息提醒").strip() or "新消息提醒"
        summary = str(event.get("summary") or "").strip()
        source = str(event.get("source") or "系统").strip() or "系统"
        level = str(event.get("level") or "light").strip().lower()
        actions = event.get("actions") if isinstance(event.get("actions"), list) else []
        action_labels = [str(item).strip() for item in actions if str(item or "").strip()]
        if not action_labels:
            action_labels = ["立即处理", "稍后提醒", "静默归档"]

        if summary:
            spoken = f"收到来自{source}的新提醒。{summary}"
        else:
            spoken = f"收到来自{source}的新提醒。"
        if level == "silent":
            spoken = ""

        await self._send_status("proactive_notify", "收到新的提醒事件，正在整理播报...")
        result_payload = {
            "spoken": spoken,
            "route_result": "vsa_handled",
            "target_agent_id": self.agent_id,
            "screen": {
                "kind": "voice_secretary_proactive",
                "title": title,
                "summary": summary or "你可以选择立即处理、稍后提醒或静默归档。",
                "source": source,
                "level": level,
                "quickActions": action_labels,
                "originalText": "",
            },
        }
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            status="idle" if not spoken else "processing",
            processing=False,
            last_spoken=spoken,
            last_screen=result_payload.get("screen") if isinstance(result_payload.get("screen"), dict) else {},
        ) or self.session
        await self._send_json(
            {
                "type": "assistant_result",
                "sessionId": self.session.session_id,
                **result_payload,
            }
        )
        await self._send_status("result_ready", "提醒事件已就绪")
        if spoken:
            await self._start_tts_response(spoken)

    async def _send_greeting(self) -> None:
        """按需发送 VSA 问候语。"""
        try:
            agent = VoiceSecretaryAgent(
                request_context=self.ws,
                current_user=self.current_user,
                session_id=self.session.session_id if self.session else "",
            )
            greeting = await agent.generate_greeting()
            if greeting and self.session:
                await self._send_json(
                    {
                        "type": "assistant_greeting",
                        "sessionId": self.session.session_id,
                        "spoken": greeting,
                    }
                )
                await self._start_tts_response(greeting)
        except Exception as exc:
            logger.warning("VSA greeting failed: user=%s err=%s", self.user_id, exc)

    async def _handle_activate(self) -> None:
        """前端激活信号：仅首次激活时问候。"""
        if self.session is None:
            return
        if bool(self.session.greeted_once):
            return
        self.session = self.session_mgr.update_session(
            self.session.session_id,
            greeted_once=True,
        ) or self.session
        await self._send_greeting()

    async def handle(self) -> None:
        self.session = self.session_mgr.create_session(user_id=self.user_id, agent_id=self.agent_id)
        await self._send_json(
            {
                "type": "ready",
                "sessionId": self.session.session_id,
                "agentId": self.agent_id,
            }
        )
        while True:
            raw = await self.ws.receive_text()
            await self._handle_text_payload(raw)

    async def close(self) -> None:
        if self.session is None:
            return
        await self._interrupt_tts("session_closed", notify_client=False)
        self._closed = True
        await self.duplug_client.close_session(self.session.session_id)
        self.session_mgr.end_session(self.session.session_id)
