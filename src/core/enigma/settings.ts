import { isLetter, lettersOnly, SIZE, toIndex, toLetter } from './alphabet';
import { type GreekName, type ReflectorName, type RotorName, GREEK_WHEELS, REFLECTORS, ROTORS } from './wiring';

export type EnigmaModel = 'I' | 'M3' | 'M4';

/** Um rotor colocado na máquina: qual é, o anel (Ringstellung) e a letra na janela. Ambos de 0 a 25. */
export interface Wheel<N extends string> {
  readonly name: N;
  readonly ring: number;
  readonly position: number;
}

export type Pair = readonly [number, number];

/**
 * A chave completa de uma máquina. Quem tem isto lê tudo o que foi cifrado com ela;
 * é exatamente o que vinha na folha de chaves capturada do U-110 em 1941.
 */
export interface EnigmaSettings {
  readonly model: EnigmaModel;
  readonly reflector: ReflectorName;
  /** Só na M4: o rotor grego fino, à esquerda de tudo, que não gira. */
  readonly greek: Wheel<GreekName> | null;
  /** Rotores da esquerda para a direita (o da direita é o rápido, que anda a cada tecla). */
  readonly rotors: readonly [Wheel<RotorName>, Wheel<RotorName>, Wheel<RotorName>];
  /** Cabos do plugboard (Steckerbrett): cada par troca duas letras na entrada e na saída. */
  readonly plugboard: readonly Pair[];
}

export interface ModelRule {
  readonly label: string;
  readonly rotors: readonly RotorName[];
  readonly reflectors: readonly ReflectorName[];
  readonly greek: boolean;
}

export const MODELS: Readonly<Record<EnigmaModel, ModelRule>> = {
  I: {
    label: 'Enigma I (Exército e Força Aérea)',
    rotors: ['I', 'II', 'III', 'IV', 'V'],
    reflectors: ['A', 'B', 'C'],
    greek: false,
  },
  M3: {
    label: 'Enigma M3 (Marinha)',
    rotors: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'],
    reflectors: ['B', 'C'],
    greek: false,
  },
  M4: {
    label: 'Enigma M4 (submarinos)',
    rotors: ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'],
    reflectors: ['B-fino', 'C-fino'],
    greek: true,
  },
};

export const MAX_PLUG_PAIRS = 13;

