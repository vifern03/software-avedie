// Sube las 3 plantillas al bucket privado plantillas-contratos de un proyecto.
//   node scripts/subir_plantillas_endesa.mjs <ref> <carpeta_plantillas>
// La clave de servicio se pide a la CLI en memoria: ni se imprime ni se guarda.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const [, , ref, carpeta] = process.argv;
if (!ref || !carpeta) { console.error('Uso: <ref> <carpeta_plantillas>'); process.exit(1); }

const claves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --output json`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const servicio = claves.find((k) => k.name === 'service_role')?.api_key;
if (!servicio) throw new Error('Sin clave de servicio');

const sb = createClient(`https://${ref}.supabase.co`, servicio, { auth: { persistSession: false } });
for (const f of ['contrato_base.pdf', 'anexo_base.pdf', 'puntos_suministro_base.pdf']) {
  const { error } = await sb.storage.from('plantillas-contratos').upload(f, readFileSync(`${carpeta}/${f}`), { contentType: 'application/pdf', upsert: false });
  if (error && !/exists/i.test(error.message)) throw error;
  console.log(f, error ? 'ya estaba' : 'subida');
}
const { data } = await sb.storage.getBucket('plantillas-contratos');
console.log('bucket público:', data.public);
