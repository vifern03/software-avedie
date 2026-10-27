/* Lógica pura de Tasks: filtros, agrupación, contadores, estadísticas y textos del historial. */
import {
  alertaDeadline, deadlineDe, fechaReferencia, hoyMadrid, sumarDias, diffDias,
  fechaAbsoluta, horaCorta,
} from './tasksFechas.js';
import { puedeVer } from './tasksPermisos.js';

export const PRIORIDADES = [
  { id: 'low', label: 'Baja' },
  { id: 'normal', label: 'Normal' },
  { id: 'high', label: 'Alta' },
  { id: 'urgent', label: 'Urgente' },
];
export const PRIORIDAD_LABEL = Object.fromEntries(PRIORIDADES.map((p) => [p.id, p.label]));
const PRIORIDAD_PESO = { urgent: 3, high: 2, normal: 1, low: 0 };

export const ESTADOS = [
  { id: 'pending', label: 'Pendiente' },
  { id: 'in_progress', label: 'En curso' },
  { id: 'completed', label: 'Completada' },
];
export const ESTADO_LABEL = Object.fromEntries(ESTADOS.map((e) => [e.id, e.label]));

export const PESTANAS = {
  mis: 'Mis tareas',
  proximas: 'Hoy y próximas',
  vencidas: 'Vencidas',
  sinfecha: 'Sin fecha',
  completadas: 'Completadas',
  asignadas: 'Asignadas por mí',
  todas: 'Todas',
  archivadas: 'Archivadas',
};

export const esActiva = (t) => !!t && !t.archived_at && t.status !== 'completed';

/* ── Contadores del Sidebar ───────────────────────────────────────────────── */

/** Tareas activas cuyo responsable es `username` (incluye personales) y sus alertas. */
export function contadoresUsuario(tasks, username, ahora = new Date()) {
  let activas = 0, vencidas = 0, proximas = 0;
  for (const t of tasks || []) {
    if (t.assignee !== username || !esActiva(t)) continue;
    activas++;
    const a = alertaDeadline(t, ahora);
    if (a === 'vencida') vencidas++;
    else if (a === 'proxima') proximas++;
  }
  return { activas, vencidas, proximas };
}

export const textoBadge = (n) => (n > 99 ? '99+' : String(n));

/** Nivel de alerta del Sidebar: 'vencida' (rojo) | 'proxima' (ámbar) | null, con tooltip. */
export function alertaSidebar({ vencidas, proximas }) {
  if (vencidas > 0) {
    return { nivel: 'vencida', texto: vencidas === 1 ? 'Tienes 1 tarea vencida' : `Tienes ${vencidas} tareas vencidas` };
  }
  if (proximas > 0) {
    return { nivel: 'proxima', texto: proximas === 1 ? '1 tarea vence en menos de 24 h' : `${proximas} tareas vencen en menos de 24 h` };
  }
  return null;
}

/* ── Búsqueda y filtros ───────────────────────────────────────────────────── */

export const normalizar = (s) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Filtra según pestaña y filtros.
 * filtros = { pestana, busqueda, trabajador, prioridad, estado }
 * - "Mis tareas", "Hoy y próximas", "Vencidas", "Sin fecha": responsable = yo
 *   (lo que he delegado está en "Asignadas por mí").
 * - Completadas / Archivadas: tareas en las que participo (creador o responsable). Admin ve todo en "Todas".
 * - 'calendario': todo lo visible no archivado (completadas incluidas, se pintan atenuadas).
 * - Salvo Completadas/Archivadas/calendario, se ocultan completadas (a menos que estado = completed).
 */
