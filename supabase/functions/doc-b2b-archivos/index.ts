// Emite URLs firmadas de los buckets privados de Documentación B2B.
// La identidad y el permiso los decide la RPC doc_b2b_autorizar_archivos (token de
// sesión + rol); esta función solo firma las rutas que esa RPC devuelve.
// Clave de servicio: la inyecta Supabase; no sale nunca de aquí.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const DURACION_S = 300 // las URL de descarga caducan a los 5 minutos

const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' })

  try {
    const { actor, token, accion, id = null, version = null, tarifaId = null } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const { data, error } = await sb.rpc('doc_b2b_autorizar_archivos', {
      p_actor: actor, p_token: token, p_accion: accion, p_id: id, p_version: version, p_tarifa_id: tarifaId,
    })
    if (error) return responder(403, { error: error.message })

    const almacen = sb.storage.from(data.bucket)
    const urls: Record<string, unknown> = {}
    for (const ruta of data.rutas as string[]) {
      if (data.lectura) {
        const { data: f, error: e } = await almacen.createSignedUrl(ruta, DURACION_S)
        if (e) throw e
        urls[ruta] = { url: f.signedUrl }
      } else {
        // upsert: la RPC solo autoriza rutas de una versión que aún no existe, así que
        // lo único que se puede pisar es un intento anterior que no llegó a guardarse.
        const { data: f, error: e } = await almacen.createSignedUploadUrl(ruta, { upsert: true })
        if (e) throw e
        urls[ruta] = { url: f.signedUrl, token: f.token, path: f.path }
      }
    }
    return responder(200, { bucket: data.bucket, completa: data.completa ?? null, urls })
  } catch (e) {
    console.error('doc-b2b-archivos:', (e as Error).message)
    return responder(500, { error: 'No se han podido preparar los archivos.' })
  }
})
