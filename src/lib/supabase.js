import { createClient } from '@supabase/supabase-js';

const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// JWT propio emitido por verificar_login() (RPC) tras un login correcto.
// Lleva claims custom (app_role, app_sede, app_username, app_display_name)
// que las políticas RLS usan para filtrar filas por usuario/rol/sede real.
// Antes de loguearse (o si el token expira) se usa la anon key, igual que antes.
const APP_TOKEN_KEY = 'crm_avedie_jwt';

export function getAppToken() {
  try { return localStorage.getItem(APP_TOKEN_KEY); } catch { return null; }
}

export function setAppToken(token) {
  try {
    if (token) localStorage.setItem(APP_TOKEN_KEY, token);
    else localStorage.removeItem(APP_TOKEN_KEY);
  } catch { /* localStorage no disponible — ignorar */ }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  anonKey,
  {
    accessToken: async () => getAppToken() || anonKey,
  }
);
