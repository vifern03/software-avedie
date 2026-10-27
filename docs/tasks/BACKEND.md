# Tasks — backend (Supabase local)

Todo lo de aquí es **solo local (Docker)**. `.env` / `.env.local` apuntan a PRODUCCIÓN: no se usan.
Nunca `supabase link` ni `supabase db push` desde este repo.

## Archivos

| archivo | qué es |
|---|---|
| `supabase/config.toml` | proyecto CLI local (`project_id = "CRM_AVEDIE"`) |
| `supabase/migrations/20261026000000_baseline_SOLO_LOCAL_no_ejecutar_en_produccion.sql` | esquema aproximado de producción (aborta si `usuarios` ya existe) |
| `supabase/migrations/20261026010000_tasks.sql` | módulo Tasks: tablas, trigger, RLS, realtime, RPC |
| `supabase/rollback/20261026010000_tasks_down.sql` | rollback de Tasks (idempotente) |
| `supabase/seed.sql` | datos ficticios (usuarios + 23 tareas con eventos) |
| `tests/sql/tasks_permisos.sql` | pruebas de permisos (63 aserciones) |

## Arrancar

```bash
npx supabase start          # primera vez descarga imágenes (Docker debe estar corriendo)
npx supabase status         # URLs y claves
npx supabase db reset       # recrea la BD: baseline + tasks + seed.sql
npx supabase stop           # parar
```

Valores locales (públicos de demo de la CLI, no son secretos):

- API / PostgREST: `http://127.0.0.1:54321` (REST en `/rest/v1`)
- Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` (contenedor `supabase_db_CRM_AVEDIE`)
- Studio: `http://127.0.0.1:54323`
- Anon key:
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0`

Para apuntar el frontend a local sin tocar `.env*`, arrancar Vite con las variables en la línea de comandos
(tienen prioridad sobre los ficheros `.env`):

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=<anon key de arriba> npm run dev
```
(Son las variables que lee `src/lib/supabase.js`. En PowerShell: `$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'; $env:VITE_SUPABASE_ANON_KEY='<anon key>'; npm run dev`.)

### Usuarios del seed (ficticios)

| usuario | rol | contraseña | nombre |
|---|---|---|---|
| `admin` | admin | `admin1234` | Laura Prieto Alonso |
| `manager1` | manager | `prueba1234` | Marta Gil Ortega |
| `manager2` | manager | `prueba1234` | Javier Rueda Sanz |
| `comercial1` | comercial | `prueba1234` | Lucía Martín Calvo |
| `comercial2` | comercial | `prueba1234` | Pablo Herrero Díaz |
| `comercial3` | comercial | `prueba1234` | Sara Núñez Velasco |

Además: `comercial_baja` (dado de baja, para pruebas) y `Victor` (fila marcadora dada de baja con
contraseña aleatoria: evita que `src/lib/initDB.js` inserte en la BD local al admin protegido con su
contraseña real). Contraseñas en sha256 hex, que es lo que espera `verificar_login`.
`configuracion` trae `permissions` (con `tasks: true` en los tres roles), `pin` (`"0000"`),
`user_permissions`, `telemarketing_calles` y `prescriptor_links`. Buckets `pymes-fotos` y `visitas-dni`
creados vacíos (sin políticas de Storage: subir ficheros en local puede fallar).

Tareas: fechas relativas a `now()` en Europe/Madrid → siempre hay vencidas, próximas 24 h, sin fecha,
en curso, completadas, reabierta, reasignada, archivadas, personales, de manager a comerciales y dos grupos
múltiples. Colores fijados para `comercial1` y `manager1`.

## Aplicar / revertir la migración de Tasks (sin reset)

```bash
D="docker exec -i supabase_db_CRM_AVEDIE psql -U postgres -v ON_ERROR_STOP=1"
$D < supabase/rollback/20261026010000_tasks_down.sql   # quita funciones, publicación y tablas (+ fila de schema_migrations)
npx supabase migration up                               # vuelve a aplicar lo pendiente
```

Comprobado: aplicar → rollback → rollback (idempotente) → aplicar → pruebas OK. El rollback borra los datos
de Tasks; para recuperar el seed, `npx supabase db reset`.

## Probar

```bash
docker exec -i supabase_db_CRM_AVEDIE psql -U postgres -v ON_ERROR_STOP=1 < tests/sql/tasks_permisos.sql
```

Corre en una transacción que se deshace (no deja datos), crea sus propios usuarios `t_*` y ejecuta las RPC
**como `anon`**. Termina con `==> TODAS LAS PRUEBAS DE tasks_permisos.sql HAN PASADO`; si una aserción
falla lanza `FALLO: ...` y psql sale con código ≠ 0. Cubre: actor inexistente/borrado/nulo; comercial solo
para sí; validaciones; grupo múltiple (sin duplicados, mismo `group_id`); `due_at` Madrid y 23:59:59;
editar (permisos, claves no permitidas, null = borrar, evento `changes {from,to}`); estado
(`completed_at/completed_by` se fijan y se borran al reabrir, eventos); comentar; mover (solo creador/admin,
no toca deadline); reasignar (manager no reasigna tareas de otro manager, comercial no reasigna); archivar
(bloquea modificaciones); colores solo admin; helpers internos no ejecutables por anon; sin borrados físicos.

