"""Pydantic schemas matching the Antigravity Pulse REST & WebSocket contract."""

from __future__ import annotations

from typing import Any, Literal
from pydantic import BaseModel, Field

EngineMode = Literal["antigravity_sdk", "cli", "demo"]
ExecutionPolicy = Literal["read_only", "ask_mobile", "auto_workspace"]
AuthSource = Literal["auto", "agy_account", "google_oauth", "api_key", "vertex_adc"]
TunnelMode = Literal["cloudflare_quick", "serveo_ssh", "cloudflare_named"]
ArtifactCategory = Literal["markdown", "image", "pdf", "code", "html", "document", "other"]
ArtifactSource = Literal["antigravity_brain", "prompt_run", "project_workspace"]
PromptRunStatus = Literal[
    "queued",
    "running",
    "awaiting_approval",
    "completed",
    "failed",
    "cancelled",
]


# --- Auth ---


class AuthStatusResponse(BaseModel):
    authenticated: bool
    auth_required: bool = True
    pin_configured: bool = True
    device_name: str | None = None


class LoginRequest(BaseModel):
    pin: str
    device_name: str | None = None


class PairRequest(BaseModel):
    pair_token: str
    device_name: str | None = None


class AuthTokenResponse(BaseModel):
    token: str
    expires_at: str
    device_id: str


class PairInfoResponse(BaseModel):
    lan_url: str
    tailscale_url: str | None = None
    tunnel_url: str | None = None
    tunnel_short_url: str | None = None
    preferred_url: str
    pair_url: str
    pin: str
    qr_svg_data_url: str


class RotatePairRequest(BaseModel):
    pin: str | None = None


class DeviceSession(BaseModel):
    device_id: str
    device_name: str
    connected_at: str
    last_seen_at: str
    online: bool


class DevicesResponse(BaseModel):
    devices: list[DeviceSession]


# --- Projects & Files ---


class Project(BaseModel):
    id: str
    name: str
    path: str
    description: str = ""
    engine_mode: EngineMode = "antigravity_sdk"
    execution_policy: ExecutionPolicy = "ask_mobile"
    git_branch: str | None = None
    git_dirty: bool = False
    last_activity_at: str | None = None
    created_at: str
    exists: bool = True


class ProjectsResponse(BaseModel):
    projects: list[Project]


class CreateProjectRequest(BaseModel):
    name: str
    path: str
    description: str = ""
    engine_mode: EngineMode | None = None
    execution_policy: ExecutionPolicy | None = None


class UpdateProjectRequest(BaseModel):
    name: str | None = None
    path: str | None = None
    description: str | None = None
    engine_mode: EngineMode | None = None
    execution_policy: ExecutionPolicy | None = None


class DeleteProjectResponse(BaseModel):
    deleted: bool = True


class FileEntry(BaseModel):
    name: str
    rel_path: str
    is_dir: bool
    size: int
    modified_at: str
    category: ArtifactCategory
    mime_type: str


class ProjectFilesResponse(BaseModel):
    current_path: str
    entries: list[FileEntry]


class FileContentResponse(BaseModel):
    rel_path: str
    name: str
    size: int
    mime_type: str
    category: ArtifactCategory
    text: str | None = None
    raw_url: str
    modified_at: str


# --- Antigravity Brain Monitor & Artifacts ---


class ArtifactItem(BaseModel):
    id: str
    source: ArtifactSource
    scope_id: str
    scope_title: str
    name: str
    rel_path: str
    category: ArtifactCategory
    mime_type: str
    size: int
    modified_at: str
    raw_url: str
    preview_url: str


class AntigravitySessionSummary(BaseModel):
    id: str
    title: str
    updated_at: str
    created_at: str
    step_count: int
    artifact_count: int
    latest_status: Literal["active", "done", "error", "idle"]
    model: str | None = None
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    preview: str = ""


class ToolCallEntry(BaseModel):
    name: str
    args: dict[str, Any] | None = None


