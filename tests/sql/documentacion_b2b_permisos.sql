-- =============================================================================
--  Permisos y reglas de Documentación B2B. Corre en una transacción que se deshace
--  al final (RAISE EXCEPTION 'TODO_OK'): no deja datos.
--  Ejecutar en PRUEBAS:
--    npx supabase db query --linked --project-ref <ref> -f tests/sql/documentacion_b2b_permisos.sql
--  Resultado correcto: el error "TODO_OK". Cualquier otro mensaje es un fallo.
-- =============================================================================
BEGIN;

CREATE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF c IS NOT TRUE THEN RAISE EXCEPTION 'FALLO: %', msg; END IF;
END $$;

CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || patron || '%' THEN RETURN; END IF;
    RAISE EXCEPTION 'FALLO: % — error inesperado: %', msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO: % — debía fallar y no falló', msg;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text), pg_temp.debe_fallar(text, text, text) TO anon, service_role;

INSERT INTO public.usuarios (username, password, role, display_name, equipo, deleted_at)
SELECT u, encode(extensions.digest('clave_test', 'sha256'), 'hex'), r, 'T ' || u, e, b
FROM (VALUES
  ('t_admin', 'admin',     'Palencia',   NULL::timestamptz),
  ('t_man',   'manager',   'Palencia',   NULL),
  ('t_com',   'comercial', 'Palencia',   NULL),
  ('t_com2',  'comercial', 'Palencia',   NULL),
  ('t_sin',   'comercial', 'Palencia',   NULL),
  ('t_otra',  'comercial', 'Valladolid', NULL),
  ('t_baja',  'comercial', 'Palencia',   now())
) AS x(u, r, e, b);

-- Permiso de sección para comerciales: se activa a mano (dentro de esta transacción)
UPDATE public.configuracion
   SET valor = valor || '{"t_com": {"documentacion_b2b": true}, "t_com2": {"documentacion_b2b": true}, "t_otra": {"documentacion_b2b": true}}'::jsonb
 WHERE clave = 'user_permissions';

INSERT INTO public.clientes (id, tipo, nombre, cif_dni, cups, tarifa, id_producto, comercial, creado_por, equipo, estado) VALUES
  (9000001, 'B2B', 'T EMPRESA', 'B00000001', 'ES0021000000000001XX0F', '3.0TD', 'Open 3.0TD', 't_com', 't_com', 'Palencia', 'Pendiente Firma'),
  (9000002, 'B2B', 'T EMPRESA', 'B00000001', 'ES0021000000000002XX0F', '3.0TD', 'Open 3.0TD', 't_com', 't_com', 'Palencia', 'Pendiente Firma'),
  (9000003, 'B2B', 'T OTRA',    'B00000002', 'ES0021000000000003XX0F', '3.0TD', 'Open 3.0TD', 't_com', 't_com', 'Palencia', 'Pendiente Firma'),
  (9000004, 'B2B', 'T EMPRESA', 'B00000001', 'ES0021000000000004XX0F', '6.1TD', 'Open 6.1TD', 't_com', 't_com', 'Palencia', 'Pendiente Firma'),
  (9000005, 'B2B', 'T TEMPO',   'B00000003', 'ES0021000000000005XX0F', '2.0TD', 'TEMPO 2.0TD', 't_com', 't_com', 'Palencia', 'Pendiente Firma');

-- Objetos de Storage de prueba (solo existen dentro de esta transacción)
CREATE TEMP TABLE ids (k text PRIMARY KEY, v text);
GRANT ALL ON ids TO anon, service_role;
INSERT INTO ids VALUES ('d1', gen_random_uuid()::text), ('d2', gen_random_uuid()::text), ('d3', gen_random_uuid()::text);

INSERT INTO storage.objects (bucket_id, name)
SELECT 'documentacion-b2b', format('%s/v%s/%s.pdf', i.v, n, t)
FROM ids i, generate_series(1, 2) n, unnest(ARRAY['contrato','anexo_precios','anexo_puntos']) t;

