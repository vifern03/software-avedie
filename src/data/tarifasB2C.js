/**
 * Tarifas B2C (Luz Residencial 2.0TD) — fuente única para Consulta de Tarifas,
 * Comparativas 2.0 e informe PDF.
 *
 * PRECIOS Y DESCUENTOS SIN CAMBIOS respecto a los documentos Endesa de junio de 2026.
 * VIGENCIA: extensión por instrucción interna del responsable comercial
 * (18/09/2026), tomando como referencia la ventana de los documentos B2B de luz
 * del 17/09/2026 (Open 3.0TD / 6.1TD / TEMPO: 17/09/2026 – 27/09/2026).
 * No procede de un documento Endesa B2C nuevo.
 */

export const VIGENCIA_B2C_LUZ = {
  desde: '2026-09-17',
  hasta: '2026-09-27',
  fuente: 'Extensión interna (instrucción del responsable) — referencia: documentos B2B luz 20260917',
  extensionInterna: true,
};
const VALIDEZ_B2C = '17/09/2026 – 27/09/2026 (extensión interna)';

export const BONO_SOCIAL = [
  { zona: 'Península y Baleares (< 10 kW)',       valor: '0,02431959 €/día' },
  { zona: 'Canarias (< 10 kW, cliente doméstico)', valor: '0,02009883 €/día' },
  { zona: 'Ceuta y Melilla',                        valor: '0,02029982 €/día' },
  { zona: 'Resto de casos',                         valor: '0,02070180 €/día' },
];

export const LUZ = [
  {
    id: 'directo',
    title: 'Luz Fija 24H',
    canal: 'Canal Directo',
    canalColor: 'bg-blue-100 text-blue-700',
    desc: 'Precio único en energía y potencia, sin franjas horarias.',
    sinMant: { promo: 0.109000, noPromo: 0.160294 },
    conMant: { promo: 0.104191, noPromo: 0.160294 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% — 1 año (nuevas contrataciones)', '22% — indefinido sobre término de energía'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección',
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
  {
    id: 'prescriptor',
    title: 'Luz Fija 24H',
    canal: 'Con Prescriptor',
    canalColor: 'bg-violet-100 text-violet-700',
    desc: 'Precio único sin franjas horarias. Canal venta con prescriptor.',
    sinMant: { promo: 0.128235, noPromo: 0.160294 },
    conMant: { promo: 0.123426, noPromo: 0.160294 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% — 1 año (nuevas contrataciones)', '10% — indefinido sobre término de energía'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección (1 año)',
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
  {
    id: 'tu-otra-casa',
    title: 'Tu Otra Casa 50',
    canal: '2.0TD',
    canalColor: 'bg-emerald-100 text-emerald-700',
    desc: '50% de descuento en las 50 horas de mayor consumo de cada mes.',
    isToc: true,
    sinMant: { promoH: 0.110250, restoH: 0.220000, noPromoH: 0.122500, noPromoR: 0.245000 },
    conMant: { promoH: 0.106575, restoH: 0.210000, noPromoH: 0.122500, noPromoR: 0.245000 },
    potPunta: 32.880000,
    potValle: 5.904000,
    descuentos: ['50% — en las 50h de mayor consumo del mes', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección (1 año)',
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
];

/* ── Datos Autoconsumo Solar extraídos de PDFs Endesa (01/06/2026 – 14/07/2026) ─ */
/* Fuente: Oferta Endesa Solar Basic.pdf / Solar Plus.pdf / Solar Plus & Batería Virtual.pdf */

export const LUZ_SOLAR = [
  {
    id: 'solar-basic',
    title: 'Solar Basic',
    badge: 'Solar',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    desc: 'Máximo ahorro en horas Basic (18h–10h). No retribuye excedentes vertidos a la red.',
    energiaHorasBasic: { promo: 0.124722, noPromo: 0.159900 },
    energiaRestoHoras: { promo: 0.148707, noPromo: 0.159900 },
    potPunta: 34.188000,
    potValle: 34.188000,
    compExcedentes: 0,
    bateriaVirtual: false,
    cuotaBateriaMes: 0,
    descuentos: ['15% — indefinido en horas Basic (18h–10h)', '7% — 1 año (nuevas contrataciones)'],
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
  {
    id: 'solar-plus',
    title: 'Solar Plus',
    badge: 'Solar',
    badgeColor: 'bg-orange-100 text-orange-700',
    desc: 'Retribuye los excedentes vertidos a la red (Mecanismo de Compensación Simplificada, RD 244/2019).',
    energiaConsumida: { promo: 0.148707, noPromo: 0.159900 },
    potPunta: 34.188000,
    potValle: 34.188000,
    compExcedentes: 0.06,
    bateriaVirtual: false,
    cuotaBateriaMes: 0,
    descuentos: ['7% — 1 año (nuevas contrataciones)'],
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
  {
    id: 'solar-bateria',
    title: 'Solar Plus & Batería Virtual',
    badge: 'Batería',
    badgeColor: 'bg-purple-100 text-purple-700',
    desc: 'El excedente no compensado se acumula como saldo (Batería Virtual) para próximas facturas.',
    energiaConsumida: { promo: 0.148707, noPromo: 0.159900 },
    potPunta: 34.188000,
    potValle: 34.188000,
    compExcedentes: 0.06,
    bateriaVirtual: true,
    cuotaBateriaMes: 2,
    descuentos: ['7% — 1 año (nuevas contrataciones)'],
    contratacion: VIGENCIA_B2C_LUZ,
    validez: VALIDEZ_B2C,
  },
];

/* ── Datos Indexada a OMIE 2.0TD extraídos de PDF Endesa (09/06/2026 – 14/07/2026) ── */
/* Fuente: "20260609 IND_2.0TD_OMIE_V1.pdf". Precio energía por periodo = A + (B × OMIEmes) */

/* Indexada a OMIE 2.0TD — catalogada en la pestaña B2B. SIN documento nuevo:
 * se conservan precios y la vigencia original (vencida). */

export const INDEXADA_2_0TD = {
  potenciaTerminos: [
    { p: 'P1', anyo: 31.216092, mes: 2.601341, dia: 0.085524 },
    { p: 'P2', anyo: 4.237104,  mes: 0.353092, dia: 0.011608 },
  ],
  energiaA: { p1: 0.138015, p2: 0.070477, p3: 0.040620 },
  energiaB: { p1: 1.448,    p2: 1.239,    p3: 1.137 },
  contratacion: { desde: '2026-06-09', hasta: '2026-07-14', fuente: '20260609 IND_2.0TD_OMIE_V1.pdf (sin documento nuevo)' },
  validez: '09/06/2026 – 14/07/2026 — sin documento nuevo',
};
