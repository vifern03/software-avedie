/**
 * Tarifas B2B Endesa — fuente única de verdad para el CRM (catálogo, comparativas
 * e informe PDF leen de aquí). Los valores sustituidos se conservan en
 * historicoTarifas.js.
 *
 * Documentos de origen (carpeta "nuevas tarifas", fechados 17/09/2026):
 *   20260917 3.0TD_OPEN_18_V1.pdf · 20260917 6.1TD_OPEN_18_V1.pdf
 *   20260917 AUT_3.0TD_SIMPLY_V1.pdf · 20260917 AUT_6.1TD_SIMPLY_V1.pdf
 *   20260917 2.0TD_TEMPO24H_28_V1.pdf
 *
 * Unidades: energía €/kWh · potencia €/kW·año (el PDF también publica €/kW·mes y
 * €/kW·día; el motor usa €/kW·año ÷ 365 × días, que coincide con la columna
 * €/kW·día del PDF al 6º decimal).
 *
 * Todos los precios son SIN impuestos y, según los propios PDF, incluyen los
 * componentes regulados (peajes y cargos): "Las variaciones que se den en los
 * componentes regulados … se trasladarán al cliente". Por eso el motor NO suma
 * peajes/cargos aparte sobre estos precios.
 */

const DOC_OPEN_30 = '20260917 3.0TD_OPEN_18_V1.pdf';
const DOC_OPEN_61 = '20260917 6.1TD_OPEN_18_V1.pdf';

/* Términos de potencia 3.0TD y 6.1TD (sin descuento; iguales en Open y Simply). */
const POTENCIA_30TD = [
  { p: 'P1', anyo: 21.876927, mes: 1.823077, dia: 0.059937 },
  { p: 'P2', anyo: 12.117621, mes: 1.009802, dia: 0.033199 },
  { p: 'P3', anyo:  5.981534, mes: 0.498461, dia: 0.016388 },
  { p: 'P4', anyo:  5.386333, mes: 0.448861, dia: 0.014757 },
  { p: 'P5', anyo:  4.013851, mes: 0.334488, dia: 0.010997 },
  { p: 'P6', anyo:  2.942287, mes: 0.245191, dia: 0.008061 },
];
const POTENCIA_61TD = [
  { p: 'P1', anyo: 31.095368, mes: 2.591281, dia: 0.085193 },
  { p: 'P2', anyo: 17.014709, mes: 1.417892, dia: 0.046616 },
  { p: 'P3', anyo:  8.301881, mes: 0.691823, dia: 0.022745 },
  { p: 'P4', anyo:  6.893829, mes: 0.574486, dia: 0.018887 },
  { p: 'P5', anyo:  3.625113, mes: 0.302093, dia: 0.009932 },
  { p: 'P6', anyo:  2.504181, mes: 0.208682, dia: 0.006861 },
];

/* ── Open ─────────────────────────────────────────────────────────────────────
 * Precio publicado "con descuentos incluidos". Comprobado contra el precio base:
 *   precio Open  = base × (1 − dto_modalidad − 18%)   (descuentos aditivos)
 *   Horas No Open = base × (1 − 18%)                   (≠ precio base sin descuento)
 * El motor usa SIEMPRE los precios publicados de la matriz; nunca vuelve a
 * aplicar descuentos.
 *
 * `periodosOpen` = periodos que se facturan a precio Open (criterio comercial del
 * responsable, 18/09/2026): Plana todos; Día y Laboral P1–P5; Fin de Semana y
 * Noche solo P6. El resto de periodos va a precio "Horas No Open".
 * `ventanas` describe las horas Open de cada modalidad tal y como figuran en el
 * PDF (horas locales, [inicio, fin) en horas enteras; "finde" = sábados,
 * domingos y festivos nacionales).
 */
