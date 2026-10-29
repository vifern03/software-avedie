-- =============================================================================
--  Pruebas de permisos y reglas del módulo Tasks (Supabase LOCAL).
--  Ejecutar:
--    docker exec -i supabase_db_CRM_AVEDIE psql -U postgres -v ON_ERROR_STOP=1 < tests/sql/tasks_permisos.sql
--  Todo corre en una transacción que se deshace al final (no deja datos).
--  Crea sus propios usuarios t_* (no depende del seed). Si algo no cuadra,
--  lanza una excepción "FALLO: ..." y psql sale con código distinto de 0.
-- =============================================================================
\set ON_ERROR_STOP on
\set QUIET on
BEGIN;

-- Ejecutar como anon (lo que usará el frontend), no como superusuario.
-- Helpers de aserción en pg_temp.
CREATE FUNCTION pg_temp.ok(c boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF c IS NOT TRUE THEN RAISE EXCEPTION 'FALLO: %', msg; END IF;
  RAISE NOTICE 'ok  %', msg;
END $$;

CREATE FUNCTION pg_temp.debe_fallar(q text, patron text, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE q;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM ILIKE '%' || patron || '%' THEN
      RAISE NOTICE 'ok  % → "%"', msg, SQLERRM;
      RETURN;
    END IF;
    RAISE EXCEPTION 'FALLO: % — error inesperado: %', msg, SQLERRM;
  END;
  RAISE EXCEPTION 'FALLO: % — debía fallar y no falló', msg;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.ok(boolean, text), pg_temp.debe_fallar(text, text, text) TO anon;

INSERT INTO public.usuarios (username, password, role, display_name, deleted_at) VALUES
  ('t_admin', 'x', 'admin',     'Test Admin',  NULL),
  ('t_man1',  'x', 'manager',   'Test Man 1',  NULL),
  ('t_man2',  'x', 'manager',   'Test Man 2',  NULL),
  ('t_com1',  'x', 'comercial', 'Test Com 1',  NULL),
  ('t_com2',  'x', 'comercial', 'Test Com 2',  NULL),
  ('t_baja',  'x', 'comercial', 'Test Baja',   now());

CREATE TEMP TABLE ids (k text PRIMARY KEY, id uuid);
GRANT ALL ON ids TO anon;

SET LOCAL ROLE anon;

-- ── Identidad del actor ─────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('no_existe', 'x') $q$, 'no existe', 'actor inexistente no crea');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_baja', 'x') $q$, 'dado de baja', 'actor borrado no crea');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear(NULL, 'x') $q$, 'Falta el usuario', 'actor nulo no crea');

-- ── Crear ───────────────────────────────────────────────────────────────────
-- comercial: solo para sí mismo
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_com1', 'x', NULL, ARRAY['t_com2']) $q$,
  'solo puede crear tareas para sí mismo', 'comercial no crea para otro');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_com1', 'x', NULL, ARRAY['t_com1','t_com2']) $q$,
  'solo puede crear tareas para sí mismo', 'comercial no crea para sí y otro');
INSERT INTO ids SELECT 'personal_com1', id FROM public.tasks_crear('t_com1', '  Personal com1  ', NULL, NULL, 'low', NULL, NULL, current_date + 1, NULL);
INSERT INTO ids SELECT 'explicit_com1', id FROM public.tasks_crear('t_com1', 'Explícita', NULL, ARRAY['t_com1']);
SELECT pg_temp.ok((SELECT created_by = 't_com1' AND assignee = 't_com1' AND title = 'Personal com1' AND group_id IS NULL
                     FROM public.tasks WHERE id = (SELECT id FROM ids WHERE k='personal_com1')),
  'comercial crea tarea personal (título recortado, sin group_id)');

-- validaciones
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_man1', '   ') $q$, 'título es obligatorio', 'título vacío');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_man1', 'x', NULL, NULL, 'altisima') $q$, 'Prioridad no válida', 'prioridad inválida');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_man1', 'x', NULL, NULL, 'normal', NULL, '10:00') $q$, 'sin fecha planificada', 'hora planificada sin fecha');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_man1', 'x', NULL, ARRAY['t_baja']) $q$, 'dado de baja', 'responsable borrado');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_crear('t_man1', 'x', NULL, ARRAY['fantasma']) $q$, 'no existe', 'responsable inexistente');

