/**
 * Motor determinista de comparativas (luz B2B y gas).
 *
 * Gemini solo EXTRAE datos de la factura; todo el cálculo económico ocurre aquí,
 * con precios leídos del catálogo (src/data/*) y sin volver a aplicar descuentos
 * sobre precios publicados "con descuentos incluidos".
 *
 * Criterios (ver docs/COMPARATIVAS.md):
 *  - Las ofertas Endesa incluyen peajes y cargos → no se suman aparte.
 *  - Conceptos que NO dependen de la comercializadora (excesos de potencia,
 *    energía reactiva, alquiler del contador, financiación del bono social) se
 *    TRASLADAN desde la factura actual a los dos lados de la comparación, marcados
 *    como "mantenido de la factura actual (no recalculado)". Así no se infla el
 *    ahorro omitiéndolos.
 *  - Open: energía = kWh horas Open × precio Open + kWh resto × precio No Open.
 *    Si los datos no permiten separar las horas Open, la modalidad queda como
 *    "datos insuficientes": no se inventa ningún reparto.
 */

import { periodo6, esHoraOpen, viernesSantoEnRango, rangoFechas } from './calendario.js';
import { estadoVigencia, ETIQUETA_ESTADO } from './vigencia.js';
import { IEH_GAS_EUR_KWH } from '../../data/tarifasGas.js';

/** Impuesto especial sobre la electricidad (PDFs Endesa 17/09/2026 y facturas reales). */
export const IE_RATE = 0.0511269632;

export const ESTADO = {
  OK: 'ok',
  NO_ELEGIBLE: 'no_elegible',
  DATOS_INSUFICIENTES: 'datos_insuficientes',
  NO_DISPONIBLE: 'no_disponible',
};

export const r2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const es = (x, d) => Number(x).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const es6 = (x) => es(x, 6);
const esN = (x) => Number(x).toLocaleString('es-ES', { maximumFractionDigits: 2 });
const sum = (arr) => arr.reduce((a, b) => a + (Number(b) || 0), 0);

/* ══════════════════════════ Elegibilidad / tramos ══════════════════════════ */

function tramoPara(tramos, kw) {
  // Límite inferior exclusivo y superior inclusivo ("15 kW < Pc ≤ 30 kW").
  // El primer tramo de 6.1TD ("Pc ≤ 30 kW") no tiene mínimo.
  return tramos.findIndex((t, i) => (i === 0 && t.min === 0 ? kw >= 0 : kw > t.min) && kw <= t.max);
}

/**
 * Tramo de potencia de una oferta Open. El PDF solo dice "Potencia contratada (Pc)";
 * con potencias distintas por periodo no especifica cuál usar. Se evalúa con P1 y
 * con la potencia máxima; si caen en tramos distintos se usa el de PRECIO MÁS ALTO
 * (conservador) y se avisa.
 */
export function seleccionarTramoOpen(producto, potenciasKw, forzar = false) {
  const pots = potenciasKw.map(Number).filter(x => x > 0);
  const avisos = [];
  const motivos = [];
  if (pots.length === 0) return { idx: -1, motivos: ['Faltan las potencias contratadas.'], avisos };
  const pMax = Math.max(...pots);
  const p1 = Number(potenciasKw[0]) || pMax;

  if (producto.potenciaMaxima && pMax > producto.potenciaMaxima) {
    if (!forzar) {
      motivos.push(`La potencia contratada máxima (${pMax} kW) supera el límite de la oferta (${producto.potenciaMaxima} kW).`);
      return { idx: -1, motivos, avisos, superaLimite: true };
    }
    avisos.push(`SIMULACIÓN FUERA DE CONDICIONES: ${pMax} kW supera el límite de ${producto.potenciaMaxima} kW de la oferta. Se calcula con el último tramo; requiere confirmación de Endesa.`);
    return { idx: producto.tramos.length - 1, motivos, avisos };
  }
  const iMax = tramoPara(producto.tramos, pMax);
  const iP1 = tramoPara(producto.tramos, p1);
  if (iMax === -1) {
    motivos.push(`Ninguna potencia contratada encaja en los tramos de la oferta (máx. ${pMax} kW).`);
    return { idx: -1, motivos, avisos };
  }
  // Tramo según la potencia contratada máxima del suministro.
  const idx = iMax;
  if (iP1 !== -1 && iP1 !== iMax) {
    avisos.push(`Tramo de energía según la potencia máxima contratada (${pMax} kW → "${producto.tramos[iMax].label}"); P1 = ${p1} kW.`);
  }
  return { idx, motivos, avisos };
}