export function filtrarTareas(tasks, user, filtros = {}, ahora = new Date()) {
  const { pestana = 'mis', busqueda = '', trabajador = '', prioridad = '', estado = '' } = filtros;
  const yo = user?.username;
  const hoy = hoyMadrid(ahora);
  const q = normalizar(busqueda);
  const participo = (t) => t.assignee === yo || t.created_by === yo;

  return (tasks || []).filter((t) => {
    if (!puedeVer(user, t)) return false;
    const archivada = !!t.archived_at;
    if (pestana === 'archivadas') {
      if (!archivada) return false;
      if (user?.role !== 'admin' && !participo(t)) return false;
    } else if (archivada) return false;

    const completada = t.status === 'completed';
    const ocultarCompletadas = !['completadas', 'archivadas', 'calendario'].includes(pestana) && estado !== 'completed';
    if (ocultarCompletadas && completada) return false;

    switch (pestana) {
      case 'mis': if (t.assignee !== yo) return false; break;
      case 'proximas': {
        if (t.assignee !== yo) return false;
        const ref = fechaReferencia(t);
        if (!((ref && ref >= hoy) || alertaDeadline(t, ahora) === 'proxima')) return false;
        break;
      }
      case 'vencidas': if (t.assignee !== yo || alertaDeadline(t, ahora) !== 'vencida') return false; break;
      case 'sinfecha': if (t.assignee !== yo || t.planned_date || t.due_date) return false; break;
      case 'completadas': if (!participo(t) || !completada) return false; break;
      case 'asignadas': if (t.created_by !== yo || t.assignee === yo) return false; break;
      case 'todas': case 'calendario': break;
      default: break;
    }

    if (trabajador && t.assignee !== trabajador) return false;
    if (prioridad && t.priority !== prioridad) return false;
    if (estado && t.status !== estado) return false;
    if (q && !normalizar(`${t.title} ${t.description || ''}`).includes(q)) return false;
    return true;
  });
}

/* ── Orden y agrupación ───────────────────────────────────────────────────── */

export function compararTareas(a, b) {
  const ra = fechaReferencia(a), rb = fechaReferencia(b);
  if (ra !== rb) { if (!ra) return 1; if (!rb) return -1; return ra < rb ? -1 : 1; }
  const ta = a.planned_date ? a.planned_time : a.due_time;
  const tb = b.planned_date ? b.planned_time : b.due_time;
  if ((ta || '') !== (tb || '')) { if (!ta) return 1; if (!tb) return -1; return ta < tb ? -1 : 1; }
  const pa = PRIORIDAD_PESO[a.priority] ?? 1, pb = PRIORIDAD_PESO[b.priority] ?? 1;
  if (pa !== pb) return pb - pa;
  return String(a.created_at || '').localeCompare(String(b.created_at || ''));
}

/** Domingo de la semana (lunes–domingo) que contiene `dateStr`. */
export function domingoDeSemana(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return sumarDias(dateStr, dow === 0 ? 0 : 7 - dow);
}

export const GRUPOS = [
  { key: 'vencidas', label: 'Vencidas' },
  { key: 'anteriores', label: 'Días anteriores' },
  { key: 'hoy', label: 'Hoy' },
  { key: 'manana', label: 'Mañana' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'despues', label: 'Más adelante' },
  { key: 'sinfecha', label: 'Sin fecha' },
  { key: 'completadas', label: 'Completadas' },
];

export function grupoDeTarea(t, ahora = new Date()) {
  if (t.status === 'completed') return 'completadas';
  if (alertaDeadline(t, ahora) === 'vencida') return 'vencidas';
  const ref = fechaReferencia(t);
  if (!ref) return 'sinfecha';
  const hoy = hoyMadrid(ahora);
  if (ref < hoy) return 'anteriores';
  if (ref === hoy) return 'hoy';
  if (ref === sumarDias(hoy, 1)) return 'manana';
  if (ref <= domingoDeSemana(hoy)) return 'semana';
  return 'despues';
}

