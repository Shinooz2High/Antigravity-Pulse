import { useCallback, useEffect, useState } from 'react';
import {
  Camera,
  Eye,
  History,
  Loader2,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  ideApi,
  type CheckpointItem,
  type CheckpointPreviewResponse,
} from '../../lib/ideApi';
import {
  cn,
  formatBytes,
  formatClockTime,
  formatRelativeTime,
} from '../../lib/utils';
import type { Project } from '../../types/api';

interface CheckpointsPaneProps {
  project: Project;
  onWorkspaceMutated?: () => Promise<void> | void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

function getKindMeta(kind: string): { label: string; cls: string } {
  switch (kind) {
    case 'manual':
      return {
        label: 'Thủ công',
        cls: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
      };
    case 'auto':
      return {
        label: 'Tự động',
        cls: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
      };
    case 'undo':
      return {
        label: 'Hoàn tác',
        cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
      };
    default:
      return {
        label: kind,
        cls: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      };
  }
}

export function CheckpointsPane({
  project,
  onWorkspaceMutated,
  onNotify,
}: CheckpointsPaneProps) {
  const [checkpoints, setCheckpoints] = useState<CheckpointItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [labelInput, setLabelInput] = useState('');

  const [previewData, setPreviewData] =
    useState<CheckpointPreviewResponse | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const loadCheckpoints = useCallback(async () => {
    setLoading(true);
    try {
      const list = await ideApi.listCheckpoints(project.id);
      setCheckpoints(list);
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Không thể tải danh sách checkpoint',
        'error'
      );
    } finally {
      setLoading(false);
    }
  }, [project.id, onNotify]);

  useEffect(() => {
    setPreviewData(null);
    loadCheckpoints();
  }, [project.id, loadCheckpoints]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await ideApi.createCheckpoint(
        project.id,
        labelInput.trim() || 'Manual checkpoint',
        'manual'
      );
      setLabelInput('');
      onNotify('Đã chụp Checkpoint thành công', 'success');
      await loadCheckpoints();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tạo checkpoint',
        'error'
      );
    } finally {
      setCreating(false);
    }
  };

  const handlePreview = async (cpId: string) => {
    setPreviewLoadingId(cpId);
    try {
      const res = await ideApi.previewCheckpoint(project.id, cpId);
      setPreviewData(res);
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể xem thay đổi',
        'error'
      );
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const handleRestore = async (cp: CheckpointItem) => {
    if (
      !window.confirm(
        `Khôi phục workspace về checkpoint "${cp.label}"?\nHệ thống sẽ tự động chụp một checkpoint hoàn tác ("Before restore") trước khi khôi phục.`
      )
    ) {
      return;
    }
    setRestoringId(cp.id);
    try {
      const res = await ideApi.restoreCheckpoint(project.id, cp.id);
      onNotify(
        `Đã khôi phục (sửa ${res.modified}, tạo lại ${res.recreated}, xóa ${res.deleted}). Undo ID: ${res.undo_checkpoint_id}`,
        'success'
      );
      setPreviewData(null);
      await loadCheckpoints();
      await onWorkspaceMutated?.();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Khôi phục checkpoint thất bại',
        'error'
      );
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Capture Bar */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <form onSubmit={handleCreate} className="flex flex-wrap items-center gap-2.5">
          <input
            type="text"
            value={labelInput}
            onChange={(e) => setLabelInput(e.target.value)}
            placeholder="Nhãn checkpoint (tùy chọn, VD: Trước khi refactor auth)..."
            className="min-h-[44px] min-w-[220px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
          />
          <button
            type="submit"
            disabled={creating}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-xs font-semibold text-white shadow-md shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50"
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Chụp Checkpoint ngay
          </button>
          <button
            type="button"
            onClick={loadCheckpoints}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            title="Làm mới danh sách"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </button>
        </form>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
          Checkpoint lưu trữ bản chụp nén sạch sẽ của mã nguồn (bỏ qua node_modules, .git, .venv, tệp &gt; 5MB) để bạn quay lại bất cứ lúc nào.
        </p>
      </section>

      {/* Preview Diff Drawer */}
      {previewData && (
        <section className="rounded-2xl border border-cyan-500/40 bg-white p-4 shadow-sm dark:bg-[#111827]">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Xem trước thay đổi nếu khôi phục: {previewData.checkpoint.label}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Sửa: {previewData.modified.length} • Tạo lại:{' '}
                {previewData.recreated.length} • Xóa:{' '}
                {previewData.deleted.length}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={restoringId === previewData.checkpoint.id}
                onClick={() => handleRestore(previewData.checkpoint)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Khôi phục ngay
              </button>
              <button
                type="button"
                onClick={() => setPreviewData(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <h4 className="mb-1.5 text-xs font-bold text-amber-600 dark:text-amber-300">
                Ghi đè (Modified) ({previewData.modified.length})
              </h4>
              <div className="max-h-44 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {previewData.modified.length === 0 ? (
                  <span className="text-slate-400">Không có</span>
                ) : (
                  previewData.modified.map((p) => (
                    <div key={p} className="truncate">
                      ~ {p}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <h4 className="mb-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-300">
                Tạo lại (Recreated) ({previewData.recreated.length})
              </h4>
              <div className="max-h-44 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {previewData.recreated.length === 0 ? (
                  <span className="text-slate-400">Không có</span>
                ) : (
                  previewData.recreated.map((p) => (
                    <div key={p} className="truncate">
                      + {p}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
              <h4 className="mb-1.5 text-xs font-bold text-rose-600 dark:text-rose-300">
                Xóa bỏ (Deleted) ({previewData.deleted.length})
              </h4>
              <div className="max-h-44 space-y-1 overflow-y-auto font-mono text-[11px] text-slate-700 dark:text-slate-300">
                {previewData.deleted.length === 0 ? (
                  <span className="text-slate-400">Không có</span>
                ) : (
                  previewData.deleted.map((p) => (
                    <div key={p} className="truncate">
                      - {p}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Checkpoints List */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#111827]">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-cyan-500" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Danh sách Snapshots ({checkpoints.length})
          </h3>
        </div>

        {loading && checkpoints.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Đang tải checkpoints...
          </div>
        ) : checkpoints.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
            Chưa có checkpoint nào cho dự án này. Hãy nhấn &ldquo;Chụp Checkpoint ngay&rdquo; để tạo bản sao lưu đầu tiên.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 dark:divide-slate-800 dark:border-slate-800">
            {checkpoints.map((cp) => {
              const kind = getKindMeta(cp.kind);
              return (
                <div
                  key={cp.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-md px-2 py-0.5 text-[10px] font-bold uppercase',
                          kind.cls
                        )}
                      >
                        {kind.label}
                      </span>
                      <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {cp.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {formatRelativeTime(cp.created_at)} ({formatClockTime(cp.created_at)})
                      {cp.file_count !== undefined && ` • ${cp.file_count} tệp`}
                      {cp.size_bytes !== undefined && ` • ${formatBytes(cp.size_bytes)}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={previewLoadingId === cp.id}
                      onClick={() => handlePreview(cp.id)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      {previewLoadingId === cp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      Xem thay đổi
                    </button>
                    <button
                      type="button"
                      disabled={restoringId === cp.id}
                      onClick={() => handleRestore(cp)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-300"
                    >
                      {restoringId === cp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Khôi phục
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
