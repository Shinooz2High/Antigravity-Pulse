// Lucian UX/UI Prompt #393 · Platform App Download Card with Step Reveal
import { useEffect, useRef, useState } from 'react';
import './AppDownloadCard.css';

export interface DownloadPlatformOption {
  id: 'android' | 'ios' | 'mac' | 'windows' | 'linux';
  label: string;
  cta: string;
  meta: string;
  onDownload?: () => void;
}

export interface AppDownloadCardProps {
  eyebrow?: string;
  title?: string;
  platforms?: DownloadPlatformOption[];
  className?: string;
}

const DEFAULT_PLATFORMS: DownloadPlatformOption[] = [
  {
    id: 'android',
    label: 'Android',
    cta: 'Tải cho Android (.apk)',
    meta: 'Android 8.0+ · APK cài trực tiếp hoặc PWA',
  },
  {
    id: 'ios',
    label: 'iOS',
    cta: 'Cài cho iOS (iPhone)',
    meta: 'iOS 15+ · Safari Thêm vào MH chính / IPA',
  },
];

const STEPS = [
  { title: 'Tải về điện thoại', desc: 'Mở tệp .apk hoặc Thêm vào MH chính' },
  { title: 'Cài đặt nhanh', desc: 'Chỉ vài cú chạm là hoàn tất' },
  { title: 'Ghép nối PC', desc: 'Quét QR hoặc bấm Continue with Google' },
];

function PlatformIcon({ id }: { id: DownloadPlatformOption['id'] }) {
  if (id === 'android') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M17.6 9.48l1.84-3.18a.48.48 0 0 0-.17-.65.48.48 0 0 0-.65.17l-1.88 3.25A11.45 11.45 0 0 0 12 8c-1.74 0-3.36.4-4.74 1.07L5.38 5.82a.48.48 0 0 0-.65-.17.48.48 0 0 0-.17.65L6.4 9.48A10.6 10.6 0 0 0 1 18h22a10.6 10.6 0 0 0-5.4-8.52zM7.5 15a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm9 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z"
          fill="currentColor"
        />
      </svg>
    );
  }
  if (id === 'ios') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.15.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1.01 3.902-1.01.613 0 2.886.06 4.374 2.19-.13.09-2.383 1.37-2.383 4.19 0 3.26 2.854 4.42 2.955 4.45z"
          fill="currentColor"
        />
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
  eyebrow = 'Mobile App (Android & iOS)',
  title = 'Cùng một không gian làm việc, mọi nơi',
  platforms = DEFAULT_PLATFORMS,
  className = '',
}: AppDownloadCardProps) {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (typeof navigator === 'undefined') return 0;
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      const iosIdx = platforms.findIndex((p) => p.id === 'ios');
      return iosIdx >= 0 ? iosIdx : 0;
    }
    const androidIdx = platforms.findIndex((p) => p.id === 'android');
    return androidIdx >= 0 ? androidIdx : 0;
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

  const handleDownload = () => {
    if (downloaded) return;
    setDownloaded(true);
    platforms[selectedIndex]?.onDownload?.();

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      setActiveStepCount(STEPS.length);
      return;
    }

    STEPS.forEach((_, idx) => {
      const id = window.setTimeout(() => {
        setActiveStepCount(idx + 1);
      }, 320 + idx * 420);
      timersRef.current.push(id);
    });
  };

  const current = platforms[selectedIndex] || platforms[0];

  return (
    <div className={`u393-wrap ${downloaded ? 'is-got' : ''} ${className}`.trim()}>
      <div className="u393-tp">
        <small>{eyebrow}</small>
        <h3>{title}</h3>
      </div>

      <div
        className="u393-tl"
        role="tablist"
        aria-label="Chọn nền tảng"
        style={{ ['--u393-cols' as string]: platforms.length }}
      >
        <span
          className="u393-pl"
          aria-hidden="true"
          style={{ transform: `translateX(${selectedIndex * 100}%)` }}
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

      <div>
        <button
          type="button"
          onClick={handleDownload}
          className={`u393-dl ${downloaded ? 'is-ok' : ''}`.trim()}
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
                <span>Đã bắt đầu tải xuống</span>
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
        {STEPS.map((step, idx) => (
          <div
            key={step.title}
            className={`u393-sp ${idx < activeStepCount ? 'is-on' : ''}`.trim()}
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
        <span>Mở ở đây</span>
      </div>
    </div>
  );
}

export default AppDownloadCard;
