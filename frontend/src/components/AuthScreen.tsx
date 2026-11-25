import { useEffect, useState } from 'react';
import {
  Activity,
  Camera,
  ClipboardPaste,
  Download,
  Globe,
  KeyRound,
  QrCode,
  Smartphone,
  Sparkles,
} from 'lucide-react';
import {
  getDeviceName,
  getServerUrl,
  parsePairingInput,
  setDeviceName,
} from '../lib/api';
import {
  getMobilePlatform,
  isNativeApp,
  subscribePwaInstallAvailability,
  triggerPwaInstall,
} from '../lib/native';
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
}

export function AuthScreen({
  pairingInProgress,
  initialError,
  onLogin,
  onPairWithInput,
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

  useEffect(() => {
    return subscribePwaInstallAvailability(setCanInstallPwa);
  }, []);

  const displayError = error || initialError;

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
                  <GoogleSignInButton fullWidth />
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
                disabled={submitting}
                onSignIn={async () => {
                  setError(null);
                  const cleanedPin = pin.trim();
                  const effectiveServer = showServerField ? serverInput.trim() : '';
                  if (cleanedPin) {
                    setDeviceName(device);
                    await onLogin(cleanedPin, device, effectiveServer);
                  }
                }}
              />

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
