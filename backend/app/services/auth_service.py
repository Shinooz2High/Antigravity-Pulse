"""Authentication, pairing tokens, and device session management."""

from __future__ import annotations

import hmac
import secrets
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Query, Request, status

from ..models import AuthTokenResponse, DeviceSession
from ..utils import atomic_write_json, read_json_file, utc_now, utc_now_iso
from .settings_service import SettingsService

TOKEN_TTL_DAYS = 30


class AuthService:
    """Manages PIN / pairing login and persistent device bearer tokens."""

    def __init__(self, settings: SettingsService) -> None:
        self.settings = settings
        self.sessions_path = settings.data_dir / "auth_sessions.json"
        self._lock = threading.RLock()
        self._tokens: dict[str, dict[str, Any]] = {}
        self._load()

    def _load(self) -> None:
        with self._lock:
            raw = read_json_file(self.sessions_path, default={})
            if isinstance(raw, dict):
                self._tokens = raw
            else:
                self._tokens = {}

    def _save(self) -> None:
        atomic_write_json(self.sessions_path, self._tokens)

    def _issue_token(self, device_name: str | None) -> AuthTokenResponse:
        now = utc_now()
        expires = now + timedelta(days=TOKEN_TTL_DAYS)
        token = secrets.token_urlsafe(32)
        device_id = f"dev_{secrets.token_hex(6)}"
        clean_name = (device_name or "").strip() or "Mobile Device"
        now_iso = now.isoformat().replace("+00:00", "Z")
        expires_iso = expires.isoformat().replace("+00:00", "Z")

        with self._lock:
            self._tokens[token] = {
                "device_id": device_id,
                "device_name": clean_name,
                "connected_at": now_iso,
                "last_seen_at": now_iso,
                "expires_at": expires_iso,
            }
            self._save()

        return AuthTokenResponse(token=token, expires_at=expires_iso, device_id=device_id)

    def login_with_pin(self, pin: str, device_name: str | None = None) -> AuthTokenResponse:
        expected = self.settings.get_pin()
        candidate = (pin or "").strip()
        if not candidate or not hmac.compare_digest(candidate, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid PIN",
            )
        return self._issue_token(device_name)

    def login_with_pair_token(self, pair_token: str, device_name: str | None = None) -> AuthTokenResponse:
        expected = self.settings.get_pair_token()
        candidate = (pair_token or "").strip()
        if not candidate or not hmac.compare_digest(candidate, expected):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired pairing token",
            )
        return self._issue_token(device_name)

    def validate_token(self, token: str | None, touch: bool = True) -> dict[str, Any] | None:
        if not token:
            return None
        with self._lock:
            record = self._tokens.get(token)
            if not record:
                return None
            try:
                expires_at = datetime.fromisoformat(str(record["expires_at"]).replace("Z", "+00:00"))
                if expires_at < utc_now():
                    del self._tokens[token]
                    self._save()
                    return None
            except (KeyError, ValueError):
                return None

            if touch:
                record["last_seen_at"] = utc_now_iso()
            return dict(record)

    def list_devices(self, online_device_ids: set[str] | None = None) -> list[DeviceSession]:
        online_ids = online_device_ids or set()
        now = utc_now()
        results: list[DeviceSession] = []
        with self._lock:
            expired_keys: list[str] = []
            for tok, rec in self._tokens.items():
                try:
                    exp = datetime.fromisoformat(str(rec["expires_at"]).replace("Z", "+00:00"))
                    if exp < now:
                        expired_keys.append(tok)
                        continue
                except (KeyError, ValueError):
                    expired_keys.append(tok)
                    continue

                device_id = str(rec.get("device_id", ""))
                results.append(
                    DeviceSession(
                        device_id=device_id,
                        device_name=str(rec.get("device_name", "Mobile Device")),
                        connected_at=str(rec.get("connected_at", utc_now_iso())),
                        last_seen_at=str(rec.get("last_seen_at", utc_now_iso())),
                        online=device_id in online_ids,
                    )
                )
            if expired_keys:
                for k in expired_keys:
                    self._tokens.pop(k, None)
                self._save()

        results.sort(key=lambda d: (d.online, d.last_seen_at), reverse=True)
        return results


def extract_token_from_request(request: Request, query_token: str | None = None) -> str | None:
    auth_header = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        tok = auth_header[7:].strip()
        if tok:
            return tok
    if query_token and query_token.strip():
        return query_token.strip()
    token_param = request.query_params.get("token")
    if token_param and token_param.strip():
        return token_param.strip()
    return None


def require_auth(
    request: Request,
    token: str | None = Query(default=None),
) -> dict[str, Any]:
    auth_service: AuthService = request.app.state.auth_service
    extracted = extract_token_from_request(request, token)
    record = auth_service.validate_token(extracted, touch=True)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return record