/** Agrupa por fecha (solo grupos no vacíos, en orden fijo). */
export function agruparPorFecha(tasks, ahora = new Date()) {
  const mapa = new Map(GRUPOS.map((g) => [g.key, []]));
  for (const t of tasks || []) mapa.get(grupoDeTarea(t, ahora)).push(t);
  return GRUPOS
    .map((g) => {
      const lista = mapa.get(g.key);
      if (g.key === 'completadas') {
        lista.sort((a, b) => String(b.completed_at || '').localeCompare(String(a.completed_at || '')));
      } else if (g.key === 'vencidas') {
        lista.sort((a, b) => (deadlineDe(a) - deadlineDe(b)) || compararTareas(a, b));
      } else lista.sort(compararTareas);
      return { ...g, tasks: lista };
    })
    .filter((g) => g.tasks.length > 0);
}

/* ── Estadísticas de equipo ───────────────────────────────────────────────── */

/**
 * Por trabajador (responsable): activas, vencidas, completadas en 7 y 30 días.
 * Admin: todas las tareas (y todos los usuarios, aunque estén a cero). Manager: solo las que creó.
 */
export function estadisticasEquipo(tasks, usuarios, viewer, ahora = new Date()) {
  if (!viewer || !['admin', 'manager'].includes(viewer.role)) return [];
  const esAdmin = viewer.role === 'admin';
  const filas = new Map();
  const fila = (u) => {
    if (!filas.has(u)) filas.set(u, { username: u, activas: 0, vencidas: 0, completadas7: 0, completadas30: 0, total: 0 });
    return filas.get(u);
  };
  if (esAdmin) for (const u of usuarios || []) fila(u.username);
  const lim7 = ahora.getTime() - 7 * 86400000;
  const lim30 = ahora.getTime() - 30 * 86400000;
  for (const t of tasks || []) {
    if (t.archived_at) continue;
    if (!esAdmin && t.created_by !== viewer.username) continue;
    const f = fila(t.assignee);
    f.total++;
    if (t.status === 'completed') {
      const c = t.completed_at ? new Date(t.completed_at).getTime() : 0;
      if (c >= lim7) f.completadas7++;
      if (c >= lim30) f.completadas30++;
    } else {
      f.activas++;
      if (alertaDeadline(t, ahora) === 'vencida') f.vencidas++;
    }
  }
  return [...filas.values()].sort((a, b) => b.vencidas - a.vencidas || b.activas - a.activas || a.username.localeCompare(b.username));
}

/* ── Historial (task_events) en texto legible ─────────────────────────────── */

const CAMPOS = {
  title: 'el título',
  description: 'la descripción',
  priority: 'la prioridad',
  planned_date: 'la fecha planificada',
  planned_time: 'la hora planificada',
  due_date: 'la fecha límite',
  due_time: 'la hora de la fecha límite',
};

function valorCampo(campo, v, ahora) {
  if (v === null || v === undefined || v === '') return 'sin valor';
  if (campo === 'priority') return PRIORIDAD_LABEL[v] || v;
  if (campo === 'planned_date' || campo === 'due_date') return fechaAbsoluta(v, ahora);
  if (campo === 'planned_time' || campo === 'due_time') return horaCorta(v);
  if (campo === 'title') return `«${v}»`;
  return String(v);
}

function textoFechaHora(obj, ahora) {
  if (!obj) return 'sin fecha';
  if (typeof obj === 'string') return fechaAbsoluta(obj, ahora);
  const f = obj.planned_date || obj.date;
  const h = obj.planned_time || obj.time;
  if (!f) return 'sin fecha';
  return `${fechaAbsoluta(f, ahora)}${h ? ` ${horaCorta(h)}` : ''}`;
}

/** Lista legible de cambios de un evento 'updated'. */
export function describirCambios(changes = {}, ahora = new Date()) {
  const partes = [];
  for (const [campo, cambio] of Object.entries(changes || {})) {
    const nombre = CAMPOS[campo] || campo;
    if (campo === 'description') { partes.push('editó la descripción'); continue; }
    const from = cambio && typeof cambio === 'object' && 'from' in cambio ? cambio.from : undefined;
    const to = cambio && typeof cambio === 'object' && 'to' in cambio ? cambio.to : cambio;
    partes.push(from === undefined
      ? `cambió ${nombre} a ${valorCampo(campo, to, ahora)}`
      : `cambió ${nombre} de ${valorCampo(campo, from, ahora)} a ${valorCampo(campo, to, ahora)}`);
  }
  return partes;
}

