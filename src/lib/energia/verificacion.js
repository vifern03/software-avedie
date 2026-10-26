/**
 * Verificación de los datos extraídos de una factura ANTES de usarlos.
 *
 * Para cada dato esencial se reúnen sus lecturas posibles a partir de la evidencia:
 *   - el valor que devuelve Gemini,
 *   - el texto literal que Gemini dice haber leído ("15.001"),
 *   - ese mismo texto en el PDF (pdf.js, sin IA) y el separador decimal de su línea,
 * y se elige la combinación que cumple las reglas obligatorias (`duras`) y encaja
 * mejor con el resto de la factura (`blandas`). Solo se eligen lecturas de lo que
 * está impreso: nunca se inventa ni se redondea un valor.
 *
 * Si no hay una solución única, se hace una segunda consulta a la IA solo sobre los
 * campos en conflicto, pidiendo la línea literal donde aparecen (sin enseñarle la
 * primera respuesta); el código comprueba que esa línea existe en el PDF y vuelve a
 * leer el número. Si aun así no se resuelve, el dato queda bloqueado y se explica.
 *
 * Las reglas de cada tipo de factura están en `esquemas.js`.
 */

import { leerNumero, convencionDeLinea, variantesImpresas, inequivoco } from './numeros.js';
import { lineasConToken, citaEnPdf } from './textoPdf.js';

const MISMO = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
const MAX_COMBINACIONES = 50000;

/** Texto que contiene algún dígito (el literal copiado por la IA). */
const esLiteral = (t) => typeof t === 'string' && /\d/.test(t);

/**
 * Lecturas posibles de un campo.
 * @returns {{ candidatos: {valor:number, prior:number, fuentes:string[]}[], verificadoPdf: boolean,
 *             convencion: 'coma'|'punto'|null, lineas: string[], literal: string|null }}
 */
export function candidatosCampo({ valorIA, textoIA, textoPdf, prior = {} }) {
  const cand = [];
  const add = (valor, puntos, fuente) => {
    if (valor == null || !Number.isFinite(valor)) return;
    const c = cand.find(x => MISMO(x.valor, valor));
    if (c) { c.prior += puntos; if (!c.fuentes.includes(fuente)) c.fuentes.push(fuente); }
    else cand.push({ valor, prior: puntos, fuentes: [fuente] });
  };

  let lineas = [];
  let literal = esLiteral(textoIA) ? textoIA.trim() : null;
  if (literal && textoPdf) lineas = lineasConToken(textoPdf, literal);
  // Sin literal (o no aparece en el PDF): se busca el valor de la IA con sus formas impresas.
  if (!lineas.length && textoPdf && valorIA != null) {
    for (const v of variantesImpresas(valorIA)) {
      const l = lineasConToken(textoPdf, v);
      if (l.length) { lineas = l; literal = literal && lineasConToken(textoPdf, literal).length ? literal : v; break; }
    }
  }
  const verificadoPdf = lineas.length > 0;
  const convencion = lineas.map(l => convencionDeLinea(l.texto)).find(Boolean) ?? null;

  if (literal) {
    const r = leerNumero(literal, { convencion });
    // Lectura del literal: fuerte si es inequívoca o la fija la convención de su línea;
    // muy débil si solo la apoya el formato español por defecto (no basta para desempatar).
    for (const v of r.lecturas) add(v, (MISMO(v, r.valor) ? (r.resueltoPor === 'convencion' || !r.ambiguo ? 3 : 0.5) : 0) + (verificadoPdf ? 1 : 0), verificadoPdf ? 'pdf' : 'literal_ia');
  }
  if (valorIA != null) add(valorIA, prior.ia ?? 2, 'ia');
  return { candidatos: cand, verificadoPdf, convencion, lineas: lineas.map(l => l.texto), literal };
}

/**
 * Elige la combinación de lecturas que cumple las reglas obligatorias y mejor encaja.
 * @param {Record<string, {candidatos: object[]}>} campos
 * @param {{ duras: (v)=>{msg:string, campos:string[]}[], blandas: (v)=>number }} reglas
 */
