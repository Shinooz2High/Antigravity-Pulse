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
import {
  AgentTaskSteps,
  FileUploadQueue,
  GhostAutocompleteTextarea,
  StreamingAgentAvatar,
  StreamingCaret,
  StreamingControlButton,
  ThinkingAccordion,
  type AgentTaskStepItem,
  type UploadQueueItem,
} from '../components/library';

interface PromptPageProps {
  projects: Project[];
  runs: PromptRun[];
  conversationRuns: PromptRun[];
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

const EXTRA_AUTOCOMPLETE = [
  'Sửa lỗi giao diện responsive trên điện thoại và kiểm tra lại',
  'Viết unit test đầy đủ cho các module quan trọng trong dự án',
  'Tối ưu hiệu năng build và giảm kích thước bundle frontend',
  'Giải thích luồng hoạt động của hệ thống và vẽ sơ đồ Mermaid',
  'Can we refactor this component for better readability and performance?',
  'Check git diff and review all recent changes for potential bugs',
];

function buildAgentSteps(run: PromptRun, runIsActive: boolean): AgentTaskStepItem[] {
  const done = !runIsActive;
  const hasThoughts = Boolean(run.thoughts?.trim());
  const toolCount = run.tool_calls?.length ?? 0;
  const anyToolRunning = Boolean(
    run.tool_calls?.some((tc) => tc.status === 'running' || tc.status === 'pending')
  );
  const hasResponse = Boolean(run.response_text?.trim());
  const artCount = run.output_artifacts?.length ?? 0;

  return [
    {
      id: 'context',
      label: 'Đọc ngữ cảnh dự án',
      meta: run.project_name || 'Workspace',
      state: done || hasThoughts || toolCount > 0 || hasResponse ? 'done' : 'run',
    },
    {
      id: 'plan',
      label: 'Phân tích & lập kế hoạch',
      meta: hasThoughts ? 'Thought stream' : 'Ready',
      state:
        done || toolCount > 0 || hasResponse
          ? 'done'
          : hasThoughts
            ? 'run'
            : 'wait',
    },
    {
      id: 'tools',
      label: toolCount > 0 ? 'Thực thi công cụ trên PC' : 'Xử lý yêu cầu Agent',
      meta: toolCount > 0 ? `${toolCount} tools` : getEngineLabel(run.engine_mode),
      state: done
        ? 'done'
        : anyToolRunning
          ? 'run'
          : toolCount > 0 && hasResponse
            ? 'done'
            : toolCount > 0
              ? 'run'
              : 'wait',
    },
    {
      id: 'finish',
      label: 'Tổng hợp & xuất kết quả',
      meta: artCount > 0 ? `${artCount} files` : run.status === 'completed' ? 'OK' : run.status,
      state: done ? 'done' : hasResponse ? 'run' : 'wait',
    },
  ];
}

interface ConversationTurnProps {
  run: PromptRun;
  isLatest: boolean;
  modelDisplayName: string;
  isDark: boolean;
  cancelling: boolean;
  submitting: boolean;
  onCancel: (runId: string) => void;
  onRegenerate: (prompt: string) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
}

function ConversationTurn({
  run,
  isLatest,
  modelDisplayName,
  isDark,
  cancelling,
  submitting,
  onCancel,
  onRegenerate,
  onOpenArtifact,
}: ConversationTurnProps) {
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);
  const runIsActive =
    run.status === 'running' ||
    run.status === 'queued' ||
    run.status === 'awaiting_approval';

