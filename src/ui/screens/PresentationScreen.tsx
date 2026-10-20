import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../icons';
import { QrCode } from '../qr/QrCode';
import { href } from '../router';

/** Endereços públicos (valem depois de publicar o repositório e o GitHub Pages). */
const APP_URL = 'https://alvarezgonca.github.io/scv-enigma/';
const REPO_URL = 'https://github.com/Alvarezgonca/scv-enigma';

const SLIDES: readonly { id: string; render: () => React.JSX.Element }[] = [
  {
    id: 'titulo',
    render: () => (
      <div className="slide-center">
        <div className="slide-logo">
          <Icon.Logo />
        </div>
        <div className="eyebrow">Hackathon Univassouras Maricá 2026 · Desafio 2</div>
        <h1 className="slide-title">
          SCV Enigma: <em>Enigma</em> × <strong>criptografia moderna</strong>
        </h1>
        <p className="slide-lead">Uma rede de máquinas Enigma fiéis à original, por QR Code, ao lado do AES-256-GCM.</p>
        <p className="slide-team">Ana Clara Moledo Neves · Daniel Alvarez Gonçalves · Victor Bernardo Tatagiba</p>
      </div>
    ),
  },
  {
    id: 'problema',
    render: () => (
      <div className="slide-grid">
        <div>
          <div className="eyebrow">O problema</div>
          <h2 className="slide-h">O algoritmo raramente é o problema.</h2>
          <p className="slide-lead">
            A Enigma caiu por um detalhe de projeto (nenhuma letra vira ela mesma), procedimentos previsíveis e chaves
            capturadas. Os incidentes de hoje seguem o mesmo padrão.
          </p>
        </div>
        <ul className="slide-list">
          <li>
            <b>1941 · U-110</b> folhas de chaves capturadas
          </li>
          <li>
            <b>2025 · C&amp;M Software</b> credenciais e fornecedor no Pix
          </li>
          <li>
            <b>2026 · Meu INSS</b> consulta de serviço exposta: 2,8 milhões de CPFs
          </li>
          <li>
            <b>2026 · Chaves Pix</b> exposições prolongadas de dados
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'arquitetura',
    render: () => (
      <div>
        <div className="eyebrow">Arquitetura</div>
        <h2 className="slide-h">Sem servidor: o QR é o canal.</h2>
        <div className="slide-arch">
          <div className="arch-box ui">Interface React · máquina 2.5D · som · PWA offline</div>
          <div className="arch-row">
            <div className="arch-box">core/protocol · quadros SCV1, folha de chaves, indicador de 1940</div>
          </div>
          <div className="arch-row">
            <div className="arch-box enigma">core/enigma · I, M3, M4, passo duplo</div>
            <div className="arch-box modern">core/modern · AES-256-GCM, HKDF, PBKDF2, Base45</div>
            <div className="arch-box">core/analysis · crib, Bomba em paralelo</div>
          </div>
        </div>
        <p className="slide-lead small-lead">
          Rede isolada e offline (Defesa Civil, infraestrutura crítica). LGPD por desenho: nada sai do aparelho, folha cifrada em
          repouso, segredo por par de estações (menor privilégio).
        </p>
      </div>
    ),
  },
  {
    id: 'engenharia',
    render: () => (
      <div className="slide-grid">
        <div>
          <div className="eyebrow">Engenharia</div>
          <h2 className="slide-h">Provado, não prometido.</h2>
          <p className="slide-lead">
            A mensagem real da Operação Barbarossa (1941) decifra letra por letra. Dois navegadores trocam folha e mensagens por
            foto do QR. A câmera lê ao vivo. A Bomba quebra a Enigma no build de produção.
          </p>
        </div>
        <div className="slide-stats">
          <div>
            <b>77</b>
            <span>testes automáticos</span>
          </div>
          <div>
            <b>~7 s</b>
            <span>para a Bomba testar as 60 ordens</span>
          </div>
          <div>
            <b>2¹²⁸</b>
            <span>chance de falsificar no GCM: 1 em</span>
          </div>
          <div>
            <b>0</b>
            <span>dados pessoais coletados</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: 'fim',
    render: () => (
      <div className="slide-grid">
        <div>
          <div className="eyebrow">Experimente</div>
          <h2 className="slide-h">O caminho seguro tem de ser o mais fácil.</h2>
          <p className="slide-lead">Aponte a câmera: a máquina abre no seu celular e funciona até sem internet.</p>
          <p className="slide-team mono">{APP_URL}</p>
          <p className="slide-team mono">{REPO_URL}</p>
        </div>
        <div className="slide-qr">
          <QrCode text={APP_URL} label="QR com o endereço do app" ecl="M" />
        </div>
      </div>
    ),
  },
];

export default function PresentationScreen() {
  const [i, setI] = useState(0);
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

  const slide = SLIDES[i] ?? SLIDES[0];
  return (
    <div className="slides" aria-roledescription="apresentação">
      <section className="slide" aria-label={`Slide ${i + 1} de ${SLIDES.length}`} key={slide?.id}>
        {slide?.render()}
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
            if (document.fullscreenElement === null) void document.documentElement.requestFullscreen();
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
