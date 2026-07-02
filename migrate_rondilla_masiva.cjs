/**
 * migrate_rondilla_masiva.cjs
 * Importación masiva de contactos Valladolid (La Rondilla) desde Excel a Supabase.
 *
 * REGLAS DE SEGURIDAD:
 *  - Solo inserta CUPS que NO existan ya en la BD (nunca sobreescribe ni borra).
 *  - ya_llamado se establece siempre a null (trabajo del equipo preservado al 100%).
 *  - Orden de inserción = orden de pestañas del Excel de izquierda a derecha.
 *  - Todas las pestañas tienen fila de cabecera en la fila 0 → datos desde fila 1.
 *  - provincia = 'Valladolid' fijo; no se toca nada de Palencia.
 *
 * Uso:
 *   node migrate_rondilla_masiva.cjs          → DRY RUN (sin tocar la BD)
 *   node migrate_rondilla_masiva.cjs --real   → inserción real
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
const EXCEL_PATH  = 'C:/Users/victor/Downloads/BASE DATOS RONDILLA (1).xlsx';
const PROVINCIA   = 'Valladolid';
const DRY_RUN     = !process.argv.includes('--real');
const BATCH_SIZE  = 50;

// Pestaña de índice/resumen que no contiene contactos
const SKIP_SHEETS = new Set(['CALLES']);

// ── Limpieza de campos ────────────────────────────────────────────────────────
function cleanCups(val) {
  if (!val) return null;
  // Limpiar saltos de línea y espacios iniciales/finales
  const s = String(val).replace(/\n/g, '').replace(/\r/g, '').trim();
  // Extraer CUPS con regex: 2 letras de país seguidas de 16-24 caracteres alfanuméricos
  // Esto ignora sufijos como " luz", " LUZ", notas como "hay 5 CUPS mas activos", etc.
  const match = s.match(/^([A-Z]{2}[0-9A-Z]{16,24})/i);
  if (!match) return null;
  const cups = match[1].toUpperCase();
  return cups.length >= 18 ? cups : null;
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
  if (!s || /fijo|normal|no\s*hay/i.test(s)) return null;
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
  console.log(`║  IMPORTACIÓN RONDILLA VALLADOLID  ${DRY_RUN ? '[ DRY RUN — SIN BD ]     ' : '[ MODO REAL !!  ]     '}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // ── 1. Cargar CUPS existentes en BD para Valladolid ──────────────────────────
  console.log('▶ Cargando CUPS existentes en Supabase (Valladolid)...');
  const { data: existing, error: fetchErr } = await sb
    .from('telemarketing_contactos')
    .select('cups')
    .eq('provincia', PROVINCIA);

  if (fetchErr) {
    console.error('ERROR al consultar BD:', fetchErr.message);
    process.exit(1);
  }

  const existingCups = new Set(existing.map(r => r.cups).filter(Boolean));
  console.log(`  → ${existingCups.size} CUPS ya en BD para Valladolid`);
  console.log('');

  // ── 2. Leer Excel ────────────────────────────────────────────────────────────
  console.log('▶ Leyendo Excel:', EXCEL_PATH);
  const wb        = XLSX.readFile(EXCEL_PATH);
  const allSheets = wb.SheetNames.filter(n => !SKIP_SHEETS.has(n.trim()));
  console.log(`  → ${allSheets.length} pestañas de calles encontradas`);
  console.log('');

  // ── 3. Procesar cada pestaña ─────────────────────────────────────────────────
  const idBase    = Date.now();
  let   globalIdx = 0;
  let   totalNew  = 0;
  let   totalSkip = 0;
  const seenCups  = new Set(existingCups); // previene duplicados dentro del propio Excel

  for (const sheetName of allSheets) {
    const calleName = sheetName.trim();
    const ws        = wb.Sheets[sheetName];
    const rawRows   = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Todas las pestañas de este Excel tienen cabecera en fila 0 → datos desde fila 1
    const dataRows = rawRows.slice(1);

    const nuevos = [];

    for (const row of dataRows) {
      const cups = cleanCups(row[1]);
      if (!cups) continue; // fila vacía o CUPS inválido

      if (seenCups.has(cups)) {
        totalSkip++;
        continue;
      }

      nuevos.push({
        id:            idBase + globalIdx++,
        provincia:     PROVINCIA,
        calle:         calleName,
        nombre:        cleanNombre(row[0]),
        cups,
        direccion:     cleanDireccion(row[2]),
        movil:         cleanMovil(row[3]),
        precio_actual: cleanPrecio(row[4]),
        ya_llamado:    null, // NUNCA se toca
      });

      seenCups.add(cups);
    }

    if (nuevos.length === 0) {
      console.log(`  ✓ ${calleName.padEnd(35)} → 0 nuevos (todos ya existían)`);
      continue;
    }

    console.log(`  ✦ ${calleName.padEnd(35)} → ${nuevos.length} nuevos`);

    if (DRY_RUN) {
      nuevos.slice(0, 2).forEach(r =>
        console.log(`      [DRY] ${r.cups} | ${(r.nombre || '(sin nombre)').substring(0, 30)} | ${(r.direccion || '').substring(0, 35)}`)
      );
      if (nuevos.length > 2) console.log(`      [DRY] ... y ${nuevos.length - 2} más`);
    } else {
      for (let i = 0; i < nuevos.length; i += BATCH_SIZE) {
        const batch = nuevos.slice(i, i + BATCH_SIZE);
        const { error } = await sb.from('telemarketing_contactos').insert(batch);
        if (error) {
          console.error(`\n  ERROR insertando lote en ${calleName}:`, error.message);
          console.error('  Primer registro del lote:', JSON.stringify(batch[0], null, 2));
          process.exit(1);
        }
      }
      console.log(`      ✅ Insertados ${nuevos.length} contactos`);
    }

    totalNew += nuevos.length;
  }

  // ── 4. Resumen ────────────────────────────────────────────────────────────────
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  RESUMEN FINAL');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Calles procesadas:  ${allSheets.length}`);
  console.log(`  CUPS nuevos:        ${totalNew}`);
  console.log(`  CUPS omitidos:      ${totalSkip} (ya existían en BD o duplicados en Excel)`);
  console.log(`  CUPS pre-existentes:${existingCups.size}`);
  console.log('');

  if (DRY_RUN) {
    console.log('  ⚠️  MODO DRY RUN — No se ha escrito nada en la BD.');
    console.log('  ⚠️  Ejecuta con --real para aplicar los cambios:');
    console.log('      node migrate_rondilla_masiva.cjs --real');
  } else {
    console.log(`  ✅ IMPORTACIÓN COMPLETADA. ${totalNew} contactos insertados en Valladolid.`);
  }
  console.log('');
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1); });
