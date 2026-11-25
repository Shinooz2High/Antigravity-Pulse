"""Multi-mode tunnel lifecycle manager (Cloudflare Quick + Short Link, Serveo SSH, Cloudflare Named)."""

from __future__ import annotations

import asyncio
import os
import re
import shutil
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING, Optional

from ..config import APP_ROOT
from ..models import TunnelMode, TunnelStartResponse, TunnelStopResponse
from ..utils import get_tailscale_ip
from .ws_manager import WebSocketManager

if TYPE_CHECKING:
    from .settings_service import SettingsService

TRYCLOUDFLARE_RE = re.compile(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com")
SERVEO_RE = re.compile(r"https://[a-zA-Z0-9-]+\.(?:serveo\.net|serveousercontent\.com)")
CF_NAMED_READY_RE = re.compile(r"Registered tunnel connection", re.IGNORECASE)


def sanitize_subdomain(raw: str | None) -> str | None:
    """Normalize a custom subdomain to lowercase DNS label format."""
    if not raw:
        return None
    cleaned = re.sub(r"[^a-z0-9-]+", "-", raw.strip().lower()).strip("-")
    cleaned = cleaned[:32].strip("-")
    return cleaned or None


def sanitize_short_alias(raw: str | None) -> str | None:
    """Normalize a custom is.gd alias (5-30 alphanumeric/underscore chars)."""
    if not raw:
        return None
    cleaned = re.sub(r"[^a-zA-Z0-9_]+", "_", raw.strip()).strip("_")
    cleaned = cleaned[:30]
    if len(cleaned) < 5:
        return None
    return cleaned


def normalize_public_url(raw: str | None) -> str | None:
    """Ensure custom domain URL starts with https:// and has no trailing slash."""
    if not raw or not raw.strip():
        return None
    val = raw.strip().rstrip("/")
    if not re.match(r"^https?://", val, re.IGNORECASE):
        val = f"https://{val}"
    return val


def shorten_url_sync(target_url: str, preferred_alias: str | None = None, timeout: float = 6.0) -> str | None:
    """Create a short, easy-to-remember redirect link via is.gd (with tinyurl fallback)."""
    encoded = urllib.parse.quote(target_url, safe="")
    headers = {"User-Agent": "AntigravityPulse/1.0"}
    alias = sanitize_short_alias(preferred_alias)

    candidates: list[str] = []
    if alias:
        candidates.append(
            f"https://is.gd/create.php?format=simple&url={encoded}&shorturl={urllib.parse.quote(alias, safe='')}"
        )
    candidates.append(f"https://is.gd/create.php?format=simple&url={encoded}")
    candidates.append(f"https://tinyurl.com/api-create.php?url={encoded}")

    for endpoint in candidates:
        try:
            req = urllib.request.Request(endpoint, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    body = resp.read().decode("utf-8", errors="replace").strip()
                    if body.startswith("https://") or body.startswith("http://"):
                        return body
        except Exception:
            continue
    return None


class TunnelService:
    """Starts and stops public HTTPS tunnels with short, memorable URLs."""

    def __init__(
        self,
        port: int,
        ws_manager: WebSocketManager,
        settings_service: SettingsService | None = None,
    ) -> None:
        self.port = port
        self.ws_manager = ws_manager
        self.settings_service = settings_service
        self._proc: Optional[subprocess.Popen[str]] = None
        self._tunnel_url: Optional[str] = None
        self._tunnel_short_url: Optional[str] = None
        self._active_mode: TunnelMode = "cloudflare_quick"
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

    @staticmethod
    def get_ssh_binary() -> str | None:
        bin_path = shutil.which("ssh")
        if bin_path:
            return bin_path
        if os.name == "nt":
            win_ssh = Path(os.environ.get("SystemRoot", r"C:\Windows")) / "System32" / "OpenSSH" / "ssh.exe"
            if win_ssh.exists():
                return str(win_ssh)
        return None

    @classmethod
    def is_ssh_installed(cls) -> bool:
        return cls.get_ssh_binary() is not None

    @property
    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    @property
    def active_mode(self) -> TunnelMode:
        if self.is_running:
            return self._active_mode
        if self.settings_service is not None:
            return self.settings_service.get_tunnel_mode()
        return self._active_mode

    @property
    def tunnel_url(self) -> str | None:
        if not self.is_running:
            return None
        return self._tunnel_url

    @property
    def tunnel_short_url(self) -> str | None:
        if not self.is_running:
            return None
        return self._tunnel_short_url

    async def start(self) -> TunnelStartResponse:
        tailscale_ip = get_tailscale_ip()
        tailscale_url = f"http://{tailscale_ip}:{self.port}" if tailscale_ip else None

        async with self._lock:
            mode: TunnelMode = (
                self.settings_service.get_tunnel_mode() if self.settings_service else "cloudflare_quick"
            )

            if self.is_running and self._tunnel_url and self._active_mode == mode:
                return TunnelStartResponse(
                    tunnel_running=True,
                    tunnel_mode=self._active_mode,
                    tunnel_url=self._tunnel_url,
                    tunnel_short_url=self._tunnel_short_url,
                    tailscale_url=tailscale_url,
                )

            await self._stop_locked(broadcast=False)

            if mode == "serveo_ssh":
                return await self._start_serveo_locked(tailscale_url)
            if mode == "cloudflare_named":
                return await self._start_cloudflare_named_locked(tailscale_url)
            return await self._start_cloudflare_quick_locked(tailscale_url)

    async def _start_cloudflare_quick_locked(self, tailscale_url: str | None) -> TunnelStartResponse:
        if not self.is_cloudflared_installed():
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_quick",
                tunnel_url=None,
                tunnel_short_url=None,
                error="cloudflared CLI is not installed on this PC.",
                install_hint="winget install Cloudflare.cloudflared",
                tailscale_url=tailscale_url,
            )

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
                tunnel_mode="cloudflare_quick",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Failed to launch cloudflared: {exc}",
                install_hint="winget install Cloudflare.cloudflared",
                tailscale_url=tailscale_url,
            )

        url_future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        self._reader_task = asyncio.create_task(
            self._read_output(self._proc, url_future, TRYCLOUDFLARE_RE, "cloudflared")
        )

        try:
            url = await asyncio.wait_for(asyncio.shield(url_future), timeout=12.0)
            short_url: str | None = None
            auto_shorten = self.settings_service.get_tunnel_auto_shorten() if self.settings_service else True
            if auto_shorten:
                alias = self.settings_service.get_tunnel_short_alias() if self.settings_service else None
                short_url = await asyncio.get_running_loop().run_in_executor(
                    None, shorten_url_sync, url, alias
                )

            self._active_mode = "cloudflare_quick"
            self._tunnel_url = url
            self._tunnel_short_url = short_url
            await self.ws_manager.broadcast(
                "system.tunnel_updated",
                {
                    "tunnel_running": True,
                    "tunnel_mode": self._active_mode,
                    "tunnel_url": url,
                    "tunnel_short_url": short_url,
                },
            )
            return TunnelStartResponse(
                tunnel_running=True,
                tunnel_mode=self._active_mode,
                tunnel_url=url,
                tunnel_short_url=short_url,
                tailscale_url=tailscale_url,
            )
        except asyncio.TimeoutError:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_quick",
                tunnel_url=None,
                tunnel_short_url=None,
                error="Timed out waiting for Cloudflare Quick Tunnel URL (12s).",
                install_hint="Check internet connectivity or run cloudflared manually.",
                tailscale_url=tailscale_url,
            )
        except Exception as exc:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_quick",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Tunnel failed to start: {exc}",
                install_hint="winget install Cloudflare.cloudflared",
                tailscale_url=tailscale_url,
            )

    async def _start_serveo_locked(self, tailscale_url: str | None) -> TunnelStartResponse:
        ssh_bin = self.get_ssh_binary()
        if not ssh_bin:
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="serveo_ssh",
                tunnel_url=None,
                tunnel_short_url=None,
                error="OpenSSH client (ssh) is not installed on this PC.",
                install_hint="Enable OpenSSH Client in Windows Optional Features.",
                tailscale_url=tailscale_url,
            )

        raw_sub = self.settings_service.get_tunnel_subdomain() if self.settings_service else None
        subdomain = sanitize_subdomain(raw_sub)
        remote_spec = f"{subdomain}:80:127.0.0.1:{self.port}" if subdomain else f"80:127.0.0.1:{self.port}"
        null_hosts = "NUL" if os.name == "nt" else "/dev/null"

        cmd = [
            ssh_bin,
            "-o",
            "StrictHostKeyChecking=no",
            "-o",
            f"UserKnownHostsFile={null_hosts}",
            "-o",
            "ServerAliveInterval=30",
            "-o",
            "ServerAliveCountMax=3",
            "-o",
            "ExitOnForwardFailure=yes",
            "-o",
            "NumberOfPasswordPrompts=0",
            "-T",
            "-R",
            remote_spec,
            "serveo.net",
        ]

        try:
            self._proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
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
                tunnel_mode="serveo_ssh",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Failed to launch ssh for Serveo: {exc}",
                install_hint="Kiểm tra OpenSSH Client và kết nối Internet.",
                tailscale_url=tailscale_url,
            )

        url_future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        self._reader_task = asyncio.create_task(
            self._read_output(self._proc, url_future, SERVEO_RE, "ssh (serveo.net)")
        )

        try:
            url = await asyncio.wait_for(asyncio.shield(url_future), timeout=15.0)
            self._active_mode = "serveo_ssh"
            self._tunnel_url = url
            self._tunnel_short_url = None
            await self.ws_manager.broadcast(
                "system.tunnel_updated",
                {
                    "tunnel_running": True,
                    "tunnel_mode": self._active_mode,
                    "tunnel_url": url,
                    "tunnel_short_url": None,
                },
            )
            return TunnelStartResponse(
                tunnel_running=True,
                tunnel_mode=self._active_mode,
                tunnel_url=url,
                tunnel_short_url=None,
                tailscale_url=tailscale_url,
            )
        except asyncio.TimeoutError:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="serveo_ssh",
                tunnel_url=None,
                tunnel_short_url=None,
                error="Hết thời gian chờ Serveo SSH (15s). Serveo có thể đang bận hoặc bị tường lửa chặn cổng 22.",
                install_hint="Thử chuyển sang chế độ Cloudflare + Link ngắn.",
                tailscale_url=tailscale_url,
            )
        except Exception as exc:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="serveo_ssh",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Serveo SSH tunnel thất bại: {exc}",
                install_hint="Thử đổi tên miền phụ khác hoặc chuyển sang Cloudflare + Link ngắn.",
                tailscale_url=tailscale_url,
            )

    async def _start_cloudflare_named_locked(self, tailscale_url: str | None) -> TunnelStartResponse:
        if not self.is_cloudflared_installed():
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_named",
                tunnel_url=None,
                tunnel_short_url=None,
                error="cloudflared CLI is not installed on this PC.",
                install_hint="winget install Cloudflare.cloudflared",
                tailscale_url=tailscale_url,
            )

        token = (
            self.settings_service.get_effective_cloudflare_tunnel_token()
            if self.settings_service
            else None
        )
        custom_url = normalize_public_url(
            self.settings_service.get_cloudflare_tunnel_url() if self.settings_service else None
        )

        if not token or not custom_url:
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_named",
                tunnel_url=None,
                tunnel_short_url=None,
                error="Thiếu Cloudflare Tunnel Token hoặc Tên miền (URL) cố định.",
                install_hint="Nhập Domain URL (vd: https://pc.domain.com) và Tunnel Token trong mục Cài đặt Tunnel.",
                tailscale_url=tailscale_url,
            )

        binary = self.get_cloudflared_binary() or "cloudflared"
        cmd = [
            binary,
            "tunnel",
            "--no-autoupdate",
            "run",
            "--token",
            token,
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
                tunnel_mode="cloudflare_named",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Failed to launch cloudflared: {exc}",
                install_hint="winget install Cloudflare.cloudflared",
                tailscale_url=tailscale_url,
            )

        ready_future: asyncio.Future[str] = asyncio.get_running_loop().create_future()
        self._reader_task = asyncio.create_task(
            self._read_output(
                self._proc,
                ready_future,
                CF_NAMED_READY_RE,
                "cloudflared (named)",
                resolved_value=custom_url,
            )
        )

        try:
            url = await asyncio.wait_for(asyncio.shield(ready_future), timeout=15.0)
            self._active_mode = "cloudflare_named"
            self._tunnel_url = url
            self._tunnel_short_url = None
            await self.ws_manager.broadcast(
                "system.tunnel_updated",
                {
                    "tunnel_running": True,
                    "tunnel_mode": self._active_mode,
                    "tunnel_url": url,
                    "tunnel_short_url": None,
                },
            )
            return TunnelStartResponse(
                tunnel_running=True,
                tunnel_mode=self._active_mode,
                tunnel_url=url,
                tunnel_short_url=None,
                tailscale_url=tailscale_url,
            )
        except asyncio.TimeoutError:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_named",
                tunnel_url=None,
                tunnel_short_url=None,
                error="Hết thời gian chờ kết nối Cloudflare Named Tunnel (15s).",
                install_hint="Kiểm tra lại Cloudflare Tunnel Token và kết nối Internet.",
                tailscale_url=tailscale_url,
            )
        except Exception as exc:
            await self._stop_locked(broadcast=False)
            return TunnelStartResponse(
                tunnel_running=False,
                tunnel_mode="cloudflare_named",
                tunnel_url=None,
                tunnel_short_url=None,
                error=f"Cloudflare Named Tunnel thất bại: {exc}",
                install_hint="Kiểm tra lại Token trong Cloudflare Zero Trust Dashboard.",
                tailscale_url=tailscale_url,
            )

    async def _read_output(
        self,
        proc: subprocess.Popen[str],
        result_future: asyncio.Future[str],
        pattern: re.Pattern[str],
        label: str,
        resolved_value: str | None = None,
    ) -> None:
        loop = asyncio.get_running_loop()
        assert proc.stdout is not None

        def _next_line() -> str:
            return proc.stdout.readline()  # type: ignore[union-attr]

        try:
            while proc.poll() is None:
                line = await loop.run_in_executor(None, _next_line)
                if not line:
                    break
                match = pattern.search(line)
                if match and not result_future.done():
                    result_future.set_result(resolved_value if resolved_value is not None else match.group(0))
        except Exception as exc:
            if not result_future.done():
                result_future.set_exception(exc)
        finally:
            if not result_future.done():
                result_future.set_exception(RuntimeError(f"{label} exited before tunnel became ready"))

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
        self._tunnel_short_url = None
        if broadcast:
            await self.ws_manager.broadcast(
                "system.tunnel_updated",
                {
                    "tunnel_running": False,
                    "tunnel_mode": self.active_mode,
                    "tunnel_url": None,
                    "tunnel_short_url": None,
                },
            )

    async def stop(self) -> TunnelStopResponse:
        async with self._lock:
            await self._stop_locked(broadcast=True)
        return TunnelStopResponse(tunnel_running=False, tunnel_url=None, tunnel_short_url=None)
