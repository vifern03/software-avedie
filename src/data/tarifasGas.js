/**
 * Tarifas de gas Endesa — fuente única de verdad para el CRM.
 * Usada tanto en la consulta de tarifas (Tarifas.jsx) como en el
 * Estudio Comparativo Gas (EstudioComparativoGas.jsx).
 *
 * terFijo está en €/mes. En el comparador se convierte a €/período:
 *   subtotFijo = tarifa.terFijo * (dias / 30.4167)
 */

export const GAS = [
  {
    id: 'rl1',
    title: 'Gas RL.1',
    consumo: '0 – 5.000 kWh/año',
    terFijo: 7.181000,
    sinMant: { promo: 0.065590, noPromo: 0.093700 },
    conMant: { promo: 0.062779, noPromo: 0.093700 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    validez: '12/05/2026 – 14/07/2026',
  },
  {
    id: 'rl2',
    title: 'Gas RL.2',
    consumo: '5.001 – 15.000 kWh/año',
    terFijo: 14.600000,
    sinMant: { promo: 0.065100, noPromo: 0.093000 },
    conMant: { promo: 0.062310, noPromo: 0.093000 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% — Dto. por Mantenimiento',
    validez: '12/05/2026 – 14/07/2026',
  },
  {
    id: 'rl3',
    title: 'Gas RL.3',
    consumo: '15.001 – 50.000 kWh/año',
    terFijo: 30.672000,
    sinMant: { promo: 0.061600, noPromo: 0.088000 },
    conMant: { promo: 0.061600, noPromo: 0.088000 },
    hasMant: false,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: null,
    validez: '12/05/2026 – 14/07/2026',
  },
];