class TranscriptStep(BaseModel):
    step_index: int
    source: str
    type: str
    status: str
    created_at: str
    model: str | None = None
    content: str | None = None
    thinking: str | None = None
    tool_calls: list[ToolCallEntry] = Field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    truncated: bool = False


class AntigravitySessionsResponse(BaseModel):
    sessions: list[AntigravitySessionSummary]
    brain_dir: str


class AntigravitySessionDetailResponse(BaseModel):
    summary: AntigravitySessionSummary
    steps: list[TranscriptStep]
    artifacts: list[ArtifactItem]


class ArtifactsListResponse(BaseModel):
    artifacts: list[ArtifactItem]


# --- Prompts, Queue & Mobile Approvals ---


class PromptToolCall(BaseModel):
    id: str
    name: str
    args: dict[str, Any] | None = None
    status: str
    timestamp: str


class AttachmentItem(BaseModel):
    id: str
    name: str
    rel_path: str
    mime_type: str
    size: int
    raw_url: str


class PromptRun(BaseModel):
    id: str
    project_id: str
    project_name: str
    prompt: str
    engine_mode: EngineMode
    execution_policy: ExecutionPolicy
    status: PromptRunStatus
    thoughts: str = ""
    response_text: str = ""
    tool_calls: list[PromptToolCall] = Field(default_factory=list)
    attachments: list[AttachmentItem] = Field(default_factory=list)
    output_artifacts: list[ArtifactItem] = Field(default_factory=list)
    error: str | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    device_name: str | None = None


class PendingApproval(BaseModel):
    approval_id: str
    run_id: str
    project_name: str
    tool_name: str
    description: str
    args: dict[str, Any] = Field(default_factory=dict)
    created_at: str


class UploadResponse(BaseModel):
    attachments: list[AttachmentItem]


class RunPromptRequest(BaseModel):
    project_id: str
    prompt: str
    engine_mode: EngineMode | None = None
    execution_policy: ExecutionPolicy | None = None
    attachment_ids: list[str] = Field(default_factory=list)
    device_name: str | None = None


class PromptsListResponse(BaseModel):
    runs: list[PromptRun]
    pending_approvals: list[PendingApproval]


class CancelPromptResponse(BaseModel):
    run_id: str
    status: str = "cancelled"


class ApproveToolRequest(BaseModel):
    approval_id: str
    approved: bool


class ApproveToolResponse(BaseModel):
    approval_id: str
    approved: bool


# --- System, Settings & Tunnel ---


class SystemStatusResponse(BaseModel):
    hostname: str
    os: str
    python_version: str
    sdk_installed: bool
    sdk_version: str | None = None
    sdk_configured: bool
    api_key_configured: bool
    vertex_configured: bool
    agy_cli_found: bool
    brain_dir: str
    brain_session_count: int
    lan_ip: str
    port: int
    lan_url: str
    tailscale_url: str | None = None
    cloudflared_installed: bool
    ssh_installed: bool = False
    tunnel_mode: TunnelMode = "cloudflare_quick"
    tunnel_running: bool
    tunnel_url: str | None = None
    tunnel_short_url: str | None = None
    connected_clients: int
    uptime_seconds: float


class SystemSettingsResponse(BaseModel):
    auth_source: AuthSource = "auto"
    gemini_api_key_set: bool
    gemini_api_key_masked: str | None = None
    vertex_enabled: bool
    vertex_project: str | None = None
    vertex_location: str
    default_engine_mode: EngineMode
    default_execution_policy: ExecutionPolicy
    brain_dir: str
    model: str
    pin: str
    tunnel_mode: TunnelMode = "cloudflare_quick"
    tunnel_subdomain: str | None = None
    tunnel_short_alias: str | None = None
    tunnel_auto_shorten: bool = True
    cloudflare_tunnel_token_set: bool = False
    cloudflare_tunnel_token_masked: str | None = None
    cloudflare_tunnel_url: str | None = None


