import { mod26 } from '../../core/enigma';
import { base45Encode } from '../../core/modern';
import {
  type AesFrame,
  type AesOpenResult,
  type DayKey,
  type EnigmaFrame,
  type EnigmaPartResult,
  type Frame,
  type KeySheet,
  decryptEnigmaPart,
  findDay,
  openAesMessage,
  pairSecret,
  parseFrame,
} from '../../core/protocol';

/** Resultado da decifração de uma mensagem completa, nos dois modos. */
export type Decoded =
  | {
      readonly kind: 'E';
      readonly from: string;
      readonly to: string;
      readonly text: string;
      readonly parts: readonly EnigmaPartResult[];
      readonly missing: readonly number[];
    }
  | {
      readonly kind: 'A';
      readonly from: string;
      readonly to: string;
      readonly result: AesOpenResult;
    }
  | { readonly kind: 'erro'; readonly message: string };

/** A Enigma usa o X como espaço: para ler, troca de volta (aproximação, palavras com X real ficam estranhas). */
export function readable(letters: string): string {
  return letters.replace(/X/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function decodeFrames(frames: readonly Frame[], sheet: KeySheet, dayOverride?: DayKey): Promise<Decoded> {
  const first = frames[0];
  if (first === undefined) return { kind: 'erro', message: 'nenhuma parte' };
  if (first.kind === 'E') {
    const enigma = frames.filter((f): f is EnigmaFrame => f.kind === 'E').sort((a, b) => a.part - b.part);
    const day = dayOverride ?? findDay(sheet, first.day);
    if (day === undefined) return { kind: 'erro', message: `a folha não tem chave para o dia ${first.day}` };
    const parts = enigma.map((f) => decryptEnigmaPart(f, sheet, day));
    const got = new Set(enigma.map((f) => f.part));
    const missing: number[] = [];
    for (let p = 1; p <= first.total; p++) if (!got.has(p)) missing.push(p);
    return { kind: 'E', from: first.from, to: first.to, text: parts.map((p) => p.plaintext).join(''), parts, missing };
  }
  if (first.kind === 'A') {
    const aes = frames.filter((f): f is AesFrame => f.kind === 'A');
    const secret = pairSecret(sheet, first.from, first.to);
    if (secret === undefined) {
      return {
        kind: 'erro',
        message: `esta máquina não tem o segredo do par ${first.from}–${first.to}: só essas duas estações (e o Comando) leem`,
      };
    }
    return { kind: 'A', from: first.from, to: first.to, result: await openAesMessage(aes, secret) };
  }
  return { kind: 'erro', message: 'isto é uma folha de chaves; abra a tela Folha de chaves para recebê-la' };
}

/* ------------------------- adulterações do laboratório ------------------------- */

export type Tamper = 'letra' | 'destinatario' | 'cortar' | 'ordem';

export const TAMPER_LABEL: Record<Tamper, string> = {
  letra: 'Trocar um caractere do texto cifrado',
  destinatario: 'Trocar o destinatário no cabeçalho',
  cortar: 'Sumir com a última parte e renumerar',
  ordem: 'Inverter a ordem de duas partes',
};

function rebuild(f: Frame): string {
  return f.raw;
}

function withRaw(raw: string): Frame {
  return parseFrame(raw);
}

function bumpLetter(body: string, at: number): string {
  const c = body.charCodeAt(at) - 65;
  return body.slice(0, at) + String.fromCharCode(65 + mod26(c + 1)) + body.slice(at + 1);
}

function setPart(raw: string, part: number, total: number): string {
  return raw.replace(/:(\d{1,2})\/(\d{1,2}):/, `:${part}/${total}:`);
}

/** Aplica um ataque de quem está no meio do caminho, sem conhecer a chave. */
export function tamper(frames: readonly Frame[], kind: Tamper, stations: readonly string[]): Frame[] {
  const sorted = [...frames].sort((a, b) => a.part - b.part);
  const first = sorted[0];
  if (first === undefined) return [];
  switch (kind) {
    case 'letra': {
      return sorted.map((f, i) => {
        if (i !== 0) return f;
        if (f.kind === 'E') {
          const at = Math.min(f.body.length - 1, 12);
          const body = bumpLetter(f.body, at);
          const head = f.raw.slice(0, f.raw.lastIndexOf(':') + 1);
          return withRaw(head + body.replace(/(.{5})/g, '$1 ').trim());
        }
        if (f.kind === 'A') {
          const bytes = f.payload.slice();
          const at = Math.floor(bytes.length / 2);
          bytes[at] = (bytes[at] ?? 0) ^ 0x01;
          return withRaw(`${f.header}:${base45Encode(bytes)}`);
        }
        return f;
      });
    }
    case 'destinatario': {
      if (first.kind === 'F') return sorted;
      const other = stations.find((s) => s !== first.to && s !== first.from) ?? (first.to === 'DELTA' ? 'ECHO' : 'DELTA');
      return sorted.map((f) => withRaw(rebuild(f).replace(`:${first.from}:${first.to}:`, `:${first.from}:${other}:`)));
    }
    case 'cortar': {
      if (sorted.length < 2) return sorted.slice(0, 1);
      const kept = sorted.slice(0, -1);
      return kept.map((f) => withRaw(setPart(rebuild(f), f.part, kept.length)));
    }
    case 'ordem': {
      if (sorted.length < 2) return sorted;
      const [a, b, ...rest] = sorted;
      if (a === undefined || b === undefined) return sorted;
      return [withRaw(setPart(rebuild(b), 1, b.total)), withRaw(setPart(rebuild(a), 2, a.total)), ...rest];
    }
  }
}
