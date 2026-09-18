/**
 * Límites de tiempo, caché y deduplicación de la extracción (sin llamar a Gemini:
 * fetch simulado).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerFactura, ExtraccionTimeout, vaciarCacheExtracciones, EXTRACTOR_VERSION } from '../src/lib/energia/geminiCliente.js';
import handler from '../api/gemini.js';

const doc = (txt) => new Blob([txt], { type: 'application/pdf' });
const parse = (t) => JSON.parse(t);

function fetchQueNoResponde() {
  return (url, opts) => new Promise((_, rej) => opts.signal.addEventListener('abort', () => {
    const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
  }));
}

test('cliente: sin respuesta → ExtraccionTimeout en el plazo, y no se cachea', async () => {
  vaciarCacheExtracciones();
  const orig = globalThis.fetch;
  globalThis.fetch = fetchQueNoResponde();
  const t0 = Date.now();
  await assert.rejects(extraerFactura(doc('A'), { prompt: 'p', parse, esperaMs: 300 }), ExtraccionTimeout);
  assert.ok(Date.now() - t0 < 1500);
  let n = 0;
  globalThis.fetch = async () => { n++; return { ok: true, json: async () => ({ response: '{"x":1}' }) }; };
  const r = await extraerFactura(doc('A'), { prompt: 'p', parse });
  assert.equal(r.desdeCache, false);
  assert.equal(n, 1);
  globalThis.fetch = orig;
});

test('cliente: misma factura → caché; otra versión del extractor → nueva llamada; simultáneas deduplicadas', async () => {
  vaciarCacheExtracciones();
  const orig = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; await new Promise(r => setTimeout(r, 50)); return { ok: true, json: async () => ({ response: '{"x":1}' }) }; };
  const [a, b] = await Promise.all([extraerFactura(doc('B'), { prompt: 'p', parse }), extraerFactura(doc('B'), { prompt: 'p', parse })]);
  assert.equal(n, 1);
  assert.deepEqual(a.datos, b.datos);
  const c = await extraerFactura(doc('B'), { prompt: 'p', parse });
  assert.equal(c.desdeCache, true);
  assert.equal(n, 1);
  await extraerFactura(doc('B'), { prompt: 'p', parse, version: EXTRACTOR_VERSION + '-nueva' });
  assert.equal(n, 2);
  await extraerFactura(doc('C'), { prompt: 'p', parse });
  assert.equal(n, 3);
  globalThis.fetch = orig;
});

test('cliente: respuesta que no es JSON válido no se cachea', async () => {
  vaciarCacheExtracciones();
  const orig = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async () => { n++; return { ok: true, json: async () => ({ response: 'no json' }) }; };
  await assert.rejects(extraerFactura(doc('D'), { prompt: 'p', parse }));
  await assert.rejects(extraerFactura(doc('D'), { prompt: 'p', parse }));
  assert.equal(n, 2);
  globalThis.fetch = orig;
});

test('servidor: los reintentos respetan el presupuesto total de tiempo', async () => {
  const orig = globalThis.fetch;
  const origKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'prueba';
  globalThis.fetch = fetchQueNoResponde();
  const t0 = Date.now();
  const out = await new Promise((resolve) => {
    const r = { status(c) { r.c = c; return r; }, json(o) { resolve({ c: r.c, o }); return r; } };
    handler({ method: 'POST', body: { text: 'x', presupuestoMs: 9000 } }, r);
  });
  const ms = Date.now() - t0;
  assert.equal(out.c, 503);
  assert.ok(ms < 10500, `tardó ${ms} ms`);
  globalThis.fetch = orig;
  process.env.GEMINI_API_KEY = origKey;
});
