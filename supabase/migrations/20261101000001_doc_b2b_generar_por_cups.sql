-- Documentación B2B: ventana de generación por CUPS. Solo añade.
-- Rollback: supabase/rollback/20261101000001_doc_b2b_generar_por_cups_down.sql

-- Sesión con el usuario del CRM, sin contraseña, por decisión del usuario (ver D11 en
-- DECISIONES.md): el servidor deja de verificar la identidad de quien abre la sesión.
CREATE FUNCTION public.doc_b2b_sesion_crm(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text;
  v_token text;
  v_exp   timestamptz := now() + interval '30 days';
BEGIN
  SELECT role INTO v_role FROM public.usuarios WHERE username = p_username AND deleted_at IS NULL;
  IF v_role IS NULL OR NOT public._doc_b2b_tiene_seccion(p_username, v_role) THEN
    RAISE EXCEPTION 'No tienes acceso a Documentación B2B.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.doc_b2b_sesiones WHERE expira_at < now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.doc_b2b_sesiones (token_hash, username, expira_at)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), p_username, v_exp);
  RETURN jsonb_build_object('token', v_token, 'expira_at', v_exp);
END;
$$;

-- Busca CUPS en Alta B2B para cualquier usuario con acceso a la sección, sin filtrar por
-- propietario. Si un CUPS tiene varias altas, devuelve la más reciente.
CREATE FUNCTION public.doc_b2b_buscar_cups(p_actor text, p_token text, p_cups text[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := public._doc_b2b_actor(p_actor, p_token);
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', f.id, 'tipo', f.tipo, 'nombre', f.nombre, 'cif_dni', f.cif_dni, 'telefono', f.telefono, 'mail', f.mail,
             'cuenta_bancaria', f.cuenta_bancaria, 'cups', f.cups, 'tarifa', f.tarifa, 'id_producto', f.id_producto, 'estado', f.estado
           )), '[]'::jsonb)
      FROM (
        SELECT DISTINCT ON (upper(regexp_replace(c.cups, '\s', '', 'g'))) c.*
          FROM public.clientes c
         WHERE upper(regexp_replace(c.cups, '\s', '', 'g')) = ANY (p_cups)
           AND c.tipo IN ('B2B','CUR_B2B') AND c.deleted_at IS NULL
         ORDER BY upper(regexp_replace(c.cups, '\s', '', 'g')), c.id DESC
      ) f
  );
END;
$$;

-- Igual que doc_b2b_crear, sin la restricción por propietario o compartición.
CREATE FUNCTION public.doc_b2b_crear_por_cups(
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
BEGIN
  IF v_n < 1 OR v_n > 3 THEN
    RAISE EXCEPTION 'Selecciona de 1 a 3 CUPS.' USING ERRCODE = 'P0001';
  END IF;

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

REVOKE ALL ON FUNCTION
  public.doc_b2b_sesion_crm(text),
  public.doc_b2b_buscar_cups(text, text, text[]),
  public.doc_b2b_crear_por_cups(text, text, uuid, bigint[], text, text, uuid, jsonb, jsonb, jsonb, boolean)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.doc_b2b_sesion_crm(text),
  public.doc_b2b_buscar_cups(text, text, text[]),
  public.doc_b2b_crear_por_cups(text, text, uuid, bigint[], text, text, uuid, jsonb, jsonb, jsonb, boolean)
TO anon, authenticated;
