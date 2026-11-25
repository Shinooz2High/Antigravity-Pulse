// Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070
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
  ok: '#10B981',
  success: '#10B981',
  err: '#EF4444',
  error: '#EF4444',
  info: '#06B6D4',
  wait: '#F59E0B',
};

const ICONS: Record<string, React.ReactNode> = {
  ok: (
    <svg viewBox="0 0 18 18">
      <path d="M4 9.4l3.2 3.2L14 5.6" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 18 18">
      <path d="M4 9.4l3.2 3.2L14 5.6" />
    </svg>
  ),
  err: (
    <svg viewBox="0 0 18 18">
      <path d="M9 5v5M9 13h.01" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 18 18">
      <path d="M9 5v5M9 13h.01" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 18 18">
      <path d="M3.5 4.5h11v7h-6l-3 2.5v-2.5h-2z" />
    </svg>
  ),
  wait: <i />,
};

export function StackingToasts({ toasts, onDismiss }: StackingToastsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [leftTimes, setLeftTimes] = useState<Record<string | number, number>>({});
  const zoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastTime = performance.now();
    let animId: number;

    function loop(now: number) {
      const dt = now - lastTime;
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

  return (
    <div
      ref={zoneRef}
      className="u070-zone"
      role="region"
      aria-label="Notifications"
      tabIndex={-1}
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

        const yOffset = isOpen ? -(revIdx * 72) : -(revIdx * 12);
        const scaleVal = isOpen ? 1 : Math.max(0.75, 1 - revIdx * 0.05);
        const opacityVal = isOpen ? 1 : revIdx > 2 ? 0 : 1;
        const isBack = !isOpen && revIdx > 0;

        return (
          <SingleToast
            key={toast.id}
            toast={toast}
            progress={progress}
            style={{
              '--c': TONE_COLORS[toast.tone] || '#06B6D4',
              '--y': `${yOffset}px`,
              '--s': scaleVal,
              '--o': opacityVal,
              '--left': progress,
              zIndex: 50 - revIdx,
            } as CSSProperties}
            isBack={isBack}
            onDismiss={() => onDismiss(toast.id)}
          />
        );
      })}
    </div>
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
  progress: number;
  isBack: boolean;
  onDismiss: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [leaveDir, setLeaveDir] = useState<1 | -1>(1);

  const startXRef = useRef(0);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return;
    startXRef.current = e.clientX;
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const diff = e.clientX - startXRef.current;
    setDx(diff);
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (Math.abs(dx) > 80) {
      setLeaveDir(dx > 0 ? 1 : -1);
      setIsLeaving(true);
      setTimeout(() => onDismiss(), 400);
    } else {
      setDx(0);
    }
  };

  const iconKey = toast.tone in ICONS ? toast.tone : 'info';

  return (
    <div
      className={`u070-t ${isDragging ? 'drag' : ''} ${isBack ? 'back' : ''} ${
        isLeaving ? 'leave side' : ''
      }`}
      style={{
        ...style,
        '--dx': `${dx}px`,
        '--dir': leaveDir,
        opacity: isDragging ? Math.max(0.2, 1 - Math.abs(dx) / 260) : undefined,
      } as CSSProperties}
      role={toast.tone === 'err' || toast.tone === 'error' ? 'alert' : 'status'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <span className="u070-ic" aria-hidden="true">
        {ICONS[iconKey]}
      </span>
      <span className="u070-tx">
        <b>{toast.title}</b>
        {toast.description && <small>{toast.description}</small>}
      </span>
      {toast.actionText && (
        <button
          className="u070-act"
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss();
          }}
        >
          {toast.actionText}
        </button>
      )}
      <button
        className="u070-x"
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <svg viewBox="0 0 14 14">
          <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
        </svg>
      </button>
      <span className="u070-bar" aria-hidden="true" />
    </div>
  );
}

export default StackingToasts;
