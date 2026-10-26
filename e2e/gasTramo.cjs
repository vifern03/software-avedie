// Selección automática del tramo RL al subir una factura de gas (Gemini real).
// Uso: node e2e/gasTramo.cjs [puerto]
const { chromium } = require('playwright');
const puerto = process.argv[2] || '5181';
const G = 'C:/Users/victor/Downloads/FACTURASGAS';
const CASOS = [
  ['GUARDERIA MIRANDA COLORIN  - Óscar Fernández Guzón.pdf', 'rl3', true],   // "Peaje de acceso: RL. 3"
  ['FG25005300 (1) - Óscar Fernández Guzón (2).pdf', 'rl3', true],           // "Tarifa del contrato: RL03"
  ['GAS GUARDERIA PALENCIA  - Óscar Fernández Guzón.pdf', 'rl4', false],     // "Peaje de acceso: RL.4" → bloqueada
];
(async () => {
  const b = await chromium.launch();
  let fallos = 0;
  for (const [archivo, esperado, informe] of CASOS) {
    const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
    await pg.goto(`http://localhost:${puerto}`);
    await pg.waitForSelector('input');
    const ins = await pg.locator('input').all();
    await ins[0].fill('Victor'); await ins[1].fill('pedrito88');
    await pg.locator('button[type="submit"]').first().click();
    await pg.waitForTimeout(4000);
    await pg.getByText('Consulta de Tarifas').first().click();
    await pg.getByRole('button', { name: 'Comparativas Gas', exact: true }).click();
    await pg.waitForTimeout(700);
    const antes = await pg.$eval('input[name="tarifaGas"]:checked', r => r.value);
    await pg.setInputFiles('main input[type="file"][accept=".pdf,.jpg,.jpeg,.png"]', `${G}/${archivo}`);
    await pg.waitForFunction(() => document.body.innerText.includes('Revisión obligatoria'), null, { timeout: 60000 });
    await pg.waitForTimeout(1000);
    const sel = await pg.$eval('input[name="tarifaGas"]:checked', r => r.value);
    const hayInforme = (await pg.locator('#ec-informe-gas').count()) === 1;
    const texto = await pg.locator('main').innerText();
    const msg = (texto.split('\n').find(l => /Tramo|tramo/.test(l) && /RL/.test(l)) || '').trim();
    const ok = sel === esperado && hayInforme === informe && (informe || texto.includes('no está disponible para comparativas'));
    if (!ok) fallos++;
    console.log(`${ok ? 'OK   ' : 'FALLO'} ${archivo.slice(0, 40).padEnd(40)} antes ${antes} → seleccionada ${sel} (esperada ${esperado}) · informe: ${hayInforme ? 'sí' : 'no (bloqueada)'} · ${msg}`);
    await pg.close();
  }
  await b.close();
  process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