class UpdateSettingsRequest(BaseModel):
    auth_source: AuthSource | None = None
    gemini_api_key: str | None = None
    clear_api_key: bool = False
    vertex_enabled: bool | None = None
    vertex_project: str | None = None
    vertex_location: str | None = None
    default_engine_mode: EngineMode | None = None
    default_execution_policy: ExecutionPolicy | None = None
    brain_dir: str | None = None
    model: str | None = None
    pin: str | None = None
    tunnel_mode: TunnelMode | None = None
    tunnel_subdomain: str | None = None
    tunnel_short_alias: str | None = None
    tunnel_auto_shorten: bool | None = None
    cloudflare_tunnel_token: str | None = None
    clear_cloudflare_tunnel_token: bool = False
    cloudflare_tunnel_url: str | None = None


class TunnelStartResponse(BaseModel):
    tunnel_running: bool
    tunnel_mode: TunnelMode = "cloudflare_quick"
    tunnel_url: str | None = None
    tunnel_short_url: str | None = None
    error: str | None = None
    install_hint: str | None = None
    tailscale_url: str | None = None


class TunnelStopResponse(BaseModel):
    tunnel_running: bool
    tunnel_url: str | None = None
    tunnel_short_url: str | None = None


# --- Model & Quota Tracking ---


class ModelQuotaInfo(BaseModel):
    id: str
    display_name: str
    description: str
    category: Literal["flash", "pro", "experimental", "other"]
    daily_limit: int
    used_today: int
    remaining_today: int
    rpm_limit: int
    status: Literal["active", "exhausted", "low"]
    is_current: bool
    retry_after: str | None = None
    input_token_limit: int = 1048576
    output_token_limit: int = 65536


class ModelListResponse(BaseModel):
    current_model: str
    models: list[ModelQuotaInfo]


class SelectModelRequest(BaseModel):
    model: str


# --- Mobile Builds & Packages ---


class MobileBuildInfo(BaseModel):
    android_apk_available: bool = False
    android_apk_size: int | None = None
    android_apk_updated_at: str | None = None
    android_apk_url: str | None = None
    ios_ipa_available: bool = False
    ios_ipa_size: int | None = None
    ios_ipa_updated_at: str | None = None
    ios_ipa_url: str | None = None
    android_project_ready: bool = False
    ios_project_ready: bool = False
    deep_link_pair_url: str | None = None


# --- Google Account & Antigravity (AGY) Unified Auth ---


class GoogleAuthStatusResponse(BaseModel):
    auth_source: AuthSource = "auto"
    effective_auth_source: str = "agy_account"
    agy_cli_installed: bool = False
    agy_authenticated: bool = False
    agy_model_count: int = 0
    agy_api_key_override: bool = False
    agy_error: str | None = None
    google_connected: bool = False
    google_email: str | None = None
    google_name: str | None = None
    google_picture: str | None = None
    google_token_source: str | None = None
    google_has_refresh_token: bool = False
    google_expires_in_seconds: int | None = None
    google_scopes: list[str] = Field(default_factory=list)
    google_connected_at: str | None = None
    oauth_client_configured: bool = False
    oauth_client_id_preview: str | None = None
    quota_project_id: str | None = None
    gcloud_adc_found: bool = False
    gcloud_adc_path: str | None = None


class GoogleOAuthClientRequest(BaseModel):
    client_id: str | None = None
    client_secret: str | None = None
    client_json: str | None = None
    quota_project_id: str | None = None


class GoogleOAuthStartRequest(BaseModel):
    open_on_pc: bool = False
    redirect_origin: str | None = None


class GoogleOAuthStartResponse(BaseModel):
    auth_url: str
    redirect_uri: str
    state: str
    opened_on_pc: bool = False


class GoogleOAuthManualCallbackRequest(BaseModel):
    callback_url_or_code: str
    state: str | None = None


class GoogleDirectTokenRequest(BaseModel):
    access_token: str
    refresh_token: str | None = None
    quota_project_id: str | None = None


