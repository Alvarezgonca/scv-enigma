import { expect, test } from '@playwright/test';
import { encryptText, groupsOf5, prepareText, settingsFrom } from '../src/core/enigma';

test('Bletchley Park: a Bomba roda no worker e recupera a mensagem', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const plain = prepareText(
    'Para estação BRAVO, de estação ALFA: comboio parte ao amanhecer pela estrada da orla. Confirmar recebimento até as dezoito horas.',
  );
  const key = settingsFrom({ rotors: 'I II III', rings: 'KQZ', positions: 'MAR', plugboard: 'AV BS CG DL FU HZ IN KM OW RX' });
  await page.goto('/#/bletchley');
  await page.getByLabel('Texto cifrado interceptado').fill(groupsOf5(encryptText(key, plain)));
  await expect(page.getByText(/posições eliminadas/)).toBeVisible();
  await page.getByRole('button', { name: 'Ordem conhecida' }).click();
  await page.getByLabel('Ordem dos rotores').selectOption('I II III');
  await page.getByRole('button', { name: /Ligar a Bomba/ }).click();
  await expect(page.getByText(/A Enigma caiu em/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/PARA ESTACAO BRAVO DE ESTACAO ALFA COMBOIO PARTE AO AMANHECER/)).toBeVisible();
  expect(errors).toEqual([]);
});
