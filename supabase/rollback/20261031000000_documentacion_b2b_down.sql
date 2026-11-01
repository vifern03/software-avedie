-- =============================================================================
--  Rollback de Documentación B2B. Idempotente.
--  Borra SOLO lo que creó 20261031000000_documentacion_b2b.sql: tablas (y sus datos:
--  expedientes, versiones de tarifa, distribuidoras y sesiones) y funciones.
--  Las filas de actividades 'Documentación B2B' se conservan como histórico.
--
--  Buckets: Supabase no deja borrar un bucket con archivos. Si hay que quitarlos,
--  vaciar antes plantillas-contratos, tarifas-pdf y documentacion-b2b desde Storage;
--  si no están vacíos, los buckets (privados) se quedan y el resto se revierte igual.
--  Edge Function: npx supabase functions delete doc-b2b-archivos --project-ref <ref>
-- =============================================================================
DROP FUNCTION IF EXISTS public.doc_b2b_autorizar_archivos(text, text, text, uuid, int, text);
DROP FUNCTION IF EXISTS public.tarifa_guardar_version(text, text, text, jsonb, date, date, text, text, jsonb);
DROP FUNCTION IF EXISTS public.distribuidora_guardar(text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.doc_b2b_cups_activos(text, text);
DROP FUNCTION IF EXISTS public.doc_b2b_detalle(text, text, uuid);
DROP FUNCTION IF EXISTS public.doc_b2b_listar(text, text, text, text, int, int);
DROP FUNCTION IF EXISTS public.doc_b2b_compartir(text, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.doc_b2b_borrar(text, text, uuid);
DROP FUNCTION IF EXISTS public.doc_b2b_nueva_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.doc_b2b_crear(text, text, uuid, bigint[], text, text, uuid, jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public._doc_b2b_validar_documentos(uuid, int, int, jsonb);
DROP FUNCTION IF EXISTS public._doc_b2b_actividad(text, text);
DROP FUNCTION IF EXISTS public._doc_b2b_ve_cliente(text, text, bigint);
DROP FUNCTION IF EXISTS public._doc_b2b_actor(text, text);
DROP FUNCTION IF EXISTS public._doc_b2b_tiene_seccion(text, text);
DROP FUNCTION IF EXISTS public.doc_b2b_cerrar_sesion(text);
DROP FUNCTION IF EXISTS public.doc_b2b_abrir_sesion(text, text);

DO $$
BEGIN
  IF to_regclass('public.documentacion_b2b') IS NOT NULL THEN
    DROP FUNCTION IF EXISTS public._doc_b2b_puede_ver(text, text, public.documentacion_b2b);
    DROP FUNCTION IF EXISTS public._doc_b2b_puede_editar(text, text, public.documentacion_b2b);
  END IF;
END $$;

DROP TABLE IF EXISTS public.documentacion_b2b_versiones;
DROP TABLE IF EXISTS public.documentacion_b2b_cups;
DROP TABLE IF EXISTS public.documentacion_b2b;
DROP TABLE IF EXISTS public.doc_b2b_sesiones;
DROP TABLE IF EXISTS public.tarifas_versiones;
DROP TABLE IF EXISTS public.distribuidoras_electricidad;

DO $$
BEGIN
  DELETE FROM storage.buckets b
   WHERE b.id IN ('plantillas-contratos', 'tarifas-pdf', 'documentacion-b2b')
     AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = b.id);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Buckets no eliminados: %', SQLERRM;
END $$;
