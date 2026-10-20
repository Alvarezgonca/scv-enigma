import { useEffect, useMemo, useState } from 'react';
import {
  ATTACKERS,
  IC_PORTUGUESE,
  IC_RANDOM,
  PT_LETTER_PERCENT,
  benchmarkEnigma,
  byteCounts,
  enigmaSelfMatrix,
  expectedSeconds,
  humanDuration,
  indexOfCoincidence,
  letterCounts,
  scientificBig,
  universes,
  scientific,
} from '../../core/analysis';
import {
  type EnigmaSettings,
  type KeySpace,
  aesKeySpace,
  encryptText,
  enigmaArmyKeySpace,
  enigmaM4KeySpace,
  groupsOf5,
  prepareText,
  settingsFrom,
} from '../../core/enigma';
import { base45Encode, randomInt, randomLetters, systemRandom, toHex, utf8 } from '../../core/modern';
import { type Frame, encryptEnigmaMessage, generateKeySheet, pairSecret, parseFrame, sealAesMessage } from '../../core/protocol';
import { Icon } from '../icons';
import { useApp } from '../state';
import { type Decoded, decodeFrames, tamper } from './receive-logic';

const DEFAULT = 'Para estação BRAVO, de estação ALFA: abrigo aberto no ginásio de Itaipuaçu. Enviar colchões e água às 06h00.';

function Bars({ spaces }: { spaces: readonly KeySpace[] }) {
  const max = 256;
  return (
    <div className="bars" role="list" aria-label="Espaço de chaves em bits">
      {spaces.map((k) => (
        <div className="bar-row" key={k.name} role="listitem">
          <span>{k.name}</span>
          <div className="bar-track">
            <div className={`bar-fill ${k.name.startsWith('AES') ? 'modern' : 'enigma'}`} style={{ width: `${(k.bits / max) * 100}%` }} />
          </div>
          <span className="mono small">{k.bits.toFixed(1)} bits</span>
        </div>
      ))}
    </div>
  );
}

