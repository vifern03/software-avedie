import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buscarEnFilas, validarCups } from '../src/lib/distribuidoras.js';

// Carga el CSV real de la semilla
function filasCsv() {
  const lineas = readFileSync('supabase/seeds/distribuidoras_seed.csv', 'utf8').trim().split(/\r?\n/);
  const col = (l) => [...l.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1]);
  const cab = col(lineas[0]);
  return lineas.slice(1).map((l) => Object.fromEntries(col(l).map((v, i) => [cab[i], v])));
}
const filas = filasCsv();
const mapa = Object.fromEntries(filas.map((f) => [f.prefijo_cups, { ...f, verificado: f.verificado === 'true' }]));
const buscar = (cups) => buscarEnFilas(cups, (p) => mapa[p]);

test('la semilla trae 357 filas y 3 textos de Endesa', () => {
  assert.equal(filas.length, 357);
  assert.equal(filas.filter((f) => f.texto_endesa).length, 3);
});
test('i-DE (0021) devuelve el texto BZZ', () => {
  assert.equal(buscar('ES0021000000000000XX0F').texto_endesa, 'BZZ - I-DE REDES ELECTRIC INTELI SAU - ES0021');
});
test('UFD (0022) devuelve el texto NZZ', () => {
  assert.equal(buscar('ES0022000000000000XX1P').texto_endesa, 'NZZ - UNION FENOSA DISTRIBUCION,S.A. - ES0022');
});
test('e-distribución zona 50: GZZ por 6 dígitos', () => {
  const r = buscar('ES0031500000000000XX0F');
  assert.equal(r.prefijo, '003150');
  assert.match(r.texto_endesa, /^GZZ - /);
});
test('e-distribución sin texto de Endesa: queda obligatorio', () => {
  const r = buscar('ES0031100000000000XX0F');
  assert.equal(r.prefijo, '0031');
  assert.equal(r.texto_endesa, null);
});
test('prefijo inexistente y formato inválido', () => {
  assert.match(buscar('ES9998000000000000XX0F').error, /no encontrada/);
  assert.match(buscar('ES0021').error, /formato/);
  assert.equal(validarCups('es0021 0000 0000 0000 xx0f'), true);
  assert.equal(validarCups('ES002100000000000XX0F'), false);
});
