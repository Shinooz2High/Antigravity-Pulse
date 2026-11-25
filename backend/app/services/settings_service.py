"""Persistent settings management (PIN, pairing token, SDK/API keys, defaults)."""

from __future__ import annotations

import os
import secrets
import threading
from pathlib import Path
from typing import Any

from ..config import AppConfig
from ..models import EngineMode, ExecutionPolicy, SystemSettingsResponse, UpdateSettingsRequest
from ..utils import atomic_write_json, read_json_file

DEFAULT_MODEL = "gemini-3-flash-preview"


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

            if stored.get("default_engine_mode") not in {"antigravity_sdk", "cli", "demo"}:
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

    def rotate_pair(self, new_pin: str | None = None) -> tuple[str, str]:
        with self._lock:
            self._data["pair_token"] = self._generate_pair_token()
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
            vertex_enabled, vertex_project, vertex_location = self.get_effective_vertex()
            return SystemSettingsResponse(
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
            )

    def update(self, req: UpdateSettingsRequest) -> SystemSettingsResponse:
        with self._lock:
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
            if req.default_engine_mode is not None:
                self._data["default_engine_mode"] = req.default_engine_mode
            if req.default_execution_policy is not None:
                self._data["default_execution_policy"] = req.default_execution_policy
            if req.brain_dir is not None and req.brain_dir.strip():
                self._data["brain_dir"] = str(Path(req.brain_dir.strip()).expanduser())
            if req.model is not None and req.model.strip():
                self._data["model"] = req.model.strip()
            if req.pin is not None and req.pin.strip():
                self._data["pin"] = req.pin.strip()

            self._save()
            return self.to_response()
