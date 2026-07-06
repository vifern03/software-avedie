# Snapshot pre-RLS — 2026-07-06

Backup lógico de esquema/permisos de las 10 tablas públicas antes de activar RLS.
Proyecto: ndcslcsuavjdctqhkrfu (Software Avedie).

## Estado RLS actual (confirmado vía Management API)

| Tabla | RLS enabled | Políticas |
|---|---|---|
| usuarios | false | ninguna |
| clientes | false | ninguna |
| actividades | false | ninguna |
| visitas | false | ninguna |
| visitas_pymes | false | ninguna |
| reportes | false | ninguna |
| configuracion | false | ninguna |
| telemarketing_contactos | false | ninguna |
| telemarketing_gestiones | false | ninguna |
| fichajes | false | ninguna |
| prescriptores (fuera de alcance) | true | `prescriptores_open` (ALL, USING true, WITH CHECK true) |
| registro_llamadas (fuera de alcance) | true | `Permitir acceso según lógica de la app` (ALL, USING true, WITH CHECK true) |

## ROLLBACK RÁPIDO (ejecutar tal cual si algo se rompe en producción)

```sql
ALTER TABLE public.usuarios                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.actividades              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas                  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitas_pymes            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reportes                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracion            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_contactos  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_gestiones  DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fichajes                 DISABLE ROW LEVEL SECURITY;
```

Esto vuelve exactamente al estado de hoy: sin RLS, mismos grants de `anon`/`authenticated` (ver abajo, no se tocan al hacer esto). Si además se llegan a crear políticas nuevas y se quiere limpiar del todo:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND tablename IN
           ('usuarios','clientes','actividades','visitas','visitas_pymes',
            'reportes','configuracion','telemarketing_contactos',
            'telemarketing_gestiones','fichajes')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;
```

## Grants actuales por rol (idénticos hoy para anon y authenticated — ambos con CRUD completo)

Todas las tablas: `anon` y `authenticated` tienen `INSERT,SELECT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER`. `service_role` igual (bypassa RLS siempre, no se toca).
Estos GRANTs no se modifican al activar RLS — RLS filtra filas, no permisos de operación. No hace falta backup de esto porque no se va a tocar.

## Columnas y tipos (para recrear una tabla desde cero si hiciera falta)

### usuarios (PK: username)
username text NOT NULL · password text NOT NULL · role text NOT NULL default 'comercial' · display_name text · is_undeletable boolean default false · security_pin text · created_at timestamptz default now() · deleted_at timestamptz · equipo text default 'Palencia'

### clientes (PK: id · UNIQUE: cups)
id bigint · tipo text NOT NULL · nombre text NOT NULL · cif_dni text · telefono text · mail text · cuenta_bancaria text · cups text · tarifa text · linea_negocio text · subtipo text · subtipo_otro text · id_producto text · creado_por text · descripcion text · estado text default 'Pendiente Firma' · comercial text · fecha_tramitacion text · fecha_firma text · fecha_formalizada text · dni_escaneado text · created_at timestamptz default now() · deleted_at timestamptz · dni_reverso text · cif_autonomo_url text · justo_titulo_url text · factura_b2b_url text · consumo_anual_est numeric · equipo text default 'Palencia' · ultima_factura text · compartido_con text[] default '{}' · vendido_por text

### actividades (PK: id)
id bigint · tipo text · descripcion text · comercial text · fecha text · hora text · created_at timestamptz default now() · deleted_at timestamptz

### visitas (PK: id)
id bigint · fecha text · hora text · dni text · nombre text · telefono text · mail text · tipo text · tipo_otro text · registrado_por text · created_at timestamptz default now() · deleted_at timestamptz · punto_venta text · dni_cif_escaneado_url text · dni_cif_reverso_url text · equipo text default 'Palencia'

### visitas_pymes (PK: id)
id bigint (identity) · created_at timestamptz default now() · deleted_at timestamptz · registrado_por text NOT NULL · persona_autorizada text · correo text · fecha date default CURRENT_DATE · hora time default CURRENT_TIME · telefono_contacto_cliente text · correo_electronico_cliente text · foto_negocio_url text · comentarios_visita text · nombre_empresa text · ubicacion text · estado text default 'Solicitado Factura' · fecha_enviada_comparativa timestamptz · fecha_resolucion timestamptz · factura_url text · comparativa_url text · latitud numeric · longitud numeric

### reportes (PK: id)
id bigint · creado_por text · titulo text · descripcion text · estado text default 'Pendiente' · respuesta_admin text default '' · fecha text · hora text · created_at timestamptz default now() · confirmacion_usuario text default ''

### configuracion (PK: clave)
clave text NOT NULL · valor jsonb NOT NULL

### telemarketing_contactos (PK: id)
id bigint · provincia text NOT NULL default 'Palencia' · calle text NOT NULL · nombre text · cups text · direccion text · movil text · precio_actual text · ya_llamado text · created_at timestamptz default now()
Índice: idx_tm_contactos_calle (provincia, calle)

### telemarketing_gestiones (PK: id · FK: contacto_id → telemarketing_contactos)
id bigint · contacto_id bigint · calle text NOT NULL · provincia text NOT NULL · estado text NOT NULL · comentarios text · tiempo_llamada text · captura_url text NOT NULL · fecha_hora timestamptz NOT NULL default now() · registrado_por text NOT NULL · created_at timestamptz default now() · deleted_at timestamptz
Índices: idx_tm_gestiones_contacto (contacto_id), idx_tm_gestiones_calle (provincia, calle)

### fichajes (PK: id)
id uuid default gen_random_uuid() · usuario text NOT NULL · fecha date NOT NULL default CURRENT_DATE · hora_entrada time · hora_salida time · eventos jsonb NOT NULL default '[]' · creado_en timestamptz default now()

## Hallazgo de arquitectura de autenticación (bloqueante para el diseño de políticas)

El CRM **no usa Supabase Auth**. `src/lib/supabase.js` crea el cliente solo con la clave anon.
`AuthContext.jsx` hace login trayendo toda la tabla `usuarios` (incluida `password` hasheada) vía
`supabase.from('usuarios').select('*')` con rol `anon`, y compara el hash en el navegador.
Por tanto, para Postgres/PostgREST, **todas las peticiones del CRM son del rol `anon`**,
sin distinción de qué usuario humano está "logueado" en la app (esa identidad vive solo en
`localStorage`, nunca llega a la base de datos como JWT). Esto es la causa más probable de que
la última vez que se activó RLS, el login se rompiera: si una política bloquea `SELECT` de `anon`
sobre `usuarios`, el propio mecanismo de login deja de poder leer la tabla para comparar contraseñas.
