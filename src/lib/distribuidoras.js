/**
 * Búsqueda de distribuidora por CUPS. La parte pura (buscarEnFilas) se prueba sin BD.
 * Prefijos: 4 dígitos, o 6 cuando Endesa imprime un texto distinto por zona (003150).
 */
export const REGEX_CUPS = /^ES\d{16}[A-Z]{2}(\d[A-Z])?$/

export const normalizarCups = (cups) => String(cups ?? '').replace(/\s+/g, '').toUpperCase()

export function validarCups(cups) {
  return REGEX_CUPS.test(normalizarCups(cups))
}

const resultado = (prefijo, f) => ({
  prefijo,
  nombre_mostrar: f.nombre_mostrar,
  texto_endesa: f.texto_endesa || null,
  estado: f.estado,
  verificado: !!f.verificado,
})

/** @param {(prefijo:string)=>object|null|undefined} leer  devuelve la fila de ese prefijo */
export function buscarEnFilas(cups, leer) {
  const c = normalizarCups(cups)
  if (!REGEX_CUPS.test(c)) return { error: 'CUPS con formato no válido' }
  const p6 = c.slice(2, 8)
  const p4 = c.slice(2, 6)
  const f6 = leer(p6)
  if (f6) return resultado(p6, f6)
  const f4 = leer(p4)
  if (f4) return resultado(p4, f4)
  return { error: `Distribuidora no encontrada para el prefijo ${p4}` }
}

export async function buscarDistribuidora(cups) {
  const c = normalizarCups(cups)
  if (!REGEX_CUPS.test(c)) return { error: 'CUPS con formato no válido' }
  const { supabase } = await import('./supabase.js')
  const prefijos = [c.slice(2, 8), c.slice(2, 6)]
  const { data, error } = await supabase
    .from('distribuidoras_electricidad')
    .select('prefijo_cups,nombre_mostrar,texto_endesa,estado,verificado')
    .in('prefijo_cups', prefijos)
  if (error) return { error: 'No se ha podido consultar la distribuidora' }
  const mapa = Object.fromEntries((data || []).map((f) => [f.prefijo_cups, f]))
  return buscarEnFilas(c, (p) => mapa[p])
}
