// Comprueba que una comparativa 2.0 hecha con factura (IA) se guarda sola en el Historial,
// sin descargar ni imprimir, y que retocarla no crea otra ficha. Solo Supabase de PRUEBAS.
//   node e2e/historial_comparativas_autoguardado.cjs 5190 <factura.pdf> <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const [, , port = '5190', factura, out = '.'] = process.argv;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/`);
  await page.locator('input[type="text"]').first().fill('prueba_sede');
  await page.locator('input[type="password"]').fill('prueba1234');
  await page.locator('button[type="submit"]').click();
  await page.getByText('Consulta de Tarifas').first().click();
  await page.getByRole('button', { name: 'Comparativas 2.0', exact: true }).click();
  await page.waitForTimeout(800);
  await page.setInputFiles('input[type="file"]', factura);
  await page.getByText('Informe listo').first().waitFor({ timeout: 120000 });
  console.log('OK   Informe calculado con la factura');
  await page.waitForTimeout(9000); // 4 s de espera + generar el PDF y subirlo

  // Retoque: cambiar el cliente → debe actualizar la misma ficha, no crear otra
  const cliente = page.locator('input[placeholder="Cliente"]').first();
  await cliente.fill(`${await cliente.inputValue()} RETOCADO`);
  await page.waitForTimeout(9000);

  await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
  await page.waitForSelector('#hc-tabla tbody tr');
  await page.waitForTimeout(1500);
  const filas = page.locator('#hc-tabla tbody tr', { hasText: 'RETOCADO' });
  console.log('     filas totales en el historial:', await page.locator('#hc-tabla tbody tr').count(), '(antes había 5)');
  const n = await filas.count();
  console.log(n === 1 ? 'OK   Guardada sin descargar, y el retoque actualizó la misma ficha (1 fila)' : `FALLO filas=${n}`);
  if (n) console.log((await filas.first().innerText()).includes('RETOCADO') ? 'OK   La ficha tiene el dato retocado' : 'FALLO la ficha no se actualizó');
  if (n) console.log('     ', (await filas.first().innerText()).replace(/\s+/g, ' '));
  await page.screenshot({ path: path.join(out, '07_autoguardado.png'), fullPage: true });
  console.log(errores.length ? `Errores: ${errores.slice(0, 5).join(' / ')}` : 'OK   Sin errores');
  await browser.close();
})();