export function resolver(campos, reglas) {
  const claves = Object.keys(campos);
  const opciones = claves.map(k => (campos[k].candidatos.length ? campos[k].candidatos : [{ valor: null, prior: 0, fuentes: [] }]));
  let total = 1;
  for (const o of opciones) total *= o.length;
  // Si hay demasiadas combinaciones, solo se exploran las alternativas de los campos ambiguos con más peso.
  if (total > MAX_COMBINACIONES) opciones.forEach((o, i) => { if (o.length > 2) opciones[i] = [...o].sort((a, b) => b.prior - a.prior).slice(0, 2); });

  const resultados = [];
  const idx = opciones.map(() => 0);
  for (;;) {
    const valores = {};
    let prior = 0;
    claves.forEach((k, i) => { const c = opciones[i][idx[i]]; valores[k] = c.valor; prior += c.prior; });
    const viol = reglas.duras(valores);
    const pen = reglas.blandas ? reglas.blandas(valores) : 0;
    resultados.push({ valores, viol, puntos: prior - 3 * pen, pen });
    let j = 0;
    while (j < idx.length && ++idx[j] >= opciones[j].length) { idx[j] = 0; j++; }
    if (j === idx.length) break;
  }
  const validos = resultados.filter(r => !r.viol.length).sort((a, b) => b.puntos - a.puntos);
  if (!validos.length) {
    const mejor = resultados.sort((a, b) => a.viol.length - b.viol.length || b.puntos - a.puntos)[0];
    return { estado: 'contradiccion', valores: mejor.valores, violaciones: mejor.viol };
  }
  const [a, b] = validos;
  if (b && a.puntos - b.puntos < 1 && claves.some(k => a.valores[k] !== b.valores[k])) {
    const difieren = claves.filter(k => a.valores[k] !== b.valores[k]);
    return { estado: 'empate', valores: a.valores, alternativa: b.valores, camposEnDuda: difieren, violaciones: [] };
  }
  return { estado: 'ok', valores: a.valores, violaciones: [], penalizacion: a.pen };
}

/**
 * Verificación completa de una extracción según su esquema.
 *
 * @param {object} p
 * @param {object} p.esquema      ver esquemas.js
 * @param {object} p.ex           JSON devuelto por Gemini
 * @param {object|null} p.textoPdf  resultado de extraerTextoPdf (null si no hay texto)
 * @param {Function} [p.revisarIA]  async ([{clave, descripcion}]) => { clave: { linea, texto } }
 * @returns {Promise<{ valores, campos, autocorrecciones, avisos, bloqueos, info, traza }>}
 */