  const agentSteps = useMemo(() => buildAgentSteps(run, runIsActive), [run, runIsActive]);
  const st = getPromptStatusInfo(run.status);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* User Message Bubble with Double Border Frame (Lucian #086 pop) */}
      <div className="flex justify-end">
        <div
          className="agy-user-bubble-frame u086-pop max-w-[92%] sm:max-w-[85%] rounded-2xl p-[1.5px] shadow-lg"
          style={{
            background:
              'linear-gradient(135deg, var(--ct-primary, #38bdf8), var(--ct-secondary, #c084fc))',
          }}
        >
          <div className="rounded-[15px] bg-[#101426]/90 p-3 sm:p-4 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-500 to-indigo-500 text-[10px] font-bold text-white">
                U
              </div>
              <span className="text-[11px] font-semibold text-slate-300">Sensei</span>
              <span className="text-[10px] text-slate-400">
                • {formatClockTime(run.created_at)}
              </span>
            </div>
            <p className="text-sm font-medium leading-relaxed text-white whitespace-pre-wrap break-words">
              {run.prompt}
            </p>

            {/* Attachment tags if any */}
            {run.attachments && run.attachments.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {run.attachments.map((att) => (
                  <span
                    key={att.id}
                    className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-[10px] text-slate-300"
                  >
                    <Paperclip className="h-3 w-3" />
                    <span>{att.name || 'Tệp đính kèm'}</span>
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
        className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0d1222]/80 p-3.5 sm:p-5 shadow-xl backdrop-blur-xl"
      >
        {/* Agent Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <StreamingAgentAvatar isGenerating={runIsActive} />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Antigravity Agent</span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                  {modelDisplayName}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {run.project_name} • {getEngineLabel(run.engine_mode)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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

            <StreamingControlButton
              isGenerating={runIsActive}
              disabled={cancelling || submitting}
              onStop={() => onCancel(run.id)}
              onRegenerate={() => onRegenerate(run.prompt)}
            />
          </div>
        </div>

        {/* Lucian #454 Live Agent Task Steps Progress Card */}
        <div className="mt-4">
          <AgentTaskSteps
            steps={agentSteps}
            isDone={!runIsActive}
            startedAt={run.created_at}
            finishedAt={run.finished_at || run.created_at}
            workingLabel="Agent đang thực thi"
            doneLabel={run.status === 'completed' ? 'Hoàn tất' : st.label}
            onReplay={() => onRegenerate(run.prompt)}
          />
        </div>

        {/* Error Banner if any */}
        {run.error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{run.error}</span>
          </div>
        )}

        {/* Lucian #453 Collapsible Thoughts Accordion */}
        {(run.thoughts || runIsActive) && (
          <div className="mt-4">
            <ThinkingAccordion
              thoughts={run.thoughts || ''}
              isThinking={Boolean(runIsActive && !run.response_text)}
              startedAt={run.created_at}
              finishedAt={run.finished_at || run.created_at}
              defaultOpen={isLatest && runIsActive}
            />
          </div>
        )}

        {/* Tool Execution Steps */}
        {run.tool_calls && run.tool_calls.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Công cụ & Lệnh đã chạy ({run.tool_calls.length})
            </p>
            <div className="space-y-1.5">
              {run.tool_calls.map((tc) => {
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
                        {expanded ? (
                          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                        )}
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
        {(run.response_text || !runIsActive) && (
          <div className="mt-5">
            {run.response_text ? (
              <div className="agy-markdown text-sm leading-relaxed text-slate-200">
                <MarkdownRenderer content={run.response_text} isDark={isDark} />
                {runIsActive && <StreamingCaret />}
                {run.status === 'cancelled' && (
                  <span className="u086-stop">— Đã dừng tại đây</span>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">
                Phiên chạy đã kết thúc mà không có văn bản kết quả.
              </p>
            )}
          </div>
        )}

        {/* Output Artifacts Links */}
        {run.output_artifacts && run.output_artifacts.length > 0 && (
          <div className="mt-6 border-t border-white/10 pt-4">
            <p className="mb-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Tệp kết quả sinh ra ({run.output_artifacts.length})
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {run.output_artifacts.map((art) => (
                <button
                  key={art.id || art.rel_path}
                  type="button"
                  onClick={() =>
                    onOpenArtifact({
                      kind: 'run_artifact',
                      runId: run.id,
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
    </div>
  );
}

export function PromptPage({
  projects,
  runs,
  conversationRuns,
  selectedProjectId,
  selectedRunId,
  defaultEngine,
  defaultPolicy,
  currentModel = 'gemini-4-argon',
  isDark,
  onSelectProject,
  onSelectRun: _onSelectRun,
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
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'ready' | 'uploading' | 'done' | 'error'>('ready');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) || projects[0] || null,
    [projects, selectedProjectId]
  );

  const activeRun = useMemo(() => {
    if (conversationRuns.length > 0) {
      return conversationRuns[conversationRuns.length - 1];
    }
    if (selectedRunId) {
      const found = runs.find((r) => r.id === selectedRunId);
      if (found) return found;
    }
    return null;
  }, [conversationRuns, runs, selectedRunId]);

  const runningRun = useMemo(
    () =>
      [...conversationRuns]
        .reverse()
        .find(
          (r) =>
            r.status === 'running' ||
            r.status === 'queued' ||
            r.status === 'awaiting_approval'
        ) || null,
    [conversationRuns]
  );

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

  // Scroll to bottom on new responses or turns
  useEffect(() => {
    if (conversationRuns.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [
    conversationRuns.length,
    activeRun?.response_text,
    activeRun?.thoughts,
    activeRun?.tool_calls?.length,
  ]);

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
        setUploadStatus('uploading');
        const uploaded = await api.uploadFiles(attachments, selectedProject.id);
        attachmentIds = uploaded.map((u) => u.id);
        setUploadStatus('done');
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
      setPromptText('');
      setAttachments([]);
      setUploadStatus('ready');
      onNotify('Đã gửi câu lệnh tới Antigravity Agent trên PC', 'success');
    } catch (err) {
      if (attachments.length > 0) setUploadStatus('error');
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

  const handleCancel = async (targetRunId?: string) => {
    const idToCancel = targetRunId || runningRun?.id || activeRun?.id;
    if (!idToCancel || cancelling) return;
    setCancelling(true);
    try {
      await api.cancelPromptRun(idToCancel);
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
      setUploadStatus('ready');
      e.target.value = '';
    }
  };

  const uploadQueueItems = useMemo<UploadQueueItem[]>(
    () =>
      attachments.map((file, idx) => ({
        id: `${idx}-${file.name}-${file.size}`,
        name: file.name,
        size: file.size,
        progress:
          uploadStatus === 'done'
            ? 1
            : uploadStatus === 'uploading'
              ? 0.65
              : uploadStatus === 'error'
                ? 0.4
                : 0.15,
        status: uploadStatus,
      })),
    [attachments, uploadStatus]
  );

  const isRunning = Boolean(runningRun);

  const autocompleteSuggestions = useMemo(() => {
    const historyPrompts = runs
      .slice(0, 15)
      .map((r) => r.prompt.trim())
      .filter((p) => p.length > 4);
    return Array.from(new Set([...QUICK_PROMPTS, ...EXTRA_AUTOCOMPLETE, ...historyPrompts]));
  }, [runs]);

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
    <div className="relative flex min-w-0 flex-1 flex-col justify-between overflow-hidden">
      {/* ============================================================== */}
      {/* CONVERSATION CANVAS / EMPTY STATE GREETING                     */}
      {/* ============================================================== */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        {conversationRuns.length === 0 ? (
          /* ========================================================== */
          /* EMPTY STATE: 1:1 CENTERED HANDWRITING GREETING (TAWA MALI) */
          /* ========================================================== */
          <div className="mx-auto flex min-h-[38vh] sm:min-h-[55vh] max-w-3xl flex-col items-center justify-center px-1 text-center animate-in fade-in zoom-in-95 duration-500">
            {/* Centered Handwritten Greeting in Mali Font */}
            <h1 className="agy-mali-greeting text-2xl font-medium leading-snug tracking-wide text-white drop-shadow-[0_2px_24px_rgba(183,164,255,0.7)] sm:text-4xl md:text-5xl">
              {greetingText || 'Tawa đã sẵn sàng rồi, hôm nay sensei muốn code gì nào'}
            </h1>

            {/* Subtitle with soft anime mascot hint */}
            <p className="mt-3 sm:mt-4 flex items-center justify-center gap-1.5 text-xs font-medium text-slate-300 drop-shadow sm:text-sm">
              <span className="shrink-0 text-pink-400">🌸</span>
              <span>Mọi hệ thống trên PC đã sẵn sàng, Sensei chỉ cần ra lệnh thôi nhé~</span>
            </p>

            {/* Quick Action Suggestion Chips */}
            <div className="mt-6 sm:mt-8 flex w-full max-w-2xl flex-wrap items-center justify-center gap-2 sm:gap-2.5">
              {QUICK_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setPromptText(prompt);
                    textareaRef.current?.focus();
                  }}
                  className="group flex max-w-full items-start sm:items-center gap-2 rounded-2xl sm:rounded-full border border-white/10 bg-black/35 px-3.5 py-2 text-left sm:text-center text-xs text-slate-300 backdrop-blur-md transition hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-white active:scale-[0.98]"
                >
                  <Sparkles className="mt-0.5 sm:mt-0 h-3 w-3 shrink-0 text-cyan-400 transition-transform group-hover:rotate-12" />
                  <span className="leading-snug">{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* UNIFIED CONVERSATION STREAM (ALL TURNS IN 1 CONVERSATION)  */
          /* ========================================================== */
          <div className="mx-auto max-w-4xl space-y-6 sm:space-y-8 pb-4">
            {conversationRuns.map((run, idx) => (
              <ConversationTurn
                key={run.id}
                run={run}
                isLatest={idx === conversationRuns.length - 1}
                modelDisplayName={modelDisplayName}
                isDark={isDark}
                cancelling={cancelling}
                submitting={submitting}
                onCancel={handleCancel}
                onRegenerate={(p) => handleSendPrompt(p)}
                onOpenArtifact={onOpenArtifact}
              />
            ))}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ============================================================== */}
      {/* 1:1 AUTHENTIC ANTIGRAVITY .surface-composer (Lucian #452 Glow) */}
      {/* ============================================================== */}
      <div className="relative z-20 shrink-0 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-8 sm:pb-4">
        <div
          className={cn(
            'u452-composer-shell mx-auto max-w-4xl',
            (isRunning || submitting) && 'is-gen'
          )}
        >
          {/* Lucian #452 Conic-Gradient Orbiting Glow while Generating */}
          <i className="u452-glow" aria-hidden="true" />
          {/* Double Border Frame Outer (Styled by Theme Customizer) */}
          <div className="agy-composer-frame-outer shadow-2xl">
            {/* Inner Composer Card */}
            <div className="agy-composer-frame-inner surface-composer-card p-2.5 sm:p-3.5">
              {/* TOP ROW: Workspace & Context Pills */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pb-2 text-[11px] font-semibold text-slate-300">
                {/* Project Selector Trigger */}
                <div className="relative max-w-full">
                  <button
                    type="button"
                    onClick={() => setProjectMenuOpen((o) => !o)}
                    className="flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 sm:px-2.5 py-1 text-slate-200 hover:bg-white/10 hover:border-white/20 transition"
                  >
                    <FolderGit2 className="h-3 w-3 shrink-0 text-cyan-400" />
                    <span className="max-w-[120px] sm:max-w-[200px] truncate">{selectedProject?.name || 'No Project'}</span>
                    <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
                  </button>

                  {projectMenuOpen && (
                    <div
                      className="absolute bottom-full left-0 mb-2 w-52 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50"
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

              {/* ATTACHMENTS QUEUE (Lucian #075 Collapsible Upload Panel) */}
              {uploadQueueItems.length > 0 && (
                <div className="mb-2.5">
                  <FileUploadQueue
                    items={uploadQueueItems}
                    onRemove={(id) => {
                      const idx = parseInt(id.split('-')[0], 10);
                      if (!Number.isNaN(idx)) {
                        setAttachments((prev) => prev.filter((_, i) => i !== idx));
                      }
                    }}
                    onRetry={() => handleSendPrompt()}
                  />
                </div>
              )}

              {/* MIDDLE ROW: LUCIAN #456 INLINE GHOST AUTOCOMPLETE TEXTAREA */}
              <div className="relative">
                <GhostAutocompleteTextarea
                  textareaRef={textareaRef}
                  value={promptText}
                  onChange={setPromptText}
                  onKeyDown={handleKeyDown}
                  suggestions={autocompleteSuggestions}
                  rows={2}
                  placeholder="Ask anything, @ to mention, / for actions... (Tab nhận gợi ý · Enter để gửi)"
                  disabled={submitting}
                />
              </div>

              {/* BOTTOM TOOLBAR ROW */}
              <div className="mt-2 flex items-center justify-between gap-1.5 sm:gap-2 border-t border-white/10 pt-2">
                {/* Left: Model Selector, Turbo, Action Mode */}
                <div className="flex min-w-0 flex-1 items-center gap-1.5">
                  {/* Model Selector Pill */}
                  <button
                    type="button"
                    onClick={() => setIsModelModalOpen(true)}
                    className="flex min-w-0 items-center gap-1 sm:gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:border-cyan-400/50"
                  >
                    <span className="shrink-0 text-cyan-400 font-bold">+</span>
                    <span className="max-w-[108px] sm:max-w-none truncate">{modelDisplayName}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                  </button>

                  {/* Mode Pill (Turbo / Deep) */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setModeMenuOpen((o) => !o)}
                      className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <Zap className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="hidden xs:inline sm:inline">
                        {selectedActionMode === 'run_agent' ? 'Turbo' : selectedActionMode === 'code_review' ? 'Review' : 'Research'}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                    </button>

                    {modeMenuOpen && (
                      <div
                        className="absolute bottom-full left-0 mb-2 w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50"
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

                  {/* Lucian #452 Morphing Send (↑) ↔ Stop (■) Button */}
                  <button
                    type="button"
                    aria-disabled={
                      !(isRunning || submitting) && !promptText.trim() && attachments.length === 0
                        ? 'true'
                        : 'false'
                    }
                    aria-label={isRunning ? 'Dừng tác vụ đang chạy' : 'Gửi câu lệnh'}
                    onClick={() => {
                      if (isRunning) {
                        handleCancel();
                      } else if (!submitting && (promptText.trim() || attachments.length > 0)) {
                        handleSendPrompt();
                      }
                    }}
                    className="u452-send"
                    title={isRunning ? 'Dừng tác vụ đang chạy' : 'Gửi câu lệnh (Enter)'}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 19V5.5M6 11l6-6 6 6" />
                    </svg>
                    <i className="u452-sq" aria-hidden="true" />
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
