/**
 * Reglas de coherencia por tipo de factura (luz 3.0TD/6.1TD, luz 2.0TD y gas).
 *
 * - `duras`: contradicciones demostrables (normativa, aritmética, límites del peaje).
 *   Sirven para elegir entre lecturas y, si no se resuelven, bloquean el informe.
 *   Las marcadas `toleraDocumental` solo avisan cuando la factura imprime esos datos
 *   literalmente y sin ambigüedad: no se bloquea por algo que el documento afirma.
 *   `{ documental: false }` = datos editados a mano: se omiten las reglas que comparan
 *   con importes de la factura (las simulaciones son legítimas).
 * - `blandas`: encaje económico y físico con el resto de la factura. Solo ordenan las
 *   lecturas posibles y generan avisos; NUNCA bloquean (importes o potencias elevados
 *   pueden ser legítimos).
 */

import { leerNumero, formatoES, inequivoco } from './numeros.js';
import { diasInclusivos } from './calendario.js';
import { OPEN_30TD, OPEN_61TD } from '../../data/tarifasB2B.js';
import { GAS, GAS_EMPRESA } from '../../data/tarifasGas.js';

const num = (v) => leerNumero(v).valor;
const kw = inequivoco;
const log10 = Math.log10;
/** Distancia (en órdenes de magnitud) de x al intervalo [a, b]; 0 si está dentro. */
const fuera = (x, a, b) => (x > 0 ? Math.max(0, log10(a / x), log10(x / b)) : 0);
const P = [1, 2, 3, 4, 5, 6];

/* ══════════════════════════ Luz 3.0TD / 6.1TD ══════════════════════════ */

