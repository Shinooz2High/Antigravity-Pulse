import { useEffect, useRef, useState } from 'react';
import { useCustomTheme } from '../../contexts/CustomThemeContext';

export function LiveWallpaperLayer() {
  const { config, preset, revealTick } = useCustomTheme();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [revealing, setRevealing] = useState(false);

  const isVideo =
    config.wpMode === 'video' &&
    Boolean(config.customVideo || preset.wallpaperVideo);
  const videoSrc = config.customVideo || preset.wallpaperVideo || '';
  const imageSrc = config.customImage || preset.wallpaper || '';

  // Ensure video plays smoothly when src changes
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isVideo || !videoSrc) return;
    vid.play().catch(() => {});
  }, [isVideo, videoSrc]);

  // Trigger sketch-bloom reveal effect when requested
  useEffect(() => {
    if (revealTick === 0 || !config.sketchReveal) return;
    setRevealing(true);
    const id = window.setTimeout(() => setRevealing(false), 1800);
    return () => window.clearTimeout(id);
  }, [revealTick, config.sketchReveal]);

  if (!config.enabled || !config.wpEnabled) return null;

  return (
    <div
      id="agy-live-bg-layer"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[#06080e]"
    >
      {/* Pure CSS Gradient Theme (e.g. Midnight Obsidian) */}
      {!isVideo && !imageSrc && preset.pureBg && (
        <div
          className="absolute inset-0"
          style={{ background: preset.pureBg }}
        />
      )}

      {/* Static Image Wallpaper (e.g. WLOP Cosmic or custom image) */}
      {!isVideo && imageSrc && (
        <img
          src={imageSrc}
          alt=""
          className="h-full w-full object-cover transition-opacity duration-700"
          style={{
            filter: revealing
              ? 'grayscale(1) contrast(2.2) brightness(1.15)'
              : 'none',
            transition: 'filter 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}

      {/* Live 60fps Video Wallpaper */}
      {isVideo && videoSrc && (
        <video
          ref={videoRef}
          key={videoSrc}
          src={videoSrc}
          poster={preset.wallpaper || undefined}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover"
          style={{
            filter: revealing
              ? 'grayscale(1) contrast(2.2) brightness(1.15)'
              : 'none',
            transition: 'filter 1.6s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      )}

      {/* Sketch-bloom radial flash ring during reveal */}
      {revealing && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background:
              'radial-gradient(circle at 50% 50%, transparent 15%, rgba(255,255,255,0.14) 55%, rgba(6,8,14,0.85) 100%)',
          }}
        />
      )}

      {/* Dimming Overlay */}
      <div
        className="absolute inset-0 transition-colors duration-300"
        style={{
          backgroundColor: `rgba(${preset.overlayRgb}, ${config.dimming / 100})`,
        }}
      />
    </div>
  );
}
