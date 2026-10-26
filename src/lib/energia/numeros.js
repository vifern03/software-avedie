/**
 * Números de las comparativas: UNA sola forma de leerlos y de escribirlos para
 * todos los comparadores (2.0TD, 3.0TD/6.1TD y gas).
 *
 * Causa del fallo "15,001 kW → 15001 kW" (factura Integra 2610A023312): Gemini
 * devolvía bien 15.001 (número), pero se volcaba al formulario como texto "15.001"
 * y al recalcular se leía con la regla "1.234 = mil doscientos treinta y cuatro".
 * Reglas de este módulo:
 *   - Un number nunca se vuelve a interpretar.
 *   - Al formulario se escribe con `aCampo`: coma decimal y sin separador de miles,
 *     de modo que la lectura posterior es única ("15,001", "15001", "1824,43").
 *   - "15.001" escrito a mano es AMBIGUO: `leerNumero` lo señala y devuelve las dos
 *     lecturas; quien llama decide con el contexto (convención de la factura y
 *     reglas de coherencia). Sin contexto se mantiene la lectura española (miles).
 *   - Vacío = ausente (null), nunca 0.
 */

const ESPACIOS = /[\s   ']/g;

/**
 * Lee un número escrito por una persona o impreso en una factura.
 *
 * @param {number|string|null} entrada
 * @param {object} [op]
 * @param {'coma'|'punto'|null} [op.convencion]  separador decimal conocido del contexto
 * @returns {{ valor: number|null, ausente: boolean, invalido: boolean, ambiguo: boolean,
 *             lecturas: number[], resueltoPor: string|null }}
 *   `lecturas` contiene todas las interpretaciones posibles (1 si no es ambiguo).
 *   `valor` es la elegida: la convención si se ha dado; si no, la española.
 */
export function leerNumero(entrada, op = {}) {
  const res = (valor, extra = {}) => ({ valor, ausente: false, invalido: false, ambiguo: false, lecturas: valor == null ? [] : [valor], resueltoPor: null, ...extra });
  if (entrada === null || entrada === undefined) return res(null, { ausente: true });
  if (typeof entrada === 'number') return Number.isFinite(entrada) ? res(entrada) : res(null, { invalido: true });

  let s = String(entrada).replace(ESPACIOS, '').replace(/[−–]/g, '-');
  if (!s) return res(null, { ausente: true });
  let signo = 1;
  if (/^[-+]/.test(s)) { if (s[0] === '-') signo = -1; s = s.slice(1); }
  if (!/^\d[\d.,]*$/.test(s) || /[.,]$/.test(s)) {
    // ",5" o ".5" también son decimales inequívocos
    if (/^[.,]\d+$/.test(s)) return res(signo * Number('0.' + s.slice(1)));
    return res(null, { invalido: true });
  }

  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  const num = (t) => signo * Number(t);
  const grupos = (t, sep) => new RegExp(`^\\d{1,3}(\\${sep}\\d{3})+$`).test(t);

  if (puntos && comas) {
    // El último separador es el decimal; el otro, de miles (y debe agrupar de 3 en 3).
    const dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const mil = dec === ',' ? '.' : ',';
    const [ent, frac] = [s.slice(0, s.lastIndexOf(dec)), s.slice(s.lastIndexOf(dec) + 1)];
    if (frac.includes(mil) || !grupos(ent, mil) && ent.includes(mil)) return res(null, { invalido: true });
    return res(num(ent.split(mil).join('') + '.' + frac));
  }
  if (comas) {
    if (comas === 1) return res(num(s.replace(',', '.'))); // coma decimal (formato español)
    return grupos(s, ',') ? res(num(s.replace(/,/g, ''))) : res(null, { invalido: true });
  }
  if (puntos) {
    if (puntos > 1) return grupos(s, '.') ? res(num(s.replace(/\./g, ''))) : res(null, { invalido: true });
    const [ent, frac] = s.split('.');
    // "17.0", "0.059937", "15.0012", "0.153": el punto solo puede ser decimal.
    if (frac.length !== 3 || Number(ent) === 0) return res(num(s));
    // "15.001", "27.263": decimal o miles según el documento.
    const comoDecimal = num(s);
    const comoMiles = num(ent + frac);
    const lecturas = [comoDecimal, comoMiles];
    if (op.convencion === 'punto') return res(comoDecimal, { ambiguo: true, lecturas, resueltoPor: 'convencion' });
    if (op.convencion === 'coma') return res(comoMiles, { ambiguo: true, lecturas, resueltoPor: 'convencion' });
    return res(comoMiles, { ambiguo: true, lecturas, resueltoPor: 'formato_es' });
  }
  return res(num(s));
}

/** Valor numérico o `fb` (atajo para importes opcionales). Vacío → fb. */
export function valorNum(entrada, fb = null, op) {
  const r = leerNumero(entrada, op);
  return r.valor == null ? fb : r.valor;
}

/**
 * Número → texto de campo de formulario. Coma decimal, sin separador de miles y sin
 * perder decimales, para que `leerNumero` lo devuelva idéntico.
 */
export function aCampo(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const x = Number(valor);
  if (!Number.isFinite(x)) return '';
  return x.toLocaleString('es-ES', { useGrouping: false, maximumFractionDigits: 12 });
}

/**
 * Número → texto para pantalla e informes (PDF), en formato español con miles.
 * @param {number} valor
 * @param {object|number} [op]  número de decimales fijos, o { min, max }
 */
export function formatoES(valor, op = {}) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) return '—';
  const o = typeof op === 'number' ? { min: op, max: op } : op;
  return Number(valor).toLocaleString('es-ES', {
    minimumFractionDigits: o.min ?? 0,
    maximumFractionDigits: o.max ?? Math.max(o.min ?? 0, 3),
    useGrouping: 'always',
  });
}

