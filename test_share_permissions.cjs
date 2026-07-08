/**
 * Test end-to-end: Permisos de Compartición de Contratos
 *
 * Flujo:
 *  1. Admin (Victor) otorga permiso a PEDROTRECENO para compartir SOLO con ELISAGARCIA
 *     (vía el panel "Compartición" en Gestión de Usuarios).
 *  2. Se inserta un contrato de prueba propiedad de PEDROTRECENO directamente en Supabase.
 *  3. Login como PEDROTRECENO -> ShareButton solo debe ofrecer "ELISA GARCIA" como destino.
 *     Se comparte el contrato con ella.
 *  4. Login como ELISAGARCIA -> debe ver el contrato, con la fila en gris claro y
 *     "Compartido por" = PEDRO TRECEÑO.
 *  5. Cleanup: se borra el contrato de prueba y se restauran los share_permissions
 *     originales de PEDROTRECENO.
 */
'use strict';
const { chromium } = require('playwright');
const { createClient } = require('./node_modules/@supabase/supabase-js/dist/index.cjs');

const BASE = 'http://localhost:5180';
const sb = createClient(
  'https://ndcslcsuavjdctqhkrfu.supabase.co',
  'sb_publishable_wT-SN2q_Os6tDcu0FYzjsg_agsreRCm'
);

const ADMIN  = { user: 'Victor',       pass: 'pedrito88' };
const PEDRO  = { user: 'PEDROTRECENO', pass: 'Pedro2026', display: 'PEDRO TRECEÑO' };
const ELISA  = { user: 'ELISAGARCIA',  pass: 'Elisa2026', display: 'ELISA GARCIA' };

let testContractId = null;
let originalPedroPerms = null; // snapshot para restaurar al final

function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

async function login(page, creds) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const cerrar = page.locator('button').filter({ hasText: 'Cerrar Sesión' });
  if (await cerrar.count() > 0) {
    await cerrar.click();
    await page.waitForTimeout(1500);
  }
  const userIn = page.locator('input[type="text"]').first();
  await userIn.waitFor({ timeout: 5000 });
  await userIn.fill(creds.user);
  await page.locator('input[type="password"]').fill(creds.pass);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  log(`Login OK: ${creds.user}`);
}

