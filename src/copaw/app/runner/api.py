# -*- coding: utf-8 -*-
"""Chat management API."""
from __future__ import annotations
from typing import Optional
from uuid import uuid4
from pathlib import Path
import jwt
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from agentscope.memory import InMemoryMemory

from .session import SafeJSONSession
from .manager import ChatManager
from .models import (
    ChatSpec,
    ChatHistory,
)
from .utils import agentscope_msg_to_message
from ...constant import WORKING_DIR


router = APIRouter(prefix="/chats", tags=["chats"])
_JWT_SECRET_PATH = WORKING_DIR / "auth_jwt_secret"
_JWT_ALG = "HS256"


def _auth_claims(authorization: Optional[str] = Header(None)) -> dict[str, str]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    if not Path(_JWT_SECRET_PATH).exists():
        raise HTTPException(status_code=401, detail="Auth not initialized")
    secret = Path(_JWT_SECRET_PATH).read_text().strip()
    try:
        data = jwt.decode(token, secret, algorithms=[_JWT_ALG])
    except jwt.PyJWTError as exc:  # type: ignore[attr-defined]
        raise HTTPException(status_code=401, detail="Invalid token") from exc
    if data.get("status") != "active":
        raise HTTPException(status_code=401, detail="Inactive user")
    user_id = str(data.get("user_id") or "")
    profile_id = str(data.get("profile_id") or "")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return {"user_id": user_id, "profile_id": profile_id}


def _owns_chat(chat_user_id: str, claims: dict[str, str]) -> bool:
    return chat_user_id in {claims["user_id"], claims.get("profile_id", "")}


async def _migrate_legacy_chat_owner(
    chat: ChatSpec,
    mgr: ChatManager,
    claims: dict[str, str],
) -> ChatSpec:
    profile_id = claims.get("profile_id", "")
    if profile_id and chat.user_id == profile_id and claims["user_id"] != profile_id:
        chat.user_id = claims["user_id"]
        return await mgr.update_chat(chat)
    return chat


def get_chat_manager(request: Request) -> ChatManager:
    """Get the chat manager from app state.

    Args:
        request: FastAPI request object

    Returns:
        ChatManager instance

    Raises:
        HTTPException: If manager is not initialized
    """
    mgr = getattr(request.app.state, "chat_manager", None)
    if mgr is None:
        raise HTTPException(
            status_code=503,
            detail="Chat manager not initialized",
        )
    return mgr


def get_session(request: Request) -> SafeJSONSession:
    """Get the session from app state.

    Args:
        request: FastAPI request object

    Returns:
        SafeJSONSession instance

    Raises:
        HTTPException: If session is not initialized
    """
    runner = getattr(request.app.state, "runner", None)
    if runner is None:
        raise HTTPException(
            status_code=503,
            detail="Session not initialized",
        )
    return runner.session


