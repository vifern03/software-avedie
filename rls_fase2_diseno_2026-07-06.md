# Fase 2 RLS — Diseño de políticas reales (2026-07-06)

## 1. Modelo de datos confirmado (leyendo el código real, no solo el mapa previo)

"Sede" no es una tabla ni un `sede_id` — es directamente la columna de texto `equipo`
(`'Palencia'`, `'Valladolid'`, `'Ninguno'` = sin sede, `'Ambos'` = pertenece a ambas sedes).
Existe en `usuarios.equipo`, `clientes.equipo`, `visitas.equipo` (esta última **no se usa** para
filtrar, ver abajo) y no existe en absoluto en `visitas_pymes`, `reportes`, `fichajes`.

| Tabla | Columna "propietario" | Columna "sede" real usada en el filtro |
|---|---|---|
| clientes | `comercial`, `creado_por`, `vendido_por` (los 3 cuentan como "propio") | `equipo` |
| actividades | `comercial` (existe pero NO se usa para filtrar — feed compartido a propósito) | — |
| visitas | `registrado_por` | `punto_venta` (¡no `equipo`! la columna `equipo` se guarda pero no se usa para acceso) |
| visitas_pymes | `registrado_por` | no existe |
| reportes | `creado_por` | no existe |
| configuracion | — (clave/valor global, no hay "propietario") | — |
| telemarketing_contactos | — (lista compartida, acceso real es por **provincia** vía `configuracion.telemarketing_calles`, no por sede/usuario) | — |
| telemarketing_gestiones | `registrado_por` | — |
| fichajes | `usuario` | no existe |

Además, `clientes` tiene dos mecanismos de visibilidad extra ya en producción que no estaban en
las reglas de negocio que diste, y que decidí **preservar** para no romper funcionalidad real:
- `compartido_con` (array de **displayName**, no username — bug ya conocido de Fase anterior)
- Vendedor/prescriptor: `vendido_por`/`creado_por` por displayName, incluyendo alias vía
  `configuracion.prescriptor_links` (ej. "ANGEL LUIS" → `ANGELGARCIA`). Comprobé que este dato
  SÍ está en uso real (7 vínculos activos), así que lo incluí en la política aunque no lo
  mencionaste — omitirlo habría hecho que la mayoría del equipo comercial dejara de ver parte de
  sus propias ventas.

## 2. JWT propio — diseño final y por qué cambió de planteamiento

**Bloqueo encontrado:** el plan original (RPC firma un JWT con un secreto interno) no era viable
tal cual porque Postgres no tiene acceso al secreto HS256 que usa PostgREST para verificar
tokens — no existe como GUC en este proyecto. La alternativa habría sido migrar a Supabase Auth
real (crear `auth.users`, sesiones GoTrue, una función serverless con el service_role) — mucho
más grande de lo que pediste.

**Solución real:** la Management API de Supabase SÍ expone ese secreto
(`GET /v1/projects/{ref}/postgrest`). Lo obtuve una única vez y lo guardé cifrado en
**Supabase Vault** (`vault.create_secret`, nombre `app_jwt_secret_custom`) — no vive en ningún
archivo del repo, no lo ve el frontend, y solo es legible desde funciones `SECURITY DEFINER`
(anon/authenticated no tienen ningún privilegio sobre el esquema `vault`, verificado).

`verificar_login()` ahora, tras validar la contraseña, firma un JWT (extensión `pgjwt`, HS256)
con estos claims:

```json
{
  "role": "authenticated",
  "sub": "ELISAGARCIA",
  "app_username": "ELISAGARCIA",
  "app_role": "comercial",
  "app_sede": "Palencia",
  "app_display_name": "ELISA GARCIA",
  "iat": 1783331449,
  "exp": 1785923449
}
```

`exp` a **30 días**: la app actual no expira sesión nunca (persiste en localStorage
indefinidamente hasta logout manual). Un `exp` corto habría sido una regresión real — usuarios
desconectados a media jornada sin entender por qué. 30 días preserva ese comportamiento de facto;
un refresco silencioso más corto queda como mejora futura (Fase 3), no crítico ahora.

**Verificado end-to-end antes de tocar RLS**: llamé a `verificar_login`, tomé el token devuelto,
lo mandé como `Authorization: Bearer` en una llamada real a PostgREST — confirmado que Postgres
cambia a `role=authenticated` y `auth.jwt()` expone todos los claims custom correctamente
(comparado contra una llamada de control solo con la anon key, que da `role=anon`).

