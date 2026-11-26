import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CornerDownLeft,
  Loader2,
  Plus,
  Square,
  Terminal,
  Trash2,
  X,
} from 'lucide-react';
import { ideApi, type TerminalSession } from '../../lib/ideApi';
import { cn } from '../../lib/utils';
import type { Project } from '../../types/api';

interface TerminalPaneProps {
  project: Project;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

const VIRTUAL_KEY_ROW_1 = [
  { label: 'Ctrl+C', action: 'interrupt' as const },
  { label: 'Clear', action: 'clear' as const },
  { label: 'pwd', action: 'cmd' as const, command: 'pwd' },
  { label: 'ls', action: 'cmd' as const, command: 'ls' },
];

const VIRTUAL_KEY_ROW_2 = [
  { label: 'git status', action: 'cmd' as const, command: 'git status' },
  { label: 'git diff', action: 'cmd' as const, command: 'git diff' },
  { label: 'pytest', action: 'cmd' as const, command: 'pytest' },
  {
    label: 'npm.cmd run build',
    action: 'cmd' as const,
    command: 'npm.cmd run build',
  },
];

export function TerminalPane({ project, onNotify }: TerminalPaneProps) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [buffers, setBuffers] = useState<Record<string, string>>({});
  const [clearedOffsets, setClearedOffsets] = useState<Record<string, number>>({});
  const [commandInput, setCommandInput] = useState('');
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [loadingInit, setLoadingInit] = useState(false);

