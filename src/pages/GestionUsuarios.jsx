import { useState } from 'react';
import {
  Shield, Briefcase, UserCheck, Users, CheckCircle,
  Eye, EyeOff, Pencil, Trash2, Plus, X, Save, Lock, RotateCcw, User, ShieldAlert,
} from 'lucide-react';
import { useAuth, DEFAULT_PERMISSIONS } from '../context/AuthContext';
import PinModal from '../components/PinModal';

const PAGES = [
  { id: 'dashboard', label: 'Dashboard'  },
  { id: 'historica', label: 'Histórica'  },
  { id: 'radar',     label: 'Radar'      },
  { id: 'b2c',       label: 'Alta B2C'  },
  { id: 'b2b',       label: 'Alta B2B'  },
  { id: 'visitas',   label: 'Visitas'   },
  { id: 'reportes',  label: 'Reportes'  },
  { id: 'historial', label: 'Historial' },
];

const ROLE_META = {
  admin: {
    label: 'Administrador',
    icon: Shield,
    bg: 'bg-blue-50', border: 'border-blue-200',
    text: 'text-google-blue', iconColor: 'text-google-blue',
  },
  manager: {
    label: 'Manager',
    icon: Briefcase,
    bg: 'bg-purple-50', border: 'border-purple-200',
    text: 'text-purple-700', iconColor: 'text-purple-600',
  },
  comercial: {
    label: 'Comercial',
    icon: UserCheck,
    bg: 'bg-green-50', border: 'border-green-200',
    text: 'text-green-700', iconColor: 'text-green-600',
  },
};

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange()}
      title={disabled ? 'El administrador siempre tiene acceso total' : undefined}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${checked ? 'bg-google-blue' : 'bg-gray-200'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function UserFormModal({ title, initialData, onSave, onClose }) {
  const [form, setForm] = useState(
    initialData || { username: '', password: '', role: 'comercial', displayName: '' }
  );
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.username.trim()) e.username = 'El nombre de usuario es obligatorio';
    if (!form.password.trim()) e.password = 'La contraseña es obligatoria';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-google-border">
          <h2 className="text-base font-semibold text-google-dark">{title}</h2>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-google-dark mb-1.5">
              Nombre de usuario
            </label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                errors.username ? 'border-red-400' : 'border-google-border'
              }`}
              placeholder="ej. comercial2"
            />
            {errors.username && (
              <p className="text-xs text-red-500 mt-1">{errors.username}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-dark mb-1.5">
              Nombre real <span className="font-normal text-google-gray">(para el ranking)</span>
            </label>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
              <input
                type="text"
                value={form.displayName || ''}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))}
                className="w-full pl-9 pr-3 py-2 text-sm border border-google-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="ej. Ana Martínez"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-google-dark mb-1.5">
              Contraseña
            </label>
            <input
              type="text"
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                errors.password ? 'border-red-400' : 'border-google-border'
              }`}
              placeholder="contraseña"
            />
            {errors.password && (
              <p className="text-xs text-red-500 mt-1">{errors.password}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-dark mb-1.5">Rol</label>
            <select
              value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-google-border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white"
            >
              <option value="admin">Administrador</option>
              <option value="manager">Manager</option>
              <option value="comercial">Comercial</option>
            </select>
          </div>
        </div>

        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 bg-google-blue text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            <Save size={14} />
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function ChangePinModal({ currentPin, onSave, onClose }) {
  const [pinActual, setPinActual]   = useState('');
  const [pinNuevo, setPinNuevo]     = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [errors, setErrors]         = useState({});
  const [success, setSuccess]       = useState(false);

  const validate = () => {
    const e = {};
    if (pinActual !== currentPin) e.pinActual = 'El PIN actual no es correcto';
    if (!/^\d{4,6}$/.test(pinNuevo)) e.pinNuevo = 'El nuevo PIN debe tener entre 4 y 6 dígitos numéricos';
    if (pinConfirm !== pinNuevo) e.pinConfirm = 'Los PINes no coinciden';
    return e;
  };

  const handleSubmit = () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    onSave(pinNuevo);
    setSuccess(true);
  };

  if (success) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <div className="bg-white rounded-2xl shadow-google w-full max-w-sm mx-4">
          <div className="px-8 py-10 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle size={28} className="text-green-600" />
            </div>
            <h2 className="text-base font-semibold text-google-dark">PIN actualizado correctamente</h2>
            <p className="text-sm text-google-gray">El nuevo PIN de seguridad ya está activo.</p>
            <button onClick={onClose} className="btn-primary text-sm px-6 py-2 mt-1">Cerrar</button>
          </div>
        </div>
      </div>
    );
  }

  const field = (label, value, setter, errorKey, placeholder) => (
    <div>
      <label className="block text-xs font-medium text-google-dark mb-1.5">{label}</label>
      <input
        type="password"
        value={value}
        onChange={e => { setter(e.target.value); setErrors(v => ({ ...v, [errorKey]: undefined })); }}
        className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${errors[errorKey] ? 'border-red-400' : 'border-google-border'}`}
        placeholder={placeholder}
        inputMode="numeric"
        maxLength={6}
      />
      {errors[errorKey] && <p className="text-xs text-red-500 mt-1">{errors[errorKey]}</p>}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-google-border">
          <h2 className="text-base font-semibold text-google-dark">Cambiar PIN de Seguridad</h2>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4">
          {field('PIN Actual', pinActual, setPinActual, 'pinActual', 'PIN actual')}
          {field('Nuevo PIN', pinNuevo, setPinNuevo, 'pinNuevo', '4 a 6 dígitos')}
          {field('Confirmar Nuevo PIN', pinConfirm, setPinConfirm, 'pinConfirm', 'Repite el nuevo PIN')}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
          <button
            onClick={handleSubmit}
            className="flex items-center gap-2 bg-google-blue text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            <Save size={14} />
            Guardar PIN
          </button>
        </div>
      </div>
    </div>
  );
}

function SecurityPinModal({ expectedPin, onSuccess, onClose }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const handleConfirm = () => {
    if (input === expectedPin) {
      onSuccess();
      onClose();
    } else {
      setError('PIN incorrecto. Acceso denegado.');
      setInput('');
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-sm mx-4 overflow-hidden">
        <div className="px-6 py-4 border-b border-google-border flex items-center gap-2 bg-blue-50">
          <Lock size={16} className="text-google-blue flex-shrink-0" />
          <h2 className="text-base font-semibold text-google-dark">PIN de seguridad requerido</h2>
          <button onClick={onClose} className="ml-auto text-google-gray hover:text-google-dark transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 space-y-3">
          <p className="text-sm text-google-gray">PIN de seguridad requerido para este usuario:</p>
          <input
            type="password"
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(''); }}
            onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
            className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${error ? 'border-red-400' : 'border-google-border'}`}
            placeholder="Introduce el PIN de 6 dígitos"
            inputMode="numeric"
            maxLength={6}
            autoFocus
          />
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <ShieldAlert size={12} />{error}
            </p>
          )}
        </div>
        <div className="px-6 pb-5 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
          <button
            onClick={handleConfirm}
            className="bg-google-blue text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}