/* ══════════════════════════ Energía Open ══════════════════════════ */

/** Franjas en que se puede dividir el P6 regulado (días laborables 0–8 h y días tipo D). */
export const FRANJAS_P6 = [
  { id: 'lab0_8',  tipo: 'laborable', ini: 0,  fin: 8,  label: 'Laborables 0–8 h' },
  { id: 'd0_8',    tipo: 'finde',     ini: 0,  fin: 8,  label: 'Sáb., dom. y festivos 0–8 h' },
  { id: 'd8_18',   tipo: 'finde',     ini: 8,  fin: 18, label: 'Sáb., dom. y festivos 8–18 h' },
  { id: 'd18_24',  tipo: 'finde',     ini: 18, fin: 24, label: 'Sáb., dom. y festivos 18–24 h' },
];

/** 'open' | 'no' | 'parcial' para un bloque [ini, fin) de un tipo de día. */
function claseBloque(ventanas, tipo, ini, fin) {
  const tramos = ventanas[tipo];
  let open = 0;
  for (let h = ini; h < fin; h++) if (tramos.some(([a, b]) => h >= a && h < b)) open++;
  if (open === 0) return 'no';
  if (open === fin - ini) return 'open';
  return 'parcial';
}

/**
 * Qué datos necesita una modalidad Open para calcularse con agregados P1–P6.
 * P1–P5 son siempre horas laborables 8–24 h (Circular 3/2020, días A–C).
 */
export function necesidadesModalidad(modalidad) {
  const v = modalidad.ventanas;
  const claseP1P5 = claseBloque(v, 'laborable', 8, 24);
  const clasesP6 = FRANJAS_P6.map(f => claseBloque(v, f.tipo, f.ini, f.fin));
  const p6Uniforme = clasesP6.every(c => c === clasesP6[0]) && clasesP6[0] !== 'parcial';
  return { claseP1P5, clasesP6, p6Uniforme, necesitaDesgloseP6: !p6Uniforme };
}

/**
 * Reparte los kWh FACTURADOS entre horas Open y No Open.
 * Fuentes admitidas, por orden de preferencia:
 *   1. curva horaria (se usa para obtener la fracción Open de CADA periodo regulado,
 *      aplicada al kWh facturado de ese periodo — nunca sustituye al facturado);
 *   2. desglose manual del P6 por franjas;
 *   3. agregados P1–P6 solos (válido si la modalidad no parte el P6: Plana, Laboral).
 */
