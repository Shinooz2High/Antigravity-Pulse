"""WebSocket connection registry and event broadcaster."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import WebSocket

from ..utils import utc_now_iso

logger = logging.getLogger(__name__)


class WebSocketManager:
    """Manages active mobile/desktop WebSocket clients and broadcasts events."""

    def __init__(self) -> None:
        self._clients: dict[WebSocket, dict[str, str]] = {}
        self._loop: asyncio.AbstractEventLoop | None = None
        self._lock = asyncio.Lock()
        self._bg_tasks: set[asyncio.Task[None]] = set()

    def set_event_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connected_count(self) -> int:
        return len(self._clients)

    def online_device_ids(self) -> set[str]:
        return {info["device_id"] for info in self._clients.values() if info.get("device_id")}

    async def connect(self, websocket: WebSocket, device_id: str, device_name: str) -> None:
        if self._loop is None:
            self._loop = asyncio.get_running_loop()

        await websocket.accept()
        async with self._lock:
            self._clients[websocket] = {
                "device_id": device_id,
                "device_name": device_name,
                "connected_at": utc_now_iso(),
            }
            count = len(self._clients)

        await self._safe_send(
            websocket,
            {
                "type": "connection.hello",
                "timestamp": utc_now_iso(),
                "payload": {
                    "device_id": device_id,
                    "device_name": device_name,
                    "connected_clients": count,
                },
            },
        )
        await self.broadcast(
            "presence.updated",
            {
                "connected_clients": count,
                "online_device_ids": sorted(self.online_device_ids()),
                "device_id": device_id,
                "device_name": device_name,
                "status": "online",
            },
        )

    async def disconnect(self, websocket: WebSocket) -> None:
        info: dict[str, str] | None = None
        async with self._lock:
            info = self._clients.pop(websocket, None)
            count = len(self._clients)

        if info is not None:
            await self.broadcast(
                "presence.updated",
                {
                    "connected_clients": count,
                    "online_device_ids": sorted(self.online_device_ids()),
                    "device_id": info.get("device_id", ""),
                    "device_name": info.get("device_name", ""),
                    "status": "offline",
                },
            )

    async def _safe_send(self, websocket: WebSocket, message: dict[str, Any]) -> bool:
        try:
            await websocket.send_json(message)
            return True
        except Exception:
            return False

    async def broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        message = {
            "type": event_type,
            "timestamp": utc_now_iso(),
            "payload": payload,
        }
        async with self._lock:
            targets = list(self._clients.keys())

        if not targets:
            return

        results = await asyncio.gather(
            *(self._safe_send(ws, message) for ws in targets),
            return_exceptions=True,
        )
        dead: list[WebSocket] = []
        for ws, res in zip(targets, results):
            if res is not True:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.pop(ws, None)

    def _spawn_broadcast(self, event_type: str, payload: dict[str, Any]) -> None:
        task = asyncio.create_task(self.broadcast(event_type, payload))
        self._bg_tasks.add(task)
        task.add_done_callback(self._bg_tasks.discard)

    def broadcast_from_thread(self, event_type: str, payload: dict[str, Any]) -> None:
        """Bridge synchronous/watchdog thread events onto the FastAPI asyncio loop."""
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        try:
            loop.call_soon_threadsafe(self._spawn_broadcast, event_type, payload)
        except RuntimeError as exc:
            logger.debug("Skipping WS broadcast on closed loop: %s", exc)
