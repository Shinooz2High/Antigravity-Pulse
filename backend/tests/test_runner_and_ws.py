"""Tests for prompt runner (demo, cli, sdk guard), approvals, queue, WebSocket, and file watcher."""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import create_app


def _drain_ws_until(ws: Any, target_type: str, max_events: int = 80) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    seen: list[dict[str, Any]] = []
    for _ in range(max_events):
        msg = ws.receive_json()
        seen.append(msg)
        if msg.get("type") == target_type:
            return msg, seen
    raise AssertionError(f"Did not observe WS event '{target_type}'. Seen: {[m.get('type') for m in seen]}")


def test_ws_auth_and_demo_mobile_approval_flow(
    client: TestClient,
) -> None:
    # Unauthenticated WS must be rejected
    with pytest.raises(Exception):
        with client.websocket_connect("/ws?token=bad-token"):
            pass

    login = client.post("/api/auth/login", json={"pin": "123456", "device_name": "E2E Phone"})
    assert login.status_code == 200
    token = login.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    projects = client.get("/api/projects", headers=headers).json()["projects"]
    project_id = projects[0]["id"]

    with client.websocket_connect(f"/ws?token={token}&device=E2E%20Phone") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "connection.hello"
        presence = ws.receive_json()
        assert presence["type"] == "presence.updated"

        run_res = client.post(
            "/api/prompts/run",
            json={
                "project_id": project_id,
                "prompt": "Kiểm tra workspace và tạo báo cáo",
                "engine_mode": "demo",
                "execution_policy": "ask_mobile",
            },
            headers=headers,
        )
        assert run_res.status_code == 200
        run_id = run_res.json()["id"]

        approval_evt, pre_events = _drain_ws_until(ws, "prompt.approval_required")
        pre_types = {e["type"] for e in pre_events}
        assert "prompt.thought_delta" in pre_types
        assert "prompt.tool_call" in pre_types

        approval = approval_evt["payload"]["approval"]
        assert approval["run_id"] == run_id
        approval_id = approval["approval_id"]

        # Verify GET /api/prompts lists pending approval
        list_res = client.get("/api/prompts", headers=headers).json()
        assert any(a["approval_id"] == approval_id for a in list_res["pending_approvals"])

        # Approve from mobile
        apr_res = client.post(
            f"/api/prompts/{run_id}/approve",
            json={"approval_id": approval_id, "approved": True},
            headers=headers,
        )
        assert apr_res.status_code == 200
        assert apr_res.json() == {"approval_id": approval_id, "approved": True}

        completed_evt, post_events = _drain_ws_until(ws, "prompt.completed")
        assert completed_evt["payload"]["status"] == "completed"
        post_types = {e["type"] for e in post_events}
        assert "prompt.approval_resolved" in post_types
        assert "prompt.token_delta" in post_types

    # Verify generated report.md artifact is readable and protected from traversal
    final_run = client.get(f"/api/prompts/{run_id}", headers=headers).json()
    assert final_run["status"] == "completed"
    assert any(a["name"] == "report.md" for a in final_run["output_artifacts"])

    report_content = client.get(
        f"/api/prompts/{run_id}/artifact-content?path=report.md",
        headers=headers,
    )
    assert report_content.status_code == 200
    assert "Antigravity Pulse Report" in report_content.json()["text"]

    bad_art = client.get(
        f"/api/prompts/{run_id}/artifact-raw?path=../../settings.json",
        headers=headers,
    )
    assert bad_art.status_code in (400, 403)

    # Also indexed in unified artifacts gallery
    all_arts = client.get("/api/antigravity/artifacts", headers=headers).json()["artifacts"]
    assert any(a["source"] == "prompt_run" and a["scope_id"] == run_id for a in all_arts)


