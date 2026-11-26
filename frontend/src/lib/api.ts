import type {
  AgentMemoryItem,
  AntigravitySessionSummary,
  ArtifactCategory,
  ArtifactItem,
  AttachmentItem,
  AuthStatus,
  AuthTokenResponse,
  DeviceInfo,
  DiscordRpcStatus,
  EngineMode,
  ExecutionPolicy,
  FileContentResponse,
  FileListResponse,
  GoogleAuthStatus,
  GoogleOAuthStartResponse,
  MobileBuildInfo,
  ModelListResponse,
  PairInfo,
  PendingApproval,
  Project,
  ProjectCreateInput,
  ProjectUpdateInput,
  PromptRun,
  SessionDetailResponse,
  SystemSettings,
  SystemSettingsUpdate,
  SystemStatus,
  TranscriptStep,
  TunnelActionResponse,
} from '../types/api';
import { isNativeApp } from './native';
import { detectDefaultDeviceName } from './utils';

const TOKEN_KEY = 'agy_pulse_token';
const DEVICE_NAME_KEY = 'agy_pulse_device_name';
const SERVER_URL_KEY = 'agy_pulse_server_url';

export const PUBLIC_WEB_PORTAL_URL = 'https://agypulse.dpdns.org';

export function isRemoteWebHost(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  if (!host) return false;
  return (
    host === 'agypulse.dpdns.org' ||
    host.endsWith('.dpdns.org') ||
    host.endsWith('.vercel.app') ||
    host.endsWith('.workers.dev') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.netlify.app')
  );
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(cb: (() => void) | null): void {
  unauthorizedHandler = cb;
}

export function normalizeServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (/^agypulse:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const inner = u.searchParams.get('url') || u.searchParams.get('server') || '';
      if (inner) return normalizeServerUrl(inner);
    } catch {
      return '';
    }
    return '';
  }

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    const isLocalIpOrHost =
      /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|100\.\d+\.\d+\.\d+)(:\d+)?(\/.*)?$/i.test(
        candidate
      );
    if (isLocalIpOrHost) {
      const hostPart = candidate.split('/')[0];
      const withPort = hostPart.includes(':') ? hostPart : `${hostPart}:8765`;
      candidate = `http://${withPort}`;
    } else if (/^[\w.-]+:\d+(\/.*)?$/.test(candidate)) {
      candidate = `http://${candidate.split('/')[0]}`;
    } else {
      candidate = `https://${candidate}`;
    }
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return '';
  }
}

export interface ParsedPairingInput {
  serverUrl: string | null;
  pairToken: string | null;
  pin: string | null;
}

export function parsePairingInput(raw: string): ParsedPairingInput {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { serverUrl: null, pairToken: null, pin: null };
  }

  if (/^agypulse:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      const rawServer = u.searchParams.get('url') || u.searchParams.get('server') || '';
      const serverUrl = rawServer ? normalizeServerUrl(rawServer) || null : null;
      const pairToken =
        u.searchParams.get('pair') || u.searchParams.get('token') || null;
      const pin = u.searchParams.get('pin') || null;
      return { serverUrl, pairToken, pin };
    } catch {
      return { serverUrl: null, pairToken: null, pin: null };
    }
  }

  if (/^\d{4,8}$/.test(trimmed)) {
    return { serverUrl: null, pairToken: null, pin: trimmed };
  }

  if (/^[0-9a-f]{24,64}$/i.test(trimmed)) {
    return { serverUrl: null, pairToken: trimmed, pin: null };
  }

  try {
    const withScheme = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : trimmed.includes('?pair=') || trimmed.includes('&pair=')
        ? `${/^(localhost|\d+\.\d+\.\d+\.\d+)/.test(trimmed) ? 'http://' : 'https://'}${trimmed}`
        : '';

    if (withScheme) {
      const parsed = new URL(withScheme);
      const pairToken =
        parsed.searchParams.get('pair') || parsed.searchParams.get('token') || null;
      const pin = parsed.searchParams.get('pin') || null;
      const serverUrl = normalizeServerUrl(`${parsed.protocol}//${parsed.host}`) || null;
      return { serverUrl, pairToken, pin };
    }
  } catch {
    // Fall through
  }

  const normalized = normalizeServerUrl(trimmed);
  return {
    serverUrl: normalized || null,
    pairToken: null,
    pin: null,
  };
}

