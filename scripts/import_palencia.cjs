/**
 * import_palencia.js
 * Lee las pestañas ABRIL, MAYO y JUNIO del Excel de Palencia
 * y hace bulk-insert en Supabase tabla `visitas`.
 *
 * Uso: node scripts/import_palencia.js
 */

require('dotenv').config({ path: '.env.local' });
const XLSX      = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EXCEL_PATH   = 'C:/Users/victor/Downloads/Visitas palencia.xlsx';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌  Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Helpers de conversión ────────────────────────────────────────────────────

/** Número serial de Excel → 'YYYY-MM-DD' (UTC) */
function excelDateToISO(serial) {
  if (!serial || typeof serial !== 'number') return null;
  // Epoch de Excel: 30 dic 1899 (corrige el bug del año bisiesto de 1900)
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Fracción decimal de Excel → 'HH:MM' */
function excelTimeToHHMM(val) {
  if (val === '' || val === null || val === undefined) return '00:00';
  if (typeof val === 'string' && val.includes(':')) return val.slice(0, 5);
  const totalMin = Math.round(Number(val) * 1440); // 1440 = 24*60
  return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(totalMin % 60).padStart(2, '0')}`;
}

/** Limpia teléfono: elimina prefijo internacional 34 si tiene 11 dígitos */
function cleanPhone(raw) {
  if (!raw && raw !== 0) return null;
  let s = String(raw).replace(/\D/g, '').trim();
  if (!s) return null;
  if (s.length === 11 && s.startsWith('34')) s = s.slice(2);
  return s || null;
}

/** Limpia email */
function cleanEmail(raw) {
  const s = String(raw || '').trim();
  return s && s.includes('@') ? s : null;
}

// ── Mapeo inteligente de Tipo de Gestión ────────────────────────────────────

function mapTipo(colG, colH) {
  const G   = String(colG || '').toUpperCase().trim();
  const H   = String(colH || '').toUpperCase().trim();
  const ALL = `${G} ${H}`;

  // ── Reclamación ───────────────────────────────────────────────────────────
  if (/RECLAMACI|RECLAMAR/.test(ALL))                                   return 'Reclamación';
  if (/QUEJA|FRAUDE|SPAM|LLAMADAS (DE|FRAUDULENTAS)/.test(ALL))         return 'Reclamación';
  if (/ROBO DE CONTRATO|ANULAR CONTRATO GAS.*CONSENTIMIENTO/.test(ALL)) return 'Reclamación';
  if (/PAGAR FACTURA|PAGO.*FACTURA|SACAR FACTURA/.test(ALL))            return 'Reclamación';
  if (/\bFACTURAS\b/.test(G)  && !/CONSULTA/.test(G))                   return 'Reclamación';
  if (/\bFACTURA\b/.test(G)   && !/CONSULTA/.test(G))                   return 'Reclamación';
  if (/FACTURAS POR CARTA|FACTURA GAS/.test(H))                         return 'Reclamación';
  if (/INCIDENCIA/.test(ALL))                                            return 'Reclamación';
  if (/CRUCE DE CUPS/.test(ALL))                                         return 'Reclamación';
  if (/CAMBIAR.*CUENTA|CAMBIO.*CUENTA|CAMBIO.*IBAN|cambio IBAN/i.test(ALL)) return 'Reclamación';
  if (/CARTA PARA REVISION CALDERA|REVISION MANTENIMIENTO/.test(ALL))   return 'Reclamación';
  if (/DAR DE BAJA SEGURO|QUITAR MANTENIMIENTO/.test(ALL))              return 'Reclamación';
  if (/ANULAR MANTENIMIENTO/.test(H))                                    return 'Reclamación';
  if (/DAR DE BAJA GAS|DAR DE BAJA SUMINISTRO/.test(G))                 return 'Reclamación';
  if (/CAMBIO DE TITULAR|CAMBIO DE TITULARIDAD/.test(ALL) && !/CUR/.test(ALL)) return 'Reclamación';
  if (/CAMBIO DE TITULARIDAD/.test(H))                                   return 'Reclamación';
  if (/NO ES CLIENTE.*SMS|SMS FALSO/.test(H))                           return 'Reclamación';
  if (/LA LLAMAN PARA CAMBIARLA DE COMPAÑ/.test(H))                     return 'Reclamación';
  if (/CORREOS FRAUDE/.test(G))                                          return 'Reclamación';
  if (/PAGAR FACTURAS/.test(H))                                          return 'Reclamación';

  // ── Cambio de Tarifa ──────────────────────────────────────────────────────
  if (/MEJORA.*TARIFA|MEJORAR.*TARIFA|MEJORAR TARIFAS/.test(ALL))       return 'Cambio de Tarifa';
  if (/MEJORA DE TARIFA|MEJORA DE POTENCIA/.test(H))                    return 'Cambio de Tarifa';
  if (/CAMBIO.*TARIFA|CAMBIO DE TARIFA/.test(ALL))                      return 'Cambio de Tarifa';
  if (/BAJADA.*TARIFA|BAJAR.*TARIFA/.test(ALL))                         return 'Cambio de Tarifa';
  if (/BAJADA DE POTENCIA.*MEJORA|BAJADA.*POTENCIA/.test(H))            return 'Cambio de Tarifa';
  if (/BAJAR POTENCIA/.test(G))                                          return 'Cambio de Tarifa';
  if (/BONO SOCIAL/.test(G))                                             return 'Cambio de Tarifa';
  if (/^MEJOR GAS/.test(G))                                              return 'Cambio de Tarifa';
  if (/MEJORA TARIFA/.test(G))                                           return 'Cambio de Tarifa';

  // ── Contratación Gas (solo gas, sin luz) ─────────────────────────────────
  const hasGas = /GAS/.test(ALL);
  const hasLuz = /LUZ/.test(ALL);
  if (hasGas && !hasLuz) {
    if (/CONTRAT|FIRMAR|FIRMA|ALTA|CUR/.test(G))                         return 'Contratación Gas';
    if (/COPIA CONTRATO GAS|FIRMAR CONTRATO GAS|FIRMA CONTRATO GAS/.test(G)) return 'Contratación Gas';
    if (H === 'GAS')                                                      return 'Contratación Gas';
  }
  // H especifica solo gas
  if (/^GAS$/.test(H) && !hasLuz)                                        return 'Contratación Gas';

  // ── Contratación Luz (contratación genérica o con luz) ───────────────────
  if (/CONTRATACI|CONTRATAC/.test(G))                                    return 'Contratación Luz';
  if (/\bCONTRATO\b|\bCONTRATOS\b/.test(G))                             return 'Contratación Luz';
  if (/ALTA CONTRATO|DAR DE ALTA/.test(G))                               return 'Contratación Luz';
  if (/FIRMAR CONTRATO|FIRMA CONTRATO|FIRMA CONTRATOS/.test(G))          return 'Contratación Luz';
  if (/GESTION CONTRATOS|IMPRIMIR CONTRATO|SUPERVISAR CONTRATO/.test(G)) return 'Contratación Luz';
  if (/MODIFICACION DE CONTRATO/.test(G))                                return 'Contratación Luz';
  if (/\bCUR\b/.test(G))                                                 return 'Contratación Luz';
  if (/METIDA EN CUR|RECUPERACI/.test(G))                                return 'Contratación Luz';
  if (/^LUZ/.test(G) || /^LUZ/.test(H))                                 return 'Contratación Luz';
  if (/OTRAS GESTIONES/.test(G) && /^CONTRATO$/.test(H))                return 'Contratación Luz';
  if (/CUR/.test(H))                                                     return 'Contratación Luz';

  // ── Consulta Tarifas (por defecto para consultas, info y app) ────────────
  if (/CONSULTA|CONSULTAR|INFORMACI|INFORMACIÓN|INFORMARSE/.test(ALL))   return 'Consulta Tarifas';
  if (/TARIFAS/.test(G))                                                  return 'Consulta Tarifas';
  if (/APLICACION|DESCARGAR APP|GESTION DE APP/.test(G))                 return 'Consulta Tarifas';
  if (/APP|APLICAC/.test(H))                                              return 'Consulta Tarifas';
  if (/REVISION CONTRATOS|REVISAR CONTRATOS|HECHO CON OCTOPUSE/.test(G)) return 'Consulta Tarifas';
  if (/PUNTOS DE CARGA|PRODUCTOS Y SERVICIOS/.test(G))                   return 'Consulta Tarifas';

  return 'Consulta Tarifas'; // fallback seguro
}

// ── Leer y procesar Excel ───────────────────────────────────────────────────

const wb = XLSX.readFile(EXCEL_PATH);
console.log(`📂  Pestañas encontradas: ${wb.SheetNames.join(', ')}`);

// MAYO no tiene fila de cabecera (la fila 0 ya es un registro)
const SHEETS_CONFIG = {
  ABRIL: { hasHeader: true  },
  MAYO:  { hasHeader: false },
  JUNIO: { hasHeader: true  },
};

const records = [];

for (const [sheetName, cfg] of Object.entries(SHEETS_CONFIG)) {
  const ws   = wb.Sheets[sheetName];
  if (!ws) { console.warn(`⚠️  Pestaña ${sheetName} no encontrada, se omite.`); continue; }

  const rows     = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  const dataRows = cfg.hasHeader ? rows.slice(1) : rows;

  let added = 0;
  for (const row of dataRows) {
    // Saltar filas completamente vacías
    if (!row[0] && !row[2] && !row[3]) continue;

    const fecha  = excelDateToISO(row[0]);
    if (!fecha) continue; // sin fecha no tiene sentido

    const colG = String(row[6] || '').trim();
    const colH = String(row[7] || '').trim();
    const colI = String(row[8] || '').trim();

    // tipo_otro = texto original de G + H + I para no perder ningún detalle
    const rawParts = [colG, colH, colI].filter(Boolean);
    const tipoOtroRaw = rawParts.join(' | ');

    records.push({
      id:            Date.now() + records.length, // único: timestamp base + offset incremental
      fecha,
      hora:          excelTimeToHHMM(row[1]),
      dni:           String(row[2] || '').trim().toUpperCase() || null,
      nombre:        String(row[3] || '').trim() || null,
      telefono:      cleanPhone(row[4]),
      mail:          cleanEmail(row[5]),
      tipo:          mapTipo(colG, colH),
      tipo_otro:     tipoOtroRaw || '',
      punto_venta:   'Palencia',
      registrado_por:'TIENDA',
    });
    added++;
  }
  console.log(`  ✅  ${sheetName}: ${added} registros procesados`);
}

console.log(`\n📊  Total registros a insertar: ${records.length}`);

// Vista previa de los primeros 5
console.log('\n── Muestra primeros 5 ──');
records.slice(0, 5).forEach((r, i) =>
  console.log(`  [${i+1}] ${r.fecha} ${r.hora} | ${r.nombre} | ${r.tipo} | ${r.punto_venta}`)
);

// ── Bulk insert por lotes ───────────────────────────────────────────────────

async function run() {
  const BATCH = 50;
  let inserted = 0;
  let errors   = 0;

  for (let i = 0; i < records.length; i += BATCH) {
    const batch  = records.slice(i, i + BATCH);
    const { error } = await supabase.from('visitas').insert(batch);

    if (error) {
      console.error(`  ❌  Lote ${Math.floor(i/BATCH)+1} — error: ${error.message}`);
      errors += batch.length;
    } else {
      inserted += batch.length;
      process.stdout.write(`  📥  Lote ${Math.floor(i/BATCH)+1}: +${batch.length} (total: ${inserted})\n`);
    }
  }

  console.log('\n════════════════════════════════════');
  if (errors === 0) {
    console.log(`✅  IMPORTACIÓN COMPLETADA: ${inserted} registros en Supabase`);
  } else {
    console.log(`⚠️  IMPORTACIÓN PARCIAL: ${inserted} OK / ${errors} con error`);
  }
  console.log('════════════════════════════════════\n');
}

run().catch(err => {
  console.error('❌  Error fatal:', err.message);
  process.exit(1);
});
