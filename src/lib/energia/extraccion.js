/**
 * Extracción de facturas eléctricas con Gemini + normalización y validación
 * deterministas.
 *
 * Reparto de responsabilidades:
 *   - Gemini transcribe lo que está IMPRESO (valores y unidades tal cual).
 *   - Este módulo convierte unidades (c€→€, W→kW, €/kW·año→€/kW·día…), comprueba
 *     sumas y coherencia, y detecta discrepancias. Nunca "corrige" en silencio:
 *     cada ajuste o conflicto se devuelve como incidencia.
 * No es un entrenamiento del modelo: solo prompt + esquema + validaciones.
 */

import { diasInclusivos } from './calendario.js';

export const IE_RATE_REF = 5.11269632; // % impreso habitualmente

export const PROMPT_EXTRACCION_LUZ = `Eres un transcriptor de facturas eléctricas españolas. Tu única tarea es COPIAR datos impresos en el documento a un JSON. No calcules, no redondees, no deduzcas valores que no estén impresos, no conviertas unidades.

Devuelve EXCLUSIVAMENTE un objeto JSON válido (sin markdown) con esta forma:

{
  "comercializadora": texto o null,
  "titular": texto o null,
  "cups": texto sin espacios o null,
  "tarifaAcceso": "2.0TD" | "3.0TD" | "6.1TD" | null,
  "fechaEmision": "AAAA-MM-DD" o null,
  "periodoConsumo": { "desde": "AAAA-MM-DD" o null, "hasta": "AAAA-MM-DD" o null },
  "diasFacturados": entero impreso o null,
  "potenciaContratadaKw": [P1, P2, P3, P4, P5, P6]  (número o null por periodo; 2.0TD: [P1, P2, null, null, null, null]),
  "consumoFacturadoKwh": [P1, P2, P3, P4, P5, P6]  (kWh FACTURADOS de energía activa por periodo; 0 si está impreso 0; null si ese periodo no aparece),
  "consumoTotalKwh": número impreso o null,
  "lecturas": [ { "periodo": "P1", "anterior": número, "actual": número, "fechaAnterior": "AAAA-MM-DD" o null, "fechaActual": "AAAA-MM-DD" o null } ],
  "maximetros": [ { "periodo": "P1", "valor": número tal cual impreso, "unidad": "kW" | "W" | null } ],
  "maximetrosAnoMovil": [ { "periodo": "P1", "valor": número, "unidad": "kW" | "W" | null } ],
  "energiaLineas": [ { "componente": "energia" | "peajes" | "cargos" | "acceso" | "otro", "periodo": "P1", "kwh": número, "precio": número, "unidadPrecio": "€/kWh" | "c€/kWh", "importe": número } ],
  "potenciaLineas": [ { "componente": "potencia" | "peajes" | "cargos", "periodo": "P1", "kw": número, "dias": número, "precio": número, "unidadPrecio": "€/kW día" | "c€/kW día" | "€/kW año" | "€/kW mes", "importe": número } ],
  "importes": {
    "potencia": número o null,
    "energiaTotal": número o null,
    "excesosPotencia": número o null,
    "reactiva": número o null,
    "bonoSocial": número o null,
    "alquilerEquipos": número o null,
    "otrosServicios": número o null,
    "baseImpuestoElectrico": número o null,
    "tipoImpuestoElectricoPct": número o null,
    "impuestoElectrico": número o null,
    "baseIVA": número o null,
    "tipoIVAPct": número o null,
    "iva": número o null,
    "total": número o null
  },
  "reactivaKvarh": [P1..P6] o null,
  "autoconsumo": { "kwhExcedentes": número o null, "compensacion": número o null },
  "descuentosInformativos": [ { "texto": texto, "importe": número } ],
  "paginas": { "resumen": entero o null, "detalle": entero o null, "lecturas": entero o null },
  "notas": [ texto ]
}

REGLAS
1. FECHAS. Distingue: fecha de emisión (cuando se emite la factura), periodo de consumo (desde–hasta del consumo facturado) y el nombre del archivo, que NO es un dato. Usa las fechas del "periodo de facturación"/"periodo de consumo". Formato ISO AAAA-MM-DD. Ejemplo: "Periodo 01/07/2025 a 31/07/2025, fecha factura 18/08/2025" → desde 2025-07-01, hasta 2025-07-31, emisión 2025-08-18.
2. NÚMEROS. Formato español: "27.263" = 27263; "0,121637" = 0.121637; "3.316,19" = 3316.19. Devuelve números JSON.
3. UNIDADES. Copia la unidad impresa. Si el precio figura en c€/kWh o c€/día, escribe el número tal cual y unidadPrecio "c€/…". NO lo conviertas.
4. CONSUMO FACTURADO ≠ LECTURAS. consumoFacturadoKwh es lo que se cobra en el detalle de energía (o la fila "Consumo en el periodo"). Las lecturas del contador van en "lecturas" aunque su diferencia no coincida con lo facturado. No sustituyas uno por otro.
5. AUSENTE ≠ CERO. Si un periodo aparece con 0 kWh, pon 0. Si no aparece en ningún sitio, pon null.
6. ENERGÍA DESGLOSADA. Si la energía aparece separada (energía/OMIE, peajes, cargos, término de acceso), añade UNA línea por componente y periodo en "energiaLineas". importes.energiaTotal es un total de energía IMPRESO que incluya todos los componentes; si la factura no imprime ese total único, pon null (NO sumes tú). Nunca tomes solo el componente OMIE como coste total de la energía.
7. MAXÍMETROS. "maximetros" = potencia máxima demandada EN ESTE PERIODO de facturación. Los máximos del "año móvil"/"últimos 12 meses" van SOLO en "maximetrosAnoMovil". Copia el valor y la unidad; si la tabla muestra 53.000,00 sin unidad o con W, escribe 53000 y la unidad impresa (o null).
8. IMPUESTOS. tipoImpuestoElectricoPct y tipoIVAPct son PORCENTAJES impresos (5,11269632 → 5.11269632; 21 → 21). No confundas el importe en € con el tipo.
9. DESCUENTOS INFORMATIVOS. Notas del tipo "Descuento asociado al ahorro de cargos … -677,38 €" van en descuentosInformativos. No los restes de ningún importe.
10. DÍAS. diasFacturados es el número de días impreso (p. ej. "31 días" en el término de potencia o "Días facturados: 31"). Si aparece en las líneas de potencia, cópialo.
11. CONSUMO. consumoFacturadoKwh SIEMPRE se rellena con los kWh de las líneas de energía por periodo (P1..P6), aunque vengan en tablas de "Término Energía" o "Energía activa".
12. POTENCIA. Incluye en potenciaLineas TODAS las líneas de potencia (peajes, cargos y término de potencia). importes.potencia es la suma de todas ellas.
13. Sé breve: nada de texto fuera del JSON.`;