export const OPEN_30TD = {
  id: 'open30',
  nombre: 'Open 3.0TD',
  nivel: '30',
  fuente: DOC_OPEN_30,
  tramos: [
    { label: '15–30 kW',  min: 15,  max: 30 },
    { label: '30–50 kW',  min: 30,  max: 50 },
    { label: '50–100 kW', min: 50,  max: 100 },
    { label: '> 100 kW',  min: 100, max: Infinity },
  ],
  potencias: ['15–30 kW', '30–50 kW', '50–100 kW', '> 100 kW'],
  baseEnergia: [0.228942, 0.228942, 0.228442, 0.228442],
  modalidades: [
    { id: 'plana', periodosOpen: [1, 2, 3, 4, 5, 6],   label: 'Plana',         dto: 15, desc: 'Las 24h del día los 365 días al año',
      ventanas: { laborable: [[0, 24]], finde: [[0, 24]] } },
    { id: 'dia', periodosOpen: [1, 2, 3, 4, 5],     label: 'Día',           dto: 20, desc: 'De 8h a 24h todos los días del año',
      ventanas: { laborable: [[8, 24]], finde: [[8, 24]] } },
    { id: 'laboral', periodosOpen: [1, 2, 3, 4, 5], label: 'Laboral',       dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)',
      ventanas: { laborable: [[8, 24]], finde: [] } },
    { id: 'finde', periodosOpen: [6],   label: 'Fin de Semana', dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales',
      ventanas: { laborable: [], finde: [[0, 24]] } },
    { id: 'noche', periodosOpen: [6],   label: 'Noche',         dto: 55, desc: 'De 0h a 8h todos los días del año',
      ventanas: { laborable: [[0, 8]], finde: [[0, 8]] } },
  ],
  extraAnyo: 18,
  // Precios con descuentos incluidos: [tramo][modalidad]
  matrix: [
    [0.153391, 0.141944, 0.130497, 0.084709, 0.061814],
    [0.153391, 0.141944, 0.130497, 0.084709, 0.061814],
    [0.153056, 0.141634, 0.130212, 0.084524, 0.061679],
    [0.153056, 0.141634, 0.130212, 0.084524, 0.061679],
  ],
  horasNoOpen: [0.187732, 0.187732, 0.187322, 0.187322],
  potenciaTerminos: POTENCIA_30TD,
  penalizacion: '20% de la energía estimada pendiente de suministrar hasta fin del primer año, al precio sin descuentos',
  contratacion: { desde: '2026-09-17', hasta: '2026-09-27', fuente: DOC_OPEN_30 },
  duracionContrato: '1 año con permanencia',
  duracionDescuento: '18% adicional durante 1 año; el documento no fija plazo para el descuento de modalidad',
  cambioModalidad: 'Una vez al mes; afecta a todo el ciclo de facturación en curso y siguientes',
  validez: 'del 17/09/2026 hasta el 27/09/2026',
};

export const OPEN_61TD = {
  id: 'open61',
  nombre: 'Open 6.1TD',
  nivel: '61',
  fuente: DOC_OPEN_61,
  tramos: [
    { label: '≤ 30 kW',    min: 0,   max: 30 },
    { label: '30–50 kW',   min: 30,  max: 50 },
    { label: '50–100 kW',  min: 50,  max: 100 },
    { label: '100–450 kW', min: 100, max: 450 },
  ],
  potenciaMaxima: 450, // "Tarifa de acceso: 6.1TD hasta 450kW"
  potencias: ['< 30 kW', '30–50 kW', '50–100 kW', '100–450 kW'],
  baseEnergia: [0.195395, 0.195395, 0.191895, 0.191895],
  modalidades: [
    { id: 'plana', periodosOpen: [1, 2, 3, 4, 5, 6],   label: 'Plana',         dto: 15, desc: 'Las 24h del día los 365 días al año',
      ventanas: { laborable: [[0, 24]], finde: [[0, 24]] } },
    { id: 'dia', periodosOpen: [1, 2, 3, 4, 5],     label: 'Día',           dto: 20, desc: 'De 8h a 24h (L–V) y de 18h a 24h (S, D y festivos nacionales)',
      ventanas: { laborable: [[8, 24]], finde: [[18, 24]] } },
    { id: 'laboral', periodosOpen: [1, 2, 3, 4, 5], label: 'Laboral',       dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)',
      ventanas: { laborable: [[8, 24]], finde: [] } },
    { id: 'finde', periodosOpen: [6],   label: 'Fin de Semana', dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales',
      ventanas: { laborable: [], finde: [[0, 24]] } },
    { id: 'noche', periodosOpen: [6],   label: 'Noche',         dto: 35, desc: 'De 0h a 8h (L–V) y de 0h a 18h (S, D y festivos nacionales)',
      ventanas: { laborable: [[0, 8]], finde: [[0, 18]] } },
  ],
  extraAnyo: 18,
  matrix: [
    [0.130915, 0.121145, 0.111375, 0.072296, 0.091836],
    [0.130915, 0.121145, 0.111375, 0.072296, 0.091836],
    [0.128570, 0.118975, 0.109380, 0.071001, 0.090191],
    [0.128570, 0.118975, 0.109380, 0.071001, 0.090191],
  ],
  horasNoOpen: [0.160224, 0.160224, 0.157354, 0.157354],
  potenciaTerminos: POTENCIA_61TD,
  penalizacion: 'Diferencia OMIP firma/resolución + 20 €/MWh × energía pendiente (días pendientes × potencia máx. contratada × 7,1)',
  contratacion: { desde: '2026-09-17', hasta: '2026-09-27', fuente: DOC_OPEN_61 },
  duracionContrato: '1 año con permanencia',
  duracionDescuento: '18% adicional durante 1 año; el documento no fija plazo para el descuento de modalidad',
  cambioModalidad: 'Una vez al mes; afecta al próximo ciclo de facturación y siguientes',
  validez: 'del 17/09/2026 hasta el 27/09/2026',
};

