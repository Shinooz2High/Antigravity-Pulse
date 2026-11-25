export type EngineMode = 'antigravity_sdk' | 'cli' | 'demo';
export type ExecutionPolicy = 'read_only' | 'ask_mobile' | 'auto_workspace';
export type AuthSource = 'auto' | 'agy_account' | 'google_oauth' | 'api_key' | 'vertex_adc';
export type TunnelMode = 'cloudflare_quick' | 'serveo_ssh' | 'cloudflare_named';
export type ArtifactCategory =
  | 'markdown'
  | 'image'
  | 'pdf'
  | 'code'
  | 'html'
  | 'document'
  | 'other';

export type PromptStatus =
  | 'queued'
  | 'running'
  | 'awaiting_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SessionStatus = 'active' | 'done' | 'error' | 'idle';

export type TabKey = 'dashboard' | 'prompt' | 'projects' | 'outputs' | 'settings';

export interface AuthStatus {
  authenticated: boolean;
  auth_required: boolean;
  pin_configured: boolean;
  device_name: string | null;
}

export interface AuthTokenResponse {
  token: string;
  expires_at: string;
  device_id: string;
}

export interface PairInfo {
  lan_url: string;
  tailscale_url: string | null;
  tunnel_url: string | null;
  tunnel_short_url?: string | null;
  preferred_url: string;
  pair_url: string;
  pin: string;
  quick_code?: string;
  quick_short_url?: string | null;
  quick_relay_synced?: boolean;
  qr_svg_data_url: string;
}

export interface DeviceInfo {
  device_id: string;
  device_name: string;
  connected_at: string;
  last_seen_at: string;
  online: boolean;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  engine_mode: EngineMode;
  execution_policy: ExecutionPolicy;
  git_branch: string | null;
  git_dirty: boolean;
  last_activity_at: string | null;
  created_at: string;
  exists: boolean;
}

export interface ProjectCreateInput {
  name: string;
  path: string;
  description?: string;
  engine_mode?: EngineMode;
  execution_policy?: ExecutionPolicy;
}

export interface ProjectUpdateInput {
  name?: string;
  path?: string;
  description?: string;
  engine_mode?: EngineMode;
  execution_policy?: ExecutionPolicy;
}

export interface FileEntry {
  name: string;
  rel_path: string;
  is_dir: boolean;
  size: number;
  modified_at: string;
  category: ArtifactCategory;
  mime_type: string;
}

export interface FileListResponse {
  current_path: string;
  entries: FileEntry[];
}

export interface FileContentResponse {
  rel_path: string;
  name: string;
  size: number;
  mime_type: string;
  category: ArtifactCategory;
  text: string | null;
  raw_url: string;
  modified_at: string;
}

export interface AntigravitySessionSummary {
  id: string;
  title: string;
  updated_at: string;
  created_at: string;
  step_count: number;
  artifact_count: number;
  latest_status: SessionStatus;
  model: string | null;
  total_input_tokens: number;
  total_output_tokens: number;
  preview: string;
}

export interface TranscriptToolCall {
  name: string;
  args?: unknown;
}

export interface TranscriptStep {
  step_index: number;
  source: string;
  type: string;
  status: string;
  created_at: string;
  model: string | null;
  content: string | null;
  thinking: string | null;
  tool_calls: TranscriptToolCall[];
  input_tokens: number;
  output_tokens: number;
  truncated: boolean;
}

export interface ArtifactItem {
  id: string;
  source: 'antigravity_brain' | 'prompt_run' | 'project_workspace';
  scope_id: string;
  scope_title: string;
  name: string;
  rel_path: string;
  category: ArtifactCategory;
  mime_type: string;
  size: number;
  modified_at: string;
  raw_url: string;
  preview_url: string;
}

export interface SessionDetailResponse {
  summary: AntigravitySessionSummary;
  steps: TranscriptStep[];
  artifacts: ArtifactItem[];
}

export interface AttachmentItem {
  id: string;
  name: string;
  rel_path: string;
  mime_type: string;
  size: number;
  raw_url: string;
}

export interface PromptToolCall {
  id: string;
  name: string;
  args?: unknown;
  status: string;
  timestamp: string;
}

export interface PromptRun {
  id: string;
  project_id: string;
  project_name: string;
  prompt: string;
  engine_mode: EngineMode;
  execution_policy: ExecutionPolicy;
  status: PromptStatus;
  thoughts: string;
  response_text: string;
  tool_calls: PromptToolCall[];
  attachments: AttachmentItem[];
  output_artifacts: ArtifactItem[];
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  device_name: string | null;
}

export interface PendingApproval {
  approval_id: string;
  run_id: string;
  project_name: string;
  tool_name: string;
  description: string;
  args: Record<string, unknown>;
  created_at: string;
}

