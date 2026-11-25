import type { ReactNode } from 'react';
import {
  Activity,
  FolderGit2,
  Home,
  Layers,
  RefreshCw,
  Settings,
  Sparkles,
  TerminalSquare,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { WsStatus } from '../hooks/usePulseSocket';
import { cn } from '../lib/utils';
import type { SystemStatus, TabKey } from '../types/api';
import { ThemeSwitch, NotchedBottomTabBar, ProductDropdown } from './library';
import { useCustomTheme } from '../contexts/CustomThemeContext';

interface LayoutProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  wsStatus: WsStatus;
  onReconnectWs: () => void;
  systemStatus: SystemStatus | null;
  pendingApprovalCount: number;
  activeRunCount: number;
  isDark: boolean;
  onToggleTheme: () => void;
  children: ReactNode;
}

const NAV_ITEMS: Array<{
  key: TabKey;
  label: string;
  icon: typeof Home;
}> = [
  { key: 'dashboard', label: 'Tổng quan', icon: Home },
  { key: 'prompt', label: 'Prompt', icon: TerminalSquare },
  { key: 'projects', label: 'Dự án', icon: FolderGit2 },
  { key: 'outputs', label: 'Kết quả', icon: Layers },
  { key: 'settings', label: 'Cài đặt', icon: Settings },
];

