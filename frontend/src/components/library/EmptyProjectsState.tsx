// Lucian UX/UI Prompt #440 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#440
import React, { useState } from 'react';
import './EmptyProjectsState.css';

export interface EmptyProjectsStateProps {
  onCreateProject?: () => void;
  emptyTitle?: string;
  doneTitle?: string;
  createButtonText?: string;
  createAnotherButtonText?: string;
  className?: string;
}

export function EmptyProjectsState({
  onCreateProject,
  emptyTitle = 'Chưa có dự án nào trong Workspace',
  doneTitle = 'Dự án đầu tiên đã được thêm',
  createButtonText = 'Tạo dự án đầu tiên',
  createAnotherButtonText = 'Thêm dự án khác',
  className = '',
}: EmptyProjectsStateProps) {
  const [isDone, setIsDone] = useState(false);

  const handleClick = () => {
    setIsDone(true);
    onCreateProject?.();
  };

  return (
    <div className={`u440 ${isDone ? 'is-done' : ''} ${className}`.trim()}>
      <div className="u440-ill" aria-hidden="true">
        <svg className="u440-il" viewBox="0 0 160 120">
          <ellipse className="sh" cx="80" cy="116" rx="50" ry="5" />
          <path className="sp" d="M138 22l1.8 4.4 4.4 1.8-4.4 1.8-1.8 4.4-1.8-4.4-4.4-1.8 4.4-1.8z" />
          <path className="sp" d="M20 40l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z" />
          <path className="sp" d="M128 70l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" />
          <g className="fol">
            <path className="bk" d="M28 34a8 8 0 0 1 8-8h22a6 6 0 0 1 4.6 2.2l4.6 5.8H124a8 8 0 0 1 8 8v58a8 8 0 0 1-8 8H36a8 8 0 0 1-8-8z" />
            <g className="doc">
              <rect className="p" x="50" y="24" width="60" height="58" rx="6" />
              <rect className="hd" x="57" y="31" width="20" height="5" rx="2.5" />
              <rect className="ln" x="57" y="42" width="44" height="3.5" rx="1.75" />
              <rect className="ln" x="57" y="50" width="36" height="3.5" rx="1.75" />
            </g>
            <path className="fr" d="M22 56a8 8 0 0 1 8-8h100a8 8 0 0 1 8 8.6l-4.4 44a8 8 0 0 1-8 7.4H34.4a8 8 0 0 1-8-7.4z" />
            <path className="fh" d="M30 48h100a8 8 0 0 1 8 8.6l-.3 3H22.1l-.1-3.6A8 8 0 0 1 30 48z" />
          </g>
        </svg>

        <span className="u440-burst">
          <i style={{ '--a': '-60deg', '--c': '#f59e0b' } as React.CSSProperties} />
          <i style={{ '--a': '-25deg', '--c': '#10b981' } as React.CSSProperties} />
          <i style={{ '--a': '10deg', '--c': '#06b6d4' } as React.CSSProperties} />
          <i style={{ '--a': '45deg', '--c': '#f59e0b' } as React.CSSProperties} />
          <i style={{ '--a': '-95deg', '--c': '#6366f1' } as React.CSSProperties} />
          <i style={{ '--a': '80deg', '--c': '#10b981' } as React.CSSProperties} />
        </span>
      </div>

      <div className="u440-h">
        <b aria-hidden={isDone}>{emptyTitle}</b>
        <b aria-hidden={!isDone}>{doneTitle}</b>
      </div>

      <button type="button" className="u440-go" onClick={handleClick}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>{isDone ? createAnotherButtonText : createButtonText}</span>
      </button>
    </div>
  );
}

export default EmptyProjectsState;
