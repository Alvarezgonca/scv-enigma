import {
  type RandomSource,
  AuthenticationError,
  base45Encode,
  chunkBytes,
  concatBytes,
  deriveMessageKey,
  fromHex,
  fromUtf8,
  importPairSecret,
  MESSAGE_SALT_BYTES,
  openChunk,
  sealChunk,
  systemRandom,
  toHex,
  utf8,
} from '../modern';
import { type AesFrame, FrameError, PROTOCOL } from './frames';

/**
 * Modo moderno: AES-256-GCM sobre o texto original (com acentos, números e pontuação, sem a
 * preparação que a Enigma exige). Cada parte é um pedaço STREAM com o cabeçalho como dado
 * associado (AAD): trocar o remetente, o destinatário, o dia, o número ou a ordem das partes
 * invalida a etiqueta de autenticação.
 */

/** 150 bytes de texto por parte → cerca de 300 caracteres no QR: lê bem até em tela de notebook. */
export const AES_CHUNK_BYTES = 150;

export function aesKeyInfo(from: string, to: string, day: number): string {
  return `${PROTOCOL} AES-256-GCM ${from}>${to} dia ${day}`;
}

export function aesHeader(from: string, to: string, day: number, msgId: string, part: number, total: number): string {
  return [PROTOCOL, 'A', from, to, String(day), msgId, `${part}/${total}`].join(':');
}

export interface AesOutgoing {
  readonly msgId: string;
  readonly frames: readonly string[];
  /** Bytes cifrados de cada parte (para o comparativo visual). */
  readonly ciphertexts: readonly Uint8Array[];
}

export interface AesSendOptions {
  readonly from: string;
  readonly to: string;
  readonly day: number;
  readonly text: string;
  readonly pairSecret: Uint8Array;
  readonly rng?: RandomSource;
  readonly chunkBytes?: number;
}

export async function sealAesMessage(opts: AesSendOptions): Promise<AesOutgoing> {
  const rng = opts.rng ?? systemRandom;
  const salt = rng.bytes(MESSAGE_SALT_BYTES);
  const msgId = toHex(salt);
  const key = await deriveMessageKey(await importPairSecret(opts.pairSecret), salt, aesKeyInfo(opts.from, opts.to, opts.day));
  const chunks = chunkBytes(utf8(opts.text), opts.chunkBytes ?? AES_CHUNK_BYTES);
  const frames: string[] = [];
  const ciphertexts: Uint8Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const header = aesHeader(opts.from, opts.to, opts.day, msgId, i + 1, chunks.length);
    const sealed = await sealChunk(key, i, i === chunks.length - 1, chunks[i] ?? new Uint8Array(0), utf8(header));
    ciphertexts.push(sealed);
    frames.push(`${header}:${base45Encode(sealed)}`);
  }
  return { msgId, frames, ciphertexts };
}

export type AesPartStatus =
  | { readonly part: number; readonly ok: true; readonly bytes: number }
  | { readonly part: number; readonly ok: false; readonly reason: string };

export interface AesOpenResult {
  readonly text: string | null;
  readonly parts: readonly AesPartStatus[];
  readonly missing: readonly number[];
  readonly problems: readonly string[];
}

/**
 * Abre uma mensagem moderna. Diz exatamente o que houve: quais partes faltam, quais foram
 * rejeitadas pela etiqueta GCM e se as partes discordam entre si.
 */
export async function openAesMessage(frames: readonly AesFrame[], pairSecret: Uint8Array): Promise<AesOpenResult> {
  if (frames.length === 0) throw new FrameError('nenhuma parte recebida');
  const first = frames[0];
  const problems: string[] = [];
  const byPart = new Map<number, AesFrame>();
  for (const f of frames) {
    if (f.msgId !== first.msgId || f.from !== first.from || f.to !== first.to || f.day !== first.day) {
      problems.push(`a parte ${f.part} pertence a outra mensagem`);
      continue;
    }
    if (f.total !== first.total) problems.push(`a parte ${f.part} diz que são ${f.total} partes, a parte ${first.part} diz ${first.total}`);
    const prev = byPart.get(f.part);
    if (prev !== undefined && prev.raw !== f.raw) problems.push(`a parte ${f.part} chegou duas vezes com conteúdos diferentes`);
    byPart.set(f.part, f);
  }
  const total = first.total;
  const missing: number[] = [];
  for (let p = 1; p <= total; p++) if (!byPart.has(p)) missing.push(p);

  const key = await deriveMessageKey(await importPairSecret(pairSecret), fromHex(first.msgId), aesKeyInfo(first.from, first.to, first.day));
  const parts: AesPartStatus[] = [];
  const plain: Uint8Array[] = [];
  for (let p = 1; p <= total; p++) {
    const f = byPart.get(p);
    if (f === undefined) continue;
    try {
      const bytes = await openChunk(key, p - 1, p === total, f.payload, utf8(f.header));
      plain.push(bytes);
      parts.push({ part: p, ok: true, bytes: bytes.length });
    } catch (e) {
      const reason = e instanceof AuthenticationError ? e.message : 'falha ao decifrar';
      parts.push({ part: p, ok: false, reason });
    }
  }
  const allOk = missing.length === 0 && problems.length === 0 && parts.every((s) => s.ok);
  let text: string | null = null;
  if (allOk) {
    try {
      text = fromUtf8(concatBytes(...plain));
    } catch {
      problems.push('o texto decifrado não é UTF-8 válido');
    }
  }
  return { text, parts, missing, problems };
}
