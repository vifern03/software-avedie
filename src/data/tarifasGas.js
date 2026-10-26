/**
 * Tarifas de gas Endesa — fuente única de verdad para el CRM (catálogo,
 * comparativa e informe PDF).
 *
 * terFijo en €/mes. El motor lo prorratea por días: terFijo × 12 / 365 × días.
 *
 * Impuesto de hidrocarburos: 0,00234 €/kWh según el PDF Gas Estable 17/09/2026
 * ("Impuesto de hidrocarburos (gas - 0,00234€/kWh)"). El IVA se aplica sobre
 * (fijo + variable + IEH + alquiler).
 */

export const IEH_GAS_EUR_KWH = 0.00234;

/* RL.1, RL.2 y RL.3: documentos Endesa 'Oferta Gas Endesa' editados el 13/10/2026
 * (contrataciones 15/10/2026 – 02/12/2026). No publican precio con mantenimiento:
 * se mantienen los 3 puntos de siempre en RL.1 y RL.2 (RL.3 no lo tiene). */
const VIGENCIA_GAS_OCT = {
  desde: '2026-10-15',
  hasta: '2026-12-02',
  fuente: 'Oferta Gas Endesa RL.1 / RL.2 / RL.3 — documentos Endesa editados el 13/10/2026',
};
const VALIDEZ_GAS_OCT = '15/10/2026 – 02/12/2026';

export const GAS = [
  {
    id: 'rl1',
    title: 'Gas RL.1',
    consumo: '0 – 5.000 kWh/año',
    consumoMin: 0, consumoMax: 5000,
    terFijo: 7.500000,
    sinMant: { promo: 0.077700, noPromo: 0.111000 },
    conMant: { promo: 0.074370, noPromo: 0.111000 },
    hasMant: true,
    descuentos: ['20% — indefinido (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    contratacion: VIGENCIA_GAS_OCT,
    validez: VALIDEZ_GAS_OCT,
  },
  {
    id: 'rl2',
    title: 'Gas RL.2',
    consumo: '5.001 – 15.000 kWh/año',
    consumoMin: 5000, consumoMax: 15000,
    terFijo: 14.600000,
    sinMant: { promo: 0.077389, noPromo: 0.110556 },
    conMant: { promo: 0.074072, noPromo: 0.110556 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    contratacion: VIGENCIA_GAS_OCT,
    validez: VALIDEZ_GAS_OCT,
  },
  {
    id: 'rl3',
    title: 'Gas RL.3',
    consumo: '15.001 – 50.000 kWh/año',
    consumoMin: 15000, consumoMax: 50000,
    terFijo: 30.700000,
    sinMant: { promo: 0.088000, noPromo: 0.110000 },
    conMant: { promo: 0.088000, noPromo: 0.110000 },
    hasMant: false,
    descuentos: ['10% — indefinido (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: null,
    contratacion: VIGENCIA_GAS_OCT,
    validez: VALIDEZ_GAS_OCT,
  },
];

/**
 * Gas Estable RL.4 – RL.6 (B2B). Documento: 20260917 RL4_RL5_RL6_GAS ESTABLE_00_V1.pdf.
 * El documento publica "Precios base sin descuentos incluidos" y NO anuncia ningún
 * descuento: el precio a aplicar es el término variable publicado (promo = noPromo).
 * El 26% del documento anterior NO se arrastra (ver historicoTarifas.js).
 * Tramos por consumo anual (presión ≤ 4 bar):
 *   RL.4: > 50.000 y ≤ 300.000 kWh · RL.5: > 300.000 y ≤ 1.500.000 · RL.6: > 1.500.000 y ≤ 8.000.000
 */
const DOC_GAS_ESTABLE = '20260917 RL4_RL5_RL6_GAS ESTABLE_00_V1.pdf';
const CONTRATACION_GAS_ESTABLE = { desde: '2026-09-17', hasta: '2026-09-20', fuente: DOC_GAS_ESTABLE };
const PENALIZACION_GAS = '20% del término de energía × días restantes × consumo diario estimado por Endesa (5% si el suministro tiene derecho a TUR de gas)';

export const GAS_EMPRESA = [
  {
    id: 'rl4',
    precioSinActualizar: true,
    title: 'Gas RL.4',
    consumo: '50.000 – 300.000 kWh/año',
    consumoMin: 50000, consumoMax: 300000,
    terFijo: 41.63,
    sinMant: { promo: 0.091102, noPromo: 0.091102 },
    conMant: { promo: 0.091102, noPromo: 0.091102 },
    hasMant: false,
    esEmpresa: true,
    descuentos: ['Precio estable durante la vigencia del contrato (sin descuentos)'],
    mantLabel: null,
    penalizacion: PENALIZACION_GAS,
    contratacion: CONTRATACION_GAS_ESTABLE,
    validez: '17/09/2026 – 20/09/2026',
  },
  {
    id: 'rl5',
    precioSinActualizar: true,
    title: 'Gas RL.5',
    consumo: '300.000 – 1.500.000 kWh/año',
    consumoMin: 300000, consumoMax: 1500000,
    terFijo: 232.34,
    sinMant: { promo: 0.091026, noPromo: 0.091026 },
    conMant: { promo: 0.091026, noPromo: 0.091026 },
    hasMant: false,
    esEmpresa: true,
    descuentos: ['Precio estable durante la vigencia del contrato (sin descuentos)'],
    mantLabel: null,
    penalizacion: PENALIZACION_GAS,
    contratacion: CONTRATACION_GAS_ESTABLE,
    validez: '17/09/2026 – 20/09/2026',
  },
  {
    id: 'rl6',
    precioSinActualizar: true,
    title: 'Gas RL.6',
    consumo: '1.500.000 – 8.000.000 kWh/año',
    consumoMin: 1500000, consumoMax: 8000000,
    terFijo: 1117.70,
    sinMant: { promo: 0.080942, noPromo: 0.080942 },
    conMant: { promo: 0.080942, noPromo: 0.080942 },
    hasMant: false,
    esEmpresa: true,
    descuentos: ['Precio estable durante la vigencia del contrato (sin descuentos)'],
    mantLabel: null,
    penalizacion: PENALIZACION_GAS,
    contratacion: CONTRATACION_GAS_ESTABLE,
    validez: '17/09/2026 – 20/09/2026',
  },
];
