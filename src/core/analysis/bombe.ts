import { REFLECTORS, ROTORS, type RotorName, mod26 } from '../enigma';

/**
 * Simulação da Bomba de Turing-Welchman (Bletchley Park, 1940).
 *
 * Dado um texto cifrado e um crib alinhado (trecho que se sabe estar no texto claro), cada posição
 * i dá uma aresta do "menu": a letra clara a_i e a cifrada b_i estão ligadas pelo misturador U_i
 * (rotores + refletor, sem plugboard) na posição daquela tecla. Como o plugboard S é uma troca
 * de letras, vale S(b_i) = U_i(S(a_i)). A Bomba testa cada posição dos rotores assim:
 *
 * 1. supõe S(T) = A para a letra mais ligada do menu (letra de teste T);
 * 2. propaga as consequências por todas as arestas e pelo "quadro diagonal" de Welchman
 *    (se S(x) = y então S(y) = x);
 * 3. se a suposição acende TODAS as 26 hipóteses para T, a posição é impossível (contradição);
 *    se sobra alguma apagada, é uma PARADA: a posição pode ser a certa, e a hipótese apagada
 *    diz o par do plugboard de T.
 *
 * O refletor faz cada U_i ser uma involução sem ponto fixo, e é isso que torna os laços do menu
 * tão eficazes: a mesma estrutura que impede uma letra de virar ela mesma.
 *
 * Como em Bletchley, a Bomba procura as posições do NÚCLEO dos rotores (posição − anel). Os anéis
 * só importam para saber quando o rotor do meio vira; por isso testamos também em que letra do crib
 * o rotor do meio pode ter virado (ou se não virou).
 *
 * Referências: A. M. Turing, "Treatise on the Enigma" (c. 1940, cap. 6); G. Welchman, "The Hut Six
 * Story" (1982); D. Davies, "The Bombe: a remarkable logic machine", Cryptologia 23(2), 1999;
 * F. Carter, "The Turing Bombe", The Rutherford Journal 3, 2010.
 */

export type RotorOrder = readonly [RotorName, RotorName, RotorName];

export const ARMY_ORDERS: readonly RotorOrder[] = (() => {
  const names: RotorName[] = ['I', 'II', 'III', 'IV', 'V'];
  const out: RotorOrder[] = [];
  for (const l of names) for (const m of names) for (const r of names) if (l !== m && m !== r && l !== r) out.push([l, m, r]);
  return out;
})();

export interface MenuEdge {
  /** Letra clara (do crib). */
  readonly a: number;
  /** Letra cifrada. */
  readonly b: number;
  /** Posição dentro do crib. */
  readonly i: number;
}

export interface Menu {
  readonly offset: number;
  readonly length: number;
  readonly edges: readonly MenuEdge[];
  readonly letters: readonly number[];
  readonly test: number;
  /** Laços independentes no componente da letra de teste (arestas − letras + 1). */
  readonly loops: number;
  /** Ciclos fundamentais (listas de índices de arestas), usados como filtro rápido. */
  readonly cycles: readonly (readonly number[])[];
}

/**
 * No máximo 26 letras: com mais, o rotor da direita daria uma volta inteira dentro do crib e o do
 * meio poderia virar duas vezes, o que o modelo da Bomba (uma virada no máximo) não cobre.
 */
export const MAX_MENU_LENGTH = 26;

/** Monta o menu a partir do alinhamento do crib. Devolve null se o alinhamento é impossível. */
export function buildMenu(cipher: readonly number[], fullCrib: readonly number[], offset: number): Menu | null {
  const crib = fullCrib.slice(0, MAX_MENU_LENGTH);
  const edges: MenuEdge[] = [];
  for (let i = 0; i < crib.length; i++) {
    const a = crib[i] ?? 0;
    const b = cipher[offset + i];
    if (b === undefined) return null;
    if (a === b) return null;
    edges.push({ a, b, i });
  }
  const degree = new Map<number, number>();
  for (const e of edges) {
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }
  let test = edges[0]?.a ?? 0;
  for (const [letter, d] of degree) if (d > (degree.get(test) ?? 0)) test = letter;

  // Árvore geradora por BFS a partir de T; cada aresta fora da árvore fecha um ciclo.
  const parentEdge = new Map<number, number>();
  const depth = new Map<number, number>([[test, 0]]);
  const queue = [test];
  const treeEdges = new Set<number>();
  while (queue.length > 0) {
    const x = queue.shift() as number;
    edges.forEach((e, idx) => {
      const y = e.a === x ? e.b : e.b === x ? e.a : null;
      if (y === null || depth.has(y)) return;
      depth.set(y, (depth.get(x) ?? 0) + 1);
      parentEdge.set(y, idx);
      treeEdges.add(idx);
      queue.push(y);
    });
  }
  const component = new Set(depth.keys());
  const cycles: number[][] = [];
  edges.forEach((e, idx) => {
    if (treeEdges.has(idx) || !component.has(e.a)) return;
    // Caminho na árvore de a até b, mais a aresta extra: um ciclo que começa e termina em a.
    const pathUp = (from: number): number[] => {
      const out: number[] = [];
      let x = from;
      while (x !== test) {
        const pe = parentEdge.get(x);
        if (pe === undefined) break;
        out.push(pe);
        const pedge = edges[pe];
        x = pedge.a === x ? pedge.b : pedge.a;
      }
      return out;
    };
    const fromA = pathUp(e.a);
    const fromB = pathUp(e.b);
    // Remove o trecho comum (acima do ancestral comum).
    while (fromA.length > 0 && fromB.length > 0 && fromA.at(-1) === fromB.at(-1)) {
      fromA.pop();
      fromB.pop();
    }
    cycles.push([idx, ...fromB, ...fromA.reverse()]);
  });
  const componentEdges = edges.filter((e) => component.has(e.a)).length;
  return {
    offset,
    length: crib.length,
    edges,
    letters: [...degree.keys()].sort((x, y) => x - y),
    test,
    loops: componentEdges - component.size + 1,
    cycles,
  };
}

