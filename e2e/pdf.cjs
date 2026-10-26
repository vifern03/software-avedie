// Informes PDF: "Descargar" e "Imprimir" deben producir el MISMO PDF, A4, 1 página,
// ~184 mm de ancho útil. Uso: node e2e/pdf.cjs <carpeta_salida> [puerto]
const { chromium } = require('playwright');
const fs = require('fs');
const [salida, puerto = '5181'] = process.argv.slice(2);
const D = 'C:/Users/victor/Downloads';
const CASOS = [
  { tab: 'Comparativas 3.0 y 6.1', input: '#ecb2b-factura', informe: '#ecb2b-informe', factura: `${D}/525008-2610A023312.pdf`, nombre: 'integra' },
  { tab: 'Comparativas 2.0', input: 'main input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]', informe: '#ec-informe', factura: `${D}/FACTURAS LOS ALMENDROS/ES0021000009238942TT0F/P26CON005054172.pdf`, nombre: 'luz20' },
  { tab: 'Comparativas Gas', input: 'main input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]', informe: '#ec-informe-gas', factura: `${D}/FACTURASGAS/GUARDERIA MIRANDA COLORIN  - Óscar Fernández Guzón.pdf`, nombre: 'gas' },
];
(async () => {
  const { medirPdf } = await import('./medirPdf.mjs');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 1100 }, acceptDownloads: true });
  const pg = await ctx.newPage();
  // Registro de los PDF que se abren para imprimir (el iframe recibe un blob URL).
  await pg.addInitScript(() => {
    window.__impresos = [];
    const crear = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const u = crear(blob); if (blob && blob.type === 'application/pdf') window.__impresos.push(u); return u; };
    window.__llamadasPrint = 0;
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'contentWindow');
    Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', { get() { const w = desc.get.call(this); if (w && !w.__parche) { try { w.__parche = true; w.print = () => { window.__llamadasPrint++; }; } catch {} } return w; } });
    window.print = () => { window.__printHtml = (window.__printHtml || 0) + 1; };
  });
  await pg.goto(`http://localhost:${puerto}`);
  await pg.waitForSelector('input');
  const ins = await pg.locator('input').all();
  await ins[0].fill('Victor'); await ins[1].fill('pedrito88');
  await pg.locator('button[type="submit"]').first().click();
  await pg.waitForTimeout(4000);
  await pg.getByText('Consulta de Tarifas').first().click();
  let fallos = 0;
  for (const c of CASOS) {
    await pg.getByRole('button', { name: c.tab, exact: true }).click();
    await pg.waitForTimeout(700);
    await pg.setInputFiles(c.input, c.factura);
    await pg.waitForSelector(c.informe, { timeout: 60000 });
    await pg.waitForTimeout(800);
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.locator('main button:visible', { hasText: 'Descargar' }).last().click()]);
    const rutaDl = `${salida}/pdf_${c.nombre}_descargado.pdf`;
    await dl.saveAs(rutaDl);
    await pg.waitForTimeout(500);
    // Imprimir: el PDF se carga en un iframe. Chromium sin interfaz no tiene visor de PDF y
    // lo entrega como descarga: ese archivo es exactamente el documento que se imprime.
    const [imp] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.locator('main button:visible', { hasText: 'Imprimir informe' }).last().click()]);
    const rutaImp = `${salida}/pdf_${c.nombre}_impreso.pdf`;
    await imp.saveAs(rutaImp);
    await pg.waitForTimeout(1500);
    const iguales = Buffer.compare(fs.readFileSync(rutaDl), fs.readFileSync(rutaImp)) === 0;
    const m = await medirPdf(rutaDl);
    const print = await pg.evaluate(() => ({ pdf: [...document.querySelectorAll('iframe')].filter(f => f.src.startsWith('blob:')).length, html: window.__printHtml || 0 }));
    const r1 = (x) => Math.round(x * 10) / 10;
    const okCaso = iguales && m.paginas === 1 && m.imagen.ancho >= 180 && m.imagen.ancho <= 185 && m.margenInf >= 12.9 && print.html === 0 && print.pdf === 1;
    if (!okCaso) fallos++;
    // En Chromium sin interfaz los iframes con PDF vuelven a emitir descargas: se retiran entre casos.
    await pg.evaluate(() => document.querySelectorAll('iframe').forEach(f => { if (f.src.startsWith('blob:')) f.remove(); }));
    await pg.waitForTimeout(1500);
    console.log(`${okCaso ? 'OK   ' : 'FALLO'} ${c.nombre}: descargado = impreso: ${iguales} · páginas ${m.paginas} · imagen ${r1(m.imagen.ancho)} × ${r1(m.imagen.alto)} mm · márgenes izq ${r1(m.margenIzq)} der ${r1(m.margenDer)} sup ${r1(m.margenSup)} inf ${r1(m.margenInf)} mm · iframes con el PDF: ${print.pdf} · print del HTML: ${print.html}`);
  }
  // Gas: RL.4–RL.6 bloqueadas para comparativas; RL.1–RL.3 disponibles.
  const radios = await pg.$$eval('input[name="tarifaGas"]', rs => rs.map(r => r.value + (r.disabled ? ':bloqueada' : '')));
  const okGas = JSON.stringify(radios) === JSON.stringify(['rl1', 'rl2', 'rl3', 'rl4:bloqueada', 'rl5:bloqueada', 'rl6:bloqueada']);
  if (!okGas) fallos++;
  console.log(`${okGas ? 'OK   ' : 'FALLO'} gas: ${radios.join(', ')}`);
  await b.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
