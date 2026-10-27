-- =============================================================================
--  Módulo Tasks — tablas, trigger, RLS (permisiva, criterio rls_fase1),
--  realtime y RPC de mutación (SECURITY DEFINER, p_actor como 1er parámetro).
--  Contrato: docs/tasks/CONTRATO.md (v2).  Rollback: supabase/rollback/20261026010000_tasks_down.sql
--
--  AVISO: p_actor NO es una identidad verificada (el CRM no usa Supabase Auth).
--  Las comprobaciones de permisos son defensa razonable, no seguridad real.
--  Ver docs/tasks/BACKEND.md → "Pendiente de seguridad".
-- =============================================================================

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.tasks (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     uuid        NULL,
  title        text        NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  description  text        NULL CHECK (description IS NULL OR length(description) <= 5000),
  created_by   text        NOT NULL REFERENCES public.usuarios(username) ON UPDATE CASCADE ON DELETE RESTRICT,
  assignee     text        NOT NULL REFERENCES public.usuarios(username) ON UPDATE CASCADE ON DELETE RESTRICT,
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','in_progress','completed')),
  priority     text        NOT NULL DEFAULT 'normal'
                           CHECK (priority IN ('low','normal','high','urgent')),
  planned_date date        NULL,
  planned_time time        NULL,
  due_date     date        NULL,
  due_time     time        NULL,
  due_at       timestamptz NULL,   -- lo calcula el trigger (Europe/Madrid)
  completed_at timestamptz NULL,
  completed_by text        NULL REFERENCES public.usuarios(username) ON UPDATE CASCADE ON DELETE RESTRICT,
  archived_at  timestamptz NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tasks_planned_time_requiere_fecha CHECK (planned_time IS NULL OR planned_date IS NOT NULL),
  CONSTRAINT tasks_due_time_requiere_fecha     CHECK (due_time IS NULL OR due_date IS NOT NULL),
  CONSTRAINT tasks_completed_coherente CHECK (
    (status = 'completed' AND completed_at IS NOT NULL) OR
    (status <> 'completed' AND completed_at IS NULL AND completed_by IS NULL))
);

CREATE INDEX tasks_assignee_status_idx ON public.tasks (assignee, status);
CREATE INDEX tasks_created_by_idx      ON public.tasks (created_by);
CREATE INDEX tasks_due_at_idx          ON public.tasks (due_at) WHERE due_at IS NOT NULL;
CREATE INDEX tasks_planned_date_idx    ON public.tasks (planned_date) WHERE planned_date IS NOT NULL;
CREATE INDEX tasks_group_id_idx        ON public.tasks (group_id) WHERE group_id IS NOT NULL;

