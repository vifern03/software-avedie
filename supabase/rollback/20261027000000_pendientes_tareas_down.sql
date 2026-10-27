-- Rollback de 20261027000000_pendientes_tareas.sql (idempotente).
-- Las tareas ya creadas se conservan; solo pierden el vínculo con su lote.
DROP FUNCTION IF EXISTS public.tasks_crear_pendientes(text, uuid);
DROP INDEX IF EXISTS public.tasks_pendientes_lote_uniq;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS pendientes_lote;
DROP INDEX IF EXISTS public.registro_pendientes_lote_idx;
ALTER TABLE public.registro_pendientes DROP COLUMN IF EXISTS lote_id;
