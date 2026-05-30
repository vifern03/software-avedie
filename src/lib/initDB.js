import { supabase } from './supabase';

const DEFAULT_PERMISSIONS = {
  admin:     { dashboard: true,  historica: true,  radar: true,  b2c: true, b2b: true, historial: true,  visitas: true  },
  manager:   { dashboard: false, historica: false, radar: true,  b2c: true, b2b: true, historial: false, visitas: true  },
  comercial: { dashboard: false, historica: false, radar: false, b2c: true, b2b: true, historial: false, visitas: false },
};

const DEFAULT_USERS = [
  { username: 'Victor',     password: 'pedrito88',  role: 'admin',     display_name: 'Victor',       is_undeletable: true,  security_pin: '300133' },
  { username: 'Adolfo',     password: 'Avedie2000', role: 'admin',     display_name: 'Adolfo',       is_undeletable: false, security_pin: null },
  { username: 'manager1',   password: 'Avedie2000', role: 'manager',   display_name: 'Manager 1',    is_undeletable: false, security_pin: null },
  { username: 'comercial1', password: 'Avedie2000', role: 'comercial', display_name: 'Comercial 1',  is_undeletable: false, security_pin: null },
];

export async function initializeDB() {
  try {
    // Comprobar si la tabla usuarios existe y tiene datos
    const { data: existingUsers, error: usersError } = await supabase
      .from('usuarios')
      .select('username');

    if (usersError) {
      // La tabla no existe → el usuario debe ejecutar el SQL de inicialización
      return { ok: false, needsSetup: true, error: usersError };
    }

    const usernamesEnBD = new Set((existingUsers || []).map(u => u.username));

    if (usernamesEnBD.size === 0) {
      // Tablas vacías → sembrar usuarios por defecto
      const { error } = await supabase.from('usuarios').insert(DEFAULT_USERS);
      if (error) return { ok: false, error };
    } else {
      // Garantizar que Victor (admin protegido) siempre esté en la BD
      if (!usernamesEnBD.has('Victor')) {
        await supabase.from('usuarios').insert([DEFAULT_USERS[0]]);
      }
    }

    // Sembrar configuración si faltan claves
    const { data: configs } = await supabase.from('configuracion').select('clave');
    const clavesExistentes = new Set((configs || []).map(c => c.clave));
    const toInsert = [];
    if (!clavesExistentes.has('permissions'))      toInsert.push({ clave: 'permissions',      valor: DEFAULT_PERMISSIONS });
    if (!clavesExistentes.has('pin'))              toInsert.push({ clave: 'pin',              valor: '1234'              });
    if (!clavesExistentes.has('user_permissions')) toInsert.push({ clave: 'user_permissions', valor: {}                 });
    if (toInsert.length > 0) {
      await supabase.from('configuracion').insert(toInsert);
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err };
  }
}