const FLASH_CONFIG = {
  saved:   { text: 'Cambios guardados',   cls: 'text-green-700 bg-green-50 border-green-200' },
  deleted: { text: 'Usuario eliminado',   cls: 'text-red-700   bg-red-50   border-red-200'   },
  created: { text: 'Usuario creado',      cls: 'text-blue-700  bg-blue-50  border-blue-200'  },
};

export default function GestionUsuarios() {
  const {
    users, permissions, updatePermissions,
    addUser, editUser, deleteUser, pin, changePin,
    userPermissions, updateUserPermission, removeUserPermission, resetUserPermissions,
  } = useAuth();

  const [flash, setFlash]                           = useState(null);
  const [showPin, setShowPin]                       = useState(false);
  const [securityPinChallenge, setSecurityPinChallenge] = useState(null);
  const [pendingAction, setPendingAction]       = useState(null);
  const [visiblePasswords, setVisiblePasswords] = useState(new Set());
  const [userFormState, setUserFormState]       = useState(null);
  const [dupError, setDupError]                 = useState(false);
  const [showChangePinModal, setShowChangePinModal] = useState(false);

  const showFlash = (type) => {
    setFlash(type);
    setTimeout(() => setFlash(null), 2500);
  };

  const requestAction = (action) => {
    setPendingAction(action);
    setShowPin(true);
  };

  const executeAction = () => {
    setShowPin(false);
    if (!pendingAction) return;
    const { type } = pendingAction;

    if (type === 'toggle') {
      const { roleId, pageId } = pendingAction;
      if (roleId === 'admin') return;
      updatePermissions({
        ...permissions,
        [roleId]: { ...permissions[roleId], [pageId]: !permissions[roleId]?.[pageId] },
      });
      showFlash('saved');

    } else if (type === 'toggleUser') {
      const { username, pageId, newValue } = pendingAction;
      const targetUser  = users.find((u) => u.username === username);
      const roleDefault = !!(permissions[targetUser?.role]?.[pageId]);
      if (newValue === roleDefault) {
        removeUserPermission(username, pageId);
      } else {
        updateUserPermission(username, pageId, newValue);
      }
      showFlash('saved');

    } else if (type === 'resetUserPerms') {
      resetUserPermissions(pendingAction.username);
      showFlash('saved');

    } else if (type === 'showPassword') {
      setVisiblePasswords(prev => new Set([...prev, pendingAction.username]));

    } else if (type === 'editUser') {
      const user = users.find(u => u.username === pendingAction.username);
      setUserFormState({
        mode: 'edit',
        data: { username: user.username, password: user.password, role: user.role, displayName: user.displayName || '' },
      });

    } else if (type === 'deleteUser') {
      deleteUser(pendingAction.username);
      setVisiblePasswords(prev => { const s = new Set(prev); s.delete(pendingAction.username); return s; });
      showFlash('deleted');

    } else if (type === 'newUser') {
      setUserFormState({ mode: 'new' });
    }

    setPendingAction(null);
  };

  const handleSaveUser = (formData) => {
    if (userFormState.mode === 'new') {
      const ok = addUser(formData.username, formData.password, formData.role, formData.displayName || formData.username);
      if (!ok) { setDupError(true); return; }
      showFlash('created');
    } else {
      const originalUsername = userFormState.data.username;
      const ok = editUser(originalUsername, {
        username:    formData.username,
        password:    formData.password,
        role:        formData.role,
        displayName: formData.displayName || formData.username,
      });
      if (ok === false) { setDupError(true); return; }
      showFlash('saved');
    }
    setDupError(false);
    setUserFormState(null);
  };

  const ROLE_WEIGHT = { admin: 1, manager: 2, comercial: 3 };
  const sortedUsers = [...users].sort((a, b) => {
    const wa = ROLE_WEIGHT[a.role] ?? 9;
    const wb = ROLE_WEIGHT[b.role] ?? 9;
    if (wa !== wb) return wa - wb;
    return (a.displayName || a.username).localeCompare(b.displayName || b.username, 'es');
  });

  const usersByRole = sortedUsers.reduce((acc, u) => {
    if (!acc[u.role]) acc[u.role] = [];
    acc[u.role].push(u.displayName || u.username);
    return acc;
  }, {});

  // Non-admin users eligible for individual permission overrides
  const nonAdminUsers = sortedUsers.filter(u => u.role !== 'admin');

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {showPin && (
        <PinModal
          onSuccess={executeAction}
          onClose={() => { setShowPin(false); setPendingAction(null); }}
        />
      )}

      {securityPinChallenge && (
        <SecurityPinModal
          expectedPin={securityPinChallenge.expectedPin}
          onSuccess={securityPinChallenge.onSuccess}
          onClose={() => setSecurityPinChallenge(null)}
        />
      )}

      {showChangePinModal && (
        <ChangePinModal
          currentPin={pin}
          onSave={(newPin) => changePin(newPin)}
          onClose={() => setShowChangePinModal(false)}
        />
      )}

      {userFormState && (
        <UserFormModal
          title={userFormState.mode === 'new' ? 'Nuevo Usuario' : `Editar: ${userFormState.data?.username}`}
          initialData={userFormState.mode === 'edit' ? userFormState.data : null}
          onSave={handleSaveUser}
          onClose={() => { setUserFormState(null); setDupError(false); }}
        />
      )}

      {dupError && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white text-sm px-4 py-2.5 rounded-lg shadow-lg">
          Ya existe un usuario con ese nombre de usuario.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark">Gestión de Usuarios</h1>
          <p className="text-sm text-google-gray mt-1">
            Control de accesos por rol — los cambios se aplican de inmediato
          </p>
        </div>
        <div className="flex items-center gap-3">
          {flash && (
            <span className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border ${FLASH_CONFIG[flash].cls}`}>
              <CheckCircle size={14} />
              {FLASH_CONFIG[flash].text}
            </span>
          )}
          <button
            onClick={() => setShowChangePinModal(true)}
            className="flex items-center gap-2 btn-secondary text-xs px-3 py-1.5"
          >
            <Lock size={13} />
            Cambiar PIN de Seguridad
          </button>
          <button
            onClick={() => requestAction({ type: 'newUser' })}
            className="flex items-center gap-2 bg-google-blue text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            <Plus size={15} />
            Nuevo Usuario
          </button>
        </div>
      </div>

      {/* Role permission cards */}
      <div className="space-y-4">
        {Object.entries(ROLE_META).map(([roleId, role]) => {
          const Icon = role.icon;
          const isAdmin = roleId === 'admin';
          const roleUsers = usersByRole[roleId] || [];

          return (
            <div key={roleId} className="card overflow-hidden">
              <div className={`px-5 py-4 border-b border-google-border ${role.bg} flex items-center gap-3`}>
                <div className={`w-9 h-9 rounded-lg ${role.bg} border ${role.border} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={18} className={role.iconColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${role.text}`}>{role.label}</p>
                  <p className="text-xs text-google-gray">
                    {roleUsers.length > 0
                      ? `Usuarios: ${roleUsers.join(', ')}`
                      : 'Sin usuarios asignados'}
                  </p>
                </div>
                {isAdmin && (
                  <span className="text-xs text-google-blue bg-blue-100 px-2.5 py-1 rounded-full font-medium flex-shrink-0">
                    Acceso total garantizado
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 lg:grid-cols-8 divide-x divide-google-border">
                {PAGES.map((page) => {
                  // Usa DEFAULT_PERMISSIONS como fallback para claves añadidas
                  // después de que se grabara la configuración en Supabase
                  const active = isAdmin
                    ? true
                    : !!(permissions[roleId]?.[page.id] ?? DEFAULT_PERMISSIONS[roleId]?.[page.id]);
                  return (
                    <div
                      key={page.id}
                      className="flex flex-col items-center gap-2 px-2 py-4 hover:bg-google-bg transition-colors"
                    >
                      <p className="text-xs font-medium text-google-dark text-center leading-tight">
                        {page.label}
                      </p>
                      <Toggle
                        checked={active}
                        onChange={() => requestAction({ type: 'toggle', roleId, pageId: page.id })}
                        disabled={isAdmin}
                      />
                      <span className={`text-xs ${active ? 'text-green-600' : 'text-google-gray'}`}>
                        {active ? 'Activo' : 'Bloqueado'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Individual user permissions */}
      {nonAdminUsers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-google-border bg-orange-50 flex items-center gap-3">
            <UserCheck size={18} className="text-orange-600 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">Permisos Individuales</p>
              <p className="text-xs text-orange-600">
                Sobreescribe los permisos de rol para una persona concreta. Los cambios marcados como <strong>Personalizado</strong> tienen prioridad sobre el rol.
              </p>
            </div>
          </div>

          <div className="divide-y divide-google-border">
            {nonAdminUsers.map((user) => {
              const meta = ROLE_META[user.role] || ROLE_META.comercial;
              const Icon = meta.icon;
              const userOverrides = userPermissions[user.username] || {};
              const hasOverrides  = Object.keys(userOverrides).length > 0;

              return (
                <div key={user.username} className="px-5 py-4">
                  {/* User header row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center flex-shrink-0`}>
                      <Icon size={14} className={meta.iconColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-google-dark">
                        {user.displayName || user.username}
                        {user.displayName && user.displayName !== user.username && (
                          <span className="ml-1.5 text-xs text-google-gray font-normal">@{user.username}</span>
                        )}
                      </p>
                      <p className={`text-xs ${meta.text}`}>{meta.label}</p>
                    </div>
                    {hasOverrides && (
                      <button
                        onClick={() => requestAction({ type: 'resetUserPerms', username: user.username })}
                        className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 hover:bg-orange-50 px-2.5 py-1.5 rounded-lg transition-colors border border-orange-200"
                        title="Restablecer permisos al valor del rol"
                      >
                        <RotateCcw size={12} />
                        Restablecer
                      </button>
                    )}
                  </div>

                  {/* Page toggles */}
                  <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                    {PAGES.map((page) => {
                      const isOverridden = userOverrides[page.id] !== undefined;
                      const effective    = isOverridden
                        ? userOverrides[page.id]
                        : !!(permissions[user.role]?.[page.id] ?? DEFAULT_PERMISSIONS[user.role]?.[page.id]);

                      return (
                        <div
                          key={page.id}
                          className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border transition-colors ${
                            isOverridden
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-google-bg border-google-border'
                          }`}
                        >
                          <p className="text-xs font-medium text-google-dark text-center leading-tight">
                            {page.label}
                          </p>
                          <Toggle
                            checked={effective}
                            onChange={() => requestAction({
                              type: 'toggleUser',
                              username: user.username,
                              pageId: page.id,
                              newValue: !effective,
                            })}
                            disabled={false}
                          />
                          {isOverridden ? (
                            <span className="text-xs font-medium text-orange-600 bg-orange-100 px-1.5 py-0.5 rounded">
                              Personalizado
                            </span>
                          ) : (
                            <span className={`text-xs ${effective ? 'text-green-600' : 'text-google-gray'}`}>
                              {effective ? 'Activo' : 'Bloqueado'}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Credentials table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border bg-amber-50 flex items-center gap-3">
          <Users size={18} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Credenciales del sistema</p>
            <p className="text-xs text-amber-600">
              Las contraseñas están ocultas por defecto. Usa el ojo para revelarlas (requiere PIN).
            </p>
          </div>
        </div>

        <div className="divide-y divide-google-border">
          {sortedUsers.map((user) => {
            const meta        = ROLE_META[user.role] || ROLE_META.comercial;
            const Icon        = meta.icon;
            const isVisible   = visiblePasswords.has(user.username);
            const isProtected = user.username === 'Adolfo' || !!user.isUndeletable;

            return (
              <div
                key={user.username}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-google-bg transition-colors"
              >
                {/* Identity */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={14} className={meta.iconColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-google-dark truncate flex items-center gap-1.5">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-google-gray">
                      @{user.username} · <span className={meta.text}>{meta.label}</span>
                    </p>
                  </div>
                </div>

                {/* Password reveal */}
                <div className="flex items-center gap-2">
                  <code className="text-sm text-google-dark bg-gray-100 px-2.5 py-1 rounded font-mono min-w-[90px] text-center">
                    {isVisible ? user.password : '••••••••'}
                  </code>
                  <button
                    onClick={() => {
                      if (isVisible) {
                        setVisiblePasswords(prev => {
                          const s = new Set(prev); s.delete(user.username); return s;
                        });
                      } else if (user.securityPin) {
                        setSecurityPinChallenge({
                          expectedPin: user.securityPin,
                          onSuccess: () => setVisiblePasswords(prev => new Set([...prev, user.username])),
                        });
                      } else {
                        requestAction({ type: 'showPassword', username: user.username });
                      }
                    }}
                    className="p-1.5 text-google-gray hover:text-google-dark transition-colors rounded-md hover:bg-gray-100"
                    title={isVisible ? 'Ocultar contraseña' : 'Revelar contraseña'}
                  >
                    {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (user.securityPin) {
                        setSecurityPinChallenge({
                          expectedPin: user.securityPin,
                          onSuccess: () => {
                            const u = users.find((x) => x.username === user.username);
                            setUserFormState({
                              mode: 'edit',
                              data: { username: u.username, password: u.password, role: u.role, displayName: u.displayName || '' },
                            });
                          },
                        });
                      } else {
                        requestAction({ type: 'editUser', username: user.username });
                      }
                    }}
                    className="p-1.5 text-google-blue hover:bg-blue-50 rounded-md transition-colors"
                    title="Editar usuario"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => !isProtected && requestAction({ type: 'deleteUser', username: user.username })}
                    disabled={isProtected}
                    className={`p-1.5 rounded-md transition-colors ${
                      isProtected
                        ? 'text-gray-200 cursor-not-allowed'
                        : 'text-red-500 hover:bg-red-50'
                    }`}
                    title={isProtected ? 'El usuario raíz no se puede eliminar' : 'Eliminar usuario'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
