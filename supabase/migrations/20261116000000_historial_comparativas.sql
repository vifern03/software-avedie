-- Historial de Comparativas (2026-11-16). SOLO CREA objetos nuevos: no modifica nada existente.
-- Cada comparativa descargada o impresa se guarda con sus datos clave, el PDF y la factura.
-- No se pueden borrar: no se concede DELETE ni hay política para ello.

BEGIN;

CREATE TABLE public.historial_comparativas (
  id                 bigint      PRIMARY KEY,
  created_at         timestamptz NOT NULL DEFAULT now(),
  realizada_por      text        NOT NULL,              -- username
  equipo             text,                              -- sede de quien la hizo
  tipo               text        NOT NULL CHECK (tipo IN ('luz_20', 'luz_b2b', 'gas')),
  tarifa_acceso      text,                              -- 2.0TD / 3.0TD / 6.1TD / RL.1..RL.6
  producto           text,                              -- oferta Endesa comparada
  cliente            text,
  cups               text,
  potencias          jsonb,                             -- {"P1": kW, ...}
  consumos           jsonb,                             -- {"P1": kWh, ...}
  consumo_total_kwh  numeric,
  consumo_anual_kwh  numeric,
  dias               numeric,
  importe_actual     numeric,
  importe_oferta     numeric,
  ahorro             numeric,
  ahorro_pct         numeric,
  ahorro_anual       numeric,
  datos              jsonb,                             -- formulario completo
  tiene_factura      boolean     NOT NULL DEFAULT false,
  factura_nombre     text,
  cliente_id         bigint,                            -- contrato dado de alta desde aquí
  alta_tipo          text,                              -- B2C / B2B
  compartido_con     text[]      NOT NULL DEFAULT '{}',
  shared_by          text
);

CREATE INDEX historial_comparativas_created_idx ON public.historial_comparativas (created_at DESC);
CREATE INDEX historial_comparativas_cups_idx    ON public.historial_comparativas (upper(cups));
CREATE INDEX historial_comparativas_autor_idx   ON public.historial_comparativas (realizada_por);

-- Archivos aparte para que el listado no descargue los PDF.
CREATE TABLE public.historial_comparativas_archivos (
  comparativa_id   bigint PRIMARY KEY REFERENCES public.historial_comparativas (id),
  pdf_comparativa  text,      -- data URL del PDF del informe
  factura          text,      -- data URL de la factura aportada
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.historial_comparativas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_comparativas_archivos ENABLE ROW LEVEL SECURITY;

-- Mismo criterio permisivo que el resto del CRM (fase 1), pero sin DELETE.
CREATE POLICY hc_select ON public.historial_comparativas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY hc_insert ON public.historial_comparativas FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY hc_update ON public.historial_comparativas FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY hca_select ON public.historial_comparativas_archivos FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY hca_insert ON public.historial_comparativas_archivos FOR INSERT TO anon, authenticated WITH CHECK (true);

REVOKE ALL ON public.historial_comparativas, public.historial_comparativas_archivos FROM anon, authenticated;
GRANT SELECT, INSERT ON public.historial_comparativas, public.historial_comparativas_archivos TO anon, authenticated;
-- Solo se puede actualizar el vínculo con el alta y la compartición.
GRANT UPDATE (cliente_id, alta_tipo, compartido_con, shared_by) ON public.historial_comparativas TO anon, authenticated;

COMMIT;
