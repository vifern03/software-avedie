# Tasks — contrato entre backend y frontend (v2, 2026-10-27)

## ⚠️ CAMBIO v2 (decisión del responsable, prevalece sobre todo lo de abajo)

La seguridad se abordará aparte más adelante. **Fuera de alcance ahora:** token JWT en el login,
`accessToken`, `src/lib/supabaseAuthed.js`, migración de seguridad de `usuarios` (RPC admin_*),
cualquier cambio en `verificar_login` o en `AuthContext` (salvo añadir `tasks: true` a `DEFAULT_PERMISSIONS`)
y RLS real. No se toca la autenticación ni la seguridad existente.

Sustituye a las secciones "Identidad" y "Gestión de usuarios":
- Tasks usa el cliente normal `src/lib/supabase.js` (anon), como el resto del CRM.
- Tablas `tasks`, `task_events`, `task_user_preferences` con el MISMO criterio que el resto del CRM
  hoy (RLS activado + política permisiva `USING (true) WITH CHECK (true)` para anon y authenticated, como
  `rls_fase1`), para que la seguridad futura pueda endurecerlas igual que las demás.
- Las mutaciones siguen siendo RPC (para que `completed_at` y `now()` los ponga el servidor y se registren
  eventos en la misma transacción), pero reciben el actor como primer parámetro: `p_actor text`
  (username del usuario conectado). Las RPC validan que `p_actor` existe y está activo y aplican las reglas
  de permisos del contrato según el rol de `p_actor` leído de `usuarios` (defensa razonable, no seguridad
  real: se documenta como pendiente). GRANT EXECUTE a anon y authenticated.
- Firmas: `tasks_crear(p_actor, p_title, ...)`, `tasks_editar(p_actor, p_id, p_cambios)`,
  `tasks_cambiar_estado(p_actor, p_id, p_status)`, `tasks_reasignar(p_actor, p_id, p_assignee)`,
  `tasks_mover(p_actor, p_id, p_planned_date, p_planned_time)`, `tasks_archivar(p_actor, p_id, p_archivar)`,
  `tasks_comentar(p_actor, p_id, p_comentario)`, `tasks_set_color(p_actor, p_username, p_color)`.
- Lecturas directas con `from(...)`; la UI filtra por visibilidad (admin todo; resto `created_by = yo` o
  `assignee = yo`) y además las consultas del frontend YA incluyen ese filtro (no traer datos ajenos).
- Frontend: sin pantalla de "inicia sesión de nuevo". `DEFAULT_PERMISSIONS.tasks = true` lo añade el frontend.
- Backend: solo Supabase local (Docker) + migración de Tasks + rollback + seed ficticio + pruebas.

## CAMBIO v3 (2026-10-29): borrar y compartir

- **Borrar** (borrado lógico, `tasks.deleted_at`): creador o admin. El responsable que no la creó solo puede
  completarla. Las borradas no las ve nadie (ni admin): desaparecen de listas, calendario, contadores y badge.
  RPC `tasks_borrar(p_actor, p_task)`; evento `deleted`. Las tareas de Pendientes conservan `pendientes_lote`.
- **Compartir** (además del responsable, que no cambia): `tasks.shared_with text[]`.
  RPC `tasks_compartir(p_actor, p_task, p_usuarios)` con la lista final; la pueden usar creador, responsable y
  admin. Evento `shared {added, removed}`.
- Compartido = ve la tarea en "Mis tareas" con la etiqueta "Compartida", cuenta en su badge, puede cambiar el
  estado y comentar; NO puede editar, mover, archivar, reasignar, compartir ni borrar.
- Visibilidad: admin todo; resto `created_by = yo`, `assignee = yo` o `yo ∈ shared_with`; nunca `deleted_at`.
- "Pasar la tarea" sigue siendo reasignar (admin o manager creador): cambia el responsable. "Compartir" mantiene
  al responsable. Crear con varios responsables sigue creando una tarea por persona; "Compartida con" en el
  formulario se aplica a cada una.

## CAMBIO v3.1 (2026-10-30): un solo campo "Responsables"

