// Lucian UX/UI Prompt #401 · Animated Google Sign-In Button
import { useEffect, useRef, useState } from 'react';
import './GoogleSignInButton.css';

export interface GoogleSignInButtonProps {
  idleLabel?: string;
  busyLabel?: string;
  doneLabel?: string;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  onSignIn?: () => Promise<void> | void;
}

type ButtonPhase = 'idle' | 'busy' | 'ok';

export function GoogleSignInButton({
  idleLabel = 'Continue with Google',
  busyLabel = 'Connecting…',
  doneLabel = 'Signed in',
  fullWidth = false,
  disabled = false,
  className = '',
  onSignIn,
}: GoogleSignInButtonProps) {
  const [phase, setPhase] = useState<ButtonPhase>('idle');
  const [liveText, setLiveText] = useState('');
  const [labelWidth, setLabelWidth] = useState<number | undefined>(undefined);

  const lbRef = useRef<HTMLSpanElement>(null);
  const s0Ref = useRef<HTMLSpanElement>(null);
  const s1Ref = useRef<HTMLSpanElement>(null);
  const s2Ref = useRef<HTMLSpanElement>(null);
  const timersRef = useRef<number[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, []);

  const schedule = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      if (mountedRef.current) fn();
    }, ms);
    timersRef.current.push(id);
  };

  const measureWidth = (index: 0 | 1 | 2) => {
    const target = index === 0 ? s0Ref.current : index === 1 ? s1Ref.current : s2Ref.current;
    const w = target?.offsetWidth || 0;
    setLabelWidth(w > 0 ? w : undefined);
  };

  const handleClick = async () => {
    if (disabled || phase !== 'idle') return;

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    measureWidth(0);
    // Force layout flush so width transition animates smoothly from s0 to s1
    void lbRef.current?.offsetWidth;

    setPhase('busy');
    measureWidth(1);
    setLiveText('Connecting to Google');

    const minBusyMs = reducedMotion ? 500 : 1400;
    const start = Date.now();

    try {
      if (onSignIn) {
        await onSignIn();
      }
    } catch {
      if (!mountedRef.current) return;
      setPhase('idle');
      measureWidth(0);
      setLiveText('');
      schedule(() => setLabelWidth(undefined), reducedMotion ? 0 : 600);
      return;
    }

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minBusyMs - elapsed);

    schedule(() => {
      setPhase('ok');
      measureWidth(2);
      setLiveText('Signed in with Google');

      schedule(() => {
        setPhase('idle');
        measureWidth(0);
        schedule(() => {
          setLabelWidth(undefined);
        }, reducedMotion ? 0 : 600);
      }, reducedMotion ? 900 : 1300);
    }, remaining);
  };

  return (
    <div className={`u401-wrap ${fullWidth ? 'is-full' : ''} ${className}`.trim()}>
      <button
        type="button"
        disabled={disabled}
        aria-busy={phase === 'busy' ? 'true' : undefined}
        onClick={handleClick}
        className={`u401-b ${phase === 'busy' ? 'is-busy' : ''} ${phase === 'ok' ? 'is-ok' : ''}`.trim()}
      >
        <span className="u401-ic" aria-hidden="true">
          <svg className="u401-g" viewBox="0 0 48 48">
            <path
              fill="#EA4335"
              d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
            />
            <path
              fill="#4285F4"
              d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
            />
            <path
              fill="#FBBC05"
              d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
            />
            <path
              fill="#34A853"
              d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
            />
          </svg>
          <svg className="u401-arc" viewBox="0 0 20 20">
            <g>
              <circle cx="10" cy="10" r="8" stroke="#EA4335" strokeDashoffset="0" />
              <circle cx="10" cy="10" r="8" stroke="#4285F4" strokeDashoffset="-12.57" />
              <circle cx="10" cy="10" r="8" stroke="#34A853" strokeDashoffset="-25.13" />
              <circle cx="10" cy="10" r="8" stroke="#FBBC05" strokeDashoffset="-37.7" />
            </g>
          </svg>
          <svg className="u401-ck" viewBox="0 0 20 20">
            <path d="M4.8 10.4l3.4 3.4 7-7.4" />
          </svg>
        </span>
        <span
          ref={lbRef}
          className="u401-lb"
          style={labelWidth !== undefined ? { width: `${labelWidth}px` } : undefined}
        >
          <span ref={s0Ref} className="s0">
            {idleLabel}
          </span>
          <span ref={s1Ref} className="s1" aria-hidden="true">
            {busyLabel}
          </span>
          <span ref={s2Ref} className="s2" aria-hidden="true">
            {doneLabel}
          </span>
        </span>
      </button>
      <p className="u401-live" role="status">
        {liveText}
      </p>
    </div>
  );
}

export default GoogleSignInButton;
