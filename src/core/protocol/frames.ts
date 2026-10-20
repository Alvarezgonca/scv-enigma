import { lettersOnly } from '../enigma';
import { base45Decode, EncodingError } from '../modern';

/**
 * Protocolo SCV1: o texto que vai dentro de cada QR Code.
 *
 * Todos os quadros usam só os caracteres do modo alfanumérico do QR (0–9, A–Z, espaço e
 * $%*+-./:), o modo mais denso para texto. Campos separados por ":".
 *
 *   Enigma:  SCV1:E:<de>:<para>:<dia>:<hora>:<nº>:<parte>/<total>:<letras>:<Grundstellung>:<chave cifrada>:<grupos>
 *   Moderno: SCV1:A:<de>:<para>:<dia>:<id da mensagem>:<parte>/<total>:<Base45(texto cifrado + etiqueta)>
 *   Folha:   SCV1:F:<id da folha>:<parte>/<total>:<L|S>:<Base45(folha comprimida, S = protegida por senha)>
 *
 * A especificação completa, com exemplos, está em docs/PROTOCOLO.md.
 */

export const PROTOCOL = 'SCV1';

export interface EnigmaFrame {
  readonly kind: 'E';
  readonly from: string;
  readonly to: string;
  readonly day: number;
  readonly time: string;
  readonly nr: string;
  readonly part: number;
  readonly total: number;
  /** Quantidade de letras anunciada no cabeçalho (grupo de identificação + texto). */
  readonly letters: number;
  readonly grundstellung: string;
  readonly encryptedKey: string;
  /** Grupo de identificação (2 letras aleatórias + Kenngruppe) seguido do texto cifrado. */
  readonly body: string;
  readonly raw: string;
}

export interface AesFrame {
  readonly kind: 'A';
  readonly from: string;
  readonly to: string;
  readonly day: number;
  readonly msgId: string;
  readonly part: number;
  readonly total: number;
  /** Cabeçalho exato (tudo antes do último ":"), autenticado como dado associado do GCM. */
  readonly header: string;
  readonly payload: Uint8Array;
  readonly raw: string;
}

export interface SheetFrame {
  readonly kind: 'F';
  readonly id: string;
  readonly part: number;
  readonly total: number;
  readonly protectedByPassword: boolean;
  readonly payload: Uint8Array;
  readonly raw: string;
}

export type Frame = EnigmaFrame | AesFrame | SheetFrame;

export class FrameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FrameError';
  }
}

const CALLSIGN = /^[A-Z]{2,10}$/;
export const MAX_PARTS = 99;

function splitFields(text: string, count: number): string[] {
  const out: string[] = [];
  let rest = text;
  for (let i = 0; i < count - 1; i++) {
    const at = rest.indexOf(':');
    if (at < 0) throw new FrameError('faltam campos no cabeçalho');
    out.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  out.push(rest);
  return out;
}

function parsePart(text: string): { part: number; total: number } {
  const m = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (m === null) throw new FrameError(`numeração de parte "${text}" inválida`);
  const part = Number(m[1]);
  const total = Number(m[2]);
  if (total < 1 || total > MAX_PARTS || part < 1 || part > total) throw new FrameError(`parte ${part} de ${total} não existe`);
  return { part, total };
}

function parseDay(text: string): number {
  if (!/^\d{1,2}$/.test(text)) throw new FrameError('dia inválido');
  const day = Number(text);
  if (day < 1 || day > 31) throw new FrameError('dia fora de 1–31');
  return day;
}

function checkCallsign(name: string, role: string): string {
  if (!CALLSIGN.test(name)) throw new FrameError(`${role} "${name}" inválido`);
  return name;
}

function decode45(text: string): Uint8Array {
  try {
    return base45Decode(text);
  } catch (e) {
    throw new FrameError(e instanceof EncodingError ? `conteúdo corrompido (${e.message})` : 'conteúdo corrompido');
  }
}

/** Lê o texto de um QR. Qualquer coisa fora do protocolo vira FrameError com o motivo em português. */
export function parseFrame(input: string): Frame {
  const text = input.trim();
  if (!text.startsWith(`${PROTOCOL}:`)) throw new FrameError('este QR não é do protocolo SCV1');
  const kind = text.charAt(5);
  if (kind === 'E') {
    const f = splitFields(text, 12);
    const [, , from = '', to = '', day = '', time = '', nr = '', parts = '', letters = '', gs = '', ek = '', body = ''] = f;
    if (!/^\d{4}$/.test(time)) throw new FrameError('hora inválida');
    if (!/^\d{1,4}$/.test(nr)) throw new FrameError('número da mensagem inválido');
    if (!/^[A-Z]{3}$/.test(gs) || !/^[A-Z]{3}$/.test(ek)) throw new FrameError('indicador de chave inválido');
    if (!/^[A-Z ]+$/.test(body)) throw new FrameError('o texto Enigma só pode ter letras de A a Z');
    if (!/^\d{1,4}$/.test(letters)) throw new FrameError('contagem de letras inválida');
    return {
      kind: 'E',
      from: checkCallsign(from, 'remetente'),
      to: checkCallsign(to, 'destinatário'),
      day: parseDay(day),
      time,
      nr,
      ...parsePart(parts),
      letters: Number(letters),
      grundstellung: gs,
      encryptedKey: ek,
      body: lettersOnly(body),
      raw: text,
    };
  }
  if (kind === 'A') {
    const f = splitFields(text, 8);
    const [, , from = '', to = '', day = '', msgId = '', parts = '', payload = ''] = f;
    if (!/^[0-9A-F]{24}$/.test(msgId)) throw new FrameError('identificador da mensagem inválido');
    const header = text.slice(0, text.length - payload.length - 1);
    return {
      kind: 'A',
      from: checkCallsign(from, 'remetente'),
      to: checkCallsign(to, 'destinatário'),
      day: parseDay(day),
      msgId,
      ...parsePart(parts),
      header,
      payload: decode45(payload),
      raw: text,
    };
  }
  if (kind === 'F') {
    const f = splitFields(text, 6);
    const [, , id = '', parts = '', mode = '', payload = ''] = f;
    if (!/^[0-9A-F]{8}$/.test(id)) throw new FrameError('identificador da folha inválido');
    if (mode !== 'L' && mode !== 'S') throw new FrameError('modo de proteção da folha inválido');
    return { kind: 'F', id, ...parsePart(parts), protectedByPassword: mode === 'S', payload: decode45(payload), raw: text };
  }
  throw new FrameError(`tipo de quadro "${kind}" desconhecido`);
}

/** Chave que junta as partes de uma mesma mensagem. */
export function messageKey(f: Frame): string {
  switch (f.kind) {
    case 'E':
      return `E:${f.from}:${f.to}:${f.day}:${f.time}:${f.nr}`;
    case 'A':
      return `A:${f.from}:${f.to}:${f.day}:${f.msgId}`;
    case 'F':
      return `F:${f.id}`;
  }
}
