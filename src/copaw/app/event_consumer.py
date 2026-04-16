# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import os
import json
import logging
from pathlib import Path
from typing import Any, Awaitable, Callable

from ..constant import WORKING_DIR
from .event_logger import project_event_to_memory

logger = logging.getLogger(__name__)

_EVENT_STREAM = WORKING_DIR / "event_stream.jsonl"
_POLL_INTERVAL = 1.0

EventHandler = Callable[[dict[str, Any]], Awaitable[None] | None]


class EventConsumer:
    def __init__(self, *, stream_path: Path, start_from_end: bool = True) -> None:
        self._stream_path = stream_path
        self._start_from_end = start_from_end
        self._offset = 0
        self._handlers: dict[str, list[EventHandler]] = {}

    def register(self, event_type: str, handler: EventHandler) -> None:
        if not event_type or handler is None:
            return
        self._handlers.setdefault(event_type, []).append(handler)

    async def _dispatch(self, event: dict[str, Any]) -> None:
        event_type = str(event.get("event_type") or "")
        handlers = []
        if event_type:
            handlers.extend(self._handlers.get(event_type, []))
        handlers.extend(self._handlers.get("*", []))
        if not handlers:
            return
        for handler in handlers:
            try:
                result = handler(event)
                if asyncio.iscoroutine(result):
                    await result
            except Exception:
                logger.exception("Event handler failed: %s", event_type)

    def _initialize_offset(self) -> None:
        if not self._stream_path.exists():
            self._stream_path.parent.mkdir(parents=True, exist_ok=True)
            self._stream_path.touch()
        if self._start_from_end:
            self._offset = self._stream_path.stat().st_size
        else:
            self._offset = 0

    async def start(self) -> None:
        self._initialize_offset()
        logger.info("Event consumer started: %s", self._stream_path)
        while True:
            try:
                with self._stream_path.open("r", encoding="utf-8") as f:
                    f.seek(self._offset)
                    lines = f.readlines()
                    if lines:
                        for line in lines:
                            raw = line.strip()
                            if not raw:
                                continue
                            try:
                                event = json.loads(raw)
                            except Exception:
                                logger.warning("Skip malformed event: %s", raw[:200])
                                continue
                            await self._dispatch(event)
                        self._offset = f.tell()
            except Exception:
                logger.exception("Event consumer loop error")
            await asyncio.sleep(_POLL_INTERVAL)


async def _handle_agent_task(event: dict[str, Any]) -> None:
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    agent_name = str(event.get("agent_name") or payload.get("agent_name") or "")
    task_line = str(event.get("task_line") or payload.get("task_line") or "")
    if not agent_name or not task_line:
        return
    from copaw.agents.notification_agent import handle_notification_task
    from copaw.agents.stats_agent import handle_stats_task

    if agent_name in {"@通知Agent", "@文件处理Agent"}:
        await handle_notification_task(task_line)
        return
    if agent_name == "@统计Agent":
        await handle_stats_task(task_line)


async def _project_memory(event: dict[str, Any]) -> None:
    if os.getenv("COPAW_MEMORY_FROM_STREAM", "").strip() != "1":
        return
    project_event_to_memory(event)


async def start_event_consumer() -> None:
    consumer = EventConsumer(stream_path=_EVENT_STREAM, start_from_end=True)
    consumer.register("agent_task", _handle_agent_task)
    consumer.register("*", _project_memory)
    await consumer.start()
