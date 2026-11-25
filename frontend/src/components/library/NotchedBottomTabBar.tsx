// Lucian UX/UI Prompt #041 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#041
import React, { useEffect, useRef } from 'react';
import './NotchedBottomTabBar.css';

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
}

export interface NotchedBottomTabBarProps<T extends string = string> {
  tabs: TabItem<T>[];
  activeKey: T;
  onChange: (key: T) => void;
  className?: string;
}

export function NotchedBottomTabBar<T extends string = string>({
  tabs,
  activeKey,
  onChange,
  className = '',
}: NotchedBottomTabBarProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const activeIdx = Math.max(0, tabs.findIndex((t) => t.key === activeKey));

  const animStateRef = useRef({
    x: 0,
    v: 0,
    target: 0,
    raf: 0,
  });

  const getTabCenter = (index: number): number => {
    const root = rootRef.current;
    if (!root) return 0;
    const tabEls = root.querySelectorAll<HTMLButtonElement>('.u041-tab');
    const targetTab = tabEls[index];
    if (!targetTab || !targetTab.parentElement) return 0;
    return targetTab.parentElement.offsetLeft + targetTab.offsetWidth / 2;
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const targetX = getTabCenter(activeIdx);
    animStateRef.current.target = targetX;

    if (rm || animStateRef.current.x === 0) {
      animStateRef.current.x = targetX;
      animStateRef.current.v = 0;
      root.style.setProperty('--x', `${targetX}px`);
      return;
    }

    function step() {
      const state = animStateRef.current;
      const a = (state.target - state.x) * 0.16 - state.v * 0.42;
      state.v += a;
      state.x += state.v;
      root!.style.setProperty('--x', `${state.x.toFixed(2)}px`);

      if (Math.abs(state.target - state.x) > 0.3 || Math.abs(state.v) > 0.3) {
        state.raf = requestAnimationFrame(step);
      } else {
        state.x = state.target;
        state.v = 0;
        root!.style.setProperty('--x', `${state.x}px`);
        state.raf = 0;
      }
    }

    if (!animStateRef.current.raf) {
      animStateRef.current.raf = requestAnimationFrame(step);
    }

    return () => {
      if (animStateRef.current.raf) {
        cancelAnimationFrame(animStateRef.current.raf);
        animStateRef.current.raf = 0;
      }
    };
  }, [activeIdx]);

  const handleKeyDown = (e: React.KeyboardEvent, curIndex: number) => {
    let nextIndex = curIndex;
    if (e.key === 'ArrowRight') {
      nextIndex = (curIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (curIndex - 1 + tabs.length) % tabs.length;
    } else {
      return;
    }
    e.preventDefault();
    onChange(tabs[nextIndex].key);
    const tabEls = rootRef.current?.querySelectorAll<HTMLButtonElement>('.u041-tab');
    tabEls?.[nextIndex]?.focus();
  };

  return (
    <div ref={rootRef} className={`u041 ${className}`.trim()}>
      <span className="u041-shadow" aria-hidden="true" />
      <div className="u041-bar" aria-hidden="true" />
      <span className="u041-bub" aria-hidden="true" />

      <ul className="u041-tabs" role="tablist" aria-label="Bottom navigation">
        {tabs.map((tab, idx) => {
          const isSelected = tab.key === activeKey;
          return (
            <li key={tab.key} role="none">
              <button
                className="u041-tab"
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onChange(tab.key)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
              >
                <span className="u041-ic" aria-hidden="true">
                  {tab.icon}
                </span>
                {Boolean(tab.badge) && !isSelected && (
                  <em className="u041-bd" aria-label={`${tab.badge} alerts`}>
                    {tab.badge}
                  </em>
                )}
                <span className="u041-lab">{tab.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default NotchedBottomTabBar;
