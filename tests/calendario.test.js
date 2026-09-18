import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  periodo6, periodo3, diaSemana, esDiaTipoD, temporada, diasInclusivos,
  horaInicioDesdeIndice, viernesSanto, esHoraOpen, sumarDias,
} from '../src/lib/energia/calendario.js';
import { OPEN_30TD, OPEN_61TD } from '../src/data/tarifasB2B.js';

const mod = (p, id) => p.modalidades.find(m => m.id === id);

test('septiembre 2026 (temporada media, B1): punta P3, llano P4, noche P6', () => {
  assert.equal(temporada('2026-09-15'), 'B1');
  assert.equal(periodo6('2026-09-15', 10), 3);
  assert.equal(periodo6('2026-09-15', 8), 4);
  assert.equal(periodo6('2026-09-15', 7), 6);
  assert.equal(periodo6('2026-09-15', 23), 4);
  assert.equal(periodo6('2026-09-19', 12), 6); // sábado
});

test('julio 2026 (alta, A) y diciembre 2025 (alta, A) no se reasignan a septiembre', () => {
  assert.equal(periodo6('2026-07-15', 10), 1);
  assert.equal(periodo6('2026-07-15', 15), 2);
  assert.equal(periodo6('2025-12-09', 19), 1);
  assert.equal(periodo6('2025-12-08', 19), 6); // Inmaculada (lunes) → día D
  assert.equal(periodo6('2025-12-25', 10), 6);
});

test('fronteras horarias 3.0/6.1TD en día tipo A', () => {
  const d = '2026-07-14';
  assert.equal(periodo6(d, 7), 6);
  assert.equal(periodo6(d, 8), 2);
  assert.equal(periodo6(d, 9), 1);
  assert.equal(periodo6(d, 13), 1);
  assert.equal(periodo6(d, 14), 2);
  assert.equal(periodo6(d, 18), 1);
  assert.equal(periodo6(d, 21), 1);
  assert.equal(periodo6(d, 22), 2);
});

test('cambio de mes y de temporada', () => {
  assert.equal(periodo6('2026-05-29', 10), 4); // mayo, baja (C)
  assert.equal(periodo6('2026-06-01', 10), 3); // junio, media (B1)
  assert.equal(periodo6('2026-02-27', 10), 1); // febrero, alta
  assert.equal(periodo6('2026-03-02', 10), 2); // marzo, media-alta
  assert.equal(periodo6('2026-10-30', 10), 4); // octubre, baja
  assert.equal(periodo6('2026-11-02', 10), 2); // noviembre, media-alta
});

test('festivos: fijos nacionales son D; Viernes Santo (sin fecha fija) no lo es para el peaje', () => {
  assert.equal(viernesSanto(2026), '2026-04-03');
  assert.equal(esDiaTipoD('2026-04-03'), false);
  assert.equal(periodo6('2026-04-03', 10), 4);
  assert.equal(esDiaTipoD('2026-01-06'), true);
  assert.equal(esDiaTipoD('2026-10-12'), true);
  assert.equal(esDiaTipoD('2026-08-15'), true);
});

test('2.0TD: punta, llano, valle y 6 de enero', () => {
  assert.equal(periodo3('2026-09-16', 10), 1);
  assert.equal(periodo3('2026-09-16', 9), 2);
  assert.equal(periodo3('2026-09-16', 23), 2);
  assert.equal(periodo3('2026-09-16', 7), 3);
  assert.equal(periodo3('2026-01-06', 12), 3);
});

test('días facturados y periodos que atraviesan meses', () => {
  assert.equal(diasInclusivos('2026-07-01', '2026-07-31'), 31);
  assert.equal(diasInclusivos('2026-08-15', '2026-09-14'), 31);
  assert.equal(diasInclusivos('2025-11-30', '2025-12-31'), 32);
  assert.equal(sumarDias('2026-02-28', 1), '2026-03-01');
});

test('cambio de hora: índice de curva → hora de inicio local', () => {
  assert.equal(horaInicioDesdeIndice(2, 23), 1);
  assert.equal(horaInicioDesdeIndice(3, 23), 3);  // 02:00 no existe
  assert.equal(horaInicioDesdeIndice(3, 25), 2);
  assert.equal(horaInicioDesdeIndice(4, 25), 2);  // 02:00 repetida
  assert.equal(horaInicioDesdeIndice(25, 25), 23);
  assert.equal(horaInicioDesdeIndice(24, 24), 23);
});

test('el día de la semana no depende de la zona horaria del ordenador', () => {
  assert.equal(diaSemana('2026-09-19'), 6);
  const code = "import('./src/lib/energia/calendario.js').then(m=>process.stdout.write(String(m.diaSemana('2026-09-19'))))";
  for (const tz of ['Pacific/Kiritimati', 'America/Los_Angeles']) {
    const out = execFileSync(process.execPath, ['-e', code], { env: { ...process.env, TZ: tz } }).toString();
    assert.equal(out, '6', `TZ=${tz}`);
  }
});

test('ventanas Open 3.0TD según el PDF', () => {
  const lab = '2026-09-16', sab = '2026-09-19', fest = '2026-10-12';
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'dia').ventanas, lab, 7), false);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'dia').ventanas, lab, 8), true);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'dia').ventanas, sab, 8), true);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'laboral').ventanas, sab, 12), false);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'laboral').ventanas, fest, 12), false);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'laboral').ventanas, lab, 23), true);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'finde').ventanas, sab, 3), true);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'finde').ventanas, lab, 3), false);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'noche').ventanas, lab, 7), true);
  assert.equal(esHoraOpen(mod(OPEN_30TD, 'noche').ventanas, sab, 8), false);
});

test('ventanas Open 6.1TD según el PDF', () => {
  const lab = '2026-09-16', dom = '2026-09-20';
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'dia').ventanas, dom, 17), false);
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'dia').ventanas, dom, 18), true);
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'dia').ventanas, lab, 8), true);
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'noche').ventanas, dom, 17), true);
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'noche').ventanas, dom, 18), false);
  assert.equal(esHoraOpen(mod(OPEN_61TD, 'noche').ventanas, lab, 8), false);
});

import { parsearCurvaCSV, horasDelDiaMadrid } from '../src/lib/energia/curva.js';

test('curva CSV: formato Datadis, filtro por periodo y días de cambio de hora', () => {
  assert.equal(horasDelDiaMadrid('2026-03-29'), 23);
  assert.equal(horasDelDiaMadrid('2026-10-25'), 25);
  assert.equal(horasDelDiaMadrid('2026-09-20'), 24);
  const csv = [
    'CUPS;Fecha;Hora;Consumo_kWh;Metodo_obtencion',
    'ESX;31/08/2026;24;9;R',
    'ESX;01/09/2026;1;1,5;R',
    'ESX;01/09/2026;9;2;R',
    'ESX;25/10/2026;3;1;R',
    'ESX;25/10/2026;4;1;R',
  ].join('\n');
  const { curva, errores } = parsearCurvaCSV(csv, { desde: '2026-09-01', hasta: '2026-10-31' });
  assert.deepEqual(errores, []);
  assert.deepEqual(curva, [
    { fecha: '2026-09-01', hora: 0, kwh: 1.5 },
    { fecha: '2026-09-01', hora: 8, kwh: 2 },
    { fecha: '2026-10-25', hora: 2, kwh: 1 },
    { fecha: '2026-10-25', hora: 2, kwh: 1 },
  ]);
  const bad = parsearCurvaCSV('fecha;hora;kwh\n2026-09-01;25;1');
  assert.ok(bad.errores.length > 0);
});
