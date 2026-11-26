"""Per-project async terminal session manager and local dev-port scanner."""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..utils import utc_now_iso
from .project_service import ProjectService
from .ws_manager import WebSocketManager

logger = logging.getLogger(__name__)

MAX_BUFFER_CHARS = 65_536
PWD_MARKER_PREFIX = "__AGY_PWD_MARKER__"

COMMON_DEV_PORTS: list[tuple[int, str]] = [
    (3000, "React / Next / Node (3000)"),
    (3001, "Dev Server (3001)"),
    (4173, "Vite Preview (4173)"),
    (4200, "Angular Dev (4200)"),
    (5000, "Flask / API (5000)"),
    (5173, "Vite Dev (5173)"),
    (5174, "Vite Dev (5174)"),
    (8000, "Python / FastAPI / Django (8000)"),
    (8080, "HTTP Proxy / Dev (8080)"),
    (8765, "Antigravity Pulse (8765)"),
    (8888, "Jupyter / Dev (8888)"),
]


@dataclass
class TerminalSession:
    """In-memory state for a tracked terminal session."""

    id: str
    title: str
    project_id: str | None
    cwd: str
    created_at: str
    running: bool = False
    buffer: str = ""
    proc: asyncio.subprocess.Process | None = None
    task: asyncio.Task[None] | None = None
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def to_summary(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "project_id": self.project_id,
            "cwd": self.cwd,
            "running": self.running,
            "created_at": self.created_at,
        }


