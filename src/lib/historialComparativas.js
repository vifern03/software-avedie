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
    const previa = guardadas.get(elementId);
    // Comparativa abierta desde el Historial (lápiz): sigue ligada a esa ficha mientras no
    // se suba otra factura ni se cambie de CUPS.
    const ed = previa?.edicion;
    const enEdicion = !!ed && !factura && normalizarCups(datos.cups) === ed.cups;
    const sesion = enEdicion ? previa.sesion : sesionDe(factura, datos);
    if (previa && previa.clave === clave) return previa.id;

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
      tiene_factura: enEdicion ? !!ed.tiene_factura : !!factura,
      factura_nombre: enEdicion ? (ed.factura_nombre || null) : (factura?.name || null),
    };

    const propiaDeEstaSesion = previa && previa.sesion === sesion && previa.propia;

    // Control de duplicados: si ya hay en el historial un estudio igual (mismo CUPS,
    // importe, días, consumo y oferta), no se guarda otra vez.
    if (!propiaDeEstaSesion) {
      const dup = await buscarDuplicado(datosFila);
      if (dup) {
        guardadas.set(elementId, { clave, id: dup, sesion, propia: false, edicion: enEdicion ? ed : null });
        return dup;
      }
    }

    const blob = await generarPdfInforme(elementId); // misma caché que la descarga
    const pdf = blob ? await aDataUrl(blob) : null;
    // En edición no se vuelve a subir la factura: se conserva (o se copia de la ficha original).
    const facturaUrl = factura ? await aDataUrl(factura)
      : (enEdicion && !propiaDeEstaSesion && ed.tiene_factura ? await obtenerArchivoComparativa(ed.id, 'factura').catch(() => null) : null);

    // Misma comparativa retocada: se actualiza la ficha que guardó esta sesión.
    if (propiaDeEstaSesion) {
      const { error } = await supabase.from(TABLA).update(datosFila).eq('id', previa.id);
      if (error) throw error;
      const archivos = enEdicion ? { pdf_comparativa: pdf } : { pdf_comparativa: pdf, factura: facturaUrl };
      const { error: e2 } = await supabase.from(TABLA_ARCHIVOS).update(archivos).eq('comparativa_id', previa.id);
      if (e2) console.error('[Historial comparativas] archivos:', e2);
      guardadas.set(elementId, { clave, id: previa.id, sesion, propia: true, edicion: enEdicion ? ed : null });
      return previa.id;
    }

    const id = Date.now();
    const { error } = await supabase.from(TABLA).insert([{ id, realizada_por: usuario.username, ...datosFila }]);
    if (error) throw error;
    const { error: e2 } = await supabase.from(TABLA_ARCHIVOS).insert([{ comparativa_id: id, pdf_comparativa: pdf, factura: facturaUrl }]);
    if (e2) console.error('[Historial comparativas] archivos:', e2);
    guardadas.set(elementId, { clave, id, sesion, propia: true, edicion: enEdicion ? ed : null });
    return id;
  } catch (err) {
    console.error('[Historial comparativas] No se pudo guardar:', err);
    return null;
  }
}

const igual = (a, b, tol) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol);

/** Mismo estudio = mismo CUPS, importe de factura, días, consumo, peaje y oferta comparada. */
export function esMismoEstudio(a, b) {
  return igual(a.importe_actual, b.importe_actual, 0.01)
    && igual(a.dias, b.dias, 0)
    && igual(a.consumo_total_kwh, b.consumo_total_kwh, 0.5)
    && (a.tarifa_acceso || '') === (b.tarifa_acceso || '')
    && (a.producto || '') === (b.producto || '');
}

/** Id de un estudio ya guardado igual a este, o null. Sin CUPS no se puede cuadrar. */
async function buscarDuplicado(fila) {
  if (!fila.cups) return null;
  const { data, error } = await supabase.from(TABLA)
    .select('id, importe_actual, dias, consumo_total_kwh, tarifa_acceso, producto')
    .eq('cups', fila.cups);
  if (error) { console.error('[Historial comparativas] duplicados:', error); return null; }
  return (data || []).find((c) => esMismoEstudio(c, fila))?.id ?? null;
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

/* ── Editar desde el Historial (lápiz) ──
   El Historial deja preparada la comparativa y navega a Consulta de Tarifas; la pestaña
   correspondiente la recoge al montarse y recupera sus datos sin volver a leer la factura.
   Si la edita quien la hizo, se actualiza esa ficha; si la edita otra persona, se guarda
   como otro estudio a su nombre en el mismo CUPS (la original no cambia). */
let edicionPendiente = null;

export function prepararEdicion(fila, usuario) {
  edicionPendiente = {
    id: fila.id, tipo: fila.tipo, cups: normalizarCups(fila.cups), datos: fila.datos || {},
    propia: !!usuario?.username && fila.realizada_por === usuario.username,
    realizada_por: fila.realizada_por, created_at: fila.created_at,
    tiene_factura: !!fila.tiene_factura, factura_nombre: fila.factura_nombre || null,
  };
}

export const tipoEdicionPendiente = () => edicionPendiente?.tipo || null;

/** Devuelve (una sola vez) la edición pendiente de este tipo y liga el informe a su ficha. */
export function tomarEdicion(tipo, elementId) {
  const ed = edicionPendiente;
  if (!ed || ed.tipo !== tipo) return null;
  edicionPendiente = null;
  guardadas.set(elementId, { clave: null, id: ed.id, sesion: `e:${ed.id}`, propia: ed.propia, edicion: ed });
  return ed;
}

/** El formulario guardado lleva el asesor ya resuelto; si era "otro", se recupera como tal. */
export function formularioGuardado(datos, base) {
  const { _estado, ...resto } = datos || {};
  const f = { ...base };
  for (const k of Object.keys(base)) if (resto[k] !== undefined && resto[k] !== null) f[k] = resto[k];
  if (resto.asesorLibre && resto.asesor === resto.asesorLibre) f.asesor = '__otro__';
  return { form: f, extra: resto, estado: _estado || {} };
}
