import { useEffect, useRef, useState } from 'react';
import {
  type EnigmaSettings,
  type GreekName,
  type Pair,
  type ReflectorName,
  type RotorName,
  MODELS,
  QWERTZ_ROWS,
  ROTORS,
  isLetter,
  mod26,
  toIndex,
  toLetter,
} from '../../core/enigma';
import { sound } from '../sound';
import { Plugboard } from './Plugboard';
import type { EnigmaController } from './useEnigma';
import './machine.css';

type SlotIndex = 0 | 1 | 2;

function RotorWindow({ position, tick, label }: { position: number; tick: number; label: string }) {
  return (
    <div className={`window${tick > 0 ? ' tick' : ''}`} key={tick} aria-label={`${label}: ${toLetter(position)}`} role="img">
      <div className="window-strip" aria-hidden="true">
        <span>{toLetter(position - 1)}</span>
        <span className="cur">{toLetter(position)}</span>
        <span>{toLetter(position + 1)}</span>
      </div>
    </div>
  );
}

function Thumbwheel({ onTurn, disabled, label }: { onTurn: (d: 1 | -1) => void; disabled: boolean; label: string }) {
  return (
    <div className="thumbwheel">
      <button type="button" disabled={disabled} aria-label={`${label}: avançar`} onClick={() => onTurn(1)}>
        ▲
      </button>
      <button type="button" disabled={disabled} aria-label={`${label}: voltar`} onClick={() => onTurn(-1)}>
        ▼
      </button>
    </div>
  );
}

const SLOT_LABEL = ['Rotor esquerdo', 'Rotor do meio', 'Rotor direito'] as const;

