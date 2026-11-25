import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Cloud,
  Copy,
  ExternalLink,
  HelpCircle,
  KeyRound,
  LogOut,
  Monitor,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  UserCheck,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { isNativeApp, openExternalLink } from '../lib/native';
import { cn, copyToClipboard } from '../lib/utils';
import type { AuthSource, GoogleAuthStatus } from '../types/api';

interface GoogleAgyAuthSectionProps {
  onAuthChanged: () => Promise<void> | void;
  onNotify: (msg: string, tone?: 'info' | 'success' | 'error') => void;
}

const AUTH_SOURCE_OPTIONS: Array<{
  value: AuthSource;
  label: string;
  desc: string;
}> = [
  {
    value: 'auto',
    label: '✨ Tự động (Khuyên dùng)',
    desc: 'Ưu tiên Token AGY → Tài khoản Google → API Key',
  },
  {
    value: 'agy_account',
    label: '⚡ Token của AGY',
    desc: 'Dùng phiên đăng nhập Antigravity chính thức trên PC',
  },
  {
    value: 'google_oauth',
    label: '🔵 Tài khoản Google',
    desc: 'Dùng OAuth 2.0 / ADC / Access Token của tài khoản Google',
  },
  {
    value: 'api_key',
    label: '🔑 Gemini API Key',
    desc: 'Dùng mã AIza... từ Google AI Studio',
  },
  {
    value: 'vertex_adc',
    label: '☁️ Vertex AI',
    desc: 'Dùng GCP Project & Application Default Credentials',
  },
];

function formatEffectiveLabel(src: string): string {
  switch (src) {
    case 'agy_account':
      return 'Token Tài khoản Antigravity (AGY)';
    case 'google_oauth':
      return 'Tài khoản Google (OAuth 2.0 Token)';
    case 'vertex_adc':
      return 'Google Cloud Vertex AI';
    default:
      return 'Gemini API Key';
  }
}

