import { concatBytes, utf8 } from './encoding';

/**
 * Criptografia moderna com a Web Crypto API do próprio navegador (nada de criptografia feita à mão).
 *
 * - AES-256-GCM (NIST FIPS 197 e SP 800-38D): cifra autenticada. Além de esconder o texto, gera uma
 *   etiqueta (tag) de 128 bits; qualquer bit alterado no texto cifrado ou no cabeçalho faz a
 *   decifração falhar. A Enigma não tem nada parecido.
 * - HKDF-SHA-256 (RFC 5869): de um segredo do par de estações tira uma chave nova por mensagem.
 * - STREAM (Hoang, Reyhanitabar, Rogaway e Vizár, CRYPTO 2015): cada QR é um pedaço cifrado
 *   separadamente, com o número da parte e a marca de "última" dentro do nonce. Assim o receptor
 *   detecta parte adulterada, parte trocada de lugar, parte repetida e mensagem cortada no fim.
 */

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

function subtle(): SubtleCrypto {
  const s = globalThis.crypto.subtle as SubtleCrypto | undefined;
  if (s === undefined) {
    throw new Error('Web Crypto indisponível: abra o app por HTTPS (ou localhost) para usar o modo moderno');
  }
  return s;
}

/** Cópia com ArrayBuffer próprio, que é o tipo que a Web Crypto aceita. */
function buf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes);
}

export const PAIR_SECRET_BYTES = 32;
export const MESSAGE_SALT_BYTES = 12;
export const TAG_BYTES = 16;

/** Importa o segredo de 256 bits de um par de estações como material HKDF que não pode ser exportado. */
export async function importPairSecret(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== PAIR_SECRET_BYTES) throw new RangeError('o segredo do par tem de ter 32 bytes');
  return subtle().importKey('raw', buf(raw), 'HKDF', false, ['deriveKey']);
}

/**
 * Chave AES-256-GCM desta mensagem. O `info` inclui remetente → destinatário: a chave de ALFA→BRAVO
 * é diferente da de BRAVO→ALFA, então uma mensagem não pode ser devolvida ao remetente como se fosse
 * resposta (ataque de reflexão).
 */
export async function deriveMessageKey(pairSecret: CryptoKey, salt: Uint8Array, info: string): Promise<CryptoKey> {
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(utf8(info)) },
    pairSecret,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Nonce de 96 bits da construção STREAM: 7 bytes zero ‖ número da parte (32 bits) ‖ 1 se for a última. */
export function streamNonce(index: number, last: boolean): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index > 0xffffffff) throw new RangeError('índice de parte inválido');
  const nonce = new Uint8Array(12);
  new DataView(nonce.buffer).setUint32(7, index, false);
  nonce[11] = last ? 1 : 0;
  return nonce;
}

export async function sealChunk(
  key: CryptoKey,
  index: number,
  last: boolean,
  plaintext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  const ct = await subtle().encrypt(
    { name: 'AES-GCM', iv: buf(streamNonce(index, last)), additionalData: buf(aad), tagLength: 128 },
    key,
    buf(plaintext),
  );
  return new Uint8Array(ct);
}

export async function openChunk(
  key: CryptoKey,
  index: number,
  last: boolean,
  ciphertext: Uint8Array,
  aad: Uint8Array,
): Promise<Uint8Array> {
  try {
    const pt = await subtle().decrypt(
      { name: 'AES-GCM', iv: buf(streamNonce(index, last)), additionalData: buf(aad), tagLength: 128 },
      key,
      buf(ciphertext),
    );
    return new Uint8Array(pt);
  } catch {
    throw new AuthenticationError('a etiqueta GCM não confere: parte adulterada, fora de ordem ou chave errada');
  }
}

/** Divide bytes em pedaços de até `size`; sempre devolve ao menos um pedaço (mensagem vazia vira 1 parte). */
export function chunkBytes(bytes: Uint8Array, size: number): Uint8Array[] {
  if (size <= 0) throw new RangeError('tamanho de pedaço inválido');
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out.length > 0 ? out : [new Uint8Array(0)];
}

export { concatBytes };

/* ---------- senha → chave (proteção da folha de chaves em trânsito e em repouso) ---------- */

/** Iterações de PBKDF2-HMAC-SHA-256 recomendadas pela OWASP (Password Storage Cheat Sheet, 2023). */
export const PBKDF2_ITERATIONS = 600_000;

export async function keyFromPassword(password: string, salt: Uint8Array, iterations = PBKDF2_ITERATIONS): Promise<CryptoKey> {
  const material = await subtle().importKey('raw', buf(utf8(password.normalize('NFC'))), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: buf(salt), iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra com senha: sal(16) ‖ iv(12) ‖ AES-GCM(dados). O iv é aleatório porque a chave se repete. */
export async function encryptWithPassword(
  data: Uint8Array,
  password: string,
  random: (n: number) => Uint8Array,
  iterations = PBKDF2_ITERATIONS,
  aad: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  const salt = random(16);
  const iv = random(12);
  const key = await keyFromPassword(password, salt, iterations);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(aad) }, key, buf(data)));
  return concatBytes(salt, iv, ct);
}

export async function decryptWithPassword(
  blob: Uint8Array,
  password: string,
  iterations = PBKDF2_ITERATIONS,
  aad: Uint8Array = new Uint8Array(0),
): Promise<Uint8Array> {
  if (blob.length < 16 + 12 + TAG_BYTES) throw new AuthenticationError('dados protegidos incompletos');
  const key = await keyFromPassword(password, blob.slice(0, 16), iterations);
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: buf(blob.slice(16, 28)), additionalData: buf(aad) }, key, buf(blob.slice(28)));
    return new Uint8Array(pt);
  } catch {
    throw new AuthenticationError('senha errada ou dados adulterados');
  }
}

/** Resumo SHA-256 curto para conferir à vista, nos dois aparelhos, que a folha é a mesma. */
export async function fingerprint(data: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await subtle().digest('SHA-256', buf(data)));
  const hex = [...digest.slice(0, 6)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

/* ---------- compressão (a folha de chaves cabe em menos QR) ---------- */

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const response = new Response(new Blob([buf(bytes)]).stream().pipeThrough(stream));
  return new Uint8Array(await response.arrayBuffer());
}

export function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return pipe(bytes, new CompressionStream('deflate-raw'));
}

/** Teto de descompressão: uma folha real tem poucos KB; isto barra "bomba de compressão". */
export const MAX_INFLATED_BYTES = 64 * 1024;

export class InflateLimitError extends Error {
  constructor() {
    super(`conteúdo descomprimido passa de ${MAX_INFLATED_BYTES / 1024} KB`);
    this.name = 'InflateLimitError';
  }
}

/** Descomprime lendo aos poucos e para assim que passar do teto. */
export async function inflate(bytes: Uint8Array, maxBytes = MAX_INFLATED_BYTES): Promise<Uint8Array> {
  const reader = new Blob([buf(bytes)]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new InflateLimitError();
    }
    chunks.push(value);
  }
  return concatBytes(...chunks);
}
