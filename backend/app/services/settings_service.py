"""Persistent settings management (PIN, pairing token, SDK/API keys, defaults)."""

from __future__ import annotations

import os
import secrets
import threading
from pathlib import Path
from typing import Any

from ..config import AppConfig
from ..models import AuthSource, EngineMode, ExecutionPolicy, SystemSettingsResponse, TunnelMode, UpdateSettingsRequest
from ..utils import atomic_write_json, read_json_file

DEFAULT_MODEL = "gemini-3.8-flash-high"
VALID_ENGINE_MODES = {"antigravity_sdk", "cli", "claude_code", "codex", "opencode", "demo"}
VALID_TUNNEL_MODES = {"cloudflare_quick", "serveo_ssh", "cloudflare_named"}
VALID_AUTH_SOURCES = {"auto", "agy_account", "google_oauth", "api_key", "vertex_adc"}
QUICK_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


class SettingsService:
    """Thread-safe JSON persistence for backend settings."""

    def __init__(self, config: AppConfig) -> None:
        self.config = config
        self.data_dir = config.data_dir
        self.settings_path = self.data_dir / "settings.json"
        self._lock = threading.RLock()
        self._data: dict[str, Any] = {}
        self._load_or_init()

    def _generate_pin(self) -> str:
        return f"{secrets.randbelow(1_000_000):06d}"

    def _generate_pair_token(self) -> str:
        return secrets.token_hex(16)  # 32 hex chars

    def _generate_quick_code(self) -> str:
        return "".join(secrets.choice(QUICK_CODE_ALPHABET) for _ in range(6))

    def _load_or_init(self) -> None:
        with self._lock:
            self.data_dir.mkdir(parents=True, exist_ok=True)
            stored = read_json_file(self.settings_path, default=None)
            changed = False

            if not isinstance(stored, dict):
                stored = {}
                changed = True

            if self.config.agy_bridge_pin and self.config.agy_bridge_pin.strip():
                env_pin = self.config.agy_bridge_pin.strip()
                if stored.get("pin") != env_pin:
                    stored["pin"] = env_pin
                    changed = True
            elif not stored.get("pin"):
                stored["pin"] = self._generate_pin()
                changed = True

            if not stored.get("pair_token") or len(str(stored.get("pair_token"))) < 16:
                stored["pair_token"] = self._generate_pair_token()
                changed = True

            if not stored.get("quick_code") or len(str(stored.get("quick_code"))) < 6:
                stored["quick_code"] = self._generate_quick_code()
                changed = True

            if "gemini_api_key" not in stored:
                stored["gemini_api_key"] = (
                    self.config.gemini_api_key.strip()
                    if self.config.gemini_api_key and self.config.gemini_api_key.strip()
                    else None
                )
                changed = True

            if "api_key_cleared" not in stored:
                stored["api_key_cleared"] = False
                changed = True

            if "vertex_enabled" not in stored:
                stored["vertex_enabled"] = bool(self.config.google_genai_use_vertexai)
                changed = True

            if "vertex_project" not in stored:
                stored["vertex_project"] = self.config.google_cloud_project
                changed = True

            if "vertex_location" not in stored or not stored.get("vertex_location"):
                stored["vertex_location"] = self.config.google_cloud_location or "us-central1"
                changed = True

            if stored.get("default_engine_mode") not in VALID_ENGINE_MODES:
                stored["default_engine_mode"] = "antigravity_sdk"
                changed = True

            if stored.get("default_execution_policy") not in {"read_only", "ask_mobile", "auto_workspace"}:
                stored["default_execution_policy"] = "ask_mobile"
                changed = True

            if not stored.get("brain_dir"):
                stored["brain_dir"] = str(self.config.default_brain_dir)
                changed = True

            if not stored.get("model"):
                stored["model"] = self.config.agy_model or DEFAULT_MODEL
                changed = True

            if stored.get("auth_source") not in VALID_AUTH_SOURCES:
                env_src = (self.config.agy_auth_source or "").strip()
                stored["auth_source"] = env_src if env_src in VALID_AUTH_SOURCES else "auto"
                changed = True

            if stored.get("tunnel_mode") not in VALID_TUNNEL_MODES:
                env_mode = (self.config.agy_tunnel_mode or "").strip()
                stored["tunnel_mode"] = env_mode if env_mode in VALID_TUNNEL_MODES else "cloudflare_quick"
                changed = True

            if "tunnel_subdomain" not in stored:
                stored["tunnel_subdomain"] = (
                    self.config.agy_tunnel_subdomain.strip()
                    if self.config.agy_tunnel_subdomain and self.config.agy_tunnel_subdomain.strip()
                    else None
                )
                changed = True

            if "tunnel_short_alias" not in stored:
                stored["tunnel_short_alias"] = (
                    self.config.agy_tunnel_short_alias.strip()
                    if self.config.agy_tunnel_short_alias and self.config.agy_tunnel_short_alias.strip()
                    else None
                )
                changed = True

            if "tunnel_auto_shorten" not in stored:
                stored["tunnel_auto_shorten"] = True
                changed = True

            if "cloudflare_tunnel_token" not in stored:
                stored["cloudflare_tunnel_token"] = (
                    self.config.cloudflare_tunnel_token.strip()
                    if self.config.cloudflare_tunnel_token and self.config.cloudflare_tunnel_token.strip()
                    else None
                )
                changed = True

            if "cloudflare_tunnel_token_cleared" not in stored:
                stored["cloudflare_tunnel_token_cleared"] = False
                changed = True

            if "cloudflare_tunnel_url" not in stored:
                stored["cloudflare_tunnel_url"] = (
                    self.config.cloudflare_tunnel_url.strip()
                    if self.config.cloudflare_tunnel_url and self.config.cloudflare_tunnel_url.strip()
                    else None
                )
                changed = True

            self._data = stored
            if changed:
                atomic_write_json(self.settings_path, self._data)

    def _save(self) -> None:
        atomic_write_json(self.settings_path, self._data)

    def get_pin(self) -> str:
        with self._lock:
            return str(self._data["pin"])

    def get_pair_token(self) -> str:
        with self._lock:
            return str(self._data["pair_token"])

    def get_quick_code(self) -> str:
        with self._lock:
            val = str(self._data.get("quick_code") or "").strip().upper()
            if len(val) < 6:
                val = self._generate_quick_code()
                self._data["quick_code"] = val
                self._save()
            return val

    def rotate_pair(self, new_pin: str | None = None) -> tuple[str, str]:
        with self._lock:
            self._data["pair_token"] = self._generate_pair_token()
            self._data["quick_code"] = self._generate_quick_code()
            if new_pin is not None and new_pin.strip():
                self._data["pin"] = new_pin.strip()
            self._save()
            return str(self._data["pair_token"]), str(self._data["pin"])

    def get_effective_api_key(self) -> str | None:
        with self._lock:
            stored = self._data.get("gemini_api_key")
            if isinstance(stored, str) and stored.strip():
                return stored.strip()
            if self._data.get("api_key_cleared"):
                return None
            env_val = os.environ.get("GEMINI_API_KEY") or self.config.gemini_api_key
            if env_val and env_val.strip():
                return env_val.strip()
            return None

    def get_effective_vertex(self) -> tuple[bool, str | None, str]:
        with self._lock:
            enabled = bool(self._data.get("vertex_enabled", False))
            project = self._data.get("vertex_project") or self.config.google_cloud_project
            location = self._data.get("vertex_location") or self.config.google_cloud_location or "us-central1"
            return enabled, project, location

    def get_brain_dir(self) -> Path:
        with self._lock:
            raw = self._data.get("brain_dir") or str(self.config.default_brain_dir)
            return Path(str(raw)).expanduser().resolve()

    def get_default_engine_mode(self) -> EngineMode:
        with self._lock:
            return self._data.get("default_engine_mode", "antigravity_sdk")

    def get_default_execution_policy(self) -> ExecutionPolicy:
        with self._lock:
            return self._data.get("default_execution_policy", "ask_mobile")

    def get_model(self) -> str:
        with self._lock:
            return str(self._data.get("model") or DEFAULT_MODEL)

    def get_auth_source(self) -> AuthSource:
        with self._lock:
            val = self._data.get("auth_source")
            if val in VALID_AUTH_SOURCES:
                return val  # type: ignore[return-value]
            return "auto"

    def get_tunnel_mode(self) -> TunnelMode:
        with self._lock:
            mode = self._data.get("tunnel_mode")
            if mode in VALID_TUNNEL_MODES:
                return mode  # type: ignore[return-value]
            return "cloudflare_quick"

    def get_tunnel_subdomain(self) -> str | None:
        with self._lock:
            val = self._data.get("tunnel_subdomain") or self.config.agy_tunnel_subdomain
            if isinstance(val, str) and val.strip():
                return val.strip()
            return None

    def get_tunnel_short_alias(self) -> str | None:
        with self._lock:
            val = self._data.get("tunnel_short_alias") or self.config.agy_tunnel_short_alias
            if isinstance(val, str) and val.strip():
                return val.strip()
            return None

    def get_tunnel_auto_shorten(self) -> bool:
        with self._lock:
            return bool(self._data.get("tunnel_auto_shorten", True))

    def get_effective_cloudflare_tunnel_token(self) -> str | None:
        with self._lock:
            stored = self._data.get("cloudflare_tunnel_token")
            if isinstance(stored, str) and stored.strip():
                return stored.strip()
            if self._data.get("cloudflare_tunnel_token_cleared"):
                return None
            env_val = os.environ.get("CLOUDFLARE_TUNNEL_TOKEN") or self.config.cloudflare_tunnel_token
            if env_val and env_val.strip():
                return env_val.strip()
            return None

    def get_cloudflare_tunnel_url(self) -> str | None:
        with self._lock:
            val = self._data.get("cloudflare_tunnel_url") or self.config.cloudflare_tunnel_url
            if isinstance(val, str) and val.strip():
                return val.strip()
            return None

    def get_discord_rpc_enabled(self) -> bool:
        with self._lock:
            return bool(self._data.get("discord_rpc_enabled", False))

    def get_discord_client_id(self) -> str | None:
        with self._lock:
            val = self._data.get("discord_client_id") or os.environ.get("AGY_DISCORD_CLIENT_ID")
            if isinstance(val, str) and val.strip():
                return val.strip()
            return None

    def get_discord_large_image(self) -> str | None:
        with self._lock:
            val = self._data.get("discord_large_image") or os.environ.get("AGY_DISCORD_LARGE_IMAGE")
            if isinstance(val, str) and val.strip():
                return val.strip()
            return None

    @staticmethod
    def _mask_api_key(key: str | None) -> str | None:
        if not key:
            return None
        if len(key) <= 8:
            return "*" * len(key)
        return f"{key[:4]}{'*' * (len(key) - 8)}{key[-4:]}"

    def to_response(self) -> SystemSettingsResponse:
        with self._lock:
            api_key = self.get_effective_api_key()
            cf_token = self.get_effective_cloudflare_tunnel_token()
            vertex_enabled, vertex_project, vertex_location = self.get_effective_vertex()
            return SystemSettingsResponse(
                auth_source=self.get_auth_source(),
                gemini_api_key_set=bool(api_key),
                gemini_api_key_masked=self._mask_api_key(api_key),
                vertex_enabled=vertex_enabled,
                vertex_project=vertex_project,
                vertex_location=vertex_location,
                default_engine_mode=self.get_default_engine_mode(),
                default_execution_policy=self.get_default_execution_policy(),
                brain_dir=str(self.get_brain_dir()),
                model=self.get_model(),
                pin=self.get_pin(),
                tunnel_mode=self.get_tunnel_mode(),
                tunnel_subdomain=self.get_tunnel_subdomain(),
                tunnel_short_alias=self.get_tunnel_short_alias(),
                tunnel_auto_shorten=self.get_tunnel_auto_shorten(),
                cloudflare_tunnel_token_set=bool(cf_token),
                cloudflare_tunnel_token_masked=self._mask_api_key(cf_token),
                cloudflare_tunnel_url=self.get_cloudflare_tunnel_url(),
                discord_rpc_enabled=self.get_discord_rpc_enabled(),
                discord_client_id=self.get_discord_client_id(),
                discord_large_image=self.get_discord_large_image(),
            )

    def update(self, req: UpdateSettingsRequest) -> SystemSettingsResponse:
        with self._lock:
            if req.auth_source is not None and req.auth_source in VALID_AUTH_SOURCES:
                self._data["auth_source"] = req.auth_source
            if req.clear_api_key:
                self._data["gemini_api_key"] = None
                self._data["api_key_cleared"] = True
            elif req.gemini_api_key is not None and req.gemini_api_key.strip():
                self._data["gemini_api_key"] = req.gemini_api_key.strip()
                self._data["api_key_cleared"] = False

            if req.vertex_enabled is not None:
                self._data["vertex_enabled"] = req.vertex_enabled
            if req.vertex_project is not None:
                self._data["vertex_project"] = req.vertex_project.strip() or None
            if req.vertex_location is not None and req.vertex_location.strip():
                self._data["vertex_location"] = req.vertex_location.strip()
            if req.default_engine_mode is not None and req.default_engine_mode in VALID_ENGINE_MODES:
                self._data["default_engine_mode"] = req.default_engine_mode
            if req.default_execution_policy is not None:
                self._data["default_execution_policy"] = req.default_execution_policy
            if req.brain_dir is not None and req.brain_dir.strip():
                self._data["brain_dir"] = str(Path(req.brain_dir.strip()).expanduser())
            if req.model is not None and req.model.strip():
                self._data["model"] = req.model.strip()
            if req.pin is not None and req.pin.strip():
                self._data["pin"] = req.pin.strip()

            if req.tunnel_mode is not None and req.tunnel_mode in VALID_TUNNEL_MODES:
                self._data["tunnel_mode"] = req.tunnel_mode
            if req.tunnel_subdomain is not None:
                self._data["tunnel_subdomain"] = req.tunnel_subdomain.strip() or None
            if req.tunnel_short_alias is not None:
                self._data["tunnel_short_alias"] = req.tunnel_short_alias.strip() or None
            if req.tunnel_auto_shorten is not None:
                self._data["tunnel_auto_shorten"] = req.tunnel_auto_shorten
            if req.clear_cloudflare_tunnel_token:
                self._data["cloudflare_tunnel_token"] = None
                self._data["cloudflare_tunnel_token_cleared"] = True
            elif req.cloudflare_tunnel_token is not None and req.cloudflare_tunnel_token.strip():
                self._data["cloudflare_tunnel_token"] = req.cloudflare_tunnel_token.strip()
                self._data["cloudflare_tunnel_token_cleared"] = False
            if req.cloudflare_tunnel_url is not None:
                self._data["cloudflare_tunnel_url"] = req.cloudflare_tunnel_url.strip() or None
            if req.discord_rpc_enabled is not None:
                self._data["discord_rpc_enabled"] = req.discord_rpc_enabled
            if req.discord_client_id is not None:
                self._data["discord_client_id"] = req.discord_client_id.strip() or None
            if req.discord_large_image is not None:
                self._data["discord_large_image"] = req.discord_large_image.strip() or None

            self._save()
            return self.to_response()
