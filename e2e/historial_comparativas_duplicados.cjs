// Control de duplicados y agrupación por CUPS del Historial (Supabase de PRUEBAS).
// Requiere que la misma factura ya se haya guardado antes (historial_comparativas_autoguardado.cjs).
//   node e2e/historial_comparativas_duplicados.cjs 5190 <factura.pdf> <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const [, , port = '5190', factura, out = '.'] = process.argv;
const ok = (c, m) => console.log(`${c ? 'OK  ' : 'FALLO'} ${m}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/`);
  await page.locator('input[type="text"]').first().fill('prueba_admin');
  await page.locator('input[type="password"]').fill('prueba1234');
  await page.locator('button[type="submit"]').click();

  const contar = async () => {
    await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
    await page.waitForSelector('#hc-tabla tbody tr');
    await page.waitForTimeout(1500);
    return page.locator('#hc-tabla tfoot, .card p:has-text("Mostrando")').last().innerText();
  };
  const antes = await contar();
  console.log('     antes:', antes.replace(/\s+/g, ' '));

  // 1) Misma factura, misma oferta, otra persona y otra sesión → duplicado, no se guarda
  await page.getByText('Consulta de Tarifas').first().click();
  await page.getByRole('button', { name: 'Comparativas 2.0', exact: true }).click();
  await page.waitForTimeout(800);
  await page.setInputFiles('input[type="file"]', factura);
  await page.getByText('Informe listo').first().waitFor({ timeout: 120000 });
  await page.waitForTimeout(9000);

  // 2) Otra oferta (TEMPO) → estudio distinto, se guarda agrupado en el mismo CUPS
  await page.locator('input[type="radio"][name="tarifa"][value="tempo"]').check();
  await page.waitForTimeout(9000);

  const despues = await contar();
  console.log('     después:', despues.replace(/\s+/g, ' '));
  const n = (t, re) => Number((re.exec(t.replace(/\s+/g, ' ')) || [])[1]);
  ok(n(despues, /de (\d+) CUPS/) === n(antes, /de (\d+) CUPS/), 'No aparece un CUPS nuevo: la factura repetida se agrupa');
  ok(n(despues, /\((\d+) estudio/) === n(antes, /\((\d+) estudio/) + 1, 'Solo se añade 1 estudio (el de la oferta distinta); el idéntico no se duplica');

  const fila = page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).first();
  const boton = fila.getByRole('button', { name: /\+1 estudio/ });
  ok(await boton.count() === 1, 'La fila del CUPS muestra el desplegable "+1 estudio"');
  if (await boton.count()) {
    await boton.click();
    await page.waitForTimeout(400);
    const filasCups = await page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).count();
    ok(filasCups === 2, `Al desplegar se ven los 2 estudios del CUPS (${filasCups})`);
    const textos = (await page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).allInnerTexts()).join(' | ');
    ok(/TEMPO/.test(textos) && /Conecta/.test(textos), 'Uno con TEMPO y otro con Conecta Luz');
  }
  await page.screenshot({ path: path.join(out, '08_agrupado.png'), fullPage: true });
  ok(!errores.length, `Sin errores ${errores.slice(0, 3).join(' / ')}`);
  await browser.close();
})();