-- manager: para otros; varios → una por persona con mismo group_id
INSERT INTO ids SELECT 'man1_com1', id FROM public.tasks_crear('t_man1', 'De man1 a com1', 'desc', ARRAY['t_com1'], 'high',
  current_date, '09:00', current_date + 2, '18:30');
CREATE TEMP TABLE grupo AS SELECT * FROM public.tasks_crear('t_man1', 'Grupo', NULL, ARRAY['t_com1','t_com2','t_com1']);
SELECT pg_temp.ok((SELECT count(*) = 2 AND count(DISTINCT group_id) = 1 AND bool_and(group_id IS NOT NULL) FROM grupo),
  'manager crea para varios: 2 tareas (sin duplicar), mismo group_id');
INSERT INTO ids SELECT 'man2_com2', id FROM public.tasks_crear('t_man2', 'De man2 a com2', NULL, ARRAY['t_com2']);
INSERT INTO ids SELECT 'admin_man1', id FROM public.tasks_crear('t_admin', 'De admin a man1', NULL, ARRAY['t_man1']);

-- eventos created
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type='created' AND actor='t_man1'
                      AND payload->>'assignee' = 't_com1'),
  'evento created registrado');

-- due_at: Europe/Madrid; sin hora = 23:59:59
SELECT pg_temp.ok((SELECT due_at = ((current_date + 2) + time '18:30') AT TIME ZONE 'Europe/Madrid'
                     FROM public.tasks WHERE id = (SELECT id FROM ids WHERE k='man1_com1')),
  'due_at con hora en Europe/Madrid');
SELECT pg_temp.ok((SELECT due_at = ((current_date + 1) + time '23:59:59') AT TIME ZONE 'Europe/Madrid'
                     FROM public.tasks WHERE id = (SELECT id FROM ids WHERE k='personal_com1')),
  'due_at sin hora = 23:59:59 Madrid');

-- ── Editar ──────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_com1', %L, '{"title":"hack"}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo el creador', 'responsable comercial no edita título de tarea del manager');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man2', %L, '{"title":"hack"}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo el creador', 'otro manager no edita');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man1', %L, '{"status":"completed"}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Campo no editable', 'clave no permitida en p_cambios');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man1', %L, '{"due_date":null}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'sin fecha de vencimiento', 'borrar due_date dejando due_time');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man1', %L, '{"due_date":"mañana"}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Formato de fecha', 'fecha con formato inválido');
SELECT pg_temp.ok((SELECT title = 'Editada' AND description IS NULL AND due_time IS NULL
                          AND due_at = ((current_date + 2) + time '23:59:59') AT TIME ZONE 'Europe/Madrid'
                     FROM public.tasks_editar('t_man1', (SELECT id FROM ids WHERE k='man1_com1'),
                                              '{"title":"Editada","description":null,"due_time":null}')),
  'creador edita título, borra descripción y hora (due_at recalculado)');
SELECT pg_temp.ok((SELECT payload->'changes' ? 'title' AND payload->'changes'->'title'->>'from' = 'De man1 a com1'
                          AND NOT (payload->'changes' ? 'priority')
                     FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type='updated'),
  'evento updated con changes {from,to} solo de lo cambiado');
SELECT pg_temp.ok((SELECT priority = 'urgent' FROM public.tasks_editar('t_admin', (SELECT id FROM ids WHERE k='man1_com1'), '{"priority":"urgent"}')),
  'admin edita tarea ajena');
SELECT pg_temp.ok((SELECT title = 'Personal editada' FROM public.tasks_editar('t_com1', (SELECT id FROM ids WHERE k='personal_com1'), '{"title":"Personal editada"}')),
  'comercial edita su tarea personal');

-- ── Cambiar estado / completed_at ──────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_cambiar_estado('t_com2', %L, 'completed') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo el creador, el responsable', 'ajeno no cambia estado');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_cambiar_estado('t_com1', %L, 'hecha') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Estado no válido', 'estado inválido');
SELECT pg_temp.ok((SELECT status = 'in_progress' AND completed_at IS NULL
                     FROM public.tasks_cambiar_estado('t_com1', (SELECT id FROM ids WHERE k='man1_com1'), 'in_progress')),
  'responsable comercial pasa a in_progress');
SELECT pg_temp.ok((SELECT status = 'completed' AND completed_at IS NOT NULL AND completed_by = 't_com1'
                     FROM public.tasks_cambiar_estado('t_com1', (SELECT id FROM ids WHERE k='man1_com1'), 'completed')),
  'completar fija completed_at y completed_by');