CREATE TABLE public.task_events (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id    uuid        NOT NULL REFERENCES public.tasks(id),
  actor      text        NOT NULL REFERENCES public.usuarios(username) ON UPDATE CASCADE,
  type       text        NOT NULL CHECK (type IN ('created','updated','reassigned','status_changed',
                                                  'completed','reopened','moved','archived',
                                                  'unarchived','commented')),
  payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_events_task_created_idx ON public.task_events (task_id, created_at);

CREATE TABLE public.task_user_preferences (
  username   text        PRIMARY KEY REFERENCES public.usuarios(username) ON UPDATE CASCADE ON DELETE CASCADE,
  color      text        NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  prefs      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Trigger: due_at (Europe/Madrid, sin hora = 23:59:59) + updated_at ───────
CREATE OR REPLACE FUNCTION public.tasks_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.due_date IS NULL THEN
    NEW.due_at := NULL;
  ELSE
    NEW.due_at := (NEW.due_date + coalesce(NEW.due_time, time '23:59:59')) AT TIME ZONE 'Europe/Madrid';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_before_write
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.tasks_before_write();

CREATE OR REPLACE FUNCTION public.task_user_preferences_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER task_user_preferences_touch
  BEFORE UPDATE ON public.task_user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.task_user_preferences_touch();

-- ── RLS: mismo criterio que rls_fase1 (permisivo) ───────────────────────────
ALTER TABLE public.tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY fase1_permisivo ON public.tasks
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.task_events
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.task_user_preferences
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Solo lectura directa: toda escritura pasa por las RPC SECURITY DEFINER.
GRANT SELECT ON public.tasks, public.task_events, public.task_user_preferences
  TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tasks, public.task_events, public.task_user_preferences
  FROM anon, authenticated;

-- ── Realtime ────────────────────────────────────────────────────────────────
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks, public.task_events;

-- ── Helpers internos (no expuestos) ─────────────────────────────────────────
-- Devuelve el rol del actor o lanza error si no existe / está dado de baja.
CREATE OR REPLACE FUNCTION public._tasks_rol_actor(p_actor text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  IF p_actor IS NULL OR trim(p_actor) = '' THEN
    RAISE EXCEPTION 'Falta el usuario que realiza la acción.' USING ERRCODE = 'P0001';
  END IF;
  SELECT u.role INTO v_role FROM public.usuarios u
   WHERE u.username = p_actor AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El usuario "%" no existe o está dado de baja.', p_actor USING ERRCODE = 'P0001';
  END IF;
  RETURN v_role;
END;
$$;

-- Bloquea y devuelve la tarea o lanza error si no existe.
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

-- Comprueba que un username es un responsable válido (existe y está activo).
CREATE OR REPLACE FUNCTION public._tasks_validar_responsable(p_username text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.usuarios
                  WHERE username = p_username AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'El responsable "%" no existe o está dado de baja.', p_username USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._tasks_validar_campos(p_title text, p_description text, p_priority text,
  p_planned_date date, p_planned_time time, p_due_date date, p_due_time time)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'El título es obligatorio.' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(p_title)) > 200 THEN
    RAISE EXCEPTION 'El título no puede superar 200 caracteres.' USING ERRCODE = 'P0001';
  END IF;
  IF p_description IS NOT NULL AND length(p_description) > 5000 THEN
    RAISE EXCEPTION 'La descripción no puede superar 5000 caracteres.' USING ERRCODE = 'P0001';
  END IF;
  IF p_priority NOT IN ('low','normal','high','urgent') THEN
    RAISE EXCEPTION 'Prioridad no válida: "%". Usa low, normal, high o urgent.', p_priority USING ERRCODE = 'P0001';
  END IF;
  IF p_planned_time IS NOT NULL AND p_planned_date IS NULL THEN
    RAISE EXCEPTION 'No se puede indicar hora planificada sin fecha planificada.' USING ERRCODE = 'P0001';
  END IF;
  IF p_due_time IS NOT NULL AND p_due_date IS NULL THEN
    RAISE EXCEPTION 'No se puede indicar hora de vencimiento sin fecha de vencimiento.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._tasks_no_archivada(p public.tasks)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'La tarea está archivada; desarchívala antes de modificarla.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ── RPC: tasks_crear ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tasks_crear(
  p_actor        text,
  p_title        text,
  p_description  text   DEFAULT NULL,
  p_assignees    text[] DEFAULT NULL,
  p_priority     text   DEFAULT 'normal',
  p_planned_date date   DEFAULT NULL,
  p_planned_time time   DEFAULT NULL,
  p_due_date     date   DEFAULT NULL,
  p_due_time     time   DEFAULT NULL
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role      text := public._tasks_rol_actor(p_actor);
  v_assignees text[];
  v_group     uuid;
  v_who       text;
  v_task      public.tasks;
  v_priority  text := coalesce(p_priority, 'normal');
  v_desc      text := nullif(trim(p_description), '');
BEGIN
  PERFORM public._tasks_validar_campos(p_title, v_desc, v_priority,
            p_planned_date, p_planned_time, p_due_date, p_due_time);

  SELECT coalesce(array_agg(DISTINCT trim(a)) FILTER (WHERE a IS NOT NULL AND trim(a) <> ''), '{}')
    INTO v_assignees FROM unnest(coalesce(p_assignees, '{}'::text[])) AS a;
  IF cardinality(v_assignees) = 0 THEN
    v_assignees := ARRAY[p_actor];
  END IF;

  IF v_role NOT IN ('admin','manager') AND v_assignees <> ARRAY[p_actor] THEN
    RAISE EXCEPTION 'Un comercial solo puede crear tareas para sí mismo.' USING ERRCODE = 'P0001';
  END IF;

  FOREACH v_who IN ARRAY v_assignees LOOP
    PERFORM public._tasks_validar_responsable(v_who);
  END LOOP;

  IF cardinality(v_assignees) > 1 THEN
    v_group := gen_random_uuid();
  END IF;

  FOREACH v_who IN ARRAY v_assignees LOOP
    INSERT INTO public.tasks (group_id, title, description, created_by, assignee, priority,
                              planned_date, planned_time, due_date, due_time)
    VALUES (v_group, trim(p_title), v_desc, p_actor, v_who, v_priority,
            p_planned_date, p_planned_time, p_due_date, p_due_time)
    RETURNING * INTO v_task;

    INSERT INTO public.task_events (task_id, actor, type, payload)
    VALUES (v_task.id, p_actor, 'created',
            jsonb_build_object('assignee', v_who, 'group_id', v_group));

    RETURN NEXT v_task;
  END LOOP;
  RETURN;
END;
$$;

-- ── RPC: tasks_editar ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tasks_editar(p_actor text, p_id uuid, p_cambios jsonb)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role    text := public._tasks_rol_actor(p_actor);
  v_old     public.tasks;
  v_new     public.tasks;
  v_key     text;
  v_changes jsonb := '{}'::jsonb;
  v_permit  text[] := ARRAY['title','description','priority','planned_date','planned_time','due_date','due_time'];
BEGIN
  v_old := public._tasks_bloquear(p_id);
  IF v_role <> 'admin' AND v_old.created_by <> p_actor THEN
    RAISE EXCEPTION 'Solo el creador de la tarea o un administrador puede editarla.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._tasks_no_archivada(v_old);

  IF p_cambios IS NULL OR jsonb_typeof(p_cambios) <> 'object' THEN
    RAISE EXCEPTION 'Los cambios deben ser un objeto JSON.' USING ERRCODE = 'P0001';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_cambios) LOOP
    IF NOT v_key = ANY (v_permit) THEN
      RAISE EXCEPTION 'Campo no editable: "%". Permitidos: %.', v_key, array_to_string(v_permit, ', ')
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  v_new := v_old;
  BEGIN
    IF p_cambios ? 'title'        THEN v_new.title        := trim(p_cambios->>'title'); END IF;
    IF p_cambios ? 'description'  THEN v_new.description  := nullif(trim(p_cambios->>'description'), ''); END IF;
    IF p_cambios ? 'priority'     THEN v_new.priority     := coalesce(p_cambios->>'priority', 'normal'); END IF;
    IF p_cambios ? 'planned_date' THEN v_new.planned_date := (p_cambios->>'planned_date')::date; END IF;
    IF p_cambios ? 'planned_time' THEN v_new.planned_time := (p_cambios->>'planned_time')::time; END IF;
    IF p_cambios ? 'due_date'     THEN v_new.due_date     := (p_cambios->>'due_date')::date; END IF;
    IF p_cambios ? 'due_time'     THEN v_new.due_time     := (p_cambios->>'due_time')::time; END IF;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'Formato de fecha u hora no válido (usa AAAA-MM-DD y HH:MM).' USING ERRCODE = 'P0001';
  END;

  PERFORM public._tasks_validar_campos(v_new.title, v_new.description, v_new.priority,
            v_new.planned_date, v_new.planned_time, v_new.due_date, v_new.due_time);

  FOREACH v_key IN ARRAY v_permit LOOP
    IF (to_jsonb(v_old)->v_key) IS DISTINCT FROM (to_jsonb(v_new)->v_key) THEN
      v_changes := v_changes || jsonb_build_object(v_key,
                     jsonb_build_object('from', to_jsonb(v_old)->v_key, 'to', to_jsonb(v_new)->v_key));
    END IF;
  END LOOP;

  IF v_changes = '{}'::jsonb THEN
    RETURN v_old;  -- nada que cambiar: sin evento
  END IF;

  UPDATE public.tasks SET
    title = v_new.title, description = v_new.description, priority = v_new.priority,
    planned_date = v_new.planned_date, planned_time = v_new.planned_time,
    due_date = v_new.due_date, due_time = v_new.due_time
  WHERE id = p_id
  RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, 'updated', jsonb_build_object('changes', v_changes));

  RETURN v_new;
END;
$$;

-- ── RPC: tasks_cambiar_estado ───────────────────────────────────────────────
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

-- ── RPC: tasks_reasignar ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tasks_reasignar(p_actor text, p_id uuid, p_assignee text)
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
  v_old := public._tasks_bloquear(p_id);
  IF NOT (v_role = 'admin' OR (v_role = 'manager' AND v_old.created_by = p_actor)) THEN
    RAISE EXCEPTION 'Solo un administrador, o el manager que creó la tarea, puede reasignarla.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._tasks_no_archivada(v_old);
  PERFORM public._tasks_validar_responsable(p_assignee);

  IF v_old.assignee = p_assignee THEN
    RETURN v_old;
  END IF;

  UPDATE public.tasks SET assignee = p_assignee WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, 'reassigned', jsonb_build_object('from', v_old.assignee, 'to', p_assignee));

  RETURN v_new;
END;
$$;

-- ── RPC: tasks_mover (cambia planned_date/planned_time, no el deadline) ────
CREATE OR REPLACE FUNCTION public.tasks_mover(p_actor text, p_id uuid, p_planned_date date, p_planned_time time DEFAULT NULL)
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
  v_old := public._tasks_bloquear(p_id);
  IF v_role <> 'admin' AND v_old.created_by <> p_actor THEN
    RAISE EXCEPTION 'Solo el creador de la tarea o un administrador puede moverla en el calendario.' USING ERRCODE = 'P0001';
  END IF;
  PERFORM public._tasks_no_archivada(v_old);
  IF p_planned_time IS NOT NULL AND p_planned_date IS NULL THEN
    RAISE EXCEPTION 'No se puede indicar hora planificada sin fecha planificada.' USING ERRCODE = 'P0001';
  END IF;

  IF v_old.planned_date IS NOT DISTINCT FROM p_planned_date
     AND v_old.planned_time IS NOT DISTINCT FROM p_planned_time THEN
    RETURN v_old;
  END IF;

  UPDATE public.tasks SET planned_date = p_planned_date, planned_time = p_planned_time
   WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, 'moved', jsonb_build_object(
    'from', jsonb_build_object('planned_date', v_old.planned_date, 'planned_time', v_old.planned_time),
    'to',   jsonb_build_object('planned_date', p_planned_date,     'planned_time', p_planned_time)));

  RETURN v_new;
