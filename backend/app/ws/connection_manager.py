"""WebSocket connection manager for real-time notifications."""

import json
import logging
import uuid
from typing import Any, Optional
from fastapi import WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger("airmeal.ws")


class ConnectionManager:
    """In-process connection manager to handle real-time subscriptions."""

    def __init__(self):
        # Maps user_id (str) -> list of WebSocket connections
        self.user_connections: dict[str, list[WebSocket]] = {}
        # Maps flight_id (str) -> list of WebSocket connections
        self.flight_connections: dict[str, list[WebSocket]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        user_id: uuid.UUID,
        flight_id: Optional[uuid.UUID] = None,
    ):
        await websocket.accept()
        uid_str = str(user_id)
        self.user_connections.setdefault(uid_str, []).append(websocket)

        if flight_id:
            fid_str = str(flight_id)
            self.flight_connections.setdefault(fid_str, []).append(websocket)

        logger.info(f"WebSocket client connected: user={user_id}, flight={flight_id}")

    def disconnect(
        self,
        websocket: WebSocket,
        user_id: uuid.UUID,
        flight_id: Optional[uuid.UUID] = None,
    ):
        uid_str = str(user_id)
        if uid_str in self.user_connections:
            if websocket in self.user_connections[uid_str]:
                self.user_connections[uid_str].remove(websocket)
            if not self.user_connections[uid_str]:
                del self.user_connections[uid_str]

        if flight_id:
            fid_str = str(flight_id)
            if fid_str in self.flight_connections:
                if websocket in self.flight_connections[fid_str]:
                    self.flight_connections[fid_str].remove(websocket)
                if not self.flight_connections[fid_str]:
                    del self.flight_connections[fid_str]

        logger.info(f"WebSocket client disconnected: user={user_id}, flight={flight_id}")

    async def send_to_user(self, user_id: uuid.UUID, event_type: str, data: Any):
        """Send a message specifically to a user's active WebSocket sessions."""
        uid_str = str(user_id)
        if uid_str not in self.user_connections:
            return

        payload = {"event": event_type, "data": jsonable_encoder(data)}
        message = json.dumps(payload)

        # Iterate over copy to allow safe removal if connection is closed
        for connection in list(self.user_connections[uid_str]):
            try:
                await connection.send_text(message)
            except Exception:
                logger.warning(f"Failed to send WS message to user {uid_str}. Connection stale.")

    async def broadcast_to_flight(self, flight_id: uuid.UUID, event_type: str, data: Any):
        """Broadcast a message to all users subscribed to a specific flight."""
        fid_str = str(flight_id)
        if fid_str not in self.flight_connections:
            return

        payload = {"event": event_type, "data": jsonable_encoder(data)}
        message = json.dumps(payload)

        for connection in list(self.flight_connections[fid_str]):
            try:
                await connection.send_text(message)
            except Exception:
                logger.warning(f"Failed to broadcast WS message to flight {fid_str}. Connection stale.")


# Global connection manager instance
manager = ConnectionManager()