export async function verificarExtraccion({ esquema, ex, textoPdf, revisarIA }) {
  const contexto = esquema.contexto(ex);
  const defs = esquema.campos(ex);
  const campos = {};
  for (const d of defs) campos[d.clave] = { ...d, ...candidatosCampo({ valorIA: d.valorIA, textoIA: d.textoIA, textoPdf }) };

  const reglas = {
    duras: (v) => esquema.duras(v, contexto, { documental: true }),
    blandas: (v) => esquema.blandas(v, contexto),
  };
  let r = resolver(campos, reglas);
  const traza = { conTextoPdf: !!textoPdf, primeraResolucion: r.estado, revisionIA: null };

  // ── Segunda consulta a la IA, solo si hace falta
  if (r.estado !== 'ok' && revisarIA) {
    const enDuda = r.estado === 'empate' ? r.camposEnDuda : [...new Set(r.violaciones.flatMap(x => x.campos))];
    const pedir = enDuda.filter(k => campos[k]).map(k => ({ clave: k, descripcion: campos[k].descripcion }));
    if (pedir.length) {
      let resp = null;
      try { resp = await revisarIA(pedir); } catch { resp = null; }
      traza.revisionIA = { campos: enDuda, respondida: !!resp };
      if (resp) {
        for (const k of enDuda) {
          const q = resp[k];
          if (!q || !esLiteral(q.texto)) continue;
          const lineaPdf = textoPdf ? citaEnPdf(textoPdf, q.linea || q.texto) : null;
          if (textoPdf && !lineaPdf) continue; // la cita no está en el documento: no es evidencia
          const conv = convencionDeLinea(lineaPdf ? lineaPdf.texto : q.linea) ?? campos[k].convencion;
          const lr = leerNumero(q.texto, { convencion: conv });
          for (const v of lr.lecturas) {
            const c = campos[k].candidatos.find(x => MISMO(x.valor, v));
            const puntos = MISMO(v, lr.valor) ? (lineaPdf ? 4 : 2) : 0;
            if (c) { c.prior += puntos; c.fuentes.push(lineaPdf ? 'revision_ia_pdf' : 'revision_ia'); }
            else campos[k].candidatos.push({ valor: v, prior: puntos, fuentes: [lineaPdf ? 'revision_ia_pdf' : 'revision_ia'] });
          }
          if (lineaPdf) { campos[k].verificadoPdf = true; campos[k].lineas.push(lineaPdf.texto); }
        }
        r = resolver(campos, reglas);
      }
    }
  }

  const autocorrecciones = [], avisos = [], bloqueos = [], info = [];
  const valores = { ...r.valores };

  if (r.estado === 'empate') {
    // Dos lecturas igual de válidas: se usa la de la convención del documento si la hay;
    // si ninguna evidencia las distingue, el dato no está verificado.
    const sinConvencion = r.camposEnDuda.filter(k => !campos[k].convencion);
    if (sinConvencion.length) {
      bloqueos.push({
        campos: sinConvencion,
        msg: sinConvencion.map(k => `${campos[k].nombre}: "${campos[k].literal ?? inequivoco(campos[k].valorIA)}" admite dos lecturas (${inequivoco(r.valores[k])} o ${inequivoco(r.alternativa[k])}) y la factura no permite distinguirlas.`).join(' '),
      });
    }
  }

  if (r.estado === 'contradiccion') {
    for (const v of r.violaciones) {
      // Si todos los campos implicados están impresos literalmente y sin ambigüedad, es lo que
      // dice el documento: se avisa, pero no se bloquea por algo que la factura afirma.
      const documental = v.campos.every(k => campos[k]?.verificadoPdf && campos[k].candidatos.length === 1);
      if (documental && v.toleraDocumental) avisos.push({ campos: v.campos, msg: `${v.msg} (así figura en la factura).` });
      else bloqueos.push({ campos: v.campos, msg: v.msg });
    }
  }

  for (const k of Object.keys(campos)) {
    const c = campos[k];
    if (valores[k] == null) continue;
    if (c.valorIA == null) {
      autocorrecciones.push({ campos: [k], msg: `${c.nombre}: la IA no devolvió el valor; se toma el impreso en la factura (${c.literal ? `"${c.literal}" → ` : ''}${inequivoco(valores[k])}).` });
    } else if (!MISMO(valores[k], c.valorIA)) {
      autocorrecciones.push({
        campos: [k],
        msg: `${c.nombre}: la IA leyó ${inequivoco(c.valorIA)}; se usa ${inequivoco(valores[k])}${c.literal ? ` (impreso "${c.literal}"${c.convencion ? `, ${c.convencion === 'punto' ? 'punto' : 'coma'} decimal en esa línea` : ''})` : ''} porque es la única lectura coherente con el resto de la factura.`,
      });
    }
  }

  // Ausentes y reglas de presencia propias del esquema (con los valores ya resueltos).
  for (const b of esquema.ausentes(valores, contexto, campos)) (b.nivel === 'bloqueo' ? bloqueos : info).push(b);
  if (r.estado === 'ok' && r.penalizacion > 0) {
    for (const a of esquema.avisosBlandos(valores, contexto)) avisos.push(a);
  }

  return {
    valores,
    campos: Object.fromEntries(Object.entries(campos).map(([k, c]) => [k, {
      valor: valores[k], valorIA: c.valorIA, literal: c.literal, convencion: c.convencion,
      verificadoPdf: c.verificadoPdf, fuentes: c.candidatos.find(x => MISMO(x.valor, valores[k] ?? NaN))?.fuentes || [],
    }])),
    autocorrecciones, avisos, bloqueos, info,
    traza: { ...traza, estadoFinal: r.estado },
  };
}