SELECT pg_temp.ok((SELECT status = 'pending' AND completed_at IS NULL AND completed_by IS NULL
                     FROM public.tasks_cambiar_estado('t_man1', (SELECT id FROM ids WHERE k='man1_com1'), 'pending')),
  'reabrir borra completed_at y completed_by');
SELECT pg_temp.ok((SELECT array_agg(type ORDER BY id) = ARRAY['status_changed','completed','reopened']
                     FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1')
                      AND type IN ('status_changed','completed','reopened')),
  'eventos status_changed → completed → reopened');
SELECT pg_temp.ok((SELECT payload = '{"from":"completed","to":"pending"}'::jsonb FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type='reopened'),
  'payload de reopened {from,to}');
SELECT pg_temp.ok((SELECT status = 'completed' FROM public.tasks_cambiar_estado('t_admin', (SELECT id FROM ids WHERE k='man2_com2'), 'completed')),
  'admin cambia estado de cualquier tarea');

-- ── Comentar ────────────────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT type = 'commented' AND payload->>'comment' = 'Hecho a medias' AND actor = 't_com1'
                     FROM public.tasks_comentar('t_com1', (SELECT id FROM ids WHERE k='man1_com1'), ' Hecho a medias ')),
  'responsable comercial comenta');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_comentar('t_com2', %L, 'hola') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'que no ves', 'quien no ve la tarea no comenta');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_comentar('t_man1', %L, '   ') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'vacío', 'comentario vacío');
SELECT pg_temp.ok((SELECT actor = 't_admin' FROM public.tasks_comentar('t_admin', (SELECT id FROM ids WHERE k='man1_com1'), 'Visto')),
  'admin comenta cualquier tarea');

-- ── Mover ───────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_mover('t_com1', %L, current_date + 5, NULL) $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo el creador', 'responsable no creador no mueve');
SELECT pg_temp.ok((SELECT planned_date = current_date + 5 AND planned_time = '11:15' AND due_date = current_date + 2
                     FROM public.tasks_mover('t_man1', (SELECT id FROM ids WHERE k='man1_com1'), current_date + 5, '11:15')),
  'creador mueve: cambia planned_*, no el deadline');
SELECT pg_temp.ok((SELECT payload->'from'->>'planned_time' = '09:00:00' AND payload->'to'->>'planned_time' = '11:15:00'
                     FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type='moved'),
  'evento moved con from/to');
SELECT pg_temp.ok((SELECT planned_date IS NULL AND planned_time IS NULL
                     FROM public.tasks_mover('t_com1', (SELECT id FROM ids WHERE k='personal_com1'), NULL, NULL)),
  'comercial mueve su tarea personal a "sin fecha"');

-- ── Reasignar ───────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_reasignar('t_man2', %L, 't_com2') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo un administrador, o el manager', 'manager no reasigna tarea de otro manager');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_reasignar('t_com1', %L, 't_com2') $q$, (SELECT id FROM ids WHERE k='personal_com1')),
  'Solo un administrador, o el manager', 'comercial no reasigna ni su propia tarea');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_reasignar('t_man1', %L, 't_baja') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'dado de baja', 'no se reasigna a usuario borrado');
SELECT pg_temp.ok((SELECT assignee = 't_com2' FROM public.tasks_reasignar('t_man1', (SELECT id FROM ids WHERE k='man1_com1'), 't_com2')),
  'manager creador reasigna');
SELECT pg_temp.ok((SELECT payload = '{"from":"t_com1","to":"t_com2"}'::jsonb FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type='reassigned'),
  'evento reassigned {from,to}');
SELECT pg_temp.ok((SELECT assignee = 't_com1' FROM public.tasks_reasignar('t_admin', (SELECT id FROM ids WHERE k='man2_com2'), 't_com1')),
  'admin reasigna tarea de otro');

-- ── Archivar ────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_archivar('t_com2', %L, true) $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'Solo el creador', 'responsable no creador no archiva');
SELECT pg_temp.ok((SELECT archived_at IS NOT NULL FROM public.tasks_archivar('t_man1', (SELECT id FROM ids WHERE k='man1_com1'), true)),
  'creador archiva');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_cambiar_estado('t_com2', %L, 'completed') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'archivada', 'tarea archivada no cambia de estado');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man1', %L, '{"title":"z"}') $q$, (SELECT id FROM ids WHERE k='man1_com1')),
  'archivada', 'tarea archivada no se edita');
