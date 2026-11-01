-- =============================================================================
--  Documentación B2B: distribuidoras, tarifas versionadas y expedientes.
--  SOLO AÑADE: tablas, funciones y buckets nuevos. No modifica ningún objeto ni
--  ninguna fila existente (actividades recibe filas nuevas al usar las RPC).
--  Falla (y no hace nada) si ya existe alguna tabla con estos nombres o un bucket público.
--  Rollback: supabase/rollback/20261031000000_documentacion_b2b_down.sql
-- =============================================================================

-- ── Tablas ──────────────────────────────────────────────────────────────────
CREATE TABLE public.distribuidoras_electricidad (
  prefijo_cups    text PRIMARY KEY CHECK (prefijo_cups ~ '^\d{4}(\d{2})?$'),
  nombre_oficial  text,
  nombre_mostrar  text NOT NULL,
  estado          text NOT NULL CHECK (estado IN ('ACTIVA','BAJA','NO_OFICIAL')),
  codigo_endesa   text,
  texto_endesa    text,
  fuente          text NOT NULL,
  verificado      boolean NOT NULL DEFAULT false,
  notas           text,
  actualizado_por text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tarifas_versiones (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarifa_id    text NOT NULL,
  version      int  NOT NULL,
  valores      jsonb NOT NULL,
  valida_desde date NOT NULL,
  valida_hasta date NOT NULL,
  pdf_path     text,
  pdf_sha256   text,
  cambios      jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_por   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  activa       boolean NOT NULL DEFAULT true,
  UNIQUE (tarifa_id, version),
  CHECK (valida_hasta >= valida_desde)
);
CREATE UNIQUE INDEX tarifas_versiones_activa_uniq ON public.tarifas_versiones (tarifa_id) WHERE activa;

CREATE TABLE public.documentacion_b2b (
  id                uuid PRIMARY KEY,
  cif               text NOT NULL,
  titular           text NOT NULL,
  producto          text NOT NULL,
  tarifa_acceso     text NOT NULL,
  modalidad         text NOT NULL CHECK (modalidad IN ('plana','dia','laboral','finde','noche')),
  cliente_ids       bigint[] NOT NULL,
  num_suministros   int NOT NULL CHECK (num_suministros BETWEEN 1 AND 3),
  tarifa_version_id uuid REFERENCES public.tarifas_versiones(id),
  estado            text NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa','borrada')),
  version_actual    int NOT NULL DEFAULT 1,
  generado_por      text NOT NULL,
  generado_at       timestamptz NOT NULL DEFAULT now(),
  borrado_por       text,
  borrado_at        timestamptz,
  compartido_con    text[] NOT NULL DEFAULT '{}'::text[]   -- usernames (identificador estable)
);
CREATE INDEX documentacion_b2b_generado_por_idx ON public.documentacion_b2b (generado_por);
CREATE INDEX documentacion_b2b_compartido_idx ON public.documentacion_b2b USING gin (compartido_con);

CREATE TABLE public.documentacion_b2b_cups (
  documentacion_id uuid NOT NULL REFERENCES public.documentacion_b2b(id) ON DELETE CASCADE,
  cups             text NOT NULL,
  activa           boolean NOT NULL DEFAULT true,
  PRIMARY KEY (documentacion_id, cups)
);
-- Un CUPS no puede estar en dos documentaciones activas.
CREATE UNIQUE INDEX documentacion_b2b_cups_activa_uniq ON public.documentacion_b2b_cups (cups) WHERE activa;

CREATE TABLE public.documentacion_b2b_versiones (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documentacion_id uuid NOT NULL REFERENCES public.documentacion_b2b(id) ON DELETE CASCADE,
  version          int NOT NULL,
  datos            jsonb NOT NULL,
  avisos           jsonb NOT NULL DEFAULT '{}'::jsonb,
  editados         jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentos       jsonb NOT NULL,
  completa         boolean NOT NULL DEFAULT false,  -- sin obligatorios vacíos
  creado_por       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documentacion_id, version)
);

-- Sesiones propias de esta sección. El CRM no tiene token de sesión que el servidor
-- pueda comprobar (p_actor por sí solo no es una identidad verificada) y estos datos
-- llevan DNI e IBAN. Solo se guarda el hash del token.
CREATE TABLE public.doc_b2b_sesiones (
  token_hash text PRIMARY KEY,
  username   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expira_at  timestamptz NOT NULL
);
CREATE INDEX doc_b2b_sesiones_username_idx ON public.doc_b2b_sesiones (username);