/** Cantidad para mensajes sin ambigüedad posible: 15001 · 15,001 (sin punto de miles). */
export const inequivoco = (v) => aCampo(v) || '—';

/** Cantidades (kW, kWh) sin ceros de relleno: 15,001 · 1.442 · 41. */
export const cantidadES = (v) => formatoES(Math.round(Number(v) * 1000) / 1000, { min: 0, max: 3 });

/** Tokens numéricos de una línea de texto ("15.001", "1.824,43", "0,059937"). */
export function tokensNumericos(linea) {
  return String(linea || '').match(/\d[\d.,]*\d|\d/g) || [];
}

/**
 * Separador decimal que usa una línea impresa, deducido de sus números
 * inequívocos: "17.0" o "0.083863" → punto; "1.824,43" o "0,059937" → coma.
 * Devuelve null si no hay evidencia o es contradictoria.
 */
export function convencionDeLinea(linea) {
  let punto = 0, coma = 0;
  for (const t of tokensNumericos(linea)) {
    const p = (t.match(/\./g) || []).length, c = (t.match(/,/g) || []).length;
    if (p && c) { (t.lastIndexOf(',') > t.lastIndexOf('.') ? coma++ : punto++); continue; }
    if (p === 1) { const frac = t.split('.')[1]; if (frac.length !== 3) punto++; continue; }
    if (c === 1) { const frac = t.split(',')[1]; if (frac.length !== 3) coma++; else coma += 0.5; continue; }
    if (p > 1) coma++;   // 1.234.567 → miles con punto
    if (c > 1) punto++;  // 1,234,567 → miles con coma
  }
  if (punto && !coma) return 'punto';
  if (coma && !punto) return 'coma';
  if (punto >= 2 * coma && punto >= 2) return 'punto';
  if (coma >= 2 * punto && coma >= 2) return 'coma';
  return null;
}

/**
 * Variantes impresas plausibles de un valor, para buscarlo en el texto del PDF cuando
 * la IA no ha copiado el literal: 15.001 → "15.001", "15,001", "15,0010"...
 */
export function variantesImpresas(valor) {
  const x = Number(valor);
  if (!Number.isFinite(x)) return [];
  const out = new Set();
  const dec = (String(x).split('.')[1] || '').length;
  for (const d of new Set([dec, Math.max(dec, 2), Math.max(dec, 3), 1])) {
    if (d < dec) continue;
    const coma = x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: 'always' });
    const comaSin = x.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
    const punto = x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: true });
    const puntoSin = x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
    [coma, comaSin, punto, puntoSin].forEach(v => out.add(v));
  }
  return [...out];
}
