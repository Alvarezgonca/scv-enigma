import { useCallback, useRef, useState } from 'react';
import { groupsOf5, lettersOnly, lettersToIndices, mod26 } from '../../core/enigma';
import { type DayKey, type EnigmaFrame, type Frame, type KeySheet, FrameError, MessageAssembler, findDay, parseFrame, settingsForDay } from '../../core/protocol';
import { Icon } from '../icons';
import { EnigmaView } from '../machine/EnigmaView';
import { useEnigma } from '../machine/useEnigma';
import { QrScanner } from '../qr/QrScanner';
import { go, href } from '../router';
import { sound } from '../sound';
import { useApp } from '../state';
import { type Decoded, type Tamper, TAMPER_LABEL, decodeFrames, readable, tamper } from './receive-logic';

interface Status {
  readonly key: string;
  readonly kind: Frame['kind'];
  readonly from: string;
  readonly to: string;
  readonly total: number;
  readonly received: readonly number[];
  readonly conflicts: readonly string[];
}

function header(f: Frame): { from: string; to: string } {
  return f.kind === 'F' ? { from: 'COMANDO', to: '?' } : { from: f.from, to: f.to };
}

/** Uma chave "quase certa": a do dia com o anel do rotor da direita girado uma casa. */
function almostRightKey(day: DayKey): DayKey {
  return { ...day, rings: [day.rings[0], day.rings[1], mod26(day.rings[2] + 1)] };
}