export interface SystemStatus {
  hostname: string;
  os: string;
  python_version: string;
  sdk_installed: boolean;
  sdk_version: string | null;
  sdk_configured: boolean;
  api_key_configured: boolean;
  vertex_configured: boolean;
  agy_cli_found: boolean;
  brain_dir: string;
  brain_session_count: number;
  lan_ip: string;
  port: number;
  lan_url: string;
  tailscale_url: string | null;
  cloudflared_installed: boolean;
  ssh_installed?: boolean;
  tunnel_mode?: TunnelMode;
  tunnel_running: boolean;
  tunnel_url: string | null;
  tunnel_short_url?: string | null;
  connected_clients: number;
  uptime_seconds: number;
}

export interface SystemSettings {
  auth_source?: AuthSource;
  gemini_api_key_set: boolean;
  gemini_api_key_masked: string | null;
  vertex_enabled: boolean;
  vertex_project: string | null;
  vertex_location: string;
  default_engine_mode: EngineMode;
  default_execution_policy: ExecutionPolicy;
  brain_dir: string;
  model: string;
  pin: string;
  tunnel_mode?: TunnelMode;
  tunnel_subdomain?: string | null;
  tunnel_short_alias?: string | null;
  tunnel_auto_shorten?: boolean;
  cloudflare_tunnel_token_set?: boolean;
  cloudflare_tunnel_token_masked?: string | null;
  cloudflare_tunnel_url?: string | null;
}

export interface SystemSettingsUpdate {
  auth_source?: AuthSource;
  gemini_api_key?: string;
  clear_api_key?: boolean;
  vertex_enabled?: boolean;
  vertex_project?: string;
  vertex_location?: string;
  default_engine_mode?: EngineMode;
  default_execution_policy?: ExecutionPolicy;
  brain_dir?: string;
  model?: string;
  pin?: string;
  tunnel_mode?: TunnelMode;
  tunnel_subdomain?: string;
  tunnel_short_alias?: string;
  tunnel_auto_shorten?: boolean;
  cloudflare_tunnel_token?: string;
  clear_cloudflare_tunnel_token?: boolean;
  cloudflare_tunnel_url?: string;
}

export interface TunnelActionResponse {
  tunnel_running: boolean;
  tunnel_mode?: TunnelMode;
  tunnel_url?: string | null;
  tunnel_short_url?: string | null;
  error?: string | null;
  install_hint?: string | null;
  tailscale_url?: string | null;
}

export type ModelCategory = 'flash' | 'pro' | 'experimental' | 'other';
export type ModelStatus = 'active' | 'exhausted' | 'low';

export interface ModelQuotaInfo {
  id: string;
  display_name: string;
  description: string;
  category: ModelCategory;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  rpm_limit: number;
  status: ModelStatus;
  is_current: boolean;
  retry_after?: string | null;
  input_token_limit: number;
  output_token_limit: number;
}

export interface ModelListResponse {
  current_model: string;
  models: ModelQuotaInfo[];
}

export interface MobileBuildInfo {
  android_apk_available: boolean;
  android_apk_size: number | null;
  android_apk_updated_at: string | null;
  android_apk_url: string | null;
  ios_ipa_available: boolean;
  ios_ipa_size: number | null;
  ios_ipa_updated_at: string | null;
  ios_ipa_url: string | null;
  android_project_ready: boolean;
  ios_project_ready: boolean;
  deep_link_pair_url: string | null;
}

export interface GoogleAuthStatus {
  auth_source: AuthSource;
  effective_auth_source: string;
  agy_cli_installed: boolean;
  agy_authenticated: boolean;
  agy_model_count: number;
  agy_api_key_override: boolean;
  agy_error: string | null;
  google_connected: boolean;
  google_email: string | null;
  google_name: string | null;
  google_picture: string | null;
  google_token_source: string | null;
  google_has_refresh_token: boolean;
  google_expires_in_seconds: number | null;
  google_scopes: string[];
  google_connected_at: string | null;
  oauth_client_configured: boolean;
  oauth_client_id_preview: string | null;
  quota_project_id: string | null;
  gcloud_adc_found: boolean;
  gcloud_adc_path: string | null;
}

export interface GoogleOAuthStartResponse {
  auth_url: string;
  redirect_uri: string;
  state: string;
  opened_on_pc: boolean;
}

export interface WsEnvelope {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export type ArtifactModalTarget =
  | {
      kind: 'artifact';
      artifact: ArtifactItem;
    }
  | {
      kind: 'project_file';
      projectId: string;
      projectName: string;
      entry: FileEntry;
    }
  | {
      kind: 'run_artifact';
      runId: string;
      artifact: ArtifactItem;
    };
