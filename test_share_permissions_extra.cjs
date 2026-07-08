/**
 * Extensión de test_share_permissions.cjs: cubre los dos casos no probados
 * en la primera ronda:
 *   A) Tabla B2B: misma columna "Compartido por" + fila gris que en B2C.
 *   B) Flujo "compartir al dar de alta" desde NewClientModal (no solo el
 *      ShareButton de la tabla ya existente).
 *
 * Requiere que PEDROTRECENO ya tenga permiso para compartir con ELISAGARCIA
 * (se otorga y se revierte dentro del propio script, igual que el test base).
 */
'use strict';
const { chromium } = require('playwright');
const { createClient } = require('./node_modules/@supabase/supabase-js/dist/index.cjs');
const path = require('path');

const BASE = 'http://localhost:5180';
const sb = createClient(
  'https://ndcslcsuavjdctqhkrfu.supabase.co',
  'sb_publishable_wT-SN2q_Os6tDcu0FYzjsg_agsreRCm'
);

const ADMIN = { user: 'Victor',       pass: 'pedrito88' };
const PEDRO = { user: 'PEDROTRECENO', pass: 'Pedro2026', display: 'PEDRO TRECEÑO' };
const ELISA = { user: 'ELISAGARCIA',  pass: 'Elisa2026', display: 'ELISA GARCIA' };

let originalPedroPerms = null;
let b2bContractId = null;
let b2cCreatedCups = null;

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

async function ensurePermission() {
  const { data: before } = await sb.from('share_permissions')
    .select('allowed_username').eq('comercial_username', PEDRO.user);
  originalPedroPerms = (before || []).map(r => r.allowed_username);
  log(`Snapshot permisos previos de Pedro: [${originalPedroPerms.join(', ')}]`);

  await sb.from('share_permissions').delete().eq('comercial_username', PEDRO.user);
  await sb.from('share_permissions').insert({ comercial_username: PEDRO.user, allowed_username: ELISA.user });
  log('Permiso Pedro -> Elisa forzado directamente en BD para este test');
}

