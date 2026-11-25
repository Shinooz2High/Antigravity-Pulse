"""Cloudflare Quick Tunnel lifecycle manager."""

from __future__ import annotations

import asyncio
import re
import shutil
import subprocess
from typing import Optional

from ..config import APP_ROOT
from ..models import TunnelStartResponse, TunnelStopResponse
from ..utils import get_tailscale_ip
from .ws_manager import WebSocketManager

TRYCLOUDFLARE_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")


class TunnelService:
    """Starts and stops `cloudflared tunnel --url http://127.0.0.1:<port>`."""

    def __init__(self, port: int, ws_manager: WebSocketManager) -> None:
        self.port = port
        self.ws_manager = ws_manager
        self._proc: Optional[subprocess.Popen[str]] = None
        self._tunnel_url: Optional[str] = None
        self._lock = asyncio.Lock()
        self._reader_task: Optional[asyncio.Task[None]] = None

    @staticmethod
    def get_cloudflared_binary() -> str | None:
        bin_path = shutil.which("cloudflared")
        if bin_path:
            return bin_path
        local_bin = (APP_ROOT / "cloudflared.exe").resolve()
        if local_bin.exists():
            return str(local_bin)
        return None

    @classmethod
    def is_cloudflared_installed(cls) -> bool:
        return cls.get_cloudflared_binary() is not None

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    @property
    def tunnel_url(self) -> str | None:
        if not self.is_running:
            return None
        return self._tunnel_url

    async def start(self) -> TunnelStartResponse:
        tailscale_ip = get_tailscale_ip()
        tailscale_url = f"http://{tailscale_ip}:{self.port}" if tailscale_ip else None

        async with self._lock:
            if self.is_running and self._tunnel_url:
                return TunnelStartResponse(
                    tunnel_running=True,
                    tunnel_url=self._tunnel_url,
                    tailscale_url=tailscale_url,
                )

            if not self.is_cloudflared_installed():
                return TunnelStartResponse(
                    tunnel_running=False,
                    tunnel_url=None,
                    error="cloudflared CLI is not installed on this PC.",
                    install_hint="winget install Cloudflare.cloudflared",
                    tailscale_url=tailscale_url,
                )

            await self._stop_locked(broadcast=False)

            binary = self.get_cloudflared_binary() or "cloudflared"
            cmd = [
                binary,
                "tunnel",
                "--no-autoupdate",
                "--url",
                f"http://127.0.0.1:{self.port}",
            ]
            try:
                self._proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                )
            except OSError as exc:
                self._proc = None
                return TunnelStartResponse(
                    tunnel_running=False,
                    tunnel_url=None,
                    error=f"Failed to launch cloudflared: {exc}",
                    install_hint="winget install Cloudflare.cloudflared",
                    tailscale_url=tailscale_url,
                )

            url_future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
            self._reader_task = asyncio.create_task(self._read_output(self._proc, url_future))

            try:
                url = await asyncio.wait_for(asyncio.shield(url_future), timeout=12.0)
                self._tunnel_url = url
                await self.ws_manager.broadcast(
                    "system.tunnel_updated",
                    {"tunnel_running": True, "tunnel_url": url},
                )
                return TunnelStartResponse(
                    tunnel_running=True,
                    tunnel_url=url,
                    tailscale_url=tailscale_url,
                )
            except asyncio.TimeoutError:
                await self._stop_locked(broadcast=False)
                return TunnelStartResponse(
                    tunnel_running=False,
                    tunnel_url=None,
                    error="Timed out waiting for Cloudflare Quick Tunnel URL (12s).",
                    install_hint="Check internet connectivity or run cloudflared manually.",
                    tailscale_url=tailscale_url,
                )
            except Exception as exc:
                await self._stop_locked(broadcast=False)
                return TunnelStartResponse(
                    tunnel_running=False,
                    tunnel_url=None,
                    error=f"Tunnel failed to start: {exc}",
                    install_hint="winget install Cloudflare.cloudflared",
                    tailscale_url=tailscale_url,
                )

    async def _read_output(self, proc: subprocess.Popen[str], url_future: asyncio.Future[str]) -> None:
        loop = asyncio.get_running_loop()
        assert proc.stdout is not None

        def _next_line() -> str:
            return proc.stdout.readline()  # type: ignore[union-attr]

        try:
            while proc.poll() is None:
                line = await loop.run_in_executor(None, _next_line)
                if not line:
                    break
                match = TRYCLOUDFLARE_RE.search(line)
                if match and not url_future.done():
                    url_future.set_result(match.group(0))
        except Exception as exc:
            if not url_future.done():
                url_future.set_exception(exc)
        finally:
            if not url_future.done():
                url_future.set_exception(RuntimeError("cloudflared exited before producing a tunnel URL"))

    async def _stop_locked(self, broadcast: bool = True) -> None:
        if self._reader_task is not None:
            self._reader_task.cancel()
            try:
                await self._reader_task
            except BaseException:
                pass
            self._reader_task = None

        if self._proc is not None:
            proc = self._proc
            self._proc = None
            if proc.poll() is None:
                proc.terminate()
                try:
                    await asyncio.get_running_loop().run_in_executor(None, proc.wait, 3.0)
                except Exception:
                    proc.kill()

        self._tunnel_url = None
        if broadcast:
            await self.ws_manager.broadcast(
                "system.tunnel_updated",
                {"tunnel_running": False, "tunnel_url": None},
            )

    async def stop(self) -> TunnelStopResponse:
        async with self._lock:
            await self._stop_locked(broadcast=True)
        return TunnelStopResponse(tunnel_running=False, tunnel_url=None)
