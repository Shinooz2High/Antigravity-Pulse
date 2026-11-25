import {
  Activity,
  ArrowRight,
  Bot,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  FileText,
  FolderGit2,
  Globe,
  Laptop,
  Play,
  Radio,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Terminal,
} from 'lucide-react';
import {
  cn,
  copyToClipboard,
  formatBytes,
  formatRelativeTime,
  formatTokens,
  formatUptime,
  getEngineLabel,
  getPromptStatusInfo,
  getSessionStatusInfo,
} from '../lib/utils';
import type {
  AntigravitySessionSummary,
  ArtifactItem,
  ArtifactModalTarget,
  DeviceInfo,
  Project,
  PromptRun,
  SystemStatus,
  TabKey,
} from '../types/api';

interface DashboardPageProps {
  systemStatus: SystemStatus | null;
  devices: DeviceInfo[];
  projects: Project[];
  runs: PromptRun[];
  sessions: AntigravitySessionSummary[];
  artifacts: ArtifactItem[];
  tunnelBusy: boolean;
  onRefreshAll: () => void;
  onNavigate: (tab: TabKey) => void;
  onSelectRun: (runId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onToggleTunnel: () => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export function DashboardPage({
  systemStatus,
  devices,
  projects,
  runs,
  sessions,
  artifacts,
  tunnelBusy,
  onRefreshAll,
  onNavigate,
  onSelectRun,
  onSelectSession,
  onOpenArtifact,
  onToggleTunnel,
  onNotify,
}: DashboardPageProps) {
  const activeRuns = runs.filter(
    (r) => r.status === 'running' || r.status === 'queued' || r.status === 'awaiting_approval'
  );
  const displayRuns = activeRuns.length > 0 ? activeRuns : runs.slice(0, 3);
  const recentSessions = sessions.slice(0, 4);
  const latestArtifacts = artifacts.slice(0, 6);
  const onlineDevices = devices.filter((d) => d.online);

  const handleCopy = async (label: string, value: string) => {
    const ok = await copyToClipboard(value);
    onNotify(ok ? `Đã chép ${label}` : 'Không thể sao chép', ok ? 'success' : 'error');
  };

  return (
    <div className="space-y-5">
      {/* Hero PC Status Card */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/20 text-cyan-500 ring-1 ring-cyan-500/30">
              <Laptop className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {systemStatus?.hostname || 'Máy tính PC'}
                </h2>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Đang trực tuyến
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {systemStatus
                  ? `${systemStatus.os} • Python ${systemStatus.python_version} • Hoạt động ${formatUptime(systemStatus.uptime_seconds)}`
                  : 'Đang tải thông tin hệ thống...'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshAll}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Làm mới
          </button>
        </div>

        {/* Status Badges */}
        {systemStatus && (
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
                systemStatus.sdk_installed
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              )}
            >
              <Cpu className="h-3.5 w-3.5" />
              Antigravity SDK {systemStatus.sdk_version ? `v${systemStatus.sdk_version}` : 'chưa cài'}
            </span>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
                systemStatus.api_key_configured || systemStatus.vertex_configured
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {systemStatus.vertex_configured
                ? 'Vertex AI sẵn sàng'
                : systemStatus.api_key_configured
                  ? 'Gemini API Key đã cấu hình'
                  : 'Chưa gắn API Key'}
            </span>

            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium',
                systemStatus.agy_cli_found
                  ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
              )}
            >
              <Terminal className="h-3.5 w-3.5" />
              {systemStatus.agy_cli_found ? 'agy CLI sẵn sàng' : 'Không tìm thấy agy CLI'}
            </span>

            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              <Smartphone className="h-3.5 w-3.5 text-cyan-500" />
              {onlineDevices.length || systemStatus.connected_clients} thiết bị đang nối
            </span>
          </div>
        )}

