import { useRef } from 'react';
import {
  Film,
  Image as ImageIcon,
  Palette,
  Play,
  RotateCcw,
  Sparkles,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  BUILTIN_VIDEOS,
  COMPOSER_STYLES,
  THEME_PRESETS,
  useCustomTheme,
  type ThemePresetKey,
} from '../../contexts/CustomThemeContext';

export function CustomThemeModal() {
  const {
    config,
    preset,
    updateConfig,
    resetConfig,
    isThemeModalOpen,
    setThemeModalOpen,
    replayBootIntro,
    triggerSketchReveal,
    playTaskVoice,
  } = useCustomTheme();

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isThemeModalOpen) return null;

  const handleLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      updateConfig({ wpEnabled: true, wpMode: 'video', customVideo: objUrl });
    } else if (file.type.startsWith('image/')) {
      updateConfig({ wpEnabled: true, wpMode: 'image', customImage: objUrl });
    }
    triggerSketchReveal();
    e.target.value = '';
  };

  const selectPreset = (key: ThemePresetKey) => {
    const target = THEME_PRESETS[key];
    if (target.mediaType === 'video' && target.wallpaperVideo) {
      updateConfig({
        themeName: key,
        wpEnabled: true,
        wpMode: 'video',
        customVideo: target.wallpaperVideo,
      });
    } else if (target.mediaType === 'image') {
      updateConfig({
        themeName: key,
        wpEnabled: true,
        wpMode: 'image',
        customImage: '',
        customVideo: '',
      });
    } else {
      updateConfig({
        themeName: key,
        wpEnabled: true,
        wpMode: 'image',
        customImage: '',
        customVideo: '',
      });
    }
    triggerSketchReveal();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-md sm:p-5"
      onClick={() => setThemeModalOpen(false)}
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border shadow-2xl"
        style={{
          background: preset.modalBg,
          borderColor: preset.borderColor,
          boxShadow: `0 24px 64px rgba(0,0,0,0.75), 0 0 36px ${preset.glow}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between gap-3 border-b px-5 py-4"
          style={{ borderColor: preset.borderColor }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl border"
              style={{
                background: `linear-gradient(135deg, ${preset.primary}28, ${preset.secondary}20)`,
                borderColor: preset.borderColor,
                color: preset.primary,
              }}
            >
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Custom Theme Studio
              </h2>
              <p className="text-xs text-slate-400">
                Live Video Wallpaper · 11 Composer Styles · Starfield Boot &amp; Tawa Voice
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setThemeModalOpen(false);
                replayBootIntro();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110"
              style={{
                background: `linear-gradient(135deg, ${preset.primary}35, ${preset.secondary}22)`,
                borderColor: preset.borderColor,
              }}
            >
              <Play className="h-3.5 w-3.5" />
              Phát lại màn xuất hiện
            </button>
            <button
              type="button"
              onClick={() => setThemeModalOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white"
              aria-label="Đóng"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto p-5 text-slate-100">
          {/* 1. Theme Presets */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Palette className="h-4 w-4" style={{ color: preset.primary }} />
                Theme Presets
              </h3>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={config.enabled && config.wpEnabled}
                  onChange={(e) =>
                    updateConfig({ enabled: e.target.checked, wpEnabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-cyan-400"
                />
                Bật nền động &amp; Kính mờ
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(THEME_PRESETS) as ThemePresetKey[]).map((key) => {
                const p = THEME_PRESETS[key];
                const active = config.themeName === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => selectPreset(key)}
                    className="group relative overflow-hidden rounded-2xl border p-3.5 text-left transition"
                    style={{
                      borderColor: active ? p.primary : 'rgba(255,255,255,0.1)',
                      background: active ? `${p.primary}18` : 'rgba(255,255,255,0.03)',
                      boxShadow: active ? `0 0 20px ${p.glow}` : 'none',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-white">{p.key}</span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: p.primary }}
                        />
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ background: p.secondary }}
                        />
                      </div>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{p.concept}</p>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 2. Live Video Library & Custom Upload */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-300">
                <Film className="h-4 w-4" style={{ color: preset.primary }} />
                Hình nền Video động (Live MP4)
              </h3>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,image/*"
                  onChange={handleLocalFile}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Tải Video / Ảnh từ máy
                </button>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              {BUILTIN_VIDEOS.map((vid) => {
                const isSelected =
                  config.wpMode === 'video' && config.customVideo === vid.url;
                return (
                  <button
                    key={vid.id}
                    type="button"
                    onClick={() => {
                      updateConfig({
                        wpEnabled: true,
                        wpMode: 'video',
                        customVideo: vid.url,
                      });
                      triggerSketchReveal();
                    }}
                    className="flex items-center gap-2.5 rounded-xl border p-2.5 text-left transition"
                    style={{
                      borderColor: isSelected ? preset.primary : 'rgba(255,255,255,0.1)',
                      background: isSelected ? `${preset.primary}1a` : 'rgba(255,255,255,0.03)',
                    }}
                  >
                    <Film className="h-4 w-4 shrink-0" style={{ color: preset.primary }} />
                    <span className="truncate text-xs font-semibold text-white">
                      {vid.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 3. Dimming & Glass Blur Sliders */}
          <section className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <ImageIcon className="h-3.5 w-3.5" style={{ color: preset.primary }} />
                  Độ tối nền (Dimming)
                </span>
                <span className="font-mono font-bold text-white">{config.dimming}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={85}
                value={config.dimming}
                onChange={(e) => updateConfig({ dimming: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-medium text-slate-300">Độ mờ kính (Glass Blur)</span>
                <span className="font-mono font-bold text-white">{config.glassBlur}px</span>
              </div>
              <input
                type="range"
                min={0}
                max={24}
                value={config.glassBlur}
                onChange={(e) => updateConfig({ glassBlur: Number(e.target.value) })}
                className="w-full accent-cyan-400"
              />
            </div>
          </section>

          {/* 4. 11 Composer Styles */}
          <section>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-300">
              11 Composer Styles (Khung nhập Prompt)
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {COMPOSER_STYLES.map((st) => {
                const active = config.inputStyle === st.key;
                return (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() => updateConfig({ inputStyle: st.key })}
                    className="flex flex-col rounded-2xl p-[1.5px] text-left transition hover:scale-[1.01]"
                    style={{
                      background: st.getOuter(preset),
                      boxShadow: active ? st.getShadow(preset) : 'none',
                    }}
                  >
                    <div
                      className="flex h-full w-full flex-col justify-between rounded-[14.5px] p-3"
                      style={{ background: st.getInner(preset) }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{st.label}</span>
                        {active && (
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-black"
                            style={{ background: preset.primary }}
                          >
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[10.5px] leading-snug text-slate-400">
                        {st.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* 5. Intro, Sketch Reveal & Task Voice */}
          <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs">
                <span>Màn xuất hiện (Boot Intro)</span>
                <input
                  type="checkbox"
                  checked={config.bootIntro}
                  onChange={(e) => updateConfig({ bootIntro: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs">
                <span>Hiệu ứng Sketch Reveal</span>
                <input
                  type="checkbox"
                  checked={config.sketchReveal}
                  onChange={(e) => updateConfig({ sketchReveal: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3 py-2.5 text-xs">
                <span>Lời chào viết tay Mali</span>
                <input
                  type="checkbox"
                  checked={config.tawaGreeting}
                  onChange={(e) => updateConfig({ tawaGreeting: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={config.taskVoiceEnabled}
                  onChange={(e) => updateConfig({ taskVoiceEnabled: e.target.checked })}
                  className="h-4 w-4 accent-cyan-400"
                />
                <Volume2 className="h-4 w-4" style={{ color: preset.primary }} />
                Giọng Anime khi xong Task (Tawa Voice)
              </label>

              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={config.taskVoiceVol}
                  onChange={(e) => updateConfig({ taskVoiceVol: Number(e.target.value) })}
                  className="w-28 accent-cyan-400"
                />
                <span className="w-9 font-mono text-xs text-slate-300">
                  {config.taskVoiceVol}%
                </span>
                <button
                  type="button"
                  onClick={() => playTaskVoice(true)}
                  className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white hover:bg-white/20"
                >
                  Nghe thử
                </button>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between border-t px-5 py-3"
          style={{ borderColor: preset.borderColor }}
        >
          <button
            type="button"
            onClick={resetConfig}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={() => setThemeModalOpen(false)}
            className="rounded-xl px-5 py-2 text-xs font-bold text-black transition hover:brightness-110"
            style={{ background: preset.primary }}
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}
