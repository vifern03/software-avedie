-- Solo hace falta ejecutar esto si ya corriste supabase_contratos_generados.sql
-- ANTES de este cambio (columna se llamaba pdf_base64, ahora es archivo_base64
-- porque el contrato generado es un .docx real, no un PDF). La tabla está
-- vacía (0 filas), así que el rename es seguro y no pierde nada.
ALTER TABLE contratos_generados RENAME COLUMN pdf_base64 TO archivo_base64;
