# Documentación B2B: decisiones (modo autónomo)

Decisiones tomadas sin consulta, siempre por la opción más conservadora. Fecha: 31-10-2026.


## D1. Identidad en el servidor (§0.6)
- **Qué:** tabla `doc_b2b_sesiones` y RPC `doc_b2b_abrir_sesion(usuario, contraseña)`, que valida con `verificar_login` y devuelve un token opaco (7 días, solo se guarda su hash). Todas las RPC de la sección exigen `p_actor` + `p_token`.
- **Por qué:** `p_actor` no es una identidad verificada y estos datos llevan DNI e IBAN. El JWT de `verificar_login` solo existe en producción (en pruebas no), el frontend no lo guarda, y `verificar_login` no se puede modificar.
- **Sesiones ya abiertas:** el resto del CRM sigue igual. Solo esta sección pide confirmar la contraseña; no se fuerza ningún cierre de sesión (causa de la rotura de RLS Fase 2).
- **Alternativas:** usar el JWT existente (no probable en pruebas); solo `p_actor` (incumple §0.6).

## D2. URLs firmadas en Edge Function de Supabase
- **Qué:** `supabase/functions/doc-b2b-archivos`. La RPC `doc_b2b_autorizar_archivos` (solo `service_role`) decide rutas; la función firma.
- **Por qué:** Supabase inyecta la clave de servicio; no hay que copiar ese secreto a Vercel. Mismo código en pruebas y producción.
- **Alternativa:** función en `api/` de Vercel con la clave de servicio como variable de entorno.

## D3. Sobrescritura en sitio para `obtenerTarifa`
- **Qué:** la versión activa se aplica sobre los objetos de `src/data` al arrancar, solo en rutas de la lista blanca.
- **Por qué:** Consulta de Tarifas y las comparativas leen los precios nuevos sin reescribir sus imports, y sin versiones todo queda igual (hay prueba de no regresión).
- **Alternativa:** cambiar todos los imports para llamar a `obtenerTarifa`: más riesgo en módulos que no debían tocarse.

## D4. Permiso del comercial en el E2E
- **Qué:** el E2E no activa el permiso en `user_permissions`, porque es una fila existente. Redefine temporalmente en pruebas el helper propio `_doc_b2b_tiene_seccion` y lo restaura al limpiar. La lectura real de `user_permissions` se prueba en SQL, en una transacción que se deshace.
- **Alternativa:** tocar esa fila en pruebas (prohibido) o usar Supabase local (Docker no disponible).

## D5. Modo vista previa del generador
- **Qué:** `opciones.permitirVacios`. El generador original lanzaba error con obligatorios vacíos, pero la especificación pide mostrarlos en rojo y guardar.
- **Por qué:** la descarga queda bloqueada en la interfaz (visor e historial). `documentacion_b2b_versiones.completa`, columna añadida, guarda el estado; `doc_b2b_listar` lo usa para no ofrecer la descarga. La Edge Function no rechaza por este motivo a quien ya tiene permiso sobre el expediente.

## D6. Prefijos de distribuidora
- **Qué:** se admite el prefijo alfanumérico `URDZ`, que está en el CSV de la CNMC; el CSV se carga tal cual. `distribuidora_guardar` sigue exigiendo 4 o 6 dígitos.

## D7. Buckets tras un rollback
- **Qué:** Supabase no deja borrar buckets por SQL, así que el rollback los conserva y la migración reutiliza los que ya existan si son privados. Si uno fuera público, la migración aborta.

## D8. Limitaciones de las pruebas
- **Bloques de precios (§8.1):** la especificación habla de 7 bloques reales, pero en `probar.mjs` y en el documento solo hay 1 literal completo. Se prueba ese, más los tramos reales citados (63, 44 y 43,5 kW).
- **Impresión:** Chromium sin ventana no carga PDF en un `iframe`. El E2E comprueba que Imprimir crea el marco con el PDF; el cuadro de impresión no se ha probado de forma automática.
- **IA:** el E2E la simula. Se hizo además una lectura real con factura y DNI ficticios y con las 3 hojas de tarifas. La tarjeta CIF y los documentos reales no se han probado con Gemini.

## D9. Comprobación en producción
- **Qué:** usuario administrador temporal con contraseña aleatoria y cliente ficticio, borrados después junto con todo lo que generaron. No se usan cuentas ni contratos reales.
- **Por qué:** la especificación pide generar con un CUPS ficticio y borrarlo después; esas filas las crea la propia prueba, así que no son datos existentes.
