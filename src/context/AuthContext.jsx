import { createContext, useContext, useState, useCallback } from 'react';

const VICTOR_USER = {
  username:      'Victor',
  password:      'pedrito88',
  role:          'admin',
  displayName:   'Victor',
  isUndeletable: true,
  securityPin:   '300133',
};

const INITIAL_USERS = [
  { username: 'Adolfo',     password: 'Avedie2000', role: 'admin',     displayName: 'Adolfo' },
  { username: 'manager1',   password: 'Avedie2000', role: 'manager',   displayName: 'Manager 1' },
  { username: 'comercial1', password: 'Avedie2000', role: 'comercial', displayName: 'Comercial 1' },
];

const ensureVictor = (arr) =>
  arr.some((u) => u.username === 'Victor') ? arr : [...arr, VICTOR_USER];

export const DEFAULT_PERMISSIONS = {
  admin:     { dashboard: true,  historica: true,  radar: true,  b2c: true, b2b: true, historial: true,  visitas: true  },
  manager:   { dashboard: false, historica: false, radar: true,  b2c: true, b2b: true, historial: false, visitas: true  },
  comercial: { dashboard: false, historica: false, radar: false, b2c: true, b2b: true, historial: false, visitas: false },
};

const STORAGE_USER       = 'crm_avedie_user';
const STORAGE_PERMS      = 'crm_avedie_permissions';
const STORAGE_USERS      = 'crm_avedie_users';
const STORAGE_PIN        = 'crm_avedie_pin';
const STORAGE_USER_PERMS = 'crm_avedie_user_permissions'; // individual overrides

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser,     setCurrentUser]     = useState(() => loadFromStorage(STORAGE_USER,       null));
  const [permissions,     setPermissions]     = useState(() => loadFromStorage(STORAGE_PERMS,      DEFAULT_PERMISSIONS));
  const [users,           setUsers]           = useState(() => ensureVictor(loadFromStorage(STORAGE_USERS, INITIAL_USERS)));
  const [pin,             setPin]             = useState(() => localStorage.getItem(STORAGE_PIN)  || '1234');
  // Per-user permission overrides: { username: { dashboard: true, b2c: false, ... } }
  const [userPermissions, setUserPermissions] = useState(() => loadFromStorage(STORAGE_USER_PERMS, {}));

  const saveUsers = (updated) => {
    const safe = ensureVictor(updated);
    setUsers(safe);
    localStorage.setItem(STORAGE_USERS, JSON.stringify(safe));
  };

  const login = useCallback((username, password) => {
    const found = users.find(u => u.username === username && u.password === password);
    if (!found) return false;
    const { password: _pw, ...safeUser } = found;
    setCurrentUser(safeUser);
    localStorage.setItem(STORAGE_USER, JSON.stringify(safeUser));
    return true;
  }, [users]);

  const logout = useCallback(() => {
    setCurrentUser(null);
    localStorage.removeItem(STORAGE_USER);
  }, []);

  const updatePermissions = useCallback((newPerms) => {
    setPermissions(newPerms);
    localStorage.setItem(STORAGE_PERMS, JSON.stringify(newPerms));
  }, []);

  // Set a single permission for a specific user (overrides role default)
  const updateUserPermission = useCallback((username, pageId, value) => {
    setUserPermissions((prev) => {
      const updated = {
        ...prev,
        [username]: { ...(prev[username] || {}), [pageId]: value },
      };
      localStorage.setItem(STORAGE_USER_PERMS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Remove a single page override for a user (key deleted, falls back to role default)
  const removeUserPermission = useCallback((username, pageId) => {
    setUserPermissions((prev) => {
      const userPerms = { ...(prev[username] || {}) };
      delete userPerms[pageId];
      const updated = Object.keys(userPerms).length > 0
        ? { ...prev, [username]: userPerms }
        : (({ [username]: _dropped, ...rest }) => rest)(prev);
      localStorage.setItem(STORAGE_USER_PERMS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Remove ALL individual overrides for a user (reset to role defaults)
  const resetUserPermissions = useCallback((username) => {
    setUserPermissions((prev) => {
      const updated = { ...prev };
      delete updated[username];
      localStorage.setItem(STORAGE_USER_PERMS, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const hasAccess = useCallback((section) => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    // Individual override takes priority over role
    const userPerms = userPermissions[currentUser.username];
    if (userPerms && userPerms[section] !== undefined) return !!userPerms[section];
    // Stored role permission, falling back to DEFAULT_PERMISSIONS for new sections
    const stored = permissions[currentUser.role]?.[section];
    if (stored !== undefined) return !!stored;
    return !!(DEFAULT_PERMISSIONS[currentUser.role]?.[section]);
  }, [currentUser, permissions, userPermissions]);

  const addUser = useCallback((username, password, role, displayName) => {
    const already = users.find(u => u.username === username);
    if (already) return false;
    saveUsers([...users, { username, password, role, displayName: displayName || username }]);
    return true;
  }, [users]);

  const editUser = useCallback((username, updates) => {
    if (updates.username && updates.username !== username) {
      if (users.find(u => u.username === updates.username)) return false;
    }
    const updated = users.map(u => u.username === username ? { ...u, ...updates } : u);
    saveUsers(updated);
    if (currentUser?.username === username) {
      const merged = { ...currentUser, ...updates };
      const { password: _pw, ...safeUpdated } = merged;
      setCurrentUser(safeUpdated);
      localStorage.setItem(STORAGE_USER, JSON.stringify(safeUpdated));
    }
    return true;
  }, [users, currentUser]);

  const changePin = useCallback((newPin) => {
    setPin(newPin);
    localStorage.setItem(STORAGE_PIN, newPin);
  }, []);

  const deleteUser = useCallback((username) => {
    if (username === 'Adolfo') return;
    const target = users.find((u) => u.username === username);
    if (target?.isUndeletable) return;
    saveUsers(users.filter((u) => u.username !== username));
  }, [users]);

  return (
    <AuthContext.Provider value={{
      currentUser, permissions, users, pin, userPermissions,
      login, logout, updatePermissions, hasAccess,
      addUser, editUser, deleteUser, changePin,
      updateUserPermission, removeUserPermission, resetUserPermissions,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