export const LUZ_B2B = {
  id: 'luzB2B',
  contexto(ex = {}) {
    const imp = ex.importes || {};
    const tarifa = ex.tarifaAcceso || null;
    const tabla = (tarifa === '6.1TD' ? OPEN_61TD : OPEN_30TD).potenciaTerminos;
    const desde = ex.periodoConsumo?.desde, hasta = ex.periodoConsumo?.hasta;
    return {
      tarifa,
      consumoTotal: num(ex.consumoTotalKwh),
      importePotencia: num(imp.potencia),
      importeEnergia: num(imp.energiaTotal ?? imp.energia),
      maximetros: P.map((_, i) => num(ex.maximetrosKw?.[i])),
      refPotDia: tabla.map(t => t.anyo / 365),
      diasPeriodo: desde && hasta ? diasInclusivos(desde, hasta) : null,
    };
  },
  campos(ex = {}) {
    const tx = ex.textos || {};
    const dias = num(ex.diasFacturados);
    return [
      ...P.map((p, i) => ({ clave: `pot${p}`, nombre: `Potencia P${p}`, descripcion: `potencia contratada del periodo P${p} en kW`, valorIA: num(ex.potenciaContratadaKw?.[i]), textoIA: tx.potenciaContratadaKw?.[i] })),
      ...P.map((p, i) => ({ clave: `kwh${p}`, nombre: `Consumo P${p}`, descripcion: `kWh de energía activa facturados en el periodo P${p}`, valorIA: num(ex.consumoFacturadoKwh?.[i]), textoIA: tx.consumoFacturadoKwh?.[i] })),
      { clave: 'dias', nombre: 'Días facturados', descripcion: 'número de días facturados', valorIA: dias, textoIA: tx.diasFacturados },
      { clave: 'total', nombre: 'Total factura', descripcion: 'importe TOTAL de la factura con impuestos, en euros', valorIA: num(ex.importes?.total), textoIA: tx.total },
    ];
  },
  duras(v, ctx = {}, { documental = true } = {}) {
    const out = [];
    const pots = P.map(p => v[`pot${p}`]);
    if (ctx.tarifa !== '2.0TD') {
      // Circular CNMC 3/2020: en 3.0TD y 6.1TD la potencia de cada periodo es ≥ la del anterior.
      for (let i = 0; i < 5; i++) {
        const a = pots[i], b = pots[i + 1];
        if (a != null && b != null && b < a - 1e-9) {
          out.push({ campos: [`pot${i + 1}`, `pot${i + 2}`], toleraDocumental: true, msg: `Las potencias contratadas deben ir de menor a mayor de P1 a P6 (normativa 3.0TD/6.1TD), pero P${i + 1} = ${kw(a)} kW es mayor que P${i + 2} = ${kw(b)} kW.` });
        }
      }
    }
    const conPot = pots.filter(x => x != null);
    if (ctx.tarifa === '3.0TD' && conPot.length === 6 && conPot.every(x => x <= 15)) {
      out.push({ campos: P.map(p => `pot${p}`), toleraDocumental: true, msg: 'El peaje 3.0TD exige más de 15 kW en algún periodo y todas las potencias son ≤ 15 kW.' });
    }
    for (const p of P) {
      if (pots[p - 1] != null && pots[p - 1] <= 0 && ctx.tarifa !== '2.0TD') out.push({ campos: [`pot${p}`], msg: `La potencia P${p} debe ser mayor que 0 kW.` });
      if (v[`kwh${p}`] != null && v[`kwh${p}`] < 0) out.push({ campos: [`kwh${p}`], msg: `El consumo de P${p} no puede ser negativo.` });
    }
    if (v.dias != null && !(v.dias >= 1 && v.dias <= 400)) out.push({ campos: ['dias'], msg: `${formatoES(v.dias)} días facturados no es un periodo de facturación válido.` });
    if (v.total != null && v.total <= 0) out.push({ campos: ['total'], msg: 'El total de la factura debe ser mayor que 0 €.' });
    if (documental && ctx.consumoTotal != null) {
      const k = P.map(p => v[`kwh${p}`]);
      if (k.every(x => x != null)) {
        const s = k.reduce((a, b) => a + b, 0);
        if (Math.abs(s - ctx.consumoTotal) > Math.max(1, ctx.consumoTotal * 0.005)) {
          out.push({ campos: P.map(p => `kwh${p}`), toleraDocumental: true, msg: `La suma del consumo por periodos (${inequivoco(s)} kWh) no coincide con el total impreso (${inequivoco(ctx.consumoTotal)} kWh).` });
        }
      }
    }
    return out;
  },
  _blandas(v, ctx = {}) {
    const r = [];
    const pots = P.map(p => v[`pot${p}`]);
    const kwh = P.map(p => v[`kwh${p}`] ?? 0);
    const sumK = kwh.reduce((a, b) => a + b, 0);
    if (ctx.importePotencia > 0 && v.dias > 0 && pots.every(x => x > 0)) {
      const ref = pots.reduce((a, x, i) => a + x * v.dias * ctx.refPotDia[i], 0);
      const d = fuera(ctx.importePotencia / ref, 0.25, 4);
      if (d) r.push({ pen: d, campos: P.map(p => `pot${p}`), msg: `El término de potencia impreso (${formatoES(ctx.importePotencia, 2)} €) no encaja con las potencias contratadas (con precios de mercado saldrían unos ${formatoES(ref, 2)} €).` });
    }
    pots.forEach((x, i) => {
      const m = ctx.maximetros?.[i];
      if (m > 0 && x > 0) {
        const d = fuera(m / x, 1 / 20, 20);
        if (d) r.push({ pen: d / 2, campos: [`pot${i + 1}`], msg: `El maxímetro de P${i + 1} (${kw(m)} kW) está muy lejos de su potencia contratada (${kw(x)} kW).` });
      }
    });
    const pMax = Math.max(0, ...pots.filter(x => x > 0));
    if (pMax > 0 && v.dias > 0) {
      const tope = pMax * 24 * v.dias * 1.5;
      if (sumK > tope) r.push({ pen: log10(sumK / tope) + 0.5, campos: P.map(p => `kwh${p}`), msg: `El consumo (${inequivoco(sumK)} kWh) supera lo que permiten las potencias contratadas en ${formatoES(v.dias)} días.` });
    }
    if (ctx.importeEnergia > 0 && sumK > 0) {
      const d = fuera(ctx.importeEnergia / sumK, 0.03, 1.5);
      if (d) r.push({ pen: d, campos: P.map(p => `kwh${p}`), msg: `El precio medio de la energía que resulta (${formatoES(ctx.importeEnergia / sumK, 4)} €/kWh) no es realista.` });
    }
    return r;
  },
  blandas(v, ctx) { return this._blandas(v, ctx).reduce((a, x) => a + x.pen, 0); },
  avisosBlandos(v, ctx) { return this._blandas(v, ctx).map(({ campos, msg }) => ({ campos, msg })); },
  ausentes(v, ctx = {}, campos = {}) {
    const out = [];
    if (v.dias == null && ctx.diasPeriodo != null) {
      v.dias = ctx.diasPeriodo;
      out.push({ nivel: 'info', campos: ['dias'], msg: `Días facturados calculados con las fechas del periodo (${ctx.diasPeriodo}).` });
    }
    const faltanPot = P.filter(p => v[`pot${p}`] == null);
    if (faltanPot.length && ctx.tarifa !== '2.0TD') out.push({ nivel: 'bloqueo', campos: faltanPot.map(p => `pot${p}`), msg: `No se ha podido leer la potencia contratada de ${faltanPot.map(p => 'P' + p).join(', ')}; sin todas las potencias no se puede calcular el término de potencia ni el tramo (Pc = máx P1–P6).` });
    const faltanK = P.filter(p => v[`kwh${p}`] == null);
    if (faltanK.length) {
      const resto = P.filter(p => v[`kwh${p}`] != null).reduce((a, p) => a + v[`kwh${p}`], 0);
      if (ctx.consumoTotal != null && Math.abs(resto - ctx.consumoTotal) <= Math.max(1, ctx.consumoTotal * 0.005)) {
        faltanK.forEach(p => { v[`kwh${p}`] = 0; });
        out.push({ nivel: 'info', campos: faltanK.map(p => `kwh${p}`), msg: `Consumo de ${faltanK.map(p => 'P' + p).join(', ')} = 0 kWh: el resto de periodos ya suma el total impreso (${inequivoco(ctx.consumoTotal)} kWh).` });
      } else {
        out.push({ nivel: 'bloqueo', campos: faltanK.map(p => `kwh${p}`), msg: `No se ha podido leer el consumo de ${faltanK.map(p => 'P' + p).join(', ')}.` });
      }
    }
    if (v.dias == null) out.push({ nivel: 'bloqueo', campos: ['dias'], msg: 'No se han podido leer los días facturados.' });
    if (v.total == null) out.push({ nivel: 'bloqueo', campos: ['total'], msg: 'No se ha podido leer el total de la factura.' });
    return out;
  },
};

