"""Zero-config Quick Connect service: 6-char Magic Code + encrypted relay + 1-click short URL."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import socket
import struct
import time
import urllib.request
from typing import Any

from ..utils import get_lan_ip, get_tailscale_ip
from .tunnel_service import shorten_url_sync

logger = logging.getLogger(__name__)

NTFY_BASE = "https://ntfy.sh"
KEY_ROUNDS = 2000


def normalize_quick_code(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (raw or "").upper())


def format_quick_code(raw: str) -> str:
    clean = normalize_quick_code(raw)
    if len(clean) == 6:
        return f"{clean[:3]}-{clean[3:]}"
    return clean


def derive_topic_and_keys(raw_code: str) -> tuple[str, bytes, bytes]:
    clean = normalize_quick_code(raw_code)
    if len(clean) < 4:
        raise ValueError("Quick code too short")

    topic_hash = hashlib.sha256(f"agy-topic-v1:{clean}".encode("utf-8")).hexdigest()[:24]
    topic = f"agypulse_v1_{topic_hash}"

    derived = hashlib.sha256(f"agy-seed-v1:{clean}".encode("utf-8")).digest()
    for _ in range(KEY_ROUNDS):
        derived = hashlib.sha256(derived).digest()

    enc_key = hashlib.sha256(b"enc:" + derived).digest()
    mac_key = hashlib.sha256(b"mac:" + derived).digest()
    return topic, enc_key, mac_key


def _xor_keystream(data: bytes, enc_key: bytes, nonce: bytes) -> bytes:
    out = bytearray(len(data))
    offset = 0
    counter = 0
    while offset < len(data):
        block = hashlib.sha256(enc_key + nonce + struct.pack(">I", counter)).digest()
        take = min(32, len(data) - offset)
        for i in range(take):
            out[offset + i] = data[offset + i] ^ block[i]
        offset += take
        counter += 1
    return bytes(out)


def encrypt_quick_payload(code: str, payload: dict[str, Any]) -> str:
    _, enc_key, mac_key = derive_topic_and_keys(code)
    plaintext = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    nonce = os.urandom(16)
    ciphertext = _xor_keystream(plaintext, enc_key, nonce)
    tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()[:16]
    packed = base64.urlsafe_b64encode(nonce + tag + ciphertext).decode("ascii").rstrip("=")
    return f"agyp1.{packed}"


def decrypt_quick_payload(code: str, token: str) -> dict[str, Any]:
    if not token.startswith("agyp1."):
        raise ValueError("Unsupported quick payload format")
    b64 = token[6:]
    pad = "=" * ((4 - len(b64) % 4) % 4)
    raw = base64.urlsafe_b64decode(b64 + pad)
    if len(raw) < 33:
        raise ValueError("Quick payload truncated")
    nonce = raw[:16]
    tag = raw[16:32]
    ciphertext = raw[32:]

    _, enc_key, mac_key = derive_topic_and_keys(code)
    expected_tag = hmac.new(mac_key, nonce + ciphertext, hashlib.sha256).digest()[:16]
    if not hmac.compare_digest(tag, expected_tag):
        raise ValueError("Invalid code or corrupted payload")

    plaintext = _xor_keystream(ciphertext, enc_key, nonce)
    data = json.loads(plaintext.decode("utf-8"))
    if not isinstance(data, dict):
        raise ValueError("Invalid decrypted JSON")
    return data


class QuickConnectService:
    """Publishes encrypted connection beacons so other devices can connect using ONLY a 6-char code."""

    def __init__(self, port: int, settings_service: Any, tunnel_service: Any, ws_manager: Any) -> None:
        self.port = port
        self.settings = settings_service
        self.tunnel = tunnel_service
        self.ws_manager = ws_manager

        self._short_pair_url: str | None = None
        self._short_source_pair_url: str | None = None
        self._relay_synced: bool = False
        self._last_published_signature: str | None = None
        self._publish_lock = asyncio.Lock()
        self._bg_task: asyncio.Task[None] | None = None

    @property
    def short_pair_url(self) -> str | None:
        return self._short_pair_url

    @property
    def relay_synced(self) -> bool:
        return self._relay_synced

    def start_background_sync(self) -> None:
        if self._bg_task is None or self._bg_task.done():
            self._bg_task = asyncio.create_task(self._periodic_loop())

    def stop_background_sync(self) -> None:
        if self._bg_task is not None and not self._bg_task.done():
            self._bg_task.cancel()
        self._bg_task = None

    def schedule_publish(self, *, force: bool = False) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.publish_now(force=force))
        except RuntimeError:
            pass

    def build_candidate_urls(self) -> list[str]:
        urls: list[str] = []
        if self.tunnel and self.tunnel.tunnel_url:
            urls.append(self.tunnel.tunnel_url.rstrip("/"))
        ts_ip = get_tailscale_ip()
        if ts_ip:
            urls.append(f"http://{ts_ip}:{self.port}")
        lan_ip = get_lan_ip()
        if lan_ip:
            urls.append(f"http://{lan_ip}:{self.port}")
        # Deduplicate while preserving order
        seen: set[str] = set()
        deduped: list[str] = []
        for u in urls:
            if u not in seen:
                seen.add(u)
                deduped.append(u)
        return deduped

    async def publish_now(self, *, force: bool = False) -> bool:
        async with self._publish_lock:
            code = self.settings.get_quick_code()
            pair_token = self.settings.get_pair_token()
            urls = self.build_candidate_urls()
            preferred_url = urls[0] if urls else f"http://127.0.0.1:{self.port}"
            full_pair_url = f"{preferred_url}/?pair={pair_token}"

            sig = f"{code}|{pair_token}|{'|'.join(urls)}"
            if not force and sig == self._last_published_signature and self._relay_synced:
                return True

            # 1. Create 1-click short pair URL if target changed (prefer remote tunnel or tailscale or LAN)
            if full_pair_url != self._short_source_pair_url:
                short = await asyncio.to_thread(shorten_url_sync, full_pair_url, None, 5.0)
                if short:
                    self._short_pair_url = short
                    self._short_source_pair_url = full_pair_url

            # 2. Encrypt & publish beacon to derived topic
            topic, _, _ = derive_topic_and_keys(code)
            payload = {
                "v": 1,
                "urls": urls,
                "pair_token": pair_token,
                "hostname": socket.gethostname(),
                "ts": int(time.time()),
            }
            encrypted_blob = encrypt_quick_payload(code, payload)

            def _post_beacon() -> bool:
                req = urllib.request.Request(
                    f"{NTFY_BASE}/{topic}",
                    data=encrypted_blob.encode("ascii"),
                    headers={
                        "User-Agent": "AntigravityPulse/1.0",
                        "Cache": "yes",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=6.0) as resp:
                    return 200 <= resp.status < 300

            try:
                ok = await asyncio.to_thread(_post_beacon)
                self._relay_synced = ok
                if ok:
                    self._last_published_signature = sig
                    await self.ws_manager.broadcast(
                        "system.quick_connect_updated",
                        {
                            "quick_code": format_quick_code(code),
                            "quick_short_url": self._short_pair_url,
                            "quick_relay_synced": True,
                        },
                    )
                return ok
            except Exception as exc:
                logger.debug("QuickConnect beacon publish skipped: %s", exc)
                self._relay_synced = False
                return False

    async def _periodic_loop(self) -> None:
        try:
            # Auto-start public tunnel on startup if cloudflared is available so 4G/remote works immediately!
            await self.publish_now(force=True)
            if self.tunnel and not self.tunnel.is_running and self.tunnel.is_cloudflared_installed():
                res = await self.tunnel.start()
                if res.tunnel_running:
                    await self.publish_now(force=True)

            while True:
                await asyncio.sleep(4 * 3600)
                await self.publish_now(force=True)
        except asyncio.CancelledError:
            return
        except Exception as exc:
            logger.debug("QuickConnect background loop error: %s", exc)
