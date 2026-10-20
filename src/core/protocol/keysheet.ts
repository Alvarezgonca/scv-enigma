import { type EnigmaSettings, type Pair, type RotorName, assertValid, toLetter } from '../enigma';
import { type RandomSource, fromBase64Url, randomInt, randomLetters, shuffle, systemRandom, toBase64Url, toHex } from '../modern';

/**
 * Folha de chaves (Schlüsseltafel). Na guerra, cada rede tinha uma folha impressa por mês com
 * a chave de cada dia; a captura de folhas (U-110, maio de 1941) abriu o tráfego da Marinha.
 *
 * Aqui a folha tem duas partes:
 * - a chave Enigma do dia, igual para toda a rede (ordem dos rotores, anéis, 10 cabos e 4
 *   Kenngruppen, que identificam a chave no início de cada mensagem);
 * - um segredo de 256 bits por PAR de estações para o modo moderno. Cada estação recebe só os
 *   segredos dos pares de que faz parte (menor privilégio): quem captura a folha de CHARLIE
 *   não lê o que ALFA manda para BRAVO.
 */

export interface DayKey {
  readonly day: number;
  readonly date: string;
  readonly rotors: readonly [RotorName, RotorName, RotorName];
  readonly rings: readonly [number, number, number];
  readonly plugboard: readonly Pair[];
  readonly kenngruppen: readonly string[];
}

export interface KeySheet {
  readonly v: 1;
  readonly id: string;
  readonly net: string;
  readonly issuedAt: string;
  readonly stations: readonly string[];
  /** Estação dona desta cópia; null é a cópia do Comando, com todos os segredos. */
  readonly holder: string | null;
  readonly days: readonly DayKey[];
  /** "ALFA-BRAVO" (nomes em ordem alfabética) → segredo de 32 bytes em base64url. */
  readonly pairSecrets: Readonly<Record<string, string>>;
}

export const DEFAULT_STATIONS: readonly string[] = ['ALFA', 'BRAVO', 'CHARLIE', 'DELTA'];
export const MAX_SHEET_DAYS = 28;
const ARMY_ROTORS: readonly RotorName[] = ['I', 'II', 'III', 'IV', 'V'];
const CALLSIGN = /^[A-Z]{2,10}$/;
const NET_NAME = /^[A-Z0-9]{2,16}$/;

export class KeySheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KeySheetError';
  }
}

export function pairId(a: string, b: string): string {
  return [a, b].sort().join('-');
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function randomPlugboard(cables: number, rng: RandomSource): Pair[] {
  const letters = shuffle(
    Array.from({ length: 26 }, (_, i) => i),
    rng,
  );
  const pairs: Pair[] = [];
  for (let i = 0; i < cables; i++) {
    const a = letters[2 * i] ?? 0;
    const b = letters[2 * i + 1] ?? 0;
    pairs.push(a < b ? [a, b] : [b, a]);
  }
  return pairs.sort((x, y) => x[0] - y[0]);
}

function randomDayKey(date: Date, rng: RandomSource, usedKenngruppen: Set<string>): DayKey {
  const order = shuffle(ARMY_ROTORS, rng).slice(0, 3) as [RotorName, RotorName, RotorName];
  const kenngruppen: string[] = [];
  while (kenngruppen.length < 4) {
    const k = randomLetters(3, rng);
    if (!usedKenngruppen.has(k)) {
      usedKenngruppen.add(k);
      kenngruppen.push(k);
    }
  }
  return {
    day: date.getDate(),
    date: isoDate(date),
    rotors: order,
    rings: [randomInt(26, rng), randomInt(26, rng), randomInt(26, rng)],
    plugboard: randomPlugboard(10, rng),
    kenngruppen,
  };
}

export interface NewSheetOptions {
  readonly net: string;
  readonly stations: readonly string[];
  readonly start: Date;
  readonly days: number;
}

/** Gera a folha do Comando: todas as chaves Enigma do período e todos os segredos de pares. */
export function generateKeySheet(opts: NewSheetOptions, rng: RandomSource = systemRandom): KeySheet {
  const net = opts.net.toUpperCase();
  if (!NET_NAME.test(net)) throw new KeySheetError('nome da rede: 2 a 16 letras ou números, sem espaço');
  const stations = opts.stations.map((s) => s.toUpperCase());
  if (stations.length < 2 || stations.length > 4) throw new KeySheetError('a rede tem de 2 a 4 estações');
  if (stations.some((s) => !CALLSIGN.test(s))) throw new KeySheetError('indicativo de estação: 2 a 10 letras');
  if (new Set(stations).size !== stations.length) throw new KeySheetError('indicativos repetidos');
  // Até 28 dias: o cabeçalho identifica a chave pelo dia do mês, que não pode se repetir na folha.
  if (opts.days < 1 || opts.days > MAX_SHEET_DAYS) throw new KeySheetError(`a folha vale de 1 a ${MAX_SHEET_DAYS} dias`);

  const used = new Set<string>();
  const days: DayKey[] = [];
  for (let i = 0; i < opts.days; i++) {
    const d = new Date(opts.start.getFullYear(), opts.start.getMonth(), opts.start.getDate() + i);
    days.push(randomDayKey(d, rng, used));
  }
  const pairSecrets: Record<string, string> = {};
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      pairSecrets[pairId(stations[i] ?? '', stations[j] ?? '')] = toBase64Url(rng.bytes(32));
    }
  }
  return {
    v: 1,
    id: toHex(rng.bytes(4)),
    net,
    issuedAt: isoDate(opts.start),
    stations,
    holder: null,
    days,
    pairSecrets,
  };
}

