import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';

export type MobilePlatform = 'android' | 'ios' | 'web';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;
const installListeners = new Set<(available: boolean) => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e as BeforeInstallPromptEvent;
    installListeners.forEach((cb) => cb(true));
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    installListeners.forEach((cb) => cb(false));
  });
}

export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function getMobilePlatform(): MobilePlatform {
  try {
    const p = Capacitor.getPlatform();
    if (p === 'android' || p === 'ios') return p;
  } catch {
    // Fallback to web
  }
  return 'web';
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(
    window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone
  );
}

export function isIosBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) && !isNativeApp();
}

export function canPromptPwaInstall(): boolean {
  return deferredInstallPrompt !== null && !isNativeApp() && !isStandalonePwa();
}

export function subscribePwaInstallAvailability(
  cb: (available: boolean) => void
): () => void {
  installListeners.add(cb);
  cb(canPromptPwaInstall());
  return () => {
    installListeners.delete(cb);
  };
}

export async function triggerPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  try {
    await deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      deferredInstallPrompt = null;
      installListeners.forEach((cb) => cb(false));
      return true;
    }
  } catch {
    // Ignore prompt dismissal errors
  }
  return false;
}

export async function syncNativeTheme(isDark: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
    if (getMobilePlatform() === 'android') {
      await StatusBar.setOverlaysWebView({ overlay: false }).catch(() => undefined);
      await StatusBar.setBackgroundColor({
        color: isDark ? '#090d16' : '#f4f7fb',
      }).catch(() => undefined);
    }
  } catch {
    // Ignore on unsupported OS versions
  }
}

export async function hideNativeSplash(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await SplashScreen.hide({ fadeOutDuration: 220 });
  } catch {
    // Ignore
  }
}

export async function triggerHaptic(
  kind: 'light' | 'medium' | 'success' | 'warning' | 'error' = 'light'
): Promise<void> {
  if (isNativeApp()) {
    try {
      if (kind === 'light') {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else if (kind === 'medium') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (kind === 'success') {
        await Haptics.notification({ type: NotificationType.Success });
      } else if (kind === 'warning') {
        await Haptics.notification({ type: NotificationType.Warning });
      } else {
        await Haptics.notification({ type: NotificationType.Error });
      }
      return;
    } catch {
      // Fall through to web vibrate
    }
  }
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(kind === 'warning' || kind === 'error' ? [30, 40, 30] : 12);
    }
  } catch {
    // Ignore
  }
}

export async function hasNotificationPermission(): Promise<boolean> {
  if (isNativeApp()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      return perm.display === 'granted';
    } catch {
      return false;
    }
  }
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export async function requestAppNotificationPermission(): Promise<{
  granted: boolean;
  supported: boolean;
}> {
  if (isNativeApp()) {
    try {
      const current = await LocalNotifications.checkPermissions();
      if (current.display === 'granted') {
        return { granted: true, supported: true };
      }
      const next = await LocalNotifications.requestPermissions();
      return { granted: next.display === 'granted', supported: true };
    } catch {
      return { granted: false, supported: false };
    }
  }

  if (typeof Notification === 'undefined') {
    return { granted: false, supported: false };
  }
  let perm = Notification.permission;
  if (perm === 'default') {
    perm = await Notification.requestPermission();
  }
  return { granted: perm === 'granted', supported: true };
}

export async function sendAppNotification(title: string, body: string): Promise<void> {
  if (isNativeApp()) {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') return;
      const id = Math.floor(1000 + (Date.now() % 2147000000));
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title,
            body,
            schedule: { at: new Date(Date.now() + 120) },
          },
        ],
      });
      return;
    } catch {
      // Fall back to web notification if available
    }
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
    });
  } catch {
    // Ignore mobile Safari notification restrictions
  }
}

export async function shareContent(opts: {
  title?: string;
  text?: string;
  url?: string;
}): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (isNativeApp()) {
    try {
      const can = await Share.canShare();
      if (can.value) {
        await Share.share(opts);
        return 'shared';
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('cancel') || msg.includes('dismiss')) {
        return 'cancelled';
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(opts);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return 'cancelled';
      }
    }
  }

  return 'unsupported';
}

export async function openExternalLink(url: string): Promise<void> {
  if (!url) return;
  if (isNativeApp() && /^https?:\/\//i.test(url)) {
    try {
      await Browser.open({ url });
      return;
    } catch {
      // Fallback
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function registerNativeLifecycle(handlers: {
  onBackButton: () => boolean;
  onDeepLink: (url: string) => void;
  onAppResume: () => void;
}): () => void {
  if (!isNativeApp()) {
    return () => undefined;
  }

  const handles: Promise<PluginListenerHandle>[] = [];

  handles.push(
    CapApp.addListener('backButton', ({ canGoBack }) => {
      const consumed = handlers.onBackButton();
      if (consumed) return;
      if (canGoBack) {
        window.history.back();
      } else {
        CapApp.minimizeApp().catch(() => {
          CapApp.exitApp();
        });
      }
    })
  );

  handles.push(
    CapApp.addListener('appUrlOpen', (event) => {
      if (event?.url) {
        handlers.onDeepLink(event.url);
      }
    })
  );

  handles.push(
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        handlers.onAppResume();
      }
    })
  );

  CapApp.getLaunchUrl()
    .then((launch) => {
      if (launch?.url) {
        handlers.onDeepLink(launch.url);
      }
    })
    .catch(() => undefined);

  return () => {
    for (const h of handles) {
      h.then((listener) => listener.remove()).catch(() => undefined);
    }
  };
}
