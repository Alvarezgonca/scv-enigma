import { type ReaderOptions, prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Leitor de QR: ZXing-C++ compilado para WebAssembly (zxing-wasm, licença MIT). O .wasm vem do
 * próprio app (nada de CDN), então a leitura funciona offline depois de instalado.
 */

let prepared = false;

function prepare(): void {
  if (prepared) return;
  prepared = true;
  void prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
    },
    fireImmediately: true,
  });
}

const OPTIONS: ReaderOptions = {
  formats: ['QRCode'],
  tryHarder: true,
  tryRotate: true,
  tryInvert: true,
  maxNumberOfSymbols: 4,
};

/** Lê todos os QR de uma imagem (quadro da câmera ou foto). */
export async function decodeImage(image: ImageData | Blob): Promise<string[]> {
  prepare();
  const results = await readBarcodes(image, OPTIONS);
  return results.filter((r) => r.isValid && r.text.length > 0).map((r) => r.text);
}
