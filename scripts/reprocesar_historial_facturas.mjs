// Reprocesa con la IA las facturas guardadas en el Historial de Comparativas que se hicieron
// antes de guardar el estado completo (datos._estado), y les añade:
//   _estado.baseFactura (valores verificados de la factura) y _estado.extraccion (lectura completa).
// No toca nada más de la fila. Solo comparativas 2.0 (las únicas anteriores a ese cambio).
//   node scripts/reprocesar_historial_facturas.mjs            → simulación (no escribe)
//   node scripts/reprocesar_historial_facturas.mjs --escribir → guarda en Supabase (.env)
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { verificarExtraccion } from '../src/lib/energia/verificacion.js';
import { volcarAFormulario } from '../src/lib/energia/formulario.js';
import { LUZ_20 } from '../src/lib/energia/esquemas.js';
import { extraerTextoPdf } from '../src/lib/energia/textoPdf.js';

const ESCRIBIR = process.argv.includes('--escribir');
const API = process.env.GEMINI_API_BASE || 'https://crm-avedie.vercel.app';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter(l => /^\w+=/.test(l)).map(l => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// El cliente de la IA llama a /api/gemini (relativo): en Node se dirige al CRM publicado.
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (url, opts) => fetchOriginal(typeof url === 'string' && url.startsWith('/api/') ? API + url : url, opts);
const { revisarCamposIA } = await import('../src/lib/energia/geminiCliente.js');

// Mismo prompt e historial que la pantalla Comparativas 2.0 (se leen de su código).
const src = fs.readFileSync('src/pages/EstudioComparativo.jsx', 'utf8').replace(/\r\n/g, '\n');
const PROMPT = /const EXTRACTION_PROMPT = `([\s\S]*?)`;/.exec(src)[1];
const HISTORY = new Function(`return ${/history: (\[\n[\s\S]*?\n {10}\]),/.exec(src)[1]};`)();
const MAPA_20 = { kwPunta: 'kwPunta', kwValle: 'kwValle', kwh: 'kwhP1', dias: 'dias', total: 'facturaActual' };

const { data: filas, error } = await supabase.from('historial_comparativas')
  .select('id, tipo, cliente, cups, datos, tiene_factura').eq('tiene_factura', true);
if (error) throw error;
const pendientes = filas.filter(f => !f.datos?._estado);
console.log(`${pendientes.length} comparativas sin estado completo (de ${filas.length} con factura)`);

for (const f of pendientes) {
  const tag = `#${f.id} ${f.cliente || ''} ${f.cups || ''}`;
  if (f.tipo !== 'luz_20') { console.log(`SALTADA ${tag}: tipo ${f.tipo}`); continue; }
  try {
    const { data: arch, error: e1 } = await supabase.from('historial_comparativas_archivos').select('factura').eq('comparativa_id', f.id).maybeSingle();
    if (e1) throw e1;
    const m = /^data:([^;]+);base64,(.*)$/s.exec(arch?.factura || '');
    if (!m) { console.log(`SALTADA ${tag}: sin factura guardada`); continue; }
    const [, mimeType, base64] = m;
    const buffer = Buffer.from(base64, 'base64');
    const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const textoPdf = mimeType === 'application/pdf' ? await extraerTextoPdf(new Uint8Array(buffer)).catch(() => null) : null;

    const res = await fetch('/api/gemini', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: true, modelo: 'flash', thinkingBudget: 128, presupuestoMs: 40000, text: PROMPT, history: HISTORY, file: { mimeType, data: base64 } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    let raw = data.response.trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) raw = fenced[1].trim(); else { const j = raw.match(/\{[\s\S]*\}/); if (j) raw = j[0]; }
    const ex = JSON.parse(raw);

    const verif = await verificarExtraccion({ esquema: LUZ_20, ex, textoPdf, revisarIA: (campos) => revisarCamposIA({ buffer: ab, mimeType }, campos) });
    const { base } = volcarAFormulario(verif, MAPA_20);
    const datos = { ...(f.datos || {}), _estado: { compExcActiva: true, tocPctFactura: null, baseFactura: base, extraccion: ex } };
    console.log(`OK ${tag}: CUPS leído ${ex.cups || '—'} · total ${ex.importeTotalFacturaActual ?? '—'} € · ${Object.keys(ex).length} campos${textoPdf ? ' · con texto PDF' : ''}`);
    if (ESCRIBIR) {
      const { error: e2 } = await supabase.from('historial_comparativas').update({ datos }).eq('id', f.id);
      if (e2) throw e2;
      console.log('   guardado');
    }
  } catch (err) {
    console.log(`FALLO ${tag}: ${err.message}`);
  }
}
if (!ESCRIBIR) console.log('Simulación: no se ha escrito nada (usa --escribir).');