SELECT pg_temp.ok((SELECT archived_at IS NULL FROM public.tasks_archivar('t_admin', (SELECT id FROM ids WHERE k='man1_com1'), false)),
  'admin desarchiva');
SELECT pg_temp.ok((SELECT array_agg(type ORDER BY id) = ARRAY['archived','unarchived'] FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='man1_com1') AND type IN ('archived','unarchived')),
  'eventos archived/unarchived');

-- ── Colores ─────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_set_color('t_man1', 't_com1', '#123456') $q$, 'Solo un administrador', 'manager no cambia colores');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_set_color('t_admin', 't_com1', 'rojo') $q$, 'Color no válido', 'color inválido');
SELECT pg_temp.ok((SELECT color = '#123456' FROM public.tasks_set_color('t_admin', 't_com1', '#123456')), 'admin fija color');
SELECT pg_temp.ok((SELECT color = '#abcdef' FROM public.tasks_set_color('t_admin', 't_com1', '#abcdef')), 'admin cambia color (upsert)');
SELECT pg_temp.ok((SELECT color IS NULL FROM public.tasks_set_color('t_admin', 't_com1', NULL)), 'admin vuelve a color automático');

-- ── Varios ──────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_cambiar_estado('t_admin', gen_random_uuid(), 'completed') $q$, 'no existe', 'tarea inexistente');
SELECT pg_temp.debe_fallar($q$ SELECT public._tasks_rol_actor('t_admin') $q$, 'permission denied', 'helpers internos no ejecutables por anon');
SELECT pg_temp.ok((SELECT activas >= 1 FROM public.tasks_contador('t_com1')), 'tasks_contador responde');
SELECT pg_temp.ok((SELECT count(*) > 0 FROM public.tasks WHERE assignee LIKE 't\_%'), 'anon puede leer tasks (SELECT directo)');
SELECT pg_temp.ok((SELECT count(*) > 0 FROM public.task_events WHERE actor LIKE 't\_%'), 'anon puede leer task_events');

-- ── Compartir ───────────────────────────────────────────────────────────────
INSERT INTO ids SELECT 'sh', id FROM public.tasks_crear('t_man1', 'Compartible', NULL, ARRAY['t_com1']);
SELECT pg_temp.ok((SELECT shared_with = '{}' AND deleted_at IS NULL FROM public.tasks WHERE id = (SELECT id FROM ids WHERE k='sh')),
  'tarea nueva: shared_with vacío y sin deleted_at');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_compartir('t_com2', %L, ARRAY['t_com2']) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador, el responsable', 'ajeno no comparte');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_compartir('t_man1', %L, ARRAY['t_com1']) $q$, (SELECT id FROM ids WHERE k='sh')),
  'ya es el responsable', 'no se comparte con el responsable');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_compartir('t_man1', %L, ARRAY['t_baja']) $q$, (SELECT id FROM ids WHERE k='sh')),
  'dado de baja', 'no se comparte con usuario de baja');
SELECT pg_temp.ok((SELECT shared_with = ARRAY['t_com2','t_man2']
                     FROM public.tasks_compartir('t_com1', (SELECT id FROM ids WHERE k='sh'), ARRAY['t_man2',' t_com2 ','t_man2'])),
  'responsable comparte (lista normalizada, sin duplicados)');
SELECT pg_temp.ok((SELECT payload = '{"added":["t_com2","t_man2"],"removed":[]}'::jsonb FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='sh') AND type='shared'),
  'evento shared con la lista añadida');
SELECT public.tasks_compartir('t_man1', (SELECT id FROM ids WHERE k='sh'), ARRAY['t_man2','t_com2']);
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='sh') AND type='shared'),
  'compartir con la misma lista no registra evento');
-- compartido: estado y comentarios sí; editar, reasignar, compartir, borrar, mover y archivar no
SELECT pg_temp.ok((SELECT status = 'in_progress' FROM public.tasks_cambiar_estado('t_com2', (SELECT id FROM ids WHERE k='sh'), 'in_progress')),
  'compartido cambia el estado');
