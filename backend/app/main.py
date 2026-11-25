"""FastAPI application factory, lifespan wiring, and dynamic PWA SPA serving."""

from __future__ import annotations

import asyncio
import mimetypes
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response

from .config import AppConfig
from .routers import antigravity, auth, google_auth, projects, prompts, system, ws
from .services.auth_service import AuthService
from .services.brain_scanner import BrainScanner
from .services.discord_rpc_service import DiscordRpcService
from .services.file_watcher import FileWatcherService
from .services.google_auth_service import GoogleAuthService
from .services.models_service import ModelsService
from .services.project_service import ProjectService
from .services.quick_connect_service import QuickConnectService
from .services.runner_service import RunnerService
from .services.settings_service import SettingsService
from .services.tunnel_service import TunnelService
from .services.ws_manager import WebSocketManager
from .utils import safe_jail_path

STATIC_ASSET_EXTS = {
    ".js",
    ".mjs",
    ".css",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".ico",
    ".webmanifest",
    ".json",
    ".map",
    ".woff",
    ".woff2",
    ".ttf",
}


def create_app(config: AppConfig | None = None, *, start_watcher: bool = True) -> FastAPI:
    cfg = config or AppConfig()

    settings_service = SettingsService(cfg)
    google_auth_service = GoogleAuthService(cfg, settings_service)
    models_service = ModelsService(cfg, settings_service, google_auth_service)
    auth_service = AuthService(settings_service)
    ws_manager = WebSocketManager()
    project_service = ProjectService(cfg, settings_service)
    brain_scanner = BrainScanner(settings_service)
    tunnel_service = TunnelService(cfg.agy_port, ws_manager, settings_service)
    quick_connect_service = QuickConnectService(cfg.agy_port, settings_service, tunnel_service, ws_manager)
    runner_service = RunnerService(
        cfg,
        settings_service,
        project_service,
        ws_manager,
        google_auth_service=google_auth_service,
    )
    file_watcher = FileWatcherService(settings_service, project_service, ws_manager)
    discord_rpc_service = DiscordRpcService(settings_service, project_service, brain_scanner)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        ws_manager.set_event_loop(asyncio.get_running_loop())
        runner_service.start()
        probe_task: asyncio.Task[Any] | None = None
        if start_watcher:
            probe_task = asyncio.create_task(google_auth_service.probe_agy_session(force=False))
            quick_connect_service.start_background_sync()
            file_watcher.start()
            discord_rpc_service.start()
        try:
            yield
        finally:
            if probe_task is not None and not probe_task.done():
                probe_task.cancel()
            discord_rpc_service.stop()
            quick_connect_service.stop_background_sync()
            file_watcher.stop()
            await runner_service.stop()
            await tunnel_service.stop()

    app = FastAPI(
        title="Antigravity Pulse",
        version="1.0.0",
        lifespan=lifespan,
    )

    app.state.config = cfg
    app.state.start_monotonic = time.monotonic()
    app.state.settings_service = settings_service
    app.state.google_auth_service = google_auth_service
    app.state.models_service = models_service
    app.state.auth_service = auth_service
    app.state.ws_manager = ws_manager
    app.state.project_service = project_service
    app.state.brain_scanner = brain_scanner
    app.state.tunnel_service = tunnel_service
    app.state.quick_connect_service = quick_connect_service
    app.state.runner_service = runner_service
    app.state.file_watcher = file_watcher
    app.state.discord_rpc_service = discord_rpc_service

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth.router)
    app.include_router(google_auth.router)
    app.include_router(projects.router)
    app.include_router(antigravity.router)
    app.include_router(prompts.router)
    app.include_router(system.router)
    app.include_router(ws.router)

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str, request: Request) -> Response:
        normalized = full_path.lstrip("/")
        if normalized == "api" or normalized.startswith("api/") or normalized == "ws":
            raise HTTPException(status_code=404, detail="Not Found")

        dist_dir = cfg.frontend_dist_dir
        index_file = dist_dir / "index.html"
        if not dist_dir.is_dir() or not index_file.is_file():
            return HTMLResponse(
                content=(
                    "<!doctype html><html><head><meta charset='utf-8'>"
                    "<title>Antigravity Pulse</title></head>"
                    "<body style='font-family:system-ui;background:#090d16;color:#e5e7eb;padding:2rem'>"
                    "<h1>Antigravity Pulse Backend</h1>"
                    "<p>REST API and WebSocket are running. Frontend bundle not found at "
                    f"<code>{dist_dir}</code>.</p>"
                    "<p>Run <code>npm.cmd run build</code> inside <code>frontend/</code>.</p>"
                    "</body></html>"
                ),
                status_code=200,
            )

        if normalized:
            candidate, _ = safe_jail_path(dist_dir, normalized, allow_root=True)
            if candidate.is_file():
                mime_type, _ = mimetypes.guess_type(str(candidate))
                if candidate.suffix.lower() == ".webmanifest":
                    mime_type = "application/manifest+json"
                elif candidate.suffix.lower() in {".js", ".mjs"}:
                    mime_type = "application/javascript"

                headers: dict[str, str] = {}
                if candidate.name in {"sw.js", "index.html", "manifest.webmanifest"}:
                    headers["Cache-Control"] = "no-cache"
                return FileResponse(
                    path=str(candidate),
                    media_type=mime_type or "application/octet-stream",
                    headers=headers,
                )

            if Path(normalized).suffix.lower() in STATIC_ASSET_EXTS:
                raise HTTPException(status_code=404, detail="Static asset not found")

        return FileResponse(
            path=str(index_file),
            media_type="text/html; charset=utf-8",
            headers={"Cache-Control": "no-cache"},
        )

    return app


app = create_app()
