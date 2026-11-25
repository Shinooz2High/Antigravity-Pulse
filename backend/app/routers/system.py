"""System status, settings, and Cloudflare tunnel management endpoints."""

from __future__ import annotations

import importlib.metadata
import os
import platform
import shutil
import socket
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ..models import (
    MobileBuildInfo,
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


@router.get("/mobile-builds", response_model=MobileBuildInfo)
async def get_mobile_builds(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> MobileBuildInfo:
    """Returns availability and download metadata for Android APK and iOS builds."""
    settings = request.app.state.settings_service
    tunnel = request.app.state.tunnel_service
    port = request.app.state.config.agy_port

    lan_ip = get_lan_ip()
    lan_url = f"http://{lan_ip}:{port}"
    tailscale_ip = get_tailscale_ip()
    tailscale_url = f"http://{tailscale_ip}:{port}" if tailscale_ip else None
    preferred_url = tunnel.tunnel_url or tailscale_url or lan_url
    pair_token = settings.get_pair_token()
    pin = settings.get_pin()

    deep_link = (
        f"agypulse://pair?url={quote(preferred_url, safe='')}&pair={quote(pair_token, safe='')}&pin={quote(pin, safe='')}"
    )

    base_dir = Path(__file__).resolve().parent.parent.parent
    builds_dir = base_dir / "data" / "builds"
    builds_dir.mkdir(parents=True, exist_ok=True)

    # Check Android APK
    apk_candidate_1 = builds_dir / "Antigravity-Pulse.apk"
    apk_candidate_2 = (
        base_dir.parent / "frontend" / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
    )
    apk_file = apk_candidate_1 if apk_candidate_1.exists() else (apk_candidate_2 if apk_candidate_2.exists() else None)

    android_apk_available = apk_file is not None and apk_file.exists()
    android_apk_size = apk_file.stat().st_size if android_apk_available and apk_file else None
    android_apk_updated = (
        datetime.fromtimestamp(apk_file.stat().st_mtime, tz=timezone.utc).isoformat()
        if android_apk_available and apk_file
        else None
    )

    # Check iOS IPA
    ipa_file = builds_dir / "Antigravity-Pulse.ipa"
    ios_ipa_available = ipa_file.exists()
    ios_ipa_size = ipa_file.stat().st_size if ios_ipa_available else None
    ios_ipa_updated = (
        datetime.fromtimestamp(ipa_file.stat().st_mtime, tz=timezone.utc).isoformat()
        if ios_ipa_available
        else None
    )

    frontend_dir = base_dir.parent / "frontend"
    android_ready = (frontend_dir / "android" / "app" / "src" / "main" / "AndroidManifest.xml").exists()
    ios_ready = (frontend_dir / "ios" / "App" / "App" / "Info.plist").exists()

    return MobileBuildInfo(
        android_apk_available=android_apk_available,
        android_apk_size=android_apk_size,
        android_apk_updated_at=android_apk_updated,
        android_apk_url="/api/system/mobile-download/android" if android_apk_available else None,
        ios_ipa_available=ios_ipa_available,
        ios_ipa_size=ios_ipa_size,
        ios_ipa_updated_at=ios_ipa_updated,
        ios_ipa_url="/api/system/mobile-download/ios" if ios_ipa_available else None,
        android_project_ready=android_ready,
        ios_project_ready=ios_ready,
        deep_link_pair_url=deep_link,
    )


@router.get("/mobile-download/{platform}")
async def download_mobile_package(
    platform: str,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> FileResponse:
    """Download compiled Android APK or iOS package."""
    base_dir = Path(__file__).resolve().parent.parent.parent
    builds_dir = base_dir / "data" / "builds"

    if platform.lower() == "android":
        apk_1 = builds_dir / "Antigravity-Pulse.apk"
        apk_2 = (
            base_dir.parent / "frontend" / "android" / "app" / "build" / "outputs" / "apk" / "debug" / "app-debug.apk"
        )
        target = apk_1 if apk_1.exists() else (apk_2 if apk_2.exists() else None)
        if not target or not target.exists():
            raise HTTPException(status_code=404, detail="File APK chưa được biên dịch.")
        return FileResponse(
            path=str(target),
            filename="Antigravity-Pulse.apk",
            media_type="application/vnd.android.package-archive",
        )

    if platform.lower() == "ios":
        ipa = builds_dir / "Antigravity-Pulse.ipa"
        if not ipa.exists():
            raise HTTPException(status_code=404, detail="File IPA iOS chưa sẵn sàng.")
        return FileResponse(
            path=str(ipa),
            filename="Antigravity-Pulse.ipa",
            media_type="application/octet-stream",
        )

    raise HTTPException(status_code=400, detail=f"Nền tảng {platform} không hợp lệ.")

