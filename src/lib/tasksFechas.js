/* Utilidades de fecha para Tasks — siempre en Europe/Madrid, independientemente
   de la zona horaria del navegador. Funciones puras (sin React ni Supabase) para
   poder probarlas con `node --test`.

   Convenciones:
   - Fechas "de calendario" como string 'YYYY-MM-DD' (columnas date de Postgres).
   - Horas como 'HH:MM' o 'HH:MM:SS' (columnas time).
   - Instantes (timestamptz) como Date o ISO con zona. */

export const TZ = 'Europe/Madrid';

const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

const pad = (n) => String(n).padStart(2, '0');

/** Componentes de pared (wall-clock) en Madrid de un instante. */
export function partesMadrid(instante = new Date()) {
  const d = instante instanceof Date ? instante : new Date(instante);
  const p = {};
  for (const { type, value } of partsFmt.formatToParts(d)) p[type] = value;
  const hour = p.hour === '24' ? '00' : p.hour;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    time: `${hour}:${p.minute}`,
    seconds: p.second,
  };
}

/** Desfase (minutos) de Madrid respecto a UTC en un instante dado (+60 / +120). */
function offsetMadridMin(instante) {
  const { date, time, seconds } = partesMadrid(instante);
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, Number(seconds));
  return Math.round((wall - Math.floor(instante.getTime() / 1000) * 1000) / 60000);
}

/** Instante real (Date) correspondiente a una fecha y hora de pared en Madrid. */
export function madridAInstante(dateStr, timeStr = '00:00:00') {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = String(timeStr || '00:00:00').split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm, ss);
  let guess = wall - offsetMadridMin(new Date(wall)) * 60000;
  guess = wall - offsetMadridMin(new Date(guess)) * 60000;
  return new Date(guess);
}

/** 'YYYY-MM-DD' de hoy en Madrid. */
export const hoyMadrid = (ahora = new Date()) => partesMadrid(ahora).date;

/** Fecha+hora de pared en Madrid como ISO sin zona ('YYYY-MM-DDTHH:MM:SS'). */
export function ahoraMadridWallIso(ahora = new Date()) {
  const { date, time, seconds } = partesMadrid(ahora);
  return `${date}T${time}:${seconds}`;
}

/** Fecha de Madrid ('YYYY-MM-DD') de un instante ISO. */
export const fechaMadridDe = (iso) => (iso ? partesMadrid(new Date(iso)).date : null);

export function sumarDias(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Días naturales de a → b (b - a). */
export function diffDias(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Inicio del día en Madrid (instante) y comienzo del día siguiente (límite exclusivo). */
export const inicioDiaMadrid = (dateStr) => madridAInstante(dateStr, '00:00:00');
export const finDiaMadridExclusivo = (dateStr) => madridAInstante(sumarDias(dateStr, 1), '00:00:00');

/** Deadline real de una tarea. Prioriza `due_at` (calculado en servidor);
    si no viene, lo calcula: due_date + (due_time || 23:59:59) en Madrid. */
export function deadlineDe(task) {
  if (!task) return null;
  if (task.due_at) return new Date(task.due_at);
  if (!task.due_date) return null;
  return madridAInstante(task.due_date, task.due_time || '23:59:59');
}

/** 'vencida' | 'proxima' (< 24 h) | null. Completadas y archivadas no alertan. */
export function alertaDeadline(task, ahora = new Date()) {
  if (!task || task.status === 'completed' || task.archived_at) return null;
  const dl = deadlineDe(task);
  if (!dl) return null;
  const ms = dl.getTime() - ahora.getTime();
  if (ms < 0) return 'vencida';
  if (ms < 24 * 3600 * 1000) return 'proxima';
  return null;
}

export const horaCorta = (timeStr) => (timeStr ? String(timeStr).slice(0, 5) : '');

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** 'Hoy', 'Mañana', 'Ayer' o '3 nov' (+ año si no es el actual). */
export function fechaCorta(dateStr, ahora = new Date()) {
  if (!dateStr) return '';
  const hoy = hoyMadrid(ahora);
  const diff = diffDias(hoy, dateStr);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  if (diff === -1) return 'Ayer';
  const [y, m, d] = dateStr.split('-').map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  return y === Number(hoy.slice(0, 4)) ? base : `${base} ${y}`;
}

/** '4 nov' (o '4 nov 2027' si no es el año actual), sin Hoy/Mañana/Ayer. */
export function fechaAbsoluta(dateStr, ahora = new Date()) {
  if (!dateStr) return '';
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const base = `${d} ${MESES[m - 1]}`;
  return y === Number(hoyMadrid(ahora).slice(0, 4)) ? base : `${base} ${y}`;
}

/** Texto de una fecha 'YYYY-MM-DD' en formato dd/mm/aaaa. */
export function fechaLarga(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

/** '26/10/2026 14:05' de un instante, en Madrid. */
export function fechaHora(iso) {
  if (!iso) return '';
  const { date, time } = partesMadrid(new Date(iso));
  return `${fechaLarga(date)} ${time}`;
}

/** Texto relativo de un instante pasado: 'hace 5 min', 'ayer 14:05', '20/10/2026 14:05'. */
export function haceCuanto(iso, ahora = new Date()) {
  if (!iso) return '';
  const t = new Date(iso);
  const s = Math.round((ahora.getTime() - t.getTime()) / 1000);
  if (s < 60) return 'ahora mismo';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  const { date, time } = partesMadrid(t);
  const diff = diffDias(date, hoyMadrid(ahora));
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `ayer ${time}`;
  return `${fechaCorta(date, ahora)} ${time}`;
}

/** Etiqueta del deadline: 'Vence hoy 18:00', 'Vence mañana', 'Venció 20 oct'… */
export function etiquetaDeadline(task, ahora = new Date()) {
  if (!task?.due_date) return '';
  const hora = task.due_time ? ` ${horaCorta(task.due_time)}` : '';
  const f = fechaCorta(task.due_date, ahora);
  const dl = deadlineDe(task);
  const pasado = dl && dl.getTime() < ahora.getTime() && task.status !== 'completed';
  const fTxt = ['Hoy', 'Mañana', 'Ayer'].includes(f) ? f.toLowerCase() : f;
  return `${pasado ? 'Venció' : 'Vence'} ${fTxt}${hora}`;
}

/** Posición de la tarea en el calendario: planned_date (+hora) o, si no, due_date (+hora). */
export function posicionCalendario(task) {
  if (task?.planned_date) return { date: task.planned_date, time: task.planned_time || null, porDeadline: false };
  if (task?.due_date) return { date: task.due_date, time: task.due_time || null, porDeadline: true };
  return null;
}

/** Fecha de referencia para ordenar/agrupar ('YYYY-MM-DD' o null). */
export const fechaReferencia = (task) => task?.planned_date || task?.due_date || null;
