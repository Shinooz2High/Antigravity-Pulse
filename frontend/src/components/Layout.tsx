import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  Download,
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
import { api } from '../lib/api';
import type { ConversationThread } from '../lib/conversations';
import {
  AppDownloadCard,
  CommandSearch,
  FileTreeExplorer,
  QrShareCard,
  TrashLidButton,
  UndoCountdownPill,
  type CommandSearchItem,
  type FileTreeNode,
} from './library';

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
  onCreateProject?: (input: {
    name: string;
    path: string;
    description?: string;
  }) => Promise<void>;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  runs?: PromptRun[];
  selectedRunId?: string | null;
  conversations?: ConversationThread[];
  selectedConversationId?: string | null;
  onSelectConversation?: (convId: string) => void;
  onMergeAllConversations?: () => void;
  onDeleteConversation?: (convId: string) => void;
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
  onCreateProject,
  onDeleteProject,
  runs = [],
  selectedRunId = null,
  conversations = [],
  selectedConversationId = null,
  onSelectConversation,
  onMergeAllConversations,
  onDeleteConversation,
  onSelectRun,
  onNewConversation,
  onOpenArtifact,
  children,
}: LayoutProps) {
  const { config: themeConfig, preset, isThemeModalOpen, setThemeModalOpen, playTaskVoice } = useCustomTheme();
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [auxPaneOpen, setAuxPaneOpen] = useState(false);
  const [auxTab, setAuxTab] = useState<'artifacts' | 'projects' | 'system'>('artifacts');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [createProjectModalOpen, setCreateProjectModalOpen] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjPath, setNewProjPath] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'conversation' | 'project';
    id: string;
    title: string;
    token: number;
  } | null>(null);
  const [restoringItem, setRestoringItem] = useState<{
    kind: 'conversation' | 'project';
    id: string;
  } | null>(null);
  const [fileTreeNodes, setFileTreeNodes] = useState<FileTreeNode[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [loadingRootTree, setLoadingRootTree] = useState(false);

  const closeSidebarOnMobile = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  const selectedProject =
    projects.find((p) => p.id === selectedProjectId) || projects[0] || null;

  // Load root directory entries for Lucian #102 FileTreeExplorer when Aux Files tab opens
  useEffect(() => {
    if (!auxPaneOpen || auxTab !== 'projects' || !selectedProject?.id) return;
    let cancelled = false;
    setLoadingRootTree(true);
    api
      .getProjectFiles(selectedProject.id, '')
      .then((res) => {
        if (cancelled) return;
        const nodes: FileTreeNode[] = (res.entries || []).map((entry) => ({
          path: entry.rel_path,
          name: entry.name,
          isDir: entry.is_dir,
          loaded: false,
          children: [],
        }));
        setFileTreeNodes(nodes);
      })
      .catch(() => {
        if (!cancelled) setFileTreeNodes([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingRootTree(false);
      });
    return () => {
      cancelled = true;
    };
  }, [auxPaneOpen, auxTab, selectedProject?.id]);

  const handleLoadFolder = async (folderNode: FileTreeNode) => {
    if (!selectedProject?.id) return;
    try {
      const res = await api.getProjectFiles(selectedProject.id, folderNode.path);
      const children: FileTreeNode[] = (res.entries || []).map((entry) => ({
        path: entry.rel_path,
        name: entry.name,
        isDir: entry.is_dir,
        loaded: false,
        children: [],
      }));
      const attach = (list: FileTreeNode[]): FileTreeNode[] =>
        list.map((n) => {
          if (n.path === folderNode.path) {
            return { ...n, loaded: true, children };
          }
          if (n.children && n.children.length > 0) {
            return { ...n, children: attach(n.children) };
          }
          return n;
        });
      setFileTreeNodes((prev) => attach(prev));
    } catch {
      // ignore folder read error
    }
  };

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
    closeSidebarOnMobile();
    if (onNewConversation) {
      onNewConversation();
    } else {
      if (onSelectRun) onSelectRun('');
      onTabChange('prompt');
    }
  };

  const commandItems = useMemo<CommandSearchItem[]>(() => {
    const actions: CommandSearchItem[] = [
      {
        id: 'cmd-new-chat',
        kind: 'action',
        title: 'New Conversation',
        meta: 'Action',
        onSelect: () => {
          playTaskVoice();
          if (onNewConversation) onNewConversation();
          else {
            onSelectRun?.('');
            onTabChange('prompt');
          }
        },
      },
      {
        id: 'cmd-custom-theme',
        kind: 'action',
        title: 'Custom Theme Studio',
        meta: 'Theme',
        onSelect: () => setThemeModalOpen(true),
      },
      {
        id: 'cmd-automations',
        kind: 'doc',
        title: 'Automations & Tổng quan PC',
        meta: 'Dashboard',
        onSelect: () => onTabChange('dashboard'),
      },
      {
        id: 'cmd-outputs',
        kind: 'doc',
        title: 'Outputs & Artifacts',
        meta: 'Brain',
        onSelect: () => onTabChange('outputs'),
      },
      {
        id: 'cmd-settings',
        kind: 'action',
        title: 'Cài đặt hệ thống & Model',
        meta: 'Settings',
        onSelect: () => onTabChange('settings'),
      },
    ];

    const projectItems: CommandSearchItem[] = projects.map((p) => ({
      id: `proj-${p.id}`,
      kind: 'project',
      title: p.name,
      meta: 'Project',
      onSelect: () => {
        onSelectProject?.(p.id);
        onTabChange('projects');
      },
    }));

    const convItems: CommandSearchItem[] =
      conversations.length > 0
        ? conversations.slice(0, 12).map((conv) => ({
            id: `conv-${conv.id}`,
            kind: 'chat',
            title: conv.title,
            meta: `${conv.runs.length} tin · ${conv.projectName}`,
            onSelect: () => {
              onSelectConversation?.(conv.id);
              onTabChange('prompt');
            },
          }))
        : runs.slice(0, 12).map((r) => ({
            id: `run-${r.id}`,
            kind: 'chat',
            title: r.prompt,
            meta: r.project_name || 'Chat',
            onSelect: () => {
              onSelectRun?.(r.id);
              onTabChange('prompt');
            },
          }));

    return [...actions, ...projectItems, ...convItems];
  }, [projects, runs, conversations, onNewConversation, onSelectConversation, onSelectProject, onSelectRun, onTabChange, playTaskVoice, setThemeModalOpen]);

  return (
    <div className="agy-app-shell flex h-[100dvh] w-full max-w-[100vw] flex-col overflow-hidden text-slate-100 select-none">
      {/* ============================================================== */}
      {/* ANTIGRAVITY 2.0 DESKTOP TITLEBAR (Mobile Safe-Area Ready)      */}
      {/* ============================================================== */}
      <header className="agy-glass-header pt-safe relative z-30 flex min-h-[46px] shrink-0 items-center justify-between gap-1.5 border-b border-white/10 bg-[#090b14]/85 px-2 backdrop-blur-xl sm:px-3 md:min-h-[40px] md:h-10 text-xs">
        {/* Left: Window Controls, Menu Bar, Project Selector */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {/* Sidebar Toggle Button (Prominent first on mobile) */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
            title="Đóng / mở menu"
            aria-label="Đóng / mở menu"
          >
            {sidebarOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>

          {/* Official Antigravity App Logo */}
          <button
            type="button"
            onClick={handleStartNewConversation}
            className="group flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md transition hover:scale-105"
            title="Antigravity"
          >
            <img
              src="/agy-logo.png"
              alt="Antigravity"
              className="h-6 w-6 rounded-md object-contain drop-shadow-[0_0_8px_rgba(56,189,248,0.35)]"
            />
          </button>

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

          {/* Desktop Sidebar Toggle Button */}
          <button
            type="button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="hidden md:flex rounded p-1 text-slate-400 hover:bg-white/10 hover:text-slate-200"
            title="Đóng / mở thanh bên"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-3.5 w-3.5" />
            ) : (
              <PanelLeftOpen className="h-3.5 w-3.5" />
            )}
          </button>

          {/* Project Selector Trigger */}
          <div className="relative min-w-0">
            <button
              type="button"
              data-testid="project-selector-trigger"
              onClick={() => setProjectDropdownOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 md:py-0.5 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10 hover:border-white/20"
            >
              <FolderGit2 className="h-3 w-3 shrink-0 text-cyan-400" />
              <span className="max-w-[92px] sm:max-w-[120px] truncate">{selectedProject?.name || 'App'}</span>
              <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-60" />
            </button>

            {projectDropdownOpen && (
              <div
                className="absolute left-0 top-full mt-1.5 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/15 bg-[#0f1424]/95 p-1 shadow-2xl backdrop-blur-2xl z-50 animate-in fade-in zoom-in-95 duration-150"
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

        {/* Center: Live Lucian #429 Command Palette / Search Bar */}
        <div className="hidden md:flex flex-1 max-w-sm mx-4">
          <CommandSearch
            compact
            items={commandItems}
            placeholder="Search or type a command..."
          />
        </div>

        {/* Right: Mobile Search, Custom Theme, Aux Pane, Mode, Window Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Mobile Search Trigger */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 hover:bg-white/10 hover:text-white md:hidden"
            title="Tìm kiếm lệnh & dự án"
            aria-label="Tìm kiếm lệnh & dự án"
          >
            <Search className="h-4 w-4" />
          </button>
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
      {/* MAIN BODY: SIDEBAR (Drawer on mobile) + CANVAS + AUX PANE      */}
      {/* ============================================================== */}
      <div className="relative flex min-w-0 flex-1 overflow-hidden">
        {/* Mobile Backdrop for Left Sidebar or Right Aux Pane */}
        {(sidebarOpen || auxPaneOpen) && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={() => {
              setSidebarOpen(false);
              setAuxPaneOpen(false);
            }}
            aria-hidden="true"
          />
        )}

        {/* ============================================================ */}
        {/* LEFT SIDEBAR (.bg-sidebar)                                   */}
        {/* ============================================================ */}
        {sidebarOpen && (
          <aside className="agy-glass-sidebar pb-safe fixed inset-y-0 left-0 z-40 flex w-[82vw] max-w-[288px] shrink-0 flex-col border-r border-white/10 bg-[#0c0f1c]/95 backdrop-blur-xl shadow-2xl md:static md:z-20 md:w-64 md:bg-[#0c0f1c]/80 md:shadow-none">
            {/* Mobile Drawer Top Header */}
            <div className="pt-safe flex items-center justify-between border-b border-white/10 px-3 py-2.5 md:hidden">
              <span className="flex items-center gap-2 text-xs font-bold text-white">
                <img
                  src="/agy-logo.png"
                  alt="Antigravity"
                  className="h-5 w-5 rounded object-contain"
                />
                Antigravity
              </span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Đóng thanh bên"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

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
                  <kbd className="hidden sm:inline rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-mono text-slate-300">
                    Ctrl+N
                  </kbd>
                </div>
              </button>
            </div>

            {/* Main Navigation Items */}
            <div className="px-2 space-y-0.5">
              <button
                type="button"
                onClick={() => {
                  onTabChange('dashboard');
                  closeSidebarOnMobile();
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 md:py-1.5 text-xs font-medium transition',
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
                onClick={() => {
                  onTabChange('projects');
                  closeSidebarOnMobile();
                }}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 md:py-1.5 text-xs font-medium transition',
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
                onClick={() => {
                  setThemeModalOpen(true);
                  closeSidebarOnMobile();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 md:py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
              >
                <span className="flex items-center gap-2.5">
                  <Sparkles className="h-3.5 w-3.5 text-pink-400" />
                  <span>Custom theme</span>
                </span>
                <span className="text-[10px] text-pink-400/80 font-mono">
                  {themeConfig.themeName.split(' ')[0]}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setDownloadModalOpen(true);
                  closeSidebarOnMobile();
                }}
                className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 md:py-1.5 text-xs font-medium text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
              >
                <span className="flex items-center gap-2.5">
                  <Download className="h-3.5 w-3.5 text-amber-400" />
                  <span>Tải Desktop App</span>
                </span>
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">
                  Đang phát triển
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
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] text-slate-500 font-mono">{projects.length}</span>
                    {onCreateProject && (
                      <button
                        type="button"
                        onClick={() => {
                          setCreateProjectError(null);
                          setCreateProjectModalOpen(true);
                          closeSidebarOnMobile();
                        }}
                        className="flex h-4 w-4 items-center justify-center rounded bg-white/10 text-slate-300 transition hover:bg-cyan-500/25 hover:text-cyan-300"
                        title="Thêm dự án mới"
                        aria-label="Thêm dự án mới"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <ul className="space-y-0.5 m-0 p-0 list-none" aria-label="Projects">
                  {projects.length === 0 ? (
                    <li className="px-2.5 py-2 text-[11px] text-slate-500 italic">
                      Chưa có dự án nào
                    </li>
                  ) : (
                    projects.map((proj) => {
                      const isGone =
                        pendingDelete?.kind === 'project' && pendingDelete.id === proj.id;
                      const isBack =
                        restoringItem?.kind === 'project' && restoringItem.id === proj.id;

                      return (
                        <li
                          key={proj.id}
                          className={cn(
                            'u470-r',
                            isGone && 'is-gone',
                            isBack && 'is-back'
                          )}
                        >
                          <div>
                            <div
                              className={cn(
                                'u470-in group px-1.5 py-1 text-xs transition',
                                proj.id === selectedProjectId
                                  ? 'bg-cyan-500/15 text-cyan-300 font-semibold'
                                  : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectProject) onSelectProject(proj.id);
                                  onTabChange('projects');
                                  closeSidebarOnMobile();
                                }}
                                className="flex min-w-0 flex-1 items-center gap-2 py-0.5 pl-1 text-left"
                              >
                                <FolderGit2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                <span className="truncate">{proj.name}</span>
                              </button>

                              {onDeleteProject && (
                                <TrashLidButton
                                  label={`Xóa dự án "${proj.name}"`}
                                  className="opacity-65 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (pendingDelete) {
                                      if (pendingDelete.kind === 'conversation') {
                                        onDeleteConversation?.(pendingDelete.id);
                                      } else if (pendingDelete.id !== proj.id) {
                                        onDeleteProject(pendingDelete.id);
                                      }
                                    }
                                    setRestoringItem(null);
                                    setPendingDelete({
                                      kind: 'project',
                                      id: proj.id,
                                      title: proj.name,
                                      token: Date.now(),
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              {/* SECTION: RECENTS (Recent Conversations) */}
              <div>
                <div className="flex items-center justify-between px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <span>Recent Conversations</span>
                  <div className="flex items-center gap-1.5">
                    {conversations.length > 1 && onMergeAllConversations && (
                      <button
                        type="button"
                        onClick={onMergeAllConversations}
                        className="rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-semibold normal-case text-cyan-300 transition hover:bg-cyan-500/20"
                        title="Gộp tất cả thành 1 cuộc trò chuyện"
                      >
                        Gộp 1
                      </button>
                    )}
                    <span className="text-[9px] text-slate-500 font-mono">
                      {conversations.length}
                    </span>
                    <button
                      type="button"
                      onClick={handleStartNewConversation}
                      className="flex h-4 w-4 items-center justify-center rounded bg-white/10 text-slate-300 transition hover:bg-cyan-500/25 hover:text-cyan-300"
                      title="Tạo cuộc trò chuyện mới"
                      aria-label="Tạo cuộc trò chuyện mới"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <ul className="space-y-0.5 m-0 p-0 list-none" aria-label="Recent Conversations">
                  {conversations.length === 0 ? (
                    <li className="px-2.5 py-2 text-[11px] text-slate-500 italic">
                      Chưa có cuộc trò chuyện nào
                    </li>
                  ) : (
                    conversations.slice(0, 15).map((conv) => {
                      const isSelected =
                        conv.id === selectedConversationId && activeTab === 'prompt';
                      const isGone =
                        pendingDelete?.kind === 'conversation' && pendingDelete.id === conv.id;
                      const isBack =
                        restoringItem?.kind === 'conversation' && restoringItem.id === conv.id;
                      const statusDot =
                        conv.status === 'completed'
                          ? 'bg-emerald-400'
                          : conv.status === 'running' ||
                              conv.status === 'queued' ||
                              conv.status === 'awaiting_approval'
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-rose-400';

                      return (
                        <li
                          key={conv.id}
                          className={cn(
                            'u470-r',
                            isGone && 'is-gone',
                            isBack && 'is-back'
                          )}
                        >
                          <div>
                            <div
                              className={cn(
                                'u470-in group px-1.5 py-1 text-xs transition',
                                isSelected
                                  ? 'bg-white/15 text-white font-semibold shadow-sm'
                                  : 'text-slate-400 hover:bg-white/10 hover:text-slate-200'
                              )}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  if (onSelectConversation) onSelectConversation(conv.id);
                                  else if (onSelectRun) onSelectRun(conv.latestRun.id);
                                  onTabChange('prompt');
                                  closeSidebarOnMobile();
                                }}
                                className="flex min-w-0 flex-1 items-center justify-between gap-1.5 py-0.5 pl-1 text-left"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={cn('h-1.5 w-1.5 shrink-0 rounded-full', statusDot)}
                                  />
                                  <span className="truncate">{conv.title}</span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1">
                                  {conv.runs.length > 1 && (
                                    <span className="rounded bg-white/10 px-1 py-0.2 text-[9px] font-mono text-slate-300">
                                      {conv.runs.length}
                                    </span>
                                  )}
                                  <span className="text-[9px] text-slate-500 opacity-80 group-hover:opacity-100">
                                    {formatRelativeTime(conv.updatedAt)}
                                  </span>
                                </div>
                              </button>

                              {onDeleteConversation && (
                                <TrashLidButton
                                  label={`Xóa hội thoại "${conv.title}"`}
                                  className="opacity-65 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (pendingDelete) {
                                      if (pendingDelete.kind === 'project') {
                                        onDeleteProject?.(pendingDelete.id);
                                      } else if (pendingDelete.id !== conv.id) {
                                        onDeleteConversation(pendingDelete.id);
                                      }
                                    }
                                    setRestoringItem(null);
                                    setPendingDelete({
                                      kind: 'conversation',
                                      id: conv.id,
                                      title: conv.title,
                                      token: Date.now(),
                                    });
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>
            </div>

            {/* Bottom Status & Settings Bar */}
            <div className="border-t border-white/10 p-2.5 space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    onTabChange('settings');
                    closeSidebarOnMobile();
                  }}
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
          className="relative flex min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
        >
          {children}
        </main>

        {/* ============================================================ */}
        {/* RIGHT AUXILIARY PANE (Drawer on mobile, split on desktop)    */}
        {/* ============================================================ */}
        {auxPaneOpen && (
          <aside className="agy-glass-sidebar pt-safe pb-safe fixed inset-y-0 right-0 z-40 flex w-[86vw] max-w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#0c0f1c]/95 backdrop-blur-xl shadow-2xl animate-in slide-in-from-right-10 duration-200 md:static md:z-20 md:w-80 md:bg-[#0c0f1c]/85 md:pt-0 md:shadow-none">
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[11px] text-slate-400">
                      Workspace: <b className="text-slate-200">{selectedProject?.name || 'App'}</b>
                    </p>
                    <button
                      type="button"
                      onClick={() => onTabChange('projects')}
                      className="shrink-0 text-[10px] font-semibold text-cyan-400 hover:underline"
                    >
                      Mở full →
                    </button>
                  </div>
                  <p className="font-mono text-[10px] text-slate-500 break-all">
                    {selectedProject?.root_path}
                  </p>
                  {loadingRootTree ? (
                    <p className="py-4 text-center text-[11px] text-slate-400">
                      Đang tải cây thư mục...
                    </p>
                  ) : (
                    <FileTreeExplorer
                      nodes={fileTreeNodes}
                      selectedPath={selectedFilePath}
                      onLoadFolder={handleLoadFolder}
                      onSelectFile={(node) => {
                        setSelectedFilePath(node.path);
                        if (selectedProject && onOpenArtifact) {
                          onOpenArtifact({
                            kind: 'project_file',
                            projectId: selectedProject.id,
                            projectName: selectedProject.name,
                            relPath: node.path,
                            name: node.name,
                          });
                        }
                      }}
                    />
                  )}
                </div>
              )}

              {auxTab === 'system' && (
                <div className="space-y-4">
                  <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3 font-mono text-[11px]">
                    <div>
                      <span className="text-slate-500">Host:</span> {systemStatus?.hostname || 'Antigravity PC'}
                    </div>
                    <div>
                      <span className="text-slate-500">Platform:</span> {systemStatus?.os_info || 'Windows'}
                    </div>
                    <div>
                      <span className="text-slate-500">LAN IP:</span> {systemStatus?.lan_ip || '127.0.0.1'}
                    </div>
                    <div>
                      <span className="text-slate-500">Active Runs:</span> {activeRunCount}
                    </div>
                  </div>

                  {/* Lucian #478 Animated QR Pairing Card */}
                  <div>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Quét QR mở nhanh trên điện thoại
                    </p>
                    <QrShareCard
                      url={
                        systemStatus?.tunnel_url ||
                        systemStatus?.lan_url ||
                        (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4173')
                      }
                    />
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ============================================================== */}
      {/* MOBILE COMMAND SEARCH OVERLAY (#429)                           */}
      {/* ============================================================== */}
      {mobileSearchOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 px-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm md:hidden"
          onClick={() => setMobileSearchOpen(false)}
        >
          <div
            className="mx-auto w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CommandSearch
              autoFocus
              items={commandItems}
              placeholder="Tìm lệnh, dự án, hội thoại..."
              onClose={() => setMobileSearchOpen(false)}
            />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* DESKTOP APP DOWNLOAD MODAL (Windows / macOS / Linux - Dev)     */}
      {/* ============================================================== */}
      {downloadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
          onClick={() => setDownloadModalOpen(false)}
        >
          <div
            className="relative w-full max-w-[420px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setDownloadModalOpen(false)}
              aria-label="Đóng"
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
            <AppDownloadCard />
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1:1 CUSTOM THEME STUDIO MODAL (Opened by ⭐ Custom theme)      */}
      {/* ============================================================== */}
      {isThemeModalOpen && <CustomThemeModal />}

      {/* ============================================================== */}
      {/* QUICK ADD PROJECT MODAL (Triggered by (+) next to Projects)    */}
      {/* ============================================================== */}
      {createProjectModalOpen && onCreateProject && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md"
          onClick={() => !creatingProject && setCreateProjectModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0e1324]/95 p-5 shadow-2xl backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FolderPlus className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-bold text-white">Thêm dự án mới</h3>
              </div>
              <button
                type="button"
                disabled={creatingProject}
                onClick={() => setCreateProjectModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newProjName.trim();
                const path = newProjPath.trim();
                if (!name || !path) {
                  setCreateProjectError('Vui lòng nhập đầy đủ Tên dự án và Đường dẫn thư mục trên PC.');
                  return;
                }
                setCreatingProject(true);
                setCreateProjectError(null);
                try {
                  await onCreateProject({
                    name,
                    path,
                    description: newProjDesc.trim() || undefined,
                  });
                  setNewProjName('');
                  setNewProjPath('');
                  setNewProjDesc('');
                  setCreateProjectModalOpen(false);
                } catch (err) {
                  setCreateProjectError(
                    err instanceof Error ? err.message : 'Không thể tạo dự án mới.'
                  );
                } finally {
                  setCreatingProject(false);
                }
              }}
            >
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                  Tên dự án
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newProjName}
                  onChange={(e) => setNewProjName(e.target.value)}
                  placeholder="Ví dụ: My NextJS App"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/60"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                  Đường dẫn thư mục trên PC
                </label>
                <input
                  type="text"
                  value={newProjPath}
                  onChange={(e) => setNewProjPath(e.target.value)}
                  placeholder="Ví dụ: D:\Projects\my-app hoặc ~/projects/my-app"
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/60"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-slate-300">
                  Mô tả ngắn (tùy chọn)
                </label>
                <input
                  type="text"
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  placeholder="Ghi chú về dự án..."
                  className="w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-cyan-400/60"
                />
              </div>

              {createProjectError && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">
                  {createProjectError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={creatingProject}
                  onClick={() => setCreateProjectModalOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creatingProject}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-xs font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                >
                  {creatingProject ? 'Đang tạo...' : 'Tạo dự án'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* LUCIAN #470 FLOATING 5s COUNTDOWN RING UNDO PILL               */}
      {/* ============================================================== */}
      <UndoCountdownPill
        open={Boolean(pendingDelete)}
        itemLabel={pendingDelete?.title}
        resetKey={pendingDelete?.token ?? 0}
        onUndo={() => {
          if (!pendingDelete) return;
          const restored = { kind: pendingDelete.kind, id: pendingDelete.id };
          setPendingDelete(null);
          setRestoringItem(restored);
          window.setTimeout(() => {
            setRestoringItem((cur) =>
              cur && cur.kind === restored.kind && cur.id === restored.id ? null : cur
            );
          }, 800);
        }}
        onExpire={() => {
          if (!pendingDelete) return;
          const target = pendingDelete;
          setPendingDelete(null);
          if (target.kind === 'conversation') {
            onDeleteConversation?.(target.id);
          } else {
            onDeleteProject?.(target.id);
          }
        }}
      />
    </div>
  );
}
