import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { KeySheet } from '../core/protocol';
import { sound } from './sound';
import { type Prefs, loadPrefs, loadSheet, savePrefs, saveSheet } from './storage';

/** Última mensagem enviada ou recebida, compartilhada entre as telas (comparativo e Bletchley). */
export interface MessageRecord {
  readonly direction: 'enviada' | 'recebida';
  readonly from: string;
  readonly to: string;
  readonly day: number;
  readonly text: string;
  /** Texto preparado para a Enigma (só letras). */
  readonly letters: string;
  readonly enigmaFrames: readonly string[];
  readonly aesFrames: readonly string[];
  /** Texto cifrado pela Enigma, sem os grupos de identificação. */
  readonly enigmaCipher: string;
  readonly aesBytes: readonly Uint8Array[];
}

interface AppState {
  readonly ready: boolean;
  readonly sheet: KeySheet | null;
  readonly station: string | null;
  readonly prefs: Prefs;
  readonly lastMessage: MessageRecord | null;
  /** Texto cifrado Enigma interceptado para o modo Bletchley Park. */
  readonly intercepted: string | null;
  readonly setSheet: (sheet: KeySheet | null, station?: string | null) => Promise<void>;
  readonly setStation: (station: string | null) => void;
  readonly setPrefs: (patch: Partial<Prefs>) => void;
  readonly setLastMessage: (m: MessageRecord) => void;
  readonly setIntercepted: (cipher: string | null) => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [sheet, setSheetState] = useState<KeySheet | null>(null);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [lastMessage, setLastMessage] = useState<MessageRecord | null>(null);
  const [intercepted, setIntercepted] = useState<string | null>(null);

  useEffect(() => {
    void loadSheet().then((s) => {
      setSheetState(s);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    sound.setEnabled(prefs.sound);
  }, [prefs.sound]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((p) => {
      const next = { ...p, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const setSheet = useCallback(
    async (next: KeySheet | null, station?: string | null) => {
      // Estação e folha mudam juntas: nenhuma tela chega a ver a folha nova sem a estação.
      if (station !== undefined) setPrefs({ station });
      else if (next?.holder !== null && next?.holder !== undefined) setPrefs({ station: next.holder });
      else if (next === null) setPrefs({ station: null });
      setSheetState(next);
      await saveSheet(next);
    },
    [setPrefs],
  );

  const setStation = useCallback((station: string | null) => setPrefs({ station }), [setPrefs]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      sheet,
      station: prefs.station !== null && sheet?.stations.includes(prefs.station) === true ? prefs.station : null,
      prefs,
      lastMessage,
      intercepted,
      setSheet,
      setStation,
      setPrefs,
      setLastMessage,
      setIntercepted,
    }),
    [ready, sheet, prefs, lastMessage, intercepted, setSheet, setStation, setPrefs],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (v === null) throw new Error('useApp fora do AppProvider');
  return v;
}