SELECT pg_temp.ok((SELECT actor = 't_com2' FROM public.tasks_comentar('t_com2', (SELECT id FROM ids WHERE k='sh'), 'Lo miro yo')),
  'compartido comenta');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_com2', %L, '{"title":"z"}') $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'compartido no edita');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_reasignar('t_man2', %L, 't_com2') $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo un administrador, o el manager', 'compartido (manager) no reasigna');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_compartir('t_com2', %L, '{}') $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador, el responsable', 'compartido no comparte');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_borrar('t_com2', %L) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'compartido no borra');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_mover('t_com2', %L, current_date, NULL) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'compartido no mueve');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_archivar('t_com2', %L, true) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'compartido no archiva');
SELECT pg_temp.ok((SELECT activas >= 1 FROM public.tasks_contador('t_man2')), 'tasks_contador cuenta las compartidas');
SELECT pg_temp.ok((SELECT shared_with = ARRAY['t_man2']
                     FROM public.tasks_compartir('t_admin', (SELECT id FROM ids WHERE k='sh'), ARRAY['t_man2'])),
  'admin quita a un compartido');
SELECT pg_temp.ok((SELECT payload = '{"added":[],"removed":["t_com2"]}'::jsonb FROM public.task_events
                    WHERE task_id = (SELECT id FROM ids WHERE k='sh') AND type='shared' ORDER BY id DESC LIMIT 1),
  'evento shared con la lista quitada');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_cambiar_estado('t_com2', %L, 'pending') $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador, el responsable', 'quitado de la lista ya no cambia el estado');

-- ── Borrar ──────────────────────────────────────────────────────────────────
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_borrar('t_com1', %L) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'responsable que no la creó no borra');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_borrar('t_man2', %L) $q$, (SELECT id FROM ids WHERE k='sh')),
  'Solo el creador', 'otro manager (compartido) no borra');
SELECT pg_temp.ok((SELECT deleted_at IS NOT NULL FROM public.tasks_borrar('t_man1', (SELECT id FROM ids WHERE k='sh'))),
  'creador borra (deleted_at)');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='sh') AND type='deleted' AND actor='t_man1'),
  'evento deleted');
SELECT pg_temp.ok((SELECT deleted_at IS NOT NULL FROM public.tasks_borrar('t_admin', (SELECT id FROM ids WHERE k='sh'))),
  'borrar de nuevo no falla');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.task_events WHERE task_id = (SELECT id FROM ids WHERE k='sh') AND type='deleted'),
  'borrar de nuevo no duplica el evento');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_cambiar_estado('t_com1', %L, 'completed') $q$, (SELECT id FROM ids WHERE k='sh')),
  'ha sido borrada', 'borrada no cambia de estado');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_editar('t_man1', %L, '{"title":"z"}') $q$, (SELECT id FROM ids WHERE k='sh')),
  'ha sido borrada', 'borrada no se edita');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_comentar('t_man1', %L, 'hola') $q$, (SELECT id FROM ids WHERE k='sh')),
  'ha sido borrada', 'borrada no se comenta');
SELECT pg_temp.debe_fallar(format($q$ SELECT public.tasks_compartir('t_man1', %L, '{}') $q$, (SELECT id FROM ids WHERE k='sh')),
  'ha sido borrada', 'borrada no se comparte');
SELECT pg_temp.ok((SELECT activas = 0 FROM public.tasks_contador('t_man2')), 'tasks_contador no cuenta borradas');
SELECT pg_temp.ok((SELECT deleted_at IS NOT NULL FROM public.tasks_borrar('t_admin', (SELECT id FROM ids WHERE k='man2_com2'))),
  'admin borra tarea ajena');
SELECT pg_temp.ok((SELECT deleted_at IS NOT NULL FROM public.tasks_borrar('t_com1', (SELECT id FROM ids WHERE k='personal_com1'))),
  'comercial borra su tarea personal');
SELECT pg_temp.debe_fallar($q$ SELECT public.tasks_borrar('t_admin', gen_random_uuid()) $q$, 'no existe', 'borrar tarea inexistente');

RESET ROLE;
-- Sin borrados físicos desde RPC: todas las tareas de prueba siguen ahí.
SELECT pg_temp.ok((SELECT count(*) = 8 FROM public.tasks WHERE created_by LIKE 't\_%'), 'ninguna tarea borrada físicamente (8 creadas, 3 con borrado lógico)');

\echo '==> TODAS LAS PRUEBAS DE tasks_permisos.sql HAN PASADO'
ROLLBACK;