export function getServerUrl(): string {
  try {
    const saved = localStorage.getItem(SERVER_URL_KEY);
    return saved ? normalizeServerUrl(saved) : '';
  } catch {
    return '';
  }
}

export function setServerUrl(url: string): string {
  const normalized = normalizeServerUrl(url);
  try {
    if (normalized) {
      localStorage.setItem(SERVER_URL_KEY, normalized);
    } else {
      localStorage.removeItem(SERVER_URL_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  return normalized;
}

export function clearServerUrl(): void {
  try {
    localStorage.removeItem(SERVER_URL_KEY);
  } catch {
    // Ignore
  }
}

export function resolveApiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl) || /^blob:|^data:/i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const base = getServerUrl();
  const cleanPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  if (base) {
    return `${base}${cleanPath}`;
  }
  return cleanPath;
}

export function getAbsoluteResourceUrl(pathOrUrl: string): string {
  const resolved = resolveApiUrl(pathOrUrl);
  if (/^https?:\/\//i.test(resolved)) return resolved;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(resolved, window.location.origin).toString();
  }
  return resolved;
}

export function resolveWsUrl(params: URLSearchParams): string {
  const base = getServerUrl();
  const qs = params.toString();
  if (base) {
    const parsed = new URL(base);
    const proto = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${parsed.host}/ws${qs ? `?${qs}` : ''}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws${qs ? `?${qs}` : ''}`;
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors
  }
}

export function getDeviceName(): string {
  try {
    const saved = localStorage.getItem(DEVICE_NAME_KEY);
    if (saved && saved.trim()) return saved;
  } catch {
    // Ignore
  }
  return detectDefaultDeviceName();
}

export function setDeviceName(name: string): void {
  try {
    localStorage.setItem(DEVICE_NAME_KEY, name.trim() || detectDefaultDeviceName());
  } catch {
    // Ignore
  }
}

export function withToken(url: string): string {
  if (!url) return url;
  const resolved = resolveApiUrl(url);
  const token = getToken();
  if (!token) return resolved;
  if (/[?&]token=/.test(resolved)) return resolved;
  const sep = resolved.includes('?') ? '&' : '?';
  return `${resolved}${sep}token=${encodeURIComponent(token)}`;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if ((isNativeApp() || isRemoteWebHost()) && !getServerUrl() && !/^https?:\/\//i.test(path)) {
    throw new ApiError(
      0,
      'Chưa cấu hình địa chỉ máy chủ PC. Hãy quét mã QR hoặc nhập địa chỉ IP / Tunnel của PC.'
    );
  }

  const targetUrl = resolveApiUrl(path);
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (
    init.body &&
    typeof init.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      ...init,
      headers,
    });
  } catch {
    const base = getServerUrl();
    throw new ApiError(
      0,
      base
        ? `Không thể kết nối tới máy chủ PC (${base}). Hãy kiểm tra PC đang chạy start.ps1 và cùng mạng Wi-Fi hoặc bật Tunnel.`
        : 'Không thể kết nối tới máy chủ PC.'
    );
  }

  if (res.status === 401) {
    clearToken();
    unauthorizedHandler?.();
  }

  if (!res.ok) {
    let detail = `Lỗi HTTP ${res.status}`;
    try {
      const data = (await res.json()) as { detail?: string; error?: string; message?: string };
      detail = data.detail || data.error || data.message || detail;
    } catch {
      try {
        const text = await res.text();
        if (text) detail = text.slice(0, 200);
      } catch {
        // Ignore
      }
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

export const api = {
  // Auth
  getAuthStatus(): Promise<AuthStatus> {
    return apiFetch<AuthStatus>('/api/auth/status');
  },

  login(pin: string, deviceName?: string): Promise<AuthTokenResponse> {
    return apiFetch<AuthTokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        pin,
        device_name: deviceName || getDeviceName(),
      }),
    });
  },

  pair(pairToken: string, deviceName?: string): Promise<AuthTokenResponse> {
    return apiFetch<AuthTokenResponse>('/api/auth/pair', {
      method: 'POST',
      body: JSON.stringify({
        pair_token: pairToken,
        device_name: deviceName || getDeviceName(),
      }),
    });
  },

  getPairInfo(): Promise<PairInfo> {
    return apiFetch<PairInfo>('/api/auth/pair-info');
  },

  rotatePair(pin?: string): Promise<PairInfo> {
    return apiFetch<PairInfo>('/api/auth/rotate-pair', {
      method: 'POST',
      body: JSON.stringify(pin ? { pin } : {}),
    });
  },

  syncQuickConnect(): Promise<PairInfo> {
    return apiFetch<PairInfo>('/api/auth/quick-sync', {
      method: 'POST',
    });
  },

  async getDevices(): Promise<DeviceInfo[]> {
    const res = await apiFetch<{ devices: DeviceInfo[] }>('/api/auth/devices');
    return res.devices ?? [];
  },

  // Pre-auth "Continue with Google" Login
  getPublicGoogleLoginInfo(): Promise<{
    oauth_client_configured: boolean;
    agy_authenticated: boolean;
    is_local_request: boolean;
    redirect_uri_hint: string;
  }> {
    return apiFetch('/api/auth/google/info');
  },

  startPublicGoogleLogin(payload: {
    device_name?: string;
    redirect_origin?: string;
    open_on_pc?: boolean;
  }): Promise<GoogleOAuthStartResponse> {
    return apiFetch<GoogleOAuthStartResponse>('/api/auth/google/start', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        device_name: payload.device_name || getDeviceName(),
      }),
    });
  },

  pollPublicGoogleLogin(state: string): Promise<{
    ready: boolean;
    token?: string;
    expires_at?: string;
    device_id?: string;
    email?: string;
    name?: string;
  }> {
    return apiFetch(`/api/auth/google/poll?state=${encodeURIComponent(state)}`);
  },

  loginWithLocalAgyGoogle(deviceName?: string): Promise<AuthTokenResponse> {
    return apiFetch<AuthTokenResponse>('/api/auth/google/local-agy', {
      method: 'POST',
      body: JSON.stringify({
        device_name: deviceName || getDeviceName(),
      }),
    });
  },

  setupAndStartPublicGoogleLogin(payload: {
    pin: string;
    client_id?: string;
    client_secret?: string;
    client_json?: string;
    device_name?: string;
    redirect_origin?: string;
  }): Promise<GoogleOAuthStartResponse> {
    return apiFetch<GoogleOAuthStartResponse>('/api/auth/google/setup-and-start', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        device_name: payload.device_name || getDeviceName(),
      }),
    });
  },

  loginWithDirectGoogleToken(payload: {
    pin: string;
    access_token: string;
    device_name?: string;
  }): Promise<AuthTokenResponse> {
    return apiFetch<AuthTokenResponse>('/api/auth/google/login-token', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        device_name: payload.device_name || getDeviceName(),
      }),
    });
  },

  // Projects
  async getProjects(): Promise<Project[]> {
    const res = await apiFetch<{ projects: Project[] }>('/api/projects');
    return res.projects ?? [];
  },

  createProject(input: ProjectCreateInput): Promise<Project> {
    return apiFetch<Project>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateProject(id: string, input: ProjectUpdateInput): Promise<Project> {
    return apiFetch<Project>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  deleteProject(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  getProjectFiles(projectId: string, relPath = ''): Promise<FileListResponse> {
    const params = new URLSearchParams();
    if (relPath) params.set('path', relPath);
    const qs = params.toString();
    return apiFetch<FileListResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/files${qs ? `?${qs}` : ''}`
    );
  },

  getProjectFileContent(projectId: string, relPath: string): Promise<FileContentResponse> {
    const params = new URLSearchParams({ path: relPath });
    return apiFetch<FileContentResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/file-content?${params.toString()}`
    );
  },

  getProjectFileRawUrl(projectId: string, relPath: string, download = false): string {
    const params = new URLSearchParams({
      path: relPath,
      download: download ? '1' : '0',
    });
    return withToken(`/api/projects/${encodeURIComponent(projectId)}/file-raw?${params.toString()}`);
  },

  // Antigravity Brain Monitor
  getSessions(): Promise<{ sessions: AntigravitySessionSummary[]; brain_dir: string }> {
    return apiFetch<{ sessions: AntigravitySessionSummary[]; brain_dir: string }>(
      '/api/antigravity/sessions'
    );
  },

  getSessionDetail(convId: string): Promise<SessionDetailResponse> {
    return apiFetch<SessionDetailResponse>(
      `/api/antigravity/sessions/${encodeURIComponent(convId)}`
    );
  },

  getSessionStepFull(convId: string, stepIndex: number): Promise<TranscriptStep> {
    return apiFetch<TranscriptStep>(
      `/api/antigravity/sessions/${encodeURIComponent(convId)}/steps/${stepIndex}/full`
    );
  },

  async getArtifacts(category?: ArtifactCategory | '', q = '', limit = 120): Promise<ArtifactItem[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (category) params.set('category', category);
    if (q.trim()) params.set('q', q.trim());
    const res = await apiFetch<{ artifacts: ArtifactItem[] }>(
      `/api/antigravity/artifacts?${params.toString()}`
    );
    return res.artifacts ?? [];
  },

  getBrainArtifactContent(convId: string, relPath: string): Promise<FileContentResponse> {
    const params = new URLSearchParams({ conv_id: convId, path: relPath });
    return apiFetch<FileContentResponse>(
      `/api/antigravity/artifact-content?${params.toString()}`
    );
  },

  getBrainArtifactRawUrl(convId: string, relPath: string, download = false): string {
    const params = new URLSearchParams({
      conv_id: convId,
      path: relPath,
      download: download ? '1' : '0',
    });
    return withToken(`/api/antigravity/artifact-raw?${params.toString()}`);
  },

  // Prompts, Uploads, Queue & Mobile Approvals
  async uploadFiles(files: File[], projectId?: string): Promise<AttachmentItem[]> {
    const form = new FormData();
    for (const f of files) {
      form.append('files', f);
    }
    if (projectId) {
      form.append('project_id', projectId);
    }
    const res = await apiFetch<{ attachments: AttachmentItem[] }>('/api/prompts/upload', {
      method: 'POST',
      body: form,
    });
    return res.attachments ?? [];
  },

  runPrompt(payload: {
    project_id: string;
    prompt: string;
    engine_mode?: EngineMode;
    execution_policy?: ExecutionPolicy;
    attachment_ids?: string[];
    device_name?: string;
  }): Promise<PromptRun> {
    return apiFetch<PromptRun>('/api/prompts/run', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        device_name: payload.device_name || getDeviceName(),
      }),
    });
  },

  getPrompts(projectId?: string, limit = 50): Promise<{
    runs: PromptRun[];
    pending_approvals: PendingApproval[];
  }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (projectId) params.set('project_id', projectId);
    return apiFetch<{ runs: PromptRun[]; pending_approvals: PendingApproval[] }>(
      `/api/prompts?${params.toString()}`
    );
  },

  getPromptRun(runId: string): Promise<PromptRun> {
    return apiFetch<PromptRun>(`/api/prompts/${encodeURIComponent(runId)}`);
  },

  cancelPromptRun(runId: string): Promise<{ run_id: string; status: string }> {
    return apiFetch<{ run_id: string; status: string }>(
      `/api/prompts/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' }
    );
  },

  approveToolCall(
    runId: string,
    approvalId: string,
    approved: boolean
  ): Promise<{ approval_id: string; approved: boolean }> {
    return apiFetch<{ approval_id: string; approved: boolean }>(
      `/api/prompts/${encodeURIComponent(runId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ approval_id: approvalId, approved }),
      }
    );
  },

  getRunArtifactContent(runId: string, relPath: string): Promise<FileContentResponse> {
    const params = new URLSearchParams({ path: relPath });
    return apiFetch<FileContentResponse>(
      `/api/prompts/${encodeURIComponent(runId)}/artifact-content?${params.toString()}`
    );
  },

  getRunArtifactRawUrl(runId: string, relPath: string, download = false): string {
    const params = new URLSearchParams({
      path: relPath,
      download: download ? '1' : '0',
    });
    return withToken(
      `/api/prompts/${encodeURIComponent(runId)}/artifact-raw?${params.toString()}`
    );
  },

  // System, Settings & Tunnel
  getSystemStatus(): Promise<SystemStatus> {
    return apiFetch<SystemStatus>('/api/system/status');
  },

  getSystemSettings(): Promise<SystemSettings> {
    return apiFetch<SystemSettings>('/api/system/settings');
  },

  updateSystemSettings(payload: SystemSettingsUpdate): Promise<SystemSettings> {
    return apiFetch<SystemSettings>('/api/system/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  startTunnel(): Promise<TunnelActionResponse> {
    return apiFetch<TunnelActionResponse>('/api/system/tunnel/start', {
      method: 'POST',
    });
  },

  stopTunnel(): Promise<TunnelActionResponse> {
    return apiFetch<TunnelActionResponse>('/api/system/tunnel/stop', {
      method: 'POST',
    });
  },

  // AI Models & Live Quota
  getModelList(): Promise<ModelListResponse> {
    return apiFetch<ModelListResponse>('/api/system/models');
  },

  selectModel(model: string): Promise<SystemSettings> {
    return apiFetch<SystemSettings>('/api/system/models/select', {
      method: 'POST',
      body: JSON.stringify({ model }),
    });
  },

  // Mobile Builds (Android APK / iOS IPA)
  getMobileBuilds(): Promise<MobileBuildInfo> {
    return apiFetch<MobileBuildInfo>('/api/system/mobile-builds');
  },

  getMobilePackageDownloadUrl(platform: 'android' | 'ios'): string {
    return withToken(`/api/system/mobile-download/${platform}`);
  },

  // Google Account & Antigravity (AGY) Unified Auth
  getGoogleAuthStatus(refresh = false): Promise<GoogleAuthStatus> {
    const qs = refresh ? '?refresh=1' : '';
    return apiFetch<GoogleAuthStatus>(`/api/system/google-auth/status${qs}`);
  },

  launchAgyLogin(): Promise<{ launched: boolean; message: string }> {
    return apiFetch<{ launched: boolean; message: string }>('/api/system/google-auth/agy-login', {
      method: 'POST',
    });
  },

  activateAgyAccount(): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/agy-use-account', {
      method: 'POST',
    });
  },

  saveGoogleOAuthClient(payload: {
    client_id?: string;
    client_secret?: string;
    client_json?: string;
    quota_project_id?: string;
  }): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/oauth-client', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  startGoogleOAuth(payload: {
    open_on_pc?: boolean;
    redirect_origin?: string;
  }): Promise<GoogleOAuthStartResponse> {
    return apiFetch<GoogleOAuthStartResponse>('/api/system/google-auth/oauth-start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  completeGoogleOAuthManual(
    callbackUrlOrCode: string,
    state?: string
  ): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/oauth-manual-callback', {
      method: 'POST',
      body: JSON.stringify({
        callback_url_or_code: callbackUrlOrCode,
        state: state || undefined,
      }),
    });
  },

  saveDirectGoogleToken(payload: {
    access_token: string;
    refresh_token?: string;
    quota_project_id?: string;
  }): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/direct-token', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  importGcloudAdc(): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/import-adc', {
      method: 'POST',
    });
  },

  logoutGoogleAccount(): Promise<GoogleAuthStatus> {
    return apiFetch<GoogleAuthStatus>('/api/system/google-auth/logout', {
      method: 'POST',
    });
  },

  getDiscordRpcStatus(): Promise<DiscordRpcStatus> {
    return apiFetch<DiscordRpcStatus>('/api/system/discord-rpc');
  },

  // Agent Memories
  async getMemories(projectId?: string): Promise<AgentMemoryItem[]> {
    const params = new URLSearchParams();
    if (projectId) params.set('project_id', projectId);
    const qs = params.toString();
    const res = await apiFetch<
      AgentMemoryItem[] | { memories?: AgentMemoryItem[]; items?: AgentMemoryItem[] }
    >(`/api/tools/memories${qs ? `?${qs}` : ''}`);
    if (Array.isArray(res)) return res;
    return res.memories ?? res.items ?? [];
  },

  async saveMemory(payload: {
    id?: string;
    title: string;
    content: string;
    scope?: 'global' | 'project';
    project_id?: string | null;
    mode?: 'always' | 'passive';
  }): Promise<AgentMemoryItem> {
    const res = await apiFetch<AgentMemoryItem | { memory: AgentMemoryItem }>(
      '/api/tools/memories',
      {
        method: 'POST',
        body: JSON.stringify({
          scope: 'project',
          mode: 'always',
          ...payload,
        }),
      }
    );
    return 'memory' in res ? res.memory : res;
  },

  deleteMemory(id: string): Promise<{ deleted: boolean }> {
    return apiFetch<{ deleted: boolean }>(
      `/api/tools/memories/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
      }
    );
  },
};
