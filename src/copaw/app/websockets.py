
from fastapi import WebSocket
from typing import Dict, List
import asyncio
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket
        logger.info(f"New WebSocket connection for user {user_id}")

    def disconnect(self, user_id: str):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            logger.info(f"WebSocket connection closed for user {user_id}")

    async def send_to_user(self, user_id: str, message: str):
        if user_id in self.active_connections:
            websocket = self.active_connections[user_id]
            try:
                await websocket.send_text(message)
                logger.info(f"Sent message to user {user_id}: {message}")
                return True
            except Exception as e:
                logger.error(f"Failed to send message to user {user_id}: {e}")
                self.disconnect(user_id)
                return False
        else:
            logger.warning(f"No active WebSocket connection for user {user_id}")
            return False

# Create a single instance of the manager to be used across the application
websocket_manager = ConnectionManager()
