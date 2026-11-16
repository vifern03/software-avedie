// Comprueba que descargar una comparativa 3.0 la guarda en el Historial (Supabase de PRUEBAS).
//   node e2e/historial_comparativas_guardado.cjs 5190 <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const port = process.argv[2] || '5190';
const out = process.argv[3] || '.';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/`);
  await page.locator('input[type="text"]').first().fill('prueba_sinsede');
  await page.locator('input[type="password"]').fill('prueba1234');
  await page.locator('button[type="submit"]').click();
  await page.getByText('Consulta de Tarifas').first().click();
  await page.getByRole('button', { name: 'Comparativas 3.0 y 6.1', exact: true }).click();
  await page.waitForTimeout(800);
  for (let i = 1; i <= 6; i++) await page.fill(`#ecb2b-pot${i}`, i === 1 ? '35' : '51');
  const kwh = { 4: '1936', 5: '952', 6: '1240' };
  for (let i = 1; i <= 6; i++) await page.fill(`#ecb2b-kwh${i}`, kwh[i] || '0');
  await page.fill('#ecb2b-dias', '31');
  await page.fill('#ecb2b-total', '767,90');
  await page.fill('#ecb2b-cliente', 'E2E GUARDADO HISTORIAL');
  await page.fill('#ecb2b-cups', 'ES0000980000000999DM');
  await page.waitForSelector('#ecb2b-informe', { timeout: 20000 });
  await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Descargar/ }).first().click()]);
  await page.waitForTimeout(4000);
  await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
  await page.waitForSelector('#hc-tabla tbody tr');
  await page.waitForTimeout(1500);
  const fila = page.locator('#hc-tabla tr', { hasText: 'E2E GUARDADO HISTORIAL' });
  const n = await fila.count();
  console.log(n === 1 ? 'OK   Comparativa guardada al descargar' : `FALLO filas=${n}`);
  if (n === 1) console.log('     ', (await fila.innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(out, '06_guardado.png'), fullPage: true });
  console.log(errores.length ? `Errores: ${errores.join(' / ')}` : 'OK   Sin errores');
  await browser.close();
})();
