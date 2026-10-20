import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// No GitHub Pages o site fica em /<repositório>/; localmente, na raiz.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
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
});
