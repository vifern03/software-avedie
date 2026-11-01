-- Documentación B2B: renovación de la sesión al arrancar el CRM, para que la sección no
-- pida contraseña. Exige un token vigente: no abre sesiones ni acepta solo un usuario.
-- Solo añade. Rollback: supabase/rollback/20261101000000_doc_b2b_renovar_sesion_down.sql

CREATE FUNCTION public.doc_b2b_renovar_sesion(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_exp timestamptz := now() + interval '30 days';
BEGIN
  UPDATE public.doc_b2b_sesiones s
     SET expira_at = v_exp
    FROM public.usuarios u
   WHERE s.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
     AND s.expira_at > now()
     AND u.username = s.username
     AND u.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SESION_DOC_B2B: identifícate de nuevo para continuar.' USING ERRCODE = 'P0001';
  END IF;
  RETURN jsonb_build_object('expira_at', v_exp);
END;
$$;

REVOKE ALL ON FUNCTION public.doc_b2b_renovar_sesion(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.doc_b2b_renovar_sesion(text) TO anon, authenticated;
