// Lucian UX/UI Prompt #454 · Animated Agent Task Steps Progress Card
import { useEffect, useState } from 'react';
import './AgentTaskSteps.css';

export type TaskStepState = 'wait' | 'run' | 'done';

export interface AgentTaskStepItem {
  id: string;
  label: string;
  meta?: React.ReactNode;
  state: TaskStepState;
}

export interface AgentTaskStepsProps {
  steps: AgentTaskStepItem[];
  isDone: boolean;
  startedAt?: string | number;
  finishedAt?: string | number;
  workingLabel?: string;
  doneLabel?: string;
  onReplay?: () => void;
  className?: string;
}

export function AgentTaskSteps({
  steps,
  isDone,
  startedAt,
  finishedAt,
  workingLabel = 'Đang xử lý',
  doneLabel = 'Hoàn tất',
  onReplay,
  className = '',
}: AgentTaskStepsProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (isDone) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [isDone]);

  const startMs = startedAt
    ? typeof startedAt === 'number'
      ? startedAt
      : Date.parse(startedAt) || nowMs
    : nowMs;
  const endMs =
    isDone && finishedAt
      ? typeof finishedAt === 'number'
        ? finishedAt
        : Date.parse(finishedAt) || nowMs
      : nowMs;
  const elapsedSec = Math.max(1, Math.round((endMs - startMs) / 1000));

  // Progress ratio along the vertical rail
  let highestActive = 0;
  steps.forEach((s, idx) => {
    if (s.state === 'run' || s.state === 'done') {
      highestActive = idx;
    }
  });
  const denom = Math.max(1, steps.length - 1);
  const progress = isDone ? 1 : highestActive / denom;
  const railHeight = Math.max(0, (steps.length - 1) * 38);

  return (
    <div className={`u454-wrap ${isDone ? 'is-done' : ''} ${className}`.trim()}>
      <div className="u454-c">
        {railHeight > 0 && (
          <i
            className="u454-tr"
            aria-hidden="true"
            style={{ height: `${railHeight}px` }}
          >
            <i style={{ '--u454-p': progress.toFixed(3) } as React.CSSProperties} />
          </i>
        )}

        <ol className="u454-l" aria-label="Tiến trình tác vụ của Agent">
          {steps.map((step) => (
            <li
              key={step.id}
              className="u454-s"
              data-s={step.state}
              aria-current={step.state === 'run' ? 'step' : undefined}
            >
              <span className="u454-ic" aria-hidden="true">
                <i className="u454-d" />
                <i className="u454-sp" />
                <span className="u454-ck">
                  <svg viewBox="0 0 24 24">
                    <path d="m6 12.5 4 4 8-9" />
                  </svg>
                </span>
              </span>
              <span className="u454-t">{step.label}</span>
              {step.meta !== undefined && <span className="u454-m">{step.meta}</span>}
            </li>
          ))}
        </ol>

        <div className="u454-f">
          <span className="u454-fi" aria-hidden="true">
            <i className="u454-pu" />
            <svg className="u454-ok" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9.2" />
              <path d="m8 12.3 2.8 2.8L16.2 9.6" />
            </svg>
          </span>

          <span className="u454-fx">
            <span className="u454-fw" aria-hidden={isDone}>
              <b>{workingLabel}</b>
              <small>{elapsedSec}s</small>
            </span>
            <span className="u454-fd" aria-hidden={!isDone}>
              <b>{doneLabel}</b>
              <small>· {elapsedSec}s</small>
            </span>
          </span>

          {onReplay && (
            <button
              type="button"
              className="u454-re"
              aria-label="Chạy lại prompt này"
              title="Chạy lại prompt này"
              tabIndex={isDone ? 0 : -1}
              onClick={onReplay}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
                <path d="M4.5 4.5v3.8h3.8" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default AgentTaskSteps;