**Cambio en el cliente**: `supabase-js` soporta la opción `accessToken` (callback que se llama en
cada request) — se configura para devolver el JWT propio guardado tras el login, o la anon key
si no hay sesión (igual que hoy, antes de loguearse).

## 3. Políticas por tabla

Todas usan `(auth.jwt() ->> 'app_role')`, `app_sede`, `app_username`, `app_display_name`.
USING y WITH CHECK son la misma expresión en todas (hoy tampoco hay restricción de edición más
estricta que la de lectura en ningún sitio del código — mantenerlas iguales no reduce nada que
ya funcionara).

**clientes**
```
admin/manager → todo
comercial → propio (comercial/creado_por/vendido_por = username)
        OR sede = 'Ambos'
        OR (sede NOT IN ('Ninguno','Ambos') AND equipo = sede)
        OR compartido_con contiene displayName
        OR vendido_por/creado_por = displayName
        OR vendido_por/creado_por coincide con un alias en configuracion.prescriptor_links
           vinculado a este username
```

**actividades** → **sin cambio, permisiva.** Es un feed de actividad compartido por diseño
(todo el equipo ve las altas/visitas/ediciones de todos) — aplicar "solo lo tuyo" aquí rompería
una funcionalidad real sin motivo de negocio dado. Lo marco como excepción deliberada.

**visitas** (tienda)
```
admin → todo
manager/comercial → propio (registrado_por = username)
                 OR sede = 'Ambos'
                 OR (sede NOT IN ('Ninguno','Ambos') AND punto_venta = sede)
```
(manager NO tiene acceso total aquí — regla explícita: solo altas B2B/B2C y visitas pyme)

**visitas_pymes**
```
admin/manager → todo
comercial → propio (registrado_por = username), sin excepción de sede (no existe esa columna)
```

**reportes**
```
admin → todo
manager/comercial → propio (creado_por = username)
```

**configuracion** → SELECT sin cambio (permisiva: todos necesitan leer permisos/pin/config para
que la app funcione). INSERT/UPDATE/DELETE restringido a `app_role = 'admin'` — endurece un hueco
real (hoy cualquiera podría escribir ahí vía API directa) sin tocar nada, porque en el código
todas las escrituras a `configuracion` ya solo se disparan desde pantallas de admin.

**telemarketing_contactos** → **sin cambio, permisiva.** El control de acceso real es por
provincia (`configuracion.telemarketing_calles`), una dimensión que no está en las reglas de
negocio que diste. Portarlo a RLS es un trabajo aparte — lo dejo señalado como pendiente, no
lo improviso ahora.

**telemarketing_gestiones** → SELECT sin cambio (permisivo: el historial de llamadas de un
contacto se ve completo entre todo el equipo, por diseño). INSERT/UPDATE restringido a
`registrado_por = username OR app_role IN ('admin','manager')` — cierra un hueco real detectado
en el diagnóstico anterior (cualquiera podía editar gestiones ajenas por id).

**fichajes**
```
admin → todo (coincide exactamente con la lista ADMINS=['victor','adolfo'] del código actual)
manager/comercial → propio (usuario = username)
```

**usuarios** → fuera de esta fase (no estaba en tu lista de 9 tablas); se queda con la política
permisiva de Fase 1.

## 4. Usuarios de prueba

Roster real disponible (confirmado en BD):
- admin: Victor, Adolfo
- manager: **CAROLINAPOLVOROSA** (Palencia) — no tengo su contraseña real
- comercial con sede: ELISAGARCIA (Palencia), CARMENBALLESTEROS (Valladolid), IRENEBONILLO (Palencia), ISABELERICE (Palencia), OSCARZAMARRO (Valladolid)
- comercial sin sede: ELENAFERNANDEZ, ANGELGARCIA, OSCARFERNANDEZ, SOFIABALLESTEROS

Decisión (sin poder preguntarte, siguiendo el criterio de "no tocar cuentas reales"): en vez de
resetear la contraseña de Carolina o pedirte credenciales, creo un usuario de prueba temporal
`TESTMANAGER2026` (role=manager, equipo=Palencia) solo para este test, y lo elimino al terminar.
Para la comprobación de aislamiento entre sedes (Palencia vs Valladolid) uso comparación directa
por SQL en vez de un segundo login real — no hace falta credencial para eso.
