/**
 * Alfabeto da Enigma: só as 26 letras de A a Z. Não há espaço, número nem acento,
 * por isso o texto em português passa por uma preparação antes de ser cifrado,
 * como os operadores faziam à mão.
 */
export const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const SIZE = 26;

/** Teclado alemão QWERTZ, na ordem física da Enigma (teclado, lâmpadas e plugboard). */
export const QWERTZ_ROWS: readonly string[] = ['QWERTZUIO', 'ASDFGHJK', 'PYXCVBNML'];

export function mod26(n: number): number {
  return ((n % SIZE) + SIZE) % SIZE;
}

export function isLetter(ch: string): boolean {
  return ch.length === 1 && ch >= 'A' && ch <= 'Z';
}

export function toIndex(ch: string): number {
  if (!isLetter(ch)) throw new RangeError(`"${ch}" não é uma letra de A a Z`);
  return ch.charCodeAt(0) - 65;
}

export function toLetter(i: number): string {
  return String.fromCharCode(65 + mod26(i));
}

/** Converte "WXC" em [22, 23, 2]. */
export function lettersToIndices(text: string): number[] {
  return [...text].map(toIndex);
}

export function indicesToLetters(indices: readonly number[]): string {
  return indices.map(toLetter).join('');
}

/** Mantém só as letras A–Z (ignora espaços dos grupos de cinco e qualquer outro caractere). */
export function lettersOnly(text: string): string {
  return text.toUpperCase().replace(/[^A-Z]/g, '');
}

/** Escreve em grupos de cinco letras, como as mensagens eram transmitidas. */
export function groupsOf5(text: string): string {
  const letters = lettersOnly(text);
  const out: string[] = [];
  for (let i = 0; i < letters.length; i += 5) out.push(letters.slice(i, i + 5));
  return out.join(' ');
}

const DIGIT_WORDS = ['ZERO', 'UM', 'DOIS', 'TRES', 'QUATRO', 'CINCO', 'SEIS', 'SETE', 'OITO', 'NOVE'];

/**
 * Prepara texto livre em português para a Enigma:
 * - tira acentos e cedilha (Ç vira C) e passa para maiúsculas;
 * - espaço e pontuação viram um único X, a convenção dos operadores alemães;
 * - cada algarismo é escrito por extenso (1940 → UMNOVEQUATROZERO).
 */
export function prepareText(text: string): string {
  const plain = text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  let out = '';
  let pendingSeparator = false;
  let previousWasDigit = false;
  for (const ch of plain) {
    const isDigit = ch >= '0' && ch <= '9';
    if (isLetter(ch) || isDigit) {
      const startsNumber = isDigit && !previousWasDigit;
      const endsNumber = !isDigit && previousWasDigit;
      if (out.length > 0 && (pendingSeparator || startsNumber || endsNumber)) out += 'X';
      out += isDigit ? DIGIT_WORDS[ch.charCodeAt(0) - 48] : ch;
      pendingSeparator = false;
      previousWasDigit = isDigit;
    } else {
      pendingSeparator = true;
    }
  }
  return out;
}
