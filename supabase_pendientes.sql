-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN — Módulo "Gestión de Pendientes" (embudo de incidencias)
-- Ejecutar en el SQL Editor de Supabase (Dashboard → SQL Editor → New query).
-- ══════════════════════════════════════════════════════════════════════════
--
-- estado_incidencia: null = sin incidencia. "Pendiente de tareas" (recién subido
--   desde el Excel) → "Tramitado" (el comercial ya lo resolvió) → null de nuevo
--   al Formalizar (sale del embudo).
--
-- fecha_formalizacion: se rellena con NOW() al pulsar "Formalizar" en el módulo
--   de Pendientes. NOTA: es un campo DISTINTO del ya existente `fecha_formalizada`
--   (TEXT, usado por el flujo de Alta B2C/B2B para marcar el estado "Formalizado").
--   Se mantienen separados porque pertenecen a flujos de negocio diferentes: uno
--   es la fecha en que se firma/formaliza el alta, y el otro es la fecha en que
--   se resuelve una incidencia de este embudo de Pendientes.

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS estado_incidencia   TEXT        DEFAULT NULL;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_formalizacion TIMESTAMPTZ DEFAULT NULL;
