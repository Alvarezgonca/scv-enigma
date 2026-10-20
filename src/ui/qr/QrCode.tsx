import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';

export type Ecl = 'L' | 'M' | 'Q' | 'H';

/** Desenha o QR como SVG nosso (sem injetar HTML): cada módulo escuro vira um quadradinho. */
export function QrCode({ text, ecl = 'M', label, className }: { text: string; ecl?: Ecl; label: string; className?: string }) {
  const qr = useMemo(() => {
    try {
      return QRCode.create(text, { errorCorrectionLevel: ecl });
    } catch {
      return null;
    }
  }, [text, ecl]);
  if (qr === null) return <div className="notice danger">Texto grande demais para um QR.</div>;
  const n = qr.modules.size;
  const quiet = 4;
  let d = '';
  for (let row = 0; row < n; row++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.data[row * n + c] === 1) d += `M${c + quiet} ${row + quiet}h1v1h-1z`;
    }
  }
  return (
    <svg
      className={className ?? 'qr'}
      viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
      data-qr-version={qr.version}
    >
      <rect width="100%" height="100%" fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  );
}

/**
 * Várias partes viram um "QR animado": troca de quadro sozinho, e o receptor só precisa apontar
 * a câmera e esperar juntar todas. Também dá para pausar e passar à mão, ou imprimir todas.
 */
export function QrCarousel({
  frames,
  title,
  accent = 'enigma',
  intervalMs = 1400,
}: {
  frames: readonly string[];
  title: string;
  accent?: 'enigma' | 'modern';
  intervalMs?: number;
}) {
  const [shown, setShown] = useState<{ frames: readonly string[]; i: number }>({ frames, i: 0 });
  const [playing, setPlaying] = useState(true);
  const total = frames.length;
  // Mensagem nova: volta para a parte 1 (estado derivado, ajustado durante a renderização).
  if (shown.frames !== frames) setShown({ frames, i: 0 });
  const i = shown.frames === frames ? shown.i : 0;
  const setI = (f: (x: number) => number): void => setShown((st) => ({ frames: st.frames, i: f(st.i) }));

  useEffect(() => {
    if (!playing || total <= 1) return;
    const t = setInterval(() => setShown((st) => ({ frames: st.frames, i: (st.i + 1) % total })), intervalMs);
    return () => clearInterval(t);
  }, [playing, total, intervalMs]);

  const current = frames[Math.min(i, total - 1)] ?? '';

  const printAll = (): void => {
    const w = window.open('', '_blank', 'noopener=no,width=900,height=1000');
    if (w === null) return;
    const doc = w.document;
    doc.title = title;
    const style = doc.createElement('style');
    style.textContent =
      'body{font-family:monospace;margin:24px}figure{display:inline-block;width:46%;margin:1%;page-break-inside:avoid;text-align:center}svg{width:100%;height:auto}figcaption{font-size:12px;margin-top:6px}';
    doc.head.appendChild(style);
    const h = doc.createElement('h2');
    h.textContent = title;
    doc.body.appendChild(h);
    document.querySelectorAll<SVGSVGElement>(`[data-print-group="${CSS.escape(title)}"] svg`).forEach((svg, idx) => {
      const fig = doc.createElement('figure');
      fig.appendChild(doc.importNode(svg, true));
      const cap = doc.createElement('figcaption');
      cap.textContent = `Parte ${idx + 1} de ${total}`;
      fig.appendChild(cap);
      doc.body.appendChild(fig);
    });
    w.focus();
    w.print();
  };

  return (
    <div className={`qr-carousel ${accent}`}>
      <div className="qr-frame">
        <QrCode text={current} label={`${title}: parte ${i + 1} de ${total}`} ecl="M" />
        {total > 1 && (
          <div className="qr-badge">
            {i + 1}/{total}
          </div>
        )}
      </div>
      {total > 1 && (
        <div className="qr-dots" aria-hidden="true">
          {frames.map((_, k) => (
            <span key={k} className={k === i ? 'on' : ''} />
          ))}
        </div>
      )}
      <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
        {total > 1 && (
          <>
            <button type="button" className="btn small" onClick={() => setI((x) => (x - 1 + total) % total)} aria-label="Parte anterior">
              ‹
            </button>
            <button type="button" className="btn small" onClick={() => setPlaying(!playing)}>
              {playing ? 'Pausar' : 'Animar'}
            </button>
            <button type="button" className="btn small" onClick={() => setI((x) => (x + 1) % total)} aria-label="Próxima parte">
              ›
            </button>
          </>
        )}
        <button type="button" className="btn small ghost" onClick={printAll}>
          Imprimir {total > 1 ? `as ${total} partes` : 'o QR'}
        </button>
      </div>
      <div hidden data-print-group={title}>
        {frames.map((f, k) => (
          <QrCode key={k} text={f} ecl="Q" label={`parte ${k + 1}`} />
        ))}
      </div>
    </div>
  );
}