/* ══════════════════════════ Normalización ══════════════════════════ */

const PER = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).trim();
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return isFinite(n) ? n : null;
};
const cerca = (a, b, tolAbs = 0.02, tolRel = 0) => Math.abs(a - b) <= Math.max(tolAbs, Math.abs(b) * tolRel);

/** Convierte un precio impreso a €/kWh o €/kW·día. */
export function precioAEuros(precio, unidad) {
  if (precio == null) return null;
  const u = String(unidad || '').toLowerCase().replace(/\s+/g, ' ');
  let v = Number(precio);
  if (u.startsWith('c€') || u.startsWith('cent')) v = v / 100;
  if (u.includes('año')) v = v / 365;           // €/kW año → €/kW día
  if (u.includes('mes')) v = v * 12 / 365;      // €/kW mes → €/kW día
  return v;
}

/** kW a partir de un maxímetro impreso (W → kW). Si no hay unidad y el valor es ≥ 1000 veces la potencia contratada, se marca como probable W. */
export function maximetroKw(m, potenciaRefKw) {
  const v = num(m?.valor);
  if (v == null) return { kw: null };
  const u = (m.unidad || '').toUpperCase();
  if (u === 'W') return { kw: v / 1000, convertido: true };
  if (u === 'KW') return { kw: v };
  if (potenciaRefKw && v > potenciaRefKw * 100) return { kw: v / 1000, convertido: true, supuesto: true };
  return { kw: v };
}

/**
 * Valida una extracción. Devuelve { datos normalizados, incidencias[] }.
 * incidencia: { nivel: 'error'|'aviso'|'info', campo, mensaje }
 */
