import { describe, expect, it } from 'vitest';
import { encryptText, enigmaArmyKeySpace, aesKeySpace, prepareText, settingsFrom } from '../enigma';
import { seededRandom } from '../modern';
import { expectedSeconds, humanDuration, scientific, scientificBig, universes } from './bruteforce';
import { dragCrib, survivalChance } from './crib';
import {
  IC_PORTUGUESE,
  IC_RANDOM,
  enigmaSelfMatrix,
  indexOfCoincidence,
  letterCounts,
  PT_LETTER_PERCENT,
  trigramFitness,
  trigramScoreText,
} from './stats';

const TEXTO =
  'A Defesa Civil de Maricá informa que o abrigo do ginásio está aberto e recebe famílias da região da lagoa. ' +
  'Os voluntários devem levar colchões, água potável e alimentos não perecíveis até o fim da tarde. ';

describe('estatística de letras', () => {
  it('as frequências do corpus parecem português (A, E, O na frente)', () => {
    const top = [...PT_LETTER_PERCENT.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([i]) => String.fromCharCode(65 + i));
    expect(top).toEqual(['A', 'E', 'O']);
    expect(IC_PORTUGUESE).toBeGreaterThan(0.065);
  });

  it('a Enigma derruba o IC do português para perto do aleatório', () => {
    const plain = prepareText(TEXTO.repeat(4));
    const cipher = encryptText(settingsFrom({ rotors: 'II IV V', rings: 'BUL', positions: 'BLA', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' }), plain);
    const icPlain = indexOfCoincidence(letterCounts(plain));
    const icCipher = indexOfCoincidence(letterCounts(cipher));
    expect(icPlain).toBeGreaterThan(0.06);
    expect(Math.abs(icCipher - IC_RANDOM)).toBeLessThan(0.008);
  });

  it('na matriz entrada × saída da Enigma a diagonal é sempre zero', () => {
    const m = enigmaSelfMatrix(20_000, seededRandom(3));
    expect(m.diagonal).toBe(0);
    expect(m.matrix.flat().reduce((a, b) => a + b, 0)).toBe(20_000);
    expect(m.matrix.every((row, i) => row[i] === 0)).toBe(true);
  });

  it('o modelo de trigramas prefere português a lixo', () => {
    const pt = trigramFitness(prepareText(TEXTO));
    const lixo = trigramFitness('QWKZJXQVBNMPLKJHGFDSAZXCVBNMQWERTYUIOPASDFGHJKLZXCVBNMQWERTYUIOP');
    expect(pt).toBeGreaterThan(-3.2);
    expect(lixo).toBeLessThan(-4.5);
    expect(trigramScoreText('ABC')).toBeLessThan(0);
  });
});

describe('crib e a falha da Enigma', () => {
  it('nenhuma posição verdadeira tem choque; muitas falsas são eliminadas', () => {
    const plain = prepareText(`Para BRAVO, de ALFA: ${TEXTO}`);
    const cipher = encryptText(settingsFrom({ rotors: 'III I V', rings: 'QRS', positions: 'MAR', plugboard: 'AB CD EF GH IJ KL MN OP QR ST' }), plain);
    const positions = dragCrib(cipher, 'PARAXBRAVOXDEXALFA');
    expect(positions[0]?.possible).toBe(true);
    const eliminated = positions.filter((p) => !p.possible).length;
    expect(eliminated / positions.length).toBeGreaterThan(0.25);
    expect(survivalChance(18)).toBeCloseTo(0.4936, 3);
  });
});

describe('força bruta', () => {
  it('formata números e durações', () => {
    expect(scientific(1.07e23)).toBe('1,07 × 10²³');
    expect(scientificBig(158_962_555_217_826_360_000n)).toBe('1,59 × 10²⁰');
    expect(humanDuration(30)).toBe('30 segundos');
    expect(humanDuration(3 * 86_400)).toBe('3 dias');
  });

  it('a Enigma cai em segundos na escala de hoje; o AES-256 leva incontáveis idades do universo', () => {
    const enigma = expectedSeconds(enigmaArmyKeySpace(true).total, 1e21);
    const aes = expectedSeconds(aesKeySpace(256).total, 1e21);
    expect(enigma).toBeLessThan(120);
    expect(universes(aes)).toBeGreaterThan(1e37);
  });
});
