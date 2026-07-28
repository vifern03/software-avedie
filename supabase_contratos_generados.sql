-- Contratos B2B provisionales (Endesa) — tabla independiente de `clientes`.
-- Ver docs/plantillas-endesa/README.md para contexto de la funcionalidad.

CREATE TABLE IF NOT EXISTS contratos_generados (
  id                BIGINT      PRIMARY KEY,
  cliente_id        BIGINT      NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  estado            TEXT        NOT NULL DEFAULT 'generado', -- 'generado' | 'descargado'
  datos_formulario  JSONB       NOT NULL, -- Bloques 1-6 ya editados por el comercial (permite regenerar/auditar sin re-llamar a Gemini)
  extraccion_ia_raw JSONB, -- respuesta cruda de Gemini, separada del dato final editado (auditoría IA vs. error humano)
  archivo_base64    TEXT        NOT NULL, -- .docx generado (Base64) -- mismo patrón que dni_escaneado/factura_b2b_url: fetch-on-click, nunca en el SELECT principal
  generado_por      TEXT        NOT NULL, -- username del comercial (trazabilidad)
  generado_en       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contratos_generados_cliente_id ON contratos_generados(cliente_id);

ALTER TABLE contratos_generados DISABLE ROW LEVEL SECURITY;
