/**
 * Histórico de tarifas sustituidas. NO se usan en cálculos: se conservan para
 * trazabilidad (qué precio se ofertaba en cada ventana de contratación).
 * Cada entrada copia literalmente los valores que el CRM tenía antes de la
 * actualización del 17/09/2026.
 */

export const HISTORICO_TARIFAS = [
  {
    producto: 'Open 3.0TD',
    vigencia: { desde: '2026-07-15', hasta: '2026-07-21' },
    fuente: 'PDF Endesa Open 3.0TD (ventana 15/07/2026 – 21/07/2026)',
    datos: {
      baseEnergia: [0.198840, 0.198340, 0.197840, 0.197840],
      extraAnyo: 14,
      matrix: [
        [0.141176, 0.131234, 0.121292, 0.081524, 0.061640],
        [0.140821, 0.130904, 0.120987, 0.081319, 0.061485],
        [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
        [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
      ],
      horasNoOpen: [0.171002, 0.170572, 0.170142, 0.170142],
    },
  },
  {
    producto: 'Open 6.1TD',
    vigencia: { desde: '2026-07-15', hasta: '2026-07-21' },
    fuente: 'PDF Endesa Open 6.1TD (ventana 15/07/2026 – 21/07/2026)',
    datos: {
      baseEnergia: [0.173916, 0.173916, 0.170416, 0.170416],
      extraAnyo: 12,
      matrix: [
        [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
        [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
        [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
        [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
      ],
      horasNoOpen: [0.153046, 0.153046, 0.149966, 0.149966],
    },
  },
  {
    producto: 'TEMPO 2.0TD',
    vigencia: { desde: '2026-07-15', hasta: '2026-07-21' },
    fuente: 'PDF Endesa TEMPO 2.0TD anterior',
    datos: { energia: { promo: 0.124777, base: 0.164180 }, descuento: 24,
             potencia: { P1: 44.704416, P2: 17.725428 } },
  },
  {
    producto: 'Gas Estable RL.4',
    vigencia: { desde: '2026-06-09', hasta: '2026-07-14' },
    fuente: 'PDF Endesa Gas Empresa anterior',
    datos: { terFijo: 41.63, promo: 0.067415, noPromo: 0.091102, descuento: '26% — 1 año' },
  },
  {
    producto: 'Gas Estable RL.5',
    vigencia: { desde: '2026-06-09', hasta: '2026-07-14' },
    fuente: 'PDF Endesa Gas Empresa anterior',
    datos: { terFijo: 232.34, promo: 0.067359, noPromo: 0.091026, descuento: '26% — 1 año' },
  },
  {
    producto: 'Gas Estable RL.6',
    vigencia: { desde: '2026-06-09', hasta: '2026-07-14' },
    fuente: 'PDF Endesa Gas Empresa anterior',
    datos: { terFijo: 1117.70, promo: 0.059897, noPromo: 0.080942, descuento: '26% — 1 año' },
  },
];
