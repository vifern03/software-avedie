/**
 * import_valladolid.cjs
 * Importa el histórico de Visitas VALLADOLID.xlsx a la tabla `visitas` de Supabase.
 * Aplica forward fill en la columna Fecha (celdas combinadas).
 *
 * Uso: node scripts/import_valladolid.cjs
 */

require('dotenv').config({ path: '.env.local' });
const XLSX      = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const supabase  = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
const EXCEL_PATH = 'C:/Users/victor/Downloads/Visitas VALLADOLID.xlsx';

// ── Helpers ──────────────────────────────────────────────────────────────────

function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function excelTimeToHHMM(val) {
  if (val === '' || val === null || val === undefined) return '00:00';
  if (typeof val === 'string' && val.includes(':')) return val.slice(0, 5);
  const totalMin = Math.round(Number(val) * 1440);
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

function cleanPhone(raw) {
  if (!raw && raw !== 0) return null;
  let s = String(raw).replace(/\D/g, '').trim();
  if (!s) return null;
  if (s.length === 11 && s.startsWith('34')) s = s.slice(2);
  return s || null;
}

function cleanEmail(raw) {
  const s = String(raw || '').trim();
  return s && s.includes('@') ? s : null;
}

// Mapeo estricto según las instrucciones:
// "Otras gestiones" y todo lo que no encaje → 'Otro'
function mapTipo(colG) {
  const G = String(colG || '').trim().toUpperCase();

  if (/^CONTRAT/.test(G))                              return ['Contratación Luz', ''];
  if (/^CONSULTA\s+TARIFA|^CONSULTA\s+TARIFAS/.test(G)) return ['Consulta Tarifas',  ''];
  if (/^RECLAMAC/.test(G))                             return ['Reclamación',        ''];
  if (/^CAMBIO\s+DE\s+TARIFA|^CAMBIO\s+TARIFA/.test(G)) return ['Cambio de Tarifa', ''];

  // Todo lo demás (Otras gestiones, CAMBIO TITULARIDAD, etc.) → Otro
  const textoOriginal = String(colG || '').trim();
  return ['Otro', textoOriginal];
}

// ── Procesar Excel ────────────────────────────────────────────────────────────

const wb   = XLSX.readFile(EXCEL_PATH);
const sheet = wb.SheetNames[0];
console.log(`📂  Pestaña: "${sheet}"`);

const rows     = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
const dataRows = rows.slice(1); // saltar cabecera

const records  = [];
let lastFecha  = null; // forward fill

for (const row of dataRows) {
  // Saltar filas completamente vacías
  if (!row[1] && !row[2] && !row[3]) continue;

  // Forward fill de fecha
  if (row[0] !== '' && typeof row[0] === 'number') {
    lastFecha = excelDateToISO(row[0]);
  }
  if (!lastFecha) continue; // no hay fecha aún, saltar

  const [tipo, tipoOtro] = mapTipo(row[6]);

  records.push({
    id:            Date.now() + records.length,
    fecha:         lastFecha,
    hora:          excelTimeToHHMM(row[1]),
    dni:           String(row[2] || '').trim().toUpperCase() || null,
    nombre:        String(row[3] || '').trim() || null,
    telefono:      cleanPhone(row[4]),
    mail:          cleanEmail(row[5]),
    tipo,
    tipo_otro:     tipoOtro,
    punto_venta:   'Valladolid',
    registrado_por:'TIENDA',
  });
}

console.log(`📊  Registros listos para insertar: ${records.length}`);
console.log('\n── Muestra primeros 5 ──');
records.slice(0, 5).forEach((r, i) =>
  console.log(`  [${i+1}] ${r.fecha} ${r.hora} | ${r.nombre} | tipo="${r.tipo}" tipo_otro="${r.tipo_otro}"`)
);
console.log('\n── Distribución de tipos ──');
const dist = {};
records.forEach(r => { dist[r.tipo] = (dist[r.tipo] || 0) + 1; });
Object.entries(dist).sort((a,b) => b[1]-a[1]).forEach(([k,v]) => console.log(`  ${v}  ${k}`));

// ── Bulk insert ───────────────────────────────────────────────────────────────

async function run() {
  const BATCH = 50;
  let inserted = 0, errors = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase.from('visitas').insert(batch);
    if (error) {
      console.error(`  ❌  Lote ${Math.floor(i/BATCH)+1}: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  📥  Lote ${Math.floor(i/BATCH)+1}: +${batch.length} (total: ${inserted})`);
    }
  }

  console.log('\n════════════════════════════════════');
  if (errors === 0) {
    console.log(`✅  IMPORTACIÓN COMPLETADA: ${inserted} registros insertados en Supabase`);
  } else {
    console.log(`⚠️  IMPORTACIÓN PARCIAL: ${inserted} OK / ${errors} con error`);
  }
  console.log('════════════════════════════════════\n');
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
