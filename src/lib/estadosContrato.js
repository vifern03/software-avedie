// Estados de contrato de Alta B2C / B2B y sus colores. Fuente única para las tablas
// de Altas y para el Historial de Comparativas (punto de color de las ya dadas de alta).

export const ESTADOS_CONTRATO = ['Pendiente Firma', 'Enviado a Back Office', 'Tramitado', 'Formalizado'];

// Pastel con texto oscuro, como el resto del CRM. El rojo queda reservado para las
// incidencias abiertas en Gestión de Pendientes.
export const ESTADO_BADGE = {
  'Pendiente Firma':       'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  'Enviado a Back Office': 'bg-blue-100 text-blue-800 ring-1 ring-blue-200',
  'Tramitado':             'bg-violet-100 text-violet-800 ring-1 ring-violet-200',
  'Formalizado':           'bg-green-100 text-green-800 ring-1 ring-green-200',
};

export const ESTADO_DOT = {
  'Pendiente Firma':       'bg-amber-400',
  'Enviado a Back Office': 'bg-blue-500',
  'Tramitado':             'bg-violet-500',
  'Formalizado':           'bg-green-500',
};

export const INCIDENCIA_BADGE = 'bg-red-600 text-white ring-1 ring-red-700';
export const INCIDENCIA_DOT = 'bg-red-600';

export const ESTADOS_INCIDENCIA_ABIERTA = ['Pendiente de tareas', 'Tramitado'];

const normCups = (c) => (c || '').toUpperCase().trim();

/** Map CUPS → estado con el que llegó en el Excel de pendientes (incidencia abierta más reciente). */
export function mapaIncidenciasAbiertas(registroPendientes) {
  const m = new Map();
  const fecha = (r) => r.created_at || '';
  for (const r of registroPendientes || []) {
    if (!ESTADOS_INCIDENCIA_ABIERTA.includes(r.estado_incidencia)) continue;
    const k = normCups(r.cups);
    if (!k) continue;
    const previo = m.get(k);
    if (previo && fecha(previo) >= fecha(r)) continue;
    m.set(k, r);
  }
  const out = new Map();
  for (const [k, r] of m) out.set(k, (r.raw_data?.['Estado'] || '').toString().trim() || 'Incidencia abierta');
  return out;
}

export { normCups };
