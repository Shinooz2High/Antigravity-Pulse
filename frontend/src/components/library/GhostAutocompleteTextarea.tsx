// Lucian UX/UI Prompt #456 · Inline Ghost Autocomplete Textarea (Tab to accept)
import { useEffect, useId, useRef, useState } from 'react';
import './GhostAutocompleteTextarea.css';

export interface GhostAutocompleteTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  suggestions: string[];
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  className?: string;
}

const PAUSE_MS = 380;

export function GhostAutocompleteTextarea({
  value,
  onChange,
  onKeyDown,
  suggestions,
  placeholder = 'Ask anything, @ to mention, / for actions... (Enter để gửi)',
  rows = 2,
  disabled = false,
  textareaRef,
  className = '',
}: GhostAutocompleteTextareaProps) {
  const hintId = useId();
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const taRef = textareaRef || internalRef;
  const ovRef = useRef<HTMLDivElement | null>(null);

  const [ghost, setGhost] = useState('');
  const [shown, setShown] = useState(false);
  const [taking, setTaking] = useState(false);
  const [liveText, setLiveText] = useState('');

  const dismissedRef = useRef(false);
  const pauseTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const takeTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (takeTimerRef.current) window.clearTimeout(takeTimerRef.current);
  };

  useEffect(() => clearTimers, []);

  const findSuggestion = (text: string): string => {
    const ta = taRef.current;
    if (text.length < 2) return '';
    if (ta && (ta.selectionStart !== text.length || ta.selectionEnd !== text.length)) {
      return '';
    }
    const lower = text.toLowerCase();
    for (let i = 0; i < suggestions.length; i++) {
      const candidate = suggestions[i];
      if (candidate.length > text.length && candidate.toLowerCase().startsWith(lower)) {
        return candidate.slice(text.length);
      }
    }
    return '';
  };

  const hideGhost = () => {
    if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    if (!shown) {
      setGhost('');
      return;
    }
    setShown(false);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    hideTimerRef.current = window.setTimeout(() => {
      setGhost('');
    }, reducedMotion ? 0 : 300);
  };

  const scheduleGhost = (nextValue: string) => {
    if (pauseTimerRef.current) window.clearTimeout(pauseTimerRef.current);
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    pauseTimerRef.current = window.setTimeout(() => {
      if (dismissedRef.current || taking) return;
      const g = findSuggestion(nextValue);
      if (g) {
        if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
        setGhost(g);
        setShown(true);
        setLiveText(`Gợi ý: ${g.trim()}`);
      }
    }, reducedMotion ? 0 : PAUSE_MS);
  };

  const acceptGhost = () => {
    if (!shown || !ghost || taking) return false;
    setTaking(true);
    const full = value + ghost;
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    takeTimerRef.current = window.setTimeout(() => {
      onChange(full);
      setShown(false);
      setGhost('');
      setTaking(false);
      setLiveText('Đã nhận gợi ý');
      window.requestAnimationFrame(() => {
        const ta = taRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(full.length, full.length);
        }
      });
    }, reducedMotion ? 0 : 420);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (taking) return;
    const next = e.target.value;
    dismissedRef.current = false;
    onChange(next);

    const g = findSuggestion(next);
    if (shown && g && g.length < ghost.length) {
      setGhost(g);
      return;
    }
    hideGhost();
    scheduleGhost(next);
  };

  const handleKeyDownInternal = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = taRef.current;
    if (e.key === 'Tab' && !e.shiftKey && shown && ghost) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (
      e.key === 'ArrowRight' &&
      shown &&
      ghost &&
      ta &&
      ta.selectionStart === value.length &&
      ta.selectionEnd === value.length
    ) {
      e.preventDefault();
      acceptGhost();
      return;
    }
    if (e.key === 'Escape' && shown) {
      e.preventDefault();
      e.stopPropagation();
      dismissedRef.current = true;
      hideGhost();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div
      className={`u456-wrap ${shown ? 'is-ghost' : ''} ${taking ? 'is-take' : ''} ${className}`.trim()}
    >
      <div ref={ovRef} className="u456-ov" aria-hidden="true">
        <span>{value}</span>
        {ghost && (
          <span className="u456-gh">
            <span className="u456-gt">{ghost}</span>
            <kbd className="u456-kb">Tab</kbd>
          </span>
        )}
      </div>

      <textarea
        ref={taRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDownInternal}
        onClick={() => {
          const ta = taRef.current;
          if (shown && ta && ta.selectionStart !== value.length) {
            hideGhost();
          }
        }}
        onBlur={() => {
          if (shown && !taking) hideGhost();
        }}
        onScroll={() => {
          if (ovRef.current && taRef.current) {
            ovRef.current.scrollTop = taRef.current.scrollTop;
          }
        }}
        rows={rows}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label="Nhập câu lệnh cho Agent"
        aria-describedby={hintId}
        className="u456-ta"
      />

      {/* Mobile touch-friendly quick accept pill when ghost is visible */}
      {shown && ghost && !taking && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={acceptGhost}
          className="u456-tap-accept md:hidden"
        >
          <span>Nhận gợi ý</span>
          <span>⇥</span>
        </button>
      )}

      <p id={hintId} className="u456-sr">
        Nhấn Tab để nhận gợi ý tự động, hoặc Esc để ẩn
      </p>
      <p className="u456-sr" role="status">
        {liveText}
      </p>
    </div>
  );
}

export default GhostAutocompleteTextarea;
