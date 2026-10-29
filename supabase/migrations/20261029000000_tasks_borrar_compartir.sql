-- =============================================================================
--  Tareas: borrado lógico y compartir (además del responsable).
--  Solo añade: columnas nuevas (deleted_at, shared_with), índice, tipos de evento
--  'deleted' y 'shared', RPC nuevas (tasks_borrar, tasks_compartir) y nuevas
--  versiones —misma firma— de _tasks_bloquear, tasks_cambiar_estado,
--  tasks_comentar y tasks_contador para respetar borradas y compartidas.
--  No modifica filas existentes.
--  Rollback: supabase/rollback/20261029000000_tasks_borrar_compartir_down.sql
-- =============================================================================

-- ── Columnas ────────────────────────────────────────────────────────────────
-- Borrada = deleted_at no nulo. Se conserva pendientes_lote: el índice único
-- tasks_pendientes_lote_uniq sigue cubriéndola y reimportar el Excel no duplica.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS deleted_at  timestamptz NULL;
-- Usuarios (username) con los que se comparte; no incluye al responsable.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS shared_with text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS tasks_shared_with_idx ON public.tasks USING gin (shared_with);

-- ── Tipos de evento: se amplían con 'deleted' y 'shared' ────────────────────
ALTER TABLE public.task_events DROP CONSTRAINT IF EXISTS task_events_type_check;
ALTER TABLE public.task_events ADD CONSTRAINT task_events_type_check CHECK (type IN (
  'created','updated','reassigned','status_changed','completed','reopened','moved','archived',
  'unarchived','commented','deleted','shared'));

-- ── _tasks_bloquear: una tarea borrada ya no se puede modificar ─────────────
-- (editar, estado, reasignar, mover, archivar y compartir pasan por aquí)
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
  IF v.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea ha sido borrada.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v;
END;
$$;

-- ── tasks_cambiar_estado: también los usuarios con los que se comparte ──────
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
  IF v_role <> 'admin' AND p_actor NOT IN (v_old.created_by, v_old.assignee) AND NOT p_actor = ANY (v_old.shared_with) THEN
    RAISE EXCEPTION 'Solo el creador, el responsable, quien la tiene compartida o un administrador puede cambiar el estado.' USING ERRCODE = 'P0001';
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

-- ── tasks_comentar: también compartidos; no en tareas borradas ──────────────
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
  IF v_task.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea ha sido borrada.' USING ERRCODE = 'P0001';
  END IF;
  IF v_role <> 'admin' AND p_actor NOT IN (v_task.created_by, v_task.assignee) AND NOT p_actor = ANY (v_task.shared_with) THEN
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

-- ── tasks_contador: responsable o compartida; sin borradas ──────────────────
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
   WHERE (assignee = p_username OR p_username = ANY (shared_with))
     AND archived_at IS NULL AND deleted_at IS NULL AND status <> 'completed';
$$;

-- ── RPC: tasks_borrar (borrado lógico; creador o admin) ─────────────────────
CREATE OR REPLACE FUNCTION public.tasks_borrar(p_actor text, p_task uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._tasks_rol_actor(p_actor);
  v_old  public.tasks;
  v_new  public.tasks;
BEGIN
  SELECT * INTO v_old FROM public.tasks WHERE id = p_task FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La tarea no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF v_role <> 'admin' AND v_old.created_by <> p_actor THEN
    RAISE EXCEPTION 'Solo el creador de la tarea o un administrador puede borrarla.' USING ERRCODE = 'P0001';
  END IF;
  IF v_old.deleted_at IS NOT NULL THEN
    RETURN v_old;  -- ya borrada: sin evento
  END IF;

  UPDATE public.tasks SET deleted_at = now() WHERE id = p_task RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_task, p_actor, 'deleted', '{}'::jsonb);
  RETURN v_new;
END;
$$;

-- ── RPC: tasks_compartir (lista completa; creador, responsable o admin) ─────
-- p_usuarios = lista final de usuarios con los que queda compartida ({} = nadie).
CREATE OR REPLACE FUNCTION public.tasks_compartir(p_actor text, p_task uuid, p_usuarios text[])
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text := public._tasks_rol_actor(p_actor);
  v_old     public.tasks;
  v_new     public.tasks;
  v_lista   text[];
  v_who     text;
  v_added   text[];
  v_removed text[];
BEGIN
  v_old := public._tasks_bloquear(p_task);
  IF v_role <> 'admin' AND p_actor NOT IN (v_old.created_by, v_old.assignee) THEN
    RAISE EXCEPTION 'Solo el creador, el responsable o un administrador puede compartir la tarea.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._tasks_no_archivada(v_old);

  SELECT coalesce(array_agg(DISTINCT trim(a) ORDER BY trim(a)) FILTER (WHERE a IS NOT NULL AND trim(a) <> ''), '{}')
    INTO v_lista FROM unnest(coalesce(p_usuarios, '{}'::text[])) AS a;

  FOREACH v_who IN ARRAY v_lista LOOP
    IF v_who = v_old.assignee THEN
      RAISE EXCEPTION '"%" ya es el responsable de la tarea.', v_who USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE username = v_who AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'El usuario "%" no existe o está dado de baja.', v_who USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_added
    FROM unnest(v_lista) AS x WHERE NOT x = ANY (v_old.shared_with);
  SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_removed
    FROM unnest(v_old.shared_with) AS x WHERE NOT x = ANY (v_lista);

  IF cardinality(v_added) = 0 AND cardinality(v_removed) = 0 THEN
    RETURN v_old;  -- sin cambios: sin evento
  END IF;

  UPDATE public.tasks SET shared_with = v_lista WHERE id = p_task RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_task, p_actor, 'shared', jsonb_build_object('added', v_added, 'removed', v_removed));
  RETURN v_new;
END;
$$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public._tasks_bloquear(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION
  public.tasks_borrar(text, uuid),
  public.tasks_compartir(text, uuid, text[]),
  public.tasks_cambiar_estado(text, uuid, text),
  public.tasks_comentar(text, uuid, text),
  public.tasks_contador(text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.tasks_borrar(text, uuid),
  public.tasks_compartir(text, uuid, text[]),
  public.tasks_cambiar_estado(text, uuid, text),
  public.tasks_comentar(text, uuid, text),
  public.tasks_contador(text)
TO anon, authenticated;
