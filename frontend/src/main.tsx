import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { BootIntroOverlay } from './components/theme/BootIntroOverlay';
import { CustomThemeModal } from './components/theme/CustomThemeModal';
import { LiveWallpaperLayer } from './components/theme/LiveWallpaperLayer';
import { CustomThemeProvider } from './contexts/CustomThemeContext';
import { isNativeApp } from './lib/native';
import './index.css';

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeApp()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ignore registration failure on unsupported/self-signed contexts
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CustomThemeProvider>
      <LiveWallpaperLayer />
      <BootIntroOverlay />
      <App />
      <CustomThemeModal />
    </CustomThemeProvider>
  </StrictMode>
);
