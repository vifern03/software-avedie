/** Fechas de Tasks en Europe/Madrid, incluidos los cambios de hora (29/03/2026 y 25/10/2026). */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  madridAInstante, partesMadrid, hoyMadrid, deadlineDe, alertaDeadline, etiquetaDeadline,
  posicionCalendario, fechaCorta, sumarDias, diffDias, ahoraMadridWallIso,
} from '../src/lib/tasksFechas.js';

const iso = (d) => d.toISOString();

test('madridAInstante: horario de verano (+2) e invierno (+1)', () => {
  assert.equal(iso(madridAInstante('2026-10-24', '12:00')), '2026-10-24T10:00:00.000Z');
  assert.equal(iso(madridAInstante('2026-10-26', '12:00')), '2026-10-26T11:00:00.000Z');
  assert.equal(iso(madridAInstante('2026-01-15', '00:00')), '2026-01-14T23:00:00.000Z');
});

test('madridAInstante: alrededor del salto de marzo y del retroceso de octubre', () => {
  // 29/03/2026: 02:00 → 03:00. 03:30 ya es CEST.
  assert.equal(iso(madridAInstante('2026-03-29', '03:30')), '2026-03-29T01:30:00.000Z');
  assert.equal(iso(madridAInstante('2026-03-29', '01:30')), '2026-03-29T00:30:00.000Z');
  // 25/10/2026: 03:00 → 02:00. 04:00 es CET.
  assert.equal(iso(madridAInstante('2026-10-25', '04:00')), '2026-10-25T03:00:00.000Z');
  assert.equal(iso(madridAInstante('2026-10-25', '01:00')), '2026-10-24T23:00:00.000Z');
});

test('partesMadrid: hora de pared a ambos lados del retroceso', () => {
  assert.equal(partesMadrid(new Date('2026-10-25T00:30:00Z')).time, '02:30');
  assert.equal(partesMadrid(new Date('2026-10-25T01:30:00Z')).time, '02:30');
  assert.equal(partesMadrid(new Date('2026-10-25T02:30:00Z')).time, '03:30');
});

test('hoyMadrid cambia de día a medianoche de Madrid, no de UTC', () => {
  assert.equal(hoyMadrid(new Date('2026-10-25T23:30:00Z')), '2026-10-26');
  assert.equal(hoyMadrid(new Date('2026-07-01T21:59:00Z')), '2026-07-01');
  assert.equal(hoyMadrid(new Date('2026-07-01T22:00:00Z')), '2026-07-02');
  assert.equal(ahoraMadridWallIso(new Date('2026-07-01T22:00:05Z')), '2026-07-02T00:00:05');
});

test('deadline sin hora = 23:59:59 de Madrid (con el desfase de ese día)', () => {
  assert.equal(iso(deadlineDe({ due_date: '2026-03-28' })), '2026-03-28T22:59:59.000Z');
  assert.equal(iso(deadlineDe({ due_date: '2026-03-29' })), '2026-03-29T21:59:59.000Z');
  assert.equal(iso(deadlineDe({ due_date: '2026-10-25' })), '2026-10-25T22:59:59.000Z');
  assert.equal(iso(deadlineDe({ due_date: '2026-10-25', due_time: '09:15' })), '2026-10-25T08:15:00.000Z');
  // due_at del servidor prevalece
  assert.equal(iso(deadlineDe({ due_date: '2026-10-25', due_at: '2026-10-25T10:00:00Z' })), '2026-10-25T10:00:00.000Z');
  assert.equal(deadlineDe({}), null);
});

test('alertaDeadline: vencida, próxima (<24 h), lejana, completada y archivada', () => {
  const ahora = new Date('2026-10-28T10:00:00Z'); // 11:00 en Madrid
  assert.equal(alertaDeadline({ status: 'pending', due_date: '2026-10-27' }, ahora), 'vencida');
  assert.equal(alertaDeadline({ status: 'pending', due_date: '2026-10-28', due_time: '10:59' }, ahora), 'vencida');
  assert.equal(alertaDeadline({ status: 'pending', due_date: '2026-10-28' }, ahora), 'proxima');
  assert.equal(alertaDeadline({ status: 'in_progress', due_date: '2026-10-29', due_time: '10:59' }, ahora), 'proxima');
  assert.equal(alertaDeadline({ status: 'pending', due_date: '2026-10-29', due_time: '11:00' }, ahora), null);
  assert.equal(alertaDeadline({ status: 'completed', due_date: '2026-10-01' }, ahora), null);
  assert.equal(alertaDeadline({ status: 'pending', due_date: '2026-10-01', archived_at: '2026-10-02T00:00:00Z' }, ahora), null);
  assert.equal(alertaDeadline({ status: 'pending' }, ahora), null);
});

test('textos de fecha y posición en calendario', () => {
  const ahora = new Date('2026-10-28T10:00:00Z');
  assert.equal(fechaCorta('2026-10-28', ahora), 'Hoy');
  assert.equal(fechaCorta('2026-10-29', ahora), 'Mañana');
  assert.equal(fechaCorta('2026-11-03', ahora), '3 nov');
  assert.equal(fechaCorta('2027-01-05', ahora), '5 ene 2027');
  assert.equal(etiquetaDeadline({ status: 'pending', due_date: '2026-10-27' }, ahora), 'Venció ayer');
  assert.equal(etiquetaDeadline({ status: 'pending', due_date: '2026-10-28', due_time: '18:00:00' }, ahora), 'Vence hoy 18:00');
  assert.deepEqual(posicionCalendario({ planned_date: '2026-11-02', planned_time: '09:00:00', due_date: '2026-11-05' }), { date: '2026-11-02', time: '09:00:00', porDeadline: false });
  assert.deepEqual(posicionCalendario({ due_date: '2026-11-05' }), { date: '2026-11-05', time: null, porDeadline: true });
  assert.equal(posicionCalendario({}), null);
  assert.equal(sumarDias('2026-10-31', 1), '2026-11-01');
  assert.equal(diffDias('2026-10-24', '2026-10-26'), 2);
});
