// Prepara o limpia los datos ficticios del E2E de Documentación B2B. SOLO PRUEBAS.
//   node e2e/documentacion_b2b_datos.mjs <ref> preparar|limpiar
// Solo crea filas nuevas (usuarios e2e_*, clientes 91000xx) y solo borra esas filas.
// No toca configuracion: el comercial con acceso se resuelve redefiniendo en pruebas el
// helper propio _doc_b2b_tiene_seccion; `limpiar` lo devuelve a su definición.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PROD = 'ndcslcsuavjdctqhkrfu';
const [, , ref, accion] = process.argv;
if (!ref || ref === PROD) { console.error('Solo para el proyecto de pruebas'); process.exit(1); }

const sql = (texto) => {
  const f = join(mkdtempSync(join(tmpdir(), 'e2e-')), 'q.sql');
  writeFileSync(f, texto);
  const r = execSync(`npx supabase db query --linked --project-ref ${ref} -f "${f}"`, { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  return r;
};

const claves = JSON.parse(execSync(`npx supabase projects api-keys --project-ref ${ref} --output json`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString());
const servicio = claves.find((k) => k.name === 'service_role').api_key;
const sb = createClient(`https://${ref}.supabase.co`, servicio, { auth: { persistSession: false } });

const hash = "encode(extensions.digest('prueba1234','sha256'),'hex')";
const doc = (marca) => `data:application/pdf;base64,${Buffer.from(`%PDF-FICTICIO ${marca}`).toString('base64')}`;
const cliente = (id, nombre, cif, cups, tarifa, producto) => `(${id}, 'B2B', '${nombre}', '${cif}', '600000000', 'demo@ejemplo.es', 'ES0000000000000000000000', '${cups}', '${tarifa}',
  'Electricidad', '${producto}', 'e2e_com', 'e2e_com', 'Palencia', 'Pendiente Firma', '${doc(`FACTURA ${cups}`)}', '${doc('CIF')}', '${doc('DNI')}')`;

function limpiarSql() {
  const m = readFileSync('supabase/migrations/20261031000000_documentacion_b2b.sql', 'utf8');
  const a = m.indexOf('CREATE FUNCTION public._doc_b2b_tiene_seccion');
  const b = m.indexOf('-- Devuelve el rol del actor');
  return `BEGIN;
${m.slice(a, b).replace('CREATE FUNCTION', 'CREATE OR REPLACE FUNCTION')}
DELETE FROM public.documentacion_b2b WHERE generado_por LIKE 'e2e\\_%';
DELETE FROM public.tarifas_versiones WHERE creado_por LIKE 'e2e\\_%';
DELETE FROM public.doc_b2b_sesiones WHERE username LIKE 'e2e\\_%';
DELETE FROM public.compartir_bloqueos WHERE username LIKE 'e2e\\_%';
DELETE FROM public.actividades WHERE comercial LIKE 'e2e\\_%';
DELETE FROM public.clientes WHERE id BETWEEN 9100000 AND 9100099;
DELETE FROM public.usuarios WHERE username LIKE 'e2e\\_%';
COMMIT;`;
}

async function vaciarBucket(bucket) {
  const { data: raiz } = await sb.storage.from(bucket).list('', { limit: 1000 });
  for (const d of raiz || []) {
    const { data: vs } = await sb.storage.from(bucket).list(d.name, { limit: 1000 });
    for (const v of vs || []) {
      const { data: fs_ } = await sb.storage.from(bucket).list(`${d.name}/${v.name}`, { limit: 100 });
      const rutas = (fs_ || []).map((f) => `${d.name}/${v.name}/${f.name}`);
      if (rutas.length) await sb.storage.from(bucket).remove(rutas);
      if (v.id) await sb.storage.from(bucket).remove([`${d.name}/${v.name}`]);
    }
  }
}

if (accion === 'limpiar') {
  sql(limpiarSql());
  await vaciarBucket('documentacion-b2b');
  await vaciarBucket('tarifas-pdf');
  console.log('limpio');
} else {
  sql(limpiarSql());
  sql(`BEGIN;
INSERT INTO public.usuarios (username, password, role, display_name, equipo) VALUES
 ('e2e_admin', ${hash}, 'admin', 'E2E Admin', 'Palencia'),
 ('e2e_man', ${hash}, 'manager', 'E2E Manager', 'Palencia'),
 ('e2e_com', ${hash}, 'comercial', 'E2E Comercial', 'Palencia'),
 ('e2e_sin', ${hash}, 'comercial', 'E2E Sin Acceso', 'Palencia');
INSERT INTO public.clientes (id, tipo, nombre, cif_dni, telefono, mail, cuenta_bancaria, cups, tarifa, linea_negocio, id_producto, comercial, creado_por, equipo, estado, factura_b2b_url, cif_autonomo_url, dni_escaneado) VALUES
 ${[
    cliente(9100001, 'E2E UNO, S.L.', 'B90000001', 'ES0021000000000901XX0F', '3.0TD', 'Open 3.0TD'),
    cliente(9100002, 'E2E TRES, S.L.', 'B90000003', 'ES0021000000000902XX0F', '3.0TD', 'Open 3.0TD'),
    cliente(9100003, 'E2E TRES, S.L.', 'B90000003', 'ES0022000000000903XX1P', '3.0TD', 'Open 3.0TD'),
    cliente(9100004, 'E2E TRES, S.L.', 'B90000003', 'ES0021000000000904XX0F', '3.0TD', 'Open 3.0TD'),
    cliente(9100005, 'E2E SEIS, S.L.', 'B90000006', 'ES0021000000000905XX0F', '6.1TD', 'Open 6.1TD'),
    cliente(9100006, 'E2E TEMPO, S.L.', 'B90000007', 'ES0021000000000906XX0F', '2.0TD', 'TEMPO 2.0TD'),
    cliente(9100007, 'E2E COM, S.L.', 'B90000008', 'ES0021000000000907XX0F', '3.0TD', 'Open 3.0TD'),
  ].join(',\n ')};
INSERT INTO public.compartir_bloqueos (username, bloqueado) VALUES ('e2e_com', 'e2e_sin');
CREATE OR REPLACE FUNCTION public._doc_b2b_tiene_seccion(p_username text, p_role text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF p_username = 'e2e_com' THEN RETURN true; END IF;
  IF p_username = 'e2e_sin' THEN RETURN false; END IF;
  RETURN p_role IN ('admin','manager');
END $f$;
REVOKE ALL ON FUNCTION public._doc_b2b_tiene_seccion(text, text) FROM PUBLIC, anon, authenticated;
COMMIT;`);
  console.log('preparado');
}
