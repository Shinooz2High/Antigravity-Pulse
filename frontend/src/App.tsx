import { useCallback, useEffect, useRef, useState } from 'react';
import { ArtifactModal } from './components/ArtifactModal';
import { AuthScreen } from './components/AuthScreen';
import { Layout } from './components/Layout';
import { ToolApprovalBanner } from './components/ToolApprovalBanner';
import { StackingToasts } from './components/library';
import { useCustomTheme } from './contexts/CustomThemeContext';
import { usePulseSocket } from './hooks/usePulseSocket';
import {
  api,
  clearToken,
  getDeviceName,
  getServerUrl,
  parsePairingInput,
  setDeviceName,
  setServerUrl,
  setToken,
  setUnauthorizedHandler,
} from './lib/api';
import {
  hasNotificationPermission,
  hideNativeSplash,
  isNativeApp,
  registerNativeLifecycle,
  requestAppNotificationPermission,
  sendAppNotification,
  syncNativeTheme,
  triggerHaptic,
} from './lib/native';
import { DashboardPage } from './pages/DashboardPage';
import { OutputsPage } from './pages/OutputsPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { PromptPage } from './pages/PromptPage';
import { SettingsPage } from './pages/SettingsPage';
import type {
  AntigravitySessionSummary,
  ArtifactItem,
  ArtifactModalTarget,
  DeviceInfo,
  EngineMode,
  ExecutionPolicy,
  PendingApproval,
  Project,
  PromptRun,
  PromptToolCall,
  SystemStatus,
  TabKey,
  TunnelActionResponse,
  WsEnvelope,
} from './types/api';

