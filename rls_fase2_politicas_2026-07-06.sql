-- Fase 2 RLS — políticas reales por fila (usuario/rol/sede), vía JWT propio.
-- Sustituye las políticas permisivas 'fase1_permisivo' en las tablas que sí
-- tienen un modelo claro de propietario/sede. actividades, configuracion (solo
-- lectura) y telemarketing_contactos se quedan permisivas — ver diseño en
-- rls_fase2_diseno_2026-07-06.md para la justificación de cada excepción.
--
-- Rollback: ver sección final de este archivo.

BEGIN;

-- ─── Helper: visibilidad de un cliente para el usuario del JWT actual ────────
CREATE OR REPLACE FUNCTION public.puede_ver_cliente(
  p_comercial      text,
  p_creado_por     text,
  p_vendido_por    text,
  p_equipo         text,
  p_compartido_con text[]
) RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT
    (auth.jwt() ->> 'app_role') IN ('admin','manager')
    OR p_comercial   = (auth.jwt() ->> 'app_username')
    OR p_creado_por  = (auth.jwt() ->> 'app_username')
    OR p_vendido_por = (auth.jwt() ->> 'app_username')
    OR (auth.jwt() ->> 'app_sede') = 'Ambos'
    OR ( (auth.jwt() ->> 'app_sede') NOT IN ('Ninguno','Ambos') AND p_equipo = (auth.jwt() ->> 'app_sede') )
    OR ( p_compartido_con IS NOT NULL AND p_compartido_con @> ARRAY[(auth.jwt() ->> 'app_display_name')] )
    OR p_vendido_por = (auth.jwt() ->> 'app_display_name')
    OR p_creado_por  = (auth.jwt() ->> 'app_display_name')
    OR EXISTS (
         SELECT 1 FROM public.configuracion cfg,
           jsonb_each_text(
             CASE WHEN jsonb_typeof(cfg.valor) = 'string' THEN (cfg.valor #>> '{}')::jsonb ELSE cfg.valor END
           ) AS kv(nombre, uname)
         WHERE cfg.clave = 'prescriptor_links'
           AND kv.uname = (auth.jwt() ->> 'app_username')
           AND (p_vendido_por = kv.nombre OR p_creado_por = kv.nombre)
       );
$$;

-- ─── clientes ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fase1_permisivo ON public.clientes;
CREATE POLICY fase2_clientes ON public.clientes
  FOR ALL TO anon, authenticated
  USING      (public.puede_ver_cliente(comercial, creado_por, vendido_por, equipo, compartido_con))
  WITH CHECK (public.puede_ver_cliente(comercial, creado_por, vendido_por, equipo, compartido_con));

-- ─── visitas (tienda) — NO manager full-access, se comporta como comercial ──
DROP POLICY IF EXISTS fase1_permisivo ON public.visitas;
CREATE POLICY fase2_visitas ON public.visitas
  FOR ALL TO anon, authenticated
  USING (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR registrado_por = (auth.jwt() ->> 'app_username')
    OR (auth.jwt() ->> 'app_sede') = 'Ambos'
    OR ( (auth.jwt() ->> 'app_sede') NOT IN ('Ninguno','Ambos') AND punto_venta = (auth.jwt() ->> 'app_sede') )
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR registrado_por = (auth.jwt() ->> 'app_username')
    OR (auth.jwt() ->> 'app_sede') = 'Ambos'
    OR ( (auth.jwt() ->> 'app_sede') NOT IN ('Ninguno','Ambos') AND punto_venta = (auth.jwt() ->> 'app_sede') )
  );

-- ─── visitas_pymes — manager SÍ tiene acceso total (regla explícita) ────────
DROP POLICY IF EXISTS fase1_permisivo ON public.visitas_pymes;
CREATE POLICY fase2_visitas_pymes ON public.visitas_pymes
  FOR ALL TO anon, authenticated
  USING (
    (auth.jwt() ->> 'app_role') IN ('admin','manager')
    OR registrado_por = (auth.jwt() ->> 'app_username')
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') IN ('admin','manager')
    OR registrado_por = (auth.jwt() ->> 'app_username')
  );

-- ─── reportes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fase1_permisivo ON public.reportes;
CREATE POLICY fase2_reportes ON public.reportes
  FOR ALL TO anon, authenticated
  USING (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR creado_por = (auth.jwt() ->> 'app_username')
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR creado_por = (auth.jwt() ->> 'app_username')
  );

-- ─── fichajes ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS fase1_permisivo ON public.fichajes;
CREATE POLICY fase2_fichajes ON public.fichajes
  FOR ALL TO anon, authenticated
  USING (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR usuario = (auth.jwt() ->> 'app_username')
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role') = 'admin'
    OR usuario = (auth.jwt() ->> 'app_username')
  );

-- ─── configuracion — lectura compartida (todos la necesitan), escritura solo admin ──
DROP POLICY IF EXISTS fase1_permisivo ON public.configuracion;
CREATE POLICY fase2_configuracion_select ON public.configuracion
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fase2_configuracion_insert ON public.configuracion
  FOR INSERT TO anon, authenticated WITH CHECK ((auth.jwt() ->> 'app_role') = 'admin');
CREATE POLICY fase2_configuracion_update ON public.configuracion
  FOR UPDATE TO anon, authenticated
  USING ((auth.jwt() ->> 'app_role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'app_role') = 'admin');
CREATE POLICY fase2_configuracion_delete ON public.configuracion
  FOR DELETE TO anon, authenticated USING ((auth.jwt() ->> 'app_role') = 'admin');

-- ─── telemarketing_gestiones — lectura compartida por contacto, escritura propia ──
DROP POLICY IF EXISTS fase1_permisivo ON public.telemarketing_gestiones;
CREATE POLICY fase2_tg_select ON public.telemarketing_gestiones
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY fase2_tg_insert ON public.telemarketing_gestiones
  FOR INSERT TO anon, authenticated
  WITH CHECK (registrado_por = (auth.jwt() ->> 'app_username') OR (auth.jwt() ->> 'app_role') IN ('admin','manager'));
CREATE POLICY fase2_tg_update ON public.telemarketing_gestiones
  FOR UPDATE TO anon, authenticated
  USING      (registrado_por = (auth.jwt() ->> 'app_username') OR (auth.jwt() ->> 'app_role') IN ('admin','manager'))
  WITH CHECK (registrado_por = (auth.jwt() ->> 'app_username') OR (auth.jwt() ->> 'app_role') IN ('admin','manager'));
CREATE POLICY fase2_tg_delete ON public.telemarketing_gestiones
  FOR DELETE TO anon, authenticated
  USING (registrado_por = (auth.jwt() ->> 'app_username') OR (auth.jwt() ->> 'app_role') IN ('admin','manager'));

-- actividades y telemarketing_contactos: SIN CAMBIO, se quedan con fase1_permisivo
-- (excepciones deliberadas — ver rls_fase2_diseno_2026-07-06.md, secciones 3)

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK de Fase 2 (volver a las políticas permisivas de Fase 1 en estas tablas):
--
-- BEGIN;
-- DROP POLICY IF EXISTS fase2_clientes             ON public.clientes;
-- DROP POLICY IF EXISTS fase2_visitas              ON public.visitas;
-- DROP POLICY IF EXISTS fase2_visitas_pymes        ON public.visitas_pymes;
-- DROP POLICY IF EXISTS fase2_reportes             ON public.reportes;
-- DROP POLICY IF EXISTS fase2_fichajes             ON public.fichajes;
-- DROP POLICY IF EXISTS fase2_configuracion_select ON public.configuracion;
-- DROP POLICY IF EXISTS fase2_configuracion_insert ON public.configuracion;
-- DROP POLICY IF EXISTS fase2_configuracion_update ON public.configuracion;
-- DROP POLICY IF EXISTS fase2_configuracion_delete ON public.configuracion;
-- DROP POLICY IF EXISTS fase2_tg_select ON public.telemarketing_gestiones;
-- DROP POLICY IF EXISTS fase2_tg_insert ON public.telemarketing_gestiones;
-- DROP POLICY IF EXISTS fase2_tg_update ON public.telemarketing_gestiones;
-- DROP POLICY IF EXISTS fase2_tg_delete ON public.telemarketing_gestiones;
-- CREATE POLICY fase1_permisivo ON public.clientes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.visitas                 FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.visitas_pymes           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.reportes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.fichajes                FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.configuracion           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY fase1_permisivo ON public.telemarketing_gestiones FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
-- COMMIT;
