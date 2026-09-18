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

/* RL.1–RL.3 (B2C). Precios y descuentos SIN CAMBIOS.
 * Vigencia: extensión por instrucción interna del responsable comercial (18/09/2026),
 * tomando como referencia la ventana del documento B2B de gas (Gas Estable
 * RL.4–RL.6: 17/09/2026 – 20/09/2026). No procede de un documento Endesa B2C nuevo. */
const VIGENCIA_B2C_GAS = {
  desde: '2026-09-17',
  hasta: '2026-09-20',
  fuente: 'Extensión interna (instrucción del responsable) — referencia: 20260917 RL4_RL5_RL6_GAS ESTABLE_00_V1.pdf',
  extensionInterna: true,
};

export const GAS = [
  {
    id: 'rl1',
    title: 'Gas RL.1',
    consumo: '0 – 5.000 kWh/año',
    consumoMin: 0, consumoMax: 5000,
    terFijo: 7.181000,
    sinMant: { promo: 0.065590, noPromo: 0.093700 },
    conMant: { promo: 0.062779, noPromo: 0.093700 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    contratacion: VIGENCIA_B2C_GAS,
    validez: '17/09/2026 – 20/09/2026 (extensión interna)',
  },
  {
    id: 'rl2',
    title: 'Gas RL.2',
    consumo: '5.001 – 15.000 kWh/año',
    consumoMin: 5000, consumoMax: 15000,
    terFijo: 14.600000,
    sinMant: { promo: 0.065100, noPromo: 0.093000 },
    conMant: { promo: 0.062310, noPromo: 0.093000 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    contratacion: VIGENCIA_B2C_GAS,
    validez: '17/09/2026 – 20/09/2026 (extensión interna)',
  },
  {
    id: 'rl3',
    title: 'Gas RL.3',
    consumo: '15.001 – 50.000 kWh/año',
    consumoMin: 15000, consumoMax: 50000,
    terFijo: 30.672000,
    sinMant: { promo: 0.061600, noPromo: 0.088000 },
    conMant: { promo: 0.061600, noPromo: 0.088000 },
    hasMant: false,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: null,
    contratacion: VIGENCIA_B2C_GAS,
    validez: '17/09/2026 – 20/09/2026 (extensión interna)',
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
