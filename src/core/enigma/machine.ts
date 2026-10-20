import { lettersOnly, mod26, SIZE, toIndex, toLetter } from './alphabet';
import { type EnigmaSettings, assertValid } from './settings';
import { GREEK_WHEELS, REFLECTORS, ROTORS } from './wiring';

/** Etapas por onde a corrente passa, na ordem física (usadas na animação do caminho elétrico). */
export type Stage =
  | 'teclado'
  | 'plugboard'
  | 'rotorDireito'
  | 'rotorMeio'
  | 'rotorEsquerdo'
  | 'grego'
  | 'refletor'
  | 'gregoVolta'
  | 'rotorEsquerdoVolta'
  | 'rotorMeioVolta'
  | 'rotorDireitoVolta'
  | 'lampada';

export interface PathPoint {
  readonly stage: Stage;
  /** Contato (0 = A … 25 = Z) em que a corrente SAI desta etapa. */
  readonly contact: number;
}

export interface KeyTrace {
  readonly input: number;
  readonly output: number;
  /** Quais rotores andaram nesta tecla: [esquerdo, meio, direito]. */
  readonly stepped: readonly [boolean, boolean, boolean];
  /** True quando o rotor do meio andou por estar no próprio entalhe (o "passo duplo"). */
  readonly doubleStep: boolean;
  /** Letras nas janelas depois do passo, que são as usadas para cifrar esta tecla. */
  readonly positions: readonly [number, number, number];
  readonly path: readonly PathPoint[];
}

function wiringTables(wiring: string): { forward: Uint8Array; backward: Uint8Array } {
  const forward = new Uint8Array(SIZE);
  const backward = new Uint8Array(SIZE);
  for (let i = 0; i < SIZE; i++) {
    const out = toIndex(wiring[i] ?? '');
    forward[i] = out;
    backward[out] = i;
  }
  return { forward, backward };
}

/**
 * Um rotor montado. A corrente entra pelo contato c; o deslocamento (posição − anel) gira a
 * fiação interna em relação à carcaça. É por isso que o anel e a posição se compensam.
 */
class MountedWheel {
  private readonly forwardTable: Uint8Array;
  private readonly backwardTable: Uint8Array;
  private readonly notches: readonly number[];

  constructor(
    wiring: string,
    notches: string,
    public ring: number,
    public position: number,
  ) {
    const t = wiringTables(wiring);
    this.forwardTable = t.forward;
    this.backwardTable = t.backward;
    this.notches = [...notches].map(toIndex);
  }

  get atNotch(): boolean {
    return this.notches.includes(this.position);
  }

  advance(): void {
    this.position = mod26(this.position + 1);
  }

  forward(c: number): number {
    const shift = this.position - this.ring;
    return mod26((this.forwardTable[mod26(c + shift)] ?? 0) - shift);
  }

  backward(c: number): number {
    const shift = this.position - this.ring;
    return mod26((this.backwardTable[mod26(c + shift)] ?? 0) - shift);
  }
}

/**
 * Simulação fiel da Enigma I, M3 e M4.
 *
 * A cada tecla, ANTES de a corrente passar:
 * 1. o rotor da direita sempre anda uma posição;
 * 2. se o da direita estava no entalhe, o do meio anda;
 * 3. se o do meio estava no próprio entalhe, ele anda de novo junto com o da esquerda
 *    (o "passo duplo", anomalia mecânica descrita por Hamer, 1997).
 * Depois a corrente atravessa: plugboard → rotores (direita → esquerda) → refletor →
 * rotores de volta (esquerda → direita) → plugboard → lâmpada.
 */
export class EnigmaMachine {
  readonly settings: EnigmaSettings;
  private readonly left: MountedWheel;
  private readonly middle: MountedWheel;
  private readonly right: MountedWheel;
  private readonly greek: MountedWheel | null;
  private readonly reflector: Uint8Array;
  private readonly plug: Uint8Array;

