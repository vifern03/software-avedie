/**
 * Pruebas del motor determinista. Los valores esperados se calcularon aparte
 * (a mano / Python) a partir de los precios de los PDF, sin usar el motor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOfertaLuz, calcularOfertaGas, calcularAhorro, extrapolarAnual, ESTADO, necesidadesModalidad } from '../src/lib/energia/motor.js';
import { OPEN_30TD, OPEN_61TD, SIMPLY_30TD, SIMPLY_61TD, TEMPO_2_0TD, INDEXADA_30TD } from '../src/data/tarifasB2B.js';
import { GAS, GAS_EMPRESA } from '../src/data/tarifasGas.js';
import { LUZ, LUZ_SOLAR } from '../src/data/tarifasB2C.js';

const HOY = '2026-09-18';
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);

// Factura B (Apolo, julio 2026) — datos de la referencia revisada
const APOLO = {
  producto: OPEN_30TD, potenciasKw: [49, 63, 63, 63, 63, 63], dias: 31,
  periodo: { desde: '2026-07-01', hasta: '2026-07-31' },
  kwhPeriodo: [7170, 5156, 0, 0, 0, 9928],
  mantenidos: { excesos: 53.33, reactiva: 124.56, alquiler: 8.15, bonoSocial: 0.77 },
  ivaRate: 0.21, fechaOferta: HOY,
};
const DESGLOSE_APOLO = { lab0_8: 4000, d0_8: 2000, d8_18: 2500, d18_24: 1428 };

test('Open 3.0TD Plana y Laboral se calculan con agregados P1–P6 (factura B)', () => {
  const plana = calcularOfertaLuz({ ...APOLO, modalidadId: 'plana' });
  assert.equal(plana.estado, ESTADO.OK);
  near(plana.total, 4901.64);
  near(plana.energia / 22254, 0.153391, 1e-9); // precio publicado, sin re-descontar
  const lab = calcularOfertaLuz({ ...APOLO, modalidadId: 'laboral' });
  assert.equal(lab.estado, ESTADO.OK);
  near(lab.total, 4976.36);
  near(lab.kwhOpen, 12326, 1e-9);
  near(lab.kwhNoOpen, 9928, 1e-9);
});

test('tramo de potencia ambiguo (P1 49 kW vs máx. 63 kW) → tramo de precio más alto y aviso', () => {
  const r = calcularOfertaLuz({ ...APOLO, modalidadId: 'plana' });
  assert.equal(r.tramo, '30–50 kW');
  assert.ok(r.avisos.some(a => a.includes('Tramo de potencia ambiguo')));
});

test('Día, Fin de Semana y Noche sin curva ni desglose → datos insuficientes (no se inventa reparto)', () => {
  for (const m of ['dia', 'finde', 'noche']) {
    const r = calcularOfertaLuz({ ...APOLO, modalidadId: m });
    assert.equal(r.estado, ESTADO.DATOS_INSUFICIENTES, m);
    assert.equal(r.total, undefined);
  }
});

test('Open 3.0TD con desglose del P6: Día, Noche y Fin de Semana', () => {
  near(calcularOfertaLuz({ ...APOLO, modalidadId: 'dia', desgloseP6: DESGLOSE_APOLO }).total, 4927.06);
  near(calcularOfertaLuz({ ...APOLO, modalidadId: 'noche', desgloseP6: DESGLOSE_APOLO }).total, 4912.73);
  near(calcularOfertaLuz({ ...APOLO, modalidadId: 'finde', desgloseP6: DESGLOSE_APOLO }).total, 5096.88);
});

test('desglose del P6 que no cuadra con el P6 facturado → bloqueo', () => {
  const r = calcularOfertaLuz({ ...APOLO, modalidadId: 'dia', desgloseP6: { ...DESGLOSE_APOLO, d8_18: 100 } });
  assert.equal(r.estado, ESTADO.DATOS_INSUFICIENTES);
});

test('la regla antigua "P1–P5 Open, P6 No Open" solo es válida para Laboral', () => {
  const n = (p, id) => necesidadesModalidad(p.modalidades.find(m => m.id === id));
  assert.equal(n(OPEN_30TD, 'laboral').necesitaDesgloseP6, false);
  assert.equal(n(OPEN_30TD, 'plana').necesitaDesgloseP6, false);
  for (const id of ['dia', 'finde', 'noche']) {
    assert.equal(n(OPEN_30TD, id).necesitaDesgloseP6, true, `3.0 ${id}`);
    assert.equal(n(OPEN_61TD, id).necesitaDesgloseP6, true, `6.1 ${id}`);
  }
  assert.equal(n(OPEN_30TD, 'noche').claseP1P5, 'no');
  assert.equal(n(OPEN_30TD, 'finde').claseP1P5, 'no');
});

/* Curva sintética: 1 kWh cada hora, semana 14–20/09/2026 (septiembre, B1).
   P3 = 45, P4 = 35, P6 = 88 kWh. */
