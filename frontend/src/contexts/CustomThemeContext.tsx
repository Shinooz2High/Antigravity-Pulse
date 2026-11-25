import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ThemePresetKey = 'Furina Live' | 'Gemini-chan Live' | 'WLOP Cosmic' | 'Midnight Obsidian';

export type ComposerStyleKey =
  | 'sync'
  | 'glass'
  | 'minimal'
  | 'double_gold'
  | 'cyber_neon'
  | 'aurora_flow'
  | 'sakura_frost'
  | 'cosmic_starlight'
  | 'holographic_prism'
  | 'crimson_ruby'
  | 'ultra_frosted';

export interface ThemePreset {
  key: ThemePresetKey;
  concept: string;
  primary: string;
  secondary: string;
  glow: string;
  secondaryGlow: string;
  bg: string;
  frameBg: string;
  borderColor: string;
  overlayRgb: string;
  headerBg: string;
  cardBg: string;
  inputGlassBg: string;
  inputCardBg: string;
  modalBg: string;
  pureBg?: string;
  wallpaper: string;
  wallpaperVideo?: string;
  mediaType?: 'video' | 'image' | 'gradient';
  sticker?: string;
}

export interface ComposerStyleDef {
  key: ComposerStyleKey;
  label: string;
  desc: string;
  getOuter: (th: ThemePreset) => string;
  getInner: (th: ThemePreset) => string;
  getShadow: (th: ThemePreset) => string;
}

export interface SavedVideoOption {
  id: string;
  name: string;
  url: string;
  poster?: string;
}

export interface CustomThemeConfig {
  enabled: boolean;
  themeName: ThemePresetKey;
  inputStyle: ComposerStyleKey;
  dimming: number; // 0-90
  glassBlur: number; // 0-24
  wpEnabled: boolean;
  wpMode: 'video' | 'image';
  customVideo: string;
  customImage: string;
  bootIntro: boolean;
  sketchReveal: boolean;
  taskVoiceEnabled: boolean;
  taskVoiceVol: number; // 0-100
  tawaGreeting: boolean;
}

