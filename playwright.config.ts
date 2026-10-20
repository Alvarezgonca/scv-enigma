import { defineConfig, devices } from '@playwright/test';
import { CAMERA_FILE } from './e2e/global-setup';

/**
 * Testes de ponta a ponta no navegador de verdade, contra o build de produção (com a CSP ligada).
 * Localmente usa o Chrome instalado; no CI, o Chromium do Playwright.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: process.env.CI === undefined ? 0 : 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
    ...(process.env.CI === undefined ? { channel: 'chrome' } : {}),
  },
  globalSetup: './e2e/global-setup.ts',
  projects: [
    {
      name: 'desktop',
      testIgnore: /camera\.spec/,
      use: { ...devices['Desktop Chrome'], ...(process.env.CI === undefined ? { channel: 'chrome' } : {}) },
    },
    {
      name: 'camera',
      testMatch: /camera\.spec/,
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI === undefined ? { channel: 'chrome' } : {}),
        permissions: ['camera'],
        launchOptions: {
          args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${CAMERA_FILE}`],
        },
      },
    },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: process.env.CI === undefined,
    timeout: 180_000,
  },
});
