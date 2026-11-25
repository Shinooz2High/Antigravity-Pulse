// Lucian UX/UI Prompt #319 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#319
import React, { useEffect, useRef, useState } from 'react';
import './AuroraBackground.css';

export type AuroraPaletteName = 'Aurora' | 'Sunset' | 'Ocean';

interface AuroraPalette {
  name: AuroraPaletteName;
  bgHex: string;
  colors: string[];
}

const PALETTES: AuroraPalette[] = [
  {
    name: 'Aurora',
    bgHex: '#050B1F',
    colors: ['#00F5A0', '#00D9F5', '#7B61FF', '#24FE41', '#2EC5FF'],
  },
  {
    name: 'Sunset',
    bgHex: '#1A0B1F',
    colors: ['#FF6B6B', '#FFD93D', '#FF8E3C', '#C44569', '#F8B500'],
  },
  {
    name: 'Ocean',
    bgHex: '#031926',
    colors: ['#00A8E8', '#007EA7', '#00F5D4', '#3A86FF', '#80FFDB'],
  },
];

export interface AuroraBackgroundProps {
  initialPalette?: AuroraPaletteName;
  showPalettePicker?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  k: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ];
}

export function AuroraBackground({
  initialPalette = 'Aurora',
  showPalettePicker = false,
  className = '',
  children,
}: AuroraBackgroundProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const grainRef = useRef<HTMLDivElement>(null);
  const [activePalette, setActivePalette] = useState<AuroraPaletteName>(initialPalette);

  const curPaletteObj = PALETTES.find((p) => p.name === activePalette) || PALETTES[0];

  useEffect(() => {
    const root = rootRef.current;
    const cv = canvasRef.current;
    const gr = grainRef.current;
    if (!root || !cv || !gr) return;

    const cx = cv.getContext('2d');
    if (!cx) return;

    const rm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const S = 72;

    let col = curPaletteObj.colors.map(hexToRgb);
    let bg = hexToRgb(curPaletteObj.bgHex);
    let tCol = col.map((c) => [...c] as [number, number, number]);
    let tBg = [...bg] as [number, number, number];

    const B = [0, 1, 2, 3, 4].map((i) => ({
      bx: 0.2 + ((i * 0.37) % 0.7),
      by: 0.25 + ((i * 0.53) % 0.6),
      r: 0.38 + (i % 3) * 0.08,
      ph: i * 1.7,
      sp: 0.18 + i * 0.03,
    }));

    let ptr: { x: number; y: number } | null = null;
    const follow = { x: 0.5, y: 0.5 };

    const n = document.createElement('canvas');
    n.width = n.height = 96;
    const c = n.getContext('2d');
    if (c) {
      const d = c.createImageData(96, 96);
      for (let i = 0; i < d.data.length; i += 4) {
        const v = Math.random() * 255;
        d.data[i] = d.data[i + 1] = d.data[i + 2] = v;
        d.data[i + 3] = 255;
      }
      c.putImageData(d, 0, 0);
      gr.style.backgroundImage = `url(${n.toDataURL()})`;
    }

    function draw(t: number) {
      if (!cx) return;
      cx.globalCompositeOperation = 'source-over';
      cx.fillStyle = `rgb(${bg.map(Math.round).join(',')})`;
      cx.fillRect(0, 0, S, S);

      cx.globalCompositeOperation = 'lighter';
      B.forEach((b, i) => {
        let x = b.bx + Math.sin(t * b.sp + b.ph) * 0.18;
        let y = b.by + Math.cos(t * b.sp * 0.8 + b.ph * 1.3) * 0.16;
        if (ptr) {
          x += (ptr.x - x) * 0.18;
          y += (ptr.y - y) * 0.18;
        }
        if (i === 0) {
          x = follow.x;
          y = follow.y;
        }
        const cVal = col[i];
        const g = cx.createRadialGradient(x * S, y * S, 0, x * S, y * S, b.r * S);
        g.addColorStop(0, `rgba(${cVal.map(Math.round).join(',')},.85)`);
        g.addColorStop(1, `rgba(${cVal.map(Math.round).join(',')},0)`);
        cx.fillStyle = g;
        cx.fillRect(0, 0, S, S);
      });
    }

    let vis = true;
    let raf = 0;
    let last = 0;
    let t = 0;

    function frame(now: number) {
      raf = 0;
      if (!root?.isConnected || !vis) return;
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      t += dt;

      const k = 1 - Math.pow(0.02, dt);
      col = col.map((item, i) => mix(item, tCol[i], k));
      bg = mix(bg, tBg, k);

      const aim = ptr || {
        x: 0.3 + Math.sin(t * 0.21) * 0.15,
        y: 0.35 + Math.cos(t * 0.17) * 0.12,
      };
      follow.x += (aim.x - follow.x) * (1 - Math.pow(0.15, dt));
      follow.y += (aim.y - follow.y) * (1 - Math.pow(0.15, dt));

      draw(t);
      raf = requestAnimationFrame(frame);
    }

    function run() {
      if (rm) {
        draw(2);
        return;
      }
      if (!raf && vis) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    }

    let observer: IntersectionObserver | null = null;
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        vis = entries[0].isIntersecting;
        run();
      });
      observer.observe(root);
    }

    const onPointerMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      ptr = {
        x: (e.clientX - r.left) / r.width,
        y: (e.clientY - r.top) / r.height,
      };
      if (rm) draw(2);
    };

    const onPointerLeave = () => {
      ptr = null;
    };

    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerleave', onPointerLeave);

    run();

    return () => {
      observer?.disconnect();
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerleave', onPointerLeave);
    };
  }, [curPaletteObj]);

  return (
    <div ref={rootRef} className={`u319-wrap ${className}`.trim()}>
      <canvas ref={canvasRef} width={72} height={72} aria-hidden="true" />
      <div ref={grainRef} className="u319-grain" aria-hidden="true" />

      {showPalettePicker && (
        <div className="u319-palette-picker" role="group" aria-label="Palette">
          {PALETTES.map((p) => (
            <button
              key={p.name}
              type="button"
              className="u319-palette-btn"
              style={{
                background: `linear-gradient(135deg, ${p.colors[0]}, ${p.colors[2]})`,
              }}
              aria-label={p.name}
              aria-pressed={activePalette === p.name}
              onClick={() => setActivePalette(p.name)}
            />
          ))}
        </div>
      )}

      <div className="u319-inner">{children}</div>
    </div>
  );
}

export default AuroraBackground;
