-- Fase 1B — ejecutar SOLO después de confirmar que AuthContext.jsx (versión
-- que usa verificar_login RPC) está desplegado y funcionando en producción
-- (Netlify). Antes de eso, esta línea rompe el login de cualquiera que
-- cargue la app con el código viejo.

REVOKE SELECT (password) ON public.usuarios FROM anon, authenticated;
