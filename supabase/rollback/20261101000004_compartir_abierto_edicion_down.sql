DROP FUNCTION IF EXISTS public.doc_b2b_modificaciones_gestion(text, text, uuid);
DROP FUNCTION IF EXISTS public.doc_b2b_autorizar_subida(text, text, uuid);
DROP FUNCTION IF EXISTS public.doc_b2b_guardar_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean);
DROP FUNCTION IF EXISTS public.doc_b2b_compartir_abierto(text, text, uuid, text[]);
DROP FUNCTION IF EXISTS public.compartir_bloqueos_guardar(text, text, text, text[]);
DROP TABLE IF EXISTS public.compartir_bloqueos;
