/**
 * Informe comercial de la comparativa B2B (pantalla y PDF).
 *
 * `construirInforme` crea UN modelo con todos los importes; la vista en pantalla y
 * el PDF se generan desde ese mismo modelo, así que siempre coinciden.
 * El informe solo contiene la oferta seleccionada frente a la factura completa;
 * los diagnósticos (modalidades, avisos técnicos, validación de la extracción) se
 * quedan en la interfaz interna del comercial.
 */

import { calcularAhorro } from './motor.js';
import { fmtFechaES } from './vigencia.js';

export const NOTA_BASE = 'Simulación para el consumo y período indicados; se mantienen los conceptos adicionales de la factura original.';

const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

export function eurES(v) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' }) + ' €';
}
export function numES(v, dec = 0) {
  return Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: 'always' });
}
const precio6 = (v) => numES(v, 6);

/**
 * @param {object} p
 *  resultado      salida OK de calcularOfertaLuz
 *  oferta         texto de la oferta (p. ej. "Open 3.0TD — Plana")
 *  cliente, cups, asesor, fechaInforme (texto)
 *  periodo        { desde, hasta } | undefined
 *  dias, fechaEmision
 *  facturaOriginal  total de la factura original (€)
 *  otrosExcluidos   € que el comercial excluye expresamente (0 por defecto)
 *  limitaciones     [texto] limitaciones materiales a indicar brevemente
 */
export function construirInforme(p) {
  const r = p.resultado;
  const potencia = r.detallePotencia.map(x => ({
    concepto: `Potencia ${x.periodo}`,
    detalle: `${numES(x.kw, x.kw % 1 ? 2 : 0)} kW × ${x.dias} días × ${precio6(x.precioDia)} €/kW·día`,
    importe: x.importe,
  }));
  const energia = r.detalleEnergia.map(x => ({
    concepto: `Energía ${x.etiqueta}`,
    detalle: `${numES(x.kwh, x.kwh % 1 ? 2 : 0)} kWh × ${precio6(x.precio)} €/kWh`,
    importe: x.importe,
  }));
  const a = r.adicionales;
  const adicionales = [
    ['Excesos de potencia', a.excesos],
    ['Energía reactiva', a.reactiva],
    ['Financiación del bono social', a.bonoSocial],
  ].filter(([, v]) => v).map(([concepto, importe]) => ({ concepto, importe }));

  const impuestos = [
    { concepto: 'Impuesto sobre la electricidad', detalle: `${numES(r.ieRate * 100, 8)} % sobre ${eurES(r.baseIE)}`, importe: r.ie },
  ];
  if (a.alquiler) impuestos.push({ concepto: 'Alquiler de equipos de medida', detalle: '', importe: a.alquiler });
  impuestos.push({ concepto: `IVA ${numES(r.ivaRate * 100, 0)} %`, detalle: `sobre ${eurES(r.baseIVA)}`, importe: r.iva });

  const original = Number(p.facturaOriginal) || 0;
  const excluidos = Number(p.otrosExcluidos) || 0;
  const comparable = original - excluidos;
  const { ahorroEur, ahorroPct } = calcularAhorro(comparable, r.total);

  return {
    cliente: p.cliente || 'Sin nombre',
    cups: p.cups || '',
    oferta: p.oferta,
    tramo: r.tramo || null,
    consumo: p.periodo ? `${fmtFechaES(p.periodo.desde)} – ${fmtFechaES(p.periodo.hasta)}` : null,
    dias: p.dias,
    fechaEmision: p.fechaEmision ? fmtFechaES(p.fechaEmision) : null,
    fechaInforme: p.fechaInforme,
    asesor: p.asesor || '',
    potencia, subtotalPotencia: r.potencia,
    energia, subtotalEnergia: r.energia,
    excedentes: r.excedentes || 0,
    adicionales,
    impuestos,
    totalOferta: r.total,
    facturaOriginal: original,
    otrosExcluidos: excluidos,
    comparable,
    ahorroEur,
    ahorroPct: ahorroPct == null ? null : r2(ahorroPct),
    notas: [NOTA_BASE, ...(p.limitaciones || [])],
  };
}

/* ══════════════════════════ PDF A4 (texto vectorial) ══════════════════════════ */

// Helvetica estándar de jsPDF usa WinAnsi: sustituir los caracteres que no contiene.
const pdfTxt = (s) => String(s ?? '')
  .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/−/g, '-').replace(/[  ]/g, ' ');

async function cargarImagen(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(fr.result);
      fr.onerror = () => ok(null);
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}


/**
 * Plantilla PDF independiente de la pantalla: A4 vertical, márgenes de 16 mm, texto
 * vectorial seleccionable (mínimo 10 pt en el contenido), tabla Concepto / Detalle del
 * cálculo / Importe con cabecera repetida en cada página, sin cortar filas ni separar el
 * resumen. No depende del dispositivo (no es una captura de pantalla).
 * @returns {Promise<Blob>}
 */
