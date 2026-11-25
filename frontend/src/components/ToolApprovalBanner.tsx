import { useState } from 'react';
import { Check, ShieldAlert, Terminal, X } from 'lucide-react';
import { formatRelativeTime } from '../lib/utils';
import type { PendingApproval } from '../types/api';

interface ToolApprovalBannerProps {
  approvals: PendingApproval[];
  onDecide: (runId: string, approvalId: string, approved: boolean) => Promise<void>;
}

export function ToolApprovalBanner({ approvals, onDecide }: ToolApprovalBannerProps) {
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  if (approvals.length === 0) return null;
  const current = approvals[0];
  const busy = submittingId === current.approval_id;

  const handleAction = async (approved: boolean) => {
    if (busy) return;
    setSubmittingId(current.approval_id);
    try {
      await onDecide(current.run_id, current.approval_id, approved);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="alertdialog"
      aria-modal="true"
    >
      <div className="pb-safe w-full max-w-lg animate-[fadeIn_0.16s_ease-out] rounded-t-3xl border border-amber-500/40 bg-white p-5 shadow-2xl sm:rounded-2xl dark:bg-[#111827] dark:text-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                Yêu cầu phê duyệt trên điện thoại
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {current.project_name}
              </h3>
            </div>
          </div>

          {approvals.length > 1 && (
            <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-300">
              1 / {approvals.length}
            </span>
          )}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-[#090d16]">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500/15 px-2.5 py-1 font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">
              <Terminal className="h-3.5 w-3.5" />
              {current.tool_name}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              {formatRelativeTime(current.created_at)}
            </span>
          </div>
          <p className="mt-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {current.description || 'Agent yêu cầu quyền thực thi công cụ này trong workspace PC.'}
          </p>
          {current.args && Object.keys(current.args).length > 0 && (
            <pre className="mt-3 max-h-44 overflow-auto rounded-lg border border-slate-200 bg-white p-2.5 font-mono text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {JSON.stringify(current.args, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => handleAction(false)}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 text-sm font-semibold text-rose-600 transition hover:bg-rose-500/20 disabled:opacity-50 dark:text-rose-300"
          >
            <X className="h-4 w-4" />
            Từ chối
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => handleAction(true)}
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition hover:brightness-110 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {busy ? 'Đang gửi...' : 'Cho phép'}
          </button>
        </div>
      </div>
    </div>
  );
}
