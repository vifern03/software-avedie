/**
 * Informe comercial de la comparativa B2B.
 *
 * `construirInforme` crea UN modelo con todos los importes; la pantalla lo pinta y
 * el PDF es una captura de ese mismo bloque, así que siempre coinciden.
 * El informe solo contiene la oferta seleccionada frente a la factura; los
 * diagnósticos (modalidades, avisos técnicos, validación de la extracción) se
 * quedan en la interfaz interna del comercial.
 */

import { calcularAhorro, extrapolarAnual } from './motor.js';

export function eurES(v) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
}
export function numES(v, dec = 0) {
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });
}
// Cantidades del desglose (kW, kWh): sin ceros de relleno y sin arrastrar decimales de coma flotante.
const cant = (v) => String(Math.round(Number(v) * 1000) / 1000);

/**
 * @param {object} p
 *  resultado      salida OK de calcularOfertaLuz
 *  oferta         texto de la oferta (p. ej. "Open 3.0TD — Plana")
 *  cliente, cups, asesor, fechaInforme (texto)
 *  dias           días facturados
 *  facturaOriginal  total de la factura original (€)
 *  otrosExcluidos   € que el comercial excluye expresamente (0 por defecto)
 */
export function construirInforme(p) {
  const r = p.resultado;
  const potencia = r.detallePotencia.map(x => ({
    detalle: `${cant(x.kw)} kW (${x.periodo}) × ${x.dias} días × ${x.precioDia.toFixed(6)} €/kW`,
    importe: x.importe,
  }));
  const energia = r.detalleEnergia.map(x => ({
    detalle: `${cant(x.kwh)} kWh (${x.periodo || x.etiqueta}) × ${x.precio.toFixed(6)} €/kWh`,
    importe: x.importe,
  }));
  if (r.excedentes) energia.push({ detalle: 'Compensación de excedentes (autoconsumo)', importe: -r.excedentes });

  // Conceptos de la factura que no dependen de la comercializadora, impuestos y alquiler.
  const a = r.adicionales;
  const otros = [
    ['Excesos de Potencia', a.excesos],
    ['Energía Reactiva', a.reactiva],
    ['Financiación Bono Social', a.bonoSocial],
  ].filter(([, v]) => v).map(([detalle, importe]) => ({ detalle, importe }));
  otros.push({ detalle: `Impuesto Eléctrico (${numES(r.ieRate * 100, 2)}%) sobre ${eurES(r.baseIE)}`, importe: r.ie });
  if (a.alquiler) otros.push({ detalle: 'Alquiler de Contador', importe: a.alquiler });
  otros.push({ detalle: `IVA (${numES(r.ivaRate * 100, 0)}%) sobre ${eurES(r.baseIVA)}`, importe: r.iva });

  const original = Number(p.facturaOriginal) || 0;
  const excluidos = Number(p.otrosExcluidos) || 0;
  const comparable = original - excluidos;
  const { ahorroEur } = calcularAhorro(comparable, r.total);
  // El porcentaje de ahorro compara contra la oferta de Endesa (mismo criterio que
  // las comparativas 2.0 y gas); si sale sobrecoste, se mide sobre la factura actual.
  const base = ahorroEur >= 0 ? r.total : comparable;
  const ahorroPct = base > 0 ? Math.abs(ahorroEur) / base * 100 : null;

  return {
    cliente: p.cliente || 'Sin nombre',
    cups: p.cups || '',
    oferta: p.oferta,
    dias: p.dias,
    fechaInforme: p.fechaInforme,
    asesor: p.asesor || '',
    potencia, subtotalPotencia: r.potencia,
    energia, subtotalEnergia: r.energia - (r.excedentes || 0),
    otros,
    totalOferta: r.total,
    facturaOriginal: original,
    otrosExcluidos: excluidos,
    comparable,
    ahorroEur,
    ahorroPct,
    ahorroAnual: extrapolarAnual(ahorroEur, p.dias) ?? 0,
  };
}
