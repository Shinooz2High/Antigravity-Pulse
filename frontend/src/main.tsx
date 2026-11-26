import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BootIntroOverlay } from './components/theme/BootIntroOverlay';
import { CustomThemeModal } from './components/theme/CustomThemeModal';
import { LiveWallpaperLayer } from './components/theme/LiveWallpaperLayer';
import { CustomThemeProvider } from './contexts/CustomThemeContext';
import { isNativeApp } from './lib/native';
import './index.css';

interface BoundaryState {
  hasError: boolean;
  message: string;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, message: error?.message || 'Lỗi hiển thị giao diện' };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#090d16] p-6 text-center text-slate-100">
          <div className="max-w-md rounded-2xl border border-rose-500/30 bg-[#111827] p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white">Đã xảy ra lỗi hiển thị tạm thời</h2>
            <p className="mt-2 text-xs text-slate-400 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
              }}
              className="mt-4 rounded-xl bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400"
            >
              Khôi phục giao diện
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failure on unsupported/self-signed contexts
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <CustomThemeProvider>
        <LiveWallpaperLayer />
        <BootIntroOverlay />
        <App />
        <CustomThemeModal />
      </CustomThemeProvider>
    </RootErrorBoundary>
  </StrictMode>
);
