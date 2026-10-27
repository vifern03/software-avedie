/** Lógica de Tasks: contadores/alertas del Sidebar, filtros, agrupación, estadísticas, historial y colores. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contadoresUsuario, alertaSidebar, textoBadge, filtrarTareas, agruparPorFecha, grupoDeTarea,
  estadisticasEquipo, describirEvento, diffCambios, enSegundaPersona, domingoDeSemana,
} from '../src/lib/tasksLogica.js';
import { PALETA, colorAutomatico, colorDeUsuario, hashTexto, iniciales } from '../src/lib/tasksColores.js';

const AHORA = new Date('2026-10-28T10:00:00Z'); // miércoles, 11:00 en Madrid
let n = 0;
const t = (x) => ({
  id: `t${++n}`, title: `Tarea ${n}`, status: 'pending', priority: 'normal', created_by: 'yo', assignee: 'yo',
  created_at: `2026-10-01T00:00:${String(n).padStart(2, '0')}Z`, ...x,
});
const yo = { username: 'yo', role: 'comercial' };
const admin = { username: 'admin', role: 'admin' };
const man = { username: 'man', role: 'manager' };

test('contadores: solo activas asignadas a mí (admin también solo las suyas)', () => {
  const tareas = [
    t({}), t({ due_date: '2026-10-27' }), t({ due_date: '2026-10-28' }),
    t({ status: 'in_progress' }), t({ status: 'completed' }), t({ archived_at: '2026-10-02T00:00:00Z' }),
    t({ assignee: 'otro' }), t({ created_by: 'admin', assignee: 'admin', due_date: '2026-10-01' }),
  ];
  assert.deepEqual(contadoresUsuario(tareas, 'yo', AHORA), { activas: 4, vencidas: 1, proximas: 1 });
  assert.deepEqual(contadoresUsuario(tareas, 'admin', AHORA), { activas: 1, vencidas: 1, proximas: 0 });
  assert.equal(alertaSidebar({ vencidas: 1, proximas: 3 }).nivel, 'vencida');
  assert.equal(alertaSidebar({ vencidas: 0, proximas: 2 }).nivel, 'proxima');
  assert.equal(alertaSidebar({ vencidas: 0, proximas: 0 }), null);
  assert.equal(textoBadge(99), '99');
  assert.equal(textoBadge(100), '99+');
});

test('agrupación por fecha (semana lunes–domingo)', () => {
  assert.equal(domingoDeSemana('2026-10-28'), '2026-11-01');
  assert.equal(domingoDeSemana('2026-11-01'), '2026-11-01');
  const g = (x) => grupoDeTarea(t(x), AHORA);
  assert.equal(g({ due_date: '2026-10-27' }), 'vencidas');
  assert.equal(g({ planned_date: '2026-10-26' }), 'anteriores');
  assert.equal(g({ planned_date: '2026-10-28' }), 'hoy');
  assert.equal(g({ due_date: '2026-10-29' }), 'manana');
  assert.equal(g({ planned_date: '2026-11-01' }), 'semana');
  assert.equal(g({ planned_date: '2026-11-02' }), 'despues');
  assert.equal(g({}), 'sinfecha');
  assert.equal(g({ status: 'completed', due_date: '2026-10-01' }), 'completadas');
  const grupos = agruparPorFecha([
    t({}), t({ planned_date: '2026-10-28', planned_time: '16:00' }),
    t({ planned_date: '2026-10-28', planned_time: '09:00' }), t({ due_date: '2026-10-20' }),
  ], AHORA);
  assert.deepEqual(grupos.map((x) => x.key), ['vencidas', 'hoy', 'sinfecha']);
  assert.deepEqual(grupos[1].tasks.map((x) => x.planned_time), ['09:00', '16:00']);
});

test('filtros: pestañas, visibilidad, búsqueda sin acentos y calendario', () => {
  const tareas = [
    t({ title: 'Llamar a Álvaro' }),
    t({ title: 'Revisar contrato', due_date: '2026-10-20' }),
    t({ title: 'Ajena', created_by: 'otro', assignee: 'otro2' }),
    t({ title: 'Delegada', created_by: 'man', assignee: 'yo', priority: 'urgent' }),
    t({ title: 'Hecha', status: 'completed', completed_at: '2026-10-27T10:00:00Z' }),
    t({ title: 'Asignada a com', created_by: 'yo', assignee: 'com' }),
    t({ title: 'Archivada', archived_at: '2026-10-02T00:00:00Z' }),
  ];
  const tit = (u, f) => filtrarTareas(tareas, u, f, AHORA).map((x) => x.title);
  assert.deepEqual(tit(yo, { pestana: 'mis' }), ['Llamar a Álvaro', 'Revisar contrato', 'Delegada']);
  assert.deepEqual(tit(yo, { pestana: 'vencidas' }), ['Revisar contrato']);
  // Lo delegado no aparece en Hoy y próximas / Vencidas / Sin fecha (está en "Asignadas por mí")
  assert.ok(!tit(yo, { pestana: 'sinfecha' }).includes('Asignada a com'));
  assert.ok(tit(yo, { pestana: 'sinfecha' }).includes('Llamar a Álvaro'));
  assert.deepEqual(tit(yo, { pestana: 'completadas' }), ['Hecha']);
  assert.deepEqual(tit(yo, { pestana: 'archivadas' }), ['Archivada']);
  assert.deepEqual(tit(yo, { pestana: 'mis', busqueda: 'alvaro' }), ['Llamar a Álvaro']);
  assert.deepEqual(tit(yo, { pestana: 'mis', prioridad: 'urgent' }), ['Delegada']);
  assert.deepEqual(tit({ username: 'yo', role: 'manager' }, { pestana: 'asignadas' }), ['Asignada a com']);
  assert.ok(!tit(yo, { pestana: 'todas' }).includes('Ajena'), 'un comercial nunca ve tareas ajenas');
  assert.ok(tit(admin, { pestana: 'todas' }).includes('Ajena'));
  assert.ok(tit(yo, { pestana: 'calendario' }).includes('Hecha'));
  assert.ok(!tit(yo, { pestana: 'calendario' }).includes('Archivada'));
  assert.deepEqual(tit(admin, { pestana: 'todas', trabajador: 'com' }), ['Asignada a com']);
});

test('estadísticas: admin todo (con ceros), manager solo lo que creó', () => {
  const tareas = [
    t({ created_by: 'man', assignee: 'a', due_date: '2026-10-01' }),
    t({ created_by: 'man', assignee: 'a', status: 'completed', completed_at: '2026-10-27T00:00:00Z' }),
    t({ created_by: 'man', assignee: 'b', status: 'completed', completed_at: '2026-10-10T00:00:00Z' }),
    t({ created_by: 'otro', assignee: 'a' }),
  ];
  const usuarios = [{ username: 'a' }, { username: 'b' }, { username: 'c' }];
  const m = estadisticasEquipo(tareas, usuarios, man, AHORA);
  assert.deepEqual(m.map((f) => [f.username, f.activas, f.vencidas, f.completadas7, f.completadas30]), [['a', 1, 1, 1, 1], ['b', 0, 0, 0, 1]]);
  const a = estadisticasEquipo(tareas, usuarios, admin, AHORA);
  assert.equal(a.find((f) => f.username === 'a').activas, 2);
  assert.ok(a.find((f) => f.username === 'c'));
  assert.deepEqual(estadisticasEquipo(tareas, usuarios, yo, AHORA), []);
});

test('historial legible de task_events', () => {
  const nom = (u) => ({ ana: 'Ana', luis: 'Luis' }[u] || u);
  const ev = (type, payload = {}) => describirEvento({ actor: 'ana', type, payload }, nom, AHORA);
  assert.equal(ev('completed', { from: 'pending', to: 'completed' }), 'Ana completó la tarea');
  assert.equal(ev('updated', { changes: { due_date: { from: '2026-11-03', to: '2026-11-05' } } }), 'Ana cambió la fecha límite de 3 nov a 5 nov');
  assert.equal(
    ev('updated', { changes: { priority: { from: 'normal', to: 'urgent' }, description: { from: 'a', to: 'b' } } }),
    'Ana cambió la prioridad de Normal a Urgente y editó la descripción',
  );
  assert.equal(ev('reassigned', { from: 'ana', to: 'luis' }), 'Ana reasignó la tarea de Ana a Luis');
  assert.equal(
    ev('moved', { from: { planned_date: null, planned_time: null }, to: { planned_date: '2026-10-29', planned_time: '09:00:00' } }),
    'Ana movió la tarea de sin fecha a 29 oct 09:00',
  );
  assert.equal(ev('created', { assignee: 'luis' }), 'Ana creó la tarea para Luis');
  assert.equal(ev('status_changed', { from: 'pending', to: 'in_progress' }), 'Ana cambió el estado a en curso');
  assert.equal(enSegundaPersona('Tú reabrió la tarea'), 'Tú reabriste la tarea');
  assert.equal(enSegundaPersona('Tú movió la tarea a 4 nov'), 'Tú moviste la tarea a 4 nov');
  assert.equal(
    enSegundaPersona(describirEvento({ actor: 'yo', type: 'updated', payload: { changes: { due_date: { from: '2027-01-04', to: null }, title: { from: 'a', to: 'b' } } } }, (u) => (u === 'yo' ? 'Tú' : u), AHORA)),
    'Tú cambiaste la fecha límite de 4 ene 2027 a sin valor y cambiaste el título de «a» a «b»',
  );
  assert.equal(enSegundaPersona('Ana cambió algo'), 'Ana cambió algo');
});

test('diffCambios: solo claves cambiadas, horas normalizadas, vacío = null', () => {
  const task = { title: 'A', description: null, priority: 'normal', planned_date: '2026-10-29', planned_time: '09:00:00', due_date: null, due_time: null };
  assert.deepEqual(diffCambios(task, { title: 'A ', description: '', priority: 'normal', planned_date: '2026-10-29', planned_time: '09:00', due_date: '', due_time: '' }), {});
  assert.deepEqual(diffCambios(task, { title: 'B', planned_date: '', due_date: '2026-11-01' }), { title: 'B', planned_date: null, due_date: '2026-11-01' });
});

test('color por usuario: estable, de la paleta, preferencia válida prevalece', () => {
  assert.equal(PALETA.length, 12);
  assert.equal(new Set(PALETA).size, 12);
  assert.equal(colorAutomatico('comercial1'), colorAutomatico('comercial1'));
  assert.ok(PALETA.includes(colorAutomatico('comercial1')));
  assert.equal(hashTexto('abc'), 440920331); // FNV-1a 32 bits
  const colores = new Set(['admin', 'manager1', 'manager2', 'comercial1', 'comercial2', 'comercial3'].map(colorAutomatico));
  assert.ok(colores.size >= 4, 'usuarios distintos suelen tener colores distintos');
  assert.equal(colorDeUsuario('x', { x: '#123abc' }), '#123abc');
  assert.equal(colorDeUsuario('x', { x: 'rojo' }), colorAutomatico('x'));
  assert.equal(iniciales('Ana López'), 'AL');
  assert.equal(iniciales('comercial1'), 'CO');
});