class TerminalService:
    """Manages interactive shell sessions per project and streams output over WebSocket."""

    def __init__(self, project_service: ProjectService, ws_manager: WebSocketManager) -> None:
        self.project_service = project_service
        self.ws_manager = ws_manager
        self._sessions: dict[str, TerminalSession] = {}
        self._counter = 0

    def _resolve_initial_cwd(self, project_id: str | None) -> tuple[str | None, str, str]:
        if project_id:
            project = self.project_service.get_project(project_id)
            root = Path(project.path).expanduser().resolve()
            if not root.is_dir():
                raise HTTPException(status_code=400, detail=f"Thư mục dự án không tồn tại: {root}")
            return project.id, str(root), project.name
        default_dir = self.project_service.config.default_project_dir
        cwd = default_dir if default_dir.is_dir() else Path.cwd()
        return None, str(cwd.resolve()), "PC Shell"

    def _append_buffer(self, session: TerminalSession, text: str) -> None:
        if not text:
            return
        combined = session.buffer + text
        if len(combined) > MAX_BUFFER_CHARS:
            combined = combined[-MAX_BUFFER_CHARS:]
        session.buffer = combined

    def list_sessions(self) -> list[dict[str, Any]]:
        return [s.to_summary() for s in self._sessions.values()]

    def create_session(self, project_id: str | None = None, title: str | None = None) -> dict[str, Any]:
        resolved_pid, cwd, default_label = self._resolve_initial_cwd(project_id)
        self._counter += 1
        session_id = f"term_{secrets.token_hex(4)}"
        clean_title = (title or "").strip() or f"{default_label} #{self._counter}"
        session = TerminalSession(
            id=session_id,
            title=clean_title,
            project_id=resolved_pid,
            cwd=cwd,
            created_at=utc_now_iso(),
        )
        self._sessions[session_id] = session
        return {"session": session.to_summary(), "buffer": session.buffer}

    def get_session(self, session_id: str) -> dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Terminal session '{session_id}' not found")
        return {"session": session.to_summary(), "buffer": session.buffer}

    async def _broadcast_output(self, session_id: str, data: str, running: bool) -> None:
        await self.ws_manager.broadcast(
            "terminal.output",
            {
                "session_id": session_id,
                "data": data,
                "running": running,
            },
        )

    def _build_shell_argv(self, command: str) -> list[str]:
        if os.name == "nt":
            # Ensure UTF-8 stdout/stderr and emit final working directory marker after execution.
            script = (
                "$OutputEncoding = [System.Text.Encoding]::UTF8\n"
                "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8\n"
                f"{command}\n"
                "$__agy_ec = $LASTEXITCODE\n"
                f"Write-Output \"{PWD_MARKER_PREFIX}$((Get-Location).Path)\"\n"
                "if ($null -ne $__agy_ec -and $__agy_ec -ne 0) { exit $__agy_ec }\n"
            )
            return ["powershell.exe", "-NoLogo", "-NoProfile", "-Command", script]

        script = (
            f"{command}\n"
            "__agy_ec=$?\n"
            f"printf '\\n{PWD_MARKER_PREFIX}%s\\n' \"$(pwd)\"\n"
            "exit $__agy_ec\n"
        )
        return ["/bin/bash", "-lc", script]

    async def exec_command(self, session_id: str, command: str) -> dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Terminal session '{session_id}' not found")

        clean_cmd = (command or "").strip()
        if not clean_cmd:
            raise HTTPException(status_code=400, detail="Lệnh không được để trống")

        if session.running:
            raise HTTPException(status_code=409, detail="Phiên terminal đang chạy lệnh khác. Hãy chờ hoặc nhấn Ctrl+C.")

        # Handle clear / cls directly to avoid Windows redirected-handle Clear-Host error
        if clean_cmd.lower() in {"clear", "cls", "clear-host"}:
            session.buffer = ""
            await self._broadcast_output(session_id, "", False)
            return {"accepted": True, "session_id": session_id}

        session.running = True
        header = f"$ {clean_cmd}\n"
        self._append_buffer(session, header)
        await self._broadcast_output(session_id, header, True)

        session.task = asyncio.create_task(self._run_command_task(session, clean_cmd))
        return {"accepted": True, "session_id": session_id}

    async def _run_command_task(self, session: TerminalSession, command: str) -> None:
        argv = self._build_shell_argv(command)
        proc: asyncio.subprocess.Process | None = None
        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=session.cwd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
                limit=2 * 1024 * 1024,
            )
            session.proc = proc
            assert proc.stdout is not None

            while True:
                raw_line = await proc.stdout.readline()
                if not raw_line:
                    break
                text = raw_line.decode("utf-8", errors="replace")
                stripped = text.strip()
                if stripped.startswith(PWD_MARKER_PREFIX):
                    new_cwd = stripped[len(PWD_MARKER_PREFIX) :].strip()
                    if new_cwd and Path(new_cwd).is_dir():
                        session.cwd = str(Path(new_cwd).resolve())
                    continue
                self._append_buffer(session, text)
                await self._broadcast_output(session.id, text, True)

            rc = await proc.wait()
            if rc not in (0, None):
                tail = f"[exit {rc}]\n"
                self._append_buffer(session, tail)
                await self._broadcast_output(session.id, tail, False)
            else:
                await self._broadcast_output(session.id, "", False)
        except asyncio.CancelledError:
            if proc is not None and proc.returncode is None:
                try:
                    proc.terminate()
                except Exception:
                    pass
            raise
        except Exception as exc:
            err_line = f"[error] {exc}\n"
            self._append_buffer(session, err_line)
            await self._broadcast_output(session.id, err_line, False)
        finally:
            session.proc = None
            session.task = None
            session.running = False

    async def _terminate_session_process(self, session: TerminalSession) -> None:
        proc = session.proc
        if proc is not None and proc.returncode is None:
            try:
                proc.terminate()
            except Exception:
                pass
            try:
                await asyncio.wait_for(proc.wait(), timeout=1.5)
            except asyncio.TimeoutError:
                try:
                    proc.kill()
                except Exception:
                    pass
        task = session.task
        if task is not None and not task.done():
            task.cancel()
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        session.proc = None
        session.task = None
        session.running = False

    async def interrupt(self, session_id: str) -> dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail=f"Terminal session '{session_id}' not found")
        was_running = session.running or session.proc is not None
        await self._terminate_session_process(session)
        if was_running:
            self._append_buffer(session, "^C\n")
            await self._broadcast_output(session_id, "^C\n", False)
        return {"interrupted": True}

    async def delete_session(self, session_id: str) -> dict[str, Any]:
        session = self._sessions.pop(session_id, None)
        if not session:
            raise HTTPException(status_code=404, detail=f"Terminal session '{session_id}' not found")
        await self._terminate_session_process(session)
        return {"deleted": True}

    async def stop_all(self) -> None:
        for session in list(self._sessions.values()):
            await self._terminate_session_process(session)
        self._sessions.clear()

    @staticmethod
    async def _probe_port(port: int, label: str) -> dict[str, Any] | None:
        writer: asyncio.StreamWriter | None = None
        try:
            _, writer = await asyncio.wait_for(
                asyncio.open_connection("127.0.0.1", port),
                timeout=0.12,
            )
            return {
                "port": port,
                "url": f"http://127.0.0.1:{port}",
                "label": label,
            }
        except Exception:
            return None
        finally:
            if writer is not None:
                try:
                    writer.close()
                    await writer.wait_closed()
                except Exception:
                    pass

    async def scan_ports(self) -> list[dict[str, Any]]:
        results = await asyncio.gather(
            *(self._probe_port(port, label) for port, label in COMMON_DEV_PORTS),
            return_exceptions=False,
        )
        return [item for item in results if item is not None]
