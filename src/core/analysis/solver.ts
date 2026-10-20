import { EnigmaMachine, type EnigmaSettings, type Pair, ROTORS, mod26, toIndex, toLetter } from '../enigma';
import type { BombeStop, RotorOrder } from './bombe';
import { trigramScore } from './stats';

/**
 * Depois da Bomba: a "máquina de verificação". Para cada parada, acha os anéis que explicam quando o
 * rotor do meio virou, volta os rotores até o início da mensagem, decifra tudo e mede quanto o
 * resultado parece português. A melhor parada tem o plugboard completado por subida de encosta
 * (hill climbing) com trigramas, a técnica de Gillogly (1995) e Weierud & Sullivan (2005).
 */

export interface RecoveredKey {
  readonly order: RotorOrder;
  /** Anéis equivalentes: o do rotor esquerdo não muda nada e fica em A. */
  readonly rings: readonly [number, number, number];
  /** Letras nas janelas no início da mensagem (a chave da mensagem). */
  readonly start: readonly [number, number, number];
  readonly plugboard: readonly Pair[];
  readonly plaintext: string;
  /** Média do log10 dos trigramas: português ≈ −2,5; lixo ≈ −4,3. */
  readonly fitness: number;
  readonly fromStop: BombeStop;
}

interface State {
  l: number;
  m: number;
  r: number;
}

function notchSet(name: RotorOrder[number]): number[] {
  return [...ROTORS[name].notches].map(toIndex);
}

function stepWindows(s: State, notchM: readonly number[], notchR: readonly number[]): State {
  const midAt = notchM.includes(s.m);
  const rightAt = notchR.includes(s.r);
  return { l: midAt ? mod26(s.l + 1) : s.l, m: midAt || rightAt ? mod26(s.m + 1) : s.m, r: mod26(s.r + 1) };
}

/** Estado anterior das janelas (o mecanismo de avanço é determinístico; testamos os 4 candidatos). */
function previousWindows(s: State, notchM: readonly number[], notchR: readonly number[]): State {
  const r = mod26(s.r - 1);
  for (const dm of [0, 1]) {
    for (const dl of [0, 1]) {
      const p = { l: mod26(s.l - dl), m: mod26(s.m - dm), r };
      const n = stepWindows(p, notchM, notchR);
      if (n.l === s.l && n.m === s.m && n.r === s.r) return p;
    }
  }
  return { l: s.l, m: s.m, r };
}

function settingsOf(order: RotorOrder, rings: readonly number[], start: readonly number[], plugs: readonly Pair[]): EnigmaSettings {
  return {
    model: 'I',
    reflector: 'B',
    greek: null,
    rotors: [
      { name: order[0], ring: rings[0] ?? 0, position: start[0] ?? 0 },
      { name: order[1], ring: rings[1] ?? 0, position: start[1] ?? 0 },
      { name: order[2], ring: rings[2] ?? 0, position: start[2] ?? 0 },
    ],
    plugboard: plugs,
  };
}

function decrypt(cipher: readonly number[], settings: EnigmaSettings, out: Uint8Array): void {
  const m = new EnigmaMachine(settings);
  for (let i = 0; i < cipher.length; i++) out[i] = m.press(cipher[i] ?? 0).output;
}

function realPairs(steckers: readonly (readonly [number, number])[]): Pair[] {
  return steckers.filter(([a, b]) => a !== b).map(([a, b]) => [a, b] as const);
}

/** Letras cujo par do plugboard a Bomba já deduziu (inclusive as que ficam sem cabo). */
function knownLetters(steckers: readonly (readonly [number, number])[]): Set<number> {
  const s = new Set<number>();
  for (const [a, b] of steckers) {
    s.add(a);
    s.add(b);
  }
  return s;
}

interface Candidate {
  rings: [number, number, number];
  start: [number, number, number];
  fitness: number;
}