        {/* Network URLs */}
        {systemStatus && (
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Mạng LAN nội bộ
                </p>
                <p className="truncate font-mono text-xs text-slate-800 dark:text-slate-200">
                  {systemStatus.lan_url}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleCopy('LAN URL', systemStatus.lan_url)}
                className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
                title="Sao chép LAN URL"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>

            {systemStatus.tailscale_url && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tailscale VPN
                  </p>
                  <p className="truncate font-mono text-xs text-cyan-600 dark:text-cyan-300">
                    {systemStatus.tailscale_url}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('Tailscale URL', systemStatus.tailscale_url!)}
                  className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
                  title="Sao chép Tailscale URL"
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
              <div className="min-w-0">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Cloudflare Tunnel
                </p>
                <p className="truncate font-mono text-xs text-slate-800 dark:text-slate-200">
                  {systemStatus.tunnel_running && systemStatus.tunnel_url
                    ? systemStatus.tunnel_url
                    : 'Chưa bật'}
                </p>
              </div>
              {systemStatus.tunnel_running && systemStatus.tunnel_url ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleCopy('Tunnel URL', systemStatus.tunnel_url!)}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/70 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <a
                    href={systemStatus.tunnel_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-cyan-500 hover:bg-slate-200/70 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={tunnelBusy}
                  onClick={onToggleTunnel}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg bg-cyan-500/15 px-2.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 disabled:opacity-50 dark:text-cyan-300"
                >
                  <Globe className="h-3.5 w-3.5" />
                  {tunnelBusy ? 'Đang bật...' : 'Bật'}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Quick Launch Actions */}
      <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => onNavigate('prompt')}
          className="flex min-h-[76px] flex-col items-start justify-between rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-500/15 to-indigo-500/10 p-3.5 text-left transition hover:brightness-110"
        >
          <Sparkles className="h-5 w-5 text-cyan-500" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Gửi Prompt</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Chạy tác vụ trên PC</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('outputs')}
          className="flex min-h-[76px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-[#111827]"
        >
          <Radio className="h-5 w-5 text-indigo-400" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Brain PC ({sessions.length})
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Phiên Antigravity</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('projects')}
          className="flex min-h-[76px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-[#111827]"
        >
          <FolderGit2 className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              Dự án ({projects.length})
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Duyệt tệp & git</p>
          </div>
        </button>

        <button
          type="button"
          disabled={tunnelBusy}
          onClick={onToggleTunnel}
          className="flex min-h-[76px] flex-col items-start justify-between rounded-2xl border border-slate-200 bg-white p-3.5 text-left transition hover:border-cyan-500/40 disabled:opacity-50 dark:border-slate-800 dark:bg-[#111827]"
        >
          <Globe
            className={cn(
              'h-5 w-5',
              systemStatus?.tunnel_running ? 'text-emerald-400' : 'text-amber-400'
            )}
          />
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {systemStatus?.tunnel_running ? 'Tắt Tunnel' : 'Mở Tunnel'}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {tunnelBusy ? 'Đang xử lý...' : 'Truy cập ngoài mạng'}
            </p>
          </div>
        </button>
      </section>

      {/* Active / Recent Prompt Runs & Recent Brain Sessions */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="h-4 w-4 text-cyan-500" />
              <h3 className="text-sm font-bold">
                {activeRuns.length > 0 ? 'Prompt đang chạy' : 'Prompt gần đây'}
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('prompt')}
              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Mở Studio
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {displayRuns.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Chưa có prompt nào được gửi từ điện thoại. Nhấn <strong>Gửi Prompt</strong> để bắt đầu.
            </div>
          ) : (
            <div className="space-y-2.5">
              {displayRuns.map((run) => {
                const st = getPromptStatusInfo(run.status);
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => {
                      onSelectRun(run.id);
                      onNavigate('prompt');
                    }}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-[#090d16]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {run.project_name}
                      </span>
                      <span
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          st.tone === 'cyan' && 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
                          st.tone === 'emerald' &&
                            'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                          st.tone === 'amber' &&
                            'bg-amber-500/15 text-amber-600 dark:text-amber-300',
                          st.tone === 'rose' && 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
                          st.tone === 'slate' && 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        )}
                      >
                        {st.pulse && (
                          <span className="h-1.5 w-1.5 animate-ping rounded-full bg-current" />
                        )}
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {run.prompt}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                      <span>{getEngineLabel(run.engine_mode)}</span>
                      <span>{formatRelativeTime(run.created_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold">Phiên Antigravity trên PC</h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('outputs')}
              className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Xem tất cả
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
              Chưa phát hiện phiên nào trong <code className="font-mono">~/.gemini/antigravity/brain</code>.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentSessions.map((sess) => {
                const st = getSessionStatusInfo(sess.latest_status);
                return (
                  <button
                    key={sess.id}
                    type="button"
                    onClick={() => {
                      onSelectSession(sess.id);
                      onNavigate('outputs');
                    }}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-indigo-500/40 dark:border-slate-800 dark:bg-[#090d16]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {sess.title}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                          st.tone === 'cyan' && 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
                          st.tone === 'emerald' &&
                            'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                          st.tone === 'rose' && 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
                          st.tone === 'slate' && 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                    {sess.preview && (
                      <p className="mt-1 line-clamp-1 text-xs text-slate-500 dark:text-slate-400">
                        {sess.preview}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                      <span>{sess.step_count} bước</span>
                      <span>{sess.artifact_count} artifact</span>
                      <span>
                        {formatTokens(sess.total_input_tokens + sess.total_output_tokens)} tokens
                      </span>
                      <span className="ml-auto">{formatRelativeTime(sess.updated_at)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Latest Output Artifacts */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold">Kết quả & Artifacts mới nhất</h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('outputs')}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline dark:text-cyan-400"
          >
            Mở kho kết quả
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {latestArtifacts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            Chưa có artifact nào được tạo.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {latestArtifacts.map((art) => (
              <button
                key={art.id}
                type="button"
                onClick={() => onOpenArtifact({ kind: 'artifact', artifact: art })}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-left transition hover:border-cyan-500/40 dark:border-slate-800 dark:bg-[#090d16]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {art.name}
                  </p>
                  <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {art.scope_title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {formatBytes(art.size)} • {formatRelativeTime(art.modified_at)}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-700" />
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
