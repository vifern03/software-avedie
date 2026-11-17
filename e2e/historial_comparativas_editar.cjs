// Lápiz del Historial: abrir una comparativa, cambiar la tarifa y comprobar dónde se guarda;
// y agrupación por factura dentro del mismo CUPS. Solo Supabase de PRUEBAS.
//   node e2e/historial_comparativas_editar.cjs 5191 <carpeta>
const { chromium } = require('playwright');
const path = require('path');
const [, , port = '5191', out = '.'] = process.argv;
const ok = (c, m) => console.log(`${c ? 'OK  ' : 'FALLO'} ${m}`);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  const errores = [];
  page.on('pageerror', e => errores.push(e.message));
  await page.goto(`http://localhost:${port}/`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`http://localhost:${port}/`);
  await page.locator('input[type="text"]').first().fill('prueba_admin');
  await page.locator('input[type="password"]').fill('prueba1234');
  await page.locator('button[type="submit"]').click();

  const historial = async () => {
    await page.getByRole('button', { name: /Historial de Comparativas/ }).first().click();
    await page.waitForSelector('#hc-tabla tbody tr');
    await page.waitForTimeout(1500);
    const t = (await page.locator('.card p:has-text("Mostrando")').last().innerText()).replace(/\s+/g, ' ');
    return { cups: Number(/de (\d+) CUPS/.exec(t)[1]), estudios: Number(/\((\d+) estudio/.exec(t)[1]), t };
  };
  const fila = () => page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).first();
  const desplegar = async () => { const l = fila().getByRole('button', { name: /\+\d+ estudio/ }); if (await l.count()) await l.click(); await page.waitForTimeout(300); };
  const lapizDe = (texto) => page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).filter({ hasText: texto }).first().locator('button[title^="Abrir en Comparativas"]');

  const h0 = await historial(); console.log('     inicio:', h0.t);

  // 1) Comparativa ajena (prueba_sede): abrir sin tocar → no crea nada; cambiar tarifa → estudio nuevo a mi nombre
  await desplegar();
  await lapizDe('Sede').click();
  await page.getByText('Editando la comparativa').waitFor({ timeout: 15000 });
  ok(await page.getByText('La original no se modifica').count() === 1, 'Ajena: aviso de que se guardará como otro estudio');
  ok(await page.getByText('Informe listo').count() > 0 || await page.locator('#ec-informe').count() > 0, 'Informe recalculado sin volver a leer la factura');
  await page.waitForTimeout(8000);
  const h1 = await historial();
  ok(h1.estudios === h0.estudios, `Abrir sin cambiar nada no crea estudio (${h1.estudios})`);
  await desplegar();
  await lapizDe('Sede').click();
  await page.getByText('Editando la comparativa').waitFor({ timeout: 15000 });
  await page.locator('input[type="radio"][name="tarifa"][value="prescriptor"]').check();
  await page.waitForTimeout(10000);
  const h2 = await historial();
  ok(h2.estudios === h0.estudios + 1 && h2.cups === h0.cups, `Cambiar tarifa en una ajena → +1 estudio en el mismo CUPS (${h2.t})`);
  await desplegar();
  const textos = (await page.locator('#hc-tabla tbody tr', { hasText: 'RECAMBIOS RAF' }).allInnerTexts()).join(' | ');
  ok(/SEDE[^|]*Conecta/i.test(textos),'La original sigue a nombre de quien la hizo');
  const nueva = page.locator('#hc-tabla tbody tr', { hasText: 'Luz Fija 24H' }).first();
  ok(await nueva.count() === 1 && /Admin/i.test(await nueva.innerText()), 'El nuevo estudio (Luz Fija 24H) queda a mi nombre');
  ok(await nueva.locator('button[title^="Ver la factura"]').count() === 1, 'El nuevo estudio conserva la factura');

  // 2) Comparativa propia: cambiar el importe de la factura → se actualiza esa ficha y pasa a otro bloque de factura
  await lapizDe('Luz Fija 24H').click();
  await page.getByText('Editando la comparativa').waitFor({ timeout: 15000 });
  ok(await page.getByText('se guardan en esa misma ficha').count() === 1, 'Propia: aviso de que se actualiza la misma ficha');
  await page.locator('div:has(> label:has-text("Factura actual")) > input').first().fill('99,99');
  await page.waitForTimeout(10000);
  const h3 = await historial();
  ok(h3.estudios === h2.estudios, `Editar la propia no crea otra ficha (${h3.estudios})`);
  const link = fila().getByRole('button', { name: /\+\d+ estudio/ });
  ok(/2 facturas/.test(await link.innerText()), `El enlace bajo el CUPS indica 2 facturas: "${(await link.innerText()).replace(/\s+/g, ' ')}"`);
  await link.click(); await page.waitForTimeout(300);
  ok(await page.locator('#hc-tabla tbody td:has-text("Factura 1")').count() === 1 && await page.locator('#hc-tabla tbody td:has-text("Factura 2")').count() === 1, 'Al desplegar aparecen las cabeceras Factura 1 y Factura 2');
  await page.screenshot({ path: path.join(out, '09_editar_facturas.png'), fullPage: true });

  // 3) Las tres comparativas cargan
  await page.getByText('Consulta de Tarifas').first().click();
  for (const t of ['Comparativas Gas', 'Comparativas 3.0 y 6.1', 'Comparativas 2.0']) {
    await page.getByRole('button', { name: t, exact: true }).click(); await page.waitForTimeout(1000);
    ok(await page.getByText('Se guarda la última tarifa').count() === 1, `${t} carga con la nota pequeña`);
  }
  ok(!errores.length, `Sin errores ${errores.slice(0, 3).join(' / ')}`);
  await browser.close();
})();
