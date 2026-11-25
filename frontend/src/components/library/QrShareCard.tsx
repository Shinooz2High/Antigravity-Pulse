// Lucian UX/UI Prompt #478 · Animated QR Code Card with Laser Scan Sweep
import { useEffect, useMemo, useRef, useState } from 'react';
import './QrShareCard.css';

export interface QrShareCardProps {
  url: string;
  label?: string;
  copyLabel?: string;
  copiedLabel?: string;
  className?: string;
}

// Minimal pure-JS QR Code encoder (Versions 1..6, Level M) from Lucian #478
const EC: Array<[number, number, number] | null> = [
  null,
  [10, 1, 16],
  [16, 1, 28],
  [26, 1, 44],
  [18, 2, 32],
  [24, 2, 43],
  [16, 4, 27],
];
const AL: Array<number[] | null> = [
  null,
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

function rsDiv(n: number): number[] {
  const r: number[] = [];
  for (let i = 0; i < n - 1; i++) r.push(0);
  r.push(1);
  let g = 1;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < r.length; j++) {
      r[j] = gfMul(r[j], g);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    g = gfMul(g, 2);
  }
  return r;
}

function rsRem(data: number[], div: number[]): number[] {
  const r = div.map(() => 0);
  data.forEach((b) => {
    const f = b ^ (r.shift() || 0);
    r.push(0);
    div.forEach((c, i) => {
      r[i] ^= gfMul(c, f);
    });
  });
  return r;
}

function buildQrSvgData(text: string): { viewSize: number; pathD: string; eyes: Array<{ x: number; y: number }> } {
  const safeText = text.slice(0, 100);
  const bytes = Array.from(new TextEncoder().encode(safeText));
  let v = 1;
  while (v < 6 && 12 + bytes.length * 8 > EC[v]![1] * EC[v]![2] * 8) v++;
  const [ecn, nb, dpb] = EC[v]!;
  const cap = nb * dpb * 8;
  const bits: number[] = [];
  const put = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  put(4, 4);
  put(bytes.length, 8);
  bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, Math.max(0, cap - bits.length)));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k];
    data.push(b);
  }

  const div = rsDiv(ecn);
  const blocks: number[][] = [];
  const ecs: number[][] = [];
  for (let i = 0; i < nb; i++) {
    const blk = data.slice(i * dpb, (i + 1) * dpb);
    blocks.push(blk);
    ecs.push(rsRem(blk, div));
  }
  const all: number[] = [];
  for (let i = 0; i < dpb; i++) blocks.forEach((bk) => all.push(bk[i] ?? 0));
  for (let i = 0; i < ecn; i++) ecs.forEach((e) => all.push(e[i] ?? 0));

  const n = 17 + 4 * v;
  const M: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const F: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (x: number, y: number, d: boolean) => {
    M[y][x] = d;
    F[y][x] = true;
  };

  for (let i = 0; i < n; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  [
    [3, 3],
    [n - 4, 3],
    [3, n - 4],
  ].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < n && y >= 0 && y < n) set(x, y, d !== 2 && d !== 4);
      }
    }
  });

  const al = AL[v]!;
  const last = al.length - 1;
  al.forEach((ax, ii) => {
    al.forEach((ay, jj) => {
      if ((ii === 0 && jj === 0) || (ii === 0 && jj === last) || (ii === last && jj === 0)) return;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  const format = (mask: number) => {
    const d = (0 << 3) | mask;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const fb = ((d << 10) | r) ^ 0x5412;
    const bit = (i: number) => ((fb >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(i));
    set(8, n - 8, true);
  };
  format(0);

  let bi = 0;
  const total = all.length * 8;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < n; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? n - 1 - vert : vert;
        if (!F[y][x] && bi < total) {
          M[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) === 1;
          bi++;
        }
      }
    }
  }

  const MASKS: Array<(x: number, y: number) => boolean> = [
    (x, y) => (x + y) % 2 === 0,
    (_x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const apply = (m: number) => {
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (!F[y][x] && MASKS[m](x, y)) M[y][x] = !M[y][x];
      }
    }
  };
  const penalty = () => {
    let p = 0;
    let dark = 0;
    const lines: string[] = [];
    for (let y = 0; y < n; y++) {
      let row = '';
      let col = '';
      for (let x = 0; x < n; x++) {
        row += M[y][x] ? '1' : '0';
        col += M[x][y] ? '1' : '0';
        if (M[y][x]) dark++;
      }
      lines.push(row, col);
    }
    lines.forEach((s) => {
      (s.match(/0{5,}|1{5,}/g) || []).forEach((r) => {
        p += r.length - 2;
      });
      p += 40 * (s.match(/(?=10111010000|00001011101)/g) || []).length;
    });
    for (let y = 0; y < n - 1; y++) {
      for (let x = 0; x < n - 1; x++) {
        const c = M[y][x];
        if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3;
      }
    }
    return p + 10 * Math.floor(Math.abs((dark * 20) / (n * n) - 10));
  };

  let best = 0;
  let bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    apply(m);
    format(m);
    const sc = penalty();
    if (sc < bestP) {
      bestP = sc;
      best = m;
    }
    apply(m);
  }
  apply(best);
  format(best);

  const pad = 3;
  const viewSize = n + pad * 2;
  const inFinder = (x: number, y: number) =>
    (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);

  let pathD = '';
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (M[y][x] && !inFinder(x, y)) {
        pathD += `M${x + pad + 0.06} ${y + pad + 0.06}h.88v.88h-.88z`;
      }
    }
  }

  const eyes = [
    { x: pad, y: pad },
    { x: n - 7 + pad, y: pad },
    { x: pad, y: n - 7 + pad },
  ];

  return { viewSize, pathD, eyes };
}