-- ── Acceso a las tablas ─────────────────────────────────────────────────────
-- Expedientes y sesiones: sin acceso directo, solo por RPC.
ALTER TABLE public.distribuidoras_electricidad ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tarifas_versiones           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacion_b2b           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacion_b2b_cups      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentacion_b2b_versiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doc_b2b_sesiones            ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.distribuidoras_electricidad, public.tarifas_versiones, public.documentacion_b2b,
              public.documentacion_b2b_cups, public.documentacion_b2b_versiones, public.doc_b2b_sesiones
  FROM PUBLIC, anon, authenticated;

-- Distribuidoras (dato público de la CNMC) y precios: solo lectura para la app.
GRANT SELECT ON public.distribuidoras_electricidad, public.tarifas_versiones TO anon, authenticated;
CREATE POLICY lectura ON public.distribuidoras_electricidad FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY lectura ON public.tarifas_versiones           FOR SELECT TO anon, authenticated USING (true);

-- ── Buckets privados (sin políticas: solo la Edge Function con clave de servicio) ─
DO $$
BEGIN
  -- Un rollback conserva los buckets (Supabase no deja borrarlos por SQL): se aceptan
  -- si ya existen y son privados; uno público aborta la migración.
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('plantillas-contratos','tarifas-pdf','documentacion-b2b') AND public) THEN
    RAISE EXCEPTION 'Existe un bucket público con el nombre de uno privado: revisar antes de continuar.';
  END IF;
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
    ('plantillas-contratos', 'plantillas-contratos', false, 10485760, ARRAY['application/pdf']),
    ('tarifas-pdf',          'tarifas-pdf',          false, 10485760, ARRAY['application/pdf']),
    ('documentacion-b2b',    'documentacion-b2b',    false, 10485760, ARRAY['application/pdf'])
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ── Sesión ──────────────────────────────────────────────────────────────────
-- La contraseña la comprueba verificar_login, la misma función que el login del CRM.
CREATE FUNCTION public.doc_b2b_abrir_sesion(p_username text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user  text;
  v_token text;
  v_exp   timestamptz := now() + interval '7 days';
BEGIN
  SELECT l.username INTO v_user FROM public.verificar_login(p_username, p_password) AS l LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuario o contraseña incorrectos.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.doc_b2b_sesiones WHERE expira_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.doc_b2b_sesiones (token_hash, username, expira_at)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_user, v_exp);
  RETURN jsonb_build_object('token', v_token, 'expira_at', v_exp);
END;
$$;

