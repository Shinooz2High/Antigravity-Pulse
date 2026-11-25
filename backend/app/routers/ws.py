"""WebSocket real-time event stream endpoint."""

from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter(tags=["ws"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    device_param = (websocket.query_params.get("device") or "").strip()

    auth_service = websocket.app.state.auth_service
    ws_manager = websocket.app.state.ws_manager

    record = auth_service.validate_token(token, touch=True)
    if not record:
        await websocket.close(code=4401, reason="Unauthorized")
        return

    device_id = str(record.get("device_id", ""))
    device_name = device_param or str(record.get("device_name", "Mobile Device"))

    await ws_manager.connect(websocket, device_id, device_name)
    try:
        while True:
            # Keep connection open and handle optional client pings
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await ws_manager.disconnect(websocket)
    except Exception:
        await ws_manager.disconnect(websocket)
