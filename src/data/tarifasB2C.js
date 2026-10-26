/**
 * Tarifas B2C (Luz Residencial 2.0TD) — fuente única para Consulta de Tarifas,
 * Comparativas 2.0 e informe PDF.
 *
 * CONECTA LUZ (sustituye a Luz Fija 24H Canal Directo), LUZ FIJA 24H CON PRESCRIPTOR
 * y TU OTRA CASA 50: documentos Endesa 'Oferta Conecta Luz' editado el 09/10/2026 y
 * 'Oferta LUZ 24H' (es la de prescriptor) y 'Oferta Tu Otra Casa 50' editados el
 * 13/10/2026 (contrataciones 15/10/2026 – 02/12/2026).
 * Ninguno publica precio con mantenimiento: se mantienen los 3 puntos de siempre.
 *
 * EL RESTO (Solar e Indexada 2.0TD) sigue pendiente de documento nuevo:
 * precios y descuentos sin cambios respecto a los documentos Endesa de junio de 2026.
 * VIGENCIA: extensión por instrucción interna del responsable comercial
 * (18/09/2026), tomando como referencia la ventana de los documentos B2B de luz
 * del 17/09/2026 (Open 3.0TD / 6.1TD / TEMPO: 17/09/2026 – 27/09/2026).
 * No procede de un documento Endesa B2C nuevo.
 */

/* Documentos Endesa de octubre de 2026 (LUZ 24H, Tu Otra Casa 50, Conecta Luz). */
export const VIGENCIA_LUZ_24H = {
  desde: '2026-10-15',
  hasta: '2026-12-02',
  fuente: 'Oferta LUZ 24H — documento Endesa editado el 13/10/2026',
};
const VALIDEZ_OCT = '15/10/2026 – 02/12/2026';

export const VIGENCIA_TOC = {
  desde: '2026-10-15',
  hasta: '2026-12-02',
  fuente: 'Oferta Tu Otra Casa 50 — documento Endesa editado el 13/10/2026',
};

export const VIGENCIA_CONECTA = {
  desde: '2026-10-15',
  hasta: '2026-12-02',
  fuente: 'Oferta Conecta Luz — documento Endesa editado el 09/10/2026',
};

/* Resto de tarifas B2C: siguen sin documento nuevo. */
export const VIGENCIA_B2C_LUZ = {
  desde: '2026-09-17',
  hasta: '2026-09-27',
  fuente: 'Referencia: documentos B2B luz 20260917',
  extensionInterna: true,
};
const VALIDEZ_B2C = '17/09/2026 – 27/09/2026';

/* Coste fijo del bono social (comercialización): 0,024688 €/día sin impuestos. */
export const BONO_SOCIAL_SIN_IMPUESTOS = '0,024688 €/día';

export const BONO_SOCIAL = [
  { zona: 'Península y Baleares',                   valor: '0,031400 €/día' },
  { zona: 'Canarias (< 10 kW, cliente doméstico)', valor: '0,025950 €/día' },
  { zona: 'Canarias (resto de casos)',              valor: '0,0267292 €/día' },
  { zona: 'Ceuta y Melilla',                        valor: '0,02621023 €/día' },
];

export const LUZ = [
  {
    id: 'conecta',
    title: 'Conecta Luz',
    canal: 'Residencial',
    canalColor: 'bg-sky-100 text-sky-700',
    desc: 'Precio único 24 h. Factura electrónica y domiciliación.',
    sinMant: { promo: 0.129990, noPromo: 0.144433 },
    conMant: { promo: 0.125657, noPromo: 0.144433 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% 1 año (nuevas altas)'],
    mantLabel: '3% mantenimiento',
    contratacion: VIGENCIA_CONECTA,
    validez: VALIDEZ_OCT,
  },
  {
    id: 'prescriptor',
    title: 'Luz Fija 24H',
    canal: 'Con Prescriptor',
    canalColor: 'bg-violet-100 text-violet-700',
    desc: 'Precio único 24 h. Venta con prescriptor.',
    sinMant: { promo: 0.166990, noPromo: 0.185544 },
    conMant: { promo: 0.161424, noPromo: 0.185544 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% 1 año (nuevas altas)'],
    mantLabel: '3% mantenimiento (1 año)',
    contratacion: VIGENCIA_LUZ_24H,
    validez: VALIDEZ_OCT,
  },
  {
    id: 'tu-otra-casa',
    title: 'Tu Otra Casa 50',
    canal: '2.0TD',
    canalColor: 'bg-emerald-100 text-emerald-700',
    desc: '50% dto. en las 50 h de mayor consumo del mes.',
    isToc: true,
    sinMant: { promoH: 0.123674, restoH: 0.247347, noPromoH: 0.137415, noPromoR: 0.274830 },
    // El documento no publica precio con mantenimiento: −3% sobre los precios promocionados.
    conMant: { promoH: 0.119964, restoH: 0.239927, noPromoH: 0.137415, noPromoR: 0.274830 },
    potPunta: 32.880000,
    potValle: 5.904000,
    descuentos: ['50% en 50 h de más consumo', '10% 1 año (nuevas altas)'],
    mantLabel: '3% mantenimiento (1 año)',
    contratacion: VIGENCIA_TOC,
    validez: VALIDEZ_OCT,
  },
];

/* ── Datos Autoconsumo Solar extraídos de PDFs Endesa (01/06/2026 – 14/07/2026) ─ */
/* Fuente: Oferta Endesa Solar Basic.pdf / Solar Plus.pdf / Solar Plus & Batería Virtual.pdf */

export const LUZ_SOLAR = [
  {
    id: 'solar-basic',
    precioSinActualizar: true,
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
    precioSinActualizar: true,
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
    precioSinActualizar: true,
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
  precioSinActualizar: true,
  potenciaTerminos: [
    { p: 'P1', anyo: 31.216092, mes: 2.601341, dia: 0.085524 },
    { p: 'P2', anyo: 4.237104,  mes: 0.353092, dia: 0.011608 },
  ],
  energiaA: { p1: 0.138015, p2: 0.070477, p3: 0.040620 },
  energiaB: { p1: 1.448,    p2: 1.239,    p3: 1.137 },
  contratacion: { desde: '2026-06-09', hasta: '2026-07-14', fuente: '20260609 IND_2.0TD_OMIE_V1.pdf (sin documento nuevo)' },
  validez: '09/06/2026 – 14/07/2026',
};
