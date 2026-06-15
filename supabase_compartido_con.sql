-- Migración: añadir columna compartido_con a la tabla clientes
-- Ejecutar UNA VEZ en el Editor SQL de Supabase (https://supabase.com/dashboard)
-- Project: ndcslcsuavjdctqhkrfu

ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS compartido_con text[] DEFAULT '{}';

-- Verificar que la columna se creó correctamente:
-- SELECT id, nombre, compartido_con FROM clientes LIMIT 5;