/* ══════════════════════════ Luz 2.0TD ══════════════════════════ */

export const LUZ_20 = {
  id: 'luz20',
  contexto(ex = {}) { return { iva: num(ex.tipoIVA) }; },
  campos(ex = {}) {
    const tx = ex.textosLiterales || {};
    const cero = (x) => (x === 0 ? null : x); // el prompt de 2.0 devuelve 0 cuando no encuentra el dato
    return [
      { clave: 'kwPunta', nombre: 'Potencia punta', descripcion: 'potencia contratada punta-llano (P1) en kW', valorIA: cero(num(ex.kwPotenciaPunta)), textoIA: tx.kwPotenciaPunta },
      { clave: 'kwValle', nombre: 'Potencia valle', descripcion: 'potencia contratada valle (P2/P3) en kW', valorIA: cero(num(ex.kwPotenciaValle)), textoIA: tx.kwPotenciaValle },
      { clave: 'kwh', nombre: 'Consumo', descripcion: 'kWh totales consumidos de la red en el periodo', valorIA: num(ex.totalKwhFacturados), textoIA: tx.totalKwhFacturados },
      { clave: 'dias', nombre: 'Días facturados', descripcion: 'número de días del periodo de facturación', valorIA: cero(num(ex.diasFacturacion)), textoIA: tx.diasFacturacion },
      { clave: 'total', nombre: 'Total factura', descripcion: 'importe TOTAL de la factura con impuestos, en euros', valorIA: cero(num(ex.importeTotalFacturaActual)), textoIA: tx.importeTotalFacturaActual },
    ];
  },
  duras(v) {
    const out = [];
    for (const [k, n] of [['kwPunta', 'punta'], ['kwValle', 'valle']]) {
      if (v[k] != null && v[k] > 15) out.push({ campos: [k], msg: `La potencia ${n} (${kw(v[k])} kW) supera los 15 kW del peaje 2.0TD: usa la comparativa 3.0 / 6.1.` });
      if (v[k] != null && v[k] <= 0) out.push({ campos: [k], msg: `La potencia ${n} debe ser mayor que 0 kW.` });
    }
    if (v.kwh != null && v.kwh < 0) out.push({ campos: ['kwh'], msg: 'El consumo no puede ser negativo.' });
    if (v.dias != null && !(v.dias >= 1 && v.dias <= 400)) out.push({ campos: ['dias'], msg: `${formatoES(v.dias)} días facturados no es un periodo de facturación válido.` });
    if (v.total != null && v.total <= 0) out.push({ campos: ['total'], msg: 'El total de la factura debe ser mayor que 0 €.' });
    return out;
  },
  _blandas(v) {
    const r = [];
    if (v.kwPunta > 0 && v.dias > 0 && v.kwh > 0) {
      const tope = Math.max(v.kwPunta, v.kwValle || 0) * 24 * v.dias * 1.2;
      if (v.kwh > tope) r.push({ pen: log10(v.kwh / tope) + 0.5, campos: ['kwh'], msg: `El consumo (${inequivoco(v.kwh)} kWh) supera lo que permite la potencia contratada en ${formatoES(v.dias)} días.` });
    }
    if (v.total > 0 && v.kwh > 0) {
      const d = fuera(v.total / v.kwh, 0.05, 5);
      if (d) r.push({ pen: d, campos: ['kwh', 'total'], msg: `El coste por kWh que resulta (${formatoES(v.total / v.kwh, 3)} €/kWh) no es realista.` });
    }
    return r;
  },
  blandas(v) { return this._blandas(v).reduce((a, x) => a + x.pen, 0); },
  avisosBlandos(v) { return this._blandas(v).map(({ campos, msg }) => ({ campos, msg })); },
  ausentes(v) {
    const out = [];
    if (v.kwValle == null && v.kwPunta != null) {
      // Criterio existente: sin potencia valle impresa, se usa la de punta.
      v.kwValle = v.kwPunta;
      out.push({ nivel: 'info', campos: ['kwValle'], msg: 'La factura no muestra potencia valle distinta: se usa la potencia punta.' });
    }
    if (v.kwPunta == null) out.push({ nivel: 'bloqueo', campos: ['kwPunta'], msg: 'No se ha podido leer la potencia contratada.' });
    if (v.kwh == null) out.push({ nivel: 'bloqueo', campos: ['kwh'], msg: 'No se ha podido leer el consumo.' });
    if (v.dias == null) out.push({ nivel: 'bloqueo', campos: ['dias'], msg: 'No se han podido leer los días facturados.' });
    if (v.total == null) out.push({ nivel: 'bloqueo', campos: ['total'], msg: 'No se ha podido leer el total de la factura.' });
    return out;
  },
};

