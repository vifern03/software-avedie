/**
 * Acceso a servidor de Documentación B2B: sesión propia, RPC y Edge Function de archivos.
 * El token se abre en el login del CRM y se guarda aparte de su sesión. Se renueva al
 * arrancar; si falta o caduca, hay que volver a entrar en el CRM.
 */
import { supabase } from '../supabase';

const CLAVE_TOKEN = 'crm_avedie_docb2b_token';
const FUNCION = 'doc-b2b-archivos';

export class SesionRequerida extends Error {
  constructor() { super('Cierra sesión y vuelve a entrar en el CRM para usar esta sección.'); this.name = 'SesionRequerida'; }
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

function credenciales(actor) {
  const token = leerToken(actor);
  if (!token) throw new SesionRequerida();
  return { p_actor: actor, p_token: token };
}

export async function rpc(nombre, actor, params = {}) {
  const { data, error } = await supabase.rpc(nombre, { ...credenciales(actor), ...params });
  comprobarError(error);
  return data;
}

export async function archivos(actor, accion, extra = {}) {
  const { p_token } = credenciales(actor);
  const { data, error } = await supabase.functions.invoke(FUNCION, {
    body: { actor, token: p_token, accion, ...extra },
  });
  if (error) {
    let mensaje = error.message;
    try { mensaje = (await error.context.json()).error || mensaje; } catch { /* sin cuerpo */ }
    comprobarError({ message: mensaje });
  }
  return data;
}

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