  constructor(settings: EnigmaSettings) {
    assertValid(settings);
    this.settings = settings;
    const [l, m, r] = settings.rotors;
    this.left = new MountedWheel(ROTORS[l.name].wiring, ROTORS[l.name].notches, l.ring, l.position);
    this.middle = new MountedWheel(ROTORS[m.name].wiring, ROTORS[m.name].notches, m.ring, m.position);
    this.right = new MountedWheel(ROTORS[r.name].wiring, ROTORS[r.name].notches, r.ring, r.position);
    this.greek =
      settings.greek === null
        ? null
        : new MountedWheel(GREEK_WHEELS[settings.greek.name], '', settings.greek.ring, settings.greek.position);
    this.reflector = wiringTables(REFLECTORS[settings.reflector]).forward;
    this.plug = new Uint8Array(SIZE);
    for (let i = 0; i < SIZE; i++) this.plug[i] = i;
    for (const [a, b] of settings.plugboard) {
      this.plug[a] = b;
      this.plug[b] = a;
    }
  }

  /** Letras nas três janelas (esquerda, meio, direita). */
  get positions(): [number, number, number] {
    return [this.left.position, this.middle.position, this.right.position];
  }

  get windowLetters(): string {
    const greek = this.greek === null ? '' : toLetter(this.greek.position);
    return greek + this.positions.map(toLetter).join('');
  }

  setPositions(positions: readonly number[]): void {
    this.left.position = mod26(positions[0] ?? 0);
    this.middle.position = mod26(positions[1] ?? 0);
    this.right.position = mod26(positions[2] ?? 0);
  }

  /** Mecanismo de avanço (catracas e linguetas). */
  step(): { stepped: [boolean, boolean, boolean]; doubleStep: boolean } {
    const middleAtNotch = this.middle.atNotch;
    const rightAtNotch = this.right.atNotch;
    const moveLeft = middleAtNotch;
    const moveMiddle = middleAtNotch || rightAtNotch;
    if (moveLeft) this.left.advance();
    if (moveMiddle) this.middle.advance();
    this.right.advance();
    return { stepped: [moveLeft, moveMiddle, true], doubleStep: middleAtNotch };
  }

  /** Aperta uma tecla: anda os rotores, passa a corrente e devolve o caminho completo. */
  press(input: number): KeyTrace {
    const { stepped, doubleStep } = this.step();
    const path: PathPoint[] = [{ stage: 'teclado', contact: input }];
    let c = this.plug[input] ?? input;
    path.push({ stage: 'plugboard', contact: c });
    c = this.right.forward(c);
    path.push({ stage: 'rotorDireito', contact: c });
    c = this.middle.forward(c);
    path.push({ stage: 'rotorMeio', contact: c });
    c = this.left.forward(c);
    path.push({ stage: 'rotorEsquerdo', contact: c });
    if (this.greek !== null) {
      c = this.greek.forward(c);
      path.push({ stage: 'grego', contact: c });
    }
    c = this.reflector[c] ?? c;
    path.push({ stage: 'refletor', contact: c });
    if (this.greek !== null) {
      c = this.greek.backward(c);
      path.push({ stage: 'gregoVolta', contact: c });
    }
    c = this.left.backward(c);
    path.push({ stage: 'rotorEsquerdoVolta', contact: c });
    c = this.middle.backward(c);
    path.push({ stage: 'rotorMeioVolta', contact: c });
    c = this.right.backward(c);
    path.push({ stage: 'rotorDireitoVolta', contact: c });
    c = this.plug[c] ?? c;
    path.push({ stage: 'lampada', contact: c });
    return { input, output: c, stepped, doubleStep, positions: this.positions, path };
  }

  pressLetter(letter: string): KeyTrace {
    return this.press(toIndex(letter));
  }

  /** Cifra (ou decifra: a Enigma é recíproca) um texto, ignorando o que não for letra. */
  encrypt(text: string): string {
    let out = '';
    for (const ch of lettersOnly(text)) out += toLetter(this.press(toIndex(ch)).output);
    return out;
  }
}

/** Atalho: cifra um texto a partir de uma configuração, sem guardar estado. */
export function encryptText(settings: EnigmaSettings, text: string): string {
  return new EnigmaMachine(settings).encrypt(text);
}

/** Para onde cada contato vai dentro de um rotor nesta posição (usado no desenho da fiação). */
export function wheelForwardMap(wiring: string, ring: number, position: number): number[] {
  const { forward } = wiringTables(wiring);
  const shift = position - ring;
  return Array.from({ length: SIZE }, (_, c) => mod26((forward[mod26(c + shift)] ?? 0) - shift));
}

export function reflectorMap(wiring: string): number[] {
  return [...wiringTables(wiring).forward];
}
