-- Documentación B2B: eliminación definitiva, solo para administradores. Solo añade.
-- Rollback: supabase/rollback/20261101000002_doc_b2b_eliminar_definitivo_down.sql
-- Solo la llama la Edge Function, que borra del bucket las rutas devueltas (Supabase no
-- deja borrar archivos por SQL). Las filas de cups y versiones caen en cascada.

CREATE FUNCTION public.doc_b2b_eliminar_definitivo(p_actor text, p_token text, p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role  text := public._doc_b2b_actor(p_actor, p_token);
  v_rutas jsonb;
  d       public.documentacion_b2b;
  v_n     int := 0;
BEGIN
  IF v_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo un administrador puede eliminar definitivamente.' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(o.name), '[]'::jsonb) INTO v_rutas
    FROM storage.objects o
   WHERE o.bucket_id = 'documentacion-b2b' AND split_part(o.name, '/', 1) = ANY (p_ids::text[]);

  FOR d IN DELETE FROM public.documentacion_b2b WHERE id = ANY (p_ids) RETURNING * LOOP
    v_n := v_n + 1;
    PERFORM public._doc_b2b_actividad(format('Documentación eliminada definitivamente: %s (%s CUPS)', d.titular, d.num_suministros), p_actor);
  END LOOP;

  RETURN jsonb_build_object('eliminados', v_n, 'rutas', v_rutas);
END;
$$;

REVOKE ALL ON FUNCTION public.doc_b2b_eliminar_definitivo(text, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.doc_b2b_eliminar_definitivo(text, text, uuid[]) TO service_role;
