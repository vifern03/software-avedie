/**
 * Registro de tarifas actualizables: por cada tarifa, su objeto en src/data y la LISTA
 * BLANCA de rutas numéricas que se pueden cambiar. Nombres, textos, estructura y número
 * de tramos no están aquí y por tanto no se pueden tocar nunca.
 */
import { LUZ, LUZ_SOLAR, INDEXADA_2_0TD } from '../../data/tarifasB2C.js';
import { GAS, GAS_EMPRESA } from '../../data/tarifasGas.js';
import {
  OPEN_30TD, OPEN_61TD, SIMPLY_30TD, SIMPLY_61TD, TEMPO_2_0TD, INDEXADA_30TD, INDEXADA_61TD,
} from '../../data/tarifasB2B.js';

const porPeriodo = (prefijo, n) => Array.from({ length: n }, (_, i) => `${prefijo}.${i}.anyo`)
  .flatMap((r) => [r, r.replace('.anyo', '.mes'), r.replace('.anyo', '.dia')]);
const matriz = (nombre, f, c) => Array.from({ length: f }, (_, i) => Array.from({ length: c }, (_, j) => `${nombre}.${i}.${j}`)).flat();
const lista = (nombre, n) => Array.from({ length: n }, (_, i) => `${nombre}.${i}`);

const rutasOpen = [
  ...lista('baseEnergia', 4), ...lista('horasNoOpen', 4), ...matriz('matrix', 4, 5),
  ...porPeriodo('potenciaTerminos', 6), 'extraAnyo', ...[0, 1, 2, 3, 4].map((i) => `modalidades.${i}.dto`),
];
const rutasGas = ['terFijo', 'sinMant.promo', 'sinMant.noPromo', 'conMant.promo', 'conMant.noPromo'];
const rutasLuz = ['sinMant.promo', 'sinMant.noPromo', 'conMant.promo', 'conMant.noPromo', 'potPunta', 'potValle'];
const rutasToc = ['sinMant.promoH', 'sinMant.restoH', 'sinMant.noPromoH', 'sinMant.noPromoR',
  'conMant.promoH', 'conMant.restoH', 'conMant.noPromoH', 'conMant.noPromoR', 'potPunta', 'potValle'];
const rutasSolar = ['energiaHorasBasic.promo', 'energiaHorasBasic.noPromo', 'energiaRestoHoras.promo', 'energiaRestoHoras.noPromo',
  'potPunta', 'potValle', 'compExcedentes', 'cuotaBateriaMes'];
const energiaIdx = (n) => [...Array(n)].flatMap((_, i) => [`energiaA.p${i + 1}`, `energiaB.p${i + 1}`]);

/** @type {Record<string,{objeto:object,nombre:string,tipo:'open'|'tempo'|'otra',rutas:string[]}>} */
export const TARIFAS = {
  open30: { objeto: OPEN_30TD, nombre: OPEN_30TD.nombre, tipo: 'open', rutas: rutasOpen },
  open61: { objeto: OPEN_61TD, nombre: OPEN_61TD.nombre, tipo: 'open', rutas: rutasOpen },
  tempo: {
    objeto: TEMPO_2_0TD, nombre: TEMPO_2_0TD.nombre, tipo: 'tempo',
    rutas: ['energia.promo', 'energia.base', 'descuento', 'potencia.0.anyo', 'potencia.0.mes', 'potencia.1.anyo', 'potencia.1.mes'],
  },
  simply30: { objeto: SIMPLY_30TD, nombre: SIMPLY_30TD.nombre, tipo: 'otra', rutas: ['energiaUnica', 'excedentes', ...porPeriodo('potenciaTerminos', 6)] },
  simply61: { objeto: SIMPLY_61TD, nombre: SIMPLY_61TD.nombre, tipo: 'otra', rutas: [...lista('energiaPeriodos', 6), 'excedentes', ...porPeriodo('potenciaTerminos', 6)] },
  indexada20: { objeto: INDEXADA_2_0TD, nombre: 'Indexada 2.0TD', tipo: 'otra', rutas: [...energiaIdx(3), ...porPeriodo('potenciaTerminos', 2)] },
  indexada30: { objeto: INDEXADA_30TD, nombre: INDEXADA_30TD.nombre, tipo: 'otra', rutas: [...energiaIdx(6), ...porPeriodo('potenciaTerminos', 6)] },
  indexada61: { objeto: INDEXADA_61TD, nombre: INDEXADA_61TD.nombre, tipo: 'otra', rutas: [...energiaIdx(6), ...porPeriodo('potenciaTerminos', 6)] },
};

