/**
 * Actualizador de tarifas: prompt para la IA y validaciones. Sin dependencias de la
 * interfaz. La IA solo devuelve números y fechas; todo lo demás se descarta.
 */
import { TARIFAS, filtrarPermitidas, rutasDe, valoresActuales } from './registro.js';

export const TOLERANCIA_PRECIO = 0.000002;
export const VARIACION_AVISO = 0.30;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const DESCRIPCION = {
  open: `Tarifa Open. Rutas:
- baseEnergia.0..3: "Precio base del Término de Energía sin descuento" por tramo de potencia, en el orden de la tabla.
- horasNoOpen.0..3: columna "Horas No Open" de la matriz, por tramo.
- matrix.F.C: matriz "Precios con descuentos incluidos": F = tramo (0..3), C = modalidad (0 Plana, 1 Día, 2 Laboral, 3 Fin de Semana, 4 Noche).
- potenciaTerminos.N.anyo/.mes/.dia: tabla "Precio base del Término de Potencia sin descuento", P1 = 0 … P6 = 5.
- extraAnyo: porcentaje del "Y además" (entero).
- modalidades.0..4.dto: porcentaje de descuento de cada modalidad (0 Plana, 1 Día, 2 Laboral, 3 Fin de Semana, 4 Noche).`,
  tempo: `Tarifa TEMPO. Rutas:
- energia.promo: precio con descuento. energia.base: precio base sin descuento.
- descuento: porcentaje de descuento (entero).
- potencia.0 (P1) y potencia.1 (P2), con .anyo y .mes.`,
};

/** Prompt cerrado: el modelo solo puede responder con las rutas indicadas. */
export function promptTarifa(tarifaId) {
  const t = TARIFAS[tarifaId];
  const rutas = rutasDe(tarifaId);
  return `Lees una hoja de tarifas de Endesa. Extrae SOLO precios, porcentajes y las fechas de validez.
Tarifa: ${t.nombre}.
${DESCRIPCION[t.tipo] || 'Asocia cada ruta con su precio en la hoja.'}

Antes de nada, identifica de qué tarifa es el documento. "es_esta_tarifa" es true solo si es una hoja de precios de la tarifa ${t.nombre}, con ese mismo producto y peaje. Es false si es de otra tarifa o de otro peaje, o si no es una hoja de tarifas.

Copia cada número exactamente como está impreso, convertido a número JSON con punto decimal, sin redondear.
No inventes nada: si un dato no aparece, omite su ruta.

Devuelve EXCLUSIVAMENTE un objeto JSON:
{ "tarifa_documento": "nombre de la tarifa tal como figura en el documento", "es_esta_tarifa": true, "valida_desde": "AAAA-MM-DD", "valida_hasta": "AAAA-MM-DD", "valores": { "<ruta>": número } }

Rutas permitidas (ninguna otra):
${rutas.join(', ')}`;
}

/** Convierte la respuesta de la IA en datos limpios: descarta claves no permitidas. */
export function limpiarRespuesta(tarifaId, respuesta) {
  const r = typeof respuesta === 'string' ? JSON.parse(respuesta) : (respuesta || {});
  const valores = filtrarPermitidas(tarifaId, r.valores);
  const descartadas = Object.keys(r.valores || {}).filter((k) => !(k in valores));
  return {
    valores, descartadas, validaDesde: r.valida_desde ?? null, validaHasta: r.valida_hasta ?? null,
    tarifaDocumento: typeof r.tarifa_documento === 'string' ? r.tarifa_documento.trim() : '', esEstaTarifa: r.es_esta_tarifa === true,
  };
}

const decimales = (n) => {
  const s = String(n);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return (s.split('.')[1] || '').length;
};

/** Peaje que aparece en un nombre: 3.0TD → 30TD, RL.1 → RL1. null si no hay. */
const peajeDe = (nombre) => /\d\.\d\s?TD|RL\.?\s?\d/i.exec(nombre || '')?.[0].replace(/[\s.]/g, '').toUpperCase() ?? null;

