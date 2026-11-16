// Prueba mínima (solo lectura) del estado "Enviado a Back Office", columnas de Altas e
// Historial de Comparativas. Requiere Vite contra el Supabase de PRUEBAS y los datos de
// e2e/historial_comparativas_datos.sql.   node e2e/historial_comparativas.cjs 5190 <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const port = process.argv[2] || '5190';
const out = process.argv[3] || '.';
fs.mkdirSync(out, { recursive: true });
const url = `http://localhost:${port}/`;
const fallos = [];
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALLO'} ${msg}`); if (!cond) fallos.push(msg); };

async function login(page, user) {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  await page.locator('input[type="text"]').first().fill(user);
  await page.locator('input[type="password"]').fill('prueba1234');
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: /Historial de Comparativas/ }).first().waitFor({ timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));

  // 1. Comercial con sede: Alta B2C y B2B
  await login(page, 'prueba_sede');
  await page.getByRole('button', { name: /Alta B2C/ }).first().click();
  await page.waitForSelector('table th');
  const ths = await page.locator('table thead th').allInnerTexts();
  ok(ths[0].trim() === 'Compartido por' && ths[1].trim().startsWith('Estado'), `Columnas B2C: ${ths.slice(0, 3).join(' | ')}`);
  const filaBO = page.locator('tr', { hasText: 'DEMO ENVIADO BACKOFFICE' });
  ok(await filaBO.locator('span.bg-blue-100', { hasText: 'Enviado a Back Office' }).count() === 1, 'Estado "Enviado a Back Office" en azul');
  await page.screenshot({ path: path.join(out, '01_alta_b2c.png'), fullPage: true });

  await page.getByRole('button', { name: /Alta B2B/ }).first().click();
  await page.waitForTimeout(800);
  const filaInc = page.locator('tr', { hasText: 'DEMO EMPRESA INCIDENCIA' });
  ok(await filaInc.locator('span.bg-red-600', { hasText: 'Pte. Recuperación' }).count() === 1, 'Incidencia abierta: estado del Excel en rojo');
  await page.screenshot({ path: path.join(out, '02_alta_b2b.png'), fullPage: true });

  // 2. Historial (comercial con sede ve todas)
  await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
  await page.waitForSelector('#hc-tabla tbody tr');
  await page.waitForTimeout(800);
  const filas = await page.locator('#hc-tabla tbody tr').count();
  ok(filas >= 4, `Comercial con sede ve todas (${filas} filas)`);
  ok(await page.locator('#hc-tabla tr', { hasText: 'DEMO TALLER SIN ALTA' }).getByRole('button', { name: /Alta B2C/ }).count() === 0
    && await page.locator('#hc-tabla tr', { hasText: 'DEMO TALLER SIN ALTA' }).getByRole('button', { name: /Alta B2B/ }).count() === 1, '3.0TD: solo botón Alta B2B');
  ok(await page.locator('#hc-tabla tr', { hasText: 'DEMO COMERCIAL SIN SEDE' }).getByRole('button', { name: /Alta B2/ }).count() === 2, '2.0TD: botones Alta B2C y B2B');
  ok(await page.locator('#hc-tabla tr', { hasText: 'DEMO ENVIADO BACKOFFICE' }).locator('span.bg-blue-500').count() === 1, 'Punto azul en comparativa dada de alta');
  await page.screenshot({ path: path.join(out, '03_historial.png'), fullPage: true });

  // Formulario de alta prerrellenado (se cierra sin guardar)
  await page.locator('#hc-tabla tr', { hasText: 'DEMO TALLER SIN ALTA' }).getByRole('button', { name: /Alta B2B/ }).click();
  await page.waitForTimeout(600);
  const cupsVal = await page.locator('input[value="ES0000980000000201DM"]').count();
  ok(cupsVal === 1, 'Alta B2B abre el formulario con el CUPS de la comparativa');
  await page.screenshot({ path: path.join(out, '04_alta_prefill.png'), fullPage: true });

  // 3. Comercial sin sede: solo las suyas; CUPS completo muestra otras
  await login(page, 'prueba_sinsede');
  await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
  await page.waitForSelector('#hc-tabla tbody tr');
  await page.waitForTimeout(800);
  const propias = await page.locator('#hc-tabla tbody tr', { hasText: 'DEMO' }).count();
  ok(propias === 1, `Comercial sin sede ve solo la suya (${propias})`);
  await page.fill('#hc-buscar-cups', 'ES0000980000000201DM');
  await page.waitForTimeout(1500);
  ok(await page.locator('#hc-tabla tr', { hasText: 'DEMO TALLER SIN ALTA' }).count() === 1, 'CUPS completo muestra la comparativa de otro');
  await page.screenshot({ path: path.join(out, '05_sin_sede_cups.png'), fullPage: true });

  ok(!errores.length, `Sin errores de página ${errores.join(' / ')}`);
  await browser.close();
  console.log(fallos.length ? `\n${fallos.length} FALLO(S)` : '\nTODO OK');
  process.exit(fallos.length ? 1 : 0);
})();