export function repartirOpen({ modalidad, kwhPeriodo, desgloseP6, curva, periodo }) {
  const avisos = [];
  const kwh = kwhPeriodo.map(x => Number(x) || 0);
  const nec = necesidadesModalidad(modalidad);

  if (curva && curva.length) {
    const tot = Array(6).fill(0), open = Array(6).fill(0);
    for (const { fecha, hora, kwh: k } of curva) {
      const p = periodo6(fecha, hora) - 1;
      tot[p] += k;
      if (esHoraOpen(modalidad.ventanas, fecha, hora)) open[p] += k;
    }
    let kOpen = 0, kNo = 0;
    for (let p = 0; p < 6; p++) {
      if (kwh[p] <= 0) continue;
      if (tot[p] <= 0) {
        return { ok: false, motivo: `La curva no tiene consumo en P${p + 1} pero la factura sí (${kwh[p]} kWh): no se puede repartir.` };
      }
      const f = open[p] / tot[p];
      kOpen += kwh[p] * f;
      kNo += kwh[p] * (1 - f);
    }
    const totCurva = sum(tot), totFact = sum(kwh);
    if (totFact > 0 && Math.abs(totCurva - totFact) / totFact > 0.01) {
      avisos.push(`La curva suma ${r2(totCurva)} kWh y la factura ${totFact} kWh: se usa la curva solo para el reparto horario y se respeta el consumo facturado.`);
    }
    return { ok: true, kOpen, kNo, metodo: 'curva', avisos };
  }

  if (desgloseP6 && nec.necesitaDesgloseP6) {
    const partes = FRANJAS_P6.map(f => Number(desgloseP6[f.id]) || 0);
    const sumaP6 = sum(partes);
    const tol = Math.max(1, kwh[5] * 0.005);
    if (Math.abs(sumaP6 - kwh[5]) > tol) {
      return { ok: false, motivo: `El desglose del P6 suma ${r2(sumaP6)} kWh y el P6 facturado es ${kwh[5]} kWh. Corrige el desglose o déjalo vacío.` };
    }
    let kOpen = 0, kNo = 0;
    const p1p5 = sum(kwh.slice(0, 5));
    if (nec.claseP1P5 === 'open') kOpen += p1p5; else kNo += p1p5;
    FRANJAS_P6.forEach((f, i) => { if (nec.clasesP6[i] === 'open') kOpen += partes[i]; else kNo += partes[i]; });
    return { ok: true, kOpen, kNo, metodo: 'desglose_p6', avisos };
  }

  // Por defecto: reparto por PERIODOS (criterio comercial). Los periodos de
  // `periodosOpen` van a precio Open y el resto a precio No Open.
  const per = modalidad.periodosOpen || [1, 2, 3, 4, 5, 6];
  let kOpen = 0, kNo = 0;
  kwh.forEach((k, i) => { if (per.includes(i + 1)) kOpen += k; else kNo += k; });
  if (modalidad.id !== 'plana') {
    avisos.push(`Modalidad ${modalidad.label}: precio Open aplicado a ${per.map(x => 'P' + x).join(', ')} y precio No Open al resto (reparto por periodos). Para el cálculo hora a hora exacto, carga la curva horaria.`);
  }
  return { ok: true, kOpen, kNo, metodo: 'periodos', avisos };
}

/* ══════════════════════════ Oferta eléctrica ══════════════════════════ */

/**
 * @param {object} i
 *  producto          catálogo (OPEN_30TD, OPEN_61TD, SIMPLY_30TD, SIMPLY_61TD, TEMPO_2_0TD, INDEXADA_*)
 *  modalidadId       (Open) 'plana'|'dia'|'laboral'|'finde'|'noche'
 *  potenciasKw       [P1..P6] (2.0TD: [P1, P2])
 *  dias              días facturados (de la factura)
 *  periodo           { desde, hasta } fechas del consumo (para calendario)
 *  kwhPeriodo        [P1..P6] kWh facturados (2.0TD: se suman)
 *  desgloseP6, curva opcionales (Open)
 *  omie              €/kWh (Indexada)
 *  tieneAutoconsumo, excedentesKwh
 *  mantenidos        { excesos, reactiva, alquiler, bonoSocial } en € desde la factura actual
 *  ivaRate           decimal
 *  fechaOferta       'YYYY-MM-DD' (por defecto hoy en Madrid)
 *  ignorarVigencia   solo para pruebas / simulación explícita
 *  territorio        'peninsula' (único soportado para el reparto horario)
 */
