import { expect, test } from '@playwright/test';

test('instala o service worker e funciona sem internet', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Recarrega já controlado pelo service worker, depois corta a rede.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('SCV ENIGMA')).toBeVisible();
  await page.goto('/#/maquina');
  await page.keyboard.press('A');
  await expect(page.getByText('Acendeu')).toBeVisible();
  // O leitor de QR em WebAssembly também precisa estar no cache.
  const wasmCached = await page.evaluate(async () => {
    const keys = await caches.keys();
    for (const k of keys) {
      const c = await caches.open(k);
      const reqs = await c.keys();
      if (reqs.some((r) => r.url.endsWith('.wasm'))) return true;
    }
    return false;
  });
  expect(wasmCached).toBe(true);
  await context.setOffline(false);
});

test('manifesto instalável com ícones', async ({ page, request }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).not.toBeNull();
  const manifest = (await (await request.get(href ?? '')).json()) as { name: string; icons: { src: string; purpose?: string }[]; display: string };
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBe(true);
});
