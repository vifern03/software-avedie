/** Edición y borrado de Gestión de Pendientes — lógica pura (sin React ni Supabase). */

export const ESTADOS_PENDIENTE = ['Pendiente de tareas', 'Tramitado', 'Formalizado'];

/* Campos editables por admin/manager, con su etiqueta para el registro de actividades. */
export const CAMPOS_EDITABLES = [
  { key: 'nombre',               label: 'Nº OI',  raw: 'Nombre' },
  { key: 'cups',                 label: 'CUPS' },
  { key: 'numero_caso',          label: 'Nº caso', raw: 'Número del caso' },
  { key: 'fecha_creacion_excel', label: 'Fecha',  raw: 'Fecha de creación' },
  { key: 'estado_incidencia',    label: 'Estado' },
];

export const puedeGestionarPendientes = (user) =>
  ['admin', 'manager'].includes(user?.role?.toLowerCase());

/* Valor mostrado: la columna manda (es lo que se edita); si es null —filas
   antiguas— cae al valor original del Excel guardado en raw_data. */
export function valorCampo(r, key) {
  const campo = CAMPOS_EDITABLES.find(c => c.key === key);
  const v = r?.[key] ?? (campo?.raw ? r?.raw_data?.[campo.raw] : undefined);
  if (key === 'estado_incidencia') return v || 'Pendiente de tareas';
  return v == null ? '' : String(v);
}

/* Fechas del Excel vienen como "D/M/AAAA" (sin ceros a la izquierda) — Date()
   nativo las interpreta de forma ambigua/inconsistente entre navegadores, así
   que se parsean a mano. Devuelve null si no es un formato reconocible. */
export function parseFechaExcel(str) {
  if (!str) return null;
  const parts = String(str).trim().split(/[/-]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/* Devuelve un mensaje de error o null si el formulario es válido. */
export function validarEdicion(form) {
  if (!String(form.cups ?? '').trim()) return 'El CUPS es obligatorio.';
  const fecha = String(form.fecha_creacion_excel ?? '').trim();
  if (fecha && parseFechaExcel(fecha) == null) return 'La fecha debe tener el formato D/M/AAAA.';
  if (!ESTADOS_PENDIENTE.includes(form.estado_incidencia)) return 'Estado no válido.';
  return null;
}

/* Diferencias entre el registro y el formulario: [{ key, label, de, a }]. */
export function cambiosEdicion(registro, form) {
  return CAMPOS_EDITABLES
    .map(({ key, label }) => ({ key, label, de: valorCampo(registro, key), a: String(form[key] ?? '').trim() }))
    .filter(c => c.de !== c.a);
}

/* Objeto para el UPDATE de Supabase a partir de los cambios. */
export function updateDesdeCambios(cambios, ahoraIso = new Date().toISOString()) {
  const obj = {};
  for (const c of cambios) {
    if (c.key === 'cups') obj.cups = c.a;
    else if (c.key === 'estado_incidencia') {
      obj.estado_incidencia = c.a;
      obj.fecha_formalizacion = c.a === 'Formalizado' ? ahoraIso : null;
    } else obj[c.key] = c.a; // '' (no null) para que un campo vaciado no vuelva a mostrar raw_data
  }
  return obj;
}

export const describirCambios = (cambios) =>
  cambios.map(c => `${c.label}: "${c.de || '—'}" → "${c.a || '—'}"`).join('; ');

export const etiquetaRegistro = (r) => valorCampo(r, 'nombre') || r?.cups || `#${r?.id}`;