export const THEME_PRESETS: Record<ThemePresetKey, ThemePreset> = {
  'Furina Live': {
    key: 'Furina Live',
    concept: 'Furina Animated MP4 • Starfield Boot & Arisu-Tawa Voice',
    primary: '#38bdf8',
    secondary: '#e2e8f0',
    glow: 'rgba(56, 189, 248, 0.24)',
    secondaryGlow: 'rgba(186, 230, 253, 0.16)',
    bg: 'linear-gradient(145deg, rgba(10, 14, 24, 0.78) 0%, rgba(6, 9, 16, 0.88) 100%)',
    frameBg: 'linear-gradient(135deg, rgba(56, 189, 248, 0.72) 0%, rgba(226, 232, 240, 0.45) 50%, rgba(14, 165, 233, 0.68) 100%)',
    borderColor: 'rgba(148, 197, 255, 0.26)',
    overlayRgb: '5, 8, 15',
    headerBg: 'rgba(7, 10, 18, 0.42)',
    cardBg: 'rgba(10, 14, 24, 0.64)',
    inputGlassBg: 'rgba(8, 12, 22, 0.56)',
    inputCardBg: 'linear-gradient(145deg, rgba(10, 15, 28, 0.82) 0%, rgba(6, 9, 18, 0.88) 100%)',
    modalBg: 'rgba(8, 11, 19, 0.94)',
    wallpaper: '/theme-assets/furina-poster.webp',
    wallpaperVideo: '/theme-assets/furina-bg.mp4',
    mediaType: 'video',
  },
  'Gemini-chan Live': {
    key: 'Gemini-chan Live',
    concept: 'Gemini-chan Snowy Violet MP4 • Starfield Boot & Tawa Voice',
    primary: '#c084fc',
    secondary: '#f472b6',
    glow: 'rgba(192, 132, 252, 0.28)',
    secondaryGlow: 'rgba(244, 114, 182, 0.18)',
    bg: 'linear-gradient(145deg, rgba(16, 12, 28, 0.78) 0%, rgba(9, 7, 18, 0.88) 100%)',
    frameBg: 'linear-gradient(135deg, rgba(192, 132, 252, 0.74) 0%, rgba(244, 114, 182, 0.52) 50%, rgba(139, 92, 246, 0.68) 100%)',
    borderColor: 'rgba(192, 132, 252, 0.30)',
    overlayRgb: '10, 8, 20',
    headerBg: 'rgba(10, 8, 20, 0.44)',
    cardBg: 'rgba(15, 12, 28, 0.64)',
    inputGlassBg: 'rgba(12, 10, 24, 0.56)',
    inputCardBg: 'linear-gradient(145deg, rgba(16, 12, 30, 0.82) 0%, rgba(9, 7, 18, 0.88) 100%)',
    modalBg: 'rgba(11, 9, 22, 0.94)',
    wallpaper: '/theme-assets/wallpapergeminichan-poster.webp',
    wallpaperVideo: '/theme-assets/wallpapergeminichan.mp4',
    mediaType: 'video',
  },
  'WLOP Cosmic': {
    key: 'WLOP Cosmic',
    concept: 'Cosmic Violin & Starlight • High-Contrast Glass',
    primary: '#fbbf24',
    secondary: '#38bdf8',
    glow: 'rgba(251, 191, 36, 0.28)',
    secondaryGlow: 'rgba(56, 189, 248, 0.22)',
    bg: 'linear-gradient(145deg, rgba(8, 16, 34, 0.78) 0%, rgba(5, 10, 22, 0.86) 100%)',
    frameBg: 'linear-gradient(135deg, rgba(251, 191, 36, 0.78) 0%, rgba(56, 189, 248, 0.60) 50%, rgba(245, 158, 11, 0.70) 100%)',
    borderColor: 'rgba(56, 189, 248, 0.32)',
    overlayRgb: '2, 5, 12',
    headerBg: 'rgba(6, 11, 24, 0.40)',
    cardBg: 'rgba(9, 17, 34, 0.66)',
    inputGlassBg: 'rgba(7, 13, 28, 0.54)',
    inputCardBg: 'linear-gradient(145deg, rgba(8, 16, 34, 0.84) 0%, rgba(5, 10, 22, 0.90) 100%)',
    modalBg: 'rgba(8, 14, 28, 0.94)',
    wallpaper: '/theme-assets/wlop_cosmic_2k.webp',
    mediaType: 'image',
    sticker: '/theme-assets/wlop_ornament.svg',
  },
  'Midnight Obsidian': {
    key: 'Midnight Obsidian',
    concept: 'Pure CSS Gradient • Zero-Image Ultra-Light',
    primary: '#a78bfa',
    secondary: '#38bdf8',
    glow: 'rgba(167, 139, 250, 0.24)',
    secondaryGlow: 'rgba(56, 189, 248, 0.18)',
    bg: 'linear-gradient(145deg, rgba(17, 24, 39, 0.86) 0%, rgba(10, 14, 26, 0.92) 100%)',
    frameBg: 'linear-gradient(135deg, rgba(167, 139, 250, 0.65) 0%, rgba(56, 189, 248, 0.45) 100%)',
    borderColor: 'rgba(167, 139, 250, 0.30)',
    overlayRgb: '8, 10, 18',
    headerBg: 'rgba(10, 14, 24, 0.55)',
    cardBg: 'rgba(15, 20, 34, 0.72)',
    inputGlassBg: 'rgba(12, 16, 28, 0.56)',
    inputCardBg: 'linear-gradient(145deg, rgba(15, 21, 36, 0.86) 0%, rgba(10, 14, 24, 0.92) 100%)',
    modalBg: 'rgba(11, 15, 25, 0.95)',
    pureBg: 'radial-gradient(circle at 75% 25%, rgba(167, 139, 250, 0.22) 0%, transparent 55%), radial-gradient(circle at 20% 80%, rgba(56, 189, 248, 0.16) 0%, transparent 50%), linear-gradient(160deg, #0b0f19 0%, #070910 100%)',
    wallpaper: '',
    mediaType: 'gradient',
  },
};

