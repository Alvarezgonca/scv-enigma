import { Suspense, lazy, useEffect } from 'react';
import { Icon } from './icons';
import { type Route, href, useRoute } from './router';
import { sound } from './sound';
import { useApp } from './state';
import { HomeScreen } from './screens/HomeScreen';
import { MachineScreen } from './screens/MachineScreen';
import { SendScreen } from './screens/SendScreen';
import { ReceiveScreen } from './screens/ReceiveScreen';
import { SheetScreen } from './screens/SheetScreen';

const CompareScreen = lazy(() => import('./screens/CompareScreen'));
const BletchleyScreen = lazy(() => import('./screens/BletchleyScreen'));
const HistoryScreen = lazy(() => import('./screens/HistoryScreen'));

interface NavItem {
  readonly route: Route;
  readonly label: string;
  readonly short: string;
  readonly icon: () => React.JSX.Element;
}

const NAV: readonly NavItem[] = [
  { route: 'maquina', label: 'Máquina', short: 'Máquina', icon: Icon.Machine },
  { route: 'enviar', label: 'Transmitir', short: 'Enviar', icon: Icon.Send },
  { route: 'receber', label: 'Receber', short: 'Receber', icon: Icon.Receive },
  { route: 'folha', label: 'Folha de chaves', short: 'Folha', icon: Icon.Sheet },
  { route: 'comparar', label: 'Enigma × AES', short: 'Comparar', icon: Icon.Compare },
  { route: 'bletchley', label: 'Bletchley Park', short: 'Bletchley', icon: Icon.Bombe },
  { route: 'historia', label: 'História', short: 'História', icon: Icon.Book },
];

const MOBILE: readonly Route[] = ['maquina', 'enviar', 'receber', 'comparar', 'bletchley'];

function Screen({ route }: { route: Route }) {
  switch (route) {
    case 'inicio':
      return <HomeScreen />;
    case 'maquina':
      return <MachineScreen />;
    case 'enviar':
      return <SendScreen />;
    case 'receber':
      return <ReceiveScreen />;
    case 'folha':
      return <SheetScreen />;
    case 'comparar':
      return <CompareScreen />;
    case 'bletchley':
      return <BletchleyScreen />;
    case 'historia':
      return <HistoryScreen />;
  }
}

export function App() {
  const route = useRoute();
  const { sheet, station, prefs, setPrefs } = useApp();

  useEffect(() => {
    const title = NAV.find((n) => n.route === route)?.label;
    document.title = title === undefined ? 'SCV Enigma — Enigma × Criptografia Moderna' : `${title} · SCV Enigma`;
  }, [route]);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href={href('inicio')}>
          <span className="brand-mark">
            <Icon.Logo />
          </span>
          <span>
            <span className="brand-name">SCV ENIGMA</span>
            <span className="brand-sub">Enigma × criptografia moderna</span>
          </span>
        </a>
        <nav className="nav top" aria-label="Seções">
          {NAV.map((n) => (
            <a key={n.route} href={href(n.route)} aria-current={route === n.route ? 'page' : undefined}>
              <n.icon />
              {n.label}
            </a>
          ))}
        </nav>
        <a className="station-badge" href={href('folha')} title="Estação e rede desta máquina" style={{ textDecoration: 'none' }}>
          <span className={`dot${station === null ? ' off' : ''}`} />
          {station === null ? (
            <span>sem folha</span>
          ) : (
            <span>
              <b>{station}</b>
              <span className="net"> · rede {sheet?.net}</span>
            </span>
          )}
        </a>
        <button
          type="button"
          className="icon-btn"
          aria-label={prefs.sound ? 'Desligar o som' : 'Ligar o som'}
          aria-pressed={prefs.sound}
          onClick={() => {
            setPrefs({ sound: !prefs.sound });
            if (!prefs.sound) setTimeout(() => sound.keyDown(), 30);
          }}
        >
          <Icon.Sound on={prefs.sound} />
        </button>
      </header>
      <main id="conteudo">
        <Suspense fallback={<p className="muted">Carregando…</p>}>
          <Screen route={route} />
        </Suspense>
        <p className="footer-note">
          SCV Technologies · Hackathon Univassouras Maricá 2026 · funciona offline, nada sai do seu aparelho ·{' '}
          <a href={href('historia')}>referências</a>
        </p>
      </main>
      <nav className="bottom-nav" aria-label="Seções principais">
        {NAV.filter((n) => MOBILE.includes(n.route)).map((n) => (
          <a key={n.route} href={href(n.route)} aria-current={route === n.route ? 'page' : undefined}>
            <n.icon />
            {n.short}
          </a>
        ))}
      </nav>
    </div>
  );
}
