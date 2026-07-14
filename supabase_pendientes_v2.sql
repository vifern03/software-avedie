-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v2 — Módulo "Gestión de Pendientes" (rediseño) + flujo CURP
-- Ejecutar en el SQL Editor de Supabase (Dashboard → SQL Editor → New query).
-- ══════════════════════════════════════════════════════════════════════════

-- ── 1. Nueva tabla registro_pendientes ───────────────────────────────────────
-- Guarda TODAS las filas del Excel de incidencias, existan o no (todavía) como
-- contrato en `clientes`. Antes el sistema solo hacía UPDATE de clientes ya
-- existentes por CUPS, así que cualquier CUPS del Excel sin alta en el CRM se
-- perdía silenciosamente. Ahora cada fila del Excel se conserva siempre aquí,
-- y `Pendientes.jsx` cruza contra `clientes` en el cliente solo para pintar el
-- circulito verde/rojo (existe / no existe todavía en el CRM).
CREATE TABLE IF NOT EXISTS registro_pendientes (
  id                    BIGINT      PRIMARY KEY,
  cups                  TEXT        NOT NULL,
  nombre                TEXT,
  numero_caso           TEXT,
  fecha_creacion_excel  TEXT,
  origen_excel          TEXT,
  raw_data              JSONB,
  estado_incidencia     TEXT        DEFAULT 'Pendiente de tareas',
  fecha_formalizacion   TIMESTAMPTZ DEFAULT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ DEFAULT NULL
);
ALTER TABLE registro_pendientes DISABLE ROW LEVEL SECURITY;

-- ── 2. Eliminar la restricción UNIQUE sobre clientes.cups (flujo CURP) ──────
-- Permite dar de alta el mismo CUPS más de una vez (p. ej. alta con otra
-- compañía y luego alta propia sobre el mismo suministro). Se busca la
-- restricción dinámicamente porque pudo crearse como constraint inline
-- (`cups TEXT UNIQUE`, nombre autogenerado tipo clientes_cups_key) o como
-- constraint explícita añadida después (`clientes_cups_unique`); este bloque
-- la encuentra y la elimina sea cual sea su nombre real.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel   ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'clientes'
      AND att.attname = 'cups'
      AND con.contype = 'u'
  LOOP
    EXECUTE format('ALTER TABLE clientes DROP CONSTRAINT %I', r.conname);
    RAISE NOTICE 'Eliminada restricción UNIQUE: %', r.conname;
  END LOOP;
END $$;
