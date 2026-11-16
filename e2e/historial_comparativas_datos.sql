-- Datos ficticios para probar en el Supabase de PRUEBAS (rkqgttpiojjorgwikivr). NUNCA en producción.
-- Solo inserta filas nuevas reconocibles (usuarios prueba_*, clientes 92000xx, comparativas 92000xx).
-- Contraseña de los tres usuarios: prueba1234
BEGIN;

INSERT INTO public.usuarios (username, password, role, display_name, is_undeletable, security_pin, equipo)
VALUES
  ('prueba_admin',   encode(extensions.digest('prueba1234','sha256'),'hex'), 'admin',     'PRUEBA ADMIN',    false, '000000', 'Palencia'),
  ('prueba_sede',    encode(extensions.digest('prueba1234','sha256'),'hex'), 'comercial', 'PRUEBA SEDE',     false, '000000', 'Palencia'),
  ('prueba_sinsede', encode(extensions.digest('prueba1234','sha256'),'hex'), 'comercial', 'PRUEBA SIN SEDE', false, '000000', 'Ninguno')
ON CONFLICT (username) DO NOTHING;

INSERT INTO public.clientes (id, tipo, nombre, cif_dni, telefono, cups, tarifa, linea_negocio, estado, comercial, creado_por, equipo, fecha_tramitacion, compartido_con, shared_by)
VALUES
  (9200001, 'B2C', 'DEMO PENDIENTE FIRMA',   '00000001A', '600000001', 'ES0000980000000101DM', '2.0TD', 'Electricidad', 'Pendiente Firma',       'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{}', NULL),
  (9200002, 'B2C', 'DEMO ENVIADO BACKOFFICE','00000002A', '600000002', 'ES0000980000000102DM', '2.0TD', 'Electricidad', 'Enviado a Back Office', 'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{}', NULL),
  (9200003, 'B2C', 'DEMO TRAMITADO',         '00000003A', '600000003', 'ES0000980000000103DM', '2.0TD', 'Electricidad', 'Tramitado',             'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{"PRUEBA SIN SEDE"}', 'prueba_sede'),
  (9200004, 'B2C', 'DEMO FORMALIZADO',       '00000004A', '600000004', 'ES0000980000000104DM', '2.0TD', 'Electricidad', 'Formalizado',           'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{}', NULL),
  (9200005, 'B2B', 'DEMO EMPRESA INCIDENCIA','B00000005', '600000005', 'ES0000980000000003DM', '3.0TD', 'Electricidad', 'Tramitado',             'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{}', NULL),
  (9200006, 'B2B', 'DEMO EMPRESA BACKOFFICE','B00000006', '600000006', 'ES0000980000000106DM', '6.1TD', 'Electricidad', 'Enviado a Back Office', 'prueba_sede', 'Canal Directo', 'Palencia', CURRENT_DATE, '{}', NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.historial_comparativas (id, created_at, realizada_por, equipo, tipo, tarifa_acceso, producto, cliente, cups, potencias, consumos, consumo_total_kwh, dias, importe_actual, importe_oferta, ahorro, ahorro_pct, ahorro_anual, datos, tiene_factura, factura_nombre, cliente_id, alta_tipo)
VALUES
  (9200101, now() - interval '3 day', 'prueba_sede', 'Palencia', 'luz_20', '2.0TD', 'Luz Fija 24H — Con Prescriptor', 'DEMO ENVIADO BACKOFFICE', 'ES0000980000000102DM',
   '{"P1":4.6,"P2":4.6}', '{"P1":120,"P2":95,"P3":140}', 355, 30, 98.40, 81.10, 17.30, 21.3, 210.48, '{"tarifaId":"prescriptor"}', true, 'factura_demo.pdf', 9200002, 'B2C'),
  (9200102, now() - interval '1 day', 'prueba_admin', 'Palencia', 'luz_b2b', '3.0TD', 'Open 3.0TD — Plana', 'DEMO TALLER SIN ALTA', 'ES0000980000000201DM',
   '{"P1":35,"P2":51,"P3":51,"P4":51,"P5":51,"P6":51}', '{"P1":0,"P2":0,"P3":0,"P4":1936,"P5":952,"P6":1240}', 4128, 31, 767.90, 690.20, 77.70, 11.3, 914.87, '{"nivel":"30","productoId":"open"}', true, 'factura_taller.pdf', NULL, NULL),
  (9200103, now() - interval '2 hour', 'prueba_sinsede', 'Ninguno', 'luz_20', '2.0TD', 'TEMPO 2.0TD', 'DEMO COMERCIAL SIN SEDE', 'ES0000980000000301DM',
   '{"P1":5.75,"P2":5.75}', '{"P1":210,"P2":180,"P3":260}', 650, 31, 160.20, 139.80, 20.40, 14.6, 240.19, '{"tarifaId":"tempo"}', false, NULL, NULL, NULL),
  (9200104, now() - interval '5 hour', 'prueba_sede', 'Palencia', 'luz_b2b', '3.0TD', 'Open 3.0TD — Día', 'DEMO EMPRESA INCIDENCIA', 'ES0000980000000003DM',
   '{"P1":40,"P2":40,"P3":40,"P4":40,"P5":40,"P6":40}', '{"P4":2500,"P5":1100,"P6":1600}', 5200, 30, 980.00, 905.00, 75.00, 8.3, 912.50, '{"nivel":"30","productoId":"open"}', false, NULL, 9200005, 'B2B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.historial_comparativas_archivos (comparativa_id, pdf_comparativa, factura)
SELECT id,
  'data:application/pdf;base64,' || encode(convert_to('%PDF-1.1 FICTICIO comparativa ' || id, 'UTF8'), 'base64'),
  CASE WHEN tiene_factura THEN 'data:application/pdf;base64,' || encode(convert_to('%PDF-1.1 FICTICIO factura ' || id, 'UTF8'), 'base64') END
FROM public.historial_comparativas WHERE id BETWEEN 9200101 AND 9200199
ON CONFLICT (comparativa_id) DO NOTHING;

COMMIT;