export function validarExtraccion(ex) {
  const inc = [];
  const add = (nivel, campo, mensaje) => inc.push({ nivel, campo, mensaje });
  const e = ex || {};
  const imp = e.importes || {};

  // ── Tarifa y periodos
  const tarifa = e.tarifaAcceso || null;
  if (!tarifa) add('error', 'tarifaAcceso', 'No se ha identificado la tarifa de acceso.');
  let kwh = PER.map((_, i) => num(e.consumoFacturadoKwh?.[i]));
  // Si el modelo no rellenó el consumo, se toma de las líneas de energía (un único componente por periodo).
  if (kwh.every(v => v == null) && Array.isArray(e.energiaLineas) && e.energiaLineas.length) {
    kwh = PER.map(p => {
      const l = e.energiaLineas.find(x => String(x.periodo).toUpperCase() === p && num(x.kwh) != null);
      return l ? num(l.kwh) : 0;
    });
    inc.push({ nivel: 'info', campo: 'consumoFacturadoKwh', mensaje: 'Consumo por periodo tomado de las líneas de energía de la factura.' });
  }
  const pot = PER.map((_, i) => num(e.potenciaContratadaKw?.[i]));
  if (kwh.every(v => v == null)) add('error', 'consumoFacturadoKwh', 'No se ha extraído el consumo facturado por periodo.');
  if (pot.every(v => v == null)) add('error', 'potenciaContratadaKw', 'No se han extraído las potencias contratadas.');
  if (tarifa === '2.0TD' && kwh.slice(3).some(v => v > 0)) add('error', 'consumoFacturadoKwh', '2.0TD solo tiene periodos P1–P3 de energía.');

  // ── Totales de consumo
  const sumaKwh = kwh.reduce((a, b) => a + (b || 0), 0);
  const totImpreso = num(e.consumoTotalKwh);
  if (totImpreso != null && !cerca(sumaKwh, totImpreso, 1)) add('error', 'consumoTotalKwh', `La suma por periodos (${sumaKwh} kWh) no coincide con el total impreso (${totImpreso} kWh).`);

  // ── Fechas y días
  const desde = e.periodoConsumo?.desde, hasta = e.periodoConsumo?.hasta;
  let dias = num(e.diasFacturados);
  if (dias == null) {
    const d = (e.potenciaLineas || []).map(l => num(l.dias)).find(v => v != null);
    if (d != null) { dias = d; add('info', 'diasFacturados', `Días facturados tomados de las líneas de potencia (${d}).`); }
  }
  let diasCalc = null;
  if (desde && hasta) {
    const incl = diasInclusivos(desde, hasta);
    diasCalc = incl;
    if (dias != null && dias !== incl && dias !== incl - 1) add('aviso', 'diasFacturados', `Días impresos (${dias}) no cuadran con el periodo ${desde} – ${hasta} (${incl} días inclusivos).`);
    if (dias != null && dias === incl - 1) add('info', 'diasFacturados', `La factura cuenta ${dias} días entre lecturas (${desde} → ${hasta}); el consumo corresponde a los días posteriores a la lectura inicial.`);
  } else add('error', 'periodoConsumo', 'Falta el periodo de consumo (desde/hasta).');
  if (e.fechaEmision && hasta && e.fechaEmision.slice(0, 7) !== hasta.slice(0, 7)) {
    add('info', 'fechaEmision', `Emitida el ${e.fechaEmision}; el consumo corresponde a ${desde} – ${hasta}. Se calcula con el calendario del consumo, no de la emisión.`);
  }

  // ── Lecturas vs facturado
  const lect = Array.isArray(e.lecturas) ? e.lecturas : [];
  const discrep = [];
  for (const l of lect) {
    const i = PER.indexOf(String(l.periodo).toUpperCase());
    const a = num(l.anterior), b = num(l.actual);
    if (i < 0 || a == null || b == null || kwh[i] == null) continue;
    const d = b - a;
    if (d < 0) continue; // vuelta de contador / reactiva mal clasificada: no concluyente
    if (!cerca(d, kwh[i], 0.5)) discrep.push(`${PER[i]}: lecturas ${d} kWh vs facturado ${kwh[i]} kWh`);
  }
  if (discrep.length) add('aviso', 'lecturas', `Las diferencias de lecturas no coinciden con el consumo facturado (${discrep.join('; ')}). Se usa el consumo FACTURADO; revisar con la distribuidora.`);

  // ── Líneas de energía: kWh × precio = importe (con conversión de unidades)
  const eLin = Array.isArray(e.energiaLineas) ? e.energiaLineas : [];
  let sumaLineasEnergia = 0;
  for (const l of eLin) {
    const pr = precioAEuros(num(l.precio), l.unidadPrecio);
    const k = num(l.kwh), im = num(l.importe);
    if (im != null) sumaLineasEnergia += im;
    if (pr != null && k != null && im != null && !cerca(k * pr, im, 0.05, 0.001)) {
      add('aviso', 'energiaLineas', `${l.componente} ${l.periodo}: ${k} × ${pr.toFixed(6)} €/kWh = ${(k * pr).toFixed(2)} € ≠ ${im} € impreso (¿unidad ${l.unidadPrecio}?).`);
    }
    const i = PER.indexOf(String(l.periodo).toUpperCase());
    if (i >= 0 && k != null && kwh[i] != null && !cerca(k, kwh[i], 0.5)) add('aviso', 'energiaLineas', `${l.componente} ${l.periodo}: ${k} kWh distinto del consumo facturado ${kwh[i]} kWh.`);
  }
  // Energía "todo incluido" = total impreso, o suma de componentes si no hay total único
  let energiaTotal = num(imp.energiaTotal);
  if (eLin.length) {
    if (energiaTotal == null) {
      energiaTotal = Math.round(sumaLineasEnergia * 100) / 100;
      add('info', 'importes.energiaTotal', `Energía total = suma de componentes (${energiaTotal} €).`);
    } else if (!cerca(sumaLineasEnergia, energiaTotal, 0.05)) {
      const dif = Math.abs(sumaLineasEnergia - energiaTotal);
      if (dif < 1) {
        add('info', 'importes.energiaTotal', `La IA devolvió un total de energía de ${energiaTotal} € que no coincide con la suma de las líneas impresas (${sumaLineasEnergia.toFixed(2)} €; diferencia ${dif.toFixed(2)} €). Probable suma propia del modelo: se usa la suma de las líneas impresas.`);
      } else {
        add('info', 'importes.energiaTotal', `El total de energía impreso (${energiaTotal} €) no incluye todos los componentes (suma de líneas ${sumaLineasEnergia.toFixed(2)} €; peajes/cargos figuran aparte). Se usa la suma de líneas.`);
      }
      energiaTotal = Math.round(sumaLineasEnergia * 100) / 100;
    }
  }

  // ── Potencia
  const pLin = Array.isArray(e.potenciaLineas) ? e.potenciaLineas : [];
  let sumaPot = 0;
  for (const l of pLin) {
    const pr = precioAEuros(num(l.precio), l.unidadPrecio);
    const kw = num(l.kw), d = num(l.dias), im = num(l.importe);
    if (im != null) sumaPot += im;
    if (pr != null && kw != null && d != null && im != null && !cerca(kw * d * pr, im, 0.05, 0.001)) {
      add('aviso', 'potenciaLineas', `${l.componente} ${l.periodo}: ${kw} × ${d} × ${pr.toFixed(6)} = ${(kw * d * pr).toFixed(2)} € ≠ ${im} €.`);
    }
  }
  let potencia = num(imp.potencia);
  if (pLin.length) {
    const sp = Math.round(sumaPot * 100) / 100;
    if (potencia != null && !cerca(potencia, sp, 0.05)) add('info', 'importes.potencia', `Potencia impresa ${potencia} € ≠ suma de líneas ${sp} €: se usa la suma de líneas (peajes + cargos).`);
    potencia = sp;
  }

  // ── Maxímetros
  const pMaxRef = Math.max(0, ...pot.filter(x => x != null));
  const maxKw = PER.map(() => null);
  for (const m of (e.maximetros || [])) {
    const i = PER.indexOf(String(m.periodo).toUpperCase());
    if (i < 0) continue;
    const r = maximetroKw(m, pMaxRef);
    maxKw[i] = r.kw;
    if (r.supuesto) add('aviso', 'maximetros', `Maxímetro ${m.periodo} = ${m.valor} sin unidad: se interpreta como W (${r.kw} kW).`);
  }

  // ── Reconstrucción fiscal
  const ieRate = num(imp.tipoImpuestoElectricoPct);
  const baseIE = num(imp.baseImpuestoElectrico);
  const ie = num(imp.impuestoElectrico);
  if (baseIE != null && ie != null) {
    const esperado = baseIE * IE_RATE_REF / 100;
    if (!cerca(esperado, ie, 0.02)) add('aviso', 'impuestoElectrico', `IE impreso ${ie} € ≠ ${IE_RATE_REF}% × ${baseIE} € = ${esperado.toFixed(2)} €.`);
    if (ieRate != null && Math.abs(ieRate - IE_RATE_REF) > 1e-6 && cerca(esperado, ie, 0.02)) {
      add('info', 'tipoImpuestoElectricoPct', `La factura rotula el IE como ${ieRate}% pero el importe corresponde a ${IE_RATE_REF}%.`);
    }
  }
  const ivaPct = num(imp.tipoIVAPct);
  const baseIVA = num(imp.baseIVA), iva = num(imp.iva), total = num(imp.total);
  if (ivaPct != null && ivaPct > 0 && ivaPct < 1) add('error', 'tipoIVAPct', 'tipoIVAPct debe ser un porcentaje (21), no un decimal.');
  if (baseIVA != null && iva != null && ivaPct != null && !cerca(baseIVA * ivaPct / 100, iva, 0.02)) add('aviso', 'iva', `IVA ${iva} € ≠ ${ivaPct}% × ${baseIVA} €.`);
  if (baseIVA != null && iva != null && total != null && !cerca(baseIVA + iva, total, 0.02)) add('aviso', 'total', `Base IVA + IVA (${(baseIVA + iva).toFixed(2)} €) ≠ total ${total} € (¿conceptos sin IVA?).`);
  if (total == null) add('error', 'importes.total', 'Falta el total de la factura.');

  // Reconstrucción de la base del IE por componentes
  const comp = [potencia, energiaTotal, num(imp.excesosPotencia), num(imp.reactiva), num(imp.bonoSocial)];
  if (baseIE != null && comp[0] != null && comp[1] != null) {
    const s = comp.reduce((a, b) => a + (b || 0), 0);
    if (!cerca(s, baseIE, 0.05)) add('aviso', 'baseImpuestoElectrico', `Potencia + energía + excesos + reactiva + bono = ${s.toFixed(2)} € ≠ base IE impresa ${baseIE} €.`);
  }

  for (const d of (e.descuentosInformativos || [])) {
    add('info', 'descuentosInformativos', `Nota informativa "${d.texto}" (${d.importe} €): no se resta; los importes impresos ya lo incorporan.`);
  }

  const hayErrores = inc.some(x => x.nivel === 'error');
  return {
    ok: !hayErrores,
    incidencias: inc,
    datos: {
      tarifaAcceso: tarifa,
      fechaEmision: e.fechaEmision || null,
      periodo: { desde: desde || null, hasta: hasta || null },
      dias: dias ?? diasCalc,
      potenciasKw: pot,
      kwhPeriodo: kwh,
      kwhTotal: sumaKwh,
      maximetrosKw: maxKw,
      importes: {
        potencia, energiaTotal,
        excesos: num(imp.excesosPotencia), reactiva: num(imp.reactiva),
        bonoSocial: num(imp.bonoSocial), alquiler: num(imp.alquilerEquipos),
        otrosServicios: num(imp.otrosServicios),
        baseIE, ie, baseIVA, ivaPct, iva, total,
      },
      excedentesKwh: num(e.autoconsumo?.kwhExcedentes),
      titular: e.titular || null,
      cups: e.cups ? String(e.cups).replace(/\s+/g, '').toUpperCase() : null,
    },
  };
}

/** Extrae el JSON de la respuesta de texto del modelo. */
export function parsearRespuestaModelo(texto) {
  let raw = String(texto || '').trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) raw = fenced[1].trim();
  else { const m = raw.match(/\{[\s\S]*\}/); if (m) raw = m[0]; }
  return JSON.parse(raw);
}
