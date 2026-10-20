import { describe, expect, it } from 'vitest';
import { encryptText, lettersOnly, prepareText, settingsFrom, toIndex } from '../enigma';
import { type RotorOrder, buildMenu, searchOrder } from './bombe';
import { solve } from './solver';

const TEXTO =
  'Para BRAVO, de ALFA: Defesa Civil informa que o abrigo do ginásio de Itaipuaçu está aberto. Enviar duzentos ' +
  'colchões e água potável às seis horas. A estrada da orla está alagada perto da lagoa, usar o desvio pelo centro. ' +
  'Confirmar recebimento e informar quantas famílias chegaram até o fim da tarde.';

const CRIB = 'PARAXBRAVOXDEXALFAX';

function idx(text: string): number[] {
  return [...lettersOnly(text)].map(toIndex);
}

const KEYS = [
  { rotors: 'II IV V', rings: 'BUL', positions: 'BLA', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' },
  { rotors: 'III I V', rings: 'QRS', positions: 'MAR', plugboard: 'AQ BW CE DR FT GZ HU JI KO LP' },
  { rotors: 'I V II', rings: 'ZAP', positions: 'UVZ', plugboard: 'EM FN GO HP IQ JR KS LT AU BV' },
];

describe('Bomba de Turing-Welchman', () => {
  it('o menu do crib no começo da mensagem tem laços', () => {
    const cipher = idx(encryptText(settingsFrom(KEYS[0] ?? { rotors: 'I II III' }), prepareText(TEXTO)));
    const menu = buildMenu(cipher, idx(CRIB), 0);
    expect(menu).not.toBeNull();
    expect(menu?.loops).toBeGreaterThanOrEqual(2);
    expect(menu?.cycles.length).toBe(menu?.loops);
  });

  for (const key of KEYS) {
    it(`com a ordem certa (${key.rotors}), acha a chave e decifra a mensagem inteira`, () => {
      const plain = prepareText(TEXTO);
      const cipher = idx(encryptText(settingsFrom(key), plain));
      const menu = buildMenu(cipher, idx(CRIB), 0);
      if (menu === null) throw new Error('alinhamento impossível');
      const order = key.rotors.split(' ') as unknown as RotorOrder;
      const { stops } = searchOrder(menu, order, { withTurnover: true });
      expect(stops.length).toBeGreaterThan(0);
      const found = solve(cipher, 0, CRIB.length, stops);
      expect(found).not.toBeNull();
      expect(found?.plaintext).toBe(plain);
    });
  }

  it('ordens erradas quase não param (o filtro elimina milhares de posições)', () => {
    const cipher = idx(encryptText(settingsFrom(KEYS[1] ?? { rotors: 'I II III' }), prepareText(TEXTO)));
    const menu = buildMenu(cipher, idx(CRIB), 0);
    if (menu === null) throw new Error('alinhamento impossível');
    const wrong = searchOrder(menu, ['IV', 'II', 'I'], { withTurnover: false });
    expect(wrong.tested).toBe(26 ** 3);
    expect(wrong.stops.length).toBeLessThan(60);
  });
});
