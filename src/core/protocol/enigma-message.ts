import { EnigmaMachine, groupsOf5, lettersToIndices, toIndex } from '../enigma';
import { type RandomSource, randomInt, randomLetters, systemRandom } from '../modern';
import { type EnigmaFrame, FrameError, PROTOCOL } from './frames';
import { type DayKey, type KeySheet, findDay, settingsForDay } from './keysheet';

/**
 * Procedimento de indicador do Exército e da Força Aérea a partir de maio de 1940, que a
 * interface mostra passo a passo:
 * 1. a máquina recebe a chave do dia (rotores, anéis, plugboard) da folha;
 * 2. o operador escolhe ao acaso uma posição básica (Grundstellung), ex.: WXC;
 * 3. escolhe ao acaso a chave da mensagem, ex.: BLA, e a cifra na posição WXC → KCH;
 * 4. gira os rotores para BLA e cifra o texto;
 * 5. transmite WXC KCH em claro no cabeçalho, e o grupo de identificação (2 letras ao acaso +
 *    uma das 4 Kenngruppen do dia) como primeiro grupo de cinco.
 * Mensagens com mais de 250 letras eram divididas em partes, cada uma com seu próprio indicador.
 * Aqui cada parte vira um QR Code.
 */

export const MAX_LETTERS_PER_PART = 250;

export interface EnigmaPart {
  readonly frame: string;
  readonly grundstellung: string;
  readonly messageKey: string;
  readonly encryptedKey: string;
  readonly kenngruppe: string;
  readonly plaintext: string;
  readonly ciphertext: string;
}

export interface EnigmaOutgoing {
  readonly nr: string;
  readonly parts: readonly EnigmaPart[];
}

export interface EnigmaSendOptions {
  readonly from: string;
  readonly to: string;
  readonly day: DayKey;
  /** Texto já preparado (só letras A–Z). */
  readonly letters: string;
  readonly time?: string;
  readonly rng?: RandomSource;
  readonly maxPerPart?: number;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

export function encryptEnigmaMessage(opts: EnigmaSendOptions): EnigmaOutgoing {
  const rng = opts.rng ?? systemRandom;
  const max = opts.maxPerPart ?? MAX_LETTERS_PER_PART;
  if (!/^[A-Z]+$/.test(opts.letters)) throw new FrameError('a mensagem preparada precisa ter ao menos uma letra');
  const chunks: string[] = [];
  for (let i = 0; i < opts.letters.length; i += max) chunks.push(opts.letters.slice(i, i + max));
  const time = opts.time ?? hhmm(new Date());
  const nr = String(randomInt(250, rng) * 4 + randomInt(4, rng)).padStart(3, '0');

  const parts = chunks.map((chunk, i): EnigmaPart => {
    const grundstellung = randomLetters(3, rng);
    const messageKey = randomLetters(3, rng);
    const encryptedKey = new EnigmaMachine(settingsForDay(opts.day, lettersToIndices(grundstellung))).encrypt(messageKey);
    const ciphertext = new EnigmaMachine(settingsForDay(opts.day, lettersToIndices(messageKey))).encrypt(chunk);
    const kenngruppe = opts.day.kenngruppen[randomInt(opts.day.kenngruppen.length, rng)] ?? 'AAA';
    const idGroup = randomLetters(2, rng) + kenngruppe;
    const body = idGroup + ciphertext;
    const frame = [
      PROTOCOL,
      'E',
      opts.from,
      opts.to,
      String(opts.day.day),
      time,
      nr,
      `${i + 1}/${chunks.length}`,
      String(body.length),
      grundstellung,
      encryptedKey,
      groupsOf5(body),
    ].join(':');
    return { frame, grundstellung, messageKey, encryptedKey, kenngruppe, plaintext: chunk, ciphertext };
  });
  return { nr, parts };
}

export interface EnigmaPartResult {
  readonly part: number;
  readonly messageKey: string;
  readonly kenngruppe: string;
  readonly plaintext: string;
  /** Avisos do que a Enigma consegue perceber: só contagem de letras e Kenngruppe. */
  readonly warnings: readonly string[];
}

/**
 * Decifra uma parte com a folha. Não há como detectar adulteração: uma letra trocada no caminho
 * vira outra letra no texto claro, sem alarme. Só a contagem de letras do cabeçalho denuncia
 * mensagem cortada, e só a Kenngruppe denuncia chave do dia errada.
 */
export function decryptEnigmaPart(frame: EnigmaFrame, sheet: KeySheet, dayOverride?: DayKey): EnigmaPartResult {
  const day = dayOverride ?? findDay(sheet, frame.day);
  if (day === undefined) throw new FrameError(`a folha ${sheet.net} não tem chave para o dia ${frame.day}`);
  const warnings: string[] = [];
  const kenngruppe = frame.body.slice(2, 5);
  if (!day.kenngruppen.includes(kenngruppe)) {
    warnings.push(`Kenngruppe ${kenngruppe} não é da chave do dia ${day.day}: a folha ou o dia podem estar errados`);
  }
  if (frame.body.length !== frame.letters) {
    warnings.push(`o cabeçalho anuncia ${frame.letters} letras e chegaram ${frame.body.length}`);
  }
  const messageKey = new EnigmaMachine(settingsForDay(day, lettersToIndices(frame.grundstellung))).encrypt(frame.encryptedKey);
  const cipher = frame.body.slice(5);
  const plaintext = new EnigmaMachine(settingsForDay(day, [...messageKey].map(toIndex))).encrypt(cipher);
  return { part: frame.part, messageKey, kenngruppe, plaintext, warnings };
}
