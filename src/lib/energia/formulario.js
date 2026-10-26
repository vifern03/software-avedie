/**
 * Puente entre los campos de texto de los comparadores y los números que usa el motor.
 *
 * La interfaz no cambia: los campos siguen siendo texto libre y el usuario puede
 * editarlos como siempre. Este módulo decide, en cada recálculo:
 *   - si el campo sigue con el valor verificado de la factura (origen 'factura') o lo ha
 *     editado el usuario (origen 'manual');
 *   - cómo leer lo que ha escrito, sin preguntarle: "15.001" se interpreta con el
 *     separador decimal de la factura en esa línea; si no hay factura, con la lectura
 *     que cumple las reglas obligatorias; y si ambas las cumplen, con el formato español;
 *   - qué incidencias de la extracción siguen vigentes (las de campos ya editados no);
 *   - qué reglas aplicar a los datos manuales (las internas y normativas, nunca las que
 *     comparan con importes de la factura: las simulaciones son legítimas).
 */

import { leerNumero, aCampo, inequivoco } from './numeros.js';

/**
 * Valores verificados → textos de los campos del formulario + "base" para saber luego
 * qué campos ha editado el usuario.
 * @param {Record<string,string>} mapa   clave del esquema → nombre del campo del formulario
 */
export function volcarAFormulario(verif, mapa) {
  const textos = {};
  const base = { campos: {}, incidencias: [] };
  for (const [clave, campo] of Object.entries(mapa)) {
    const valor = verif.valores[clave];
    const texto = aCampo(valor);
    textos[campo] = texto;
    base.campos[clave] = { campo, texto, valor: valor ?? null, convencion: verif.campos[clave]?.convencion ?? null };
  }
  base.incidencias = [
    ...verif.bloqueos.map(x => ({ ...x, nivel: 'bloqueo' })),
    ...verif.autocorrecciones.map(x => ({ ...x, nivel: 'autocorreccion' })),
    ...verif.avisos.map(x => ({ ...x, nivel: 'aviso' })),
    ...verif.info.map(x => ({ ...x, nivel: 'info' })),
  ];
  return { textos, base };
}

/**
 * Lee los campos del formulario y aplica las reglas.
 *
 * @param {object} p
 * @param {object} p.esquema
 * @param {Record<string,string>} p.mapa      clave del esquema → nombre del campo del formulario
 * @param {Record<string,string>} p.form
 * @param {object|null} p.base                 resultado de volcarAFormulario (null sin factura)
 * @param {object} [p.contexto]                contexto del esquema (de la factura, si la hay)
 * @param {object} [p.vacioManual]             clave → valor para un campo vacío escrito a mano (p. ej. kWh → 0)
 * @returns {{ valores, origen, bloqueos, avisos, info }}
 */
export function evaluarFormulario({ esquema, mapa, form, base = null, contexto = {}, vacioManual = {} }) {
  const valores = {}, origen = {}, info = [], ambiguos = {};
  for (const [clave, campo] of Object.entries(mapa)) {
    const texto = form[campo] ?? '';
    const b = base?.campos?.[clave];
    if (b && texto === b.texto) { valores[clave] = b.valor; origen[clave] = 'factura'; continue; }
    origen[clave] = 'manual';
    const r = leerNumero(texto, { convencion: b?.convencion ?? null });
    if (r.ausente && clave in vacioManual) { valores[clave] = vacioManual[clave]; continue; }
    valores[clave] = r.valor;
    if (r.ambiguo && r.resueltoPor !== 'convencion') ambiguos[clave] = { texto: String(texto).trim(), lecturas: r.lecturas };
    else if (r.ambiguo) info.push({ campos: [clave], msg: `"${String(texto).trim()}" se lee como ${inequivoco(r.valor)}, con el separador decimal que usa la factura en ese dato.` });
    if (r.invalido) info.push({ campos: [clave], msg: `"${String(texto).trim()}" no es un número válido.` });
  }

  // Lecturas ambiguas sin factura: la que cumple las reglas obligatorias con el resto de datos.
  const duras = (v) => esquema.duras(v, contexto, { documental: false });
  for (const [clave, a] of Object.entries(ambiguos)) {
    const validas = a.lecturas.filter(x => !duras({ ...valores, [clave]: x }).some(d => d.campos.includes(clave)));
    const elegido = validas.length === 1 ? validas[0] : valores[clave];
    valores[clave] = elegido;
    info.push({ campos: [clave], msg: validas.length === 1
      ? `"${a.texto}" se lee como ${inequivoco(elegido)}: es la única lectura coherente con el resto de datos.`
      : `"${a.texto}" se lee como ${inequivoco(elegido)} (formato español: el punto separa los miles).` });
  }

  // Incidencias de la factura que siguen vigentes: solo las de campos que no se han tocado.
  const intactos = (inc) => inc.campos.every(k => origen[k] !== 'manual');
  const deFactura = (base?.incidencias || []).filter(intactos);
  const bloqueos = deFactura.filter(x => x.nivel === 'bloqueo').map(({ campos, msg }) => ({ campos, msg }));
  const avisos = deFactura.filter(x => x.nivel === 'aviso' || x.nivel === 'autocorreccion').map(({ campos, msg, nivel }) => ({ campos, msg, nivel }));
  info.push(...deFactura.filter(x => x.nivel === 'info').map(({ campos, msg }) => ({ campos, msg })));

  // Reglas obligatorias sobre lo que hay ahora. Las contradicciones entre datos que siguen siendo
  // los de la factura ya se trataron al extraer; aquí cuentan las que implican un dato manual.
  const valoresReglas = { ...valores };
  const pres = esquema.ausentes(valoresReglas, contexto, {}); // completa criterios existentes (p. ej. valle = punta)
  for (const d of duras(valoresReglas)) {
    if (d.campos.some(k => origen[k] === 'manual')) bloqueos.push({ campos: d.campos, msg: d.msg });
  }
  for (const a of pres) {
    if (a.nivel === 'bloqueo') {
      if (!bloqueos.some(b => b.campos.some(k => a.campos.includes(k)))) bloqueos.push({ campos: a.campos, msg: a.msg.replace('No se ha podido leer', 'Falta').replace('No se han podido leer', 'Faltan') });
    } else if (a.campos.some(k => origen[k] === 'manual' || !base)) info.push({ campos: a.campos, msg: a.msg });
  }
  return { valores: valoresReglas, origen, bloqueos, avisos, info };
}
