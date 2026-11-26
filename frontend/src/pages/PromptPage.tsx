import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Cpu,
  Download,
  FileCode,
  FileText,
  FolderGit2,
  GitBranch,
  Globe,
  ListOrdered,
  Mic,
  MicOff,
  Paperclip,
  Plus,
  Slash,
  Sparkles,
  Terminal,
  Trash2,
  Volume2,
  VolumeX,
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
  getPromptStatusInfo,
} from '../lib/utils';
import type {
  AgentCliInfo,
  AgentMemoryItem,
  ArtifactModalTarget,
  EngineMode,
  ExecutionPolicy,
  Project,
  PromptRun,
  SystemStatus,
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
  systemStatus?: SystemStatus | null;
  onSelectProject: (projectId: string) => void;
  onSelectRun: (runId: string) => void;
  onRunCreated: (run: PromptRun) => void;
  onModelChange?: (model: string) => void;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onNavigate: (tab: TabKey) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

interface SlashCommandItem {
  id: string;
  command: string;
  label: string;
  description: string;
  template: string;
  custom?: boolean;
}

interface QueuedMessageItem {
  id: string;
  prompt: string;
  engineMode: EngineMode;
  policy: ExecutionPolicy;
  actionMode: 'run_agent' | 'code_review' | 'deep_research';
  attachments: File[];
  createdAt: string;
}

interface IdeContextPayload {
  projectId?: string;
  relPath?: string;
  filePath?: string;
  path?: string;
  snippet?: string;
  content?: string;
  language?: string;
  lineRange?: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  length: number;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const CUSTOM_SLASH_KEY = 'agy_custom_slash_commands';
const IDE_CHAT_CONTEXT_KEY = 'agy_ide_chat_context';

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

const BUILTIN_SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'builtin-review',
    command: '/review',
    label: 'Review mã nguồn',
    description: 'Kiểm tra bug, edge-case, bảo mật và đề xuất tối ưu',
    template: 'Hãy review kỹ mã nguồn liên quan, chỉ ra lỗi tiềm ẩn, rủi ro bảo mật và đề xuất sửa chi tiết:',
  },
  {
    id: 'builtin-diff',
    command: '/diff',
    label: 'Phân tích Git Diff',
    description: 'Xem xét các thay đổi chưa commit trong workspace',
    template: 'Hãy kiểm tra git status và phân tích toàn bộ git diff hiện tại, đánh giá tác động và lỗi nếu có:',
  },
  {
    id: 'builtin-fix',
    command: '/fix',
    label: 'Chẩn đoán & Sửa lỗi',
    description: 'Tìm nguyên nhân gốc rễ và vá lỗi triệt để',
    template: 'Hãy tìm nguyên nhân gốc rễ, sửa lỗi và chạy kiểm tra lại cho vấn đề sau:',
  },
  {
    id: 'builtin-test',
    command: '/test',
    label: 'Viết & Chạy Test',
    description: 'Sinh unit/integration test và chạy xác minh',
    template: 'Hãy viết bộ kiểm thử (unit/integration test) đầy đủ và chạy test để xác minh:',
  },
  {
    id: 'builtin-explain',
    command: '/explain',
    label: 'Giải thích mã nguồn',
    description: 'Giải thích luồng chạy, module và dữ liệu chi tiết',
    template: 'Hãy giải thích chi tiết cơ chế hoạt động, luồng dữ liệu và vai trò của:',
  },
  {
    id: 'builtin-architecture',
    command: '/architecture',
    label: 'Kiến trúc hệ thống',
    description: 'Phân tích kiến trúc tổng thể kèm sơ đồ Mermaid',
    template: 'Hãy phân tích kiến trúc tổng thể dự án, vẽ sơ đồ Mermaid và đề xuất hướng mở rộng:',
  },
  {
    id: 'builtin-remember',
    command: '/remember',
    label: 'Ghi nhớ vào Bộ nhớ AI',
    description: 'Lưu quy ước hoặc thông tin quan trọng cho Agent',
    template: 'Hãy ghi nhớ quy ước/ngữ cảnh quan trọng sau vào bộ nhớ AI (trả về khối ```memory để lưu):',
  },
];

interface EngineOptionMeta {
  id: EngineMode;
  label: string;
  shortLabel: string;
  command: string;
  description: string;
  cliIds: string[];
}

const ENGINE_OPTIONS: EngineOptionMeta[] = [
  {
    id: 'antigravity_sdk',
    label: 'Antigravity SDK',
    shortLabel: 'AGY SDK',
    command: 'google-antigravity',
    description: 'Agent SDK chính thức với Thought stream & Tool Approval',
    cliIds: [],
  },
  {
    id: 'cli',
    label: 'CLI Runner (agy)',
    shortLabel: 'agy CLI',
    command: 'agy',
    description: 'Thực thi qua lệnh agy CLI / workspace runner trên PC',
    cliIds: ['agy', 'cli'],
  },
  {
    id: 'claude_code',
    label: 'Claude Code',
    shortLabel: 'Claude Code',
    command: 'claude',
    description: 'Anthropic Claude Code CLI (claude -p stream-json)',
    cliIds: ['claude_code', 'claude'],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    shortLabel: 'Codex',
    command: 'codex',
    description: 'OpenAI Codex CLI (codex exec --json)',
    cliIds: ['codex'],
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    shortLabel: 'OpenCode',
    command: 'opencode',
    description: 'OpenCode CLI (opencode run --format json)',
    cliIds: ['opencode'],
  },
  {
    id: 'demo',
    label: 'Demo Simulator',
    shortLabel: 'Demo',
    command: 'simulator',
    description: 'Chế độ mô phỏng tương tác không cần API key',
    cliIds: [],
  },
];

function loadCustomSlashCommands(): SlashCommandItem[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SLASH_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.command === 'string' && typeof item.template === 'string')
      .map((item, idx) => ({
        id: String(item.id || `custom-${idx}`),
        command: item.command.startsWith('/') ? item.command : `/${item.command}`,
        label: String(item.label || item.command),
        description: String(item.description || 'Lệnh tùy chỉnh'),
        template: String(item.template),
        custom: true,
      }));
  } catch {
    return [];
  }
}