function Histogram({ values, color, labels }: { values: readonly number[]; color: string; labels?: string }) {
  const max = Math.max(...values, 1e-9);
  return (
    <div>
      <div className={`hist${values.length > 60 ? ' dense' : ''}`}>
        {values.map((v, i) => (
          <div key={i} style={{ height: `${(v / max) * 100}%`, background: color }} title={labels === undefined ? String(i) : `${labels[i] ?? ''}: ${v.toFixed(2)}`} />
        ))}
      </div>
      {labels !== undefined && (
        <div className="hist-labels" aria-hidden="true">
          {[...labels].map((l) => (
            <span key={l}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function Heat({ matrix }: { matrix: readonly (readonly number[])[] }) {
  const max = Math.max(...matrix.flat(), 1);
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return (
    <div className="heat" role="img" aria-label="Matriz letra de entrada por letra de saída; a diagonal é toda vazia">
      <span />
      {[...A].map((c) => (
        <span key={c}>{c}</span>
      ))}
      {matrix.map((row, i) => (
        <div key={i} style={{ display: 'contents' }}>
          <span>{A[i]}</span>
          {row.map((v, j) => (
            <span
              key={j}
              className={`cell${i === j ? ' diag' : ''}`}
              style={{ background: i === j ? 'rgb(239 91 91 / 18%)' : `rgb(224 166 75 / ${0.08 + (v / max) * 0.85})` }}
              title={`${A[i] ?? ''}→${A[j] ?? ''}: ${v}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

interface Comparison {
  readonly settings: EnigmaSettings;
  readonly letters: string;
  readonly enigma: string;
  readonly enigmaAgain: string;
  readonly aes: Uint8Array;
  readonly aesAgain: Uint8Array;
  readonly aesSelf: { readonly same: number; readonly total: number };
}

async function aesOnce(text: string, key: CryptoKey): Promise<Uint8Array> {
  const iv = systemRandom.bytes(12);
  return new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(utf8(text))));
}

interface Seed {
  readonly rings: string;
  readonly positions: string;
}

function newSeed(): Seed {
  return { rings: randomLetters(3), positions: randomLetters(3) };
}

async function compare(text: string, seed: Seed): Promise<Comparison> {
  const settings = settingsFrom({ rotors: 'II IV V', rings: seed.rings, positions: seed.positions, plugboard: 'AV BS CG DL FU HZ IN KM OW RX' });
  const letters = prepareText(text);
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  // Coincidências no AES: cifra 20 mil letras aleatórias e conta byte cifrado igual ao byte claro.
  const sample = new Uint8Array(20_000);
  for (let i = 0; i < sample.length; i++) sample[i] = 65 + randomInt(26);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(systemRandom.bytes(12)) }, key, sample));
  let same = 0;
  for (let i = 0; i < sample.length; i++) if (ct[i] === sample[i]) same++;
  return {
    settings,
    letters,
    enigma: encryptText(settings, letters),
    enigmaAgain: encryptText(settings, letters),
    aes: await aesOnce(text, key),
    aesAgain: await aesOnce(text, key),
    aesSelf: { same, total: sample.length },
  };
}

function TamperSideBySide({ text }: { text: string }) {
  const [res, setRes] = useState<{ before: [Decoded, Decoded]; after: [Decoded, Decoded] } | null>(null);
  const run = async (): Promise<void> => {
    const sheet = generateKeySheet({ net: 'DEMO', stations: ['ALFA', 'BRAVO'], start: new Date(), days: 1 });
    const day = sheet.days[0];
    const secret = pairSecret(sheet, 'ALFA', 'BRAVO');
    if (day === undefined || secret === undefined) return;
    const e = encryptEnigmaMessage({ from: 'ALFA', to: 'BRAVO', day, letters: prepareText(text) });
    const a = await sealAesMessage({ from: 'ALFA', to: 'BRAVO', day: day.day, text, pairSecret: secret });
    const ef: Frame[] = e.parts.map((p) => parseFrame(p.frame));
    const af: Frame[] = a.frames.map((f) => parseFrame(f));
    setRes({
      before: [await decodeFrames(ef, sheet), await decodeFrames(af, sheet)],
      after: [await decodeFrames(tamper(ef, 'letra', sheet.stations), sheet), await decodeFrames(tamper(af, 'letra', sheet.stations), sheet)],
    });
  };
  const show = (d: Decoded, original?: Decoded): React.JSX.Element => {
    if (d.kind === 'E') {
      const base = original?.kind === 'E' ? original.text : d.text;
      return (
        <div className="cipher plain small">
          {[...d.text].map((c, i) =>
            c === base[i] ? (
              <span key={i}>{c === 'X' ? ' ' : c}</span>
            ) : (
              <mark key={i} style={{ background: 'rgb(239 91 91 / 45%)', color: 'inherit', borderRadius: 3 }} title={`era ${base[i] ?? ''}`}>
                {c}
              </mark>
            ),
          )}
        </div>
      );
    }
    if (d.kind === 'A' && d.result.text !== null) return <div className="cipher plain small">{d.result.text}</div>;
    return (
      <div className="notice danger small">
        <Icon.X /> Recusada: a etiqueta GCM não confere. Nenhum texto entregue.
      </div>
    );
  };
  return (
    <div className="card">
      <h2>Alguém troca um caractere no meio do caminho</h2>
      <p>As duas versões da mesma mensagem passam pelo mesmo ataque: um caractere alterado no QR.</p>
      <button type="button" className="btn primary" onClick={() => void run()}>
        Simular o ataque
      </button>
      {res !== null && (
        <div className="grid-2" style={{ marginTop: 14 }}>
          <div className="stack">
            <span className="tag enigma">Enigma</span>
            {show(res.after[0], res.before[0])}
            <div className="notice danger small">
              <Icon.Alert /> Texto adulterado entregue como legítimo (em vermelho, o que mudou). Nenhum alarme.
            </div>
          </div>
          <div className="stack">
            <span className="tag modern">AES-256-GCM</span>
            {show(res.after[1])}
            <div className="notice ok small">
              <Icon.Check /> Adulteração detectada. Chance de falsificar sem a chave: 1 em 2¹²⁸.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompareScreen() {
  const { lastMessage } = useApp();
  const [text, setText] = useState(lastMessage?.text ?? DEFAULT);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const spaces = useMemo(() => [enigmaArmyKeySpace(false), enigmaArmyKeySpace(true), enigmaM4KeySpace(), aesKeySpace(128), aesKeySpace(256)], []);
  const self = useMemo(() => enigmaSelfMatrix(26 * 26 * 40), []);

  const [seed, setSeed] = useState<Seed>(newSeed);

  // Recalcula enquanto a pessoa digita (com uma pequena espera para não cifrar a cada tecla).
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      void compare(text, seed).then((c) => {
        if (alive) setCmp(c);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [text, seed]);

  const enigmaSpace = spaces[1];
  const aesSpace = spaces[4];
  const plainCounts = cmp === null ? null : letterCounts(cmp.letters);
  const cipherCounts = cmp === null ? null : letterCounts(cmp.enigma);
  const aesCounts = cmp === null ? null : byteCounts([cmp.aes]);
  const coincidences = cmp === null ? 0 : [...cmp.letters].filter((c, i) => c === cmp.enigma[i]).length;
  const attackers = [
    ...(speed === null ? [] : [{ id: 'aqui', label: 'Este aparelho (medido agora, JavaScript)', keysPerSecond: speed, note: '' }]),
    ...ATTACKERS,
  ];

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Antigo × moderno</div>
          <h1>Enigma × AES-256-GCM</h1>
          <p>
            A mesma mensagem nos dois mundos: tamanho da chave, força bruta, a falha que derrubou a Enigma, frequência das
            letras e o que acontece quando alguém mexe na mensagem no caminho.
          </p>
        </div>
      </div>

      <div className="card">
        <label className="field">
          Mensagem
          <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} />
        </label>
        <div className="row" style={{ marginTop: 10 }}>
          <button type="button" className="btn small" onClick={() => setSeed(newSeed())}>
            Sortear outra chave
          </button>
          <span className="small muted">As duas cifras se refazem enquanto você digita.</span>
        </div>
        {cmp !== null && (
          <div className="grid-2" style={{ marginTop: 14 }}>
            <div className="stack">
              <span className="tag enigma">Enigma · {cmp.letters.length} letras</span>
              <div className="cipher">{groupsOf5(cmp.enigma)}</div>
            </div>
            <div className="stack">
              <span className="tag modern">AES-256-GCM · {cmp.aes.length} bytes (16 de etiqueta)</span>
              <div className="cipher">{base45Encode(cmp.aes)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="vs" style={{ marginTop: 20 }}>
        <div className="h enigma">Enigma (1930–1945)</div>
        <div className="h modern">AES-256-GCM (2001 / 2007)</div>
        <div>Rotores, refletor e plugboard: substituição que muda a cada tecla.</div>
        <div>Cifra de bloco de 128 bits (Rijndael) em modo contador com autenticação Galois.</div>
        <div>
          Espaço de chaves: <b>{scientificBig(enigmaSpace.total)}</b> (~{enigmaSpace.bits.toFixed(0)} bits).
        </div>
        <div>
          Espaço de chaves: <b>{scientificBig(aesSpace.total)}</b> (256 bits).
        </div>
        <div>Uma letra NUNCA vira ela mesma (o refletor obriga). Isso entrega onde o crib está.</div>
        <div>Qualquer byte pode virar qualquer outro, inclusive ele mesmo (1 em 256).</div>
        <div>Não detecta adulteração: texto alterado sai alterado, sem aviso.</div>
        <div>Etiqueta de 128 bits: qualquer bit alterado, no texto ou no cabeçalho, é recusado.</div>
        <div>Mesma chave + mesma mensagem = mesmo texto cifrado (vaza repetições).</div>
        <div>Sal e nonce novos: cifrar duas vezes dá dois textos diferentes.</div>
        <div>Todas as estações da rede leem tudo e podem se passar por qualquer outra.</div>
        <div>Segredo por par de estações: só remetente e destinatário leem e autenticam.</div>
        <div>Texto conhecido + estrutura = chave em segundos (Bomba).</div>
        <div>Texto conhecido não ajuda; computador quântico (Grover) ainda precisa de ~2¹²⁸ passos.</div>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card">
          <h2>Espaço de chaves</h2>
          <p>Em bits (log₂ do número de chaves). Cada bit a mais dobra o trabalho do atacante.</p>
          <Bars spaces={spaces} />
          <p className="small" style={{ marginTop: 10 }}>
            Enigma do Exército: 60 ordens × 17.576 posições × 150.738.274.937.250 plugboards = 158.962.555.217.826.360.000
            (NSA, A. Ray Miller). Com os anéis que importam, × 676.
          </p>
        </div>
        <div className="card">
          <h2>Força bruta: tempo médio</h2>
          <p>Metade do espaço de chaves, no ritmo de cada atacante.</p>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Atacante</th>
                  <th>Enigma (anéis)</th>
                  <th>AES-256</th>
                </tr>
              </thead>
              <tbody>
                {attackers.map((a) => (
                  <tr key={a.id}>
                    <td>
                      {a.label}
                      <div className="small muted">
                        {a.id === 'aqui' ? `${Math.round(a.keysPerSecond).toLocaleString('pt-BR')} chaves/s num só núcleo` : a.note}
                      </div>
                    </td>
                    <td className="mono small">{humanDuration(expectedSeconds(enigmaSpace.total, a.keysPerSecond))}</td>
                    <td className="mono small">
                      {humanDuration(expectedSeconds(aesSpace.total, a.keysPerSecond))}
                      <div className="muted">{scientific(universes(expectedSeconds(aesSpace.total, a.keysPerSecond)))} idades do universo</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button type="button" className="btn small" onClick={() => setSpeed(benchmarkEnigma(400))}>
              Medir este aparelho
            </button>
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Mas a Enigma não caiu por força bruta: a Bomba usava a estrutura e eliminava o plugboard, e testava uma ordem de
            rotores em ~20 minutos em 1940. Veja no modo Bletchley Park.
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 20 }}>
        <div className="card enigma">
          <h2>A falha: nenhuma letra vira ela mesma</h2>
          <p>
            {self.total.toLocaleString('pt-BR')} letras aleatórias cifradas com chaves aleatórias. Linha = letra digitada,
            coluna = lâmpada. A diagonal (vermelha) tem <b>{self.diagonal}</b> ocorrências: é sempre zero.
          </p>
          <Heat matrix={self.matrix} />
          {cmp !== null && (
            <p className="small" style={{ marginTop: 10 }}>
              Na sua mensagem: {coincidences} letras iguais ao original em {cmp.letters.length} (um texto aleatório teria
              ~{Math.round(cmp.letters.length / 26)}). No AES: {cmp.aesSelf.same} bytes iguais em{' '}
              {cmp.aesSelf.total.toLocaleString('pt-BR')} (esperado ~{Math.round(cmp.aesSelf.total / 256)}, 1 em 256).
            </p>
          )}
        </div>
        <div className="card">
          <h2>Análise de frequência</h2>
          <p>
            Contar letras quebra cifras simples (César troca A por D sempre). A Enigma muda o alfabeto a cada tecla e achata as
            frequências; o AES deixa os bytes uniformes.
          </p>
          <div className="stack">
            <div>
              <div className="small muted">Português (Dom Casmurro) · IC {IC_PORTUGUESE.toFixed(3)}</div>
              <Histogram values={PT_LETTER_PERCENT} color="#8a7f6c" labels="ABCDEFGHIJKLMNOPQRSTUVWXYZ" />
            </div>
            {plainCounts !== null && cipherCounts !== null && aesCounts !== null && (
              <>
                <div>
                  <div className="small muted">Sua mensagem (claro) · IC {indexOfCoincidence(plainCounts).toFixed(3)}</div>
                  <Histogram values={plainCounts} color="var(--cream)" labels="ABCDEFGHIJKLMNOPQRSTUVWXYZ" />
                </div>
                <div>
                  <div className="small muted">
                    Enigma · IC {indexOfCoincidence(cipherCounts).toFixed(3)} (aleatório = {IC_RANDOM.toFixed(3)})
                  </div>
                  <Histogram values={cipherCounts} color="var(--enigma)" labels="ABCDEFGHIJKLMNOPQRSTUVWXYZ" />
                </div>
                <div>
                  <div className="small muted">AES-256-GCM · 256 valores de byte</div>
                  <Histogram values={aesCounts} color="var(--modern)" />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {cmp !== null && (
        <div className="card" style={{ marginTop: 20 }}>
          <h2>A mesma mensagem cifrada duas vezes com a mesma chave</h2>
          <div className="grid-2">
            <div className="stack">
              <span className="tag enigma">Enigma</span>
              <div className="cipher small">{cmp.enigma.slice(0, 40)}…</div>
              <div className="cipher small">{cmp.enigmaAgain.slice(0, 40)}…</div>
              <div className={`notice ${cmp.enigma === cmp.enigmaAgain ? 'danger' : 'ok'} small`}>
                {cmp.enigma === cmp.enigmaAgain ? 'Idênticos: quem escuta sabe que a mensagem se repetiu.' : 'Diferentes.'}
              </div>
            </div>
            <div className="stack">
              <span className="tag modern">AES-256-GCM</span>
              <div className="cipher small">{toHex(cmp.aes).slice(0, 40)}…</div>
              <div className="cipher small">{toHex(cmp.aesAgain).slice(0, 40)}…</div>
              <div className="notice ok small">Diferentes: nonce aleatório a cada cifragem (segurança semântica).</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <TamperSideBySide text={text} />
      </div>
    </>
  );
}
