"""Configuration settings for Antigravity Pulse backend."""

from __future__ import annotations

from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


APP_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = Path(__file__).resolve().parents[1]


class AppConfig(BaseSettings):
    """Environment-backed runtime configuration."""

    model_config = SettingsConfigDict(
        env_file=str(APP_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    agy_host: str = Field(default="0.0.0.0", alias="AGY_HOST")
    agy_port: int = Field(default=8765, alias="AGY_PORT")
    agy_bridge_pin: str | None = Field(default=None, alias="AGY_BRIDGE_PIN")
    agy_data_dir: str | None = Field(default=None, alias="AGY_DATA_DIR")
    agy_brain_dir: str | None = Field(default=None, alias="AGY_BRAIN_DIR")
    agy_frontend_dist: str | None = Field(default=None, alias="AGY_FRONTEND_DIST")
    agy_default_project: str | None = Field(default=None, alias="AGY_DEFAULT_PROJECT")
    agy_model: str | None = Field(default=None, alias="AGY_MODEL")
    agy_auth_source: str | None = Field(default=None, alias="AGY_AUTH_SOURCE")
    agy_tunnel_mode: str | None = Field(default=None, alias="AGY_TUNNEL_MODE")
    agy_tunnel_subdomain: str | None = Field(default=None, alias="AGY_TUNNEL_SUBDOMAIN")
    agy_tunnel_short_alias: str | None = Field(default=None, alias="AGY_TUNNEL_SHORT_ALIAS")
    cloudflare_tunnel_token: str | None = Field(default=None, alias="CLOUDFLARE_TUNNEL_TOKEN")
    cloudflare_tunnel_url: str | None = Field(default=None, alias="CLOUDFLARE_TUNNEL_URL")

    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    google_genai_use_vertexai: bool = Field(default=False, alias="GOOGLE_GENAI_USE_VERTEXAI")
    google_cloud_project: str | None = Field(default=None, alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field(default="us-central1", alias="GOOGLE_CLOUD_LOCATION")

    @property
    def data_dir(self) -> Path:
        if self.agy_data_dir:
            return Path(self.agy_data_dir).expanduser().resolve()
        return (BACKEND_ROOT / "data").resolve()

    @property
    def default_brain_dir(self) -> Path:
        if self.agy_brain_dir:
            return Path(self.agy_brain_dir).expanduser().resolve()
        return (Path.home() / ".gemini" / "antigravity" / "brain").resolve()

    @property
    def frontend_dist_dir(self) -> Path:
        if self.agy_frontend_dist:
            return Path(self.agy_frontend_dist).expanduser().resolve()
        return (APP_ROOT / "frontend" / "dist").resolve()

    @property
    def default_project_dir(self) -> Path:
        if self.agy_default_project:
            return Path(self.agy_default_project).expanduser().resolve()
        return APP_ROOT.resolve()
