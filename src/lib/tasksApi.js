/* Acceso a datos de Tasks (Supabase). Lecturas con from() filtradas por visibilidad
   en la propia consulta; mutaciones por RPC tasks_* con p_actor = username conectado. */
import { supabase } from './supabase';

/** Errores que indican que el módulo no existe en esta BD (tabla/función ausente). */
const CODIGOS_NO_DISPONIBLE = new Set(['42P01', 'PGRST205', 'PGRST202', '42883']);
export const esNoDisponible = (error) => !!error && CODIGOS_NO_DISPONIBLE.has(error.code);

export class TasksError extends Error {
  constructor(mensaje, original) {
    super(mensaje);
    this.name = 'TasksError';
    this.original = original;
    this.noDisponible = esNoDisponible(original);
  }
}

/** Mensaje en español legible a partir de un error de supabase-js / PostgREST. */
export function mensajeError(error) {
  if (!error) return 'Error desconocido';
  if (esNoDisponible(error)) return 'El módulo de tareas aún no está disponible en la base de datos.';
  const msg = String(error.message || '');
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'Sin conexión con el servidor. Inténtalo de nuevo.';
  if (error.code === '23514') return 'Algún dato no es válido (revisa el título y los campos).';
  if (error.code === '23503') return 'El usuario indicado no existe.';
  if (error.code === '22P02' || error.code === '22007' || error.code === '22008') return 'Formato de dato no válido.';
  // Las RPC lanzan mensajes ya en español: se muestran tal cual.
  return msg || 'No se pudo completar la operación.';
}

const comprobar = ({ data, error }) => {
  if (error) throw new TasksError(mensajeError(error), error);
  return data;
};

/** Valor entrecomillado para filtros or() de PostgREST. */
const q = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Filtro de visibilidad aplicado a una consulta de `tasks`. */
export function filtroVisibilidad(user) {
  if (!user || user.role === 'admin') return null;
  return `created_by.eq.${q(user.username)},assignee.eq.${q(user.username)}`;
}

/* ── Lecturas ─────────────────────────────────────────────────────────────── */

export async function fetchTareas(user) {
  let query = supabase.from('tasks').select('*').order('created_at', { ascending: true }).limit(5000);
  const f = filtroVisibilidad(user);
  if (f) query = query.or(f);
  return comprobar(await query) || [];
}

export async function fetchTarea(user, id) {
  let query = supabase.from('tasks').select('*').eq('id', id);
  const f = filtroVisibilidad(user);
  if (f) query = query.or(f);
  const rows = comprobar(await query) || [];
  return rows[0] || null;
}

export async function fetchUsuarios() {
  return comprobar(await supabase.from('usuarios').select('username, display_name, role').is('deleted_at', null)) || [];
}

export async function fetchPreferencias() {
  return comprobar(await supabase.from('task_user_preferences').select('username, color')) || [];
}

/** Eventos de una tarea (historial + comentarios), en orden cronológico. */
export async function fetchEventos(taskId) {
  return comprobar(await supabase.from('task_events').select('*').eq('task_id', taskId).order('created_at', { ascending: true }).limit(500)) || [];
}

/** Historial personal: lo que ha hecho el usuario conectado (más reciente primero). */
export async function fetchHistorialPersonal(username, limite = 150) {
  return comprobar(await supabase.from('task_events').select('*').eq('actor', username).order('created_at', { ascending: false }).limit(limite)) || [];
}

/** Nº de comentarios por tarea (solo de las tareas indicadas, en lotes). */
export async function fetchConteoComentarios(taskIds) {
  const conteo = {};
  const ids = [...new Set(taskIds)].slice(0, 1000);
  for (let i = 0; i < ids.length; i += 100) {
    const lote = ids.slice(i, i + 100);
    const rows = comprobar(await supabase.from('task_events').select('task_id').eq('type', 'commented').in('task_id', lote)) || [];
    for (const r of rows) conteo[r.task_id] = (conteo[r.task_id] || 0) + 1;
  }
  return conteo;
}

/* ── Mutaciones (RPC) ─────────────────────────────────────────────────────── */

const una = (data) => (Array.isArray(data) ? data[0] ?? null : data ?? null);
const nul = (v) => (v === '' || v === undefined ? null : v);

async function rpc(nombre, params) {
  return comprobar(await supabase.rpc(nombre, params));
}

/** Crea una tarea por responsable. Devuelve array de tareas creadas. */
export async function crearTarea(actor, datos) {
  const data = await rpc('tasks_crear', {
    p_actor: actor,
    p_title: String(datos.title || '').trim(),
    p_description: nul(datos.description?.trim?.() ?? datos.description),
    p_assignees: datos.assignees?.length ? datos.assignees : null,
    p_priority: datos.priority || 'normal',
    p_planned_date: nul(datos.planned_date),
    p_planned_time: datos.planned_date ? nul(datos.planned_time) : null,
    p_due_date: nul(datos.due_date),
    p_due_time: datos.due_date ? nul(datos.due_time) : null,
  });
  return Array.isArray(data) ? data : data ? [data] : [];
}

/** Crea (o devuelve si ya existe) la tarea del lote de pendientes importado. */
export async function crearTareaPendientes(actor, lote) {
  return una(await rpc('tasks_crear_pendientes', { p_actor: actor, p_lote: lote }));
}

export async function editarTarea(actor, id, cambios) {
  return una(await rpc('tasks_editar', { p_actor: actor, p_id: id, p_cambios: cambios }));
}

export async function cambiarEstado(actor, id, status) {
  return una(await rpc('tasks_cambiar_estado', { p_actor: actor, p_id: id, p_status: status }));
}

export async function reasignarTarea(actor, id, assignee) {
  return una(await rpc('tasks_reasignar', { p_actor: actor, p_id: id, p_assignee: assignee }));
}

export async function moverTarea(actor, id, plannedDate, plannedTime) {
  return una(await rpc('tasks_mover', { p_actor: actor, p_id: id, p_planned_date: nul(plannedDate), p_planned_time: plannedDate ? nul(plannedTime) : null }));
}

export async function archivarTarea(actor, id, archivar) {
  return una(await rpc('tasks_archivar', { p_actor: actor, p_id: id, p_archivar: !!archivar }));
}

export async function comentarTarea(actor, id, comentario) {
  return una(await rpc('tasks_comentar', { p_actor: actor, p_id: id, p_comentario: String(comentario || '').trim() }));
}

export async function setColorUsuario(actor, username, color) {
  return una(await rpc('tasks_set_color', { p_actor: actor, p_username: username, p_color: color || null }));
}