function curvaSemana() {
  const c = [];
  for (let d = 14; d <= 20; d++) for (let h = 0; h < 24; h++) c.push({ fecha: `2026-09-${d}`, hora: h, kwh: 1 });
  return c;
}
const SEPT = {
  potenciasKw: [60, 60, 60, 60, 60, 60], dias: 7, periodo: { desde: '2026-09-14', hasta: '2026-09-20' },
  kwhPeriodo: [0, 0, 45, 35, 0, 88], ivaRate: 0.21, fechaOferta: HOY,
};

test('curva horaria de septiembre: Open 3.0TD Día → 112 kWh Open / 56 kWh No Open', () => {
  const r = calcularOfertaLuz({ ...SEPT, producto: OPEN_30TD, modalidadId: 'dia', curva: curvaSemana() });
  assert.equal(r.estado, ESTADO.OK);
  assert.equal(r.metodoReparto, 'curva');
  near(r.kwhOpen, 112, 1e-9);
  near(r.energia, 26.35304, 1e-6);
});

test('curva horaria: Open 6.1TD Noche → 76 kWh Open (L–V 0–8, S/D 0–18)', () => {
  const r = calcularOfertaLuz({ ...SEPT, producto: OPEN_61TD, modalidadId: 'noche', curva: curvaSemana() });
  near(r.kwhOpen, 76, 1e-9);
  near(r.energia, 76 * 0.090191 + 92 * 0.157354, 1e-6);
});

test('curva distinta del facturado: se reparte el FACTURADO con las fracciones de la curva', () => {
  const r = calcularOfertaLuz({ ...SEPT, kwhPeriodo: [0, 0, 90, 35, 0, 88], producto: OPEN_30TD, modalidadId: 'dia', curva: curvaSemana() });
  near(r.kwhOpen, 157, 1e-9);
  near(r.kwhNoOpen, 56, 1e-9);
  assert.ok(r.avisos.some(a => a.includes('se respeta el consumo facturado')));
});

test('factura A (6.1TD, P6 = 451 kW) → Open 6.1TD no elegible, sin tocar potencias', () => {
  const r = calcularOfertaLuz({
    producto: OPEN_61TD, modalidadId: 'plana', potenciasKw: [280, 280, 280, 280, 280, 451], dias: 31,
    periodo: { desde: '2025-11-30', hasta: '2025-12-31' }, kwhPeriodo: [27263, 16448, 0, 0, 0, 31048],
    ivaRate: 0.21, fechaOferta: HOY,
  });
  assert.equal(r.estado, ESTADO.NO_ELEGIBLE);
  assert.ok(r.motivos[0].includes('451'));
});

