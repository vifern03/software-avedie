// «Actualizar tarifa»: casos que fallaban con las hojas del 02/12/2026 y su referencia
// (tests/fixtures/tarifas_esperadas_20261202.json, copiada a mano de los PDF de Endesa).
// Prueba la cadena completa SIN IA: respuesta de la IA → limpieza → validación →
// versión aplicada sobre una copia de la ficha → precios y textos finales.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TARIFAS, aplicarVersion, leerRuta, valoresActuales } from '../src/lib/tarifas/registro.js';
import { documentoAjeno, limpiarRespuesta, validarActualizacion } from '../src/lib/tarifas/actualizador.js';

const ref = JSON.parse(readFileSync('tests/fixtures/tarifas_esperadas_20261202.json', 'utf8'));

/** Aplica la versión sobre una copia de la ficha (no toca los objetos compartidos). */
function aplicarEnCopia(tarifaId, valores, desde = ref.desde, hasta = ref.hasta) {
  const t = TARIFAS[tarifaId];
  const real = t.objeto;
  const copia = structuredClone(real);
  t.objeto = copia;
  try {
    aplicarVersion(tarifaId, { id: 'test', version: 0, valores, valida_desde: desde, valida_hasta: hasta });
  } finally {
    t.objeto = real;
    delete t.versionActiva;
  }
  return copia;
}

/** Lo que devolvería la IA leyendo bien la hoja (gas: sin las rutas «con mantenimiento»). */
function respuestaIA(tarifaId) {
  const valores = { ...ref.tarifas[tarifaId].valores };
  if (TARIFAS[tarifaId].tipo === 'gas') { delete valores['conMant.promo']; delete valores['conMant.noPromo']; }
  const docs = { open30: 'Tarifa Open 3.0TD', open61: 'Tarifa Open 6.1TD', tempo: 'Tarifa TEMPO 2.0TD' };
  return { tarifa_documento: docs[tarifaId] || 'Tarifa Gas Estable', es_esta_tarifa: true, valida_desde: ref.desde, valida_hasta: ref.hasta, valores };
}

for (const tarifaId of Object.keys(ref.tarifas)) {
  test(`hojas 02/12/2026 · ${tarifaId}: se puede guardar y deja precios y textos como en el PDF`, () => {
    const limpio = limpiarRespuesta(tarifaId, respuestaIA(tarifaId));
    assert.deepEqual(validarActualizacion(tarifaId, limpio, valoresActuales(tarifaId)).errores, []);
    const ficha = aplicarEnCopia(tarifaId, limpio.valores);
    for (const [ruta, v] of Object.entries(ref.tarifas[tarifaId].valores)) assert.equal(leerRuta(ficha, ruta), v, ruta);
    for (const [ruta, v] of Object.entries(ref.tarifas[tarifaId].textos)) assert.equal(leerRuta(ficha, ruta), v, ruta);
    assert.deepEqual([ficha.contratacion.desde, ficha.contratacion.hasta], [ref.desde, ref.hasta]);
  });
}

test('gas sin mantenimiento: si la IA no trae «con mantenimiento», se copia de «sin mantenimiento»', () => {
  const limpio = limpiarRespuesta('rl4', respuestaIA('rl4'));
  assert.equal(limpio.valores['conMant.promo'], 0.105614);
  assert.equal(limpio.valores['conMant.noPromo'], 0.146686);
  // Aunque la IA devolviera otro valor, manda el «sin mantenimiento».
  const raro = respuestaIA('rl4');
  raro.valores['conMant.promo'] = 0.5;
  assert.equal(limpiarRespuesta('rl4', raro).valores['conMant.promo'], 0.105614);
});

test('el texto del descuento solo cambia si cambia el porcentaje', () => {
  const sinCambio = aplicarEnCopia('tempo', { 'energia.promo': TARIFAS.tempo.objeto.energia.promo });
  assert.equal(sinCambio.duracionDescuento, TARIFAS.tempo.objeto.duracionDescuento);
  const conCambio = aplicarEnCopia('open30', { extraAnyo: 9 });
  assert.match(conCambio.duracionDescuento, /^9% adicional/);
  assert.match(TARIFAS.open30.objeto.duracionDescuento, /^12% adicional/, 'la ficha real no se toca');
});

test('Open: «Horas No Open» que no cuadra con base × (1 − promo) bloquea', () => {
  const r = respuestaIA('open30');
  r.valores['horasNoOpen.0'] = 0.265956; // el de la hoja anterior (12 %)
  const { errores } = validarActualizacion('open30', limpiarRespuesta('open30', r), valoresActuales('open30'));
  assert.ok(errores.some((e) => /Horas No Open/.test(e)), errores.join(' | '));
});

test('potencia: €/kW·mes y €/kW·día que no cuadran con el anual bloquean (Open y TEMPO)', () => {
  const a = respuestaIA('open61');
  a.valores['potenciaTerminos.2.mes'] = 0.7;
  assert.ok(validarActualizacion('open61', limpiarRespuesta('open61', a), valoresActuales('open61')).errores.some((e) => /P3/.test(e)));
  const b = respuestaIA('tempo');
  b.valores['potencia.1.mes'] = 1.6;
  assert.ok(validarActualizacion('tempo', limpiarRespuesta('tempo', b), valoresActuales('tempo')).errores.some((e) => /P2/.test(e)));
});

test('gas: precio con descuento que no cuadra con base × (1 − descuento) bloquea', () => {
  const r = respuestaIA('rl5');
  r.valores['sinMant.promo'] = 0.114346; // el de la hoja anterior (22 %) con el descuento nuevo (28 %)
  const { errores } = validarActualizacion('rl5', limpiarRespuesta('rl5', r), valoresActuales('rl5'));
  assert.ok(errores.some((e) => /sinMant\.promo/.test(e)), errores.join(' | '));
});

test('documento con varios grupos (Gas Estable RL.4, RL.5 y RL.6): vale para esos grupos y no para otros', () => {
  const doc = { tarifaDocumento: 'Tarifa Gas Estable RL.4, RL.5 y RL.6', esEstaTarifa: true };
  assert.equal(documentoAjeno('rl4', doc), null);
  assert.equal(documentoAjeno('rl6', doc), null);
  assert.ok(documentoAjeno('rl1', doc));
});

test('Comparativas 2.0 no copia los precios al cargar el módulo (si no, ignora «Actualizar tarifa»)', () => {
  const src = readFileSync('src/pages/EstudioComparativo.jsx', 'utf8');
  assert.doesNotMatch(src, /^const TARIFAS = \[/m);
  assert.match(src, /const TARIFAS\s*=\s*construirTarifas\(\);/);
});
