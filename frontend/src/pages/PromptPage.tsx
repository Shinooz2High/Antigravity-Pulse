import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  FileCode,
  FileText,
  FolderGit2,
  GitBranch,
  Paperclip,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Terminal,
  Volume2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { ModelSelectorModal } from '../components/ModelSelectorModal';
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

const QUICK_PROMPTS = [
  'Tóm tắt cấu trúc dự án và các module chính hiện có',
  'Kiểm tra git status, các thay đổi gần đây và cảnh báo lỗi',
  'Đọc mã nguồn và đề xuất phương án tối ưu hiệu năng',
  'Phân tích kiến trúc toàn diện và xuất báo cáo Markdown',
];

export function PromptPage({
  projects,
  runs,
  selectedProjectId,
  selectedRunId,
  defaultEngine,
  defaultPolicy,
  currentModel = 'gemini-4-argon',
  isDark,
  onSelectProject,
  onSelectRun,
  onRunCreated,
  onModelChange,
  onOpenArtifact,
  onNavigate,
  onNotify,
}: PromptPageProps) {
  const { config: themeConfig, preset, composerStyle, setThemeModalOpen, playTaskVoice, greetingText } = useCustomTheme();
  const [promptText, setPromptText] = useState('');
  const [engineMode, setEngineMode] = useState<EngineMode>(defaultEngine);
  const [policy, setPolicy] = useState<ExecutionPolicy>(defaultPolicy);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [selectedActionMode, setSelectedActionMode] = useState<'run_agent' | 'code_review' | 'deep_research'>('run_agent');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [thoughtsOpen, setThoughtsOpen] = useState(true);
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const activeRun = useMemo(() => {
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) return found;
    }
    return null;
  }, [runs, selectedRunId]);

  // Sync engine/policy defaults when project changes
  useEffect(() => {
    if (selectedProject) {
      setEngineMode(selectedProject.engine_mode);
      setPolicy(selectedProject.execution_policy);
    }
  }, [selectedProject?.id]);

  // Auto-resize composer textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [promptText]);

  // Scroll to bottom on new responses
  useEffect(() => {
    if (activeRun) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeRun?.response_text, activeRun?.thoughts, activeRun?.tool_calls?.length]);

  const handleSendPrompt = async (customPrompt?: string) => {
    const textToSend = (customPrompt ?? promptText).trim();
    if (!selectedProject) {
      onNotify('Hãy chọn một dự án trên PC trước.', 'error');
      return;
    }
    if (!textToSend && attachments.length === 0) {
      onNotify('Vui lòng nhập nội dung câu lệnh hoặc chọn prompt mẫu.', 'info');
      return;
    }

    setSubmitting(true);
    playTaskVoice();

    try {
      let attachmentIds: string[] = [];
      if (attachments.length > 0) {
        const uploaded = await api.uploadFiles(attachments, selectedProject.id);
        attachmentIds = uploaded.map((u) => u.id);
      }

      let finalPrompt = textToSend;
      if (selectedActionMode === 'code_review') {
        finalPrompt = `[Code Review] ${textToSend}`;
      } else if (selectedActionMode === 'deep_research') {
        finalPrompt = `[Deep Research] ${textToSend}`;
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
      setPromptText('');
      setAttachments([]);
      setThoughtsOpen(true);
      onNotify('Đã gửi câu lệnh tới Antigravity Agent trên PC', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể khởi chạy prompt',
        'error'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendPrompt();
    }
  };

  const handleCancel = async () => {
    if (!activeRun || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelPromptRun(activeRun.id);
      onNotify('Đã gửi yêu cầu dừng tác vụ tới PC', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể hủy tác vụ', 'error');
    } finally {
      setCancelling(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setAttachments((prev) => [...prev, ...newFiles]);
      e.target.value = '';
    }
  };

  const isRunning =
    activeRun &&
    (activeRun.status === 'running' ||
      activeRun.status === 'queued' ||
      activeRun.status === 'awaiting_approval');

  // Format display model name
  const modelDisplayName =
    currentModel === 'gemini-4-argon'
      ? 'Gemini 4 Argon (High)'
      : currentModel === 'gemini-3-flash-preview'
        ? 'Gemini 3 Flash'
        : currentModel === 'gemini-3-pro-preview'
          ? 'Gemini 3 Pro'
          : currentModel;

  return (
    <div className="relative flex flex-1 flex-col justify-between overflow-hidden">
      {/* ============================================================== */}
      {/* CONVERSATION CANVAS / EMPTY STATE GREETING                      */}
      {/* ============================================================== */}
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        {!activeRun ? (
          /* ========================================================== */
          /* EMPTY STATE: 1:1 CENTERED HANDWRITING GREETING (TAWA MALI) */
          /* ========================================================== */
          <div className="mx-auto flex min-h-[55vh] max-w-3xl flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-500">
            {/* Centered Handwritten Greeting in Mali Font */}
            <h1 className="agy-mali-greeting text-3xl font-medium tracking-wide text-white drop-shadow-[0_2px_24px_rgba(183,164,255,0.7)] sm:text-4xl md:text-5xl">
              {greetingText || 'Tawa đã sẵn sàng rồi, hôm nay sensei muốn code gì nào'}
            </h1>

            {/* Subtitle with soft anime mascot hint */}
            <p className="mt-4 flex items-center justify-center gap-2 text-xs font-medium text-slate-300 drop-shadow sm:text-sm">
              <span className="text-pink-400">🌸</span>
              <span>Mọi hệ thống trên PC đã sẵn sàng, Sensei chỉ cần ra lệnh thôi nhé~</span>
            </p>

            {/* Quick Action Suggestion Chips */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5 max-w-2xl">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPromptText(prompt);
                    textareaRef.current?.focus();
                  }}
                  className="group flex items-center gap-2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-xs text-slate-300 backdrop-blur-md transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-white hover:scale-[1.02]"
                >
                  <Sparkles className="h-3 w-3 text-cyan-400 transition-transform group-hover:rotate-12" />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* ACTIVE RUN: CONVERSATION STREAM (USER BUBBLE + AGENT CARD)  */
          /* ========================================================== */
          <div className="mx-auto max-w-4xl space-y-6 pb-24">
            {/* User Message Bubble with Double Border Frame */}
            <div className="flex justify-end">
              <div
                className="agy-user-bubble-frame max-w-[85%] rounded-2xl p-[1.5px] shadow-lg"
                style={{
                  background:
                    'linear-gradient(135deg, var(--ct-primary, #38bdf8), var(--ct-secondary, #c084fc))',
                }}
              >
                <div className="rounded-[15px] bg-[#101426]/90 p-4 backdrop-blur-xl">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 text-[10px] font-bold text-white">
                      U
                    </div>
                    <span className="text-[11px] font-semibold text-slate-300">Sensei</span>
                    <span className="text-[10px] text-slate-400">
                      • {formatClockTime(activeRun.created_at)}
                    </span>
                  </div>
                  <p className="text-sm font-medium leading-relaxed text-white whitespace-pre-wrap">
                    {activeRun.prompt}
                  </p>

                  {/* Attachment tags if any */}
                  {activeRun.attachment_ids && activeRun.attachment_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeRun.attachment_ids.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                        >
                          <Paperclip className="h-3 w-3" />
                          <span>Tệp đính kèm</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Agent Response Card */}
            <div
              data-testid="agent-response"
              className="rounded-2xl border border-white/10 bg-[#0d1222]/80 p-5 shadow-xl backdrop-blur-xl"
            >
              {/* Agent Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white shadow-md shadow-indigo-500/30">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">Antigravity Agent</span>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                        {modelDisplayName}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {activeRun.project_name} • {getEngineLabel(activeRun.engine_mode)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(() => {
                    const st = getPromptStatusInfo(activeRun.status);
                    return (
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold',
                          st.tone === 'cyan' && 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
                          st.tone === 'emerald' && 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
                          st.tone === 'amber' && 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                          st.tone === 'rose' && 'bg-rose-500/20 text-rose-300 border border-rose-500/30',
                          st.tone === 'slate' && 'bg-slate-800 text-slate-300'
                        )}
                      >
                        {st.pulse && <span className="h-2 w-2 animate-ping rounded-full bg-current" />}
                        {st.label}
                      </span>
                    );
                  })()}

                  {isRunning && (
                    <button
                      type="button"
                      disabled={cancelling}
                      onClick={handleCancel}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/20 transition"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>Dừng</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Error Banner if any */}
              {activeRun.error && (
                <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{activeRun.error}</span>
                </div>
              )}

              {/* Collapsible Thoughts Stream */}
              {(activeRun.thoughts || isRunning) && (
                <div className="mt-4 overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-500/5">
                  <button
                    type="button"
                    onClick={() => setThoughtsOpen((v) => !v)}
                    className="flex w-full items-center justify-between px-3.5 py-2 text-left text-xs font-semibold text-indigo-300 transition hover:bg-indigo-500/10"
                  >
                    <span className="flex items-center gap-2">
                      <Brain className={cn('h-3.5 w-3.5 text-indigo-400', isRunning && 'animate-pulse')} />
                      <span>Quá trình suy nghĩ (Thinking Process)</span>
                    </span>
                    {thoughtsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  {thoughtsOpen && (
                    <div className="border-t border-indigo-500/20 px-3.5 py-3 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap font-mono">
                      {activeRun.thoughts || 'Đang phân tích tác vụ và chuẩn bị kế hoạch thực thi...'}
                    </div>
                  )}
                </div>
              )}

              {/* Tool Execution Steps */}
              {activeRun.tool_calls && activeRun.tool_calls.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Công cụ & Lệnh đã chạy ({activeRun.tool_calls.length})
                  </p>
                  <div className="space-y-1.5">
                    {activeRun.tool_calls.map((tc) => {
                      const expanded = expandedToolId === tc.id;
                      return (
                        <div
                          key={tc.id}
                          className="rounded-xl border border-white/10 bg-[#070a14]/70 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() => setExpandedToolId(expanded ? null : tc.id)}
                            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition hover:bg-white/5"
                          >
                            <span className="flex items-center gap-2 font-mono font-semibold text-cyan-300">
                              <Terminal className="h-3.5 w-3.5" />
                              {tc.name}
                            </span>
                            <span className="flex items-center gap-2">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                  tc.status === 'completed' || tc.status === 'approved'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : tc.status === 'denied' || tc.status === 'error'
                                      ? 'bg-rose-500/20 text-rose-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                )}
                              >
                                {tc.status}
                              </span>
                              {expanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                            </span>
                          </button>
                          {expanded && tc.args !== undefined && (
                            <pre className="max-h-48 overflow-auto border-t border-white/10 p-3 font-mono text-[11px] text-slate-300 bg-black/40">
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

              {/* Main Response Markdown Body */}
              <div className="mt-5">
                {activeRun.response_text ? (
                  <div className="agy-markdown text-sm leading-relaxed text-slate-200">
                    <MarkdownRenderer content={activeRun.response_text} isDark={isDark} />
                    {isRunning && (
                      <span className="mt-1 inline-block h-4 w-2 animate-pulse bg-cyan-400" />
                    )}
                  </div>
                ) : isRunning ? (
                  <div className="flex items-center gap-3 py-6 text-sm text-slate-400">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                    <span>Agent đang thao tác trên PC, vui lòng chờ trong giây lát...</span>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    Phiên chạy đã kết thúc mà không có văn bản kết quả.
                  </p>
                )}
              </div>

              {/* Output Artifacts Links */}
              {activeRun.output_artifacts && activeRun.output_artifacts.length > 0 && (
                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
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
                        className="group flex items-center gap-2.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-3 text-left transition hover:bg-cyan-500/20"
                      >
                        <FileCode className="h-5 w-5 text-cyan-400 shrink-0 group-hover:scale-110 transition-transform" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-white">
                            {art.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-400">
                            {formatBytes(art.size)} • Nhấn để xem toàn màn hình
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 1:1 AUTHENTIC ANTIGRAVITY .surface-composer                     */}
      {/* ============================================================== */}
      <div className="relative z-20 shrink-0 px-4 pb-4 pt-1 sm:px-8">
        <div className="mx-auto max-w-4xl">
          {/* Double Border Frame Outer (Styled by Theme Customizer) */}
          <div className="agy-composer-frame-outer shadow-2xl">
            {/* Inner Composer Card */}
            <div className="agy-composer-frame-inner surface-composer-card p-3 sm:p-3.5">
              {/* TOP ROW: Workspace & Context Pills */}
              <div className="flex items-center gap-2 pb-2 text-[11px] font-semibold text-slate-300">
                {/* Project Selector Trigger */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setProjectMenuOpen((o) => !o)}
                    className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-200 hover:bg-white/10 hover:border-white/20 transition"
                  >
                    <FolderGit2 className="h-3 w-3 text-cyan-400" />
                    <span>{selectedProject?.name || 'No Project'}</span>
                    <ChevronDown className="h-2.5 w-2.5 opacity-60" />
                  </button>

                  {projectMenuOpen && (
                    <div
                      className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Chọn Workspace PC
                      </div>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            onSelectProject(p.id);
                            setProjectMenuOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition',
                            p.id === selectedProject?.id
                              ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                              : 'text-slate-300 hover:bg-white/10 hover:text-white'
                          )}
                        >
                          <span className="truncate">{p.name}</span>
                          {p.id === selectedProject?.id && <Check className="h-3 w-3 text-cyan-400" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Branch Pill */}
                <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                  <GitBranch className="h-3 w-3 text-emerald-400" />
                  <span>main</span>
                </span>

                {/* Environment Pill */}
                <span className="hidden sm:flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span>Local Checkout</span>
                </span>
              </div>

              {/* ATTACHMENTS LIST IF ANY */}
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {attachments.map((file, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs text-slate-200"
                    >
                      <Paperclip className="h-3 w-3 text-cyan-400" />
                      <span className="max-w-[150px] truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-slate-400 hover:text-white"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* MIDDLE ROW: TEXTAREA */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Ask anything, @ to mention, / for actions... (Enter để gửi)"
                  className="w-full resize-none bg-transparent px-1 py-1 text-sm text-white placeholder-slate-400 outline-none leading-relaxed"
                  disabled={submitting}
                />
              </div>

              {/* BOTTOM TOOLBAR ROW */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                {/* Left: Model Selector, Turbo, Action Mode */}
                <div className="flex items-center gap-1.5">
                  {/* Model Selector Pill */}
                  <button
                    type="button"
                    onClick={() => setIsModelModalOpen(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:border-cyan-400/50"
                  >
                    <span className="text-cyan-400 font-bold">+</span>
                    <span>{modelDisplayName}</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  {/* Mode Pill (Turbo / Deep) */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setModeMenuOpen((o) => !o)}
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <Zap className="h-3 w-3 text-amber-400" />
                      <span>{selectedActionMode === 'run_agent' ? '⚡ Turbo' : selectedActionMode === 'code_review' ? 'Code Review' : 'Deep Research'}</span>
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>

                    {modeMenuOpen && (
                      <div
                        className="absolute bottom-full left-0 mb-2 w-48 rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => { setSelectedActionMode('run_agent'); setModeMenuOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Zap className="h-3.5 w-3.5 text-amber-400" />
                          <span>⚡ Turbo (Chạy Agent)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedActionMode('code_review'); setModeMenuOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Code2 className="h-3.5 w-3.5 text-purple-400" />
                          <span>Soát lỗi mã nguồn</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSelectedActionMode('deep_research'); setModeMenuOpen(false); }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Brain className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Nghiên cứu chuyên sâu</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Attachment, Tawa Voice, Send Button */}
                <div className="flex items-center gap-2">
                  {/* File Attachment Input (hidden) */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                    title="Đính kèm tệp tin"
                  >
                    <Paperclip className="h-4 w-4" />
                  </button>

                  {/* Tawa Voice Button */}
                  <button
                    type="button"
                    onClick={() => playTaskVoice(true)}
                    className="rounded-lg p-1.5 text-pink-400 transition hover:bg-white/10 hover:text-pink-300"
                    title="Phát giọng Tawa"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>

                  {/* Send Button */}
                  <button
                    type="button"
                    disabled={submitting || (!promptText.trim() && attachments.length === 0)}
                    onClick={() => handleSendPrompt()}
                    className={cn(
                      'flex h-8 w-8 items-center justify-center rounded-full text-white shadow-md transition',
                      promptText.trim() || attachments.length > 0
                        ? 'bg-gradient-to-tr from-cyan-500 to-indigo-500 hover:scale-105 hover:shadow-cyan-500/40 cursor-pointer'
                        : 'bg-white/10 text-slate-500 cursor-not-allowed'
                    )}
                    title="Gửi câu lệnh (Enter)"
                  >
                    {submitting ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <ArrowUp className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Model Selector Modal */}
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