  const logRef = useRef<HTMLPreElement>(null);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId]
  );

  const fetchSessionDetail = useCallback(async (sid: string) => {
    try {
      const detail = await ideApi.getTerminalSession(sid);
      setSessions((prev) =>
        prev.map((s) => (s.id === sid ? detail.session : s))
      );
      setBuffers((prev) => ({ ...prev, [sid]: detail.buffer || '' }));
    } catch {
      // Ignore transient poll errors
    }
  }, []);

  const createNewSession = useCallback(
    async (projId: string, title?: string) => {
      try {
        const created = await ideApi.createTerminalSession(projId, title);
        setSessions((prev) => [...prev, created.session]);
        setBuffers((prev) => ({
          ...prev,
          [created.session.id]: created.buffer || '',
        }));
        setActiveId(created.session.id);
        return created.session;
      } catch (err) {
        onNotify(
          err instanceof Error ? err.message : 'Không thể tạo phiên terminal',
          'error'
        );
        return null;
      }
    },
    [onNotify]
  );

  // Load existing sessions or bootstrap one for active project
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      setLoadingInit(true);
      try {
        const list = await ideApi.listTerminalSessions();
        if (cancelled) return;
        setSessions(list);
        const matching = list.find((s) => s.project_id === project.id);
        if (matching) {
          setActiveId(matching.id);
          fetchSessionDetail(matching.id);
        } else if (list.length > 0) {
          setActiveId(list[0].id);
          fetchSessionDetail(list[0].id);
        } else {
          await createNewSession(project.id, `${project.name} #1`);
        }
      } catch (err) {
        if (!cancelled) {
          onNotify(
            err instanceof Error
              ? err.message
              : 'Không thể tải danh sách terminal',
            'error'
          );
        }
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    };
    init();
    return () => {
      cancelled = true;
    };
  }, [project.id, project.name, createNewSession, fetchSessionDetail, onNotify]);

  // Poll every 1.2s while active session is running
  useEffect(() => {
    if (!activeId || !activeSession?.running) return;
    const timer = window.setInterval(() => {
      fetchSessionDetail(activeId);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [activeId, activeSession?.running, fetchSessionDetail]);

  const rawOutput = activeId ? buffers[activeId] || '' : '';
  const clearOffset = activeId ? clearedOffsets[activeId] || 0 : 0;
  const visibleOutput =
    clearOffset > 0 && rawOutput.length >= clearOffset
      ? rawOutput.slice(clearOffset)
      : rawOutput;

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [visibleOutput, activeId]);

  const runCommand = async (cmdText: string) => {
    const clean = cmdText.trim();
    if (!clean) return;
    let targetId = activeId;
    if (!targetId) {
      const created = await createNewSession(project.id, `${project.name} #1`);
      if (!created) return;
      targetId = created.id;
    }

    setCmdHistory((prev) => [clean, ...prev.slice(0, 49)]);
    setHistoryIdx(-1);

    try {
      await ideApi.execTerminalCommand(targetId, clean);
      setSessions((prev) =>
        prev.map((s) => (s.id === targetId ? { ...s, running: true } : s))
      );
      await fetchSessionDetail(targetId);
      // Schedule short follow-up fetch so quick commands reflect immediately
      window.setTimeout(() => {
        if (targetId) fetchSessionDetail(targetId);
      }, 350);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể thực thi lệnh',
        'error'
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput;
    setCommandInput('');
    await runCommand(cmd);
  };

  const handleInterrupt = async () => {
    if (!activeId) return;
    try {
      await ideApi.interruptTerminalSession(activeId);
      onNotify('Đã gửi tín hiệu ngắt (Ctrl+C)', 'info');
      await fetchSessionDetail(activeId);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể ngắt lệnh',
        'error'
      );
    }
  };

  const handleCloseSession = async (sid: string) => {
    try {
      await ideApi.deleteTerminalSession(sid);
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== sid);
        if (activeId === sid) {
          const fallback = next[0] || null;
          setActiveId(fallback ? fallback.id : null);
          if (fallback) fetchSessionDetail(fallback.id);
        }
        return next;
      });
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể đóng phiên terminal',
        'error'
      );
    }
  };

  const handleVirtualKey = (
    key: (typeof VIRTUAL_KEY_ROW_1)[number] | (typeof VIRTUAL_KEY_ROW_2)[number]
  ) => {
    if (key.action === 'interrupt') {
      handleInterrupt();
      return;
    }
    if (key.action === 'clear') {
      if (activeId) {
        setClearedOffsets((prev) => ({
          ...prev,
          [activeId]: (buffers[activeId] || '').length,
        }));
      }
      return;
    }
    if (key.command) {
      if (activeSession?.running) {
        setCommandInput(key.command);
      } else {
        runCommand(key.command);
      }
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111827]">
      {/* Multi-session Tab Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/80 px-3 py-2 dark:border-slate-800 dark:bg-[#0b101b]">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {sessions.map((s) => {
            const active = s.id === activeId;
            return (
              <div
                key={s.id}
                className={cn(
                  'flex shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs transition',
                  active
                    ? 'border-cyan-500/40 bg-cyan-500/15 font-semibold text-cyan-700 dark:text-cyan-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-300'
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveId(s.id);
                    fetchSessionDetail(s.id);
                  }}
                  className="flex items-center gap-1.5"
                >
                  {s.running ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                  ) : (
                    <Terminal className="h-3.5 w-3.5" />
                  )}
                  <span className="max-w-[140px] truncate">{s.title}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleCloseSession(s.id)}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-rose-500/15 hover:text-rose-500"
                  title="Đóng phiên"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            );
          })}

          <button
            type="button"
            onClick={() =>
              createNewSession(
                project.id,
                `${project.name} #${sessions.length + 1}`
              )
            }
            className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-xl border border-dashed border-slate-300 px-2.5 text-xs font-semibold text-slate-600 hover:border-cyan-500 hover:text-cyan-600 dark:border-slate-700 dark:text-slate-300 dark:hover:text-cyan-300"
          >
            <Plus className="h-3.5 w-3.5" />
            Phiên mới
          </button>
        </div>

        {activeSession && (
          <span className="max-w-full truncate rounded-lg bg-slate-200/70 px-2 py-1 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            cwd: {activeSession.cwd}
          </span>
        )}
      </div>

      {/* Dark Terminal Output */}
      <pre
        ref={logRef}
        className="h-[340px] overflow-auto bg-[#060911] p-3.5 font-mono text-xs leading-5 whitespace-pre-wrap break-words text-emerald-300"
      >
        {loadingInit && !activeSession
          ? 'Đang khởi tạo phiên shell trên PC...'
          : visibleOutput ||
            `# Sẵn sàng thực thi lệnh trong ${activeSession?.cwd || project.path}\n`}
      </pre>

      {/* Command Input */}
      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-slate-800 bg-[#0b101b] px-3 py-2.5"
      >
        <span className="font-mono text-sm font-bold text-cyan-400">&gt;</span>
        <input
          type="text"
          value={commandInput}
          onChange={(e) => setCommandInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp' && cmdHistory.length > 0) {
              e.preventDefault();
              const nextIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
              setHistoryIdx(nextIdx);
              setCommandInput(cmdHistory[nextIdx]);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (historyIdx <= 0) {
                setHistoryIdx(-1);
                setCommandInput('');
              } else {
                const nextIdx = historyIdx - 1;
                setHistoryIdx(nextIdx);
                setCommandInput(cmdHistory[nextIdx]);
              }
            }
          }}
          placeholder="Nhập lệnh PowerShell / Shell..."
          className="min-h-[40px] min-w-0 flex-1 bg-transparent font-mono text-sm text-white placeholder-slate-500 outline-none"
        />
        {activeSession?.running && (
          <button
            type="button"
            onClick={handleInterrupt}
            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-rose-500/20 px-3 text-xs font-semibold text-rose-300 hover:bg-rose-500/30"
          >
            <Square className="h-3.5 w-3.5" />
            Ngắt
          </button>
        )}
        <button
          type="submit"
          disabled={!commandInput.trim()}
          className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-cyan-500 px-3.5 text-xs font-bold text-slate-950 hover:bg-cyan-400 disabled:opacity-40"
        >
          <CornerDownLeft className="h-3.5 w-3.5" />
          Chạy
        </button>
      </form>

      {/* 2-Row Mobile Virtual Key Bar */}
      <div className="space-y-1.5 border-t border-slate-800 bg-[#090d16] p-2.5">
        <div className="grid grid-cols-4 gap-1.5">
          {VIRTUAL_KEY_ROW_1.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => handleVirtualKey(k)}
              className={cn(
                'min-h-[38px] rounded-xl border px-2 font-mono text-xs font-semibold transition active:scale-95',
                k.action === 'interrupt'
                  ? 'border-rose-500/40 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25'
                  : k.action === 'clear'
                    ? 'border-slate-700 bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                    : 'border-slate-700 bg-slate-900 text-cyan-300 hover:border-cyan-500/40'
              )}
            >
              {k.action === 'clear' ? (
                <span className="inline-flex items-center gap-1">
                  <Trash2 className="h-3 w-3" />
                  {k.label}
                </span>
              ) : (
                k.label
              )}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {VIRTUAL_KEY_ROW_2.map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => handleVirtualKey(k)}
              className="min-h-[38px] truncate rounded-xl border border-slate-700 bg-slate-900 px-2 font-mono text-[11px] font-semibold text-indigo-300 transition hover:border-indigo-500/40 active:scale-95"
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