function Drum({
  name,
  position,
  ring,
  notches,
  slot,
  onRing,
  onPosition,
  editable,
  dragging,
  dropTarget,
  selected,
  onPointerDown,
}: {
  name: string;
  position: number;
  ring: number;
  notches: string;
  slot: number | null;
  onRing?: (d: 1 | -1) => void;
  onPosition?: (d: 1 | -1) => void;
  editable: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const band = [-2, -1, 0, 1, 2].map((d) => mod26(position + d));
  const notchSet = new Set([...notches].map(toIndex));
  return (
    <div
      className={`drum${dragging === true ? ' dragging' : ''}${dropTarget === true ? ' drop-target' : ''}${selected === true ? ' selected' : ''}`}
      data-drop-slot={slot ?? undefined}
      data-rotor={name}
      onPointerDown={onPointerDown}
      aria-label={`Rotor ${name}${slot === null ? ' na caixa' : `, ${SLOT_LABEL[slot] ?? ''}`}`}
    >
      <div className="drum-name">{name}</div>
      <div className="drum-band" aria-hidden="true">
        {band.map((p, i) => (
          <span key={i} className={`${i === 2 ? 'cur' : ''}${notchSet.has(p) ? ' notch' : ''}`}>
            {toLetter(p)}
          </span>
        ))}
      </div>
      {slot !== null && (
        <div className="drum-meta">
          <span>
            <span className="ring-dot" />
            anel {String(ring + 1).padStart(2, '0')}
          </span>
          {editable && onRing !== undefined && (
            <span className="mini-stepper" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" aria-label={`Anel do rotor ${name}: diminuir`} onClick={() => onRing(-1)}>
                −
              </button>
              <span>{toLetter(ring)}</span>
              <button type="button" aria-label={`Anel do rotor ${name}: aumentar`} onClick={() => onRing(1)}>
                +
              </button>
            </span>
          )}
          {editable && onPosition !== undefined && (
            <span className="mini-stepper" onPointerDown={(e) => e.stopPropagation()}>
              <button type="button" aria-label={`Posição do rotor ${name}: voltar`} onClick={() => onPosition(-1)}>
                ▼
              </button>
              <span>{toLetter(position)}</span>
              <button type="button" aria-label={`Posição do rotor ${name}: avançar`} onClick={() => onPosition(1)}>
                ▲
              </button>
            </span>
          )}
          <span style={{ opacity: 0.75 }} title="Letra da janela em que este rotor empurra o vizinho">
            vira em {notches.split('').join('/')}
          </span>
        </div>
      )}
    </div>
  );
}

function withRotor(s: EnigmaSettings, slot: SlotIndex, patch: Partial<{ name: RotorName; ring: number; position: number }>): EnigmaSettings {
  const rotors = [...s.rotors] as [EnigmaSettings['rotors'][0], EnigmaSettings['rotors'][1], EnigmaSettings['rotors'][2]];
  rotors[slot] = { ...rotors[slot], ...patch };
  return { ...s, rotors };
}

interface DragState {
  readonly rotor: RotorName;
  readonly from: SlotIndex | 'box';
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly moved: boolean;
  readonly over: SlotIndex | null;
}

function RotorBay({ ctl, editable }: { ctl: EnigmaController; editable: boolean }) {
  const s = ctl.settings;
  const rule = MODELS[s.model];
  const inUse = new Set(s.rotors.map((r) => r.name));
  const spare = rule.rotors.filter((r) => !inUse.has(r));
  const [drag, setDrag] = useState<DragState | null>(null);
  const [picked, setPicked] = useState<{ rotor: RotorName; from: SlotIndex | 'box' } | null>(null);

  const place = (rotor: RotorName, from: SlotIndex | 'box', to: SlotIndex): void => {
    const target = s.rotors[to];
    let next: EnigmaSettings;
    if (from === 'box') {
      next = withRotor(s, to, { name: rotor });
    } else {
      if (from === to) return;
      const source = s.rotors[from];
      next = withRotor(withRotor(s, to, { name: source.name, ring: source.ring }), from, { name: target.name, ring: target.ring });
    }
    ctl.setSettings(next);
    sound.clunk();
  };

  const slotAt = (x: number, y: number): SlotIndex | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-drop-slot]');
    const v = el?.getAttribute('data-drop-slot');
    return v === undefined || v === null ? null : (Number(v) as SlotIndex);
  };

  const start = (rotor: RotorName, from: SlotIndex | 'box') => (e: React.PointerEvent) => {
    if (!editable) return;
    (e.currentTarget).setPointerCapture(e.pointerId);
    setDrag({ rotor, from, pointerId: e.pointerId, x: e.clientX, y: e.clientY, moved: false, over: null });
  };

  const onMove = (e: React.PointerEvent): void => {
    if (drag === null || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8;
    setDrag({ ...drag, moved, x: moved ? e.clientX : drag.x, y: moved ? e.clientY : drag.y, over: moved ? slotAt(e.clientX, e.clientY) : null });
  };

  const onUp = (e: React.PointerEvent): void => {
    if (drag === null || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    if (d.moved) {
      const to = slotAt(e.clientX, e.clientY);
      if (to !== null) place(d.rotor, d.from, to);
      return;
    }
    // Toque: escolhe um rotor e depois toca no lugar.
    if (picked === null) {
      setPicked({ rotor: d.rotor, from: d.from });
    } else if (d.from !== 'box') {
      place(picked.rotor, picked.from, d.from);
      setPicked(null);
    } else {
      setPicked({ rotor: d.rotor, from: d.from });
    }
  };

  const setReflector = (r: ReflectorName): void => {
    ctl.setSettings({ ...s, reflector: r });
    sound.clunk();
  };

  const setGreek = (name: GreekName): void => {
    if (s.greek === null) return;
    ctl.setSettings({ ...s, greek: { ...s.greek, name } });
    sound.clunk();
  };

  return (
    <div className="bay" onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
      <div className="bay-row">
        <div className="drum static" aria-label={`Refletor ${s.reflector}`}>
          <div className="drum-name" style={{ fontSize: 'calc(var(--u) * 0.22)' }}>
            UKW
          </div>
          <div className="drum-meta">
            {editable ? (
              <select
                aria-label="Refletor"
                value={s.reflector}
                onChange={(e) => setReflector(e.target.value as ReflectorName)}
              >
                {rule.reflectors.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            ) : (
              <b>{s.reflector}</b>
            )}
          </div>
        </div>
        {s.greek !== null && (
          <div className="drum static" aria-label={`Rotor grego ${s.greek.name}`}>
            <div className="drum-name" style={{ fontSize: 'calc(var(--u) * 0.2)' }}>
              {s.greek.name === 'Beta' ? 'β' : 'γ'}
            </div>
            <div className="drum-meta">
              {editable ? (
                <select
                  aria-label="Rotor grego"
                  value={s.greek.name}
                  onChange={(e) => setGreek(e.target.value as GreekName)}
                >
                  <option value="Beta">Beta</option>
                  <option value="Gamma">Gamma</option>
                </select>
              ) : (
                <b>{s.greek.name}</b>
              )}
              <span className="small">pos. {toLetter(s.greek.position)}</span>
            </div>
          </div>
        )}
        {s.rotors.map((r, i) => {
          const slot = i as SlotIndex;
          return (
            <Drum
              key={`${slot}-${r.name}`}
              name={r.name}
              position={r.position}
              ring={r.ring}
              notches={ROTORS[r.name].notches}
              slot={slot}
              editable={editable}
              dragging={drag?.moved === true && drag.from === slot}
              dropTarget={drag?.moved === true && drag.over === slot}
              selected={picked?.from === slot}
              onPointerDown={start(r.name, slot)}
              onRing={(d) => ctl.setSettings(withRotor(s, slot, { ring: mod26(r.ring + d) }))}
              onPosition={(d) => ctl.setSettings(withRotor(s, slot, { position: mod26(r.position + d) }))}
            />
          );
        })}
        <div className="drum static" aria-label="Disco de entrada">
          <div className="drum-name" style={{ fontSize: 'calc(var(--u) * 0.22)' }}>
            ETW
          </div>
          <div className="drum-meta">
            <span style={{ opacity: 0.75 }}>entrada</span>
          </div>
        </div>
      </div>
      {editable && (
        <div className="rotor-box">
          <div className="rotor-box-title">
            <span>Caixa de rotores ({rule.label})</span>
            <span>
              {picked === null
                ? 'Arraste um rotor para um encaixe, ou toque nele e depois no encaixe.'
                : `Rotor ${picked.rotor} escolhido: toque no encaixe de destino.`}
            </span>
          </div>
          <div className="bay-row">
            {spare.length === 0 && <span className="small muted">Todos os rotores deste modelo já estão na máquina.</span>}
            {spare.map((name) => (
              <Drum
                key={name}
                name={name}
                position={0}
                ring={0}
                notches={ROTORS[name].notches}
                slot={null}
                editable={editable}
                dragging={drag?.moved === true && drag.rotor === name}
                selected={picked?.rotor === name && picked.from === 'box'}
                onPointerDown={start(name, 'box')}
              />
            ))}
          </div>
        </div>
      )}
      {drag?.moved === true && (
        <div
          style={{
            position: 'fixed',
            left: drag.x - 30,
            top: drag.y - 40,
            pointerEvents: 'none',
            zIndex: 50,
            padding: '6px 12px',
            borderRadius: 10,
            background: 'linear-gradient(90deg,#2a2a2d,#6a6a70,#1f1f22)',
            fontFamily: 'var(--mono)',
            fontWeight: 600,
            boxShadow: '0 10px 20px rgb(0 0 0 / 60%)',
          }}
        >
          {drag.rotor}
        </div>
      )}
    </div>
  );
}

interface ViewProps {
  readonly ctl: EnigmaController;
  /** Bloqueia o teclado (durante a digitação automática dos procedimentos). */
  readonly locked?: boolean;
  /** Permite trocar rotores, anéis, posições, refletor e cabos. */
  readonly editable?: boolean;
  readonly plate?: string;
  readonly listenKeyboard?: boolean;
  readonly showPlugboard?: boolean;
  readonly startOpen?: boolean;
}

export function EnigmaView({ ctl, locked = false, editable = true, plate = 'ENIGMA', listenKeyboard = true, showPlugboard = true, startOpen = false }: ViewProps) {
  const [open, setOpen] = useState(startOpen);
  const heldKey = useRef<string | null>(null);
  const s = ctl.settings;

  useEffect(() => {
    if (!listenKeyboard || locked) return;
    const isTyping = (t: EventTarget | null): boolean =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    const down = (e: KeyboardEvent): void => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const k = e.key.toUpperCase();
      if (!isLetter(k)) return;
      e.preventDefault();
      heldKey.current = k;
      ctl.keyDown(toIndex(k));
    };
    const up = (e: KeyboardEvent): void => {
      if (heldKey.current !== null && e.key.toUpperCase() === heldKey.current) {
        heldKey.current = null;
        ctl.keyUp();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [ctl, listenKeyboard, locked]);

  const turn = (slot: SlotIndex, d: 1 | -1): void => {
    ctl.setSettings(withRotor(s, slot, { position: mod26(s.rotors[slot].position + d) }));
    sound.steps(1);
  };

  const highlight = ctl.trace === null || ctl.lit === null ? [] : [ctl.trace.input, ctl.trace.output];

  return (
    <section className={`enigma-case${locked ? ' machine-locked' : ''}`} aria-label="Máquina Enigma">
      <div className="enigma-plate">
        <span className="screw tl" />
        <span className="screw tr" style={{ ['--r' as string]: '75deg' }} />
        <span className="screw bl" style={{ ['--r' as string]: '120deg' }} />
        <span className="screw br" style={{ ['--r' as string]: '10deg' }} />
        {open ? (
          <RotorBay ctl={ctl} editable={editable && !locked} />
        ) : (
          <div className="lid">
            <span className="lid-plate">{plate}</span>
            {s.greek !== null && (
              <div className="wheel-slot">
                <RotorWindow position={s.greek.position} tick={0} label="Rotor grego" />
              </div>
            )}
            {s.rotors.map((r, i) => {
              const slot = i as SlotIndex;
              return (
                <div className="wheel-slot" key={slot}>
                  <RotorWindow position={r.position} tick={ctl.ticks[slot]} label={SLOT_LABEL[slot]} />
                  <Thumbwheel label={SLOT_LABEL[slot]} disabled={locked || !editable} onTurn={(d) => turn(slot, d)} />
                </div>
              );
            })}
          </div>
        )}
        <div className="row" style={{ justifyContent: 'center', margin: '-4px 0 10px' }}>
          <button
            type="button"
            className="btn small ghost"
            onClick={() => {
              setOpen(!open);
              sound.clunk();
            }}
            aria-expanded={open}
          >
            {open ? 'Fechar a tampa' : 'Abrir a tampa e ver os rotores'}
          </button>
        </div>

        <div className="board lampboard" aria-hidden="true">
          {QWERTZ_ROWS.map((row, r) => (
            <div className={`board-row r${r + 1}`} key={row}>
              {[...row].map((ch) => (
                <div key={ch} className={`lamp${ctl.lit === toIndex(ch) ? ' on' : ''}`}>
                  {ch}
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {ctl.lit === null ? '' : `Lâmpada ${toLetter(ctl.lit)}`}
        </p>

        <div className="board keyboard" role="group" aria-label="Teclado">
          {QWERTZ_ROWS.map((row, r) => (
            <div className={`board-row r${r + 1}`} key={row}>
              {[...row].map((ch) => {
                const idx = toIndex(ch);
                return (
                  <button
                    key={ch}
                    type="button"
                    className={`key${ctl.pressed === idx ? ' down' : ''}`}
                    aria-label={`Tecla ${ch}`}
                    disabled={locked}
                    onPointerDown={(e) => {
                      if (locked) return;
                      e.preventDefault();
                      (e.currentTarget as Element).setPointerCapture(e.pointerId);
                      ctl.keyDown(idx);
                    }}
                    onPointerUp={() => {
                      if (!locked) ctl.keyUp();
                    }}
                    onPointerCancel={() => ctl.keyUp()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        if (!e.repeat) ctl.keyDown(idx);
                      }
                    }}
                    onKeyUp={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') ctl.keyUp();
                    }}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {showPlugboard && (
        <div className="front-panel">
          <div className="front-head">
            <span>Steckerbrett (plugboard)</span>
            <span>
              {s.plugboard.length} de 13 cabos {s.plugboard.length === 10 ? '(padrão de 1939)' : ''}
            </span>
          </div>
          <Plugboard
            pairs={s.plugboard}
            readOnly={!editable || locked}
            highlight={highlight}
            onChange={(pairs: Pair[]) => ctl.setSettings({ ...s, plugboard: pairs })}
          />
        </div>
      )}
    </section>
  );
}