interface ToastItem {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

const THEME_KEY = 'agy_pulse_theme';
const NOTIF_KEY = 'agy_pulse_notifications';

export default function App() {
  const { playTaskVoice } = useCustomTheme();
  const [booting, setBooting] = useState(true);
  const [pairingInProgress, setPairingInProgress] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });

  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(NOTIF_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [activeTab, setActiveTab] = useState<TabKey>('prompt');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [runs, setRuns] = useState<PromptRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [sessions, setSessions] = useState<AntigravitySessionSummary[]>([]);
  const [brainDir, setBrainDir] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);
  const [defaultEngine, setDefaultEngine] = useState<EngineMode>('antigravity_sdk');
  const [defaultPolicy, setDefaultPolicy] = useState<ExecutionPolicy>('ask_mobile');
  const [currentModel, setCurrentModel] = useState<string>('gemini-4-argon');

  const [artifactModalTarget, setArtifactModalTarget] = useState<ArtifactModalTarget | null>(null);
  const [tunnelBusy, setTunnelBusy] = useState(false);

  const [sessionRefreshTick, setSessionRefreshTick] = useState(0);
  const [artifactRefreshTick, setArtifactRefreshTick] = useState(0);
  const [workspaceRefreshTick, setWorkspaceRefreshTick] = useState(0);

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastCounterRef = useRef(1);
  const notifEnabledRef = useRef(notificationsEnabled);
  notifEnabledRef.current = notificationsEnabled;

  const notify = useCallback((message: string, tone: 'info' | 'success' | 'error' = 'info') => {
    const id = toastCounterRef.current++;
    setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3400);
  }, []);

  const pushBrowserNotification = useCallback((title: string, body: string) => {
    if (!notifEnabledRef.current) return;
    sendAppNotification(title, body).catch(() => undefined);
  }, []);

  // Verify notification permission on startup
  useEffect(() => {
    if (!notificationsEnabled) return;
    hasNotificationPermission().then((ok) => {
      if (!ok) {
        setNotificationsEnabled(false);
      }
    });
  }, [notificationsEnabled]);

  // Apply Dark/Light theme class + theme-color meta + native StatusBar
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    } catch {
      // Ignore
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark ? '#090d16' : '#f4f7fb');
    }
    syncNativeTheme(isDark).catch(() => undefined);
  }, [isDark]);

  // Register 401 handler
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthenticated(false);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Boot & Auto-pair ?pair=<token>
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      const url = new URL(window.location.href);
      const serverParam = url.searchParams.get('server') || url.searchParams.get('url');
      if (serverParam) {
        setServerUrl(serverParam);
      }
      const pairToken = url.searchParams.get('pair');

      if (pairToken) {
        setPairingInProgress(true);
        try {
          const res = await api.pair(pairToken, getDeviceName());
          if (!cancelled) {
            setToken(res.token);
            url.searchParams.delete('pair');
            url.searchParams.delete('server');
            url.searchParams.delete('url');
            const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
            window.history.replaceState({}, document.title, cleanUrl);
            setAuthError(null);
            setAuthenticated(true);
          }
        } catch (err) {
          if (!cancelled) {
            url.searchParams.delete('pair');
            const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
            window.history.replaceState({}, document.title, cleanUrl);
            setAuthError(
              err instanceof Error
                ? `Ghép nối QR thất bại: ${err.message}`
                : 'Liên kết QR không hợp lệ hoặc đã hết hạn.'
            );
            setAuthenticated(false);
          }
        } finally {
          if (!cancelled) {
            setPairingInProgress(false);
            setBooting(false);
          }
          hideNativeSplash().catch(() => undefined);
        }
        return;
      }

      if (isNativeApp() && !getServerUrl()) {
        if (!cancelled) {
          setAuthenticated(false);
          setBooting(false);
        }
        hideNativeSplash().catch(() => undefined);
        return;
      }

      try {
        const status = await api.getAuthStatus();
        if (!cancelled) {
          setAuthenticated(status.authenticated || !status.auth_required);
        }
      } catch {
        if (!cancelled) {
          setAuthenticated(false);
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
        hideNativeSplash().catch(() => undefined);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  // Data loaders
  const refreshProjects = useCallback(async () => {
    try {
      const list = await api.getProjects();
      setProjects(list);
      setSelectedProjectId((prev) => {
        if (prev && list.some((p) => p.id === prev)) return prev;
        return list[0]?.id || '';
      });
    } catch {
      // Handled via auth / toast
    }
  }, []);

  const refreshSystem = useCallback(async () => {
    try {
      const [status, devList, sysSettings] = await Promise.all([
        api.getSystemStatus(),
        api.getDevices(),
        api.getSystemSettings(),
      ]);
      setSystemStatus(status);
      setDevices(devList);
      setDefaultEngine(sysSettings.default_engine_mode);
      setDefaultPolicy(sysSettings.default_execution_policy);
      if (sysSettings.model) {
        setCurrentModel(sysSettings.model);
      }
    } catch {
      // Ignore
    }
  }, []);

  const refreshPrompts = useCallback(async () => {
    try {
      const res = await api.getPrompts(undefined, 50);
      setRuns(res.runs || []);
      setPendingApprovals(res.pending_approvals || []);
    } catch {
      // Ignore
    }
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const res = await api.getSessions();
      setSessions(res.sessions || []);
      setBrainDir(res.brain_dir || '');
    } catch {
      // Ignore
    }
  }, []);

  const refreshArtifacts = useCallback(async () => {
    try {
      const list = await api.getArtifacts('', '', 60);
      setArtifacts(list);
    } catch {
      // Ignore
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshSystem(),
      refreshProjects(),
      refreshPrompts(),
      refreshSessions(),
      refreshArtifacts(),
    ]);
  }, [refreshSystem, refreshProjects, refreshPrompts, refreshSessions, refreshArtifacts]);

  useEffect(() => {
    if (authenticated) {
      refreshAll();
    }
  }, [authenticated, refreshAll]);

  // WebSocket event handler
  const handleWsEvent = useCallback(
    (event: WsEnvelope) => {
      const p = event.payload || {};

      switch (event.type) {
        case 'connection.hello':
        case 'presence.updated': {
          api.getDevices().then(setDevices).catch(() => undefined);
          api.getSystemStatus().then(setSystemStatus).catch(() => undefined);
          break;
        }

        case 'prompt.created': {
          const run = (p.run as PromptRun | undefined) || (p as unknown as PromptRun);
          if (run?.id) {
            setRuns((prev) => {
              const idx = prev.findIndex((r) => r.id === run.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = run;
                return next;
              }
              return [run, ...prev];
            });
          }
          break;
        }

        case 'prompt.status': {
          const runId = String(p.run_id ?? p.id ?? '');
          const nextStatus = p.status as PromptRun['status'] | undefined;
          if (!runId || !nextStatus) break;
          setRuns((prev) =>
            prev.map((r) =>
              r.id === runId
                ? {
                    ...r,
                    status: nextStatus,
                    started_at: (p.started_at as string | null) ?? r.started_at,
                    finished_at: (p.finished_at as string | null) ?? r.finished_at,
                    error: (p.error as string | null) ?? r.error,
                  }
                : r
            )
          );
          if (
            nextStatus === 'completed' ||
            nextStatus === 'failed' ||
            nextStatus === 'cancelled'
          ) {
            api
              .getPromptRun(runId)
              .then((full) => {
                setRuns((prev) => prev.map((r) => (r.id === runId ? full : r)));
              })
              .catch(() => undefined);
          }
          break;
        }

        case 'prompt.thought_delta': {
          const runId = String(p.run_id ?? '');
          if (!runId) break;
          const delta = typeof p.delta === 'string' ? p.delta : typeof p.text === 'string' ? p.text : '';
          const fullThoughts = typeof p.thoughts === 'string' ? p.thoughts : null;
          setRuns((prev) => {
            if (!prev.some((r) => r.id === runId)) {
              api
                .getPromptRun(runId)
                .then((fetched) => {
                  setRuns((curr) => (curr.some((r) => r.id === runId) ? curr : [fetched, ...curr]));
                })
                .catch(() => undefined);
              return prev;
            }
            return prev.map((r) =>
              r.id === runId
                ? {
                    ...r,
                    status: r.status === 'queued' ? 'running' : r.status,
                    thoughts: fullThoughts !== null ? fullThoughts : `${r.thoughts || ''}${delta}`,
                  }
                : r
            );
          });
          break;
        }

        case 'prompt.token_delta': {
          const runId = String(p.run_id ?? '');
          if (!runId) break;
          const delta = typeof p.delta === 'string' ? p.delta : typeof p.text === 'string' ? p.text : '';
          const fullText = typeof p.response_text === 'string' ? p.response_text : null;
          setRuns((prev) => {
            if (!prev.some((r) => r.id === runId)) {
              api
                .getPromptRun(runId)
                .then((fetched) => {
                  setRuns((curr) => (curr.some((r) => r.id === runId) ? curr : [fetched, ...curr]));
                })
                .catch(() => undefined);
              return prev;
            }
            return prev.map((r) =>
              r.id === runId
                ? {
                    ...r,
                    status: r.status === 'queued' ? 'running' : r.status,
                    response_text:
                      fullText !== null ? fullText : `${r.response_text || ''}${delta}`,
                  }
                : r
            );
          });
          break;
        }

        case 'prompt.tool_call': {
          const runId = String(p.run_id ?? '');
          const tc = (p.tool_call as PromptToolCall | undefined) || {
            id: String(p.id ?? `${Date.now()}`),
            name: String(p.name ?? 'tool'),
            args: p.args,
            status: String(p.status ?? 'running'),
            timestamp: String(p.timestamp ?? event.timestamp),
          };
          if (!runId) break;
          setRuns((prev) =>
            prev.map((r) => {
              if (r.id !== runId) return r;
              const existingIdx = r.tool_calls.findIndex((t) => t.id === tc.id);
              const nextCalls = [...r.tool_calls];
              if (existingIdx >= 0) {
                nextCalls[existingIdx] = { ...nextCalls[existingIdx], ...tc };
              } else {
                nextCalls.push(tc);
              }
              return { ...r, tool_calls: nextCalls };
            })
          );
          break;
        }

        case 'prompt.approval_required': {
          const approval =
            (p.approval as PendingApproval | undefined) || (p as unknown as PendingApproval);
          if (!approval?.approval_id) break;
          setPendingApprovals((prev) => {
            if (prev.some((a) => a.approval_id === approval.approval_id)) return prev;
            return [...prev, approval];
          });
          setRuns((prev) =>
            prev.map((r) =>
              r.id === approval.run_id ? { ...r, status: 'awaiting_approval' } : r
            )
          );
          triggerHaptic('warning').catch(() => undefined);
          pushBrowserNotification(
            `Cần duyệt: ${approval.tool_name}`,
            `${approval.project_name}: ${approval.description}`
          );
          break;
        }

        case 'prompt.approval_resolved': {
          const approvalId = String(p.approval_id ?? '');
          if (approvalId) {
            setPendingApprovals((prev) => prev.filter((a) => a.approval_id !== approvalId));
          }
          break;
        }

        case 'prompt.completed': {
          const runId = String(p.run_id ?? p.id ?? '');
          const status = (p.status as PromptRun['status'] | undefined) || 'completed';
          if (runId) {
            setPendingApprovals((prev) => prev.filter((a) => a.run_id !== runId));
            api
              .getPromptRun(runId)
              .then((full) => {
                setRuns((prev) => {
                  const exists = prev.some((r) => r.id === runId);
                  return exists ? prev.map((r) => (r.id === runId ? full : r)) : [full, ...prev];
                });
                const ok = full.status === 'completed';
                if (ok) {
                  playTaskVoice();
                }
                pushBrowserNotification(
                  ok ? `Hoàn tất: ${full.project_name}` : `Tác vụ kết thúc (${full.status})`,
                  full.prompt.slice(0, 120)
                );
              })
              .catch(() => {
                setRuns((prev) =>
                  prev.map((r) =>
                    r.id === runId
                      ? {
                          ...r,
                          status,
                          finished_at: (p.finished_at as string | null) ?? r.finished_at,
                          error: (p.error as string | null) ?? r.error,
                        }
                      : r
                  )
                );
              });
          }
          refreshArtifacts();
          setArtifactRefreshTick((t) => t + 1);
          break;
        }

        case 'brain.session_updated': {
          refreshSessions();
          setSessionRefreshTick((t) => t + 1);
          break;
        }

        case 'artifact.updated': {
          refreshArtifacts();
          setArtifactRefreshTick((t) => t + 1);
          break;
        }

        case 'project.updated': {
          refreshProjects();
          break;
        }

        case 'workspace.changed': {
          refreshProjects();
          setWorkspaceRefreshTick((t) => t + 1);
          break;
        }

        case 'system.tunnel_updated': {
          setSystemStatus((prev) =>
            prev
              ? {
                  ...prev,
                  tunnel_running: Boolean(p.tunnel_running),
                  tunnel_mode: (p.tunnel_mode as SystemStatus['tunnel_mode']) ?? prev.tunnel_mode,
                  tunnel_url: (p.tunnel_url as string | null) ?? null,
                  tunnel_short_url: (p.tunnel_short_url as string | null) ?? null,
                }
              : prev
          );
          api.getSystemStatus().then(setSystemStatus).catch(() => undefined);
          break;
        }

        case 'system.model_changed': {
          if (typeof p.model === 'string' && p.model) {
            setCurrentModel(p.model);
            notify(`AI Model đã được chuyển sang: ${p.model}`, 'info');
          }
          break;
        }

        case 'system.google_auth_changed': {
          refreshSystem();
          window.dispatchEvent(new CustomEvent('agy:google-auth-changed'));
          break;
        }
      }
    },
    [pushBrowserNotification, refreshArtifacts, refreshProjects, refreshSessions, refreshSystem]
  );

  const { wsStatus, reconnectNow } = usePulseSocket({
    enabled: authenticated,
    onEvent: handleWsEvent,
    onReconnect: refreshAll,
  });

  // Auth actions
  const handleLogin = async (pin: string, device: string, serverUrl?: string) => {
    setDeviceName(device);
    if (serverUrl !== undefined) {
      setServerUrl(serverUrl);
    }
    const res = await api.login(pin, device);
    setToken(res.token);
    setAuthError(null);
    setAuthenticated(true);
    triggerHaptic('success').catch(() => undefined);
    notify('Đã kết nối với Antigravity Pulse PC', 'success');
  };

  const handlePairWithInput = useCallback(
    async (rawInput: string, device?: string, fallbackServerUrl?: string) => {
      const effectiveDevice = device || getDeviceName();
      setDeviceName(effectiveDevice);
      const parsed = parsePairingInput(rawInput);
      const targetServer = parsed.serverUrl || fallbackServerUrl || '';
      if (targetServer) {
        setServerUrl(targetServer);
      }

      if (parsed.pairToken) {
        const res = await api.pair(parsed.pairToken, effectiveDevice);
        setToken(res.token);
        setAuthError(null);
        setAuthenticated(true);
        triggerHaptic('success').catch(() => undefined);
        notify('Đã ghép nối mã QR với PC thành công!', 'success');
        return;
      }

      if (parsed.pin) {
        const res = await api.login(parsed.pin, effectiveDevice);
        setToken(res.token);
        setAuthError(null);
        setAuthenticated(true);
        triggerHaptic('success').catch(() => undefined);
        notify('Đã kết nối bằng mã PIN thành công!', 'success');
        return;
      }

      throw new Error(
        'Mã QR hoặc đường link không chứa khóa ghép nối (?pair=...). Hãy quét đúng mã QR trên cửa sổ start.ps1 hoặc mục Cài đặt.'
      );
    },
    [notify]
  );

  // Native Android back button, deep links (agypulse://), and foreground resume
  const modalRef = useRef(artifactModalTarget);
  modalRef.current = artifactModalTarget;
  const tabRef = useRef(activeTab);
  tabRef.current = activeTab;
  const sessionRef = useRef(selectedSessionId);
  sessionRef.current = selectedSessionId;
  const authRef = useRef(authenticated);
  authRef.current = authenticated;

  useEffect(() => {
    return registerNativeLifecycle({
      onBackButton: () => {
        if (modalRef.current) {
          setArtifactModalTarget(null);
          return true;
        }
        if (tabRef.current === 'outputs' && sessionRef.current) {
          setSelectedSessionId(null);
          return true;
        }
        if (tabRef.current !== 'dashboard') {
          setActiveTab('dashboard');
          return true;
        }
        return false;
      },
      onDeepLink: (url) => {
        handlePairWithInput(url).catch((err) => {
          notify(
            err instanceof Error ? err.message : 'Không thể ghép nối từ liên kết',
            'error'
          );
        });
      },
      onAppResume: () => {
        if (authRef.current) {
          reconnectNow();
          refreshAll();
        }
      },
    });
  }, [handlePairWithInput, notify, reconnectNow, refreshAll]);

  const handleLogout = () => {
    clearToken();
    setAuthenticated(false);
    notify('Đã ngắt ghép nối thiết bị này', 'info');
  };

  const handleApprovalDecision = async (
    runId: string,
    approvalId: string,
    approved: boolean
  ) => {
    try {
      await api.approveToolCall(runId, approvalId, approved);
      setPendingApprovals((prev) => prev.filter((a) => a.approval_id !== approvalId));
      notify(approved ? 'Đã cho phép thực thi công cụ' : 'Đã từ chối thao tác', 'info');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Gửi quyết định thất bại', 'error');
    }
  };

  const handleToggleTunnel = async (): Promise<TunnelActionResponse | null> => {
    if (tunnelBusy) return null;
    setTunnelBusy(true);
    try {
      const res = systemStatus?.tunnel_running
        ? await api.stopTunnel()
        : await api.startTunnel();
      await refreshSystem();
      if (res.tunnel_running && (res.tunnel_short_url || res.tunnel_url)) {
        notify(`Đã mở Tunnel: ${res.tunnel_short_url || res.tunnel_url}`, 'success');
      } else if (!res.tunnel_running && res.error) {
        notify(res.error, 'error');
      } else {
        notify('Đã tắt Tunnel', 'info');
      }
      return res;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Lỗi thao tác Tunnel', 'error');
      return null;
    } finally {
      setTunnelBusy(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      try {
        localStorage.setItem(NOTIF_KEY, 'false');
      } catch {
        // Ignore
      }
      notify('Đã tắt thông báo ứng dụng', 'info');
      return;
    }

    const { granted, supported } = await requestAppNotificationPermission();
    if (!supported) {
      notify('Thiết bị / trình duyệt này không hỗ trợ thông báo đẩy', 'error');
      return;
    }
    if (granted) {
      setNotificationsEnabled(true);
      try {
        localStorage.setItem(NOTIF_KEY, 'true');
      } catch {
        // Ignore
      }
      notify('Đã bật thông báo hoàn tất tác vụ & duyệt tool', 'success');
    } else {
      notify('Quyền thông báo bị từ chối trong cài đặt hệ thống', 'error');
    }
  };

  const handleTestNotification = () => {
    sendAppNotification('Antigravity Pulse', 'Thông báo trên điện thoại đang hoạt động ổn định!').catch(
      () => undefined
    );
    notify('Đã gửi thông báo thử nghiệm', 'info');
  };

  if (booting) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#090d16] text-slate-200">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        <p className="mt-3 text-xs text-slate-400">Đang khởi động Antigravity Pulse...</p>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <AuthScreen
        pairingInProgress={pairingInProgress}
        initialError={authError}
        onLogin={handleLogin}
        onPairWithInput={handlePairWithInput}
      />
    );
  }

  const activeRunCount = runs.filter(
    (r) => r.status === 'running' || r.status === 'queued' || r.status === 'awaiting_approval'
  ).length;

  return (
    <>
      <Layout
        activeTab={activeTab}
        onTabChange={setActiveTab}
        wsStatus={wsStatus}
        onReconnectWs={reconnectNow}
        systemStatus={systemStatus}
        pendingApprovalCount={pendingApprovals.length}
        activeRunCount={activeRunCount}
        isDark={isDark}
        onToggleTheme={() => setIsDark((d) => !d)}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={setSelectedProjectId}
        runs={runs}
        selectedRunId={selectedRunId}
        onSelectRun={(runId) => {
          setSelectedRunId(runId);
          setActiveTab('prompt');
        }}
        onNewConversation={() => {
          setSelectedRunId(null);
          setActiveTab('prompt');
        }}
        onOpenArtifact={setArtifactModalTarget}
      >
        {activeTab === 'dashboard' && (
          <DashboardPage
            systemStatus={systemStatus}
            devices={devices}
            projects={projects}
            runs={runs}
            sessions={sessions}
            artifacts={artifacts}
            tunnelBusy={tunnelBusy}
            onRefreshAll={refreshAll}
            onNavigate={setActiveTab}
            onSelectRun={(runId) => setSelectedRunId(runId)}
            onSelectSession={(sessId) => setSelectedSessionId(sessId)}
            onOpenArtifact={setArtifactModalTarget}
            onToggleTunnel={handleToggleTunnel}
            onNotify={notify}
          />
        )}

        {activeTab === 'prompt' && (
          <PromptPage
            projects={projects}
            runs={runs}
            selectedProjectId={selectedProjectId}
            selectedRunId={selectedRunId}
            defaultEngine={defaultEngine}
            defaultPolicy={defaultPolicy}
            currentModel={currentModel}
            isDark={isDark}
            onSelectProject={setSelectedProjectId}
            onSelectRun={setSelectedRunId}
            onRunCreated={(created) => {
              setRuns((prev) => {
                if (prev.some((r) => r.id === created.id)) return prev;
                return [created, ...prev];
              });
            }}
            onModelChange={setCurrentModel}
            onOpenArtifact={setArtifactModalTarget}
            onNavigate={setActiveTab}
            onNotify={notify}
          />
        )}

        {activeTab === 'projects' && (
          <ProjectsPage
            projects={projects}
            selectedProjectId={selectedProjectId}
            workspaceRefreshTick={workspaceRefreshTick}
            onSelectProject={setSelectedProjectId}
            onRefreshProjects={refreshProjects}
            onNavigate={setActiveTab}
            onOpenArtifact={setArtifactModalTarget}
            onNotify={notify}
          />
        )}

        {activeTab === 'outputs' && (
          <OutputsPage
            sessions={sessions}
            brainDir={brainDir}
            initialArtifacts={artifacts}
            selectedSessionId={selectedSessionId}
            sessionRefreshTick={sessionRefreshTick}
            artifactRefreshTick={artifactRefreshTick}
            isDark={isDark}
            onSelectSession={setSelectedSessionId}
            onRefreshSessions={refreshSessions}
            onOpenArtifact={setArtifactModalTarget}
            onNotify={notify}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPage
            systemStatus={systemStatus}
            devices={devices}
            isDark={isDark}
            notificationsEnabled={notificationsEnabled}
            tunnelBusy={tunnelBusy}
            currentModel={currentModel}
            onModelChange={setCurrentModel}
            onToggleTheme={() => setIsDark((d) => !d)}
            onToggleNotifications={handleToggleNotifications}
            onTestNotification={handleTestNotification}
            onToggleTunnel={handleToggleTunnel}
            onRefreshSystem={refreshSystem}
            onLogout={handleLogout}
            onNotify={notify}
          />
        )}
      </Layout>

      {/* Global Mobile Tool Approval Sheet */}
      <ToolApprovalBanner approvals={pendingApprovals} onDecide={handleApprovalDecision} />

      {/* Rich Artifact / File Modal */}
      <ArtifactModal
        target={artifactModalTarget}
        isDark={isDark}
        onClose={() => setArtifactModalTarget(null)}
        onNotify={notify}
      />

      {/* Lucian Stacking Toasts */}
      <StackingToasts
        toasts={toasts.map((t) => ({
          id: t.id,
          tone: t.tone,
          title: t.message,
        }))}
        onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))}
      />
    </>
  );
}