function saveCustomSlashCommands(list: SlashCommandItem[]): void {
  try {
    localStorage.setItem(CUSTOM_SLASH_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage errors
  }
}

function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' Đoạn mã nguồn. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~>-]{1,3}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadBlobFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function buildMarkdownExport(runs: PromptRun[], projectName: string): string {
  const exportedAt = new Date().toLocaleString('vi-VN');
  const lines: string[] = [
    `# Antigravity Pulse — Hội thoại (${projectName})`,
    '',
    `- **Dự án:** ${projectName}`,
    `- **Thời gian xuất:** ${exportedAt}`,
    `- **Tổng số lượt:** ${runs.length}`,
    '',
    '---',
    '',
  ];

  runs.forEach((run, index) => {
    lines.push(`## Lượt ${index + 1} • ${getEngineLabel(run.engine_mode)} (${run.status})`);
    lines.push(`*Thời gian: ${new Date(run.created_at).toLocaleString('vi-VN')}*`);
    lines.push('');
    lines.push('### Sensei');
    lines.push(run.prompt || '_(Không có nội dung)_');
    lines.push('');

    if (run.thoughts?.trim()) {
      lines.push('<details>');
      lines.push('<summary>Luồng suy nghĩ (Thoughts)</summary>');
      lines.push('');
      lines.push('```text');
      lines.push(run.thoughts.trim());
      lines.push('```');
      lines.push('</details>');
      lines.push('');
    }

    if (run.tool_calls && run.tool_calls.length > 0) {
      lines.push('### Công cụ đã chạy');
      run.tool_calls.forEach((tc) => {
        lines.push(`- \`${tc.name}\` (${tc.status})`);
      });
      lines.push('');
    }

    lines.push(`### ${getEngineLabel(run.engine_mode)}`);
    if (run.error) {
      lines.push(`> **Lỗi:** ${run.error}`);
      lines.push('');
    }
    lines.push(run.response_text?.trim() || '_(Không có phản hồi văn bản)_');
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}

function buildHtmlExport(runs: PromptRun[], projectName: string): string {
  const exportedAt = new Date().toLocaleString('vi-VN');
  const turnsHtml = runs
    .map((run, index) => {
      const thoughtsHtml = run.thoughts?.trim()
        ? `<details class="thoughts"><summary>Luồng suy nghĩ (${run.thoughts.length} ký tự)</summary><pre>${escapeHtml(run.thoughts.trim())}</pre></details>`
        : '';
      const toolsHtml =
        run.tool_calls && run.tool_calls.length > 0
          ? `<div class="tools"><strong>Công cụ:</strong> ${run.tool_calls
              .map((tc) => `<span class="chip">${escapeHtml(tc.name)} (${escapeHtml(tc.status)})</span>`)
              .join(' ')}</div>`
          : '';
      const errorHtml = run.error
        ? `<div class="error">Lỗi: ${escapeHtml(run.error)}</div>`
        : '';
      return `
      <section class="turn">
        <div class="meta">Lượt ${index + 1} • ${escapeHtml(getEngineLabel(run.engine_mode))} • ${escapeHtml(run.status)} • ${escapeHtml(new Date(run.created_at).toLocaleString('vi-VN'))}</div>
        <div class="user-msg"><strong>Sensei</strong><pre>${escapeHtml(run.prompt)}</pre></div>
        <div class="agent-msg">
          <strong>${escapeHtml(getEngineLabel(run.engine_mode))}</strong>
          ${thoughtsHtml}
          ${toolsHtml}
          ${errorHtml}
          <pre class="response">${escapeHtml(run.response_text?.trim() || '(Không có phản hồi văn bản)')}</pre>
        </div>
      </section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Antigravity Pulse — ${escapeHtml(projectName)}</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #090d16; color: #e2e8f0; margin: 0; padding: 24px; line-height: 1.6; }
    .container { max-width: 900px; margin: 0 auto; }
    header { border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 16px; margin-bottom: 24px; }
    h1 { margin: 0 0 6px; font-size: 22px; color: #38bdf8; }
    .sub { font-size: 13px; color: #94a3b8; }
    .turn { background: #101628; border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 18px; margin-bottom: 20px; }
    .meta { font-size: 12px; color: #94a3b8; margin-bottom: 12px; }
    .user-msg { background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); border-radius: 10px; padding: 12px; margin-bottom: 12px; }
    .agent-msg { background: rgba(15,23,42,0.85); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px; }
    pre { white-space: pre-wrap; word-break: break-word; font-family: inherit; margin: 6px 0 0; }
    .thoughts { margin: 10px 0; font-size: 13px; color: #cbd5e1; }
    .thoughts pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; background: #070a14; padding: 10px; border-radius: 8px; }
    .tools { margin: 8px 0; font-size: 12px; }
    .chip { display: inline-block; background: rgba(255,255,255,0.08); border-radius: 999px; padding: 2px 8px; margin: 2px 4px 2px 0; font-family: monospace; }
    .error { background: rgba(244,63,94,0.15); border: 1px solid rgba(244,63,94,0.35); color: #fda4af; padding: 8px 10px; border-radius: 8px; margin: 8px 0; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Antigravity Pulse — Lịch sử hội thoại</h1>
      <div class="sub">Dự án: ${escapeHtml(projectName)} • Xuất lúc: ${escapeHtml(exportedAt)} • ${runs.length} lượt</div>
    </header>
    ${turnsHtml}
  </div>
</body>
</html>`;
}

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
  isSpeaking: boolean;
  onToggleSpeak: (run: PromptRun) => void;
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
  isSpeaking,
  onToggleSpeak,
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {getEngineLabel(run.engine_mode)}
                </span>
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-mono text-cyan-300">
                  {modelDisplayName}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {run.project_name} • {getEngineLabel(run.engine_mode)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {run.response_text?.trim() && (
              <button
                type="button"
                onClick={() => onToggleSpeak(run)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition',
                  isSpeaking
                    ? 'border-cyan-400/50 bg-cyan-500/20 text-cyan-200'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'
                )}
                title={isSpeaking ? 'Dừng đọc phản hồi' : 'Đọc to phản hồi (TTS)'}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Dừng</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5 text-cyan-300" />
                    <span>Đọc</span>
                  </>
                )}
              </button>
            )}

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
  systemStatus: propSystemStatus,
  onSelectProject,
  onSelectRun: _onSelectRun,
  onRunCreated,
  onModelChange,
  onOpenArtifact,
  onNavigate: _onNavigate,
  onNotify,
}: PromptPageProps) {
  const { playTaskVoice, greetingText } = useCustomTheme();
  const [promptText, setPromptText] = useState('');
  const [engineMode, setEngineMode] = useState<EngineMode>(defaultEngine);
  const [policy, setPolicy] = useState<ExecutionPolicy>(defaultPolicy);
  const [isModelModalOpen, setIsModelModalOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedActionMode, setSelectedActionMode] = useState<'run_agent' | 'code_review' | 'deep_research'>('run_agent');
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState<'ready' | 'uploading' | 'done' | 'error'>('ready');

  // System status for CLI installation badges
  const [fetchedSystemStatus, setFetchedSystemStatus] = useState<SystemStatus | null>(null);
  const effectiveSystemStatus = propSystemStatus ?? fetchedSystemStatus;

  // Slash Command Menu & Custom Commands
  const [customSlashCommands, setCustomSlashCommands] = useState<SlashCommandItem[]>(() =>
    loadCustomSlashCommands()
  );
  const [slashPaletteDismissed, setSlashPaletteDismissed] = useState(false);
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [isCustomSlashModalOpen, setIsCustomSlashModalOpen] = useState(false);
  const [newSlashCommand, setNewSlashCommand] = useState('/');
  const [newSlashLabel, setNewSlashLabel] = useState('');
  const [newSlashTemplate, setNewSlashTemplate] = useState('');

  // Voice Dictation (SpeechRecognition) & Read-Aloud TTS
  const [isDictating, setIsDictating] = useState(false);
  const [dictationLang, setDictationLang] = useState<'vi-VN' | 'en-US'>('vi-VN');
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [speakingRunId, setSpeakingRunId] = useState<string | null>(null);

  // Queued Next-Turn Messages
  const [queuedMessages, setQueuedMessages] = useState<QueuedMessageItem[]>([]);
  const prevRunningRunIdRef = useRef<string | null>(null);
  const dispatchingQueueRef = useRef(false);

  // Agent Memory Modal
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [memories, setMemories] = useState<AgentMemoryItem[]>([]);
  const [loadingMemories, setLoadingMemories] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [memoryFilter, setMemoryFilter] = useState<'all' | 'project' | 'global'>('all');
  const [memoryTitle, setMemoryTitle] = useState('');
  const [memoryContent, setMemoryContent] = useState('');
  const [memoryScope, setMemoryScope] = useState<'project' | 'global'>('project');
  const [memoryMode, setMemoryMode] = useState<'always' | 'passive'>('always');

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

  const isRunning = Boolean(runningRun);

  // Fetch system status if not supplied via props so CLI install badges work out of the box
  useEffect(() => {
    if (propSystemStatus) return;
    let cancelled = false;
    api
      .getSystemStatus()
      .then((status) => {
        if (!cancelled) setFetchedSystemStatus(status);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [propSystemStatus]);

  // Sync engine/policy defaults when project changes
  useEffect(() => {
    if (selectedProject) {
      setEngineMode(selectedProject.engine_mode);
      setPolicy(selectedProject.execution_policy);
    }
  }, [selectedProject?.id]);

  // IDE Context Handoff (from Pocket IDE "Gửi sang AI Chat")
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(IDE_CHAT_CONTEXT_KEY);
      if (!raw) return;
      sessionStorage.removeItem(IDE_CHAT_CONTEXT_KEY);

      let parsed: IdeContextPayload | null = null;
      try {
        parsed = JSON.parse(raw) as IdeContextPayload;
      } catch {
        parsed = { snippet: raw };
      }

      if (
        parsed?.projectId &&
        parsed.projectId !== selectedProjectId &&
        projects.some((p) => p.id === parsed?.projectId)
      ) {
        onSelectProject(parsed.projectId);
      }

      const relPath = parsed?.relPath || parsed?.filePath || parsed?.path || '';
      const snippet = parsed?.snippet || parsed?.content || '';
      const lang =
        parsed?.language ||
        (relPath.includes('.') ? relPath.split('.').pop()?.toLowerCase() || '' : '');

      const parts: string[] = [];
      if (relPath) {
        parts.push(
          `Ngữ cảnh từ IDE (\`${relPath}\`${parsed?.lineRange ? ` · ${parsed.lineRange}` : ''}):`
        );
      } else {
        parts.push('Ngữ cảnh từ IDE:');
      }
      if (snippet.trim()) {
        parts.push(`\`\`\`${lang}\n${snippet.trimEnd()}\n\`\`\``);
      }

      const contextBlock = `${parts.join('\n')}\n\n`;
      setPromptText((prev) => (prev.trim() ? `${prev.trimEnd()}\n\n${contextBlock}` : contextBlock));
      window.setTimeout(() => {
        textareaRef.current?.focus();
      }, 60);
      onNotify(
        relPath ? `Đã nạp ngữ cảnh tệp ${relPath} từ IDE` : 'Đã nạp ngữ cảnh từ IDE vào khung chat',
        'info'
      );
    } catch {
      // Ignore storage errors
    }
  }, [selectedProjectId, projects, onSelectProject, onNotify]);

  // Load agent memories for badge & modal
  const refreshMemories = useCallback(
    async (silent = true) => {
      if (!silent) setLoadingMemories(true);
      try {
        const list = await api.getMemories(selectedProject?.id);
        setMemories(list);
      } catch (err) {
        if (!silent) {
          onNotify(
            err instanceof Error ? err.message : 'Không thể tải Bộ nhớ AI',
            'error'
          );
        }
      } finally {
        if (!silent) setLoadingMemories(false);
      }
    },
    [selectedProject?.id, onNotify]
  );

  useEffect(() => {
    refreshMemories(true);
  }, [refreshMemories]);

  useEffect(() => {
    if (isMemoryModalOpen) {
      refreshMemories(false);
    }
  }, [isMemoryModalOpen, refreshMemories]);

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

  // Close popovers on outside click
  useEffect(() => {
    const closeAllMenus = () => {
      setProjectMenuOpen(false);
      setModeMenuOpen(false);
      setAgentMenuOpen(false);
      setExportMenuOpen(false);
    };
    window.addEventListener('click', closeAllMenus);
    return () => window.removeEventListener('click', closeAllMenus);
  }, []);

  // Cleanup speech recognition & synthesis on unmount
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // All slash commands (built-in + custom)
  const allSlashCommands = useMemo(
    () => [...BUILTIN_SLASH_COMMANDS, ...customSlashCommands],
    [customSlashCommands]
  );

  const slashQuery = useMemo(() => {
    if (!promptText.startsWith('/')) return null;
    if (promptText.includes('\n') || promptText.includes(' ')) return null;
    return promptText.toLowerCase();
  }, [promptText]);

  const filteredSlashCommands = useMemo(() => {
    if (slashQuery === null) return [];
    return allSlashCommands.filter(
      (cmd) =>
        cmd.command.toLowerCase().startsWith(slashQuery) ||
        cmd.label.toLowerCase().includes(slashQuery.slice(1))
    );
  }, [allSlashCommands, slashQuery]);

  const slashMenuOpen = slashQuery !== null && !slashPaletteDismissed;

  useEffect(() => {
    setSlashPaletteDismissed(false);
    setSlashSelectedIndex(0);
  }, [promptText]);

  const applySlashCommand = (item: SlashCommandItem) => {
    setPromptText(`${item.template} `);
    setSlashPaletteDismissed(true);
    window.requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        const len = item.template.length + 1;
        ta.setSelectionRange(len, len);
      }
    });
  };

  const handleSaveCustomSlashCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedCmd = newSlashCommand.trim().replace(/\s+/g, '-').toLowerCase();
    const normalizedCmd = cleanedCmd.startsWith('/') ? cleanedCmd : `/${cleanedCmd}`;
    if (normalizedCmd.length < 2) {
      onNotify('Hãy nhập tên lệnh bắt đầu bằng / (ví dụ /deploy)', 'error');
      return;
    }
    if (!newSlashTemplate.trim()) {
      onNotify('Hãy nhập nội dung prompt mẫu cho lệnh', 'error');
      return;
    }
    const created: SlashCommandItem = {
      id: `custom-${Date.now()}`,
      command: normalizedCmd,
      label: newSlashLabel.trim() || normalizedCmd,
      description: 'Lệnh tùy chỉnh cá nhân',
      template: newSlashTemplate.trim(),
      custom: true,
    };
    const next = [...customSlashCommands.filter((c) => c.command !== normalizedCmd), created];
    setCustomSlashCommands(next);
    saveCustomSlashCommands(next);
    setNewSlashCommand('/');
    setNewSlashLabel('');
    setNewSlashTemplate('');
    onNotify(`Đã lưu lệnh ${normalizedCmd}`, 'success');
  };

  const handleDeleteCustomSlashCommand = (id: string) => {
    const next = customSlashCommands.filter((c) => c.id !== id);
    setCustomSlashCommands(next);
    saveCustomSlashCommands(next);
  };

  const executePromptRun = useCallback(
    async (opts: {
      prompt: string;
      engine: EngineMode;
      execPolicy: ExecutionPolicy;
      actionMode: 'run_agent' | 'code_review' | 'deep_research';
      files: File[];
      clearComposer: boolean;
    }) => {
      if (!selectedProject) {
        onNotify('Hãy chọn một dự án trên PC trước.', 'error');
        return;
      }
      const textToSend = opts.prompt.trim();
      if (!textToSend && opts.files.length === 0) {
        onNotify('Vui lòng nhập nội dung câu lệnh hoặc chọn prompt mẫu.', 'info');
        return;
      }

      setSubmitting(true);
      playTaskVoice();

      try {
        let attachmentIds: string[] = [];
        if (opts.files.length > 0) {
          setUploadStatus('uploading');
          const uploaded = await api.uploadFiles(opts.files, selectedProject.id);
          attachmentIds = uploaded.map((u) => u.id);
          setUploadStatus('done');
        }

        let finalPrompt = textToSend;
        if (opts.actionMode === 'code_review') {
          finalPrompt = `[Code Review] ${textToSend}`;
        } else if (opts.actionMode === 'deep_research') {
          finalPrompt = `[Deep Research] ${textToSend}`;
        }

        const created = await api.runPrompt({
          project_id: selectedProject.id,
          prompt: finalPrompt || '(Tệp đính kèm)',
          engine_mode: opts.engine,
          execution_policy: opts.execPolicy,
          attachment_ids: attachmentIds,
        });

        onRunCreated(created);
        if (opts.clearComposer) {
          setPromptText('');
          setAttachments([]);
        }
        setUploadStatus('ready');
        onNotify(`Đã gửi câu lệnh tới ${getEngineLabel(opts.engine)} trên PC`, 'success');
      } catch (err) {
        if (opts.files.length > 0) setUploadStatus('error');
        onNotify(
          err instanceof Error ? err.message : 'Không thể khởi chạy prompt',
          'error'
        );
      } finally {
        setSubmitting(false);
      }
    },
    [selectedProject, playTaskVoice, onRunCreated, onNotify]
  );

  const enqueueCurrentPrompt = useCallback(() => {
    const textToQueue = promptText.trim();
    if (!selectedProject) {
      onNotify('Hãy chọn một dự án trên PC trước.', 'error');
      return;
    }
    if (!textToQueue && attachments.length === 0) {
      onNotify('Vui lòng nhập nội dung tin nhắn để xếp hàng.', 'info');
      return;
    }
    const item: QueuedMessageItem = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      prompt: textToQueue || '(Tệp đính kèm)',
      engineMode,
      policy,
      actionMode: selectedActionMode,
      attachments: [...attachments],
      createdAt: new Date().toISOString(),
    };
    setQueuedMessages((prev) => [...prev, item]);
    setPromptText('');
    setAttachments([]);
    setUploadStatus('ready');
    onNotify('Đã thêm vào Hàng đợi tin nhắn — sẽ tự gửi khi lượt hiện tại xong', 'info');
  }, [promptText, attachments, selectedProject, engineMode, policy, selectedActionMode, onNotify]);

  const handleSendPrompt = (customPrompt?: string) => {
    if (customPrompt !== undefined) {
      if (isRunning || submitting) {
        setQueuedMessages((prev) => [
          ...prev,
          {
            id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            prompt: customPrompt,
            engineMode,
            policy,
            actionMode: selectedActionMode,
            attachments: [],
            createdAt: new Date().toISOString(),
          },
        ]);
        onNotify('Agent đang chạy — đã đưa câu lệnh vào hàng đợi', 'info');
        return;
      }
      executePromptRun({
        prompt: customPrompt,
        engine: engineMode,
        execPolicy: policy,
        actionMode: selectedActionMode,
        files: [],
        clearComposer: false,
      });
      return;
    }

    if (isRunning || submitting) {
      enqueueCurrentPrompt();
      return;
    }

    executePromptRun({
      prompt: promptText,
      engine: engineMode,
      execPolicy: policy,
      actionMode: selectedActionMode,
      files: attachments,
      clearComposer: true,
    });
  };

  // Auto-dispatch next queued message when active run transitions to completed/failed/cancelled
  useEffect(() => {
    const currentRunningId = runningRun?.id ?? null;
    if (currentRunningId) {
      prevRunningRunIdRef.current = currentRunningId;
      return;
    }

    const prevId = prevRunningRunIdRef.current;
    if (!prevId || submitting || dispatchingQueueRef.current || queuedMessages.length === 0) {
      return;
    }

    const finishedRun =
      conversationRuns.find((r) => r.id === prevId) ||
      runs.find((r) => r.id === prevId);

    if (
      finishedRun &&
      (finishedRun.status === 'completed' ||
        finishedRun.status === 'failed' ||
        finishedRun.status === 'cancelled')
    ) {
      prevRunningRunIdRef.current = null;
      dispatchingQueueRef.current = true;
      const [nextItem, ...rest] = queuedMessages;
      setQueuedMessages(rest);

      executePromptRun({
        prompt: nextItem.prompt,
        engine: nextItem.engineMode,
        execPolicy: nextItem.policy,
        actionMode: nextItem.actionMode,
        files: nextItem.attachments,
        clearComposer: false,
      }).finally(() => {
        dispatchingQueueRef.current = false;
      });
    }
  }, [runningRun?.id, submitting, queuedMessages, conversationRuns, runs, executePromptRun]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIndex((idx) => (idx + 1) % filteredSlashCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIndex((idx) =>
          (idx - 1 + filteredSlashCommands.length) % filteredSlashCommands.length
        );
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        const chosen = filteredSlashCommands[slashSelectedIndex] || filteredSlashCommands[0];
        if (chosen) applySlashCommand(chosen);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashPaletteDismissed(true);
        return;
      }
    }

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

  // Voice Dictation toggle
  const handleToggleDictation = () => {
    if (isDictating) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
      setIsDictating(false);
      setInterimTranscript('');
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      onNotify(
        'Trình duyệt hiện tại không hỗ trợ nhận diện giọng nói (SpeechRecognition).',
        'error'
      );
      return;
    }

    try {
      const rec = new SpeechRec();
      rec.lang = dictationLang;
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (event) => {
        let finalText = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalText += text;
          } else {
            interim += text;
          }
        }
        setInterimTranscript(interim.trim());
        if (finalText.trim()) {
          setPromptText((prev) => {
            const trimmed = prev.trimEnd();
            return trimmed ? `${trimmed} ${finalText.trim()}` : finalText.trim();
          });
        }
      };

      rec.onerror = (ev) => {
        setIsDictating(false);
        setInterimTranscript('');
        if (ev.error && ev.error !== 'aborted' && ev.error !== 'no-speech') {
          onNotify(`Lỗi micro: ${ev.error}`, 'error');
        }
      };

      rec.onend = () => {
        setIsDictating(false);
        setInterimTranscript('');
      };

      recognitionRef.current = rec;
      rec.start();
      setIsDictating(true);
      onNotify(`Đang nghe giọng nói (${dictationLang})...`, 'info');
    } catch (err) {
      setIsDictating(false);
      onNotify(err instanceof Error ? err.message : 'Không thể bật micro', 'error');
    }
  };

  // Read-Aloud TTS toggle
  const handleToggleSpeak = (run: PromptRun) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onNotify('Trình duyệt không hỗ trợ đọc văn bản (SpeechSynthesis).', 'error');
      return;
    }
    const synth = window.speechSynthesis;
    if (speakingRunId === run.id) {
      synth.cancel();
      setSpeakingRunId(null);
      return;
    }

    const spokenText = stripMarkdownForSpeech(run.response_text || '');
    if (!spokenText) return;

    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(spokenText);
    const hasVietnamese = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(
      spokenText
    );
    utterance.lang = hasVietnamese ? 'vi-VN' : 'en-US';
    const voices = synth.getVoices();
    const matchedVoice = voices.find((v) =>
      v.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase())
    );
    if (matchedVoice) utterance.voice = matchedVoice;

    utterance.onend = () => setSpeakingRunId((curr) => (curr === run.id ? null : curr));
    utterance.onerror = () => setSpeakingRunId((curr) => (curr === run.id ? null : curr));
    setSpeakingRunId(run.id);
    synth.speak(utterance);
  };

  // Agent Memory CRUD
  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoryTitle.trim() || !memoryContent.trim()) {
      onNotify('Hãy nhập đầy đủ tiêu đề và nội dung ghi nhớ.', 'error');
      return;
    }
    setSavingMemory(true);
    try {
      const saved = await api.saveMemory({
        title: memoryTitle.trim(),
        content: memoryContent.trim(),
        scope: memoryScope,
        project_id: memoryScope === 'project' ? selectedProject?.id ?? null : null,
        mode: memoryMode,
      });
      setMemories((prev) => {
        const idx = prev.findIndex((m) => m.id === saved.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      setMemoryTitle('');
      setMemoryContent('');
      onNotify('Đã lưu vào Bộ nhớ AI', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể lưu bộ nhớ', 'error');
    } finally {
      setSavingMemory(false);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await api.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      onNotify('Đã xóa mục bộ nhớ', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể xóa mục bộ nhớ', 'error');
    }
  };

  // Conversation Export
  const handleExportConversation = (format: 'md' | 'html') => {
    setExportMenuOpen(false);
    if (conversationRuns.length === 0) {
      onNotify('Chưa có lượt hội thoại nào để xuất.', 'info');
      return;
    }
    const projectName = selectedProject?.name || 'Workspace';
    const slug = projectName.toLowerCase().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-|-$/g, '') || 'chat';
    const dateStamp = new Date().toISOString().slice(0, 10);
    if (format === 'md') {
      const md = buildMarkdownExport(conversationRuns, projectName);
      downloadBlobFile(`${slug}-chat-${dateStamp}.md`, md, 'text/markdown;charset=utf-8');
      onNotify('Đã xuất hội thoại dạng Markdown (.md)', 'success');
    } else {
      const html = buildHtmlExport(conversationRuns, projectName);
      downloadBlobFile(`${slug}-chat-${dateStamp}.html`, html, 'text/html;charset=utf-8');
      onNotify('Đã xuất hội thoại dạng HTML (.html)', 'success');
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

  const autocompleteSuggestions = useMemo(() => {
    const historyPrompts = runs
      .slice(0, 15)
      .map((r) => r.prompt.trim())
      .filter((p) => p.length > 4);
    return Array.from(new Set([...QUICK_PROMPTS, ...EXTRA_AUTOCOMPLETE, ...historyPrompts]));
  }, [runs]);

  const filteredMemories = useMemo(() => {
    if (memoryFilter === 'global') return memories.filter((m) => m.scope === 'global');
    if (memoryFilter === 'project') return memories.filter((m) => m.scope === 'project');
    return memories;
  }, [memories, memoryFilter]);

  const getAgentInstallInfo = (opt: EngineOptionMeta): AgentCliInfo | null => {
    const list = effectiveSystemStatus?.installed_agents;
    if (list && list.length > 0 && opt.cliIds.length > 0) {
      const found = list.find(
        (a) =>
          opt.cliIds.includes(a.id.toLowerCase()) ||
          opt.cliIds.includes(a.command.toLowerCase())
      );
      if (found) return found;
    }
    if (opt.id === 'cli' && effectiveSystemStatus) {
      return {
        id: 'agy',
        name: 'Antigravity CLI',
        installed: Boolean(effectiveSystemStatus.agy_cli_found),
        command: 'agy',
      };
    }
    return null;
  };

  const currentEngineMeta =
    ENGINE_OPTIONS.find((o) => o.id === engineMode) || ENGINE_OPTIONS[0];

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
      {/* STUDIO V2 UTILITY BAR (Memories + Export + Quick Slash Modal)  */}
      {/* ============================================================== */}
      <div className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[#0a0f1d]/70 px-3 py-2 backdrop-blur-xl sm:px-8">
        <div className="flex min-w-0 items-center gap-2 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 font-semibold text-cyan-300">
            <Cpu className="h-3.5 w-3.5" />
            <span className="truncate">{currentEngineMeta.label}</span>
          </span>
          {selectedProject && (
            <span className="hidden truncate text-[11px] text-slate-400 sm:inline">
              {selectedProject.name}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Custom Slash Commands Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsCustomSlashModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:border-cyan-400/40"
            title="Quản lý & tạo lệnh / tùy chỉnh"
          >
            <Slash className="h-3 w-3 text-cyan-400" />
            <span className="hidden xs:inline">Lệnh /</span>
          </button>

          {/* Agent Memories Modal Trigger */}
          <button
            type="button"
            onClick={() => setIsMemoryModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:border-purple-400/40"
            title="Mở Bộ nhớ AI (Memories)"
          >
            <Brain className="h-3.5 w-3.5 text-purple-400" />
            <span>Bộ nhớ AI</span>
            {memories.length > 0 && (
              <span className="rounded-full bg-purple-500/25 px-1.5 py-0 text-[10px] text-purple-200">
                {memories.length}
              </span>
            )}
          </button>

          {/* Conversation Export Dropdown */}
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:border-emerald-400/40"
              title="Xuất hội thoại hiện tại"
            >
              <Download className="h-3.5 w-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Xuất hội thoại</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>

            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50">
                <button
                  type="button"
                  onClick={() => handleExportConversation('md')}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-white/10"
                >
                  <FileText className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Tải Markdown (.md)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportConversation('html')}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs text-slate-200 transition hover:bg-white/10"
                >
                  <Globe className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Tải trang HTML (.html)</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CONVERSATION CANVAS / EMPTY STATE GREETING                     */}
      {/* ============================================================== */}
      <div className="flex-1 overflow-x-hidden overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        {conversationRuns.length === 0 ? (
          /* ========================================================== */
          /* EMPTY STATE: 1:1 CENTERED HANDWRITING GREETING (TAWA MALI) */
          /* ========================================================== */
          <div className="mx-auto flex min-h-[38vh] sm:min-h-[52vh] max-w-3xl flex-col items-center justify-center px-1 text-center animate-in fade-in zoom-in-95 duration-500">
            <h1 className="agy-mali-greeting text-2xl font-medium leading-snug tracking-wide text-white drop-shadow-[0_2px_24px_rgba(183,164,255,0.7)] sm:text-4xl md:text-5xl">
              {greetingText || 'Tawa đã sẵn sàng rồi, hôm nay sensei muốn code gì nào'}
            </h1>

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
                isSpeaking={speakingRunId === run.id}
                onToggleSpeak={handleToggleSpeak}
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
      {/* COMPOSER STACK: QUEUED MESSAGES + SLASH PALETTE + COMPOSER     */}
      {/* ============================================================== */}
      <div className="relative z-20 shrink-0 px-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-1 sm:px-8 sm:pb-4">
        {/* Queued Next-Turn Messages Card */}
        {queuedMessages.length > 0 && (
          <div className="mx-auto mb-2 max-w-4xl rounded-2xl border border-amber-400/30 bg-[#10162b]/95 p-2.5 shadow-xl backdrop-blur-xl">
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                <ListOrdered className="h-3.5 w-3.5" />
                <span>Hàng đợi tin nhắn (Queued · {queuedMessages.length})</span>
              </div>
              <span className="text-[10px] text-slate-400">
                Tự gửi lượt kế tiếp khi Agent hoàn tất
              </span>
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto">
              {queuedMessages.map((q, idx) => (
                <div
                  key={q.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/30 px-2.5 py-1.5 text-xs"
                >
                  <div className="min-w-0 flex-1 flex items-center gap-2">
                    <span className="shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-mono font-bold text-amber-300">
                      #{idx + 1}
                    </span>
                    <span className="truncate text-slate-200">{q.prompt}</span>
                    <span className="hidden sm:inline shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-400">
                      {getEngineLabel(q.engineMode)}
                    </span>
                    {q.attachments.length > 0 && (
                      <span className="shrink-0 text-[10px] text-cyan-300">
                        +{q.attachments.length} tệp
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setQueuedMessages((prev) => prev.filter((item) => item.id !== q.id))
                    }
                    className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                    title="Xóa khỏi hàng đợi"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div
          className={cn(
            'u452-composer-shell relative mx-auto max-w-4xl',
            (isRunning || submitting) && 'is-gen'
          )}
        >
          {/* Floating Slash Command Palette (/) */}
          {slashMenuOpen && (
            <div
              className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl border border-cyan-500/30 bg-[#0d1324]/95 p-2 shadow-2xl backdrop-blur-2xl z-50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1.5 flex items-center justify-between border-b border-white/10 px-2 pb-1.5">
                <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                  <Slash className="h-3.5 w-3.5" />
                  Lệnh nhanh ({filteredSlashCommands.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSlashPaletteDismissed(true);
                    setIsCustomSlashModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
                >
                  <Plus className="h-3 w-3" />
                  <span>+ Tạo lệnh `/`</span>
                </button>
              </div>

              {filteredSlashCommands.length === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-slate-400">
                  Không tìm thấy lệnh khớp với <code className="text-cyan-300">{slashQuery}</code>.
                  Bạn có thể bấm <strong>+ Tạo lệnh `/`</strong> để thêm mới.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {filteredSlashCommands.map((cmd, idx) => {
                    const active = idx === slashSelectedIndex;
                    return (
                      <button
                        key={cmd.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySlashCommand(cmd)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition',
                          active
                            ? 'bg-cyan-500/20 text-white border border-cyan-400/40'
                            : 'text-slate-300 hover:bg-white/10 border border-transparent'
                        )}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-300">
                              {cmd.command}
                            </span>
                            <span className="truncate text-xs font-semibold">{cmd.label}</span>
                            {cmd.custom && (
                              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-300">
                                Tùy chỉnh
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[11px] text-slate-400">{cmd.description}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-500">Enter ↵</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Lucian #452 Conic-Gradient Orbiting Glow while Generating */}
          <i className="u452-glow" aria-hidden="true" />
          {/* Double Border Frame Outer (Styled by Theme Customizer) */}
          <div className="agy-composer-frame-outer shadow-2xl">
            {/* Inner Composer Card */}
            <div className="agy-composer-frame-inner surface-composer-card p-2.5 sm:p-3.5">
              {/* TOP ROW: Workspace, Branch & Live Dictation Indicator */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 pb-2 text-[11px] font-semibold text-slate-300">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  {/* Project Selector Trigger */}
                  <div className="relative max-w-full" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setProjectMenuOpen((o) => !o)}
                      className="flex max-w-full items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 sm:px-2.5 py-1 text-slate-200 hover:bg-white/10 hover:border-white/20 transition"
                    >
                      <FolderGit2 className="h-3 w-3 shrink-0 text-cyan-400" />
                      <span className="max-w-[120px] sm:max-w-[200px] truncate">
                        {selectedProject?.name || 'No Project'}
                      </span>
                      <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
                    </button>

                    {projectMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50">
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
                            {p.id === selectedProject?.id && (
                              <Check className="h-3 w-3 text-cyan-400" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Branch Pill */}
                  <span className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                    <GitBranch className="h-3 w-3 text-emerald-400" />
                    <span>{selectedProject?.git_branch || 'main'}</span>
                  </span>

                  {/* Environment Pill */}
                  <span className="hidden sm:flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-slate-300">
                    <Zap className="h-3 w-3 text-amber-400" />
                    <span>Local Checkout</span>
                  </span>
                </div>

                {isDictating && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-rose-200 animate-pulse">
                    <span className="h-2 w-2 rounded-full bg-rose-400" />
                    <span className="max-w-[180px] truncate">
                      {interimTranscript || `Đang nghe (${dictationLang})...`}
                    </span>
                  </span>
                )}
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
                  placeholder={
                    isRunning
                      ? 'Agent đang chạy — nhập tiếp để xếp vào Hàng đợi tin nhắn...'
                      : 'Nhập câu lệnh, gõ / để mở lệnh nhanh... (Tab nhận gợi ý · Enter để gửi)'
                  }
                  disabled={submitting}
                />
              </div>

              {/* BOTTOM TOOLBAR ROW */}
              <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 border-t border-white/10 pt-2">
                {/* Left: Multi-Agent Selector, Model Selector, Action Mode */}
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                  {/* Multi-Agent Engine Selector */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setAgentMenuOpen((o) => !o)}
                      className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/20"
                      title="Chọn AI Agent Engine"
                    >
                      <Bot className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                      <span className="max-w-[92px] sm:max-w-none truncate">
                        {currentEngineMeta.shortLabel}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                    </button>

                    {agentMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-[#0f1424]/95 p-1.5 shadow-2xl backdrop-blur-2xl z-50">
                        <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Chọn AI Agent / CLI Runner
                        </div>
                        <div className="space-y-1">
                          {ENGINE_OPTIONS.map((opt) => {
                            const selected = opt.id === engineMode;
                            const cliInfo = getAgentInstallInfo(opt);
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => {
                                  setEngineMode(opt.id);
                                  setAgentMenuOpen(false);
                                }}
                                className={cn(
                                  'flex w-full items-start justify-between gap-2 rounded-xl px-2.5 py-2 text-left transition',
                                  selected
                                    ? 'bg-cyan-500/20 text-white border border-cyan-400/40'
                                    : 'text-slate-300 hover:bg-white/10 border border-transparent'
                                )}
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-semibold">{opt.label}</span>
                                    {cliInfo && (
                                      <span
                                        className={cn(
                                          'rounded-full px-1.5 py-0 text-[9px] font-semibold',
                                          cliInfo.installed
                                            ? 'bg-emerald-500/20 text-emerald-300'
                                            : 'bg-slate-700/70 text-slate-400'
                                        )}
                                      >
                                        {cliInfo.installed
                                          ? cliInfo.version
                                            ? `Đã cài (${cliInfo.version})`
                                            : 'Đã cài'
                                          : 'Chưa cài'}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[10px] text-slate-400 leading-snug">
                                    {opt.description}
                                  </p>
                                </div>
                                {selected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Model Selector Pill */}
                  <button
                    type="button"
                    onClick={() => setIsModelModalOpen(true)}
                    className="flex min-w-0 items-center gap-1 sm:gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:border-cyan-400/50"
                  >
                    <span className="shrink-0 text-cyan-400 font-bold">+</span>
                    <span className="max-w-[96px] sm:max-w-none truncate">{modelDisplayName}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                  </button>

                  {/* Mode Pill (Turbo / Review / Research) */}
                  <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setModeMenuOpen((o) => !o)}
                      className="flex items-center gap-1 sm:gap-1.5 rounded-lg border border-white/15 bg-white/5 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                      <Zap className="h-3 w-3 shrink-0 text-amber-400" />
                      <span className="hidden xs:inline sm:inline">
                        {selectedActionMode === 'run_agent'
                          ? 'Turbo'
                          : selectedActionMode === 'code_review'
                            ? 'Review'
                            : 'Research'}
                      </span>
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
                    </button>

                    {modeMenuOpen && (
                      <div className="absolute bottom-full left-0 mb-2 w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActionMode('run_agent');
                            setModeMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Zap className="h-3.5 w-3.5 text-amber-400" />
                          <span>⚡ Turbo (Chạy Agent)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActionMode('code_review');
                            setModeMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Code2 className="h-3.5 w-3.5 text-purple-400" />
                          <span>Soát lỗi mã nguồn</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedActionMode('deep_research');
                            setModeMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left text-slate-200 hover:bg-white/10"
                        >
                          <Brain className="h-3.5 w-3.5 text-cyan-400" />
                          <span>Nghiên cứu chuyên sâu</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right: Attachment, Dictation Mic (+Lang), Tawa Voice, Queue / Send-Stop */}
                <div className="flex items-center gap-1.5 sm:gap-2">
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

                  {/* Voice Dictation Language Toggle + Mic */}
                  <div className="flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDictationLang((l) => (l === 'vi-VN' ? 'en-US' : 'vi-VN'))
                      }
                      className="rounded px-1.5 py-0.5 text-[10px] font-bold text-slate-300 transition hover:bg-white/10 hover:text-white"
                      title="Đổi ngôn ngữ nhận diện giọng nói (VI / EN)"
                    >
                      {dictationLang === 'vi-VN' ? 'VI' : 'EN'}
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleDictation}
                      className={cn(
                        'rounded-md p-1 transition',
                        isDictating
                          ? 'bg-rose-500/25 text-rose-300 animate-pulse'
                          : 'text-slate-400 hover:bg-white/10 hover:text-cyan-300'
                      )}
                      title={
                        isDictating
                          ? 'Dừng nhận diện giọng nói'
                          : `Đọc lệnh bằng giọng nói (${dictationLang})`
                      }
                    >
                      {isDictating ? (
                        <MicOff className="h-3.5 w-3.5" />
                      ) : (
                        <Mic className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Tawa Voice Button */}
                  <button
                    type="button"
                    onClick={() => playTaskVoice(true)}
                    className="rounded-lg p-1.5 text-pink-400 transition hover:bg-white/10 hover:text-pink-300"
                    title="Phát giọng Tawa"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>

                  {/* Explicit Queue Button when Agent is already running */}
                  {isRunning && (promptText.trim() || attachments.length > 0) && (
                    <button
                      type="button"
                      onClick={enqueueCurrentPrompt}
                      className="inline-flex items-center gap-1 rounded-lg border border-amber-400/40 bg-amber-500/20 px-2.5 py-1.5 text-[11px] font-bold text-amber-200 transition hover:bg-amber-500/30"
                      title="Xếp tin nhắn vào hàng đợi (gửi ngay khi lượt hiện tại xong)"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      <span>Xếp hàng</span>
                    </button>
                  )}

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

      {/* ============================================================== */}
      {/* CUSTOM SLASH COMMANDS MODAL (+ Tạo lệnh /)                     */}
      {/* ============================================================== */}
      {isCustomSlashModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setIsCustomSlashModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-[#0f1629] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Slash className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white">Tạo & Quản lý Lệnh nhanh `/`</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCustomSlashModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomSlashCommand} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                    Tên lệnh
                  </label>
                  <input
                    type="text"
                    value={newSlashCommand}
                    onChange={(e) => setNewSlashCommand(e.target.value)}
                    placeholder="/deploy"
                    className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base sm:text-xs font-mono text-white outline-none focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                    Nhãn hiển thị
                  </label>
                  <input
                    type="text"
                    value={newSlashLabel}
                    onChange={(e) => setNewSlashLabel(e.target.value)}
                    placeholder="Kiểm tra & Deploy"
                    className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                  Nội dung Prompt mẫu
                </label>
                <textarea
                  rows={3}
                  value={newSlashTemplate}
                  onChange={(e) => setNewSlashTemplate(e.target.value)}
                  placeholder="Kiểm tra build, chạy test và tóm tắt các bước cần deploy..."
                  className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Lưu lệnh `/`</span>
                </button>
              </div>
            </form>

            <div className="mt-5 border-t border-white/10 pt-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Lệnh tùy chỉnh đã lưu ({customSlashCommands.length})
              </p>
              {customSlashCommands.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  Chưa có lệnh tùy chỉnh nào. Hãy tạo lệnh đầu tiên ở trên!
                </p>
              ) : (
                <div className="max-h-44 space-y-1.5 overflow-y-auto">
                  {customSlashCommands.map((cmd) => (
                    <div
                      key={cmd.id}
                      className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-black/30 p-2.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-cyan-300">{cmd.command}</span>
                          <span className="truncate font-semibold text-slate-200">{cmd.label}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400">
                          {cmd.template}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCustomSlashCommand(cmd.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                        title="Xóa lệnh"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* AGENT MEMORY DRAWER / MODAL (Bộ nhớ AI)                        */}
      {/* ============================================================== */}
      {isMemoryModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setIsMemoryModalOpen(false)}
        >
          <div
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0f1629] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-purple-400" />
                <div>
                  <h2 className="text-sm font-bold text-white">Bộ nhớ AI (Agent Memories)</h2>
                  <p className="text-[11px] text-slate-400">
                    Ngữ cảnh tự động nạp cho Agent theo dự án hoặc toàn cục
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMemoryModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              {/* Add Memory Form */}
              <form
                onSubmit={handleSaveMemory}
                className="space-y-3 rounded-xl border border-white/10 bg-black/25 p-3.5"
              >
                <div className="grid gap-2.5 sm:grid-cols-3">
                  <input
                    type="text"
                    value={memoryTitle}
                    onChange={(e) => setMemoryTitle(e.target.value)}
                    placeholder="Tiêu đề (VD: Quy ước Git & Build)"
                    className="sm:col-span-1 rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-purple-400"
                  />
                  <select
                    value={memoryScope}
                    onChange={(e) => setMemoryScope(e.target.value as 'project' | 'global')}
                    className="rounded-xl border border-white/15 bg-[#0b1020] px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-purple-400"
                  >
                    <option value="project">
                      Dự án: {selectedProject?.name || 'Hiện tại'}
                    </option>
                    <option value="global">Toàn cục (Mọi dự án)</option>
                  </select>
                  <select
                    value={memoryMode}
                    onChange={(e) => setMemoryMode(e.target.value as 'always' | 'passive')}
                    className="rounded-xl border border-white/15 bg-[#0b1020] px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-purple-400"
                  >
                    <option value="always">Luôn nạp (Always)</option>
                    <option value="passive">Theo từ khóa (Passive)</option>
                  </select>
                </div>

                <textarea
                  rows={2}
                  value={memoryContent}
                  onChange={(e) => setMemoryContent(e.target.value)}
                  placeholder="Nội dung ghi nhớ cho Agent (ví dụ: Luôn chạy npm.cmd trên Windows, giữ Tailwind v4...)"
                  className="w-full rounded-xl border border-white/15 bg-black/35 px-3 py-2 text-base sm:text-xs text-white outline-none focus:border-purple-400"
                />

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingMemory}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-purple-500 px-4 py-1.5 text-xs font-bold text-white transition hover:bg-purple-400 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{savingMemory ? 'Đang lưu...' : 'Thêm ghi nhớ'}</span>
                  </button>
                </div>
              </form>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5">
                {(['all', 'project', 'global'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setMemoryFilter(tab)}
                    className={cn(
                      'rounded-lg px-3 py-1 text-xs font-semibold transition',
                      memoryFilter === tab
                        ? 'bg-purple-500/25 text-purple-200 border border-purple-400/40'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200 border border-transparent'
                    )}
                  >
                    {tab === 'all'
                      ? `Tất cả (${memories.length})`
                      : tab === 'project'
                        ? 'Dự án'
                        : 'Toàn cục'}
                  </button>
                ))}
              </div>

              {/* Memories List */}
              {loadingMemories ? (
                <p className="py-6 text-center text-xs text-slate-400">Đang tải Bộ nhớ AI...</p>
              ) : filteredMemories.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-500 italic">
                  Chưa có ghi nhớ nào trong mục này.
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredMemories.map((mem) => (
                    <div
                      key={mem.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-xs font-bold text-white">{mem.title}</span>
                          <span
                            className={cn(
                              'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                              mem.scope === 'global'
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            )}
                          >
                            {mem.scope === 'global' ? 'Global' : 'Project'}
                          </span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-300">
                            {mem.mode === 'always' ? 'Always' : 'Passive'}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            • {formatRelativeTime(mem.updated_at)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300">
                          {mem.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/20 hover:text-rose-300"
                        title="Xóa ghi nhớ"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
