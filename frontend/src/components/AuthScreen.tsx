import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Camera,
  ClipboardPaste,
  Copy,
  Download,
  ExternalLink,
  Globe,
  KeyRound,
  QrCode,
  Smartphone,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import {
  api,
  getDeviceName,
  getServerUrl,
  parsePairingInput,
  setDeviceName,
  setServerUrl,
} from '../lib/api';
import {
  getMobilePlatform,
  isNativeApp,
  openExternalLink,
  subscribePwaInstallAvailability,
  triggerPwaInstall,
} from '../lib/native';
import { copyToClipboard } from '../lib/utils';
import { AuroraBackground, GoogleSignInButton, ValidatedSignUpForm } from './library';
import { QrScannerModal } from './QrScannerModal';

interface AuthScreenProps {
  pairingInProgress: boolean;
  initialError?: string | null;
  onLogin: (pin: string, deviceName: string, serverUrl?: string) => Promise<void>;
  onPairWithInput: (
    rawInput: string,
    deviceName: string,
    fallbackServerUrl?: string
  ) => Promise<void>;
  onGoogleTokenLogin: (token: string, label?: string) => void;
}

export function AuthScreen({
  pairingInProgress,
  initialError,
  onLogin,
  onPairWithInput,
  onGoogleTokenLogin,
}: AuthScreenProps) {
  const native = isNativeApp();
  const platform = getMobilePlatform();

  const [serverInput, setServerInput] = useState(() => getServerUrl());
  const [showServerField, setShowServerField] = useState(
    () => native || Boolean(getServerUrl())
  );
  const [pin, setPin] = useState('');
  const [device, setDevice] = useState(() => getDeviceName());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [canInstallPwa, setCanInstallPwa] = useState(false);
  const [authMode, setAuthMode] = useState<'connect' | 'signup'>('connect');

  // Inline Google OAuth 1-time setup drawer when OAuth Client ID isn't configured yet on PC
  const [googleSetupOpen, setGoogleSetupOpen] = useState(false);
  const [googleSetupTab, setGoogleSetupTab] = useState<'oauth' | 'token'>('oauth');
  const [redirectUriHint, setRedirectUriHint] = useState('');
  const [oauthClientId, setOauthClientId] = useState('');
  const [oauthClientSecret, setOauthClientSecret] = useState('');
  const [oauthClientJson, setOauthClientJson] = useState('');
  const [directGoogleToken, setDirectGoogleToken] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [googleBusy, setGoogleBusy] = useState(false);
  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const clientJsonFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return subscribePwaInstallAvailability(setCanInstallPwa);
  }, []);

  const displayError = error || initialError;

  const launchGoogleOAuthPopupAndWait = async (authUrl: string, state: string): Promise<void> => {
    let popup: Window | null = null;
    if (native) {
      await openExternalLink(authUrl);
    } else {
      popup = window.open(
        authUrl,
        'agy_google_app_login',
        'width=520,height=680,menubar=no,toolbar=no,status=no'
      );
      if (!popup) {
        // Popup blocked (common on mobile Safari/Chrome): redirect in same tab; callback returns /?google_login_state=
        window.location.href = authUrl;
        return;
      }
    }

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('message', onMsg);
        window.clearInterval(pollTimer);
        window.clearTimeout(timeoutTimer);
      };

      const finishOk = (token: string, label?: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        onGoogleTokenLogin(token, label);
        resolve();
      };

      const finishErr = (msg: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        setError(msg);
        reject(new Error(msg));
      };

      const onMsg = (ev: MessageEvent) => {
        if (
          ev.data &&
          typeof ev.data === 'object' &&
          ev.data.type === 'AGY_GOOGLE_APP_LOGIN_SUCCESS' &&
          typeof ev.data.token === 'string'
        ) {
          finishOk(ev.data.token, ev.data.email || ev.data.name);
        }
      };

      window.addEventListener('message', onMsg);

      const pollTimer = window.setInterval(async () => {
        try {
          const res = await api.pollPublicGoogleLogin(state);
          if (res.ready && res.token) {
            finishOk(res.token, res.email || res.name);
            return;
          }
        } catch {
          // Ignore transient poll errors
        }
        if (popup && popup.closed && !settled) {
          // Give 1 final poll tick in case callback just completed before window closed
          window.setTimeout(async () => {
            if (settled) return;
            try {
              const finalRes = await api.pollPublicGoogleLogin(state);
              if (finalRes.ready && finalRes.token) {
                finishOk(finalRes.token, finalRes.email || finalRes.name);
                return;
              }
            } catch {
              // Ignore
            }
            finishErr('Cửa sổ đăng nhập Google đã đóng trước khi hoàn tất.');
          }, 500);
        }
      }, 1200);

      const timeoutTimer = window.setTimeout(() => {
        finishErr('Quá thời gian chờ đăng nhập Google (2 phút). Vui lòng thử lại.');
      }, 120000);
    });
  };

  const handleContinueWithGoogle = async () => {
    setError(null);
    const effectiveServer = showServerField ? serverInput.trim() : '';
    if (native && !effectiveServer) {
      const msg =
        'Vui lòng nhập Địa chỉ Máy chủ PC (hoặc quét QR) trước khi đăng nhập bằng Google.';
      setError(msg);
      throw new Error(msg);
    }
    if (effectiveServer) {
      setServerUrl(effectiveServer);
    }
    setDeviceName(device);

    const info = await api.getPublicGoogleLoginInfo();
    setRedirectUriHint(info.redirect_uri_hint);

    // 1. Standard Google OAuth 2.0 Sign-In (works on localhost, Cloudflare Tunnel, mobile & desktop!)
    if (info.oauth_client_configured) {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const started = await api.startPublicGoogleLogin({
        device_name: device,
        redirect_origin: origin,
      });
      await launchGoogleOAuthPopupAndWait(started.auth_url, started.state);
      return;
    }

    // 2. Direct localhost on PC where AGY CLI is already authenticated with Google Account
    if (info.is_local_request && info.agy_authenticated) {
      const res = await api.loginWithLocalAgyGoogle(device);
      onGoogleTokenLogin(res.token, 'Antigravity Google Account');
      return;
    }

    // 3. Remote / Tunnel without OAuth Client ID yet -> open 1-time Google OAuth setup drawer
    if (pin.trim() && !setupPin) {
      setSetupPin(pin.trim());
    }
    setAuthMode('connect');
    setGoogleSetupOpen(true);
    throw new Error('setup_required');
  };

  const handleSetupClientJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      const txt = await f.text();
      setOauthClientJson(txt);
      const parsed = JSON.parse(txt);
      const block = parsed.web || parsed.installed || parsed;
      if (block?.client_id) setOauthClientId(String(block.client_id));
      if (block?.client_secret) setOauthClientSecret(String(block.client_secret));
    } catch {
      setError('File JSON không đúng định dạng Google OAuth client_secret.json.');
    }
  };

  const handleSetupAndStartGoogle = async () => {
    setError(null);
    const activePin = (setupPin || pin).trim();
    if (!activePin) {
      setError('Vui lòng nhập Mã PIN PC (6 số) để xác nhận quyền lưu cấu hình Google OAuth lần đầu.');
      return;
    }
    if (!oauthClientId.trim() && !oauthClientJson.trim()) {
      setError('Vui lòng chọn file client_secret.json hoặc nhập Google OAuth Client ID.');
      return;
    }
    setGoogleBusy(true);
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const started = await api.setupAndStartPublicGoogleLogin({
        pin: activePin,
        client_id: oauthClientId.trim() || undefined,
        client_secret: oauthClientSecret.trim() || undefined,
        client_json: oauthClientJson.trim() || undefined,
        device_name: device,
        redirect_origin: origin,
      });
      setGoogleSetupOpen(false);
      await launchGoogleOAuthPopupAndWait(started.auth_url, started.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể cấu hình đăng nhập Google.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleDirectGoogleTokenLogin = async () => {
    setError(null);
    const activePin = (setupPin || pin).trim();
    if (!activePin) {
      setError('Vui lòng nhập Mã PIN PC (6 số).');
      return;
    }
    if (!directGoogleToken.trim()) {
      setError('Vui lòng dán Google OAuth Access Token (ya29...).');
      return;
    }
    setGoogleBusy(true);
    try {
      const res = await api.loginWithDirectGoogleToken({
        pin: activePin,
        access_token: directGoogleToken.trim(),
        device_name: device,
      });
      setGoogleSetupOpen(false);
      onGoogleTokenLogin(res.token, 'Google Account');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token Google hoặc mã PIN không hợp lệ.');
    } finally {
      setGoogleBusy(false);
    }
  };

  const handlePastePairingLink = async () => {
    setError(null);
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip || !clip.trim()) {
        setError('Bộ nhớ tạm đang trống. Hãy sao chép đường link ghép nối từ PC trước.');
        return;
      }
      const parsed = parsePairingInput(clip);
      if (parsed.serverUrl) {
        setServerInput(parsed.serverUrl);
        setShowServerField(true);
      }
      if (parsed.pairToken || parsed.pin) {
        setSubmitting(true);
        try {
          setDeviceName(device);
          await onPairWithInput(clip, device, parsed.serverUrl || serverInput);
        } finally {
          setSubmitting(false);
        }
        return;
      }
      if (!parsed.serverUrl) {
        setError('Nội dung vừa dán không phải link ghép nối hoặc mã PIN hợp lệ.');
      }
    } catch {
      setError('Không thể đọc tự động bộ nhớ tạm. Hãy dán trực tiếp link vào ô Địa chỉ PC bên dưới.');
      setShowServerField(true);
    }
  };

  const handleQrScanned = async (decodedText: string) => {
    setScannerOpen(false);
    setError(null);
    const parsed = parsePairingInput(decodedText);
    if (parsed.serverUrl) {
      setServerInput(parsed.serverUrl);
      setShowServerField(true);
    }
    setSubmitting(true);
    try {
      setDeviceName(device);
      await onPairWithInput(decodedText, device, parsed.serverUrl || serverInput);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không thể ghép nối từ mã QR vừa quét.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Check if user pasted full pairing link into Server URL or PIN field
    const fromServerBox = parsePairingInput(serverInput);
    const fromPinBox = parsePairingInput(pin);

    if (fromServerBox.pairToken || fromPinBox.pairToken) {
      setSubmitting(true);
      try {
        setDeviceName(device);
        const raw = fromPinBox.pairToken ? pin : serverInput;
        await onPairWithInput(
          raw,
          device,
          fromServerBox.serverUrl || fromPinBox.serverUrl || serverInput
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ghép nối thất bại.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const effectiveServer = showServerField ? serverInput.trim() : '';
    if (native && !effectiveServer) {
      setError(
        'Vui lòng quét mã QR hoặc nhập địa chỉ máy chủ PC (VD: 192.168.1.84:8765 hoặc https://xxx.trycloudflare.com).'
      );
      return;
    }

    const cleanedPin = pin.trim();
    if (!cleanedPin) {
      setError('Vui lòng nhập mã PIN 6 số trên máy tính hoặc quét mã QR.');
      return;
    }

    setSubmitting(true);
    try {
      setDeviceName(device);
      await onLogin(cleanedPin, device, effectiveServer);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mã PIN không đúng hoặc không kết nối được tới PC.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuroraBackground initialPalette="Aurora" showPalettePicker className="min-h-[100dvh]">
      <div className="pt-safe pb-safe flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 text-slate-900 dark:text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-white/20 bg-white/85 p-6 shadow-2xl backdrop-blur-2xl dark:border-white/10 dark:bg-[#111827]/85">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-indigo-500/25 text-cyan-500 ring-1 ring-cyan-500/30">
                <Activity className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight">Antigravity Pulse</h1>
                  {native && (
                    <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-cyan-600 dark:text-cyan-300">
                      {platform === 'ios' ? 'iOS' : 'Android'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ứng dụng điều khiển Antigravity IDE trên PC
                </p>
              </div>
            </div>
          </div>

          {pairingInProgress ? (
            <div className="mt-8 flex flex-col items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-6 text-center">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
              <p className="mt-3 text-sm font-semibold text-cyan-600 dark:text-cyan-300">
                Đang ghép nối tự động từ mã QR...
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Đang xác thực thiết bị với máy chủ PC.
              </p>
            </div>
          ) : (
            <>
              {/* Mode Switcher: Connect PC vs Sign Up (#244) */}
              <div className="mt-4 grid grid-cols-2 rounded-xl border border-slate-200 bg-slate-100/80 p-1 text-xs font-semibold dark:border-slate-700/80 dark:bg-[#090d16]/80">
                <button
                  type="button"
                  onClick={() => setAuthMode('connect')}
                  className={`rounded-lg py-2 transition ${
                    authMode === 'connect'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Kết nối PC
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`rounded-lg py-2 transition ${
                    authMode === 'signup'
                      ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                      : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  Đăng ký
                </button>
              </div>

              {authMode === 'signup' ? (
                <div className="mt-4 space-y-3">
                  <ValidatedSignUpForm
                    onSuccess={(vals) => {
                      if (vals.name.trim()) {
                        setDevice(vals.name.trim());
                        setDeviceName(vals.name.trim());
                      }
                      window.setTimeout(() => setAuthMode('connect'), 1100);
                    }}
                  />
                  <div className="relative flex items-center py-0.5">
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-700/80" />
                    <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                      hoặc
                    </span>
                    <div className="flex-grow border-t border-slate-200 dark:border-slate-700/80" />
                  </div>
                  <GoogleSignInButton
                    fullWidth
                    disabled={submitting || googleBusy}
                    onSignIn={handleContinueWithGoogle}
                  />
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
              {/* Fast QR & Link Pairing Actions */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 text-xs font-semibold text-cyan-700 transition hover:bg-cyan-500/20 dark:text-cyan-300"
                >
                  <Camera className="h-4 w-4 shrink-0" />
                  <span>Quét mã QR</span>
                </button>
                <button
                  type="button"
                  onClick={handlePastePairingLink}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-[#090d16] dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <ClipboardPaste className="h-4 w-4 shrink-0 text-indigo-400" />
                  <span>Dán Link Ghép Nối</span>
                </button>
              </div>

              {/* PC Server URL Input (Mandatory on Native Android/iOS, Optional on Web) */}
              {showServerField ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                      <Globe className="h-3.5 w-3.5 text-cyan-500" />
                      Địa chỉ Máy chủ PC (Wi-Fi LAN / Tunnel)
                    </label>
                    {!native && (
                      <button
                        type="button"
                        onClick={() => {
                          setServerInput('');
                          setShowServerField(false);
                        }}
                        className="text-[11px] font-medium text-slate-400 hover:text-cyan-500"
                      >
                        Dùng mặc định
                      </button>
                    )}
                  </div>
                  <input
                    type="url"
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={serverInput}
                    onChange={(e) => setServerInput(e.target.value)}
                    placeholder="VD: 192.168.1.84:8765 hoặc https://xxx.trycloudflare.com"
                    className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 font-mono text-xs text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                  />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-[#0b101b] dark:text-slate-400">
                  <span className="flex items-center gap-1.5 truncate">
                    <QrCode className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
                    Kết nối trực tiếp tới máy chủ hiện tại
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowServerField(true)}
                    className="ml-2 shrink-0 font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    Đổi máy chủ PC
                  </button>
                </div>
              )}

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <KeyRound className="h-3.5 w-3.5 text-cyan-500" />
                  Mã PIN ghép nối (hoặc dán Link QR)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="Nhập mã PIN 6 số..."
                  className="min-h-[48px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-center font-mono text-lg tracking-[0.3em] text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <Smartphone className="h-3.5 w-3.5 text-indigo-400" />
                  Tên thiết bị này
                </label>
                <input
                  type="text"
                  value={device}
                  onChange={(e) => setDevice(e.target.value)}
                  placeholder="VD: iPhone / Samsung của tôi"
                  className="min-h-[44px] w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-base text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-700 dark:bg-[#090d16] dark:text-white"
                />
              </div>

              {displayError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs font-medium text-rose-600 dark:text-rose-300">
                  {displayError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 px-4 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-110 disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
                {submitting ? 'Đang kết nối...' : 'Kết nối tới PC'}
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700/80" />
                <span className="mx-3 shrink-0 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  hoặc
                </span>
                <div className="flex-grow border-t border-slate-200 dark:border-slate-700/80" />
              </div>

              <GoogleSignInButton
                fullWidth
                disabled={submitting || googleBusy}
                onSignIn={handleContinueWithGoogle}
              />

              {googleSetupOpen && (
                <div className="space-y-3 rounded-2xl border border-blue-500/30 bg-blue-500/[0.06] p-3.5 text-left dark:border-blue-400/25 dark:bg-[#0b1220]">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        Thiết lập Đăng nhập Google (chỉ cần 1 lần)
                      </p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                        Lưu OAuth Client trên PC để từ lần sau bấm <strong>Continue with Google</strong> đăng nhập ngay không cần PIN.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setGoogleSetupOpen(false)}
                      className="rounded-lg p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/70 p-1 text-[11px] font-semibold dark:bg-[#111827]">
                    <button
                      type="button"
                      onClick={() => setGoogleSetupTab('oauth')}
                      className={`rounded-lg py-1.5 transition ${
                        googleSetupTab === 'oauth'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      OAuth Client (Khuyên dùng)
                    </button>
                    <button
                      type="button"
                      onClick={() => setGoogleSetupTab('token')}
                      className={`rounded-lg py-1.5 transition ${
                        googleSetupTab === 'token'
                          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      Dán Token (ya29...)
                    </button>
                  </div>

                  <input
                    type="password"
                    inputMode="numeric"
                    value={setupPin}
                    onChange={(e) => setSetupPin(e.target.value)}
                    placeholder="Mã PIN PC (6 số, chỉ để xác nhận lưu lần đầu)"
                    className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                  />

                  {googleSetupTab === 'oauth' ? (
                    <div className="space-y-2">
                      {redirectUriHint && (
                        <div className="rounded-xl border border-slate-200 bg-white/80 p-2 text-[10px] dark:border-slate-800 dark:bg-[#111827]">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              Authorized Redirect URI:
                            </span>
                            <button
                              type="button"
                              onClick={async () => {
                                await copyToClipboard(redirectUriHint);
                                setCopiedRedirect(true);
                                window.setTimeout(() => setCopiedRedirect(false), 1800);
                              }}
                              className="inline-flex items-center gap-1 font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                            >
                              <Copy className="h-3 w-3" />
                              {copiedRedirect ? 'Đã chép!' : 'Chép URI'}
                            </button>
                          </div>
                          <p className="mt-1 break-all font-mono text-[10px] text-slate-500 dark:text-slate-400">
                            {redirectUriHint}
                          </p>
                          <a
                            href="https://console.cloud.google.com/apis/credentials"
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-blue-400"
                          >
                            Mở Google Cloud Credentials
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}

                      <input
                        ref={clientJsonFileRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleSetupClientJsonFile}
                      />
                      <button
                        type="button"
                        onClick={() => clientJsonFileRef.current?.click()}
                        className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-cyan-500/40 bg-cyan-500/5 px-3 text-[11px] font-semibold text-cyan-700 hover:bg-cyan-500/15 dark:text-cyan-300"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        {oauthClientJson ? '✓ Đã nạp client_secret.json' : 'Chọn file client_secret.json'}
                      </button>

                      <input
                        type="text"
                        value={oauthClientId}
                        onChange={(e) => setOauthClientId(e.target.value)}
                        placeholder="Google Client ID (xxx.apps.googleusercontent.com)"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                      />
                      <input
                        type="password"
                        value={oauthClientSecret}
                        onChange={(e) => setOauthClientSecret(e.target.value)}
                        placeholder="Client Secret (tùy chọn cho Desktop)"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={googleBusy}
                        onClick={handleSetupAndStartGoogle}
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {googleBusy ? 'Đang mở Google...' : 'Lưu & Đăng nhập với Google ngay'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input
                        type="password"
                        value={directGoogleToken}
                        onChange={(e) => setDirectGoogleToken(e.target.value)}
                        placeholder="Dán Google Access Token (ya29...)"
                        className="min-h-[38px] w-full rounded-xl border border-slate-200 bg-white px-3 font-mono text-xs outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-[#111827] dark:text-white"
                      />
                      <button
                        type="button"
                        disabled={googleBusy}
                        onClick={handleDirectGoogleTokenLogin}
                        className="inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {googleBusy ? 'Đang xác thực...' : 'Đăng nhập bằng Google Token'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {canInstallPwa && (
                <button
                  type="button"
                  onClick={() => triggerPwaInstall()}
                  className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Download className="h-4 w-4" />
                  Cài đặt ứng dụng lên màn hình điện thoại
                </button>
              )}
            </form>
              )}
            </>
          )}
        </div>
      </div>

      <QrScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanSuccess={handleQrScanned}
      />
    </AuroraBackground>
  );
}
