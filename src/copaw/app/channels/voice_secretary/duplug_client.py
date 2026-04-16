# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import websockets

logger = logging.getLogger(__name__)


class DuplugClient:
    """SoulX-Duplug WebSocket 客户端。"""

    def __init__(
        self,
        url: str | None = None,
        *,
        receive_timeout: float = 0.35,
    ) -> None:
        self._url = str(url or os.getenv("COPAW_DUPLUG_WS_URL", "ws://127.0.0.1:8000/turn")).strip()
        self._receive_timeout = max(float(receive_timeout or 0.35), 0.05)
        self._connections: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def _connect(self, session_id: str):
        logger.debug("Connecting SoulX-Duplug session=%s url=%s", session_id, self._url)
        ws = await websockets.connect(
            self._url,
            ping_interval=20,
            ping_timeout=20,
            close_timeout=2,
            max_size=8 * 1024 * 1024,
        )
        self._connections[session_id] = ws
        return ws

    async def _get_connection(self, session_id: str):
        async with self._lock:
            existing = self._connections.get(session_id)
            if existing is not None and not bool(getattr(existing, "closed", False)):
                return existing
            return await self._connect(session_id)

    async def feed_audio(self, *, session_id: str, audio_base64: str) -> dict[str, Any] | None:
        payload = json.dumps(
            {
                "type": "audio",
                "session_id": str(session_id),
                "audio": str(audio_base64 or ""),
            },
            ensure_ascii=False,
        )
        for attempt in range(2):
            ws = await self._get_connection(session_id)
            try:
                await ws.send(payload)
                raw = await asyncio.wait_for(ws.recv(), timeout=self._receive_timeout)
            except asyncio.TimeoutError:
                return None
            except Exception:
                logger.warning(
                    "SoulX-Duplug send/recv failed session=%s attempt=%s",
                    session_id,
                    attempt + 1,
                    exc_info=True,
                )
                await self.close_session(session_id)
                if attempt == 0:
                    continue
                raise
            try:
                data = json.loads(str(raw))
            except Exception:
                logger.warning("Invalid SoulX-Duplug payload session=%s raw=%s", session_id, str(raw)[:200])
                return None
            return data if isinstance(data, dict) else None
        return None

    async def close_session(self, session_id: str) -> None:
        async with self._lock:
            ws = self._connections.pop(str(session_id), None)
        if ws is None:
            return
        try:
            await ws.close()
        except Exception:
            logger.debug("Failed to close SoulX-Duplug session=%s", session_id, exc_info=True)

    async def close_all(self) -> None:
        async with self._lock:
            items = list(self._connections.items())
            self._connections.clear()
        for session_id, ws in items:
            try:
                await ws.close()
            except Exception:
                logger.debug("Failed to close SoulX-Duplug session=%s", session_id, exc_info=True)
