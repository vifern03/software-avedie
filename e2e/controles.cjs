// Foto de los controles editables de cada comparador (para comprobar que la edición
// manual no cambia). Uso: node e2e/controles.cjs <salida.json> [puerto]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [salida, puerto = '5181'] = process.argv.slice(2);
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 1100 } });
  for (let i = 0; i < 60; i++) { try { await pg.goto(`http://localhost:${puerto}`); break; } catch { await new Promise(r => setTimeout(r, 1000)); } }
  await pg.waitForSelector('input', { timeout: 60000 });
  const inputs = await pg.locator('input').all();
  await inputs[0].fill('Victor'); await inputs[1].fill('pedrito88');
  await pg.locator('button[type="submit"]').first().click();
  await pg.waitForTimeout(4000);
  await pg.getByText('Consulta de Tarifas').first().click();
  const foto = {};
  for (const tab of ['Comparativas 2.0', 'Comparativas 3.0 y 6.1', 'Comparativas Gas']) {
    await pg.getByRole('button', { name: tab, exact: true }).click();
    await pg.waitForTimeout(800);
    foto[tab] = await pg.evaluate(() => {
      const zona = document.querySelector('main') || document.body;
      return [...zona.querySelectorAll('input, select, textarea, button')]
        .filter(e => e.offsetParent !== null || e.type === 'file' || e.type === 'radio')
        .map(e => [e.tagName.toLowerCase(), e.type || '', e.id || '', e.name || '', e.value && (e.type === 'radio') ? e.value : '', e.tagName === 'BUTTON' ? e.textContent.trim().slice(0, 40) : ''].join('|'));
    });
  }
  fs.writeFileSync(salida, JSON.stringify(foto, null, 1));
  console.log(Object.fromEntries(Object.entries(foto).map(([k, v]) => [k, v.length])));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