@router.get("", response_model=list[ChatSpec])
async def list_chats(
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    channel: Optional[str] = Query(None, description="Filter by channel"),
    mgr: ChatManager = Depends(get_chat_manager),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """List all chats with optional filters.

    Args:
        user_id: Optional user ID to filter chats
        channel: Optional channel name to filter chats
        mgr: Chat manager dependency
    """
    _ = user_id
    chats = await mgr.list_chats(user_id=claims["user_id"], channel=channel)
    profile_id = claims.get("profile_id", "")
    if profile_id and profile_id != claims["user_id"]:
        legacy = await mgr.list_chats(user_id=profile_id, channel=channel)
        merged: dict[str, ChatSpec] = {c.id: c for c in chats}
        for item in legacy:
            merged[item.id] = item
        migrated: list[ChatSpec] = []
        for chat in merged.values():
            migrated.append(await _migrate_legacy_chat_owner(chat, mgr, claims))
        return migrated
    return chats


@router.post("", response_model=ChatSpec)
async def create_chat(
    request: ChatSpec,
    mgr: ChatManager = Depends(get_chat_manager),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """Create a new chat.

    Server generates chat_id (UUID) automatically.

    Args:
        request: Chat creation request
        mgr: Chat manager dependency

    Returns:
        Created chat spec with UUID
    """
    chat_id = str(uuid4())
    spec = ChatSpec(
        id=chat_id,
        name=request.name,
        session_id=request.session_id,
        user_id=claims["user_id"],
        channel=request.channel,
        meta=request.meta,
    )
    return await mgr.create_chat(spec)


@router.post("/batch-delete", response_model=dict)
async def batch_delete_chats(
    chat_ids: list[str],
    mgr: ChatManager = Depends(get_chat_manager),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """Delete chats by chat IDs.

    Args:
        chat_ids: List of chat IDs
        mgr: Chat manager dependency
    Returns:
        True if deleted, False if failed

    """
    allowed_ids: list[str] = []
    for chat_id in chat_ids:
        existing = await mgr.get_chat(chat_id)
        if not existing:
            continue
        if _owns_chat(existing.user_id, claims):
            migrated = await _migrate_legacy_chat_owner(existing, mgr, claims)
            allowed_ids.append(migrated.id)
    deleted = await mgr.delete_chats(chat_ids=allowed_ids)
    return {"deleted": deleted}


@router.get("/{chat_id}", response_model=ChatHistory)
async def get_chat(
    chat_id: str,
    mgr: ChatManager = Depends(get_chat_manager),
    session: SafeJSONSession = Depends(get_session),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """Get detailed information about a specific chat by UUID.

    Args:
        chat_id: Chat UUID
        mgr: Chat manager dependency
        session: SafeJSONSession dependency

    Returns:
        ChatHistory with messages

    Raises:
        HTTPException: If chat not found (404)
    """
    chat_spec = await mgr.get_chat(chat_id)
    if not chat_spec:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    if not _owns_chat(chat_spec.user_id, claims):
        raise HTTPException(status_code=403, detail="Forbidden")
    chat_spec = await _migrate_legacy_chat_owner(chat_spec, mgr, claims)

    state = await session.get_session_state_dict(
        chat_spec.session_id,
        chat_spec.user_id,
    )
    if not state:
        return ChatHistory(messages=[])
    memories = state.get("agent", {}).get("memory", [])
    memory = InMemoryMemory()
    memory.load_state_dict(memories)

    memories = await memory.get_memory()
    messages = agentscope_msg_to_message(memories)
    return ChatHistory(messages=messages)


@router.put("/{chat_id}", response_model=ChatSpec)
async def update_chat(
    chat_id: str,
    spec: ChatSpec,
    mgr: ChatManager = Depends(get_chat_manager),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """Update an existing chat.

    Args:
        chat_id: Chat UUID
        spec: Updated chat specification
        mgr: Chat manager dependency

    Returns:
        Updated chat spec

    Raises:
        HTTPException: If chat_id mismatch (400) or not found (404)
    """
    if spec.id != chat_id:
        raise HTTPException(
            status_code=400,
            detail="chat_id mismatch",
        )

    # Check if exists
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    if not _owns_chat(existing.user_id, claims):
        raise HTTPException(status_code=403, detail="Forbidden")

    spec.user_id = claims["user_id"]
    updated = await mgr.update_chat(spec)
    return updated


@router.delete("/{chat_id}", response_model=dict)
async def delete_chat(
    chat_id: str,
    mgr: ChatManager = Depends(get_chat_manager),
    claims: dict[str, str] = Depends(_auth_claims),
):
    """Delete a chat by UUID.

    Note: This only deletes the chat spec (UUID mapping).
    JSONSession state is NOT deleted.

    Args:
        chat_id: Chat UUID
        mgr: Chat manager dependency

    Returns:
        True if deleted, False if failed

    Raises:
        HTTPException: If chat not found (404)
    """
    existing = await mgr.get_chat(chat_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    if not _owns_chat(existing.user_id, claims):
        raise HTTPException(status_code=403, detail="Forbidden")
    await _migrate_legacy_chat_owner(existing, mgr, claims)

    deleted = await mgr.delete_chats(chat_ids=[chat_id])
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Chat not found: {chat_id}",
        )
    return {"deleted": True}