test('Open 6.1TD sintético (280 kW en todos los periodos) — Plana, Día y Noche', () => {
  const base = {
    producto: OPEN_61TD, potenciasKw: [280, 280, 280, 280, 280, 280], dias: 31,
    periodo: { desde: '2025-11-30', hasta: '2025-12-31' }, kwhPeriodo: [27263, 16448, 0, 0, 0, 31048],
    mantenidos: { bonoSocial: 0.40, alquiler: 65.23 }, ivaRate: 0.21, fechaOferta: HOY,
  };
  const d = { lab0_8: 10000, d0_8: 8000, d8_18: 9000, d18_24: 4048 };
  near(calcularOfertaLuz({ ...base, modalidadId: 'plana' }).total, 14404.42);
  near(calcularOfertaLuz({ ...base, modalidadId: 'dia', desgloseP6: d }).total, 14810.04);
  near(calcularOfertaLuz({ ...base, modalidadId: 'noche', desgloseP6: d }).total, 14834.90);
});

test('límites de potencia: 450 kW exactos elegible; 15 kW no entra en Open 3.0TD', () => {
  const b = { producto: OPEN_61TD, modalidadId: 'plana', dias: 30, kwhPeriodo: [1, 0, 0, 0, 0, 1], fechaOferta: HOY };
  assert.equal(calcularOfertaLuz({ ...b, potenciasKw: [450, 450, 450, 450, 450, 450] }).tramo, '100–450 kW');
  const c = calcularOfertaLuz({ ...b, producto: OPEN_30TD, potenciasKw: [15, 15, 15, 15, 15, 15] });
  assert.equal(c.estado, ESTADO.NO_ELEGIBLE);
});

test('Simply 3.0TD: precio único, requiere autoconsumo y limita excedentes al importe de energía', () => {
  const b = { producto: SIMPLY_30TD, potenciasKw: [20, 20, 20, 20, 20, 20], dias: 30, kwhPeriodo: [1000, 800, 0, 0, 0, 1200], ivaRate: 0.21, fechaOferta: HOY };
  assert.equal(calcularOfertaLuz(b).estado, ESTADO.NO_ELEGIBLE);
  const r = calcularOfertaLuz({ ...b, tieneAutoconsumo: true, excedentesKwh: 500 });
  near(r.energia, 469.566, 1e-6);
  near(r.excedentes, 30, 1e-9);
  near(r.total, 668.45);
  const lim = calcularOfertaLuz({ ...b, tieneAutoconsumo: true, excedentesKwh: 10000 });
  near(lim.excedentes, 469.566, 1e-6);
  near(lim.total, 109.38);
});

test('Simply 6.1TD: pendiente de confirmación → no disponible; con simulación explícita usa 6 precios', () => {
  const b = { producto: SIMPLY_61TD, potenciasKw: [100, 100, 100, 100, 100, 100], dias: 30, kwhPeriodo: [1000, 1000, 1000, 1000, 1000, 1000], tieneAutoconsumo: true, ivaRate: 0.21, fechaOferta: '2026-09-17' };
  assert.equal(calcularOfertaLuz(b).estado, ESTADO.NO_DISPONIBLE);
  const r = calcularOfertaLuz({ ...b, ignorarVigencia: true });
  near(r.total, 1861.33);
  assert.ok(r.avisos[0].includes('Pendiente de confirmación'));
});

test('TEMPO 2.0TD: precio único 24 h, potencia P1/P2 propia y límite 15 kW', () => {
  const b = { producto: TEMPO_2_0TD, potenciasKw: [4.6, 4.6], dias: 30, kwhPeriodo: [100, 80, 120], ivaRate: 0.21, fechaOferta: HOY };
  near(calcularOfertaLuz(b).total, 81.70);
  assert.equal(calcularOfertaLuz({ ...b, potenciasKw: [16, 16] }).estado, ESTADO.NO_ELEGIBLE);
});

