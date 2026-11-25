"""Authentication and pairing endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Request

from ..models import (
    AuthStatusResponse,
    AuthTokenResponse,
    DevicesResponse,
    LoginRequest,
    PairInfoResponse,
    PairRequest,
    RotatePairRequest,
)
from ..services.auth_service import AuthService, extract_token_from_request, require_auth
from ..utils import generate_qr_svg_data_url, get_lan_ip, get_tailscale_ip

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _build_pair_info(request: Request) -> PairInfoResponse:
    settings = request.app.state.settings_service
    tunnel = request.app.state.tunnel_service
    port = request.app.state.config.agy_port

    lan_ip = get_lan_ip()
    lan_url = f"http://{lan_ip}:{port}"
    tailscale_ip = get_tailscale_ip()
    tailscale_url = f"http://{tailscale_ip}:{port}" if tailscale_ip else None
    tunnel_url = tunnel.tunnel_url
    tunnel_short_url = tunnel.tunnel_short_url
    preferred_url = tunnel_url or tailscale_url or lan_url
    pair_token = settings.get_pair_token()
    pair_url = f"{preferred_url}/?pair={pair_token}"
    pin = settings.get_pin()
    qr_svg_data_url = generate_qr_svg_data_url(pair_url)

    return PairInfoResponse(
        lan_url=lan_url,
        tailscale_url=tailscale_url,
        tunnel_url=tunnel_url,
        tunnel_short_url=tunnel_short_url,
        preferred_url=preferred_url,
        pair_url=pair_url,
        pin=pin,
        qr_svg_data_url=qr_svg_data_url,
    )


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status(request: Request) -> AuthStatusResponse:
    auth_service: AuthService = request.app.state.auth_service
    token = extract_token_from_request(request)
    record = auth_service.validate_token(token, touch=False)
    return AuthStatusResponse(
        authenticated=record is not None,
        auth_required=True,
        pin_configured=True,
        device_name=record.get("device_name") if record else None,
    )


@router.post("/login", response_model=AuthTokenResponse)
async def login(body: LoginRequest, request: Request) -> AuthTokenResponse:
    auth_service: AuthService = request.app.state.auth_service
    return auth_service.login_with_pin(body.pin, body.device_name)


@router.post("/pair", response_model=AuthTokenResponse)
async def pair(body: PairRequest, request: Request) -> AuthTokenResponse:
    auth_service: AuthService = request.app.state.auth_service
    return auth_service.login_with_pair_token(body.pair_token, body.device_name)


@router.get("/pair-info", response_model=PairInfoResponse)
async def pair_info(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> PairInfoResponse:
    return _build_pair_info(request)


@router.post("/rotate-pair", response_model=PairInfoResponse)
async def rotate_pair(
    request: Request,
    body: RotatePairRequest | None = Body(default=None),
    _: dict[str, Any] = Depends(require_auth),
) -> PairInfoResponse:
    settings = request.app.state.settings_service
    settings.rotate_pair(body.pin if body else None)
    return _build_pair_info(request)


@router.get("/devices", response_model=DevicesResponse)
async def list_devices(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> DevicesResponse:
    auth_service: AuthService = request.app.state.auth_service
    ws_manager = request.app.state.ws_manager
    devices = auth_service.list_devices(ws_manager.online_device_ids())
    return DevicesResponse(devices=devices)