END;
$$;

-- ── RPC: tasks_archivar ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tasks_archivar(p_actor text, p_id uuid, p_archivar boolean DEFAULT true)
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
  v_old := public._tasks_bloquear(p_id);
  IF v_role <> 'admin' AND v_old.created_by <> p_actor THEN
    RAISE EXCEPTION 'Solo el creador de la tarea o un administrador puede archivarla o desarchivarla.' USING ERRCODE = 'P0001';
  END IF;

  IF coalesce(p_archivar, true) = (v_old.archived_at IS NOT NULL) THEN
    RETURN v_old;
  END IF;

  UPDATE public.tasks SET archived_at = CASE WHEN coalesce(p_archivar, true) THEN now() END
   WHERE id = p_id RETURNING * INTO v_new;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (p_id, p_actor, CASE WHEN coalesce(p_archivar, true) THEN 'archived' ELSE 'unarchived' END, '{}'::jsonb);

  RETURN v_new;
END;
$$;

-- ── RPC: tasks_comentar ─────────────────────────────────────────────────────
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

-- ── RPC: tasks_set_color (solo admin; p_color NULL = volver al automático) ──
CREATE OR REPLACE FUNCTION public.tasks_set_color(p_actor text, p_username text, p_color text)
RETURNS public.task_user_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._tasks_rol_actor(p_actor);
  v_row  public.task_user_preferences;
