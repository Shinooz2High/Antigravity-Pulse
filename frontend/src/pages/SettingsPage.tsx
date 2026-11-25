import { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle,
  Bell,
  Brain,
  Camera,
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  FlaskConical,
  Globe,
  KeyRound,
  Layers,
  LogOut,
  Moon,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Share2,
  Shield,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Wifi,
  X,
  Zap,
} from 'lucide-react';
import {
  api,
  getDeviceName,
  getServerUrl,
  parsePairingInput,
  PUBLIC_WEB_PORTAL_URL,
  setDeviceName,
  setServerUrl,
  setToken,
} from '../lib/api';
import {
  getMobilePlatform,
  isIosBrowser,
  isNativeApp,
  isStandalonePwa,
  openExternalLink,
  shareContent,
  subscribePwaInstallAvailability,
  triggerPwaInstall,
} from '../lib/native';
import { cn, copyToClipboard, formatBytes, formatRelativeTime } from '../lib/utils';
import { GoogleAgyAuthSection } from '../components/GoogleAgyAuthSection';
import { QrScannerModal } from '../components/QrScannerModal';
import { AppDownloadCard } from '../components/library';
import type {
  DeviceInfo,
  EngineMode,
  ExecutionPolicy,
  MobileBuildInfo,
  ModelCategory,
  ModelListResponse,
  ModelQuotaInfo,
  PairInfo,
  SystemSettings,
  SystemStatus,
  TunnelActionResponse,
  TunnelMode,
} from '../types/api';

