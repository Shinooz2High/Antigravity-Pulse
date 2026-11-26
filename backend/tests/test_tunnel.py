"""Tests for multi-mode short TunnelService and tunnel settings persistence."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

import pytest

from app.config import AppConfig
from app.models import UpdateSettingsRequest
from app.services.settings_service import SettingsService
from app.services.tunnel_service import (
    TunnelService,
    normalize_public_url,
    sanitize_short_alias,
    sanitize_subdomain,
)
from app.services.ws_manager import WebSocketManager


@pytest.fixture(autouse=True)
def _isolate_tunnel_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for var in (
        "CLOUDFLARE_TUNNEL_TOKEN",
        "CLOUDFLARE_TUNNEL_URL",
        "AGY_TUNNEL_MODE",
        "AGY_TUNNEL_SUBDOMAIN",
        "AGY_TUNNEL_SHORT_ALIAS",
        "GEMINI_API_KEY",
        "GOOGLE_GENAI_USE_VERTEXAI",
        "GOOGLE_CLOUD_PROJECT",
        "AGY_BRIDGE_PIN",
        "AGY_MODEL",
        "AGY_AUTH_SOURCE",
    ):
        monkeypatch.delenv(var, raising=False)


def _isolated_cfg(tmp_path) -> AppConfig:
    return AppConfig(_env_file=None, AGY_DATA_DIR=str(tmp_path))


def test_sanitizers_and_normalizer() -> None:
    assert sanitize_subdomain("  My PC_01! ") == "my-pc-01"
    assert sanitize_subdomain("---") is None
    assert sanitize_short_alias("agy_pc01") == "agy_pc01"
    assert sanitize_short_alias("ab") is None  # < 5 chars
    assert normalize_public_url("pc.example.com/") == "https://pc.example.com"
    assert normalize_public_url("https://pc.example.com/") == "https://pc.example.com"
    assert normalize_public_url("   ") is None


def test_tunnel_settings_persistence(tmp_path) -> None:
    cfg = _isolated_cfg(tmp_path)
    svc = SettingsService(cfg)

    initial = svc.to_response()
    assert initial.tunnel_mode == "cloudflare_quick"
    assert initial.tunnel_auto_shorten is True
    assert initial.cloudflare_tunnel_token_set is False

    updated = svc.update(
        UpdateSettingsRequest(
            tunnel_mode="serveo_ssh",
            tunnel_subdomain="agypulse",
            tunnel_short_alias="agypulse_pc",
            tunnel_auto_shorten=False,
            cloudflare_tunnel_token="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9_secret",
            cloudflare_tunnel_url="pc.mydomain.com",
        )
    )
    assert updated.tunnel_mode == "serveo_ssh"
    assert updated.tunnel_subdomain == "agypulse"
    assert updated.tunnel_short_alias == "agypulse_pc"
    assert updated.tunnel_auto_shorten is False
    assert updated.cloudflare_tunnel_token_set is True
    assert updated.cloudflare_tunnel_url == "pc.mydomain.com"

    # Reload from disk
    svc2 = SettingsService(cfg)
    reloaded = svc2.to_response()
    assert reloaded.tunnel_mode == "serveo_ssh"
    assert reloaded.tunnel_subdomain == "agypulse"
    assert reloaded.cloudflare_tunnel_token_set is True

    # Clear token
    cleared = svc2.update(UpdateSettingsRequest(clear_cloudflare_tunnel_token=True))
    assert cleared.cloudflare_tunnel_token_set is False


class _FakeProc:
    def __init__(self, lines: list[str]) -> None:
        self._lines = list(lines)
        self._terminated = False
        self.stdout = self

    def readline(self) -> str:
        if self._lines:
            return self._lines.pop(0)
        return ""

    def poll(self):
        return 0 if self._terminated else None

    def terminate(self) -> None:
        self._terminated = True

    def kill(self) -> None:
        self._terminated = True

    def wait(self, timeout=None) -> int:
        self._terminated = True
        return 0


def test_cloudflare_quick_with_short_url(tmp_path) -> None:
    cfg = _isolated_cfg(tmp_path)
    settings = SettingsService(cfg)
    settings.update(
        UpdateSettingsRequest(
            tunnel_mode="cloudflare_quick",
            tunnel_short_alias="agypulse",
            tunnel_auto_shorten=True,
        )
    )
    ws = WebSocketManager()
    svc = TunnelService(8765, ws, settings)

    fake_proc = _FakeProc(
        [
            "INF Starting tunnel\n",
            "INF https://random-long-name.trycloudflare.com\n",
        ]
    )

    async def _run():
        with (
            patch("app.services.tunnel_service.get_tailscale_ip", return_value=None),
            patch.object(TunnelService, "get_cloudflared_binary", return_value="cloudflared"),
            patch("app.services.tunnel_service.subprocess.Popen", return_value=fake_proc),
            patch("app.services.tunnel_service.shorten_url_sync", return_value="https://is.gd/agypulse"),
        ):
            res = await svc.start()
            assert res.tunnel_running is True
            assert res.tunnel_mode == "cloudflare_quick"
            assert res.tunnel_url == "https://random-long-name.trycloudflare.com"
            assert res.tunnel_short_url == "https://is.gd/agypulse"
            await svc.stop()

    asyncio.run(_run())


def test_serveo_ssh_custom_subdomain(tmp_path) -> None:
    cfg = _isolated_cfg(tmp_path)
    settings = SettingsService(cfg)
    settings.update(
        UpdateSettingsRequest(
            tunnel_mode="serveo_ssh",
            tunnel_subdomain="agypulse",
        )
    )
    ws = WebSocketManager()
    svc = TunnelService(8765, ws, settings)

    fake_proc = _FakeProc(["Forwarding HTTP traffic from https://agypulse.serveo.net\n"])

    async def _run():
        with (
            patch("app.services.tunnel_service.get_tailscale_ip", return_value=None),
            patch.object(TunnelService, "get_ssh_binary", return_value="ssh"),
            patch("app.services.tunnel_service.subprocess.Popen", return_value=fake_proc) as popen_mock,
        ):
            res = await svc.start()
            assert res.tunnel_running is True
            assert res.tunnel_mode == "serveo_ssh"
            assert res.tunnel_url == "https://agypulse.serveo.net"
            assert res.tunnel_short_url is None
            cmd = popen_mock.call_args[0][0]
            assert "agypulse:80:127.0.0.1:8765" in cmd
            await svc.stop()

    asyncio.run(_run())


def test_cloudflare_named_requires_token_and_url(tmp_path) -> None:
    cfg = _isolated_cfg(tmp_path)
    settings = SettingsService(cfg)
    settings.update(UpdateSettingsRequest(tunnel_mode="cloudflare_named"))
    ws = WebSocketManager()
    svc = TunnelService(8765, ws, settings)

    async def _run():
        with (
            patch("app.services.tunnel_service.get_tailscale_ip", return_value=None),
            patch.object(TunnelService, "get_cloudflared_binary", return_value="cloudflared"),
        ):
            res = await svc.start()
            assert res.tunnel_running is False
            assert res.error is not None

            settings.update(
                UpdateSettingsRequest(
                    cloudflare_tunnel_token="tok_1234567890",
                    cloudflare_tunnel_url="pc.example.com",
                )
            )
            fake_proc = _FakeProc(["INF Registered tunnel connection connIndex=0\n"])
            with patch("app.services.tunnel_service.subprocess.Popen", return_value=fake_proc):
                res2 = await svc.start()
                assert res2.tunnel_running is True
                assert res2.tunnel_mode == "cloudflare_named"
                assert res2.tunnel_url == "https://pc.example.com"
                await svc.stop()

    asyncio.run(_run())
