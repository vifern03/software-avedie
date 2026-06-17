-- =============================================================================
-- supabase_tipo_venta.sql
-- Módulo: Tipo de Venta / Vendido Por / Gestión de Prescriptores
-- Ejecutar UNA sola vez en el SQL Editor de Supabase
-- =============================================================================

-- ── 1. Tabla prescriptores (lista canónica gestionada por el Admin) ───────────
CREATE TABLE IF NOT EXISTS prescriptores (
  id         BIGSERIAL    PRIMARY KEY,
  nombre     TEXT         NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT prescriptores_nombre_uq UNIQUE (nombre)
);

-- ── 2. Semilla inicial — nombres actuales del sistema ────────────────────────
INSERT INTO prescriptores (nombre) VALUES
  ('VICTOR'),
  ('ADOLFO'),
  ('ELISA GARCIA'),
  ('ISABEL ERICE'),
  ('IRENE BONILLO'),
  ('OSCAR ZAMARRO'),
  ('CARMEN BALLESTEROS')
ON CONFLICT (nombre) DO NOTHING;

-- ── 3. Nueva columna vendido_por en clientes (idempotente) ───────────────────
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS vendido_por TEXT;

-- ── 4. Row Level Security — política abierta (igual que resto de tablas) ─────
ALTER TABLE prescriptores ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'prescriptores'
      AND policyname = 'prescriptores_open'
  ) THEN
    EXECUTE 'CREATE POLICY prescriptores_open ON prescriptores FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END;
$$;

-- ── 5. Índice de búsqueda por nombre ─────────────────────────────────────────
CREATE INDEX IF NOT EXISTS prescriptores_nombre_idx ON prescriptores (nombre);

-- =============================================================================
-- NOTAS:
-- · creado_por  → sigue almacenando 'Canal Directo' o el nombre del prescriptor
-- · vendido_por → nuevo campo: quién realizó la venta (desde tabla prescriptores)
-- · El ranking del dashboard usa vendido_por (si existe) o creado_por (retrocompat.)
-- =============================================================================
