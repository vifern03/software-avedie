-- =============================================================================
--  SEED FICTICIO — SOLO SUPABASE LOCAL (lo ejecuta `npx supabase db reset`).
--  Ningún dato real. Contraseñas en el formato de verificar_login: sha256 hex.
--    admin      / admin1234
--    manager1, manager2, comercial1, comercial2, comercial3 / prueba1234
--  Las fechas de las tareas son relativas a now() (Europe/Madrid), así siempre
--  hay vencidas, próximas 24 h, sin fecha, completadas y archivadas.
-- =============================================================================

-- ── Usuarios ────────────────────────────────────────────────────────────────
INSERT INTO public.usuarios (username, password, role, display_name, is_undeletable, security_pin, equipo) VALUES
  ('admin',      encode(extensions.digest('admin1234',  'sha256'), 'hex'), 'admin',     'Laura Prieto Alonso',  true,  NULL, 'Palencia'),
  ('manager1',   encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'manager',   'Marta Gil Ortega',     false, NULL, 'Palencia'),
  ('manager2',   encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'manager',   'Javier Rueda Sanz',    false, NULL, 'Palencia'),
  ('comercial1', encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'comercial', 'Lucía Martín Calvo',   false, NULL, 'Palencia'),
  ('comercial2', encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'comercial', 'Pablo Herrero Díaz',   false, NULL, 'Palencia'),
  ('comercial3', encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'comercial', 'Sara Núñez Velasco',   false, NULL, 'Palencia');

-- Usuario dado de baja (para probar que no puede actuar ni recibir tareas).
INSERT INTO public.usuarios (username, password, role, display_name, equipo, deleted_at) VALUES
  ('comercial_baja', encode(extensions.digest('prueba1234', 'sha256'), 'hex'), 'comercial', 'Diego Baja Ficticio', 'Palencia', now());

-- src/lib/initDB.js inserta al admin protegido "Victor" (con su contraseña real)
-- si no encuentra ese username. Fila marcadora dada de baja, con contraseña
-- aleatoria, para que el arranque local NO meta credenciales reales en la BD.
INSERT INTO public.usuarios (username, password, role, display_name, equipo, deleted_at) VALUES
  ('Victor', encode(extensions.digest(gen_random_uuid()::text, 'sha256'), 'hex'), 'admin', 'Marcador local (no usar)', 'Palencia', now());

-- ── Configuración mínima que lee el arranque (AuthContext / initDB) ────────
INSERT INTO public.configuracion (clave, valor) VALUES
  ('permissions', '{
     "admin":     {"dashboard":true, "historica":true, "radar":true, "b2c":true,"b2b":true,"historial":true, "visitas":true,"visitas_pymes":true,"fichajes":true,"reportes":true,"tasks":true},
     "manager":   {"dashboard":false,"historica":false,"radar":true, "b2c":true,"b2b":true,"historial":false,"visitas":true,"visitas_pymes":true,"fichajes":true,"reportes":true,"tasks":true},
     "comercial": {"dashboard":false,"historica":false,"radar":false,"b2c":true,"b2b":true,"historial":false,"visitas":true,"visitas_pymes":true,"fichajes":true,"reportes":true,"tasks":true}
   }'::jsonb),
  ('pin',                  '"0000"'::jsonb),
  ('user_permissions',     '{}'::jsonb),
  ('telemarketing_calles', '{}'::jsonb),
  ('prescriptor_links',    '"{}"'::jsonb);

-- Buckets de Storage que usa la app (vacíos).
INSERT INTO storage.buckets (id, name, public) VALUES
  ('pymes-fotos', 'pymes-fotos', true),
  ('visitas-dni', 'visitas-dni', true)
ON CONFLICT (id) DO NOTHING;

-- ── Tareas (vía las propias RPC, así los eventos son coherentes) ───────────
DO $$
DECLARE
  d   date := (now() AT TIME ZONE 'Europe/Madrid')::date;            -- hoy en Madrid
  p12 timestamp := (now() + interval '12 hours') AT TIME ZONE 'Europe/Madrid';
  p20 timestamp := (now() + interval '20 hours') AT TIME ZONE 'Europe/Madrid';
  t   public.tasks;