/** Testa os anéis possíveis de uma parada e devolve a melhor explicação para a mensagem inteira. */
export function verifyStop(cipher: readonly number[], offset: number, cribLength: number, stop: BombeStop, fullRings = true): Candidate {
  const notchM = notchSet(stop.order[1]);
  const notchR = notchSet(stop.order[2]);
  const rightRings: number[] = [];
  if (stop.turnover !== null) {
    for (const n of notchR) rightRings.push(mod26(n + 1 - stop.right - stop.turnover));
  } else {
    for (let rr = 0; rr < 26; rr++) {
      let turned = false;
      for (let i = 1; i < cribLength; i++) if (notchR.includes(mod26(stop.right + i + rr - 1))) turned = true;
      if (!turned) rightRings.push(rr);
    }
  }
  const buf = new Uint8Array(cipher.length);
  const plugs = realPairs(stop.steckers);
  let best: Candidate = { rings: [0, 0, 0], start: [0, 0, 0], fitness: -Infinity };
  const middleRings = fullRings ? Array.from({ length: 26 }, (_, i) => i) : [0];
  for (const rr of rightRings) {
    for (const rm of middleRings) {
      let s: State = { l: stop.left, m: mod26(stop.middle + rm), r: mod26(stop.right + rr) };
      for (let k = 0; k <= offset; k++) s = previousWindows(s, notchM, notchR);
      const start: [number, number, number] = [s.l, s.m, s.r];
      const rings: [number, number, number] = [0, rm, rr];
      decrypt(cipher, settingsOf(stop.order, rings, start, plugs), buf);
      const fitness = trigramScore(buf) / Math.max(1, cipher.length - 2);
      if (fitness > best.fitness) best = { rings, start, fitness };
    }
  }
  return best;
}

/**
 * Completa o plugboard por subida de encosta (hill climbing): a cada rodada experimenta TODOS os
 * movimentos possíveis entre as letras que a Bomba não alcançou (ligar um cabo, tirar um cabo,
 * trocar a ponta de um cabo) e aplica o que mais aproxima o texto do português. Para quando nenhum
 * movimento melhora. Os pares deduzidos pela Bomba ficam fixos.
 */
export function completePlugboard(
  cipher: readonly number[],
  order: RotorOrder,
  rings: readonly number[],
  start: readonly number[],
  steckers: readonly (readonly [number, number])[],
): { plugboard: Pair[]; fitness: number; plaintext: Uint8Array } {
  const fixed = realPairs(steckers);
  const known = knownLetters(steckers);
  const free = Array.from({ length: 26 }, (_, i) => i).filter((x) => !known.has(x));
  const buf = new Uint8Array(cipher.length);
  const score = (pairs: readonly Pair[]): number => {
    decrypt(cipher, settingsOf(order, rings, start, [...fixed, ...pairs]), buf);
    return trigramScore(buf);
  };
  let extra: Pair[] = [];
  let current = score(extra);
  for (let round = 0; round < 40; round++) {
    const used = new Set(extra.flat());
    const moves: Pair[][] = [];
    if (fixed.length + extra.length < 13) {
      for (let i = 0; i < free.length; i++) {
        for (let j = i + 1; j < free.length; j++) {
          const a = free[i] ?? 0;
          const b = free[j] ?? 0;
          if (!used.has(a) && !used.has(b)) moves.push([...extra, [a, b]]);
        }
      }
    }
    extra.forEach(([a, b], k) => {
      const others = extra.filter((_, idx) => idx !== k);
      moves.push(others);
      for (const c of free) {
        if (used.has(c)) continue;
        moves.push([...others, [a, c]]);
        moves.push([...others, [b, c]]);
      }
    });
    let bestMove: Pair[] | null = null;
    let bestScore = current;
    for (const m of moves) {
      const sc = score(m);
      if (sc > bestScore + 1e-9) {
        bestScore = sc;
        bestMove = m;
      }
    }
    if (bestMove === null) break;
    extra = bestMove;
    current = bestScore;
  }
  const plugboard = [...fixed, ...extra];
  decrypt(cipher, settingsOf(order, rings, start, plugboard), buf);
  return { plugboard, fitness: trigramScore(buf) / Math.max(1, cipher.length - 2), plaintext: buf.slice() };
}

/** Do conjunto de paradas, devolve a chave mais provável (ou null se nenhuma parece português). */
export function solve(cipher: readonly number[], offset: number, cribLength: number, stops: readonly BombeStop[], top = 6): RecoveredKey | null {
  if (stops.length === 0) return null;
  // Triagem rápida (só o anel do meio em A); depois análise completa das melhores.
  const quick = stops
    .map((stop) => ({ stop, cand: verifyStop(cipher, offset, cribLength, stop, false) }))
    .sort((a, b) => b.cand.fitness - a.cand.fitness)
    .slice(0, top);
  let best: RecoveredKey | null = null;
  for (const { stop } of quick) {
    const cand = verifyStop(cipher, offset, cribLength, stop, true);
    const done = completePlugboard(cipher, stop.order, cand.rings, cand.start, stop.steckers);
    const key: RecoveredKey = {
      order: stop.order,
      rings: cand.rings,
      start: cand.start,
      plugboard: done.plugboard,
      plaintext: [...done.plaintext].map(toLetter).join(''),
      fitness: done.fitness,
      fromStop: stop,
    };
    if (best === null || key.fitness > best.fitness) best = key;
  }
  return best;
}

export { settingsOf as recoveredSettings };
