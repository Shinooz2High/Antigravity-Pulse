// Lucian UX/UI Prompt #075 · Collapsible Multi-File Upload Queue Panel
import { useState } from 'react';
import { formatBytes } from '../../lib/utils';
import './FileUploadQueue.css';

export type UploadFileStatus = 'ready' | 'uploading' | 'done' | 'error';

export interface UploadQueueItem {
  id: string;
  name: string;
  size: number;
  progress: number; // 0..1
  status: UploadFileStatus;
}

export interface FileUploadQueueProps {
  items: UploadQueueItem[];
  onRemove?: (id: string) => void;
  onRetry?: (id: string) => void;
  className?: string;
}

function getExtMeta(filename: string): { ext: string; color: string } {
  const parts = filename.split('.');
  const raw = parts.length > 1 ? parts[parts.length - 1].toUpperCase().slice(0, 4) : 'FILE';
  if (['PDF', 'DOC', 'DOCX', 'TXT', 'MD'].includes(raw)) {
    return { ext: raw, color: 'linear-gradient(140deg,#FF6B8B,#E5484D)' };
  }
  if (['MP4', 'MOV', 'WEBM', 'MP3', 'WAV'].includes(raw)) {
    return { ext: raw, color: 'linear-gradient(140deg,#7B61FF,#3D8BFF)' };
  }
  if (['ZIP', 'RAR', 'TAR', 'GZ', '7Z'].includes(raw)) {
    return { ext: raw, color: 'linear-gradient(140deg,#FFB547,#FF7A45)' };
  }
  if (['PNG', 'JPG', 'JPEG', 'WEBP', 'SVG', 'GIF'].includes(raw)) {
    return { ext: raw, color: 'linear-gradient(140deg,#10B981,#06B6D4)' };
  }
  return { ext: raw, color: 'linear-gradient(140deg,#6366F1,#0EA5E9)' };
}

export function FileUploadQueue({
  items,
  onRemove,
  onRetry,
  className = '',
}: FileUploadQueueProps) {
  const [folded, setFolded] = useState(false);

  if (items.length === 0) return null;

  const totalSize = items.reduce((acc, it) => acc + Math.max(1, it.size), 0);
  const doneBytes = items.reduce(
    (acc, it) => acc + Math.max(1, it.size) * (it.status === 'done' ? 1 : it.progress),
    0
  );
  const aggregateProgress = totalSize > 0 ? doneBytes / totalSize : 0;

  const doneCount = items.filter((i) => i.status === 'done').length;
  const uploadingCount = items.filter((i) => i.status === 'uploading').length;
  const errorCount = items.filter((i) => i.status === 'error').length;
  const allDone = doneCount === items.length;

  let heading = `${items.length} tệp sẵn sàng gửi`;
  let subline = `Tổng ${formatBytes(totalSize)}`;

  if (allDone) {
    heading = `Đã tải lên ${doneCount} tệp`;
    subline = `Tổng ${formatBytes(totalSize)}`;
  } else if (uploadingCount > 0) {
    heading = `Đang tải lên ${uploadingCount} tệp...`;
    subline = `${Math.round(aggregateProgress * 100)}% · ${formatBytes(totalSize)}`;
  } else if (errorCount > 0) {
    heading = `${errorCount} tệp tải thất bại`;
    subline = 'Nhấn thử lại để tiếp tục';
  }

  return (
    <div
      className={`u075-wrap ${allDone ? 'is-done' : ''} ${folded ? 'is-fold' : ''} ${className}`.trim()}
    >
      <section className="u075-pan" aria-label="Danh sách tệp đính kèm">
        <button
          type="button"
          className="u075-hd"
          aria-expanded={!folded}
          onClick={() => setFolded((f) => !f)}
        >
          <span
            className="u075-ring"
            aria-hidden="true"
            style={{ '--p': aggregateProgress.toFixed(3) } as React.CSSProperties}
          >
            <svg viewBox="0 0 38 38">
              <circle className="t" cx="19" cy="19" r="16" />
              <circle className="p" cx="19" cy="19" r="16" pathLength={100} />
            </svg>
            <i>
              <svg viewBox="0 0 18 18">
                <path d="M4 9.4l3.2 3.2L14 5.6" />
              </svg>
            </i>
          </span>

          <span className="u075-ht" aria-live="polite">
            <b>{heading}</b>
            <small>{subline}</small>
          </span>

          <svg className="u075-chev" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M5 7l4 4 4-4" />
          </svg>
        </button>

        <div className="u075-body">
          <ul>
            {items.map((item) => {
              const { ext, color } = getExtMeta(item.name);
              const pct = Math.round(item.progress * 100);
              const cls =
                item.status === 'done'
                  ? 'ok'
                  : item.status === 'error'
                    ? 'bad'
                    : '';

              return (
                <li key={item.id} className={`u075-f ${cls}`.trim()}>
                  <span
                    className="u075-ic"
                    style={{ '--c': color } as React.CSSProperties}
                    aria-hidden="true"
                  >
                    {ext}
                  </span>

                  <span className="u075-fx">
                    <b>
                      <span title={item.name}>{item.name}</span>
                      <small>
                        {item.status === 'error'
                          ? `Lỗi · ${pct}%`
                          : item.status === 'done'
                            ? formatBytes(item.size)
                            : item.status === 'uploading'
                              ? `${pct}%`
                              : formatBytes(item.size)}
                      </small>
                    </b>
                    <span
                      className="u075-bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={pct}
                      aria-label={`${item.name} progress`}
                      style={{ '--p': item.progress.toFixed(3) } as React.CSSProperties}
                    >
                      <i />
                    </span>
                  </span>

                  <span className="u075-st">
                    {item.status === 'error' && onRetry ? (
                      <button
                        type="button"
                        className="u075-retry"
                        aria-label={`Thử lại ${item.name}`}
                        onClick={() => onRetry(item.id)}
                      >
                        <svg viewBox="0 0 16 16" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5v2.5h-2.5" />
                        </svg>
                      </button>
                    ) : item.status === 'done' ? (
                      <svg viewBox="0 0 18 18" aria-hidden="true">
                        <path d="M4 9.4l3.2 3.2L14 5.6" />
                      </svg>
                    ) : onRemove ? (
                      <button
                        type="button"
                        className="u075-act"
                        aria-label={`Gỡ ${item.name}`}
                        onClick={() => onRemove(item.id)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

export default FileUploadQueue;