CREATE FUNCTION pg_temp.docs(p_id text, p_v int, p_n int) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('tipo', t, 'nombre', t, 'path', format('%s/v%s/%s.pdf', p_id, p_v, t), 'sha256', repeat('a', 64), 'paginas', 1))
  FROM unnest(CASE WHEN p_n >= 2 THEN ARRAY['contrato','anexo_precios','anexo_puntos'] ELSE ARRAY['contrato','anexo_precios'] END) t;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.docs(text, int, int) TO anon;

-- Sesiones
INSERT INTO ids SELECT 'tok_' || u, (public.doc_b2b_abrir_sesion(u, 'clave_test'))->>'token'
FROM unnest(ARRAY['t_admin','t_man','t_com','t_com2','t_sin','t_otra']) u;

SET LOCAL ROLE anon;

-- ── Sesión ──────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_abrir_sesion('t_com', 'mala') $q$, 'incorrectos', 'contraseña mala');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_abrir_sesion('t_baja', 'clave_test') $q$, 'incorrectos', 'usuario de baja');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_listar('t_com', NULL) $q$, 'SESION_DOC_B2B', 'sin token');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_listar('t_com', 'x') $q$, 'SESION_DOC_B2B', 'token inventado');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_listar('t_admin', (SELECT v FROM ids WHERE k='tok_t_com')) $q$,
  'SESION_DOC_B2B', 'token de otro usuario: no suplanta al admin');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_renovar_sesion('x') $q$, 'SESION_DOC_B2B', 'renovar con token inventado');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_renovar_sesion(NULL) $q$, 'SESION_DOC_B2B', 'renovar sin token');
SELECT public.doc_b2b_renovar_sesion((SELECT v FROM ids WHERE k='tok_t_com'));

-- ── Acceso directo a tablas ─────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT * FROM public.documentacion_b2b $q$, 'permission denied', 'anon no lee expedientes');
SELECT pg_temp.debe_fallar($q$ SELECT * FROM public.documentacion_b2b_versiones $q$, 'permission denied', 'anon no lee versiones (IBAN/DNI)');
SELECT pg_temp.debe_fallar($q$ SELECT * FROM public.doc_b2b_sesiones $q$, 'permission denied', 'anon no lee sesiones');
SELECT pg_temp.debe_fallar($q$ INSERT INTO public.distribuidoras_electricidad (prefijo_cups, nombre_mostrar, estado, fuente) VALUES ('9999','x','ACTIVA','x') $q$, 'permission denied', 'anon no escribe distribuidoras');
SELECT pg_temp.debe_fallar($q$ INSERT INTO public.tarifas_versiones (tarifa_id, version, valores, valida_desde, valida_hasta, creado_por) VALUES ('x',1,'{}',current_date,current_date,'x') $q$, 'permission denied', 'anon no escribe tarifas');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_autorizar_archivos('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), 'plantillas') $q$, 'permission denied', 'anon no autoriza archivos');
SELECT pg_temp.debe_fallar($q$ SELECT public._doc_b2b_actor('t_admin', 'x') $q$, 'permission denied', 'helper interno no ejecutable');

-- ── Acceso a la sección ─────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_listar('t_sin', (SELECT v FROM ids WHERE k='tok_t_sin')) $q$, 'No tienes acceso', 'comercial sin acceso');
SELECT pg_temp.ok((public.doc_b2b_listar('t_man', (SELECT v FROM ids WHERE k='tok_t_man')))->>'total' = '0', 'manager con acceso por defecto');
SELECT pg_temp.ok((public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com')))->>'total' = '0', 'comercial con acceso activado');

-- ── Crear ───────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_otra', (SELECT v FROM ids WHERE k='tok_t_otra'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000001]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 1), true) $q$,
  'No tienes acceso a uno', 'comercial no genera con contrato que no ve');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000001, 9000003]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 2), true) $q$,
  'mismo CIF', 'mezcla de CIF');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000001, 9000004]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 2), true) $q$,
  'misma tarifa', 'mezcla 3.0TD y 6.1TD');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000005]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 1), true) $q$,
  'no disponibles', 'TEMPO bloqueado');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000001, 9000002]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 1), true) $q$,
  'Faltan documentos', 'con 2 CUPS falta el anexo de puntos');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), gen_random_uuid(),
  ARRAY[9000001]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 1), true) $q$,
  'no válido', 'ruta de otro expediente');

SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'),
  ARRAY[9000001, 9000002]::bigint[], 'TEL3T - TEMPO OPEN 3.0TD', 'plana', NULL, '{"a":1}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 1, 2), true);

SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_crear('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), (SELECT v::uuid FROM ids WHERE k='d2'),
  ARRAY[9000002]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d2'), 1, 1), true) $q$,
  'ya tiene documentación', 'CUPS con documentación activa');

-- ── Visibilidad ─────────────────────────────────────────────────────────────
SELECT pg_temp.ok((public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com')))->>'total' = '1', 'generador lo ve en Mi documentación');
SELECT pg_temp.ok((public.doc_b2b_listar('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2')))->>'total' = '0', 'otro comercial no lo ve');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), 'global') $q$, 'Solo un manager', 'comercial sin global');
SELECT pg_temp.ok((public.doc_b2b_listar('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'global'))->>'total' = '1', 'manager ve global');
SELECT pg_temp.ok((public.doc_b2b_listar('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'mias'))->>'total' = '0', 'manager: Mi documentación es solo lo suyo');
SELECT pg_temp.ok((public.doc_b2b_listar('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'global', 'ES0021000000000002'))->>'total' = '1', 'busca por CUPS');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_detalle('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2'), (SELECT v::uuid FROM ids WHERE k='d1')) $q$, 'no tienes acceso', 'detalle ajeno');

-- ── Compartir ───────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_compartir('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'), ARRAY['t_com2']) $q$,
  'Solo un manager', 'comercial no comparte, ni lo suyo');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_compartir('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), (SELECT v::uuid FROM ids WHERE k='d1'), ARRAY['t_baja']) $q$,
  'dado de baja', 'no se comparte con una baja');
SELECT public.doc_b2b_compartir('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), (SELECT v::uuid FROM ids WHERE k='d1'), ARRAY['t_com2']);
SELECT pg_temp.ok((public.doc_b2b_listar('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2')))->>'total' = '1', 'compartido aparece en Mi documentación');
SELECT pg_temp.ok(((public.doc_b2b_listar('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2')))->'filas'->0->>'puede_editar')::boolean = false, 'destinatario no edita');
SELECT pg_temp.ok(((public.doc_b2b_listar('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2')))->'filas'->0->>'puede_descargar')::boolean = true, 'destinatario descarga');

-- ── Nueva versión ───────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_nueva_version('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2'), (SELECT v::uuid FROM ids WHERE k='d1'), 1, 'dia', NULL, '{}', '{}', '{}',
  pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 2, 2), true) $q$, 'Solo quien la generó', 'destinatario no crea versión');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_nueva_version('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'), 7, 'dia', NULL, '{}', '{}', '{}',
  pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 2, 2), true) $q$, 'más reciente', 'versión base desactualizada');
SELECT pg_temp.ok(public.doc_b2b_nueva_version('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'), 1, 'dia', NULL, '{"a":2}', '{}', '{"a":{"de":1,"a":2}}',
  pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 2, 2), true) = 2, 'genera v2');
SELECT pg_temp.ok((public.doc_b2b_detalle('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1')))->'datos'->>'a' = '2', 'detalle devuelve la última versión');

