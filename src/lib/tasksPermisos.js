/* Permisos de UI de Tasks — reflejo exacto de las reglas de docs/tasks/CONTRATO.md.
   El servidor (RPC) vuelve a validarlas; aquí solo decidimos qué ofrece la interfaz.
   `user` = { username, role } (role: 'admin' | 'manager' | 'comercial'). Módulo puro. */

const esAdmin = (u) => u?.role === 'admin';
const esManager = (u) => u?.role === 'manager';
const esCreador = (u, t) => !!u && !!t && t.created_by === u.username;
const esResponsable = (u, t) => !!u && !!t && t.assignee === u.username;

/** Compartida con el usuario (además del responsable): ve, comenta y cambia el estado. */
export const esCompartida = (u, t) => !!u && !!t && Array.isArray(t.shared_with) && t.shared_with.includes(u.username);

/** Visibilidad: admin ve todo; resto, tareas que creó, tiene asignadas o le han compartido. Borradas: nadie. */
export function puedeVer(user, task) {
  if (!user || !task || task.deleted_at) return false;
  return esAdmin(user) || esCreador(user, task) || esResponsable(user, task) || esCompartida(user, task);
}

/** Crear para otros usuarios (o varios): admin y manager. Comercial solo para sí mismo. */
export const puedeCrearParaOtros = (user) => esAdmin(user) || esManager(user);

/** Editar título/descripción/fechas/prioridad: admin o creador. */
export const puedeEditar = (user, task) => !!task && (esAdmin(user) || esCreador(user, task));

/** Mover en calendario (planned_date/time): admin o creador. */
export const puedeMover = puedeEditar;

/** Archivar / desarchivar: admin o creador. */
export const puedeArchivar = puedeEditar;

/** Reasignar: admin, o creador con rol manager. */
export const puedeReasignar = (user, task) =>
  !!task && (esAdmin(user) || (esManager(user) && esCreador(user, task)));

/** Cambiar estado / completar / reabrir: admin, creador, responsable o compartida. */
export const puedeCambiarEstado = (user, task) =>
  !!task && (esAdmin(user) || esCreador(user, task) || esResponsable(user, task) || esCompartida(user, task));

/** Borrar (borrado lógico): admin o creador. El responsable que no la creó, no. */
export const puedeBorrar = (user, task) => !!task && (esAdmin(user) || esCreador(user, task));

/** Compartir con otros usuarios (el responsable no cambia): admin, creador o responsable. */
export const puedeCompartir = (user, task) =>
  !!task && (esAdmin(user) || esCreador(user, task) || esResponsable(user, task));

/** Comentar: cualquiera que vea la tarea. */
export const puedeComentar = puedeVer;

/** Cambiar el color de un usuario: solo admin. */
export const puedeCambiarColor = (user) => esAdmin(user);

/** Vista Equipo/estadísticas: admin (todos) y manager (solo lo que creó). */
export const puedeVerEquipo = (user) => esAdmin(user) || esManager(user);

/** Filtro por trabajador en la lista: admin y manager. */
export const puedeFiltrarPorTrabajador = puedeVerEquipo;

/** Resumen de permisos sobre una tarea concreta. */
export function permisosTarea(user, task) {
  return {
    ver: puedeVer(user, task),
    editar: puedeEditar(user, task),
    mover: puedeMover(user, task),
    archivar: puedeArchivar(user, task),
    reasignar: puedeReasignar(user, task),
    cambiarEstado: puedeCambiarEstado(user, task),
    comentar: puedeComentar(user, task),
    borrar: puedeBorrar(user, task),
    compartir: puedeCompartir(user, task),
  };
}

/** Pestañas de la lista disponibles para el rol. */
export function pestanasDisponibles(user) {
  const base = ['mis', 'proximas', 'vencidas', 'sinfecha', 'completadas'];
  if (esAdmin(user) || esManager(user)) base.push('asignadas');
  if (esAdmin(user)) base.push('todas');
  base.push('archivadas');
  return base;
}

/** Vistas disponibles para el rol. */
export function vistasDisponibles(user) {
  return puedeVerEquipo(user) ? ['lista', 'calendario', 'equipo'] : ['lista', 'calendario'];
}