export function calcularOfertaLuz(i) {
  const p = i.producto;
  const motivos = [];
  const avisos = [];
  const res = (estado, extra = {}) => ({ estado, motivos, avisos, producto: p.nombre || p.id, ...extra });

  // ── Vigencia de contratación
  const est = estadoVigencia(p.contratacion, i.fechaOferta);
  if (est !== 'vigente') {
    const txt = `${ETIQUETA_ESTADO[est]}${p.contratacion?.incidencia ? ': ' + p.contratacion.incidencia : ''}`;
    if (!i.ignorarVigencia) { motivos.push(txt); return res(ESTADO.NO_DISPONIBLE); }
    avisos.push(`Simulación con oferta no contratable hoy (${txt}).`);
  }

  const dias = Number(i.dias) || 0;
  const kwh = (i.kwhPeriodo || []).map(x => Number(x) || 0);
  const pots = (i.potenciasKw || []).map(x => Number(x) || 0);
  if (dias <= 0) { motivos.push('Faltan los días facturados.'); return res(ESTADO.DATOS_INSUFICIENTES); }
  if (sum(kwh) <= 0) { motivos.push('Falta el consumo facturado.'); return res(ESTADO.DATOS_INSUFICIENTES); }
  if (i.territorio && i.territorio !== 'peninsula' && (p.modalidades || i.curva)) {
    motivos.push('El reparto horario solo está implementado para el calendario peninsular.');
    return res(ESTADO.DATOS_INSUFICIENTES);
  }

  // ── Elegibilidad
  if (p.requiereAutoconsumo && !i.tieneAutoconsumo) {
    motivos.push(`${p.nombre} solo está disponible para suministros con autoconsumo instalado.`);
    return res(ESTADO.NO_ELEGIBLE);
  }
  if (p.potenciaMinima && Math.max(...pots) <= p.potenciaMinima) {
    motivos.push(`${p.nombre} requiere potencia contratada > ${p.potenciaMinima} kW.`);
    return res(ESTADO.NO_ELEGIBLE);
  }
  if (p.id === 'tempo' && Math.max(...pots) > p.potenciaMaxima) {
    motivos.push(`TEMPO 2.0TD es para potencias ≤ ${p.potenciaMaxima} kW.`);
    return res(ESTADO.NO_ELEGIBLE);
  }

  // ── Potencia
  const terminos = p.id === 'tempo' ? p.potencia : p.potenciaTerminos;
  const lineas = [];
  let potencia = 0;
  terminos.forEach((t, idx) => {
    const kw = pots[idx] || 0;
    const imp = kw * dias * (t.anyo / 365);
    potencia += imp;
    if (kw > 0) lineas.push({ concepto: `Potencia ${t.p}`, detalle: `${kw} kW × ${dias} d × ${es6(t.anyo / 365)} €/kW·día`, importe: imp, origen: 'oferta' });
  });

  // ── Energía
  let energia = 0;
  let precioInfo = {};
  const totalKwh = sum(kwh);
  if (p.modalidades) {
    const tr = seleccionarTramoOpen(p, pots, !!i.forzarElegibilidad);
    avisos.push(...tr.avisos);
    if (tr.idx === -1) { motivos.push(...tr.motivos); return res(ESTADO.NO_ELEGIBLE, { superaLimite: !!tr.superaLimite }); }
    const mIdx = p.modalidades.findIndex(m => m.id === i.modalidadId);
    if (mIdx === -1) { motivos.push('Modalidad Open desconocida.'); return res(ESTADO.DATOS_INSUFICIENTES); }
    const modalidad = p.modalidades[mIdx];
    const pOpen = p.matrix[tr.idx][mIdx];
    const pNo = modalidad.id === 'plana' ? pOpen : p.horasNoOpen[tr.idx];
    const rep = repartirOpen({ modalidad, kwhPeriodo: kwh, desgloseP6: i.desgloseP6, curva: i.curva, periodo: i.periodo });
    if (!rep.ok) { motivos.push(rep.motivo); return res(ESTADO.DATOS_INSUFICIENTES, { tramo: p.tramos[tr.idx].label }); }
    avisos.push(...rep.avisos);
    const eOpen = rep.kOpen * pOpen, eNo = rep.kNo * pNo;
    energia = eOpen + eNo;
    lineas.push({ concepto: `Energía horas Open (${modalidad.label})`, detalle: `${esN(rep.kOpen)} kWh × ${es6(pOpen)} €/kWh`, importe: eOpen, origen: 'oferta' });
    if (rep.kNo > 0 || modalidad.id !== 'plana') {
      lineas.push({ concepto: 'Energía horas No Open', detalle: `${esN(rep.kNo)} kWh × ${es6(pNo)} €/kWh`, importe: eNo, origen: 'oferta' });
    }
    precioInfo = { tramo: p.tramos[tr.idx].label, modalidad: modalidad.label, precioOpen: pOpen, precioNoOpen: pNo, kwhOpen: rep.kOpen, kwhNoOpen: rep.kNo, metodoReparto: rep.metodo };
  } else if (p.energiaUnica != null || p.id === 'tempo') {
    const precio = p.energiaUnica ?? p.energia.promo;
    energia = totalKwh * precio;
    lineas.push({ concepto: 'Energía (precio único 24 h)', detalle: `${esN(totalKwh)} kWh × ${es6(precio)} €/kWh`, importe: energia, origen: 'oferta' });
    precioInfo = { precioUnico: precio };
    if (p.id === 'tempo') avisos.push(`Precio de energía del primer año (incluye ${p.descuento}% de descuento). A partir del segundo año aplica el precio base ${p.energia.base.toFixed(6)} €/kWh.`);
  } else if (p.energiaPeriodos) {
    p.energiaPeriodos.forEach((pr, idx) => {
      if (!kwh[idx]) return;
      const imp = kwh[idx] * pr;
      energia += imp;
      lineas.push({ concepto: `Energía P${idx + 1}`, detalle: `${kwh[idx]} kWh × ${es6(pr)} €/kWh`, importe: imp, origen: 'oferta' });
    });
  } else if (p.energiaA) {
    const omie = Number(i.omie);
    if (!(omie >= 0) || i.omie === '' || i.omie == null) { motivos.push('Falta el precio OMIE del periodo.'); return res(ESTADO.DATOS_INSUFICIENTES); }
    Object.keys(p.energiaA).forEach((k, idx) => {
      if (!kwh[idx]) return;
      const pr = p.energiaA[k] + p.energiaB[k] * omie;
      const imp = kwh[idx] * pr;
      energia += imp;
      lineas.push({ concepto: `Energía ${k.toUpperCase()} (A + B × OMIE)`, detalle: `${kwh[idx]} kWh × ${es6(pr)} €/kWh`, importe: imp, origen: 'oferta' });
    });
    avisos.push('Indexada: el precio depende del OMIE real de cada hora/mes; el valor introducido es una hipótesis.');
  }

  // ── Excedentes (autoconsumo): deducidos hasta el importe de la energía del periodo
  let excedentes = 0;
  if (p.excedentes && Number(i.excedentesKwh) > 0) {
    const bruto = Number(i.excedentesKwh) * p.excedentes;
    excedentes = Math.min(bruto, energia);
    lineas.push({ concepto: 'Compensación de excedentes', detalle: `${i.excedentesKwh} kWh × ${es6(p.excedentes)} €/kWh${bruto > energia ? ' (limitado al importe de la energía)' : ''}`, importe: -excedentes, origen: 'oferta' });
  }

  // ── Conceptos mantenidos de la factura actual
  const m = i.mantenidos || {};
  const excesos = Number(m.excesos) || 0, reactiva = Number(m.reactiva) || 0;
  const bono = Number(m.bonoSocial) || 0, alquiler = Number(m.alquiler) || 0;
  const mant = [['Excesos de potencia', excesos], ['Energía reactiva', reactiva], ['Financiación bono social', bono]];
  mant.forEach(([c, v]) => { if (v) lineas.push({ concepto: c, detalle: 'Mantenido de la factura actual (no recalculado)', importe: v, origen: 'factura_actual' }); });

  const ieRate = i.ieRate ?? IE_RATE;
  const baseIE = potencia + energia - excedentes + excesos + reactiva + bono;
  const ie = baseIE * ieRate;
  lineas.push({ concepto: 'Impuesto sobre la electricidad', detalle: `${es(ieRate * 100, 8)} % s/ ${esN(baseIE)} €`, importe: ie, origen: 'oferta' });
  if (alquiler) lineas.push({ concepto: 'Alquiler equipos de medida', detalle: 'Mantenido de la factura actual (no recalculado)', importe: alquiler, origen: 'factura_actual' });
  const baseIVA = baseIE + ie + alquiler;
  const ivaRate = Number(i.ivaRate ?? 0.21);
  const iva = baseIVA * ivaRate;
  lineas.push({ concepto: `IVA ${(ivaRate * 100).toFixed(0)} %`, detalle: `s/ ${esN(baseIVA)} €`, importe: iva, origen: 'oferta' });
  const total = baseIVA + iva;

  return res(ESTADO.OK, { lineas, potencia, energia, excedentes, baseIE, ie, baseIVA, iva, total, ...precioInfo });
}