export function QrShareCard({
  url,
  label,
  copyLabel = 'Sao chép link',
  copiedLabel = 'Đã sao chép',
  className = '',
}: QrShareCardProps) {
  const [inView, setInView] = useState(false);
  const [copied, setCopied] = useState(false);
  const [liveText, setLiveText] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const qrData = useMemo(() => buildQrSvgData(url || 'http://localhost:4173'), [url]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).catch(() => {});
      }
    } catch {
      // ignore clipboard errors
    }
    setCopied(true);
    setLiveText('Link copied');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setCopied(false);
      setLiveText('');
    }, 2200);
  };

  const displayUrl = label || url.replace(/^https?:\/\//, '');

  return (
    <div ref={wrapRef} className={`u478-wrap ${inView ? 'is-in' : ''} ${className}`.trim()}>
      <section className="u478-c">
        <div className="u478-q">
          <svg
            viewBox={`0 0 ${qrData.viewSize} ${qrData.viewSize}`}
            role="img"
            aria-label={`QR code: ${url}`}
            shapeRendering="geometricPrecision"
          >
            <path className="m" d={qrData.pathD} />
            {qrData.eyes.map((eye, idx) => (
              <g key={idx}>
                <rect
                  className="f"
                  x={eye.x + 0.5}
                  y={eye.y + 0.5}
                  width="6"
                  height="6"
                  rx="1.7"
                  strokeWidth="1"
                />
                <rect className="e" x={eye.x + 2} y={eye.y + 2} width="3" height="3" rx=".9" />
              </g>
            ))}
          </svg>
          <span className="u478-br" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="u478-sc" aria-hidden="true">
            <i />
          </span>
        </div>

        <p className="u478-u" title={url}>
          {displayUrl}
        </p>

        <button
          type="button"
          onClick={handleCopy}
          className={`u478-cp ${copied ? 'is-ok' : ''}`.trim()}
        >
          <span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1" />
              <path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1" />
            </svg>
            {copyLabel}
          </span>
          <span aria-hidden="true">
            <svg className="ck" viewBox="0 0 24 24">
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
            {copiedLabel}
          </span>
        </button>
      </section>
      <p className="u478-live" role="status">
        {liveText}
      </p>
    </div>
  );
}

export default QrShareCard;
