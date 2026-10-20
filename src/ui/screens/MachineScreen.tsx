import { useRef, useState } from 'react';
import {
  type EnigmaModel,
  type EnigmaSettings,
  type Pair,
  EnigmaSettingsError,
  MODELS,
  describeSettings,
  formatPlugboard,
  groupsOf5,
  parsePlugboard,
  settingsFrom,
  toLetter,
  validateSettings,
} from '../../core/enigma';
import { settingsForDay, todayKey } from '../../core/protocol';
import { EnigmaView } from '../machine/EnigmaView';
import { PathDiagram } from '../machine/PathDiagram';
import { useEnigma } from '../machine/useEnigma';
import { useApp } from '../state';

const BARBAROSSA = {
  settings: settingsFrom({ rotors: 'II IV V', rings: '02 21 12', positions: 'BLA', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' }),
  cipher: 'EDPUDNRGYSZRCXNUYTPOMRMBOFKTBZREZKMLXLVEFGUEYSIOZVEQMIK',
};

function modelDefaults(model: EnigmaModel, current: EnigmaSettings): EnigmaSettings {
  if (model === 'M4') {
    return { ...current, model, reflector: 'B-fino', greek: { name: 'Beta', ring: 0, position: 0 } };
  }
  const rule = MODELS[model];
  const rotors = current.rotors.map((r, i) =>
    rule.rotors.includes(r.name) ? r : { ...r, name: rule.rotors[i] ?? 'I' },
  ) as unknown as EnigmaSettings['rotors'];
  return { ...current, model, rotors, reflector: rule.reflectors.includes('B') ? 'B' : (rule.reflectors[0] ?? 'B'), greek: null };
}

/** Plugboard por texto ("AV BS CG"): mais rápido que arrastar e acessível por leitor de tela. */
function PlugboardText({ settings, disabled, onApply }: { settings: EnigmaSettings; disabled: boolean; onApply: (pairs: Pair[]) => void }) {
  const current = formatPlugboard(settings.plugboard);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? current;
  const apply = (): void => {
    try {
      const pairs = parsePlugboard(value);
      const problems = validateSettings({ ...settings, plugboard: pairs });
      if (problems.length > 0) {
        setError(problems.join('; '));
        return;
      }
      onApply(pairs);
      setDraft(null);
      setError(null);
    } catch (e) {
      setError(e instanceof EnigmaSettingsError ? e.problems.join('; ') : 'pares inválidos');
    }
  };
  return (
    <div className="stack" style={{ marginTop: 12, gap: 6 }}>
      <label className="field">
        Plugboard por texto (pares separados por espaço)
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            type="text"
            value={value}
            disabled={disabled}
            placeholder="ex.: AV BS CG DL FU HZ IN KM OW RX"
            onChange={(e) => setDraft(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') apply();
            }}
            style={{ fontFamily: 'var(--mono)' }}
          />
          <button type="button" className="btn small" disabled={disabled || draft === null} onClick={apply}>
            Aplicar
          </button>
        </div>
      </label>
      {error !== null && <div className="notice warn small">{error}</div>}
    </div>
  );
}

export function MachineScreen() {
  const { sheet } = useApp();
  const ctl = useEnigma(settingsFrom({ rotors: 'I II III' }));
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const s = ctl.settings;
  const day = sheet === null ? undefined : todayKey(sheet);

  const runBarbarossa = async (): Promise<void> => {
    ctl.setSettings(BARBAROSSA.settings);
    ctl.clearTape();
    setBusy(true);
    abort.current = new AbortController();
    try {
      await ctl.autoType(BARBAROSSA.cipher, { delayMs: 120, signal: abort.current.signal });
    } catch {
      /* cancelado */
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Máquina</div>
          <h1>Enigma fiel à original</h1>
          <p>
            Digite no teclado da tela ou no do computador. A cada tecla o rotor da direita anda, a corrente faz o caminho
            de ida e volta e a lâmpada acende a letra cifrada. Abra a tampa para trocar rotores e anéis; arraste os cabos
            do plugboard.
          </p>
        </div>
      </div>

      <div className="grid-main">
        <div>
          <EnigmaView ctl={ctl} locked={busy} editable={!busy} plate={MODELS[s.model].label.split(' (')[0]?.toUpperCase() ?? 'ENIGMA'} />
          <div className="tape" aria-label="Fita de papel com o que foi digitado e o que acendeu">
            <div className="tape-line">
              <span className="tape-label">Digitado</span>
              <span className="tape-text">{groupsOf5(ctl.tape.input) || '—'}</span>
            </div>
            <div className="tape-line">
              <span className="tape-label">Lâmpadas</span>
              <span className="tape-text">{groupsOf5(ctl.tape.output) || '—'}</span>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Configuração atual (a chave)</h2>
            <p className="small mono" style={{ color: 'var(--text)' }}>
              {describeSettings(s)}
            </p>
            <label className="field">
              Modelo
              <select
                value={s.model}
                disabled={busy}
                onChange={(e) => ctl.setSettings(modelDefaults(e.target.value as EnigmaModel, s))}
              >
                {(Object.keys(MODELS) as EnigmaModel[]).map((m) => (
                  <option key={m} value={m}>
                    {MODELS[m].label}
                  </option>
                ))}
              </select>
            </label>
            <PlugboardText settings={s} disabled={busy} onApply={(pairs) => ctl.setSettings({ ...s, plugboard: pairs })} />
            <div className="row" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="btn small"
                disabled={busy}
                onClick={() => {
                  ctl.setSettings(settingsFrom({ rotors: 'I II III' }));
                  ctl.clearTape();
                }}
              >
                Zerar (I II III, AAA)
              </button>
              {day !== undefined && (
                <button
                  type="button"
                  className="btn small"
                  disabled={busy}
                  onClick={() => {
                    ctl.setSettings(settingsForDay(day, [0, 0, 0]));
                    ctl.clearTape();
                  }}
                >
                  Chave do dia {day.day} da folha
                </button>
              )}
              <button type="button" className="btn small" disabled={busy} onClick={() => ctl.clearTape()}>
                Limpar a fita
              </button>
            </div>
          </div>

          <div className="card enigma">
            <h2>Decifre uma mensagem real de 1941</h2>
            <p>
              Operação Barbarossa, frente oriental, julho de 1941. Chave do dia: rotores II IV V, anéis 02 21 12, dez
              cabos. A chave da mensagem era BLA. A máquina vai digitar o texto interceptado; olhe as lâmpadas: sai alemão.
            </p>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={() => void runBarbarossa()}>
                Digitar o texto de 1941
              </button>
              {busy && (
                <button type="button" className="btn small" onClick={() => abort.current?.abort()}>
                  Parar
                </button>
              )}
            </div>
            {ctl.tape.output.startsWith('AUFKL') && (
              <p className="small" style={{ marginTop: 10 }}>
                <b>AUFKL X ABTEILUNG X VON X KURTINOWA</b>: “Destacamento de reconhecimento, de Kurtinowa…”. O X era o
                espaço dos operadores alemães.
              </p>
            )}
          </div>

          <div className="card">
            <h2>Última tecla</h2>
            {ctl.trace === null ? (
              <p>Nenhuma tecla ainda.</p>
            ) : (
              <dl className="kv">
                <dt>Entrou</dt>
                <dd>{toLetter(ctl.trace.input)}</dd>
                <dt>Acendeu</dt>
                <dd>{toLetter(ctl.trace.output)}</dd>
                <dt>Rotores</dt>
                <dd>
                  {ctl.trace.positions.map(toLetter).join(' ')}{' '}
                  {ctl.trace.doubleStep ? '· passo duplo do rotor do meio!' : ctl.trace.stepped[1] ? '· o do meio andou' : ''}
                </dd>
              </dl>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h2>Caminho elétrico da última letra</h2>
        <p>
          Ida em amarelo, volta em vermelho. A volta nunca pode cair no mesmo fio da ida, porque o refletor liga cada
          contato a OUTRO contato. Por isso a Enigma nunca cifra uma letra nela mesma: a falha que Bletchley Park explorou.
        </p>
        <PathDiagram trace={ctl.trace} settings={s} />
      </div>
    </>
  );
}
