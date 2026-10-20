import { type Browser, type Page, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Converte cada QR (SVG) de um grupo de impressão em PNG, como se fosse a foto tirada pela outra
 * máquina. Assim o teste passa pelo gerador e pelo leitor de QR de verdade (ZXing em WebAssembly).
 */
export async function qrImages(browser: Browser, page: Page, groupPrefix: string, dir: string): Promise<string[]> {
  const svgs = await page.evaluate((prefix) => {
    const groups = [...document.querySelectorAll<HTMLElement>('[data-print-group]')].filter((g) =>
      (g.dataset.printGroup ?? '').startsWith(prefix),
    );
    return groups.flatMap((g) => [...g.querySelectorAll('svg')].map((s) => s.outerHTML));
  }, groupPrefix);
  expect(svgs.length).toBeGreaterThan(0);
  mkdirSync(dir, { recursive: true });
  const shooter = await browser.newPage({ viewport: { width: 700, height: 700 } });
  const files: string[] = [];
  for (const [i, svg] of svgs.entries()) {
    await shooter.setContent(`<body style="margin:0;background:#fff">${svg.replace('<svg', '<svg width="660" height="660"')}</body>`);
    const file = join(dir, `${groupPrefix.replace(/\W+/g, '_')}-${i + 1}.png`);
    await shooter.screenshot({ path: file });
    files.push(file);
  }
  await shooter.close();
  return files;
}

export async function uploadPhotos(page: Page, files: readonly string[]): Promise<void> {
  const input = page.locator('input[type=file][accept="image/*"]').first();
  for (const f of files) {
    await input.setInputFiles(f);
    await page.waitForTimeout(400);
  }
}
