import { describe, expect, it } from 'vitest';
import { groupsOf5, lettersOnly, prepareText, toLetter } from './alphabet';
import { aesKeySpace, enigmaArmyKeySpace, plugboardSettings } from './keyspace';
import { EnigmaMachine, encryptText } from './machine';
import { type EnigmaSettings, EnigmaSettingsError, settingsFrom, validateSettings, withPositions } from './settings';
import { ROTOR_NAMES, type RotorName } from './wiring';

/** Gerador pseudoaleatório com semente, só para os testes serem repetíveis. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomSettings(rand: () => number): EnigmaSettings {
  const pool = [...ROTOR_NAMES.slice(0, 5)];
  const pick = (): RotorName => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const letters = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].sort(() => rand() - 0.5);
  const plugs = Array.from({ length: 10 }, (_, i) => `${letters[2 * i] ?? ''}${letters[2 * i + 1] ?? ''}`).join(' ');
  const three = (): string => Array.from({ length: 3 }, () => toLetter(Math.floor(rand() * 26))).join('');
  return settingsFrom({ rotors: `${pick()} ${pick()} ${pick()}`, rings: three(), positions: three(), plugboard: plugs });
}

describe('vetores de referência', () => {
  it('rotores I II III, refletor B, anéis e posição AAA: AAAAA → BDZGO', () => {
    expect(encryptText(settingsFrom({ rotors: 'I II III' }), 'AAAAA')).toBe('BDZGO');
  });

  it('mesma máquina com todos os anéis em B: AAAAA → EWTYX', () => {
    expect(encryptText(settingsFrom({ rotors: 'I II III', rings: 'BBB' }), 'AAAAA')).toBe('EWTYX');
  });

  it('passo duplo do rotor do meio: ADU → ADV → AEW → BFX → BFY', () => {
    const m = new EnigmaMachine(settingsFrom({ rotors: 'I II III', positions: 'ADU' }));
    const seen: string[] = [];
    const doubles: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const t = m.pressLetter('A');
      seen.push(m.windowLetters);
      doubles.push(t.doubleStep);
    }
    expect(seen).toEqual(['ADV', 'AEW', 'BFX', 'BFY']);
    expect(doubles).toEqual([false, false, true, false]);
  });
});

describe('mensagem real da Operação Barbarossa (7 de julho de 1941)', () => {
  // Chave do dia: rotores II IV V, refletor B, anéis 02 21 12, dez cabos.
  const day = { rotors: 'II IV V', rings: '02 21 12', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' };

  it('parte 1: Grundstellung WXC decifra o indicador KCH na chave BLA e depois o texto', () => {
    const indicator = new EnigmaMachine(settingsFrom({ ...day, positions: 'WXC' }));
    expect(indicator.encrypt('KCH')).toBe('BLA');

    const cipher =
      'EDPUD NRGYS ZRCXN UYTPO MRMBO FKTBZ REZKM LXLVE FGUEY SIOZV EQMIK UBPMM YLKLT TDEIS MDICA ' +
      'GYKUA CTCDO MOHWX MUUIA UBSTS LRNBZ SZWNR FXWFY SSXJZ VIJHI DISHP RKLKA YUPAD TXQSP INQMA ' +
      'TLPIF SVKDA SCTAC DPBOP VHJK';
    const plain = encryptText(settingsFrom({ ...day, positions: 'BLA' }), cipher);
    expect(plain).toBe(
      'AUFKLXABTEILUNGXVONXKURTINOWAXKURTINOWAXNORDWESTLXSEBEZXSEBEZXUAFFLIEGERSTRASZERIQTUNGX' +
        'DUBROWKIXDUBROWKIXOPOTSCHKAXOPOTSCHKAXUMXEINSAQTDREINULLXUHRANGETRETENXANGRIFFXINFXRGTX',
    );
  });

  it('parte 2: Grundstellung CRS decifra o indicador YPJ na chave LSD', () => {
    const indicator = new EnigmaMachine(settingsFrom({ ...day, positions: 'CRS' }));
    expect(indicator.encrypt('YPJ')).toBe('LSD');
    const cipher =
      'SFBWD NJUSE GQOBH KRTAR EEZMW KPPRB XOHDR OEQGB BGTQV PGVKB VVGBI MHUSZ YDAJQ IROAX SSSNR ' +
      'EHYGG RPISE ZBOVM QIEMM ZCYSG QDGRE RVBIL EKXYQ IRGIR QNRDN VRXCY YTNJR';
    expect(encryptText(settingsFrom({ ...day, positions: 'LSD' }), cipher)).toBe(
      'DREIGEHTLANGSAMABERSIQERVORWAERTSXEINSSIEBENNULLSEQSXUHRXROEMXEINSXINFRGTXDREIXAUFFLIEGERST' +
        'RASZEMITANFANGXEINSSEQSXKMXKMXOSTWXKAMENECXK',
    );
  });
});

describe('propriedades da máquina', () => {
  it('é recíproca: cifrar duas vezes com a mesma chave devolve o texto', () => {
    const rand = seeded(1941);
    for (let n = 0; n < 50; n++) {
      const s = randomSettings(rand);
      const text = Array.from({ length: 300 }, () => toLetter(Math.floor(rand() * 26))).join('');
      expect(encryptText(s, encryptText(s, text))).toBe(text);
    }
  });

  it('nunca cifra uma letra nela mesma (a falha que Bletchley Park explorou)', () => {
    const rand = seeded(1940);
    let checked = 0;
    for (let n = 0; n < 40; n++) {
      const m = new EnigmaMachine(randomSettings(rand));
      for (let i = 0; i < 2000; i++) {
        const input = Math.floor(rand() * 26);
        expect(m.press(input).output).not.toBe(input);
        checked++;
      }
    }
    expect(checked).toBe(80_000);
  });

  it('chave errada (um anel trocado) não decifra', () => {
    const right = settingsFrom({ rotors: 'II IV V', rings: '02 21 12', positions: 'BLA', plugboard: 'AV BS CG' });
    const wrong = settingsFrom({ rotors: 'II IV V', rings: '02 21 13', positions: 'BLA', plugboard: 'AV BS CG' });
    const plain = prepareText('Ataque ao amanhecer na praia de Itaipuaçu');
    const cipher = encryptText(right, plain);
    const attempt = encryptText(wrong, cipher);
    expect(attempt).not.toBe(plain);
    const same = [...attempt].filter((c, i) => c === plain[i]).length;
    expect(same / plain.length).toBeLessThan(0.5);
  });

  it('o rastro da corrente termina na letra acesa e passa por todas as etapas', () => {
    const m = new EnigmaMachine(settingsFrom({ rotors: 'I II III' }));
    const t = m.pressLetter('A');
    expect(toLetter(t.output)).toBe('B');
    expect(t.path.map((p) => p.stage)).toEqual([
      'teclado',
      'plugboard',
      'rotorDireito',
      'rotorMeio',
      'rotorEsquerdo',
      'refletor',
      'rotorEsquerdoVolta',
      'rotorMeioVolta',
      'rotorDireitoVolta',
      'lampada',
    ]);
    expect(t.path.at(-1)?.contact).toBe(t.output);
  });

  it('M4 com Beta em A e refletor B-fino equivale à M3 com refletor B', () => {
    const rand = seeded(1942);
    for (let n = 0; n < 20; n++) {
      const base = randomSettings(rand);
      const m3: EnigmaSettings = { ...base, model: 'M3' };
      const m4: EnigmaSettings = { ...base, model: 'M4', reflector: 'B-fino', greek: { name: 'Beta', ring: 0, position: 0 } };
      const text = Array.from({ length: 120 }, () => toLetter(Math.floor(rand() * 26))).join('');
      expect(encryptText(m4, text)).toBe(encryptText(m3, text));
      const m3c: EnigmaSettings = { ...m3, reflector: 'C' };
      const m4c: EnigmaSettings = { ...m4, reflector: 'C-fino', greek: { name: 'Gamma', ring: 0, position: 0 } };
      expect(encryptText(m4c, text)).toBe(encryptText(m3c, text));
    }
  });

  it('withPositions muda só a posição inicial', () => {
    const s = settingsFrom({ rotors: 'I II III', rings: 'BBB' });
    expect(encryptText(withPositions(s, [0, 0, 0]), 'AAAAA')).toBe('EWTYX');
  });
});

describe('validação da chave', () => {
  it('recusa rotor repetido, tomada com dois cabos e rotor de outro modelo', () => {
    expect(() => settingsFrom({ rotors: 'I I III' })).toThrow(EnigmaSettingsError);
    expect(() => settingsFrom({ rotors: 'I II III', plugboard: 'AB AC' })).toThrow(/dois cabos/);
    expect(() => settingsFrom({ rotors: 'I II VI' })).toThrow(/não existe/);
    expect(() => settingsFrom({ rotors: 'I II III', plugboard: 'AA' })).toThrow(/ela mesma/);
  });

  it('a M4 exige o rotor grego e o refletor fino', () => {
    const s = settingsFrom({ rotors: 'I II III' });
    expect(validateSettings({ ...s, model: 'M4' })).toEqual(
      expect.arrayContaining([expect.stringMatching(/refletor/), expect.stringMatching(/grego/)]),
    );
  });
});

describe('preparação do texto em português', () => {
  it('tira acentos, troca espaço e pontuação por X e escreve números por extenso', () => {
    expect(prepareText('Ação às 19h, câmbio.')).toBe('ACAOXASXUMNOVEXHXCAMBIO');
    expect(prepareText('  Olá   mundo!! ')).toBe('OLAXMUNDO');
    expect(prepareText('Estação 2')).toBe('ESTACAOXDOIS');
  });

  it('agrupa de cinco em cinco', () => {
    expect(groupsOf5('ABCDEFGHIJKL')).toBe('ABCDE FGHIJ KL');
    expect(lettersOnly('ab-c d')).toBe('ABCD');
  });
});

describe('espaço de chaves', () => {
  it('confere com a NSA (Miller): 10 cabos e o total do Exército sem anéis', () => {
    expect(plugboardSettings(10)).toBe(150_738_274_937_250n);
    expect(enigmaArmyKeySpace(false).total).toBe(158_962_555_217_826_360_000n);
    expect(enigmaArmyKeySpace(false).bits).toBeCloseTo(67.1, 1);
  });

  it('AES-256 tem 2^256 chaves', () => {
    expect(aesKeySpace(256).bits).toBe(256);
  });
});
