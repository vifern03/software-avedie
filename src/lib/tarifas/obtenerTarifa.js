/**
 * Fuente única de precios. Los objetos de src/data son la base; la versión activa de
 * tarifas_versiones se aplica encima, en sitio, al arrancar la app. Así Consulta de
 * Tarifas y las comparativas leen los precios nuevos sin cambiar sus imports, y si no
 * hay versiones en la base de datos todo queda exactamente como en src/data.
 */
import { TARIFAS, aplicarVersion } from './registro.js';
import { estadoVigencia, hoyMadridISO } from '../energia/vigencia.js';

let carga = null;

/** Lee las versiones activas y las aplica. Si falla, se sigue con src/data. */
export function sincronizarTarifas({ forzar = false } = {}) {
  if (carga && !forzar) return carga;
  carga = (async () => {
    const { supabase } = await import('../supabase.js');
    const { data, error } = await supabase.from('tarifas_versiones')
      .select('id,tarifa_id,version,valores,valida_desde,valida_hasta').eq('activa', true);
    if (error) { console.warn('tarifas_versiones:', error.message); return 0; }
    (data || []).forEach((v) => aplicarVersion(v.tarifa_id, v));
    return (data || []).length;
  })().catch((e) => { console.warn('tarifas_versiones:', e.message); return 0; });
  return carga;
}

/**
 * @returns {{tarifa:object, versionId:(string|null), validaDesde:string, validaHasta:string, estado:string}}
 *   `tarifa` es la última versión; `estado` indica si `fecha` cae dentro de su validez.
 */
export function obtenerTarifa(tarifaId, fecha = hoyMadridISO()) {
  const t = TARIFAS[tarifaId];
  if (!t) throw new Error(`Tarifa desconocida: ${tarifaId}`);
  const { desde, hasta } = t.objeto.contratacion || {};
  return {
    tarifa: t.objeto,
    versionId: t.versionActiva?.id ?? null,
    validaDesde: desde,
    validaHasta: hasta,
    estado: estadoVigencia(t.objeto.contratacion, fecha),
  };
}
