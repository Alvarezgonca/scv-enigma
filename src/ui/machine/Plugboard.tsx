import { useMemo, useRef, useState } from 'react';
import { type Pair, MAX_PLUG_PAIRS, QWERTZ_ROWS, toIndex, toLetter } from '../../core/enigma';
import { sound } from '../sound';

/**
 * Plugboard (Steckerbrett) com cabos arrastáveis. Arraste de uma tomada até outra para ligar;
 * arraste a ponta de um cabo para fora para desligar. No celular também funciona tocando numa
 * tomada e depois na outra.
 */

const W = 900;
const ROW_Y = [62, 168, 274];
const STEP = 98;
const H = 336;

interface SocketPos {
  readonly letter: number;
  readonly x: number;
  readonly y: number;
}

function layout(): SocketPos[] {
  const out: SocketPos[] = [];
  QWERTZ_ROWS.forEach((row, r) => {
    const width = (row.length - 1) * STEP;
    const x0 = (W - width) / 2;
    [...row].forEach((ch, i) => out.push({ letter: toIndex(ch), x: x0 + i * STEP, y: ROW_Y[r] ?? 0 }));
  });
  return out;
}

const CABLE_COLORS = ['#2d2d2d', '#3b2a1c', '#262f2a', '#30263a', '#3a3a3a', '#2a2f3b', '#3a2626'];

function cablePath(a: SocketPos, b: { x: number; y: number }): string {
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = 26 + dist * 0.22;
  return `M ${a.x} ${a.y + 8} C ${a.x} ${a.y + 8 + sag}, ${b.x} ${b.y + 8 + sag}, ${b.x} ${b.y + 8}`;
}

interface Props {
  readonly pairs: readonly Pair[];
  readonly onChange?: (pairs: Pair[]) => void;
  /** Letras do último caminho (entrada e saída) para destacar os cabos usados. */
  readonly highlight?: readonly number[];
  readonly readOnly?: boolean;
}