interface SettingsPageProps {
  systemStatus: SystemStatus | null;
  devices: DeviceInfo[];
  isDark: boolean;
  notificationsEnabled: boolean;
  tunnelBusy: boolean;
  currentModel?: string;
  onModelChange?: (model: string) => void;
  onToggleTheme: () => void;
  onToggleNotifications: () => Promise<void>;
  onTestNotification: () => void;
  onToggleTunnel: () => Promise<TunnelActionResponse | null>;
  onRefreshSystem: () => Promise<void>;
  onLogout: () => void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

export function SettingsPage({
  systemStatus,
  devices,
  isDark,
  notificationsEnabled,
  tunnelBusy,
  currentModel,
  onModelChange,
  onToggleTheme,
  onToggleNotifications,
  onTestNotification,
  onToggleTunnel,
  onRefreshSystem,
  onLogout,
  onNotify,
}: SettingsPageProps) {
  const [pairInfo, setPairInfo] = useState<PairInfo | null>(null);
  const [rotatingPair, setRotatingPair] = useState(false);
  const [customPin, setCustomPin] = useState('');

  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [vertexEnabled, setVertexEnabled] = useState(false);
  const [vertexProject, setVertexProject] = useState('');
  const [vertexLocation, setVertexLocation] = useState('us-central1');
  const [defaultEngine, setDefaultEngine] = useState<EngineMode>('antigravity_sdk');
  const [defaultPolicy, setDefaultPolicy] = useState<ExecutionPolicy>('ask_mobile');
  const [modelName, setModelName] = useState(currentModel || '');
  const [brainDir, setBrainDir] = useState('');
  const [settingsPin, setSettingsPin] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // Models & Quota State
  const [modelsData, setModelsData] = useState<ModelListResponse | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [modelCategoryFilter, setModelCategoryFilter] = useState<'all' | ModelCategory>('all');
  const [activatingModelId, setActivatingModelId] = useState<string | null>(null);

  const [tunnelHint, setTunnelHint] = useState<{ error?: string | null; install_hint?: string | null } | null>(
    null
  );
  const [tunnelMode, setTunnelMode] = useState<TunnelMode>('cloudflare_quick');
  const [tunnelSubdomain, setTunnelSubdomain] = useState('');
  const [tunnelShortAlias, setTunnelShortAlias] = useState('');
  const [tunnelAutoShorten, setTunnelAutoShorten] = useState(true);
  const [cfTunnelUrl, setCfTunnelUrl] = useState('');
  const [cfTunnelTokenInput, setCfTunnelTokenInput] = useState('');
  const [savingTunnelConfig, setSavingTunnelConfig] = useState(false);
  const [localDeviceName, setLocalDeviceName] = useState(() => getDeviceName());
  const [mobileBuilds, setMobileBuilds] = useState<MobileBuildInfo | null>(null);
  const [serverUrlEdit, setServerUrlEdit] = useState(() => getServerUrl());
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  useEffect(() => {
    return subscribePwaInstallAvailability(setCanInstallPwa);
  }, []);

  const fetchModelsList = async (showToast = false) => {
    setLoadingModels(true);
    try {
      const res = await api.getModelList();
      setModelsData(res);
      if (res.current_model) {
        setModelName(res.current_model);
      }
      if (showToast) {
        onNotify(`Đã cập nhật trạng thái quota của ${res.models.length} models`, 'success');
      }
    } catch (err) {
      if (showToast) {
        onNotify(err instanceof Error ? err.message : 'Không thể tải danh sách quota', 'error');
      }
    } finally {
      setLoadingModels(false);
    }
  };

  const handleQuickSelectModel = async (m: ModelQuotaInfo) => {
    const activeCurrent = currentModel || modelName || modelsData?.current_model;
    if (m.id === activeCurrent) {
      return;
    }
    if (m.status === 'exhausted') {
      const ok = window.confirm(
        `Model "${m.display_name}" hiện đang bị Google hạn chế Quota (429).\n${m.retry_after ? `(${m.retry_after})\n` : ''}Bạn có chắc chắn muốn chọn model này không?`
      );
      if (!ok) return;
    }

    setActivatingModelId(m.id);
    try {
      await api.selectModel(m.id);
      setModelName(m.id);
      onModelChange?.(m.id);
      await fetchModelsList(false);
      onNotify(`Đã kích hoạt model: ${m.display_name}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể chuyển model', 'error');
    } finally {
      setActivatingModelId(null);
    }
  };

  const filteredModelsList = useMemo(() => {
    if (!modelsData?.models) return [];
    return modelsData.models.filter((m) => {
      if (modelCategoryFilter !== 'all' && m.category !== modelCategoryFilter) {
        return false;
      }
      if (modelSearch.trim()) {
        const q = modelSearch.toLowerCase();
        return (
          m.id.toLowerCase().includes(q) ||
          m.display_name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [modelsData?.models, modelCategoryFilter, modelSearch]);

  const loadData = async () => {
    try {
      const [pair, sysSettings] = await Promise.all([
        api.getPairInfo(),
        api.getSystemSettings(),
      ]);
      setPairInfo(pair);
      setSettings(sysSettings);
      setVertexEnabled(sysSettings.vertex_enabled);
      setVertexProject(sysSettings.vertex_project || '');
      setVertexLocation(sysSettings.vertex_location || 'us-central1');
      setDefaultEngine(sysSettings.default_engine_mode);
      setDefaultPolicy(sysSettings.default_execution_policy);
      setModelName(sysSettings.model || '');
      setBrainDir(sysSettings.brain_dir || '');
      setSettingsPin(sysSettings.pin || '');
      setTunnelMode(sysSettings.tunnel_mode || 'cloudflare_quick');
      setTunnelSubdomain(sysSettings.tunnel_subdomain || '');
      setTunnelShortAlias(sysSettings.tunnel_short_alias || '');
      setTunnelAutoShorten(sysSettings.tunnel_auto_shorten ?? true);
      setCfTunnelUrl(sysSettings.cloudflare_tunnel_url || '');
    } catch (err) {
      onNotify(
        err instanceof Error ? err.message : 'Không thể tải cấu hình hệ thống',
        'error'
      );
    }
  };

  useEffect(() => {
    loadData();
    fetchModelsList();
    api.getMobileBuilds().then(setMobileBuilds).catch(() => undefined);
  }, [systemStatus?.tunnel_url]);

  const handleCopy = async (label: string, text: string) => {
    const ok = await copyToClipboard(text);
    onNotify(ok ? `Đã sao chép ${label}` : 'Không thể sao chép', ok ? 'success' : 'error');
  };

  const primaryShareUrl = pairInfo?.quick_code
    ? `${PUBLIC_WEB_PORTAL_URL}/?c=${encodeURIComponent(pairInfo.quick_code)}`
    : pairInfo?.pair_url || '';

  const buildInviteMessage = () => {
    if (!pairInfo) return '';
    const link = primaryShareUrl;
    const codeLine = pairInfo.quick_code
      ? `\nHoặc vào ${PUBLIC_WEB_PORTAL_URL} và nhập mã: ${pairInfo.quick_code}`
      : '';
    return `⚡ Bấm link gọn này để kết nối Antigravity Pulse (tự đăng nhập 1 chạm, không cần PIN hay IP):\n${link}${codeLine}`;
  };

  const handleSharePairUrl = async () => {
    if (!primaryShareUrl) return;
    const res = await shareContent({
      title: 'Kết nối Antigravity Pulse',
      text: buildInviteMessage(),
      url: primaryShareUrl,
    });
    if (res === 'shared' || res === 'cancelled') return;
    handleCopy('tin nhắn ghép nối 1 chạm', buildInviteMessage());
  };

  const handleShareZalo = async () => {
    if (!primaryShareUrl) return;
    const msg = buildInviteMessage();
    await copyToClipboard(msg);
    if (isNativeApp()) {
      const res = await shareContent({
        title: 'Gửi qua Zalo — Antigravity Pulse',
        text: msg,
        url: primaryShareUrl,
      });
      if (res === 'shared' || res === 'cancelled') return;
    }
    openExternalLink('https://chat.zalo.me/');
    onNotify('Đã chép sẵn tin nhắn + link gọn 1 chạm! Chọn người nhận (hoặc Cloud của tôi) trong Zalo rồi nhấn Dán (Ctrl+V) để gửi.', 'success');
  };

  const handleShareMessenger = async () => {
    if (!primaryShareUrl) return;
    const msg = buildInviteMessage();
    await copyToClipboard(msg);
    if (isNativeApp()) {
      const res = await shareContent({
        title: 'Gửi qua Messenger — Antigravity Pulse',
        text: msg,
        url: primaryShareUrl,
      });
      if (res === 'shared' || res === 'cancelled') return;
    }
    openExternalLink('https://www.messenger.com/');
    onNotify('Đã chép sẵn tin nhắn + link gọn 1 chạm! Chọn cuộc trò chuyện trong Messenger rồi nhấn Dán (Ctrl+V) để gửi.', 'success');
  };

  const handleSaveServerUrl = async () => {
    const parsed = parsePairingInput(serverUrlEdit);
    const nextUrl = parsed.serverUrl || '';
    setServerUrl(nextUrl);
    setServerUrlEdit(nextUrl);
    if (parsed.pairToken) {
      try {
        const res = await api.pair(parsed.pairToken, getDeviceName());
        setToken(res.token);
        await onRefreshSystem();
        await loadData();
        onNotify('Đã chuyển máy chủ PC & ghép nối thành công!', 'success');
        return;
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Ghép nối máy chủ mới thất bại', 'error');
        return;
      }
    }
    await onRefreshSystem();
    onNotify(
      nextUrl
        ? `Đã đặt máy chủ PC: ${nextUrl}`
        : 'Đã đặt lại máy chủ mặc định theo trình duyệt',
      'success'
    );
  };

  const handleQrSwitchServer = async (decoded: string) => {
    setQrModalOpen(false);
    const parsed = parsePairingInput(decoded);
    if (parsed.serverUrl) {
      setServerUrl(parsed.serverUrl);
      setServerUrlEdit(parsed.serverUrl);
    }
    if (parsed.pairToken) {
      try {
        const res = await api.pair(parsed.pairToken, getDeviceName());
        setToken(res.token);
        await onRefreshSystem();
        await loadData();
        onNotify('Đã quét QR & chuyển sang máy chủ PC mới!', 'success');
      } catch (err) {
        onNotify(err instanceof Error ? err.message : 'Lỗi ghép nối máy chủ mới', 'error');
      }
    } else {
      onNotify('Đã cập nhật địa chỉ máy chủ từ mã QR', 'info');
    }
  };

  const handleRotatePair = async () => {
    setRotatingPair(true);
    try {
      const next = await api.rotatePair(customPin.trim() || undefined);
      setPairInfo(next);
      setSettingsPin(next.pin);
      setCustomPin('');
      onNotify('Đã cấp lại mã QR & mã PIN mới', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể đổi mã ghép nối', 'error');
    } finally {
      setRotatingPair(false);
    }
  };

  const handleTunnelClick = async () => {
    const res = await onToggleTunnel();
    if (res && !res.tunnel_running && (res.error || res.install_hint)) {
      setTunnelHint({ error: res.error, install_hint: res.install_hint });
    } else {
      setTunnelHint(null);
    }
  };

  const handleSaveTunnelConfig = async () => {
    setSavingTunnelConfig(true);
    try {
      const updated = await api.updateSystemSettings({
        tunnel_mode: tunnelMode,
        tunnel_subdomain: tunnelSubdomain.trim(),
        tunnel_short_alias: tunnelShortAlias.trim(),
        tunnel_auto_shorten: tunnelAutoShorten,
        cloudflare_tunnel_url: cfTunnelUrl.trim(),
        cloudflare_tunnel_token: cfTunnelTokenInput.trim() || undefined,
      });
      setSettings(updated);
      setCfTunnelTokenInput('');
      setTunnelHint(null);
      await onRefreshSystem();
      onNotify(
        systemStatus?.tunnel_running
          ? 'Đã lưu cấu hình Tunnel. Tắt và bật lại Tunnel để áp dụng link mới.'
          : 'Đã lưu cấu hình Tunnel ngắn & dễ nhớ',
        'success'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể lưu cấu hình Tunnel', 'error');
    } finally {
      setSavingTunnelConfig(false);
    }
  };

  const handleClearCfTunnelToken = async () => {
    if (!window.confirm('Xóa Cloudflare Tunnel Token đã lưu?')) return;
    setSavingTunnelConfig(true);
    try {
      const updated = await api.updateSystemSettings({ clear_cloudflare_tunnel_token: true });
      setSettings(updated);
      onNotify('Đã xóa Cloudflare Tunnel Token', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể xóa Token', 'error');
    } finally {
      setSavingTunnelConfig(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const updated = await api.updateSystemSettings({
        gemini_api_key: apiKeyInput.trim() || undefined,
        vertex_enabled: vertexEnabled,
        vertex_project: vertexProject.trim(),
        vertex_location: vertexLocation.trim(),
        default_engine_mode: defaultEngine,
        default_execution_policy: defaultPolicy,
        model: modelName.trim(),
        brain_dir: brainDir.trim(),
        pin: settingsPin.trim() || undefined,
      });
      setSettings(updated);
      setApiKeyInput('');
      await onRefreshSystem();
      const pair = await api.getPairInfo();
      setPairInfo(pair);
      onNotify('Đã lưu cấu hình lên máy tính PC', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể lưu cấu hình', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleClearApiKey = async () => {
    if (!window.confirm('Xóa Gemini API Key đã lưu trên PC?')) return;
    setSavingSettings(true);
    try {
      const updated = await api.updateSystemSettings({ clear_api_key: true });
      setSettings(updated);
      await onRefreshSystem();
      onNotify('Đã xóa Gemini API Key', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể xóa API Key', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveDeviceName = () => {
    setDeviceName(localDeviceName);
    onNotify('Đã lưu tên thiết bị (áp dụng khi kết nối lại WS)', 'success');
  };

  return (
    <div className="space-y-5">
      {/* 1-Step Quick Connect & QR Pairing */}
      <section className="rounded-2xl border border-cyan-500/30 bg-white p-4 shadow-sm sm:p-5 dark:border-cyan-500/25 dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-cyan-500" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Kết nối máy khác siêu nhanh (1 bước duy nhất)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Trên máy khác chỉ cần nhập <strong>Mã Kết Nối 6 ký tự</strong> hoặc <strong>Quét QR</strong> — tự tìm PC qua cả Wi-Fi lẫn 4G/5G!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const synced = await api.syncQuickConnect();
                  setPairInfo(synced);
                  onNotify('Đã đồng bộ lại Mã Kết Nối lên đám mây!', 'success');
                } catch {
                  onNotify('Không thể đồng bộ Mã Kết Nối', 'error');
                }
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300"
            >
              <Zap className="h-3.5 w-3.5" />
              Đồng bộ mã
            </button>
            <button
              type="button"
              disabled={rotatingPair}
              onClick={handleRotatePair}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', rotatingPair && 'animate-spin')} />
              Đổi mã mới
            </button>
          </div>
        </div>

        {pairInfo ? (
          <div className="mt-4 grid gap-5 md:grid-cols-[200px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-3">
              {pairInfo.qr_svg_data_url ? (
                <img
                  src={pairInfo.qr_svg_data_url}
                  alt="QR ghép nối Antigravity Pulse"
                  className="h-44 w-44 object-contain"
                />
              ) : (
                <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-400">
                  Không có QR
                </div>
              )}
              <span className="mt-1.5 text-[10px] font-semibold text-slate-500">
                Quét bằng Camera ĐT
              </span>
            </div>

            <div className="space-y-3">
              {/* Highlighted 6-Char Global Quick Connect Code */}
              {pairInfo.quick_code && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 px-4 py-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        ⚡ Mã Kết Nối Nhanh (nhập trên App máy khác — không cần gõ IP)
                      </p>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          pairInfo.quick_relay_synced
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                            : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                        )}
                      >
                        {pairInfo.quick_relay_synced ? '● Sẵn sàng mọi mạng' : '● Mạng nội bộ'}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-2xl font-black tracking-[0.22em] text-cyan-600 dark:text-cyan-300">
                      {pairInfo.quick_code}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopy('Mã Kết Nối Nhanh', pairInfo.quick_code!)}
                    className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-cyan-500 px-3.5 text-xs font-bold text-slate-950 shadow-sm hover:bg-cyan-400"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Chép mã {pairInfo.quick_code}
                  </button>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-[#090d16]">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Link gọn 1 chạm (gửi qua Zalo / Messenger cho máy khác bấm vào là tự đăng nhập)
                </p>
                <p className="mt-1 break-all font-mono text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                  {primaryShareUrl}
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy('link gọn 1 chạm', primaryShareUrl)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-700 dark:text-cyan-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Sao chép link
                  </button>
                  <button
                    type="button"
                    onClick={handleShareZalo}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[#0068FF] px-3 text-xs font-bold text-white shadow-sm hover:brightness-110"
                  >
                    💬 Gửi qua Zalo
                  </button>
                  <button
                    type="button"
                    onClick={handleShareMessenger}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-gradient-to-r from-[#0084FF] to-[#A033FF] px-3 text-xs font-bold text-white shadow-sm hover:brightness-110"
                  >
                    💙 Gửi qua Messenger
                  </button>
                  <button
                    type="button"
                    onClick={handleSharePairUrl}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    Chia sẻ khác
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Mã PIN phụ (khi vào trực tiếp bằng IP)</p>
                  <p className="font-mono text-base font-bold tracking-[0.25em] text-slate-700 dark:text-slate-200">
                    {pairInfo.pin}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy('mã PIN', pairInfo.pin)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Chép PIN
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  value={customPin}
                  onChange={(e) => setCustomPin(e.target.value)}
                  placeholder="PIN mới tùy chọn (bỏ trống để tạo ngẫu nhiên)"
                  className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-xs text-slate-400">Đang tải thông tin ghép nối...</p>
        )}
      </section>

      {/* Lucian #393 Mobile App Download Card (Android & iOS) */}
      <section className="flex justify-center rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]/80">
        <AppDownloadCard
          eyebrow="Antigravity Pulse Mobile"
          title="Cùng một không gian làm việc, mọi nơi"
          platforms={[
            {
              id: 'android',
              label: 'Android',
              cta: 'Tải cho Android (.apk)',
              meta: mobileBuilds?.android_apk_available && mobileBuilds.android_apk_size
                ? `APK trực tiếp · ${formatBytes(mobileBuilds.android_apk_size)} · Android 8.0+`
                : 'Android 8.0+ · APK cài trực tiếp (GitHub Release)',
              onDownload: () => {
                const apkUrl = mobileBuilds?.android_apk_available
                  ? api.getMobilePackageDownloadUrl('android')
                  : 'https://github.com/Shinooz2High/App-Antigravity-on-moblie-/releases/download/latest/Antigravity-Pulse-Android.apk';
                openExternalLink(apkUrl);
                onNotify('Đang tải file cài đặt Antigravity-Pulse-Android.apk...', 'success');
              },
            },
            {
              id: 'ios',
              label: 'iOS',
              cta: 'Cài cho iOS (iPhone / iPad)',
              meta: mobileBuilds?.ios_ipa_available && mobileBuilds.ios_ipa_size
                ? `IPA · ${formatBytes(mobileBuilds.ios_ipa_size)} · iOS 15+`
                : 'iOS 15+ · Safari (Thêm vào MH chính) / Xcode IPA',
              onDownload: () => {
                if (mobileBuilds?.ios_ipa_available) {
                  openExternalLink(api.getMobilePackageDownloadUrl('ios'));
                  onNotify('Đang tải gói cài đặt Antigravity Pulse (.ipa) cho iOS...', 'success');
                } else if (canInstallPwa) {
                  triggerPwaInstall();
                  onNotify('Đang cài ứng dụng lên màn hình chính...', 'success');
                } else {
                  onNotify(
                    'Trên Safari iPhone/iPad: Bấm nút Chia sẻ (□↑) → Chọn "Thêm vào Màn hình chính" để dùng full-screen như App gốc!',
                    'info'
                  );
                }
              },
            },
          ]}
        />
      </section>

      {/* Remote Access & Tunnel */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-indigo-400" />
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Truy cập mạng & Tunnel ngắn dễ nhớ
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chọn chế độ Tunnel để có link ngắn dễ nhớ khi đi ra ngoài mạng Wi-Fi nội bộ
              </p>
            </div>
          </div>

          <button
            type="button"
            disabled={tunnelBusy}
            onClick={handleTunnelClick}
            className={cn(
              'inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-xs font-semibold transition disabled:opacity-50',
              systemStatus?.tunnel_running
                ? 'border border-rose-500/40 bg-rose-500/10 text-rose-600 hover:bg-rose-500/20 dark:text-rose-300'
                : 'bg-gradient-to-r from-cyan-500 to-indigo-600 text-white hover:brightness-110'
            )}
          >
            <Wifi className="h-4 w-4" />
            {tunnelBusy
              ? 'Đang xử lý...'
              : systemStatus?.tunnel_running
                ? 'Tắt Tunnel'
                : 'Bật Tunnel'}
          </button>
        </div>

        {/* Tunnel Mode Selector & Short URL Config */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090d16]">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Chế độ Tunnel
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(
              [
                {
                  id: 'cloudflare_quick' as TunnelMode,
                  title: 'Cloudflare + Link ngắn',
                  desc: 'Ổn định nhất, tự tạo is.gd/...',
                },
                {
                  id: 'serveo_ssh' as TunnelMode,
                  title: 'Serveo SSH',
                  desc: 'Miễn phí: ten.serveo.net',
                },
                {
                  id: 'cloudflare_named' as TunnelMode,
                  title: 'Tên miền riêng (CF)',
                  desc: 'Cố định vĩnh viễn',
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTunnelMode(opt.id)}
                className={cn(
                  'rounded-xl border px-3 py-2.5 text-left transition',
                  tunnelMode === opt.id
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-[#111827] dark:text-slate-300'
                )}
              >
                <p className="text-xs font-bold">{opt.title}</p>
                <p className="mt-0.5 text-[11px] opacity-80">{opt.desc}</p>
              </button>
            ))}
          </div>

          <div className="mt-3 space-y-2.5">
            {tunnelMode === 'cloudflare_quick' && (
              <>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#111827]">
                  <div>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Tự động tạo link rút gọn dễ nhớ (is.gd / tinyurl)
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Gõ link ngắn trên trình duyệt điện thoại để mở thẳng ứng dụng
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={tunnelAutoShorten}
                    onChange={(e) => setTunnelAutoShorten(e.target.checked)}
                    className="h-4 w-4 accent-cyan-500"
                  />
                </label>

                {tunnelAutoShorten && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Tên link ngắn tùy chọn (5-30 ký tự chữ/số/_, bỏ trống = tự động)
                    </label>
                    <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#111827]">
                      <span className="border-r border-slate-200 bg-slate-100 px-3 py-2.5 font-mono text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                        https://is.gd/
                      </span>
                      <input
                        type="text"
                        value={tunnelShortAlias}
                        onChange={(e) => setTunnelShortAlias(e.target.value)}
                        placeholder="agypulse_pc"
                        className="min-h-[40px] flex-1 bg-transparent px-3 font-mono text-xs text-slate-900 outline-none dark:text-white"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {tunnelMode === 'serveo_ssh' && (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Tên miền phụ mong muốn (không cần tài khoản, dùng OpenSSH có sẵn)
                </label>
                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-[#111827]">
                  <span className="border-r border-slate-200 bg-slate-100 px-2.5 py-2.5 font-mono text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                    https://
                  </span>
                  <input
                    type="text"
                    value={tunnelSubdomain}
                    onChange={(e) => setTunnelSubdomain(e.target.value)}
                    placeholder="agypulse"
                    className="min-h-[40px] flex-1 bg-transparent px-3 font-mono text-xs text-slate-900 outline-none dark:text-white"
                  />
                  <span className="border-l border-slate-200 bg-slate-100 px-2.5 py-2.5 font-mono text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                    .serveo.net
                  </span>
                </div>
              </div>
            )}

            {tunnelMode === 'cloudflare_named' && (
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Tên miền cố định (Public Hostname)
                  </label>
                  <input
                    type="text"
                    value={cfTunnelUrl}
                    onChange={(e) => setCfTunnelUrl(e.target.value)}
                    placeholder="https://pc.tenmien.com"
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                      Cloudflare Tunnel Token
                    </label>
                    {settings?.cloudflare_tunnel_token_set && (
                      <button
                        type="button"
                        onClick={handleClearCfTunnelToken}
                        className="text-[11px] font-medium text-rose-500 hover:underline"
                      >
                        Xóa Token
                      </button>
                    )}
                  </div>
                  <input
                    type="password"
                    value={cfTunnelTokenInput}
                    onChange={(e) => setCfTunnelTokenInput(e.target.value)}
                    placeholder={
                      settings?.cloudflare_tunnel_token_set
                        ? `Đã lưu (${settings.cloudflare_tunnel_token_masked || '***'})`
                        : 'Dán token từ Cloudflare Zero Trust...'
                    }
                    className="min-h-[40px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                disabled={savingTunnelConfig}
                onClick={handleSaveTunnelConfig}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 disabled:opacity-50 dark:text-cyan-300"
              >
                <Save className="h-3.5 w-3.5" />
                {savingTunnelConfig ? 'Đang lưu...' : 'Lưu cấu hình Tunnel'}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/35 bg-cyan-500/10 px-3.5 py-2.5">
            <span className="font-semibold text-cyan-700 dark:text-cyan-300">
              Cổng Web cố định:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopy('Cổng Web cố định', PUBLIC_WEB_PORTAL_URL)}
                className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-cyan-700 hover:underline dark:text-cyan-200"
              >
                {PUBLIC_WEB_PORTAL_URL}
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openExternalLink(PUBLIC_WEB_PORTAL_URL)}
                className="rounded-lg border border-cyan-500/30 p-1 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-200"
                title="Mở agypulse.dpdns.org"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {systemStatus && (
            <>
              {systemStatus.tunnel_short_url && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2.5">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                    Link ngắn dễ nhớ:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopy('Link ngắn Tunnel', systemStatus.tunnel_short_url!)}
                    className="inline-flex items-center gap-1.5 font-mono text-sm font-bold text-emerald-700 hover:underline dark:text-emerald-200"
                  >
                    {systemStatus.tunnel_short_url}
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
                <span className="text-slate-500 dark:text-slate-400">Tunnel URL:</span>
                {systemStatus.tunnel_url ? (
                  <button
                    type="button"
                    onClick={() => handleCopy('Tunnel URL', systemStatus.tunnel_url!)}
                    className="inline-flex items-center gap-1.5 break-all text-right font-mono font-medium text-emerald-600 hover:underline dark:text-emerald-300"
                  >
                    {systemStatus.tunnel_url}
                    <Copy className="h-3 w-3 shrink-0" />
                  </button>
                ) : (
                  <span className="font-mono font-medium text-slate-400">Chưa kích hoạt</span>
                )}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
                <span className="text-slate-500 dark:text-slate-400">LAN URL:</span>
                <button
                  type="button"
                  onClick={() => handleCopy('LAN URL', systemStatus.lan_url)}
                  className="font-mono font-medium text-slate-800 hover:text-cyan-500 dark:text-slate-200"
                >
                  {systemStatus.lan_url}
                </button>
              </div>
              {systemStatus.tailscale_url && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#090d16]">
                  <span className="text-slate-500 dark:text-slate-400">Tailscale URL:</span>
                  <button
                    type="button"
                    onClick={() => handleCopy('Tailscale URL', systemStatus.tailscale_url!)}
                    className="font-mono font-medium text-cyan-600 dark:text-cyan-300"
                  >
                    {systemStatus.tailscale_url}
                  </button>
                </div>
              )}
            </>
          )}

          {((tunnelMode !== 'serveo_ssh' && !systemStatus?.cloudflared_installed) ||
            (tunnelMode === 'serveo_ssh' && systemStatus?.ssh_installed === false) ||
            tunnelHint) && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">
              <p className="font-semibold">
                {tunnelHint?.error ||
                  (tunnelMode === 'serveo_ssh'
                    ? 'Chưa phát hiện OpenSSH Client (ssh) trên máy tính PC.'
                    : 'Chưa phát hiện cloudflared trên máy tính PC.')}
              </p>
              <p className="mt-1">
                Gợi ý:{' '}
                <code className="rounded bg-black/20 px-1.5 py-0.5 font-mono">
                  {tunnelHint?.install_hint ||
                    (tunnelMode === 'serveo_ssh'
                      ? 'Bật OpenSSH Client trong Windows Optional Features'
                      : 'winget install Cloudflare.cloudflared')}
                </code>
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Google Account & Antigravity (AGY) Unified Auth */}
      <GoogleAgyAuthSection
        onAuthChanged={async () => {
          await onRefreshSystem();
          await loadData();
          await fetchModelsList(false);
        }}
        onNotify={onNotify}
      />

      {/* AI Engine & API Settings */}
      <form
        onSubmit={handleSaveSettings}
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]"
      >
        <div className="flex items-center gap-2 border-b border-slate-200 pb-3 dark:border-slate-800">
          <KeyRound className="h-5 w-5 text-cyan-500" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Cấu hình Antigravity SDK & Gemini API
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Lưu trực tiếp trên PC host (<code>backend/data/settings.json</code>)
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                Gemini API Key
              </label>
              {settings?.gemini_api_key_set && (
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    {settings.gemini_api_key_masked || 'Đã lưu'}
                  </span>
                  <button
                    type="button"
                    onClick={handleClearApiKey}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-500 hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    Xóa Key
                  </button>
                </div>
              )}
            </div>
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={
                settings?.gemini_api_key_set
                  ? 'Để trống nếu giữ nguyên API Key hiện tại...'
                  : 'Nhập AIza... từ Google AI Studio'
              }
              className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090d16]">
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Sử dụng Google Vertex AI
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Dùng GCP Project & ADC thay cho API Key trực tiếp
                </p>
              </div>
              <input
                type="checkbox"
                checked={vertexEnabled}
                onChange={(e) => setVertexEnabled(e.target.checked)}
                className="h-5 w-5 accent-cyan-500"
              />
            </label>

            {vertexEnabled && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Vertex Project ID
                  </label>
                  <input
                    type="text"
                    value={vertexProject}
                    onChange={(e) => setVertexProject(e.target.value)}
                    placeholder="my-gcp-project"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Vertex Location
                  </label>
                  <input
                    type="text"
                    value={vertexLocation}
                    onChange={(e) => setVertexLocation(e.target.value)}
                    placeholder="us-central1"
                    className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  Model mặc định
                </label>
                <a
                  href="#models-quota-section"
                  className="text-[11px] font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                >
                  Xem bảng Quota ↓
                </a>
              </div>
              <input
                type="text"
                list="agy-models"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gemini-3-flash-preview"
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              />
              <datalist id="agy-models">
                {modelsData?.models.map((m) => (
                  <option key={m.id} value={m.id} label={`${m.display_name} (${m.remaining_today} req)`} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Engine mặc định
              </label>
              <select
                value={defaultEngine}
                onChange={(e) => setDefaultEngine(e.target.value as EngineMode)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              >
                <option value="antigravity_sdk">Antigravity SDK</option>
                <option value="cli">CLI Runner</option>
                <option value="demo">Demo Simulator</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Quyền mặc định
              </label>
              <select
                value={defaultPolicy}
                onChange={(e) => setDefaultPolicy(e.target.value as ExecutionPolicy)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              >
                <option value="ask_mobile">Hỏi duyệt trên ĐT</option>
                <option value="read_only">Chỉ đọc</option>
                <option value="auto_workspace">Tự động trong workspace</option>
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Thư mục Antigravity Brain trên PC
              </label>
              <input
                type="text"
                value={brainDir}
                onChange={(e) => setBrainDir(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                Mã PIN truy cập
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={settingsPin}
                onChange={(e) => setSettingsPin(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-900 outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingSettings}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-5 text-sm font-semibold text-white shadow-md shadow-cyan-500/20 hover:brightness-110 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingSettings ? 'Đang lưu...' : 'Lưu cấu hình PC'}
            </button>
          </div>
        </div>
      </form>

      {/* AI Models & Live Quota Section */}
      <section
        id="models-quota-section"
        className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-sm shadow-cyan-500/30">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Danh Sách AI Models & Quota Còn Lại
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Theo dõi số lượt yêu cầu Free Tier và chuyển đổi model thực thi trực tiếp
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => fetchModelsList(true)}
            disabled={loadingModels}
            className="inline-flex min-h-[38px] items-center gap-1.5 self-start rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 sm:self-auto dark:border-slate-700 dark:bg-[#090d16] dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingModels ? 'animate-spin text-cyan-500' : ''}`} />
            {loadingModels ? 'Đang kiểm tra...' : 'Làm mới Quota'}
          </button>
        </div>

        {/* Current Model Banner */}
        {modelsData?.current_model && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3 dark:bg-cyan-500/10">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500 animate-pulse" />
              <span className="text-xs text-slate-600 dark:text-slate-300">
                Model đang kích hoạt trên PC:
              </span>
              <strong className="font-mono text-xs font-bold text-cyan-700 dark:text-cyan-300">
                {modelsData.current_model}
              </strong>
            </div>
            <span className="rounded-md bg-cyan-500/20 px-2 py-0.5 text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
              Đang hoạt động
            </span>
          </div>
        )}

        {/* Filter & Search Bar */}
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder="Tìm theo tên hoặc mã model..."
              className="h-9 w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-xs text-slate-900 outline-none transition focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
            />
            {modelSearch && (
              <button
                type="button"
                onClick={() => setModelSearch('')}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setModelCategoryFilter('all')}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                modelCategoryFilter === 'all'
                  ? 'bg-cyan-500 text-white shadow-sm shadow-cyan-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              Tất cả ({modelsData?.models.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setModelCategoryFilter('flash')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                modelCategoryFilter === 'flash'
                  ? 'bg-amber-500 text-white shadow-sm shadow-amber-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Zap className="h-3 w-3" />
              Flash (1500 req)
            </button>
            <button
              type="button"
              onClick={() => setModelCategoryFilter('pro')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                modelCategoryFilter === 'pro'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Brain className="h-3 w-3" />
              Pro (50 req)
            </button>
            <button
              type="button"
              onClick={() => setModelCategoryFilter('experimental')}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                modelCategoryFilter === 'experimental'
                  ? 'bg-purple-600 text-white shadow-sm shadow-purple-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <FlaskConical className="h-3 w-3" />
              Thử nghiệm
            </button>
          </div>
        </div>

        {/* Model Cards Grid */}
        <div className="mt-4">
          {loadingModels && !modelsData ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin text-cyan-500" />
              <p className="mt-2 text-xs">Đang kiểm tra quota models...</p>
            </div>
          ) : filteredModelsList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400">
              <Layers className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                Không tìm thấy model nào phù hợp
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredModelsList.map((m) => {
                const isCurrent = m.id === (currentModel || modelName || modelsData?.current_model);
                const isExhausted = m.status === 'exhausted';
                const isLow = m.status === 'low';
                const pctRemaining =
                  m.daily_limit > 0
                    ? Math.round((m.remaining_today / m.daily_limit) * 100)
                    : 0;

                const catBadge =
                  m.category === 'flash' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-600 uppercase dark:text-amber-400">
                      <Zap className="h-2.5 w-2.5" /> Flash
                    </span>
                  ) : m.category === 'pro' ? (
                    <span className="inline-flex items-center gap-1 rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-bold text-indigo-600 uppercase dark:text-indigo-400">
                      <Brain className="h-2.5 w-2.5" /> Pro
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-bold text-purple-600 uppercase dark:text-purple-400">
                      <FlaskConical className="h-2.5 w-2.5" /> Thử nghiệm
                    </span>
                  );

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col justify-between rounded-xl border p-3.5 transition-all ${
                      isCurrent
                        ? 'border-cyan-500 bg-cyan-500/5 ring-1 ring-cyan-500/20 dark:bg-cyan-500/10'
                        : isExhausted
                          ? 'border-rose-200 bg-rose-500/5 dark:border-rose-900/30 dark:bg-rose-950/20'
                          : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 dark:border-slate-800 dark:bg-[#090d16] dark:hover:border-slate-700'
                    }`}
                  >
                    <div>
                      {/* Name & Badge */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">
                              {m.display_name}
                            </span>
                            {catBadge}
                          </div>
                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {m.id}
                          </div>
                        </div>

                        {isCurrent && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500 px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
                            <Check className="h-3 w-3 stroke-[3]" /> Hiện tại
                          </span>
                        )}
                      </div>

                      {/* Description */}
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                        {m.description}
                      </p>
                    </div>

                    {/* Quota Progress */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">Quota còn lại:</span>
                        <span
                          className={`font-bold ${
                            isExhausted
                              ? 'text-rose-600 dark:text-rose-400'
                              : isLow
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {m.remaining_today.toLocaleString()} / {m.daily_limit.toLocaleString()} req
                        </span>
                      </div>

                      {/* Bar */}
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div
                          className={`h-full transition-all duration-300 ${
                            isExhausted
                              ? 'w-full bg-rose-500'
                              : isLow
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                          }`}
                          style={{
                            width: isExhausted ? '100%' : `${Math.max(5, pctRemaining)}%`,
                          }}
                        />
                      </div>

                      {/* Status / reset countdown */}
                      <div className="mt-2 flex items-center justify-between text-[10px]">
                        {isExhausted ? (
                          <div className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                            <AlertTriangle className="h-3 w-3" />
                            <span>Hết Quota (429)</span>
                            {m.retry_after && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-rose-500/10 px-1 py-0.2 text-[9px]">
                                <Clock className="h-2.5 w-2.5" /> {m.retry_after}
                              </span>
                            )}
                          </div>
                        ) : isLow ? (
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            ⚠️ Sắp hết ({m.remaining_today} req)
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ● Khả dụng
                          </span>
                        )}

                        <span className="text-slate-400">{m.rpm_limit} req/phút</span>
                      </div>

                      {/* Action button */}
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => handleQuickSelectModel(m)}
                          disabled={isCurrent || activatingModelId === m.id}
                          className={`w-full rounded-lg py-1.5 text-xs font-semibold transition ${
                            isCurrent
                              ? 'bg-cyan-500/15 text-cyan-600 dark:bg-cyan-500/20 dark:text-cyan-400 cursor-default'
                              : isExhausted
                                ? 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-slate-200 text-slate-700 hover:bg-cyan-500 hover:text-white dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-cyan-500 dark:hover:text-white'
                          }`}
                        >
                          {activatingModelId === m.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <RefreshCw className="h-3 w-3 animate-spin" /> Đang chọn...
                            </span>
                          ) : isCurrent ? (
                            '✓ Đang sử dụng'
                          ) : isExhausted ? (
                            'Chọn dù đang hết Quota'
                          ) : (
                            'Kích hoạt model này'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Connected Devices */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="mb-3 flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-cyan-500" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Thiết bị đã kết nối ({devices.length})
          </h2>
        </div>

        {devices.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chưa có lịch sử thiết bị nào được ghi nhận.
          </p>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {devices.map((dev) => (
              <div
                key={dev.device_id}
                className="flex items-center justify-between gap-3 px-3.5 py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'h-2 w-2 rounded-full',
                        dev.online ? 'bg-emerald-400' : 'bg-slate-400'
                      )}
                    />
                    <span className="truncate font-semibold text-slate-900 dark:text-white">
                      {dev.device_name}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Hoạt động cuối: {formatRelativeTime(dev.last_seen_at)}
                  </p>
                </div>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                    dev.online
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                      : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  )}
                >
                  {dev.online ? 'Online' : 'Offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Native Android & iOS Mobile App Hub */}
      <section className="rounded-2xl border border-cyan-500/25 bg-white p-4 shadow-sm sm:p-5 dark:border-cyan-500/20 dark:bg-[#111827]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-sm shadow-cyan-500/30">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Ứng dụng Di động Android &amp; iOS
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Chạy bản Native App (.apk / .ipa), cài PWA màn hình chính &amp; chuyển đổi máy chủ PC
              </p>
            </div>
          </div>

          <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-700 dark:text-cyan-300">
            {isNativeApp()
              ? getMobilePlatform() === 'ios'
                ? 'Đang chạy: iOS Native App'
                : 'Đang chạy: Android Native App'
              : isStandalonePwa()
                ? 'Đang chạy: App PWA Độc lập'
                : 'Đang chạy: Trình duyệt Web'}
          </span>
        </div>

        <div className="space-y-3">
          {/* Active PC Server URL Config */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#090d16]">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Địa chỉ Máy chủ PC kết nối (LAN IP / Cloudflare Tunnel)
              </label>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
              >
                <Camera className="h-3.5 w-3.5" />
                Quét QR máy chủ
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                type="url"
                value={serverUrlEdit}
                onChange={(e) => setServerUrlEdit(e.target.value)}
                placeholder={
                  systemStatus?.tunnel_url ||
                  systemStatus?.lan_url ||
                  'VD: http://192.168.1.84:8765 hoặc https://xxx.trycloudflare.com'
                }
                className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
              />
              <button
                type="button"
                onClick={handleSaveServerUrl}
                className="min-h-[42px] rounded-xl bg-cyan-500 px-4 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
              >
                Lưu máy chủ
              </button>
            </div>
          </div>

          {/* Install / Download Buttons */}
          <div className="grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090d16]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  🤖 Android (.apk &amp; PWA)
                </span>
                <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-300">
                  {mobileBuilds?.android_apk_available ? 'Đã có file APK' : 'Capacitor Ready'}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Cài đặt trực tiếp gói <code className="font-mono">Antigravity-Pulse.apk</code> hoặc cài nhanh qua Chrome 1 chạm.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {mobileBuilds?.android_apk_available && (
                  <button
                    type="button"
                    onClick={() => openExternalLink(api.getMobilePackageDownloadUrl('android'))}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải Android APK{' '}
                    {mobileBuilds.android_apk_size
                      ? `(${formatBytes(mobileBuilds.android_apk_size)})`
                      : ''}
                  </button>
                )}
                {canInstallPwa && (
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await triggerPwaInstall();
                      if (ok) onNotify('Đã cài đặt ứng dụng lên màn hình chính!', 'success');
                    }}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Cài App ngay (1 chạm)
                  </button>
                )}
                {!mobileBuilds?.android_apk_available && !canInstallPwa && (
                  <span className="text-[11px] text-slate-400">
                    Chạy <code className="font-mono">.\build-mobile.ps1</code> hoặc GitHub Actions để xuất file <code className="font-mono">.apk</code>
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-[#090d16]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  🍎 iOS — iPhone &amp; iPad (.ipa &amp; Safari)
                </span>
                <span className="rounded bg-indigo-500/15 px-2 py-0.5 text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                  {mobileBuilds?.ios_ipa_available ? 'Đã có file IPA' : 'Xcode + PWA Ready'}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {isIosBrowser()
                  ? 'Trên Safari iPhone: Nhấn biểu tượng Chia sẻ (Share) ở thanh dưới → Chọn "Thêm vào MH chính" (Add to Home Screen).'
                  : 'Hỗ trợ cài file .ipa qua Sideloadly / AltStore / Xcode hoặc mở bằng Safari trên iPhone → "Thêm vào MH chính".'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {mobileBuilds?.ios_ipa_available && (
                  <button
                    type="button"
                    onClick={() => openExternalLink(api.getMobilePackageDownloadUrl('ios'))}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-500"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Tải iOS IPA{' '}
                    {mobileBuilds.ios_ipa_size
                      ? `(${formatBytes(mobileBuilds.ios_ipa_size)})`
                      : ''}
                  </button>
                )}
                {mobileBuilds?.deep_link_pair_url && (
                  <button
                    type="button"
                    onClick={() => handleCopy('Deep Link mở App gốc', mobileBuilds.deep_link_pair_url!)}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Chép Deep Link (agypulse://)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mobile App Preferences */}
      <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-[#111827]">
        <div className="mb-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-400" />
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Tùy chọn ứng dụng trên thiết bị này
          </h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-[#090d16]">
            <div>
              <p className="text-xs font-semibold">Giao diện (Dark / Light Mode)</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Đang dùng: {isDark ? 'Chế độ tối (Mission Control)' : 'Chế độ sáng'}
              </p>
            </div>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
            >
              {isDark ? (
                <>
                  <Sun className="h-4 w-4 text-amber-400" />
                  Bật nền sáng
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4 text-indigo-500" />
                  Bật nền tối
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 dark:border-slate-800 dark:bg-[#090d16]">
            <div>
              <p className="text-xs font-semibold">Thông báo trình duyệt</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Báo khi Prompt hoàn tất hoặc có yêu cầu duyệt công cụ
              </p>
            </div>
            <div className="flex items-center gap-2">
              {notificationsEnabled && (
                <button
                  type="button"
                  onClick={onTestNotification}
                  className="min-h-[40px] rounded-xl border border-slate-200 px-3 text-xs font-medium dark:border-slate-700"
                >
                  Thử báo
                </button>
              )}
              <button
                type="button"
                onClick={onToggleNotifications}
                className={cn(
                  'inline-flex min-h-[42px] items-center gap-2 rounded-xl px-3.5 text-xs font-semibold',
                  notificationsEnabled
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                )}
              >
                <Bell className="h-4 w-4" />
                {notificationsEnabled ? 'Đang bật' : 'Đã tắt'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-[#090d16]">
            <input
              type="text"
              value={localDeviceName}
              onChange={(e) => setLocalDeviceName(e.target.value)}
              placeholder="Tên thiết bị này..."
              className="min-h-[42px] flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
            />
            <button
              type="button"
              onClick={handleSaveDeviceName}
              className="min-h-[42px] rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111827] dark:hover:bg-slate-800"
            >
              Đổi tên thiết bị
            </button>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              Ngắt ghép nối thiết bị này
            </button>
          </div>
        </div>
      </section>

      <QrScannerModal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        onScanSuccess={handleQrSwitchServer}
      />
    </div>
  );
}
