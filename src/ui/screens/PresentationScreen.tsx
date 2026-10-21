import { useCallback, useEffect, useRef, useState } from 'react';
import { QrCode } from '../qr/QrCode';
import { href } from '../router';
import titulo from './slides/1-titulo.webp';
import grupo from './slides/2-grupo.webp';
import problema from './slides/3-problema.webp';
import arquitetura from './slides/4-arquitetura.webp';
import engenharia from './slides/5-engenharia.webp';
import experimente from './slides/6-experimente.webp';
import obrigado from './slides/7-obrigado.webp';

/** Endereço público do app no GitHub Pages: o QR do slide "Experimente" abre aqui. */
const APP_URL = 'https://alvarezgonca.github.io/scv-enigma/';

/**
 * Slides desenhados pela Clara no Canva, exportados em 1920×1080. O texto de cada um vai no `alt`.
 * No slide "Experimente", o QR é desenhado pelo app em SVG por cima do da arte, nítido em qualquer
 * projetor.
 */
const SLIDES: readonly { id: string; src: string; alt: string; qr?: true }[] = [
  { id: 'titulo', src: titulo, alt: 'SCV Enigma: Enigma × criptografia moderna. SCV Technologies.' },
  { id: 'grupo', src: grupo, alt: 'Grupo: Clara Moledo, Daniel Alvarez e Victor Tatagiba.' },
  {
    id: 'problema',
    src: problema,
    alt:
      'O problema. O algoritmo raramente é o problema. A Enigma caiu por um detalhe de projeto (nenhuma letra vira ela mesma), ' +
      'procedimentos previsíveis e chaves capturadas. Os incidentes de hoje seguem o mesmo padrão. ' +
      '1941 · U-110: folhas de chaves capturadas. 2025 · C&M Software: credenciais e fornecedor no Pix. ' +
      '2026 · Meu INSS: consulta de serviço exposta, 2,8 milhões de CPFs. 2026 · Chaves Pix: exposições prolongadas de dados.',
  },
  {
    id: 'arquitetura',
    src: arquitetura,
    alt:
      'Arquitetura. Sem servidor: o QR é o canal. 01 Interface React · máquina 2.5D · som · PWA offline. ' +
      '02 core/protocol · quadros SCV1, folha de chaves, indicador de 1940. 03 core/enigma · I, M3, M4, passo duplo. ' +
      '04 core/modern · AES-256-GCM, HKDF, PBKDF2, Base45. 05 core/analysis · crib, Bomba em paralelo. ' +
      'Rede isolada e offline (Defesa Civil, infraestrutura crítica). LGPD por desenho: nada sai do aparelho, ' +
      'folha cifrada em repouso, segredo por par de estações (menor privilégio).',
  },
  {
    id: 'engenharia',
    src: engenharia,
    alt:
      'Engenharia. Provado, não prometido. A mensagem real da Operação Barbarossa (1941) decifra letra por letra. ' +
      'Dois navegadores trocam folha e mensagens por foto do QR. A câmera lê ao vivo. A Bomba quebra a Enigma no build de produção. ' +
      '77 testes automáticos. 0 dados pessoais coletados. Chance de falsificar no GCM: 1 em 2¹²⁸. ~7 s para a Bomba testar as 60 ordens.',
  },
  {
    id: 'experimente',
    src: experimente,
    alt:
      'Experimente. Aponte a câmera: a máquina abre no seu celular e funciona até sem internet. ' +
      'https://alvarezgonca.github.io/scv-enigma/ · https://github.com/Alvarezgonca/scv-enigma',
    qr: true,
  },
  { id: 'obrigado', src: obrigado, alt: 'Obrigado pela atenção.' },
];

export default function PresentationScreen() {
  const [i, setI] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const go = useCallback((d: number) => setI((x) => Math.max(0, Math.min(SLIDES.length - 1, x + d))), []);

  useEffect(() => {
    const on = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        go(1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [go]);

  // Baixa todos de uma vez: a troca fica instantânea e o service worker guarda para usar sem internet.
  useEffect(() => {
    for (const s of SLIDES) new Image().src = s.src;
  }, []);

  const slide = SLIDES[i] ?? SLIDES[0];
  return (
    <div className="slides" ref={root} aria-roledescription="apresentação">
      <section
        className="slide"
        aria-label={`Slide ${i + 1} de ${SLIDES.length}`}
        key={slide?.id}
        // Clique no terço esquerdo volta; no resto, avança (serve também em tela cheia, sem os botões).
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          go(e.clientX - r.left < r.width / 3 ? -1 : 1);
        }}
      >
        <img src={slide?.src} alt={slide?.alt} width={1920} height={1080} />
        {slide?.qr === true && (
          <div className="slide-qr">
            <QrCode text={APP_URL} label="QR com o endereço do app" ecl="M" />
          </div>
        )}
      </section>
      <div className="slide-nav no-print">
        <button type="button" className="btn small" onClick={() => go(-1)} disabled={i === 0} aria-label="Slide anterior">
          ‹
        </button>
        <span className="mono small">
          {i + 1}/{SLIDES.length}
        </span>
        <button type="button" className="btn small" onClick={() => go(1)} disabled={i === SLIDES.length - 1} aria-label="Próximo slide">
          ›
        </button>
        <button
          type="button"
          className="btn small ghost"
          onClick={() => {
            if (document.fullscreenElement === null) void root.current?.requestFullscreen();
            else void document.exitFullscreen();
          }}
        >
          Tela cheia
        </button>
        <a className="btn small ghost" href={href('maquina')}>
          Ir para a máquina
        </a>
      </div>
    </div>
  );
}
