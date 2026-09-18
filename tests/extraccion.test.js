/**
 * Validación determinista de extracciones.
 *  - Reconstrucción de las 3 facturas reales a partir de sus referencias
 *    anonimizadas (revisadas a mano contra el PDF).
 *  - Casos sintéticos independientes para no adaptar el validador solo a esas 3.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validarExtraccion, precioAEuros, maximetroKw, parsearRespuestaModelo } from '../src/lib/energia/extraccion.js';

const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/${n}.json`, import.meta.url), 'utf8'));
const A = fx('factura_a_iberdrola_61td');
const B = fx('factura_b_apolo_30td');
const C = fx('factura_c_plenitude_30td');
const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const IE = 0.0511269632;

/** Reconstrucción independiente: suma de líneas + IE + alquiler + IVA. */
function reconstruir(f) {
  const eLin = f.energiaLineas.reduce((a, l) => a + l.importe, 0);
  const pLin = f.potenciaLineas.reduce((a, l) => a + l.importe, 0);
  const i = f.importes;
  const baseIE = pLin + eLin + (i.excesosPotencia || 0) + (i.reactiva || 0) + (i.bonoSocial || 0);
  const ie = Math.round(baseIE * IE * 100) / 100;
  const baseIVA = baseIE + ie + (i.alquilerEquipos || 0);
  const iva = Math.round(baseIVA * i.tipoIVAPct) / 100;
  return { eLin, pLin, baseIE, ie, baseIVA, total: baseIVA + iva };
}

test('factura A (Iberdrola 6.1TD): reconstrucción del total 14.504,19 €', () => {
  const r = reconstruir(A);
  near(r.eLin, 9938.14);          // energía OMIE + peajes + cargos
  near(r.pLin, 1403.29);
  near(r.baseIE, 11341.83);
  near(r.ie, 579.87);
  near(r.total, 14504.19);
  assert.equal(A.consumoFacturadoKwh.reduce((a, b) => a + b, 0), 74759);
});

test('factura B (Apolo 3.0TD): reconstrucción del total 6.372,76 € con precios en c€', () => {
  const r = reconstruir(B);
  near(r.eLin, 4616.60);          // 3.932,96 energía + 683,64 acceso
  near(r.pLin, 207.55);
  near(r.ie, 255.78);
  near(r.baseIVA, 5266.74);
  near(r.total, 6372.76);
  assert.equal(B.consumoFacturadoKwh.reduce((a, b) => a + b, 0), 22254);
});

test('factura C (Plenitude 3.0TD): reconstrucción 4.060,28 € sin restar el descuento informativo', () => {
  const r = reconstruir(C);
  near(r.eLin, 2819.07);
  near(r.baseIE, 3184.63);
  near(r.ie, 162.82);             // 5,11269632 %, no 5,11 %
  near(r.total, 4060.28);
  assert.equal(C.consumoFacturadoKwh.reduce((a, b) => a + b, 0), 18057);
});

test('validador — factura A: sin errores, energía completa (no solo OMIE)', () => {
  const v = validarExtraccion(A);
  assert.equal(v.ok, true, JSON.stringify(v.incidencias));
  near(v.datos.importes.energiaTotal, 9938.14);
  assert.equal(v.datos.dias, 31);
  assert.ok(!v.incidencias.some(i => i.campo === 'lecturas'));
  assert.ok(v.incidencias.some(i => i.campo === 'fechaEmision'));
  assert.deepEqual(v.datos.potenciasKw, [280, 280, 280, 280, 280, 451]);
});

test('validador — factura B: detecta lecturas ≠ facturado y maxímetros en W; conserva el facturado', () => {
  const v = validarExtraccion(B);
  assert.equal(v.ok, true, JSON.stringify(v.incidencias));
  const lect = v.incidencias.find(i => i.campo === 'lecturas');
  assert.ok(lect && lect.nivel === 'aviso');
  assert.ok(lect.mensaje.includes('P1: lecturas 7269 kWh vs facturado 7170 kWh'));
  assert.deepEqual(v.datos.kwhPeriodo, [7170, 5156, 0, 0, 0, 9928]);
  assert.deepEqual(v.datos.maximetrosKw, [53, 57, 0, 0, 0, 50]);
  near(v.datos.importes.energiaTotal, 4616.60);
  assert.ok(!v.incidencias.some(i => i.campo === 'energiaLineas'), 'c€ convertidos correctamente');
});

test('validador — factura C: IE rotulado 5,11 %, descuento informativo y maxímetro del periodo', () => {
  const v = validarExtraccion(C);
  assert.equal(v.ok, true, JSON.stringify(v.incidencias));
  assert.ok(v.incidencias.some(i => i.campo === 'tipoImpuestoElectricoPct'));
  assert.ok(v.incidencias.some(i => i.campo === 'descuentosInformativos' && i.mensaje.includes('no se resta')));
  assert.deepEqual(v.datos.maximetrosKw, [60, 56, 0, 0, 0, 48]); // no los del año móvil
  near(v.datos.importes.total, 4060.28);
  assert.equal(v.datos.periodo.desde, '2025-07-01');
});

