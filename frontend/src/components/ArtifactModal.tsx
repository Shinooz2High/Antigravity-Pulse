import { useEffect, useMemo, useState } from 'react';
import hljs from 'highlight.js';
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Maximize2,
  Share2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api, getAbsoluteResourceUrl, withToken } from '../lib/api';
import { isNativeApp, openExternalLink, shareContent } from '../lib/native';
import {
  cn,
  copyToClipboard,
  formatBytes,
  formatRelativeTime,
  getCategoryLabel,
  getCodeLanguageFromFilename,
} from '../lib/utils';
import type { ArtifactCategory, ArtifactModalTarget, FileContentResponse } from '../types/api';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ArtifactModalProps {
  target: ArtifactModalTarget | null;
  isDark: boolean;
  onClose: () => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

function addDownloadParam(url: string, download: boolean): string {
  if (!url) return url;
  const hasDownload = /[?&]download=/.test(url);
  let next = url;
  if (hasDownload) {
    next = url.replace(/([?&]download=)[01]/, `$1${download ? '1' : '0'}`);
  } else {
    const sep = url.includes('?') ? '&' : '?';
    next = `${url}${sep}download=${download ? '1' : '0'}`;
  }
  return withToken(next);
}

export function ArtifactModal({ target, isDark, onClose, onNotify }: ArtifactModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<FileContentResponse | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [zoom, setZoom] = useState<'fit' | '1x' | '2x'>('fit');
  const [copied, setCopied] = useState(false);

  const meta = useMemo(() => {
    if (!target) return null;
    if (target.kind === 'project_file') {
      return {
        name: target.entry.name,
        relPath: target.entry.rel_path,
        category: target.entry.category,
        mimeType: target.entry.mime_type,
        size: target.entry.size,
        modifiedAt: target.entry.modified_at,
        scopeTitle: target.projectName,
        fallbackRawUrl: api.getProjectFileRawUrl(target.projectId, target.entry.rel_path, false),
        fallbackDownloadUrl: api.getProjectFileRawUrl(target.projectId, target.entry.rel_path, true),
      };
    }
    const a = target.artifact;
    const rawFallback =
      target.kind === 'run_artifact'
        ? api.getRunArtifactRawUrl(target.runId, a.rel_path, false)
        : a.source === 'prompt_run'
          ? api.getRunArtifactRawUrl(a.scope_id, a.rel_path, false)
          : a.source === 'project_workspace'
            ? api.getProjectFileRawUrl(a.scope_id, a.rel_path, false)
            : api.getBrainArtifactRawUrl(a.scope_id, a.rel_path, false);

    return {
      name: a.name,
      relPath: a.rel_path,
      category: a.category,
      mimeType: a.mime_type,
      size: a.size,
      modifiedAt: a.modified_at,
      scopeTitle: a.scope_title,
      fallbackRawUrl: a.raw_url ? withToken(a.raw_url) : rawFallback,
      fallbackDownloadUrl: addDownloadParam(a.raw_url || rawFallback, true),
    };
  }, [target]);

  useEffect(() => {
    if (!target) {
      setContent(null);
      setError(null);
      return;
    }

    setRawMode(false);
    setZoom('fit');
    setCopied(false);

    let cancelled = false;
    async function load() {
      if (!target) return;
      setLoading(true);
      setError(null);
      try {
        let res: FileContentResponse;
        if (target.kind === 'project_file') {
          res = await api.getProjectFileContent(target.projectId, target.entry.rel_path);
        } else if (target.kind === 'run_artifact') {
          res = await api.getRunArtifactContent(target.runId, target.artifact.rel_path);
        } else if (target.artifact.source === 'prompt_run') {
          res = await api.getRunArtifactContent(target.artifact.scope_id, target.artifact.rel_path);
        } else if (target.artifact.source === 'project_workspace') {
          res = await api.getProjectFileContent(target.artifact.scope_id, target.artifact.rel_path);
        } else {
          res = await api.getBrainArtifactContent(
            target.artifact.scope_id,
            target.artifact.rel_path
          );
        }
        if (!cancelled) {
          setContent(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể tải nội dung tệp');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [target, onClose]);

  const effectiveCategory: ArtifactCategory = content?.category || meta?.category || 'other';
  const effectiveName = content?.name || meta?.name || '';
  const effectiveRelPath = content?.rel_path || meta?.relPath || '';
  const effectiveSize = content?.size ?? meta?.size ?? 0;
  const effectiveMime = content?.mime_type || meta?.mimeType || '';
  const effectiveModified = content?.modified_at || meta?.modifiedAt || '';
  const rawUrl = content?.raw_url ? addDownloadParam(content.raw_url, false) : meta?.fallbackRawUrl || '';
  const downloadUrl = content?.raw_url
    ? addDownloadParam(content.raw_url, true)
    : meta?.fallbackDownloadUrl || '';

  const highlightedCodeHtml = useMemo(() => {
    if (!content?.text) return '';
    const lang = getCodeLanguageFromFilename(effectiveName);
    try {
      if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
        return hljs.highlight(content.text, { language: lang, ignoreIllegals: true }).value;
      }
      return hljs.highlightAuto(content.text).value;
    } catch {
      return '';
    }
  }, [content?.text, effectiveName]);

  if (!target || !meta) return null;

  const handleCopyText = async () => {
    const textToCopy = content?.text ?? getAbsoluteResourceUrl(rawUrl);
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      setCopied(true);
      onNotify('Đã sao chép vào bộ nhớ tạm', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      onNotify('Không thể sao chép trên thiết bị này', 'error');
    }
  };

  const handleShare = async () => {
    const fullUrl = getAbsoluteResourceUrl(rawUrl);
    const result = await shareContent({
      title: effectiveName,
      text:
        content?.text && content.text.length <= 2500
          ? content.text
          : `Xem tệp ${effectiveName} từ Antigravity Pulse`,
      url: fullUrl,
    });
    if (result === 'shared' || result === 'cancelled') return;

    const ok = await copyToClipboard(content?.text || fullUrl);
    if (ok) {
      onNotify('Đã chép liên kết / nội dung để chia sẻ', 'success');
    } else {
      onNotify('Không thể chia sẻ từ thiết bị này', 'error');
    }
  };

  const handleOpenNewTab = () => {
    openExternalLink(getAbsoluteResourceUrl(rawUrl));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/75 backdrop-blur-sm md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-slate-900 shadow-2xl md:h-[88vh] md:max-w-5xl md:rounded-2xl md:border md:border-slate-200 dark:bg-[#0d1320] dark:text-slate-100 dark:md:border-slate-800">
        {/* Header */}
        <div className="pt-safe flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-5 dark:border-slate-800">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {effectiveCategory === 'image' ? (
                <ImageIcon className="h-4 w-4 shrink-0 text-cyan-500" />
              ) : effectiveCategory === 'markdown' ? (
                <FileText className="h-4 w-4 shrink-0 text-indigo-400" />
              ) : (
                <FileCode2 className="h-4 w-4 shrink-0 text-cyan-500" />
              )}
              <h2 className="truncate text-sm font-semibold sm:text-base">{effectiveName}</h2>
            </div>
            <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
              {meta.scopeTitle} • {effectiveRelPath} • {formatBytes(effectiveSize)} •{' '}
              {formatRelativeTime(effectiveModified)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {(effectiveCategory === 'markdown' || effectiveCategory === 'html') && content?.text && (
              <button
                type="button"
                onClick={() => setRawMode((v) => !v)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title={rawMode ? 'Xem bản hiển thị' : 'Xem mã nguồn'}
              >
                {rawMode ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
                <span className="hidden sm:inline">{rawMode ? 'Xem đẹp' : 'Mã nguồn'}</span>
              </button>
            )}

            {content?.text && (
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                title="Sao chép nội dung"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                <span className="hidden sm:inline">{copied ? 'Đã chép' : 'Chép'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleShare}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-200 px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              title="Chia sẻ"
            >
              <Share2 className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Chia sẻ</span>
            </button>

            <a
              href={downloadUrl}
              download={effectiveName}
              onClick={(e) => {
                if (isNativeApp()) {
                  e.preventDefault();
                  openExternalLink(getAbsoluteResourceUrl(downloadUrl));
                }
              }}
              className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl bg-cyan-500/15 px-2.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
              title="Tải về"
            >
              <Download className="h-4 w-4" />
              <span className="ml-1.5 hidden sm:inline">Tải về</span>
            </a>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {loading ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-slate-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              <p className="text-sm">Đang tải nội dung...</p>
            </div>
          ) : error ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-rose-500/30 bg-rose-500/10 p-5 text-center">
              <p className="text-sm font-semibold text-rose-500 dark:text-rose-300">{error}</p>
              <div className="mt-4 flex justify-center gap-2">
                <a
                  href={downloadUrl}
                  download={effectiveName}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-600 px-4 text-sm font-medium text-white hover:bg-cyan-500"
                >
                  <Download className="h-4 w-4" />
                  Tải về trực tiếp
                </a>
              </div>
            </div>
          ) : effectiveCategory === 'image' ? (
            <div className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {effectiveMime || 'image'}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setZoom('fit')}
                    className={cn(
                      'inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition',
                      zoom === 'fit'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                    Vừa khung
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom('1x')}
                    className={cn(
                      'inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition',
                      zoom === '1x'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                    1x
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoom('2x')}
                    className={cn(
                      'inline-flex min-h-[38px] items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition',
                      zoom === '2x'
                        ? 'bg-cyan-500 text-slate-950'
                        : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    )}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                    2x
                  </button>
                </div>
              </div>
              <div className="flex flex-1 items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-800 dark:bg-[#070b12]">
                <img
                  src={rawUrl}
                  alt={effectiveName}
                  className={cn(
                    'rounded-lg transition-transform duration-200',
                    zoom === 'fit' && 'max-h-[65dvh] max-w-full object-contain',
                    zoom === '1x' && 'max-w-none',
                    zoom === '2x' && 'max-w-none origin-center scale-150 sm:scale-200'
                  )}
                />
              </div>
            </div>
          ) : effectiveCategory === 'pdf' || (effectiveCategory === 'html' && !rawMode) ? (
            <div className="flex h-full min-h-[420px] flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Xem trực tiếp {effectiveCategory.toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="h-4 w-4" />
                  Mở tab mới
                </button>
              </div>
              <iframe
                src={rawUrl}
                title={effectiveName}
                className="min-h-[65dvh] w-full flex-1 rounded-xl border border-slate-200 bg-white dark:border-slate-800"
              />
            </div>
          ) : effectiveCategory === 'markdown' && !rawMode && content?.text !== null && content?.text !== undefined ? (
            <div className="mx-auto max-w-3xl pb-6">
              <MarkdownRenderer content={content.text} isDark={isDark} />
            </div>
          ) : content?.text !== null && content?.text !== undefined ? (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-[#0d1117] text-slate-100">
              <div className="flex items-center justify-between border-b border-slate-800 bg-[#131924] px-3 py-2 text-xs text-slate-400">
                <span className="font-mono uppercase">{getCodeLanguageFromFilename(effectiveName)}</span>
                <span>{content.text.split('\n').length} dòng</span>
              </div>
              <pre className="overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed">
                {highlightedCodeHtml ? (
                  <code
                    className="hljs"
                    dangerouslySetInnerHTML={{ __html: highlightedCodeHtml }}
                  />
                ) : (
                  <code>{content.text}</code>
                )}
              </pre>
            </div>
          ) : (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-800 dark:bg-slate-900/60">
              <FileText className="h-10 w-10 text-slate-400" />
              <p className="mt-3 text-sm font-semibold">{effectiveName}</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {getCategoryLabel(effectiveCategory)} • {effectiveMime || 'binary'} •{' '}
                {formatBytes(effectiveSize)}
              </p>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                Định dạng tệp nhị phân không hỗ trợ xem trước dạng văn bản.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <a
                  href={downloadUrl}
                  download={effectiveName}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  <Download className="h-4 w-4" />
                  Tải tệp về
                </a>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-medium dark:border-slate-700"
                >
                  <ExternalLink className="h-4 w-4" />
                  Mở tab mới
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
