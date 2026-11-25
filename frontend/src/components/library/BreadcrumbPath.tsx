// Lucian UX/UI Prompt #103 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#103
import { useEffect, useRef } from 'react';
import './BreadcrumbPath.css';

export interface BreadcrumbSegment {
  name: string;
  path: string;
}

export interface SubFolderItem {
  name: string;
  path: string;
}

export interface BreadcrumbPathProps {
  rootName?: string;
  currentPath: string;
  subFolders?: SubFolderItem[];
  onNavigate: (path: string) => void;
  className?: string;
}

export function BreadcrumbPath({
  rootName = 'Root',
  currentPath,
  subFolders = [],
  onNavigate,
  className = '',
}: BreadcrumbPathProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const segments: BreadcrumbSegment[] = [
    { name: rootName, path: '' },
    ...currentPath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map((seg, idx, arr) => ({
        name: seg,
        path: arr.slice(0, idx + 1).join('/'),
      })),
  ];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && currentPath !== '') {
        e.preventDefault();
        onNavigate('');
        const firstBtn = el.querySelector<HTMLButtonElement>('nav button');
        firstBtn?.focus();
      }
    };

    el.addEventListener('keydown', onKeyDown);
    return () => el.removeEventListener('keydown', onKeyDown);
  }, [currentPath, onNavigate]);

  return (
    <div ref={containerRef} className={`u103 ${className}`.trim()}>
      <nav aria-label="Document path">
        {segments.map((seg, idx) => {
          const isCurrent = idx === segments.length - 1;
          return (
            <span key={seg.path} className="inline-flex items-center gap-1">
              <button
                type="button"
                aria-current={isCurrent ? 'page' : undefined}
                onClick={() => onNavigate(seg.path)}
              >
                {seg.name}
              </button>
              {!isCurrent && <span className="u103-sep" aria-hidden="true">/</span>}
            </span>
          );
        })}
      </nav>

      {subFolders.length > 0 && (
        <div className="places">
          {subFolders.map((child) => (
            <button
              key={child.path}
              className="place"
              type="button"
              onClick={() => onNavigate(child.path)}
            >
              <span className="icon" aria-hidden="true">📁</span>
              <span className="truncate">{child.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default BreadcrumbPath;