for (const t of GAS) TARIFAS[t.id] = { objeto: t, nombre: t.title, tipo: 'otra', rutas: rutasGas };
for (const t of GAS_EMPRESA) TARIFAS[t.id] = { objeto: t, nombre: t.title, tipo: 'otra', rutas: rutasGas };
for (const t of LUZ) TARIFAS[t.id] = { objeto: t, nombre: t.title, tipo: 'otra', rutas: t.isToc ? rutasToc : rutasLuz };
for (const t of LUZ_SOLAR) TARIFAS[t.id] = { objeto: t, nombre: t.title, tipo: 'otra', rutas: rutasSolar };

const leer = (obj, ruta) => ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);

function escribir(obj, ruta, valor) {
  const partes = ruta.split('.');
  const ultima = partes.pop();
  const destino = partes.reduce((o, k) => o?.[k], obj);
  if (destino && typeof destino[ultima] === 'number') destino[ultima] = valor;
}

export const leerRuta = leer;

/** Claves permitidas que existen de verdad en esa tarifa. */
export function rutasDe(tarifaId) {
  const t = TARIFAS[tarifaId];
  if (!t) return [];
  return t.rutas.filter((r) => typeof leer(t.objeto, r) === 'number');
}

/** Foto de los valores actuales de la tarifa ({ruta: número}). */
export function valoresActuales(tarifaId) {
  return Object.fromEntries(rutasDe(tarifaId).map((r) => [r, leer(TARIFAS[tarifaId].objeto, r)]));
}

/** Deja solo las rutas permitidas con número finito; el resto se descarta. */
export function filtrarPermitidas(tarifaId, valores) {
  const permitidas = new Set(rutasDe(tarifaId));
  return Object.fromEntries(Object.entries(valores || {}).filter(([k, v]) => permitidas.has(k) && typeof v === 'number' && Number.isFinite(v)));
}

const separadas = new WeakSet();

/** Vigencia de una tarifa: fecha ISO → texto en el formato que usa cada ficha. */
function aplicarVigencia(objeto, desde, hasta) {
  if (!desde || !hasta) return;
  const f = (iso) => iso.split('-').reverse().join('/');
  objeto.contratacion = { ...objeto.contratacion, desde, hasta };
  objeto.validez = /^del /.test(objeto.validez || '') ? `del ${f(desde)} hasta el ${f(hasta)}` : `${f(desde)} – ${f(hasta)}`;
}

/** Sobrescribe en sitio el objeto de src/data con la versión activa (solo rutas permitidas). */
export function aplicarVersion(tarifaId, version) {
  const t = TARIFAS[tarifaId];
  if (!t) return false;
  // Open y Simply comparten el array de potencia: se separa para no cambiar la otra tarifa.
  if (Array.isArray(t.objeto.potenciaTerminos) && !separadas.has(t.objeto)) {
    t.objeto.potenciaTerminos = t.objeto.potenciaTerminos.map((p) => ({ ...p }));
    separadas.add(t.objeto);
  }
  for (const [ruta, valor] of Object.entries(filtrarPermitidas(tarifaId, version.valores))) escribir(t.objeto, ruta, valor);
  aplicarVigencia(t.objeto, version.valida_desde, version.valida_hasta);
  t.versionActiva = { id: version.id, version: version.version };
  return true;
}
