/**
 * Evaluación de la extracción con la integración REAL de Gemini.
 *
 * Invoca el mismo handler que sirve /api/gemini en producción (api/gemini.js,
 * modelo gemini-2.5-pro) con el prompt PROMPT_EXTRACCION_LUZ, y compara la
 * respuesta con las referencias anonimizadas de tests/fixtures/.
 *
 * Uso:
 *   node scripts/eval_gemini_facturas.mjs <carpeta_facturas> <carpeta_salida_fuera_del_repo>
 *
 * - Las facturas y las respuestas completas del modelo (con datos personales)
 *   se leen/escriben SOLO en las carpetas indicadas, nunca dentro del repositorio.
 * - Por consola solo se imprime la comparación de campos numéricos (sin
 *   titular, CUPS, IBAN ni NIF).
 * - Una llamada por factura (máximo 3 llamadas), sin reintentos adicionales a
 *   los que ya hace el propio handler.
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import handler from '../api/gemini.js';
import { PROMPT_EXTRACCION_LUZ, validarExtraccion, parsearRespuestaModelo } from '../src/lib/energia/extraccion.js';

const [, , dirFacturas, dirSalida] = process.argv;
if (!dirFacturas || !dirSalida) {
  console.error('Uso: node scripts/eval_gemini_facturas.mjs <carpeta_facturas> <carpeta_salida>');
  process.exit(1);
}
if (resolve(dirSalida).startsWith(resolve('.'))) {
  console.error('La carpeta de salida debe estar FUERA del repositorio (contiene datos personales).');
  process.exit(1);
}
mkdirSync(dirSalida, { recursive: true });

// Los nombres reales de los PDF (contienen CUPS / nº de contrato) NO están en el
// repositorio: se leen de <carpeta_facturas>/casos.json →
//   [{ "pdf": "<archivo>.pdf", "ref": "factura_a_iberdrola_61td" }, …]
const CASOS = JSON.parse(readFileSync(join(dirFacturas, 'casos.json'), 'utf8'));

function llamarHandler(body) {
  return new Promise((res) => {
    const out = { statusCode: 200 };
    const r = {
      status(c) { out.statusCode = c; return r; },
      json(o) { out.body = o; res(out); return r; },
    };
    handler({ method: 'POST', body }, r);
  });
}

const eq = (a, b, tol = 0.011) => (a == null && b == null) || (a != null && b != null && Math.abs(Number(a) - Number(b)) <= tol);

function comparar(ex, ref) {
  const filas = [];
  const add = (campo, got, exp, ok) => filas.push({ campo, got: JSON.stringify(got), exp: JSON.stringify(exp), ok });
  add('tarifaAcceso', ex.tarifaAcceso, ref.tarifaAcceso, ex.tarifaAcceso === ref.tarifaAcceso);
  add('fechaEmision', ex.fechaEmision, ref.fechaEmision, ex.fechaEmision === ref.fechaEmision);
  add('periodo.desde', ex.periodoConsumo?.desde, ref.periodoConsumo.desde, ex.periodoConsumo?.desde === ref.periodoConsumo.desde);
  add('periodo.hasta', ex.periodoConsumo?.hasta, ref.periodoConsumo.hasta, ex.periodoConsumo?.hasta === ref.periodoConsumo.hasta);
  add('diasFacturados', ex.diasFacturados, ref.diasFacturados, eq(ex.diasFacturados, ref.diasFacturados));
  for (let i = 0; i < 6; i++) {
    add(`potencia P${i + 1}`, ex.potenciaContratadaKw?.[i], ref.potenciaContratadaKw[i], eq(ex.potenciaContratadaKw?.[i], ref.potenciaContratadaKw[i]));
    const g = ex.consumoFacturadoKwh?.[i], e = ref.consumoFacturadoKwh[i];
    add(`kWh P${i + 1}`, g, e, eq(g, e) || (e === 0 && g == null));
  }
  const vi = validarExtraccion(ex).datos, vr = validarExtraccion(ref).datos;
  add('energía todo incluido (validada)', vi.importes.energiaTotal, vr.importes.energiaTotal, eq(vi.importes.energiaTotal, vr.importes.energiaTotal, 0.05));
  add('potencia €', vi.importes.potencia, vr.importes.potencia, eq(vi.importes.potencia, vr.importes.potencia, 0.05));
  for (const k of ['excesos', 'reactiva', 'alquiler', 'total', 'iva']) {
    const g = vi.importes[k], e = vr.importes[k];
    add(k, g, e, eq(g, e) || ((e === 0 || e == null) && (g === 0 || g == null)));
  }
  add('maxímetros kW', vi.maximetrosKw, vr.maximetrosKw, vr.maximetrosKw.every((v, i) => eq(vi.maximetrosKw[i], v, 0.5)));
  return filas;
}

const resumen = [];
for (const c of CASOS) {
  const ruta = join(dirFacturas, c.pdf);
  const nombreCorto = c.ref;
  if (!existsSync(ruta)) { console.log(`[${nombreCorto}] PDF no encontrado`); continue; }
  const ref = JSON.parse(readFileSync(new URL(`../tests/fixtures/${c.ref}.json`, import.meta.url), 'utf8'));
  const data = readFileSync(ruta).toString('base64');
  const t0 = Date.now();
  const r = await llamarHandler({ text: PROMPT_EXTRACCION_LUZ, history: [], json: true, file: { mimeType: 'application/pdf', data } });
  const ms = Date.now() - t0;
  if (r.statusCode !== 200) {
    console.log(`[${nombreCorto}] FALLO de la integración (${r.statusCode}) en ${ms} ms: ${r.body?.error}`);
    resumen.push({ caso: nombreCorto, fallo: r.body?.error, ms });
    continue;
  }
  writeFileSync(join(dirSalida, `${nombreCorto}.respuesta.txt`), r.body.response);
  let ex;
  try { ex = parsearRespuestaModelo(r.body.response); }
  catch (e) { console.log(`[${nombreCorto}] JSON no parseable: ${e.message}`); resumen.push({ caso: nombreCorto, fallo: 'json', ms }); continue; }
  writeFileSync(join(dirSalida, `${nombreCorto}.json`), JSON.stringify(ex, null, 2));
  const filas = comparar(ex, ref);
  const val = validarExtraccion(ex);
  writeFileSync(join(dirSalida, `${nombreCorto}.validacion.json`), JSON.stringify(val.incidencias, null, 2));
  const fallos = filas.filter(f => !f.ok);
  console.log(`\n[${nombreCorto}] ${ms} ms · ${filas.length - fallos.length}/${filas.length} campos correctos · validador: ${val.ok ? 'sin errores' : 'CON ERRORES'}`);
  for (const f of fallos) console.log(`   ✗ ${f.campo}: extraído ${f.got} · referencia ${f.exp}`);
  for (const i of val.incidencias.filter(x => x.nivel !== 'info')) console.log(`   · [${i.nivel}] ${i.campo}: ${i.mensaje}`);
  resumen.push({ caso: nombreCorto, ms, correctos: filas.length - fallos.length, total: filas.length, fallos: fallos.map(f => f.campo), erroresValidador: val.incidencias.filter(x => x.nivel === 'error').length });
}
writeFileSync(join(dirSalida, 'resumen.json'), JSON.stringify(resumen, null, 2));
console.log('\nResumen guardado en', join(dirSalida, 'resumen.json'));
