// Emite URLs firmadas para subir los PDF de una versión nueva. El permiso lo decide la RPC
// doc_b2b_autorizar_subida (token de sesión + quien ve la documentación).
// Clave de servicio: la inyecta Supabase; no sale nunca de aquí.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const responder = (status: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder(405, { error: 'Método no permitido' })

  try {
    const { actor, token, id = null } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    })

    const { data, error } = await sb.rpc('doc_b2b_autorizar_subida', { p_actor: actor, p_token: token, p_id: id })
    if (error) return responder(403, { error: error.message })

    const almacen = sb.storage.from(data.bucket)
    const urls: Record<string, unknown> = {}
    for (const ruta of data.rutas as string[]) {
      // upsert: solo son rutas de una versión que aún no existe
      const { data: f, error: e } = await almacen.createSignedUploadUrl(ruta, { upsert: true })
      if (e) throw e
      urls[ruta] = { url: f.signedUrl, token: f.token, path: f.path }
    }
    return responder(200, { bucket: data.bucket, urls })
  } catch (e) {
    console.error('doc-b2b-subir:', (e as Error).message)
    return responder(500, { error: 'No se han podido preparar los archivos.' })
  }
})
