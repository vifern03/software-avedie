import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OPEN_30TD, OPEN_61TD, SIMPLY_30TD, TEMPO_2_0TD } from '../src/data/tarifasB2B.js';
import { GAS } from '../src/data/tarifasGas.js';
import { TARIFAS, aplicarVersion, filtrarPermitidas, rutasDe, valoresActuales } from '../src/lib/tarifas/registro.js';
import { obtenerTarifa } from '../src/lib/tarifas/obtenerTarifa.js';
import { calcularCambios, limpiarRespuesta, promptTarifa, validarActualizacion } from '../src/lib/tarifas/actualizador.js';

const fixture = (id) => JSON.parse(readFileSync(`tests/fixtures/tarifa_ia_${id}.json`, 'utf8'));

for (const id of ['open30', 'open61', 'tempo']) {
  test(`hoja real ${id}: la IA extrae los precios de src/data y la comprobación pasa`, () => {
    const limpio = limpiarRespuesta(id, fixture(id));
    const r = validarActualizacion(id, limpio);
    assert.deepEqual(r.errores, []);
    assert.equal(limpio.validaDesde, '2026-10-19');
    assert.equal(limpio.validaHasta, '2026-10-28');
    const { cambios } = calcularCambios(id, limpio.valores);
    assert.deepEqual(cambios, {}, 'los precios leídos coinciden con los de src/data');
  });
}

test('hoja con un precio alterado: guardado bloqueado (Open y TEMPO)', () => {
  const a = limpiarRespuesta('open30', fixture('open30'));
  a.valores['matrix.0.0'] = 0.17;
  assert.ok(validarActualizacion('open30', a).errores.length > 0);
  const b = limpiarRespuesta('tempo', fixture('tempo'));
  b.valores['energia.promo'] = 0.2;
  assert.ok(validarActualizacion('tempo', b).errores.length > 0);
});

test('6.1TD: Noche al 35 % en la tarifa y en la hoja', () => {
  assert.equal(OPEN_61TD.modalidades[4].dto, 35);
  assert.equal(limpiarRespuesta('open61', fixture('open61')).valores['modalidades.4.dto'], 35);
  assert.equal(OPEN_30TD.modalidades[4].dto, 55);
});

test('lista blanca: claves no permitidas se descartan', () => {
  const r = limpiarRespuesta('open30', { valores: { 'baseEnergia.0': 0.3, nombre: 'X', 'tramos.0.max': 5, 'matrix.0.0': 'no' } });
  assert.deepEqual(r.valores, { 'baseEnergia.0': 0.3 });
  assert.deepEqual(r.descartadas.sort(), ['matrix.0.0', 'nombre', 'tramos.0.max']);
  assert.deepEqual(filtrarPermitidas('open30', { penalizacion: 1 }), {});
});

test('más de 6 decimales, negativo y fechas incoherentes se bloquean', () => {
  const r = validarActualizacion('rl1', { valores: { terFijo: 7.1234567 }, validaDesde: '2026-11-02', validaHasta: '2026-11-01' });
  assert.ok(r.errores.some((e) => /6 decimales/.test(e)));
  assert.ok(r.errores.some((e) => /anterior/.test(e)));
  assert.ok(validarActualizacion('rl1', { valores: { terFijo: -1 }, validaDesde: '2026-11-01', validaHasta: '2026-11-02' }).errores.some((e) => /negativo/.test(e)));
});

test('variación > 30 % en el resto de tarifas: aviso que no bloquea', () => {
  const r = validarActualizacion('rl1', { valores: { terFijo: 20 }, validaDesde: '2026-11-01', validaHasta: '2026-11-02' });
  assert.deepEqual(r.errores, []);
  assert.ok(r.avisos.terFijo);
});

test('todas las tarifas tienen rutas válidas y prompt', () => {
  for (const id of Object.keys(TARIFAS)) {
    assert.ok(rutasDe(id).length > 0, id);
    assert.match(promptTarifa(id), /Rutas permitidas/);
  }
});

test('NO REGRESIÓN: sin versiones, obtenerTarifa devuelve src/data sin tocar', () => {
  const antes = JSON.stringify([OPEN_30TD, OPEN_61TD, SIMPLY_30TD, TEMPO_2_0TD, GAS]);
  const o = obtenerTarifa('open30', '2026-10-20');
  assert.equal(o.tarifa, OPEN_30TD);
  assert.equal(o.versionId, null);
  assert.equal(o.estado, 'vigente');
  assert.equal(JSON.stringify([OPEN_30TD, OPEN_61TD, SIMPLY_30TD, TEMPO_2_0TD, GAS]), antes);
  assert.equal(obtenerTarifa('open30', '2026-10-31').estado, 'caducada');
});

test('aplicar versión: solo rutas permitidas, sin contagiar a Simply; validez nueva', () => {
  const simply = SIMPLY_30TD.potenciaTerminos[0].anyo;
  const base = valoresActuales('open30');
  aplicarVersion('open30', {
    id: 'v1', version: 1, valida_desde: '2026-11-01', valida_hasta: '2026-11-10',
    valores: { 'baseEnergia.0': 0.3, 'potenciaTerminos.0.anyo': 22, nombre: 7 },
  });
  assert.equal(OPEN_30TD.baseEnergia[0], 0.3);
  assert.equal(OPEN_30TD.potenciaTerminos[0].anyo, 22);
  assert.equal(SIMPLY_30TD.potenciaTerminos[0].anyo, simply);
  assert.equal(OPEN_30TD.nombre, 'Open 3.0TD');
  assert.equal(OPEN_30TD.validez, 'del 01/11/2026 hasta el 10/11/2026');
  const o = obtenerTarifa('open30', '2026-11-05');
  assert.equal(o.versionId, 'v1');
  assert.equal(o.estado, 'vigente');
  // deja la tarifa como estaba para el resto de pruebas
  aplicarVersion('open30', { id: null, version: 0, valida_desde: '2026-10-19', valida_hasta: '2026-10-28', valores: base });
  TARIFAS.open30.versionActiva = null;
});

test('hoja de otra tarifa: se bloquea con un mensaje claro', () => {
  const hoja30 = fixture('open30');
  const enOpen61 = validarActualizacion('open61', limpiarRespuesta('open61', { ...hoja30, es_esta_tarifa: false }));
  assert.equal(enOpen61.errores.length, 1);
  assert.match(enOpen61.errores[0], /no es de la tarifa Open 6\.1TD \(parece ser: 3\.0TD OPEN\)/);
});

test('si la IA se equivoca, el peaje del documento la corrige', () => {
  const r = validarActualizacion('open61', limpiarRespuesta('open61', { ...fixture('open30'), es_esta_tarifa: true }));
  assert.match(r.errores[0], /no es de la tarifa Open 6\.1TD/);
});

test('documento que no es una hoja de tarifas: bloqueado aunque traiga números', () => {
  const r = validarActualizacion('conecta', limpiarRespuesta('open30', { valores: { 'baseEnergia.0': 0.3 }, valida_desde: '2026-11-01', valida_hasta: '2026-12-01' }));
  assert.match(r.errores[0], /no es de la tarifa/);
});
