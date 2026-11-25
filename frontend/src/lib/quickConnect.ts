/**
 * Zero-config Quick Connect client: resolves a 6-char Magic Code (e.g. K7M-9P4)
 * from ANY network (4G/5G/Wi-Fi) without needing to enter IP or Cloudflare Tunnel URL.
 *
 * Uses pure TypeScript SHA-256 + HMAC-SHA256 so it works on all origins
 * (including plain HTTP LAN origins and Android/iOS WebViews where crypto.subtle may be unavailable).
 */

const NTFY_BASE = 'https://ntfy.sh';
const KEY_ROUNDS = 2000;

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Bytes(msg: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const bitLen = msg.length * 8;
  const padLen = ((msg.length + 9 + 63) & ~63);
  const padded = new Uint8Array(padLen);
  padded.set(msg);
  padded[msg.length] = 0x80;

  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  dv.setUint32(padLen - 4, bitLen >>> 0, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < padLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = dv.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outDv = new DataView(out.buffer);
  outDv.setUint32(0, h0, false);
  outDv.setUint32(4, h1, false);
  outDv.setUint32(8, h2, false);
  outDv.setUint32(12, h3, false);
  outDv.setUint32(16, h4, false);
  outDv.setUint32(20, h5, false);
  outDv.setUint32(24, h6, false);
  outDv.setUint32(28, h7, false);
  return out;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 64;
  const k = key.length > blockSize ? sha256Bytes(key) : key;
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    const kb = i < k.length ? k[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }
  const inner = sha256Bytes(concatBytes(ipad, data));
  return sha256Bytes(concatBytes(opad, inner));
}

function toHex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

function utf8Encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

export function normalizeQuickCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isLikelyQuickCode(raw: string): boolean {
  const clean = normalizeQuickCode(raw);
  // 6-char alphanumeric code with at least 1 letter (e.g. K7M9P4)
  return clean.length === 6 && /[A-Z]/.test(clean);
}

function deriveTopicAndKeys(rawCode: string): {
  topic: string;
  encKey: Uint8Array;
  macKey: Uint8Array;
} {
  const clean = normalizeQuickCode(rawCode);
  if (clean.length < 4) {
    throw new Error('Mã kết nối quá ngắn.');
  }
  const topicHash = toHex(sha256Bytes(utf8Encode(`agy-topic-v1:${clean}`))).slice(0, 24);
  const topic = `agypulse_v1_${topicHash}`;

  let derived = sha256Bytes(utf8Encode(`agy-seed-v1:${clean}`));
  for (let i = 0; i < KEY_ROUNDS; i++) {
    derived = sha256Bytes(derived);
  }
  const encKey = sha256Bytes(concatBytes(utf8Encode('enc:'), derived));
  const macKey = sha256Bytes(concatBytes(utf8Encode('mac:'), derived));
  return { topic, encKey, macKey };
}

function xorKeystream(data: Uint8Array, encKey: Uint8Array, nonce: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length);
  const ctrBuf = new Uint8Array(4);
  const ctrDv = new DataView(ctrBuf.buffer);
  let offset = 0;
  let counter = 0;
  while (offset < data.length) {
    ctrDv.setUint32(0, counter, false);
    const block = sha256Bytes(concatBytes(encKey, nonce, ctrBuf));
    const take = Math.min(32, data.length - offset);
    for (let i = 0; i < take; i++) {
      out[offset + i] = data[offset + i] ^ block[i];
    }
    offset += take;
    counter += 1;
  }
  return out;
}

export interface QuickConnectPayload {
  v: number;
  urls: string[];
  pair_token: string;
  hostname?: string;
  ts?: number;
}

export function decryptQuickPayload(code: string, token: string): QuickConnectPayload {
  if (!token.startsWith('agyp1.')) {
    throw new Error('Định dạng gói kết nối không hợp lệ.');
  }
  const raw = base64UrlDecode(token.slice(6));
  if (raw.length < 33) {
    throw new Error('Gói kết nối bị thiếu dữ liệu.');
  }
  const nonce = raw.slice(0, 16);
  const tag = raw.slice(16, 32);
  const ciphertext = raw.slice(32);

  const { encKey, macKey } = deriveTopicAndKeys(code);
  const expectedTag = hmacSha256(macKey, concatBytes(nonce, ciphertext)).slice(0, 16);

  let diff = 0;
  for (let i = 0; i < 16; i++) {
    diff |= tag[i] ^ expectedTag[i];
  }
  if (diff !== 0) {
    throw new Error('Mã kết nối không đúng hoặc đã được đổi mới trên PC.');
  }

  const plaintext = xorKeystream(ciphertext, encKey, nonce);
  const parsed = JSON.parse(utf8Decode(plaintext)) as QuickConnectPayload;
  if (!parsed || !Array.isArray(parsed.urls) || !parsed.pair_token) {
    throw new Error('Dữ liệu kết nối không hợp lệ.');
  }
  return parsed;
}

async function probeReachableUrl(baseUrl: string, timeoutMs = 3500): Promise<string> {
  const clean = baseUrl.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${clean}/api/auth/ping`, {
      method: 'GET',
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const body = (await res.json()) as { app?: string };
    if (body?.app !== 'antigravity-pulse') {
      throw new Error('Not Antigravity Pulse');
    }
    return clean;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function resolveQuickConnectCode(rawCode: string): Promise<{
  serverUrl: string;
  pairToken: string;
  hostname?: string;
}> {
  const { topic } = deriveTopicAndKeys(rawCode);
  let text = '';
  try {
    const resp = await fetch(`${NTFY_BASE}/${topic}/json?poll=1&since=all`);
    if (!resp.ok) {
      throw new Error(`Relay HTTP ${resp.status}`);
    }
    text = await resp.text();
  } catch {
    throw new Error(
      'Không thể tra cứu Mã Kết Nối qua Internet. Kiểm tra kết nối mạng hoặc quét mã QR cùng Wi-Fi.'
    );
  }

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let latestEncrypted: string | null = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const evt = JSON.parse(lines[i]) as { event?: string; message?: string };
      if (evt.event === 'message' && typeof evt.message === 'string' && evt.message.startsWith('agyp1.')) {
        latestEncrypted = evt.message;
        break;
      }
    } catch {
      // Ignore malformed line
    }
  }

  if (!latestEncrypted) {
    throw new Error(
      'Không tìm thấy máy tính PC nào với Mã Kết Nối này. Hãy kiểm tra PC đang chạy start.ps1 và nhập đúng 6 ký tự.'
    );
  }

  const payload = decryptQuickPayload(rawCode, latestEncrypted);

  // When running on HTTPS web origin, filter out plain HTTP LAN URLs that browsers block via Mixed Content
  const isHttpsPage =
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    !/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

  const candidates = isHttpsPage
    ? payload.urls.filter((u) => u.startsWith('https://'))
    : payload.urls;

  const listToTry = candidates.length > 0 ? candidates : payload.urls;

  // Race all candidate URLs in parallel (LAN wins in ~15ms on same Wi-Fi; Cloudflare Tunnel wins on 4G/5G!)
  try {
    const fastestUrl = await Promise.any(listToTry.map((u) => probeReachableUrl(u, 4500)));
    return {
      serverUrl: fastestUrl,
      pairToken: payload.pair_token,
      hostname: payload.hostname,
    };
  } catch {
    // Fallback to first candidate URL so pair() gives a specific network error if unreachable
    return {
      serverUrl: listToTry[0],
      pairToken: payload.pair_token,
      hostname: payload.hostname,
    };
  }
}