export function GoogleAgyAuthSection({
  onAuthChanged,
  onNotify,
}: GoogleAgyAuthSectionProps) {
  const [status, setStatus] = useState<GoogleAuthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Google Login sub-tabs: oauth | adc | token
  const [loginMethod, setLoginMethod] = useState<'oauth' | 'adc' | 'token'>('oauth');
  const [showClientForm, setShowClientForm] = useState(false);
  const [showSwitchAccount, setShowSwitchAccount] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  // OAuth Client inputs
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [clientJson, setClientJson] = useState('');
  const [quotaProjectId, setQuotaProjectId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pending OAuth callback manual paste (helpful on mobile LAN)
  const [pendingState, setPendingState] = useState<string | null>(null);
  const [manualCallbackInput, setManualCallbackInput] = useState('');

  // Direct Access Token inputs
  const [directAccessToken, setDirectAccessToken] = useState('');
  const [directRefreshToken, setDirectRefreshToken] = useState('');

  const loadStatus = useCallback(
    async (forceRefresh = false, silent = false) => {
      setLoading(true);
      try {
        const res = await api.getGoogleAuthStatus(forceRefresh);
        setStatus(res);
        if (res.quota_project_id) {
          setQuotaProjectId((prev) => prev || res.quota_project_id || '');
        }
        if (forceRefresh && !silent) {
          onNotify('Đã làm mới trạng thái tài khoản Google & AGY', 'success');
        }
      } catch (err) {
        if (!silent) {
          onNotify(
            err instanceof Error ? err.message : 'Không thể kiểm tra trạng thái đăng nhập Google/AGY',
            'error'
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [onNotify]
  );

  useEffect(() => {
    loadStatus(false, true);
  }, [loadStatus]);

  // Listen for OAuth popup postMessage and WebSocket broadcast custom event
  useEffect(() => {
    const handleMessage = (ev: MessageEvent) => {
      if (ev.data && typeof ev.data === 'object' && ev.data.type === 'AGY_GOOGLE_OAUTH_SUCCESS') {
        setPendingState(null);
        setShowSwitchAccount(false);
        loadStatus(false, true);
        onAuthChanged();
        onNotify('Đăng nhập Tài khoản Google thành công!', 'success');
      }
    };
    const handleWsCustom = () => {
      setPendingState(null);
      setShowSwitchAccount(false);
      loadStatus(false, true);
      onAuthChanged();
    };
    window.addEventListener('message', handleMessage);
    window.addEventListener('agy:google-auth-changed', handleWsCustom);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('agy:google-auth-changed', handleWsCustom);
    };
  }, [loadStatus, onAuthChanged, onNotify]);

  const handleChangeAuthSource = async (nextSource: AuthSource) => {
    setBusyAction(`src_${nextSource}`);
    try {
      await api.updateSystemSettings({ auth_source: nextSource });
      await loadStatus(false, true);
      await onAuthChanged();
      onNotify(`Đã chuyển nguồn xác thực sang: ${formatEffectiveLabel(nextSource === 'auto' ? status?.effective_auth_source || 'agy_account' : nextSource)}`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể đổi nguồn xác thực', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleActivateAgy = async () => {
    setBusyAction('activate_agy');
    try {
      const next = await api.activateAgyAccount();
      setStatus(next);
      await onAuthChanged();
      onNotify(
        next.agy_authenticated
          ? `Đã kích hoạt Token AGY (${next.agy_model_count} models sẵn sàng)!`
          : 'Đã bật chế độ Token AGY. Hãy đăng nhập AGY trên PC nếu chưa đăng nhập.',
        next.agy_authenticated ? 'success' : 'info'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể kích hoạt Token AGY', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLaunchAgyLoginOnPc = async () => {
    setBusyAction('agy_login');
    try {
      const res = await api.launchAgyLogin();
      onNotify(res.message, 'success');
      setTimeout(() => {
        loadStatus(true, true);
        onAuthChanged();
      }, 6000);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể mở cửa sổ AGY trên PC', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleUploadClientJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setClientJson(text);
      setBusyAction('save_client');
      const next = await api.saveGoogleOAuthClient({
        client_json: text,
        quota_project_id: quotaProjectId.trim() || undefined,
      });
      setStatus(next);
      setShowClientForm(false);
      onNotify('Đã nạp file client_secret.json thành công! Giờ hãy bấm Đăng nhập với Google.', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'File JSON không hợp lệ', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveOAuthClient = async () => {
    setBusyAction('save_client');
    try {
      const next = await api.saveGoogleOAuthClient({
        client_id: clientId.trim() || undefined,
        client_secret: clientSecret.trim() || undefined,
        client_json: clientJson.trim() || undefined,
        quota_project_id: quotaProjectId.trim() || undefined,
      });
      setStatus(next);
      setClientSecret('');
      setClientJson('');
      setShowClientForm(false);
      onNotify('Đã lưu cấu hình Google OAuth Client!', 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể lưu OAuth Client', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleStartOAuth = async (openOnPc: boolean) => {
    setBusyAction(openOnPc ? 'oauth_pc' : 'oauth_web');
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await api.startGoogleOAuth({
        open_on_pc: openOnPc,
        redirect_origin: origin,
      });
      setPendingState(res.state);

      if (openOnPc) {
        onNotify(
          res.opened_on_pc
            ? 'Đã mở trang Đăng nhập Google trên trình duyệt PC! Hoàn tất trên PC để tự động nhận token.'
            : 'Yêu cầu đã tạo — hãy mở link xác thực trên PC.',
          'info'
        );
        return;
      }

      if (isNativeApp()) {
        await openExternalLink(res.auth_url);
      } else {
        const popup = window.open(
          res.auth_url,
          'agy_google_oauth',
          'width=520,height=680,menubar=no,toolbar=no,status=no'
        );
        if (!popup) {
          window.location.href = res.auth_url;
        }
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể khởi tạo đăng nhập Google', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualCallbackSubmit = async () => {
    if (!manualCallbackInput.trim()) return;
    setBusyAction('manual_cb');
    try {
      const next = await api.completeGoogleOAuthManual(
        manualCallbackInput.trim(),
        pendingState || undefined
      );
      setStatus(next);
      setManualCallbackInput('');
      setPendingState(null);
      setShowSwitchAccount(false);
      await onAuthChanged();
      onNotify(`Đã đăng nhập Google: ${next.google_email || 'Thành công'}!`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Xác nhận mã OAuth thất bại', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportAdc = async () => {
    setBusyAction('import_adc');
    try {
      const next = await api.importGcloudAdc();
      setStatus(next);
      setShowSwitchAccount(false);
      await onAuthChanged();
      onNotify(`Đã đồng bộ Token từ Google Cloud ADC (${next.google_email || 'OK'})!`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể nhập từ Google Cloud ADC', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveDirectToken = async () => {
    if (!directAccessToken.trim()) {
      onNotify('Vui lòng dán Google OAuth Access Token (ya29...)', 'info');
      return;
    }
    setBusyAction('direct_token');
    try {
      const next = await api.saveDirectGoogleToken({
        access_token: directAccessToken.trim(),
        refresh_token: directRefreshToken.trim() || undefined,
        quota_project_id: quotaProjectId.trim() || undefined,
      });
      setStatus(next);
      setDirectAccessToken('');
      setDirectRefreshToken('');
      setShowSwitchAccount(false);
      await onAuthChanged();
      onNotify(`Đã kết nối Token Google (${next.google_email || 'Hợp lệ'})!`, 'success');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Token Google không hợp lệ', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const handleLogoutGoogle = async () => {
    if (!window.confirm('Đăng xuất tài khoản Google OAuth khỏi Antigravity Pulse?')) return;
    setBusyAction('logout_google');
    try {
      const next = await api.logoutGoogleAccount();
      setStatus(next);
      await onAuthChanged();
      onNotify('Đã ngắt kết nối tài khoản Google OAuth', 'info');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Không thể đăng xuất', 'error');
    } finally {
      setBusyAction(null);
    }
  };

  const activeSource = status?.auth_source || 'auto';
  const effectiveSource = status?.effective_auth_source || 'agy_account';

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-white p-4 shadow-sm sm:p-5 dark:border-cyan-500/25 dark:bg-[#111827]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3.5 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-500 to-indigo-600 text-white shadow-md shadow-cyan-500/25">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Đăng nhập Tài khoản Google &amp; Token AGY
              </h2>
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                Đang dùng: {formatEffectiveLabel(effectiveSource)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Dùng trực tiếp gói tài khoản Antigravity (AGY) của bạn hoặc đăng nhập Google OAuth 2.0 để lấy Token chạy AI
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={() => loadStatus(true, false)}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-[#090d16] dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin text-cyan-500')} />
          Kiểm tra phiên
        </button>
      </div>

      {/* Auth Source Mode Selector */}
      <div className="mt-4">
        <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-200">
          Nguồn Token ưu tiên khi chạy Prompt:
        </label>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {AUTH_SOURCE_OPTIONS.map((opt) => {
            const selected = activeSource === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={busyAction !== null}
                onClick={() => handleChangeAuthSource(opt.value)}
                className={cn(
                  'flex flex-col items-start rounded-xl border p-2.5 text-left transition',
                  selected
                    ? 'border-cyan-500 bg-cyan-500/10 ring-1 ring-cyan-500/30 dark:bg-cyan-500/15'
                    : 'border-slate-200 bg-slate-50/70 hover:border-slate-300 dark:border-slate-800 dark:bg-[#090d16] dark:hover:border-slate-700'
                )}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {opt.label}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-500" />}
                </div>
                <span className="mt-1 line-clamp-2 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                  {opt.desc}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Two Main Cards: 1. AGY Account Token | 2. Google Account OAuth Login */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* CARD 1: AGY UNIFIED GOOGLE ACCOUNT TOKEN */}
        <div className="flex flex-col justify-between rounded-2xl border border-cyan-500/25 bg-gradient-to-b from-cyan-500/[0.06] to-transparent p-4 dark:border-cyan-500/20 dark:bg-[#090d16]">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-cyan-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  1. Token Tài khoản Antigravity (AGY)
                </h3>
              </div>
              {status?.agy_authenticated ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
                  <ShieldCheck className="h-3 w-3" />
                  Đã đăng nhập ({status.agy_model_count} models)
                </span>
              ) : (
                <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-300">
                  {status?.agy_cli_installed ? 'Chờ xác thực' : 'Chưa cài AGY CLI'}
                </span>
              )}
            </div>

            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              Sử dụng trực tiếp phiên đăng nhập Google của <strong>Antigravity (AGY)</strong> trong Keyring bảo mật của máy tính — <strong>không lo giới hạn 20 req/ngày của API Key lẻ</strong> và mở khóa toàn bộ model Gemini 4 Carbon, Neon, Argon, Hydrogen &amp; Claude 4.6.
            </p>

            {status?.agy_api_key_override && (
              <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                Phát hiện <code>modelProvider: &quot;gemini&quot;</code> đang bật trong cấu hình CLI. Nhấn <strong>&quot;Dùng Token của AGY ngay&quot;</strong> để gỡ giới hạn API key và quay về tài khoản Google AGY.
              </div>
            )}

            {status?.agy_error && !status.agy_authenticated && (
              <div className="mt-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-2.5 text-[11px] text-rose-600 dark:text-rose-300">
                {status.agy_error}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800">
            <button
              type="button"
              disabled={busyAction !== null || !status?.agy_cli_installed}
              onClick={handleActivateAgy}
              className={cn(
                'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl px-3.5 text-xs font-bold transition disabled:opacity-50',
                effectiveSource === 'agy_account' && status?.agy_authenticated
                  ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30 dark:text-emerald-300'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-sm shadow-cyan-500/25 hover:brightness-110'
              )}
            >
              <Zap className="h-3.5 w-3.5" />
              {effectiveSource === 'agy_account' && status?.agy_authenticated
                ? '✓ Đang dùng Token của AGY'
                : 'Dùng Token của AGY ngay'}
            </button>

            <button
              type="button"
              disabled={busyAction !== null || !status?.agy_cli_installed}
              onClick={handleLaunchAgyLoginOnPc}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <Monitor className="h-3.5 w-3.5 text-cyan-500" />
              {status?.agy_authenticated ? 'Đổi tài khoản AGY' : 'Đăng nhập AGY trên PC'}
            </button>
          </div>
        </div>

        {/* CARD 2: DIRECT GOOGLE ACCOUNT OAUTH 2.0 / ADC / TOKEN */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-[#090d16]">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  2. Đăng nhập Tài khoản Google (OAuth 2.0)
                </h3>
              </div>
              {status?.google_connected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/15 px-2.5 py-0.5 text-[10px] font-bold text-blue-600 dark:text-blue-300">
                  <Check className="h-3 w-3" />
                  Đã đăng nhập
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  Chưa kết nối
                </span>
              )}
            </div>

            {/* Connected Google Profile View */}
            {status?.google_connected && !showSwitchAccount ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
                  {status.google_picture ? (
                    <img
                      src={status.google_picture}
                      alt={status.google_name || 'Google Avatar'}
                      className="h-10 w-10 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {(status.google_email || 'G')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-slate-900 dark:text-white">
                      {status.google_name || 'Tài khoản Google'}
                    </p>
                    <p className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {status.google_email}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
                      <span className="rounded bg-blue-500/10 px-1.5 py-0.5 font-semibold text-blue-600 dark:text-blue-300">
                        {status.google_token_source === 'gcloud_adc'
                          ? 'Google Cloud ADC'
                          : status.google_token_source === 'manual_token'
                            ? 'Access Token'
                            : 'Google OAuth 2.0'}
                      </span>
                      {status.google_has_refresh_token ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          ● Tự động gia hạn Token
                        </span>
                      ) : status.google_expires_in_seconds !== null ? (
                        <span className="text-amber-600 dark:text-amber-400">
                          Còn ~{Math.max(1, Math.round(status.google_expires_in_seconds / 60))} phút
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {effectiveSource !== 'google_oauth' && (
                    <button
                      type="button"
                      onClick={() => handleChangeAuthSource('google_oauth')}
                      className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Dùng Token tài khoản này
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowSwitchAccount(true)}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
                  >
                    Đổi tài khoản khác
                  </button>
                  <button
                    type="button"
                    onClick={handleLogoutGoogle}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-semibold text-rose-600 hover:bg-rose-500/20 dark:text-rose-300"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Đăng xuất
                  </button>
                </div>
              </div>
            ) : (
              /* Disconnected / Switch Google Account Tabs */
              <div className="mt-2.5 space-y-3">
                <div className="flex flex-wrap gap-1 rounded-xl bg-slate-200/70 p-1 dark:bg-[#111827]">
                  <button
                    type="button"
                    onClick={() => setLoginMethod('oauth')}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition',
                      loginMethod === 'oauth'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    )}
                  >
                    Google Sign-In
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod('token')}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition',
                      loginMethod === 'token'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    )}
                  >
                    Dán Token (ya29...)
                  </button>
                  <button
                    type="button"
                    onClick={() => setLoginMethod('adc')}
                    className={cn(
                      'flex-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition',
                      loginMethod === 'adc'
                        ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    )}
                  >
                    Google ADC
                  </button>
                </div>

                {loginMethod === 'oauth' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">
                        {status?.oauth_client_configured
                          ? `OAuth Client: ${status.oauth_client_id_preview}`
                          : 'Cần OAuth Client ID (Desktop/Web) từ Google Cloud'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowClientForm((v) => !v)}
                        className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                      >
                        {showClientForm
                          ? 'Ẩn cấu hình'
                          : status?.oauth_client_configured
                            ? 'Sửa Client ID'
                            : '+ Nhập Client ID / JSON'}
                      </button>
                    </div>

                    {(showClientForm || !status?.oauth_client_configured) && (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#111827]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          onChange={handleUploadClientJson}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Tải nhanh <code>client_secret.json</code> hoặc nhập tay:
                          </span>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center gap-1 rounded-lg bg-cyan-500/15 px-2.5 py-1 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                          >
                            <Upload className="h-3 w-3" />
                            Chọn file JSON
                          </button>
                        </div>

                        <input
                          type="text"
                          value={clientId}
                          onChange={(e) => setClientId(e.target.value)}
                          placeholder="Google OAuth Client ID (xxx.apps.googleusercontent.com)"
                          className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                        />
                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            type="password"
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            placeholder="Client Secret (tùy chọn cho Desktop)"
                            className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                          />
                          <input
                            type="text"
                            value={quotaProjectId}
                            onChange={(e) => setQuotaProjectId(e.target.value)}
                            placeholder="GCP Project ID (tùy chọn)"
                            className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 font-mono text-xs outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={handleSaveOAuthClient}
                          className="w-full rounded-lg bg-slate-800 py-2 text-xs font-semibold text-white hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600"
                        >
                          Lưu OAuth Client
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!status?.oauth_client_configured || busyAction !== null}
                        onClick={() => handleStartOAuth(false)}
                        className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-40"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Đăng nhập với Google
                      </button>
                      <button
                        type="button"
                        disabled={!status?.oauth_client_configured || busyAction !== null}
                        onClick={() => handleStartOAuth(true)}
                        title="Mở trình duyệt trực tiếp trên màn hình máy tính PC (tiện lợi khi điện thoại dùng mạng LAN)"
                        className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-[#111827] dark:text-slate-200"
                      >
                        <Monitor className="h-3.5 w-3.5 text-blue-500" />
                        Mở trên PC
                      </button>
                    </div>

                    {pendingState && (
                      <div className="space-y-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-2.5">
                        <p className="text-[11px] text-slate-600 dark:text-slate-300">
                          Nếu đăng nhập trên ĐT qua Wi-Fi LAN và trình duyệt chuyển tới <code>localhost:8765/...?code=...</code>, hãy chép đường link đó dán vào đây:
                        </p>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={manualCallbackInput}
                            onChange={(e) => setManualCallbackInput(e.target.value)}
                            placeholder="Dán link http://localhost:8765/api/system/google-auth/callback?code=..."
                            className="min-h-[36px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-[11px] outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                          />
                          <button
                            type="button"
                            onClick={handleManualCallbackSubmit}
                            className="rounded-lg bg-cyan-500 px-3 text-xs font-bold text-slate-950"
                          >
                            Xác nhận
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {loginMethod === 'token' && (
                  <div className="space-y-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Dán trực tiếp Google OAuth Access Token (<code>ya29...</code> từ <code>gcloud auth print-access-token</code> hoặc OAuth Playground) — dùng ngay không cần tạo Client ID:
                    </p>
                    <input
                      type="password"
                      value={directAccessToken}
                      onChange={(e) => setDirectAccessToken(e.target.value)}
                      placeholder="ya29.a0AfH6SM..."
                      className="min-h-[38px] w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        type="password"
                        value={directRefreshToken}
                        onChange={(e) => setDirectRefreshToken(e.target.value)}
                        placeholder="Refresh Token (tùy chọn)"
                        className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                      />
                      <input
                        type="text"
                        value={quotaProjectId}
                        onChange={(e) => setQuotaProjectId(e.target.value)}
                        placeholder="GCP Project ID (tùy chọn)"
                        className="min-h-[36px] w-full rounded-lg border border-slate-200 bg-white px-2.5 font-mono text-xs outline-none dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={handleSaveDirectToken}
                      className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Xác thực &amp; Lưu Token Google
                    </button>
                  </div>
                )}

                {loginMethod === 'adc' && (
                  <div className="space-y-2.5">
                    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {status?.gcloud_adc_found
                        ? `Đã phát hiện thông tin đăng nhập Google Cloud ADC tại: ${status.gcloud_adc_path}`
                        : 'Chưa thấy file ADC trên PC. Bạn có thể chạy lệnh `gcloud auth application-default login` trên PC rồi bấm nút dưới đây:'}
                    </p>
                    <button
                      type="button"
                      disabled={!status?.gcloud_adc_found || busyAction !== null}
                      onClick={handleImportAdc}
                      className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-40"
                    >
                      <Cloud className="h-3.5 w-3.5" />
                      Đồng bộ Token từ Google Cloud ADC
                    </button>
                  </div>
                )}

                {/* Step-by-step Guide tailored to active loginMethod tab */}
                <div className="overflow-hidden rounded-xl border border-cyan-500/20 bg-cyan-500/5 dark:border-cyan-500/20 dark:bg-[#0b1324]/80">
                  <button
                    type="button"
                    onClick={() => setShowGuide((v) => !v)}
                    aria-expanded={showGuide}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[11.5px] font-semibold text-cyan-700 transition hover:bg-cyan-500/10 dark:text-cyan-300"
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {loginMethod === 'oauth'
                          ? 'Hướng dẫn lấy OAuth Client ID / client_secret.json'
                          : loginMethod === 'token'
                            ? 'Hướng dẫn lấy nhanh Access Token (ya29...)'
                            : 'Hướng dẫn đăng nhập qua Google Cloud ADC'}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 shrink-0 transition-transform duration-200',
                        showGuide && 'rotate-180'
                      )}
                    />
                  </button>

                  {showGuide && (
                    <div className="space-y-2 border-t border-cyan-500/15 px-3 py-2.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                      {loginMethod === 'oauth' && (
                        <>
                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              1
                            </span>
                            <div>
                              Mở{' '}
                              <a
                                href="https://console.cloud.google.com/apis/credentials"
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-cyan-600 underline underline-offset-2 hover:text-cyan-500 dark:text-cyan-400"
                              >
                                Google Cloud Console → Credentials
                              </a>{' '}
                              và chọn (hoặc tạo mới) một Project.
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              2
                            </span>
                            <div>
                              Vào mục <strong>OAuth consent screen</strong> → chọn <strong>External</strong> → kéo xuống mục <strong>Test users</strong> và thêm địa chỉ Gmail của bạn.
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              3
                            </span>
                            <div className="min-w-0 flex-1">
                              Quay lại <strong>Credentials</strong> → bấm <strong>+ Create Credentials → OAuth client ID</strong> → chọn <strong>Desktop app</strong> (khuyên dùng). Nếu chọn <strong>Web application</strong>, thêm Redirect URI:
                              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 font-mono text-[10px] dark:border-slate-700 dark:bg-[#090d16]">
                                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-cyan-200">
                                  http://localhost:8765/api/system/google-auth/callback
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await copyToClipboard('http://localhost:8765/api/system/google-auth/callback');
                                    onNotify('Đã sao chép Redirect URI', 'success');
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                  Chép
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              4
                            </span>
                            <div>
                              Bấm <strong>Download JSON</strong> (<code>client_secret.json</code>) rồi nhấn <strong>Chọn file JSON</strong> ở trên (hoặc dán tay <strong>Client ID</strong>) → bấm <strong>Lưu OAuth Client</strong> → <strong>Đăng nhập với Google</strong>.
                            </div>
                          </div>
                        </>
                      )}

                      {loginMethod === 'token' && (
                        <>
                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              1
                            </span>
                            <div className="min-w-0 flex-1">
                              <strong>Cách A (nhanh nhất qua Terminal PC):</strong> chạy lệnh sau rồi copy mã bắt đầu bằng <code>ya29...</code>:
                              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 font-mono text-[10px] dark:border-slate-700 dark:bg-[#090d16]">
                                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-cyan-200">
                                  gcloud auth print-access-token
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await copyToClipboard('gcloud auth print-access-token');
                                    onNotify('Đã sao chép lệnh gcloud', 'success');
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                  Chép
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              2
                            </span>
                            <div>
                              <strong>Cách B (không cần cài CLI):</strong> mở{' '}
                              <a
                                href="https://developers.google.com/oauthplayground/"
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-cyan-600 underline underline-offset-2 hover:text-cyan-500 dark:text-cyan-400"
                              >
                                Google OAuth 2.0 Playground
                              </a>
                              , chọn scope <code>generative-language</code> → <strong>Authorize APIs</strong> → <strong>Exchange authorization code for tokens</strong> rồi dán <code>Access token</code> vào ô trên.
                            </div>
                          </div>
                        </>
                      )}

                      {loginMethod === 'adc' && (
                        <>
                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              1
                            </span>
                            <div className="min-w-0 flex-1">
                              Mở PowerShell / Terminal trên máy tính PC (đã cài <code>gcloud</code>) và chạy lệnh:
                              <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 font-mono text-[10px] dark:border-slate-700 dark:bg-[#090d16]">
                                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-cyan-200">
                                  gcloud auth application-default login
                                </span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await copyToClipboard('gcloud auth application-default login');
                                    onNotify('Đã sao chép lệnh gcloud ADC', 'success');
                                  }}
                                  className="inline-flex shrink-0 items-center gap-1 rounded bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-700 hover:bg-cyan-500/25 dark:text-cyan-300"
                                >
                                  <Copy className="h-2.5 w-2.5" />
                                  Chép
                                </button>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-cyan-500/20 text-[10px] font-bold text-cyan-600 dark:text-cyan-300">
                              2
                            </span>
                            <div>
                              Hoàn tất đăng nhập trên trình duyệt vừa bật, sau đó quay lại đây nhấn <strong>Làm mới</strong> ở góc trên và bấm <strong>Đồng bộ Token từ Google Cloud ADC</strong>.
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {showSwitchAccount && status?.google_connected && (
                  <button
                    type="button"
                    onClick={() => setShowSwitchAccount(false)}
                    className="text-[11px] font-medium text-slate-500 hover:underline"
                  >
                    ← Quay lại tài khoản {status.google_email}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
