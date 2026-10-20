/**
 * Quanto tempo a força bruta levaria: em média é preciso testar metade das chaves.
 * Os ritmos são ordens de grandeza para comparação, não medições de ataque real.
 */

export interface Attacker {
  readonly id: string;
  readonly label: string;
  readonly keysPerSecond: number;
  readonly note: string;
}

export const ATTACKERS: readonly Attacker[] = [
  {
    id: 'pc',
    label: 'Um computador comum',
    keysPerSecond: 1e8,
    note: '10⁸ chaves por segundo, todos os núcleos',
  },
  {
    id: 'super',
    label: 'Um supercomputador exaescala',
    keysPerSecond: 1e18,
    note: '10¹⁸ por segundo, estimativa generosa (El Capitan faz ~1,7 × 10¹⁸ operações por segundo)',
  },
  {
    id: 'bitcoin',
    label: 'Toda a mineração de Bitcoin do planeta',
    keysPerSecond: 1e21,
    note: '~10²¹ hashes por segundo em 2026 (≈ 1 ZH/s): o maior esforço de cálculo dedicado que existe',
  },
];

export const SECONDS_PER_YEAR = 365.25 * 24 * 3600;
export const UNIVERSE_AGE_YEARS = 1.38e10;

/** Tempo médio (segundos) para achar a chave testando `rate` chaves por segundo. */
export function expectedSeconds(keyspace: bigint, rate: number): number {
  const half = Number(keyspace / 2n);
  return half / rate;
}

function fmt(n: number, digits = 1): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

const SUPERSCRIPT: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '-': '⁻',
};

/** 1,07 × 10²³ */
export function scientific(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n !== 0 && (Math.abs(n) >= 1e6 || Math.abs(n) < 1e-3)) {
    const exp = Math.floor(Math.log10(Math.abs(n)));
    const mant = n / 10 ** exp;
    return `${fmt(mant, 2)} × 10${[...String(exp)].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
  }
  return fmt(n, 2);
}

export function scientificBig(n: bigint): string {
  const s = n.toString();
  if (s.length <= 7) return Number(n).toLocaleString('pt-BR');
  const mant = Number(`${s[0] ?? '0'}.${s.slice(1, 4)}`);
  return `${fmt(mant, 2)} × 10${[...String(s.length - 1)].map((c) => SUPERSCRIPT[c] ?? c).join('')}`;
}

/** "3,2 segundos", "4 dias", "2,1 × 10⁴⁸ anos". */
export function humanDuration(seconds: number): string {
  if (seconds < 1e-3) return 'instantâneo';
  if (seconds < 60) return `${fmt(seconds)} segundo${seconds >= 2 ? 's' : ''}`;
  if (seconds < 3600) return `${fmt(seconds / 60)} minutos`;
  if (seconds < 86_400) return `${fmt(seconds / 3600)} horas`;
  if (seconds < SECONDS_PER_YEAR) return `${fmt(seconds / 86_400)} dias`;
  const years = seconds / SECONDS_PER_YEAR;
  if (years < 1e6) return `${fmt(years, years < 10 ? 1 : 0)} anos`;
  return `${scientific(years)} anos`;
}

/** Quantas idades do universo cabem nesse tempo. */
export function universes(seconds: number): number {
  return seconds / SECONDS_PER_YEAR / UNIVERSE_AGE_YEARS;
}
