import { type Frame, messageKey } from './frames';

/**
 * Junta as partes que chegam pela câmera, em qualquer ordem e com repetições (a câmera lê o
 * mesmo QR várias vezes por segundo). Guarda só o que é necessário para remontar a mensagem.
 */

export interface Assembly {
  readonly key: string;
  readonly kind: Frame['kind'];
  readonly total: number;
  readonly frames: ReadonlyMap<number, Frame>;
  readonly conflicts: readonly string[];
}

export interface AssemblyView extends Assembly {
  readonly received: readonly number[];
  readonly missing: readonly number[];
  readonly complete: boolean;
}

export type AddResult = 'nova' | 'repetida' | 'conflito';

export class MessageAssembler {
  private readonly assemblies = new Map<string, { kind: Frame['kind']; total: number; frames: Map<number, Frame>; conflicts: string[] }>();
  private lastKey: string | null = null;

  add(frame: Frame): AddResult {
    const key = messageKey(frame);
    let a = this.assemblies.get(key);
    if (a === undefined) {
      a = { kind: frame.kind, total: frame.total, frames: new Map(), conflicts: [] };
      this.assemblies.set(key, a);
    }
    this.lastKey = key;
    if (frame.total !== a.total) {
      a.conflicts.push(`a parte ${frame.part} diz que são ${frame.total} partes, mas as anteriores dizem ${a.total}`);
      return 'conflito';
    }
    const previous = a.frames.get(frame.part);
    if (previous !== undefined) {
      if (previous.raw === frame.raw) return 'repetida';
      a.conflicts.push(`a parte ${frame.part} chegou duas vezes com conteúdos diferentes (possível adulteração)`);
      return 'conflito';
    }
    a.frames.set(frame.part, frame);
    return 'nova';
  }

  view(key: string): AssemblyView | null {
    const a = this.assemblies.get(key);
    if (a === undefined) return null;
    const received = [...a.frames.keys()].sort((x, y) => x - y);
    const missing: number[] = [];
    for (let p = 1; p <= a.total; p++) if (!a.frames.has(p)) missing.push(p);
    return {
      key,
      kind: a.kind,
      total: a.total,
      frames: a.frames,
      conflicts: a.conflicts,
      received,
      missing,
      complete: missing.length === 0,
    };
  }

  /** A mensagem cujo QR foi lido por último (a que a tela deve mostrar). */
  current(): AssemblyView | null {
    return this.lastKey === null ? null : this.view(this.lastKey);
  }

  /** Frames da mensagem em ordem de parte. */
  ordered(key: string): Frame[] {
    const a = this.assemblies.get(key);
    if (a === undefined) return [];
    return [...a.frames.entries()].sort(([x], [y]) => x - y).map(([, f]) => f);
  }

  forget(key: string): void {
    this.assemblies.delete(key);
    if (this.lastKey === key) this.lastKey = null;
  }

  clear(): void {
    this.assemblies.clear();
    this.lastKey = null;
  }
}