export async function generarPdfInforme(m) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const W = pdf.internal.pageSize.getWidth();   // 210
  const H = pdf.internal.pageSize.getHeight();  // 297
  const M = 16, R = W - M, ANCHO = W - 2 * M;
  const PIE = 12;                                // reserva inferior para el pie
  const AZUL = [26, 86, 170], OSCURO = [33, 37, 41], GRIS = [90, 96, 104], LINEA = [222, 226, 230], FONDO = [244, 247, 251];
  const VERDE = [21, 128, 61], ROJO = [185, 28, 28];
  const PT = 0.3528;                             // mm por punto
  const X_DETALLE = M + 60;
  const COL = { concepto: M + 2, detalle: X_DETALLE, importe: R - 2 };
  const ANCHO_CONCEPTO = X_DETALLE - M - 4;
  const ANCHO_DETALLE = R - 36 - X_DETALLE;
  let y = M;

  const txt = (t, x, yy, o) => pdf.text(pdfTxt(t), x, yy, o);
  const alturaLinea = (pt) => pt * PT * 1.18;

  /* ── Cabecera (fondo blanco, color corporativo moderado) ── */
  const [logoAvedie, logoEndesa] = await Promise.all([cargarImagen('/logo-avedie-main.png'), cargarImagen('/endesa-logo.png')]);
  const xMarca = M + (logoAvedie ? 17 : 0);
  if (logoAvedie) { try { pdf.addImage(logoAvedie, 'PNG', M, y, 14, 14, undefined, 'FAST'); } catch { /* sin logo */ } }
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12); pdf.setTextColor(...AZUL);
  txt('Grupo Avedie', xMarca, y + 6);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS);
  txt('Asesoría energética · Agente Endesa', xMarca, y + 11.5);
  if (logoEndesa) { try { pdf.addImage(logoEndesa, 'PNG', R - 34, y + 1, 34, 12, undefined, 'FAST'); } catch { /* sin logo */ } }
  y += 21;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(17); pdf.setTextColor(...OSCURO);
  txt('Comparativa de suministro eléctrico', M, y);
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS);
  txt(m.fechaInforme || '', R, y, { align: 'right' });
  y += 3;
  pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.6); pdf.line(M, y, R, y);
  y += 6.5;

  /* ── Datos del suministro y oferta (bloque compacto a dos columnas) ── */
  const colW = (ANCHO - 6) / 2;
  const ETQ = 35;
  pdf.setFontSize(10);
  // Cliente y CUPS a ancho completo (nombres largos y CUPS sin partir)
  for (const [k, v] of [['Cliente', m.cliente], ['CUPS', m.cups || '—']]) {
    const lineas = pdf.splitTextToSize(pdfTxt(v), ANCHO - ETQ);
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...GRIS); txt(k, M, y);
    pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...OSCURO); pdf.text(lineas, M + ETQ, y);
    y += lineas.length * alturaLinea(10) + 1.5;
  }
  const datos = [
    ['Oferta', m.oferta],
    ['Tramo de potencia', m.tramo || '—'],
    ['Consumo facturado', m.consumo || '—'],
    ['Días facturados', m.dias ? String(m.dias) : '—'],
    ['Factura emitida', m.fechaEmision || '—'],
    ['Asesor', m.asesor || '—'],
  ];
  const celdas = datos.map(([k, v]) => ({ k, lineas: pdf.splitTextToSize(pdfTxt(v), colW - ETQ) }));
  for (let i = 0; i < celdas.length; i += 2) {
    const par = celdas.slice(i, i + 2);
    const nl = Math.max(...par.map(c => c.lineas.length));
    par.forEach((c, j) => {
      const x = M + j * (colW + 6);
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...GRIS); txt(c.k, x, y);
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(...OSCURO); pdf.text(c.lineas, x + ETQ, y);
    });
    y += nl * alturaLinea(10) + 1.5;
  }
  y += 2.5;

  /* ── Tabla de costes ── */
  const cabeceraTabla = () => {
    pdf.setFillColor(...AZUL); pdf.rect(M, y, ANCHO, 7.5, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
    txt('Concepto', COL.concepto, y + 5.1);
    txt('Detalle del cálculo', COL.detalle, y + 5.1);
    txt('Importe', COL.importe, y + 5.1, { align: 'right' });
    y += 7.5;
  };
  const cabe = (alto) => y + alto <= H - M - PIE;
  const saltoSiHaceFalta = (alto) => {
    if (!cabe(alto)) { pdf.addPage(); y = M; cabeceraTabla(); }
  };
  const filaTabla = (concepto, detalle, importe, estilo = 'normal') => {
    pdf.setFontSize(10);
    const lc = pdf.splitTextToSize(pdfTxt(concepto), ANCHO_CONCEPTO);
    const ld = detalle ? pdf.splitTextToSize(pdfTxt(detalle), ANCHO_DETALLE) : [];
    const n = Math.max(lc.length, ld.length, 1);
    const alto = n * alturaLinea(10) + 2.1;
    saltoSiHaceFalta(alto);
    if (estilo === 'seccion' || estilo === 'subtotal') {
      pdf.setFillColor(...FONDO); pdf.rect(M, y, ANCHO, alto, 'F');
    }
    const base = y + 1.5 + 10 * PT;
    pdf.setFont('helvetica', estilo === 'normal' ? 'normal' : 'bold');
    pdf.setTextColor(...(estilo === 'seccion' ? AZUL : OSCURO));
    pdf.text(lc, COL.concepto, base);
    if (ld.length) { pdf.setFont('helvetica', 'normal'); pdf.setTextColor(...GRIS); pdf.text(ld, COL.detalle, base); }
    if (importe != null) {
      pdf.setFont('helvetica', estilo === 'normal' ? 'normal' : 'bold'); pdf.setTextColor(...OSCURO);
      txt(eurES(importe), COL.importe, base, { align: 'right' });
    }
    y += alto;
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.2); pdf.line(M, y, R, y);
  };

  cabeceraTabla();
  filaTabla('Término de potencia', '', null, 'seccion');
  m.potencia.forEach(l => filaTabla(l.concepto, l.detalle, l.importe));
  filaTabla('Subtotal potencia', '', m.subtotalPotencia, 'subtotal');
  filaTabla('Término de energía', '', null, 'seccion');
  m.energia.forEach(l => filaTabla(l.concepto, l.detalle, l.importe));
  if (m.excedentes) filaTabla('Compensación de excedentes de autoconsumo', '', -m.excedentes);
  filaTabla('Subtotal energía', '', m.subtotalEnergia - (m.excedentes || 0), 'subtotal');
  if (m.adicionales.length) {
    filaTabla('Otros conceptos de la factura', '', null, 'seccion');
    m.adicionales.forEach(l => filaTabla(l.concepto, 'Importe de la factura original', l.importe));
  }
  filaTabla('Impuestos y alquiler', '', null, 'seccion');
  m.impuestos.forEach(l => filaTabla(l.concepto, l.detalle, l.importe));
  filaTabla('Total simulado con la oferta', '', m.totalOferta, 'subtotal');

  /* ── Resumen (una pieza, nunca separado de sus importes) ── */
  const altoResumen = 25 + (m.otrosExcluidos ? 6 : 0);
  if (!cabe(altoResumen + 4)) { pdf.addPage(); y = M; } else { y += 4; }
  pdf.setDrawColor(...AZUL); pdf.setLineWidth(0.4);
  pdf.roundedRect(M, y, ANCHO, altoResumen, 2, 2, 'D');
  const c3 = ANCHO / 3;
  const positivo = (m.ahorroEur ?? 0) >= 0;
  const bloques = [
    ['Factura actual', eurES(m.facturaOriginal), OSCURO, null],
    ['Total con la oferta', eurES(m.totalOferta), AZUL, null],
    [positivo ? 'Ahorro del período' : 'Sobrecoste del período', eurES(Math.abs(m.ahorroEur)), positivo ? VERDE : ROJO,
      m.ahorroPct != null ? `${numES(Math.abs(m.ahorroPct), 2)} % ${positivo ? 'menos' : 'más'}` : null],
  ];
  bloques.forEach(([et, val, color, sub], i) => {
    const cx = M + c3 * i + c3 / 2;
    if (i > 0) { pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.3); pdf.line(M + c3 * i, y + 4, M + c3 * i, y + 21); }
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS);
    txt(et, cx, y + 7, { align: 'center' });
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(16); pdf.setTextColor(...color);
    txt(val, cx, y + 14.5, { align: 'center' });
    if (sub) { pdf.setFontSize(11); txt(sub, cx, y + 20.5, { align: 'center' }); }
  });
  if (m.otrosExcluidos) {
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS);
    txt(`Comparación sobre ${eurES(m.comparable)}: se excluyen ${eurES(m.otrosExcluidos)} de servicios ajenos al suministro.`, M + 4, y + 28);
  }
  y += altoResumen + 5;

  /* ── Nota ── */
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.setTextColor(...GRIS);
  for (const n of m.notas) {
    const lineas = pdf.splitTextToSize(pdfTxt(n), ANCHO);
    const alto = lineas.length * alturaLinea(10) + 1;
    if (!cabe(alto)) { pdf.addPage(); y = M; }
    pdf.text(lineas, M, y);
    y += alto;
  }

  /* ── Pie ── */
  const total = pdf.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    pdf.setPage(i);
    pdf.setDrawColor(...LINEA); pdf.setLineWidth(0.2); pdf.line(M, H - M + 2, R, H - M + 2);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(140, 140, 140);
    txt('Grupo Avedie · Comparativa de suministro eléctrico', M, H - M + 6.5);
    txt(`Página ${i} de ${total}`, R, H - M + 6.5, { align: 'right' });
  }
  return pdf.output('blob');
}