- Crear con varios responsables crea UNA tarea: el primero es el principal (`assignee`) y el resto se comparte
  (`shared_with`). Ya no se crea una tarea por persona ni existe el campo "Compartida con" aparte.
- En el detalle, "Responsables" muestra principal + compartidos. Añadir/quitar = `tasks_compartir`; quitar o
  cambiar al primero = `tasks_reasignar` (solo admin o manager creador; si no, el principal no se puede quitar).
- Sin cambios en BD ni en las RPC.

---

(Lo siguiente es la v1; lo que contradiga el CAMBIO v2 o v3 queda anulado.)

Documento de coordinación. Backend y frontend trabajan en paralelo contra este contrato.
Si algo del contrato es imposible, se cambia aquí y se avisa en el informe del agente.

## Decisiones de negocio (cerradas)

- Roles: `admin`, `manager`, `comercial` (columna `usuarios.role`). Identidad = `usuarios.username`.
- Un responsable por tarea. Si se eligen varios al crear, se crea una tarea por persona (mismo `group_id`).
- Tarea **personal** = `created_by = assignee`.
- Visibilidad (RLS, SELECT): admin ve todo; resto ve tareas con `created_by = yo` o `assignee = yo`.
- Crear: admin y manager → para cualquier usuario activo (o varios); comercial → solo para sí mismo.
- Editar título/descripción/fechas/prioridad, mover en calendario, archivar/desarchivar: admin o creador.
- Reasignar: admin, o creador con rol manager.
- Cambiar estado (pending ↔ in_progress ↔ completed, reabrir): admin, creador o responsable.
- Comentar: cualquiera que vea la tarea.
- Responsable que no es creador (p. ej. comercial con tarea de un manager): solo estado y comentarios.
- `completed_at` lo fija el servidor (`now()`) al pasar a `completed`; se borra al reabrir.
- Sin borrados físicos: `archived_at`.
- Colores: cada usuario tiene color automático estable; solo admin lo cambia (`task_user_preferences.color`).
- Fechas en Europe/Madrid. Deadline sin hora = fin de ese día en Madrid (23:59:59).
- Calendario: tarea en `planned_date`; si no hay, en `due_date`; si no, "Sin fecha". Arrastrar cambia `planned_date` (no el deadline).
- Alertas: solo por deadline. Vencida = `due_at < now()` y no completada. Próxima = vence en < 24 h.

## Identidad (lo implementa backend)

- `verificar_login(p_username, p_password)` devuelve además una columna `token` (JWT HS256 firmado en
  servidor con el secreto JWT del proyecto; claims: `role: 'authenticated'`, `app_username`,
  `app_role`, `iat`, `exp` 30 días). PostgREST/Realtime lo aceptan como `Authorization: Bearer`.
- Las políticas NUNCA confían en el rol del token: `app_current_username()` lee `auth.jwt()->>'app_username'`
  y comprueba que exista en `usuarios` con `deleted_at IS NULL`; `app_current_role()` lee el rol de la tabla.
- `AuthContext` expone `accessToken` (string | null). Se guarda en localStorage `crm_avedie_jwt` al hacer
  login y se borra al hacer logout. Sesiones antiguas: `currentUser` existe pero `accessToken` es null →
  el resto del CRM sigue igual; Tasks muestra "Inicia sesión de nuevo para usar Tasks".
- `src/lib/supabaseAuthed.js` exporta `getAuthedClient(token)` → cliente supabase-js (misma URL y anon key)
  con `accessToken: async () => token` (o header Authorization) y `realtime.setAuth(token)`; cachea por token.

## Esquema (migración `supabase/migrations/*_tasks.sql`)

