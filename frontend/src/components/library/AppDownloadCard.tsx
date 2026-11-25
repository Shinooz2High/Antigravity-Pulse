// Lucian UX/UI Prompt #393 · Platform App Download Card (Windows CLI / macOS / Linux / Mobile)
import { useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../../lib/utils';
import './AppDownloadCard.css';

export interface DownloadPlatformOption {
  id: 'android' | 'ios' | 'mac' | 'windows' | 'linux';
  label: string;
  cta: string;
  meta: string;
  badge?: string;
  comingSoon?: boolean;
  terminalCommand?: string;
  terminalLabel?: string;
  terminalPrompt?: string;
  onDownload?: () => void;
}

export interface AppDownloadCardProps {
  eyebrow?: string;
  title?: string;
  platforms?: DownloadPlatformOption[];
  className?: string;
}

export const WINDOWS_INSTALL_CMD =
  'git clone https://github.com/Shinooz2High/App-Antigravity-on-moblie-.git Antigravity-Pulse; cd Antigravity-Pulse; .\\start.ps1';

export const MACOS_INSTALL_CMD =
  'git clone https://github.com/Shinooz2High/App-Antigravity-on-moblie-.git Antigravity-Pulse && cd Antigravity-Pulse && chmod +x start.sh && ./start.sh';

const DEFAULT_PLATFORMS: DownloadPlatformOption[] = [
  {
    id: 'windows',
    label: 'Windows',
    cta: 'Sao chép lệnh PowerShell',
    meta: 'Windows 10 / 11 · PowerShell · Git + Python + Node.js',
    terminalLabel: 'PowerShell (Windows)',
    terminalPrompt: 'PS>',
    terminalCommand: WINDOWS_INSTALL_CMD,
  },
  {
    id: 'mac',
    label: 'macOS',
    cta: 'Sao chép lệnh Terminal',
    meta: 'macOS 12+ (Apple Silicon & Intel) · zsh · Git + Python 3 + Node.js',
    terminalLabel: 'Terminal (macOS · zsh)',
    terminalPrompt: '$',
    terminalCommand: MACOS_INSTALL_CMD,
  },
  {
    id: 'linux',
    label: 'Linux',
    cta: 'Linux · Đang phát triển',
    meta: 'Dự kiến v1.0 · .deb · .AppImage · Flatpak',
    badge: 'Đang phát triển',
    comingSoon: true,
  },
];

const STEPS = [
  { title: 'Mở tệp cài đặt', desc: 'Chạy tệp vừa tải về máy' },
  { title: 'Cài đặt nhanh', desc: 'Chỉ vài cú nhấn là hoàn tất' },
  { title: 'Ghép nối PC', desc: 'Quét QR hoặc nhập mã PIN' },
];

const TERMINAL_STEPS = [
  { title: 'Mở PowerShell', desc: 'Nhấn Win + X → chọn Terminal' },
  { title: 'Dán & nhấn Enter', desc: 'Tự động tải repo & cài gói' },
  { title: 'Tự khởi chạy', desc: 'Chạy start.ps1 và mở Web App' },
];

const MACOS_TERMINAL_STEPS = [
  { title: 'Mở Terminal', desc: 'Nhấn ⌘ + Space → gõ Terminal' },
  { title: 'Dán & nhấn Enter', desc: 'Tự động tải repo & cài gói' },
  { title: 'Tự khởi chạy', desc: 'Chạy ./start.sh và mở Web App' },
];

const DEV_STEPS = [
  { title: 'Đóng gói Native', desc: 'Tối ưu Electron / Tauri nhẹ máy' },
  { title: 'Tự động cập nhật', desc: 'Đồng bộ giao diện & custom theme' },
  { title: 'Dùng Web App ngay', desc: 'Cài PWA hoặc truy cập trình duyệt' },
];

function PlatformIcon({ id }: { id: DownloadPlatformOption['id'] }) {
  if (id === 'android') {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="4.5" y="2" width="9" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="9" cy="13.2" r="0.8" fill="currentColor" />
      </svg>
    );
  }
  if (id === 'ios') {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="4.5" y="1.8" width="9" height="14.4" rx="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7.5 13.8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'windows') {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path
          d="M2.5 4l5.5-.8v5.3H2.5zM9.3 3l6.2-.9v6.4H9.3zM2.5 9.6H8v5.2l-5.5-.8zM9.3 9.6h6.2V16l-6.2-.9z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (id === 'linux') {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="2" y="3" width="14" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M5 7.5l2 1.5-2 1.5M8.5 11.5h4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="2.5" y="3.5" width="13" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1 14.5h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function AppDownloadCard({
  eyebrow = 'Desktop App',
  title = 'Cài trên Windows, macOS & Linux',
  platforms = DEFAULT_PLATFORMS,
  className = '',
}: AppDownloadCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (typeof navigator === 'undefined') return 0;
    const ua = navigator.userAgent || '';
    const winIdx = platforms.findIndex((p) => p.id === 'windows');
    const macIdx = platforms.findIndex((p) => p.id === 'mac');
    const linIdx = platforms.findIndex((p) => p.id === 'linux');
    if (/Win/.test(ua) && winIdx >= 0) return winIdx;
    if (/Linux|X11/.test(ua) && !/Android/.test(ua) && linIdx >= 0) return linIdx;
    if (macIdx >= 0) return macIdx;
    return 0;
  });
  const [downloaded, setDownloaded] = useState(false);
  const [activeStepCount, setActiveStepCount] = useState(0);
  const timersRef = useRef<number[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const handleSelect = (idx: number) => {
    if (idx === selectedIndex) return;
    clearTimers();
    setSelectedIndex(idx);
    setDownloaded(false);
    setActiveStepCount(0);
  };

  const current = platforms[selectedIndex] || platforms[0];
  const activeSteps = current.terminalCommand
    ? current.id === 'mac'
      ? MACOS_TERMINAL_STEPS
      : TERMINAL_STEPS
    : current.comingSoon
      ? DEV_STEPS
      : STEPS;

  const handleAction = async () => {
    if (current.terminalCommand) {
      await copyToClipboard(current.terminalCommand);
    }
    if (downloaded && !current.terminalCommand) return;

    clearTimers();
    setDownloaded(true);
    setActiveStepCount(0);
    current.onDownload?.();

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setActiveStepCount(activeSteps.length);
      return;
    }

    activeSteps.forEach((_, idx) => {
      const id = window.setTimeout(() => {
        setActiveStepCount(idx + 1);
      }, 280 + idx * 360);
      timersRef.current.push(id);
    });
  };

  return (
    <div className={`u393-wrap ${downloaded ? 'is-got' : ''} ${className}`.trim()}>
      <div className="u393-tp">
        <div className="flex flex-wrap items-center justify-center gap-y-1">
          <small>{eyebrow}</small>
          {current.badge && (
            <span className="u393-dev-pill">
              <i aria-hidden="true" />
              {current.badge}
            </span>
          )}
        </div>
        <h3>{title}</h3>
      </div>

      <div
        className="u393-tl"
        role="tablist"
        aria-label="Chọn hệ điều hành"
        style={{
          gridTemplateColumns: `repeat(${platforms.length}, minmax(0, 1fr))`,
        }}
      >
        <span
          className="u393-pl"
          aria-hidden="true"
          style={{
            width: `calc((100% - 6px) / ${platforms.length})`,
            transform: `translateX(${selectedIndex * 100}%)`,
          }}
        />
        {platforms.map((opt, idx) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={idx === selectedIndex}
            tabIndex={idx === selectedIndex ? 0 : -1}
            className="u393-tb"
            onClick={() => handleSelect(idx)}
          >
            <PlatformIcon id={opt.id} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Terminal Install Snippet (Windows PowerShell) */}
      {current.terminalCommand && (
        <div key={`${current.id}-term`} className="u393-term">
          <div className="u393-term-hd">
            <span className="u393-term-dots" aria-hidden="true">
              <i style={{ background: '#f87171' }} />
              <i style={{ background: '#fbbf24' }} />
              <i style={{ background: '#34d399' }} />
            </span>
            <span>{current.terminalLabel || 'Terminal'}</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            title="Bấm để sao chép lệnh cài đặt"
            onClick={handleAction}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAction();
              }
            }}
            className="u393-term-body"
          >
            <span className="u393-term-ps">{current.terminalPrompt || '$'}</span>
            <code>{current.terminalCommand}</code>
          </div>
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={handleAction}
          className={`u393-dl ${downloaded ? 'is-ok' : current.comingSoon ? 'is-dev' : ''}`.trim()}
        >
          <span key={`${current.id}-${downloaded ? 'ok' : 'idle'}`} className="u393-sw">
            {downloaded ? (
              <>
                <svg viewBox="0 0 18 18" aria-hidden="true">
                  <path
                    d="M4 9.5l3.2 3.2L14 5.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>
                  {current.terminalCommand
                    ? 'Đã sao chép lệnh cài đặt'
                    : current.comingSoon
                      ? 'Đang phát triển · Dùng bản Web'
                      : 'Đã bắt đầu tải xuống'}
                </span>
              </>
            ) : (
              <>
                <PlatformIcon id={current.id} />
                <span>{current.cta}</span>
              </>
            )}
          </span>
        </button>
      </div>

      <div key={current.id} className="u393-mt">
        {current.meta}
      </div>

      <div className="u393-st">
        {activeSteps.map((step, idx) => (
          <div
            key={step.title}
            className={`u393-sp ${idx < activeStepCount || current.comingSoon || current.terminalCommand ? 'is-on' : ''}`.trim()}
          >
            <i>{idx + 1}</i>
            <b>{step.title}</b>
            <small>{step.desc}</small>
          </div>
        ))}
      </div>

      <div className="u393-ar" aria-hidden="true">
        <svg viewBox="0 0 26 26">
          <path
            d="M5 21L20 6M11 6h9v9"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          {current.terminalCommand
            ? current.id === 'mac'
              ? 'Dán Terminal'
              : 'Dán vào PS'
            : current.comingSoon
              ? 'Sắp ra mắt'
              : 'Mở ở đây'}
        </span>
      </div>
    </div>
  );
}

export default AppDownloadCard;