/** Cópia que vai para uma estação: as chaves Enigma da rede e só os segredos dos pares dela. */
export function sheetForStation(sheet: KeySheet, station: string): KeySheet {
  if (!sheet.stations.includes(station)) throw new KeySheetError(`${station} não pertence à rede ${sheet.net}`);
  const pairSecrets: Record<string, string> = {};
  for (const [id, secret] of Object.entries(sheet.pairSecrets)) {
    if (id.split('-').includes(station)) pairSecrets[id] = secret;
  }
  return { ...sheet, holder: station, pairSecrets };
}

export function findDay(sheet: KeySheet, day: number): DayKey | undefined {
  return sheet.days.find((d) => d.day === day);
}

export function findDayByKenngruppe(sheet: KeySheet, kenngruppe: string): DayKey | undefined {
  return sheet.days.find((d) => d.kenngruppen.includes(kenngruppe));
}

export function todayKey(sheet: KeySheet, now: Date = new Date()): DayKey | undefined {
  return sheet.days.find((d) => d.date === isoDate(now)) ?? sheet.days[0];
}

export function pairSecret(sheet: KeySheet, a: string, b: string): Uint8Array | undefined {
  const s = sheet.pairSecrets[pairId(a, b)];
  return s === undefined ? undefined : fromBase64Url(s);
}

/** Converte a chave do dia numa configuração da máquina, com a posição inicial pedida. */
export function settingsForDay(day: DayKey, positions: readonly number[]): EnigmaSettings {
  const settings: EnigmaSettings = {
    model: 'I',
    reflector: 'B',
    greek: null,
    rotors: [
      { name: day.rotors[0], ring: day.rings[0], position: positions[0] ?? 0 },
      { name: day.rotors[1], ring: day.rings[1], position: positions[1] ?? 0 },
      { name: day.rotors[2], ring: day.rings[2], position: positions[2] ?? 0 },
    ],
    plugboard: day.plugboard,
  };
  assertValid(settings);
  return settings;
}

export function describeDay(day: DayKey): string {
  const rings = day.rings.map((r) => String(r + 1).padStart(2, '0')).join(' ');
  const plugs = day.plugboard.map(([a, b]) => toLetter(a) + toLetter(b)).join(' ');
  return `${day.rotors.join(' ')} · anéis ${rings} · ${plugs} · Kenngruppen ${day.kenngruppen.join(' ')}`;
}

/* ------------------------------- serialização ------------------------------- */

/** Formato compacto para caber em QR: cada dia vira uma linha de texto. */
export function serializeSheet(sheet: KeySheet): string {
  return JSON.stringify({
    v: sheet.v,
    id: sheet.id,
    net: sheet.net,
    at: sheet.issuedAt,
    st: sheet.stations,
    h: sheet.holder,
    d: sheet.days.map((d) =>
      [
        d.date,
        d.rotors.join('.'),
        d.rings.map(toLetter).join(''),
        d.plugboard.map(([a, b]) => toLetter(a) + toLetter(b)).join(''),
        d.kenngruppen.join(''),
      ].join(' '),
    ),
    k: sheet.pairSecrets,
  });
}

