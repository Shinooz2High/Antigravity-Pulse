"""Tests for Google Account OAuth 2.0, ADC, and Antigravity (AGY) unified auth integration."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import create_app


def _make_client(tmp_path: Path) -> TestClient:
    cfg = AppConfig(
        AGY_BRIDGE_PIN="123456",
        AGY_DATA_DIR=str(tmp_path / "data"),
        AGY_BRAIN_DIR=str(tmp_path / "brain"),
    )
    app = create_app(cfg, start_watcher=False)
    return TestClient(app)


def _auth_headers(client: TestClient) -> dict[str, str]:
    r = client.post("/api/auth/login", json={"pin": "123456", "device_name": "pytest"})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['token']}"}


def test_google_auth_status_and_agy_models(tmp_path: Path) -> None:
    client = _make_client(tmp_path)
    headers = _auth_headers(client)

    async def fake_probe(force: bool = False):
        del force
        return (
            True,
            [
                {"id": "gemini-4-carbon-high", "display_name": "Gemini 4 Carbon (High)"},
                {"id": "gemini-3.8-flash-high", "display_name": "Gemini 3.8 Flash (High)"},
                {"id": "claude-sonnet-4-6", "display_name": "Claude Sonnet 4.6 (Thinking)"},
            ],
            None,
        )

    svc = client.app.state.google_auth_service
    with patch.object(svc, "probe_agy_session", side_effect=fake_probe):
        resp = client.get("/api/system/google-auth/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["agy_authenticated"] is True
        assert body["agy_model_count"] == 3
        assert body["effective_auth_source"] == "agy_account"


def test_google_oauth_pkce_flow_and_callback(tmp_path: Path) -> None:
    client = _make_client(tmp_path)
    headers = _auth_headers(client)

    # 1. Save OAuth Client JSON
    client_json = '{"installed":{"client_id":"12345-abc.apps.googleusercontent.com","client_secret":"sec_xyz","project_id":"demo-proj"}}'
    r_save = client.post(
        "/api/system/google-auth/oauth-client",
        json={"client_json": client_json},
        headers=headers,
    )
    assert r_save.status_code == 200
    assert r_save.json()["oauth_client_configured"] is True
    assert r_save.json()["quota_project_id"] == "demo-proj"

    # 2. Start OAuth flow
    r_start = client.post(
        "/api/system/google-auth/oauth-start",
        json={"open_on_pc": False, "redirect_origin": "http://10.20.179.126:8765"},
        headers=headers,
    )
    assert r_start.status_code == 200
    start_data = r_start.json()
    assert "accounts.google.com/o/oauth2/v2/auth" in start_data["auth_url"]
    # LAN IP must automatically fall back to localhost redirect URI for Google OAuth compliance
    assert start_data["redirect_uri"].startswith("http://localhost:")
    state = start_data["state"]

    # 3. Complete callback (mocking Google token exchange & userinfo)
    svc = client.app.state.google_auth_service
    with (
        patch.object(
            svc,
            "_http_post_form",
            return_value={
                "access_token": "ya29.mock_oauth_access_token",
                "refresh_token": "1//mock_refresh_token",
                "expires_in": 3600,
                "scope": "openid email profile https://www.googleapis.com/auth/cloud-platform",
            },
        ),
        patch.object(
            svc,
            "_fetch_google_profile",
            return_value={
                "email": "dev@example.com",
                "name": "Dev User",
                "picture": "https://example.com/avatar.png",
            },
        ),
    ):
        r_cb = client.get(f"/api/system/google-auth/callback?code=auth_code_999&state={state}")
        assert r_cb.status_code == 200
        assert "dev@example.com" in r_cb.text

    # 4. Verify connected status & token retrieval
    r_status = client.get("/api/system/google-auth/status", headers=headers)
    assert r_status.status_code == 200
    st = r_status.json()
    assert st["google_connected"] is True
    assert st["google_email"] == "dev@example.com"
    assert st["google_has_refresh_token"] is True
    assert st["effective_auth_source"] == "google_oauth"

    tok, proj = svc.get_valid_access_token()
    assert tok == "ya29.mock_oauth_access_token"
    assert proj == "demo-proj"

    # 5. Logout
    r_out = client.post("/api/system/google-auth/logout", headers=headers)
    assert r_out.status_code == 200
    assert r_out.json()["google_connected"] is False


def test_public_continue_with_google_app_login_flow(tmp_path: Path) -> None:
    client = _make_client(tmp_path)

    # Setup + Start pre-auth Google login using PIN once
    r_start = client.post(
        "/api/auth/google/setup-and-start",
        json={
            "pin": "123456",
            "client_id": "99999-test.apps.googleusercontent.com",
            "client_secret": "sec_999",
            "device_name": "Phone Chrome",
            "redirect_origin": "https://demo.trycloudflare.com",
        },
    )
    assert r_start.status_code == 200
    start_data = r_start.json()
    assert start_data["redirect_uri"] == "https://demo.trycloudflare.com/api/system/google-auth/callback"
    state = start_data["state"]

    # Before callback completes, poll returns ready=False
    r_poll_before = client.get(f"/api/auth/google/poll?state={state}")
    assert r_poll_before.status_code == 200
    assert r_poll_before.json()["ready"] is False

    # Simulate Google OAuth callback
    svc = client.app.state.google_auth_service
    with (
        patch.object(
            svc,
            "_http_post_form",
            return_value={
                "access_token": "ya29.app_login_tok",
                "refresh_token": "1//refresh_tok",
                "expires_in": 3600,
                "scope": "openid email profile",
            },
        ),
        patch.object(
            svc,
            "_fetch_google_profile",
            return_value={"email": "user@gmail.com", "name": "Test Google User"},
        ),
    ):
        r_cb = client.get(f"/api/system/google-auth/callback?code=code_abc&state={state}")
        assert r_cb.status_code == 200
        assert "AGY_GOOGLE_APP_LOGIN_SUCCESS" in r_cb.text

    # Poll returns ready=True with a valid Antigravity Pulse bearer token!
    r_poll_after = client.get(f"/api/auth/google/poll?state={state}")
    assert r_poll_after.status_code == 200
    polled = r_poll_after.json()
    assert polled["ready"] is True
    assert polled["email"] == "user@gmail.com"
    bearer = polled["token"]

    # Verify the minted session token authenticates normal app endpoints!
    r_status = client.get("/api/auth/status", headers={"Authorization": f"Bearer {bearer}"})
    assert r_status.status_code == 200
    assert r_status.json()["authenticated"] is True