test('ofertas fuera de su ventana de contratación no se presentan como válidas', () => {
  const b = { ...APOLO, modalidadId: 'plana' };
  assert.equal(calcularOfertaLuz({ ...b, fechaOferta: '2026-09-28' }).estado, ESTADO.NO_DISPONIBLE);
  assert.equal(calcularOfertaLuz({ ...b, producto: INDEXADA_30TD, omie: 0.05 }).estado, ESTADO.NO_DISPONIBLE);
});

test('gas RL.4 (Gas Estable): fijo prorrateado, variable sin descuento e impuesto de hidrocarburos', () => {
  const r = calcularOfertaGas({ producto: GAS_EMPRESA[0], kwh: 20000, dias: 31, alquiler: 5, ivaRate: 0.21, consumoAnualKwh: 150000, fechaOferta: HOY });
  assert.equal(r.estado, ESTADO.OK);
  near(r.fijo, 42.43);
  near(r.ieh, 46.80);
  near(r.total, 2318.68);
  assert.equal(calcularOfertaGas({ producto: GAS_EMPRESA[0], kwh: 20000, dias: 31, consumoAnualKwh: 400000, fechaOferta: HOY }).estado, ESTADO.NO_ELEGIBLE);
  assert.equal(calcularOfertaGas({ producto: GAS_EMPRESA[0], kwh: 20000, dias: 31, fechaOferta: '2026-09-21' }).estado, ESTADO.NO_DISPONIBLE);
});

test('gas RL.1 (B2C) con IEH y precio sin cambios', () => {
  const r = calcularOfertaGas({ producto: GAS[0], kwh: 300, dias: 30, ivaRate: 0.21, fechaOferta: HOY });
  near(r.total, 33.23);
});

test('precios B2C sin cambios', () => {
  const [directo, prescriptor, toc] = LUZ;
  assert.deepEqual(directo.sinMant, { promo: 0.109, noPromo: 0.160294 });
  assert.deepEqual(directo.conMant, { promo: 0.104191, noPromo: 0.160294 });
  assert.deepEqual(prescriptor.sinMant, { promo: 0.128235, noPromo: 0.160294 });
  assert.equal(toc.sinMant.promoH, 0.110250);
  assert.equal(directo.potPunta, 34.188);
  assert.equal(LUZ_SOLAR[1].energiaConsumida.promo, 0.148707);
  assert.equal(GAS[0].sinMant.promo, 0.065590);
  assert.equal(GAS[2].terFijo, 30.672);
  for (const t of [...LUZ, ...LUZ_SOLAR, ...GAS]) assert.equal(t.contratacion.extensionInterna, true);
  assert.equal(LUZ[0].contratacion.hasta, '2026-09-27');
  assert.equal(GAS[0].contratacion.hasta, '2026-09-20');
});

test('ahorro: fórmula sobre el coste actual, negativo permitido, coste actual cero controlado', () => {
  const a = calcularAhorro(1000, 800);
  near(a.ahorroEur, 200, 1e-9);
  near(a.ahorroPct, 20, 1e-9);
  const neg = calcularAhorro(4060.28, 4067.59);
  assert.ok(neg.ahorroEur < 0);
  assert.equal(calcularAhorro(0, 10).ahorroPct, null);
  near(extrapolarAnual(31, 31), 365, 1e-9);
  assert.equal(extrapolarAnual(10, 0), null);
});

test('factura C (Plenitude julio 2025) con Open 3.0TD Plana: resultado desfavorable, no se fuerza ahorro', () => {
  const r = calcularOfertaLuz({
    ...APOLO, kwhPeriodo: [6443, 4650, 0, 0, 0, 6964], periodo: { desde: '2025-07-01', hasta: '2025-07-31' },
    mantenidos: { excesos: 43.70, reactiva: 122.97, alquiler: 8.15, bonoSocial: 0 }, modalidadId: 'plana',
  });
  near(r.total, 4067.59);
  assert.ok(calcularAhorro(4060.28, r.total).ahorroEur < 0);
});
