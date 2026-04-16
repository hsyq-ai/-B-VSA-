# -*- coding: utf-8 -*-
"""Chat manager for managing chat specifications."""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from .models import ChatSpec
from .repo import BaseChatRepository
from ..channels.schema import DEFAULT_CHANNEL

logger = logging.getLogger(__name__)


class ChatManager:
    """Manages chat specifications in repository.

    Only handles ChatSpec CRUD operations.
    Does NOT manage Redis session state - that's handled by runner's session.

    Similar to CronManager's role in crons module.
    """

    def __init__(
        self,
        *,
        repo: BaseChatRepository,
    ):
        """Initialize chat manager.

        Args:
            repo: Chat spec repository for persistence
        """
        self._repo = repo
        # 使用读写锁替代单一锁：读操作可并发，写操作排他
        self._read_lock = asyncio.Lock()
        self._write_lock = asyncio.Lock()
        self._readers_count = 0
        self._readers_count_lock = asyncio.Lock()

    # ----- Read-Write Lock Helpers -----

    async def _acquire_read(self):
        """Acquire read lock (multiple readers can access concurrently)."""
        async with self._readers_count_lock:
            self._readers_count += 1
            if self._readers_count == 1:
                await self._read_lock.acquire()
        # 注意：这里不等待 write_lock，读操作应该快速完成

    async def _release_read(self):
        """Release read lock."""
        async with self._readers_count_lock:
            self._readers_count -= 1
            if self._readers_count == 0:
                self._read_lock.release()

    async def _acquire_write(self):
        """Acquire exclusive write lock."""
        await self._write_lock.acquire()

    async def _release_write(self):
        """Release write lock."""
        self._write_lock.release()

    # ----- Read Operations -----

    async def list_chats(
        self,
        user_id: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> list[ChatSpec]:
        """List chat specs with optional filters.

        Args:
            user_id: Optional user ID filter
            channel: Optional channel filter

        Returns:
            List of chat specifications
        """
        await self._acquire_read()
        try:
            return await self._repo.filter_chats(
                user_id=user_id,
                channel=channel,
            )
        finally:
            await self._release_read()

    async def get_chat(self, chat_id: str) -> Optional[ChatSpec]:
        """Get chat spec by chat_id (UUID).

        Args:
            chat_id: Chat UUID

        Returns:
            Chat spec or None if not found
        """
        await self._acquire_read()
        try:
            return await self._repo.get_chat(chat_id)
        finally:
            await self._release_read()

    async def get_or_create_chat(
        self,
        session_id: str,
        user_id: str,
        channel: str = DEFAULT_CHANNEL,
        name: str = "New Chat",
    ) -> ChatSpec:
        """Get existing chat or create new one.

        Useful for auto-registration when chats come from channels.

        Args:
            session_id: Session identifier (channel:user_id)
            user_id: User identifier
            channel: Channel name
            name: Chat name

        Returns:
            Chat specification (existing or newly created)
        """
        # 先读（共享锁）
        await self._acquire_read()
        try:
            existing = await self._repo.get_chat_by_id(
                session_id,
                user_id,
                channel,
            )
            if existing:
                return existing
        finally:
            await self._release_read()
        
        # 需要创建时升级为写锁（排他）
        await self._acquire_write()
        try:
            # 双重检查（防止在释放读锁到获取写锁之间被插入）
            existing = await self._repo.get_chat_by_id(
                session_id,
                user_id,
                channel,
            )
            if existing:
                return existing
            
            # Create new
            spec = ChatSpec(
                session_id=session_id,
                user_id=user_id,
                channel=channel,
                name=name,
            )
            # Call internal create without lock (already locked)
            await self._repo.upsert_chat(spec)
            logger.debug(
                f"Auto-registered new chat: {spec.id} -> {session_id}",
            )
            return spec
        finally:
            await self._release_write()

    async def create_chat(self, spec: ChatSpec) -> ChatSpec:
        """Create a new chat.

        Args:
            spec: Chat specification (chat_id will be generated if not set)

        Returns:
            Chat spec
        """
        await self._acquire_write()
        try:
            await self._repo.upsert_chat(spec)
            return spec
        finally:
            await self._release_write()

    async def update_chat(self, spec: ChatSpec) -> ChatSpec:
        """Update an existing chat spec.

        Args:
            spec: Updated chat specification

        Returns:
            Updated chat spec
        """
        await self._acquire_write()
        try:
            spec.updated_at = datetime.now(timezone.utc)
            await self._repo.upsert_chat(spec)
            return spec
        finally:
            await self._release_write()

    async def delete_chats(self, chat_ids: list[str]) -> bool:
        """Delete a chat spec.

        Note: This only deletes the spec. Redis session state is NOT deleted.

        Args:
            chat_ids: List of chat IDs

        Returns:
            True if deleted, False if not found
        """
        await self._acquire_write()
        try:
            deleted = await self._repo.delete_chats(chat_ids)

            if deleted:
                logger.debug(f"Deleted chats: {chat_ids}")

            return deleted
        finally:
            await self._release_write()

    async def count_chats(
        self,
        user_id: Optional[str] = None,
        channel: Optional[str] = None,
    ) -> int:
        """Count chats matching filters.

        Args:
            user_id: Optional user ID filter
            channel: Optional channel filter

        Returns:
            Number of matching chats
        """
        await self._acquire_read()
        try:
            chats = await self._repo.filter_chats(
                user_id=user_id,
                channel=channel,
            )
            return len(chats)
        finally:
            await self._release_read()
