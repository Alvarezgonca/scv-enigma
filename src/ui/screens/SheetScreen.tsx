import { useCallback, useEffect, useRef, useState } from 'react';
import { toLetter } from '../../core/enigma';
import { fingerprint, fromBase64Url, utf8 } from '../../core/modern';
import {
  type KeySheet,
  type SheetFrame,
  DEFAULT_STATIONS,
  FrameError,
  KeySheetError,
  MessageAssembler,
  framesToSheet,
  generateKeySheet,
  parseFrame,
  serializeSheet,
  sheetForStation,
  sheetToFrames,
  todayKey,
} from '../../core/protocol';
import { Icon } from '../icons';
import { QrCarousel } from '../qr/QrCode';
import { QrScanner } from '../qr/QrScanner';
import { sound } from '../sound';
import { useApp } from '../state';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Código de conferência da folha. Depende do conteúdo (texto), não da identidade do objeto. */
function useFingerprint(sheet: KeySheet | null): string | null {
  const text = sheet === null ? null : serializeSheet(sheet);
  const [fp, setFp] = useState<{ text: string; value: string } | null>(null);
  useEffect(() => {
    if (text === null) return;
    let alive = true;
    void fingerprint(utf8(text)).then((value) => {
      if (alive) setFp({ text, value });
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return fp !== null && fp.text === text ? fp.value : null;
}

function CreateNet() {
  const { setSheet } = useApp();
  const [net, setNet] = useState('MARICA');
  const [count, setCount] = useState(2);
  const [names, setNames] = useState<string[]>([...DEFAULT_STATIONS]);
  const [days, setDays] = useState(7);
  const [start, setStart] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const create = async (): Promise<void> => {
    setError(null);
    try {
      const [y = 2026, m = 1, d = 1] = start.split('-').map(Number);
      const stations = names.slice(0, count).map((n) => n.trim().toUpperCase());
      const sheet = generateKeySheet({ net: net.trim().toUpperCase(), stations, start: new Date(y, m - 1, d), days });
      await setSheet(sheet, stations[0] ?? null);
      sound.clunk();
    } catch (e) {
      setError(e instanceof KeySheetError ? e.message : 'não foi possível gerar a folha');
    }
  };

  return (
    <div className="card enigma">
      <h2>Criar a rede: esta máquina é o Comando</h2>
      <p>
        O Comando sorteia a chave Enigma de cada dia e um segredo de 256 bits para cada par de estações, com o gerador
        criptográfico do sistema. Depois entrega a cada estação só a parte dela.
      </p>
      <div className="stack">
        <label className="field">
          Nome da rede
          <input type="text" value={net} maxLength={16} onChange={(e) => setNet(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} />
        </label>
        <div className="field">
          Estações na rede
          <div className="segmented" role="group" aria-label="Quantidade de estações">
            {[2, 3, 4].map((n) => (
              <button key={n} type="button" aria-pressed={count === n} onClick={() => setCount(n)}>
                {n} máquinas
              </button>
            ))}
          </div>
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          {names.slice(0, count).map((n, i) => (
            <label className="field" key={i}>
              Indicativo {i + 1}
              {i === 0 ? ' (esta máquina)' : ''}
              <input
                type="text"
                value={n}
                maxLength={10}
                onChange={(e) => {
                  const next = [...names];
                  next[i] = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                  setNames(next);
                }}
              />
            </label>
          ))}
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          <label className="field">
            Primeiro dia
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            Dias de validade
            <input type="number" min={1} max={31} value={days} onChange={(e) => setDays(Math.max(1, Math.min(31, Number(e.target.value))))} />
          </label>
        </div>
        {error !== null && <div className="notice danger">{error}</div>}
        <div className="row">
          <button type="button" className="btn primary" onClick={() => void create()}>
            Gerar a folha de chaves
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiveSheet() {
  const { setSheet } = useApp();
  const asm = useRef(new MessageAssembler());
  const [status, setStatus] = useState<{ total: number; received: number[]; protectedByPassword: boolean } | null>(null);
  const [frames, setFrames] = useState<SheetFrame[] | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<KeySheet | null>(null);
  const fp = useFingerprint(candidate);

  const tryOpen = useCallback(async (list: SheetFrame[], pass: string): Promise<void> => {
    setError(null);
    try {
      const sheet = await framesToSheet(list, { password: pass, requirePassword: list.some((f) => f.protectedByPassword) });
      setCandidate(sheet);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'não foi possível abrir a folha');
    }
  }, []);

  const onText = useCallback((text: string) => {
    let frame;
    try {
      frame = parseFrame(text);
    } catch (e) {
      setError(e instanceof FrameError ? `QR ignorado: ${e.message}` : 'QR ignorado');
      sound.beep(false);
      return;
    }
    if (frame.kind !== 'F') {
      setError('Este QR é uma mensagem, não uma folha de chaves. Para mensagens use a tela Receber.');
      sound.beep(false);
      return;
    }
    setError(null);
    const r = asm.current.add(frame);
    if (r === 'nova') sound.beep(true);
    const view = asm.current.current();
    if (view === null) return;
    setStatus({ total: view.total, received: [...view.received], protectedByPassword: frame.protectedByPassword });
    if (view.complete && r === 'nova') {
      const list = asm.current.ordered(view.key).filter((f): f is SheetFrame => f.kind === 'F');
      setFrames(list);
      // Folha sem senha abre na hora; com senha, espera o operador digitar.
      if (!list.some((f) => f.protectedByPassword)) void tryOpen(list, '');
    }
  }, [tryOpen]);

  const open = (): void => {
    if (frames !== null) void tryOpen(frames, password);
  };

  if (candidate !== null) {
    return (
      <div className="card modern">
        <h2>Folha recebida: confira antes de aceitar</h2>
        <dl className="kv">
          <dt>Rede</dt>
          <dd>{candidate.net}</dd>
          <dt>Esta estação</dt>
          <dd>{candidate.holder ?? 'Comando'}</dd>
          <dt>Validade</dt>
          <dd>
            {candidate.days[0]?.date} a {candidate.days.at(-1)?.date}
          </dd>
          <dt>Código</dt>
          <dd style={{ fontSize: 18, color: 'var(--modern)' }}>{fp ?? '…'}</dd>
        </dl>
        <p className="small" style={{ marginTop: 10 }}>
          O código precisa ser igual ao que aparece na tela do Comando. Se for diferente, a folha foi trocada no caminho.
        </p>
        <div className="row">
          <button type="button" className="btn modern" onClick={() => void setSheet(candidate, candidate.holder)}>
            O código confere: aceitar
          </button>
          <button type="button" className="btn ghost" onClick={() => setCandidate(null)}>
            Recusar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Receber a folha do Comando</h2>
      <p>Na máquina do Comando, abra “Distribuir” e mostre o QR da sua estação. Aponte a câmera.</p>
      <QrScanner onText={onText} hint="Aponte para o QR da folha que o Comando está mostrando." />
      {status !== null && (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="parts-strip" aria-label="Partes recebidas">
            {Array.from({ length: status.total }, (_, k) => (
              <span key={k} className={status.received.includes(k + 1) ? 'got' : ''}>
                {k + 1}
              </span>
            ))}
          </div>
          {frames !== null && status.protectedByPassword && (
            <div className="row">
              <input
                type="password"
                placeholder="Senha de distribuição"
                aria-label="Senha de distribuição"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ maxWidth: 280 }}
              />
              <button type="button" className="btn modern" onClick={open}>
                Abrir a folha
              </button>
            </div>
          )}
        </div>
      )}
      {error !== null && (
        <div className="notice warn" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}

function SheetTable({ sheet }: { sheet: KeySheet }) {
  const today = todayKey(sheet);
  return (
    <div className="keysheet" aria-label="Folha de chaves impressa">
      <h2>GEHEIM · FOLHA DE CHAVES</h2>
      <div className="sub">
        Rede {sheet.net} · emissão {sheet.id} · Enigma I, refletor B · {sheet.stations.join(', ')}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Dia</th>
              <th>Rotores</th>
              <th>Anéis</th>
              <th>Plugboard (10 cabos)</th>
              <th>Kenngruppen</th>
            </tr>
          </thead>
          <tbody>
            {[...sheet.days].reverse().map((d) => (
              <tr key={d.date} className={d === today ? 'today' : ''}>
                <td>{String(d.day).padStart(2, '0')}</td>
                <td>{d.rotors.join(' ')}</td>
                <td>{d.rings.map((r) => String(r + 1).padStart(2, '0')).join(' ')}</td>
                <td>{d.plugboard.map(([a, b]) => toLetter(a) + toLetter(b)).join(' ')}</td>
                <td>{d.kenngruppen.join(' ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="warn">Dias em ordem decrescente, como nas folhas reais: o dia usado é recortado e queimado.</div>
    </div>
  );
}

function PairList({ sheet }: { sheet: KeySheet }) {
  const [fps, setFps] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    void Promise.all(Object.entries(sheet.pairSecrets).map(async ([id, s]) => [id, await fingerprint(fromBase64Url(s))] as const)).then((list) => {
      if (alive) setFps(Object.fromEntries(list));
    });
    return () => {
      alive = false;
    };
  }, [sheet]);
  const entries = Object.keys(sheet.pairSecrets).sort();
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Par</th>
            <th>Segredo AES (256 bits)</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((id) => (
            <tr key={id}>
              <td className="mono">{id.replace('-', ' ↔ ')}</td>
              <td className="mono small">nunca exibido · resumo {fps[id]?.slice(0, 14) ?? '…'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Distribute({ sheet, me }: { sheet: KeySheet; me: string | null }) {
  const others = sheet.stations.filter((s) => s !== me);
  const [chosen, setTarget] = useState<string | null>(null);
  const target = chosen !== null && others.includes(chosen) ? chosen : (others[0] ?? '');
  const [password, setPassword] = useState('');
  const [frames, setFrames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const copy = target === '' ? null : sheetForStation(sheet, target);
  const fp = useFingerprint(copy);

  const make = async (): Promise<void> => {
    if (copy === null) return;
    setBusy(true);
    try {
      setFrames(await sheetToFrames(copy, { password }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card modern">
      <h2>Distribuir a folha (você é o Comando)</h2>
      <p>
        Cada estação recebe as chaves Enigma da rede e só os segredos dos pares de que participa. Quem capturar a folha
        de uma estação não lê a conversa das outras: é o menor privilégio, a lição do U-110 e do ataque à C&amp;M.
      </p>
      <div className="stack">
        <div className="segmented" role="group" aria-label="Estação de destino">
          {others.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={target === s}
              onClick={() => {
                setTarget(s);
                setFrames(null);
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <label className="field">
          Senha de distribuição (recomendado; diga em voz alta, nunca junto do QR)
          <input
            type="password"
            value={password}
            placeholder="ex.: farol itaipuaçu sete"
            onChange={(e) => {
              setPassword(e.target.value);
              setFrames(null);
            }}
          />
        </label>
        <div className="row">
          <button type="button" className="btn modern" disabled={busy || copy === null} onClick={() => void make()}>
            {busy ? 'Protegendo (PBKDF2 600 mil iterações)…' : `Gerar QR da folha de ${target}`}
          </button>
        </div>
        {frames !== null && (
          <>
            <QrCarousel frames={frames} title={`Folha de ${target} · rede ${sheet.net}`} accent="modern" />
            <div className="notice ok">
              <Icon.Check />
              <span>
                Código de conferência de {target}: <b className="mono">{fp ?? '…'}</b>. A estação precisa ver o mesmo código
                antes de aceitar.
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function SheetScreen() {
  const { sheet, station, setSheet, setStation, ready } = useApp();
  const fp = useFingerprint(sheet);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!ready) return <p className="muted">Abrindo o cofre local…</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Gestão de chaves</div>
          <h1>Folha de chaves da rede</h1>
          <p>
            A segurança da Enigma dependia inteira desta folha. Aqui ela é gerada com aleatoriedade criptográfica, viaja
            por QR protegida por senha e fica cifrada no aparelho.
          </p>
        </div>
      </div>

      {sheet === null ? (
        <div className="grid-2">
          <CreateNet />
          <ReceiveSheet />
        </div>
      ) : (
        <div className="grid-main">
          <div>
            <SheetTable sheet={sheet} />
            <div className="row no-print" style={{ marginTop: 12 }}>
              <button type="button" className="btn small" onClick={() => window.print()}>
                Imprimir a folha
              </button>
            </div>
          </div>
          <div>
            <div className="card">
              <h2>Esta máquina</h2>
              <dl className="kv">
                <dt>Rede</dt>
                <dd>{sheet.net}</dd>
                <dt>Cópia</dt>
                <dd>{sheet.holder === null ? 'do Comando (todos os segredos)' : `da estação ${sheet.holder}`}</dd>
                <dt>Código</dt>
                <dd>{fp ?? '…'}</dd>
              </dl>
              {sheet.holder === null && (
                <label className="field" style={{ marginTop: 12 }}>
                  Operar como
                  <select value={station ?? ''} onChange={(e) => setStation(e.target.value)}>
                    {sheet.stations.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
            <div className="card">
              <h3>Segredos do modo moderno que esta máquina tem</h3>
              <PairList sheet={sheet} />
            </div>
            {sheet.holder === null && <Distribute sheet={sheet} me={station} />}
            <div className="card no-print">
              <h3>Destruir as chaves deste aparelho</h3>
              <p>Como no procedimento real: terminada a missão, a folha é destruída.</p>
              {confirmDelete ? (
                <div className="row">
                  <button
                    type="button"
                    className="btn danger"
                    onClick={() => {
                      void setSheet(null, null);
                      setConfirmDelete(false);
                    }}
                  >
                    Apagar de vez
                  </button>
                  <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>
                  Apagar a folha
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