/* ══════════════════════════ Gas ══════════════════════════ */

const GAS_TODAS = [...GAS, ...GAS_EMPRESA];

export const GAS_ESQ = {
  id: 'gas',
  contexto(ex = {}) {
    const rl = String(ex.tarifaRL || '').toLowerCase().replace(/[\s.]/g, '').replace(/^(\d)$/, 'rl$1');
    const t = GAS_TODAS.find(g => rl.includes(g.id));
    return { iva: num(ex.tipoIVA), alquiler: num(ex.costeAlquilerContador) || 0, tramo: t ? { min: t.consumoMin, max: t.consumoMax, title: t.title } : null };
  },
  campos(ex = {}) {
    const tx = ex.textosLiterales || {};
    const cero = (x) => (x === 0 ? null : x);
    return [
      { clave: 'kwh', nombre: 'Consumo de gas', descripcion: 'kWh de gas consumidos en el periodo', valorIA: num(ex.totalKwhGas), textoIA: tx.totalKwhGas },
      { clave: 'dias', nombre: 'Días facturados', descripcion: 'número de días del periodo de facturación', valorIA: cero(num(ex.diasFacturacion)), textoIA: tx.diasFacturacion },
      { clave: 'total', nombre: 'Total factura', descripcion: 'importe TOTAL de la factura con impuestos, en euros', valorIA: cero(num(ex.importeTotalFactura)), textoIA: tx.importeTotalFactura },
      { clave: 'fijo', nombre: 'Término fijo', descripcion: 'importe en euros del término fijo del periodo', valorIA: num(ex.costeTerminoFijo), textoIA: tx.costeTerminoFijo },
    ];
  },
  duras(v) {
    const out = [];
    if (v.kwh != null && v.kwh < 0) out.push({ campos: ['kwh'], msg: 'El consumo de gas no puede ser negativo.' });
    if (v.dias != null && !(v.dias >= 1 && v.dias <= 400)) out.push({ campos: ['dias'], msg: `${formatoES(v.dias)} días facturados no es un periodo de facturación válido.` });
    if (v.total != null && v.total <= 0) out.push({ campos: ['total'], msg: 'El total de la factura debe ser mayor que 0 €.' });
    if (v.fijo != null && v.fijo < 0) out.push({ campos: ['fijo'], msg: 'El término fijo no puede ser negativo.' });
    if (v.fijo != null && v.total > 0 && v.fijo > v.total) out.push({ campos: ['fijo', 'total'], msg: `El término fijo (${formatoES(v.fijo, 2)} €) no puede superar el total de la factura (${formatoES(v.total, 2)} €).` });
    return out;
  },
  _blandas(v, ctx = {}) {
    const r = [];
    if (v.kwh > 0 && v.total > 0) {
      const iva = ctx.iva > 0 && ctx.iva < 1 ? ctx.iva : 0.21;
      const variable = v.total / (1 + iva) - (v.fijo || 0) - (ctx.alquiler || 0);
      const d = variable > 0 ? fuera(variable / v.kwh, 0.02, 0.6) : 1;
      if (d) r.push({ pen: d, campos: ['kwh', 'total', 'fijo'], msg: `El precio del término variable que resulta (${variable > 0 ? formatoES(variable / v.kwh, 4) : '≤ 0'} €/kWh) no es realista.` });
    }
    if (ctx.tramo && v.kwh > 0 && v.dias > 0) {
      const anual = v.kwh / v.dias * 365;
      const d = fuera(anual, Math.max(1, ctx.tramo.min / 3), ctx.tramo.max * 3);
      if (d) r.push({ pen: d, campos: ['kwh'], msg: `El consumo anual estimado (${inequivoco(Math.round(anual))} kWh) no corresponde al tramo ${ctx.tramo.title} que indica la factura.` });
    }
    return r;
  },
  blandas(v, ctx) { return this._blandas(v, ctx).reduce((a, x) => a + x.pen, 0); },
  avisosBlandos(v, ctx) { return this._blandas(v, ctx).map(({ campos, msg }) => ({ campos, msg })); },
  ausentes(v) {
    const out = [];
    if (v.kwh == null) out.push({ nivel: 'bloqueo', campos: ['kwh'], msg: 'No se ha podido leer el consumo de gas.' });
    if (v.dias == null) out.push({ nivel: 'bloqueo', campos: ['dias'], msg: 'No se han podido leer los días facturados.' });
    if (v.total == null) out.push({ nivel: 'bloqueo', campos: ['total'], msg: 'No se ha podido leer el total de la factura.' });
    if (v.fijo == null) { v.fijo = 0; out.push({ nivel: 'info', campos: ['fijo'], msg: 'La factura no muestra término fijo separado: se toma 0 €.' }); }
    return out;
  },
};
