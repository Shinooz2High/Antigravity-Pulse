// ThemeSwitch Component · Atmospheric Theme Toggle with Effects
import { useId, useMemo } from 'react';
import './ThemeSwitch.css';

export type ThemeMode = 'light' | 'dark';
export type ThemeEffect = 'rain' | 'sun' | 'stars' | 'none';

export interface ThemeSwitchProps {
  theme: ThemeMode | string;
  onThemeChange: (theme: ThemeMode) => void;
  defaultEffect?: ThemeEffect;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

export function ThemeSwitch({
  theme,
  onThemeChange,
  defaultEffect = 'rain',
  size = 'md',
  className = '',
  disabled = false,
}: ThemeSwitchProps) {
  const isDark = theme === 'dark';
  const switchId = useId();

  // Generate rain drops if rain effect is active
  const rainDrops = useMemo(() => {
    if (defaultEffect !== 'rain') return [];
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      left: `${12 + i * 11}%`,
      delay: `${(i * 0.12).toFixed(2)}s`,
      duration: `${(0.65 + (i % 3) * 0.15).toFixed(2)}s`,
      opacity: 0.35 + (i % 4) * 0.18,
    }));
  }, [defaultEffect]);

  const toggleTheme = () => {
    if (disabled) return;
    const nextTheme: ThemeMode = isDark ? 'light' : 'dark';
    onThemeChange(nextTheme);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      toggleTheme();
    } else if (e.key === 'ArrowRight' && !isDark) {
      e.preventDefault();
      onThemeChange('dark');
    } else if (e.key === 'ArrowLeft' && isDark) {
      e.preventDefault();
      onThemeChange('light');
    }
  };

  return (
    <div className={`ts-root ts-${size} ${className}`.trim()}>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
        title={isDark ? 'Giao diện tối (Nhấn để bật sáng)' : 'Giao diện sáng (Nhấn để bật tối)'}
        disabled={disabled}
        onClick={toggleTheme}
        onKeyDown={handleKeyDown}
        className={`ts-button ${defaultEffect === 'rain' ? 'ts-has-rain' : ''}`}
      >
        {/* Background Layers */}
        <span className="ts-bg ts-bg-light" aria-hidden="true" />
        <span className="ts-bg ts-bg-dark" aria-hidden="true" />

        {/* Rain Atmospheric Effect */}
        {defaultEffect === 'rain' && (
          <span className="ts-rain-layer" aria-hidden="true">
            {rainDrops.map((drop) => (
              <span
                key={drop.id}
                className="ts-rain-drop"
                style={{
                  left: drop.left,
                  animationDelay: drop.delay,
                  animationDuration: drop.duration,
                  opacity: drop.opacity,
                }}
              />
            ))}
            <span className="ts-splash" style={{ left: '25%', animationDelay: '0.2s' }} />
            <span className="ts-splash" style={{ left: '60%', animationDelay: '0.7s' }} />
          </span>
        )}

        {/* Day Clouds */}
        <svg className="ts-clouds" viewBox="0 0 58 32" aria-hidden="true">
          <circle cx="16" cy="20" r="10" fill="rgba(255,255,255,0.7)" />
          <circle cx="30" cy="14" r="12" fill="#FFFFFF" />
          <circle cx="44" cy="18" r="10" fill="rgba(255,255,255,0.85)" />
        </svg>

        {/* Night Stars */}
        <span className="ts-stars" aria-hidden="true">
          <span className="ts-star" style={{ width: 3, height: 3, left: 6, top: 4, animationDelay: '0s' }} />
          <span className="ts-star" style={{ width: 2, height: 2, left: 20, top: 12, animationDelay: '0.5s' }} />
          <span className="ts-star" style={{ width: 2.5, height: 2.5, left: 32, top: 6, animationDelay: '1.1s' }} />
          <span className="ts-star" style={{ width: 2, height: 2, left: 14, top: 20, animationDelay: '1.6s' }} />
        </span>

        {/* Sliding Thumb (Sun / Moon) */}
        <span className="ts-thumb" aria-hidden="true">
          {/* Sun */}
          <span className="ts-sun">
            <span className="ts-sun-rays" />
          </span>

          {/* Moon with Craters */}
          <span className="ts-moon">
            <span className="ts-crater" style={{ width: 7, height: 7, left: 6, top: 8 }} />
            <span className="ts-crater" style={{ width: 9, height: 9, left: 15, top: 16 }} />
            <span className="ts-crater" style={{ width: 4.5, height: 4.5, left: 16, top: 7 }} />
          </span>
        </span>
      </button>
    </div>
  );
}

export default ThemeSwitch;