function tables(wiring: string): { f: Uint8Array; b: Uint8Array } {
  const f = new Uint8Array(26);
  const b = new Uint8Array(26);
  for (let i = 0; i < 26; i++) {
    const o = wiring.charCodeAt(i) - 65;
    f[i] = o;
    b[o] = i;
  }
  return { f, b };
}

/**
 * Tabela do misturador para uma ordem de rotores: para cada deslocamento de núcleo (esq., meio, dir.)
 * e cada letra de entrada, a letra de saída. 26⁴ = 456.976 bytes.
 */
export function scramblerTable(order: RotorOrder, reflector: keyof typeof REFLECTORS = 'B', out?: Uint8Array): Uint8Array {
  const table = out ?? new Uint8Array(26 ** 4);
  const L = tables(ROTORS[order[0]].wiring);
  const M = tables(ROTORS[order[1]].wiring);
  const R = tables(ROTORS[order[2]].wiring);
  const U = tables(REFLECTORS[reflector]).f;
  const fw = (t: Uint8Array, s: number, c: number): number => {
    const v = t[(c + s) % 26] ?? 0;
    return (v - s + 26) % 26;
  };
  let k = 0;
  for (let l = 0; l < 26; l++) {
    for (let m = 0; m < 26; m++) {
      for (let r = 0; r < 26; r++) {
        for (let x = 0; x < 26; x++) {
          let c = fw(R.f, r, x);
          c = fw(M.f, m, c);
          c = fw(L.f, l, c);
          c = U[c] ?? 0;
          c = fw(L.b, l, c);
          c = fw(M.b, m, c);
          c = fw(R.b, r, c);
          table[k++] = c;
        }
      }
    }
  }
  return table;
}

export interface BombeStop {
  readonly order: RotorOrder;
  /** Deslocamentos de núcleo (posição − anel) na primeira letra do crib. */
  readonly left: number;
  readonly middle: number;
  readonly right: number;
  /** Letra do crib em que o rotor do meio virou; null = não virou dentro do crib. */
  readonly turnover: number | null;
  /** Pares do plugboard deduzidos (letra → letra), só das letras ligadas ao menu. */
  readonly steckers: readonly (readonly [number, number])[];
}

export interface SearchProgress {
  readonly order: RotorOrder;
  readonly tested: number;
  readonly stops: number;
}

const FULL = (1 << 26) - 1;

function popcount(v: number): number {
  let n = 0;
  let x = v;
  while (x !== 0) {
    x &= x - 1;
    n++;
  }
  return n;
}

/**
 * Procura paradas para uma ordem de rotores. `withTurnover` testa também o rotor do meio virando
 * em cada letra do crib (custa ~tamanho do crib vezes mais).
 */
