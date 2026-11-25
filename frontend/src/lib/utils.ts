import type {
  ArtifactCategory,
  EngineMode,
  ExecutionPolicy,
  PromptStatus,
  SessionStatus,
} from '../types/api';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

export function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0s';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}g ${mins}p`;
  if (mins > 0) return `${mins}p ${secs}s`;
  return `${secs}s`;
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 10) return 'vừa xong';
  if (diffSec < 60) return `${diffSec} giây trước`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return date.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatClockTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function detectDefaultDeviceName(): string {
  if (typeof navigator === 'undefined') return 'Mobile Browser';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/iPad/i.test(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android [^;]+;\s*([^;)]+)/i);
    if (match?.[1]) return match[1].trim().slice(0, 28);
    return 'Android Mobile';
  }
  if (/Macintosh/i.test(ua)) return 'Mac Browser';
  if (/Windows/i.test(ua)) return 'Windows Browser';
  return 'Web Device';
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export function getEngineLabel(mode: EngineMode): string {
  switch (mode) {
    case 'antigravity_sdk':
      return 'Antigravity SDK';
    case 'cli':
      return 'CLI Runner';
    case 'demo':
      return 'Demo Simulator';
  }
}

export function getPolicyLabel(policy: ExecutionPolicy): string {
  switch (policy) {
    case 'ask_mobile':
      return 'Hỏi duyệt trên ĐT';
    case 'read_only':
      return 'Chỉ đọc';
    case 'auto_workspace':
      return 'Tự động trong workspace';
  }
}

export function getPromptStatusInfo(status: PromptStatus): {
  label: string;
  tone: 'cyan' | 'emerald' | 'amber' | 'rose' | 'slate';
  pulse?: boolean;
} {
  switch (status) {
    case 'queued':
      return { label: 'Đang xếp hàng', tone: 'slate' };
    case 'running':
      return { label: 'Đang chạy', tone: 'cyan', pulse: true };
    case 'awaiting_approval':
      return { label: 'Chờ duyệt trên ĐT', tone: 'amber', pulse: true };
    case 'completed':
      return { label: 'Hoàn tất', tone: 'emerald' };
    case 'failed':
      return { label: 'Thất bại', tone: 'rose' };
    case 'cancelled':
      return { label: 'Đã hủy', tone: 'slate' };
  }
}

export function getSessionStatusInfo(status: SessionStatus): {
  label: string;
  tone: 'cyan' | 'emerald' | 'rose' | 'slate';
} {
  switch (status) {
    case 'active':
      return { label: 'Đang hoạt động', tone: 'cyan' };
    case 'done':
      return { label: 'Hoàn tất', tone: 'emerald' };
    case 'error':
      return { label: 'Có lỗi', tone: 'rose' };
    case 'idle':
      return { label: 'Chờ', tone: 'slate' };
  }
}

export function getCategoryLabel(cat: ArtifactCategory): string {
  switch (cat) {
    case 'markdown':
      return 'Markdown';
    case 'image':
      return 'Hình ảnh';
    case 'pdf':
      return 'PDF';
    case 'code':
      return 'Mã nguồn';
    case 'html':
      return 'HTML';
    case 'document':
      return 'Tài liệu';
    default:
      return 'Tệp khác';
  }
}

export function getCodeLanguageFromFilename(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    json: 'json',
    jsonl: 'json',
    css: 'css',
    scss: 'scss',
    html: 'html',
    xml: 'xml',
    svg: 'xml',
    yml: 'yaml',
    yaml: 'yaml',
    toml: 'ini',
    ini: 'ini',
    ps1: 'powershell',
    bat: 'dos',
    sh: 'bash',
    sql: 'sql',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    h: 'c',
    md: 'markdown',
    env: 'bash',
  };
  return map[ext] || 'plaintext';
}
