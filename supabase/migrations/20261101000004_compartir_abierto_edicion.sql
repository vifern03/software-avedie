-- Compartición abierta con bloqueos y edición para quien ve la documentación. Solo añade:
-- las funciones sustituidas (doc_b2b_compartir, doc_b2b_nueva_version, doc_b2b_modificaciones)
-- y la tabla share_permissions se quedan sin uso.
-- Rollback: supabase/rollback/20261101000004_compartir_abierto_edicion_down.sql

-- Fila (username, bloqueado) = username no puede compartir con bloqueado.
CREATE TABLE public.compartir_bloqueos (
  username   text NOT NULL,
  bloqueado  text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (username, bloqueado)
);
ALTER TABLE public.compartir_bloqueos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.compartir_bloqueos FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.compartir_bloqueos TO anon, authenticated;
CREATE POLICY lectura ON public.compartir_bloqueos FOR SELECT TO anon, authenticated USING (true);

CREATE FUNCTION public.compartir_bloqueos_guardar(p_actor text, p_token text, p_username text, p_bloqueados text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := public._doc_b2b_actor(p_actor, p_token);
BEGIN
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede cambiar los bloqueos de compartición.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.compartir_bloqueos WHERE username = p_username;
  INSERT INTO public.compartir_bloqueos (username, bloqueado)
  SELECT DISTINCT p_username, b FROM unnest(coalesce(p_bloqueados, '{}'::text[])) AS b WHERE b <> p_username;
END;
$$;

-- Cualquiera que vea la documentación la comparte, salvo con quien tenga bloqueado.
-- Un destinatario que ya estaba en la lista no se revisa.
CREATE FUNCTION public.doc_b2b_compartir_abierto(p_actor text, p_token text, p_id uuid, p_usuarios text[])
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
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'La documentación no existe o no tienes acceso.' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce(array_agg(DISTINCT trim(a)) FILTER (WHERE a IS NOT NULL AND trim(a) <> ''), '{}')
    INTO v_lista FROM unnest(coalesce(p_usuarios, '{}'::text[])) AS a;
  FOREACH v_who IN ARRAY v_lista LOOP
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE username = v_who AND deleted_at IS NULL) THEN
      RAISE EXCEPTION 'El usuario "%" no existe o está dado de baja.', v_who USING ERRCODE = 'P0001';
    END IF;
    IF NOT v_who = ANY (d.compartido_con)
       AND EXISTS (SELECT 1 FROM public.compartir_bloqueos b WHERE b.username = p_actor AND b.bloqueado = v_who) THEN
      RAISE EXCEPTION 'No puedes compartir con "%".', v_who USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  UPDATE public.documentacion_b2b SET compartido_con = v_lista WHERE id = p_id;
  PERFORM public._doc_b2b_actividad(format('Documentación de %s compartida', d.titular), p_actor);
  RETURN v_lista;
END;
$$;

-- Edita quien ve la documentación: quien la generó, destinatarios, managers y administradores.
CREATE FUNCTION public.doc_b2b_guardar_version(
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
  IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'La documentación no existe o no tienes acceso.' USING ERRCODE = 'P0001';
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

-- Rutas de la versión siguiente. Solo la llama la Edge Function doc-b2b-subir.
CREATE FUNCTION public.doc_b2b_autorizar_subida(p_actor text, p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
BEGIN
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id;
  IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) OR d.estado <> 'activa' THEN
    RAISE EXCEPTION 'No puedes editar esta documentación.' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('bucket', 'documentacion-b2b', 'rutas', jsonb_build_array(
    format('%s/v%s/contrato.pdf', p_id, d.version_actual + 1),
    format('%s/v%s/anexo_precios.pdf', p_id, d.version_actual + 1),
    format('%s/v%s/anexo_puntos.pdf', p_id, d.version_actual + 1)));
END;
$$;

-- Historial de modificaciones: solo administradores y managers.
CREATE FUNCTION public.doc_b2b_modificaciones_gestion(p_actor text, p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := public._doc_b2b_actor(p_actor, p_token);
BEGIN
  IF v_role NOT IN ('admin','manager') THEN
    RAISE EXCEPTION 'Solo un manager o un administrador ve las modificaciones.' USING ERRCODE = 'P0001';
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'version', v.version, 'fecha', v.created_at, 'editados', v.editados,
             'nombre', coalesce(u.display_name, v.creado_por)
           ) ORDER BY v.version DESC), '[]'::jsonb)
      FROM public.documentacion_b2b_versiones v
      LEFT JOIN public.usuarios u ON u.username = v.creado_por
     WHERE v.documentacion_id = p_id AND v.version > 1
  );
END;
$$;

REVOKE ALL ON FUNCTION
  public.compartir_bloqueos_guardar(text, text, text, text[]),
  public.doc_b2b_compartir_abierto(text, text, uuid, text[]),
  public.doc_b2b_guardar_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_modificaciones_gestion(text, text, uuid)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.compartir_bloqueos_guardar(text, text, text, text[]),
  public.doc_b2b_compartir_abierto(text, text, uuid, text[]),
  public.doc_b2b_guardar_version(text, text, uuid, int, text, uuid, jsonb, jsonb, jsonb, jsonb, boolean),
  public.doc_b2b_modificaciones_gestion(text, text, uuid)
TO anon, authenticated;

REVOKE ALL ON FUNCTION public.doc_b2b_autorizar_subida(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doc_b2b_autorizar_subida(text, text, uuid) TO service_role;
