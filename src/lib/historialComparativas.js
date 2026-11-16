import { supabase } from './supabase';
import { generarPdfInforme } from './exportPdf';

/* Historial de Comparativas.
 * Cada comparativa se guarda sola en cuanto queda calculada (y también al descargar o
 * imprimir), con sus datos clave, el PDF del informe y la factura aportada. Si se retoca
 * la misma comparativa (misma factura o mismo CUPS), se actualiza la ficha: no se duplica. */

export const TABLA = 'historial_comparativas';
export const TABLA_ARCHIVOS = 'historial_comparativas_archivos';

const SEDES = ['Palencia', 'Valladolid', 'Ambos'];

/** Admin, manager y comerciales con sede ven todas; los comerciales sin sede, solo las suyas. */
export function veTodasLasComparativas(user) {
  const rol = (user?.role || '').toLowerCase();
  if (rol === 'admin' || rol === 'manager') return true;
  return SEDES.includes(user?.equipo);
}

const guardadas = new Map(); // elementId → { clave, id, sesion }
const colas = new Map();     // elementId → promesa en curso (evita dos inserciones a la vez)

/* Identifica "la misma comparativa": la misma factura subida o, sin factura, el mismo CUPS
   (o cliente). Si se retocan datos dentro de la misma sesión, se actualiza la ficha. */
const sesionDe = (factura, datos) => (factura
  ? `f:${factura.name}|${factura.size}|${factura.lastModified}`
  : `c:${(datos.cups || '').toUpperCase().replace(/\s+/g, '') || (datos.cliente || '').trim().toUpperCase()}`);

const aDataUrl = (blob) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result);
  r.onerror = rej;
  r.readAsDataURL(blob);
});

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/**
 * Guarda la comparativa (una sola vez por contenido del informe). Nunca lanza: un fallo
 * al guardar el historial no debe impedir descargar o imprimir.
 */
export function registrarComparativa(args) {
  const { elementId } = args;
  const anterior = colas.get(elementId) || Promise.resolve();
  const siguiente = anterior.then(() => guardar(args));
  colas.set(elementId, siguiente.catch(() => null));
  return siguiente;
}

async function guardar({ elementId, usuario, factura, datos }) {
  try {
    const el = document.getElementById(elementId);
    if (!el || !usuario?.username) return null;
    const clave = el.innerHTML;
    const sesion = sesionDe(factura, datos);
    const previa = guardadas.get(elementId);
    if (previa && previa.clave === clave) return previa.id;

    const blob = await generarPdfInforme(elementId); // misma caché que la descarga
    const pdf = blob ? await aDataUrl(blob) : null;
    const facturaUrl = factura ? await aDataUrl(factura) : null;

    const datosFila = {
      equipo: usuario.equipo || null,
      tipo: datos.tipo,
      tarifa_acceso: datos.tarifaAcceso || null,
      producto: datos.producto || null,
      cliente: (datos.cliente || '').trim() || null,
      cups: (datos.cups || '').toUpperCase().replace(/\s+/g, '') || null,
      potencias: datos.potencias || null,
      consumos: datos.consumos || null,
      consumo_total_kwh: num(datos.consumoTotal),
      consumo_anual_kwh: num(datos.consumoAnual),
      dias: num(datos.dias),
      importe_actual: num(datos.importeActual),
      importe_oferta: num(datos.importeOferta),
      ahorro: num(datos.ahorro),
      ahorro_pct: num(datos.ahorroPct),
      ahorro_anual: num(datos.ahorroAnual),
      datos: datos.form || null,
      tiene_factura: !!facturaUrl,
      factura_nombre: factura?.name || null,
    };

    // Misma comparativa retocada: se actualiza la ficha ya guardada.
    if (previa && previa.sesion === sesion) {
      const { error } = await supabase.from(TABLA).update(datosFila).eq('id', previa.id);
      if (error) throw error;
      const { error: e2 } = await supabase.from(TABLA_ARCHIVOS).update({ pdf_comparativa: pdf, factura: facturaUrl }).eq('comparativa_id', previa.id);
      if (e2) console.error('[Historial comparativas] archivos:', e2);
      guardadas.set(elementId, { clave, id: previa.id, sesion });
      return previa.id;
    }

    const id = Date.now();
    const { error } = await supabase.from(TABLA).insert([{ id, realizada_por: usuario.username, ...datosFila }]);
    if (error) throw error;
    const { error: e2 } = await supabase.from(TABLA_ARCHIVOS).insert([{ comparativa_id: id, pdf_comparativa: pdf, factura: facturaUrl }]);
    if (e2) console.error('[Historial comparativas] archivos:', e2);
    guardadas.set(elementId, { clave, id, sesion });
    return id;
  } catch (err) {
    console.error('[Historial comparativas] No se pudo guardar:', err);
    return null;
  }
}

/** Descarga un archivo de la comparativa ('pdf_comparativa' | 'factura'). */
export async function obtenerArchivoComparativa(id, campo) {
  const { data, error } = await supabase.from(TABLA_ARCHIVOS).select(campo).eq('comparativa_id', id).maybeSingle();
  if (error) throw error;
  return data?.[campo] || null;
}

/** Normaliza un CUPS para compararlo. Un CUPS completo: ES + 16 dígitos + 2 letras (+ 2 opcionales). */
export const normalizarCups = (c) => (c || '').toUpperCase().replace(/\s+/g, '');
export const esCupsCompleto = (c) => /^ES\d{16}[A-Z]{2}(\d[A-Z])?$/.test(normalizarCups(c));