export class EnigmaSettingsError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuração inválida: ${problems.join('; ')}`);
    this.name = 'EnigmaSettingsError';
  }
}

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n < SIZE;
}

/** Lista todos os problemas de uma configuração (vazia quando está tudo certo). */
export function validateSettings(s: EnigmaSettings): string[] {
  const problems: string[] = [];
  const rule = MODELS[s.model];
  if (!(s.reflector in REFLECTORS) || !rule.reflectors.includes(s.reflector)) {
    problems.push(`o refletor ${s.reflector} não existe na ${rule.label}`);
  }
  const names = s.rotors.map((r) => r.name);
  for (const r of s.rotors) {
    if (!(r.name in ROTORS) || !rule.rotors.includes(r.name)) problems.push(`o rotor ${r.name} não existe na ${rule.label}`);
    if (!inRange(r.ring)) problems.push(`anel do rotor ${r.name} fora de 0–25`);
    if (!inRange(r.position)) problems.push(`posição do rotor ${r.name} fora de 0–25`);
  }
  if (new Set(names).size !== names.length) problems.push('o mesmo rotor não pode ocupar duas posições');
  if (rule.greek) {
    if (s.greek === null) problems.push('a M4 precisa do rotor grego (Beta ou Gamma)');
    else {
      if (!(s.greek.name in GREEK_WHEELS)) problems.push(`rotor grego ${s.greek.name} inexistente`);
      if (!inRange(s.greek.ring) || !inRange(s.greek.position)) problems.push('rotor grego com anel ou posição fora de 0–25');
    }
  } else if (s.greek !== null) {
    problems.push(`a ${rule.label} não tem rotor grego`);
  }
  if (s.plugboard.length > MAX_PLUG_PAIRS) problems.push(`no máximo ${MAX_PLUG_PAIRS} cabos`);
  const used = new Set<number>();
  for (const [a, b] of s.plugboard) {
    if (!inRange(a) || !inRange(b)) problems.push('cabo ligado a uma tomada inexistente');
    else if (a === b) problems.push(`cabo ligando ${toLetter(a)} a ela mesma`);
    else {
      for (const x of [a, b]) {
        if (used.has(x)) problems.push(`a tomada ${toLetter(x)} recebeu dois cabos`);
        used.add(x);
      }
    }
  }
  return problems;
}

export function assertValid(s: EnigmaSettings): void {
  const problems = validateSettings(s);
  if (problems.length > 0) throw new EnigmaSettingsError(problems);
}

/** "AV BS CG" → [[0,21],[1,18],[2,6]]. Aceita espaços, vírgulas ou hífens entre os pares. */
export function parsePlugboard(text: string): Pair[] {
  const tokens = text
    .toUpperCase()
    .split(/[\s,;/]+/)
    .map((t) => t.replace(/[-–]/g, ''))
    .filter((t) => t.length > 0);
  return tokens.map((t) => {
    if (t.length !== 2 || !isLetter(t[0] ?? '') || !isLetter(t[1] ?? '')) {
      throw new EnigmaSettingsError([`"${t}" não é um par de letras do plugboard`]);
    }
    return [toIndex(t[0] ?? ''), toIndex(t[1] ?? '')] as const;
  });
}

export function formatPlugboard(pairs: readonly Pair[]): string {
  return pairs.map(([a, b]) => toLetter(a) + toLetter(b)).join(' ');
}

/** "WXC" → [22, 23, 2]. */
export function parsePositions(text: string, count: number): number[] {
  const letters = lettersOnly(text);
  if (letters.length !== count) throw new EnigmaSettingsError([`esperava ${count} letras e veio "${text}"`]);
  return [...letters].map(toIndex);
}

/** Anéis podem vir como letras ("BUL") ou como números do Exército ("02 21 12"). */
export function parseRings(text: string, count: number): number[] {
  const numbers = text.match(/\d+/g);
  if (numbers !== null) {
    if (numbers.length !== count) throw new EnigmaSettingsError([`esperava ${count} anéis e veio "${text}"`]);
    return numbers.map((n) => {
      const v = Number(n);
      if (v < 1 || v > SIZE) throw new EnigmaSettingsError([`anel ${n} fora de 01–26`]);
      return v - 1;
    });
  }
  return parsePositions(text, count);
}

export function formatRingsAsNumbers(rings: readonly number[]): string {
  return rings.map((r) => String(r + 1).padStart(2, '0')).join(' ');
}

export function formatLetters(values: readonly number[]): string {
  return values.map(toLetter).join('');
}

export interface SimpleSettingsInput {
  readonly model?: EnigmaModel;
  readonly reflector?: ReflectorName;
  readonly greek?: { name: GreekName; ring?: string; position?: string } | null;
  /** Ex.: "II IV V" (esquerda → direita). */
  readonly rotors: string;
  /** Ex.: "02 21 12" ou "BUL". */
  readonly rings?: string;
  /** Ex.: "BLA". */
  readonly positions?: string;
  /** Ex.: "AV BS CG". */
  readonly plugboard?: string;
}

/** Monta uma configuração a partir do jeito que ela aparece numa folha de chaves. */
export function settingsFrom(input: SimpleSettingsInput): EnigmaSettings {
  const model = input.model ?? 'I';
  const names = input.rotors.trim().split(/\s+/) as RotorName[];
  if (names.length !== 3) throw new EnigmaSettingsError(['informe três rotores, da esquerda para a direita']);
  const rings = parseRings(input.rings ?? 'AAA', 3);
  const positions = parsePositions(input.positions ?? 'AAA', 3);
  const wheel = (i: 0 | 1 | 2): Wheel<RotorName> => ({
    name: names[i],
    ring: rings[i] ?? 0,
    position: positions[i] ?? 0,
  });
  const greekInput = input.greek ?? null;
  const settings: EnigmaSettings = {
    model,
    reflector: input.reflector ?? (model === 'M4' ? 'B-fino' : 'B'),
    greek:
      greekInput === null
        ? null
        : {
            name: greekInput.name,
            ring: parsePositions(greekInput.ring ?? 'A', 1)[0] ?? 0,
            position: parsePositions(greekInput.position ?? 'A', 1)[0] ?? 0,
          },
    rotors: [wheel(0), wheel(1), wheel(2)],
    plugboard: parsePlugboard(input.plugboard ?? ''),
  };
  assertValid(settings);
  return settings;
}

/** Mesma chave com outra posição inicial dos três rotores (o que muda de mensagem para mensagem). */
export function withPositions(s: EnigmaSettings, positions: readonly number[]): EnigmaSettings {
  const [l, m, r] = s.rotors;
  return {
    ...s,
    rotors: [
      { ...l, position: positions[0] ?? l.position },
      { ...m, position: positions[1] ?? m.position },
      { ...r, position: positions[2] ?? r.position },
    ],
  };
}

export function describeSettings(s: EnigmaSettings): string {
  const rotors = s.rotors.map((r) => r.name).join(' ');
  const greek = s.greek === null ? '' : `${s.greek.name} `;
  return [
    `${MODELS[s.model].label}`,
    `refletor ${s.reflector}`,
    `rotores ${greek}${rotors}`,
    `anéis ${formatRingsAsNumbers(s.rotors.map((r) => r.ring))}`,
    `posição ${formatLetters(s.rotors.map((r) => r.position))}`,
    `plugboard ${formatPlugboard(s.plugboard) || '(vazio)'}`,
  ].join(' · ');
}
