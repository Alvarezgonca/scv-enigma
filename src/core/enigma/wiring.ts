/**
 * Fiação histórica das peças da Enigma.
 *
 * Cada string diz para onde vai o contato de entrada A, B, C… quando o rotor está na posição A
 * com o anel em A (por exemplo, no rotor I o A sai em E e o B sai em K). O "entalhe" (notch) é a
 * letra da janela em que o rotor, ao andar, empurra o vizinho da esquerda.
 *
 * Fonte das fiações e entalhes: Crypto Museum (cryptomuseum.com/crypto/enigma/wiring.htm) e
 * D. Hamer, "Enigma: Actions Involved in the 'Double Stepping' of the Middle Rotor",
 * Cryptologia 21(1), 1997. Conferidas pelos vetores de teste em machine.test.ts.
 */

export type RotorName = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI' | 'VII' | 'VIII';
export type GreekName = 'Beta' | 'Gamma';
export type ReflectorName = 'A' | 'B' | 'C' | 'B-fino' | 'C-fino';

export interface RotorSpec {
  readonly wiring: string;
  /** Letras da janela em que o rotor arrasta o vizinho da esquerda. */
  readonly notches: string;
  /** Ano e uso, para a narrativa da interface. */
  readonly history: string;
}

export const ROTORS: Readonly<Record<RotorName, RotorSpec>> = {
  I: { wiring: 'EKMFLGDQVZNTOWYHXUSPAIBRCJ', notches: 'Q', history: 'Enigma I, 1930' },
  II: { wiring: 'AJDKSIRUXBLHWTMCQGZNPYFVOE', notches: 'E', history: 'Enigma I, 1930' },
  III: { wiring: 'BDFHJLCPRTXVZNYEIWGAKMUSQO', notches: 'V', history: 'Enigma I, 1930' },
  IV: { wiring: 'ESOVPZJAYQUIRHXLNFTGKDCMWB', notches: 'J', history: 'Exército, dez. 1938' },
  V: { wiring: 'VZBRGITYUPSDNHLXAWMJQOFECK', notches: 'Z', history: 'Exército, dez. 1938' },
  VI: { wiring: 'JPGVOUMFYQBENHZRDKASXLICTW', notches: 'ZM', history: 'Marinha, 1939' },
  VII: { wiring: 'NZJHGRCXMYSWBOUFAIVLPEKQDT', notches: 'ZM', history: 'Marinha, 1939' },
  VIII: { wiring: 'FKQHTLXOCBJSPDZRAMEWNIUYGV', notches: 'ZM', history: 'Marinha, 1941' },
};

/** Quarto rotor da M4 (submarinos, 1942): fino, não gira sozinho e fica à esquerda. */
export const GREEK_WHEELS: Readonly<Record<GreekName, string>> = {
  Beta: 'LEYJVCNIXWPBQMDRTAKZGFUHOS',
  Gamma: 'FSOKANUERHMBTIYCWLQPZXVGJD',
};

/** Refletores (Umkehrwalze). São involuções sem ponto fixo: é daqui que vem a falha da Enigma. */
export const REFLECTORS: Readonly<Record<ReflectorName, string>> = {
  A: 'EJMZALYXVBWFCRQUONTSPIKHGD',
  B: 'YRUHQSLDPXNGOKMIEBFZCWVJAT',
  C: 'FVPJIAOYEDRZXWGCTKUQSBNMHL',
  'B-fino': 'ENKQAUYWJICOPBLMDXZVFTHRGS',
  'C-fino': 'RDOBJNTKVEHMLFCWZAXGYIPSUQ',
};

export const ROTOR_NAMES: readonly RotorName[] = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
export const GREEK_NAMES: readonly GreekName[] = ['Beta', 'Gamma'];
export const REFLECTOR_NAMES: readonly ReflectorName[] = ['A', 'B', 'C', 'B-fino', 'C-fino'];
