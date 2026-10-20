/**
 * Tamanho do espaço de chaves, calculado com BigInt (os números passam de 2^53).
 *
 * Referência: A. Ray Miller, "The Cryptographic Mathematics of Enigma", NSA Center for
 * Cryptologic History (1995, rev. 2019). Para a Enigma do Exército (3 de 5 rotores, refletor B,
 * 10 cabos) o total sem os anéis é 158.962.555.217.826.360.000 ≈ 1,59 × 10^20.
 */

export function factorial(n: number): bigint {
  let r = 1n;
  for (let i = 2n; i <= BigInt(n); i++) r *= i;
  return r;
}

/** Arranjos: escolher k rotores de n, importando a ordem. */
export function arrangements(n: number, k: number): bigint {
  let r = 1n;
  for (let i = 0; i < k; i++) r *= BigInt(n - i);
  return r;
}

/** Jeitos de ligar `cables` cabos em 26 tomadas: 26! / ((26 − 2c)! · c! · 2^c). */
export function plugboardSettings(cables: number): bigint {
  if (cables < 0 || cables > 13) throw new RangeError('de 0 a 13 cabos');
  return factorial(26) / (factorial(26 - 2 * cables) * factorial(cables) * 2n ** BigInt(cables));
}

export interface KeySpaceFactor {
  readonly label: string;
  readonly value: bigint;
  readonly explain: string;
}

export interface KeySpace {
  readonly name: string;
  readonly factors: readonly KeySpaceFactor[];
  readonly total: bigint;
  readonly bits: number;
}

/** log2 de um BigInt com precisão suficiente para exibição. */
export function log2BigInt(n: bigint): number {
  if (n <= 0n) return -Infinity;
  const s = n.toString(2);
  const head = Number.parseInt(s.slice(0, 53), 2);
  return Math.log2(head) + Math.max(0, s.length - 53);
}

function build(name: string, factors: KeySpaceFactor[]): KeySpace {
  const total = factors.reduce((acc, f) => acc * f.value, 1n);
  return { name, factors, total, bits: log2BigInt(total) };
}

/** Enigma I do Exército: 3 rotores escolhidos entre 5, refletor B fixo, 10 cabos. */
export function enigmaArmyKeySpace(includeRings: boolean): KeySpace {
  const factors: KeySpaceFactor[] = [
    { label: 'Ordem dos rotores', value: arrangements(5, 3), explain: '5 × 4 × 3 = 60' },
    { label: 'Posição inicial', value: 26n ** 3n, explain: '26³ = 17.576' },
    { label: 'Plugboard (10 cabos)', value: plugboardSettings(10), explain: '26! / (6! · 10! · 2¹⁰)' },
  ];
  if (includeRings) {
    factors.splice(2, 0, {
      label: 'Anéis que importam',
      value: 26n ** 2n,
      explain: '26² = 676 (o anel do rotor esquerdo só repete a posição)',
    });
  }
  return build(includeRings ? 'Enigma I (com anéis)' : 'Enigma I', factors);
}

/** M4 dos submarinos: 3 de 8 rotores, Beta ou Gamma, refletor fino B ou C, 10 cabos. */
export function enigmaM4KeySpace(): KeySpace {
  return build('Enigma M4', [
    { label: 'Ordem dos rotores', value: arrangements(8, 3), explain: '8 × 7 × 6 = 336' },
    { label: 'Rotor grego', value: 2n, explain: 'Beta ou Gamma' },
    { label: 'Refletor fino', value: 2n, explain: 'B ou C' },
    { label: 'Posição inicial', value: 26n ** 4n, explain: '26⁴ = 456.976' },
    { label: 'Anéis que importam', value: 26n ** 2n, explain: '26² = 676' },
    { label: 'Plugboard (10 cabos)', value: plugboardSettings(10), explain: '26! / (6! · 10! · 2¹⁰)' },
  ]);
}

export function aesKeySpace(bits: 128 | 256): KeySpace {
  return build(`AES-${bits}`, [{ label: 'Chave', value: 2n ** BigInt(bits), explain: `2^${bits}` }]);
}
