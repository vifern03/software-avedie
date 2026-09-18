/**
 * Cliente de extracción con Gemini para las comparativas.
 *
 * - UNA llamada por factura: el resultado se reutiliza para todas las ofertas,
 *   tramos y modalidades (los cambios de selector y la exportación no llaman a la IA).
 * - Caché en memoria de la pestaña (no se guarda en disco ni en localStorage porque
 *   contiene datos personales), con clave = SHA-256 del documento + versión del
 *   extractor. Cambiar el prompt o el esquema → subir EXTRACTOR_VERSION invalida todo.
 * - Espera máxima 45 s: el servidor recibe un presupuesto de 40 s para sus
 *   reintentos y el navegador corta a los 45 s. Un corte NO cuenta como extracción.
 * - Llamadas simultáneas sobre el mismo documento se deduplican.
 */

export const EXTRACTOR_VERSION = 'luz-b2b-2026-09-18.2';
export const ESPERA_MAX_MS = 45000;
const PRESUPUESTO_SERVIDOR_MS = 40000;
const MAX_ENTRADAS = 20;

const cache = new Map();     // clave → objeto extraído (JSON)
const enCurso = new Map();   // clave → Promise

async function sha256Hex(buffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function aBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class ExtraccionTimeout extends Error {
  constructor() { super(`Sin resultado válido en ${ESPERA_MAX_MS / 1000} s`); this.name = 'ExtraccionTimeout'; }
}

/**
 * @returns {Promise<{ datos: object, desdeCache: boolean }>}
 */
export async function extraerFactura(file, { prompt, version = EXTRACTOR_VERSION, parse, esperaMs = ESPERA_MAX_MS }) {
  const buffer = await file.arrayBuffer();
  const clave = `${version}:${await sha256Hex(buffer)}`;
  if (cache.has(clave)) return { datos: cache.get(clave), desdeCache: true };
  if (enCurso.has(clave)) return enCurso.get(clave);

  const promesa = (async () => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), esperaMs);
    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: prompt, history: [], json: true,
          modelo: 'pro', thinkingBudget: 128, presupuestoMs: PRESUPUESTO_SERVIDOR_MS,
          file: { mimeType: file.type || 'application/pdf', data: aBase64(buffer) },
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const datos = parse(data.response); // lanza si no es JSON válido → no se cachea
      cache.set(clave, datos);
      if (cache.size > MAX_ENTRADAS) cache.delete(cache.keys().next().value);
      return { datos, desdeCache: false };
    } catch (err) {
      if (err.name === 'AbortError') throw new ExtraccionTimeout();
      throw err;
    } finally {
      clearTimeout(t);
      enCurso.delete(clave);
    }
  })();
  enCurso.set(clave, promesa);
  return promesa;
}

export function vaciarCacheExtracciones() { cache.clear(); }
