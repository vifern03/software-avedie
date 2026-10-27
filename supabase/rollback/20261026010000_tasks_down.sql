-- =============================================================================
--  Rollback del módulo Tasks (inverso de migrations/20261026010000_tasks.sql).
--  BORRA las tablas tasks, task_events y task_user_preferences con sus datos.
--  Idempotente: se puede ejecutar aunque la migración no esté aplicada.
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.tasks_crear(text, text, text, text[], text, date, time, date, time);
DROP FUNCTION IF EXISTS public.tasks_editar(text, uuid, jsonb);
DROP FUNCTION IF EXISTS public.tasks_cambiar_estado(text, uuid, text);
DROP FUNCTION IF EXISTS public.tasks_reasignar(text, uuid, text);
DROP FUNCTION IF EXISTS public.tasks_mover(text, uuid, date, time);
DROP FUNCTION IF EXISTS public.tasks_archivar(text, uuid, boolean);
DROP FUNCTION IF EXISTS public.tasks_comentar(text, uuid, text);
DROP FUNCTION IF EXISTS public.tasks_set_color(text, text, text);
DROP FUNCTION IF EXISTS public.tasks_contador(text);
DROP FUNCTION IF EXISTS public._tasks_rol_actor(text);
DROP FUNCTION IF EXISTS public._tasks_validar_responsable(text);
DROP FUNCTION IF EXISTS public._tasks_validar_campos(text, text, text, date, time, date, time);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'task_events') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.task_events;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'tasks') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.tasks;
  END IF;
END $$;

DROP TABLE IF EXISTS public.task_events;
DROP TABLE IF EXISTS public.task_user_preferences;
-- Las funciones que dependen del tipo fila public.tasks caen con la tabla (CASCADE).
DROP FUNCTION IF EXISTS public._tasks_bloquear(uuid);
DROP FUNCTION IF EXISTS public._tasks_no_archivada(public.tasks);
DROP TABLE IF EXISTS public.tasks CASCADE;
DROP FUNCTION IF EXISTS public.tasks_before_write();
DROP FUNCTION IF EXISTS public.task_user_preferences_touch();

-- Si se aplicó con la CLI, olvidar la versión para poder volver a aplicarla.
DO $$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261026010000';
  END IF;
END $$;

COMMIT;
