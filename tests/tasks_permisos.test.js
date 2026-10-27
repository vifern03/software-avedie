/** Permisos de UI de Tasks — reglas de docs/tasks/CONTRATO.md. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/lib/tasksPermisos.js';

const admin = { username: 'admin', role: 'admin' };
const man = { username: 'man1', role: 'manager' };
const man2 = { username: 'man2', role: 'manager' };
const com = { username: 'com1', role: 'comercial' };
const com2 = { username: 'com2', role: 'comercial' };

const deMan = { created_by: 'man1', assignee: 'com1' };
const personalCom = { created_by: 'com1', assignee: 'com1' };
const deMan2 = { created_by: 'man2', assignee: 'man1' };

test('visibilidad: admin todo; resto creador o responsable', () => {
  assert.ok(P.puedeVer(admin, deMan));
  assert.ok(P.puedeVer(man, deMan));
  assert.ok(P.puedeVer(com, deMan));
  assert.ok(!P.puedeVer(com2, deMan));
  assert.ok(P.puedeVer(man, deMan2));
  assert.ok(!P.puedeVer(null, deMan));
});

test('crear para otros: admin y manager; comercial no', () => {
  assert.ok(P.puedeCrearParaOtros(admin));
  assert.ok(P.puedeCrearParaOtros(man));
  assert.ok(!P.puedeCrearParaOtros(com));
});

test('editar / mover / archivar: admin o creador', () => {
  for (const f of [P.puedeEditar, P.puedeMover, P.puedeArchivar]) {
    assert.ok(f(admin, deMan));
    assert.ok(f(man, deMan));
    assert.ok(!f(com, deMan), 'el responsable no creador no edita');
    assert.ok(f(com, personalCom));
    assert.ok(!f(man, deMan2), 'responsable manager de tarea ajena no edita');
  }
});

test('reasignar: admin, o creador manager', () => {
  assert.ok(P.puedeReasignar(admin, deMan));
  assert.ok(P.puedeReasignar(man, deMan));
  assert.ok(!P.puedeReasignar(man2, deMan));
  assert.ok(!P.puedeReasignar(man, deMan2));
  assert.ok(!P.puedeReasignar(com, personalCom), 'comercial creador no reasigna');
});

test('cambiar estado: admin, creador o responsable; comentar: quien ve', () => {
  assert.ok(P.puedeCambiarEstado(admin, deMan));
  assert.ok(P.puedeCambiarEstado(man, deMan));
  assert.ok(P.puedeCambiarEstado(com, deMan));
  assert.ok(!P.puedeCambiarEstado(com2, deMan));
  assert.ok(P.puedeComentar(com, deMan));
  assert.ok(!P.puedeComentar(com2, deMan));
});

test('responsable no creador: solo estado y comentarios', () => {
  assert.deepEqual(P.permisosTarea(com, deMan), {
    ver: true, editar: false, mover: false, archivar: false, reasignar: false, cambiarEstado: true, comentar: true,
  });
});

test('color, equipo, pestañas y vistas por rol', () => {
  assert.ok(P.puedeCambiarColor(admin));
  assert.ok(!P.puedeCambiarColor(man));
  assert.deepEqual(P.vistasDisponibles(com), ['lista', 'calendario']);
  assert.deepEqual(P.vistasDisponibles(man), ['lista', 'calendario', 'equipo']);
  assert.ok(!P.pestanasDisponibles(com).includes('asignadas'));
  assert.ok(P.pestanasDisponibles(man).includes('asignadas'));
  assert.ok(!P.pestanasDisponibles(man).includes('todas'));
  assert.ok(P.pestanasDisponibles(admin).includes('todas'));
});
