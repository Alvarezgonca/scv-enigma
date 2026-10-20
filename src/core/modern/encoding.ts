/**
 * Codificações de bytes em texto.
 *
 * Base45 (RFC 9285) usa exatamente os 45 caracteres do modo alfanumérico do QR Code
 * (0–9, A–Z, espaço e $%*+-./:). Nesse modo o QR guarda 5,5 bits por caractere, então
 * Base45 cabe ~30% a mais que Base64 no mesmo QR. Foi o que a União Europeia usou no
 * certificado digital de vacinação.
 */

const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
const B45_INDEX = new Map([...B45].map((c, i) => [c, i]));

export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncodingError';
  }
}

export function base45Encode(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = (bytes[i] ?? 0) * 256 + (bytes[i + 1] ?? 0);
    out += (B45[n % 45] ?? '') + (B45[Math.floor(n / 45) % 45] ?? '') + (B45[Math.floor(n / 2025)] ?? '');
  }
  if (bytes.length % 2 === 1) {
    const n = bytes[bytes.length - 1] ?? 0;
    out += (B45[n % 45] ?? '') + (B45[Math.floor(n / 45)] ?? '');
  }
  return out;
}

export function base45Decode(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new EncodingError('Base45 com tamanho impossível');
  const values = [...text].map((c) => {
    const v = B45_INDEX.get(c);
    if (v === undefined) throw new EncodingError(`caractere "${c}" fora do Base45`);
    return v;
  });
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 === 2 ? 1 : 0));
  let o = 0;
  for (let i = 0; i + 2 < values.length; i += 3) {
    const n = (values[i] ?? 0) + (values[i + 1] ?? 0) * 45 + (values[i + 2] ?? 0) * 2025;
    if (n > 0xffff) throw new EncodingError('bloco Base45 maior que 65535');
    out[o++] = n >> 8;
    out[o++] = n & 0xff;
  }
  if (values.length % 3 === 2) {
    const n = (values[values.length - 2] ?? 0) + (values[values.length - 1] ?? 0) * 45;
    if (n > 0xff) throw new EncodingError('último byte Base45 maior que 255');
    out[o] = n;
  }
  return out;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function fromHex(hex: string): Uint8Array {
  if (!/^(?:[0-9A-Fa-f]{2})*$/.test(hex)) throw new EncodingError('hexadecimal inválido');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return out;
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new EncodingError('base64url inválido');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

export function utf8(text: string): Uint8Array {
  return encoder.encode(text);
}

export function fromUtf8(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Comparação em tempo constante (não vaza em que byte as duas sequências diferem). */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
