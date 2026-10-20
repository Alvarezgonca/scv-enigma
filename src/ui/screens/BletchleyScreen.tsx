import { useEffect, useMemo, useRef, useState } from 'react';
import { type BombeStop, type Menu, type RotorOrder, ARMY_ORDERS, MAX_MENU_LENGTH, buildMenu } from '../../core/analysis/bombe';
import { dragCrib, survivalChance } from '../../core/analysis/crib';
import { humanDuration } from '../../core/analysis/bruteforce';
import { type RecoveredKey, solve } from '../../core/analysis/solver';
import {
  type EnigmaSettings,
  aesKeySpace,
  encryptText,
  formatPlugboard,
  groupsOf5,
  lettersOnly,
  prepareText,
  settingsFrom,
  toIndex,
  toLetter,
} from '../../core/enigma';
import { randomInt, randomLetters, shuffle } from '../../core/modern';
import type { BombeJob, BombeMessage } from '../../workers/bombe.worker';
import { Icon } from '../icons';
import { useApp } from '../state';
import { readable } from './receive-logic';

const SAMPLES = [
  'Defesa Civil informa que o abrigo do ginásio de Itaipuaçu está aberto. Enviar duzentos colchões e água potável às seis horas. Confirmar recebimento.',
  'Comboio de suprimentos parte da estação central ao amanhecer. Ponte da lagoa interditada, seguir pelo desvio da serra. Nada mais a relatar.',
  'Equipe de resgate chegou ao bairro do Flamengo. Três famílias retiradas, nenhum ferido. Pedimos gerador e lanternas até o fim da tarde.',
];

interface Example {
  readonly settings: EnigmaSettings;
  readonly plain: string;
}

