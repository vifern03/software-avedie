/**
 * fix_otras_gestiones.cjs
 * Corrige los registros importados de Palencia cuyo tipo_otro empieza por
 * "Otras gestiones" (o "OTRAS GESTIONES"):
 *   - tipo        → 'Otro'
 *   - tipo_otro   → el texto original de la columna H del Excel
 *
 * Uso: node scripts/fix_otras_gestiones.cjs
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  // 1. Traer todos los registros del histórico de Palencia importado
  const { data, error } = await supabase
    .from('visitas')
    .select('id, tipo, tipo_otro')
    .eq('registrado_por', 'TIENDA')
    .eq('punto_venta', 'Palencia');

  if (error) { console.error('❌ Error al leer:', error.message); process.exit(1); }

  // 2. Filtrar los que vienen de "Otras gestiones" en el Excel (ambas grafías)
  const toFix = data.filter(r =>
    /^otras gestiones/i.test((r.tipo_otro || '').trim())
  );

  console.log(`📋 Registros a corregir: ${toFix.length} (de ${data.length} totales TIENDA Palencia)\n`);

  if (toFix.length === 0) {
    console.log('✅ Nada que corregir.');
    return;
  }

  // 3. Construir los updates
  //    tipo_otro actual: "Otras gestiones | H_texto"  → nos quedamos solo con "H_texto"
  const updates = toFix.map(r => {
    const partes   = r.tipo_otro.split('|');
    const hTexto   = partes.length > 1 ? partes.slice(1).join('|').trim() : '';
    return { id: r.id, tipo: 'Otro', tipo_otro: hTexto };
  });

  // 4. Actualizar en Supabase de uno en uno (upsert por id)
  let ok  = 0;
  let err = 0;

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('visitas')
      .update({ tipo: u.tipo, tipo_otro: u.tipo_otro })
      .eq('id', u.id);

    if (upErr) {
      console.error(`  ❌ id=${u.id}: ${upErr.message}`);
      err++;
    } else {
      ok++;
    }
  }

  console.log(`════════════════════════════════════`);
  console.log(`✅ Actualizados correctamente: ${ok}`);
  if (err > 0) console.log(`❌ Con error:                ${err}`);
  console.log(`════════════════════════════════════\n`);

  // 5. Verificación: mostrar 3 registros corregidos para que Víctor los confirme
  const ids3 = toFix.slice(0, 3).map(r => r.id);
  const { data: check } = await supabase
    .from('visitas')
    .select('id, nombre, tipo, tipo_otro')
    .in('id', ids3);

  console.log('── Verificación (3 filas corregidas) ──');
  (check || []).forEach(r =>
    console.log(`  id=${r.id}`)  ||
    console.log(`    nombre:    ${r.nombre}`) ||
    console.log(`    tipo:      "${r.tipo}"`) ||
    console.log(`    tipo_otro: "${r.tipo_otro}"\n`)
  );
}

run().catch(e => { console.error('❌ Fatal:', e.message); process.exit(1); });
