"""System status, settings, and Cloudflare tunnel management endpoints."""

from __future__ import annotations

import importlib.metadata
import os
import platform
import shutil
import socket
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request

from ..models import (
    ModelListResponse,
    SelectModelRequest,
    SystemSettingsResponse,
    SystemStatusResponse,
    TunnelStartResponse,
    TunnelStopResponse,
    UpdateSettingsRequest,
)
from ..services.auth_service import require_auth
from ..services.models_service import ModelsService
from ..utils import get_lan_ip, get_tailscale_ip

router = APIRouter(prefix="/api/system", tags=["system"])


def get_sdk_info() -> tuple[bool, str | None]:
    try:
        import google.antigravity  # noqa: F401
    except Exception:
        return False, None
    try:
        version = importlib.metadata.version("google-antigravity")
    except Exception:
        version = getattr(google.antigravity, "__version__", None)
    return True, version


@router.get("/status", response_model=SystemStatusResponse)
async def system_status(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> SystemStatusResponse:
    settings = request.app.state.settings_service
    scanner = request.app.state.brain_scanner
    tunnel = request.app.state.tunnel_service
    ws_manager = request.app.state.ws_manager
    port = request.app.state.config.agy_port
    start_time = request.app.state.start_monotonic

    sdk_installed, sdk_version = get_sdk_info()
    api_key_configured = bool(settings.get_effective_api_key())
    vertex_enabled, vertex_project, _ = settings.get_effective_vertex()
    vertex_configured = bool(vertex_enabled and vertex_project)
    sdk_configured = bool(sdk_installed and (api_key_configured or vertex_configured))

    lan_ip = get_lan_ip()
    lan_url = f"http://{lan_ip}:{port}"
    tailscale_ip = get_tailscale_ip()
    tailscale_url = f"http://{tailscale_ip}:{port}" if tailscale_ip else None

    return SystemStatusResponse(
        hostname=socket.gethostname(),
        os=f"{platform.system()} {platform.release()}",
        python_version=platform.python_version(),
        sdk_installed=sdk_installed,
        sdk_version=sdk_version,
        sdk_configured=sdk_configured,
        api_key_configured=api_key_configured,
        vertex_configured=vertex_configured,
        agy_cli_found=(
            shutil.which("agy") is not None
            or (Path.home() / ".gemini" / "bin" / ("agy.exe" if os.name == "nt" else "agy")).exists()
        ),
        brain_dir=str(scanner.brain_dir),
        brain_session_count=len(scanner.list_sessions()),
        lan_ip=lan_ip,
        port=port,
        lan_url=lan_url,
        tailscale_url=tailscale_url,
        cloudflared_installed=tunnel.is_cloudflared_installed(),
        tunnel_running=tunnel.is_running,
        tunnel_url=tunnel.tunnel_url,
        connected_clients=ws_manager.connected_count(),
        uptime_seconds=round(max(0.0, time.monotonic() - start_time), 1),
    )


@router.get("/settings", response_model=SystemSettingsResponse)
async def get_settings(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> SystemSettingsResponse:
    return request.app.state.settings_service.to_response()


@router.put("/settings", response_model=SystemSettingsResponse)
async def update_settings(
    body: UpdateSettingsRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> SystemSettingsResponse:
    settings = request.app.state.settings_service
    updated = settings.update(body)
    if body.brain_dir is not None:
        request.app.state.file_watcher.refresh_watches()
    return updated


@router.post("/tunnel/start", response_model=TunnelStartResponse)
async def start_tunnel(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> TunnelStartResponse:
    tunnel = request.app.state.tunnel_service
    return await tunnel.start()


@router.post("/tunnel/stop", response_model=TunnelStopResponse)
async def stop_tunnel(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> TunnelStopResponse:
    tunnel = request.app.state.tunnel_service
    return await tunnel.stop()


@router.get("/models", response_model=ModelListResponse)
async def list_models(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> ModelListResponse:
    models_service: ModelsService = request.app.state.models_service
    runner = getattr(request.app.state, "runner_service", None)
    return models_service.list_models_with_quota(runner)


@router.post("/models/select", response_model=SystemSettingsResponse)
async def select_model(
    body: SelectModelRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> SystemSettingsResponse:
    settings = request.app.state.settings_service
    clean_model = body.model.strip()
    if not clean_model:
        raise HTTPException(status_code=400, detail="Tên model không được để trống")
    updated = settings.update(UpdateSettingsRequest(model=clean_model))
    ws_manager = request.app.state.ws_manager
    await ws_manager.broadcast("system.model_changed", {"model": clean_model})
    return updated
