// Lucian UX/UI Prompt #470 · Animated Delete Button + 5s Countdown Ring Undo Pill
import { useEffect, useRef, useState } from 'react';
import './UndoableDeleteList.css';

export interface TrashLidButtonProps {
  label: string;
  className?: string;
  disabled?: boolean;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export function TrashLidButton({
  label,
  className = '',
  disabled = false,
  onClick,
}: TrashLidButtonProps) {
  return (
    <button
      type="button"
      className={`u470-del ${className}`.trim()}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path
          className="lid"
          d="M2.5 4.5h13M7 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"
        />
        <path d="M4 6.5l.8 8.2a1.5 1.5 0 0 0 1.5 1.3h5.4a1.5 1.5 0 0 0 1.5-1.3L14 6.5M7.5 9v4M10.5 9v4" />
      </svg>
    </button>
  );
}

export interface UndoCountdownPillProps {
  open: boolean;
  itemLabel?: string;
  durationMs?: number;
  resetKey: string | number;
  onUndo: () => void;
  onExpire: () => void;
}

const RING_CIRCUMFERENCE = 2 * Math.PI * 10;

export function UndoCountdownPill({
  open,
  itemLabel,
  durationMs = 5000,
  resetKey,
  onUndo,
  onExpire,
}: UndoCountdownPillProps) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const pausedRef = useRef(false);
  const leftRef = useRef(durationMs);
  const lastRef = useRef(0);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (!open) {
      return;
    }
    leftRef.current = durationMs;
    lastRef.current = performance.now();
    expiredRef.current = false;
    pausedRef.current = false;
    setRemainingMs(durationMs);

    let rafId = 0;
    const tick = (now: number) => {
      if (!pausedRef.current) {
        leftRef.current -= Math.min(100, now - lastRef.current);
      }
      lastRef.current = now;

      if (leftRef.current <= 0) {
        setRemainingMs(0);
        if (!expiredRef.current) {
          expiredRef.current = true;
          onExpireRef.current();
        }
        return;
      }

      setRemainingMs(leftRef.current);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [open, durationMs, resetKey]);

  const fraction = Math.max(0, Math.min(1, remainingMs / durationMs));
  const secondsLeft = Math.max(1, Math.ceil(remainingMs / 1000));
  const dashArray = `${(RING_CIRCUMFERENCE * fraction).toFixed(2)} ${RING_CIRCUMFERENCE.toFixed(2)}`;

  return (
    <button
      type="button"
      className={`u470-undo ${open ? 'is-on' : ''}`}
      tabIndex={open ? 0 : -1}
      aria-hidden={open ? undefined : 'true'}
      onClick={onUndo}
      onPointerEnter={() => {
        pausedRef.current = true;
      }}
      onPointerLeave={() => {
        pausedRef.current = false;
      }}
      onFocus={() => {
        pausedRef.current = true;
      }}
      onBlur={() => {
        pausedRef.current = false;
      }}
    >
      <span className="u470-rg" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <circle className="bg" cx="12" cy="12" r="10" />
          <circle
            className="fg"
            cx="12"
            cy="12"
            r="10"
            style={{ strokeDasharray: dashArray }}
          />
        </svg>
        <b>{secondsLeft}</b>
      </span>

      {itemLabel && <span className="u470-undo-label">Đã xóa “{itemLabel}”</span>}
      <span className="u470-undo-cta">Hoàn tác</span>

      <svg className="u470-ar" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4.5 3.5 2 6l2.5 2.5" />
        <path d="M2.5 6h7a4 4 0 0 1 0 8H7" />
      </svg>
    </button>
  );
}
