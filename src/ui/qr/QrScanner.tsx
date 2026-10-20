import { useCallback, useEffect, useRef, useState } from 'react';
import { decodeImage } from './decode';

/**
 * Câmera que lê QR continuamente. Tem duas reservas para a apresentação não depender de nada:
 * foto da galeria (ou do próprio QR impresso) e colar o texto do QR.
 * A câmera só funciona em HTTPS ou localhost (exigência do navegador).
 */

interface Props {
  readonly onText: (text: string) => void;
  readonly hint?: string;
}

type CamState = 'parada' | 'pedindo' | 'lendo' | 'erro';

export function QrScanner({ onText, hint }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const busy = useRef(false);
  const lastText = useRef<{ text: string; at: number } | null>(null);
  const [state, setState] = useState<CamState>('parada');
  const [error, setError] = useState<string | null>(null);
  const [paste, setPaste] = useState('');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);

  const emit = useCallback(
    (text: string) => {
      const now = Date.now();
      // A câmera vê o mesmo QR várias vezes por segundo: repassa cada texto no máximo a cada 1,5 s.
      if (lastText.current !== null && lastText.current.text === text && now - lastText.current.at < 1500) return;
      lastText.current = { text, at: now };
      setFlash(true);
      setTimeout(() => setFlash(false), 180);
      onText(text);
    },
    [onText],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState('parada');
  }, []);

  const start = useCallback(
    async (id: string | null = deviceId) => {
      setError(null);
      if (navigator.mediaDevices === undefined || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setState('erro');
        setError('Este navegador não dá acesso à câmera aqui (é preciso HTTPS). Use a foto ou cole o texto abaixo.');
        return;
      }
      setState('pedindo');
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: id === null ? { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } : { deviceId: { exact: id } },
        });
        streamRef.current = stream;
        const v = videoRef.current;
        if (v !== null) {
          v.srcObject = stream;
          await v.play();
        }
        setState('lendo');
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices(list.filter((d) => d.kind === 'videoinput'));
      } catch (e) {
        setState('erro');
        const name = e instanceof DOMException ? e.name : '';
        setError(
          name === 'NotAllowedError'
            ? 'Permissão da câmera negada. Libere nas configurações do navegador ou use a foto.'
            : name === 'NotFoundError'
              ? 'Nenhuma câmera encontrada. Use a foto ou cole o texto.'
              : 'Não foi possível abrir a câmera. Use a foto ou cole o texto.',
        );
      }
    },
    [deviceId],
  );

  // Ao sair da tela, desliga a câmera (a luz do aparelho apaga).
  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (state !== 'lendo') return;
    let raf = 0;
    let lastScan = 0;
    const loop = (t: number): void => {
      raf = requestAnimationFrame(loop);
      if (busy.current || t - lastScan < 140) return;
      const v = videoRef.current;
      const c = canvasRef.current;
      if (v === null || c === null || v.readyState < 2 || v.videoWidth === 0) return;
      lastScan = t;
      const scale = Math.min(1, 1100 / Math.max(v.videoWidth, v.videoHeight));
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g === null) return;
      g.drawImage(v, 0, 0, c.width, c.height);
      const img = g.getImageData(0, 0, c.width, c.height);
      busy.current = true;
      decodeImage(img)
        .then((texts) => texts.forEach(emit))
        .catch(() => undefined)
        .finally(() => {
          busy.current = false;
        });
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [state, emit]);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (file === undefined) return;
    setError(null);
    try {
      const texts = await decodeImage(file);
      if (texts.length === 0) setError('Nenhum QR encontrado na imagem. Tente uma foto mais de perto e sem reflexo.');
      texts.forEach(emit);
    } catch {
      setError('Não consegui ler esta imagem.');
    }
  };

  return (
    <div className="scanner">
      <div className={`scanner-view${flash ? ' flash' : ''}`}>
        <video ref={videoRef} playsInline muted aria-label="Imagem da câmera" />
        <canvas ref={canvasRef} hidden />
        {state !== 'lendo' && (
          <div className="scanner-cover">
            <p>{hint ?? 'Aponte a câmera para o QR da outra máquina.'}</p>
            <button type="button" className="btn primary" onClick={() => void start()} disabled={state === 'pedindo'}>
              {state === 'pedindo' ? 'Abrindo a câmera…' : 'Abrir a câmera'}
            </button>
          </div>
        )}
        {state === 'lendo' && <div className="scanner-reticle" aria-hidden="true" />}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        {state === 'lendo' && (
          <button type="button" className="btn small" onClick={stop}>
            Parar a câmera
          </button>
        )}
        {state === 'lendo' && devices.length > 1 && (
          <select
            aria-label="Escolher câmera"
            value={deviceId ?? ''}
            onChange={(e) => {
              const id = e.target.value === '' ? null : e.target.value;
              setDeviceId(id);
              void start(id);
            }}
            style={{ width: 'auto', minHeight: 34 }}
          >
            <option value="">Câmera traseira</option>
            {devices.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label === '' ? `Câmera ${i + 1}` : d.label}
              </option>
            ))}
          </select>
        )}
        <label className="btn small ghost" style={{ cursor: 'pointer' }}>
          Ler de uma foto
          <input type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </div>
      {error !== null && (
        <div className="notice warn" style={{ marginTop: 10 }}>
          <span>{error}</span>
        </div>
      )}
      <details className="paste-box">
        <summary>Sem câmera? Colar o texto do QR (ou do arquivo do pendrive)</summary>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="SCV1:E:ALFA:BRAVO:…  (uma parte por linha)"
          aria-label="Texto dos QR, uma parte por linha"
        />
        <div className="row" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="btn small"
            onClick={() => {
              paste
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .forEach((l) => onText(l));
              setPaste('');
            }}
          >
            Ler texto
          </button>
          <label className="btn small ghost" style={{ cursor: 'pointer' }}>
            Abrir arquivo .txt
            <input
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f === undefined) return;
                void f.text().then((t) =>
                  t
                    .split(/\r?\n/)
                    .map((l) => l.trim())
                    .filter((l) => l.startsWith('SCV1:'))
                    .forEach((l) => onText(l)),
                );
              }}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
