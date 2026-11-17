// Actualiza tarifas desde las hojas PDF de Endesa haciendo EXACTAMENTE lo que hace el botón
// «Actualizar tarifa» (ActualizarTarifaModal): lectura con la IA, limpieza, validación,
// subida del PDF al bucket y RPC tarifa_guardar_version con el usuario indicado.
// Además, antes de guardar exige que el resultado coincida con la referencia copiada a mano
// del PDF (tests/fixtures/tarifas_esperadas_<lote>.json); si algo no cuadra, no guarda nada.
//
//   node scripts/aplicar_tarifas_pdf.mjs <lote> <usuario-admin>            → solo comprueba
//   node scripts/aplicar_tarifas_pdf.mjs <lote> <usuario-admin> --guardar  → guarda las versiones
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [lote, actor] = process.argv.slice(2);
const GUARDAR = process.argv.includes('--guardar');
if (!lote || !actor) { console.error('Uso: node scripts/aplicar_tarifas_pdf.mjs <lote> <usuario-admin> [--guardar]'); process.exit(1); }

const API = process.env.GEMINI_API_BASE || 'https://software-avedie.vercel.app';
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (url, opts) => fetchOriginal(typeof url === 'string' && url.startsWith('/api/') ? API + url : url, opts);

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { extraerFactura, vaciarCacheExtracciones } = await import('../src/lib/energia/geminiCliente.js');
const { TARIFAS, aplicarVersion, leerRuta, valoresActuales } = await import('../src/lib/tarifas/registro.js');
const { VERSION_PROMPT, calcularCambios, limpiarRespuesta, promptTarifa, validarActualizacion } = await import('../src/lib/tarifas/actualizador.js');

const ref = JSON.parse(fs.readFileSync(`tests/fixtures/tarifas_esperadas_${lote}.json`, 'utf8'));

// Versiones activas de la BD aplicadas encima de src/data, como al arrancar el CRM.
const { data: activas, error: eAct } = await supabase.from('tarifas_versiones').select('id,tarifa_id,version,valores,valida_desde,valida_hasta').eq('activa', true);
if (eAct) throw eAct;
for (const v of activas) aplicarVersion(v.tarifa_id, v);

async function sesion() {
  const { data, error } = await supabase.rpc('doc_b2b_sesion_crm', { p_username: actor });
  if (error) throw new Error(error.message);
  return data.token;
}

const listas = [];
for (const [tarifaId, r] of Object.entries(ref.tarifas)) {
  const bytes = fs.readFileSync(path.join(ref.carpeta, r.pdf));
  const file = new File([bytes], r.pdf, { type: 'application/pdf' });
  let res = null;
  for (let intento = 1; intento <= 3 && !res; intento++) {
    try {
      vaciarCacheExtracciones();
      const { datos } = await extraerFactura(file, { prompt: promptTarifa(tarifaId), version: `tarifa-${tarifaId}-${VERSION_PROMPT}`, parse: JSON.parse, esperaMs: 45000 });
      const limpio = limpiarRespuesta(tarifaId, datos);
      const actuales = valoresActuales(tarifaId);
      const { errores } = validarActualizacion(tarifaId, limpio, actuales);
      const { cambios } = calcularCambios(tarifaId, limpio.valores, actuales);
      res = { ...limpio, errores, cambios };
    } catch (e) {
      console.log(`  ${tarifaId}: intento ${intento} sin respuesta (${e.message})`);
    }
  }
  if (!res) { console.log(`FALLO ${tarifaId}: la IA no ha respondido`); continue; }

  // Resultado tras guardar, sobre una copia, comparado con la referencia del PDF.
  const real = TARIFAS[tarifaId].objeto;
  const copia = structuredClone(real);
  TARIFAS[tarifaId].objeto = copia;
  aplicarVersion(tarifaId, { id: 'sim', version: 0, valores: res.valores, valida_desde: res.validaDesde, valida_hasta: res.validaHasta });
  TARIFAS[tarifaId].objeto = real;
  const malos = [
    ...Object.entries(r.valores).filter(([k, v]) => leerRuta(copia, k) !== v).map(([k, v]) => `${k}: ${leerRuta(copia, k)} ≠ ${v}`),
    ...Object.entries(r.textos || {}).filter(([k, v]) => leerRuta(copia, k) !== v).map(([k, v]) => `${k}: «${leerRuta(copia, k)}» ≠ «${v}»`),
    ...(res.validaDesde !== ref.desde || res.validaHasta !== ref.hasta ? [`validez ${res.validaDesde}→${res.validaHasta}`] : []),
  ];
  if (res.errores.length || malos.length) {
    console.log(`FALLO ${tarifaId}: ${[...res.errores, ...malos].slice(0, 6).join(' | ')}`);
    continue;
  }
  console.log(`OK   ${tarifaId}: ${Object.keys(res.cambios).length} cambios, validez ${res.validaDesde} → ${res.validaHasta}`);
  listas.push({ tarifaId, res, bytes });
}

if (listas.length !== Object.keys(ref.tarifas).length) { console.log('\nNo se guarda nada: hay tarifas sin comprobar.'); process.exit(1); }
if (!GUARDAR) { console.log('\nTodo cuadra. Comprobación sin guardar (usa --guardar).'); process.exit(0); }

const token = await sesion();
for (const { tarifaId, res, bytes } of listas) {
  // Igual que ActualizarTarifaModal.guardar
  const { data: arch, error: e1 } = await supabase.functions.invoke('doc-b2b-archivos', { body: { actor, token, accion: 'subir_tarifa', tarifaId } });
  if (e1) throw new Error(`${tarifaId}: ${e1.message}`);
  const ruta = Object.keys(arch.urls)[0];
  const u = arch.urls[ruta];
  const { error: e2 } = await supabase.storage.from(arch.bucket).uploadToSignedUrl(u.path, u.token, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
  if (e2) throw new Error(`${tarifaId}: ${e2.message}`);
  const { data: version, error: e3 } = await supabase.rpc('tarifa_guardar_version', {
    p_actor: actor, p_token: token, p_tarifa_id: tarifaId, p_valores: res.valores, p_valida_desde: res.validaDesde, p_valida_hasta: res.validaHasta,
    p_pdf_path: ruta, p_pdf_sha256: createHash('sha256').update(bytes).digest('hex'), p_cambios: res.cambios,
  });
  if (e3) throw new Error(`${tarifaId}: ${e3.message}`);
  console.log(`GUARDADA ${tarifaId}: versión ${version.version} (${ruta})`);
}
