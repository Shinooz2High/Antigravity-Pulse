import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Zap,
  Brain,
  FlaskConical,
  Check,
  RefreshCw,
  Search,
  AlertTriangle,
  Clock,
  Sparkles,
  Layers,
  Info,
} from 'lucide-react';
import type { ModelListResponse, ModelQuotaInfo, ModelCategory } from '../types/api';
import { api } from '../lib/api';

interface ModelSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentModelId?: string;
  onModelSelected: (modelId: string) => void;
  onNotify: (msg: string, type?: 'info' | 'success' | 'error') => void;
}

export const ModelSelectorModal: React.FC<ModelSelectorModalProps> = ({
  isOpen,
  onClose,
  currentModelId,
  onModelSelected,
  onNotify,
}) => {
  const [data, setData] = useState<ModelListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ModelCategory>('all');

  const fetchModels = async (showToast = false) => {
    setLoading(true);
    try {
      const res = await api.getModelList();
      setData(res);
      if (showToast) {
        onNotify(`Đã cập nhật trạng thái quota của ${res.models.length} models`, 'success');
      }
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải danh sách model',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchModels(false);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleSelect = async (model: ModelQuotaInfo) => {
    if (model.id === (currentModelId || data?.current_model)) {
      onClose();
      return;
    }
    if (model.status === 'exhausted') {
      const confirmUse = window.confirm(
        `Model "${model.display_name}" hiện đang bị Google hạn chế do vượt mức Quota (429).\n${model.retry_after ? `(${model.retry_after})\n` : ''}Bạn có chắc chắn vẫn muốn chọn model này không?`
      );
      if (!confirmUse) return;
    }

    setSelectingId(model.id);
    try {
      await api.selectModel(model.id);
      onModelSelected(model.id);
      onNotify(`Đã chuyển sang model: ${model.display_name}`, 'success');
      onClose();
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể chuyển đổi model',
        'error'
      );
    } finally {
      setSelectingId(null);
    }
  };

  const filteredModels = useMemo(() => {
    if (!data?.models) return [];
    return data.models.filter((m) => {
      // Category filter
      if (categoryFilter !== 'all' && m.category !== categoryFilter) {
        return false;
      }
      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data?.models, categoryFilter, searchTerm]);

  if (!isOpen) return null;

  const effectiveCurrent = currentModelId || data?.current_model;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-[#0c121e]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:px-6 sm:py-5 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Chọn AI Model & Quota
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Theo dõi giới hạn Free Tier & chuyển model chạy trên PC
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchModels(true)}
              disabled={loading}
              title="Làm mới hạn mức Quota"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-cyan-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-500' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Search & Filter Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/70 p-4 sm:px-6 dark:border-slate-800/80 dark:bg-[#080d17]/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm model (VD: flash, pro, 3.8, preview)..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pr-3 pl-9 text-sm text-slate-900 outline-none transition focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  categoryFilter === 'all'
                    ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                Tất cả ({data?.models.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('flash')}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  categoryFilter === 'flash'
                    ? 'bg-amber-500 text-white shadow-md shadow-amber-500/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Zap className="h-3.5 w-3.5" />
                Flash (1500 req)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('pro')}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  categoryFilter === 'pro'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <Brain className="h-3.5 w-3.5" />
                Pro (50 req)
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('experimental')}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                  categoryFilter === 'experimental'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                    : 'bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
              >
                <FlaskConical className="h-3.5 w-3.5" />
                Thử nghiệm
              </button>
            </div>
          </div>
        </div>

        {/* Content / Models List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading && !data ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-cyan-500" />
              <p className="mt-3 text-sm">Đang kiểm tra danh mục và quota từ Google...</p>
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
              <Layers className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm font-medium text-slate-600 dark:text-slate-300">
                Không tìm thấy model nào phù hợp
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Thử đổi từ khóa tìm kiếm hoặc chọn danh mục khác.
              </p>
            </div>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2">
              {filteredModels.map((model) => {
                const isCurrent = model.id === effectiveCurrent;
                const isExhausted = model.status === 'exhausted';
                const isLow = model.status === 'low';
                const pctRemaining =
                  model.daily_limit > 0
                    ? Math.round((model.remaining_today / model.daily_limit) * 100)
                    : 0;

                // Color themes based on category & status
                const categoryBadge =
                  model.category === 'flash' ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400">
                      <Zap className="h-2.5 w-2.5" /> Flash
                    </span>
                  ) : model.category === 'pro' ? (
                    <span className="inline-flex items-center gap-1 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-indigo-600 uppercase dark:text-indigo-400">
                      <Brain className="h-2.5 w-2.5" /> Pro
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-purple-600 uppercase dark:text-purple-400">
                      <FlaskConical className="h-2.5 w-2.5" /> Thử nghiệm
                    </span>
                  );

                return (
                  <div
                    key={model.id}
                    onClick={() => handleSelect(model)}
                    className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-4 transition-all duration-200 ${
                      isCurrent
                        ? 'border-cyan-500 bg-cyan-500/5 shadow-md shadow-cyan-500/10 ring-2 ring-cyan-500/20 dark:bg-cyan-500/10'
                        : isExhausted
                          ? 'border-rose-200 bg-rose-500/5 opacity-80 hover:opacity-100 dark:border-rose-900/40 dark:bg-rose-950/20'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-[#111827] dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Top row: Name & Badges */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {model.display_name}
                            </span>
                            {categoryBadge}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {model.id}
                          </div>
                        </div>

                        {/* Current Checkmark or Selection button */}
                        {isCurrent && (
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white shadow-sm shadow-cyan-500/40">
                            <Check className="h-3.5 w-3.5 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                        {model.description}
                      </p>
                    </div>

                    {/* Bottom: Quota progress bar & status */}
                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-500 dark:text-slate-400">
                          Hạn mức Quota còn lại:
                        </span>
                        <span
                          className={`font-bold ${
                            isExhausted
                              ? 'text-rose-600 dark:text-rose-400'
                              : isLow
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {model.remaining_today.toLocaleString()} /{' '}
                          {model.daily_limit.toLocaleString()} req
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className={`h-full transition-all duration-500 ${
                            isExhausted
                              ? 'w-full bg-rose-500'
                              : isLow
                                ? 'bg-amber-500'
                                : 'bg-gradient-to-r from-cyan-500 to-emerald-500'
                          }`}
                          style={{
                            width: isExhausted ? '100%' : `${Math.max(5, pctRemaining)}%`,
                          }}
                        />
                      </div>

                      {/* Status / Exhaustion Notice */}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                        {isExhausted ? (
                          <div className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Hết Quota (Lỗi 429)</span>
                            {model.retry_after && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-rose-500/10 px-1 py-0.2 text-[10px] text-rose-500">
                                <Clock className="h-2.5 w-2.5" />
                                {model.retry_after}
                              </span>
                            )}
                          </div>
                        ) : isLow ? (
                          <div className="inline-flex items-center gap-1 font-medium text-amber-600 dark:text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Sắp hết ({model.remaining_today} lượt còn)</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                            <span>Khả dụng</span>
                          </div>
                        )}

                        <span className="text-[10px] text-slate-400">
                          {model.rpm_limit} req/phút
                        </span>
                      </div>

                      {/* Quick Select Button on Hover */}
                      <div className="mt-2.5">
                        <button
                          type="button"
                          disabled={selectingId === model.id}
                          className={`w-full rounded-xl py-1.5 text-xs font-semibold transition ${
                            isCurrent
                              ? 'bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400'
                              : isExhausted
                                ? 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                                : 'bg-slate-100 text-slate-700 hover:bg-cyan-500 hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-cyan-500 dark:hover:text-white'
                          }`}
                        >
                          {selectingId === model.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <RefreshCw className="h-3 w-3 animate-spin" /> Đang chọn...
                            </span>
                          ) : isCurrent ? (
                            '✓ Đang sử dụng'
                          ) : isExhausted ? (
                            'Chọn dù đang hết quota'
                          ) : (
                            'Sử dụng model này'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer Notes */}
        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50 p-4 text-[11px] text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-slate-800 dark:bg-[#080d17]/80 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0 text-cyan-500" />
            <span>
              Hạn mức Free Tier: <strong>Flash</strong> 1,500 req/ngày | <strong>Pro</strong> 50 req/ngày. Tự động reset mỗi 24h.
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
