import { EnigmaMachine, lettersOnly, ROTOR_NAMES, settingsFrom, toLetter } from '../enigma';
import { type RandomSource, randomInt, shuffle, systemRandom } from '../modern';
import { PT_LETTER_PERCENT, PT_TRIGRAMS_B64 } from './pt-ngrams';

/** Índice de coincidência de um texto totalmente aleatório em 26 letras (1/26). */
export const IC_RANDOM = 1 / 26;

export function letterCounts(text: string): number[] {
  const counts = new Array<number>(26).fill(0);
  for (const c of lettersOnly(text)) counts[c.charCodeAt(0) - 65] = (counts[c.charCodeAt(0) - 65] ?? 0) + 1;
  return counts;
}

/**
 * Índice de coincidência (Friedman, 1922): chance de duas letras sorteadas do texto serem iguais.
 * Português ≈ 0,07; texto aleatório ≈ 0,038. Cifras de substituição simples mantêm o IC do idioma;
 * a Enigma o derruba para perto do aleatório, por isso a contagem de letras sozinha não a quebra.
 */
export function indexOfCoincidence(counts: readonly number[]): number {
  const n = counts.reduce((a, b) => a + b, 0);
  if (n < 2) return 0;
  return counts.reduce((acc, c) => acc + c * (c - 1), 0) / (n * (n - 1));
}

export function byteCounts(chunks: readonly Uint8Array[]): number[] {
  const counts = new Array<number>(256).fill(0);
  for (const chunk of chunks) for (const b of chunk) counts[b] = (counts[b] ?? 0) + 1;
  return counts;
}

export { PT_LETTER_PERCENT };

/** IC esperado do português a partir das frequências do corpus. */
export const IC_PORTUGUESE = PT_LETTER_PERCENT.reduce((acc, p) => acc + (p / 100) ** 2, 0);

export interface SelfMatrix {
  /** matrix[entrada][saída] = quantas vezes a letra de entrada virou aquela saída. */
  readonly matrix: readonly (readonly number[])[];
  readonly total: number;
  /** Quantas vezes uma letra virou ela mesma. */
  readonly diagonal: number;
}

function randomArmySettings(rng: RandomSource) {
  const order = shuffle(ROTOR_NAMES.slice(0, 5), rng).slice(0, 3);
  const letters = shuffle([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], rng);
  const plugs = Array.from({ length: 10 }, (_, i) => `${letters[2 * i] ?? ''}${letters[2 * i + 1] ?? ''}`).join(' ');
  const three = (): string => Array.from({ length: 3 }, () => toLetter(randomInt(26, rng))).join('');
  return settingsFrom({ rotors: order.join(' '), rings: three(), positions: three(), plugboard: plugs });
}

/**
 * Cifra `total` letras aleatórias com chaves aleatórias (uma chave nova a cada 200 letras) e
 * conta o par entrada → saída. A diagonal sempre dá zero: a falha estrutural da Enigma.
 */
export function enigmaSelfMatrix(total: number, rng: RandomSource = systemRandom): SelfMatrix {
  const matrix = Array.from({ length: 26 }, () => new Array<number>(26).fill(0));
  let diagonal = 0;
  let machine = new EnigmaMachine(randomArmySettings(rng));
  for (let i = 0; i < total; i++) {
    if (i % 200 === 199) machine = new EnigmaMachine(randomArmySettings(rng));
    const input = randomInt(26, rng);
    const output = machine.press(input).output;
    const row = matrix[input];
    if (row !== undefined) row[output] = (row[output] ?? 0) + 1;
    if (input === output) diagonal++;
  }
  return { matrix, total, diagonal };
}

/* ------------------------------ modelo de idioma ------------------------------ */

let trigramTable: Float32Array | null = null;

/** log10 da probabilidade de cada trigrama do português (texto preparado com X no espaço). */
export function trigrams(): Float32Array {
  if (trigramTable !== null) return trigramTable;
  const bin = atob(PT_TRIGRAMS_B64);
  const table = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) table[i] = -10 + (bin.charCodeAt(i) * 10) / 255;
  trigramTable = table;
  return table;
}

/** Pontuação de "parece português": soma dos log10 dos trigramas (maior = mais natural). */
export function trigramScore(letters: Uint8Array | readonly number[]): number {
  const t = trigrams();
  let s = 0;
  for (let i = 0; i + 2 < letters.length; i++) {
    s += t[((letters[i] ?? 0) * 26 + (letters[i + 1] ?? 0)) * 26 + (letters[i + 2] ?? 0)] ?? -10;
  }
  return s;
}

export function trigramScoreText(text: string): number {
  return trigramScore([...lettersOnly(text)].map((c) => c.charCodeAt(0) - 65));
}

/** Média por trigrama: compara textos de tamanhos diferentes (português ≈ −2,5; lixo ≈ −4 ou menos). */
export function trigramFitness(text: string): number {
  const n = lettersOnly(text).length - 2;
  return n <= 0 ? -10 : trigramScoreText(text) / n;
}

/**
 * Mede quantas chaves Enigma este aparelho testa por segundo: monta a máquina com uma chave nova e
 * decifra 20 letras, repetidamente, durante `ms` milissegundos.
 */
export function benchmarkEnigma(ms = 250): number {
  const cipher = [...'QWERTZUIOPASDFGHJKLY'].map((c) => c.charCodeAt(0) - 65);
  const base = settingsFrom({ rotors: 'II IV V', rings: 'BUL', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' });
  const t0 = performance.now();
  let trials = 0;
  let sink = 0;
  while (performance.now() - t0 < ms) {
    for (let k = 0; k < 200; k++) {
      const p = trials % 17_576;
      const m = new EnigmaMachine({
        ...base,
        rotors: [
          { ...base.rotors[0], position: Math.floor(p / 676) },
          { ...base.rotors[1], position: Math.floor(p / 26) % 26 },
          { ...base.rotors[2], position: p % 26 },
        ],
      });
      for (const c of cipher) sink += m.press(c).output;
      trials++;
    }
  }
  if (sink < 0) throw new Error('inalcançável');
  return trials / ((performance.now() - t0) / 1000);
}