const unirFrases = (p) => (p.length <= 1 ? p.join('') : `${p.slice(0, -1).join(', ')} y ${p[p.length - 1]}`);

/** "Ana completó la tarea", "Ana cambió el deadline de 3 nov a 5 nov"… */
export function describirEvento(ev, nombreDe = (u) => u, ahora = new Date()) {
  const quien = nombreDe(ev?.actor) || 'Alguien';
  const p = ev?.payload || {};
  switch (ev?.type) {
    case 'created':
      return p.assignee && p.assignee !== ev.actor
        ? `${quien} creó la tarea para ${nombreDe(p.assignee)}`
        : `${quien} creó la tarea`;
    case 'updated': {
      const partes = describirCambios(p.changes || p, ahora);
      return partes.length ? `${quien} ${unirFrases(partes)}` : `${quien} editó la tarea`;
    }
    case 'reassigned':
      return p.to ? `${quien} reasignó la tarea${p.from ? ` de ${nombreDe(p.from)}` : ''} a ${nombreDe(p.to)}` : `${quien} reasignó la tarea`;
    case 'status_changed':
      return p.to ? `${quien} cambió el estado a ${(ESTADO_LABEL[p.to] || p.to).toLowerCase()}` : `${quien} cambió el estado`;
    case 'completed': return `${quien} completó la tarea`;
    case 'reopened': return `${quien} reabrió la tarea`;
    case 'moved':
      return `${quien} movió la tarea${p.from !== undefined ? ` de ${textoFechaHora(p.from, ahora)}` : ''} a ${textoFechaHora(p.to ?? p, ahora)}`;
    case 'archived': return `${quien} archivó la tarea`;
    case 'unarchived': return `${quien} desarchivó la tarea`;
    case 'commented': return `${quien} comentó`;
    default: return `${quien} modificó la tarea`;
  }
}

/** Diferencias entre la tarea y el formulario (solo claves permitidas por tasks_editar). */
export const CLAVES_EDITABLES = ['title', 'description', 'priority', 'planned_date', 'planned_time', 'due_date', 'due_time'];
export function diffCambios(task, form) {
  const norm = (k, v) => {
    if (v === undefined || v === null || v === '') return null;
    if (k.endsWith('_time')) return String(v).slice(0, 5);
    if (k === 'title') return String(v).trim();
    return v;
  };
  const cambios = {};
  for (const k of CLAVES_EDITABLES) {
    if (!(k in form)) continue;
    const a = norm(k, task[k]), b = norm(k, form[k]);
    if (a !== b) cambios[k] = b;
  }
  return cambios;
}

/** Días hasta el deadline (negativo si vencido) — útil para textos. */
export const diasHastaDeadline = (t, ahora = new Date()) =>
  (t?.due_date ? diffDias(hoyMadrid(ahora), t.due_date) : null);

/** Convierte "Tú completó…" en "Tú completaste…" (para el historial personal). */
const VERBOS_TU = {
  'creó': 'creaste', 'editó': 'editaste', 'cambió': 'cambiaste', 'reasignó': 'reasignaste',
  'completó': 'completaste', 'reabrió': 'reabriste', 'movió': 'moviste', 'archivó': 'archivaste',
  'desarchivó': 'desarchivaste', 'comentó': 'comentaste', 'modificó': 'modificaste',
};
const RE_VERBOS_TU = new RegExp(`(^|\\s)(${Object.keys(VERBOS_TU).join('|')})(?=\\s|$)`, 'gu');
export function enSegundaPersona(texto) {
  const s = String(texto);
  if (!s.startsWith('Tú ')) return s;
  return s.replace(RE_VERBOS_TU, (m, esp, v) => `${esp}${VERBOS_TU[v]}`);
}
