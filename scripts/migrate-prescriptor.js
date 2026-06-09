/**
 * migrate-prescriptor.js
 * Migración masiva: asigna el campo creado_por (Prescriptor) a todos los
 * registros de clientes que lo tengan vacío o con texto no normalizado.
 *
 * Ejecutar desde la raíz del proyecto:
 *   node scripts/migrate-prescriptor.js
 *   node scripts/migrate-prescriptor.js --dry-run   (solo muestra cambios, no escribe)
 */

import { createClient } from '@supabase/supabase-js';
import { config }       from 'dotenv';

// Cargar variables de entorno (.env y .env.local)
config({ path: '.env' });
config({ path: '.env.local', override: false });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const DRY_RUN  = process.argv.includes('--dry-run');

// ─────────────────────────────────────────────────────────────────────────────
// KEYWORDS DE AGENTES EXTERNOS
// ─────────────────────────────────────────────────────────────────────────────
const EXTERNAL_KEYWORDS = [
  'inmobiliaria', 'tecnocasa', 'remax', 'century 21', 'era inmobiliaria',
  'pisos.com', 'idealista', 'fotocasa', 'agencia inmobiliaria', 'agencia',
  'colaborador', 'colaboradora', 'asociado', 'asociada', 'agente externo',
  'promotor', 'promotora', 'franquicia', 'franquiciado',
];

// Términos que por sí solos indican una entidad (no necesitan "inmobiliaria" delante)
const BRANDED_AGENCIES = ['tecnocasa', 'remax', 'century 21', 'era inmobiliaria'];

// ─────────────────────────────────────────────────────────────────────────────
// PATRONES EXPLÍCITOS DE PRESCRIPTOR EN DESCRIPCION
// ─────────────────────────────────────────────────────────────────────────────
const EXPLICIT_PATTERNS = [
  // "Aportado por X", "Aportado de X"
  /aportad[ao]\s+(?:por|de)\s+([^.,;\n]+)/i,
  // "De parte de X"
  /de\s+parte\s+de\s+([^.,;\n]+)/i,
  // "Prescriptor: X" / "Prescriptora: X"
  /prescriptor[a]?\s*[:=]\s*([^.,;\n]+)/i,
  // "Traído por X", "Traida por X"
  /tra[íi]d[ao]\s+(?:por|de)\s+([^.,;\n]+)/i,
  // "Pasa X" / "Pasa de X" (patrón CRM oral: "pasa Oscar")
  /\bpasa\s+(?:(?:a|de|por)\s+)?([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ][^.,;\n]{2,40})/i,
  // "Enviado por X"
  /enviad[ao]\s+(?:por|de)\s+([^.,;\n]+)/i,
  // "Referido por X"
  /referid[ao]\s+(?:por|de)\s+([^.,;\n]+)/i,
  // "Por parte de X"
  /por\s+parte\s+de\s+([^.,;\n]+)/i,
  // "Viene de X" / "Viene por X"
  /viene\s+(?:de|por)\s+([^.,;\n]+)/i,
  // "Cliente de X" / "Contrato de X"
  /(?:cliente|contrato)\s+de\s+([^.,;\n]+)/i,
  // "Trae X" / "Lo trae X"
  /(?:lo\s+)?trae\s+([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ][^.,;\n]{2,40})/i,
  // "Referencia X" / "Ref. X"
  /referencia\s+(?:de\s+)?([^.,;\n]+)/i,
];

// ─────────────────────────────────────────────────────────────────────────────
// FUNCIONES DE ANÁLISIS SEMÁNTICO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Detecta y extrae el nombre de un agente externo (inmobiliaria, colaborador…)
 * del texto dado. Devuelve null si no encuentra ninguno.
 */
function extractExternalName(text) {
  if (!text) return null;
  const lower = text.toLowerCase();

  const hasExternal = EXTERNAL_KEYWORDS.some(kw => lower.includes(kw));
  if (!hasExternal) return null;

  // Intentar extraer "inmobiliaria <nombre>"
  const inmoMatch = text.match(
    /\b(?:inmobiliaria|agencia\s+inmobiliaria|agencia)\s+([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ0-9][^.,;\n:]{1,50})/i
  );
  if (inmoMatch) return capitalizeWords(`inmobiliaria ${inmoMatch[1].trim()}`);

  // Marcas propias (tecnocasa, remax…)
  for (const brand of BRANDED_AGENCIES) {
    if (lower.includes(brand)) {
      // Extraer posible sufijo de ciudad/nombre propio
      const r = new RegExp(`${brand}\\s*([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ0-9\\s]{0,30})`, 'i');
      const m = text.match(r);
      const suffix = m?.[1]?.trim() || '';
      return capitalizeWords(`${brand}${suffix ? ' ' + suffix : ''}`).trim();
    }
  }

  // Colaborador / asociado: devolver el fragmento relevante
  const colabMatch = text.match(
    /\b(?:colaborador[a]?|asociad[oa]|agente\s+externo)\s+(?:llamad[oa]\s+)?([A-ZÁÉÍÓÚÜÑA-Za-záéíóúüñ][^.,;\n]{2,40})/i
  );
  if (colabMatch) return capitalizeWords(colabMatch[1].trim());

  // Fallback: extraer los 40 primeros caracteres desde la keyword
  for (const kw of EXTERNAL_KEYWORDS) {
    const idx = lower.indexOf(kw);
    if (idx >= 0) {
      const fragment = text.slice(idx, idx + 50).replace(/[.,;:\n].*/, '').trim();
      return capitalizeWords(fragment);
    }
  }
  return null;
}