/* ── Simply (solo suministros con autoconsumo instalado) ─────────────────────── */
export const SIMPLY_30TD = {
  id: 'simply30',
  nombre: 'Simply 3.0TD',
  nivel: '30',
  fuente: '20260917 AUT_3.0TD_SIMPLY_V1.pdf',
  requiereAutoconsumo: true,
  potenciaMinima: 15, // "> 15kW"
  energiaUnica: 0.156522, // 24h, sin descuentos
  excedentes: 0.06,       // €/kWh, deducido hasta el límite del importe de energía de cada periodo de facturación
  potenciaTerminos: POTENCIA_30TD,
  penalizacion: '20% de la energía estimada pendiente de suministrar hasta fin del primer año, al precio sin descuentos',
  contratacion: { desde: '2026-09-17', hasta: '2026-09-27', fuente: '20260917 AUT_3.0TD_SIMPLY_V1.pdf' },
  duracionContrato: '1 año con permanencia',
  duracionDescuento: 'No aplican descuentos',
  validez: 'del 17/09/2026 hasta el 27/09/2026',
};

/**
 * INCIDENCIA REGISTRADA: el PDF indica "Oferta válida para contrataciones desde el
 * 17/09/2026 hasta el 17/09/2026" (ventana de un solo día). Puede ser una errata,
 * pero NO se corrige por suposición: la oferta queda marcada como pendiente de
 * confirmación y el comparador no la presenta como contratable.
 */
export const SIMPLY_61TD = {
  id: 'simply61',
  nombre: 'Simply 6.1TD',
  nivel: '61',
  fuente: '20260917 AUT_6.1TD_SIMPLY_V1.pdf',
  requiereAutoconsumo: true,
  energiaPeriodos: [0.176826, 0.169211, 0.164359, 0.132713, 0.112633, 0.137025],
  excedentes: 0.06,
  potenciaTerminos: POTENCIA_61TD,
  penalizacion: 'Diferencia OMIP firma/resolución + 20 €/MWh × energía pendiente (días pendientes × potencia máx. contratada × 7,1)',
  contratacion: {
    desde: '2026-09-17', hasta: '2026-09-17', fuente: '20260917 AUT_6.1TD_SIMPLY_V1.pdf',
    pendienteConfirmacion: true,
    incidencia: 'El documento fija la ventana de contratación del 17/09/2026 al 17/09/2026 (un solo día). Posible errata no confirmada: oferta no disponible hasta confirmación comercial.',
  },
  duracionContrato: '1 año con permanencia',
  duracionDescuento: 'No aplican descuentos',
  validez: 'del 17/09/2026 hasta el 17/09/2026 (pendiente de confirmación)',
};