-- ── Borrar ──────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_borrar('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2'), (SELECT v::uuid FROM ids WHERE k='d1')) $q$, 'Solo quien la generó', 'destinatario no borra');
SELECT public.doc_b2b_borrar('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'));
SELECT pg_temp.ok((public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com')))->'filas'->0->>'estado' = 'borrada', 'sigue en el historial como borrada');
SELECT pg_temp.ok(((public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com')))->'filas'->0->>'puede_descargar')::boolean = false, 'borrada: comercial no descarga');
SELECT pg_temp.ok(((public.doc_b2b_listar('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'global'))->'filas'->0->>'puede_descargar')::boolean = true, 'borrada: manager descarga');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_nueva_version('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d1'), 2, 'dia', NULL, '{}', '{}', '{}',
  pg_temp.docs((SELECT v FROM ids WHERE k='d1'), 2, 2), true) $q$, 'borrada', 'no se edita borrada');
-- CUPS libres otra vez
SELECT public.doc_b2b_crear('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), (SELECT v::uuid FROM ids WHERE k='d2'),
  ARRAY[9000002]::bigint[], 'p', 'plana', NULL, '{}', '{}', pg_temp.docs((SELECT v FROM ids WHERE k='d2'), 1, 1), false);
SELECT pg_temp.ok((public.doc_b2b_cups_activos('t_com', (SELECT v FROM ids WHERE k='tok_t_com'))) ? 'ES0021000000000002XX0F', 'CUPS activo tras regenerar');
SELECT pg_temp.ok(((public.doc_b2b_listar('t_com', (SELECT v FROM ids WHERE k='tok_t_com')))->'filas'->0->>'puede_descargar')::boolean = false, 'incompleta: no se descarga');

-- ── Admin: tarifa y distribuidora ───────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.tarifa_guardar_version('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'open30', '{"a":1}', current_date, current_date, NULL, NULL, '{}') $q$,
  'Solo un administrador', 'manager no actualiza tarifa');
SELECT pg_temp.debe_fallar($q$ SELECT public.tarifa_guardar_version('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), 'open30', '{"a":"x"}', current_date, current_date, NULL, NULL, '{}') $q$,
  'numéricos', 'valores no numéricos');
SELECT pg_temp.debe_fallar($q$ SELECT public.tarifa_guardar_version('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), 'open30', '{"a":1}', current_date, current_date - 1, NULL, NULL, '{}') $q$,
  'fechas', 'fechas incoherentes');
SELECT public.tarifa_guardar_version('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), 'zz_test', '{"a":1}', current_date, current_date, NULL, NULL, '{}');
SELECT public.tarifa_guardar_version('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), 'zz_test', '{"a":2}', current_date, current_date, NULL, NULL, '{}');
SELECT pg_temp.ok((SELECT count(*) = 1 AND max(version) = 2 FROM public.tarifas_versiones WHERE tarifa_id = 'zz_test' AND activa), 'una sola versión activa');
SELECT pg_temp.debe_fallar($q$ SELECT public.distribuidora_guardar('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), '0031', NULL, 'X', 'X') $q$, 'Solo un administrador', 'manager no guarda distribuidora');
SELECT public.distribuidora_guardar('t_admin', (SELECT v FROM ids WHERE k='tok_t_admin'), '003110', 'Zona 10', 'X', 'X - TEXTO - ES003110');
SELECT pg_temp.ok((SELECT verificado AND actualizado_por = 't_admin' FROM public.distribuidoras_electricidad WHERE prefijo_cups = '003110'), 'admin guarda distribuidora');

RESET ROLE;
-- ── Autorización de archivos (como service_role) ────────────────────────────
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((public.doc_b2b_autorizar_archivos('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), 'plantillas'))->>'bucket' = 'plantillas-contratos', 'plantillas');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_autorizar_archivos('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2'), 'subir_tarifa', NULL, NULL, 'open30') $q$, 'administrador', 'comercial no sube tarifa');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_autorizar_archivos('t_otra', (SELECT v FROM ids WHERE k='tok_t_otra'), 'descargar', (SELECT v::uuid FROM ids WHERE k='d2')) $q$, 'no tienes acceso', 'ajeno no descarga');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_autorizar_archivos('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), 'descargar', (SELECT v::uuid FROM ids WHERE k='d1')) $q$, 'borrada', 'borrada: comercial no descarga por URL');
SELECT pg_temp.ok((public.doc_b2b_autorizar_archivos('t_man', (SELECT v FROM ids WHERE k='tok_t_man'), 'descargar', (SELECT v::uuid FROM ids WHERE k='d1')))->>'lectura' = 'true', 'borrada: manager descarga');
SELECT pg_temp.ok((public.doc_b2b_autorizar_archivos('t_com', (SELECT v FROM ids WHERE k='tok_t_com'), 'subir', (SELECT v::uuid FROM ids WHERE k='d2')))->'rutas'->>0 LIKE '%/v2/contrato.pdf', 'subir: solo la versión siguiente');
SELECT pg_temp.debe_fallar($q$ SELECT public.doc_b2b_autorizar_archivos('t_com2', (SELECT v FROM ids WHERE k='tok_t_com2'), 'subir', (SELECT v::uuid FROM ids WHERE k='d2')) $q$, 'No puedes editar', 'ajeno no sube');
RESET ROLE;

DO $$ BEGIN RAISE EXCEPTION 'TODO_OK'; END $$;
