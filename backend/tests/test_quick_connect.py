"""Tests for QuickConnect encrypted 6-char code round-trip and API endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import create_app
from app.services.quick_connect_service import (
    decrypt_quick_payload,
    encrypt_quick_payload,
    format_quick_code,
)


def test_quick_connect_encrypt_decrypt_and_login(tmp_path: Path) -> None:
    payload = {
        "v": 1,
        "urls": ["https://demo.trycloudflare.com", "http://10.43.22.42:8765"],
        "pair_token": "abcdef0123456789abcdef0123456789",
        "hostname": "DEV-PC",
    }
    encrypted = encrypt_quick_payload("K7M-9P4", payload)
    assert encrypted.startswith("agyp1.")

    # Works with or without hyphen and case-insensitively
    decrypted = decrypt_quick_payload("k7m9p4", encrypted)
    assert decrypted["pair_token"] == payload["pair_token"]
    assert decrypted["urls"] == payload["urls"]
    assert format_quick_code("k7m9p4") == "K7M-9P4"

    # Wrong code must fail HMAC check
    try:
        decrypt_quick_payload("X9Y8Z7", encrypted)
        assert False, "Expected ValueError on wrong code"
    except ValueError:
        pass

    # Verify /api/auth/ping and login with quick_code
    cfg = AppConfig(
        AGY_BRIDGE_PIN="123456",
        AGY_DATA_DIR=str(tmp_path / "data"),
        AGY_BRAIN_DIR=str(tmp_path / "brain"),
    )
    app = create_app(cfg, start_watcher=False)
    client = TestClient(app)

    ping = client.get("/api/auth/ping")
    assert ping.status_code == 200
    assert ping.json()["app"] == "antigravity-pulse"

    quick_code = app.state.settings_service.get_quick_code()
    r_login = client.post(
        "/api/auth/login",
        json={"pin": format_quick_code(quick_code), "device_name": "QuickPhone"},
    )
    assert r_login.status_code == 200
    tok = r_login.json()["token"]

    r_pair_info = client.get("/api/auth/pair-info", headers={"Authorization": f"Bearer {tok}"})
    assert r_pair_info.status_code == 200
    assert r_pair_info.json()["quick_code"] == format_quick_code(quick_code)
