import { expect, test } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { qrImages, uploadPhotos } from './helpers';

const DIR = join(tmpdir(), 'scv-enigma-e2e');

test('duas estações: folha por QR, mensagem Enigma e AES por QR, adulteração recusada', async ({ browser }) => {
  // Estação ALFA (Comando) e estação BRAVO em navegadores separados, como dois aparelhos.
  const alfaCtx = await browser.newContext();
  const bravoCtx = await browser.newContext();
  const alfa = await alfaCtx.newPage();
  const bravo = await bravoCtx.newPage();
  const errors: string[] = [];
  for (const p of [alfa, bravo]) p.on('pageerror', (e) => errors.push(e.message));

  // 1. O Comando cria a rede e gera a folha de BRAVO (com senha).
  await alfa.goto('/#/folha');
  await alfa.getByRole('button', { name: 'Gerar a folha de chaves' }).click();
  await expect(alfa.getByText('do Comando (todos os segredos)')).toBeVisible();
  await alfa.getByLabel(/Senha de distribuição/).fill('farol itaipuacu sete');
  await alfa.getByRole('button', { name: /Gerar QR da folha de BRAVO/ }).click();
  const code = (await alfa.locator('.notice.ok b.mono').textContent({ timeout: 30_000 })) ?? '';
  expect(code).toMatch(/^(?:[0-9A-F]{4}-){4}[0-9A-F]{4}$/);
  const sheetPhotos = await qrImages(browser, alfa, 'Folha de BRAVO', DIR);

  // 2. BRAVO lê a folha pela "foto", digita a senha e confere o código.
  await bravo.goto('/#/folha');
  await uploadPhotos(bravo, sheetPhotos);
  await bravo.getByLabel('Senha de distribuição').fill('farol itaipuacu sete');
  await bravo.getByRole('button', { name: 'Abrir a folha' }).click();
  await expect(bravo.getByText(code)).toBeVisible({ timeout: 30_000 });
  await bravo.getByRole('button', { name: 'O código confere: aceitar' }).click();
  await expect(bravo.getByText('da estação BRAVO')).toBeVisible();

  // 3. ALFA transmite (sem animação).
  await alfa.goto('/#/enviar');
  await alfa.getByRole('button', { name: 'Sem animação' }).click();
  await alfa.getByRole('button', { name: /Cifrar e gerar os QR/ }).click();
  await expect(alfa.getByText('QR para a estação BRAVO')).toBeVisible();
  const enigmaPhotos = await qrImages(browser, alfa, 'Enigma ALFA→BRAVO', DIR);
  await alfa.getByRole('tab', { name: /AES-256-GCM/ }).click();
  const aesPhotos = await qrImages(browser, alfa, 'AES ALFA→BRAVO', DIR);

  // 4. BRAVO recebe a versão Enigma.
  await bravo.goto('/#/receber');
  await uploadPhotos(bravo, enigmaPhotos);
  await expect(bravo.getByText(/PARA ESTACAO BRAVO DE ESTACAO ALFA DEFESA CIVIL ABRIGO ABERTO/)).toBeVisible();
  await bravo.getByRole('button', { name: 'Prova: decifrar com UM anel errado' }).click();
  await expect(bravo.getByText(/Ilegível/)).toBeVisible();
  await bravo.getByRole('button', { name: 'Trocar o destinatário no cabeçalho' }).click();
  await expect(bravo.getByText(/entregou um texto adulterado/)).toBeVisible();

  // 5. BRAVO recebe a versão AES: texto com acentos, e a adulteração é recusada.
  await bravo.getByRole('button', { name: 'Nova recepção' }).click();
  await uploadPhotos(bravo, aesPhotos);
  await expect(bravo.getByText('autêntica e íntegra')).toBeVisible();
  await expect(bravo.getByText(/abrigo aberto no ginásio de Itaipuaçu/).first()).toBeVisible();
  await bravo.getByRole('button', { name: 'Trocar um caractere do texto cifrado' }).click();
  await expect(bravo.getByText('Mensagem recusada, nenhum texto foi entregue.')).toBeVisible();

  expect(errors).toEqual([]);
  await alfaCtx.close();
  await bravoCtx.close();
});