// ═══════════════════════════════════════════════════════════════
// CASO A: Tabla B2B
// ═══════════════════════════════════════════════════════════════
async function testB2B(page) {
  log('\n== CASO A: Compartir en tabla B2B ==');
  const nombre = `TEST_B2B_SHAREPERM_${Date.now()}`;
  const { data, error } = await sb.from('clientes').insert({
    id: Date.now(),
    nombre,
    tipo: 'B2B',
    comercial: PEDRO.user,
    creado_por: PEDRO.user,
    equipo: 'Ninguno',
    estado: 'Pendiente Firma',
    fecha_tramitacion: new Date().toISOString().split('T')[0],
    compartido_con: [],
    shared_by: null,
    deleted_at: null,
  }).select('id,nombre').single();
  if (error) { log(`  ERROR INSERT B2B: ${error.message}`); return false; }
  b2bContractId = data.id;
  log(`  Contrato B2B de prueba insertado: id=${data.id}`);

  await login(page, PEDRO);
  await gotoSidebar(page, 'Alta B2B');
  await page.waitForTimeout(1500);

  const fila = page.locator('tr').filter({ hasText: nombre }).first();
  await fila.waitFor({ timeout: 8000 });
  const shareBtn = fila.locator('button[title*="Compartir"]').first();
  await shareBtn.click();
  await page.waitForTimeout(600);
  const popoverText = await page.locator('div.absolute.right-0.top-7').innerText();
  const soloElisa = /ELISA GARCIA/.test(popoverText) && !/CARMEN BALLESTEROS|OSCAR ZAMARRO/.test(popoverText);
  log(`  Popover B2B solo ofrece ELISA GARCIA: ${soloElisa ? 'SI ✓' : 'NO ✗'}`);
  await page.locator('button').filter({ hasText: 'ELISA GARCIA' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button').filter({ hasText: /^Guardar$/ }).last().click();
  await page.waitForTimeout(1500);

  await login(page, ELISA);
  await gotoSidebar(page, 'Alta B2B');
  await page.waitForTimeout(1500);
  const filaElisa = page.locator('tr').filter({ hasText: nombre }).first();
  const visible = await filaElisa.count() > 0;
  log(`  Contrato B2B visible para Elisa: ${visible ? 'SI ✓' : 'NO ✗'}`);
  if (!visible) return false;
  const claseFila = await filaElisa.getAttribute('class');
  const esGris = /bg-gray-100/.test(claseFila || '');
  log(`  Fila B2B con bg-gray-100: ${esGris ? 'SI ✓' : 'NO ✗'}`);
  const primeraCelda = (await filaElisa.locator('td').first().innerText()).trim();
  const colOk = primeraCelda === PEDRO.display;
  log(`  Columna "Compartido por" B2B = "${primeraCelda}": ${colOk ? 'SI ✓' : 'NO ✗'}`);

  return soloElisa && visible && esGris && colOk;
}

// ═══════════════════════════════════════════════════════════════
// CASO B: Compartir al dar de alta (NewClientModal)
// ═══════════════════════════════════════════════════════════════
async function testNewClientModal(page) {
  log('\n== CASO B: Compartir al crear (NewClientModal, B2C) ==');
  const nombreCliente = `TEST_ALTA_SHAREPERM_${Date.now()}`;
  const cups = `ESTESTSHARE${Date.now()}`.slice(0, 22);
  b2cCreatedCups = cups;

  await login(page, PEDRO);
  await gotoSidebar(page, 'Alta B2C');
  await page.waitForTimeout(1500);

  await page.locator('button').filter({ hasText: 'Nuevo Cliente' }).first().click();
  await page.waitForTimeout(600);

  const modal = page.locator('form').last();
  await modal.locator('input[placeholder*="Juan García"]').fill(nombreCliente);
  await modal.locator('input[placeholder*="12345678Z"]').fill('12345678Z');
  await modal.locator('input[type="tel"]').fill('612345678');
  await modal.locator('input[placeholder*="ES1234567890"]').fill(cups);
  await modal.locator('input[placeholder*="ES91 2100"]').fill('ES9121000418450200051332');
  await modal.locator('input[placeholder*="Tarifa Libre"]').fill('TEST PRODUCTO');

  // Tarifa (primer <select> tras Estado en el bloque grid) — usar el select con optgroup Electricidad
  const tarifaSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: '2.0TD' }) }).first();
  await tarifaSelect.selectOption('2.0TD');

  // Vendido por: "Otro (especificar)"
  const vendidoSelect = modal.locator('select').filter({ has: page.locator('option', { hasText: 'Otro (especificar)' }) }).last();
  await vendidoSelect.selectOption('__vendido_otro__');
  await page.waitForTimeout(200);
  await modal.locator('input[placeholder*="nombre del vendedor"]').fill('TEST VENDEDOR');

  // Compartir: radio "Sí"
  await modal.locator('input[type="radio"]').nth(1).click();
  await page.waitForTimeout(400);

  const shareSection = modal.locator('div').filter({ hasText: 'Selecciona los trabajadores con acceso' }).last();
  const popoverText = await shareSection.innerText();
  const soloElisa = /ELISA GARCIA/.test(popoverText) && !/CARMEN BALLESTEROS|OSCAR ZAMARRO/.test(popoverText);
  log(`  NewClientModal solo ofrece ELISA GARCIA como destino: ${soloElisa ? 'SI ✓' : 'NO ✗'}`);
  await modal.locator('button').filter({ hasText: 'ELISA GARCIA' }).first().click();

  // Subir DNI (obligatorio en alta B2C, input[type=file] oculto)
  const fileInput = modal.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.join(__dirname, 'test_dummy_dni.png'));
  await page.waitForTimeout(300);

  await modal.locator('button[type="submit"]').click();
  await page.waitForTimeout(1500);
  log('  Formulario enviado');

  const { data: check } = await sb.from('clientes')
    .select('nombre,compartido_con,shared_by').eq('cups', cups).maybeSingle();
  if (!check) { log('  ERROR: no se encontró el contrato creado en BD'); return false; }
  log(`  BD: compartido_con=${JSON.stringify(check.compartido_con)} shared_by=${check.shared_by}`);
  const bdOk = (check.compartido_con || []).includes(ELISA.display) && check.shared_by === PEDRO.user;
  log(`  BD compartido_con + shared_by correctos: ${bdOk ? 'SI ✓' : 'NO ✗'}`);

  await login(page, ELISA);
  await gotoSidebar(page, 'Alta B2C');
  await page.waitForTimeout(1500);
  const filaElisa = page.locator('tr').filter({ hasText: nombreCliente }).first();
  const visible = await filaElisa.count() > 0;
  log(`  Contrato visible para Elisa: ${visible ? 'SI ✓' : 'NO ✗'}`);
  let esGris = false, colOk = false;
  if (visible) {
    const claseFila = await filaElisa.getAttribute('class');
    esGris = /bg-gray-100/.test(claseFila || '');
    const primeraCelda = (await filaElisa.locator('td').first().innerText()).trim();
    colOk = primeraCelda === PEDRO.display;
    log(`  Fila gris: ${esGris ? 'SI ✓' : 'NO ✗'} · Columna "Compartido por": "${primeraCelda}" ${colOk ? '✓' : '✗'}`);
  }

  return soloElisa && bdOk && visible && esGris && colOk;
}

async function cleanup() {
  log('\n== CLEANUP ==');
  if (b2bContractId) {
    await sb.from('clientes').delete().eq('id', b2bContractId);
    log(`  Contrato B2B ${b2bContractId} eliminado`);
  }
  await sb.from('clientes').delete().like('nombre', 'TEST_B2B_SHAREPERM_%');
  if (b2cCreatedCups) {
    await sb.from('clientes').delete().eq('cups', b2cCreatedCups);
    log(`  Contrato B2C (cups=${b2cCreatedCups}) eliminado`);
  }
  await sb.from('clientes').delete().like('nombre', 'TEST_ALTA_SHAREPERM_%');

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

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error') log(`  [JS] ${m.text().slice(0, 150)}`); });

  let A = false, B = false;
  try {
    await ensurePermission();
    A = await testB2B(page);
    B = await testNewClientModal(page);
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
  console.log(`│${'REPORTE: CASOS ADICIONALES'.padStart(43).padEnd(w)}│`);
  console.log(`├${line}┤`);
  console.log(`│ ${('Caso A (tabla B2B):                    ' + (A ? 'PASS ✓' : 'FAIL ✗')).padEnd(w - 2)} │`);
  console.log(`│ ${('Caso B (compartir al dar de alta):     ' + (B ? 'PASS ✓' : 'FAIL ✗')).padEnd(w - 2)} │`);
  console.log(`└${line}┘`);

  process.exit(A && B ? 0 : 1);
}

main();
