// Lucian UX/UI Prompt #429 · Animated Command & Search Combobox (Ctrl+K / ⌘K)
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import './CommandSearch.css';

export type CommandItemKind = 'doc' | 'project' | 'action' | 'chat' | 'person';

export interface CommandSearchItem {
  id: string;
  kind: CommandItemKind;
  title: string;
  meta: string;
  onSelect?: () => void;
}

export interface CommandSearchProps {
  items: CommandSearchItem[];
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  maxResults?: number;
  className?: string;
  onSelectItem?: (item: CommandSearchItem) => void;
  onClose?: () => void;
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function ItemIcon({ kind, title }: { kind: CommandItemKind; title: string }) {
  if (kind === 'person') {
    return (
      <span className="u429-ic is-av" aria-hidden="true">
        {title.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <span className="u429-ic" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        {kind === 'project' ? (
          <>
            <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
            <path d="M8.5 8v8M12 8v5M15.5 8v3" />
          </>
        ) : kind === 'action' ? (
          <>
            <path d="M13 2L4.5 13.5H12L11 22L19.5 10.5H12L13 2Z" />
          </>
        ) : kind === 'chat' ? (
          <>
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </>
        ) : (
          <>
            <path d="M14 3H7.5A2.5 2.5 0 0 0 5 5.5v13A2.5 2.5 0 0 0 7.5 21h9a2.5 2.5 0 0 0 2.5-2.5V8z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </>
        )}
      </svg>
    </span>
  );
}

export function CommandSearch({
  items,
  placeholder = 'Search or type a command...',
  compact = false,
  autoFocus = false,
  maxResults = 5,
  className = '',
  onSelectItem,
  onClose,
}: CommandSearchProps) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [liveText, setLiveText] = useState('');
  const [isMac, setIsMac] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''));
    }
  }, []);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setOpen(true);
    }
  }, [autoFocus]);

  // Global Ctrl+K / ⌘K shortcut
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus({ preventScroll: true });
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onGlobalKeyDown);
    return () => window.removeEventListener('keydown', onGlobalKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const t = query.trim().toLowerCase();
    if (!t) return items.slice(0, maxResults);
    return items
      .filter(
        (d) =>
          d.title.toLowerCase().includes(t) || d.meta.toLowerCase().includes(t)
      )
      .sort((a, b) => {
        const aStarts = a.title.toLowerCase().startsWith(t) ? 0 : 1;
        const bStarts = b.title.toLowerCase().startsWith(t) ? 0 : 1;
        return aStarts - bStarts;
      })
      .slice(0, maxResults);
  }, [items, query, maxResults]);

  useEffect(() => {
    setActiveIndex(filtered.length > 0 ? 0 : -1);
    if (open) {
      setLiveText(filtered.length > 0 ? `${filtered.length} kết quả` : 'Không có kết quả');
    }
  }, [filtered.length, query, open]);

  const choose = (index: number) => {
    const item = filtered[index];
    if (!item) return;
    setQuery('');
    setOpen(false);
    setLiveText(item.title);
    inputRef.current?.blur();
    item.onSelect?.();
    onSelectItem?.(item);
    onClose?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && filtered.length > 0) {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      setActiveIndex((prev) => {
        const next = (prev + (e.key === 'ArrowDown' ? 1 : -1) + filtered.length) % filtered.length;
        return next;
      });
    } else if (e.key === 'Enter' && open && activeIndex >= 0) {
      e.preventDefault();
      choose(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      inputRef.current?.blur();
      onClose?.();
    }
  };

  const listboxId = `${uid}-lb`;
  const activeOptionId = activeIndex >= 0 ? `${uid}-opt-${activeIndex}` : undefined;

  return (
    <div
      ref={rootRef}
      className={`u429-wrap ${compact ? 'is-compact' : ''} ${open ? 'is-open' : ''} ${className}`.trim()}
      onBlur={(e) => {
        if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) {
          setOpen(false);
        } else if (!e.relatedTarget) {
          setOpen(false);
        }
      }}
    >
      <label className="u429-f">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" />
        </svg>
        <input
          ref={inputRef}
          className="u429-in"
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={open ? activeOptionId : undefined}
          aria-label="Tìm kiếm lệnh, dự án, hội thoại"
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <kbd className="u429-kb" aria-hidden="true">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>

      <div
        className="u429-dd"
        onMouseDown={(e) => e.preventDefault()}
      >
        <i
          className="u429-pill"
          aria-hidden="true"
          style={
            {
              '--py': `${Math.max(0, activeIndex) * 40}px`,
              '--po': activeIndex >= 0 && filtered.length > 0 ? 1 : 0,
            } as React.CSSProperties
          }
        />
        <div className="u429-lb" id={listboxId} role="listbox">
          {filtered.length > 0 ? (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                id={`${uid}-opt-${idx}`}
                className="u429-o"
                role="option"
                aria-selected={idx === activeIndex}
                style={{ '--i': idx } as React.CSSProperties}
                onPointerMove={() => {
                  if (idx !== activeIndex) setActiveIndex(idx);
                }}
                onClick={() => choose(idx)}
              >
                <ItemIcon kind={item.kind} title={item.title} />
                <span className="u429-t">
                  <HighlightText text={item.title} query={query} />
                </span>
                <span className="u429-m">{item.meta}</span>
                <span className="u429-en" aria-hidden="true">
                  ↵
                </span>
              </div>
            ))
          ) : (
            <div className="u429-no">Không tìm thấy kết quả phù hợp</div>
          )}
        </div>
      </div>

      <p className="u429-live" role="status">
        {liveText}
      </p>
    </div>
  );
}

export default CommandSearch;