export function Plugboard({ pairs, onChange, highlight = [], readOnly = false }: Props) {
  const sockets = useMemo(() => layout(), []);
  const byLetter = useMemo(() => new Map(sockets.map((s) => [s.letter, s])), [sockets]);
  const partner = useMemo(() => {
    const m = new Map<number, number>();
    for (const [a, b] of pairs) {
      m.set(a, b);
      m.set(b, a);
    }
    return m;
  }, [pairs]);
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; moved: boolean; origin: number } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const toSvg = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (svg === null || ctm === null || ctm === undefined) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const socketAt = (x: number, y: number): number | null => {
    let best: number | null = null;
    let bestD = 48;
    for (const s of sockets) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bestD) {
        bestD = d;
        best = s.letter;
      }
    }
    return best;
  };

  const emit = (next: Pair[]): void => {
    onChange?.(next);
  };

  const without = (letter: number): Pair[] => pairs.filter(([a, b]) => a !== letter && b !== letter);

  const onPointerDown = (e: React.PointerEvent<SVGGElement>, letter: number): void => {
    if (readOnly) return;
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSvg(e.clientX, e.clientY);
    const other = partner.get(letter);
    if (other !== undefined) {
      // Pegou a ponta de um cabo ligado: solta desta tomada e continua presa na outra.
      emit(without(letter));
      sound.plug();
      setDrag({ from: other, x: p.x, y: p.y, moved: true, origin: letter });
      setSelected(null);
      return;
    }
    setDrag({ from: letter, x: p.x, y: p.y, moved: false, origin: letter });
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    if (drag === null) return;
    const p = toSvg(e.clientX, e.clientY);
    const moved = drag.moved || Math.hypot(p.x - drag.x, p.y - drag.y) > 12;
    setDrag({ ...drag, x: p.x, y: p.y, moved });
  };

  const onPointerUp = (e: React.PointerEvent): void => {
    if (drag === null) return;
    const p = toSvg(e.clientX, e.clientY);
    const target = socketAt(p.x, p.y);
    const current = drag;
    setDrag(null);
    if (!current.moved && target === current.origin) {
      // Toque simples: modo "toque numa tomada e depois na outra".
      if (selected === null || selected === target) {
        setSelected(selected === target ? null : target);
        return;
      }
      if (!partner.has(target) && !partner.has(selected) && pairs.length < MAX_PLUG_PAIRS) {
        emit([...pairs, [selected, target]]);
        sound.plug();
      }
      setSelected(null);
      return;
    }
    if (target !== null && target !== current.from && !partner.has(target) && pairs.length < MAX_PLUG_PAIRS) {
      emit([...without(current.from), [current.from, target]]);
      sound.plug();
    }
  };

  const active = new Set(highlight);

  return (
    <svg
      ref={svgRef}
      className="plugboard-svg"
      viewBox={`0 0 ${W} ${H}`}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => setDrag(null)}
      role="group"
      aria-label={`Plugboard com ${pairs.length} cabos: ${pairs.map(([a, b]) => toLetter(a) + toLetter(b)).join(' ') || 'nenhum'}`}
    >
      <defs>
        <radialGradient id="socketGrad" cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#5b5b60" />
          <stop offset="100%" stopColor="#202023" />
        </radialGradient>
        <linearGradient id="plugGrad" x1="0" x2="1">
          <stop offset="0" stopColor="#3a3a3c" />
          <stop offset="0.45" stopColor="#9a9aa0" />
          <stop offset="0.55" stopColor="#b9b9bf" />
          <stop offset="1" stopColor="#3a3a3c" />
        </linearGradient>
        <pattern id="plugGrip" width="6" height="42" patternUnits="userSpaceOnUse">
          <rect width="6" height="42" fill="transparent" />
          <rect x="0" width="2" height="42" fill="rgb(0 0 0 / 22%)" />
        </pattern>
      </defs>
      {sockets.map((s) => (
        <g
          key={s.letter}
          onPointerDown={(e) => onPointerDown(e, s.letter)}
          role="button"
          aria-label={`Tomada ${toLetter(s.letter)}${partner.has(s.letter) ? `, ligada a ${toLetter(partner.get(s.letter) ?? 0)}` : ''}`}
          tabIndex={readOnly ? -1 : 0}
          onKeyDown={(e) => {
            if (readOnly || (e.key !== 'Enter' && e.key !== ' ')) return;
            e.preventDefault();
            if (partner.has(s.letter)) {
              emit(without(s.letter));
            } else if (selected === null) {
              setSelected(s.letter);
            } else if (selected !== s.letter && !partner.has(selected) && pairs.length < MAX_PLUG_PAIRS) {
              emit([...pairs, [selected, s.letter]]);
              setSelected(null);
            } else {
              setSelected(null);
            }
          }}
        >
          <text className="socket-label" x={s.x} y={s.y - 34} textAnchor="middle">
            {toLetter(s.letter)}
          </text>
          <rect
            className={`socket-face${selected === s.letter ? ' selected' : ''}${active.has(s.letter) ? ' lit' : ''}`}
            x={s.x - 36}
            y={s.y - 22}
            width={72}
            height={52}
            rx={12}
          />
          <circle className="socket-hole" cx={s.x - 13} cy={s.y + 4} r={8} />
          <circle className="socket-hole" cx={s.x + 13} cy={s.y + 4} r={8} />
        </g>
      ))}
      {pairs.map(([a, b], i) => {
        const pa = byLetter.get(a);
        const pb = byLetter.get(b);
        if (pa === undefined || pb === undefined) return null;
        const hot = active.has(a) || active.has(b);
        return (
          <g key={`${a}-${b}`}>
            <path
              className={`cable${hot ? ' active' : ''}`}
              d={cablePath(pa, pb)}
              stroke={CABLE_COLORS[i % CABLE_COLORS.length]}
              strokeWidth={12}
            />
            <path className="cable" d={cablePath(pa, pb)} stroke="rgb(255 255 255 / 10%)" strokeWidth={3} />
            {[pa, pb].map((p) => (
              <g key={p.letter}>
                <rect className="plug-cap" x={p.x - 30} y={p.y - 16} width={60} height={42} rx={9} fill="url(#plugGrad)" />
                <rect x={p.x - 22} y={p.y - 10} width={44} height={30} rx={6} fill="url(#plugGrip)" pointerEvents="none" />
                <text x={p.x} y={p.y + 11} textAnchor="middle" fontSize="15" fontFamily="var(--mono)" fontWeight="600" fill="#1d1d1f" pointerEvents="none">
                  {toLetter(p.letter === a ? b : a)}
                </text>
              </g>
            ))}
          </g>
        );
      })}
      {drag !== null &&
        (() => {
          const from = byLetter.get(drag.from);
          if (from === undefined) return null;
          return (
            <g pointerEvents="none">
              <path className="cable" d={cablePath(from, { x: drag.x, y: drag.y - 8 })} stroke="#4a4a4a" strokeWidth={9} />
              <rect className="plug-cap" x={from.x - 30} y={from.y - 16} width={60} height={42} rx={9} fill="url(#plugGrad)" />
              <rect className="plug-cap" x={drag.x - 30} y={drag.y - 24} width={60} height={42} rx={9} fill="url(#plugGrad)" />
            </g>
          );
        })()}
    </svg>
  );
}
