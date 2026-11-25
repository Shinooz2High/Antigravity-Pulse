"""Tests for projects, jailed workspace browsing, uploads, and system endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def test_seeded_project_and_crud(
    client: TestClient,
    auth_headers: dict[str, str],
    isolated_env: dict[str, Path],
) -> None:
    res = client.get("/api/projects", headers=auth_headers)
    assert res.status_code == 200
    projects = res.json()["projects"]
    assert len(projects) == 1
    default_proj = projects[0]
    assert Path(default_proj["path"]).resolve() == isolated_env["workspace_dir"].resolve()
    assert default_proj["exists"] is True

    extra_dir = isolated_env["tmp"] / "extra_repo"
    extra_dir.mkdir()
    (extra_dir / "báo_cáo.md").write_text("# Xin chào\nNội dung tiếng Việt", encoding="utf-8")

    created = client.post(
        "/api/projects",
        json={
            "name": "Extra Repo",
            "path": str(extra_dir),
            "description": "Second project",
            "engine_mode": "demo",
            "execution_policy": "read_only",
        },
        headers=auth_headers,
    )
    assert created.status_code == 200
    pid = created.json()["id"]

    patched = client.patch(
        f"/api/projects/{pid}",
        json={"name": "Extra Repo Updated", "execution_policy": "ask_mobile"},
        headers=auth_headers,
    )
    assert patched.status_code == 200
    assert patched.json()["name"] == "Extra Repo Updated"
    assert patched.json()["execution_policy"] == "ask_mobile"

    # File listing and Unicode content/raw download
    files = client.get(f"/api/projects/{pid}/files", headers=auth_headers)
    assert files.status_code == 200
    assert any(e["name"] == "báo_cáo.md" for e in files.json()["entries"])

    content = client.get(f"/api/projects/{pid}/file-content?path=báo_cáo.md", headers=auth_headers)
    assert content.status_code == 200
    assert "Xin chào" in content.json()["text"]

    raw = client.get(f"/api/projects/{pid}/file-raw?path=báo_cáo.md&download=1", headers=auth_headers)
    assert raw.status_code == 200
    assert "attachment" in raw.headers.get("content-disposition", "")

    # Traversal attempts must return 400 or 403
    for evil in ("../../Windows/win.ini", "..\\..\\secret.txt", "C:\\Windows\\win.ini", "/etc/passwd"):
        r1 = client.get(f"/api/projects/{pid}/file-content?path={evil}", headers=auth_headers)
        r2 = client.get(f"/api/projects/{pid}/file-raw?path={evil}", headers=auth_headers)
        assert r1.status_code in (400, 403), f"Expected 400/403 for {evil}, got {r1.status_code}"
        assert r2.status_code in (400, 403), f"Expected 400/403 for {evil}, got {r2.status_code}"

    deleted = client.delete(f"/api/projects/{pid}", headers=auth_headers)
    assert deleted.status_code == 200
    assert deleted.json() == {"deleted": True}


def test_uploads_settings_and_tunnel(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    up = client.post(
        "/api/prompts/upload",
        files=[("files", ("notes.txt", b"Hello from mobile", "text/plain"))],
        headers=auth_headers,
    )
    assert up.status_code == 200
    attachments = up.json()["attachments"]
    assert len(attachments) == 1
    att = attachments[0]
    assert att["name"] == "notes.txt"

    raw_att = client.get(att["raw_url"], headers=auth_headers)
    assert raw_att.status_code == 200
    assert raw_att.content == b"Hello from mobile"

    status_res = client.get("/api/system/status", headers=auth_headers)
    assert status_res.status_code == 200
    status_json = status_res.json()
    assert status_json["api_key_configured"] is False
    assert status_json["sdk_configured"] is False

    upd = client.put(
        "/api/system/settings",
        json={"gemini_api_key": "AIzaSyTestSecretKey1234", "default_engine_mode": "demo"},
        headers=auth_headers,
    )
    assert upd.status_code == 200
    assert upd.json()["gemini_api_key_set"] is True
    assert upd.json()["gemini_api_key_masked"] == "AIza***************1234"
    assert upd.json()["default_engine_mode"] == "demo"

    # Empty string ignored unless clear_api_key=true
    upd_empty = client.put("/api/system/settings", json={"gemini_api_key": ""}, headers=auth_headers)
    assert upd_empty.status_code == 200
    assert upd_empty.json()["gemini_api_key_set"] is True

    cleared = client.put("/api/system/settings", json={"clear_api_key": True}, headers=auth_headers)
    assert cleared.status_code == 200
    assert cleared.json()["gemini_api_key_set"] is False

    # Tunnel start returns clean JSON even when cloudflared is absent
    tunnel_res = client.post("/api/system/tunnel/start", headers=auth_headers)
    assert tunnel_res.status_code == 200
    assert "tunnel_running" in tunnel_res.json()
