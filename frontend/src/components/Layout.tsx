import { useState, type ReactNode } from 'react';
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code2,
  Command,
  FileCode,
  FolderGit2,
  FolderPlus,
  HelpCircle,
  Home,
  Layers,
  Maximize2,
  Menu,
  Minus,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Square,
  TerminalSquare,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import type { WsStatus } from '../hooks/usePulseSocket';
import { cn, formatRelativeTime } from '../lib/utils';
import type {
  ArtifactModalTarget,
  Project,
  PromptRun,
  SystemStatus,
  TabKey,
} from '../types/api';
import { useCustomTheme } from '../contexts/CustomThemeContext';
import { CustomThemeModal } from './theme/CustomThemeModal';

export interface LayoutProps {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  wsStatus: WsStatus;
  onReconnectWs: () => void;
  systemStatus: SystemStatus | null;
  pendingApprovalCount: number;
  activeRunCount: number;
  isDark: boolean;
  onToggleTheme: () => void;
  projects?: Project[];
  selectedProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  runs?: PromptRun[];
  selectedRunId?: string | null;
  onSelectRun?: (runId: string) => void;
  onNewConversation?: () => void;
  onOpenArtifact?: (target: ArtifactModalTarget) => void;
  children: ReactNode;
}

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
  projects = [],
  selectedProjectId = '',
  onSelectProject,
  runs = [],
  selectedRunId = null,
  onSelectRun,
  onNewConversation,
  onOpenArtifact,
  children,
}: LayoutProps) {
  const { config: themeConfig, preset, isThemeModalOpen, setThemeModalOpen, playTaskVoice } = useCustomTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [auxPaneOpen, setAuxPaneOpen] = useState(false);
  const [auxTab, setAuxTab] = useState<'artifacts' | 'projects' | 'system'>('artifacts');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  const wsBadge =
    wsStatus === 'connected'
      ? {
          text: 'Trực tuyến',
          dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
          cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
        }
      : wsStatus === 'connecting'
        ? {
            text: 'Đang nối...',
            dot: 'bg-amber-400 animate-pulse',
            cls: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
          }
        : {
            text: 'Mất WS',
            dot: 'bg-rose-500',
            cls: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
          };

  const handleStartNewConversation = () => {
    playTaskVoice();
    if (onNewConversation) {
      onNewConversation();
    } else {
      if (onSelectRun) onSelectRun('');
      onTabChange('prompt');
    }
  };

  return (
    <div className="agy-app-shell flex h-[100dvh] w-full flex-col overflow-hidden text-slate-100 select-none">
      {/* ============================================================== */}
      {/* ANTIGRAVITY 2.0 DESKTOP TITLEBAR                               */}
      {/* ============================================================== */}
      <header className="agy-glass-header relative z-30 flex h-10 shrink-0 items-center justify-between border-b border-white/10 bg-[#090b14]/85 px-2.5 backdrop-blur-xl sm:px-3 text-xs">
        {/* Left: Window Controls, Menu Bar, Project Selector */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Antigravity Hexagon App Icon */}
          <div
            onClick={handleStartNewConversation}
            className="group flex h-6 w-6 cursor-pointer items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 p-0.5 shadow-md shadow-indigo-500/25 transition hover:scale-105"
            title="Antigravity 2.0"
          >
            <div className="flex h-full w-full items-center justify-center rounded-[6px] bg-[#0c1020]">
              <Sparkles className="h-3.5 w-3.5 text-cyan-400 transition group-hover:rotate-12" />
            </div>
          </div>

          {/* Antigravity Desktop Menu Bar */}
          <div className="hidden lg:flex items-center gap-0.5 font-medium text-slate-300">
            {['Antigravity', 'Workspace', 'View', 'Window'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setActiveMenu(activeMenu === item ? null : item)}
                className={cn(
                  'rounded px-2 py-1 text-[11px] transition hover:bg-white/10 hover:text-white',
                  activeMenu === item && 'bg-white/15 text-white'
                )}
              >
                {item}
              </button>
            ))}
          </div>

          {/* Navigation Arrows */}
          <div className="hidden sm:flex items-center gap-0.5 pl-1 text-slate-400">
            <button
              type="button"
              onClick={() => window.history.back()}
              className="rounded p-1 hover:bg-white/10 hover:text-slate-200"
              title="Quay lại"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => window.history.forward()}
              className="rounded p-1 hover:bg-white/10 hover:text-slate-200"
              title="Tiếp theo"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Sidebar Toggle Button */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            title="Đóng / mở thanh bên"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Project Selector Trigger */}
          <div className="relative">
            <button
              type="button"
              data-testid="project-selector-trigger"
              onClick={() => setProjectDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:border-white/20"
            >
              <FolderGit2 className="h-3 w-3 text-cyan-400" />
              <span className="max-w-[120px] truncate">{selectedProject?.name || 'App'}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-60" />
            </button>

            {projectDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 w-56 rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Chọn Workspace PC
                </div>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (onSelectProject) onSelectProject(p.id);
                      setProjectDropdownOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition',
                      p.id === selectedProject?.id
                        ? 'bg-cyan-500/20 text-cyan-300 font-semibold'
                        : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    )}
                  >
                    <span className="truncate">{p.name}</span>
                    {p.id === selectedProject?.id && <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: Command Palette / Search Bar */}
        <div className="hidden md:flex flex-1 max-w-sm mx-4">
          <div className="flex h-6 w-full items-center justify-between rounded-md border border-white/10 bg-white/5 px-2.5 text-[11px] text-slate-400 shadow-inner hover:border-white/20 transition">
            <span className="flex items-center gap-1.5">
              <Search className="h-3 w-3" />
              <span>Search or type a command...</span>
            </span>
            <kbd className="rounded bg-white/10 px-1 py-0.2 text-[9px] font-mono text-slate-300">
              Ctrl+K
            </kbd>
          </div>
        </div>

        {/* Right: Custom Theme, Aux Pane, Mode, Window Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Custom Theme Quick Pill */}
          <button
            type="button"
            onClick={() => setThemeModalOpen(true)}
            className="group flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium transition hover:brightness-110"
            style={{
              borderColor: preset.borderColor,
              background: `linear-gradient(135deg, ${preset.primary}25, ${preset.secondary}15)`,
              color: preset.primary,
            }}
            title="Mở Custom Theme Studio"
          >
            <Sparkles className="h-3 w-3 group-hover:rotate-12 transition-transform" />
            <span className="hidden sm:inline font-semibold">Custom Theme</span>
            <span className="rounded bg-black/30 px-1 py-0.2 text-[9px] font-mono text-slate-300">
              {themeConfig.themeName.split(' ')[0]}
            </span>
          </button>

          {/* Right Auxiliary Panel Toggle */}
          <button
            type="button"
            onClick={() => setAuxPaneOpen((p) => !p)}
            className={cn(
              'rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200 transition',
              auxPaneOpen && 'bg-white/15 text-cyan-400'
            )}
            title="Đóng / mở Auxiliary Panel (Artifacts, Files)"
          >
            {auxPaneOpen ? (
              <PanelRightClose className="h-3.5 w-3.5" />
            ) : (
              <PanelRightOpen className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Theme Mode Toggle (Dark/Light) */}
          <button
            type="button"
            onClick={onToggleTheme}
            className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            title="Đổi giao diện Sáng / Tối"
          >
            <Activity className="h-3.5 w-3.5" />
          </button>

          {/* Desktop Windows Action Buttons */}
          <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-white/10">
            <button
              type="button"
              className="flex h-5 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-200"
              title="Thu nhỏ"
            >
              <Minus className="h-3 w-3" />
            </button>
            <button
              type="button"
              className="flex h-5 w-6 items-center justify-center rounded text-slate-400 hover:bg-white/10 hover:text-slate-200"
              title="Phóng to"
            >
              <Square className="h-2.5 w-2.5" />
            </button>
            <button
              type="button"
              className="flex h-5 w-6 items-center justify-center rounded text-slate-400 hover:bg-rose-500 hover:text-white"
              title="Đóng"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* MAIN BODY: SIDEBAR + CANVAS + AUXILIARY PANE                  */}
      {/* ============================================================== */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* ============================================================ */}
        {/* LEFT SIDEBAR (.bg-sidebar)                                  */}
        {/* ============================================================ */}
        {sidebarOpen && (
          <aside className="agy-glass-sidebar z-20 flex w-64 shrink-0 flex-col border-r border-white/10 bg-[#0c0f1c]/80 backdrop-blur-xl">
            {/* Top Action: + New Conversation */}
            <div className="p-3">
              <button
                type="button"
                onClick={handleStartNewConversation}
                className="group relative flex w-full items-center justify-between rounded-xl p-[1.5px] transition hover:scale-[1.01]"
                style={{
                  background:
                    'linear-gradient(135deg, var(--ct-primary, #38bdf8), var(--ct-secondary, #c084fc))',
                  boxShadow: '0 4px 18px rgba(0,0,0,0.4), 0 0 12px var(--ct-glow, rgba(56,189,248,0.25))',
                }}
              >
                <div className="flex h-10 w-full items-center justify-between rounded-[10px] bg-[#0d1222] px-3.5 text-xs font-bold text-white transition group-hover:bg-[#11172c]">
                  <span className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-cyan-400 transition-transform group-hover:rotate-90" />
                    <span>New Conversation</span>
                  </span>
                  <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                    Ctrl+N
                  </kbd>
                </div>
              </button>
            </div>

            {/* Main Navigation Items */}
            <div className="px-2 space-y-0.5">
              <button
                type="button"
                onClick={() => onTabChange('dashboard')}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                  activeTab === 'dashboard'
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  <span>Automations</span>
                </span>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.2 text-[10px] font-bold text-amber-300">
                  {activeRunCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('projects')}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
                  activeTab === 'projects'
                    ? 'bg-white/15 text-white font-semibold'
                    : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Code2 className="h-3.5 w-3.5 text-purple-400" />
                  <span>Customizations</span>
                </span>
                <span className="text-[10px] text-slate-500">Skills & Tools</span>
              </button>

              <button
                type="button"
                onClick={() => setThemeModalOpen(true)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                  <span>Custom theme</span>
                </span>
                <span className="text-[10px] text-pink-400/80 font-mono">
                  {themeConfig.themeName.split(' ')[0]}
                </span>
              </button>
            </div>

            {/* Scrollable Conversation List & Projects */}
            <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
              {/* SECTION: PINNED */}
              <div>
                <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Pinned
                </div>
                <div className="space-y-0.5">
                  <div
                    onClick={handleStartNewConversation}
                    className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10 hover:text-white transition"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <span className="text-amber-400 text-xs">📌</span>
                      <span className="truncate">Chào mừng Sensei (Tawa)</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION: PROJECTS */}
              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Projects</span>
                  <span className="text-[9px] text-slate-500 font-mono">{projects.length}</span>
                </div>
                <div className="space-y-0.5">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => {
                        if (onSelectProject) onSelectProject(proj.id);
                        onTabChange('projects');
                      }}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition',
                        proj.id === selectedProjectId
                          ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                      )}
                    >
                      <span className="flex items-center gap-2 truncate">
                        <FolderGit2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{proj.name}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* SECTION: RECENTS (Recent Conversations) */}
              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Recent Conversations</span>
                  <span className="text-[9px] text-slate-500 font-mono">{runs.length}</span>
                </div>
                <div className="space-y-0.5">
                  {runs.length === 0 ? (
                    <p className="px-2.5 py-2 text-[11px] text-slate-500 italic">
                      Chưa có phiên prompt nào
                    </p>
                  ) : (
                    runs.slice(0, 15).map((r) => {
                      const isSelected = r.id === selectedRunId && activeTab === 'prompt';
                      const statusDot =
                        r.status === 'completed'
                          ? 'bg-emerald-400'
                          : r.status === 'running'
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-rose-400';

                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            if (onSelectRun) onSelectRun(r.id);
                            onTabChange('prompt');
                          }}
                          className={cn(
                            'group flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-xs text-left transition',
                            isSelected
                              ? 'bg-white/15 text-white font-semibold shadow-sm'
                              : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot)} />
                            <span className="truncate">{r.prompt}</span>
                          </div>
                          <span className="shrink-0 pl-1 text-[9px] text-slate-500 opacity-80 group-hover:opacity-100">
                            {formatRelativeTime(r.created_at)}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Status & Settings Bar */}
            <div className="border-t border-white/10 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => onTabChange('settings')}
                  className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 transition"
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Cài đặt</span>
                </button>

                <button
                  type="button"
                  onClick={onReconnectWs}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition',
                    wsBadge.cls
                  )}
                  title="Nhấn để kết nối lại WebSocket"
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', wsBadge.dot)} />
                  {wsBadge.text}
                </button>
              </div>

              {systemStatus && (
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span className="truncate">{systemStatus.hostname || 'Antigravity PC'}</span>
                  <span>127.0.0.1:8765</span>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* ============================================================ */}
        {/* CENTER CANVAS ([data-main-content-body="true"])              */}
        {/* ============================================================ */}
        <main
          data-main-content-body="true"
          className="relative flex flex-1 flex-col overflow-y-auto"
        >
          {children}
        </main>

        {/* ============================================================ */}
        {/* RIGHT AUXILIARY PANE (Split view for files, artifacts, etc.) */}
        {/* ============================================================ */}
        {auxPaneOpen && (
          <aside className="agy-glass-sidebar z-20 flex w-80 shrink-0 flex-col border-l border-white/10 bg-[#0c0f1c]/85 backdrop-blur-xl animate-in slide-in-from-right-10 duration-200">
            {/* Header of Aux Pane */}
            <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs font-semibold">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setAuxTab('artifacts')}
                  className={cn(
                    'rounded px-2 py-1 text-[11px] transition',
                    auxTab === 'artifacts' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  Artifacts
                </button>
                <button
                  type="button"
                  onClick={() => setAuxTab('projects')}
                  className={cn(
                    'rounded px-2 py-1 text-[11px] transition',
                    auxTab === 'projects' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  Files
                </button>
                <button
                  type="button"
                  onClick={() => setAuxTab('system')}
                  className={cn(
                    'rounded px-2 py-1 text-[11px] transition',
                    auxTab === 'system' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  Status
                </button>
              </div>

              <button
                type="button"
                onClick={() => setAuxPaneOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Aux Pane Body */}
            <div className="flex-1 overflow-y-auto p-3 text-xs text-slate-300">
              {auxTab === 'artifacts' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400">
                    Các tệp báo cáo, mã nguồn và kết quả do Agent tạo ra trên PC.
                  </p>
                  <button
                    type="button"
                    onClick={() => onTabChange('outputs')}
                    className="w-full rounded-lg border border-white/10 bg-white/5 py-2 text-center text-xs font-medium text-cyan-400 hover:bg-white/10"
                  >
                    Mở toàn bộ Artifacts & Thư mục Brain →
                  </button>
                </div>
              )}

              {auxTab === 'projects' && (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400">
                    Cây thư mục và mã nguồn dự án: <b>{selectedProject?.name}</b>
                  </p>
                  <p className="font-mono text-[10px] text-slate-500 break-all">
                    {selectedProject?.root_path}
                  </p>
                </div>
              )}

              {auxTab === 'system' && (
                <div className="space-y-3 font-mono text-[11px]">
                  <div>
                    <span className="text-slate-500">Host:</span> {systemStatus?.hostname}
                  </div>
                  <div>
                    <span className="text-slate-500">Platform:</span> {systemStatus?.os_info}
                  </div>
                  <div>
                    <span className="text-slate-500">LAN IP:</span> {systemStatus?.lan_ip}
                  </div>
                  <div>
                    <span className="text-slate-500">Active Runs:</span> {activeRunCount}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ============================================================== */}
      {/* 1:1 CUSTOM THEME STUDIO MODAL (Opened by ⭐ Custom theme)      */}
      {/* ============================================================== */}
      {isThemeModalOpen && <CustomThemeModal />}
    </div>
  );
}
