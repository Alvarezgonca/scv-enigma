import {
  type RandomSource,
  base45Encode,
  concatBytes,
  decryptWithPassword,
  deflate,
  encryptWithPassword,
  fingerprint,
  fromUtf8,
  inflate,
  PBKDF2_ITERATIONS,
  systemRandom,
  utf8,
} from '../modern';
import { FrameError, PROTOCOL, type SheetFrame } from './frames';
import { type KeySheet, parseSheet, serializeSheet } from './keysheet';

/**
 * Distribuição da folha de chaves por QR. É o "mensageiro" da guerra: a folha sai do Comando e vai
 * até a estação. Com senha, quem fotografar os QR no caminho não leva as chaves (PBKDF2 com
 * 600 mil iterações + AES-256-GCM); é a lição da folha capturada aplicada ao transporte.
 */

/** Múltiplo de 3: um bloco Base45 nunca é cortado ao meio entre dois QR. */
const SHEET_CHUNK_CHARS = 330;

export interface SheetTransferOptions {
  readonly password?: string;
  readonly rng?: RandomSource;
  readonly iterations?: number;
}

export async function sheetToFrames(sheet: KeySheet, opts: SheetTransferOptions = {}): Promise<string[]> {
  const rng = opts.rng ?? systemRandom;
  let payload = await deflate(utf8(serializeSheet(sheet)));
  const password = opts.password?.trim() ?? '';
  if (password.length > 0) {
    payload = await encryptWithPassword(
      payload,
      password,
      (n) => rng.bytes(n),
      opts.iterations ?? PBKDF2_ITERATIONS,
      sheetAad(sheet.id),
    );
  }
  const encoded = base45Encode(payload);
  const total = Math.max(1, Math.ceil(encoded.length / SHEET_CHUNK_CHARS));
  const frames: string[] = [];
  for (let i = 0; i < total; i++) {
    const piece = encoded.slice(i * SHEET_CHUNK_CHARS, (i + 1) * SHEET_CHUNK_CHARS);
    frames.push([PROTOCOL, 'F', sheet.id, `${i + 1}/${total}`, password.length > 0 ? 'S' : 'L', piece].join(':'));
  }
  return frames;
}

/** O identificador da folha entra como dado associado: não dá para trocar o pacote de uma folha por outro. */
function sheetAad(id: string): Uint8Array {
  return utf8(`${PROTOCOL}:F:${id}`);
}

/** Uma folha comprimida real tem poucos KB; acima disto nem tentamos abrir. */
const MAX_SHEET_PAYLOAD = 16 * 1024;

export interface SheetReceiveOptions {
  readonly password?: string;
  /** Quando true, folha sem senha é recusada (impede trocar a folha protegida por uma forjada aberta). */
  readonly requirePassword?: boolean;
  readonly iterations?: number;
}

/**
 * Junta as partes da folha. Cada parte tem 330 caracteres, múltiplo de 3, então cada pedaço é
 * Base45 válido sozinho e os bytes decodificados podem ser simplesmente emendados.
 * Todas as partes precisam concordar em identificador, total e modo de proteção.
 */
export async function framesToSheet(frames: readonly SheetFrame[], opts: SheetReceiveOptions = {}): Promise<KeySheet> {
  const first = frames[0];
  if (first === undefined) throw new FrameError('nenhuma parte da folha');
  for (const f of frames) {
    if (f.id !== first.id || f.total !== first.total || f.protectedByPassword !== first.protectedByPassword) {
      throw new FrameError('as partes não são da mesma folha (identificador, total ou proteção diferentes)');
    }
  }
  const total = first.total;
  const sorted = [...frames].sort((a, b) => a.part - b.part);
  for (let p = 1; p <= total; p++) {
    if (sorted[p - 1]?.part !== p) throw new FrameError(`falta a parte ${p} de ${total} da folha`);
  }
  if (sorted.length !== total) throw new FrameError('partes repetidas da folha');
  const bytes = concatBytes(...sorted.map((f) => f.payload));
  if (bytes.length > MAX_SHEET_PAYLOAD) throw new FrameError('folha grande demais');
  const password = opts.password?.trim() ?? '';
  let compressed = bytes;
  if (first.protectedByPassword) {
    if (password.length === 0) throw new FrameError('esta folha está protegida por senha');
    compressed = await decryptWithPassword(bytes, password, opts.iterations ?? PBKDF2_ITERATIONS, sheetAad(first.id));
  } else if (opts.requirePassword === true || password.length > 0) {
    throw new FrameError('folha SEM senha recusada: esperava uma folha protegida (possível substituição no caminho)');
  }
  let json: string;
  try {
    json = fromUtf8(await inflate(compressed));
  } catch {
    throw new FrameError('folha corrompida ou grande demais');
  }
  const sheet = parseSheet(json);
  if (sheet.id !== first.id) throw new FrameError('o identificador dentro da folha não confere com o dos QR');
  return sheet;
}

/** Código para conferir à vista nos dois aparelhos (contra folha trocada no caminho). */
export function sheetFingerprint(sheet: KeySheet): Promise<string> {
  return fingerprint(utf8(serializeSheet(sheet)));
}

export { SHEET_CHUNK_CHARS };
