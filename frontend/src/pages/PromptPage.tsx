import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Brain,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  History,
  Settings2,
  Square,
  Terminal,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { ModelSelectorModal } from '../components/ModelSelectorModal';
import { PromptComposer, type PromptComposerPayload, type ModelOption, type ActionOption } from '../components/library';
import { useCustomTheme } from '../contexts/CustomThemeContext';
import {
  cn,
  formatBytes,
  formatClockTime,
  formatRelativeTime,
  getEngineLabel,
  getPolicyLabel,
  getPromptStatusInfo,
} from '../lib/utils';
import type {
  ArtifactModalTarget,
  EngineMode,
  ExecutionPolicy,
  Project,
  PromptRun,
  TabKey,
} from '../types/api';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface PromptPageProps {
  projects: Project[];
  runs: PromptRun[];
  selectedProjectId: string;
  selectedRunId: string | null;
  defaultEngine: EngineMode;
  defaultPolicy: ExecutionPolicy;
  currentModel?: string;
  isDark: boolean;
  onSelectProject: (projectId: string) => void;
  onSelectRun: (runId: string) => void;
  onRunCreated: (run: PromptRun) => void;
  onModelChange?: (model: string) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onNavigate: (tab: TabKey) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

const PROMPT_MODELS: ModelOption[] = [
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', tag: 'Fast' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro', tag: 'Deep' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', tag: 'Stable' },
  { id: 'claude-3-7-sonnet', name: 'Claude 3.7 Sonnet', tag: 'Code' },
];

const PROMPT_ACTIONS: ActionOption[] = [
  { id: 'run_agent', label: 'Chạy Agent' },
  { id: 'code_review', label: 'Soát lỗi mã nguồn' },
  { id: 'deep_research', label: 'Nghiên cứu sâu' },
  { id: 'chat_only', label: 'Trao đổi / Chat' },
];

const QUICK_PROMPTS = [
  'Tóm tắt cấu trúc dự án và các module chính hiện có',
  'Kiểm tra git status, các thay đổi gần đây và cảnh báo lỗi tiềm ẩn',
  'Đọc mã nguồn và đề xuất phương án tối ưu hiệu năng + kiểm thử',
  'Phân tích dự án và xuất báo cáo kiến trúc chi tiết dạng Markdown',
];

export function PromptPage({
  projects,
  runs,
  selectedProjectId,
  selectedRunId,
  defaultEngine,
  defaultPolicy,
  currentModel = 'gemini-3-flash-preview',
  isDark,
  onSelectProject,
  onSelectRun,
  onRunCreated,
  onModelChange,
  onOpenArtifact,
  onNavigate,
  onNotify,
}: PromptPageProps) {
  const { composerStyle, setThemeModalOpen } = useCustomTheme();
  const [engineMode, setEngineMode] = useState<EngineMode>(defaultEngine);
  const [policy, setPolicy] = useState<ExecutionPolicy>(defaultPolicy);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [thoughtsOpen, setThoughtsOpen] = useState(true);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [filterByProject, setFilterByProject] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  // Sync engine/policy defaults when project changes
  useEffect(() => {
    if (selectedProject) {
      setEngineMode(selectedProject.engine_mode);
      setPolicy(selectedProject.execution_policy);
    }
  }, [selectedProject?.id]);

  const activeRun = useMemo(() => {
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) return found;
    }
    return runs[0] || null;
  }, [runs, selectedRunId]);

  const filteredRuns = useMemo(() => {
    if (!filterByProject || !selectedProject) return runs;
    return runs.filter((r) => r.project_id === selectedProject.id);
  }, [runs, filterByProject, selectedProject]);

  const handleComposerSend = async (payload: PromptComposerPayload) => {
    if (!selectedProject) {
      onNotify('Hãy tạo hoặc chọn một dự án trên PC trước.', 'error');
      return;
    }
    const text = payload.text.trim();
    if (!text && (!payload.attachments || payload.attachments.length === 0)) {
      onNotify('Vui lòng nhập nội dung prompt.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      let attachmentIds: string[] = [];
      if (payload.attachments && payload.attachments.length > 0) {
        const uploaded = await api.uploadFiles(payload.attachments, selectedProject.id);
        attachmentIds = uploaded.map((u) => u.id);
      }

      if (onModelChange && payload.model) {
        onModelChange(payload.model);
      }

      let finalPrompt = text;
      if (payload.action === 'code_review') {
        finalPrompt = `[Code Review] ${text}`;
      } else if (payload.action === 'deep_research') {
        finalPrompt = `[Deep Research] ${text}`;
      }

      const created = await api.runPrompt({
        project_id: selectedProject.id,
        prompt: finalPrompt || '(Tệp đính kèm)',
        engine_mode: engineMode,
        execution_policy: policy,
        attachment_ids: attachmentIds,
      });
      onRunCreated(created);
      onSelectRun(created.id);
      setThoughtsOpen(true);
      onNotify('Đã gửi prompt tới PC', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể khởi chạy prompt',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!activeRun || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelPromptRun(activeRun.id);
      onNotify('Đã gửi yêu cầu hủy tác vụ', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể hủy tác vụ', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const isRunning =
    activeRun &&
    (activeRun.status === 'running' ||
      activeRun.status === 'queued' ||
      activeRun.status === 'awaiting_approval');

  return (
    <div className="space-y-5">
      {/* Composer Card */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Dự án trên PC
            </label>
            <select
              value={selectedProject?.id || ''}
              onChange={(e) => onSelectProject(e.target.value)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            >
              {projects.length === 0 ? (
                <option value="">Chưa có dự án</option>
              ) : (
                projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {!p.exists ? '(Thiếu thư mục)' : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              AI Model & Quota
            </label>
            <button
              type="button"
              onClick={() => setIsModelModalOpen(true)}
              className="flex min-h-[44px] w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-left text-sm text-slate-900 transition hover:border-cyan-500/50 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#090d16] dark:text-white dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-1.5 truncate">
                <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="truncate text-xs font-semibold sm:text-sm">
                  {currentModel}
                </span>
              </div>
              <span className="shrink-0 rounded-lg bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                Đổi Model
              </span>
            </button>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Engine thực thi
            </label>
            <select
              value={engineMode}
              onChange={(e) => setEngineMode(e.target.value as EngineMode)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            >
              <option value="antigravity_sdk">Antigravity SDK</option>
              <option value="cli">CLI Runner</option>
              <option value="demo">Demo Simulator</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Quyền thao tác
            </label>
            <select
              value={policy}
              onChange={(e) => setPolicy(e.target.value as ExecutionPolicy)}
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            >
              <option value="ask_mobile">Hỏi duyệt trên ĐT</option>
              <option value="read_only">Chỉ đọc</option>
              <option value="auto_workspace">Tự động trong workspace</option>
            </select>
          </div>
        </div>

        {/* Lucian AI Prompt & Command Composer + 11 Custom Theme Composer Styles */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between px-1 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              Composer Style:{' '}
              <strong className="text-slate-800 dark:text-slate-200">{composerStyle.label}</strong>
            </span>
            <button
              type="button"
              onClick={() => setThemeModalOpen(true)}
              className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
            >
              Đổi 11 Styles ✨
            </button>
          </div>
          <div className="agy-composer-frame-outer">
            <div className="agy-composer-frame-inner">
              <PromptComposer
                theme={isDark ? 'dark' : 'light'}
                defaultModel={currentModel}
                models={PROMPT_MODELS}
                actions={PROMPT_ACTIONS}
                suggestionChips={QUICK_PROMPTS}
                disabled={submitting || !selectedProject}
                onSend={handleComposerSend}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Main Split: Selected Run Stream + History */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Live Run Viewer */}
        <section className="space-y-4 lg:col-span-8">
          {!activeRun ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center dark:border-slate-800 dark:bg-[#111827]/60">
              <Terminal className="mx-auto h-9 w-9 text-slate-400" />
              <p className="mt-3 text-sm font-semibold">Chưa có phiên chạy nào được chọn</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Gửi một prompt ở trên (hoặc chọn engine <strong>Demo Simulator</strong> để thử duyệt
                công cụ trực tiếp trên điện thoại).
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
              {/* Run Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3.5 dark:border-slate-800">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                      {activeRun.project_name}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {getEngineLabel(activeRun.engine_mode)}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {getPolicyLabel(activeRun.execution_policy)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {activeRun.prompt}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Tạo lúc {formatClockTime(activeRun.created_at)} • {formatRelativeTime(activeRun.created_at)}
                    {activeRun.device_name ? ` • Từ ${activeRun.device_name}` : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {(() => {
                    const st = getPromptStatusInfo(activeRun.status);
                    return (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
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
                          <span className="h-2 w-2 animate-ping rounded-full bg-current" />
                        )}
                        {st.label}
                      </span>
                    );
                  })()}

                  {isRunning && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={handleCancel}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      Dừng
                    </button>
                  )}
                </div>
              </div>

              {/* Error Banner */}
              {activeRun.error && (
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-300">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{activeRun.error}</span>
                  </div>
                  {(activeRun.error.toLowerCase().includes('api') ||
                    activeRun.error.toLowerCase().includes('key') ||
                    activeRun.error.toLowerCase().includes('sdk')) && (
                    <button
                      type="button"
                      onClick={() => onNavigate('settings')}
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-500/20 px-2.5 py-1.5 font-semibold hover:bg-rose-500/30"
                    >
                      <Settings2 className="h-3.5 w-3.5" />
                      Mở Cài đặt
                    </button>
                  )}
                </div>
              )}

              {/* Collapsible Thoughts */}
              {(activeRun.thoughts || isRunning) && (
                <div className="mt-4 overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-500/5">
                  <button
                    type="button"
                    onClick={() => setThoughtsOpen((v) => !v)}
                    className="flex min-h-[42px] w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-indigo-700 dark:text-indigo-300"
                  >
                    <span className="flex items-center gap-2">
                      <Brain className={cn('h-4 w-4', isRunning && 'animate-pulse')} />
                      <span>Quá trình suy nghĩ (Thought Stream)</span>
                    </span>
                    {thoughtsOpen ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  {thoughtsOpen && (
                    <div className="border-t border-indigo-500/20 px-3.5 py-3 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                      {activeRun.thoughts || 'Đang khởi tạo luồng suy luận...'}
                    </div>
                  )}
                </div>
              )}

              {/* Tool Calls */}
              {activeRun.tool_calls && activeRun.tool_calls.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Công cụ đã gọi ({activeRun.tool_calls.length})
                  </p>
                  <div className="space-y-1.5">
                    {activeRun.tool_calls.map((tc) => {
                      const expanded = expandedToolId === tc.id;
                      return (
                        <div
                          key={tc.id}
                          className="rounded-xl border border-slate-200 bg-slate-50/80 dark:border-slate-800 dark:bg-[#090d16]"
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedToolId(expanded ? null : tc.id)}
                            className="flex min-h-[40px] w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs"
                          >
                            <span className="flex items-center gap-2 font-mono font-semibold text-cyan-700 dark:text-cyan-300">
                              <Terminal className="h-3.5 w-3.5" />
                              {tc.name}
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  tc.status === 'completed' || tc.status === 'approved'
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                    : tc.status === 'denied' || tc.status === 'error'
                                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-300'
                                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                )}
                              >
                                {tc.status}
                              </span>
                              {expanded ? (
                                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                              )}
                            </span>
                          </button>
                          {expanded && tc.args !== undefined && (
                            <pre className="max-h-48 overflow-auto border-t border-slate-200 p-3 font-mono text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {typeof tc.args === 'string'
                                ? tc.args
                                : JSON.stringify(tc.args, null, 2)}
                            </pre>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Response Markdown */}
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Kết quả phản hồi
                </p>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 sm:p-4 dark:border-slate-800 dark:bg-[#090d16]">
                  {activeRun.response_text ? (
                    <>
                      <MarkdownRenderer content={activeRun.response_text} isDark={isDark} />
                      {isRunning && (
                        <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-cyan-400" />
                      )}
                    </>
                  ) : isRunning ? (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
                      <span>Đang chờ phản hồi trực tiếp từ PC...</span>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Không có nội dung phản hồi văn bản.
                    </p>
                  )}
                </div>
              </div>

              {/* Output Artifacts */}
              {activeRun.output_artifacts && activeRun.output_artifacts.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Tệp kết quả sinh ra ({activeRun.output_artifacts.length})
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activeRun.output_artifacts.map((art) => (
                      <button
                        key={art.id || art.rel_path}
                        type="button"
                        onClick={() =>
                          onOpenArtifact({
                            kind: 'run_artifact',
                            runId: activeRun.id,
                            artifact: art,
                          })
                        }
                        className="flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2.5 text-left transition hover:bg-cyan-500/15"
                      >
                        <FileText className="h-4 w-4 shrink-0 text-cyan-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                            {art.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                            {formatBytes(art.size)} • Nhấn để xem
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* History & Queue */}
        <aside className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm lg:col-span-4 dark:border-slate-800 dark:bg-[#111827]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-400" />
              <h3 className="text-sm font-bold">Lịch sử & Hàng đợi</h3>
            </div>
            <button
              type="button"
              onClick={() => setFilterByProject((v) => !v)}
              className={cn(
                'rounded-lg px-2 py-1 text-[11px] font-medium transition',
                filterByProject
                  ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              )}
            >
              {filterByProject ? 'Theo dự án này' : 'Tất cả'}
            </button>
          </div>

          {filteredRuns.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Chưa có lịch sử chạy prompt nào.
            </p>
          ) : (
            <div className="space-y-2">
              {filteredRuns.map((run) => {
                const selected = activeRun?.id === run.id;
                const st = getPromptStatusInfo(run.status);
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onSelectRun(run.id)}
                    className={cn(
                      'block w-full rounded-xl border p-3 text-left transition',
                      selected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-[#090d16] dark:hover:border-slate-700'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {run.project_name}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                          st.tone === 'cyan' && 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
                          st.tone === 'emerald' &&
                            'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                          st.tone === 'amber' &&
                            'bg-amber-500/15 text-amber-600 dark:text-amber-300',
                          st.tone === 'rose' && 'bg-rose-500/15 text-rose-600 dark:text-rose-300',
                          st.tone === 'slate' && 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        )}
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                      {run.prompt}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>{getEngineLabel(run.engine_mode)}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(run.created_at)}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      <ModelSelectorModal
        isOpen={isModelModalOpen}
        onClose={() => setIsModelModalOpen(false)}
        currentModelId={currentModel}
        onModelSelected={(m) => {
          onModelChange?.(m);
        }}
        onNotify={onNotify}
      />
    </div>
  );
}
