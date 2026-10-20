import { type KeySheet, parseSheet, serializeSheet } from '../core/protocol';

/**
 * Armazenamento local. Nada sai do aparelho: não há servidor, conta nem rastreamento (LGPD).
 *
 * A folha de chaves fica cifrada em repouso no IndexedDB com AES-256-GCM. A chave dessa cifra é
 * uma CryptoKey NÃO exportável gerada pelo próprio navegador: o código da página consegue usá-la,
 * mas nem ele consegue ler os bytes dela. Preferências simples (som, estação) ficam no localStorage.
 */

const DB = 'scv-enigma';
const STORE = 'kv';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB indisponível'));
  });
}

async function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error ?? new Error('falha no IndexedDB'));
    tx.oncomplete = () => db.close();
  });
}

async function storageKey(): Promise<CryptoKey> {
  const existing = await idb<CryptoKey | undefined>('readonly', (s) => s.get('chave-repouso'));
  if (existing !== undefined) return existing;
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  await idb('readwrite', (s) => s.put(key, 'chave-repouso'));
  return key;
}

interface SealedRecord {
  readonly iv: Uint8Array;
  readonly data: ArrayBuffer;
}

export async function saveSheet(sheet: KeySheet | null): Promise<void> {
  if (sheet === null) {
    await idb('readwrite', (s) => s.delete('folha'));
    return;
  }
  const key = await storageKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(serializeSheet(sheet)));
  const record: SealedRecord = { iv, data };
  await idb('readwrite', (s) => s.put(record, 'folha'));
}

export async function loadSheet(): Promise<KeySheet | null> {
  try {
    const record = await idb<SealedRecord | undefined>('readonly', (s) => s.get('folha'));
    if (record === undefined) return null;
    const key = await storageKey();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(record.iv) }, key, record.data);
    return parseSheet(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

export interface Prefs {
  readonly sound: boolean;
  readonly ambience: boolean;
  readonly station: string | null;
  readonly introSeen: boolean;
}

const PREFS_KEY = 'scv-enigma:prefs';
const DEFAULT_PREFS: Prefs = { sound: true, ambience: false, station: null, introSeen: false };

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return DEFAULT_PREFS;
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      sound: typeof p.sound === 'boolean' ? p.sound : DEFAULT_PREFS.sound,
      ambience: typeof p.ambience === 'boolean' ? p.ambience : DEFAULT_PREFS.ambience,
      station: typeof p.station === 'string' && /^[A-Z]{2,10}$/.test(p.station) ? p.station : null,
      introSeen: p.introSeen === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function savePrefs(p: Prefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* modo privado ou armazenamento bloqueado: segue sem lembrar */
  }
}
