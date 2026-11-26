// Unified 4-Platform App Download & Installer Card (Android / iOS / macOS / Windows)
import { useEffect, useRef, useState } from 'react';
import {
  isNativeApp,
  openExternalLink,
  subscribePwaInstallAvailability,
  triggerPwaInstall,
} from '../../lib/native';
import { copyToClipboard } from '../../lib/utils';
import './AppDownloadCard.css';

export interface DownloadPlatformOption {
  id: 'android' | 'ios' | 'mac' | 'windows' | 'linux';
  label: string;
  cta: string;
  secondaryCta?: string;
  meta: string;
  badge?: string;
  comingSoon?: boolean;
  downloadUrl?: string;
  downloadFileName?: string;
  secondaryUrl?: string;
  terminalCommand?: string;
  terminalLabel?: string;
  terminalPrompt?: string;
  steps?: Array<{ title: string; desc: string }>;
  onDownload?: () => void;
  onSecondaryAction?: () => void;
}

export interface AppDownloadCardProps {
  eyebrow?: string;
  title?: string;
  platforms?: DownloadPlatformOption[];
  className?: string;
}

export const GITHUB_LATEST_RELEASE_URL =
  'https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest';
export const ANDROID_APK_URL =
  'https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/latest/download/Antigravity-Pulse-Android.apk';
export const WINDOWS_INSTALL_CMD = 'irm https://agypulse.dpdns.org/install.ps1 | iex';
export const MACOS_INSTALL_CMD = 'curl -fsSL https://agypulse.dpdns.org/install.sh | bash';

