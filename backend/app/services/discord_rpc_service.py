"""Zero-dependency Discord Rich Presence (IPC) service for Antigravity Pulse.

Connects to the local Discord Desktop IPC pipe (Windows named pipe or Unix domain socket),
displays the active Antigravity project/session, and shows an elapsed timer on the user's
Discord profile automatically while working in AGY.
"""

from __future__ import annotations

import json
import os
import socket
import struct
import threading
import time
import uuid
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .brain_scanner import BrainScanner
    from .project_service import ProjectService
    from .settings_service import SettingsService


OP_HANDSHAKE = 0
OP_FRAME = 1
OP_CLOSE = 2


class _DiscordIPCTransport:
    """Minimal cross-platform Discord IPC transport (Windows named pipe / Unix socket)."""

    def __init__(self) -> None:
        self._pipe_file: Any | None = None
        self._sock: socket.socket | None = None

    def connect(self) -> bool:
        self.close()
        if os.name == "nt":
            for i in range(10):
                pipe_path = rf"\\.\pipe\discord-ipc-{i}"
                try:
                    self._pipe_file = open(pipe_path, "r+b", buffering=0)
                    return True
                except OSError:
                    continue
            return False

        # macOS / Linux Unix socket paths
        base_dirs = [
            os.environ.get("XDG_RUNTIME_DIR"),
            os.environ.get("TMPDIR"),
            os.environ.get("TMP"),
            os.environ.get("TEMP"),
            "/tmp",
        ]
        for base in base_dirs:
            if not base:
                continue
            for i in range(10):
                for candidate in (
                    os.path.join(base, f"discord-ipc-{i}"),
                    os.path.join(base, "app", "com.discordapp.Discord", f"discord-ipc-{i}"),
                    os.path.join(base, "snap.discord", f"discord-ipc-{i}"),
                ):
                    if not os.path.exists(candidate):
                        continue
                    try:
                        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                        s.settimeout(3.0)
                        s.connect(candidate)
                        self._sock = s
                        return True
                    except OSError:
                        continue
        return False

    @property
    def is_open(self) -> bool:
        return self._pipe_file is not None or self._sock is not None

    def send(self, opcode: int, payload: dict[str, Any]) -> None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        frame = struct.pack("<II", opcode, len(data)) + data
        if self._pipe_file is not None:
            self._pipe_file.write(frame)
            self._pipe_file.flush()
        elif self._sock is not None:
            self._sock.sendall(frame)
        else:
            raise OSError("Discord IPC not connected")

    def _read_exact(self, n: int) -> bytes:
        buf = bytearray()
        while len(buf) < n:
            if self._pipe_file is not None:
                chunk = self._pipe_file.read(n - len(buf))
            elif self._sock is not None:
                chunk = self._sock.recv(n - len(buf))
            else:
                raise OSError("Discord IPC not connected")
            if not chunk:
                raise OSError("Discord IPC pipe closed")
            buf.extend(chunk)
        return bytes(buf)

    def recv(self) -> tuple[int, dict[str, Any]]:
        header = self._read_exact(8)
        opcode, length = struct.unpack("<II", header)
        if length > 2_000_000:
            raise OSError(f"Invalid Discord IPC frame length: {length}")
        raw = self._read_exact(length)
        return opcode, json.loads(raw.decode("utf-8", errors="replace"))

    def close(self) -> None:
        if self._pipe_file is not None:
            try:
                self._pipe_file.close()
            except Exception:
                pass
            self._pipe_file = None
        if self._sock is not None:
            try:
                self._sock.close()
            except Exception:
                pass
            self._sock = None


