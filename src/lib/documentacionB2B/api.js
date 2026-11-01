/**
 * Acceso a servidor de Documentación B2B: sesión propia, RPC y Edge Function de archivos.
 * El token se guarda aparte de la sesión del CRM. Si falta o caduca, se abre otro con
 * el usuario de la sesión actual, sin pedir nada.
 */
import { supabase } from '../supabase';

const CLAVE_TOKEN = 'crm_avedie_docb2b_token';
const FUNCION = 'doc-b2b-archivos';
const FUNCION_SUBIDA = 'doc-b2b-subir';

export class SesionRequerida extends Error {
  constructor() { super('No se ha podido abrir la sesión de esta sección.'); this.name = 'SesionRequerida'; }
}

export function leerToken(username) {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_TOKEN) || 'null');
    if (!s || s.username !== username || new Date(s.expira_at) <= new Date()) return null;
    return s.token;
  } catch {
    return null;
  }
}

export async function abrirSesion(username, password) {
  const { data, error } = await supabase.rpc('doc_b2b_abrir_sesion', { p_username: username, p_password: password });
  if (error) throw new Error(error.message);
  localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ username, token: data.token, expira_at: data.expira_at }));
}

export async function renovarSesion(username) {
  try {
    const token = leerToken(username);
    if (!token) return;
    const { data, error } = await supabase.rpc('doc_b2b_renovar_sesion', { p_token: token });
    if (error) {
      if (/SESION_DOC_B2B/.test(error.message)) localStorage.removeItem(CLAVE_TOKEN);
      return;
    }
    localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ username, token, expira_at: data.expira_at }));
  } catch { /* renovar nunca debe bloquear el arranque */ }
}

export async function cerrarSesion() {
  try {
    const s = JSON.parse(localStorage.getItem(CLAVE_TOKEN) || 'null');
    localStorage.removeItem(CLAVE_TOKEN);
    if (s?.token) await supabase.rpc('doc_b2b_cerrar_sesion', { p_token: s.token });
  } catch { /* cerrar sesión nunca debe bloquear */ }
}

function comprobarError(error) {
  if (!error) return;
  if (/SESION_DOC_B2B/.test(error.message)) {
    localStorage.removeItem(CLAVE_TOKEN);
    throw new SesionRequerida();
  }
  throw new Error(error.message);
}

async function abrirSesionCrm(username) {
  const { data, error } = await supabase.rpc('doc_b2b_sesion_crm', { p_username: username });
  if (error) throw new Error(error.message);
  localStorage.setItem(CLAVE_TOKEN, JSON.stringify({ username, token: data.token, expira_at: data.expira_at }));
  return data.token;
}

/** Ejecuta la llamada con el token; si el servidor lo rechaza, reintenta una vez con otro. */
async function conToken(actor, llamada) {
  const token = leerToken(actor) || await abrirSesionCrm(actor);
  try {
    return await llamada(token);
  } catch (e) {
    if (!(e instanceof SesionRequerida)) throw e;
    return llamada(await abrirSesionCrm(actor));
  }
}

export function rpc(nombre, actor, params = {}) {
  return conToken(actor, async (token) => {
    const { data, error } = await supabase.rpc(nombre, { p_actor: actor, p_token: token, ...params });
    comprobarError(error);
    return data;
  });
}

function funcion(nombre, actor, cuerpo) {
  return conToken(actor, async (token) => {
    const { data, error } = await supabase.functions.invoke(nombre, { body: { actor, token, ...cuerpo } });
    if (error) {
      let mensaje = error.message;
      try { mensaje = (await error.context.json()).error || mensaje; } catch { /* sin cuerpo */ }
      comprobarError({ message: mensaje });
    }
    return data;
  });
}

export const archivos = (actor, accion, extra = {}) => funcion(FUNCION, actor, { accion, ...extra });

/** URLs para subir la versión siguiente de una documentación que ya existe. */
export const autorizarSubida = (actor, id) => funcion(FUNCION_SUBIDA, actor, { id });

async function bajar(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('No se ha podido descargar el archivo.');
  return new Uint8Array(await r.arrayBuffer());
}

/** Descarga las 3 plantillas del bucket privado (una vez por pestaña). */
let cachePlantillas = null;
export async function cargarPlantillas(actor) {
  if (cachePlantillas) return cachePlantillas;
  const { urls } = await archivos(actor, 'plantillas');
  const [contrato, anexo, puntos] = await Promise.all(
    ['contrato_base.pdf', 'anexo_base.pdf', 'puntos_suministro_base.pdf'].map((r) => bajar(urls[r].url)),
  );
  cachePlantillas = { contrato, anexo, puntos };
  return cachePlantillas;
}

/** Sube a rutas firmadas por el servidor. @param {Record<string,Uint8Array>} porRuta */
export async function subirPdfs(urls, bucket, porRuta) {
  await Promise.all(Object.entries(porRuta).map(async ([ruta, bytes]) => {
    const u = urls[ruta];
    if (!u) throw new Error(`Ruta no autorizada: ${ruta}`);
    const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(
      u.path, u.token, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' },
    );
    if (error) throw new Error(`No se ha podido guardar ${ruta}: ${error.message}`);
  }));
}

export async function descargarVersion(actor, id, version = null) {
  const { urls } = await archivos(actor, 'descargar', { id, version });
  return urls;
}

export { bajar as descargarBytes };
