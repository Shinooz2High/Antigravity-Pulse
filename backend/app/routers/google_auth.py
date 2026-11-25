"""Endpoints for Google Account OAuth 2.0 login, ADC import, and Antigravity (AGY) account token usage."""

from __future__ import annotations

import asyncio
import html
import urllib.parse
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import HTMLResponse

from ..models import (
    GoogleAuthStatusResponse,
    GoogleDirectTokenRequest,
    GoogleOAuthClientRequest,
    GoogleOAuthManualCallbackRequest,
    GoogleOAuthStartRequest,
    GoogleOAuthStartResponse,
    UpdateSettingsRequest,
)
from ..services.auth_service import require_auth
from ..services.google_auth_service import GoogleAuthService

router = APIRouter(prefix="/api/system/google-auth", tags=["google-auth"])


def _resolve_oauth_redirect_uri(request: Request, body: GoogleOAuthStartRequest) -> str:
    """Choose a Google-OAuth-compliant redirect URI (HTTPS tunnel or localhost loopback)."""
    port = request.app.state.config.agy_port
    localhost_cb = f"http://localhost:{port}/api/system/google-auth/callback"

    if body.open_on_pc:
        return localhost_cb

    candidate_origin = (body.redirect_origin or "").strip().rstrip("/")
    if not candidate_origin:
        scheme = request.headers.get("x-forwarded-proto") or request.url.scheme
        host = request.headers.get("x-forwarded-host") or request.headers.get("host") or f"localhost:{port}"
        candidate_origin = f"{scheme}://{host}"

    try:
        parsed = urllib.parse.urlparse(candidate_origin)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme == "https" and hostname:
            return f"{parsed.scheme}://{parsed.netloc}/api/system/google-auth/callback"
        if hostname in {"localhost", "127.0.0.1"}:
            return f"http://{parsed.netloc}/api/system/google-auth/callback"
    except Exception:
        pass

    # Google OAuth blocks private LAN IPs (10.x / 192.168.x); fallback to localhost callback
    return localhost_cb


