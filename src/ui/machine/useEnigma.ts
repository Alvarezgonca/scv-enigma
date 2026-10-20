import { useCallback, useEffect, useRef, useState } from 'react';
import { type EnigmaSettings, type KeyTrace, EnigmaMachine, toLetter, withPositions } from '../../core/enigma';
import { sound } from '../sound';

export interface Tape {
  readonly input: string;
  readonly output: string;
}

export interface EnigmaController {
  readonly settings: EnigmaSettings;
  readonly lit: number | null;
  readonly pressed: number | null;
  readonly trace: KeyTrace | null;
  readonly tape: Tape;
  /** Para cada rotor (esq., meio, dir.), quantas vezes já andou: muda a chave de animação da janela. */
  readonly ticks: readonly [number, number, number];
  readonly setSettings: (next: EnigmaSettings) => void;
  readonly keyDown: (letter: number) => KeyTrace;
  readonly keyUp: () => void;
  readonly clearTape: () => void;
  /** Digita uma sequência sozinha (procedimento de envio e de recebimento), com lâmpadas e som. */
  readonly autoType: (letters: string, opts?: { delayMs?: number; signal?: AbortSignal }) => Promise<string>;
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException('cancelado', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('cancelado', 'AbortError'));
      },
      { once: true },
    );
  });

export function useEnigma(initial: EnigmaSettings): EnigmaController {
  const [settings, setSettingsState] = useState(initial);
  const ref = useRef(initial);
  const [lit, setLit] = useState<number | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const [trace, setTrace] = useState<KeyTrace | null>(null);
  const [tape, setTape] = useState<Tape>({ input: '', output: '' });
  const [ticks, setTicks] = useState<[number, number, number]>([0, 0, 0]);

  const setSettings = useCallback((next: EnigmaSettings) => {
    ref.current = next;
    setSettingsState(next);
  }, []);

  const keyDown = useCallback(
    (letter: number): KeyTrace => {
      const machine = new EnigmaMachine(ref.current);
      const t = machine.press(letter);
      const next = withPositions(ref.current, machine.positions);
      setSettings(next);
      setTrace(t);
      setLit(t.output);
      setPressed(letter);
      setTicks(([l, m, r]) => [l + (t.stepped[0] ? 1 : 0), m + (t.stepped[1] ? 1 : 0), r + 1]);
      setTape((p) => ({ input: p.input + toLetter(letter), output: p.output + toLetter(t.output) }));
      sound.keyDown();
      sound.steps(t.stepped.filter(Boolean).length);
      return t;
    },
    [setSettings],
  );

  const keyUp = useCallback(() => {
    setLit(null);
    setPressed(null);
    sound.keyUp();
  }, []);

  const clearTape = useCallback(() => {
    setTape({ input: '', output: '' });
    setTrace(null);
  }, []);

  const autoType = useCallback(
    async (letters: string, opts: { delayMs?: number; signal?: AbortSignal } = {}): Promise<string> => {
      const delay = opts.delayMs ?? 140;
      let out = '';
      for (const ch of letters) {
        const t = keyDown(ch.charCodeAt(0) - 65);
        out += toLetter(t.output);
        await sleep(Math.max(30, delay * 0.65), opts.signal);
        setLit(null);
        setPressed(null);
        await sleep(Math.max(10, delay * 0.35), opts.signal);
      }
      return out;
    },
    [keyDown],
  );

  useEffect(() => {
    ref.current = settings;
  }, [settings]);

  return { settings, lit, pressed, trace, tape, ticks, setSettings, keyDown, keyUp, clearTape, autoType };
}
