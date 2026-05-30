-- =============================================================================
--  CRM AVEDIE — Script de inicialización de tablas en Supabase
--  Ejecutar UNA VEZ en el Editor SQL del proyecto Supabase
-- =============================================================================

-- ── Tabla de usuarios del sistema ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  username       TEXT        PRIMARY KEY,
  password       TEXT        NOT NULL,
  role           TEXT        NOT NULL DEFAULT 'comercial',
  display_name   TEXT,
  is_undeletable BOOLEAN     DEFAULT FALSE,
  security_pin   TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE usuarios DISABLE ROW LEVEL SECURITY;

-- ── Tabla de configuración (permisos, PIN, etc.) ─────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion (
  clave      TEXT  PRIMARY KEY,
  valor      JSONB NOT NULL
);
ALTER TABLE configuracion DISABLE ROW LEVEL SECURITY;

-- ── Tabla de clientes B2C y B2B ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clientes (
  id                BIGINT      PRIMARY KEY,
  tipo              TEXT        NOT NULL,
  nombre            TEXT        NOT NULL,
  cif_dni           TEXT,
  telefono          TEXT,
  mail              TEXT,
  cuenta_bancaria   TEXT,
  cups              TEXT,
  tarifa            TEXT,
  linea_negocio     TEXT,
  subtipo           TEXT,
  subtipo_otro      TEXT,
  id_producto       TEXT,
  creado_por        TEXT,
  descripcion       TEXT,
  estado            TEXT        DEFAULT 'Pendiente Firma',
  comercial         TEXT,
  fecha_tramitacion TEXT,
  fecha_firma       TEXT,
  fecha_formalizada TEXT,
  dni_escaneado     TEXT,
  ultima_factura    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;

-- ── Tabla de historial de actividades ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actividades (
  id          BIGINT      PRIMARY KEY,
  tipo        TEXT,
  descripcion TEXT,
  comercial   TEXT,
  fecha       TEXT,
  hora        TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE actividades DISABLE ROW LEVEL SECURITY;

-- ── Tabla de visitas a tienda ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS visitas (
  id             BIGINT      PRIMARY KEY,
  fecha          TEXT,
  hora           TEXT,
  dni            TEXT,
  nombre         TEXT,
  telefono       TEXT,
  mail           TEXT,
  tipo           TEXT,
  tipo_otro      TEXT,
  registrado_por TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE visitas DISABLE ROW LEVEL SECURITY;

-- =============================================================================
--  FIN DEL SCRIPT
--  El propio CRM sembrará los usuarios y la configuración inicial
--  la primera vez que se cargue la aplicación.
-- =============================================================================
