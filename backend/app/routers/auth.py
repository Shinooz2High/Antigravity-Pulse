"""Authentication and pairing endpoints."""

from __future__ import annotations

import asyncio
import hmac
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from ..models import (
    AuthStatusResponse,
    AuthTokenResponse,
    DevicesResponse,
    GoogleOAuthStartRequest,
    GoogleOAuthStartResponse,
    LoginRequest,
    PairInfoResponse,
    PairRequest,
    RotatePairRequest,
)
from ..services.auth_service import AuthService, extract_token_from_request, require_auth
from ..services.google_auth_service import GoogleAuthService
from ..utils import generate_qr_svg_data_url, get_lan_ip, get_tailscale_ip
from .google_auth import _resolve_oauth_redirect_uri

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


# --- Public Pre-Auth "Continue with Google" Login Endpoints ---


def _is_direct_localhost_request(request: Request) -> bool:
    if request.headers.get("cf-connecting-ip") or request.headers.get("x-forwarded-for"):
        return False
    host = request.client.host if request.client else ""
    return host in {"127.0.0.1", "::1", "localhost"}


class PublicGoogleStartRequest(BaseModel):
    device_name: str | None = None
    redirect_origin: str | None = None
    open_on_pc: bool = False


class PublicGoogleSetupAndStartRequest(BaseModel):
    pin: str
    client_id: str | None = None
    client_secret: str | None = None
    client_json: str | None = None
    device_name: str | None = None
    redirect_origin: str | None = None


class PublicGoogleTokenLoginRequest(BaseModel):
    pin: str
    access_token: str
    device_name: str | None = None


class PublicLocalAgyLoginRequest(BaseModel):
    device_name: str | None = None


@router.get("/google/info")
async def public_google_login_info(request: Request) -> dict[str, Any]:
    svc: GoogleAuthService = request.app.state.google_auth_service
    agy_ok, _, _ = await svc.probe_agy_session(force=False)
    is_local = _is_direct_localhost_request(request)
    redirect_hint = _resolve_oauth_redirect_uri(request, GoogleOAuthStartRequest())
    return {
        "oauth_client_configured": svc.is_oauth_client_configured(),
        "agy_authenticated": agy_ok,
        "is_local_request": is_local,
        "redirect_uri_hint": redirect_hint,
    }


@router.post("/google/start", response_model=GoogleOAuthStartResponse)
async def public_google_login_start(
    body: PublicGoogleStartRequest,
    request: Request,
) -> GoogleOAuthStartResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    redirect_uri = _resolve_oauth_redirect_uri(
        request,
        GoogleOAuthStartRequest(
            open_on_pc=body.open_on_pc,
            redirect_origin=body.redirect_origin,
        ),
    )
    data = await asyncio.to_thread(
        svc.create_oauth_authorization_url,
        redirect_uri=redirect_uri,
        open_on_pc=body.open_on_pc,
        purpose="app_login",
        device_name=body.device_name,
    )
    return GoogleOAuthStartResponse(**data)


@router.get("/google/poll")
async def public_google_login_poll(
    request: Request,
    state: str = Query(...),
) -> dict[str, Any]:
    svc: GoogleAuthService = request.app.state.google_auth_service
    result = svc.consume_login_result(state)
    if not result:
        return {"ready": False}
    return {"ready": True, **result}


@router.post("/google/local-agy", response_model=AuthTokenResponse)
async def public_google_local_agy_login(
    body: PublicLocalAgyLoginRequest,
    request: Request,
) -> AuthTokenResponse:
    """Allow 1-click Google/AGY login ONLY from direct localhost on the host PC."""
    if not _is_direct_localhost_request(request):
        raise HTTPException(
            status_code=403,
            detail="Đăng nhập 1 chạm bằng phiên AGY chỉ khả dụng trên localhost của máy tính chủ.",
        )
    svc: GoogleAuthService = request.app.state.google_auth_service
    agy_ok, _, _ = await svc.probe_agy_session(force=False)
    if not agy_ok:
        raise HTTPException(
            status_code=401,
            detail="Phiên Antigravity (AGY) trên PC chưa đăng nhập Google.",
        )
    auth_service: AuthService = request.app.state.auth_service
    return auth_service.login_with_google_profile(
        name="Antigravity Google Account",
        device_name=body.device_name or "Local PC",
    )


@router.post("/google/setup-and-start", response_model=GoogleOAuthStartResponse)
async def public_google_setup_and_start(
    body: PublicGoogleSetupAndStartRequest,
    request: Request,
) -> GoogleOAuthStartResponse:
    """Verify PC PIN once, save Google OAuth Client ID/JSON, and immediately start Google Sign-In."""
    settings = request.app.state.settings_service
    expected_pin = settings.get_pin()
    if not body.pin.strip() or not hmac.compare_digest(body.pin.strip(), expected_pin):
        raise HTTPException(status_code=401, detail="Mã PIN máy tính không đúng.")

    svc: GoogleAuthService = request.app.state.google_auth_service
    await asyncio.to_thread(
        svc.save_oauth_client,
        client_id=body.client_id,
        client_secret=body.client_secret,
        client_json=body.client_json,
    )
    redirect_uri = _resolve_oauth_redirect_uri(
        request,
        GoogleOAuthStartRequest(redirect_origin=body.redirect_origin),
    )
    data = await asyncio.to_thread(
        svc.create_oauth_authorization_url,
        redirect_uri=redirect_uri,
        open_on_pc=False,
        purpose="app_login",
        device_name=body.device_name,
    )
    return GoogleOAuthStartResponse(**data)


@router.post("/google/login-token", response_model=AuthTokenResponse)
async def public_google_token_login(
    body: PublicGoogleTokenLoginRequest,
    request: Request,
) -> AuthTokenResponse:
    """Verify PC PIN + Google Access Token (ya29...), save token, and log into the app."""
    settings = request.app.state.settings_service
    expected_pin = settings.get_pin()
    if not body.pin.strip() or not hmac.compare_digest(body.pin.strip(), expected_pin):
        raise HTTPException(status_code=401, detail="Mã PIN máy tính không đúng.")

    svc: GoogleAuthService = request.app.state.google_auth_service
    await asyncio.to_thread(svc.save_direct_access_token, access_token=body.access_token)
    st = await svc.get_status(force_probe=False)
    auth_service: AuthService = request.app.state.auth_service
    return auth_service.login_with_google_profile(
        email=st.google_email,
        name=st.google_name,
        device_name=body.device_name,
    )

