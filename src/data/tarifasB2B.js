/**
 * Tarifas Luz 3.0TD / 6.1TD (B2B) Endesa — fuente única de verdad para el CRM.
 * Usada tanto en la consulta de tarifas (Tarifas.jsx, pestaña "Luz 3.0 y 6.1 (B2B)")
 * como en el Estudio Comparativo 3.0/6.1 (EstudioComparativoB2B.jsx).
 *
 * Términos de potencia en €/kW·año, por periodo P1-P6 (peaje regulado, igual en
 * Open e Indexada al ser el mismo acceso). Energía: Open usa una matriz [potencia][modalidad]
 * con descuentos ya incluidos; Indexada usa la fórmula Precio = A + (B × OMIEmes).
 */

/* ── Datos B2B extraídos de PDFs Endesa (09/06/2026 – 14/07/2026) ───────────── */

export const OPEN_30TD = {
  potencias: ['15–30 kW', '30–50 kW', '50–100 kW', '> 100 kW'],
  baseEnergia: [0.198840, 0.198340, 0.197840, 0.197840],
  modalidades: [
    { label: 'Plana',        dto: 15, desc: 'Las 24h del día los 365 días al año' },
    { label: 'Día',          dto: 20, desc: 'De 8h a 24h todos los días del año' },
    { label: 'Laboral',      dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)' },
    { label: 'Fin de Semana',dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales' },
    { label: 'Noche',        dto: 55, desc: 'De 0h a 8h todos los días del año' },
  ],
  extraAnyo: 14,
  // Precios con descuentos incluidos (modalidad discount + 14% 1er año): [potencia][modalidad]
  matrix: [
    [0.141176, 0.131234, 0.121292, 0.081524, 0.061640],
    [0.140821, 0.130904, 0.120987, 0.081319, 0.061485],
    [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
    [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
  ],
  horasNoOpen: [0.171002, 0.170572, 0.170142, 0.170142],
  potenciaTerminos: [
    { p: 'P1', anyo: 21.876927, mes: 1.823077, dia: 0.059937 },
    { p: 'P2', anyo: 12.117621, mes: 1.009802, dia: 0.033199 },
    { p: 'P3', anyo:  5.981534, mes: 0.498461, dia: 0.016388 },
    { p: 'P4', anyo:  5.386333, mes: 0.448861, dia: 0.014757 },
    { p: 'P5', anyo:  4.013851, mes: 0.334488, dia: 0.010997 },
    { p: 'P6', anyo:  2.942287, mes: 0.245191, dia: 0.008061 },
  ],
  penalizacion: '5% de la energía pendiente facturada al precio sin descuentos',
  validez: '24/06/2026 – 14/07/2026',
};

export const OPEN_61TD = {
  potencias: ['< 30 kW', '30–50 kW', '50–100 kW', '100–450 kW'],
  baseEnergia: [0.173916, 0.173916, 0.170416, 0.170416],
  modalidades: [
    { label: 'Plana',        dto: 15, desc: 'Las 24h del día los 365 días al año' },
    { label: 'Día',          dto: 20, desc: 'De 8h a 24h (L–V) y de 18h a 24h (S, D, festivos)' },
    { label: 'Laboral',      dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)' },
    { label: 'Fin de Semana',dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales' },
    { label: 'Noche',        dto: 35, desc: 'De 0h a 8h (L–V) y de 0h a 18h (S, D, festivos)' },
  ],
  extraAnyo: 12,
  // Precios con descuentos incluidos (modalidad discount + 12% 1er año): [potencia][modalidad]
  matrix: [
    [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
    [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
    [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
    [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
  ],
  horasNoOpen: [0.153046, 0.153046, 0.149966, 0.149966],
  potenciaTerminos: [
    { p: 'P1', anyo: 31.095368, mes: 2.591281, dia: 0.085193 },
    { p: 'P2', anyo: 17.014709, mes: 1.417892, dia: 0.046616 },
    { p: 'P3', anyo:  8.301881, mes: 0.691823, dia: 0.022745 },
    { p: 'P4', anyo:  6.893829, mes: 0.574486, dia: 0.018887 },
    { p: 'P5', anyo:  3.625113, mes: 0.302093, dia: 0.009932 },
    { p: 'P6', anyo:  2.504181, mes: 0.208682, dia: 0.006861 },
  ],
  penalizacion: '10% del precio del Término de Energía × energía pendiente de suministro',
  validez: '24/06/2026 – 14/07/2026',
};

/* ── Datos Indexada a OMIE 3.0TD / 6.1TD extraídos de PDFs Endesa (09/06/2026 – 14/07/2026) ── */
/* Fuente: "20260609 IND_3.0TD_OMIE_V1.pdf" / "20260609 IND_6.1TD_OMIE_V1.pdf".            */
/* Precio energía por periodo = A + (B × OMIEmes). Términos de potencia iguales a Open.    */

export const INDEXADA_30TD = {
  potenciaTerminos: OPEN_30TD.potenciaTerminos,
  energiaA: { p1: 0.101461, p2: 0.077500, p3: 0.055829, p4: 0.046846, p5: 0.044204, p6: 0.037530 },
  energiaB: { p1: 1.579,    p2: 1.387,    p3: 1.295,    p4: 1.095,    p5: 0.861,    p6: 1.138 },
  validez: '09/06/2026 – 14/07/2026',
};

export const INDEXADA_61TD = {
  potenciaTerminos: OPEN_61TD.potenciaTerminos,
  energiaA: { p1: 0.080085, p2: 0.061069, p3: 0.046086, p4: 0.040403, p5: 0.038132, p6: 0.032891 },
  energiaB: { p1: 1.436,    p2: 1.252,    p3: 1.188,    p4: 1.005,    p5: 0.7800,   p6: 1.032 },
  validez: '09/06/2026 – 14/07/2026',
};