export const BUILTIN_VIDEOS: SavedVideoOption[] = [
  {
    id: 'cherry-tree',
    name: 'Under the Cherry Tree (1080p)',
    url: '/theme-assets/user_media/1795244034316_under-the-cherry-tree.1920x1080.mp4',
    poster: '/theme-assets/furina-poster.webp',
  },
  {
    id: 'furina-live',
    name: 'Furina Live (Genshin)',
    url: '/theme-assets/furina-bg.mp4',
    poster: '/theme-assets/furina-poster.webp',
  },
  {
    id: 'gemini-chan',
    name: 'Gemini-chan Snowy Violet',
    url: '/theme-assets/wallpapergeminichan.mp4',
    poster: '/theme-assets/wallpapergeminichan-poster.webp',
  },
];

export const COMPOSER_STYLES: ComposerStyleDef[] = [
  {
    key: 'sync',
    label: 'Synced Ornament Frame',
    desc: 'Viền đồng bộ theo theme đang chọn',
    getOuter: (th) => th.frameBg,
    getInner: (th) => th.inputCardBg,
    getShadow: (th) => `0 6px 24px rgba(0, 0, 0, 0.5), 0 0 14px ${th.glow}`,
  },
  {
    key: 'glass',
    label: 'Translucent Crystal Glass',
    desc: 'Kính pha lê trong suốt xuyên thấu nền video',
    getOuter: () => 'linear-gradient(135deg, rgba(255, 255, 255, 0.28) 0%, rgba(255, 255, 255, 0.08) 100%)',
    getInner: (th) => th.inputGlassBg,
    getShadow: () => '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.18)',
  },
  {
    key: 'minimal',
    label: 'Minimal Clean',
    desc: 'Đường viền mảnh tối giản, tinh tế',
    getOuter: () => 'rgba(255, 255, 255, 0.16)',
    getInner: (th) => th.inputCardBg,
    getShadow: () => '0 4px 16px rgba(0, 0, 0, 0.35)',
  },
  {
    key: 'double_gold',
    label: 'Amber Gold Double Border',
    desc: 'Viền đôi kim loại vàng hổ phách hoàng gia',
    getOuter: () => 'linear-gradient(135deg, #f59e0b 0%, rgba(217, 119, 6, 0.35) 50%, #fbbf24 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(44, 28, 20, 0.88) 0%, rgba(24, 15, 12, 0.92) 100%)',
    getShadow: () => '0 6px 24px rgba(0, 0, 0, 0.55), 0 0 16px rgba(245, 158, 11, 0.35)',
  },
  {
    key: 'cyber_neon',
    label: 'Cyberpunk Neon Pulse',
    desc: 'Viền gradient Cyan & Magenta phát sáng rực rỡ',
    getOuter: () => 'linear-gradient(135deg, #06b6d4 0%, #ec4899 50%, #8b5cf6 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(8, 14, 28, 0.90) 0%, rgba(14, 8, 26, 0.94) 100%)',
    getShadow: () => '0 0 20px rgba(6, 182, 212, 0.4), 0 0 35px rgba(236, 72, 153, 0.25)',
  },
  {
    key: 'aurora_flow',
    label: 'Northern Aurora Flow',
    desc: 'Dải cực quang Ngọc lục bảo - Cyan - Thạch anh tím',
    getOuter: () => 'linear-gradient(135deg, #10b981 0%, #06b6d4 50%, #8b5cf6 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(4, 20, 24, 0.88) 0%, rgba(6, 12, 24, 0.92) 100%)',
    getShadow: () => '0 0 18px rgba(16, 185, 129, 0.35), 0 0 30px rgba(6, 182, 212, 0.25)',
  },
  {
    key: 'sakura_frost',
    label: 'Sakura Rose Quartz',
    desc: 'Hồng thạch anh Sakura phủ sương & tím lavender',
    getOuter: () => 'linear-gradient(135deg, #f472b6 0%, #fbcfe8 50%, #c084fc 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(32, 14, 26, 0.86) 0%, rgba(24, 10, 20, 0.90) 100%)',
    getShadow: () => '0 0 18px rgba(244, 114, 182, 0.35), 0 0 28px rgba(192, 132, 252, 0.25)',
  },
  {
    key: 'cosmic_starlight',
    label: 'Cosmic Gold & Starlight',
    desc: 'Vàng ánh sao kết hợp xanh biển thẫm vũ trụ',
    getOuter: () => 'linear-gradient(135deg, #fbbf24 0%, #38bdf8 50%, #f59e0b 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(8, 16, 34, 0.90) 0%, rgba(5, 10, 22, 0.94) 100%)',
    getShadow: () => '0 0 20px rgba(251, 191, 36, 0.35), 0 0 30px rgba(56, 189, 248, 0.25)',
  },
  {
    key: 'holographic_prism',
    label: 'Holographic Iridescent Prism',
    desc: 'Phổ màu cầu vồng lăng kính ngũ sắc ánh kim',
    getOuter: () => 'linear-gradient(135deg, #ff7170 0%, #ffe57f 25%, #80ffdb 50%, #7209b7 75%, #f72585 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(15, 15, 25, 0.84) 0%, rgba(10, 10, 18, 0.90) 100%)',
    getShadow: () => '0 0 22px rgba(128, 255, 219, 0.3), 0 0 35px rgba(247, 37, 133, 0.2)',
  },
  {
    key: 'crimson_ruby',
    label: 'Crimson Eclipse & Ruby',
    desc: 'Đỏ Ruby nhật thực trên nền lõi Obsidian đen tuyền',
    getOuter: () => 'linear-gradient(135deg, #ef4444 0%, #991b1b 50%, #f43f5e 100%)',
    getInner: () => 'linear-gradient(145deg, rgba(24, 8, 12, 0.90) 0%, rgba(12, 4, 6, 0.95) 100%)',
    getShadow: () => '0 0 20px rgba(239, 68, 68, 0.35), 0 0 32px rgba(153, 27, 27, 0.25)',
  },
  {
    key: 'ultra_frosted',
    label: 'Pure Ultra-Frosted Acrylic',
    desc: 'Kính mờ Acrylic cường độ cao + viền trắng băng',
    getOuter: () => 'linear-gradient(135deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 0.12) 100%)',
    getInner: () => 'rgba(15, 20, 30, 0.36)',
    getShadow: () => '0 8px 32px rgba(0, 0, 0, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.25)',
  },
];