@router.get("/status", response_model=GoogleAuthStatusResponse)
async def google_auth_status(
    request: Request,
    refresh: bool = Query(default=False),
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    return await svc.get_status(force_probe=refresh)


@router.post("/agy-login")
async def launch_agy_login(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> dict[str, Any]:
    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    res = await asyncio.to_thread(svc.launch_agy_login_terminal)
    settings.update(UpdateSettingsRequest(auth_source="agy_account"))
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", {"source": "agy_account"})
    return res


@router.post("/agy-use-account", response_model=GoogleAuthStatusResponse)
async def activate_agy_account_mode(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    await asyncio.to_thread(svc.clear_agy_cli_api_key_override)
    settings.update(UpdateSettingsRequest(auth_source="agy_account"))
    status = await svc.get_status(force_probe=True)
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
    return status


@router.post("/oauth-client", response_model=GoogleAuthStatusResponse)
async def save_google_oauth_client(
    body: GoogleOAuthClientRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    await asyncio.to_thread(
        svc.save_oauth_client,
        client_id=body.client_id,
        client_secret=body.client_secret,
        client_json=body.client_json,
        quota_project_id=body.quota_project_id,
    )
    return await svc.get_status(force_probe=False)


@router.post("/oauth-start", response_model=GoogleOAuthStartResponse)
async def start_google_oauth(
    body: GoogleOAuthStartRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleOAuthStartResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    redirect_uri = _resolve_oauth_redirect_uri(request, body)
    data = await asyncio.to_thread(
        svc.create_oauth_authorization_url,
        redirect_uri=redirect_uri,
        open_on_pc=body.open_on_pc,
    )
    return GoogleOAuthStartResponse(**data)


@router.get("/callback", response_class=HTMLResponse, include_in_schema=False)
async def google_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> HTMLResponse:
    if error:
        safe_err = html.escape(error)
        return HTMLResponse(
            content=(
                "<!doctype html><html><head><meta charset='utf-8'><title>Đăng nhập Google thất bại</title></head>"
                "<body style='font-family:system-ui;background:#090d16;color:#f87171;padding:2rem;text-align:center'>"
                f"<h2>Đăng nhập Google bị hủy hoặc lỗi: {safe_err}</h2>"
                "<p style='color:#94a3b8'>Bạn có thể đóng tab này và thử lại trong Antigravity Pulse.</p>"
                "</body></html>"
            ),
            status_code=400,
        )

    if not code or not state:
        return HTMLResponse(
            content="<h3>Thiếu tham số `code` hoặc `state` từ Google OAuth.</h3>",
            status_code=400,
        )

    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    try:
        info = await asyncio.to_thread(svc.complete_oauth_callback, code=code, state=state)
        settings.update(UpdateSettingsRequest(auth_source="google_oauth"))
        status = await svc.get_status(force_probe=False)
        await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
        email = html.escape(str(info.get("email") or "Google Account"))
        return HTMLResponse(
            content=(
                "<!doctype html><html><head><meta charset='utf-8'>"
                "<meta name='viewport' content='width=device-width,initial-scale=1'>"
                "<title>Đăng nhập Google thành công</title></head>"
                "<body style='font-family:system-ui;background:#090d16;color:#e2e8f0;padding:2.5rem 1.5rem;text-align:center'>"
                "<div style='max-width:420px;margin:0 auto;background:#111827;border:1px solid #1e293b;border-radius:20px;padding:1.75rem'>"
                "<div style='font-size:42px'>✅</div>"
                "<h2 style='color:#34d399;margin:0.5rem 0'>Đã kết nối Tài khoản Google!</h2>"
                f"<p style='color:#cbd5e1;font-size:14px'>Tài khoản: <strong>{email}</strong></p>"
                "<p style='color:#94a3b8;font-size:12px'>Token đã được lưu an toàn trên PC cho Antigravity Pulse. Cửa sổ này sẽ tự đóng...</p>"
                "<button onclick='window.close()' style='margin-top:1rem;background:#06b6d4;color:#020617;border:0;border-radius:10px;padding:10px 20px;font-weight:700;cursor:pointer'>Đóng cửa sổ</button>"
                "</div>"
                "<script>"
                "try { if (window.opener) { window.opener.postMessage({ type: 'AGY_GOOGLE_OAUTH_SUCCESS' }, '*'); } } catch (e) {}"
                "setTimeout(function(){ window.close(); }, 1800);"
                "</script></body></html>"
            ),
            status_code=200,
        )
    except HTTPException as exc:
        safe_detail = html.escape(str(exc.detail))
        return HTMLResponse(
            content=(
                "<!doctype html><html><head><meta charset='utf-8'><title>Lỗi xác thực Google</title></head>"
                "<body style='font-family:system-ui;background:#090d16;color:#f87171;padding:2rem;text-align:center'>"
                f"<h3>Không thể hoàn tất đăng nhập Google</h3><p>{safe_detail}</p></body></html>"
            ),
            status_code=exc.status_code,
        )


@router.post("/oauth-manual-callback", response_model=GoogleAuthStatusResponse)
async def manual_google_oauth_callback(
    body: GoogleOAuthManualCallbackRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    raw = body.callback_url_or_code.strip()
    code = raw
    state = (body.state or "").strip()

    if "code=" in raw:
        parsed = urllib.parse.urlparse(raw if "://" in raw else f"http://localhost/?{raw.lstrip('?')}")
        qs = urllib.parse.parse_qs(parsed.query)
        code = (qs.get("code") or [""])[0].strip()
        if not state:
            state = (qs.get("state") or [""])[0].strip()

    if not code or not state:
        raise HTTPException(
            status_code=400,
            detail="Không tìm thấy `code` hoặc `state`. Hãy dán toàn bộ đường dẫn URL trên thanh địa chỉ sau khi đăng nhập Google.",
        )

    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    await asyncio.to_thread(svc.complete_oauth_callback, code=code, state=state)
    settings.update(UpdateSettingsRequest(auth_source="google_oauth"))
    status = await svc.get_status(force_probe=False)
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
    return status


@router.post("/direct-token", response_model=GoogleAuthStatusResponse)
async def save_direct_google_token(
    body: GoogleDirectTokenRequest,
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    await asyncio.to_thread(
        svc.save_direct_access_token,
        access_token=body.access_token,
        refresh_token=body.refresh_token,
        quota_project_id=body.quota_project_id,
    )
    settings.update(UpdateSettingsRequest(auth_source="google_oauth"))
    status = await svc.get_status(force_probe=False)
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
    return status


@router.post("/import-adc", response_model=GoogleAuthStatusResponse)
async def import_gcloud_adc_credentials(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    await asyncio.to_thread(svc.import_from_gcloud_adc)
    settings.update(UpdateSettingsRequest(auth_source="google_oauth"))
    status = await svc.get_status(force_probe=False)
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
    return status


@router.post("/logout", response_model=GoogleAuthStatusResponse)
async def logout_google_account(
    request: Request,
    _: dict[str, Any] = Depends(require_auth),
) -> GoogleAuthStatusResponse:
    svc: GoogleAuthService = request.app.state.google_auth_service
    settings = request.app.state.settings_service
    await asyncio.to_thread(svc.logout_google_oauth)
    if settings.get_auth_source() == "google_oauth":
        settings.update(UpdateSettingsRequest(auth_source="auto"))
    status = await svc.get_status(force_probe=False)
    await request.app.state.ws_manager.broadcast("system.google_auth_changed", status.model_dump())
    return status
