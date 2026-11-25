"""Tests for authentication, PIN/pair login, token auth, and pairing info."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_unauthenticated_access_rejected(client: TestClient) -> None:
    status_resp = client.get("/api/auth/status")
    assert status_resp.status_code == 200
    assert status_resp.json() == {
        "authenticated": False,
        "auth_required": True,
        "pin_configured": True,
        "device_name": None,
    }

    for path in (
        "/api/projects",
        "/api/antigravity/sessions",
        "/api/system/status",
        "/api/auth/pair-info",
        "/api/auth/devices",
    ):
        r = client.get(path)
        assert r.status_code == 401, f"Expected 401 on {path}, got {r.status_code}"


def test_pin_login_and_query_token(client: TestClient) -> None:
    bad = client.post("/api/auth/login", json={"pin": "000000", "device_name": "Bad"})
    assert bad.status_code == 401

    ok = client.post("/api/auth/login", json={"pin": "123456", "device_name": "iPhone 16"})
    assert ok.status_code == 200
    data = ok.json()
    assert data["token"]
    assert data["expires_at"]
    assert data["device_id"].startswith("dev_")

    # Bearer header works
    status_bearer = client.get("/api/auth/status", headers={"Authorization": f"Bearer {data['token']}"})
    assert status_bearer.status_code == 200
    assert status_bearer.json()["authenticated"] is True
    assert status_bearer.json()["device_name"] == "iPhone 16"

    # Query ?token= works for <img>/<iframe>/downloads
    status_query = client.get(f"/api/projects?token={data['token']}")
    assert status_query.status_code == 200


def test_pair_token_and_rotate(client: TestClient, auth_headers: dict[str, str]) -> None:
    info = client.get("/api/auth/pair-info", headers=auth_headers)
    assert info.status_code == 200
    body = info.json()
    assert body["pin"] == "123456"
    assert "/?pair=" in body["pair_url"]
    assert body["qr_svg_data_url"].startswith("data:image/svg+xml;base64,")

    old_pair_token = body["pair_url"].split("?pair=")[1]
    paired = client.post("/api/auth/pair", json={"pair_token": old_pair_token, "device_name": "Pixel 9"})
    assert paired.status_code == 200
    assert paired.json()["token"]

    rotated = client.post("/api/auth/rotate-pair", json={"pin": "654321"}, headers=auth_headers)
    assert rotated.status_code == 200
    new_body = rotated.json()
    assert new_body["pin"] == "654321"
    new_pair_token = new_body["pair_url"].split("?pair=")[1]
    assert new_pair_token != old_pair_token

    # Old pair_token and old PIN must fail now
    assert client.post("/api/auth/pair", json={"pair_token": old_pair_token}).status_code == 401
    assert client.post("/api/auth/login", json={"pin": "123456"}).status_code == 401
    assert client.post("/api/auth/login", json={"pin": "654321"}).status_code == 200

    devices = client.get("/api/auth/devices", headers=auth_headers)
    assert devices.status_code == 200
    names = {d["device_name"] for d in devices.json()["devices"]}
    assert "Pytest Phone" in names
    assert "Pixel 9" in names