/** Motivo por el que el documento no es de esta tarifa, o null. */
export function documentoAjeno(tarifaId, { tarifaDocumento, esEstaTarifa }) {
  const { nombre } = TARIFAS[tarifaId];
  const pDoc = peajeDe(tarifaDocumento);
  const pTarifa = peajeDe(nombre);
  if (esEstaTarifa && !(pDoc && pTarifa && pDoc !== pTarifa)) return null;
  return `Este documento no es de la tarifa ${nombre}${tarifaDocumento ? ` (parece ser: ${tarifaDocumento})` : ''}. Sube la hoja correcta.`;
}

/**
 * @returns {{errores:string[], avisos:Object<string,string>}}
 *   errores → bloquean el guardado · avisos → ⚠ por campo, no bloquean
 */
export function validarActualizacion(tarifaId, { valores, validaDesde, validaHasta, tarifaDocumento, esEstaTarifa }, actuales = valoresActuales(tarifaId)) {
  const t = TARIFAS[tarifaId];
  const errores = [];
  const avisos = {};

  if (esEstaTarifa !== undefined) {
    const ajeno = documentoAjeno(tarifaId, { tarifaDocumento, esEstaTarifa });
    if (ajeno) return { errores: [ajeno], avisos };
  }

  if (!ISO.test(validaDesde || '') || !ISO.test(validaHasta || '')) errores.push('Faltan las fechas de validez o no son válidas.');
  else if (validaHasta < validaDesde) errores.push('La fecha "hasta" es anterior a "desde".');

  if (Object.keys(valores).length === 0) errores.push('La IA no ha devuelto ningún precio.');

  for (const [ruta, v] of Object.entries(valores)) {
    if (v < 0) errores.push(`${ruta}: número negativo.`);
    if (decimales(v) > 6) errores.push(`${ruta}: más de 6 decimales.`);
  }

  const final = { ...actuales, ...valores };

  if (t.tipo === 'open') {
    const promo = final.extraAnyo / 100;
    for (let f = 0; f < 4; f++) {
      const base = final[`baseEnergia.${f}`];
      for (let c = 0; c < 5; c++) {
        const dto = final[`modalidades.${c}.dto`] / 100;
        const esperado = base * (1 - promo - dto);
        if (Math.abs(final[`matrix.${f}.${c}`] - esperado) > TOLERANCIA_PRECIO) {
          errores.push(`Tramo ${f + 1}, modalidad ${c + 1}: ${final[`matrix.${f}.${c}`]} no cuadra con base × (1 − promo − modalidad) = ${esperado.toFixed(6)}.`);
        }
      }
    }
  } else if (t.tipo === 'tempo') {
    const esperado = final['energia.base'] * (1 - final.descuento / 100);
    if (Math.abs(final['energia.promo'] - esperado) > TOLERANCIA_PRECIO) {
      errores.push(`${final['energia.promo']} no cuadra con base × (1 − promo) = ${esperado.toFixed(6)}.`);
    }
  } else {
    for (const [ruta, v] of Object.entries(valores)) {
      const a = actuales[ruta];
      if (a > 0 && Math.abs(v - a) / a > VARIACION_AVISO) avisos[ruta] = `Variación de más del ${VARIACION_AVISO * 100} % respecto a la versión actual.`;
    }
  }
  return { errores, avisos };
}

/** Lista para la pantalla de cambios y para guardar en `cambios` (solo los que cambian). */
export function calcularCambios(tarifaId, valores, actuales = valoresActuales(tarifaId)) {
  const filas = rutasDe(tarifaId).map((ruta) => {
    const antes = actuales[ruta];
    const despues = ruta in valores ? valores[ruta] : antes;
    return { ruta, antes, despues, cambia: antes !== despues };
  });
  const cambios = Object.fromEntries(filas.filter((f) => f.cambia).map((f) => [f.ruta, { de: f.antes, a: f.despues }]));
  return { filas, cambios };
}
