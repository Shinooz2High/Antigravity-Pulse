"""Pytest fixtures for Antigravity Pulse backend tests."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Iterator

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import pytest
from fastapi.testclient import TestClient

from app.config import AppConfig
from app.main import create_app


@pytest.fixture()
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    data_dir = tmp_path / "data"
    brain_dir = tmp_path / "brain"
    workspace_dir = tmp_path / "workspace"
    frontend_dist = tmp_path / "frontend_dist"

    data_dir.mkdir(parents=True, exist_ok=True)
    brain_dir.mkdir(parents=True, exist_ok=True)
    workspace_dir.mkdir(parents=True, exist_ok=True)
    frontend_dist.mkdir(parents=True, exist_ok=True)
    (frontend_dist / "index.html").write_text("<!doctype html><html><body>Pulse PWA</body></html>", encoding="utf-8")
    (workspace_dir / "README.md").write_text("# Test Workspace\nHello world\n", encoding="utf-8")

    monkeypatch.setenv("AGY_DATA_DIR", str(data_dir))
    monkeypatch.setenv("AGY_BRAIN_DIR", str(brain_dir))
    monkeypatch.setenv("AGY_DEFAULT_PROJECT", str(workspace_dir))
    monkeypatch.setenv("AGY_FRONTEND_DIST", str(frontend_dist))
    monkeypatch.setenv("AGY_BRIDGE_PIN", "123456")
    monkeypatch.setenv("AGY_AUTH_SOURCE", "api_key")
    monkeypatch.setenv("GEMINI_API_KEY", "")

    return {
        "tmp": tmp_path,
        "data_dir": data_dir,
        "brain_dir": brain_dir,
        "workspace_dir": workspace_dir,
        "frontend_dist": frontend_dist,
    }


@pytest.fixture()
def client(isolated_env: dict[str, Path]) -> Iterator[TestClient]:
    cfg = AppConfig()
    app = create_app(cfg, start_watcher=False)
    with TestClient(app) as tc:
        yield tc


@pytest.fixture()
def auth_headers(client: TestClient) -> dict[str, str]:
    resp = client.post("/api/auth/login", json={"pin": "123456", "device_name": "Pytest Phone"})
    assert resp.status_code == 200
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}"}
