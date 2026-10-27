# Gestión de Pendientes → Tareas (novedad 27/10/2026)

Cada vez que se importa correctamente un Excel en **Gestión de Pendientes**, el CRM crea sola **una tarea** en
**Tareas** para gestionar esos pendientes. Una importación correcta = una tarea (nunca una por fila).

## Quién la usa

| Rol | Qué puede hacer |
|---|---|
| Administrador / Manager | Importar el Excel de pendientes; la tarea se crea a su nombre y puede reasignarla a un comercial. |
| Comercial | Ver las tareas que le asignen, abrir sus pendientes desde la tarea y completarla. |

Importar Excel antes era solo de administradores; desde esta versión también pueden hacerlo los managers.

## Paso a paso (tutorial de managers y administradores)

1. Menú lateral → **Gestión de Pendientes**.
2. Arrastrar el Excel (`.xlsx`) a la zona **Subir Excel de incidencias** o hacer clic en ella y elegirlo.
   - La primera fila debe ser la cabecera y tener la columna **"CUPS: CUPS"** (el formato que exporta la
     plataforma, como `Pendientes_17julio.xlsx`). También se leen `Nombre` (Número OI), `Número del caso`,
     `Fecha de creación` y `Estado`; el resto de columnas se guardan tal cual.
3. Al terminar aparece el mensaje verde:
   *"14 fila(s) leídas del Excel · 14 registradas… · Tarea «Gestionar pendientes — 27/10/2026» disponible en Tareas."*
4. Menú lateral → **Tareas**: la tarea aparece en **Mis tareas**, asignada a quien importó, y el contador naranja
   del menú sube en 1. La descripción indica cuántos pendientes y de qué Excel.
5. Para **asignarla a un comercial**: clic en la tarea → en el panel de detalle, campo **Responsable** → elegir al
   comercial. Se guarda al momento ("Reasignada a …"). El contador naranja baja para quien la tenía y sube para
   el comercial.
6. En el detalle, **"Ver pendientes de esta importación"** abre Gestión de Pendientes mostrando solo los
   pendientes de ese Excel (banda azul arriba; "Ver todos" vuelve a la lista completa).

## Tutorial de comerciales

1. El contador naranja de **Tareas** avisa de que tiene una tarea nueva.
2. Abrir la tarea **Gestionar pendientes — fecha** → **"Ver pendientes de esta importación"** para trabajarlos
   (Tramitado / Formalizar como siempre).
3. Al acabar, marcar la tarea como completada (círculo de la izquierda o botón **Completada** en el detalle).
   Queda registrada la fecha y hora de finalización y quién la completó.

## Reglas

- **Sin duplicados:** si se vuelve a subir el mismo archivo (doble clic, reintento, error de red), el CRM avisa
  *"Este Excel ya estaba importado"* y no vuelve a registrar los pendientes ni crea otra tarea. Si la tarea
  no se hubiera llegado a crear la primera vez, se crea entonces.
- **Si la importación falla** (no es un Excel, falta la columna "CUPS: CUPS", no hay ningún CUPS o falla el
  guardado) no se crea ninguna tarea.
- Cada día se importa un Excel distinto y cada uno genera su propia tarea con la fecha de importación.
- Un archivo se considera "el mismo" si su contenido es idéntico (huella SHA-256 del archivo), aunque se
  llame distinto.

## Detalles técnicos

- Migración `supabase/migrations/20261027000000_pendientes_tareas.sql` (rollback en `supabase/rollback/`):
  columnas nulas `registro_pendientes.lote_id` y `tasks.pendientes_lote` (índice único) y RPC
  `tasks_crear_pendientes(p_actor, p_lote)` (solo admin/manager; idempotente; exige pendientes en el lote).
  Los registros anteriores quedan con `lote_id` NULL y no se modifican.
- Frontend: `src/pages/Pendientes.jsx` (huella del archivo, creación de la tarea, filtro por lote),
  `ingestExcelPendientes` en `src/context/DataContext.jsx`, botón en `src/components/tasks/TaskDetailDrawer.jsx`.
- Mismas limitaciones de seguridad que el resto de Tareas (ver `BACKEND.md` → "Pendiente de seguridad").
