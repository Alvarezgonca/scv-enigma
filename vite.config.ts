import { type Plugin, defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages o site fica em /<repositório>/; localmente, na raiz.
const base = process.env.BASE_PATH ?? '/';

/**
 * Política de segurança de conteúdo (CSP) só no build: o servidor de desenvolvimento injeta
 * scripts inline para recarregar a página e seria bloqueado. 'wasm-unsafe-eval' é o mínimo para o
 * leitor de QR em WebAssembly; nenhum script de fora é permitido.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'scv-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`);
    },
  };
}

// `npm run dev:celular`: HTTPS com certificado local para abrir no celular pela rede Wi-Fi
// (a câmera só funciona em HTTPS). O navegador mostra um aviso de certificado: é esperado.
export default defineConfig(({ mode }) => ({
  base,
  plugins: [
    react(),
    ...(mode === 'celular' ? [basicSsl()] : []),
    contentSecurityPolicy(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'SCV Enigma — Enigma × Criptografia Moderna',
        short_name: 'SCV Enigma',
        description:
          'Máquina Enigma visual que troca mensagens por QR Code e se compara à criptografia moderna (AES-256-GCM).',
        lang: 'pt-BR',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'any',
        background_color: '#14110f',
        theme_color: '#14110f',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,wasm,webmanifest}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
}));
