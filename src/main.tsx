import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './ui/App';
import { AppProvider } from './ui/state';
import './ui/styles.css';
import './ui/screens/screens.css';

const root = document.getElementById('root');
if (root === null) throw new Error('#root ausente');

createRoot(root).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

// Instala o service worker: depois da primeira visita o app abre sem internet.
if (import.meta.env.PROD) registerSW({ immediate: true });
