import { useEffect, useState } from 'react';

export type Route = 'inicio' | 'maquina' | 'enviar' | 'receber' | 'folha' | 'comparar' | 'bletchley' | 'historia' | 'apresentacao';

const ROUTES: readonly Route[] = ['inicio', 'maquina', 'enviar', 'receber', 'folha', 'comparar', 'bletchley', 'historia', 'apresentacao'];

function current(): Route {
  const h = window.location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'inicio';
}

/** Rotas por hash: funciona no GitHub Pages e offline, sem configurar servidor. */
export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(current);
  useEffect(() => {
    const on = (): void => {
      setRoute(current());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(route: Route): void {
  window.location.hash = `#/${route}`;
}

export function href(route: Route): string {
  return `#/${route}`;
}
