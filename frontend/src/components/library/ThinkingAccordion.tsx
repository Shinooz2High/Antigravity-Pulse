// Lucian UX/UI Prompt #453 · AI Thinking Accordion with Spinning Sparkle
import { useEffect, useId, useState } from 'react';
import './ThinkingAccordion.css';

export interface ThinkingAccordionProps {
  thoughts: string;
  isThinking: boolean;
  startedAt?: string | number;
  finishedAt?: string | number;
  defaultOpen?: boolean;
  className?: string;
}

export function ThinkingAccordion({
  thoughts,
  isThinking,
  startedAt,
  finishedAt,
  defaultOpen = true,
  className = '',
}: ThinkingAccordionProps) {
  const panelId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isThinking) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isThinking]);

  const startMs = startedAt
    ? typeof startedAt === 'number'
      ? startedAt
      : Date.parse(startedAt) || nowMs
    : nowMs;
  const endMs =
    !isThinking && finishedAt
      ? typeof finishedAt === 'number'
        ? finishedAt
        : Date.parse(finishedAt) || nowMs
      : nowMs;
  const durationSec = Math.max(1, Math.round((endMs - startMs) / 1000));

  const lines = thoughts
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className={`u453-wrap ${!isThinking ? 'is-done' : ''} ${className}`.trim()}>
      <button
        type="button"
        className="u453-h"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="u453-ic" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 1.6c.8 5.3 5.1 9.6 10.4 10.4-5.3.8-9.6 5.1-10.4 10.4C11.2 17.1 6.9 12.8 1.6 12 6.9 11.2 11.2 6.9 12 1.6Z" />
          </svg>
        </span>

        <span className="u453-tx">
          <span className="u453-a" aria-hidden={!isThinking}>
            Đang suy luận…
          </span>
          <span className="u453-b" aria-hidden={isThinking}>
            Đã suy luận trong {durationSec}s
          </span>
        </span>

        <svg className="u453-cv" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m9.5 6 6 6-6 6" />
        </svg>
      </button>

      <div id={panelId} className="u453-pn">
        <div className="u453-in">
          <div className="u453-ls">
            {lines.length > 0 ? (
              lines.map((line, i) => (
                <p key={i} className="u453-ln">
                  {line}
                </p>
              ))
            ) : (
              <p className="u453-ln">
                Đang phân tích tác vụ và chuẩn bị kế hoạch thực thi...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ThinkingAccordion;
