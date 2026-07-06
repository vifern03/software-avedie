-- Fase 2 RLS — parte 1: verificar_login ahora también emite un JWT propio.
--
-- Hallazgo importante durante el diseño: el plan original de "el RPC firma un
-- JWT propio" requiere el secreto de firma (HS256) que usa PostgREST para
-- verificar tokens. Supabase NO expone ese secreto dentro de Postgres por
-- defecto (no existe el GUC app.settings.jwt_secret en este proyecto) — pero
-- SÍ lo expone la Management API vía /v1/projects/{ref}/postgrest. Se obtuvo
-- una vez y se guardó cifrado en Supabase Vault (secreto 'app_jwt_secret_custom'),
-- accesible solo desde funciones SECURITY DEFINER, nunca expuesto a anon/authenticated
-- ni escrito en ningún archivo del repo. Esto evita el approach mucho más grande
-- de migrar a Supabase Auth real (auth.users + sesiones GoTrue) para lograr lo
-- mismo.
--
-- Claims del JWT (payload):
--   role              -- SIEMPRE 'authenticated' (así PostgREST hace SET ROLE authenticated)
--   sub               -- username
--   app_username      -- username (duplicado explícito, por claridad en las políticas)
--   app_role          -- 'admin' | 'manager' | 'comercial'
--   app_sede          -- valor de usuarios.equipo ('Palencia'/'Valladolid'/'Ninguno'/'Ambos')
--   app_display_name  -- para comparar contra compartido_con (que almacena displayName)
--   iat / exp         -- exp a 30 días: la app actual no expira sesión nunca (localStorage
--                         indefinido) — un exp corto rompería la sesión persistente actual
--                         a media jornada. 30 días preserva ese comportamiento de facto.
--
-- Verificación desde políticas RLS: auth.jwt() ->> 'app_role', etc.

BEGIN;

DROP FUNCTION IF EXISTS public.verificar_login(text, text);

CREATE FUNCTION public.verificar_login(p_username text, p_password text)
RETURNS TABLE (
  username text,
  role text,
  display_name text,
  is_undeletable boolean,
  security_pin text,
  equipo text,
  token text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row    public.usuarios%ROWTYPE;
  v_hash   text;
  v_secret text;
  v_now    bigint;
  v_token  text;
BEGIN
  SELECT * INTO v_row FROM public.usuarios u
    WHERE u.username = p_username AND u.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_password, 'sha256'), 'hex');

  IF v_row.password = v_hash THEN
    NULL; -- hash ya correcto
  ELSIF v_row.password = p_password THEN
    -- migración silenciosa de contraseña en texto plano (instalaciones previas)
    UPDATE public.usuarios SET password = v_hash WHERE public.usuarios.username = p_username;
  ELSE
    RETURN; -- no coincide
  END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'app_jwt_secret_custom';

  v_now := extract(epoch FROM now())::bigint;

  v_token := extensions.sign(
    json_build_object(
      'role',             'authenticated',
      'sub',              v_row.username,
      'app_username',     v_row.username,
      'app_role',         v_row.role,
      'app_sede',         coalesce(v_row.equipo, 'Ninguno'),
      'app_display_name', coalesce(v_row.display_name, v_row.username),
      'iat',              v_now,
      'exp',              v_now + (30 * 24 * 3600)
    ),
    v_secret,
    'HS256'
  );

  RETURN QUERY SELECT v_row.username, v_row.role, v_row.display_name,
                      v_row.is_undeletable, v_row.security_pin, v_row.equipo, v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_login(text, text) TO anon, authenticated;

COMMIT;
