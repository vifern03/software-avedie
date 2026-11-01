# Documentación B2B

Genera el contrato y los anexos de Endesa desde Alta B2B, con visor, edición, historial y actualizador de tarifas.
Decisiones tomadas durante la construcción: `DECISIONES.md`. Distribuidoras: `docs/distribuidoras_LEEME.md`.

## Flujo

1. El usuario elige de 1 a 3 CUPS de Alta B2B, del mismo CIF, con la misma tarifa de acceso y producto Open.
2. La IA lee factura, CIF y DNI, una llamada por documento. Si una falla, sus campos quedan vacíos con ⚠ y no se bloquea.
3. `ensamblar()` construye el modelo con reglas deterministas. La IA nunca decide precios, IBAN, CUPS ni CIF.
4. El navegador genera los PDF con pdf-lib sobre las plantillas del bucket privado y los guarda como versión 1.
5. Cada edición guardada crea una versión nueva. El borrado es lógico y libera los CUPS.

## Reglas de negocio

- **Tramo:** se decide por la potencia contratada máxima (P1–P6).
- **Precio impreso:** precio base sin descuento, más el 18 % promocional y el % de la modalidad.
- **3.0TD:** Plana 15, Día 20, Laboral 25, Fin de Semana 45, Noche 55. Producto `TEL3T - TEMPO OPEN 3.0TD`, tramo `> 15kW (3.0TD)`, tensión por defecto `3X400/230` con ⚠.
- **6.1TD:** igual que 3.0TD, salvo Noche 35. Producto `TEMPO OPEN 6.1TD`, tramo `> 15kW (6.1TD)`. La tensión es la que lea la IA; si no la encuentra, queda vacía, con ⚠ y obligatoria.
- **Modalidades Día, Fin de Semana y Noche:** su texto sale de la hoja de tarifas y lleva ⚠ («Texto de modalidad sin validar con un anexo real»).
- **Tarifa caducada:** no bloquea. Se genera con la última versión, el anexo imprime su validez real, hay ⚠ en esos campos y un aviso que no bloquea. Para volver a bloquear: `PERMITIR_TARIFA_CADUCADA = false` en `src/lib/contratosEndesa/constantes.js`.
- **Obligatorios vacíos:** en rojo. Se guarda, pero no se puede descargar ni imprimir hasta completarlos.

## Archivos

| Ruta | Qué es |
|---|---|
| `src/pages/DocumentacionB2B.jsx` | Selección y resultado |
| `src/components/documentacionB2B/` | Visor, editor, historial, carga, confirmar contraseña |
| `src/components/tarifas/ActualizarTarifaModal.jsx` | «Actualizar tarifa» (solo admin) |
| `src/lib/contratosEndesa/` | Generador, ensamblado, constantes, prompts y esquemas de IA, coordenadas |
| `src/lib/documentacionB2B/` | Sesión, RPC, archivos, orquestación, capa del visor |
| `src/lib/tarifas/` | Lista blanca, `obtenerTarifa`, validación del actualizador |
| `src/lib/distribuidoras.js` | `buscarDistribuidora(cups)` |
| `supabase/functions/doc-b2b-archivos` | URLs firmadas |

## Base de datos

Migración: `supabase/migrations/20261031000000_documentacion_b2b.sql` (solo añade).

| Tabla | Uso | Acceso directo |
|---|---|---|
| `distribuidoras_electricidad` | 357 distribuidoras | Solo lectura |
| `tarifas_versiones` | Precios por versión; una activa por tarifa | Solo lectura |
| `documentacion_b2b` | Expediente | Ninguno, solo RPC |
| `documentacion_b2b_cups` | Índice único parcial: un CUPS, una documentación activa | Ninguno, solo RPC |
| `documentacion_b2b_versiones` | Foto de datos, avisos, editados y documentos | Ninguno, solo RPC |
| `doc_b2b_sesiones` | Sesiones propias de la sección (hash del token) | Ninguno, solo RPC |

Buckets privados, sin políticas: `plantillas-contratos`, `tarifas-pdf`, `documentacion-b2b` (`{id}/v{n}/{tipo}.pdf`).

