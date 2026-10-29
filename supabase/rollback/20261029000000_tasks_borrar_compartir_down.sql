-- =============================================================================
--  Rollback de 20261029000000_tasks_borrar_compartir.sql (idempotente).
--  - Las tareas borradas NO reaparecen: antes de quitar deleted_at se archivan
--    (archived_at = deleted_at si no estaban archivadas).
--  - Se pierde con quién estaba compartida cada tarea (columna shared_with) y se
--    eliminan los eventos 'deleted' y 'shared' (el CHECK original no los admite).
--  - Restaura las versiones originales de _tasks_bloquear, tasks_cambiar_estado,
--    tasks_comentar y tasks_contador (copiadas de 20261026010000_tasks.sql).
-- =============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.tasks_borrar(text, uuid);
DROP FUNCTION IF EXISTS public.tasks_compartir(text, uuid, text[]);

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'tasks' AND column_name = 'deleted_at') THEN
    UPDATE public.tasks SET archived_at = coalesce(archived_at, deleted_at) WHERE deleted_at IS NOT NULL;
  END IF;
END $do$;

DELETE FROM public.task_events WHERE type IN ('deleted', 'shared');
ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_type_check;
ALTER TABLE public.task_events ADD CONSTRAINT task_events_type_check CHECK (type IN (
  'created','updated','reassigned','status_changed','completed','reopened','moved','archived',
  'unarchived','commented'));

DROP INDEX IF EXISTS public.tasks_shared_with_idx;

CREATE OR REPLACE FUNCTION public._tasks_bloquear(p_id uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v public.tasks;
BEGIN
  SELECT * INTO v FROM public.tasks WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_cambiar_estado(p_actor text, p_id uuid, p_status text)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._tasks_rol_actor(p_actor);
  v_old  public.tasks;
  v_new  public.tasks;
  v_type text;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('pending','in_progress','completed') THEN
    RAISE EXCEPTION 'Estado no válido: "%". Usa pending, in_progress o completed.', p_status USING ERRCODE = 'P0001';
  END IF;
  v_old := public._tasks_bloquear(p_id);
  IF v_role <> 'admin' AND p_actor NOT IN (v_old.created_by, v_old.assignee) THEN
    RAISE EXCEPTION 'Solo el creador, el responsable o un administrador puede cambiar el estado.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._tasks_no_archivada(v_old);

  IF v_old.status = p_status THEN
    RETURN v_old;
  END IF;

  IF p_status = 'completed' THEN
    v_type := 'completed';
    UPDATE public.tasks SET status = p_status, completed_at = now(), completed_by = p_actor
     WHERE id = p_id RETURNING * INTO v_new;
  ELSIF v_old.status = 'completed' THEN
    v_type := 'reopened';
    UPDATE public.tasks SET status = p_status, completed_at = NULL, completed_by = NULL
     WHERE id = p_id RETURNING * INTO v_new;
  ELSE
    v_type := 'status_changed';
    UPDATE public.tasks SET status = p_status WHERE id = p_id RETURNING * INTO v_new;
  END IF;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, v_type, jsonb_build_object('from', v_old.status, 'to', p_status));

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_comentar(p_actor text, p_id uuid, p_comentario text)
RETURNS public.task_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._tasks_rol_actor(p_actor);
  v_task public.tasks;
  v_ev   public.task_events;
BEGIN
  SELECT * INTO v_task FROM public.tasks WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF v_role <> 'admin' AND p_actor NOT IN (v_task.created_by, v_task.assignee) THEN
    RAISE EXCEPTION 'No puedes comentar una tarea que no ves.' USING ERRCODE = 'P0001';
  END IF;
  IF p_comentario IS NULL OR length(trim(p_comentario)) = 0 THEN
    RAISE EXCEPTION 'El comentario no puede estar vacío.' USING ERRCODE = 'P0001';
  END IF;
  IF length(p_comentario) > 5000 THEN
    RAISE EXCEPTION 'El comentario no puede superar 5000 caracteres.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, 'commented', jsonb_build_object('comment', trim(p_comentario)))
  RETURNING * INTO v_ev;
  RETURN v_ev;
END;
$$;

CREATE OR REPLACE FUNCTION public.tasks_contador(p_username text)
RETURNS TABLE (activas integer, vencidas integer, proximas integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::int,
         count(*) FILTER (WHERE due_at < now())::int,
         count(*) FILTER (WHERE due_at >= now() AND due_at < now() + interval '24 hours')::int
    FROM public.tasks
   WHERE assignee = p_username AND archived_at IS NULL AND status <> 'completed';
$$;

ALTER TABLE public.tasks DROP COLUMN IF EXISTS shared_with;
ALTER TABLE public.tasks DROP COLUMN IF EXISTS deleted_at;

REVOKE ALL ON FUNCTION public._tasks_bloquear(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tasks_cambiar_estado(text, uuid, text), public.tasks_comentar(text, uuid, text),
  public.tasks_contador(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tasks_cambiar_estado(text, uuid, text), public.tasks_comentar(text, uuid, text),
  public.tasks_contador(text) TO anon, authenticated;

DO $do$
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
    DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261029000000';
  END IF;
END $do$;

COMMIT;