class DiscordRpcService:
    """Background manager keeping Discord Rich Presence synced with active AGY work."""

    def __init__(
        self,
        settings_service: SettingsService,
        project_service: ProjectService,
        brain_scanner: BrainScanner,
    ) -> None:
        self.settings_service = settings_service
        self.project_service = project_service
        self.brain_scanner = brain_scanner

        self._lock = threading.RLock()
        self._stop_event = threading.Event()
        self._wake_event = threading.Event()
        self._thread: threading.Thread | None = None
        self._ipc = _DiscordIPCTransport()

        self._connected_client_id: str | None = None
        self._session_start_ts: int = int(time.time())
        self._last_payload_sig: str | None = None
        self._status: str = "disabled"
        self._detail_text: str | None = None
        self._state_text: str | None = None
        self._last_error: str | None = None

    def start(self) -> None:
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return
            self._stop_event.clear()
            self._wake_event.set()
            self._thread = threading.Thread(
                target=self._run_loop,
                name="discord-rpc-worker",
                daemon=True,
            )
            self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._wake_event.set()
        t = self._thread
        if t is not None and t.is_alive():
            t.join(timeout=2.0)
        with self._lock:
            self._disconnect_locked(clear_activity=True)
            self._status = "disabled"

    def refresh(self, *, reset_timer: bool = False) -> None:
        with self._lock:
            if reset_timer:
                self._session_start_ts = int(time.time())
            self._last_payload_sig = None
        self._wake_event.set()

    def get_status(self) -> dict[str, Any]:
        with self._lock:
            return {
                "enabled": self.settings_service.get_discord_rpc_enabled(),
                "status": self._status,
                "connected": self._status == "connected",
                "details": self._detail_text,
                "state": self._state_text,
                "started_at": self._session_start_ts if self._status == "connected" else None,
                "elapsed_seconds": max(0, int(time.time()) - self._session_start_ts)
                if self._status == "connected"
                else 0,
                "error": self._last_error,
            }

    def _build_activity(self) -> tuple[str, str, dict[str, Any]]:
        project_name = "Antigravity Workspace"
        try:
            projects = self.project_service.list_projects()
            if projects:
                project_name = projects[0].name or project_name
        except Exception:
            pass

        state_text = "Coding with Google Antigravity"
        try:
            sessions = self.brain_scanner.list_sessions()
            if sessions:
                latest = sessions[0]
                title = (latest.title or "").strip()
                if title and len(title) >= 3:
                    clean_title = title[:64] + ("..." if len(title) > 64 else "")
                    state_text = f"Task: {clean_title}"
        except Exception:
            pass

        details_text = f"Workspace: {project_name}"[:120]
        state_text = state_text[:120]

        activity: dict[str, Any] = {
            "details": details_text,
            "state": state_text,
            "timestamps": {
                "start": self._session_start_ts,
            },
        }

        large_image = self.settings_service.get_discord_large_image()
        if large_image:
            activity["assets"] = {
                "large_image": large_image,
                "large_text": "Google Antigravity",
            }

        return details_text, state_text, activity

    def _disconnect_locked(self, *, clear_activity: bool = False) -> None:
        if self._ipc.is_open:
            if clear_activity:
                try:
                    self._ipc.send(
                        OP_FRAME,
                        {
                            "cmd": "SET_ACTIVITY",
                            "args": {"pid": os.getpid(), "activity": None},
                            "nonce": str(uuid.uuid4()),
                        },
                    )
                except Exception:
                    pass
            try:
                self._ipc.send(OP_CLOSE, {})
            except Exception:
                pass
            self._ipc.close()
        self._connected_client_id = None
        self._last_payload_sig = None

    def _tick(self) -> None:
        enabled = self.settings_service.get_discord_rpc_enabled()
        client_id = self.settings_service.get_discord_client_id()

        with self._lock:
            if not enabled:
                self._disconnect_locked(clear_activity=True)
                self._status = "disabled"
                self._detail_text = None
                self._state_text = None
                self._last_error = None
                return

            if not client_id:
                self._disconnect_locked(clear_activity=False)
                self._status = "missing_client_id"
                self._last_error = "Chưa nhập Discord Application ID."
                return

            # Reconnect if client_id changed or IPC dropped
            if not self._ipc.is_open or self._connected_client_id != client_id:
                self._disconnect_locked(clear_activity=False)
                if not self._ipc.connect():
                    self._status = "waiting_discord"
                    self._last_error = "Chưa thấy app Discord Desktop đang chạy trên PC."
                    return
                try:
                    self._ipc.send(OP_HANDSHAKE, {"v": 1, "client_id": client_id})
                    _op, resp = self._ipc.recv()
                    if resp.get("evt") == "ERROR":
                        msg = (resp.get("data") or {}).get("message") or "Discord từ chối Application ID."
                        self._disconnect_locked(clear_activity=False)
                        self._status = "error"
                        self._last_error = str(msg)
                        return
                    self._connected_client_id = client_id
                    self._session_start_ts = int(time.time())
                    self._last_payload_sig = None
                except Exception as exc:
                    self._disconnect_locked(clear_activity=False)
                    self._status = "waiting_discord"
                    self._last_error = f"Không bắt tay được với Discord: {exc}"
                    return

            details_text, state_text, activity = self._build_activity()
            sig = json.dumps(activity, sort_keys=True)
            if sig == self._last_payload_sig and self._status == "connected":
                return

            try:
                self._ipc.send(
                    OP_FRAME,
                    {
                        "cmd": "SET_ACTIVITY",
                        "args": {
                            "pid": os.getpid(),
                            "activity": activity,
                        },
                        "nonce": str(uuid.uuid4()),
                    },
                )
                _op, resp = self._ipc.recv()
                if resp.get("evt") == "ERROR":
                    msg = (resp.get("data") or {}).get("message") or "Lỗi cập nhật trạng thái Discord."
                    self._status = "error"
                    self._last_error = str(msg)
                    return
                self._last_payload_sig = sig
                self._status = "connected"
                self._detail_text = details_text
                self._state_text = state_text
                self._last_error = None
            except Exception as exc:
                self._disconnect_locked(clear_activity=False)
                self._status = "waiting_discord"
                self._last_error = f"Mất kết nối Discord Desktop: {exc}"

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._tick()
            except Exception as exc:
                with self._lock:
                    self._status = "error"
                    self._last_error = str(exc)
            self._wake_event.wait(timeout=12.0)
            self._wake_event.clear()
