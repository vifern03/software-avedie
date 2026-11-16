BEGIN;
REVOKE UPDATE (equipo, tipo, tarifa_acceso, producto, cliente, cups, potencias, consumos,
  consumo_total_kwh, consumo_anual_kwh, dias, importe_actual, importe_oferta, ahorro,
  ahorro_pct, ahorro_anual, datos, tiene_factura, factura_nombre)
  ON public.historial_comparativas FROM anon, authenticated;
REVOKE UPDATE (pdf_comparativa, factura) ON public.historial_comparativas_archivos FROM anon, authenticated;
DROP POLICY IF EXISTS hca_update ON public.historial_comparativas_archivos;
COMMIT;