### RPC

Todas reciben `p_actor` y `p_token`, salvo las de sesión.

| RPC | Quién |
|---|---|
| `doc_b2b_abrir_sesion`, `doc_b2b_cerrar_sesion` | Cualquier usuario, con su contraseña o su token |
| `doc_b2b_crear` | Con acceso a la sección y a los contratos |
| `doc_b2b_nueva_version`, `doc_b2b_borrar` | Admin, manager o quien lo generó |
| `doc_b2b_compartir` | Admin y manager |
| `doc_b2b_listar` | `mias`: con acceso. `global`: admin y manager |
| `doc_b2b_detalle`, `doc_b2b_cups_activos` | Con acceso |
| `distribuidora_guardar`, `tarifa_guardar_version` | Admin |
| `doc_b2b_autorizar_archivos` | Solo `service_role` (la Edge Function) |

Cada acción se registra en Historial de Actividades con el tipo `Documentación B2B`.

## Permisos

- Sección `documentacion_b2b` en Gestión de Usuarios: activa por defecto para admin y manager. A cada comercial se le activa a mano. Se aplica en el menú y también en las RPC.
- Comercial con acceso: genera con los contratos que ya ve; edita y borra solo lo que generó.
- Destinatario de algo compartido: lo ve y lo descarga, con «Generado por». No lo edita ni lo borra, salvo que sea admin o manager.
- Documentación borrada: solo admin y manager la descargan.
- «Actualizar tarifa»: solo admin.

## Tarifas

`sincronizarTarifas()` aplica la versión activa sobre los objetos de `src/data/` al arrancar, solo en las rutas de la lista blanca (`src/lib/tarifas/registro.js`). Consulta de Tarifas, comparativas y generador leen esos mismos objetos. Sin versiones en la base de datos, todo queda exactamente como en `src/data/`.

## Pruebas

```bash
npm test
npx supabase db query --linked --project-ref rkqgttpiojjorgwikivr -f tests/sql/documentacion_b2b_permisos.sql
# Resultado correcto del SQL: el error TODO_OK (la transacción se deshace siempre)
node e2e/documentacion_b2b_datos.mjs rkqgttpiojjorgwikivr preparar
# Vite contra pruebas en el puerto 5190; después:
node e2e/documentacion_b2b.cjs 5190 <carpeta_salida>
node e2e/documentacion_b2b_datos.mjs rkqgttpiojjorgwikivr limpiar
```

`e2e/documentacion_b2b_datos.mjs` se niega a ejecutarse contra producción. El E2E simula `/api/gemini`.

## Rollback

1. Código: revertir los commits en `main`, o volver al despliegue anterior en Vercel.
2. Edge Function: `npx supabase functions delete doc-b2b-archivos --project-ref <ref>`.
3. Base de datos: `npx supabase db query --linked --project-ref <ref> -f supabase/rollback/20261031000000_documentacion_b2b_down.sql`.

El paso 3 borra expedientes, versiones de tarifa, distribuidoras y sesiones. Los PDF y los buckets se quedan: Supabase no deja borrarlos por SQL. Son privados y no tienen políticas; para quitarlos, hay que vaciarlos desde Storage. Las filas de Historial de Actividades se conservan. Si se aplica una versión de tarifa y luego se revierte, Consulta de Tarifas vuelve a los valores de `src/data/`.

## Pendientes conocidos

- **Número de oferta:** `0000000` con ⚠ hasta que Endesa diga qué poner.
- **Distribuidoras:** solo 3 textos de Endesa verificados (0021, 0022 y 003150). El resto se completa al aparecer.
- **Máximo 3 suministros** por documentación.
- **TEMPO 2.0TD, Simply, Indexada y gas:** fuera de esta versión.
- **Tipografía:** los datos van en Helvetica; las etiquetas, en la tipografía original de Endesa.
- **Tarifas Simply e Indexada:** «Actualizar tarifa» cambia sus precios, pero la marca `precioSinActualizar` es un dato de `src/data/` y sigue activa hasta retirarla en el código.
