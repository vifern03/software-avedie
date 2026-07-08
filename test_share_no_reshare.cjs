/**
 * Test: un receptor de un contrato compartido NO puede volver a compartirlo.
 *
 * Flujo:
 *  1. Pedro (dueño) comparte un contrato de prueba con Elisa.
 *  2. Login como Elisa: el ShareButton de ESE contrato debe estar deshabilitado
 *     (icono gris, sin popover al hacer click) porque ella no es la dueña.
 *  3. Verifica que el botón de "Editar" (Pencil) de esa misma fila SÍ sigue
 *     activo, para confirmar que solo se restringe compartir, no todo lo demás.
 */
'use strict';
const { chromium } = require('playwright');
const { createClient } = require('./node_modules/@supabase/supabase-js/dist/index.cjs');

const BASE = 'http://localhost:5180';
const sb = createClient(
  'https://ndcslcsuavjdctqhkrfu.supabase.co',
  'sb_publishable_wT-SN2q_Os6tDcu0FYzjsg_agsreRCm'
);

const PEDRO = { user: 'PEDROTRECENO', pass: 'Pedro2026' };
const ELISA = { user: 'ELISAGARCIA',  pass: 'Elisa2026' };

let testContractId = null;
let originalPedroPerms = null;

function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

async function login(page, creds) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const cerrar = page.locator('button').filter({ hasText: 'Cerrar Sesión' });
  if (await cerrar.count() > 0) { await cerrar.click(); await page.waitForTimeout(1500); }
  const userIn = page.locator('input[type="text"]').first();
  await userIn.waitFor({ timeout: 5000 });
  await userIn.fill(creds.user);
  await page.locator('input[type="password"]').fill(creds.pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  log(`Login OK: ${creds.user}`);
}

async function gotoSidebar(page, label) {
  await page.locator('button').filter({ hasText: new RegExp(label, 'i') }).first().click();
  await page.waitForTimeout(2000);
}

async function main() {
  const { data: before } = await sb.from('share_permissions')
    .select('allowed_username').eq('comercial_username', PEDRO.user);
  originalPedroPerms = (before || []).map(r => r.allowed_username);
  await sb.from('share_permissions').delete().eq('comercial_username', PEDRO.user);
  await sb.from('share_permissions').insert({ comercial_username: PEDRO.user, allowed_username: ELISA.user });
  log(`Snapshot previo de Pedro: [${originalPedroPerms.join(', ')}] (forzado a [ELISAGARCIA] para el test)`);

  const nombre = `TEST_NORESHARE_${Date.now()}`;
  const { data, error } = await sb.from('clientes').insert({
    id: Date.now(),
    nombre,
    tipo: 'B2C',
    comercial: PEDRO.user,
    creado_por: PEDRO.user,
    equipo: 'Ninguno',
    estado: 'Pendiente Firma',
    fecha_tramitacion: new Date().toISOString().split('T')[0],
    compartido_con: ['ELISA GARCIA'],
    shared_by: PEDRO.user,
    deleted_at: null,
  }).select('id,nombre').single();
  if (error) { log(`ERROR INSERT: ${error.message}`); process.exit(1); }
  testContractId = data.id;
  log(`Contrato de prueba (ya compartido con Elisa) insertado: id=${data.id}`);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  let pass = false;
  try {
    await login(page, ELISA);
    await gotoSidebar(page, 'Alta B2C');
    await page.waitForTimeout(1500);

    const fila = page.locator('tr').filter({ hasText: nombre }).first();
    await fila.waitFor({ timeout: 8000 });

    // El ShareButton debe renderizarse como <span> deshabilitado, no <button>
    const shareSpan = fila.locator('span[title*="dio de alta"]');
    const shareBtnInteractive = fila.locator('button[title*="Compartir"], button[title*="Modificar acceso"], button[title*="Compartido con"]');
    const spanCount = await shareSpan.count();
    const btnCount = await shareBtnInteractive.count();
    log(`  Icono compartir como <span> deshabilitado: ${spanCount > 0 ? 'SI ✓' : 'NO ✗'} (spanCount=${spanCount}, btnCount=${btnCount})`);

    let noPopoverAlAbrir = true;
    if (spanCount > 0) {
      await shareSpan.click({ force: true });
      await page.waitForTimeout(500);
      const popoverAbierto = await page.locator('div.absolute.right-0.top-7').count();
      noPopoverAlAbrir = popoverAbierto === 0;
      log(`  Click en el icono NO abre popover: ${noPopoverAlAbrir ? 'SI ✓' : 'NO ✗'}`);
    }

    const editBtn = fila.locator('button[title="Editar"]');
    const editOk = await editBtn.count() > 0;
    log(`  Botón "Editar" sigue disponible en la misma fila: ${editOk ? 'SI ✓' : 'NO ✗'}`);

    pass = spanCount > 0 && btnCount === 0 && noPopoverAlAbrir && editOk;
  } catch (e) {
    log(`ERROR: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
  }

  log('\n== CLEANUP ==');
  if (testContractId) {
    await sb.from('clientes').delete().eq('id', testContractId);
    log(`  Contrato ${testContractId} eliminado`);
  }
  await sb.from('clientes').delete().like('nombre', 'TEST_NORESHARE_%');
  await sb.from('share_permissions').delete().eq('comercial_username', PEDRO.user);
  if (originalPedroPerms.length > 0) {
    await sb.from('share_permissions').insert(
      originalPedroPerms.map(allowed_username => ({ comercial_username: PEDRO.user, allowed_username }))
    );
  }
  log(`  Permisos de Pedro restaurados a: [${originalPedroPerms.join(', ')}]`);

  console.log(`\nRESULTADO: ${pass ? 'PASS ✓ (Elisa no puede re-compartir el contrato de Pedro)' : 'FAIL ✗'}`);
  process.exit(pass ? 0 : 1);
}

main();
