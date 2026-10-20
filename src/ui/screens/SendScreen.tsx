import { useMemo, useRef, useState } from 'react';
import { groupsOf5, lettersToIndices, prepareText } from '../../core/enigma';
import { toHex, utf8 } from '../../core/modern';
import {
  type AesOutgoing,
  type EnigmaOutgoing,
  AES_CHUNK_BYTES,
  MAX_LETTERS_PER_PART,
  describeDay,
  encryptEnigmaMessage,
  pairSecret,
  sealAesMessage,
  settingsForDay,
  todayKey,
} from '../../core/protocol';
import { Icon } from '../icons';
import { EnigmaView } from '../machine/EnigmaView';
import { useEnigma } from '../machine/useEnigma';
import { QrCarousel } from '../qr/QrCode';
import { go, href } from '../router';
import { useApp } from '../state';

const DEFAULT_TEXT =
  'Defesa Civil: abrigo aberto no ginásio de Itaipuaçu. Enviar 200 colchões e água potável às 06h00. Confirmar recebimento.';

type Speed = 'normal' | 'rapido' | 'instantaneo';
const DELAY: Record<Speed, number> = { normal: 120, rapido: 40, instantaneo: 0 };

function download(name: string, lines: readonly string[]): void {
  const blob = new Blob([lines.join('\n') + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SendScreen() {
  const { sheet, station } = useApp();
  if (sheet === null || station === null) {
    return (
      <div className="card">
        <h2>Falta a folha de chaves</h2>
        <p>Para transmitir, esta máquina precisa ser uma estação da rede. Crie a rede (Comando) ou receba a folha.</p>
        <a className="btn primary" href={href('folha')}>
          Ir para a folha de chaves
        </a>
      </div>
    );
  }
  return <Transmitter key={`${sheet.id}-${station}`} />;
}

function Transmitter() {
  const { sheet, station, setLastMessage, setIntercepted } = useApp();
  // SendScreen garante que os dois existem.
  const net = sheet as NonNullable<typeof sheet>;
  const me = station as string;
  // Toda folha válida tem ao menos um dia (parseSheet e generateKeySheet garantem).
  const day = todayKey(net) ?? net.days[0];
  const others = net.stations.filter((s) => s !== me);
  const [to, setTo] = useState(others[0] ?? '');
  const [body, setBody] = useState(DEFAULT_TEXT);
  const [speed, setSpeed] = useState<Speed>('normal');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [enigma, setEnigma] = useState<EnigmaOutgoing | null>(null);
  const [aes, setAes] = useState<AesOutgoing | null>(null);
  const [check, setCheck] = useState<'ok' | 'falhou' | null>(null);
  const [tab, setTab] = useState<'enigma' | 'aes'>('enigma');
  const abort = useRef<AbortController | null>(null);
  const ctl = useEnigma(settingsForDay(day, [0, 0, 0]));

  // Cabeçalho formal, como nas mensagens militares: é também o crib que Bletchley Park exploraria.
  const fullText = `Para estação ${to}, de estação ${me}: ${body.trim()}`;
  const letters = useMemo(() => prepareText(fullText), [fullText]);
  const secret = pairSecret(net, me, to);
  const parts = Math.ceil(letters.length / MAX_LETTERS_PER_PART);
  const aesParts = Math.max(1, Math.ceil(utf8(fullText).length / AES_CHUNK_BYTES));

  const transmit = async (): Promise<void> => {
    if (letters.length === 0 || to === '') return;
    setBusy(true);
    setCheck(null);
    setStep(1);
    const e = encryptEnigmaMessage({ from: me, to, day, letters });
    const a = secret === undefined ? null : await sealAesMessage({ from: me, to, day: day.day, text: fullText, pairSecret: secret });
    setEnigma(e);
    setAes(a);
    const first = e.parts[0];
    abort.current = new AbortController();
    try {
      if (first !== undefined && speed !== 'instantaneo') {
        ctl.clearTape();
        // Passo 2: rotores na posição básica sorteada.
        ctl.setSettings(settingsForDay(day, lettersToIndices(first.grundstellung)));
        setStep(2);
        await new Promise((r) => setTimeout(r, 500));
        // Passo 3: digita a chave da mensagem; as lâmpadas mostram a chave cifrada.
        setStep(3);
        const ek = await ctl.autoType(first.messageKey, { delayMs: Math.max(DELAY[speed], 160), signal: abort.current.signal });
        // Passo 4: rotores na chave da mensagem.
        ctl.setSettings(settingsForDay(day, lettersToIndices(first.messageKey)));
        setStep(4);
        await new Promise((r) => setTimeout(r, 500));
        // Passo 5: digita o texto; as lâmpadas dão o texto cifrado (fita limpa para não misturar com a chave).
        ctl.clearTape();
        setStep(5);
        const ct = await ctl.autoType(first.plaintext, { delayMs: DELAY[speed], signal: abort.current.signal });
        // Prova de coerência: o que a máquina animada acendeu é igual ao que o protocolo calculou.
        setCheck(ek === first.encryptedKey && ct === first.ciphertext ? 'ok' : 'falhou');
      }
    } catch {
      /* animação interrompida: o resultado já está calculado */
    }
    setStep(6);
    setBusy(false);
    setLastMessage({
      direction: 'enviada',
      from: me,
      to,
      day: day.day,
      text: fullText,
      letters,
      enigmaFrames: e.parts.map((p) => p.frame),
      aesFrames: a?.frames ?? [],
      enigmaCipher: e.parts.map((p) => p.ciphertext).join(''),
      aesBytes: a?.ciphertexts ?? [],
    });
  };

  const first = enigma?.parts[0];
  const stepsEnigma = [
    <>
      Chave do dia {day.day} vinda da folha: <code>{describeDay(day)}</code>
    </>,
    <>
      Posição básica (Grundstellung) sorteada: <code>{first?.grundstellung ?? '···'}</code>
    </>,
    <>
      Chave da mensagem sorteada <code>{first?.messageKey ?? '···'}</code>, digitada na posição básica: acende{' '}
      <code>{first?.encryptedKey ?? '···'}</code>
    </>,
    <>
      Rotores girados para a chave da mensagem <code>{first?.messageKey ?? '···'}</code>
    </>,
    <>
      Texto digitado letra a letra ({letters.length} letras{parts > 1 ? `, em ${parts} partes de até 250` : ''})
    </>,
    <>
      Grupo de identificação <code>{first === undefined ? '·····' : `··${first.kenngruppe}`}</code> + cabeçalho → QR
    </>,
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Transmissão · estação {me}</div>
          <h1>Cifrar e transmitir por QR</h1>
          <p>
            A mesma mensagem sai de dois jeitos: na Enigma, com o procedimento de 1940, e no AES-256-GCM, com chave do par{' '}
            {me}–{to} e cabeçalho autenticado.
          </p>
        </div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <div className="card">
            <div className="grid-2" style={{ gap: 12 }}>
              <label className="field">
                De
                <input type="text" value={me} readOnly />
              </label>
              <label className="field">
                Para
                <select value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}>
                  {others.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field" style={{ marginTop: 12 }}>
              Mensagem
              <textarea value={body} maxLength={1200} onChange={(e) => setBody(e.target.value)} disabled={busy} />
            </label>
            <p className="small" style={{ marginTop: 8 }}>
              Como o operador escreveria na Enigma (sem acento, X no lugar do espaço, números por extenso):
            </p>
            <div className="cipher plain" aria-label="Texto preparado para a Enigma">
              {groupsOf5(letters)}
            </div>
            <p className="small" style={{ marginTop: 8 }}>
              {letters.length} letras na Enigma ({parts} QR) · {utf8(fullText).length} bytes no AES ({aesParts} QR). O começo
              “PARA ESTAÇÃO {to} DE ESTAÇÃO {me}” é previsível: é o tipo de trecho que Bletchley Park usava como crib.
            </p>
            <div className="row" style={{ marginTop: 12 }}>
              <div className="segmented" role="group" aria-label="Velocidade da animação">
                {(['normal', 'rapido', 'instantaneo'] as Speed[]).map((s) => (
                  <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)} disabled={busy}>
                    {s === 'normal' ? 'Ver a máquina' : s === 'rapido' ? 'Rápido' : 'Sem animação'}
                  </button>
                ))}
              </div>
              <button type="button" className="btn primary" disabled={busy || letters.length === 0} onClick={() => void transmit()}>
                <Icon.Send /> Cifrar e gerar os QR
              </button>
              {busy && (
                <button type="button" className="btn small" onClick={() => abort.current?.abort()}>
                  Pular animação
                </button>
              )}
            </div>
          </div>

          <EnigmaView ctl={ctl} locked editable={false} listenKeyboard={false} plate={`ESTAÇÃO ${me}`} />
          {ctl.tape.input.length > 0 && (
            <div className="tape">
              <div className="tape-line">
                <span className="tape-label">Digitado</span>
                <span className="tape-text">{groupsOf5(ctl.tape.input)}</span>
              </div>
              <div className="tape-line">
                <span className="tape-label">Lâmpadas</span>
                <span className="tape-text">{groupsOf5(ctl.tape.output)}</span>
              </div>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card enigma">
            <h2>
              <span className="tag enigma">Enigma · 1940</span> Procedimento do operador
            </h2>
            <ol className="steps">
              {stepsEnigma.map((content, i) => (
                <li key={i} className={step > i + 1 || step === 6 ? 'done' : step === i + 1 ? 'active' : ''}>
                  {content}
                </li>
              ))}
            </ol>
            {check === 'ok' && (
              <div className="notice ok" style={{ marginTop: 10 }}>
                <Icon.Check />
                <span>A máquina animada acendeu exatamente o que o protocolo calculou.</span>
              </div>
            )}
            {check === 'falhou' && (
              <div className="notice danger" style={{ marginTop: 10 }}>
                <Icon.Alert />
                <span>A animação divergiu do cálculo. Avise a equipe: isto não deveria acontecer.</span>
              </div>
            )}
          </div>

          <div className="card modern">
            <h2>
              <span className="tag modern">AES-256-GCM · hoje</span> O que o computador faz
            </h2>
            {secret === undefined ? (
              <div className="notice warn">Esta folha não tem o segredo do par {me}–{to}.</div>
            ) : (
              <ol className="steps modern">
                <li className={aes !== null ? 'done' : ''}>
                  Segredo do par {me}–{to}: 256 bits da folha (nunca aparece na tela)
                </li>
                <li className={aes !== null ? 'done' : ''}>
                  Identificador da mensagem (96 bits aleatórios): <code>{aes?.msgId ?? '········'}</code>
                </li>
                <li className={aes !== null ? 'done' : ''}>
                  HKDF-SHA-256 deriva uma chave AES-256 só desta mensagem, no sentido {me}→{to}
                </li>
                <li className={aes !== null ? 'done' : ''}>
                  Texto em UTF-8 (com acentos) em {aesParts} {aesParts > 1 ? 'partes' : 'parte'}; cada uma com nonce (nº da
                  parte + “última”) e o cabeçalho como dado autenticado
                </li>
                <li className={aes !== null ? 'done' : ''}>
                  Saída: texto cifrado + etiqueta de 128 bits{' '}
                  {aes !== null && (
                    <code>
                      {toHex(aes.ciphertexts[0] ?? new Uint8Array()).slice(0, 24)}… tag {toHex((aes.ciphertexts[0] ?? new Uint8Array()).slice(-16)).slice(0, 8)}…
                    </code>
                  )}
                </li>
                <li className={aes !== null ? 'done' : ''}>Base45 → QR no modo alfanumérico</li>
              </ol>
            )}
          </div>
        </div>
      </div>

      {enigma !== null && step === 6 && (
        <div className="card" style={{ marginTop: 20 }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>QR para a estação {to}</h2>
            <div className="segmented" role="tablist" aria-label="Modo do QR">
              <button type="button" role="tab" aria-pressed={tab === 'enigma'} onClick={() => setTab('enigma')}>
                Enigma ({enigma.parts.length})
              </button>
              <button type="button" role="tab" aria-pressed={tab === 'aes'} onClick={() => setTab('aes')} disabled={aes === null}>
                AES-256-GCM ({aes?.frames.length ?? 0})
              </button>
            </div>
          </div>
          <div className="grid-2" style={{ marginTop: 16, alignItems: 'start' }}>
            {tab === 'enigma' ? (
              <QrCarousel frames={enigma.parts.map((p) => p.frame)} title={`Enigma ${me}→${to} nº ${enigma.nr}`} accent="enigma" />
            ) : (
              aes !== null && <QrCarousel frames={aes.frames} title={`AES ${me}→${to} ${aes.msgId.slice(0, 6)}`} accent="modern" />
            )}
            <div className="stack">
              <p className="small">
                Na outra máquina, abra <b>Receber</b> e aponte a câmera. Com várias partes o QR troca sozinho; a câmera junta
                as partes em qualquer ordem.
              </p>
              <details>
                <summary className="small muted" style={{ cursor: 'pointer' }}>
                  Ver o texto dentro dos QR (protocolo SCV1)
                </summary>
                <div className="cipher" style={{ marginTop: 8 }}>
                  {(tab === 'enigma' ? enigma.parts.map((p) => p.frame) : (aes?.frames ?? [])).join('\n\n')}
                </div>
              </details>
              <div className="row">
                <button
                  type="button"
                  className="btn small"
                  onClick={() =>
                    download(
                      tab === 'enigma' ? `enigma-${me}-${to}-${enigma.nr}.txt` : `aes-${me}-${to}-${aes?.msgId.slice(0, 8) ?? ''}.txt`,
                      tab === 'enigma' ? enigma.parts.map((p) => p.frame) : (aes?.frames ?? []),
                    )
                  }
                >
                  Salvar .txt (pendrive / cartão SD)
                </button>
                <button type="button" className="btn small" onClick={() => go('comparar')}>
                  Comparar Enigma × AES
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    setIntercepted(enigma.parts.map((p) => p.ciphertext).join(''));
                    go('bletchley');
                  }}
                >
                  Interceptar para Bletchley
                </button>
              </div>
              {tab === 'enigma' && (
                <dl className="kv small">
                  {enigma.parts.map((p, i) => (
                    <div key={i} style={{ display: 'contents' }}>
                      <dt>Parte {i + 1}</dt>
                      <dd>
                        indicador {p.grundstellung} {p.encryptedKey} · Kenngruppe {p.kenngruppe} · {p.ciphertext.length} letras ·
                        início {p.ciphertext.slice(0, 10)}
                        {[...p.plaintext].some((c, k) => c === p.ciphertext[k]) ? ' (!)' : ''}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
              {tab === 'enigma' && (
                <p className="small muted">
                  Repare: em nenhuma posição a letra cifrada é igual à letra original (
                  {enigma.parts.reduce((n, p) => n + [...p.plaintext].filter((c, k) => c === p.ciphertext[k]).length, 0)} coincidências em{' '}
                  {letters.length} letras). Em um texto aleatório seriam umas {Math.round(letters.length / 26)}.
                </p>
              )}
              {tab === 'aes' && aes !== null && (
                <p className="small muted">
                  Cada parte leva o cabeçalho em claro (de, para, dia, id, parte) e o resto ilegível. Mude uma vírgula no QR
                  e a etiqueta GCM recusa a parte inteira.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
