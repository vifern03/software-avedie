import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { initializeDB } from '../lib/initDB';
import { hashPassword } from '../lib/crypto';

const AuthContext = createContext(null);

export const DEFAULT_PERMISSIONS = {
  admin:     { dashboard: true,  historica: true,  radar: true,  b2c: true, b2b: true, historial: true,  visitas: true,  visitas_pymes: true,  fichajes: true,  reportes: true,  llamadas: true  },
  manager:   { dashboard: false, historica: false, radar: true,  b2c: true, b2b: true, historial: false, visitas: true,  visitas_pymes: true,  fichajes: true,  reportes: true,  llamadas: true  },
  comercial: { dashboard: false, historica: false, radar: false, b2c: true, b2b: true, historial: false, visitas: true,  visitas_pymes: true,  fichajes: true,  reportes: true,  llamadas: true  },
};

const SESSION_KEY = 'crm_avedie_user';

function dbToUser(row) {
  return {
    username:      row.username,
    password:      row.password,
    role:          row.role,
    displayName:   row.display_name   || row.username,
    isUndeletable: row.is_undeletable || false,
    securityPin:   row.security_pin   || null,
    equipo:        row.equipo         || 'Ambos',
  };
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [permissions,     setPermissions]     = useState(DEFAULT_PERMISSIONS);
  const [users,           setUsers]           = useState([]);
  const [pin,             setPin]             = useState('1234');
  const [userPermissions, setUserPermissions] = useState({});
  const [isLoading,       setIsLoading]       = useState(true);
  const [dbError,         setDbError]         = useState(null);

  useEffect(() => {
    async function boot() {
      const result = await initializeDB();

      if (result.needsSetup) {
        setDbError(
          'Las tablas de Supabase no existen todavía.\n' +
          'Ejecuta el archivo SQL de inicialización en el Editor SQL de tu proyecto Supabase y recarga la página.'
        );
        setIsLoading(false);
        return;
      }

      const [{ data: usersData, error: uErr }, { data: configData }] = await Promise.all([
        supabase.from('usuarios').select('*').is('deleted_at', null),
        supabase.from('configuracion').select('*'),
      ]);

      if (uErr) {
        setDbError('Error al conectar con la base de datos: ' + uErr.message);
        setIsLoading(false);
        return;
      }

      setUsers((usersData || []).map(dbToUser));

      for (const row of (configData || [])) {
        if (row.clave === 'permissions')      setPermissions(row.valor);
        if (row.clave === 'pin')              setPin(String(row.valor));
        if (row.clave === 'user_permissions') setUserPermissions(row.valor || {});
      }

      // ── C-2: Verificación de integridad de sesión ─────────────────────────
      // Compara el rol almacenado en localStorage con el registro real de Supabase.
      // Si hay desajuste (p.ej., el usuario editó su localStorage manualmente),
      // se fuerza logout inmediato.
      const storedRaw = localStorage.getItem(SESSION_KEY);
      if (storedRaw) {
        try {
          const stored = JSON.parse(storedRaw);
          const dbUser = (usersData || []).find(u => u.username === stored.username);
          if (!dbUser || dbUser.role !== stored.role) {
            localStorage.removeItem(SESSION_KEY);
            setCurrentUser(null);
          } else {
            // Sincronizar la sesión con los datos frescos de BD para que
            // cambios en equipo/displayName/permisos tomen efecto sin re-login.
            const normalized = dbToUser(dbUser);
            const { password: _pw, ...freshSafe } = normalized;
            setCurrentUser(freshSafe);
            localStorage.setItem(SESSION_KEY, JSON.stringify(freshSafe));
          }
        } catch {
          localStorage.removeItem(SESSION_KEY);
          setCurrentUser(null);
        }
      }

      setIsLoading(false);
    }
    boot();
  }, []);

  // ── Sesión ──────────────────────────────────────────────────────────────────

  // login es async: hashea la contraseña introducida y la compara con el hash en BD.
  // Migración silenciosa: si el usuario aún tiene contraseña en plain text,
  // la actualiza a SHA-256 en Supabase sin interrumpir el flujo.
  const login = useCallback(async (username, password) => {
    const hashedAttempt = await hashPassword(password);

    // 1. Intentar con contraseña ya hasheada (caso normal)
    let found = users.find(u => u.username === username && u.password === hashedAttempt);

    // 2. Migración: intentar con contraseña en plain text (instalaciones previas)
    if (!found) {
      const legacy = users.find(u => u.username === username && u.password === password);
      if (legacy) {
        // Actualizar a SHA-256 en Supabase y en estado local de forma silenciosa
        await supabase.from('usuarios').update({ password: hashedAttempt }).eq('username', username);
        setUsers(prev => prev.map(u =>
          u.username === username ? { ...u, password: hashedAttempt } : u
        ));
        found = { ...legacy, password: hashedAttempt };
      }
    }

    if (!found) return false;

    const { password: _pw, ...safeUser } = found;
    setCurrentUser(safeUser);
    localStorage.setItem(SESSION_KEY, JSON.stringify(safeUser));
    return true;
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(SESSION_KEY);
  }, []);

  const hasAccess = useCallback((section) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    const userPerms = userPermissions[currentUser.username];
    if (userPerms && userPerms[section] !== undefined) return !!userPerms[section];
    const stored = permissions[currentUser.role]?.[section];
    if (stored !== undefined) return !!stored;
    return !!(DEFAULT_PERMISSIONS[currentUser.role]?.[section]);
  }, [currentUser, permissions, userPermissions]);

  // ── Permisos de rol ─────────────────────────────────────────────────────────

  const updatePermissions = useCallback((newPerms) => {
    setPermissions(newPerms);
    supabase.from('configuracion')
      .upsert([{ clave: 'permissions', valor: newPerms }])
      .then(({ error }) => { if (error) console.error('updatePermissions:', error); });
  }, []);

  const updateUserPermission = useCallback((username, pageId, value) => {
    setUserPermissions((prev) => {
      const updated = { ...prev, [username]: { ...(prev[username] || {}), [pageId]: value } };
      supabase.from('configuracion')
        .upsert([{ clave: 'user_permissions', valor: updated }])
        .then(({ error }) => { if (error) console.error('updateUserPermission:', error); });
      return updated;
    });
  }, []);

  const removeUserPermission = useCallback((username, pageId) => {
    setUserPermissions((prev) => {
      const userPerms = { ...(prev[username] || {}) };
      delete userPerms[pageId];
      const updated = Object.keys(userPerms).length > 0
        ? { ...prev, [username]: userPerms }
        : (({ [username]: _dropped, ...rest }) => rest)(prev);
      supabase.from('configuracion')
        .upsert([{ clave: 'user_permissions', valor: updated }])
        .then(({ error }) => { if (error) console.error('removeUserPermission:', error); });
      return updated;
    });
  }, []);

  const resetUserPermissions = useCallback((username) => {
    setUserPermissions((prev) => {
      const updated = { ...prev };
      delete updated[username];
      supabase.from('configuracion')
        .upsert([{ clave: 'user_permissions', valor: updated }])
        .then(({ error }) => { if (error) console.error('resetUserPermissions:', error); });
      return updated;
    });
  }, []);

  // ── Gestión de usuarios ─────────────────────────────────────────────────────

  const addUser = useCallback((username, hashedPassword, role, displayName) => {
    if (users.some(u => u.username === username)) return false;
    const newUser = {
      username,
      password:      hashedPassword,
      role,
      displayName:   displayName || username,
      isUndeletable: false,
      securityPin:   null,
    };
    setUsers(prev => [...prev, newUser]);
    supabase.from('usuarios')
      .insert([{ username, password: hashedPassword, role, display_name: displayName || username, is_undeletable: false, security_pin: null }])
      .then(({ error }) => {
        if (error) {
          console.error('addUser:', error);
          setUsers(prev => prev.filter(u => u.username !== username));
        }
      });
    return true;
  }, [users]);

  const editUser = useCallback((username, updates) => {
    if (updates.username && updates.username !== username) {
      if (users.some(u => u.username === updates.username)) return false;
    }
    const updated = users.map(u => u.username === username ? { ...u, ...updates } : u);
    setUsers(updated);

    const newUsername = updates.username || username;

    // Solo incluir password en el PATCH si se ha proporcionado explícitamente
    const dbUpdate = {
      username:     newUsername,
      role:         updates.role,
      display_name: updates.displayName || newUsername,
    };
    if (updates.password !== undefined) {
      dbUpdate.password = updates.password;
    }

    supabase.from('usuarios').update(dbUpdate).eq('username', username)
      .then(({ error }) => { if (error) console.error('editUser:', error); });

    if (currentUser?.username === username) {
      const merged = { ...currentUser, ...updates };
      const { password: _pw, ...safeUpdated } = merged;
      setCurrentUser(safeUpdated);
      localStorage.setItem(SESSION_KEY, JSON.stringify(safeUpdated));
    }
    return true;
  }, [users, currentUser]);

  const deleteUser = useCallback((username) => {
    if (username === 'Adolfo') return;
    const target = users.find(u => u.username === username);
    if (target?.isUndeletable) return;
    setUsers(prev => prev.filter(u => u.username !== username));
    supabase.from('usuarios').update({ deleted_at: new Date().toISOString() }).eq('username', username)
      .then(({ error }) => { if (error) console.error('deleteUser:', error); });
  }, [users]);

  const changePin = useCallback((newPin) => {
    setPin(newPin);
    supabase.from('configuracion')
      .upsert([{ clave: 'pin', valor: newPin }])
      .then(({ error }) => { if (error) console.error('changePin:', error); });
  }, []);

  const updateUserEquipo = useCallback((username, equipo) => {
    setUsers(prev => prev.map(u => u.username === username ? { ...u, equipo } : u));
    supabase.from('usuarios').update({ equipo }).eq('username', username)
      .then(({ error }) => { if (error) console.error('updateUserEquipo:', error); });
    if (currentUser?.username === username) {
      const updated = { ...currentUser, equipo };
      setCurrentUser(updated);
      localStorage.setItem(SESSION_KEY, JSON.stringify(updated));
    }
  }, [currentUser]);

  return (
    <AuthContext.Provider value={{
      currentUser, permissions, users, pin, userPermissions, isLoading, dbError,
      login, logout, updatePermissions, hasAccess,
      addUser, editUser, deleteUser, changePin,
      updateUserPermission, removeUserPermission, resetUserPermissions,
      updateUserEquipo,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