/* ── Casos sintéticos ─────────────────────────────────────────────────────── */

function sintetica(over = {}) {
  return {
    tarifaAcceso: '3.0TD', fechaEmision: '2026-10-05',
    periodoConsumo: { desde: '2026-08-15', hasta: '2026-09-14' }, diasFacturados: 31,
    potenciaContratadaKw: [20, 20, 20, 20, 20, 25], consumoFacturadoKwh: [100, 200, 300, 0, 0, 400],
    consumoTotalKwh: 1000,
    energiaLineas: [{ componente: 'energia', periodo: 'P1', kwh: 100, precio: 12.5, unidadPrecio: 'c€/kWh', importe: 12.5 }],
    potenciaLineas: [{ componente: 'potencia', periodo: 'P1', kw: 20, dias: 31, precio: 21.9, unidadPrecio: '€/kW año', importe: 37.20 }],
    importes: { total: 500, baseIVA: 413.22, tipoIVAPct: 21, iva: 86.78 },
    ...over,
  };
}

test('sintética: periodo que cruza agosto–septiembre, días y emisión posterior', () => {
  const v = validarExtraccion(sintetica());
  assert.equal(v.ok, true, JSON.stringify(v.incidencias));
  assert.equal(v.datos.dias, 31);
  assert.ok(v.incidencias.some(i => i.campo === 'fechaEmision'));
});

test('sintética: suma de periodos distinta del total impreso → error', () => {
  const v = validarExtraccion(sintetica({ consumoTotalKwh: 1200 }));
  assert.equal(v.ok, false);
});

test('sintética: ausente ≠ cero', () => {
  const v = validarExtraccion(sintetica({ consumoFacturadoKwh: [100, null, 0, null, null, 400], consumoTotalKwh: null }));
  assert.deepEqual(v.datos.kwhPeriodo, [100, null, 0, null, null, 400]);
});

test('sintética: unidad de precio mal leída (c€ declarado como €) → aviso', () => {
  const v = validarExtraccion(sintetica({ energiaLineas: [{ componente: 'energia', periodo: 'P1', kwh: 100, precio: 12.5, unidadPrecio: '€/kWh', importe: 12.5 }] }));
  assert.ok(v.incidencias.some(i => i.campo === 'energiaLineas'));
});

test('sintética: tipo de IVA como decimal → error; IVA inconsistente → aviso', () => {
  assert.equal(validarExtraccion(sintetica({ importes: { total: 500, baseIVA: 413.22, tipoIVAPct: 0.21, iva: 86.78 } })).ok, false);
  const v = validarExtraccion(sintetica({ importes: { total: 500, baseIVA: 413.22, tipoIVAPct: 10, iva: 86.78 } }));
  assert.ok(v.incidencias.some(i => i.campo === 'iva'));
});

test('sintética: días impresos incoherentes con las fechas → aviso', () => {
  const v = validarExtraccion(sintetica({ diasFacturados: 28 }));
  assert.ok(v.incidencias.some(i => i.campo === 'diasFacturados' && i.nivel === 'aviso'));
});

test('sintética: 2.0TD con consumo en P4–P6 → error', () => {
  const v = validarExtraccion(sintetica({ tarifaAcceso: '2.0TD', consumoFacturadoKwh: [1, 1, 1, 1, 0, 0], consumoTotalKwh: 4 }));
  assert.equal(v.ok, false);
});

test('conversiones de unidades', () => {
  assert.equal(precioAEuros(17.027, 'c€/kWh'), 0.17027);
  near(precioAEuros(5.5827, 'c€/kW día'), 0.055827, 1e-12);
  near(precioAEuros(21.876927, '€/kW año'), 0.059937, 1e-6);
  near(precioAEuros(1.823077, '€/kW mes'), 0.059937, 1e-6);
  assert.deepEqual(maximetroKw({ valor: 53000, unidad: 'W' }, 63).kw, 53);
  assert.equal(maximetroKw({ valor: 60, unidad: 'kW' }, 63).kw, 60);
  assert.equal(maximetroKw({ valor: 53000, unidad: null }, 63).supuesto, true);
});

test('parseo de respuestas del modelo con y sin bloque de código', () => {
  assert.deepEqual(parsearRespuestaModelo('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parsearRespuestaModelo('texto {"a":2} fin'), { a: 2 });
  assert.throws(() => parsearRespuestaModelo('sin json'));
});

test('factura A: total de energía devuelto por la IA (9938,05) distinto de la suma impresa (9938,14) → se usa la suma y se explica', () => {
  const v = validarExtraccion({ ...A, importes: { ...A.importes, energiaTotal: 9938.05 } });
  near(v.datos.importes.energiaTotal, 9938.14);
  const i = v.incidencias.find(x => x.campo === 'importes.energiaTotal');
  assert.ok(i.mensaje.includes('Probable suma propia del modelo'));
  const w = validarExtraccion({ ...A, importes: { ...A.importes, energiaTotal: 8261.58 } });
  assert.ok(w.incidencias.find(x => x.campo === 'importes.energiaTotal').mensaje.includes('peajes/cargos figuran aparte'));
});
