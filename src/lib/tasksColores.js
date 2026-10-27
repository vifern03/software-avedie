/* Colores por usuario para Tasks. Color automático estable (hash del username);
   si existe task_user_preferences.color, prevalece. Módulo puro. */

/* Todos con contraste ≥ 4,5:1 frente a texto blanco (WCAG AA). */
export const PALETA = [
  '#1a73e8', // azul
  '#188038', // verde
  '#d93025', // rojo
  '#b45309', // naranja
  '#9334e6', // morado
  '#0e7490', // cian
  '#c2185b', // frambuesa
  '#4d7c0f', // oliva
  '#86198f', // magenta
  '#3949ab', // índigo
  '#6d4c41', // marrón
  '#546e7a', // gris azulado
];

/** Hash FNV-1a de 32 bits (determinista, sin dependencias). */
export function hashTexto(texto) {
  let h = 0x811c9dc5;
  const s = String(texto ?? '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Nombre legible de un color de la paleta (para aria-label). */
export const NOMBRES_COLOR = {
  '#1a73e8': 'Azul', '#188038': 'Verde', '#d93025': 'Rojo', '#b45309': 'Naranja', '#9334e6': 'Morado', '#0e7490': 'Cian',
  '#c2185b': 'Frambuesa', '#4d7c0f': 'Oliva', '#86198f': 'Magenta', '#3949ab': 'Índigo', '#6d4c41': 'Marrón', '#546e7a': 'Gris azulado',
};

export const colorAutomatico = (username) => PALETA[hashTexto(username) % PALETA.length];

export const esColorValido = (c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c);

/** Color efectivo: preferencia válida guardada o automático. `prefs` = { [username]: '#rrggbb' }. */
export function colorDeUsuario(username, prefs = {}) {
  const c = prefs?.[username];
  return esColorValido(c) ? c : colorAutomatico(username);
}

/** Versión translúcida de un color hex (para fondos suaves). */
export function colorSuave(hex, alfa = 0.12) {
  if (!esColorValido(hex)) return `rgba(95,99,104,${alfa})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Iniciales para avatar ('Ana López' → 'AL', 'comercial1' → 'CO'). */
export function iniciales(nombre) {
  const partes = String(nombre || '?').trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] || '?').slice(0, 2).toUpperCase();
}