async function gotoSidebar(page, label) {
  const btn = page.locator('button').filter({ hasText: new RegExp(label, 'i') }).first();
  await btn.click();
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════════
// PASO 1: Admin otorga permiso Pedro -> Elisa vía UI
// ═══════════════════════════════════════════════════════════════
async function grantPermissionViaUI(page) {
  log('\n== PASO 1: Admin otorga permiso PEDROTRECENO -> ELISAGARCIA ==');

  const { data: before } = await sb.from('share_permissions')
    .select('allowed_username').eq('comercial_username', PEDRO.user);
  originalPedroPerms = (before || []).map(r => r.allowed_username);
  log(`  Snapshot permisos previos de Pedro: [${originalPedroPerms.join(', ')}]`);

  await login(page, ADMIN);
  await gotoSidebar(page, 'Gestión de Usuarios|Gestion de Usuarios|Usuarios');

  // Localizar específicamente el botón "Compartición" en la fila de Pedro
  // (filtrar por username, no por display name: el card-resumen del rol también
  // contiene "PEDRO TRECEÑO" en su lista de nombres, y .first() cogería ese)
  const pedroBlock = page.locator('div.px-5.py-4').filter({ hasText: PEDRO.user }).first();
  const pedroShareBtn = pedroBlock.locator('button').filter({ hasText: 'Compartición' }).first();
  await pedroShareBtn.waitFor({ timeout: 8000 });
  await pedroShareBtn.click();
  await page.waitForTimeout(600);
  log('  Modal "Permisos de compartición" abierto para Pedro');

  // Deseleccionar cualquier usuario ya marcado, luego marcar solo ELISA GARCIA
  const modal = page.locator('div.rounded-2xl').filter({ hasText: 'Permisos de compartición' }).first();
  const allBtns = modal.locator('button').filter({ hasText: '@' });
  const total = await allBtns.count();
  for (let i = 0; i < total; i++) {
    const txt = await allBtns.nth(i).innerText();
    const isChecked = (await allBtns.nth(i).locator('svg').count()) > 0;
    if (/ELISA GARCIA/.test(txt) && !isChecked) await allBtns.nth(i).click();
    else if (!/ELISA GARCIA/.test(txt) && isChecked) await allBtns.nth(i).click();
    await page.waitForTimeout(100);
  }

  const guardar = modal.locator('button').filter({ hasText: /^Guardar$/ });
  await guardar.click();
  await page.waitForTimeout(1000);
  log('  Guardado');

  const { data: after } = await sb.from('share_permissions')
    .select('allowed_username').eq('comercial_username', PEDRO.user);
  const allowedNow = (after || []).map(r => r.allowed_username);
  log(`  BD share_permissions[PEDROTRECENO] = [${allowedNow.join(', ')}]`);
  const ok = allowedNow.length === 1 && allowedNow[0] === ELISA.user;
  log(`  PASO 1: ${ok ? 'PASS ✓' : 'FAIL ✗'}`);
  return ok;
}

// ═══════════════════════════════════════════════════════════════
// PASO 2: Insertar contrato de prueba propiedad de Pedro
// ═══════════════════════════════════════════════════════════════
async function insertContratoPedro() {
  log('\n== PASO 2: Insertar contrato de prueba (PEDROTRECENO) ==');
  const nombre = `TEST_SHAREPERM_${Date.now()}`;
  const { data, error } = await sb.from('clientes').insert({
    id: Date.now(),
    nombre,
    tipo: 'B2C',
    comercial: PEDRO.user,
    creado_por: PEDRO.user,
    equipo: 'Ninguno',
    estado: 'Pendiente Firma',
    fecha_tramitacion: new Date().toISOString().split('T')[0],
    compartido_con: [],
    shared_by: null,
    deleted_at: null,
  }).select('id,nombre').single();
  if (error) { log(`  ERROR INSERT: ${error.message}`); return null; }
  testContractId = data.id;
  log(`  INSERT OK: id=${data.id} nombre="${data.nombre}"`);
  return data;
}

// ═══════════════════════════════════════════════════════════════
// PASO 3: Login Pedro, verificar filtrado de ShareButton y compartir
// ═══════════════════════════════════════════════════════════════
async function shareAsPedro(page, nombre) {
  log('\n== PASO 3: PEDROTRECENO comparte el contrato con ELISAGARCIA ==');
  await login(page, PEDRO);
  await gotoSidebar(page, 'Alta B2C');
  await page.waitForTimeout(1500);

  const fila = page.locator('tr').filter({ hasText: nombre }).first();
  await fila.waitFor({ timeout: 8000 });
  log('  Fila del contrato de prueba encontrada');

  const shareBtn = fila.locator('button[title*="Compartir"]').first();
  await shareBtn.click();
  await page.waitForTimeout(600);

  const popoverText = await page.locator('div.absolute.right-0.top-7').innerText();
  const soloElisa = /ELISA GARCIA/.test(popoverText) && !/CARMEN BALLESTEROS|OSCAR ZAMARRO|ISABEL ERICE|IRENE BONILLO/.test(popoverText);
  log(`  Popover solo ofrece ELISA GARCIA como destino: ${soloElisa ? 'SI ✓' : 'NO ✗'}`);
  log(`  Texto popover: ${popoverText.replace(/\n/g, ' | ')}`);

  const elisaBtn = page.locator('button').filter({ hasText: 'ELISA GARCIA' }).first();
  await elisaBtn.click();
  await page.waitForTimeout(300);
  const guardar = page.locator('button').filter({ hasText: /^Guardar$/ }).last();
  await guardar.click();
  await page.waitForTimeout(1500);
  log('  Compartido y guardado');

  return soloElisa;
}

// ═══════════════════════════════════════════════════════════════
// PASO 4: Login Elisa, verificar visibilidad + fila gris + columna
// ═══════════════════════════════════════════════════════════════
async function verifyAsElisa(page, nombre) {
  log('\n== PASO 4: ELISAGARCIA verifica el contrato recibido ==');
  await login(page, ELISA);
  await gotoSidebar(page, 'Alta B2C');
  await page.waitForTimeout(1500);

  const fila = page.locator('tr').filter({ hasText: nombre }).first();
  const visible = await fila.count() > 0;
  log(`  Contrato visible en tabla de Elisa: ${visible ? 'SI ✓' : 'NO ✗'}`);
  if (!visible) return false;

  const claseFila = await fila.getAttribute('class');
  const esVerde = /bg-green-50/.test(claseFila || '');
  log(`  Fila con bg-green-50: ${esVerde ? 'SI ✓' : 'NO ✗'} (class="${claseFila}")`);

  const primeraCelda = await fila.locator('td').first().innerText();
  const compartidoPorOk = primeraCelda.trim() === PEDRO.display;
  log(`  Columna "Compartido por" = "${primeraCelda.trim()}" (esperado "${PEDRO.display}"): ${compartidoPorOk ? 'SI ✓' : 'NO ✗'}`);

  return visible && esVerde && compartidoPorOk;
}

// ═══════════════════════════════════════════════════════════════
// CLEANUP
// ═══════════════════════════════════════════════════════════════
async function cleanup() {
  log('\n== CLEANUP ==');
  if (testContractId) {
    const { error } = await sb.from('clientes').delete().eq('id', testContractId);
    log(error ? `  ERROR borrando contrato: ${error.message}` : `  Contrato ${testContractId} eliminado`);
  }
  await sb.from('clientes').delete().like('nombre', 'TEST_SHAREPERM_%');

  if (originalPedroPerms !== null) {
    await sb.from('share_permissions').delete().eq('comercial_username', PEDRO.user);
    if (originalPedroPerms.length > 0) {
      await sb.from('share_permissions').insert(
        originalPedroPerms.map(allowed_username => ({ comercial_username: PEDRO.user, allowed_username }))
      );
    }
    log(`  Permisos de Pedro restaurados a: [${originalPedroPerms.join(', ')}]`);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') log(`  [JS] ${m.text().slice(0, 150)}`); });

  let p1 = false, p3 = false, p4 = false;
  try {
    p1 = await grantPermissionViaUI(page);
    const rec = await insertContratoPedro();
    if (rec) {
      p3 = await shareAsPedro(page, rec.nombre);
      p4 = await verifyAsElisa(page, rec.nombre);
    }
  } catch (e) {
    log(`\nERROR: ${e.message}`);
    console.error(e.stack);
  } finally {
    await browser.close();
    await cleanup();
  }

  const w = 60;
  const line = '─'.repeat(w);
  console.log(`\n┌${line}┐`);
  console.log(`│${'REPORTE: PERMISOS DE COMPARTICIÓN'.padStart(46).padEnd(w)}│`);
  console.log(`├${line}┤`);
  console.log(`│ ${('Paso 1 (Admin otorga permiso Pedro->Elisa): ' + (p1 ? 'PASS ✓' : 'FAIL ✗')).padEnd(w - 2)} │`);
  console.log(`│ ${('Paso 3 (Pedro comparte, dropdown filtrado):  ' + (p3 ? 'PASS ✓' : 'FAIL ✗')).padEnd(w - 2)} │`);
  console.log(`│ ${('Paso 4 (Elisa ve contrato, fila gris, col.): ' + (p4 ? 'PASS ✓' : 'FAIL ✗')).padEnd(w - 2)} │`);
  console.log(`└${line}┘`);

  process.exit(p1 && p3 && p4 ? 0 : 1);
}

main();
