import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  DownloadCloud,
  FileDiff,
  GitBranch,
  GitCommitHorizontal,
  History,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  UploadCloud,
} from 'lucide-react';
import {
  ideApi,
  type GitCommitEntry,
  type GitStatusResponse,
} from '../../lib/ideApi';
import { cn, formatRelativeTime } from '../../lib/utils';
import type { Project } from '../../types/api';

interface GitSourceControlPaneProps {
  project: Project;
  workspaceRefreshTick: number;
  onWorkspaceMutated?: () => Promise<void> | void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export function GitSourceControlPane({
  project,
  workspaceRefreshTick,
  onWorkspaceMutated,
  onNotify,
}: GitSourceControlPaneProps) {
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [commits, setCommits] = useState<GitCommitEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [branchInput, setBranchInput] = useState('');
  const [createBranch, setCreateBranch] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const [selectedDiffTarget, setSelectedDiffTarget] = useState<{
    path?: string;
    staged: boolean;
  } | null>(null);
  const [diffText, setDiffText] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);

  const loadGitData = useCallback(async () => {
    setLoading(true);
    try {
      const [st, log] = await Promise.all([
        ideApi.getGitStatus(project.id),
        ideApi.getGitLog(project.id, 25).catch(() => [] as GitCommitEntry[]),
      ]);
      setStatus(st);
      setCommits(log);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể đọc trạng thái Git',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [project.id, onNotify]);

  useEffect(() => {
    setSelectedDiffTarget(null);
    setDiffText('');
    loadGitData();
  }, [project.id, loadGitData]);

  useEffect(() => {
    if (workspaceRefreshTick > 0) {
      loadGitData();
    }
  }, [workspaceRefreshTick, loadGitData]);

  const loadDiff = async (path?: string, staged = false) => {
    setSelectedDiffTarget({ path, staged });
    setLoadingDiff(true);
    try {
      const res = await ideApi.getGitDiff(project.id, path, staged);
      setDiffText(res.diff || '');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải Git Diff',
        'error'
      );
    } finally {
      setLoadingDiff(false);
    }
  };

  const runGitAction = async (
    key: string,
    fn: () => Promise<unknown>,
    successMsg: string,
    refreshWorkspace = false
  ) => {
    setBusyAction(key);
    try {
      await fn();
      onNotify(successMsg, 'success');
      await loadGitData();
      if (refreshWorkspace) {
        await onWorkspaceMutated?.();
      }
      if (selectedDiffTarget) {
        loadDiff(selectedDiffTarget.path, selectedDiffTarget.staged);
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Thao tác Git thất bại',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleDiscard = (paths?: string[], all = false) => {
    const label = all ? 'toàn bộ thay đổi chưa stage' : paths?.join(', ');
    if (
      !window.confirm(
        `Bạn có chắc muốn hủy bỏ (discard) ${label}? Thay đổi sẽ không thể hoàn tác trừ khi có Checkpoint.`
      )
    ) {
      return;
    }
    runGitAction(
      'discard',
      () => ideApi.discardGit(project.id, all ? { all: true } : { paths }),
      'Đã hoàn tác thay đổi',
      true
    );
  };

  const handleCommit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commitMessage.trim()) {
      onNotify('Vui lòng nhập nội dung commit', 'error');
      return;
    }
    setBusyAction('commit');
    try {
      const res = await ideApi.commitGit(project.id, {
        message: commitMessage.trim(),
      });
      setCommitMessage('');
      onNotify(
        `Đã commit ${res.hash ? `(${res.hash.slice(0, 7)})` : ''}`,
        'success'
      );
      await loadGitData();
      await onWorkspaceMutated?.();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Commit thất bại', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = branchInput.trim();
    if (!target) return;
    setBusyAction('checkout');
    try {
      const res = await ideApi.checkoutGit(project.id, target, createBranch);
      onNotify(
        res.output || `Đã chuyển sang nhánh ${res.branch || target}`,
        'success'
      );
      setBranchInput('');
      setCreateBranch(false);
      await loadGitData();
      await onWorkspaceMutated?.();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể chuyển nhánh',
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  if (loading && !status) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-10 text-center text-xs text-slate-400 dark:border-slate-800 dark:bg-[#111827]">
        Đang tải thông tin Git...
      </div>
    );
  }

  if (status && !status.is_git_repo) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-8 text-center dark:border-slate-800 dark:bg-[#111827]">
        <GitBranch className="mx-auto h-9 w-9 text-slate-400" />
        <h3 className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
          Thư mục chưa khởi tạo Git repository
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Bạn có thể dùng tab Terminal chạy <span className="font-mono">git init</span> nếu muốn theo dõi mã nguồn.
        </p>
      </div>
    );
  }

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Top Status & Remote Bar */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500/15 px-3 py-1.5 font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300">
              <GitBranch className="h-3.5 w-3.5" />
              {status?.branch || 'HEAD'}
            </span>
            {status?.tracking && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                → {status.tracking}
              </span>
            )}
            {(status?.ahead ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-lg bg-emerald-500/15 px-2 py-1 font-mono text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <ArrowUp className="h-3 w-3" />
                {status?.ahead}
              </span>
            )}
            {(status?.behind ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5 rounded-lg bg-amber-500/15 px-2 py-1 font-mono text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <ArrowDown className="h-3 w-3" />
                {status?.behind}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runGitAction(
                  'stage_all',
                  () => ideApi.stageGit(project.id, { all: true }),
                  'Đã stage tất cả thay đổi'
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Plus className="h-3.5 w-3.5" />
              Stage All
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runGitAction(
                  'pull',
                  () => ideApi.pullGit(project.id),
                  'Đã Pull từ remote',
                  true
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {busyAction === 'pull' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadCloud className="h-3.5 w-3.5" />
              )}
              Pull
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runGitAction(
                  'push',
                  () => ideApi.pushGit(project.id),
                  'Đã Push lên remote'
                )
              }
              className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-700 hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-300"
            >
              {busyAction === 'push' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UploadCloud className="h-3.5 w-3.5" />
              )}
              Push
            </button>
            <button
              type="button"
              onClick={loadGitData}
              className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              title="Làm mới Git"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* Branch Checkout / Create */}
        <form
          onSubmit={handleCheckout}
          className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-3 dark:border-slate-800"
        >
          <input
            type="text"
            value={branchInput}
            onChange={(e) => setBranchInput(e.target.value)}
            placeholder="Tên nhánh để chuyển hoặc tạo mới (VD: feat/mobile-ide)..."
            className="min-h-[40px] min-w-[200px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
          />
          <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={createBranch}
              onChange={(e) => setCreateBranch(e.target.checked)}
              className="accent-cyan-500"
            />
            Tạo nhánh mới
          </label>
          <button
            type="submit"
            disabled={!branchInput.trim() || busyAction !== null}
            className="min-h-[40px] rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-45 dark:bg-slate-700 dark:hover:bg-slate-600"
          >
            {createBranch ? 'Tạo & Checkout' : 'Checkout'}
          </button>
        </form>

        {/* Commit Composer */}
        <form onSubmit={handleCommit} className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Thông điệp commit (VD: feat: cập nhật giao diện Pocket IDE)..."
            className="min-h-[42px] min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
          />
          <button
            type="submit"
            disabled={
              !commitMessage.trim() || stagedCount === 0 || busyAction !== null
            }
            className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-xs font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-45"
          >
            {busyAction === 'commit' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Commit ({stagedCount})
          </button>
        </form>
      </section>

      {/* Changes & Unified Diff Split */}
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          {/* Staged */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Đã Stage ({stagedCount})
              </h4>
              {stagedCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    runGitAction(
                      'unstage_all',
                      () => ideApi.unstageGit(project.id, { all: true }),
                      'Đã bỏ stage tất cả'
                    )
                  }
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
                >
                  Unstage tất cả
                </button>
              )}
            </div>
            {stagedCount === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                Chưa có tệp nào được stage
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
                {status?.staged.map((item) => (
                  <div
                    key={`staged:${item.path}`}
                    className="flex items-center justify-between gap-2 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => loadDiff(item.path, true)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                        {item.status}
                      </span>
                      <span className="truncate font-mono text-xs text-slate-800 dark:text-slate-200">
                        {item.path}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        runGitAction(
                          `unstage:${item.path}`,
                          () =>
                            ideApi.unstageGit(project.id, {
                              paths: [item.path],
                            }),
                          `Đã unstage ${item.path}`
                        )
                      }
                      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Unstage"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unstaged */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Chưa Stage ({unstagedCount})
              </h4>
              {unstagedCount > 0 && (
                <button
                  type="button"
                  onClick={() => handleDiscard(undefined, true)}
                  className="text-[11px] font-medium text-rose-500 hover:underline"
                >
                  Discard tất cả
                </button>
              )}
            </div>
            {unstagedCount === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                Không có thay đổi chưa stage
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
                {status?.unstaged.map((item) => (
                  <div
                    key={`unstaged:${item.path}`}
                    className="flex items-center justify-between gap-1.5 px-2.5 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => loadDiff(item.path, false)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-600 dark:text-amber-300">
                        {item.status}
                      </span>
                      <span className="truncate font-mono text-xs text-slate-800 dark:text-slate-200">
                        {item.path}
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          runGitAction(
                            `stage:${item.path}`,
                            () =>
                              ideApi.stageGit(project.id, {
                                paths: [item.path],
                              }),
                            `Đã stage ${item.path}`
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                        title="Stage"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscard([item.path])}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/15"
                        title="Discard"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Untracked */}
          <div>
            <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tệp mới (Untracked) ({untrackedCount})
            </h4>
            {untrackedCount === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                Không có tệp untracked
              </p>
            ) : (
              <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
                {status?.untracked.map((filePath) => (
                  <div
                    key={`untracked:${filePath}`}
                    className="flex items-center justify-between gap-1.5 px-2.5 py-2"
                  >
                    <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                      {filePath}
                    </span>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          runGitAction(
                            `stage:${filePath}`,
                            () =>
                              ideApi.stageGit(project.id, {
                                paths: [filePath],
                              }),
                            `Đã stage ${filePath}`
                          )
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-emerald-600 hover:bg-emerald-500/15 dark:text-emerald-400"
                        title="Stage"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDiscard([filePath])}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/15"
                        title="Xóa tệp untracked"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Unified Diff Viewer */}
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-[#111827]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-800">
            <div className="flex min-w-0 items-center gap-2">
              <FileDiff className="h-4 w-4 shrink-0 text-cyan-500" />
              <span className="truncate font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                {selectedDiffTarget
                  ? `${selectedDiffTarget.path || 'Toàn bộ repo'} (${selectedDiffTarget.staged ? 'Staged' : 'Unstaged'})`
                  : 'Trình xem Diff'}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => loadDiff(undefined, false)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Diff Unstaged
              </button>
              <button
                type="button"
                onClick={() => loadDiff(undefined, true)}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Diff Staged
              </button>
            </div>
          </div>

          <div className="h-[360px] overflow-auto bg-[#090d16] p-3 font-mono text-xs leading-5">
            {loadingDiff ? (
              <div className="flex h-full items-center justify-center text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Đang tải diff...
              </div>
            ) : !diffText ? (
              <div className="flex h-full items-center justify-center text-center text-slate-500">
                {selectedDiffTarget
                  ? 'Không có thay đổi diff cho mục đã chọn.'
                  : 'Chạm vào một tệp bên trái để xem chi tiết Unified Diff.'}
              </div>
            ) : (
              diffText.split('\n').map((line, i) => {
                let cls = 'text-slate-300';
                if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff ')) {
                  cls = 'font-semibold text-slate-400';
                } else if (line.startsWith('@@')) {
                  cls = 'bg-cyan-500/10 text-cyan-300';
                } else if (line.startsWith('+')) {
                  cls = 'bg-emerald-500/10 text-emerald-300';
                } else if (line.startsWith('-')) {
                  cls = 'bg-rose-500/10 text-rose-300';
                }
                return (
                  <div key={i} className={cn('whitespace-pre px-1.5', cls)}>
                    {line || ' '}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Commit History */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Lịch sử Commit gần đây
          </h3>
        </div>
        {commits.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chưa có lịch sử commit nào.
          </p>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
            {commits.map((c) => (
              <div
                key={c.hash}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <GitCommitHorizontal className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold text-cyan-700 dark:bg-slate-800 dark:text-cyan-300">
                    {c.short_hash || c.hash.slice(0, 7)}
                  </span>
                  <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                    {c.subject}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {c.author} • {formatRelativeTime(c.date)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
