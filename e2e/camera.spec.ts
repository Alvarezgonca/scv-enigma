import { expect, test } from '@playwright/test';

test('a câmera lê o QR ao vivo e junta a parte da mensagem', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#/folha');
  await page.getByRole('button', { name: 'Gerar a folha de chaves' }).click();
  await page.goto('/#/receber');
  await page.getByRole('button', { name: 'Abrir a câmera' }).click();
  // O quadro do vídeo falso é ALFA → BRAVO, parte 1 de 1.
  await expect(page.locator('.parts-strip span.got').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('ALFA → BRAVO').first()).toBeVisible();
  await page.getByRole('button', { name: 'Parar a câmera' }).click();
  expect(errors).toEqual([]);
});
