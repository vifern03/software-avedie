-- Documentación B2B: lista de modificaciones de un expediente. Solo añade y solo lee.
-- Rollback: supabase/rollback/20261101000003_doc_b2b_modificaciones_down.sql

CREATE FUNCTION public.doc_b2b_modificaciones(p_actor text, p_token text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := public._doc_b2b_actor(p_actor, p_token);
  d      public.documentacion_b2b;
BEGIN
  SELECT * INTO d FROM public.documentacion_b2b WHERE id = p_id;
  IF NOT FOUND OR NOT public._doc_b2b_puede_ver(p_actor, v_role, d) THEN
    RAISE EXCEPTION 'La documentación no existe o no tienes acceso.' USING ERRCODE = 'P0001';
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

REVOKE ALL ON FUNCTION public.doc_b2b_modificaciones(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doc_b2b_modificaciones(text, text, uuid) TO anon, authenticated;
