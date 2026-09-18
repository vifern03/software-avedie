import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcularOfertaLuz } from '../src/lib/energia/motor.js';
import { OPEN_30TD } from '../src/data/tarifasB2B.js';
import { construirInforme, eurES, NOTA_BASE } from '../src/lib/energia/informe.js';

const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Factura B (Apolo 3.0TD, julio 2026): original 6.372,76 € con IE 255,78 € e IVA 1.106,02 €
const r = calcularOfertaLuz({
  producto: OPEN_30TD, modalidadId: 'plana', potenciasKw: [49, 63, 63, 63, 63, 63], dias: 31,
  periodo: { desde: '2026-07-01', hasta: '2026-07-31' }, kwhPeriodo: [7170, 5156, 0, 0, 0, 9928],
  mantenidos: { excesos: 53.33, reactiva: 124.56, alquiler: 8.15, bonoSocial: 0.77 }, ivaRate: 0.21, fechaOferta: '2026-09-18',
});
const m = construirInforme({
  resultado: r, oferta: 'Open 3.0TD — Plana', cliente: 'CLIENTE', cups: 'ES00',
  fechaInforme: '18 de septiembre de 2026', periodo: { desde: '2026-07-01', hasta: '2026-07-31' }, dias: 31,
  fechaEmision: '2026-09-01', facturaOriginal: 6372.76,
});

test('informe Apolo: factura completa frente a oferta Plana', () => {
  near(m.totalOferta, 4892.16);
  near(m.ahorroEur, 1480.60);
  assert.equal(m.ahorroPct, 23.23);
  assert.equal(m.facturaOriginal, 6372.76);
  assert.equal(m.comparable, 6372.76); // no se excluye nada por defecto
});

test('informe: conceptos adicionales mantenidos; IE e IVA recalculados sobre sus bases', () => {
  assert.deepEqual(m.adicionales.map(a => [a.concepto, a.importe]), [
    ['Excesos de potencia', 53.33], ['Energía reactiva', 124.56], ['Financiación del bono social', 0.77],
  ]);
  const ie = m.impuestos.find(i => i.concepto === 'Impuesto sobre la electricidad');
  near(ie.importe, (253.93 + 3406.11 + 53.33 + 124.56 + 0.77) * 0.0511269632);
  assert.notEqual(ie.importe.toFixed(2), '255.78'); // no se copia el importe antiguo
  const iva = m.impuestos.find(i => i.concepto.startsWith('IVA'));
  near(iva.importe, r.baseIVA * 0.21, 1e-9);
  assert.ok(m.impuestos.some(i => i.concepto === 'Alquiler de equipos de medida' && i.importe === 8.15));
  // sumas del informe = total
  const suma = m.subtotalPotencia + m.subtotalEnergia + m.adicionales.reduce((a, b) => a + b.importe, 0) + m.impuestos.reduce((a, b) => a + b.importe, 0);
  near(suma, m.totalOferta, 1e-6);
});

test('informe: desglose por período, única nota y formato español', () => {
  assert.equal(m.potencia.length, 6);
  assert.ok(m.potencia[0].detalle.startsWith('49 kW × 31 días'));
  assert.deepEqual(m.energia.map(e => e.concepto), ['Energía P1', 'Energía P2', 'Energía P6']);
  assert.deepEqual(m.notas, [NOTA_BASE]);
  assert.equal(eurES(1480.6), '1.480,60 €');
  assert.equal(eurES(4892.16), '4.892,16 €');
});