/**
 * Busca en `text` el nombre o apellido de algún usuario del CRM.
 * Devuelve el `username` del usuario si hay coincidencia.
 */
function findUserInText(text, users) {
  if (!text) return null;
  const lower = text.toLowerCase();

  // Orden: primero coincidencia más larga (evitar que "Ana" machee antes que "Ana García")
  const sorted = [...users].sort((a, b) => {
    const la = (a.display_name || a.username).length;
    const lb = (b.display_name || b.username).length;
    return lb - la;
  });

  for (const u of sorted) {
    const displayName = (u.display_name || u.username || '').toLowerCase();
    const username    = (u.username || '').toLowerCase();

    // Nombre completo
    if (displayName.length > 3 && lower.includes(displayName)) return u.username;
    // Username
    if (username.length > 3 && lower.includes(username)) return u.username;
    // Palabras individuales del nombre (mínimo 5 chars para evitar falsos positivos)
    const words = displayName.split(/\s+/).filter(w => w.length >= 5);
    for (const word of words) {
      if (lower.includes(word)) return u.username;
    }
  }
  return null;
}

/**
 * Aplica los patrones de extracción explícita en `text`.
 * Devuelve la cadena extraída o null.
 */
function extractFromPattern(text) {
  if (!text) return null;
  for (const pattern of EXPLICIT_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      const extracted = match[1].replace(/[.,;:\n].*/, '').trim();
      if (extracted.length > 1) return extracted;
    }
  }
  return null;
}