def test_sdk_unconfigured_fails_cleanly_and_cli_works(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    project_id = client.get("/api/projects", headers=auth_headers).json()["projects"][0]["id"]

    # antigravity_sdk without API key must fail cleanly with settings guidance
    sdk_run = client.post(
        "/api/prompts/run",
        json={
            "project_id": project_id,
            "prompt": "Summarize files",
            "engine_mode": "antigravity_sdk",
            "execution_policy": "read_only",
        },
        headers=auth_headers,
    ).json()
    run_id = sdk_run["id"]

    deadline = time.monotonic() + 5.0
    final_sdk = None
    while time.monotonic() < deadline:
        cur = client.get(f"/api/prompts/{run_id}", headers=auth_headers).json()
        if cur["status"] in {"completed", "failed", "cancelled"}:
            final_sdk = cur
            break
        time.sleep(0.05)

    assert final_sdk is not None
    assert final_sdk["status"] == "failed"
    assert "GEMINI_API_KEY" in (final_sdk["error"] or "")

    # CLI read_only allows safe command and rejects dangerous command
    safe_cli = client.post(
        "/api/prompts/run",
        json={
            "project_id": project_id,
            "prompt": "python --version",
            "engine_mode": "cli",
            "execution_policy": "read_only",
        },
        headers=auth_headers,
    ).json()
    deadline = time.monotonic() + 8.0
    final_cli = None
    while time.monotonic() < deadline:
        cur = client.get(f"/api/prompts/{safe_cli['id']}", headers=auth_headers).json()
        if cur["status"] in {"completed", "failed", "cancelled"}:
            final_cli = cur
            break
        time.sleep(0.05)
    assert final_cli is not None
    assert final_cli["status"] == "completed"
    assert "Python" in final_cli["response_text"]

    blocked_cli = client.post(
        "/api/prompts/run",
        json={
            "project_id": project_id,
            "prompt": "Remove-Item README.md",
            "engine_mode": "cli",
            "execution_policy": "read_only",
        },
        headers=auth_headers,
    ).json()
    deadline = time.monotonic() + 5.0
    final_blocked = None
    while time.monotonic() < deadline:
        cur = client.get(f"/api/prompts/{blocked_cli['id']}", headers=auth_headers).json()
        if cur["status"] in {"completed", "failed", "cancelled"}:
            final_blocked = cur
            break
        time.sleep(0.05)
    assert final_blocked is not None
    assert final_blocked["status"] == "failed"


def test_cancel_awaiting_approval_and_spa_fallback(
    client: TestClient,
    auth_headers: dict[str, str],
) -> None:
    project_id = client.get("/api/projects", headers=auth_headers).json()["projects"][0]["id"]
    run = client.post(
        "/api/prompts/run",
        json={
            "project_id": project_id,
            "prompt": "Pause for cancel test",
            "engine_mode": "demo",
            "execution_policy": "ask_mobile",
        },
        headers=auth_headers,
    ).json()
    run_id = run["id"]

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        cur = client.get(f"/api/prompts/{run_id}", headers=auth_headers).json()
        if cur["status"] == "awaiting_approval":
            break
        time.sleep(0.05)

    cancelled = client.post(f"/api/prompts/{run_id}/cancel", headers=auth_headers)
    assert cancelled.status_code == 200
    assert cancelled.json() == {"run_id": run_id, "status": "cancelled"}

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        cur = client.get(f"/api/prompts/{run_id}", headers=auth_headers).json()
        if cur["status"] == "cancelled":
            break
        time.sleep(0.05)
    assert cur["status"] == "cancelled"

    # SPA fallback and API 404 check
    root_html = client.get("/")
    assert root_html.status_code == 200
    assert "Pulse PWA" in root_html.text

    spa_route = client.get("/outputs/some-session")
    assert spa_route.status_code == 200
    assert "Pulse PWA" in spa_route.text

    api_404 = client.get("/api/does-not-exist", headers=auth_headers)
    assert api_404.status_code == 404


def test_file_watcher_emits_ws_event(isolated_env: dict[str, Path]) -> None:
    cfg = AppConfig()
    app = create_app(cfg, start_watcher=True)
    with TestClient(app) as tc:
        token = tc.post("/api/auth/login", json={"pin": "123456", "device_name": "WatchTest"}).json()["token"]
        with tc.websocket_connect(f"/ws?token={token}&device=WatchTest") as ws:
            assert ws.receive_json()["type"] == "connection.hello"
            assert ws.receive_json()["type"] == "presence.updated"

            # Create a file inside watched workspace
            watched_file = isolated_env["workspace_dir"] / "live_sync_probe.txt"
            watched_file.write_text("realtime sync check", encoding="utf-8")

            evt, _ = _drain_ws_until(ws, "workspace.changed", max_events=20)
            assert evt["payload"]["path"] == "live_sync_probe.txt"
