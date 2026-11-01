/**
 * Ensamblado determinista de la documentación: a partir del Alta B2B, las lecturas de
 * la IA, la distribuidora y la tarifa, produce el MODELO (una sola fuente de datos) del
 * que salen los tres documentos. Sin red ni interfaz.
 *
 *   modelo.campos       datos comunes (id de campos.json)
 *   modelo.suministros  uno por CUPS
 *   modelo.avisos       clave → motivo (⚠). Claves: 'titular_nombre' o 's0.sum_via'
 */
import {
  MODALIDADES_SIN_VALIDAR, OBLIGATORIOS, CAMPOS_SUMINISTRO_CONTRATO, OBLIGATORIOS_SUMINISTRO_PS,
  bloquePreciosOpen, fechaEndesa, potenciaEndesa,
} from './generarContratoEndesa.js';
import {
  CAMPOS_VACIOS_ENDESA, MODALIDADES, MOTIVO, OFERTA_POR_DEFECTO, PERMITIR_TARIFA_CADUCADA, PRODUCTO_TEXTO,
  TARIFA_ID, TENSIONES_30TD, TENSION_POR_DEFECTO_30TD, TRAMO_POTENCIA,
} from './constantes.js';
import { normalizarCups } from '../distribuidoras.js';

const CLAVES_POTENCIA = ['potencia_p1', 'potencia_p2', 'potencia_p3', 'potencia_p4', 'potencia_p5', 'potencia_p6'];
const COMUNES_ANEXO = ['validez_desde', 'validez_hasta', 'titular_nombre', 'documento_numero'];

const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
const mayus = (v) => txt(v).toUpperCase();
const sinEspacios = (v) => txt(v).replace(/\s+/g, '').toUpperCase();

/** Provincia como la imprime Endesa en el domicilio fiscal. */
export function provinciaEndesa(p) {
  const t = mayus(p);
  if (!t) return '';
  return /\bESPAÑA$/.test(t) ? t : `${t} ESPAÑA`;
}

/** Dirección del anexo: VIA NUM ESC PISO PUERTA CP LOCALIDAD LOCALIDAD PROVINCIA. */
export function direccionCompleta({ sum_via, sum_numero, sum_escalera, sum_piso, sum_puerta, sum_cp, sum_localidad, sum_provincia }) {
  const l = mayus(sum_localidad);
  return [mayus(sum_via), mayus(sum_numero), mayus(sum_escalera), mayus(sum_piso), mayus(sum_puerta), txt(sum_cp), l, l, mayus(sum_provincia)].filter(Boolean).join(' ');
}

/** CIF de empresa (letra de organización + 7 dígitos + control), no DNI ni NIE. */
export const esCifEmpresa = (doc) => /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/.test(txt(doc).toUpperCase().replace(/[^A-Z0-9]/g, ''));