BEGIN
  -- manager1 → comerciales
  SELECT * INTO t FROM public.tasks_crear('manager1', 'Llamar a cliente para renovar tarifa',
    'El contrato vence este mes; ofrecer Conecta Luz.', ARRAY['comercial1'], 'high',
    NULL, NULL, d - 2, NULL);                                                     -- vencida
  PERFORM public.tasks_comentar('comercial1', t.id, 'No contesta, lo intento mañana por la mañana.');

  SELECT * INTO t FROM public.tasks_crear('manager1', 'Enviar comparativa a la panadería',
    NULL, ARRAY['comercial2'], 'urgent', NULL, NULL, d - 1, time '10:00');         -- vencida
  PERFORM public.tasks_cambiar_estado('comercial2', t.id, 'in_progress');

  PERFORM public.tasks_crear('manager1', 'Confirmar cita con la gestoría',
    'Llevar la última factura impresa.', ARRAY['comercial1'], 'normal',
    p12::date, p12::time(0), p12::date, p12::time(0));                           -- vence en ~12 h

  PERFORM public.tasks_crear('manager1', 'Formación nuevas tarifas de octubre',
    'Sesión conjunta en la oficina de Palencia.', ARRAY['comercial1','comercial2','comercial3'], 'normal',
    d + 2, time '10:00', d + 3, NULL);                                            -- grupo múltiple

  SELECT * INTO t FROM public.tasks_crear('manager1', 'Llamar a la lista de telemarketing',
    NULL, ARRAY['comercial3'], 'normal', d, time '16:00', NULL, NULL);
  PERFORM public.tasks_cambiar_estado('comercial3', t.id, 'in_progress');

  SELECT * INTO t FROM public.tasks_crear('manager1', 'Revisar alta de comunidad de vecinos',
    NULL, ARRAY['comercial2'], 'high', NULL, NULL, d + 4, NULL);
  PERFORM public.tasks_cambiar_estado('comercial2', t.id, 'completed');
  PERFORM public.tasks_cambiar_estado('comercial2', t.id, 'pending');             -- reabierta
  PERFORM public.tasks_comentar('manager1', t.id, 'Falta el CIF, la reabro.');

  SELECT * INTO t FROM public.tasks_crear('manager1', 'Visitar bar de la plaza',
    NULL, ARRAY['comercial1'], 'low', d + 1, time '12:30', NULL, NULL);
  PERFORM public.tasks_reasignar('manager1', t.id, 'comercial3');                 -- reasignada

  -- manager2
  PERFORM public.tasks_crear('manager2', 'Revisar documentación pendiente de CUPS',
    NULL, ARRAY['comercial3'], 'high', NULL, NULL, p20::date, p20::time(0));      -- vence en ~20 h

  PERFORM public.tasks_crear('manager2', 'Preparar reunión semanal',
    'Orden del día y cifras de la semana.', NULL, 'normal', d + 1, time '09:00', NULL, NULL); -- personal

  SELECT * INTO t FROM public.tasks_crear('manager2', 'Tarea duplicada antigua',
    NULL, ARRAY['comercial1'], 'low', NULL, NULL, d - 10, NULL);
  PERFORM public.tasks_archivar('manager2', t.id, true);                          -- archivada

  -- comerciales (personales)
  PERFORM public.tasks_crear('comercial1', 'Recorrer zona Calle Mayor',
    NULL, NULL, 'normal', d, NULL, NULL, NULL);
  PERFORM public.tasks_crear('comercial1', 'Actualizar fichas de clientes',
    NULL, NULL, 'low', NULL, NULL, NULL, NULL);                                   -- sin fecha

  SELECT * INTO t FROM public.tasks_crear('comercial2', 'Pedir factura a la ferretería',
    NULL, NULL, 'normal', NULL, NULL, d - 3, NULL);
  PERFORM public.tasks_cambiar_estado('comercial2', t.id, 'completed');           -- completada

  SELECT * INTO t FROM public.tasks_crear('comercial2', 'Cerrar alta antigua',
    NULL, NULL, 'normal', NULL, NULL, d - 20, NULL);
  PERFORM public.tasks_cambiar_estado('comercial2', t.id, 'completed');
  PERFORM public.tasks_archivar('comercial2', t.id, true);                        -- completada + archivada

  SELECT * INTO t FROM public.tasks_crear('comercial3', 'Seguimiento visita pyme',
    'Esperando a que nos manden la factura de gas.', NULL, 'normal', NULL, NULL, d + 5, time '13:00');
  PERFORM public.tasks_cambiar_estado('comercial3', t.id, 'in_progress');
  PERFORM public.tasks_comentar('comercial3', t.id, 'Me dicen que la envían el lunes.');

  PERFORM public.tasks_crear('comercial3', 'Ordenar carpeta de contratos',
    NULL, NULL, 'low', NULL, NULL, NULL, NULL);                                   -- sin fecha

  -- admin
  PERFORM public.tasks_crear('admin', 'Informe mensual de ventas',
    NULL, ARRAY['manager1'], 'high', NULL, NULL, d + 7, NULL);
  PERFORM public.tasks_crear('admin', 'Revisar objetivos del trimestre',
    NULL, ARRAY['manager2'], 'urgent', NULL, NULL, d - 1, NULL);                  -- vencida
  PERFORM public.tasks_crear('admin', 'Planificar campaña de invierno',
    NULL, ARRAY['manager1','manager2'], 'normal', d + 8, NULL, d + 10, NULL);     -- grupo múltiple
  SELECT * INTO t FROM public.tasks_crear('admin', 'Revisar permisos de usuarios',
    NULL, NULL, 'normal', NULL, NULL, d - 5, NULL);
  PERFORM public.tasks_cambiar_estado('admin', t.id, 'completed');

  -- Colores fijados por admin (el resto, automático en frontend)
  PERFORM public.tasks_set_color('admin', 'comercial1', '#1a73e8');
  PERFORM public.tasks_set_color('admin', 'manager1',   '#e37400');
END $$;
