// Simula el botón «Actualizar tarifa» tal cual lo usa un admin, SIN guardar nada:
// misma llamada a la IA (prompt, versión, parseo), misma limpieza, validación y lista de
// cambios que ActualizarTarifaModal. Después compara el resultado final con los precios
// de referencia del PDF (tests/fixtures/tarifas_esperadas_<lote>.json), campo a campo.
//
//   node scripts/simular_actualizar_tarifa.mjs <lote> [repeticiones]
//   (lote = nombre del fixture, p. ej. 20261202; PDFs en la ruta indicada en el fixture)
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.GEMINI_API_BASE || 'https://software-avedie.vercel.app';
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (url, opts) => fetchOriginal(typeof url === 'string' && url.startsWith('/api/') ? API + url : url, opts);

const { extraerFactura, vaciarCacheExtracciones } = await import('../src/lib/energia/geminiCliente.js');
const { valoresActuales, TARIFAS, aplicarVersion, leerRuta } = await import('../src/lib/tarifas/registro.js');
const { calcularCambios, limpiarRespuesta, promptTarifa, validarActualizacion, VERSION_PROMPT } = await import('../src/lib/tarifas/actualizador.js');

const [lote, reps = '1'] = process.argv.slice(2);
const esperado = JSON.parse(fs.readFileSync(`tests/fixtures/tarifas_esperadas_${lote}.json`, 'utf8'));
let fallos = 0;

for (const [tarifaId, ref] of Object.entries(esperado.tarifas)) {
  const pdf = path.join(esperado.carpeta, ref.pdf);
  const file = new File([fs.readFileSync(pdf)], ref.pdf, { type: 'application/pdf' });
  for (let r = 1; r <= Number(reps); r++) {
    vaciarCacheExtracciones();
    const tag = `${tarifaId} (${r}/${reps})`;
    try {
      // ── Igual que ActualizarTarifaModal.leer ──
      const { datos } = await extraerFactura(file, {
        prompt: promptTarifa(tarifaId), version: `tarifa-${tarifaId}-${VERSION_PROMPT ?? 2}`, parse: JSON.parse, esperaMs: 45000,
      });
      const limpio = limpiarRespuesta(tarifaId, datos);
      const actuales = valoresActuales(tarifaId);
      const { errores, avisos } = validarActualizacion(tarifaId, limpio, actuales);
      const { cambios } = calcularCambios(tarifaId, limpio.valores, actuales);

      // ── Resultado tras «Guardar» (sobre una copia, sin tocar la BD) ──
      const copia = structuredClone(TARIFAS[tarifaId].objeto);
      const real = TARIFAS[tarifaId].objeto;
      TARIFAS[tarifaId].objeto = copia;
      aplicarVersion(tarifaId, { id: 'sim', version: 0, valores: limpio.valores, valida_desde: limpio.validaDesde, valida_hasta: limpio.validaHasta });
      TARIFAS[tarifaId].objeto = real;

      const malos = [];
      for (const [ruta, v] of Object.entries(ref.valores)) {
        const obtenido = leerRuta(copia, ruta);
        if (obtenido !== v) malos.push(`${ruta}: ${obtenido} (debería ${v})`);
      }
      for (const [ruta, v] of Object.entries(ref.textos || {})) {
        const obtenido = leerRuta(copia, ruta);
        if (obtenido !== v) malos.push(`${ruta}: «${obtenido}» (debería «${v}»)`);
      }
      if (limpio.validaDesde !== esperado.desde || limpio.validaHasta !== esperado.hasta) malos.push(`validez ${limpio.validaDesde}→${limpio.validaHasta} (debería ${esperado.desde}→${esperado.hasta})`);
      const bloquea = errores.length > 0;
      const bien = !bloquea && malos.length === 0;
      if (!bien) fallos++;
      console.log(`${bien ? 'OK   ' : 'FALLO'} ${tag}: ${Object.keys(cambios).length} cambios · doc «${limpio.tarifaDocumento}» · ${bloquea ? `BLOQUEADO: ${errores.slice(0, 3).join(' | ')}` : 'se podría guardar'}${Object.keys(avisos).length ? ` · ${Object.keys(avisos).length} avisos` : ''}`);
      for (const m of malos.slice(0, 12)) console.log(`        ✗ ${m}`);
      if (malos.length > 12) console.log(`        … y ${malos.length - 12} más`);
      if (limpio.descartadas.length) console.log(`        descartadas: ${limpio.descartadas.join(', ')}`);
    } catch (e) {
      fallos++;
      console.log(`FALLO ${tag}: ${e.name} ${e.message}`);
    }
  }
}
console.log(fallos ? `\n${fallos} lecturas con problemas` : '\nTodas las lecturas correctas');
process.exit(fallos ? 1 : 0);
