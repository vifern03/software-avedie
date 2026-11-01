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