export function searchOrder(
  menu: Menu,
  order: RotorOrder,
  opts: { withTurnover: boolean; table?: Uint8Array; maxStops?: number } = { withTurnover: true },
): { stops: BombeStop[]; tested: number } {
  const table = scramblerTable(order, 'B', opts.table);
  const edges = menu.edges;
  const E = edges.length;
  const T = menu.test;
  // Lista de adjacência compacta: para cada letra, as arestas e a outra ponta.
  const adjStart = new Int32Array(27);
  for (const e of edges) {
    adjStart[e.a + 1] = (adjStart[e.a + 1] ?? 0) + 1;
    adjStart[e.b + 1] = (adjStart[e.b + 1] ?? 0) + 1;
  }
  for (let i = 1; i <= 26; i++) adjStart[i] = (adjStart[i] ?? 0) + (adjStart[i - 1] ?? 0);
  const adjEdge = new Int32Array(2 * E);
  const adjOther = new Int32Array(2 * E);
  const fill = adjStart.slice(0, 26);
  edges.forEach((e, idx) => {
    const pa = fill[e.a] ?? 0;
    adjEdge[pa] = idx;
    adjOther[pa] = e.b;
    fill[e.a] = pa + 1;
    const pb = fill[e.b] ?? 0;
    adjEdge[pb] = idx;
    adjOther[pb] = e.a;
    fill[e.b] = pb + 1;
  });
  const cribIdx = Int32Array.from(edges.map((e) => e.i));
  const uOff = new Int32Array(E);
  const live = new Int32Array(26);
  const queue = new Int32Array(26 * 26);
  // Filtro rápido: os ciclos mais curtos primeiro (cada um elimina ~37% das posições erradas).
  const cycles = [...menu.cycles]
    .sort((x, y) => x.length - y.length)
    .slice(0, 10)
    .map((c) => Int32Array.from(c));

  /** Propaga a hipótese S(T)=h. Devolve quantas hipóteses ficaram acesas para T (26 = contradição). */
  const closure = (h: number, earlyExit: boolean): number => {
    live.fill(0);
    let qh = 0;
    let qt = 0;
    live[T] = 1 << h;
    queue[qt++] = T * 26 + h;
    while (qh < qt) {
      const code = queue[qh++] ?? 0;
      const x = (code / 26) | 0;
      const v = code - x * 26;
      // Quadro diagonal de Welchman: S(x) = v implica S(v) = x.
      const dv = live[v] ?? 0;
      if ((dv & (1 << x)) === 0) {
        live[v] = dv | (1 << x);
        queue[qt++] = v * 26 + x;
      }
      const end = adjStart[x + 1] ?? 0;
      for (let p = adjStart[x] ?? 0; p < end; p++) {
        const y = adjOther[p] ?? 0;
        const w = table[(uOff[adjEdge[p] ?? 0] ?? 0) + v] ?? 0;
        const ly = live[y] ?? 0;
        if ((ly & (1 << w)) === 0) {
          live[y] = ly | (1 << w);
          queue[qt++] = y * 26 + w;
        }
      }
      if (earlyExit && live[T] === FULL) return 26;
    }
    return popcount(live[T] ?? 0);
  };

  const cyclesOk = (): boolean => {
    for (const cyc of cycles) {
      let ok = false;
      for (let s = 0; s < 26 && !ok; s++) {
        let v = s;
        for (let k = 0; k < cyc.length; k++) v = table[(uOff[cyc[k] ?? 0] ?? 0) + v] ?? 0;
        if (v === s) ok = true;
      }
      if (!ok) return false;
    }
    return true;
  };

  const stops: BombeStop[] = [];
  let tested = 0;
  const L = menu.length;
  const turnovers: (number | null)[] = [null];
  if (opts.withTurnover) for (let t = 1; t < L; t++) turnovers.push(t);
  const maxStops = opts.maxStops ?? 2000;

  for (let l = 0; l < 26; l++) {
    for (let m = 0; m < 26; m++) {
      const base0 = (l * 26 + m) * 676;
      const base1 = (l * 26 + ((m + 1) % 26)) * 676;
      for (let r = 0; r < 26; r++) {
        for (const t of turnovers) {
          tested++;
          for (let e = 0; e < E; e++) {
            const i = cribIdx[e] ?? 0;
            uOff[e] = (t !== null && i >= t ? base1 : base0) + ((r + i) % 26) * 26;
          }
          if (!cyclesOk()) continue;
          const lit = closure(0, true);
          if (lit === 26) continue;
          // Parada: as hipóteses apagadas (ou a única acesa) são candidatas ao par de T.
          const mask = live[T] ?? 0;
          const candidates: number[] = [];
          if (lit === 1) candidates.push(0);
          else for (let s = 0; s < 26; s++) if ((mask & (1 << s)) === 0) candidates.push(s);
          for (const s of candidates) {
            closure(s, false);
            const steckers = consistentSteckers(live);
            if (steckers === null) continue;
            stops.push({ order, left: l, middle: m, right: r, turnover: t, steckers });
            if (stops.length >= maxStops) return { stops, tested };
          }
        }
      }
    }
  }
  return { stops, tested };
}

/** Lê as hipóteses acesas: cada letra tocada precisa ter exatamente um par, e o par precisa ser recíproco. */
function consistentSteckers(live: Int32Array): (readonly [number, number])[] | null {
  const partner = new Int8Array(26).fill(-1);
  for (let x = 0; x < 26; x++) {
    const v = live[x] ?? 0;
    if (v === 0) continue;
    if ((v & (v - 1)) !== 0) return null;
    partner[x] = 31 - Math.clz32(v);
  }
  const pairs: [number, number][] = [];
  for (let x = 0; x < 26; x++) {
    const y = partner[x] ?? -1;
    if (y < 0) continue;
    if (partner[y] !== -1 && partner[y] !== x) return null;
    if (x <= y) pairs.push([x, y]);
  }
  return pairs;
}

/** Ajuda para testes: o deslocamento de núcleo usado na letra j de uma mensagem que começa em `start`. */
export function coreOffset(position: number, ring: number): number {
  return mod26(position - ring);
}