function fail(why: string): never {
  throw new KeySheetError(`folha de chaves inválida: ${why}`);
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/**
 * Lê uma folha vinda de QR ou do armazenamento. Tudo é conferido: dado de fora é hostil até
 * prova em contrário (uma folha forjada não pode quebrar a máquina nem injetar nada na tela).
 */
export function parseSheet(text: string): KeySheet {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    fail('não é JSON');
  }
  if (!isRecord(raw)) fail('formato');
  if (raw.v !== 1) fail('versão desconhecida');
  const { id, net, at, st, h, d, k } = raw;
  if (typeof id !== 'string' || !/^[0-9A-F]{8}$/.test(id)) fail('identificador');
  if (typeof net !== 'string' || !NET_NAME.test(net)) fail('nome da rede');
  if (typeof at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(at)) fail('data de emissão');
  if (!Array.isArray(st) || st.length < 2 || st.length > 4) fail('estações');
  const stations = st.map((s) => (typeof s === 'string' && CALLSIGN.test(s) ? s : fail('indicativo')));
  if (new Set(stations).size !== stations.length) fail('indicativos repetidos');
  if (h !== null && (typeof h !== 'string' || !stations.includes(h))) fail('dono da cópia');
  if (!Array.isArray(d) || d.length < 1 || d.length > MAX_SHEET_DAYS) fail('dias');
  const days = d.map((line): DayKey => {
    if (typeof line !== 'string') fail('linha de dia');
    const m = /^(\d{4}-\d{2}-(\d{2})) ([IV]{1,3}\.[IV]{1,3}\.[IV]{1,3}) ([A-Z]{3}) ([A-Z]{20}) ([A-Z]{12})$/.exec(line);
    if (m === null) fail(`linha de dia "${line.slice(0, 40)}"`);
    const [, date = '', dd = '', rotorText = '', ringText = '', plugText = '', kgText = ''] = m;
    const rotors = rotorText.split('.') as RotorName[];
    if (rotors.some((r) => !ARMY_ROTORS.includes(r)) || new Set(rotors).size !== 3) fail('rotores');
    const plugboard: Pair[] = [];
    for (let i = 0; i < 20; i += 2) plugboard.push([plugText.charCodeAt(i) - 65, plugText.charCodeAt(i + 1) - 65]);
    const day: DayKey = {
      day: Number(dd),
      date,
      rotors: [rotors[0] ?? 'I', rotors[1] ?? 'II', rotors[2] ?? 'III'],
      rings: [ringText.charCodeAt(0) - 65, ringText.charCodeAt(1) - 65, ringText.charCodeAt(2) - 65],
      plugboard,
      kenngruppen: [kgText.slice(0, 3), kgText.slice(3, 6), kgText.slice(6, 9), kgText.slice(9, 12)],
    };
    try {
      settingsForDay(day, [0, 0, 0]);
    } catch {
      fail(`chave do dia ${day.day}`);
    }
    return day;
  });
  if (new Set(days.map((x) => x.day)).size !== days.length) fail('dia do mês repetido');
  if (!isRecord(k)) fail('segredos');
  const pairSecrets: Record<string, string> = {};
  for (const [pid, secret] of Object.entries(k)) {
    const members = pid.split('-');
    if (members.length !== 2 || members.some((s) => !stations.includes(s)) || pid !== pairId(members[0] ?? '', members[1] ?? '')) {
      fail(`par ${pid}`);
    }
    if (h !== null && !members.includes(h)) fail('segredo de par que não é desta estação');
    let size: number;
    try {
      size = typeof secret === 'string' ? fromBase64Url(secret).length : 0;
    } catch {
      size = 0;
    }
    if (typeof secret !== 'string' || size !== 32) fail(`segredo do par ${pid}`);
    pairSecrets[pid] = secret;
  }
  return { v: 1, id, net, issuedAt: at, stations, holder: h, days, pairSecrets };
}
