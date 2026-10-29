/** Edición y borrado de Gestión de Pendientes. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  valorCampo, validarEdicion, cambiosEdicion, updateDesdeCambios, describirCambios,
  puedeGestionarPendientes, etiquetaRegistro, parseFechaExcel,
} from '../src/lib/pendientesEdicion.js';

const reg = {
  id: 1, cups: 'ES001', nombre: 'OI-1', numero_caso: null, fecha_creacion_excel: '3/10/2026',
  estado_incidencia: 'Pendiente de tareas', raw_data: { 'Número del caso': 'C-9', Nombre: 'OI-viejo' },
};
const formDe = (r) => ({
  nombre: valorCampo(r, 'nombre'), cups: valorCampo(r, 'cups'), numero_caso: valorCampo(r, 'numero_caso'),
  fecha_creacion_excel: valorCampo(r, 'fecha_creacion_excel'), estado_incidencia: valorCampo(r, 'estado_incidencia'),
});

test('permisos: solo admin y manager gestionan', () => {
  assert.ok(puedeGestionarPendientes({ role: 'admin' }));
  assert.ok(puedeGestionarPendientes({ role: 'Manager' }));
  assert.ok(!puedeGestionarPendientes({ role: 'comercial' }));
  assert.ok(!puedeGestionarPendientes(null));
});

test('valorCampo: la columna manda; null cae a raw_data; vacío se respeta', () => {
  assert.equal(valorCampo(reg, 'nombre'), 'OI-1');
  assert.equal(valorCampo(reg, 'numero_caso'), 'C-9');
  assert.equal(valorCampo({ ...reg, nombre: '' }, 'nombre'), '');
  assert.equal(valorCampo({ ...reg, estado_incidencia: null }, 'estado_incidencia'), 'Pendiente de tareas');
});

test('sin cambios no hay diferencias', () => {
  assert.deepEqual(cambiosEdicion(reg, formDe(reg)), []);
});

test('cambios con de → a y update correspondiente', () => {
  const form = { ...formDe(reg), nombre: ' OI-2 ', estado_incidencia: 'Formalizado' };
  const cambios = cambiosEdicion(reg, form);
  assert.deepEqual(cambios.map(c => c.key), ['nombre', 'estado_incidencia']);
  assert.equal(describirCambios(cambios), 'Nº OI: "OI-1" → "OI-2"; Estado: "Pendiente de tareas" → "Formalizado"');
  assert.deepEqual(updateDesdeCambios(cambios, 'T'), { nombre: 'OI-2', estado_incidencia: 'Formalizado', fecha_formalizacion: 'T' });
  const vuelta = updateDesdeCambios(cambiosEdicion({ ...reg, estado_incidencia: 'Formalizado' }, formDe(reg)), 'T');
  assert.deepEqual(vuelta, { estado_incidencia: 'Pendiente de tareas', fecha_formalizacion: null });
});

test('validación: CUPS obligatorio, fecha D/M/AAAA, estado conocido', () => {
  assert.equal(validarEdicion(formDe(reg)), null);
  assert.match(validarEdicion({ ...formDe(reg), cups: '  ' }), /CUPS/);
  assert.match(validarEdicion({ ...formDe(reg), fecha_creacion_excel: '2026-13' }), /fecha/);
  assert.equal(validarEdicion({ ...formDe(reg), fecha_creacion_excel: '' }), null);
  assert.match(validarEdicion({ ...formDe(reg), estado_incidencia: 'X' }), /Estado/);
});

test('parseFechaExcel y etiqueta', () => {
  assert.equal(parseFechaExcel('3/10/2026'), new Date(2026, 9, 3).getTime());
  assert.equal(parseFechaExcel('hola'), null);
  assert.equal(etiquetaRegistro({ id: 5, cups: 'ES9', nombre: null }), 'ES9');
});
