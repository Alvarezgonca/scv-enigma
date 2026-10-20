import { describe, expect, it } from 'vitest';
import { lettersOnly, prepareText } from '../enigma';
import { deflate, inflate, InflateLimitError, seededRandom } from '../modern';
import {
  type AesFrame,
  type EnigmaFrame,
  type SheetFrame,
  decryptEnigmaPart,
  encryptEnigmaMessage,
  FrameError,
  framesToSheet,
  generateKeySheet,
  KeySheetError,
  MessageAssembler,
  openAesMessage,
  pairSecret,
  parseFrame,
  parseSheet,
  sealAesMessage,
  serializeSheet,
  sheetFingerprint,
  sheetForStation,
  sheetToFrames,
} from '.';

const START = new Date(2026, 9, 19);

function newSheet(seed = 1) {
  return generateKeySheet({ net: 'MARICA', stations: ['ALFA', 'BRAVO', 'CHARLIE'], start: START, days: 7 }, seededRandom(seed));
}

describe('folha de chaves', () => {
  it('gera 7 dias com rotores distintos, 10 cabos e 4 Kenngruppen, e um segredo por par', () => {
    const sheet = newSheet();
    expect(sheet.days).toHaveLength(7);
    expect(sheet.days[1]?.date).toBe('2026-10-20');
    for (const d of sheet.days) {
      expect(new Set(d.rotors).size).toBe(3);
      expect(d.plugboard).toHaveLength(10);
      expect(new Set(d.plugboard.flat()).size).toBe(20);
      expect(new Set(d.kenngruppen).size).toBe(4);
    }
    expect(Object.keys(sheet.pairSecrets).sort()).toEqual(['ALFA-BRAVO', 'ALFA-CHARLIE', 'BRAVO-CHARLIE']);
  });

  it('cada estação recebe só os segredos dos próprios pares (menor privilégio)', () => {
    const charlie = sheetForStation(newSheet(), 'CHARLIE');
    expect(charlie.holder).toBe('CHARLIE');
    expect(Object.keys(charlie.pairSecrets).sort()).toEqual(['ALFA-CHARLIE', 'BRAVO-CHARLIE']);
    expect(pairSecret(charlie, 'ALFA', 'BRAVO')).toBeUndefined();
  });

  it('serializa, lê de volta e recusa folha adulterada', () => {
    const sheet = sheetForStation(newSheet(), 'BRAVO');
    expect(parseSheet(serializeSheet(sheet))).toEqual(sheet);
    const json = JSON.parse(serializeSheet(sheet)) as { d: string[]; k: Record<string, string> };
    const badRotor = { ...json, d: [json.d[0]?.replace(/^(\S+) \S+/, '$1 I.I.II')] };
    expect(() => parseSheet(JSON.stringify(badRotor))).toThrow(KeySheetError);
    const extraPair = { ...json, k: { ...json.k, 'ALFA-CHARLIE': 'A'.repeat(43) } };
    expect(() => parseSheet(JSON.stringify(extraPair))).toThrow(/não é desta estação/);
    expect(() => parseSheet('{"v":2}')).toThrow(KeySheetError);
    expect(() => parseSheet('<script>')).toThrow(KeySheetError);
  });

  it('valida nome da rede, estações e validade', () => {
    expect(() => generateKeySheet({ net: 'X', stations: ['ALFA', 'BRAVO'], start: START, days: 7 })).toThrow(KeySheetError);
    expect(() => generateKeySheet({ net: 'REDE', stations: ['ALFA'], start: START, days: 7 })).toThrow(KeySheetError);
    expect(() => generateKeySheet({ net: 'REDE', stations: ['ALFA', 'ALFA'], start: START, days: 7 })).toThrow(KeySheetError);
  });

  it('distribui por QR, com e sem senha', async () => {
    const station = sheetForStation(newSheet(), 'BRAVO');
    const open = await sheetToFrames(station);
    const parsedOpen = open.map((f) => parseFrame(f) as SheetFrame);
    expect(await framesToSheet(parsedOpen)).toEqual(station);

    const sealed = await sheetToFrames(station, { password: 'farol de itaipuaçu', iterations: 1000 });
    const parsed = sealed.map((f) => parseFrame(f) as SheetFrame);
    expect(parsed.every((f) => f.protectedByPassword)).toBe(true);
    expect(await framesToSheet(parsed, { password: 'farol de itaipuaçu', iterations: 1000 })).toEqual(station);
    await expect(framesToSheet(parsed, { password: 'outra senha', iterations: 1000 })).rejects.toThrow(/senha errada/);
    await expect(framesToSheet(parsed)).rejects.toThrow(/protegida por senha/);
    if (parsed.length > 1) await expect(framesToSheet(parsed.slice(1))).rejects.toThrow(/falta a parte/);
  });

  it('recusa folha aberta quando se esperava senha, partes misturadas e o mesmo código de conferência', async () => {
    const station = sheetForStation(newSheet(), 'BRAVO');
    const open = (await sheetToFrames(station)).map((f) => parseFrame(f) as SheetFrame);
    await expect(framesToSheet(open, { requirePassword: true })).rejects.toThrow(/SEM senha/);
    await expect(framesToSheet(open, { password: 'qualquer' })).rejects.toThrow(/SEM senha/);
    const other = (await sheetToFrames(sheetForStation(newSheet(5), 'BRAVO'))).map((f) => parseFrame(f) as SheetFrame);
    await expect(framesToSheet([open[0], ...other.slice(1)])).rejects.toThrow(/mesma folha|falta/);
    expect(await sheetFingerprint(station)).toMatch(/^(?:[0-9A-F]{4}-){4}[0-9A-F]{4}$/);
    expect(await sheetFingerprint(station)).toBe(await sheetFingerprint(parseSheet(serializeSheet(station))));
  });

  it('não abre bomba de compressão', async () => {
    const bomb = await deflate(new Uint8Array(5 * 1024 * 1024));
    await expect(inflate(bomb)).rejects.toBeInstanceOf(InflateLimitError);
  });
});

