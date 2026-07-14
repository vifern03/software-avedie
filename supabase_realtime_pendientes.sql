-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — Habilitar Supabase Realtime en registro_pendientes
-- Ejecutar en el SQL Editor de Supabase (Dashboard → SQL Editor → New query).
-- ══════════════════════════════════════════════════════════════════════════
--
-- Sin esto, la tabla no emite eventos por websocket y la suscripción de
-- DataContext.jsx (canal 'pendientes_channel') no recibirá nada aunque el
-- código esté bien.

-- REPLICA IDENTITY FULL: para que los payloads de UPDATE/DELETE incluyan la
-- fila completa (no solo el id), necesario para poder actualizar el estado
-- local sin tener que volver a pedir los datos a Supabase en cada evento.
ALTER TABLE registro_pendientes REPLICA IDENTITY FULL;

-- Añade la tabla a la publicación que usa Supabase Realtime. Si ya estuviera
-- añadida, este comando da un error "already member of publication" que se
-- puede ignorar sin problema (o comprobar antes con el SELECT de abajo).
ALTER PUBLICATION supabase_realtime ADD TABLE registro_pendientes;

-- Para comprobar qué tablas ya emiten eventos Realtime:
-- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