/** Compara nombres sin tener en cuenta orden, acentos ni puntuación. */
function mismoNombre(a, b) {
  const clave = (v) => mayus(v).normalize('NFD').replace(/[\u0300-\u036f.]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').sort().join(' ');
  return clave(a) === clave(b);
}

/**
 * Titular según los documentos. Persona física: DNI (nunca el nombre del Alta, que puede
 * llevar referencias del negocio) y, si no se lee, la factura. Empresa: tarjeta CIF o factura.
 */
function resolverTitular(documento, c0, { cif, dni, facturas }) {
  const empresa = esCifEmpresa(documento);
  const enFacturas = facturas.map((f) => f?.titular).filter(Boolean);
  const principal = empresa ? cif?.razon_social : dni?.nombre;
  const leido = principal || enFacturas[0];
  const nombre = mayus(leido || (empresa ? c0.nombre : ''));
  const otro = leido && [principal, ...enFacturas].find((v) => v && !mismoNombre(v, leido));
  let aviso = null;
  if (!principal) aviso = MOTIVO.NO_LEIDO;
  if (otro) aviso = `Los documentos indican otro titular (${mayus(otro)})`;
  return { nombre, aviso };
}

export const potenciaMaxima = (s) => Math.max(0, ...CLAVES_POTENCIA.map((k) => Number(s[k]) || 0));

/** Índice del tramo de precios por potencia contratada máxima. */
export function indiceTramo(tarifa, kw) {
  if (!(kw > 0)) return -1;
  const i = tarifa.tramos.findIndex((t) => (t.minIncl ? kw >= t.min : kw > t.min) && kw <= t.max);
  if (i >= 0) return i;
  return kw > tarifa.tramos[tarifa.tramos.length - 1].min ? tarifa.tramos.length - 1 : 0;
}

/** Bloque de precios de un suministro, o null si aún no se conoce su potencia. */
export function bloqueSuministro(tarifa, tarifaAcceso, modalidadId, s) {
  const i = indiceTramo(tarifa, potenciaMaxima(s));
  if (i < 0) return null;
  const mod = tarifa.modalidades.find((m) => m.id === modalidadId);
  return bloquePreciosOpen({
    precioEnergia: tarifa.baseEnergia[i],
    potencias: tarifa.potenciaTerminos.map((p) => p.anyo),
    descuentoPromocional: tarifa.extraAnyo,
    descuentoIndefinido: mod.dto,
    modalidad: MODALIDADES.find((m) => m.id === modalidadId).generador,
    tarifaAcceso,
  });
}

function normalizarTension(leida) {
  const t = txt(leida);
  if (!t) return null;
  const hallada = TENSIONES_30TD.find((v) => t.includes(v.slice(2, 5)));
  return hallada || null;
}

function avisoModalidad(modalidadId) {
  const gen = MODALIDADES.find((m) => m.id === modalidadId).generador;
  return MODALIDADES_SIN_VALIDAR.includes(gen) ? MOTIVO.MODALIDAD : null;
}

function comprobarPotencias(s, tarifaAcceso) {
  const v = CLAVES_POTENCIA.map((k) => Number(s[k])).filter((n) => n > 0);
  if (!v.length) return null;
  if (tarifaAcceso === '3.0TD' && !v.some((n) => n > 15)) return 'En 3.0TD alguna potencia debe superar 15 kW: revísalas';
  if (v.some((n, i) => i > 0 && n < v[i - 1])) return 'Las potencias no siguen el orden habitual (P1 ≤ … ≤ P6): revísalas';
  return null;
}

/**
 * @param {object} p
 * @param {Array} p.clientes filas de Alta B2B, en el orden de selección
 * @param {{facturas:Array, cif:object, dni:object}} p.lecturas lecturas de la IA (null si falló)
 * @param {Array} p.distribuidoras resultado de buscarDistribuidora por cliente
 * @param {{tarifa:object, versionId:string, validaDesde:string, validaHasta:string, estado:string}} p.tarifaInfo
 * @param {string} p.modalidad
 * @param {string} p.fechaISO fecha de generación
 */
export function ensamblar({ clientes, lecturas = {}, distribuidoras, tarifaInfo, modalidad = 'plana', fechaISO }) {
  if (tarifaInfo.estado !== 'vigente' && !PERMITIR_TARIFA_CADUCADA) {
    throw new Error(`La tarifa ${tarifaInfo.tarifa.nombre} no está vigente. Un admin debe actualizarla en Consulta de Tarifas.`);
  }
  const avisos = {};
  const marcar = (clave, motivo) => { if (motivo) avisos[clave] = motivo; };
  const c0 = clientes[0];
  const tarifaAcceso = c0.tarifa;
  const multi = clientes.length > 1;
  const facturas = lecturas.facturas || [];
  const cif = lecturas.cif || null;
  const dni = lecturas.dni || null;

  const documento = sinEspacios(c0.cif_dni) || sinEspacios(facturas.find((f) => f?.cif)?.cif) || sinEspacios(dni?.dni);
  const { nombre: titular, aviso: avisoTitular } = resolverTitular(documento, c0, { cif, dni, facturas });
  const domicilio = cif?.domicilio?.via ? cif.domicilio : (facturas.find((f) => f?.domicilio_titular?.via)?.domicilio_titular || {});

  const campos = {
    oferta_numero: OFERTA_POR_DEFECTO,
    titular_nombre: titular,
    cuenta_titular: titular,
    tipo_documento: 'IDENTIFICADOR FISCAL',
    documento_numero: documento,
    idioma: 'CASTELLANO',
    actividad: 'COMERCIAL',
    telefono1: txt(c0.telefono),
    fiscal_via: mayus(domicilio.via),
    fiscal_numero: mayus(domicilio.numero),
    fiscal_piso: mayus(domicilio.piso),
    fiscal_puerta: mayus(domicilio.puerta),
    fiscal_cp: txt(domicilio.cp),
    fiscal_localidad: mayus(domicilio.localidad),
    fiscal_provincia: provinciaEndesa(domicilio.provincia),
    contacto_nombre: txt(dni?.nombre),
    contacto_dni: sinEspacios(dni?.dni),
    contacto_telefono: txt(c0.telefono),
    contacto_email: txt(c0.mail),
    tipo_solicitud: 'Nuevo Suministro',
    check_tipo_solicitud: true,
    check_acepta_comunicaciones: false,
    check_cargo_cuenta_renovacion: false,
    iban: sinEspacios(c0.cuenta_bancaria),
    fecha_firma: fechaEndesa(fechaISO),
    validez_desde: fechaEndesa(tarifaInfo.validaDesde),
    validez_hasta: fechaEndesa(tarifaInfo.validaHasta),
  };
  for (const v of CAMPOS_VACIOS_ENDESA) if (!v.suministro) campos[v.id] = '';

  marcar('oferta_numero', MOTIVO.OFERTA);
  marcar('titular_nombre', avisoTitular);
  marcar('cuenta_titular', avisoTitular);
  for (const k of ['fiscal_via', 'fiscal_numero', 'fiscal_piso', 'fiscal_puerta', 'fiscal_cp', 'fiscal_localidad', 'fiscal_provincia']) {
    const opcional = ['fiscal_numero', 'fiscal_piso', 'fiscal_puerta'].includes(k);
    if (campos[k]) marcar(k, MOTIVO.IA);
    else if (!opcional) marcar(k, MOTIVO.NO_LEIDO);
  }
  for (const k of ['contacto_nombre', 'contacto_dni']) marcar(k, campos[k] ? MOTIVO.IA : MOTIVO.NO_LEIDO);

  const suministros = clientes.map((c, k) => {
    const f = facturas[k] || null;
    const d = f?.suministro || {};
    const dist = distribuidoras[k] || {};
    const cups = normalizarCups(c.cups);
    const s = {
      cliente_id: c.id,
      cups,
      sum_via: mayus(d.via),
      sum_numero: mayus(d.numero),
      sum_escalera: mayus(d.escalera),
      sum_piso: mayus(d.piso),
      sum_puerta: mayus(d.puerta),
      sum_cp: txt(d.cp),
      sum_localidad: mayus(d.localidad),
      sum_provincia: mayus(d.provincia),
      sum_ref_catastral: '',
      distribuidora: txt(dist.texto_endesa),
      equipo_medida: 'ICP Instalado',
      producto: PRODUCTO_TEXTO[tarifaAcceso],
      tarifa_acceso: tarifaAcceso,
      tramo_potencia: TRAMO_POTENCIA[tarifaAcceso],
      tension: '',
    };
    const pre = `s${k}.`;
    for (let i = 0; i < 6; i++) {
      const v = f?.potencias?.[`p${i + 1}`];
      s[CLAVES_POTENCIA[i]] = Number(v) > 0 ? potenciaEndesa(v) : '';
      marcar(pre + CLAVES_POTENCIA[i], s[CLAVES_POTENCIA[i]] ? MOTIVO.IA : (i === 0 ? MOTIVO.NO_LEIDO : null));
    }

    if (tarifaAcceso === '6.1TD') {
      s.tension = txt(f?.tension);
      marcar(`${pre}tension`, s.tension ? MOTIVO.IA : MOTIVO.NO_LEIDO);
    } else {
      const t = normalizarTension(f?.tension);
      s.tension = t || TENSION_POR_DEFECTO_30TD;
      marcar(`${pre}tension`, t ? MOTIVO.IA : MOTIVO.DEFECTO);
    }

    s.sum_direccion_completa = direccionCompleta(s);
    for (const clave of ['sum_via', 'sum_cp', 'sum_localidad', 'sum_provincia', 'sum_direccion_completa']) if (!s[clave]) marcar(pre + clave, MOTIVO.NO_LEIDO);

    if (dist.estado === 'BAJA' || dist.estado === 'NO_OFICIAL') marcar(`${pre}distribuidora`, `Distribuidora en estado ${dist.estado}: revísala`);
    else if (dist.error) marcar(`${pre}distribuidora`, dist.error);
    else if (!dist.texto_endesa) marcar(`${pre}distribuidora`, 'Sin texto de Endesa para esta distribuidora: escríbelo');

    // Comprobaciones cruzadas
    if (f?.cups && sinEspacios(f.cups) !== cups) marcar(`${pre}cups`, `La factura indica otro CUPS (${sinEspacios(f.cups)})`);
    if (f?.cif && sinEspacios(f.cif) !== campos.documento_numero) marcar('documento_numero', `La factura indica otro CIF (${sinEspacios(f.cif)})`);
    marcar(pre + CLAVES_POTENCIA[0], comprobarPotencias(s, tarifaAcceso) || avisos[pre + CLAVES_POTENCIA[0]]);

    s.bloque_precios = bloqueSuministro(tarifaInfo.tarifa, tarifaAcceso, modalidad, s);
    return s;
  });

  if (cif?.cif && sinEspacios(cif.cif) !== campos.documento_numero) marcar('documento_numero', `La tarjeta CIF indica otro CIF (${sinEspacios(cif.cif)})`);
  if (!esCifEmpresa(documento) && dni?.dni && sinEspacios(dni.dni) !== documento) marcar('documento_numero', `El DNI indica otro número (${sinEspacios(dni.dni)})`);

  const caducada = tarifaInfo.estado !== 'vigente';
  if (caducada) { marcar('validez_desde', MOTIVO.CADUCADA); marcar('validez_hasta', MOTIVO.CADUCADA); }
  marcar('modalidad', avisoModalidad(modalidad));

  return {
    version: 1,
    multipunto: multi,
    tarifa_acceso: tarifaAcceso,
    tarifa_id: TARIFA_ID[tarifaAcceso],
    tarifa_version_id: tarifaInfo.versionId,
    tarifa_caducada: caducada,
    modalidad,
    campos,
    suministros,
    avisos,
  };
}

/** Datos para cada generador. */
export function derivarDocumentos(modelo) {
  const { campos, suministros } = modelo;
  const s0 = suministros[0];
  const contrato = { ...campos, multipunto: modelo.multipunto };
  for (const k of CAMPOS_SUMINISTRO_CONTRATO) contrato[k] = modelo.multipunto ? '' : (s0[k] ?? '');
  const anexo = {
    ...Object.fromEntries(COMUNES_ANEXO.map((k) => [k, campos[k]])),
    suministros: suministros.map((s) => ({
      sum_direccion_completa: s.sum_direccion_completa, cups: s.cups, tarifa_acceso: s.tarifa_acceso,
      producto: s.producto, bloque_precios: s.bloque_precios,
    })),
  };
  const puntos = modelo.multipunto ? {
    titular_nombre: campos.titular_nombre,
    documento_numero: campos.documento_numero,
    suministros: suministros.map((s) => ({
      direccion: s.sum_direccion_completa, cups: s.cups, producto: s.producto, tarifa_acceso: s.tarifa_acceso,
      tension: s.tension, distribuidora: s.distribuidora, equipo_medida: s.equipo_medida,
      ...Object.fromEntries(CLAVES_POTENCIA.map((k) => [k, s[k]])),
    })),
  } : null;
  return { contrato, anexo, puntos };
}

/** Claves obligatorias vacías: se pintan en rojo y bloquean la descarga. */
export function obligatoriosVacios(modelo) {
  const vacios = [];
  const v = (x) => x === undefined || x === null || String(x).trim() === '';
  for (const k of OBLIGATORIOS.contrato) {
    if (CAMPOS_SUMINISTRO_CONTRATO.includes(k)) continue;
    if (v(modelo.campos[k])) vacios.push(k);
  }
  for (const k of OBLIGATORIOS.anexo) {
    if (COMUNES_ANEXO.includes(k) && v(modelo.campos[k])) vacios.push(k);
  }
  modelo.suministros.forEach((s, i) => {
    const claves = new Set([
      ...OBLIGATORIOS.contrato.filter((k) => CAMPOS_SUMINISTRO_CONTRATO.includes(k)),
      ...OBLIGATORIOS_SUMINISTRO_PS.filter((k) => k !== 'direccion'),
    ]);
    if (modelo.multipunto) { for (const k of ['sum_via', 'sum_cp', 'sum_localidad', 'sum_provincia', 'tramo_potencia']) claves.delete(k); }
    claves.add('sum_direccion_completa');
    for (const k of claves) if (v(s[k])) vacios.push(`s${i}.${k}`);
  });
  return [...new Set(vacios)];
}

export const estaCompleta = (modelo) => obligatoriosVacios(modelo).length === 0
  && modelo.suministros.every((s) => s.bloque_precios?.length > 0);

/** Valor de una clave del modelo ('fiscal_via' o 's1.tension'). */
export function leerClave(modelo, clave) {
  if (clave === 'modalidad') return modelo.modalidad;
  const m = /^s(\d)\.(.+)$/.exec(clave);
  return m ? modelo.suministros[Number(m[1])]?.[m[2]] : modelo.campos[clave];
}

/**
 * Aplica una edición y devuelve un modelo nuevo. Quita el ⚠ del campo (ya lo ha revisado
 * una persona), salvo el de modalidad, que depende del texto.
 * Cambiar modalidad o potencia recalcula el bloque de precios con `tarifa` (vigente).
 */
export function aplicarEdicion(modelo, clave, valor, tarifa) {
  const m = structuredClone(modelo);
  const avisos = { ...m.avisos };
  delete avisos[clave];
  const sm = /^s(\d)\.(.+)$/.exec(clave);

  if (clave === 'modalidad') {
    m.modalidad = valor;
    const a = avisoModalidad(valor);
    if (a) avisos.modalidad = a;
    m.suministros.forEach((s) => { s.bloque_precios = bloqueSuministro(tarifa, m.tarifa_acceso, valor, s); });
  } else if (sm) {
    const s = m.suministros[Number(sm[1])];
    const campo = sm[2];
    s[campo] = CLAVES_POTENCIA.includes(campo) ? potenciaEndesa(String(valor).replace(',', '.')) : valor;
    if (CLAVES_POTENCIA.includes(campo)) s.bloque_precios = bloqueSuministro(tarifa, m.tarifa_acceso, m.modalidad, s);
    if (['sum_via', 'sum_numero', 'sum_escalera', 'sum_piso', 'sum_puerta', 'sum_cp', 'sum_localidad', 'sum_provincia'].includes(campo)) {
      s.sum_direccion_completa = direccionCompleta(s);
      delete avisos[`s${sm[1]}.sum_direccion_completa`];
    }
  } else {
    m.campos[clave] = valor;
  }
  m.avisos = avisos;
  return m;
}

/** Lista de campos vacíos para el Aviso 2. */
export function camposVaciosAviso(modelo) {
  return CAMPOS_VACIOS_ENDESA.filter((v) => (v.suministro ? !modelo.suministros.some((s) => txt(s[v.id])) && !modelo.multipunto : !txt(modelo.campos[v.id])))
    .map((v) => v.label);
}
