// Regenera tests/fixtures/tarifa_ia_*.json con los precios vigentes de src/data y las fechas
// de la hoja nueva. Uso: node scripts/regenerar_fixtures_tarifas.mjs 2026-10-31 2026-11-16
import { readFileSync, writeFileSync } from 'node:fs';
import { valoresActuales } from '../src/lib/tarifas/registro.js';

const [, , desde, hasta] = process.argv;
if (!desde || !hasta) { console.error('Uso: node scripts/regenerar_fixtures_tarifas.mjs <desde> <hasta>'); process.exit(1); }
for (const id of ['open30', 'open61', 'tempo']) {
  const f = `tests/fixtures/tarifa_ia_${id}.json`;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const actuales = valoresActuales(id);
  let n = 0;
  for (const k of Object.keys(j.valores)) if (k in actuales && j.valores[k] !== actuales[k]) { j.valores[k] = actuales[k]; n++; }
  j.valida_desde = desde;
  j.valida_hasta = hasta;
  writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
  console.log(id, `${n} valores actualizados`);
}
