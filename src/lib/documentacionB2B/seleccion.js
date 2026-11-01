/** Comprobaciones de los CUPS introducidos en la ventana de generación. */
import { normalizarCups } from '../distribuidoras.js';

export const MAX_CUPS = 3;

export function esProductoDisponible(c) {
  return String(c.id_producto || '').toLowerCase().includes('open') && ['3.0TD', '6.1TD'].includes(c.tarifa);
}

/** Normaliza lo escrito: sin vacíos ni repetidos. */
export function limpiarCups(entradas) {
  return [...new Set(entradas.map(normalizarCups).filter(Boolean))];
}

/**
 * @param {string[]} cups normalizados
 * @param {Array} filas altas encontradas
 * @param {Record<string,object>} activos CUPS con documentación activa
 * @returns {{ clientes: Array, error: string|null }} clientes en el orden escrito
 */
export function comprobarCups(cups, filas, activos) {
  const porCups = new Map(filas.map((f) => [normalizarCups(f.cups), f]));
  const faltan = cups.filter((c) => !porCups.has(c));
  if (faltan.length) return { clientes: [], error: `No existe en Alta B2B: ${faltan.join(', ')}.` };

  const clientes = cups.map((c) => porCups.get(c));
  const otros = clientes.filter((c) => !esProductoDisponible(c));
  if (otros.length) {
    const lista = otros.map((c) => `${normalizarCups(c.cups)} (${c.id_producto || 'sin producto'})`).join(', ');
    return { clientes: [], error: `Solo se puede generar con Open 3.0TD u Open 6.1TD: ${lista}.` };
  }
  const cif = (c) => String(c.cif_dni ?? '').trim().toUpperCase();
  if (new Set(clientes.map(cif)).size > 1) return { clientes: [], error: 'Todos los CUPS deben ser del mismo CIF.' };
  if (new Set(clientes.map((c) => c.tarifa)).size > 1) {
    return { clientes: [], error: 'Todos los CUPS deben tener la misma tarifa de acceso (3.0TD o 6.1TD, sin mezclar).' };
  }
  const documentados = cups.filter((c) => activos[c]);
  if (documentados.length) return { clientes: [], error: `Ya tiene documentación: ${documentados.join(', ')}.` };
  return { clientes, error: null };
}
