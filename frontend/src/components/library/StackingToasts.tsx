// Lucian UX/UI Prompt #435 · Swipeable Stacking Toasts with Progress Bar & Undo Morph
import React, { useEffect, useRef, useState, type CSSProperties } from 'react';
import './StackingToasts.css';

export type ToastTone = 'ok' | 'err' | 'info' | 'wait' | 'success' | 'error';

export interface ToastItem {
  id: string | number;
  tone: ToastTone;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  duration?: number;
}

export interface StackingToastsProps {
  toasts: ToastItem[];
  onDismiss: (id: string | number) => void;
}

const TONE_COLORS: Record<string, string> = {
  ok: '#7EE8C0',
  success: '#7EE8C0',
  err: '#FF7D8C',
  error: '#FF7D8C',
  info: '#7DB4FF',
  wait: '#FFB26B',
};

const H = 56;
const GAP = 8;
const MAX_VISIBLE = 3;

export function StackingToasts({ toasts, onDismiss }: StackingToastsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [leftTimes, setLeftTimes] = useState<Record<string | number, number>>({});
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastTime = performance.now();
    let animId = 0;

    function loop(now: number) {
      const dt = Math.min(64, now - lastTime);
      lastTime = now;

      if (!isOpen && toasts.length > 0) {
        const topToast = toasts[toasts.length - 1];
        if (topToast.tone !== 'wait') {
          const totalDur = topToast.duration || 4500;
          setLeftTimes((prev) => {
            const curLeft = prev[topToast.id] ?? totalDur;
            const nextLeft = curLeft - dt;
            if (nextLeft <= 0) {
              onDismiss(topToast.id);
              const { [topToast.id]: _, ...rest } = prev;
              return rest;
            }
            return { ...prev, [topToast.id]: nextLeft };
          });
        }
      }
      animId = requestAnimationFrame(loop);
    }

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [isOpen, toasts, onDismiss]);

  if (toasts.length === 0) return null;

  const regionHeight =
    isOpen && toasts.length > 1
      ? Math.min(toasts.length, MAX_VISIBLE) * H + (Math.min(toasts.length, MAX_VISIBLE) - 1) * GAP
      : H + 20;

  return (
    <section
      ref={zoneRef}
      className={`u435-rg ${isOpen ? 'is-paused' : ''}`.trim()}
      style={{ height: `${regionHeight}px` }}
      aria-label="Thông báo"
      onPointerEnter={(e) => {
        if (e.pointerType === 'mouse') setIsOpen(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setIsOpen(false);
      }}
      onFocus={() => setIsOpen(true)}
      onBlur={(e) => {
        if (!zoneRef.current?.contains(e.relatedTarget as Node)) {
          setIsOpen(false);
        }
      }}
    >
      {toasts.map((toast, index) => {
        const revIdx = toasts.length - 1 - index;
        const totalDur = toast.duration || 4500;
        const leftMs = leftTimes[toast.id] ?? totalDur;
        const progress = Math.max(0, Math.min(1, leftMs / totalDur));

        const yOffset = isOpen ? -(revIdx * (H + GAP)) : -(revIdx * 11);
        const scaleVal = isOpen ? 1 : Math.max(0.82, 1 - revIdx * 0.055);
        const opacityVal = revIdx < MAX_VISIBLE ? 1 : 0;
        const isBack = !isOpen && revIdx > 0;

        return (
          <SingleToast
            key={toast.id}
            toast={toast}
            isBack={isBack}
            style={
              {
                '--c': TONE_COLORS[toast.tone] || '#7DB4FF',
                '--y': `${yOffset}px`,
                '--s': scaleVal.toFixed(3),
                '--o': opacityVal,
                '--left': progress.toFixed(3),
                zIndex: 40 - revIdx,
              } as CSSProperties
            }
            onDismiss={() => onDismiss(toast.id)}
          />
        );
      })}
    </section>
  );
}

function SingleToast({
  toast,
  style,
  isBack,
  onDismiss,
}: {
  toast: ToastItem;
  style: CSSProperties;
  isBack: boolean;
  onDismiss: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [flingDir, setFlingDir] = useState<0 | 1 | -1>(0);
  const [undone, setUndone] = useState(false);

  const startXRef = useRef(0);
  const samplesRef = useRef<Array<[number, number]>>([]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button') || flingDir !== 0) return;
    startXRef.current = e.clientX;
    samplesRef.current = [[e.clientX, e.timeStamp]];
    setIsDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore pointer capture issues
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const diff = e.clientX - startXRef.current;
    setDx(diff);
    samplesRef.current.push([e.clientX, e.timeStamp]);
    if (samplesRef.current.length > 5) samplesRef.current.shift();
  };

  const handlePointerEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const samples = samplesRef.current;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const velocity =
      first && last && last[1] > first[1] ? (last[0] - first[0]) / (last[1] - first[1]) : 0;

    if (Math.abs(dx) > 80 || Math.abs(velocity) > 0.6) {
      const dir: 1 | -1 = (Math.abs(velocity) > 0.6 ? velocity : dx) > 0 ? 1 : -1;
      setFlingDir(dir);
      window.setTimeout(() => onDismiss(), 240);
    } else {
      setDx(0);
    }
  };

  const isError = toast.tone === 'err' || toast.tone === 'error';
  const effectiveX = flingDir !== 0 ? flingDir * 360 : dx;
  const effectiveRot = flingDir !== 0 ? flingDir * 6 : isDragging ? dx * 0.02 : 0;
  const effectiveOpacity =
    flingDir !== 0
      ? 0
      : isDragging
        ? Math.max(0.35, 1 - Math.abs(dx) / 300)
        : undefined;

  return (
    <div
      className={`u435-t ${isDragging ? 'is-drag' : ''} ${isBack ? 'is-back' : ''} ${undone ? 'is-undo' : ''}`.trim()}
      style={
        {
          ...style,
          '--x': `${effectiveX.toFixed(1)}px`,
          '--rot': `${effectiveRot.toFixed(1)}deg`,
          opacity: effectiveOpacity,
        } as CSSProperties
      }
      role={isError ? 'alert' : 'status'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <span className="u435-ic" aria-hidden="true">
        <span className="ok">
          {isError ? (
            <svg viewBox="0 0 24 24">
              <path d="M12 7v6M12 17h.01" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24">
              <path d="m6 12.5 4 4 8-9" />
            </svg>
          )}
        </span>
        <span className="bk">
          <svg viewBox="0 0 24 24">
            <path d="M9 14 4.5 9.5 9 5" />
            <path d="M4.5 9.5h9a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </span>
      </span>

      <span className="u435-tx">
        <b title={toast.title}>{toast.title}</b>
        <b aria-hidden={!undone}>Đã hoàn tác</b>
      </span>

      {toast.actionText && (
        <button
          type="button"
          className="u435-un"
          onClick={() => {
            if (undone) return;
            setUndone(true);
            toast.onAction?.();
            window.setTimeout(() => onDismiss(), 1400);
          }}
        >
          {toast.actionText}
        </button>
      )}

      <button
        type="button"
        className="u435-x"
        aria-label="Đóng thông báo"
        onClick={onDismiss}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>

      <span className="u435-pb" aria-hidden="true">
        <i />
      </span>
    </div>
  );
}

export default StackingToasts;
