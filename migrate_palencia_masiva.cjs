/**
 * migrate_palencia_masiva.cjs
 * Importación masiva de contactos Palencia desde Excel a Supabase.
 *
 * REGLAS DE SEGURIDAD:
 *  - Solo inserta CUPS que NO existan ya en la BD (nunca sobreescribe ni borra).
 *  - ya_llamado se establece siempre a null (el trabajo del equipo se preserva).
 *  - Orden de inserción = orden de pestañas del Excel de izquierda a derecha.
 *  - COMUNIDADES PROPIETARIOS no tiene fila de cabecera → datos desde fila 0.
 *
 * Uso:
 *   node migrate_palencia_masiva.cjs          → DRY RUN (sin tocar la BD)
 *   node migrate_palencia_masiva.cjs --real   → inserción real
 */

'use strict';

const XLSX   = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

// ── Conexión Supabase ─────────────────────────────────────────────────────────
const sb = createClient(
  'https://ndcslcsuavjdctqhkrfu.supabase.co',
  'sb_publishable_wT-SN2q_Os6tDcu0FYzjsg_agsreRCm'
);

// ── Config ────────────────────────────────────────────────────────────────────
const EXCEL_PATH  = 'C:/Users/victor/Downloads/BASE DATOS PALENCIA PARTICULAR (1).xlsx';
const PROVINCIA   = 'Palencia';
const DRY_RUN     = !process.argv.includes('--real');
const BATCH_SIZE  = 50;

// Pestañas a omitir (no son calles)
const SKIP_SHEETS = new Set(['LISTADO CALLES']);
// Pestañas sin fila de cabecera (datos desde fila 0)
const NO_HEADER   = new Set(['COMUNIDADES PROPIETARIOS']);

// ── Limpieza de campos ────────────────────────────────────────────────────────
function cleanCups(val) {
  if (!val) return null;
  const s = String(val).replace(/\n/g, '').replace(/\r/g, '').replace(/\s+/g, '').trim();
  // CUPS válido: empieza por ES o similar y tiene al menos 20 chars
  return s.length >= 18 ? s.toUpperCase() : null;
}

function cleanNombre(val) {
  const s = String(val || '').trim();
  return s || null;
}

function cleanDireccion(val) {
  const s = String(val || '').trim();
  return s || null;
}

function cleanMovil(val) {
  if (!val && val !== 0) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (/fijo|normal|no\s*hay/i.test(s)) return null;
  // Quitar prefijo +34 / 34 y espacios
  const digits = s.replace(/[\s\-\+\(\)]/g, '');
  return digits || null;
}

function cleanPrecio(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || /no\s*hay|no\s*sale|no\s*salen/i.test(s)) return null;
  return s;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  IMPORTACIÓN MASIVA PALENCIA  ${DRY_RUN ? '[ DRY RUN — SIN ESCRITURA ]' : '[ MODO REAL !! ]'}  ║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Cargar CUPS existentes en BD ─────────────────────────────────────────
  console.log('▶ Cargando CUPS existentes en Supabase...');
  const { data: existing, error: fetchErr } = await sb
    .from('telemarketing_contactos')
    .select('cups, calle')
    .eq('provincia', PROVINCIA);

  if (fetchErr) {
    console.error('ERROR al consultar BD:', fetchErr.message);
    process.exit(1);
  }

  const existingCups = new Set(existing.map(r => r.cups).filter(Boolean));
  console.log(`  → ${existingCups.size} CUPS ya en BD para Palencia`);
  console.log('');

  // ── 2. Leer Excel ────────────────────────────────────────────────────────────
  console.log('▶ Leyendo Excel:', EXCEL_PATH);
  const wb        = XLSX.readFile(EXCEL_PATH);
  const allSheets = wb.SheetNames.filter(n => !SKIP_SHEETS.has(n.trim()));
  console.log(`  → ${allSheets.length} pestañas de calles encontradas`);
  console.log('');

  // ── 3. Procesar cada pestaña ─────────────────────────────────────────────────
  const idBase   = Date.now();
  let   globalIdx = 0;
  let   totalNew  = 0;
  let   totalSkip = 0;
  const seenCups  = new Set(existingCups); // copia mutable para detectar duplicados en el propio Excel

  const resumen = [];

  for (const sheetName of allSheets) {
    const calleName = sheetName.trim(); // normalizar (eliminar espacios iniciales/finales)
    const ws        = wb.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // COMUNIDADES PROPIETARIOS: sin cabecera, datos desde fila 0
    // Resto: fila 0 es cabecera, datos desde fila 1
    const dataRows = NO_HEADER.has(calleName) ? rawRows : rawRows.slice(1);

    const nuevos = [];

    for (const row of dataRows) {
      const cups = cleanCups(row[1]);
      if (!cups) continue; // fila vacía o sin CUPS válido

      if (seenCups.has(cups)) {
        totalSkip++;
        continue; // ya existe en BD o ya procesado en este Excel
      }

      const record = {
        id:            idBase + globalIdx++,
        provincia:     PROVINCIA,
        calle:         calleName,
        nombre:        cleanNombre(row[0]),
        cups,
        direccion:     cleanDireccion(row[2]),
        movil:         cleanMovil(row[3]),
        precio_actual: cleanPrecio(row[4]),
        ya_llamado:    null,  // NUNCA se toca esta columna
      };

      nuevos.push(record);
      seenCups.add(cups); // prevenir duplicados dentro del propio Excel
    }

    resumen.push({ calleName, count: nuevos.length });

    if (nuevos.length === 0) {
      console.log(`  ✓ ${calleName.padEnd(40)} → 0 nuevos (todos ya existían o sin CUPS)`);
      continue;
    }

    console.log(`  ✦ ${calleName.padEnd(40)} → ${nuevos.length} nuevos`);
    if (DRY_RUN) {
      // En dry-run mostramos los primeros 2 registros de cada calle
      nuevos.slice(0, 2).forEach(r =>
        console.log(`      [DRY] ${r.cups} | ${(r.nombre || '(sin nombre)').substring(0, 30)} | ${(r.direccion || '').substring(0, 35)}`)
      );
      if (nuevos.length > 2) console.log(`      [DRY] ... y ${nuevos.length - 2} más`);
    } else {
      // Inserción real por lotes
      for (let i = 0; i < nuevos.length; i += BATCH_SIZE) {
        const batch = nuevos.slice(i, i + BATCH_SIZE);
        const { error } = await sb.from('telemarketing_contactos').insert(batch);
        if (error) {
          console.error(`\n  ERROR insertando lote en ${calleName}:`, error.message);
          console.error('  Datos del primer registro del lote:', JSON.stringify(batch[0], null, 2));
          process.exit(1);
        }
      }
      console.log(`      ✅ Insertados ${nuevos.length} contactos`);
    }

    totalNew += nuevos.length;
  }

  // ── 4. Resumen final ─────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESUMEN FINAL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Calles procesadas: ${allSheets.length}`);
  console.log(`  CUPS nuevos:       ${totalNew}`);
  console.log(`  CUPS omitidos:     ${totalSkip} (ya existían en BD o duplicados en Excel)`);
  console.log(`  CUPS existentes:   ${existingCups.size}`);
  console.log('');

  if (DRY_RUN) {
    console.log('  ⚠️  MODO DRY RUN — No se ha escrito nada en la BD.');
    console.log('  ⚠️  Ejecuta con --real para aplicar los cambios:');
    console.log('      node migrate_palencia_masiva.cjs --real');
  } else {
    console.log(`  ✅ IMPORTACIÓN COMPLETADA. ${totalNew} contactos insertados.`);
  }
  console.log('');
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1); });
