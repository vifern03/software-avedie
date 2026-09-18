/**
 * Vigencia de ofertas.
 *
 * Distinguimos tres plazos que los PDF de Endesa mencionan por separado:
 *   - contratación: ventana de fechas en la que la oferta se puede CONTRATAR
 *     ("Oferta válida para contrataciones desde … hasta …").
 *   - duracionContrato: duración/permanencia del contrato una vez firmado.
 *   - duracionDescuento: cuánto dura el descuento (p. ej. "18% durante 1 año").
 * Este módulo solo evalúa la ventana de contratación.
 */

/** Fecha de hoy en Europa/Madrid como 'YYYY-MM-DD' (independiente de la TZ del equipo). */
export function hoyMadridISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
  return parts; // en-CA → YYYY-MM-DD
}

export function fmtFechaES(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * @param {{desde:string,hasta:string,pendienteConfirmacion?:boolean}} contratacion
 * @param {string} hoyISO
 * @returns {'vigente'|'caducada'|'futura'|'pendiente_confirmacion'|'sin_datos'}
 */
export function estadoVigencia(contratacion, hoyISO = hoyMadridISO()) {
  if (!contratacion?.desde || !contratacion?.hasta) return 'sin_datos';
  if (contratacion.pendienteConfirmacion) return 'pendiente_confirmacion';
  if (hoyISO < contratacion.desde) return 'futura';
  if (hoyISO > contratacion.hasta) return 'caducada';
  return 'vigente';
}

export function textoVigencia(contratacion) {
  if (!contratacion) return '—';
  return `${fmtFechaES(contratacion.desde)} – ${fmtFechaES(contratacion.hasta)}`;
}

export const ETIQUETA_ESTADO = {
  vigente: 'Vigente',
  caducada: 'Ventana de contratación vencida',
  futura: 'Aún no contratable',
  pendiente_confirmacion: 'Pendiente de confirmación',
  sin_datos: 'Sin fecha de vigencia',
};