/* ── TEMPO 2.0TD (producto B2B, ≤ 15 kW) ─────────────────────────────────────── */
export const TEMPO_2_0TD = {
  id: 'tempo',
  nombre: 'TEMPO 2.0TD (24h)',
  nivel: '20',
  fuente: '20260917 2.0TD_TEMPO24H_28_V1.pdf',
  potenciaMaxima: 15,
  energia: { promo: 0.135449, base: 0.188123 }, // precio único 24h; promo = base × (1 − 28%)
  descuento: 28,
  potencia: [
    { p: 'P1', anyo: 44.704416, mes: 3.725368, desc: 'Laborables 8h–24h' },
    { p: 'P2', anyo: 17.725428, mes: 1.477119, desc: 'Laborables 0h–8h y 24h de fines de semana, festivos nacionales (sin sustituibles ni sin fecha fija) y 6 de enero' },
  ],
  penalizacion: '20% de la energía estimada pendiente de suministrar hasta fin del primer año, al precio sin descuentos',
  contratacion: { desde: '2026-09-17', hasta: '2026-09-27', fuente: '20260917 2.0TD_TEMPO24H_28_V1.pdf' },
  duracionContrato: '1 año con permanencia',
  duracionDescuento: '28% en el término de energía durante el primer año',
  validez: 'del 17/09/2026 hasta el 27/09/2026',
};

/* ── Indexada a OMIE 3.0TD / 6.1TD ───────────────────────────────────────────
 * SIN documentación nueva: se conservan precios y vigencia originales (vencida).
 * Los comparadores muestran el aviso de ventana vencida. */
export const INDEXADA_30TD = {
  id: 'indexada30',
  nombre: 'Indexada OMIE 3.0TD',
  potenciaTerminos: [
    { p: 'P1', anyo: 21.876927, mes: 1.823077, dia: 0.059937 },
    { p: 'P2', anyo: 12.117621, mes: 1.009802, dia: 0.033199 },
    { p: 'P3', anyo:  5.981534, mes: 0.498461, dia: 0.016388 },
    { p: 'P4', anyo:  5.386333, mes: 0.448861, dia: 0.014757 },
    { p: 'P5', anyo:  4.013851, mes: 0.334488, dia: 0.010997 },
    { p: 'P6', anyo:  2.942287, mes: 0.245191, dia: 0.008061 },
  ],
  energiaA: { p1: 0.101461, p2: 0.077500, p3: 0.055829, p4: 0.046846, p5: 0.044204, p6: 0.037530 },
  energiaB: { p1: 1.579,    p2: 1.387,    p3: 1.295,    p4: 1.095,    p5: 0.861,    p6: 1.138 },
  contratacion: { desde: '2026-07-15', hasta: '2026-07-21', fuente: '20260609 IND_3.0TD_OMIE_V1.pdf (sin documento nuevo)' },
  validez: 'del 15/07/2026 hasta el 21/07/2026 — sin documento nuevo',
};

export const INDEXADA_61TD = {
  id: 'indexada61',
  nombre: 'Indexada OMIE 6.1TD',
  potenciaTerminos: [
    { p: 'P1', anyo: 31.095368, mes: 2.591281, dia: 0.085193 },
    { p: 'P2', anyo: 17.014709, mes: 1.417892, dia: 0.046616 },
    { p: 'P3', anyo:  8.301881, mes: 0.691823, dia: 0.022745 },
    { p: 'P4', anyo:  6.893829, mes: 0.574486, dia: 0.018887 },
    { p: 'P5', anyo:  3.625113, mes: 0.302093, dia: 0.009932 },
    { p: 'P6', anyo:  2.504181, mes: 0.208682, dia: 0.006861 },
  ],
  energiaA: { p1: 0.080085, p2: 0.061069, p3: 0.046086, p4: 0.040403, p5: 0.038132, p6: 0.032891 },
  energiaB: { p1: 1.436,    p2: 1.252,    p3: 1.188,    p4: 1.005,    p5: 0.7800,   p6: 1.032 },
  contratacion: { desde: '2026-07-15', hasta: '2026-07-21', fuente: '20260609 IND_6.1TD_OMIE_V1.pdf (sin documento nuevo)' },
  validez: 'del 15/07/2026 hasta el 21/07/2026 — sin documento nuevo',
};
