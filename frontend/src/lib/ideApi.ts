import { getServerUrl } from './api';
import type { FileContentResponse } from '../types/api';

const TOKEN_KEY = 'agy_pulse_token';

export class IdeApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'IdeApiError';
    this.status = status;
    this.detail = message;
  }
}

function buildUrl(path: string): string {
  const base = getServerUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${cleanPath}` : cleanPath;
}

function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function ideFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = buildUrl(path);
  const token = getAuthToken();
  const headers = new Headers(init.headers);

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (init.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch {
    const base = getServerUrl();
    throw new IdeApiError(
      0,
      base
        ? `Không thể kết nối tới máy chủ PC (${base}).`
        : 'Không thể kết nối tới máy chủ PC.'
    );
  }

  if (!res.ok) {
    let detail = `Lỗi HTTP ${res.status}`;
    try {
      const data = (await res.json()) as {
        detail?: string;
        error?: string;
        message?: string;
      };
      detail = data.detail || data.error || data.message || detail;
    } catch {
      try {
        const txt = await res.text();
        if (txt) detail = txt.slice(0, 240);
      } catch {
        // Ignore parse error
      }
    }
    throw new IdeApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

// ============================================================================
// File Editor & Workspace Mutations
// ============================================================================

export interface SaveFilePayload {
  path: string;
  content: string;
  expected_modified_at?: string | null;
  force?: boolean;
}

export interface MkdirResponse {
  created: boolean;
  rel_path: string;
}

export interface RenameResponse {
  renamed: boolean;
  old_path: string;
  new_path: string;
}

export interface DeleteEntryResponse {
  deleted: boolean;
  rel_path: string;
}

// ============================================================================
// Git Types
// ============================================================================

export interface GitFileChange {
  path: string;
  status: string;
}

export interface GitStatusResponse {
  is_git_repo: boolean;
  branch: string;
  tracking: string | null;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
}

export interface GitDiffResponse {
  diff: string;
  path: string | null;
  staged: boolean;
}

export interface GitCommitEntry {
  hash: string;
  short_hash: string;
  subject: string;
  author: string;
  date: string;
}

export interface GitLogResponse {
  commits: GitCommitEntry[];
}

export interface GitPathsPayload {
  paths?: string[] | null;
  all?: boolean;
}

export interface GitCommitPayload {
  message: string;
  author_name?: string | null;
  author_email?: string | null;
}

export interface GitCommitResponse {
  committed: boolean;
  hash: string;
  summary: string;
}

export interface GitActionOutput {
  ok: boolean;
  output: string;
}

export interface GitCheckoutResponse {
  ok: boolean;
  branch: string;
  output: string;
}

// ============================================================================
// Checkpoints Types
// ============================================================================

export type CheckpointKind = 'manual' | 'auto' | 'undo' | string;

export interface CheckpointItem {
  id: string;
  label: string;
  kind: CheckpointKind;
  created_at: string;
  file_count?: number;
  size_bytes?: number;
}

export interface CheckpointPreviewResponse {
  checkpoint: CheckpointItem;
  modified: string[];
  recreated: string[];
  deleted: string[];
}

export interface CheckpointRestoreResponse {
  restored: boolean;
  undo_checkpoint_id: string;
  modified: number;
  recreated: number;
  deleted: number;
}

// ============================================================================
// Terminal Types
// ============================================================================

export interface TerminalSession {
  id: string;
  title: string;
  project_id: string | null;
  cwd: string;
  running: boolean;
  created_at: string;
}

export interface TerminalSessionDetail {
  session: TerminalSession;
  buffer: string;
}

// ============================================================================
// Ports & Notes Types
// ============================================================================

export interface LivePortInfo {
  port: number;
  url: string;
  label: string;
}

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NoteItem {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  checklist: NoteChecklistItem[];
  project_id: string | null;
  updated_at: string;
}

export interface NotePayload {
  title: string;
  content?: string;
  pinned?: boolean;
  checklist?: NoteChecklistItem[];
  project_id?: string | null;
}

// ============================================================================
// IDE API Client
// ============================================================================

export const ideApi = {
  // File content & filesystem CRUD
  saveFileContent(
    projectId: string,
    payload: SaveFilePayload
  ): Promise<FileContentResponse> {
    return ideFetch<FileContentResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/file-content`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  mkdir(projectId: string, path: string): Promise<MkdirResponse> {
    return ideFetch<MkdirResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/mkdir`,
      {
        method: 'POST',
        body: JSON.stringify({ path }),
      }
    );
  },

  renameEntry(
    projectId: string,
    oldPath: string,
    newPath: string
  ): Promise<RenameResponse> {
    return ideFetch<RenameResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/rename`,
      {
        method: 'POST',
        body: JSON.stringify({ old_path: oldPath, new_path: newPath }),
      }
    );
  },

  deleteEntry(projectId: string, path: string): Promise<DeleteEntryResponse> {
    const qs = new URLSearchParams({ path }).toString();
    return ideFetch<DeleteEntryResponse>(
      `/api/projects/${encodeURIComponent(projectId)}/entry?${qs}`,
      { method: 'DELETE' }
    );
  },

  // Git Source Control
  getGitStatus(projectId: string): Promise<GitStatusResponse> {
    return ideFetch<GitStatusResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/git/status`
    );
  },

  getGitDiff(
    projectId: string,
    path?: string,
    staged = false
  ): Promise<GitDiffResponse> {
    const params = new URLSearchParams();
    if (path) params.set('path', path);
    params.set('staged', staged ? 'true' : 'false');
    return ideFetch<GitDiffResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/git/diff?${params.toString()}`
    );
  },

  async getGitLog(projectId: string, limit = 25): Promise<GitCommitEntry[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    const res = await ideFetch<GitLogResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/git/log?${params.toString()}`
    );
    return res.commits ?? [];
  },

  stageGit(projectId: string, payload: GitPathsPayload): Promise<Record<string, unknown>> {
    return ideFetch(`/api/ide/${encodeURIComponent(projectId)}/git/stage`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  unstageGit(
    projectId: string,
    payload: GitPathsPayload
  ): Promise<Record<string, unknown>> {
    return ideFetch(`/api/ide/${encodeURIComponent(projectId)}/git/unstage`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  discardGit(
    projectId: string,
    payload: GitPathsPayload
  ): Promise<Record<string, unknown>> {
    return ideFetch(`/api/ide/${encodeURIComponent(projectId)}/git/discard`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  commitGit(
    projectId: string,
    payload: GitCommitPayload
  ): Promise<GitCommitResponse> {
    return ideFetch<GitCommitResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/git/commit`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  pullGit(projectId: string): Promise<GitActionOutput> {
    return ideFetch<GitActionOutput>(
      `/api/ide/${encodeURIComponent(projectId)}/git/pull`,
      { method: 'POST' }
    );
  },

  pushGit(projectId: string): Promise<GitActionOutput> {
    return ideFetch<GitActionOutput>(
      `/api/ide/${encodeURIComponent(projectId)}/git/push`,
      { method: 'POST' }
    );
  },

  checkoutGit(
    projectId: string,
    branch: string,
    create = false
  ): Promise<GitCheckoutResponse> {
    return ideFetch<GitCheckoutResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/git/checkout`,
      {
        method: 'POST',
        body: JSON.stringify({ branch, create }),
      }
    );
  },

  // Checkpoints
  async listCheckpoints(projectId: string): Promise<CheckpointItem[]> {
    const res = await ideFetch<{ checkpoints: CheckpointItem[] }>(
      `/api/ide/${encodeURIComponent(projectId)}/checkpoints`
    );
    return res.checkpoints ?? [];
  },

  createCheckpoint(
    projectId: string,
    label = 'Manual checkpoint',
    kind = 'manual'
  ): Promise<CheckpointItem> {
    return ideFetch<CheckpointItem>(
      `/api/ide/${encodeURIComponent(projectId)}/checkpoints`,
      {
        method: 'POST',
        body: JSON.stringify({ label, kind }),
      }
    );
  },

  previewCheckpoint(
    projectId: string,
    cpId: string
  ): Promise<CheckpointPreviewResponse> {
    return ideFetch<CheckpointPreviewResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/checkpoints/${encodeURIComponent(cpId)}/preview`
    );
  },

  restoreCheckpoint(
    projectId: string,
    cpId: string
  ): Promise<CheckpointRestoreResponse> {
    return ideFetch<CheckpointRestoreResponse>(
      `/api/ide/${encodeURIComponent(projectId)}/checkpoints/${encodeURIComponent(cpId)}/restore`,
      { method: 'POST' }
    );
  },

  // Terminal
  async listTerminalSessions(): Promise<TerminalSession[]> {
    const res = await ideFetch<{ sessions: TerminalSession[] }>(
      '/api/tools/terminal/sessions'
    );
    return res.sessions ?? [];
  },

  createTerminalSession(
    projectId?: string | null,
    title?: string | null
  ): Promise<TerminalSessionDetail> {
    return ideFetch<TerminalSessionDetail>('/api/tools/terminal/sessions', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId ?? null,
        title: title ?? null,
      }),
    });
  },

  getTerminalSession(sid: string): Promise<TerminalSessionDetail> {
    return ideFetch<TerminalSessionDetail>(
      `/api/tools/terminal/sessions/${encodeURIComponent(sid)}`
    );
  },

  execTerminalCommand(
    sid: string,
    command: string
  ): Promise<{ accepted: boolean; session_id: string }> {
    return ideFetch<{ accepted: boolean; session_id: string }>(
      `/api/tools/terminal/sessions/${encodeURIComponent(sid)}/exec`,
      {
        method: 'POST',
        body: JSON.stringify({ command }),
      }
    );
  },

  interruptTerminalSession(sid: string): Promise<{ interrupted: boolean }> {
    return ideFetch<{ interrupted: boolean }>(
      `/api/tools/terminal/sessions/${encodeURIComponent(sid)}/interrupt`,
      { method: 'POST' }
    );
  },

  deleteTerminalSession(sid: string): Promise<{ deleted: boolean }> {
    return ideFetch<{ deleted: boolean }>(
      `/api/tools/terminal/sessions/${encodeURIComponent(sid)}`,
      { method: 'DELETE' }
    );
  },

  // Live Ports & Notes
  async scanLivePorts(): Promise<LivePortInfo[]> {
    const res = await ideFetch<{ ports: LivePortInfo[] }>('/api/tools/ports');
    return res.ports ?? [];
  },

  async listNotes(): Promise<NoteItem[]> {
    const res = await ideFetch<{ notes: NoteItem[] }>('/api/tools/notes');
    return res.notes ?? [];
  },

  createNote(payload: NotePayload): Promise<NoteItem> {
    return ideFetch<NoteItem>('/api/tools/notes', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateNote(noteId: string, payload: Partial<NotePayload>): Promise<NoteItem> {
    return ideFetch<NoteItem>(`/api/tools/notes/${encodeURIComponent(noteId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  deleteNote(noteId: string): Promise<{ deleted: boolean }> {
    return ideFetch<{ deleted: boolean }>(
      `/api/tools/notes/${encodeURIComponent(noteId)}`,
      { method: 'DELETE' }
    );
  },
};