describe('mensagem Enigma com indicador e partes', () => {
  const sheet = newSheet(2);
  const day = sheet.days[1];
  if (day === undefined) throw new Error('dia ausente');
  const text = prepareText(
    'Para Bravo. Comboio de suprimentos parte da estação Itaipuaçu às 0600, ' +
      'segue pela orla até Ponta Negra. Confirmar recebimento. '.repeat(5),
  );

  it('divide em partes de até 250 letras, cada uma com Grundstellung e chave próprias', () => {
    const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: text, time: '1920', rng: seededRandom(3) });
    expect(out.parts.length).toBe(Math.ceil(text.length / 250));
    const indicators = new Set(out.parts.map((p) => p.grundstellung + p.messageKey));
    expect(indicators.size).toBe(out.parts.length);
    let plain = '';
    for (const p of out.parts) {
      const frame = parseFrame(p.frame) as EnigmaFrame;
      expect(frame.kind).toBe('E');
      expect(frame.letters).toBe(frame.body.length);
      expect(day.kenngruppen).toContain(frame.body.slice(2, 5));
      const r = decryptEnigmaPart(frame, sheet);
      expect(r.messageKey).toBe(p.messageKey);
      expect(r.warnings).toEqual([]);
      plain += r.plaintext;
    }
    expect(plain).toBe(text);
  });

  it('adulteração passa calada: uma letra trocada muda uma letra do texto e ninguém percebe', () => {
    const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: 'ATACARXAOXAMANHECER', rng: seededRandom(4) });
    const frame = parseFrame(out.parts[0]?.frame ?? '') as EnigmaFrame;
    const pos = 9;
    const original = frame.body[pos] ?? 'A';
    const swapped = original === 'Z' ? 'Y' : String.fromCharCode(original.charCodeAt(0) + 1);
    const tampered: EnigmaFrame = { ...frame, body: frame.body.slice(0, pos) + swapped + frame.body.slice(pos + 1) };
    const r = decryptEnigmaPart(tampered, sheet);
    expect(r.warnings).toEqual([]);
    const diff = [...r.plaintext].filter((c, i) => c !== 'ATACARXAOXAMANHECER'[i]).length;
    expect(diff).toBe(1);
  });

  it('mensagem cortada só é notada pela contagem de letras do cabeçalho', () => {
    const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: 'ATACARXAOXAMANHECER', rng: seededRandom(5) });
    const frame = parseFrame(out.parts[0]?.frame ?? '') as EnigmaFrame;
    const r = decryptEnigmaPart({ ...frame, body: frame.body.slice(0, -3) }, sheet);
    expect(r.warnings.join(' ')).toMatch(/anuncia/);
  });

  it('chave do dia errada: Kenngruppe não confere e o texto sai ilegível', () => {
    const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: text.slice(0, 120), rng: seededRandom(6) });
    const frame = parseFrame(out.parts[0]?.frame ?? '') as EnigmaFrame;
    const wrong = sheet.days[3];
    if (wrong === undefined) throw new Error('dia ausente');
    const r = decryptEnigmaPart(frame, sheet, wrong);
    expect(r.warnings.join(' ')).toMatch(/Kenngruppe/);
    expect(r.plaintext).not.toBe(text.slice(0, 120));
  });
});

