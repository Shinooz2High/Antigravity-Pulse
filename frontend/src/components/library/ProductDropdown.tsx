// Lucian UX/UI Prompt #413 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#413
import React, { useEffect, useRef, useState } from 'react';
import './ProductDropdown.css';

export interface ProductDropdownItem {
  id: string;
  title: string;
  desc: string;
  colorClass?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export interface ProductDropdownProps {
  label?: string;
  items?: ProductDropdownItem[];
  className?: string;
}

const DEFAULT_ITEMS: ProductDropdownItem[] = [
  {
    id: 'docs',
    title: 'Docs',
    desc: 'Tài liệu hướng dẫn & API',
    colorClass: 'u413-c1',
    icon: (
      <svg viewBox="0 0 18 18">
        <path d="M4.5 2.8h6L13.5 6v9.2h-9z" />
        <path d="M10.3 3v3.2h3.1M6.8 9.2h4.4M6.8 11.9h2.8" />
      </svg>
    ),
  },
  {
    id: 'projects',
    title: 'Projects',
    desc: 'Dự án workspace trên PC',
    colorClass: 'u413-c2',
    icon: (
      <svg viewBox="0 0 18 18">
        <rect x="2.8" y="3.3" width="12.4" height="11.4" rx="2.2" />
        <path d="M7 3.3v11.4M11 3.3v7" />
      </svg>
    ),
  },
  {
    id: 'automations',
    title: 'Automations',
    desc: 'Tự động hóa tác vụ định kỳ',
    colorClass: 'u413-c3',
    icon: (
      <svg viewBox="0 0 18 18">
        <path d="M10 2.2 4.6 10h4.1l-.8 5.8L13.4 8H9.3z" />
      </svg>
    ),
  },
  {
    id: 'insights',
    title: 'Insights',
    desc: 'Số liệu hệ thống & kết quả',
    colorClass: 'u413-c4',
    icon: (
      <svg viewBox="0 0 18 18">
        <path d="M3 15h12M5.5 12.5V9M9 12.5V5M12.5 12.5V7.5" />
      </svg>
    ),
  },
];

export function ProductDropdown({
  label = 'Không gian làm việc',
  items = DEFAULT_ITEMS,
  className = '',
}: ProductDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setHighlightIdx(null);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const handleItemHover = (idx: number, el: HTMLElement) => {
    setHighlightIdx(idx);
    if (highlightRef.current) {
      highlightRef.current.style.setProperty('--hy', `${el.offsetTop}px`);
    }
  };

  return (
    <div
      ref={rootRef}
      className={`u413-container ${isOpen ? 'is-open' : ''} ${className}`.trim()}
    >
      <button
        type="button"
        className="u413-tr"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span>{label}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.8 6 7.8l3-3" />
        </svg>
      </button>

      <div
        ref={panelRef}
        className={`u413-pn ${highlightIdx !== null ? 'is-hl' : ''}`}
        role="region"
      >
        <span ref={highlightRef} className="u413-hl" aria-hidden="true" />
        <ul className="u413-ls">
          {items.map((item, idx) => (
            <li key={item.id}>
              <button
                type="button"
                className={`u413-it ${highlightIdx === idx ? 'is-on' : ''}`}
                onPointerEnter={(e) => handleItemHover(idx, e.currentTarget)}
                onClick={() => {
                  item.onClick?.();
                  setIsOpen(false);
                }}
              >
                <span className={`u413-ic ${item.colorClass || 'u413-c1'}`} aria-hidden="true">
                  {item.icon}
                </span>
                <span>
                  <b>{item.title}</b>
                  <small>{item.desc}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default ProductDropdown;
