import { describe, expect, it } from 'vitest';
import { prepareText } from '../../core/enigma';
import { seededRandom } from '../../core/modern';
import { encryptEnigmaMessage, generateKeySheet, pairSecret, parseFrame, sealAesMessage, sheetForStation } from '../../core/protocol';
import { type Tamper, decodeFrames, readable, tamper } from './receive-logic';

const sheet = generateKeySheet(
  { net: 'MARICA', stations: ['ALFA', 'BRAVO', 'CHARLIE'], start: new Date(2026, 9, 20), days: 3 },
  seededRandom(77),
);
const bravo = sheetForStation(sheet, 'BRAVO');
const charlie = sheetForStation(sheet, 'CHARLIE');
const day = sheet.days[0];
if (day === undefined) throw new Error('dia ausente');
const TEXT = 'Para BRAVO, de ALFA: abrigo aberto no ginásio, enviar colchões e água. '.repeat(6);

function enigmaFrames() {
  const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: prepareText(TEXT), rng: seededRandom(1) });
  return out.parts.map((p) => parseFrame(p.frame));
}

async function aesFrames() {
  const secret = pairSecret(sheet, 'ALFA', 'BRAVO');
  if (secret === undefined) throw new Error('segredo ausente');
  const out = await sealAesMessage({ from: 'ALFA', to: 'BRAVO', day: day.day, text: TEXT, pairSecret: secret, rng: seededRandom(2) });
  return out.frames.map((f) => parseFrame(f));
}

describe('recepção: decifração completa', () => {
  it('BRAVO lê as duas versões', async () => {
    const e = await decodeFrames(enigmaFrames(), bravo);
    expect(e.kind === 'E' && e.text).toBe(prepareText(TEXT));
    const a = await decodeFrames(await aesFrames(), bravo);
    expect(a.kind === 'A' && a.result.text).toBe(TEXT);
  });

  it('CHARLIE lê a Enigma (chave da rede é a mesma), mas não o AES de ALFA→BRAVO', async () => {
    const e = await decodeFrames(enigmaFrames(), charlie);
    expect(e.kind === 'E' && e.text).toBe(prepareText(TEXT));
    const a = await decodeFrames(await aesFrames(), charlie);
    expect(a.kind).toBe('erro');
  });

  it('chave do dia errada: Enigma devolve lixo e acusa a Kenngruppe', async () => {
    const wrong = sheet.days[1];
    if (wrong === undefined) throw new Error('dia ausente');
    const e = await decodeFrames(enigmaFrames(), bravo, wrong);
    if (e.kind !== 'E') throw new Error('esperava Enigma');
    expect(e.text).not.toBe(prepareText(TEXT));
    expect(e.parts.some((p) => p.warnings.length > 0)).toBe(true);
  });

  it('readable troca o X por espaço', () => {
    expect(readable('PARAXBRAVOXDEXALFA')).toBe('PARA BRAVO DE ALFA');
  });
});

describe('laboratório de adulteração: Enigma aceita calada, AES recusa', () => {
  const cases: Tamper[] = ['letra', 'destinatario', 'cortar', 'ordem'];
  for (const kind of cases) {
    it(`${kind}: a Enigma decifra sem alarme e o texto sai diferente ou fora de ordem`, async () => {
      const original = await decodeFrames(enigmaFrames(), bravo);
      const attacked = await decodeFrames(tamper(enigmaFrames(), kind, sheet.stations), bravo);
      if (original.kind !== 'E' || attacked.kind !== 'E') throw new Error('esperava Enigma');
      expect(attacked.parts.flatMap((p) => p.warnings)).toEqual([]);
      if (kind === 'destinatario') expect(attacked.to).not.toBe('BRAVO');
      else expect(attacked.text).not.toBe(original.text);
    });

    it(`${kind}: o AES-GCM recusa e não entrega texto nenhum`, async () => {
      const attacked = await decodeFrames(tamper(await aesFrames(), kind, sheet.stations), bravo);
      if (attacked.kind === 'A') {
        expect(attacked.result.text).toBeNull();
      } else {
        // Destinatário trocado para CHARLIE: BRAVO nem tem a chave desse par.
        expect(attacked.kind).toBe('erro');
      }
    });
  }
});
