import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';

export const CAMERA_FILE = join(tmpdir(), 'scv-enigma-e2e', 'camera.y4m');
export const CAMERA_FRAME = 'SCV1:E:ALFA:BRAVO:20:1930:178:1/1:15:QUX:YHR:NVXEN TKNEW LWNQE';

/**
 * Gera um vídeo Y4M (formato de câmera falsa do Chrome) mostrando um QR do protocolo, para testar o
 * caminho real da câmera: getUserMedia → quadro no canvas → leitor ZXing em WebAssembly.
 */
export default function globalSetup(): void {
  const W = 640;
  const H = 480;
  const qr = QRCode.create(CAMERA_FRAME, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const quiet = 4;
  const scale = Math.floor(400 / (n + quiet * 2));
  const side = (n + quiet * 2) * scale;
  const x0 = Math.floor((W - side) / 2);
  const y0 = Math.floor((H - side) / 2);
  const luma = new Uint8Array(W * H).fill(90);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const mx = Math.floor(x / scale) - quiet;
      const my = Math.floor(y / scale) - quiet;
      const dark = mx >= 0 && my >= 0 && mx < n && my < n && qr.modules.data[my * n + mx] === 1;
      luma[(y0 + y) * W + (x0 + x)] = dark ? 25 : 235;
    }
  }
  const chroma = new Uint8Array((W / 2) * (H / 2) * 2).fill(128);
  const header = Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`);
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Buffer.from(luma), Buffer.from(chroma)]);
  mkdirSync(join(tmpdir(), 'scv-enigma-e2e'), { recursive: true });
  writeFileSync(CAMERA_FILE, Buffer.concat([header, ...Array.from({ length: 20 }, () => frame)]));
}
