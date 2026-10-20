import {
  type RandomSource,
  base45Encode,
  concatBytes,
  decryptWithPassword,
  deflate,
  encryptWithPassword,
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
    payload = await encryptWithPassword(payload, password, (n) => rng.bytes(n), opts.iterations ?? PBKDF2_ITERATIONS);
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

/**
 * Junta as partes da folha. Cada parte tem 330 caracteres, múltiplo de 3, então cada pedaço é
 * Base45 válido sozinho e os bytes decodificados podem ser simplesmente emendados.
 */
export async function framesToSheet(frames: readonly SheetFrame[], password?: string, iterations = PBKDF2_ITERATIONS): Promise<KeySheet> {
  if (frames.length === 0) throw new FrameError('nenhuma parte da folha');
  const total = frames[0]?.total ?? 0;
  const sorted = [...frames].sort((a, b) => a.part - b.part);
  for (let p = 1; p <= total; p++) {
    if (sorted[p - 1]?.part !== p) throw new FrameError(`falta a parte ${p} de ${total} da folha`);
  }
  const bytes = concatBytes(...sorted.map((f) => f.payload));
  const protectedByPassword = sorted.some((f) => f.protectedByPassword);
  let compressed = bytes;
  if (protectedByPassword) {
    if (password === undefined || password.trim().length === 0) throw new FrameError('esta folha está protegida por senha');
    compressed = await decryptWithPassword(bytes, password.trim(), iterations);
  }
  let json: string;
  try {
    json = fromUtf8(await inflate(compressed));
  } catch {
    throw new FrameError('folha corrompida');
  }
  return parseSheet(json);
}

export { SHEET_CHUNK_CHARS };
