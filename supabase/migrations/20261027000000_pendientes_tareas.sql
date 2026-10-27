-- =============================================================================
--  Gestión de Pendientes → Tareas: cada Excel importado crea UNA tarea.
--  Solo añade (columnas nulas, índices y una RPC); no modifica filas existentes.
--  Rollback: supabase/rollback/20261027000000_pendientes_tareas_down.sql
-- =============================================================================

-- Lote de importación = huella SHA-256 del archivo (la calcula el frontend).
-- Los registros históricos quedan con lote_id NULL.
ALTER TABLE public.registro_pendientes ADD COLUMN IF NOT EXISTS lote_id uuid NULL;
CREATE INDEX IF NOT EXISTS registro_pendientes_lote_idx
  ON public.registro_pendientes (lote_id) WHERE lote_id IS NOT NULL;

-- Una tarea como máximo por lote: el índice único impide duplicados por reintentos.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pendientes_lote uuid NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_pendientes_lote_uniq
  ON public.tasks (pendientes_lote) WHERE pendientes_lote IS NOT NULL;

-- ── RPC: tasks_crear_pendientes ─────────────────────────────────────────────
-- Crea (o devuelve, si ya existe) la tarea "Gestionar pendientes — DD/MM/AAAA"
-- del lote, asignada a quien importó. Solo admin/manager. Sin pendientes en el
-- lote no crea nada.
CREATE OR REPLACE FUNCTION public.tasks_crear_pendientes(p_actor text, p_lote uuid)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text := public._tasks_rol_actor(p_actor);
  v_task   public.tasks;
  v_n      integer;
  v_origen text;
BEGIN
  IF v_role NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Solo un administrador o un manager puede crear la tarea de pendientes.' USING ERRCODE = 'P0001';
  END IF;
  IF p_lote IS NULL THEN
    RAISE EXCEPTION 'Falta el lote de pendientes.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_task FROM public.tasks WHERE pendientes_lote = p_lote;
  IF FOUND THEN
    RETURN v_task;
  END IF;

  SELECT count(*), min(origen_excel) INTO v_n, v_origen
    FROM public.registro_pendientes
   WHERE lote_id = p_lote AND deleted_at IS NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'El lote no tiene pendientes registrados.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.tasks (title, description, created_by, assignee, pendientes_lote)
  VALUES ('Gestionar pendientes — ' || to_char(now() AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY'),
          format('%s pendiente(s) importados del Excel «%s».', v_n, coalesce(v_origen, 'sin nombre')),
          p_actor, p_actor, p_lote)
  ON CONFLICT (pendientes_lote) WHERE pendientes_lote IS NOT NULL DO NOTHING
  RETURNING * INTO v_task;

  IF v_task.id IS NULL THEN  -- otra llamada simultánea la creó primero
    SELECT * INTO v_task FROM public.tasks WHERE pendientes_lote = p_lote;
    RETURN v_task;
  END IF;

  INSERT INTO public.task_events (task_id, actor, type, payload)
  VALUES (v_task.id, p_actor, 'created',
          jsonb_build_object('assignee', p_actor, 'group_id', NULL, 'origen', 'pendientes',
                             'lote', p_lote, 'pendientes', v_n));
  RETURN v_task;
END;
$$;

REVOKE ALL ON FUNCTION public.tasks_crear_pendientes(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tasks_crear_pendientes(text, uuid) TO anon, authenticated;
