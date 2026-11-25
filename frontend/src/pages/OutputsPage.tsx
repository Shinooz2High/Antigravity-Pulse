import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bot,
  Brain,
  ChevronDown,
  ChevronRight,
  Cpu,
  FileCode2,
  FileImage,
  FileText,
  FolderOpen,
  Layers,
  Maximize2,
  RefreshCw,
  Search,
  Terminal,
  User,
} from 'lucide-react';
import { api, withToken } from '../lib/api';
import {
  cn,
  formatBytes,
  formatClockTime,
  formatRelativeTime,
  formatTokens,
  getCategoryLabel,
  getSessionStatusInfo,
} from '../lib/utils';
import type {
  AntigravitySessionSummary,
  ArtifactCategory,
  ArtifactItem,
  ArtifactModalTarget,
  SessionDetailResponse,
  TranscriptStep,
} from '../types/api';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface OutputsPageProps {
  sessions: AntigravitySessionSummary[];
  brainDir: string;
  initialArtifacts: ArtifactItem[];
  selectedSessionId: string | null;
  sessionRefreshTick: number;
  artifactRefreshTick: number;
  isDark: boolean;
  onSelectSession: (sessionId: string | null) => void;
  onRefreshSessions: () => Promise<void>;
  onOpenArtifact: (target: ArtifactModalTarget) => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

type OutputsSubTab = 'sessions' | 'artifacts';
type GalleryFilter = 'all' | 'markdown' | 'image' | 'code' | 'pdf_doc';

const GALLERY_FILTERS: Array<{ key: GalleryFilter; label: string }> = [
  { key: 'all', label: 'Tất cả' },
  { key: 'markdown', label: 'Báo cáo MD' },
  { key: 'image', label: 'Hình ảnh' },
  { key: 'code', label: 'Mã nguồn' },
  { key: 'pdf_doc', label: 'PDF & Tài liệu' },
];

function getSourceLabel(source: ArtifactItem['source']): string {
  switch (source) {
    case 'antigravity_brain':
      return 'Brain PC';
    case 'prompt_run':
      return 'Prompt Run';
    case 'project_workspace':
      return 'Workspace';
  }
}

export function OutputsPage({
  sessions,
  brainDir,
  initialArtifacts,
  selectedSessionId,
  sessionRefreshTick,
  artifactRefreshTick,
  isDark,
  onSelectSession,
  onRefreshSessions,
  onOpenArtifact,
  onNotify,
}: OutputsPageProps) {
  const [subTab, setSubTab] = useState<OutputsSubTab>('sessions');

  // Session detail state
  const [detail, setDetail] = useState<SessionDetailResponse | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [openThinkingSteps, setOpenThinkingSteps] = useState<Record<number, boolean>>({});
  const [loadingFullStep, setLoadingFullStep] = useState<number | null>(null);

  // Gallery state
  const [galleryFilter, setGalleryFilter] = useState<GalleryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [galleryArtifacts, setGalleryArtifacts] = useState<ArtifactItem[]>(initialArtifacts);
  const [loadingGallery, setLoadingGallery] = useState(false);

  // If parent sets a selectedSessionId (e.g. from Dashboard), switch to sessions subTab
  useEffect(() => {
    if (selectedSessionId) {
      setSubTab('sessions');
    }
  }, [selectedSessionId]);

  // Load session detail
  const loadSessionDetail = async (convId: string, silent = false) => {
    if (!silent) setLoadingDetail(true);
    setDetailError(null);
    try {
      const res = await api.getSessionDetail(convId);
      setDetail(res);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Không thể tải chi tiết phiên');
    } finally {
      if (!silent) setLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    setOpenThinkingSteps({});
    loadSessionDetail(selectedSessionId);
  }, [selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId && sessionRefreshTick > 0) {
      loadSessionDetail(selectedSessionId, true);
    }
  }, [sessionRefreshTick]);

  // Load gallery artifacts via backend search/filter
  const loadGallery = async (filter: GalleryFilter, q: string) => {
    setLoadingGallery(true);
    try {
      const apiCat: ArtifactCategory | '' =
        filter === 'markdown' || filter === 'image' || filter === 'code' ? filter : '';
      const list = await api.getArtifacts(apiCat, q, 120);
      if (filter === 'pdf_doc') {
        setGalleryArtifacts(
          list.filter(
            (a) => a.category === 'pdf' || a.category === 'document' || a.category === 'html'
          )
        );
      } else {
        setGalleryArtifacts(list);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải kho kết quả',
        'error'
      );
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    if (subTab !== 'artifacts') return;
    const timer = window.setTimeout(() => {
      loadGallery(galleryFilter, searchQuery);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [subTab, galleryFilter, searchQuery, artifactRefreshTick]);

  const handleLoadFullStep = async (stepIndex: number) => {
    if (!selectedSessionId || loadingFullStep !== null) return;
    setLoadingFullStep(stepIndex);
    try {
      const fullStep: TranscriptStep = await api.getSessionStepFull(selectedSessionId, stepIndex);
      setDetail((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          steps: prev.steps.map((s) => (s.step_index === stepIndex ? fullStep : s)),
        };
      });
      onNotify('Đã tải nội dung đầy đủ của bước', 'success');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải bản đầy đủ',
        'error'
      );
    } finally {
      setLoadingFullStep(null);
    }
  };

  const toggleThinking = (stepIndex: number) => {
    setOpenThinkingSteps((prev) => ({ ...prev, [stepIndex]: !prev[stepIndex] }));
  };

  const visibleSteps = useMemo(() => {
    if (!detail?.steps) return [];
    return detail.steps.filter(
      (s) => s.content?.trim() || s.thinking?.trim() || (s.tool_calls && s.tool_calls.length > 0)
    );
  }, [detail?.steps]);

  return (
    <div className="space-y-4">
      {/* Sub-tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 sm:w-auto dark:border-slate-800 dark:bg-[#111827]">
          <button
            type="button"
            onClick={() => setSubTab('sessions')}
            className={cn(
              'min-h-[42px] flex-1 rounded-xl px-4 text-xs font-semibold transition sm:flex-initial',
              subTab === 'sessions'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            )}
          >
            Phiên Antigravity trên PC ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('artifacts')}
            className={cn(
              'min-h-[42px] flex-1 rounded-xl px-4 text-xs font-semibold transition sm:flex-initial',
              subTab === 'artifacts'
                ? 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white shadow'
                : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            )}
          >
            Kho Kết quả & Artifacts
          </button>
        </div>

        <button
          type="button"
          onClick={() => {
            if (subTab === 'sessions') {
              onRefreshSessions();
              if (selectedSessionId) loadSessionDetail(selectedSessionId);
            } else {
              loadGallery(galleryFilter, searchQuery);
            }
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Làm mới
        </button>
      </div>

      {/* TAB 1: Antigravity PC Sessions */}
      {subTab === 'sessions' && (
        <>
          {selectedSessionId ? (
            <div className="space-y-4">
              {/* Session Detail Bar */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onSelectSession(null)}
                  className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Tất cả phiên
                </button>
              </div>

              {loadingDetail && !detail ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-[#111827]">
                  Đang đọc nhật ký phiên Antigravity...
                </div>
              ) : detailError ? (
                <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-xs text-rose-600 dark:text-rose-300">
                  {detailError}
                </div>
              ) : detail ? (
                <>
                  {/* Summary Card */}
                  <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white">
                          {detail.summary.title}
                        </h3>
                        <p className="mt-1 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          ID: {detail.summary.id}
                        </p>
                      </div>
                      {(() => {
                        const st = getSessionStatusInfo(detail.summary.latest_status);
                        return (
                          <span
                            className={cn(
                              'rounded-full px-2.5 py-0.5 text-xs font-semibold',
                              st.tone === 'cyan' &&
                                'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
                              st.tone === 'emerald' &&
                                'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                              st.tone === 'rose' &&
                                'bg-rose-500/15 text-rose-600 dark:text-rose-300',
                              st.tone === 'slate' &&
                                'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            )}
                          >
                            {st.label}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600 dark:text-slate-300">
                      {detail.summary.model && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                          <Cpu className="h-3.5 w-3.5 text-cyan-500" />
                          {detail.summary.model}
                        </span>
                      )}
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        {detail.summary.step_count} bước
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        {formatTokens(detail.summary.total_input_tokens)} vào /{' '}
                        {formatTokens(detail.summary.total_output_tokens)} ra
                      </span>
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 dark:bg-slate-800">
                        Cập nhật {formatRelativeTime(detail.summary.updated_at)}
                      </span>
                    </div>

                    {/* Session Artifacts Strip */}
                    {detail.artifacts.length > 0 && (
                      <div className="mt-4 border-t border-slate-200 pt-3 dark:border-slate-800">
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Artifacts trong phiên ({detail.artifacts.length})
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {detail.artifacts.map((art) => (
                            <button
                              key={art.id}
                              type="button"
                              onClick={() => onOpenArtifact({ kind: 'artifact', artifact: art })}
                              className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 px-3 text-xs font-medium text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-300"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              <span>{art.name}</span>
                              <span className="text-[10px] opacity-70">{formatBytes(art.size)}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step Timeline */}
                  <div className="space-y-3">
                    {visibleSteps.map((step) => {
                      const isUser = step.type === 'USER_INPUT' || step.source.includes('USER');
                      const thinkingOpen = Boolean(openThinkingSteps[step.step_index]);

                      return (
                        <div
                          key={step.step_index}
                          className={cn(
                            'rounded-2xl border p-4 shadow-sm',
                            isUser
                              ? 'border-cyan-500/30 bg-cyan-500/5 dark:bg-cyan-950/15'
                              : 'border-slate-200/80 bg-white dark:border-slate-800 dark:bg-[#111827]'
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 pb-2 dark:border-slate-800/80">
                            <div className="flex items-center gap-2 text-xs font-semibold">
                              {isUser ? (
                                <User className="h-4 w-4 text-cyan-500" />
                              ) : (
                                <Bot className="h-4 w-4 text-indigo-400" />
                              )}
                              <span>{isUser ? 'Yêu cầu người dùng' : 'Phản hồi Antigravity'}</span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                #{step.step_index}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                              {step.model && <span>{step.model}</span>}
                              {(step.input_tokens > 0 || step.output_tokens > 0) && (
                                <span>
                                  {formatTokens(step.input_tokens + step.output_tokens)} tok
                                </span>
                              )}
                              <span>{formatClockTime(step.created_at)}</span>
                            </div>
                          </div>

                          {/* Thinking Accordion */}
                          {step.thinking && (
                            <div className="mt-3 overflow-hidden rounded-xl border border-indigo-500/25 bg-indigo-500/5">
                              <button
                                type="button"
                                onClick={() => toggleThinking(step.step_index)}
                                className="flex min-h-[40px] w-full items-center justify-between px-3 py-2 text-left text-xs font-semibold text-indigo-700 dark:text-indigo-300"
                              >
                                <span className="flex items-center gap-2">
                                  <Brain className="h-3.5 w-3.5" />
                                  Suy nghĩ (Thinking)
                                </span>
                                {thinkingOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </button>
                              {thinkingOpen && (
                                <div className="border-t border-indigo-500/20 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap text-slate-600 dark:text-slate-300">
                                  {step.thinking}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Tool Calls */}
                          {step.tool_calls && step.tool_calls.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {step.tool_calls.map((tc, i) => (
                                <span
                                  key={`${step.step_index}-${tc.name}-${i}`}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[11px] text-cyan-700 dark:border-slate-700 dark:bg-[#090d16] dark:text-cyan-300"
                                >
                                  <Terminal className="h-3 w-3" />
                                  {tc.name}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Content */}
                          {step.content && (
                            <div className="mt-3">
                              <MarkdownRenderer content={step.content} isDark={isDark} />
                            </div>
                          )}

                          {/* Load Full Untruncated Step */}
                          {step.truncated && (
                            <div className="mt-3 flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
                              <span className="text-amber-700 dark:text-amber-300">
                                Bước này bị rút gọn trong log tóm tắt.
                              </span>
                              <button
                                type="button"
                                disabled={loadingFullStep === step.step_index}
                                onClick={() => handleLoadFullStep(step.step_index)}
                                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                              >
                                <Maximize2 className="h-3.5 w-3.5" />
                                {loadingFullStep === step.step_index
                                  ? 'Đang tải...'
                                  : 'Tải đầy đủ'}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {brainDir && (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-400">
                  <FolderOpen className="h-4 w-4 shrink-0 text-cyan-500" />
                  <span className="truncate font-mono">{brainDir}</span>
                </div>
              )}

              {sessions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111827]/60 dark:text-slate-400">
                  Chưa phát hiện phiên Antigravity nào trên máy tính.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {sessions.map((sess) => {
                    const st = getSessionStatusInfo(sess.latest_status);
                    return (
                      <button
                        key={sess.id}
                        type="button"
                        onClick={() => onSelectSession(sess.id)}
                        className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-cyan-500/50 dark:border-slate-800 dark:bg-[#111827]"
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">
                              {sess.title}
                            </h3>
                            <span
                              className={cn(
                                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                                st.tone === 'cyan' &&
                                  'bg-cyan-500/15 text-cyan-600 dark:text-cyan-300',
                                st.tone === 'emerald' &&
                                  'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300',
                                st.tone === 'rose' &&
                                  'bg-rose-500/15 text-rose-600 dark:text-rose-300',
                                st.tone === 'slate' &&
                                  'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                              )}
                            >
                              {st.label}
                            </span>
                          </div>
                          {sess.preview && (
                            <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
                              {sess.preview}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          {sess.model && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">
                              {sess.model}
                            </span>
                          )}
                          <span>{sess.step_count} bước</span>
                          <span>{sess.artifact_count} artifact</span>
                          <span>
                            {formatTokens(sess.total_input_tokens + sess.total_output_tokens)} tok
                          </span>
                          <span className="ml-auto">{formatRelativeTime(sess.updated_at)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: Unified Artifacts Gallery */}
      {subTab === 'artifacts' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 dark:border-slate-800 dark:bg-[#111827]">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm báo cáo, ảnh, mã nguồn, tên phiên..."
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-base text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {GALLERY_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setGalleryFilter(f.key)}
                  className={cn(
                    'min-h-[38px] shrink-0 rounded-xl px-3.5 text-xs font-semibold transition',
                    galleryFilter === f.key
                      ? 'bg-cyan-500 text-slate-950'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingGallery && galleryArtifacts.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Đang tìm kiếm kết quả...
            </div>
          ) : galleryArtifacts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-[#111827]/60 dark:text-slate-400">
              Không tìm thấy artifact nào phù hợp.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {galleryArtifacts.map((art) => (
                <button
                  key={art.id}
                  type="button"
                  onClick={() => onOpenArtifact({ kind: 'artifact', artifact: art })}
                  className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white text-left shadow-sm transition hover:border-cyan-500/50 dark:border-slate-800 dark:bg-[#111827]"
                >
                  {art.category === 'image' ? (
                    <div className="relative h-36 w-full overflow-hidden bg-slate-100 dark:bg-[#070b12]">
                      <img
                        src={withToken(art.raw_url)}
                        alt={art.name}
                        loading="lazy"
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    </div>
                  ) : null}

                  <div className="flex flex-1 flex-col justify-between p-3.5">
                    <div className="flex items-start gap-2.5">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
                        {art.category === 'image' ? (
                          <FileImage className="h-4 w-4" />
                        ) : art.category === 'markdown' ? (
                          <FileText className="h-4 w-4" />
                        ) : art.category === 'code' ? (
                          <FileCode2 className="h-4 w-4" />
                        ) : (
                          <Layers className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {art.name}
                        </p>
                        <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {art.scope_title}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {getSourceLabel(art.source)}
                        </span>
                        <span>{getCategoryLabel(art.category)}</span>
                      </div>
                      <span>
                        {formatBytes(art.size)} • {formatRelativeTime(art.modified_at)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
