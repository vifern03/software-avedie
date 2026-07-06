-- Fase 1 de activación de RLS — Software Avedie — 2026-07-06
-- Objetivo: cerrar la fuga de password + activar RLS en las 10 tablas con
-- políticas permisivas (sin cambio funcional todavía). La Fase 2 (JWT propio +
-- políticas reales por fila) se hará en un cambio posterior, más grande y con
-- su propio ciclo de prueba.
--
-- Rollback: ver rls_backup_2026-07-06.md

BEGIN;

-- 1. RPC de login: la comparación de contraseña pasa a ocurrir en el servidor.
--    Reemplaza la lógica que hoy vive en AuthContext.jsx (login()).
CREATE OR REPLACE FUNCTION public.verificar_login(p_username text, p_password text)
RETURNS TABLE (
  username text,
  role text,
  display_name text,
  is_undeletable boolean,
  security_pin text,
  equipo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.usuarios%ROWTYPE;
  v_hash text;
BEGIN
  SELECT * INTO v_row FROM public.usuarios u
    WHERE u.username = p_username AND u.deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_hash := encode(extensions.digest(p_password, 'sha256'), 'hex');

  IF v_row.password = v_hash THEN
    -- hash ya correcto
    NULL;
  ELSIF v_row.password = p_password THEN
    -- migración silenciosa de contraseña en texto plano (instalaciones previas)
    UPDATE public.usuarios SET password = v_hash WHERE public.usuarios.username = p_username;
  ELSE
    RETURN; -- no coincide
  END IF;

  RETURN QUERY SELECT v_row.username, v_row.role, v_row.display_name,
                      v_row.is_undeletable, v_row.security_pin, v_row.equipo;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_login(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_login(text, text) TO anon, authenticated;

-- 2. Cerrar la fuga de password: ya no se puede leer directamente vía API.
--    NOTA: esta línea se mueve a rls_fase1b_revoke_password_2026-07-06.sql
--    y se ejecuta aparte, solo tras confirmar que el código nuevo (que ya
--    no depende de leer esta columna) está desplegado en producción.

-- 3. TRUNCATE no lo usa nadie (ni PostgREST lo expone como verbo) — cierre gratis.
REVOKE TRUNCATE ON
  public.usuarios, public.clientes, public.actividades, public.visitas,
  public.visitas_pymes, public.reportes, public.configuracion,
  public.telemarketing_contactos, public.telemarketing_gestiones, public.fichajes
  FROM anon, authenticated;

-- 4. Activar RLS. Políticas permisivas (USING true) — sin cambio funcional
--    todavía; la Fase 2 las sustituirá por filtros reales por fila.
ALTER TABLE public.usuarios                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividades              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas_pymes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_contactos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_gestiones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichajes                 ENABLE ROW LEVEL SECURITY;

CREATE POLICY fase1_permisivo ON public.usuarios                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.clientes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.actividades             FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.visitas                 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.visitas_pymes           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.reportes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.configuracion           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.telemarketing_contactos FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.telemarketing_gestiones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY fase1_permisivo ON public.fichajes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

COMMIT;