function makeExample(): Example {
  const order = shuffle(['I', 'II', 'III', 'IV', 'V']).slice(0, 3).join(' ');
  const letters = shuffle([...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
  const plugs = Array.from({ length: 10 }, (_, i) => `${letters[2 * i] ?? ''}${letters[2 * i + 1] ?? ''}`).join(' ');
  const settings = settingsFrom({ rotors: order, rings: randomLetters(3), positions: randomLetters(3), plugboard: plugs });
  const plain = prepareText(`Para estação BRAVO, de estação ALFA: ${SAMPLES[randomInt(SAMPLES.length)] ?? ''}`);
  return { settings, plain };
}

function MenuGraph({ menu }: { menu: Menu }) {
  const letters = menu.letters;
  const R = 150;
  const cx = 200;
  const cy = 180;
  const pos = new Map(letters.map((l, k) => [l, { x: cx + R * Math.cos((2 * Math.PI * k) / letters.length - Math.PI / 2), y: cy + R * Math.sin((2 * Math.PI * k) / letters.length - Math.PI / 2) }]));
  const inCycle = new Set(menu.cycles.flat());
  return (
    <svg className="menu-svg" viewBox="0 0 400 360" role="img" aria-label={`Menu com ${letters.length} letras, ${menu.edges.length} ligações e ${menu.loops} laços`}>
      {menu.edges.map((e, idx) => {
        const a = pos.get(e.a);
        const b = pos.get(e.b);
        if (a === undefined || b === undefined) return null;
        const loop = inCycle.has(idx);
        return (
          <g key={idx}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={loop ? 'var(--brass)' : '#4a4238'} strokeWidth={loop ? 2.2 : 1.4} />
            <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2} fill={loop ? 'var(--cream)' : 'var(--faint)'} fontSize="10" textAnchor="middle" dominantBaseline="middle" fontFamily="var(--mono)">
              {e.i + 1}
            </text>
          </g>
        );
      })}
      {letters.map((l) => {
        const p = pos.get(l);
        if (p === undefined) return null;
        const test = l === menu.test;
        return (
          <g key={l}>
            <circle cx={p.x} cy={p.y} r={15} fill={test ? 'var(--lamp-on)' : '#2b2722'} stroke={test ? '#fff3c4' : 'var(--line)'} />
            <text x={p.x} y={p.y + 1} textAnchor="middle" dominantBaseline="middle" fontFamily="var(--mono)" fontWeight="600" fontSize="14" fill={test ? '#3d2a00' : 'var(--text)'}>
              {toLetter(l)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

interface RunState {
  readonly running: boolean;
  readonly ordersDone: number;
  readonly ordersTotal: number;
  readonly tested: number;
  readonly stops: number;
  readonly startedAt: number;
  readonly elapsedMs: number;
  readonly workers: number;
}

export default function BletchleyScreen() {
  const { intercepted } = useApp();
  const [example, setExample] = useState<Example | null>(null);
  const [cipherText, setCipherText] = useState(intercepted ?? '');
  const [cribText, setCribText] = useState('Para estação BRAVO, de estação ALFA');
  const [chosenOffset, setChosenOffset] = useState<number | null>(null);
  const [scope, setScope] = useState<'todas' | 'conhecida'>('todas');
  const [knownOrder, setKnownOrder] = useState<string>('I II III');
  const [turnover, setTurnover] = useState(true);
  const [run, setRun] = useState<RunState | null>(null);
  const [result, setResult] = useState<RecoveredKey | 'nada' | null>(null);
  const [spin, setSpin] = useState('AAA');
  const workers = useRef<Worker[]>([]);

  const cipher = useMemo(() => lettersOnly(cipherText), [cipherText]);
  const crib = useMemo(() => prepareText(cribText), [cribText]);
  const positions = useMemo(() => (crib.length > 0 ? dragCrib(cipher, crib) : []), [cipher, crib]);
  const possible = positions.filter((p) => p.possible);
  const offset = chosenOffset !== null && positions[chosenOffset]?.possible === true ? chosenOffset : (possible[0]?.offset ?? null);
  const cipherIdx = useMemo(() => [...cipher].map(toIndex), [cipher]);
  const cribIdx = useMemo(() => [...crib].map(toIndex), [crib]);
  const menu = useMemo(() => (offset === null ? null : buildMenu(cipherIdx, cribIdx, offset)), [cipherIdx, cribIdx, offset]);

  useEffect(() => () => workers.current.forEach((w) => w.terminate()), []);

  useEffect(() => {
    if (run?.running !== true) return;
    const t = setInterval(() => setSpin(randomLetters(3)), 90);
    return () => clearInterval(t);
  }, [run?.running]);

  const newExample = (): void => {
    const ex = makeExample();
    setExample(ex);
    setCipherText(groupsOf5(encryptText(ex.settings, ex.plain)));
    setChosenOffset(null);
    setResult(null);
    setRun(null);
  };

  const stop = (): void => {
    workers.current.forEach((w) => w.terminate());
    workers.current = [];
    setRun((r) => (r === null ? r : { ...r, running: false }));
  };

  const start = (): void => {
    if (menu === null || offset === null) return;
    stop();
    setResult(null);
    const orders: RotorOrder[] =
      scope === 'todas' ? [...ARMY_ORDERS] : [knownOrder.split(' ') as unknown as RotorOrder];
    const n = Math.max(1, Math.min((navigator.hardwareConcurrency || 4) - 1, 12, orders.length));
    const buckets: RotorOrder[][] = Array.from({ length: n }, () => []);
    orders.forEach((o, i) => buckets[i % n]?.push(o));
    const startedAt = performance.now();
    const allStops: BombeStop[] = [];
    let ordersDone = 0;
    let tested = 0;
    let finished = 0;
    setRun({ running: true, ordersDone: 0, ordersTotal: orders.length, tested: 0, stops: 0, startedAt, elapsedMs: 0, workers: n });
    workers.current = buckets.map((bucket) => {
      const w = new Worker(new URL('../../workers/bombe.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (ev: MessageEvent<BombeMessage>) => {
        const msg = ev.data;
        if (msg.type === 'order') {
          ordersDone++;
          tested += msg.tested;
          allStops.push(...msg.stops);
          setRun({ running: true, ordersDone, ordersTotal: orders.length, tested, stops: allStops.length, startedAt, elapsedMs: performance.now() - startedAt, workers: n });
        } else if (msg.type === 'done' || msg.type === 'error') {
          finished++;
          w.terminate();
          if (finished === buckets.length) {
            const found = solve(cipherIdx, offset, menu.length, allStops);
            const elapsedMs = performance.now() - startedAt;
            setRun({ running: false, ordersDone, ordersTotal: orders.length, tested, stops: allStops.length, startedAt, elapsedMs, workers: n });
            setResult(found === null || found.fitness < -3.6 ? 'nada' : found);
            workers.current = [];
          }
        }
      };
      const job: BombeJob = { cipher: cipherIdx, crib: cribIdx, offset, orders: bucket, withTurnover: turnover };
      w.postMessage(job);
      return w;
    });
  };

  const eliminated = positions.length - possible.length;
  const shown = positions.slice(0, 24);
  const realOrder = example?.settings.rotors.map((r) => r.name).join(' ');

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Criptoanálise · Hut 6, 1940</div>
          <h1>Modo Bletchley Park</h1>
          <p>
            Sem a chave, só com um trecho provável (o crib) e a falha da Enigma: nenhuma letra vira ela mesma. Primeiro o
            crib é arrastado sobre o texto para achar onde ele pode estar; depois a Bomba de Turing-Welchman testa as posições
            dos rotores até sobrar a chave.
          </p>
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <div className="card">
            <h2>1. Mensagem interceptada</h2>
            <textarea
              aria-label="Texto cifrado interceptado"
              value={cipherText}
              onChange={(e) => {
                setCipherText(e.target.value.toUpperCase());
                setExample(null);
                setResult(null);
              }}
              placeholder="Cole aqui o texto cifrado (ou use Receber → Mandar para Bletchley Park)"
              style={{ fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}
            />
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn small" onClick={newExample}>
                Interceptar uma mensagem nova (chave sorteada e escondida)
              </button>
              <span className="small muted">{cipher.length} letras</span>
            </div>
          </div>

          <div className="card enigma">
            <h2>2. Onde o crib pode estar</h2>
            <label className="field">
              Crib: o trecho que se espera no texto (cabeçalhos eram previsíveis)
              <input type="text" value={cribText} onChange={(e) => setCribText(e.target.value)} />
            </label>
            <p className="small" style={{ marginTop: 8 }}>
              <b className="mono">{crib}</b> ({crib.length} letras
              {crib.length > MAX_MENU_LENGTH ? `; a Bomba usa as primeiras ${MAX_MENU_LENGTH}` : ''}). Uma posição errada
              escapa do teste só com probabilidade (25/26)^{crib.length} ≈ {Math.round(survivalChance(crib.length) * 100)}%.
            </p>
            {positions.length > 0 && (
              <>
                <p className="small">
                  <b>{eliminated}</b> de {positions.length} posições eliminadas só pela regra “nenhuma letra vira ela mesma”.
                  Toque numa posição possível para escolher.
                </p>
                <div className="crib-grid" role="list" aria-label="Crib arrastado sobre o texto">
                  <div className="crib-line" style={{ marginBottom: 6 }}>
                    <span className="lbl">texto</span>
                    {[...cipher.slice(0, crib.length + shown.length)].map((ch, i) => (
                      <span key={i} className="c">
                        {ch}
                      </span>
                    ))}
                  </div>
                  {shown.map((p) => (
                    <div
                      key={p.offset}
                      className={`crib-line${p.possible ? ' ok' : ''}${p.offset === offset ? ' chosen' : ''}`}
                      role="listitem"
                      onClick={() => p.possible && setChosenOffset(p.offset)}
                    >
                      <span className="lbl">{p.offset}</span>
                      <span style={{ width: p.offset * 22, flex: 'none' }} />
                      {[...crib].map((ch, i) => (
                        <span key={i} className={p.clashes.includes(i) ? 'clash' : 'p'} title={`texto cifrado: ${cipher[p.offset + i] ?? ''}`}>
                          {ch}
                        </span>
                      ))}
                      <span className="verdict">
                        {p.possible ? (p.offset === offset ? '● escolhida' : 'possível') : `✗ ${p.clashes.length}`}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="stack">
          <div className="card">
            <h2>3. O menu</h2>
            {menu === null ? (
              <p>Escolha uma posição possível para o crib.</p>
            ) : (
              <>
                <p className="small">
                  Cada número é a posição de uma letra do crib: liga a letra clara à cifrada. Os <b>laços</b> (em dourado) são
                  o que faz a Bomba eliminar posições erradas. Este menu tem <b>{menu.loops}</b> laço{menu.loops === 1 ? '' : 's'}
                  {menu.loops < 3 ? ' (fraco: espere mais paradas falsas)' : ' (bom)'}. Letra de teste: <b>{toLetter(menu.test)}</b>.
                </p>
                <MenuGraph menu={menu} />
              </>
            )}
          </div>

          <div className="card enigma">
            <h2>4. A Bomba</h2>
            <div className="stack">
              <div className="segmented" role="group" aria-label="Ordens de rotores a testar">
                <button type="button" aria-pressed={scope === 'todas'} onClick={() => setScope('todas')}>
                  Todas as 60 ordens
                </button>
                <button type="button" aria-pressed={scope === 'conhecida'} onClick={() => setScope('conhecida')}>
                  Ordem conhecida
                </button>
              </div>
              {scope === 'conhecida' && (
                <select aria-label="Ordem dos rotores" value={knownOrder} onChange={(e) => setKnownOrder(e.target.value)}>
                  {ARMY_ORDERS.map((o) => (
                    <option key={o.join(' ')} value={o.join(' ')}>
                      {o.join(' ')}
                    </option>
                  ))}
                </select>
              )}
              <label className="row small" style={{ gap: 8 }}>
                <input type="checkbox" checked={turnover} onChange={(e) => setTurnover(e.target.checked)} />
                Considerar o rotor do meio virando dentro do crib (mais lento, sempre acha)
              </label>
              <div className={`drums${run?.running === true ? ' spinning' : ''}`} aria-hidden="true">
                {[...(run?.running === true ? spin : (result !== null && result !== 'nada' ? result.start.map(toLetter).join('') : 'AAA'))].map((c, i) => (
                  <span key={i}>{c}</span>
                ))}
              </div>
              <div className="row">
                <button type="button" className="btn primary" disabled={menu === null || run?.running === true} onClick={start}>
                  <Icon.Bombe /> Ligar a Bomba
                </button>
                {run?.running === true && (
                  <button type="button" className="btn small" onClick={stop}>
                    Parar
                  </button>
                )}
              </div>
              {run !== null && (
                <>
                  <div className="progress">
                    <div style={{ width: `${(run.ordersDone / run.ordersTotal) * 100}%` }} />
                  </div>
                  <p className="small muted">
                    {run.ordersDone}/{run.ordersTotal} ordens · {run.tested.toLocaleString('pt-BR')} posições testadas ·{' '}
                    {run.stops} parada{run.stops === 1 ? '' : 's'} · {run.workers} Bombas em paralelo ·{' '}
                    {(run.elapsedMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {result !== null && (
        <div className="card" style={{ marginTop: 20 }}>
          {result === 'nada' ? (
            <div className="notice warn">
              <Icon.Alert />
              <span>
                Nenhuma parada virou português. Tente outra posição do crib, ligue a virada do rotor do meio ou use um crib mais
                longo (mais laços).
              </span>
            </div>
          ) : (
            <div className="grid-2">
              <div className="stack">
                <h2 style={{ margin: 0 }}>A Enigma caiu em {humanDuration((run?.elapsedMs ?? 0) / 1000)}</h2>
                <div className="cipher plain" style={{ fontSize: 16 }}>
                  {readable(result.plaintext)}
                </div>
                <dl className="kv">
                  <dt>Ordem dos rotores</dt>
                  <dd>
                    {result.order.join(' ')} {realOrder !== undefined && (realOrder === result.order.join(' ') ? '✓ confere' : `(real: ${realOrder})`)}
                  </dd>
                  <dt>Anéis (equivalentes)</dt>
                  <dd>{result.rings.map(toLetter).join(' ')}</dd>
                  <dt>Chave da mensagem</dt>
                  <dd>{result.start.map(toLetter).join('')}</dd>
                  <dt>Plugboard</dt>
                  <dd>{formatPlugboard(result.plugboard)}</dd>
                  <dt>Pela Bomba</dt>
                  <dd>
                    {result.fromStop.steckers.filter(([a, b]) => a !== b).length} cabos deduzidos; o resto completado por
                    estatística do português
                  </dd>
                </dl>
                {example !== null && (
                  <p className="small muted">
                    Chave real sorteada: {example.settings.rotors.map((r) => r.name).join(' ')} · anéis{' '}
                    {example.settings.rotors.map((r) => toLetter(r.ring)).join('')} · início{' '}
                    {example.settings.rotors.map((r) => toLetter(r.position)).join('')} · {formatPlugboard(example.settings.plugboard)}. Anéis
                    e posições podem diferir e ainda assim decifrar igual: são chaves equivalentes.
                  </p>
                )}
              </div>
              <div className="stack">
                <div className="card modern" style={{ margin: 0 }}>
                  <h3>E se fosse AES-256-GCM?</h3>
                  <p>
                    O mesmo crib não serve para nada. O AES não tem refletor nem letra que nunca vira ela mesma, e conhecer
                    parte do texto claro não revela nada sobre a chave (ele é projetado para resistir a ataque com texto
                    conhecido e até escolhido). Sobra a força bruta: {aesKeySpace(256).bits} bits, em média 2²⁵⁵ tentativas.
                  </p>
                  <p>
                    No ritmo de toda a mineração de Bitcoin do planeta (~10²¹ por segundo), levaria{' '}
                    <b>{humanDuration(Number(aesKeySpace(256).total / 2n) / 1e21)}</b>. O universo tem 1,4 × 10¹⁰ anos.
                  </p>
                </div>
                <div className="notice">
                  <span>
                    Em 1940 cada Bomba levava cerca de 20 minutos para testar uma ordem de rotores, e Bletchley chegou a ter
                    mais de 200 delas. A lição para hoje: a Enigma não caiu por força bruta, caiu pela estrutura (a falha) somada
                    ao procedimento (cabeçalhos previsíveis).
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
