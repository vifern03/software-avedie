// Genera supabase/seeds/distribuidoras_seed.sql a partir del CSV (tal cual, 357 filas).
// Solo inserta: ON CONFLICT DO NOTHING no pisa textos guardados después por un admin.
//   node scripts/generar_seed_distribuidoras.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const csv = readFileSync('supabase/seeds/distribuidoras_seed.csv', 'utf8').replace(/^\uFEFF/, '')

function parsear(texto) {
  const filas = []
  let fila = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') enComillas = false
      else campo += c
    } else if (c === '"') enComillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

const [cab, ...filas] = parsear(csv)
const sql = (v) => (v === '' ? 'NULL' : `'${v.replace(/'/g, "''")}'`)
const valores = filas.map((f) => {
  const o = Object.fromEntries(cab.map((k, i) => [k, f[i] ?? '']))
  return `(${[sql(o.prefijo_cups), sql(o.nombre_oficial), sql(o.nombre_mostrar), sql(o.estado), sql(o.codigo_endesa),
    sql(o.texto_endesa), sql(o.fuente), o.verificado === 'true' ? 'true' : 'false', sql(o.notas)].join(', ')})`
})
writeFileSync('supabase/seeds/distribuidoras_seed.sql', `-- Generado por scripts/generar_seed_distribuidoras.mjs. ${valores.length} filas.
INSERT INTO public.distribuidoras_electricidad
  (prefijo_cups, nombre_oficial, nombre_mostrar, estado, codigo_endesa, texto_endesa, fuente, verificado, notas)
VALUES
${valores.join(',\n')}
ON CONFLICT (prefijo_cups) DO NOTHING;
`)
console.log('filas:', valores.length)