BEGIN
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los colores.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE username = p_username AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'El usuario "%" no existe o está dado de baja.', p_username USING ERRCODE = 'P0001';
  END IF;
  IF p_color IS NOT NULL AND p_color !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Color no válido: "%". Usa el formato #RRGGBB.', p_color USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.task_user_preferences (username, color)
  VALUES (p_username, p_color)
  ON CONFLICT (username) DO UPDATE SET color = EXCLUDED.color
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ── Lectura opcional: tasks_contador ────────────────────────────────────────
-- Tareas del responsable no archivadas ni completadas: activas, vencidas y que vencen en < 24 h.
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

-- ── Permisos de ejecución ───────────────────────────────────────────────────
-- Supabase concede EXECUTE por defecto a anon/authenticated en funciones nuevas:
-- se revoca explícitamente en helpers y se concede solo en las RPC públicas.
REVOKE ALL ON FUNCTION
  public._tasks_rol_actor(text),
  public._tasks_bloquear(uuid),
  public._tasks_validar_responsable(text),
  public._tasks_validar_campos(text, text, text, date, time, date, time),
  public._tasks_no_archivada(public.tasks),
  public.tasks_before_write(),
  public.task_user_preferences_touch()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
  public.tasks_crear(text, text, text, text[], text, date, time, date, time),
  public.tasks_editar(text, uuid, jsonb),
  public.tasks_cambiar_estado(text, uuid, text),
  public.tasks_reasignar(text, uuid, text),
  public.tasks_mover(text, uuid, date, time),
  public.tasks_archivar(text, uuid, boolean),
  public.tasks_comentar(text, uuid, text),
  public.tasks_set_color(text, text, text),
  public.tasks_contador(text)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
  public.tasks_crear(text, text, text, text[], text, date, time, date, time),
  public.tasks_editar(text, uuid, jsonb),
  public.tasks_cambiar_estado(text, uuid, text),
  public.tasks_reasignar(text, uuid, text),
  public.tasks_mover(text, uuid, date, time),
  public.tasks_archivar(text, uuid, boolean),
  public.tasks_comentar(text, uuid, text),
  public.tasks_set_color(text, text, text),
  public.tasks_contador(text)
TO anon, authenticated;
