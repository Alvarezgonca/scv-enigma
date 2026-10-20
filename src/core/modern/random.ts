/**
 * Aleatoriedade criptográfica. Tudo que vira chave, indicador ou número de mensagem sai daqui,
 * do gerador do sistema operacional exposto por crypto.getRandomValues (nunca Math.random).
 */

export interface RandomSource {
  bytes(n: number): Uint8Array;
}

export const systemRandom: RandomSource = {
  bytes(n: number): Uint8Array {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  },
};

/**
 * Inteiro uniforme em [0, n). Usa rejeição para não ter viés de módulo: com 256 % 26 = 22,
 * pegar byte % 26 favoreceria as letras A–V. Descartamos os bytes ≥ 234 (= 9 × 26).
 */
export function randomInt(n: number, rng: RandomSource = systemRandom): number {
  if (!Number.isInteger(n) || n <= 0 || n > 256) throw new RangeError('randomInt aceita 1 ≤ n ≤ 256');
  const limit = 256 - (256 % n);
  for (;;) {
    const [b = 0] = rng.bytes(1);
    if (b < limit) return b % n;
  }
}

/** Embaralhamento de Fisher–Yates com o gerador criptográfico. */
export function shuffle<T>(items: readonly T[], rng: RandomSource = systemRandom): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1, rng);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function randomLetters(count: number, rng: RandomSource = systemRandom): string {
  let s = '';
  for (let i = 0; i < count; i++) s += String.fromCharCode(65 + randomInt(26, rng));
  return s;
}

/** Gerador determinístico só para testes e para a demonstração reproduzível. Não é seguro. */
export function seededRandom(seed: number): RandomSource {
  let a = seed >>> 0;
  return {
    bytes(n: number): Uint8Array {
      const out = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
      }
      return out;
    },
  };
}