/* ══════════════════════════ Gas ══════════════════════════ */

/**
 * @param {object} i  producto (GAS / GAS_EMPRESA), kwh, dias, mantenimiento (bool),
 *   descuentoExtra (0..1, solo si el comercial lo documenta), alquiler (€ mantenido),
 *   ivaRate, consumoAnualKwh (para elegibilidad), fechaOferta, ignorarVigencia
 */
export function calcularOfertaGas(i) {
  const p = i.producto;
  const motivos = [], avisos = [];
  const res = (estado, extra = {}) => ({ estado, motivos, avisos, producto: p.title, ...extra });
  const est = estadoVigencia(p.contratacion, i.fechaOferta);
  if (est !== 'vigente') {
    if (!i.ignorarVigencia) { motivos.push(ETIQUETA_ESTADO[est]); return res(ESTADO.NO_DISPONIBLE); }
    avisos.push(`Simulación con oferta no contratable hoy (${ETIQUETA_ESTADO[est]}).`);
  }
  const kwh = Number(i.kwh) || 0, dias = Number(i.dias) || 0;
  if (kwh <= 0 || dias <= 0) { motivos.push('Faltan consumo (kWh) o días facturados.'); return res(ESTADO.DATOS_INSUFICIENTES); }

  const anual = Number(i.consumoAnualKwh) || 0;
  if (anual > 0 && p.consumoMax != null) {
    const dentro = anual > p.consumoMin && anual <= p.consumoMax || (p.consumoMin === 0 && anual <= p.consumoMax);
    if (!dentro) { motivos.push(`Consumo anual ${anual} kWh fuera del tramo ${p.consumo}.`); return res(ESTADO.NO_ELEGIBLE); }
  } else if (p.esEmpresa) {
    avisos.push('Sin consumo anual: no se ha verificado el tramo RL. El grupo tarifario lo asigna la distribuidora.');
  }

  const precio = (i.mantenimiento && p.hasMant ? p.conMant.promo : p.sinMant.promo) * (1 - (Number(i.descuentoExtra) || 0));
  const fijo = p.terFijo * 12 / 365 * dias;
  const variable = kwh * precio;
  const ieh = kwh * IEH_GAS_EUR_KWH;
  const alquiler = Number(i.alquiler) || 0;
  const baseIVA = fijo + variable + ieh + alquiler;
  const ivaRate = Number(i.ivaRate ?? 0.21);
  const iva = baseIVA * ivaRate;
  const lineas = [
    { concepto: 'Término fijo', detalle: `${p.terFijo} €/mes × 12/365 × ${dias} d`, importe: fijo, origen: 'oferta' },
    { concepto: 'Término variable', detalle: `${kwh} kWh × ${es6(precio)} €/kWh`, importe: variable, origen: 'oferta' },
    { concepto: 'Impuesto de hidrocarburos', detalle: `${kwh} kWh × ${IEH_GAS_EUR_KWH} €/kWh`, importe: ieh, origen: 'oferta' },
  ];
  if (alquiler) lineas.push({ concepto: 'Alquiler contador', detalle: 'Mantenido de la factura actual (no recalculado)', importe: alquiler, origen: 'factura_actual' });
  lineas.push({ concepto: `IVA ${(ivaRate * 100).toFixed(0)} %`, detalle: `s/ ${esN(baseIVA)} €`, importe: iva, origen: 'oferta' });
  return res(ESTADO.OK, { lineas, fijo, variable, ieh, baseIVA, iva, total: baseIVA + iva, precio });
}

/* ══════════════════════════ Ahorro ══════════════════════════ */

/**
 * ahorro € = coste actual comparable − coste ofertado comparable
 * ahorro % = ahorro € / coste actual comparable × 100   (null si el coste actual ≤ 0)
 * Puede ser negativo: no se fuerza ahorro.
 */
export function calcularAhorro(costeActual, costeOferta) {
  const a = Number(costeActual), o = Number(costeOferta);
  if (!isFinite(a) || !isFinite(o)) return { ahorroEur: null, ahorroPct: null };
  const ahorroEur = a - o;
  return { ahorroEur, ahorroPct: a > 0 ? (ahorroEur / a) * 100 : null };
}

/** Extrapolación lineal a 365 días. SIEMPRE se presenta como extrapolación, no como ahorro anual. */
export function extrapolarAnual(ahorroEur, dias) {
  if (!(dias > 0) || ahorroEur == null) return null;
  return (ahorroEur / dias) * 365;
}