describe('mensagem moderna (AES-256-GCM)', () => {
  const sheet = newSheet(9);
  const secret = pairSecret(sheet, 'ALFA', 'BRAVO');
  if (secret === undefined) throw new Error('segredo ausente');
  const text = 'Comboio parte às 06h00 da estação de Itaipuaçu — confirmar. '.repeat(8);

  async function send() {
    const out = await sealAesMessage({ from: 'ALFA', to: 'BRAVO', day: 20, text, pairSecret: secret ?? new Uint8Array(), rng: seededRandom(10) });
    return { out, frames: out.frames.map((f) => parseFrame(f) as AesFrame) };
  }

  it('vai e volta com acentos e várias partes', async () => {
    const { out, frames } = await send();
    expect(frames.length).toBeGreaterThan(2);
    expect(out.frames.every((f) => /^[0-9A-Z $%*+\-./:]+$/.test(f))).toBe(true);
    const r = await openAesMessage(frames, secret);
    expect(r.text).toBe(text);
    expect(r.missing).toEqual([]);
  });

  it('um caractere trocado no QR: a parte é rejeitada e o texto não sai', async () => {
    const { out } = await send();
    const raw = out.frames[1] ?? '';
    const last = raw.at(-1) === '0' ? '1' : '0';
    const tampered = parseFrame(raw.slice(0, -1) + last) as AesFrame;
    const frames = (await send()).frames.map((f) => (f.part === 2 ? tampered : f));
    const r = await openAesMessage(frames, secret);
    expect(r.text).toBeNull();
    expect(r.parts.find((p) => p.part === 2)?.ok).toBe(false);
    expect(r.parts.filter((p) => p.ok).length).toBe(frames.length - 1);
  });

  it('destinatário trocado no cabeçalho: rejeitada (o cabeçalho é autenticado)', async () => {
    const { out } = await send();
    const forged = out.frames.map((f) => parseFrame(f.replace(':ALFA:BRAVO:', ':ALFA:CHARLIE:')) as AesFrame);
    const r = await openAesMessage(forged, secret);
    expect(r.text).toBeNull();
    expect(r.parts.every((p) => !p.ok)).toBe(true);
  });

  it('parte faltando e partes trocadas de lugar são detectadas', async () => {
    const { frames } = await send();
    const missing = await openAesMessage(frames.filter((f) => f.part !== 2), secret);
    expect(missing.missing).toEqual([2]);
    expect(missing.text).toBeNull();

    const [a, b, ...rest] = frames;
    if (a === undefined || b === undefined) throw new Error('partes ausentes');
    const swapped = [{ ...a, payload: b.payload }, { ...b, payload: a.payload }, ...rest];
    const r = await openAesMessage(swapped, secret);
    expect(r.parts.filter((p) => !p.ok).map((p) => p.part)).toEqual([1, 2]);
  });

  it('cortar a última parte e renumerar não engana: a marca de "última" está no nonce', async () => {
    const { out } = await send();
    const total = out.frames.length;
    const cut = out.frames.slice(0, total - 1).map((f) => parseFrame(f.replace(`/${total}:`, `/${total - 1}:`)) as AesFrame);
    const r = await openAesMessage(cut, secret);
    expect(r.text).toBeNull();
  });

  it('chave de outro par não abre', async () => {
    const { frames } = await send();
    const other = pairSecret(sheet, 'ALFA', 'CHARLIE');
    if (other === undefined) throw new Error('segredo ausente');
    const r = await openAesMessage(frames, other);
    expect(r.parts.every((p) => !p.ok)).toBe(true);
  });
});

describe('quadros e montagem', () => {
  it('recusa QR fora do protocolo com o motivo', () => {
    expect(() => parseFrame('https://exemplo.com')).toThrow(FrameError);
    expect(() => parseFrame('SCV1:E:ALFA:BRAVO:20:1920:001:3/2:10:ABC:DEF:ABCDE FGHIJ')).toThrow(/não existe/);
    expect(() => parseFrame('SCV1:E:ALFA:BRAVO:20:1920:001:1/1:10:ABC:DEF:abc')).toThrow(/letras/);
    expect(() => parseFrame('SCV1:Z:1')).toThrow(FrameError);
  });

  it('junta partes fora de ordem, ignora repetidas e acusa conflito', () => {
    const sheet = newSheet(11);
    const day = sheet.days[0];
    if (day === undefined) throw new Error('dia ausente');
    const letters = lettersOnly('X'.repeat(600));
    const out = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters, rng: seededRandom(12) });
    const frames = out.parts.map((p) => parseFrame(p.frame));
    const asm = new MessageAssembler();
    expect(asm.add(frames[2] as EnigmaFrame)).toBe('nova');
    expect(asm.add(frames[2] as EnigmaFrame)).toBe('repetida');
    expect(asm.current()?.missing).toEqual([1, 2]);
    asm.add(frames[0]);
    asm.add(frames[1]);
    expect(asm.current()?.complete).toBe(true);
    const f1 = frames[0] as EnigmaFrame;
    expect(asm.add({ ...f1, raw: f1.raw + 'A', body: f1.body + 'A' })).toBe('conflito');
    expect(asm.current()?.conflicts.length).toBe(1);
  });
});