function triggerFileDownload(url: string, filename?: string): void {
  if (typeof window === 'undefined') return;
  if (isNativeApp()) {
    openExternalLink(url);
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  if (filename) a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

const DEFAULT_PLATFORMS: DownloadPlatformOption[] = [
  {
    id: 'android',
    label: 'Android',
    cta: 'Tải Android APK (.apk)',
    secondaryCta: 'Hoặc xem mọi bản phát hành',
    meta: 'Android 8.0+ · APK Native (Capacitor 8) & Chrome PWA',
    downloadUrl: ANDROID_APK_URL,
    downloadFileName: 'Antigravity-Pulse-Android.apk',
    secondaryUrl: GITHUB_LATEST_RELEASE_URL,
    steps: [
      { title: 'Tải file .apk', desc: 'Nhấn nút tải hoặc mở bản Releases' },
      { title: 'Cho phép cài đặt', desc: 'Bật Nguồn không xác định nếu hỏi' },
      { title: 'Nhập mã 6 ký tự', desc: 'Hoặc bấm link Zalo / Messenger' },
    ],
  },
  {
    id: 'ios',
    label: 'iOS',
    cta: 'Cài lên MH chính (Safari PWA)',
    secondaryCta: 'Tải gói iOS (.ipa / Xcode)',
    meta: 'iPhone & iPad (iOS 15+) · Không cần máy Mac với PWA',
    secondaryUrl: GITHUB_LATEST_RELEASE_URL,
    steps: [
      { title: 'Mở bằng Safari', desc: 'Truy cập agypulse.dpdns.org' },
      { title: 'Bấm Chia sẻ (↑)', desc: 'Ở thanh dưới cùng trình duyệt' },
      { title: 'Thêm vào MH chính', desc: 'Dùng toàn màn hình như App gốc' },
    ],
  },
  {
    id: 'mac',
    label: 'macOS',
    cta: 'Tải bộ cài macOS (.command)',
    secondaryCta: 'Hoặc cài App vào Dock (PWA)',
    meta: 'macOS 12+ (Apple Silicon M1–M4 & Intel) · Tự tạo .app & Desktop',
    downloadUrl: '/cai-antigravity-pulse.command',
    downloadFileName: 'cai-antigravity-pulse.command',
    terminalLabel: 'Terminal (macOS · zsh / bash)',
    terminalPrompt: '$',
    terminalCommand: MACOS_INSTALL_CMD,
    steps: [
      { title: 'Tải hoặc chép lệnh', desc: 'Chạy file .command hoặc dán Terminal' },
      { title: 'Tự cài công cụ', desc: 'Python, Node, cloudflared & shortcut' },
      { title: 'Mở ngoài Desktop', desc: 'Bấm đúp Antigravity Pulse.app' },
    ],
  },
  {
    id: 'windows',
    label: 'Windows',
    cta: 'Tải bộ cài Windows (.bat)',
    secondaryCta: 'Chép lệnh PowerShell 1 dòng',
    meta: 'Windows 10 / 11 · Cài 1 chạm qua winget & tạo icon Desktop',
    downloadUrl: '/cai-antigravity-pulse.bat',
    downloadFileName: 'cai-antigravity-pulse.bat',
    terminalLabel: 'PowerShell (Windows)',
    terminalPrompt: 'PS>',
    terminalCommand: WINDOWS_INSTALL_CMD,
    steps: [
      { title: 'Bấm đúp file .bat', desc: 'Hoặc dán 1 dòng vào PowerShell' },
      { title: 'Tự cài mọi thứ', desc: 'Python, Node, Git & cloudflared' },
      { title: 'Lấy mã 6 ký tự', desc: 'Lần sau mở icon ngoài Desktop' },
    ],
  },
];

function detectCurrentPlatformId(): DownloadPlatformOption['id'] {
  if (typeof navigator === 'undefined') return 'windows';
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const maxTouch = (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints || 0;

  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (/MacIntel/i.test(platform) && maxTouch > 1)) return 'ios';
  if (/Mac/i.test(ua) || /Mac/i.test(platform)) return 'mac';
  return 'windows';
}

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
  eyebrow = 'Cài đặt Đa nền tảng',
  title = 'Android · iOS · macOS · Windows',
  platforms = DEFAULT_PLATFORMS,
  className = '',
}: AppDownloadCardProps) {
  const detectedId = detectCurrentPlatformId();
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = platforms.findIndex((p) => p.id === detectedId);
    return idx >= 0 ? idx : 0;
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [activeStepCount, setActiveStepCount] = useState(3);
  const timersRef = useRef<number[]>([]);

  useEffect(() => subscribePwaInstallAvailability(setCanInstallPwa), []);

  const clearTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => clearTimers, []);

  const handleSelect = (idx: number) => {
    if (idx === selectedIndex) return;
    clearTimers();
    setSelectedIndex(idx);
    setStatusMsg(null);
    setActiveStepCount(3);
  };

  const current = platforms[selectedIndex] || platforms[0];
  const activeSteps = current.steps || [
    { title: 'Mở bộ cài', desc: 'Tải về hoặc dán lệnh cài' },
    { title: 'Hoàn tất nhanh', desc: 'Chỉ mất khoảng 30 giây' },
    { title: 'Kết nối PC', desc: 'Nhập mã 6 ký tự hoặc bấm link' },
  ];

  const animateSteps = () => {
    clearTimers();
    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      setActiveStepCount(activeSteps.length);
      return;
    }
    setActiveStepCount(0);
    activeSteps.forEach((_, idx) => {
      const id = window.setTimeout(() => {
        setActiveStepCount(idx + 1);
      }, 180 + idx * 240);
      timersRef.current.push(id);
    });
  };

  const handlePrimaryAction = async () => {
    animateSteps();
    if (current.onDownload) {
      current.onDownload();
    }

    if (current.downloadUrl) {
      if (current.terminalCommand) {
        await copyToClipboard(current.terminalCommand);
      }
      triggerFileDownload(current.downloadUrl, current.downloadFileName);
      setStatusMsg(
        current.terminalCommand
          ? `Đã tải ${current.downloadFileName || 'bộ cài'} & chép sẵn lệnh!`
          : 'Đang tải xuống gói cài đặt...'
      );
      return;
    }

    if (current.id === 'ios') {
      if (canInstallPwa) {
        const ok = await triggerPwaInstall();
        if (ok) {
          setStatusMsg('Đã thêm ứng dụng lên Màn hình chính!');
          return;
        }
      }
      setStatusMsg('Trên Safari: bấm Chia sẻ (↑) → Thêm vào Màn hình chính');
      return;
    }

    if (current.terminalCommand) {
      await copyToClipboard(current.terminalCommand);
      setStatusMsg('Đã sao chép lệnh cài đặt!');
    }
  };

  const handleCopyTerminal = async () => {
    if (!current.terminalCommand) return;
    await copyToClipboard(current.terminalCommand);
    animateSteps();
    setStatusMsg('Đã sao chép lệnh vào khay nhớ tạm!');
  };

  const handleSecondary = async () => {
    if (current.onSecondaryAction) {
      current.onSecondaryAction();
      return;
    }
    if (current.id === 'android' && canInstallPwa) {
      const ok = await triggerPwaInstall();
      if (ok) {
        setStatusMsg('Đã cài Web App lên màn hình chính Android!');
        return;
      }
    }
    if ((current.id === 'mac' || current.id === 'windows') && canInstallPwa && !current.secondaryUrl) {
      const ok = await triggerPwaInstall();
      if (ok) {
        setStatusMsg('Đã cài đặt Desktop App (PWA)!');
        return;
      }
    }
    if (current.id === 'windows' && current.terminalCommand) {
      await copyToClipboard(current.terminalCommand);
      setStatusMsg('Đã chép lệnh PowerShell — mở PowerShell và Ctrl+V!');
      return;
    }
    if (current.secondaryUrl) {
      openExternalLink(current.secondaryUrl);
      return;
    }
    if (current.terminalCommand) {
      await copyToClipboard(current.terminalCommand);
      setStatusMsg('Mở Safari/Chrome → Cài đặt ứng dụng (hoặc dán Terminal)!');
    }
  };

  return (
    <div className={`u393-wrap ${statusMsg ? 'is-got' : ''} ${className}`.trim()}>
      <div className="u393-tp">
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <small>{eyebrow}</small>
          {current.id === detectedId && (
            <span className="u393-cur-pill">Thiết bị này</span>
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
            onClick={handleCopyTerminal}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCopyTerminal();
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
          onClick={handlePrimaryAction}
          className={`u393-dl ${statusMsg ? 'is-ok' : ''}`.trim()}
        >
          <span key={`${current.id}-${statusMsg ? 'ok' : 'idle'}`} className="u393-sw">
            {statusMsg ? (
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
                <span>{statusMsg}</span>
              </>
            ) : (
              <>
                <PlatformIcon id={current.id} />
                <span>{current.cta}</span>
              </>
            )}
          </span>
        </button>

        {(current.secondaryCta || (current.id === 'android' && canInstallPwa)) && (
          <div className="mt-2">
            <button
              type="button"
              onClick={handleSecondary}
              className="u393-sec-btn"
            >
              {current.id === 'android' && canInstallPwa
                ? 'Cài nhanh Web App (PWA 1 chạm)'
                : current.secondaryCta}
            </button>
          </div>
        )}
      </div>

      <div key={current.id} className="u393-mt">
        {current.meta}
      </div>

      <div className="u393-st">
        {activeSteps.map((step, idx) => (
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
    </div>
  );
}

export default AppDownloadCard;
