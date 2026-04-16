# -*- coding: utf-8 -*-
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect

from ..auth_db import get_user_context_by_user_id
from ..channels.voice_secretary import DuplugClient, VoiceSecretaryHandler, VoiceSecretarySessionManager
from .auth import _decode_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/voice-secretary", tags=["voice-secretary"])


def _get_duplug_client(websocket: WebSocket) -> DuplugClient:
    client = getattr(websocket.app.state, "voice_secretary_duplug_client", None)
    if client is None:
        client = DuplugClient()
        websocket.app.state.voice_secretary_duplug_client = client
    return client


def _get_session_manager(websocket: WebSocket) -> VoiceSecretarySessionManager:
    manager = getattr(websocket.app.state, "voice_secretary_session_manager", None)
    if manager is None:
        manager = VoiceSecretarySessionManager()
        websocket.app.state.voice_secretary_session_manager = manager
    return manager


@router.websocket("/ws/{user_id}")
async def voice_secretary_ws(websocket: WebSocket, user_id: str) -> None:
    token = str(websocket.query_params.get("token") or "").strip()
    if not token:
        await websocket.close(code=4401, reason="Missing token")
        return
    try:
        current_user = _decode_token(token)
    except HTTPException as exc:
        await websocket.close(code=4401, reason=str(exc.detail))
        return

    requested_user_id = str(user_id or "").strip()
    token_user_id = str(current_user.get("user_id") or "").strip()
    current_role = str(current_user.get("role") or "").strip()
    if not requested_user_id or (requested_user_id != token_user_id and current_role != "admin"):
        await websocket.close(code=4403, reason="Forbidden")
        return

    ctx = get_user_context_by_user_id(requested_user_id) or {}
    merged_user = dict(current_user)
    merged_user["user_id"] = requested_user_id
    merged_user["name"] = str(current_user.get("name") or ctx.get("user_name") or requested_user_id)
    merged_user["profile_id"] = str(current_user.get("profile_id") or ctx.get("profile_id") or "")
    merged_user["department"] = str(current_user.get("department") or ctx.get("department") or "")

    await websocket.accept()
    handler = VoiceSecretaryHandler(
        ws=websocket,
        current_user=merged_user,
        duplug_client=_get_duplug_client(websocket),
        session_mgr=_get_session_manager(websocket),
    )
    try:
        await handler.handle()
    except WebSocketDisconnect:
        logger.info("Voice secretary websocket disconnected user=%s", requested_user_id)
    finally:
        await handler.close()
