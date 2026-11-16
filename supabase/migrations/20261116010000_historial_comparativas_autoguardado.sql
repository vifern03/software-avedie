-- Historial de Comparativas: guardado automático (2026-11-16).
-- La comparativa se guarda sola al calcularse y, si después se retocan datos en la misma
-- sesión, se actualiza esa misma ficha en vez de crear otra. Solo afecta a las tablas del
-- historial (creadas hoy). Sigue sin poder borrarse nada.
BEGIN;

GRANT UPDATE (equipo, tipo, tarifa_acceso, producto, cliente, cups, potencias, consumos,
  consumo_total_kwh, consumo_anual_kwh, dias, importe_actual, importe_oferta, ahorro,
  ahorro_pct, ahorro_anual, datos, tiene_factura, factura_nombre)
  ON public.historial_comparativas TO anon, authenticated;

CREATE POLICY hca_update ON public.historial_comparativas_archivos
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
GRANT UPDATE (pdf_comparativa, factura) ON public.historial_comparativas_archivos TO anon, authenticated;

COMMIT;