CREATE FUNCTION public.doc_b2b_cerrar_sesion(p_token text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.doc_b2b_sesiones WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

-- ── Helpers internos ────────────────────────────────────────────────────────
-- Mismo criterio que hasAccess() de AuthContext.
CREATE FUNCTION public._doc_b2b_tiene_seccion(p_username text, p_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v jsonb;
BEGIN
  IF p_role = 'admin' THEN RETURN true; END IF;
  SELECT valor -> p_username -> 'documentacion_b2b' INTO v FROM public.configuracion WHERE clave = 'user_permissions';
  IF v IS NOT NULL AND v <> 'null'::jsonb THEN RETURN v = 'true'::jsonb; END IF;
  SELECT valor -> p_role -> 'documentacion_b2b' INTO v FROM public.configuracion WHERE clave = 'permissions';
  IF v IS NOT NULL AND v <> 'null'::jsonb THEN RETURN v = 'true'::jsonb; END IF;
  RETURN p_role = 'manager';
END;
$$;

-- Devuelve el rol del actor o lanza error. El prefijo SESION_DOC_B2B lo usa el frontend
-- para volver a pedir la contraseña.
CREATE FUNCTION public._doc_b2b_actor(p_actor text, p_token text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text;
BEGIN
  SELECT u.role INTO v_role
    FROM public.doc_b2b_sesiones s
    JOIN public.usuarios u ON u.username = s.username
   WHERE s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     AND s.username = p_actor
     AND s.expira_at > now()
     AND u.deleted_at IS NULL;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'SESION_DOC_B2B: identifícate de nuevo para continuar.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public._doc_b2b_tiene_seccion(p_actor, v_role) THEN
    RAISE EXCEPTION 'No tienes acceso a Documentación B2B.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_role;
END;
$$;

-- Mismos contratos que carga DataContext para ese usuario.
CREATE FUNCTION public._doc_b2b_ve_cliente(p_username text, p_role text, p_cliente bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c        record;
  v_equipo text;
  v_nombre text;
  v_links  jsonb;
  v_raw    jsonb;
  v_names  text[];
BEGIN
  IF p_role IN ('admin','manager') THEN RETURN true; END IF;
  SELECT equipo, comercial, creado_por, vendido_por, compartido_con INTO c
    FROM public.clientes WHERE id = p_cliente AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT coalesce(u.equipo, 'Ambos'), trim(coalesce(u.display_name, u.username)) INTO v_equipo, v_nombre
    FROM public.usuarios u WHERE u.username = p_username;

  IF v_equipo NOT IN ('Ambos','Ninguno') AND c.equipo = v_equipo THEN RETURN true; END IF;
  IF v_equipo = 'Ambos' THEN RETURN true; END IF;
  IF p_username IN (c.comercial, c.creado_por) THEN RETURN true; END IF;
  IF v_nombre = ANY (coalesce(c.compartido_con, '{}')) THEN RETURN true; END IF;

  -- prescriptor_links se guarda como texto JSON dentro del jsonb
  SELECT valor INTO v_raw FROM public.configuracion WHERE clave = 'prescriptor_links';
  BEGIN
    v_links := CASE WHEN jsonb_typeof(v_raw) = 'string' THEN (v_raw #>> '{}')::jsonb ELSE v_raw END;
  EXCEPTION WHEN OTHERS THEN
    v_links := NULL;
  END;
  SELECT coalesce(array_agg(key), '{}') INTO v_names
    FROM jsonb_each_text(coalesce(v_links, '{}'::jsonb)) WHERE value = p_username;
  v_names := v_names || v_nombre;
  RETURN coalesce(c.vendido_por = ANY (v_names), false) OR coalesce(c.creado_por = ANY (v_names), false);
END;
$$;

CREATE FUNCTION public._doc_b2b_puede_ver(p_actor text, p_role text, d public.documentacion_b2b)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_role IN ('admin','manager') OR d.generado_por = p_actor OR p_actor = ANY (d.compartido_con);
$$;

CREATE FUNCTION public._doc_b2b_puede_editar(p_actor text, p_role text, d public.documentacion_b2b)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_role IN ('admin','manager') OR d.generado_por = p_actor;
$$;

CREATE FUNCTION public._doc_b2b_actividad(p_descripcion text, p_actor text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.actividades (id, tipo, descripcion, comercial, fecha, hora)
  VALUES (
    (extract(epoch FROM clock_timestamp()) * 1000)::bigint + floor(random() * 1000)::bigint,
    'Documentación B2B', p_descripcion, p_actor,
    to_char(now() AT TIME ZONE 'Europe/Madrid', 'YYYY-MM-DD'),
    to_char(now() AT TIME ZONE 'Europe/Madrid', 'HH24:MI')
  );
$$;

-- Comprueba que los documentos corresponden a esa versión y que están subidos.
CREATE FUNCTION public._doc_b2b_validar_documentos(p_id uuid, p_version int, p_num int, p_docs jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       jsonb;
  v_tipos text[] := '{}';
BEGIN
  IF jsonb_typeof(p_docs) <> 'array' THEN
    RAISE EXCEPTION 'Lista de documentos no válida.' USING ERRCODE = 'P0001';
  END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_docs) LOOP
    IF d->>'tipo' NOT IN ('contrato','anexo_precios','anexo_puntos')
       OR d->>'path' <> format('%s/v%s/%s.pdf', p_id, p_version, d->>'tipo')
       OR coalesce(d->>'sha256', '') !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'Documento no válido: %', d->>'path' USING ERRCODE = 'P0001';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'documentacion-b2b' AND o.name = d->>'path') THEN
      RAISE EXCEPTION 'El documento % no se ha subido.', d->>'tipo' USING ERRCODE = 'P0001';
    END IF;
    v_tipos := v_tipos || (d->>'tipo');
  END LOOP;
  IF NOT v_tipos @> ARRAY['contrato','anexo_precios']
     OR ('anexo_puntos' = ANY (v_tipos)) <> (p_num >= 2)
     OR cardinality(v_tipos) <> (CASE WHEN p_num >= 2 THEN 3 ELSE 2 END) THEN
    RAISE EXCEPTION 'Faltan documentos o sobran para % suministro(s).', p_num USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ── RPC: crear ──────────────────────────────────────────────────────────────
-- Titular, CIF, tarifa y CUPS se toman de clientes, no de lo que envíe el navegador.
CREATE FUNCTION public.doc_b2b_crear(
  p_actor text, p_token text, p_id uuid, p_cliente_ids bigint[], p_producto text, p_modalidad text,
  p_tarifa_version_id uuid, p_datos jsonb, p_avisos jsonb, p_documentos jsonb, p_completa boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role   text := public._doc_b2b_actor(p_actor, p_token);
  v_n      int  := coalesce(cardinality(p_cliente_ids), 0);
  v_filas  int;
  v_cifs   int;
  v_tarifa text;
  v_tarifas int;
  v_titular text;
  v_cif    text;
  v_cups   text[];
  v_id     bigint;
BEGIN
  IF v_n < 1 OR v_n > 3 THEN
    RAISE EXCEPTION 'Selecciona de 1 a 3 CUPS.' USING ERRCODE = 'P0001';
  END IF;
  FOREACH v_id IN ARRAY p_cliente_ids LOOP
    IF NOT public._doc_b2b_ve_cliente(p_actor, v_role, v_id) THEN
      RAISE EXCEPTION 'No tienes acceso a uno de los contratos seleccionados.' USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  SELECT count(*), count(DISTINCT upper(trim(cif_dni))), count(DISTINCT tarifa), min(tarifa),
         min(nombre), min(upper(trim(cif_dni))), array_agg(upper(trim(cups)) ORDER BY id)
    INTO v_filas, v_cifs, v_tarifas, v_tarifa, v_titular, v_cif, v_cups
    FROM public.clientes
   WHERE id = ANY (p_cliente_ids) AND deleted_at IS NULL AND tipo IN ('B2B','CUR_B2B')
     AND tarifa IN ('3.0TD','6.1TD') AND lower(coalesce(id_producto, '')) LIKE '%open%';

  IF v_filas <> v_n THEN
    RAISE EXCEPTION 'Hay contratos no disponibles: solo Alta B2B con producto Open 3.0TD o 6.1TD.' USING ERRCODE = 'P0001';
  END IF;
  IF v_cifs <> 1 THEN
    RAISE EXCEPTION 'Todos los CUPS deben ser del mismo CIF.' USING ERRCODE = 'P0001';
  END IF;
  IF v_tarifas <> 1 THEN
    RAISE EXCEPTION 'Todos los CUPS deben tener la misma tarifa de acceso.' USING ERRCODE = 'P0001';
  END IF;
  IF (SELECT count(DISTINCT c) FROM unnest(v_cups) c) <> v_n THEN
    RAISE EXCEPTION 'Hay CUPS repetidos en la selección.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.documentacion_b2b_cups WHERE cups = ANY (v_cups) AND activa) THEN
    RAISE EXCEPTION 'Alguno de los CUPS ya tiene documentación activa.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public._doc_b2b_validar_documentos(p_id, 1, v_n, p_documentos);

  INSERT INTO public.documentacion_b2b (id, cif, titular, producto, tarifa_acceso, modalidad, cliente_ids,
    num_suministros, tarifa_version_id, generado_por)
  VALUES (p_id, v_cif, v_titular, p_producto, v_tarifa, p_modalidad, p_cliente_ids, v_n, p_tarifa_version_id, p_actor);

  INSERT INTO public.documentacion_b2b_cups (documentacion_id, cups)
  SELECT p_id, c FROM unnest(v_cups) AS c;

  INSERT INTO public.documentacion_b2b_versiones (documentacion_id, version, datos, avisos, documentos, completa, creado_por)
  VALUES (p_id, 1, coalesce(p_datos, '{}'), coalesce(p_avisos, '{}'), p_documentos, coalesce(p_completa, false), p_actor);

  PERFORM public._doc_b2b_actividad(format('Documentación generada para %s (%s CUPS)', v_titular, v_n), p_actor);
  RETURN p_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'Alguno de los CUPS ya tiene documentación activa.' USING ERRCODE = 'P0001';
END;
$$;

-- ── RPC: nueva versión ──────────────────────────────────────────────────────
CREATE FUNCTION public.doc_b2b_nueva_version(
  p_actor text, p_token text, p_id uuid, p_version_base int, p_modalidad text,
  p_tarifa_version_id uuid, p_datos jsonb, p_avisos jsonb, p_editados jsonb, p_documentos jsonb, p_completa boolean
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
  v_new  int;
BEGIN
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La documentación no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public._doc_b2b_puede_editar(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'Solo quien la generó, un manager o un administrador puede editarla.' USING ERRCODE = 'P0001';
  END IF;
  IF d.estado <> 'activa' THEN
    RAISE EXCEPTION 'La documentación está borrada.' USING ERRCODE = 'P0001';
  END IF;
  IF d.version_actual <> p_version_base THEN
    RAISE EXCEPTION 'Otra persona ha guardado una versión más reciente. Vuelve a abrirla.' USING ERRCODE = 'P0001';
  END IF;
  v_new := d.version_actual + 1;
  PERFORM public._doc_b2b_validar_documentos(p_id, v_new, d.num_suministros, p_documentos);

  INSERT INTO public.documentacion_b2b_versiones (documentacion_id, version, datos, avisos, editados, documentos, completa, creado_por)
  VALUES (p_id, v_new, coalesce(p_datos, '{}'), coalesce(p_avisos, '{}'), coalesce(p_editados, '{}'), p_documentos, coalesce(p_completa, false), p_actor);

  UPDATE public.documentacion_b2b
     SET version_actual = v_new, modalidad = coalesce(p_modalidad, modalidad),
         tarifa_version_id = coalesce(p_tarifa_version_id, tarifa_version_id)
   WHERE id = p_id;

  PERFORM public._doc_b2b_actividad(format('Documentación de %s editada (versión %s)', d.titular, v_new), p_actor);
  RETURN v_new;
END;
$$;

-- ── RPC: borrar (lógico; libera los CUPS) ───────────────────────────────────
CREATE FUNCTION public.doc_b2b_borrar(p_actor text, p_token text, p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
BEGIN
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La documentación no existe.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT public._doc_b2b_puede_editar(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'Solo quien la generó, un manager o un administrador puede borrarla.' USING ERRCODE = 'P0001';
  END IF;
  IF d.estado = 'borrada' THEN RETURN; END IF;

  UPDATE public.documentacion_b2b SET estado = 'borrada', borrado_por = p_actor, borrado_at = now() WHERE id = p_id;
  UPDATE public.documentacion_b2b_cups SET activa = false WHERE documentacion_id = p_id;
  PERFORM public._doc_b2b_actividad(format('Documentación de %s borrada', d.titular), p_actor);
END;
$$;

-- ── RPC: compartir (lista final de usernames) ───────────────────────────────
CREATE FUNCTION public.doc_b2b_compartir(p_actor text, p_token text, p_id uuid, p_usuarios text[])
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := public._doc_b2b_actor(p_actor, p_token);
  d       public.documentacion_b2b;
  v_lista text[];
  v_who   text;
BEGIN
  IF v_role NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Solo un manager o un administrador puede compartir.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La documentación no existe.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(array_agg(DISTINCT trim(a)) FILTER (WHERE a IS NOT NULL AND trim(a) <> ''), '{}')
    INTO v_lista FROM unnest(coalesce(p_usuarios, '{}'::text[])) AS a;
  FOREACH v_who IN ARRAY v_lista LOOP
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE username = v_who AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'El usuario "%" no existe o está dado de baja.', v_who USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  UPDATE public.documentacion_b2b SET compartido_con = v_lista WHERE id = p_id;
  PERFORM public._doc_b2b_actividad(format('Documentación de %s compartida', d.titular), p_actor);
  RETURN v_lista;
END;
$$;

-- ── RPC: listar (mias | global) ─────────────────────────────────────────────
CREATE FUNCTION public.doc_b2b_listar(
  p_actor text, p_token text, p_modo text DEFAULT 'mias', p_busqueda text DEFAULT NULL,
  p_limite int DEFAULT 15, p_desde int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := public._doc_b2b_actor(p_actor, p_token);
  v_q     text := nullif(trim(coalesce(p_busqueda, '')), '');
  v_total int;
  v_filas jsonb;
BEGIN
  IF p_modo = 'global' AND v_role NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Solo un manager o un administrador ve la documentación global.' USING ERRCODE = 'P0001';
  END IF;

  WITH base AS (
    SELECT d.* FROM public.documentacion_b2b d
     WHERE (p_modo = 'global' OR d.generado_por = p_actor OR p_actor = ANY (d.compartido_con))
       AND (v_q IS NULL OR d.titular ILIKE '%' || v_q || '%' OR d.cif ILIKE '%' || v_q || '%'
            OR EXISTS (SELECT 1 FROM public.documentacion_b2b_cups c WHERE c.documentacion_id = d.id AND c.cups ILIKE '%' || v_q || '%'))
  ), pagina AS (
    SELECT * FROM base ORDER BY generado_at DESC LIMIT least(coalesce(p_limite, 15), 100) OFFSET greatest(coalesce(p_desde, 0), 0)
  )
  SELECT (SELECT count(*) FROM base),
         coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id, 'cif', p.cif, 'titular', p.titular, 'producto', p.producto, 'tarifa_acceso', p.tarifa_acceso,
           'modalidad', p.modalidad, 'num_suministros', p.num_suministros, 'estado', p.estado,
           'version_actual', p.version_actual, 'generado_por', p.generado_por, 'generado_at', p.generado_at,
           'generado_por_nombre', coalesce(ug.display_name, p.generado_por),
           'borrado_por', p.borrado_por, 'borrado_at', p.borrado_at,
           'borrado_por_nombre', coalesce(ub.display_name, p.borrado_por),
           'compartido_con', p.compartido_con,
           'cups', (SELECT coalesce(jsonb_agg(c.cups ORDER BY c.cups), '[]') FROM public.documentacion_b2b_cups c WHERE c.documentacion_id = p.id),
           'documentos', v.documentos, 'completa', v.completa,
           'puede_editar', p.estado = 'activa' AND public._doc_b2b_puede_editar(p_actor, v_role, p),
           'puede_borrar', p.estado = 'activa' AND public._doc_b2b_puede_editar(p_actor, v_role, p),
           'puede_compartir', v_role IN ('admin','manager'),
           'puede_descargar', v.completa AND (p.estado = 'activa' OR v_role IN ('admin','manager'))
         ) ORDER BY p.generado_at DESC), '[]'::jsonb)
    INTO v_total, v_filas
    FROM pagina p
    JOIN public.documentacion_b2b_versiones v ON v.documentacion_id = p.id AND v.version = p.version_actual
    LEFT JOIN public.usuarios ug ON ug.username = p.generado_por
    LEFT JOIN public.usuarios ub ON ub.username = p.borrado_por;

  RETURN jsonb_build_object('total', coalesce(v_total, 0), 'filas', v_filas);
END;
$$;

-- ── RPC: detalle (última versión, para editar) ──────────────────────────────
CREATE FUNCTION public.doc_b2b_detalle(p_actor text, p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
  v      public.documentacion_b2b_versiones;
BEGIN
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id;
  IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'La documentación no existe o no tienes acceso.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v FROM public.documentacion_b2b_versiones WHERE documentacion_id = p_id AND version = d.version_actual;
  RETURN to_jsonb(d) || jsonb_build_object('datos', v.datos, 'avisos', v.avisos, 'editados', v.editados, 'documentos', v.documentos, 'completa', v.completa);
END;
$$;

-- ── RPC: CUPS con documentación activa (para bloquear la selección) ─────────
CREATE FUNCTION public.doc_b2b_cups_activos(p_actor text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := public._doc_b2b_actor(p_actor, p_token);
BEGIN
  RETURN (
    SELECT coalesce(jsonb_object_agg(c.cups, jsonb_build_object(
             'documentacion_id', d.id, 'titular', d.titular,
             'puede_ver', public._doc_b2b_puede_ver(p_actor, v_role, d))), '{}'::jsonb)
      FROM public.documentacion_b2b_cups c
      JOIN public.documentacion_b2b d ON d.id = c.documentacion_id
     WHERE c.activa
  );
END;
$$;

-- ── RPC: distribuidora_guardar (admin) ──────────────────────────────────────
CREATE FUNCTION public.distribuidora_guardar(
  p_actor text, p_token text, p_prefijo text, p_nombre_mostrar text, p_codigo_endesa text, p_texto_endesa text
)
RETURNS public.distribuidoras_electricidad
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  r      public.distribuidoras_electricidad;
BEGIN
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede guardar distribuidoras.' USING ERRCODE = 'P0001';
  END IF;
  IF p_prefijo IS NULL OR p_prefijo !~ '^\d{4}(\d{2})?$' THEN
    RAISE EXCEPTION 'Prefijo no válido: usa 4 o 6 dígitos.' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(coalesce(p_texto_endesa, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Falta el texto de Endesa.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.distribuidoras_electricidad AS t
    (prefijo_cups, nombre_mostrar, estado, codigo_endesa, texto_endesa, fuente, verificado, actualizado_por)
  VALUES (p_prefijo, coalesce(nullif(trim(p_nombre_mostrar), ''), trim(p_texto_endesa)), 'ACTIVA',
          nullif(trim(coalesce(p_codigo_endesa, '')), ''), trim(p_texto_endesa), 'Administrador del CRM', true, p_actor)
  ON CONFLICT (prefijo_cups) DO UPDATE
    SET codigo_endesa = EXCLUDED.codigo_endesa, texto_endesa = EXCLUDED.texto_endesa, verificado = true,
        actualizado_por = p_actor, updated_at = now()
  RETURNING * INTO r;

  PERFORM public._doc_b2b_actividad(format('Distribuidora %s actualizada', p_prefijo), p_actor);
  RETURN r;
END;
$$;

-- ── RPC: tarifa_guardar_version (admin) ─────────────────────────────────────
-- p_valores: objeto plano ruta → número. La lista blanca por tarifa se aplica antes en
-- el cliente (src/lib/tarifas/registro.js) y otra vez al leer la versión.
CREATE FUNCTION public.tarifa_guardar_version(
  p_actor text, p_token text, p_tarifa_id text, p_valores jsonb, p_valida_desde date, p_valida_hasta date,
  p_pdf_path text, p_pdf_sha256 text, p_cambios jsonb
)
RETURNS public.tarifas_versiones
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  v_ver  int;
  r      public.tarifas_versiones;
BEGIN
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede actualizar tarifas.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_valores) <> 'object' OR p_valores = '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_each(p_valores) e WHERE jsonb_typeof(e.value) <> 'number') THEN
    RAISE EXCEPTION 'Los valores de la tarifa deben ser numéricos.' USING ERRCODE = 'P0001';
  END IF;
  IF p_valida_desde IS NULL OR p_valida_hasta IS NULL OR p_valida_hasta < p_valida_desde THEN
    RAISE EXCEPTION 'Las fechas de validez no son coherentes.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('tarifas_versiones:' || p_tarifa_id));
  SELECT coalesce(max(version), 0) + 1 INTO v_ver FROM public.tarifas_versiones WHERE tarifa_id = p_tarifa_id;
  UPDATE public.tarifas_versiones SET activa = false WHERE tarifa_id = p_tarifa_id AND activa;
  INSERT INTO public.tarifas_versiones (tarifa_id, version, valores, valida_desde, valida_hasta, pdf_path, pdf_sha256, cambios, creado_por)
  VALUES (p_tarifa_id, v_ver, p_valores, p_valida_desde, p_valida_hasta, p_pdf_path, p_pdf_sha256, coalesce(p_cambios, '{}'), p_actor)
  RETURNING * INTO r;

  PERFORM public._doc_b2b_actividad(format('Tarifa %s actualizada (versión %s)', p_tarifa_id, v_ver), p_actor);
  RETURN r;
END;
$$;

-- ── Autorización de archivos: solo la Edge Function (clave de servicio) ─────
-- Devuelve el bucket y las rutas que el actor puede leer o subir.
CREATE FUNCTION public.doc_b2b_autorizar_archivos(
  p_actor text, p_token text, p_accion text, p_id uuid DEFAULT NULL, p_version int DEFAULT NULL, p_tarifa_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
  v      public.documentacion_b2b_versiones;
BEGIN
  IF p_accion = 'plantillas' THEN
    RETURN jsonb_build_object('bucket', 'plantillas-contratos', 'lectura', true,
      'rutas', jsonb_build_array('contrato_base.pdf', 'anexo_base.pdf', 'puntos_suministro_base.pdf'));
  END IF;

  IF p_accion = 'subir_tarifa' THEN
    IF v_role <> 'admin' THEN
      RAISE EXCEPTION 'Solo un administrador puede actualizar tarifas.' USING ERRCODE = 'P0001';
    END IF;
    IF p_tarifa_id IS NULL OR p_tarifa_id !~ '^[a-z0-9-]+$' THEN
      RAISE EXCEPTION 'Tarifa no válida.' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('bucket', 'tarifas-pdf', 'lectura', false,
      'rutas', jsonb_build_array(format('%s/%s.pdf', p_tarifa_id, gen_random_uuid())));
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Falta la documentación.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id;

  IF p_accion = 'subir' THEN
    IF NOT FOUND THEN
      -- expediente nuevo: el identificador lo genera el navegador; aún no hay nada que proteger
      RETURN jsonb_build_object('bucket', 'documentacion-b2b', 'lectura', false, 'rutas', jsonb_build_array(
        format('%s/v1/contrato.pdf', p_id), format('%s/v1/anexo_precios.pdf', p_id), format('%s/v1/anexo_puntos.pdf', p_id)));
    END IF;
    IF NOT public._doc_b2b_puede_editar(p_actor, v_role, d) OR d.estado <> 'activa' THEN
      RAISE EXCEPTION 'No puedes editar esta documentación.' USING ERRCODE = 'P0001';
    END IF;
    -- Solo la versión siguiente, que aún no existe: las guardadas nunca se sobrescriben.
    RETURN jsonb_build_object('bucket', 'documentacion-b2b', 'lectura', false, 'rutas', jsonb_build_array(
      format('%s/v%s/contrato.pdf', p_id, d.version_actual + 1),
      format('%s/v%s/anexo_precios.pdf', p_id, d.version_actual + 1),
      format('%s/v%s/anexo_puntos.pdf', p_id, d.version_actual + 1)));
  END IF;

  IF p_accion = 'descargar' THEN
    IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) THEN
      RAISE EXCEPTION 'La documentación no existe o no tienes acceso.' USING ERRCODE = 'P0001';
    END IF;
    IF d.estado = 'borrada' AND v_role NOT IN ('admin','manager') THEN
      RAISE EXCEPTION 'Esta documentación está borrada.' USING ERRCODE = 'P0001';
    END IF;
    SELECT * INTO v FROM public.documentacion_b2b_versiones
     WHERE documentacion_id = p_id AND version = coalesce(p_version, d.version_actual);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Esa versión no existe.' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object('bucket', 'documentacion-b2b', 'lectura', true, 'completa', v.completa,
      'rutas', (SELECT jsonb_agg(e->>'path') FROM jsonb_array_elements(v.documentos) e));
  END IF;

  RAISE EXCEPTION 'Acción no válida.' USING ERRCODE = 'P0001';
END;
$$;

-- ── Permisos de ejecución ───────────────────────────────────────────────────
REVOKE ALL ON FUNCTION
  public._doc_b2b_tiene_seccion(text, text),
  public._doc_b2b_actor(text, text),
  public._doc_b2b_ve_cliente(text, text, bigint),
  public._doc_b2b_puede_ver(text, text, public.documentacion_b2b),
  public._doc_b2b_puede_editar(text, text, public.documentacion_b2b),
  public._doc_b2b_actividad(text, text),
  public._doc_b2b_validar_documentos(uuid, int, int, jsonb),
  public.doc_b2b_autorizar_archivos(text, text, text, uuid, int, text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doc_b2b_autorizar_archivos(text, text, text, uuid, int, text) TO service_role;

REVOKE ALL ON FUNCTION
  public.doc_b2b_abrir_sesion(text, text),
  public.doc_b2b_cerrar_sesion(text),
  public.doc_b2b_crear(text, text, uuid, bigint[], text, text, uuid, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_nueva_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_borrar(text, text, uuid),
  public.doc_b2b_compartir(text, text, uuid, text[]),
  public.doc_b2b_listar(text, text, text, text, int, int),
  public.doc_b2b_detalle(text, text, uuid),
  public.doc_b2b_cups_activos(text, text),
  public.distribuidora_guardar(text, text, text, text, text, text),
  public.tarifa_guardar_version(text, text, text, jsonb, date, date, text, text, jsonb)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.doc_b2b_abrir_sesion(text, text),
  public.doc_b2b_cerrar_sesion(text),
  public.doc_b2b_crear(text, text, uuid, bigint[], text, text, uuid, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_nueva_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_borrar(text, text, uuid),
  public.doc_b2b_compartir(text, text, uuid, text[]),
  public.doc_b2b_listar(text, text, text, text, int, int),
  public.doc_b2b_detalle(text, text, uuid),
  public.doc_b2b_cups_activos(text, text),
  public.distribuidora_guardar(text, text, text, text, text, text),
  public.tarifa_guardar_version(text, text, text, jsonb, date, date, text, text, jsonb)
TO anon, authenticated;
