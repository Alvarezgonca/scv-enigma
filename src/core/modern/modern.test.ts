import { describe, expect, it } from 'vitest';
import {
  AuthenticationError,
  base45Decode,
  base45Encode,
  decryptWithPassword,
  deflate,
  deriveMessageKey,
  encryptWithPassword,
  EncodingError,
  fromBase64Url,
  fromHex,
  importPairSecret,
  inflate,
  openChunk,
  randomInt,
  sealChunk,
  seededRandom,
  streamNonce,
  systemRandom,
  toBase64Url,
  toHex,
  utf8,
} from '.';

const te = (s: string): Uint8Array => utf8(s);

describe('Base45 (RFC 9285)', () => {
  it('confere os exemplos da RFC', () => {
    expect(base45Encode(te('AB'))).toBe('BB8');
    expect(base45Encode(te('Hello!!'))).toBe('%69 VD92EX0');
    expect(base45Encode(te('base-45'))).toBe('UJCLQE7W581');
    expect(new TextDecoder().decode(base45Decode('QED8WEX0'))).toBe('ietf!');
  });

  it('vai e volta com bytes aleatórios de todos os tamanhos', () => {
    for (let n = 0; n < 200; n++) {
      const bytes = systemRandom.bytes(n);
      expect(base45Decode(base45Encode(bytes))).toEqual(bytes);
    }
  });

  it('recusa caractere estranho e tamanho impossível', () => {
    expect(() => base45Decode('ab')).toThrow(EncodingError);
    expect(() => base45Decode('AAAA')).toThrow(EncodingError);
    expect(() => base45Decode(':::')).toThrow(/65535/);
  });
});

describe('outras codificações', () => {
  it('hex e base64url vão e voltam', () => {
    const bytes = systemRandom.bytes(33);
    expect(fromHex(toHex(bytes))).toEqual(bytes);
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes);
    expect(() => fromHex('XYZ')).toThrow(EncodingError);
  });
});

describe('aleatoriedade sem viés', () => {
  it('randomInt(26) cobre todas as letras de forma equilibrada', () => {
    const counts = new Array<number>(26).fill(0);
    for (let i = 0; i < 52_000; i++) {
      const r = randomInt(26);
      counts[r] = (counts[r] ?? 0) + 1;
    }
    for (const c of counts) expect(c).toBeGreaterThan(1500);
  });
});

describe('AES-256-GCM em pedaços (STREAM)', () => {
  const secret = seededRandom(7).bytes(32);
  const salt = seededRandom(8).bytes(12);
  const aad = te('SCV1:A:ALFA:BRAVO:20:ID:1/2');

  async function key(info = 'SCV1 ALFA>BRAVO'): Promise<CryptoKey> {
    return deriveMessageKey(await importPairSecret(secret), salt, info);
  }

  it('cifra e decifra um pedaço', async () => {
    const k = await key();
    const ct = await sealChunk(k, 0, false, te('Olá, Maricá!'), aad);
    expect(ct.length).toBe(te('Olá, Maricá!').length + 16);
    expect(new TextDecoder().decode(await openChunk(k, 0, false, ct, aad))).toBe('Olá, Maricá!');
  });

  it('qualquer bit trocado, outra posição, outra marca de fim ou outro cabeçalho: recusa', async () => {
    const k = await key();
    const ct = await sealChunk(k, 3, true, te('ataque ao amanhecer'), aad);
    for (let bit = 0; bit < ct.length * 8; bit += 7) {
      const bad = ct.slice();
      bad[bit >> 3] = (bad[bit >> 3] ?? 0) ^ (1 << (bit & 7));
      await expect(openChunk(k, 3, true, bad, aad)).rejects.toBeInstanceOf(AuthenticationError);
    }
    await expect(openChunk(k, 2, true, ct, aad)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(openChunk(k, 3, false, ct, aad)).rejects.toBeInstanceOf(AuthenticationError);
    await expect(openChunk(k, 3, true, ct, te('SCV1:A:ALFA:CHARLIE:20:ID:1/2'))).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('chave de outro sentido (BRAVO→ALFA) não abre a mensagem de ALFA→BRAVO', async () => {
    const ct = await sealChunk(await key('SCV1 ALFA>BRAVO'), 0, true, te('x'), aad);
    await expect(openChunk(await key('SCV1 BRAVO>ALFA'), 0, true, ct, aad)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('o nonce carrega índice e marca de última parte', () => {
    expect(toHex(streamNonce(1, false))).toBe('000000000000000000000100');
    expect(toHex(streamNonce(258, true))).toBe('000000000000000000010201');
  });
});

describe('senha (PBKDF2) e compressão', () => {
  it('protege com senha e recusa senha errada', async () => {
    const data = te('folha de chaves de outubro');
    const blob = await encryptWithPassword(data, 'cavalo bateria grampo', (n) => systemRandom.bytes(n), 1000);
    expect(new TextDecoder().decode(await decryptWithPassword(blob, 'cavalo bateria grampo', 1000))).toBe('folha de chaves de outubro');
    await expect(decryptWithPassword(blob, 'senha errada', 1000)).rejects.toBeInstanceOf(AuthenticationError);
  });

  it('deflate e inflate vão e voltam', async () => {
    const data = te('AAAA'.repeat(500));
    const small = await deflate(data);
    expect(small.length).toBeLessThan(100);
    expect(await inflate(small)).toEqual(data);
  });
});
