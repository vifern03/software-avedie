// Prueba de extremo a extremo en el navegador (servidor de desarrollo + Gemini real).
// Recorre: tarifas B2C, Comparativas 2.0, 3.0/6.1 (factura Integra) y gas, con
// ediciones manuales. Uso: node e2e/comparativas.cjs <carpeta_salida> [puerto]
const { chromium } = require('playwright');
const assert = require('assert');
const [salida, puerto = '5181'] = process.argv.slice(2);
const D = 'C:/Users/victor/Downloads';
const FACT = {
  integra: `${D}/525008-2610A023312.pdf`,
  luz20: `${D}/FACTURAS LOS ALMENDROS/ES0021000009238942TT0F/P26CON005054172.pdf`,
  gas: `${D}/FACTURASGAS/GUARDERIA MIRANDA COLORIN  - Óscar Fernández Guzón.pdf`,
};
const resultados = [];
const ok = (nombre, cond, detalle = '') => { resultados.push([cond ? 'OK ' : 'FALLO', nombre, detalle]); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  const errores = [];
  pg.on('pageerror', e => errores.push(e.message));
  await pg.goto(`http://localhost:${puerto}`);
  await pg.waitForSelector('input', { timeout: 60000 });
  const ins = await pg.locator('input').all();
  await ins[0].fill('Victor'); await ins[1].fill('pedrito88');
  await pg.locator('button[type="submit"]').first().click();
  await pg.waitForTimeout(4000);
  await pg.getByText('Consulta de Tarifas').first().click();
  await pg.waitForTimeout(1000);

  // ── Tarifas B2C: Conecta primero, sin "Canal Directo", 3 columnas
  const titulos = await pg.$$eval('h3', hs => hs.map(h => h.textContent.trim()));
  ok('Luz B2C: Conecta Luz primera', titulos[0] === 'Conecta Luz', titulos.slice(0, 3).join(' | '));
  ok('Luz B2C: sin Luz Fija 24H Canal Directo', !(await pg.getByText('Canal Directo', { exact: true }).count()));
  const cols = await pg.evaluate(() => getComputedStyle(document.querySelector('h3').closest('.grid')).gridTemplateColumns.split(' ').length);
  ok('Luz B2C: 3 columnas', cols === 3, `${cols} columnas`);
  await pg.screenshot({ path: `${salida}/e2e_tarifas_b2c.png` });

  // ── Comparativas 2.0
  await pg.getByRole('button', { name: 'Comparativas 2.0', exact: true }).click();
  await pg.waitForTimeout(800);
  const radioSel = await pg.$eval('input[name="tarifa"]:checked', r => r.value);
  ok('2.0: Conecta Luz por defecto', radioSel === 'conecta', radioSel);
  ok('2.0: sin opción Canal Directo', !(await pg.locator('input[name="tarifa"][value="directo"]').count()));
  ok('2.0: Con Prescriptor disponible', (await pg.locator('input[name="tarifa"][value="prescriptor"]:not([disabled])').count()) === 1);
  await pg.setInputFiles('main input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]', FACT.luz20);
  await pg.waitForSelector('#ec-informe', { timeout: 60000 }).catch(() => {});
  const inf20 = await pg.locator('#ec-informe').innerText().catch(() => '');
  ok('2.0: informe automático tras subir la factura', /TOTAL/i.test(inf20));
  ok('2.0: informe con números en formato español', /\d,\d{6} €\/kW/.test(inf20) && !/\d\.\d{6} €/.test(inf20), (inf20.match(/.*kW \(Punta\).*/) || [''])[0]);
  const punta = pg.locator('input[placeholder="kW"]').first();
  const puntaOriginal = await punta.inputValue();
  await punta.fill('20');
  await pg.waitForTimeout(500);
  ok('2.0 manual: potencia 20 kW → bloqueo explicado, sin informe', !(await pg.locator('#ec-informe').count()) && /15 kW/.test(await pg.locator('body').innerText()));
  await punta.fill(puntaOriginal);
  await pg.waitForTimeout(500);
  ok('2.0 manual: restaurar el valor → informe de nuevo', (await pg.locator('#ec-informe').count()) === 1, puntaOriginal);
  await pg.screenshot({ path: `${salida}/e2e_20.png` });

  // ── Comparativas 3.0 / 6.1 — factura Integra
  await pg.getByRole('button', { name: 'Comparativas 3.0 y 6.1', exact: true }).click();
  await pg.waitForTimeout(800);
  const opciones = await pg.$$eval('#ecb2b-producto option', os => os.map(o => o.value + (o.disabled ? ':bloqueada' : '')));
  ok('3.0/6.1: Simply e Indexada bloqueadas, Open disponible', JSON.stringify(opciones) === JSON.stringify(['open', 'simply:bloqueada', 'indexada:bloqueada']), opciones.join());
  await pg.setInputFiles('#ecb2b-factura', FACT.integra);
  await pg.waitForSelector('#ecb2b-informe', { timeout: 60000 }).catch(() => {});
  const pots = await Promise.all([1, 2, 3, 4, 5, 6].map(i => pg.inputValue(`#ecb2b-pot${i}`)));
  ok('Integra: potencias volcadas sin ambigüedad', JSON.stringify(pots) === JSON.stringify(['15,001', '17', '17', '17', '17', '41']), JSON.stringify(pots));
  const tramo = await pg.$$eval('[id^="ecb2b-tramo"]', bs => bs.filter(x => x.className.includes('bg-google-blue')).map(x => x.textContent));
  ok('Integra: tramo automático 30 < Pc ≤ 50 kW', tramo[0] === '30 < Pc ≤ 50 kW', tramo.join());
  let inf = await pg.locator('#ecb2b-informe').innerText().catch(() => '');
  ok('Integra: P1 en el informe "15,001 kW … 0,059937"', inf.includes('15,001 kW (P1) × 30 días × 0,059937 €/kW'));
  ok('Integra: subtotal potencia 75,31 €', /Subtotal Potencia\s*75,31 €/.test(inf));
  ok('Integra: sin "15.001" ni 26.973 en el informe', !inf.includes('15.001') && !inf.includes('26.973'));
  const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.getByRole('button', { name: /Descargar/ }).first().click()]);
  await dl.saveAs(`${salida}/e2e_integra.pdf`);
  ok('Integra: PDF descargado', true, 'e2e_integra.pdf');
  await pg.locator('#ecb2b-informe').screenshot({ path: `${salida}/e2e_integra_informe.png` });

  // Ediciones manuales
  await pg.fill('#ecb2b-pot1', '15.001');
  await pg.waitForTimeout(500);
  inf = await pg.locator('#ecb2b-informe').innerText().catch(() => '');
  ok('Integra manual: "15.001" escrito a mano → 15,001 (punto decimal de la factura)', /Subtotal Potencia\s*75,31 €/.test(inf));
  ok('Integra manual: el campo conserva lo escrito', (await pg.inputValue('#ecb2b-pot1')) === '15.001');
  await pg.fill('#ecb2b-pot1', '15001');
  await pg.waitForTimeout(500);
  const cuerpo = await pg.locator('body').innerText();
  ok('Integra manual: 15001 → bloqueo "Datos incoherentes", sin informe', !(await pg.locator('#ecb2b-informe').count()) && cuerpo.includes('Datos incoherentes'));
  await pg.fill('#ecb2b-pot1', '16');
  await pg.waitForTimeout(500);
  inf = await pg.locator('#ecb2b-informe').innerText().catch(() => '');
  ok('Integra manual: simulación P1 = 16 kW se calcula', inf.includes('16 kW (P1)'));
  await pg.fill('#ecb2b-pot1', '15,001');
  await pg.click('#ecb2b-tramo0');
  await pg.waitForTimeout(500);
  const interno = await pg.locator('#ecb2b-interno').innerText().catch(() => '');
  ok('Integra manual: tramo "15 < Pc ≤ 30" a mano → informe sigue y aviso no bloqueante', (await pg.locator('#ecb2b-informe').count()) === 1 && interno.includes('elegido manualmente'));
  const totalAntes = await pg.locator('#ecb2b-informe').innerText();
  await pg.fill('#ecb2b-kwh3', '1500');
  await pg.waitForTimeout(500);
  ok('Integra manual: editar consumo recalcula', (await pg.locator('#ecb2b-informe').innerText()) !== totalAntes);
  await pg.screenshot({ path: `${salida}/e2e_integra.png`, fullPage: true });

  // ── Gas
  await pg.getByRole('button', { name: 'Comparativas Gas', exact: true }).click();
  await pg.waitForTimeout(800);
  await pg.setInputFiles('main input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]', FACT.gas);
  await pg.waitForSelector('#ec-informe-gas', { timeout: 60000 }).catch(() => {});
  const infGas = await pg.locator('#ec-informe-gas').innerText().catch(() => '');
  ok('Gas: informe automático tras subir la factura', /TOTAL/i.test(infGas));
  ok('Gas: números en formato español', /kWh × \d+,\d{6} €\/kWh/.test(infGas) && !/\d\.\d{6} €/.test(infGas), (infGas.match(/.*kWh × .*/) || [''])[0]);
  await pg.screenshot({ path: `${salida}/e2e_gas.png` });

  ok('Sin errores de JavaScript en la página', !errores.length, errores.join(' | '));
  await b.close();
  for (const r of resultados) console.log(r.join('  '));
  const fallos = resultados.filter(r => r[0] === 'FALLO').length;
  console.log(`\n${resultados.length - fallos}/${resultados.length} comprobaciones superadas`);
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); for (const r of resultados) console.log(r.join('  ')); process.exit(1); });
