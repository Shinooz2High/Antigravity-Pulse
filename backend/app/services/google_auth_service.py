"""Google Account OAuth 2.0, ADC, and sanctioned Antigravity CLI (AGY) session integration."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import secrets
import shutil
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from ..config import AppConfig
from ..models import GoogleAuthStatusResponse
from ..utils import atomic_write_json, read_json_file, utc_now_iso

logger = logging.getLogger(__name__)

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"

DEFAULT_OAUTH_SCOPES = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/generative-language.retriever",
]


def find_agy_binary() -> str | None:
    """Locate the official Antigravity CLI (`agy`) binary."""
    found = shutil.which("agy")
    if found:
        return found
    candidate = Path.home() / ".gemini" / "bin" / ("agy.exe" if os.name == "nt" else "agy")
    if candidate.is_file():
        return str(candidate)
    return None


def find_gcloud_adc_file() -> Path | None:
    """Locate standard Google Cloud Application Default Credentials file if present."""
    env_adc = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env_adc:
        p = Path(env_adc).expanduser()
        if p.is_file():
            return p
    if os.name == "nt":
        appdata = os.environ.get("APPDATA")
        if appdata:
            p = Path(appdata) / "gcloud" / "application_default_credentials.json"
            if p.is_file():
                return p
    p_unix = Path.home() / ".config" / "gcloud" / "application_default_credentials.json"
    if p_unix.is_file():
        return p_unix
    return None


class GoogleAuthService:
    """Manages Google OAuth 2.0 tokens, ADC import, and official AGY CLI account verification."""

    def __init__(self, config: AppConfig, settings_service: Any) -> None:
        self.config = config
        self.settings = settings_service
        self.auth_file = config.data_dir / "google_auth.json"
        self._lock = threading.RLock()
        self._data: dict[str, Any] = {}
        # state -> {code_verifier, redirect_uri, created_at, purpose, device_name}
        self._pending_states: dict[str, dict[str, Any]] = {}
        # state -> {token, expires_at, device_id, email, name, created_at}
        self._completed_login_states: dict[str, dict[str, Any]] = {}

        # Cached AGY CLI probe
        self._agy_probe_lock = asyncio.Lock()
        self._agy_authenticated: bool | None = None
        self._agy_models: list[dict[str, str]] = []
        self._agy_last_probe: float = 0.0
        self._agy_error: str | None = None

        self._load()

    def _load(self) -> None:
        with self._lock:
            self.config.data_dir.mkdir(parents=True, exist_ok=True)
            raw = read_json_file(self.auth_file, default={})
            self._data = raw if isinstance(raw, dict) else {}

    def _save(self) -> None:
        with self._lock:
            atomic_write_json(self.auth_file, self._data)

    # --- AGY CLI Official Account Session ---

    def get_agy_cli_settings_path(self) -> Path:
        return Path.home() / ".gemini" / "antigravity-cli" / "settings.json"

    def get_agy_cli_model_provider(self) -> str | None:
        """Read documented `modelProvider` key from ~/.gemini/antigravity-cli/settings.json."""
        p = self.get_agy_cli_settings_path()
        if not p.is_file():
            return None
        data = read_json_file(p, default={})
        if isinstance(data, dict):
            val = data.get("modelProvider")
            return str(val).strip() if isinstance(val, str) and val.strip() else None
        return None

    def clear_agy_cli_api_key_override(self) -> bool:
        """Revert AGY CLI to default Google Account authentication by removing `modelProvider`."""
        p = self.get_agy_cli_settings_path()
        if not p.is_file():
            return False
        data = read_json_file(p, default={})
        if isinstance(data, dict) and "modelProvider" in data:
            data.pop("modelProvider", None)
            atomic_write_json(p, data)
            return True
        return False

    async def probe_agy_session(self, *, force: bool = False) -> tuple[bool, list[dict[str, str]], str | None]:
        """Verify AGY CLI authentication status and fetch available models via `agy models`."""
        agy_bin = find_agy_binary()
        if not agy_bin:
            self._agy_authenticated = False
            self._agy_models = []
            self._agy_error = "Chưa cài đặt Antigravity CLI (agy) trên PC."
            return False, [], self._agy_error

        now = time.time()
        if not force and self._agy_authenticated is not None and (now - self._agy_last_probe < 90):
            return bool(self._agy_authenticated), list(self._agy_models), self._agy_error

        async with self._agy_probe_lock:
            now = time.time()
            if not force and self._agy_authenticated is not None and (now - self._agy_last_probe < 90):
                return bool(self._agy_authenticated), list(self._agy_models), self._agy_error

            try:
                proc = await asyncio.create_subprocess_exec(
                    agy_bin,
                    "models",
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                try:
                    stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=15.0)
                except asyncio.TimeoutError:
                    proc.kill()
                    self._agy_authenticated = False
                    self._agy_error = "Lệnh `agy models` quá thời gian phản hồi (có thể AGY đang chờ đăng nhập trên PC)."
                    self._agy_last_probe = time.time()
                    return False, [], self._agy_error

                out_text = stdout_b.decode("utf-8", errors="replace")
                err_text = stderr_b.decode("utf-8", errors="replace")
                if proc.returncode != 0:
                    self._agy_authenticated = False
                    self._agy_models = []
                    self._agy_error = (err_text or out_text).strip()[:240] or f"agy exited with {proc.returncode}"
                    self._agy_last_probe = time.time()
                    return False, [], self._agy_error

                parsed_models: list[dict[str, str]] = []
                for line in out_text.splitlines():
                    clean = line.strip()
                    if not clean or clean.lower().startswith("fetching"):
                        continue
                    if "\t" in clean:
                        m_id, m_name = clean.split("\t", 1)
                        m_id = m_id.strip()
                        m_name = m_name.strip()
                        if m_id:
                            parsed_models.append({"id": m_id, "display_name": m_name or m_id})
                    elif "\t" not in clean and clean.split():
                        first_tok = clean.split()[0]
                        if "-" in first_tok and not clean.endswith(":"):
                            parsed_models.append({"id": first_tok, "display_name": clean})

                self._agy_authenticated = len(parsed_models) > 0
                self._agy_models = parsed_models
                self._agy_error = None if self._agy_authenticated else "Không đọc được danh sách model từ AGY CLI."
                self._agy_last_probe = time.time()
                return bool(self._agy_authenticated), list(self._agy_models), self._agy_error
            except Exception as exc:
                logger.warning("AGY session probe failed: %s", exc)
                self._agy_authenticated = False
                self._agy_error = str(exc)
                self._agy_last_probe = time.time()
                return False, [], self._agy_error

    def get_cached_agy_models(self) -> list[dict[str, str]]:
        return list(self._agy_models)

    def resolve_agy_model_id(self, requested_model: str) -> str:
        """Map generic Gemini model names to valid AGY CLI model IDs when needed."""
        req = (requested_model or "").strip()
        known_ids = {m["id"] for m in self._agy_models}
        if not known_ids:
            # Fallback common mappings even before probe populates cache
            fallback_map = {
                "gemini-3-flash-preview": "gemini-3.8-flash-high",
                "gemini-flash-latest": "gemini-3.8-flash-high",
                "gemini-3.8-flash": "gemini-3.8-flash-high",
                "gemini-3.1-flash-lite": "gemini-3.8-flash-low",
                "gemini-3.1-pro-preview": "gemini-4-carbon-high",
                "gemini-pro-latest": "gemini-4-carbon-high",
                "gemini-4-argon": "gemini-4-argon-high",
                "gemini-4-carbon": "gemini-4-carbon-high",
                "gemini-4-neon": "gemini-4-neon-high",
                "gemini-4-hydrogen": "gemini-4-hydrogen-high",
            }
            return fallback_map.get(req, req or "gemini-3.8-flash-high")

        if req in known_ids:
            return req

        for suffix in ("-high", "-medium", "-low"):
            if f"{req}{suffix}" in known_ids:
                return f"{req}{suffix}"

        alias_candidates = {
            "gemini-3-flash-preview": ["gemini-3.8-flash-high", "gemini-3.8-flash-medium"],
            "gemini-flash-latest": ["gemini-3.8-flash-high", "gemini-3.8-flash-medium"],
            "gemini-3.1-flash-lite": ["gemini-3.8-flash-low", "gemini-3.8-flash-medium"],
            "gemini-3.1-pro-preview": ["gemini-4-carbon-high", "gemini-4-argon-high", "gemini-4-neon-high"],
            "gemini-pro-latest": ["gemini-4-carbon-high", "gemini-4-argon-high"],
        }
        for cand in alias_candidates.get(req, []):
            if cand in known_ids:
                return cand

        for preferred in ("gemini-3.8-flash-high", "gemini-4-argon-high", "gemini-4-carbon-high"):
            if preferred in known_ids:
                return preferred

        return next(iter(known_ids))

    def launch_agy_login_terminal(self) -> dict[str, Any]:
        """Open an interactive terminal on the host PC running `agy` for official Google Sign-In / account switch."""
        agy_bin = find_agy_binary()
        if not agy_bin:
            raise HTTPException(
                status_code=400,
                detail="Không tìm thấy `agy` CLI trên máy tính PC. Hãy cài đặt Antigravity trước.",
            )

        # Ensure `modelProvider: gemini` isn't blocking Google account sign-in
        self.clear_agy_cli_api_key_override()

        try:
            if os.name == "nt":
                ps_cmd = (
                    "Write-Host '=== Đăng nhập / Chuyển đổi Tài khoản Google trên Antigravity (AGY) ===' -ForegroundColor Cyan; "
                    "Write-Host '• Nếu chưa đăng nhập: Trình duyệt sẽ tự mở để bạn đăng nhập Google.' -ForegroundColor Yellow; "
                    "Write-Host '• Nếu muốn đổi tài khoản khác: Gõ /logout trong giao diện AGY rồi chạy lại agy.' -ForegroundColor Yellow; "
                    f"& '{agy_bin}'"
                )
                subprocess.Popen(
                    ["powershell", "-NoProfile", "-NoExit", "-Command", ps_cmd],
                    creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0x00000010),
                )
            elif shutil.which("osascript"):
                subprocess.Popen(
                    [
                        "osascript",
                        "-e",
                        f'tell application "Terminal" to do script "{agy_bin}"',
                    ]
                )
            else:
                for term in ("x-terminal-emulator", "gnome-terminal", "konsole", "xterm"):
                    if shutil.which(term):
                        subprocess.Popen([term, "-e", agy_bin])
                        break
                else:
                    raise RuntimeError("Không tìm thấy trình giả lập Terminal đồ họa trên máy chủ.")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Không thể mở cửa sổ AGY trên PC: {exc}") from exc

        return {
            "launched": True,
            "message": "Đã mở cửa sổ Antigravity (AGY) trên màn hình PC. Hãy hoàn tất đăng nhập Google trên trình duyệt PC (hoặc gõ /logout để đổi tài khoản).",
        }

    # --- Google OAuth 2.0 Client Config, PKCE Login, ADC & Direct Token ---

    def save_oauth_client(
        self,
        *,
        client_id: str | None = None,
        client_secret: str | None = None,
        client_json: str | None = None,
        quota_project_id: str | None = None,
    ) -> None:
        parsed_id = (client_id or "").strip()
        parsed_secret = (client_secret or "").strip()

        if client_json and client_json.strip():
            try:
                raw_obj = json.loads(client_json.strip())
                block = raw_obj.get("installed") or raw_obj.get("web") or raw_obj
                if isinstance(block, dict):
                    parsed_id = str(block.get("client_id") or parsed_id).strip()
                    parsed_secret = str(block.get("client_secret") or parsed_secret).strip()
                    if not quota_project_id and block.get("project_id"):
                        quota_project_id = str(block.get("project_id")).strip()
            except Exception as exc:
                raise HTTPException(status_code=400, detail=f"JSON OAuth Client không hợp lệ: {exc}") from exc

        if not parsed_id:
            raise HTTPException(status_code=400, detail="Vui lòng nhập Google OAuth Client ID (hoặc dán file client_secret.json).")

        with self._lock:
            self._data["oauth_client_id"] = parsed_id
            if parsed_secret:
                self._data["oauth_client_secret"] = parsed_secret
            if quota_project_id is not None:
                self._data["quota_project_id"] = quota_project_id.strip() or None
            self._save()

    def create_oauth_authorization_url(
        self,
        *,
        redirect_uri: str,
        open_on_pc: bool = False,
        purpose: str = "settings",
        device_name: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            client_id = str(self._data.get("oauth_client_id") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()

        if not client_id:
            raise HTTPException(
                status_code=400,
                detail="Chưa cấu hình Google OAuth Client ID. Hãy dán Client ID / client_secret.json trước, hoặc dùng Token của AGY / dán Access Token trực tiếp.",
            )

        verifier = secrets.token_urlsafe(48)
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        state = secrets.token_urlsafe(24)

        now = time.time()
        with self._lock:
            # Prune old states (> 15 mins)
            self._pending_states = {
                k: v for k, v in self._pending_states.items() if now - v.get("created_at", 0) < 900
            }
            self._pending_states[state] = {
                "code_verifier": verifier,
                "redirect_uri": redirect_uri,
                "created_at": now,
                "purpose": purpose,
                "device_name": device_name,
            }

        params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(DEFAULT_OAUTH_SCOPES),
            "access_type": "offline",
            "include_granted_scopes": "true",
            "prompt": "consent select_account",
            "state": state,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        auth_url = f"{GOOGLE_AUTH_ENDPOINT}?{urllib.parse.urlencode(params)}"

        opened_browser = False
        if open_on_pc:
            try:
                opened_browser = bool(webbrowser.open(auth_url))
            except Exception as exc:
                logger.warning("Failed to open browser on PC: %s", exc)

        return {
            "auth_url": auth_url,
            "redirect_uri": redirect_uri,
            "state": state,
            "opened_on_pc": opened_browser,
        }

    def _http_post_form(self, url: str, form: dict[str, str]) -> dict[str, Any]:
        encoded = urllib.parse.urlencode(form).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=encoded,
            headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": "AntigravityPulse/1.0",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=12.0) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8", errors="replace")
            raise HTTPException(
                status_code=400,
                detail=f"Google OAuth từ chối yêu cầu ({exc.code}): {err_body[:240]}",
            ) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Không thể kết nối máy chủ Google OAuth: {exc}") from exc

    def _fetch_google_profile(self, access_token: str) -> dict[str, Any]:
        profile: dict[str, Any] = {}
        try:
            req = urllib.request.Request(
                GOOGLE_USERINFO_ENDPOINT,
                headers={"Authorization": f"Bearer {access_token}", "User-Agent": "AntigravityPulse/1.0"},
            )
            with urllib.request.urlopen(req, timeout=8.0) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, dict):
                    profile.update(data)
        except Exception:
            pass

        try:
            req_info = urllib.request.Request(
                f"{GOOGLE_TOKENINFO_ENDPOINT}?{urllib.parse.urlencode({'access_token': access_token})}",
                headers={"User-Agent": "AntigravityPulse/1.0"},
            )
            with urllib.request.urlopen(req_info, timeout=8.0) as resp:
                tinfo = json.loads(resp.read().decode("utf-8"))
                if isinstance(tinfo, dict):
                    if not profile.get("email") and tinfo.get("email"):
                        profile["email"] = tinfo["email"]
                    if tinfo.get("scope"):
                        profile["scope"] = tinfo["scope"]
                    if tinfo.get("expires_in"):
                        profile["expires_in"] = int(tinfo["expires_in"])
        except urllib.error.HTTPError as exc:
            if not profile:
                raise HTTPException(
                    status_code=400,
                    detail="Access Token Google không hợp lệ hoặc đã hết hạn.",
                ) from exc
        except Exception:
            pass

        return profile

    def complete_oauth_callback(self, *, code: str, state: str) -> dict[str, Any]:
        with self._lock:
            pending = self._pending_states.pop(state, None)
            client_id = str(self._data.get("oauth_client_id") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
            client_secret = str(
                self._data.get("oauth_client_secret") or os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or ""
            ).strip()

        if not pending:
            raise HTTPException(status_code=400, detail="Phiên đăng nhập OAuth không tồn tại hoặc đã hết hạn (state mismatch).")
        if not client_id:
            raise HTTPException(status_code=400, detail="Thiếu Google OAuth Client ID.")

        form: dict[str, str] = {
            "client_id": client_id,
            "code": code.strip(),
            "code_verifier": pending["code_verifier"],
            "grant_type": "authorization_code",
            "redirect_uri": pending["redirect_uri"],
        }
        if client_secret:
            form["client_secret"] = client_secret

        token_resp = self._http_post_form(GOOGLE_TOKEN_ENDPOINT, form)
        access_token = str(token_resp.get("access_token") or "").strip()
        if not access_token:
            raise HTTPException(status_code=400, detail="Google không trả về access_token.")

        refresh_token = str(token_resp.get("refresh_token") or "").strip() or None
        expires_in = int(token_resp.get("expires_in") or 3600)
        expires_at = time.time() + expires_in
        profile = self._fetch_google_profile(access_token)

        with self._lock:
            self._data["access_token"] = access_token
            if refresh_token:
                self._data["refresh_token"] = refresh_token
            self._data["expires_at"] = expires_at
            self._data["token_source"] = "oauth_browser"
            self._data["email"] = profile.get("email")
            self._data["name"] = profile.get("name")
            self._data["picture"] = profile.get("picture")
            self._data["scopes"] = str(token_resp.get("scope") or profile.get("scope") or "").split()
            self._data["connected_at"] = utc_now_iso()
            self._save()

        return {
            **self._data,
            "_purpose": pending.get("purpose", "settings"),
            "_device_name": pending.get("device_name"),
        }

    def store_login_result(self, state: str, payload: dict[str, Any]) -> None:
        now = time.time()
        with self._lock:
            self._completed_login_states = {
                k: v for k, v in self._completed_login_states.items() if now - v.get("created_at", 0) < 300
            }
            self._completed_login_states[state] = {**payload, "created_at": now}

    def consume_login_result(self, state: str) -> dict[str, Any] | None:
        now = time.time()
        with self._lock:
            self._completed_login_states = {
                k: v for k, v in self._completed_login_states.items() if now - v.get("created_at", 0) < 300
            }
            return self._completed_login_states.pop(state, None)

    def is_oauth_client_configured(self) -> bool:
        with self._lock:
            client_id = str(self._data.get("oauth_client_id") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
        return bool(client_id)

    def save_direct_access_token(
        self,
        *,
        access_token: str,
        refresh_token: str | None = None,
        quota_project_id: str | None = None,
    ) -> None:
        clean_token = access_token.strip()
        if clean_token.lower().startswith("bearer "):
            clean_token = clean_token[7:].strip()
        if not clean_token:
            raise HTTPException(status_code=400, detail="Access Token không được để trống.")

        profile = self._fetch_google_profile(clean_token)
        expires_in = int(profile.get("expires_in") or 3600)

        with self._lock:
            self._data["access_token"] = clean_token
            if refresh_token and refresh_token.strip():
                self._data["refresh_token"] = refresh_token.strip()
            self._data["expires_at"] = time.time() + expires_in
            self._data["token_source"] = "manual_token"
            self._data["email"] = profile.get("email") or "Google OAuth User"
            self._data["name"] = profile.get("name") or profile.get("email") or "Tài khoản Google"
            self._data["picture"] = profile.get("picture")
            self._data["scopes"] = str(profile.get("scope") or "").split()
            if quota_project_id is not None:
                self._data["quota_project_id"] = quota_project_id.strip() or None
            self._data["connected_at"] = utc_now_iso()
            self._save()

    def import_from_gcloud_adc(self) -> None:
        adc_path = find_gcloud_adc_file()
        if not adc_path:
            raise HTTPException(
                status_code=404,
                detail="Không tìm thấy file Google Cloud ADC (`application_default_credentials.json`) trên PC.",
            )
        raw = read_json_file(adc_path, default=None)
        if not isinstance(raw, dict):
            raise HTTPException(status_code=400, detail="File ADC không đọc được JSON.")

        client_id = str(raw.get("client_id") or "").strip()
        client_secret = str(raw.get("client_secret") or "").strip()
        refresh_token = str(raw.get("refresh_token") or "").strip()
        quota_proj = str(raw.get("quota_project_id") or "").strip() or None

        if not (client_id and client_secret and refresh_token):
            raise HTTPException(
                status_code=400,
                detail="File ADC không phải loại authorized_user (thiếu client_id / refresh_token).",
            )

        token_resp = self._http_post_form(
            GOOGLE_TOKEN_ENDPOINT,
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        access_token = str(token_resp.get("access_token") or "").strip()
        if not access_token:
            raise HTTPException(status_code=400, detail="Không thể đổi refresh_token từ ADC sang access_token.")

        expires_in = int(token_resp.get("expires_in") or 3600)
        profile = self._fetch_google_profile(access_token)

        with self._lock:
            self._data["adc_client_id"] = client_id
            self._data["adc_client_secret"] = client_secret
            self._data["access_token"] = access_token
            self._data["refresh_token"] = refresh_token
            self._data["expires_at"] = time.time() + expires_in
            self._data["token_source"] = "gcloud_adc"
            self._data["email"] = profile.get("email") or "Google Cloud ADC Account"
            self._data["name"] = profile.get("name") or profile.get("email") or "Google Cloud ADC"
            self._data["picture"] = profile.get("picture")
            self._data["scopes"] = str(token_resp.get("scope") or profile.get("scope") or "").split()
            if quota_proj:
                self._data["quota_project_id"] = quota_proj
            self._data["connected_at"] = utc_now_iso()
            self._save()

    def get_valid_access_token(self) -> tuple[str, str | None]:
        """Return `(access_token, quota_project_id)`, refreshing automatically if expired."""
        with self._lock:
            access_token = str(self._data.get("access_token") or "").strip()
            refresh_token = str(self._data.get("refresh_token") or "").strip()
            expires_at = float(self._data.get("expires_at") or 0.0)
            quota_project = self._data.get("quota_project_id") or self.settings.get_effective_vertex()[1]
            token_source = self._data.get("token_source")
            if token_source == "gcloud_adc":
                client_id = str(self._data.get("adc_client_id") or "").strip()
                client_secret = str(self._data.get("adc_client_secret") or "").strip()
            else:
                client_id = str(self._data.get("oauth_client_id") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
                client_secret = str(
                    self._data.get("oauth_client_secret") or os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET") or ""
                ).strip()

        now = time.time()
        if access_token and (expires_at == 0 or now + 60 < expires_at):
            return access_token, (str(quota_project).strip() if quota_project else None)

        if refresh_token and client_id:
            form: dict[str, str] = {
                "client_id": client_id,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            }
            if client_secret:
                form["client_secret"] = client_secret
            token_resp = self._http_post_form(GOOGLE_TOKEN_ENDPOINT, form)
            new_token = str(token_resp.get("access_token") or "").strip()
            if new_token:
                expires_in = int(token_resp.get("expires_in") or 3600)
                with self._lock:
                    self._data["access_token"] = new_token
                    self._data["expires_at"] = time.time() + expires_in
                    if token_resp.get("refresh_token"):
                        self._data["refresh_token"] = str(token_resp["refresh_token"]).strip()
                    self._save()
                return new_token, (str(quota_project).strip() if quota_project else None)

        raise RuntimeError(
            "Token đăng nhập Google đã hết hạn và không có refresh_token. "
            "Vui lòng vào Cài đặt -> Tài khoản Google & AGY để đăng nhập lại hoặc chuyển sang dùng Token của AGY."
        )

    def has_google_oauth_session(self) -> bool:
        with self._lock:
            access_token = str(self._data.get("access_token") or "").strip()
            refresh_token = str(self._data.get("refresh_token") or "").strip()
            expires_at = float(self._data.get("expires_at") or 0.0)
        if refresh_token:
            return True
        return bool(access_token and (expires_at == 0 or time.time() < expires_at))

    def logout_google_oauth(self) -> None:
        with self._lock:
            tok = str(self._data.get("access_token") or "").strip()
            for key in (
                "access_token",
                "refresh_token",
                "expires_at",
                "token_source",
                "email",
                "name",
                "picture",
                "scopes",
                "connected_at",
                "adc_client_id",
                "adc_client_secret",
            ):
                self._data.pop(key, None)
            self._save()

        if tok:
            try:
                req = urllib.request.Request(
                    f"{GOOGLE_REVOKE_ENDPOINT}?{urllib.parse.urlencode({'token': tok})}",
                    data=b"",
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    method="POST",
                )
                urllib.request.urlopen(req, timeout=4.0).close()
            except Exception:
                pass

    async def get_status(self, *, force_probe: bool = False) -> GoogleAuthStatusResponse:
        agy_bin = find_agy_binary()
        agy_ok, agy_models, agy_err = await self.probe_agy_session(force=force_probe)
        agy_provider_override = self.get_agy_cli_model_provider()
        adc_file = find_gcloud_adc_file()

        with self._lock:
            client_id = str(self._data.get("oauth_client_id") or os.environ.get("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
            access_token = str(self._data.get("access_token") or "").strip()
            refresh_token = str(self._data.get("refresh_token") or "").strip()
            expires_at = float(self._data.get("expires_at") or 0.0)
            email = self._data.get("email")
            name = self._data.get("name")
            picture = self._data.get("picture")
            token_source = self._data.get("token_source")
            quota_project_id = self._data.get("quota_project_id")
            scopes = list(self._data.get("scopes") or [])
            connected_at = self._data.get("connected_at")

        now = time.time()
        google_connected = bool(refresh_token or (access_token and (expires_at == 0 or now < expires_at)))
        expires_in_sec = max(0, int(expires_at - now)) if (access_token and expires_at > 0) else None

        auth_source = self.settings.get_auth_source()
        effective = self.resolve_effective_auth_mode(agy_authenticated=agy_ok, google_connected=google_connected)

        return GoogleAuthStatusResponse(
            auth_source=auth_source,
            effective_auth_source=effective,
            agy_cli_installed=bool(agy_bin),
            agy_authenticated=agy_ok,
            agy_model_count=len(agy_models),
            agy_api_key_override=(agy_provider_override == "gemini"),
            agy_error=agy_err,
            google_connected=google_connected,
            google_email=email if google_connected else None,
            google_name=name if google_connected else None,
            google_picture=picture if google_connected else None,
            google_token_source=token_source if google_connected else None,
            google_has_refresh_token=bool(refresh_token),
            google_expires_in_seconds=expires_in_sec if google_connected else None,
            google_scopes=scopes if google_connected else [],
            google_connected_at=connected_at if google_connected else None,
            oauth_client_configured=bool(client_id),
            oauth_client_id_preview=(f"{client_id[:14]}...{client_id[-22:]}" if len(client_id) > 40 else (client_id or None)),
            quota_project_id=quota_project_id,
            gcloud_adc_found=bool(adc_file),
            gcloud_adc_path=str(adc_file) if adc_file else None,
        )

    def resolve_effective_auth_mode(
        self,
        *,
        agy_authenticated: bool | None = None,
        google_connected: bool | None = None,
    ) -> str:
        chosen = self.settings.get_auth_source()
        if chosen != "auto":
            return chosen

        agy_ok = agy_authenticated if agy_authenticated is not None else bool(self._agy_authenticated)
        if agy_ok and find_agy_binary():
            return "agy_account"

        g_ok = google_connected if google_connected is not None else self.has_google_oauth_session()
        if g_ok:
            return "google_oauth"

        if self.settings.get_effective_api_key():
            return "api_key"

        v_enabled, v_proj, _ = self.settings.get_effective_vertex()
        if v_enabled and v_proj:
            return "vertex_adc"

        return "api_key"