export function Layout({
  activeTab,
  onTabChange,
  wsStatus,
  onReconnectWs,
  systemStatus,
  pendingApprovalCount,
  activeRunCount,
  isDark,
  onToggleTheme,
  children,
}: LayoutProps) {
  const { config: themeConfig, preset, setThemeModalOpen, greetingText } = useCustomTheme();

  const wsBadge =
    wsStatus === 'connected'
      ? {
          text: 'Trực tuyến',
          dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
          cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
        }
      : wsStatus === 'connecting'
        ? {
            text: 'Đang nối...',
            dot: 'bg-amber-400 animate-pulse',
            cls: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300',
          }
        : {
            text: 'Mất WS',
            dot: 'bg-rose-500',
            cls: 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300',
          };

  return (
    <div className="agy-app-shell flex h-[100dvh] w-full overflow-hidden bg-[#f4f7fb] text-slate-900 dark:bg-[#090d16] dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="agy-glass-sidebar hidden w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white/80 backdrop-blur-xl md:flex dark:border-slate-800/80 dark:bg-[#0d1322]/90">
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800/80">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/25 text-cyan-500 ring-1 ring-cyan-500/30">
            <Activity className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold tracking-tight">Antigravity Pulse</h1>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {systemStatus?.hostname || 'PC Bridge'}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onTabChange(item.key)}
                className={cn(
                  'flex min-h-[44px] w-full items-center justify-between rounded-xl px-3.5 text-sm font-medium transition',
                  active
                    ? 'bg-gradient-to-r from-cyan-500/15 to-indigo-500/15 text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-300'
                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                )}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </span>
                {item.key === 'prompt' && activeRunCount > 0 && (
                  <span className="rounded-full bg-cyan-500 px-2 py-0.5 text-[11px] font-bold text-slate-950">
                    {activeRunCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-slate-200/80 p-3 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setThemeModalOpen(true)}
            className="flex min-h-[42px] w-full items-center justify-between rounded-xl border px-3.5 text-xs font-semibold transition hover:brightness-110"
            style={{
              borderColor: preset.borderColor,
              background: `linear-gradient(135deg, ${preset.primary}20, ${preset.secondary}12)`,
              color: isDark ? '#f8fafc' : '#0f172a',
            }}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" style={{ color: preset.primary }} />
              <span>Custom Theme</span>
            </span>
            <span className="rounded-md bg-black/20 px-1.5 py-0.5 text-[10px] font-mono text-slate-300">
              {themeConfig.themeName.split(' ')[0]}
            </span>
          </button>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-[#090d16]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Trạng thái WS</span>
              <button
                type="button"
                onClick={onReconnectWs}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                  wsBadge.cls
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', wsBadge.dot)} />
                {wsBadge.text}
              </button>
            </div>
            {systemStatus && (
              <p className="mt-2 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                {systemStatus.tunnel_url || systemStatus.lan_url}
              </p>
            )}
          </div>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top Bar */}
        <header className="agy-glass-header pt-safe flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-3 py-2.5 backdrop-blur-xl sm:px-5 dark:border-slate-800/80 dark:bg-[#0d1322]/85">
          <div className="flex min-w-0 items-center gap-2.5 md:hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/25 text-cyan-500 ring-1 ring-cyan-500/30">
              <Activity className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold leading-tight">Antigravity Pulse</p>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {systemStatus ? `${systemStatus.hostname} • ${systemStatus.lan_ip}` : 'Đang đồng bộ PC...'}
              </p>
            </div>
          </div>

          <div className="hidden min-w-0 items-center gap-3 md:flex">
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {NAV_ITEMS.find((n) => n.key === activeTab)?.label}
            </span>
            <ProductDropdown
              label="Không gian làm việc"
              items={[
                { id: 'dashboard', title: 'Tổng quan', desc: 'Trạng thái hệ thống & PC', colorClass: 'u413-c1', icon: <Home className="w-4 h-4" />, onClick: () => onTabChange('dashboard') },
                { id: 'prompt', title: 'Prompt Agent', desc: 'Soạn thảo & chạy lệnh', colorClass: 'u413-c2', icon: <TerminalSquare className="w-4 h-4" />, onClick: () => onTabChange('prompt') },
                { id: 'projects', title: 'Dự án', desc: 'Duyệt workspace & tệp', colorClass: 'u413-c3', icon: <FolderGit2 className="w-4 h-4" />, onClick: () => onTabChange('projects') },
                { id: 'outputs', title: 'Kết quả', desc: 'Lịch sử & artifacts', colorClass: 'u413-c4', icon: <Layers className="w-4 h-4" />, onClick: () => onTabChange('outputs') },
              ]}
            />
            {pendingApprovalCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">
                <span className="h-1.5 w-1.5 animate-ping rounded-full bg-amber-500" />
                {pendingApprovalCount} yêu cầu chờ duyệt
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReconnectWs}
              className={cn(
                'inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition md:hidden',
                wsBadge.cls
              )}
              title="Nhấn để kết nối lại WebSocket"
            >
              {wsStatus === 'connected' ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : wsStatus === 'connecting' ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              <span>{wsBadge.text}</span>
            </button>

            <button
              type="button"
              onClick={() => setThemeModalOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition hover:brightness-110"
              style={{
                borderColor: preset.borderColor,
                background: `${preset.primary}1a`,
                color: isDark ? '#f8fafc' : '#0f172a',
              }}
              title="Mở Custom Theme Studio & Màn xuất hiện"
            >
              <Sparkles className="h-3.5 w-3.5" style={{ color: preset.primary }} />
              <span className="hidden sm:inline">Theme</span>
            </button>

            <ThemeSwitch
              theme={isDark ? 'dark' : 'light'}
              onThemeChange={onToggleTheme}
              defaultEffect="rain"
              size="sm"
            />
          </div>
        </header>

        {/* Scrollable Content */}
        <main className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-28 sm:px-5 sm:pt-5 md:pb-6">
          <div className="mx-auto max-w-6xl">
            {themeConfig.enabled && themeConfig.tawaGreeting && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-2xl border px-4 py-2.5 backdrop-blur-md"
                style={{
                  borderColor: preset.borderColor,
                  background: `linear-gradient(135deg, ${preset.primary}14, rgba(10, 14, 24, 0.45))`,
                }}
              >
                <p className="agy-mali-greeting text-sm font-medium text-slate-900 dark:text-slate-100">
                  {greetingText}
                </p>
                <button
                  type="button"
                  onClick={() => setThemeModalOpen(true)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold transition hover:bg-white/10"
                  style={{ color: preset.primary }}
                >
                  ✨ Tùy biến
                </button>
              </div>
            )}
            {children}
          </div>
        </main>

        {/* Mobile Bottom Navigation with Lucian #041 Notched Bar */}
        <nav
          className="pb-safe fixed inset-x-0 bottom-0 z-30 flex justify-center md:hidden pointer-events-none"
          aria-label="Điều hướng chính"
        >
          <div className="pointer-events-auto w-full max-w-md">
            <NotchedBottomTabBar
              tabs={NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return {
                  key: item.key,
                  label: item.label,
                  icon: <Icon />,
                  badge:
                    item.key === 'prompt' && activeRunCount > 0
                      ? activeRunCount
                      : item.key === 'dashboard' && pendingApprovalCount > 0
                        ? pendingApprovalCount
                        : undefined,
                };
              })}
              activeKey={activeTab}
              onChange={onTabChange}
            />
          </div>
        </nav>
      </div>
    </div>
  );
}