```
tasks(
  id uuid pk default gen_random_uuid(),
  group_id uuid null,                    -- misma creación múltiple
  title text not null check (length(trim(title)) between 1 and 200),
  description text null (≤ 5000),
  created_by text not null references usuarios(username) on update cascade on delete restrict,
  assignee   text not null references usuarios(username) on update cascade on delete restrict,
  status text not null default 'pending' check in ('pending','in_progress','completed'),
  priority text not null default 'normal' check in ('low','normal','high','urgent'),
  planned_date date null, planned_time time null,
  due_date date null, due_time time null,
  due_at timestamptz null,               -- calculado en servidor: (due_date + coalesce(due_time,'23:59:59')) en Europe/Madrid
  completed_at timestamptz null, completed_by text null references usuarios(username) on update cascade,
  archived_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
task_events(
  id bigint identity pk, task_id uuid not null references tasks(id),
  actor text not null references usuarios(username) on update cascade,
  type text not null check in ('created','updated','reassigned','status_changed','completed','reopened',
                               'moved','archived','unarchived','commented'),
  payload jsonb not null default '{}'::jsonb,   -- p. ej. {from, to}, {changes:{campo:{from,to}}}, {comment}
  created_at timestamptz not null default now()
)
task_user_preferences(
  username text pk references usuarios(username) on update cascade on delete cascade,
  color text null check (color ~ '^#[0-9a-fA-F]{6}$'),
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
)
```
RLS activado en las tres; `anon` sin acceso a ninguna. `authenticated`: SELECT por RLS
(tasks según visibilidad; task_events si ve la tarea; task_user_preferences: todos leen). Sin
INSERT/UPDATE/DELETE directos: todo por RPC `SECURITY DEFINER`. `tasks` en la publicación `supabase_realtime`.

## RPC (todas validan identidad y permisos; lanzan error con mensaje en español si no)

| función | parámetros | devuelve |
|---|---|---|
| `tasks_crear` | `p_title text, p_description text, p_assignees text[]` (null/vacío = yo), `p_priority text, p_planned_date date, p_planned_time time, p_due_date date, p_due_time time` | `setof tasks` |
| `tasks_editar` | `p_id uuid, p_cambios jsonb` (claves permitidas: title, description, priority, planned_date, planned_time, due_date, due_time; null = borrar valor) | `tasks` |
| `tasks_cambiar_estado` | `p_id uuid, p_status text` | `tasks` |
| `tasks_reasignar` | `p_id uuid, p_assignee text` | `tasks` |
| `tasks_mover` | `p_id uuid, p_planned_date date, p_planned_time time` | `tasks` |
| `tasks_archivar` | `p_id uuid, p_archivar boolean` | `tasks` |
| `tasks_comentar` | `p_id uuid, p_comentario text` | `task_events` |
| `tasks_set_color` | `p_username text, p_color text` (solo admin) | `task_user_preferences` |

Cada RPC registra su `task_events`. `tasks_cambiar_estado` a completed → evento `completed` y `completed_at=now()`;
desde completed a otro → `reopened`.

Lecturas: frontend usa `from('tasks').select(...)` (RLS filtra), `from('task_events')`, `from('task_user_preferences')`
y `from('usuarios').select('username, display_name, role').is('deleted_at', null)` (sigue siendo legible).

## Gestión de usuarios (migración de seguridad separada)

`usuarios` deja de admitir INSERT/UPDATE/DELETE con anon/authenticated. Nuevas RPC SECURITY DEFINER que
exigen admin verificado por token: `admin_crear_usuario`, `admin_editar_usuario`, `admin_borrar_usuario`
(borrado lógico), `admin_set_equipo`. `AuthContext` (addUser/editUser/deleteUser/updateEquipo) las usa con
el cliente autenticado; sin token → error claro "Inicia sesión de nuevo para gestionar usuarios".
SELECT de `usuarios` (sin `password`) sigue abierto como hoy (el arranque del CRM lo necesita).

## Reparto de archivos (para no pisarse)

- Backend: `supabase/**`, `src/lib/supabaseAuthed.js`, `src/context/AuthContext.jsx`, `tests/sql/**`, `docs/tasks/BACKEND.md`.
- Frontend: `src/pages/Tasks.jsx`, `src/components/tasks/**`, `src/context/TasksContext.jsx`, `src/lib/tasksApi.js`,
  `src/lib/tasksFechas.js`, `src/components/Sidebar.jsx`, `src/App.jsx`, `src/pages/GestionUsuarios.jsx` (solo lista PAGES), `src/main.jsx` (provider), `package.json` (FullCalendar).
- `DEFAULT_PERMISSIONS` (`tasks: true` en los tres roles) lo añade backend en AuthContext.
