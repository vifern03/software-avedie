-- =============================================================================
--  Migración: Permisos de Compartición de Contratos
--  Ejecutar UNA VEZ en el Editor SQL de Supabase (https://supabase.com/dashboard)
--  Project: ndcslcsuavjdctqhkrfu
-- =============================================================================
--
--  NOTA DE SEGURIDAD: este proyecto usa autenticación propia (tabla `usuarios`
--  + RPC `verificar_login`), no Supabase Auth. Por eso RLS está deshabilitado
--  en todas las tablas (ver supabase_init.sql) y la Fase 2 de RLS con JWT
--  propio se revirtió el 2026-07-06 por romper sesiones (commit 53a627d).
--  Siguiendo esa misma línea, esta migración NO añade políticas RLS: el
--  control de "quién puede compartir con quién" se aplica en la capa de
--  aplicación (React), igual que el resto de permisos por rol/página que ya
--  existen en la tabla `configuracion`.
-- =============================================================================

-- ── Tabla de permisos de compartición ────────────────────────────────────────
-- Fila (comercial_username, allowed_username) = "comercial_username puede
-- compartir sus contratos con allowed_username".
CREATE TABLE IF NOT EXISTS share_permissions (
  id                 BIGSERIAL   PRIMARY KEY,
  comercial_username TEXT        NOT NULL REFERENCES usuarios(username) ON DELETE CASCADE,
  allowed_username   TEXT        NOT NULL REFERENCES usuarios(username) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (comercial_username, allowed_username)
);
CREATE INDEX IF NOT EXISTS idx_share_permissions_comercial ON share_permissions(comercial_username);
ALTER TABLE share_permissions DISABLE ROW LEVEL SECURITY;

-- ── Columna que registra quién compartió el contrato ─────────────────────────
-- Almacena el username (no el display name) de quien pulsó "Compartir",
-- para que sea estable aunque el nombre visible cambie más adelante.
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS shared_by TEXT REFERENCES usuarios(username);

-- Verificación:
-- SELECT * FROM share_permissions;
-- SELECT id, nombre, compartido_con, shared_by FROM clientes WHERE shared_by IS NOT NULL LIMIT 5;