function ResultView({ decoded, me, title }: { decoded: Decoded; me: string | null; title?: string }) {
  if (decoded.kind === 'erro') {
    return (
      <div className="notice danger">
        <Icon.X />
        <span>
          <b>Recusada.</b> {decoded.message}
        </span>
      </div>
    );
  }
  if (decoded.kind === 'E') {
    const warnings = decoded.parts.flatMap((p) => p.warnings.map((w) => `parte ${p.part}: ${w}`));
    return (
      <div className="stack">
        {title !== undefined && <h3 style={{ margin: 0 }}>{title}</h3>}
        <div className="row">
          <span className="tag enigma">Enigma</span>
          <span className="tag">
            {decoded.from} → {decoded.to}
          </span>
          {me !== null && decoded.to !== me && <span className="tag danger">endereçada a {decoded.to}, não a {me}</span>}
          <span className="tag">sem verificação de integridade</span>
        </div>
        <div className="cipher plain" style={{ fontSize: 16 }}>
          {readable(decoded.text)}
        </div>
        {decoded.missing.length > 0 && <div className="notice warn">Faltam as partes {decoded.missing.join(', ')}.</div>}
        {warnings.length > 0 ? (
          <div className="notice warn">
            <Icon.Alert />
            <span>{warnings.join(' · ')}</span>
          </div>
        ) : (
          <p className="small muted">
            Nenhum alarme. A Enigma não tem como saber se o texto foi alterado no caminho: ela só decifra.
          </p>
        )}
        <dl className="kv small">
          {decoded.parts.map((p) => (
            <div key={p.part} style={{ display: 'contents' }}>
              <dt>Parte {p.part}</dt>
              <dd>
                chave da mensagem {p.messageKey} · Kenngruppe {p.kenngruppe}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    );
  }
  const r = decoded.result;
  return (
    <div className="stack">
      {title !== undefined && <h3 style={{ margin: 0 }}>{title}</h3>}
      <div className="row">
        <span className="tag modern">AES-256-GCM</span>
        <span className="tag">
          {decoded.from} → {decoded.to}
        </span>
        {r.text !== null ? <span className="tag ok">autêntica e íntegra</span> : <span className="tag danger">recusada</span>}
      </div>
      {r.text !== null ? (
        <div className="cipher plain" style={{ fontSize: 16 }}>
          {r.text}
        </div>
      ) : (
        <div className="notice danger">
          <Icon.X />
          <span>
            <b>Mensagem recusada, nenhum texto foi entregue.</b>{' '}
            {[
              ...r.problems,
              ...(r.missing.length > 0 ? [`faltam as partes ${r.missing.join(', ')}`] : []),
              ...r.parts.filter((p) => !p.ok).map((p) => `parte ${p.part}: ${p.ok ? '' : p.reason}`),
            ].join(' · ')}
          </span>
        </div>
      )}
      <div className="parts-strip" aria-label="Situação de cada parte">
        {r.parts.map((p) => (
          <span key={p.part} className={p.ok ? 'got' : 'bad'} title={p.ok ? 'etiqueta confere' : p.reason}>
            {p.part}
            {p.ok ? ' ✓' : ' ✗'}
          </span>
        ))}
        {r.missing.map((m) => (
          <span key={`m${m}`}>{m} ?</span>
        ))}
      </div>
    </div>
  );
}

function TamperLab({ frames, sheet, me }: { frames: readonly Frame[]; sheet: KeySheet; me: string | null }) {
  const [kind, setKind] = useState<Tamper | null>(null);
  const [result, setResult] = useState<Decoded | null>(null);
  const run = async (t: Tamper): Promise<void> => {
    setKind(t);
    try {
      setResult(await decodeFrames(tamper(frames, t, sheet.stations), sheet));
    } catch (e) {
      setResult({ kind: 'erro', message: e instanceof FrameError ? e.message : 'quadro inválido' });
    }
  };
  const isEnigma = frames[0]?.kind === 'E';
  return (
    <div className="card">
      <h2>Laboratório de adulteração</h2>
      <p>
        Faça o papel de quem intercepta o QR no meio do caminho e o modifica sem conhecer a chave. Teste nesta mensagem
        {isEnigma ? ' Enigma' : ' AES'} e depois receba a outra versão para comparar.
      </p>
      <div className="row">
        {(Object.keys(TAMPER_LABEL) as Tamper[]).map((t) => (
          <button key={t} type="button" className={`btn small${kind === t ? ' primary' : ''}`} onClick={() => void run(t)}>
            {TAMPER_LABEL[t]}
          </button>
        ))}
      </div>
      {result !== null && kind !== null && (
        <div style={{ marginTop: 14 }}>
          <ResultView decoded={result} me={me} title={`Depois de: ${TAMPER_LABEL[kind].toLowerCase()}`} />
          {result.kind === 'E' && (
            <div className="notice danger" style={{ marginTop: 10 }}>
              <Icon.Alert />
              <span>
                A Enigma entregou um texto adulterado como se fosse legítimo. Quem recebe não tem como desconfiar.
              </span>
            </div>
          )}
          {result.kind !== 'E' && (
            <div className="notice ok" style={{ marginTop: 10 }}>
              <Icon.Check />
              <span>
                O AES-GCM detectou a alteração e não entregou nada: a etiqueta de 128 bits autentica o texto e o cabeçalho.
                Chance de um falsificador acertar: 1 em 2¹²⁸.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DecryptAnimation({ frames, sheet }: { frames: readonly EnigmaFrame[]; sheet: KeySheet }) {
  const first = frames[0];
  const day = first === undefined ? undefined : findDay(sheet, first.day);
  const ctl = useEnigma(settingsForDay(day ?? (sheet.days[0]), [0, 0, 0]));
  const [busy, setBusy] = useState(false);
  if (first === undefined || day === undefined) return null;
  const run = async (): Promise<void> => {
    setBusy(true);
    ctl.clearTape();
    ctl.setSettings(settingsForDay(day, lettersToIndices(first.grundstellung)));
    const key = await ctl.autoType(first.encryptedKey, { delayMs: 220 });
    ctl.setSettings(settingsForDay(day, lettersToIndices(key)));
    await new Promise((r) => setTimeout(r, 400));
    await ctl.autoType(lettersOnly(first.body.slice(5)).slice(0, 60), { delayMs: 110 });
    setBusy(false);
  };
  return (
    <div className="card">
      <h2>Ver a máquina decifrando</h2>
      <p>
        A Enigma é recíproca: com a mesma chave, digitar o texto cifrado acende o texto claro. Primeiro a posição básica{' '}
        {first.grundstellung}, depois a chave cifrada {first.encryptedKey}, depois o texto.
      </p>
      <button type="button" className="btn primary" disabled={busy} onClick={() => void run()}>
        Decifrar na máquina
      </button>
      <div style={{ marginTop: 14 }}>
        <EnigmaView ctl={ctl} locked editable={false} listenKeyboard={false} showPlugboard={false} plate="RECEPÇÃO" />
        {ctl.tape.output.length > 0 && (
          <div className="tape">
            <div className="tape-line">
              <span className="tape-label">Lâmpadas</span>
              <span className="tape-text">{groupsOf5(ctl.tape.output)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReceiveScreen() {
  const { sheet, station, setIntercepted } = useApp();
  const asm = useRef(new MessageAssembler());
  const [status, setStatus] = useState<Status | null>(null);
  const [frames, setFrames] = useState<Frame[] | null>(null);
  const [decoded, setDecoded] = useState<Decoded | null>(null);
  const [wrongKey, setWrongKey] = useState<Decoded | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const finish = useCallback(
    async (list: Frame[]) => {
      if (sheet === null) return;
      setFrames(list);
      setWrongKey(null);
      try {
        setDecoded(await decodeFrames(list, sheet));
      } catch (e) {
        setDecoded({ kind: 'erro', message: e instanceof Error ? e.message : 'falha ao decifrar' });
      }
    },
    [sheet],
  );

  const onText = useCallback(
    (text: string) => {
      let frame: Frame;
      try {
        frame = parseFrame(text);
      } catch (e) {
        setNotice(e instanceof FrameError ? `QR ignorado: ${e.message}` : 'QR ignorado');
        sound.beep(false);
        return;
      }
      if (frame.kind === 'F') {
        setNotice('Isto é uma folha de chaves. Para recebê-la, use a tela Folha de chaves.');
        sound.beep(false);
        return;
      }
      setNotice(null);
      const r = asm.current.add(frame);
      if (r === 'repetida') return;
      sound.beep(r === 'nova');
      const view = asm.current.current();
      if (view === null) return;
      const h = header(frame);
      setStatus({ key: view.key, kind: view.kind, from: h.from, to: h.to, total: view.total, received: view.received, conflicts: view.conflicts });
      if (view.complete && r === 'nova') void finish(asm.current.ordered(view.key));
    },
    [finish],
  );

  const reset = (): void => {
    asm.current.clear();
    setStatus(null);
    setFrames(null);
    setDecoded(null);
    setWrongKey(null);
  };

  if (sheet === null) {
    return (
      <div className="card">
        <h2>Falta a folha de chaves</h2>
        <p>Sem a folha, esta máquina não tem como decifrar. Receba a folha do Comando primeiro.</p>
        <a className="btn primary" href={href('folha')}>
          Ir para a folha de chaves
        </a>
      </div>
    );
  }

  const enigmaFrames = frames?.filter((f): f is EnigmaFrame => f.kind === 'E') ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Recepção · estação {station ?? '?'}</div>
          <h1>Ler o QR e decifrar</h1>
          <p>Aponte a câmera para o QR da outra máquina. Partes podem chegar em qualquer ordem; repetidas são ignoradas.</p>
        </div>
        {status !== null && (
          <button type="button" className="btn small" onClick={reset}>
            Nova recepção
          </button>
        )}
      </div>

      <div className="grid-main">
        <div className="stack">
          <QrScanner onText={onText} />
          {notice !== null && <div className="notice warn">{notice}</div>}
        </div>
        <div className="stack">
          <div className="card">
            <h2>Situação</h2>
            {status === null ? (
              <p>Esperando o primeiro QR…</p>
            ) : (
              <div className="stack">
                <div className="row">
                  <span className={`tag ${status.kind === 'E' ? 'enigma' : 'modern'}`}>{status.kind === 'E' ? 'Enigma' : 'AES-256-GCM'}</span>
                  <span className="tag">
                    {status.from} → {status.to}
                  </span>
                </div>
                <div className="parts-strip" aria-label="Partes recebidas">
                  {Array.from({ length: status.total }, (_, k) => (
                    <span key={k} className={status.received.includes(k + 1) ? 'got' : ''}>
                      {k + 1}
                    </span>
                  ))}
                </div>
                <div className={`progress${status.kind === 'A' ? ' modern' : ''}`}>
                  <div style={{ width: `${(status.received.length / status.total) * 100}%` }} />
                </div>
                {status.conflicts.map((c) => (
                  <div key={c} className="notice danger">
                    {c}
                  </div>
                ))}
              </div>
            )}
          </div>
          {decoded !== null && (
            <div className="card">
              <h2>Mensagem</h2>
              <ResultView decoded={decoded} me={station} />
              {decoded.kind === 'E' && (
                <div className="row" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="btn small danger"
                    onClick={() => {
                      const first = enigmaFrames[0];
                      const day = first === undefined ? undefined : findDay(sheet, first.day);
                      if (day === undefined) return;
                      void decodeFrames(enigmaFrames, sheet, almostRightKey(day)).then(setWrongKey);
                    }}
                  >
                    Prova: decifrar com UM anel errado
                  </button>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => {
                      setIntercepted(enigmaFrames.map((f) => f.body.slice(5)).join(''));
                      go('bletchley');
                    }}
                  >
                    Mandar para Bletchley Park
                  </button>
                </div>
              )}
              {wrongKey !== null && wrongKey.kind === 'E' && (
                <div className="notice danger" style={{ marginTop: 12 }}>
                  <Icon.X />
                  <span>
                    Com o anel do rotor da direita uma casa fora: <b className="mono">{groupsOf5(wrongKey.text.slice(0, 60))}…</b>{' '}
                    Ilegível. Uma única peça errada e a mensagem não abre.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {frames !== null && (
        <div className="grid-2" style={{ marginTop: 20 }}>
          <TamperLab frames={frames} sheet={sheet} me={station} />
          {enigmaFrames.length > 0 && <DecryptAnimation frames={enigmaFrames} sheet={sheet} />}
        </div>
      )}
    </>
  );
}
