import { useMemo } from 'react';
import {
  type EnigmaSettings,
  type KeyTrace,
  type Stage,
  GREEK_WHEELS,
  REFLECTORS,
  ROTORS,
  reflectorMap,
  toLetter,
  wheelForwardMap,
} from '../../core/enigma';

/**
 * Caminho elétrico de uma letra, desenhado como no esquema clássico: a corrente sai da tecla
 * (direita), passa pelo plugboard, atravessa os rotores da direita para a esquerda, faz a volta
 * no refletor e retorna por outro caminho até acender a lâmpada. Amarelo = ida, vermelho = volta.
 * As linhas finas são a fiação interna de cada rotor NA POSIÇÃO em que ele estava nesta tecla.
 */

const ROW = 15;
const TOP = 46;
const H = TOP + ROW * 26 + 16;

interface Column {
  readonly id: string;
  readonly title: string;
  readonly sub: string;
  readonly x: number;
  readonly w: number;
}

function y(i: number): number {
  return TOP + i * ROW + ROW / 2;
}

function contact(trace: KeyTrace, stage: Stage): number {
  return trace.path.find((p) => p.stage === stage)?.contact ?? 0;
}

export function PathDiagram({ trace, settings }: { trace: KeyTrace | null; settings: EnigmaSettings }) {
  const hasGreek = settings.greek !== null;
  const cols = useMemo<Column[]>(() => {
    const names = [
      { id: 'ukw', title: 'Refletor', sub: settings.reflector },
      ...(hasGreek ? [{ id: 'g', title: 'Grego', sub: settings.greek?.name ?? '' }] : []),
      { id: 'l', title: 'Esquerdo', sub: settings.rotors[0].name },
      { id: 'm', title: 'Meio', sub: settings.rotors[1].name },
      { id: 'r', title: 'Direito', sub: settings.rotors[2].name },
      { id: 'plug', title: 'Plugboard', sub: `${settings.plugboard.length} cabos` },
      { id: 'kb', title: 'Tecla/Lâmpada', sub: '' },
    ];
    const W = 860;
    const gap = (W - 40) / names.length;
    return names.map((n, i) => ({ ...n, x: 20 + i * gap + 8, w: n.id === 'kb' ? 26 : gap - 30 }));
  }, [hasGreek, settings]);
  const W = 860;

  const col = (id: string): Column => cols.find((c) => c.id === id) ?? (cols[0]);

  // Fiação interna (linhas finas) na posição usada por esta tecla.
  const wiring = useMemo(() => {
    if (trace === null) return null;
    const pos = trace.positions;
    const [l, m, r] = settings.rotors;
    return {
      r: wheelForwardMap(ROTORS[r.name].wiring, r.ring, pos[2]),
      m: wheelForwardMap(ROTORS[m.name].wiring, m.ring, pos[1]),
      l: wheelForwardMap(ROTORS[l.name].wiring, l.ring, pos[0]),
      g: settings.greek === null ? null : wheelForwardMap(GREEK_WHEELS[settings.greek.name], settings.greek.ring, settings.greek.position),
      ukw: reflectorMap(REFLECTORS[settings.reflector]),
    };
  }, [trace, settings]);

  if (trace === null || wiring === null) {
    return (
      <div className="notice">
        <span>Aperte qualquer tecla da máquina para ver o caminho da corrente pelos rotores.</span>
      </div>
    );
  }

  const kb = col('kb');
  const plug = col('plug');
  const r = col('r');
  const m = col('m');
  const l = col('l');
  const g = hasGreek ? col('g') : null;
  const ukw = col('ukw');

  const inK = trace.input;
  const pIn = contact(trace, 'plugboard');
  const aR = contact(trace, 'rotorDireito');
  const aM = contact(trace, 'rotorMeio');
  const aL = contact(trace, 'rotorEsquerdo');
  const aG = hasGreek ? contact(trace, 'grego') : aL;
  const refl = contact(trace, 'refletor');
  const bG = hasGreek ? contact(trace, 'gregoVolta') : refl;
  const bL = contact(trace, 'rotorEsquerdoVolta');
  const bM = contact(trace, 'rotorMeioVolta');
  const bR = contact(trace, 'rotorDireitoVolta');
  const out = trace.output;

  const right = (c: Column): number => c.x + c.w;
  const left = (c: Column): number => c.x;
  const off = 3;

  const go: [number, number][] = [
    [kb.x, y(inK)],
    [right(plug), y(inK)],
    [left(plug), y(pIn)],
    [right(r), y(pIn)],
    [left(r), y(aR)],
    [right(m), y(aR)],
    [left(m), y(aM)],
    [right(l), y(aM)],
    [left(l), y(aL)],
    ...(g !== null
      ? ([
          [right(g), y(aL)],
          [left(g), y(aG)],
        ] as [number, number][])
      : []),
    [right(ukw), y(aG)],
    [left(ukw) + 8, y(aG)],
  ];
  const back: [number, number][] = [
    [left(ukw) + 8, y(aG) + off],
    [left(ukw) + 8, y(refl) + off],
    [right(ukw), y(refl) + off],
    ...(g !== null
      ? ([
          [left(g), y(refl) + off],
          [right(g), y(bG) + off],
        ] as [number, number][])
      : []),
    [left(l), y(bG) + off],
    [right(l), y(bL) + off],
    [left(m), y(bL) + off],
    [right(m), y(bM) + off],
    [left(r), y(bM) + off],
    [right(r), y(bR) + off],
    [left(plug), y(bR) + off],
    [right(plug), y(out) + off],
    [kb.x, y(out) + off],
  ];
  const d = (pts: [number, number][]): string => pts.map(([px, py], i) => `${i === 0 ? 'M' : 'L'} ${px} ${py}`).join(' ');

  const wheelWires = (c: Column, map: readonly number[]) =>
    map.map((to, from) => <line key={from} className="path-wire" x1={right(c)} y1={y(from)} x2={left(c)} y2={y(to)} />);

  const hits = new Map<string, Set<number>>([
    ['kb', new Set([inK, out])],
    ['plug', new Set([inK, pIn, bR, out])],
    ['r', new Set([pIn, aR, bM, bR])],
    ['m', new Set([aR, aM, bL, bM])],
    ['l', new Set([aM, aL, bG, bL])],
    ['g', new Set([aL, aG, refl, bG])],
    ['ukw', new Set([aG, refl])],
  ]);

  const steps: { label: string; from: number; to: number; back?: boolean }[] = [
    { label: 'plugboard', from: inK, to: pIn },
    { label: settings.rotors[2].name, from: pIn, to: aR },
    { label: settings.rotors[1].name, from: aR, to: aM },
    { label: settings.rotors[0].name, from: aM, to: aL },
    ...(hasGreek ? [{ label: settings.greek?.name ?? '', from: aL, to: aG }] : []),
    { label: `refletor ${settings.reflector}`, from: aG, to: refl },
    ...(hasGreek ? [{ label: `${settings.greek?.name ?? ''}⁻¹`, from: refl, to: bG, back: true }] : []),
    { label: `${settings.rotors[0].name}⁻¹`, from: bG, to: bL, back: true },
    { label: `${settings.rotors[1].name}⁻¹`, from: bL, to: bM, back: true },
    { label: `${settings.rotors[2].name}⁻¹`, from: bM, to: bR, back: true },
    { label: 'plugboard', from: bR, to: out, back: true },
  ];

  return (
    <div>
      <div className="path-wrap">
        <svg className="path-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Caminho da letra ${toLetter(inK)} até a lâmpada ${toLetter(out)}`}>
          {cols.map((c) => (
            <g key={c.id}>
              <text className="path-col-title" x={c.x + c.w / 2} y={16}>
                {c.title}
              </text>
              <text className="path-col-title" x={c.x + c.w / 2} y={32} style={{ fill: 'var(--text)', fontWeight: 600 }}>
                {c.sub}
              </text>
              {c.id !== 'kb' && (
                <rect x={c.x} y={TOP - 4} width={c.w} height={ROW * 26 + 8} rx={8} fill="rgb(255 255 255 / 3%)" stroke="var(--line)" />
              )}
            </g>
          ))}
          {wheelWires(r, wiring.r)}
          {wheelWires(m, wiring.m)}
          {wheelWires(l, wiring.l)}
          {g !== null && wiring.g !== null && wheelWires(g, wiring.g)}
          {wiring.ukw.map((to, from) =>
            from < to ? (
              <path key={from} className="path-wire" d={`M ${right(ukw)} ${y(from)} L ${left(ukw) + 14} ${y(from)} L ${left(ukw) + 14} ${y(to)} L ${right(ukw)} ${y(to)}`} />
            ) : null,
          )}
          {cols.map((c) =>
            Array.from({ length: 26 }, (_, i) => {
              const hit = hits.get(c.id)?.has(i) === true;
              const cx = c.id === 'kb' ? c.x + 13 : right(c);
              return (
                <g key={`${c.id}-${i}`}>
                  <circle className={`path-contact${hit ? ' hit' : ''}`} cx={cx} cy={y(i)} r={hit ? 3.6 : 2.2} />
                  {(c.id === 'kb' || c.id === 'r') && (
                    <text className={`path-letter${hit ? ' hit' : ''}`} x={c.id === 'kb' ? c.x + 2 : right(c) + 12} y={y(i)}>
                      {toLetter(i)}
                    </text>
                  )}
                </g>
              );
            }),
          )}
          <path key={`go-${trace.input}-${trace.positions.join('')}`} className="path-go" d={d(go)} pathLength={1} />
          <path key={`back-${trace.input}-${trace.positions.join('')}`} className="path-back" d={d(back)} pathLength={1} />
        </svg>
      </div>
      <div className="path-formula" aria-label="Fórmula do caminho">
        <b>{toLetter(inK)}</b>{' '}
        {steps.map((st, i) => (
          <span key={i}>
            <span className={st.back === true ? 'back' : 'go'}>—{st.label}→</span> <b>{toLetter(st.to)}</b>{' '}
          </span>
        ))}
        <span className="muted"> · rotores em {trace.positions.map(toLetter).join('')}</span>
      </div>
    </div>
  );
}
