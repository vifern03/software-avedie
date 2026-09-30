import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOfertaLuz } from '../src/lib/energia/motor.js';
import { OPEN_30TD } from '../src/data/tarifasB2B.js';
import { construirInforme, eurES } from '../src/lib/energia/informe.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Factura B (Apolo 3.0TD, julio 2026): original 6.372,76 € con IE 255,78 € e IVA 1.106,02 €
const ENTRADA = {
  producto: OPEN_30TD, modalidadId: 'plana', potenciasKw: [49, 63, 63, 63, 63, 63], dias: 31,
  periodo: { desde: '2026-07-01', hasta: '2026-07-31' }, kwhPeriodo: [7170, 5156, 0, 0, 0, 9928],
  mantenidos: { excesos: 53.33, reactiva: 124.56, alquiler: 8.15, bonoSocial: 0.77 }, ivaRate: 0.21, fechaOferta: '2026-09-30',
};
const r = calcularOfertaLuz(ENTRADA);
const informe = (resultado, extra = {}) => construirInforme({
  resultado, oferta: 'Open 3.0TD — Plana', cliente: 'CLIENTE', cups: 'ES00',
  fechaInforme: '30 de septiembre de 2026', dias: 31, facturaOriginal: 6372.76, ...extra,
});
const m = informe(r);

test('informe Apolo: factura completa frente a oferta Plana', () => {
  near(m.totalOferta, 5086.13);
  near(m.ahorroEur, 1286.63);
  near(m.ahorroPct, 25.30);          // sobre el total con Endesa: 1.286,63 / 5.086,13
  near(m.ahorroAnual, 15149.03, 0.15); // 1.286,63 / 31 × 365
  assert.equal(m.facturaOriginal, 6372.76);
  assert.equal(m.comparable, 6372.76); // no se excluye nada por defecto
});

test('informe: conceptos adicionales mantenidos; IE e IVA recalculados sobre sus bases', () => {
  assert.deepEqual(m.otros.slice(0, 3).map(a => [a.detalle, a.importe]), [
    ['Excesos de Potencia', 53.33], ['Energía Reactiva', 124.56], ['Financiación Bono Social', 0.77],
  ]);
  const ie = m.otros.find(i => i.detalle.startsWith('Impuesto Eléctrico (5,11%) sobre '));
  near(ie.importe, (253.93 + 3558.61 + 53.33 + 124.56 + 0.77) * 0.0511269632);
  assert.notEqual(ie.importe.toFixed(2), '255.78'); // no se copia el importe antiguo
  const iva = m.otros.find(i => i.detalle.startsWith('IVA (21%) sobre '));
  near(iva.importe, r.baseIVA * 0.21, 1e-9);
  assert.ok(m.otros.some(i => i.detalle === 'Alquiler de Contador' && i.importe === 8.15));
  // sumas del informe = total
  const suma = m.subtotalPotencia + m.subtotalEnergia + m.otros.reduce((a, b) => a + b.importe, 0);
  near(suma, m.totalOferta, 1e-6);
});

test('informe: desglose por período, sin notas y formato español', () => {
  assert.equal(m.potencia.length, 6);
  assert.equal(m.potencia[0].detalle, '49 kW (P1) × 31 días × 0.059937 €/kW');
  assert.deepEqual(m.energia.map(e => e.detalle), [
    '7170 kWh (P1) × 0.159909 €/kWh', '5156 kWh (P2) × 0.159909 €/kWh', '9928 kWh (P6) × 0.159909 €/kWh',
  ]);
  assert.equal(m.notas, undefined);
  assert.equal(eurES(1480.6), '1.480,60 €');
  assert.equal(eurES(4892.16), '4.892,16 €');
});

test('informe Día: el P6 sale en dos líneas, mitad a cada precio, sin mencionar el criterio', () => {
  const d = informe(calcularOfertaLuz({ ...ENTRADA, modalidadId: 'dia' }), { oferta: 'Open 3.0TD — Día' });
  assert.deepEqual(d.energia.map(e => e.detalle), [
    '7170 kWh (P1) × 0.141634 €/kWh', '5156 kWh (P2) × 0.141634 €/kWh',
    '4964 kWh (P6) × 0.141634 €/kWh', '4964 kWh (P6) × 0.187322 €/kWh',
  ]);
  near(d.subtotalEnergia, 17290 * 0.141634 + 4964 * 0.187322, 1e-6);
  near(d.totalOferta, 4857.33);
});

test('informe: si sale sobrecoste, el porcentaje se mide sobre la factura actual', () => {
  const s = informe(r, { facturaOriginal: 4000 });
  near(s.ahorroEur, -1086.13);
  near(s.ahorroPct, 27.15);          // 1.086,13 / 4.000
  assert.ok(s.ahorroAnual < 0);
});