export const TAWA_GREETINGS = [
  'Chào mừng Sensei quay trở lại! Hôm nay chúng ta sẽ xây dựng điều gì nào? ✨',
  'Mọi hệ thống trên PC đã sẵn sàng, Sensei chỉ cần ra lệnh thôi nhé~ 🌸',
  'Chúc Sensei một ngày code thật mượt mà và không gặp bug nào nha! 💙',
  'Antigravity Pulse đang lắng nghe từng nhịp code của Sensei~ 🚀',
];

const STORAGE_KEY = 'agy_pulse_custom_theme_v1';

const DEFAULT_CONFIG: CustomThemeConfig = {
  enabled: true,
  themeName: 'Furina Live',
  inputStyle: 'sync',
  dimming: 27,
  glassBlur: 9,
  wpEnabled: true,
  wpMode: 'video',
  customVideo: '/theme-assets/user_media/1795244034316_under-the-cherry-tree.1920x1080.mp4',
  customImage: '',
  bootIntro: true,
  sketchReveal: true,
  taskVoiceEnabled: true,
  taskVoiceVol: 51,
  tawaGreeting: true,
};

interface CustomThemeContextValue {
  config: CustomThemeConfig;
  preset: ThemePreset;
  composerStyle: ComposerStyleDef;
  updateConfig: (patch: Partial<CustomThemeConfig>) => void;
  resetConfig: () => void;
  isThemeModalOpen: boolean;
  setThemeModalOpen: (open: boolean) => void;
  bootReplayTick: number;
  replayBootIntro: () => void;
  revealTick: number;
  triggerSketchReveal: () => void;
  playTaskVoice: (force?: boolean) => void;
  greetingText: string;
}