/** Capitaliza cada palabra */
function capitalizeWords(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// ÁRBOL DE DECISIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina el valor correcto de `creado_por` para un cliente dado.
 * @returns {{ value: string, source: string, changed: boolean }}
 */
function determinePrescriptor(client, usernames, users) {
  const existing  = (client.creado_por  || '').trim();
  const desc      = (client.descripcion || '').trim();
  const comercial = (client.comercial   || '').trim();

  // Helper: ¿es el texto un placeholder vacío?
  const isEmpty = (v) => !v || v === '—' || v === '-' || v.length < 2;

  // ── PRIORIDAD 1: campo creado_por ya tiene valor ──────────────────────────
  if (!isEmpty(existing)) {

    // P1-a: es un usuario del CRM → perfecto, no tocar
    if (usernames.has(existing)) {
      return { value: existing, source: 'P1a_usuario_crm', changed: false };
    }

    // P1-b: el texto describe un agente externo → extraer nombre
    const extName = extractExternalName(existing);
    if (extName) {
      return { value: extName, source: 'P1b_agente_externo', changed: extName !== existing };
    }

    // P1-c: texto libre que parece intencionado (longitud razonable, no es basura)
    //        → respetar pero asegurarse de no dejar basura de caracteres
    const clean = existing.replace(/^[^A-ZÁÉÍÓÚÜÑa-záéíóúüñ0-9]+/, '').trim();
    if (clean.length > 1) {
      return { value: clean, source: 'P1c_texto_libre', changed: clean !== existing };
    }
  }

  // ── PRIORIDAD 2: deducción por descripción ────────────────────────────────
  if (!isEmpty(desc)) {

    // P2-a: patrones explícitos ("Aportado por…", "De parte de…", etc.)
    const fromPattern = extractFromPattern(desc);
    if (fromPattern) {
      // ¿El texto extraído coincide con un usuario del CRM?
      if (usernames.has(fromPattern)) {
        return { value: fromPattern, source: 'P2a_patron_usuario', changed: true };
      }
      // ¿Es un agente externo?
      const extFromPattern = extractExternalName(fromPattern);
      if (extFromPattern) {
        return { value: extFromPattern, source: 'P2a_patron_externo', changed: true };
      }
      // Texto libre extraído del patrón
      return { value: fromPattern, source: 'P2a_patron_texto', changed: true };
    }

    // P2-b: nombre de usuario del CRM mencionado en descripción
    const mentionedUser = findUserInText(desc, users);
    if (mentionedUser) {
      return { value: mentionedUser, source: 'P2b_mencion_usuario', changed: true };
    }

    // P2-c: referencia a inmobiliaria u agente externo en descripción
    const extFromDesc = extractExternalName(desc);
    if (extFromDesc) {
      return { value: extFromDesc, source: 'P2c_externo_desc', changed: true };
    }
  }

  // ── PRIORIDAD 3: fallback → tramitador ────────────────────────────────────
  return {
    value:   comercial || 'Desconocido',
    source:  'P3_fallback_tramitador',
    changed: (existing !== (comercial || 'Desconocido')),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const MODE = DRY_RUN ? '(MODO SIMULACIÓN — no se escribirá nada)' : '(MODO REAL — se actualizará Supabase)';
  console.log(`\n🚀 Migración de Prescriptores ${MODE}\n`);

  // 1. Cargar usuarios activos del CRM
  console.log('👤 Cargando usuarios...');
  const { data: users, error: usersError } = await supabase
    .from('usuarios')
    .select('username, display_name')
    .is('deleted_at', null);

  if (usersError) { console.error('❌ Error cargando usuarios:', usersError.message); process.exit(1); }

  const usernames = new Set(users.map(u => u.username));
  console.log(`   ✅ ${users.length} usuarios: ${users.map(u => u.username).join(', ')}\n`);

  // 2. Cargar clientes (sin deleted)
  console.log('📋 Cargando clientes...');
  const { data: clientes, error: clientesError } = await supabase
    .from('clientes')
    .select('id, nombre, tipo, comercial, creado_por, descripcion')
    .is('deleted_at', null)
    .order('id');

  if (clientesError) { console.error('❌ Error cargando clientes:', clientesError.message); process.exit(1); }
  console.log(`   ✅ ${clientes.length} clientes cargados\n`);

  // 3. Procesar cada cliente
  const updates     = [];
  const changeLog   = [];
  const sourceCounts = {};

  for (const c of clientes) {
    const result = determinePrescriptor(c, usernames, users);

    sourceCounts[result.source] = (sourceCounts[result.source] || 0) + 1;

    if (result.changed) {
      updates.push({ id: c.id, creado_por: result.value });
      changeLog.push({
        id:        c.id,
        tipo:      c.tipo,
        nombre:    c.nombre.slice(0, 35),
        tramitador: c.comercial,
        anterior:  c.creado_por || '(vacío)',
        nuevo:     result.value,
        fuente:    result.source,
      });
    }
  }

  // 4. Mostrar resumen
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 Registros totales   : ${clientes.length}`);
  console.log(`✏️  Registros a cambiar : ${updates.length}`);
  console.log(`✅ Sin cambios         : ${clientes.length - updates.length}`);
  console.log('');
  console.log('📈 Distribución por fuente de decisión:');
  Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([source, count]) => {
      const pct = Math.round(count / clientes.length * 100);
      console.log(`   ${source.padEnd(30)} ${String(count).padStart(4)} registros  (${pct}%)`);
    });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (changeLog.length > 0) {
    console.log('📝 Detalle de cambios' + (changeLog.length > 30 ? ` (primeros 30 de ${changeLog.length})` : '') + ':');
    console.table(changeLog.slice(0, 30));
  }

  if (DRY_RUN) {
    console.log('\n⚠️  Modo simulación activo. Para aplicar cambios, ejecuta:\n   node scripts/migrate-prescriptor.js\n');
    return;
  }

  if (updates.length === 0) {
    console.log('✅ No hay nada que actualizar. Todos los prescriptores ya están normalizados.\n');
    return;
  }

  // 5. Aplicar en batches de 20
  console.log('⚙️  Aplicando actualizaciones en Supabase...');
  const BATCH_SIZE = 20;
  let done = 0;
  const errors = [];

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(u =>
        supabase.from('clientes').update({ creado_por: u.creado_por }).eq('id', u.id)
      )
    );
    results.forEach((r, idx) => {
      if (r.error) errors.push({ id: batch[idx].id, error: r.error.message });
    });
    done += batch.length;
    process.stdout.write(`\r   ${done}/${updates.length} actualizados...`);
  }

  console.log('\n');

  if (errors.length > 0) {
    console.warn(`⚠️  ${errors.length} errores al guardar:`);
    console.table(errors);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Migración completada: ${updates.length - errors.length} registros actualizados`);
  if (errors.length > 0) console.log(`❌ Errores: ${errors.length}`);
  console.log('');
  console.log('👉 Recarga la aplicación (F5) para que el ranking y los contadores');
  console.log('   reflejen los nuevos prescriptores.\n');
}

main().catch((err) => {
  console.error('\n❌ Error inesperado:', err.message);
  process.exit(1);
});
