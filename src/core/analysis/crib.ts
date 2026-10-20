import { lettersOnly } from '../enigma';

/**
 * "Arrastar o crib" (crib dragging), o primeiro passo de Bletchley Park.
 *
 * Um crib é um trecho que se supõe estar na mensagem (aqui, "PARAXBRAVOXDEXALFA"; na guerra,
 * "WETTERVORHERSAGE" ou "KEINEBESONDERENEREIGNISSE"). Como a Enigma nunca cifra uma letra nela
 * mesma, qualquer alinhamento em que alguma letra do crib caia em cima da MESMA letra do texto
 * cifrado é impossível. Isso elimina boa parte das posições sem precisar de máquina nenhuma.
 */

export interface CribPosition {
  readonly offset: number;
  /** Índices (dentro do crib) em que a letra coincide com o cifrado: provam que a posição é impossível. */
  readonly clashes: readonly number[];
  readonly possible: boolean;
}

export function dragCrib(cipherText: string, cribText: string): CribPosition[] {
  const cipher = lettersOnly(cipherText);
  const crib = lettersOnly(cribText);
  const out: CribPosition[] = [];
  for (let offset = 0; offset + crib.length <= cipher.length; offset++) {
    const clashes: number[] = [];
    for (let i = 0; i < crib.length; i++) if (crib[i] === cipher[offset + i]) clashes.push(i);
    out.push({ offset, clashes, possible: clashes.length === 0 });
  }
  return out;
}

/** Probabilidade de um alinhamento errado sobreviver ao teste por acaso: (25/26)^tamanho do crib. */
export function survivalChance(cribLength: number): number {
  return (25 / 26) ** cribLength;
}