Verificado también vía PostgREST con la anon key (curl): `verificar_login`, todas las RPC (incluidos los
errores `P0001` con mensaje en español en `message`), y SELECT de `tasks`, `task_events`,
`task_user_preferences`, `usuarios` y `configuracion`.

## API para el frontend

Errores: todas las RPC lanzan `P0001` con mensaje en español → en supabase-js llega en `error.message`.

| RPC | parámetros (en orden) | devuelve |
|---|---|---|
| `tasks_crear` | `p_actor text, p_title text, p_description text = null, p_assignees text[] = null (null/vacío = yo), p_priority text = 'normal', p_planned_date date = null, p_planned_time time = null, p_due_date date = null, p_due_time time = null` | `setof tasks` |
| `tasks_editar` | `p_actor text, p_id uuid, p_cambios jsonb` (claves: title, description, priority, planned_date, planned_time, due_date, due_time; `null` = borrar) | `tasks` |
| `tasks_cambiar_estado` | `p_actor text, p_id uuid, p_status text` | `tasks` |
| `tasks_reasignar` | `p_actor text, p_id uuid, p_assignee text` | `tasks` |
| `tasks_mover` | `p_actor text, p_id uuid, p_planned_date date, p_planned_time time = null` | `tasks` |
| `tasks_archivar` | `p_actor text, p_id uuid, p_archivar boolean = true` | `tasks` |
| `tasks_comentar` | `p_actor text, p_id uuid, p_comentario text` | `task_events` |
| `tasks_set_color` | `p_actor text, p_username text, p_color text` (`#RRGGBB`; `null` = volver al automático) | `task_user_preferences` |
| `tasks_contador` (opcional) | `p_username text` | `{activas, vencidas, proximas}` (asignadas a él, no archivadas ni completadas) |

Comportamientos a tener en cuenta:
- Si la acción no cambia nada (mismo estado, mismo responsable, mismas fechas, archivar ya archivada,
  editar sin diferencias) la RPC devuelve la fila tal cual **sin** registrar evento.
- Tarea archivada: no se puede editar, mover, reasignar ni cambiar de estado (error "La tarea está
  archivada; desarchívala…"). Sí comentar y desarchivar.
- Hora sin fecha (planificada o deadline) → error. Título se guarda recortado (`trim`); descripción vacía → null.
- Payloads de `task_events`: `created {assignee, group_id}`, `updated {changes:{campo:{from,to}}}`,
  `status_changed|completed|reopened {from,to}`, `reassigned {from,to}`,
  `moved {from:{planned_date,planned_time}, to:{…}}`, `commented {comment}`, `archived|unarchived {}`.
- Realtime: `tasks` (REPLICA IDENTITY FULL → UPDATE/DELETE con fila completa) y `task_events` están en
  `supabase_realtime`.

## Producción (aplicado el 2026-10-27)

- Se aplicó a mano **solo** `20261026010000_tasks.sql` en el proyecto Software Avedie (ndcslcsuavjdctqhkrfu),
  dentro de `BEGIN … COMMIT`, con `npx supabase db query --linked --project-ref ndcslcsuavjdctqhkrfu -f …`.
  Ni baseline ni seed. Producción no tiene `supabase_migrations.schema_migrations`: no hay registro de migraciones.
- Revisado antes: `usuarios.username` es `text` PRIMARY KEY, existen `role` y `deleted_at`, no había objetos
  `task*`, existe la publicación `supabase_realtime`; los usuarios solo se dan de baja con `deleted_at`
  (las FK `ON DELETE RESTRICT` no afectan a nada existente).
- Para revertir: `supabase/rollback/20261026010000_tasks_down.sql` (borra los datos de Tareas).
- En la interfaz el módulo se llama "Tareas"; el id interno (`tasks`), las tablas y las RPC no cambian.

## Pendiente de seguridad

- **`p_actor` no es una identidad verificada.** Cualquiera con la anon key puede llamar a las RPC
  diciendo ser otro usuario. Las comprobaciones de rol/permisos son defensa razonable frente a errores de
  la UI, no seguridad real. Igual que hoy el resto del CRM (login propio vía `verificar_login`, sin token).
- **Políticas permisivas** (`fase1_permisivo`, `USING (true) WITH CHECK (true)` para anon y authenticated)
  en `tasks`, `task_events` y `task_user_preferences`, con el mismo criterio que `rls_fase1`, pero anon y
  authenticated solo tienen SELECT: INSERT/UPDATE/DELETE/TRUNCATE directos están revocados y toda escritura
  pasa por las RPC (SECURITY DEFINER).
- La visibilidad (admin todo; resto `created_by = yo` o `assignee = yo`) la aplica el frontend en sus
  consultas, no la BD.
- A retomar en la futura fase de seguridad (ver memoria "RLS Fase 2"): token firmado en el login, RPC que
  lean el actor del token en lugar de `p_actor`, y políticas RLS reales por rol.
- El baseline local es una reconstrucción aproximada de producción; antes de aplicar
  `20261026010000_tasks.sql` en producción hay que revisarlo contra el esquema real (FK a
  `usuarios(username)`, existencia de la publicación `supabase_realtime`) y aplicarlo a mano, no con `db push`.