const CustomThemeContext = createContext<CustomThemeContextValue | null>(null);

export function CustomThemeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<CustomThemeConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      }
    } catch {
      // ignore storage errors
    }
    return DEFAULT_CONFIG;
  });

  const [isThemeModalOpen, setThemeModalOpen] = useState(false);
  const [bootReplayTick, setBootReplayTick] = useState(0);
  const [revealTick, setRevealTick] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [greetingText] = useState(
    () => TAWA_GREETINGS[Math.floor(Math.random() * TAWA_GREETINGS.length)]
  );

  const preset = THEME_PRESETS[config.themeName] || THEME_PRESETS['Furina Live'];
  const composerStyle = useMemo(
    () => COMPOSER_STYLES.find((s) => s.key === config.inputStyle) || COMPOSER_STYLES[0],
    [config.inputStyle]
  );

  const updateConfig = useCallback((patch: Partial<CustomThemeConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, []);

  const resetConfig = useCallback(() => {
    setConfig(DEFAULT_CONFIG);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
    } catch {
      // ignore
    }
  }, []);

  const replayBootIntro = useCallback(() => {
    setBootReplayTick((t) => t + 1);
  }, []);

  const triggerSketchReveal = useCallback(() => {
    setRevealTick((t) => t + 1);
  }, []);

  const playTaskVoice = useCallback(
    (force = false) => {
      if (!force && !config.taskVoiceEnabled) return;
      try {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
        const voices = [
          '/theme-assets/user_media/1795011944060_Tawa_voice_task_1.mp3',
          '/theme-assets/voice/tawa_voice4.mp3',
        ];
        const src = voices[Math.floor(Math.random() * voices.length)];
        const audio = new Audio(src);
        audio.volume = Math.max(0, Math.min(1, config.taskVoiceVol / 100));
        audioRef.current = audio;
        audio.play().catch(() => {});
      } catch {
        // ignore
      }
    },
    [config.taskVoiceEnabled, config.taskVoiceVol]
  );

  // Sync CSS variables & body class
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('agy-custom-theme-active', config.enabled && config.wpEnabled);
    root.style.setProperty('--ct-primary', preset.primary);
    root.style.setProperty('--ct-secondary', preset.secondary);
    root.style.setProperty('--ct-glow', preset.glow);
    root.style.setProperty('--ct-border', preset.borderColor);
    root.style.setProperty('--ct-header-bg', preset.headerBg);
    root.style.setProperty('--ct-card-bg', preset.cardBg);
    root.style.setProperty('--ct-modal-bg', preset.modalBg);
    root.style.setProperty('--ct-glass-blur', `${config.glassBlur}px`);
    root.style.setProperty('--ct-dimming', `${config.dimming / 100}`);
    root.style.setProperty('--ct-overlay-rgb', preset.overlayRgb);
    root.style.setProperty('--ct-composer-outer', composerStyle.getOuter(preset));
    root.style.setProperty('--ct-composer-inner', composerStyle.getInner(preset));
    root.style.setProperty('--ct-composer-shadow', composerStyle.getShadow(preset));
  }, [config, preset, composerStyle]);

  return (
    <CustomThemeContext.Provider
      value={{
        config,
        preset,
        composerStyle,
        updateConfig,
        resetConfig,
        isThemeModalOpen,
        setThemeModalOpen,
        bootReplayTick,
        replayBootIntro,
        revealTick,
        triggerSketchReveal,
        playTaskVoice,
        greetingText,
      }}
    >
      {children}
    </CustomThemeContext.Provider>
  );
}

export function useCustomTheme() {
  const ctx = useContext(CustomThemeContext);
  if (!ctx) {
    throw new Error('useCustomTheme must be used within CustomThemeProvider');
  }
  return ctx;
}
