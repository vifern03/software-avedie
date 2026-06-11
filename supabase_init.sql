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
  equipo         TEXT        DEFAULT 'Ambos',
  deleted_at     TIMESTAMPTZ DEFAULT NULL,
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
  cups              TEXT        UNIQUE,
  tarifa            TEXT,
  linea_negocio     TEXT,
  subtipo           TEXT,
  subtipo_otro      TEXT,
  id_producto       TEXT,
  creado_por        TEXT,
  descripcion       TEXT,
  estado            TEXT        DEFAULT 'Pendiente Firma',
  comercial         TEXT,
  equipo            TEXT        DEFAULT 'Ambos',
  fecha_tramitacion TEXT,
  fecha_firma       TEXT,
  fecha_formalizada TEXT,
  dni_escaneado     TEXT,
  ultima_factura    TEXT,
  renovado          BOOLEAN     DEFAULT FALSE,
  fecha_renovacion  TEXT,
  deleted_at        TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;

-- MIGRACIÓN para bases de datos existentes (ejecutar si la tabla ya existe):
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS renovado          BOOLEAN DEFAULT FALSE;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_renovacion  TEXT;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS ultima_factura    TEXT;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cif_autonomo_url  TEXT;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS justo_titulo_url  TEXT;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS factura_b2b_url   TEXT;
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS consumo_anual_est NUMERIC;

-- MIGRACIÓN — Gestión de Equipos (Sedes) — Fase 5:
-- ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS equipo TEXT DEFAULT 'Ambos';
-- ALTER TABLE clientes ADD COLUMN IF NOT EXISTS equipo TEXT DEFAULT 'Ambos';
-- ALTER TABLE visitas  ADD COLUMN IF NOT EXISTS equipo TEXT DEFAULT 'Ambos';
-- UPDATE usuarios SET equipo = 'Ambos' WHERE equipo IS NULL;
-- UPDATE clientes SET equipo = 'Ambos' WHERE equipo IS NULL;
-- UPDATE visitas  SET equipo = 'Ambos' WHERE equipo IS NULL;

-- MIGRACIÓN — restricción UNIQUE en CUPS (BD ya existente):
-- Paso 1: comprobar si hay CUPS duplicados (limpiar antes de continuar si hay resultados):
-- SELECT cups, COUNT(*) FROM clientes GROUP BY cups HAVING COUNT(*) > 1;
-- Paso 2: añadir la restricción de unicidad:
-- ALTER TABLE clientes ADD CONSTRAINT clientes_cups_unique UNIQUE (cups);

-- ── Tabla de historial de actividades ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actividades (
  id          BIGINT      PRIMARY KEY,
  tipo        TEXT,
  descripcion TEXT,
  comercial   TEXT,
  fecha       TEXT,
  hora        TEXT,
  deleted_at  TIMESTAMPTZ DEFAULT NULL,
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
  equipo         TEXT        DEFAULT 'Ambos',
  deleted_at     TIMESTAMPTZ DEFAULT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE visitas DISABLE ROW LEVEL SECURITY;

-- ── Tabla de fichajes (Control de Horario) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS fichajes (
  id           BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario      TEXT        NOT NULL,
  fecha        TEXT        NOT NULL,
  hora_entrada TEXT,
  hora_salida  TEXT,
  eventos      JSONB       DEFAULT '[]'::jsonb,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fichajes DISABLE ROW LEVEL SECURITY;
-- MIGRACIÓN (ejecutar si la tabla ya existe):
-- ALTER TABLE fichajes ADD COLUMN IF NOT EXISTS eventos JSONB DEFAULT '[]'::jsonb;
-- NOTIFY pgrst, 'reload schema';

-- ── Tabla de reportes de software ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reportes (
  id              BIGINT      PRIMARY KEY,
  creado_por      TEXT        NOT NULL,
  titulo          TEXT        NOT NULL,
  descripcion     TEXT        NOT NULL,
  estado                TEXT        DEFAULT 'Pendiente',
  respuesta_admin       TEXT        DEFAULT '',
  confirmacion_usuario  TEXT        DEFAULT '',
  fecha                 TEXT        NOT NULL,
  hora                  TEXT        NOT NULL DEFAULT '',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE reportes DISABLE ROW LEVEL SECURITY;

-- ── Tabla de registro de llamadas comerciales ────────────────────────────────
CREATE TABLE IF NOT EXISTS llamadas (
  id               BIGINT      PRIMARY KEY,
  fecha            TEXT        NOT NULL,
  hora             TEXT        NOT NULL,
  nombre           TEXT        NOT NULL,
  dni              TEXT        NOT NULL,
  precio_kw        NUMERIC,
  permanencia      TEXT        NOT NULL DEFAULT 'Sin permanencia',
  tiempo_llamada   TEXT,
  captura_url      TEXT,
  tipo_cliente     TEXT        NOT NULL DEFAULT 'Cliente Potencial',
  comentarios      TEXT,
  registrado_por   TEXT        NOT NULL,
  equipo           TEXT        DEFAULT 'Ambos',
  deleted_at       TIMESTAMPTZ DEFAULT NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE llamadas DISABLE ROW LEVEL SECURITY;

-- =============================================================================
--  FIN DEL SCRIPT
--  El propio CRM sembrará los usuarios y la configuración inicial
--  la primera vez que se cargue la aplicación.
-- =============================================================================
