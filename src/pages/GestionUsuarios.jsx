import { useState } from 'react';
import {
  Shield, Briefcase, UserCheck, Users, CheckCircle,
  Pencil, Trash2, Plus, X, Save, Lock, RotateCcw, User, ShieldAlert, KeyRound,
} from 'lucide-react';
import { useAuth, DEFAULT_PERMISSIONS } from '../context/AuthContext';
import { hashPassword } from '../lib/crypto';
import PinModal from '../components/PinModal';

const PAGES = [
  { id: 'dashboard',    label: 'Dashboard'       },
  { id: 'historica',    label: 'Histórica'       },
  { id: 'radar',        label: 'Radar'           },
  { id: 'b2c',          label: 'Alta B2C'        },
  { id: 'b2b',          label: 'Alta B2B'        },
  { id: 'visitas',      label: 'Visitas Tienda'  },
  { id: 'visitas_pymes', label: 'Visitas PYME'   },
  { id: 'llamadas',     label: 'Reg. Llamadas'  },
  { id: 'fichajes',     label: 'Control Horario' },
  { id: 'reportes',     label: 'Reportes'        },
  { id: 'historial',    label: 'Historial'       },
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

// isEdit determina si es creación (contraseña obligatoria) o edición (opcional para restablecerla)
function UserFormModal({ title, initialData, onSave, onClose }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState(
    initialData
      ? { ...initialData, password: '' }  // edit: contraseña vacía por defecto
      : { username: '', password: '', role: 'comercial', displayName: '' }
  );
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.username.trim()) e.username = 'El nombre de usuario es obligatorio';
    if (!isEdit && !form.password.trim()) e.password = 'La contraseña es obligatoria para nuevos usuarios';
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
            <label className="block text-xs font-medium text-google-dark mb-1.5">Nombre de usuario</label>
            <input
              type="text"
              value={form.username}
              onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
              className={`w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                errors.username ? 'border-red-400' : 'border-google-border'
              }`}
              placeholder="ej. comercial2"
            />
            {errors.username && <p className="text-xs text-red-500 mt-1">{errors.username}</p>}
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
              {isEdit ? 'Nueva contraseña' : 'Contraseña'}
            </label>
            <div className="relative">
              <KeyRound size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className={`w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                  errors.password ? 'border-red-400' : 'border-google-border'
                }`}
                placeholder={isEdit ? 'Dejar vacío para no cambiar' : 'Contraseña de acceso'}
                autoComplete="new-password"
              />
            </div>
            {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            {isEdit && (
              <p className="text-xs text-google-gray mt-1">
                Las contraseñas se almacenan cifradas con SHA-256.
              </p>
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
          <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
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
            placeholder="Introduce el PIN"
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
    updateUserEquipo,
  } = useAuth();

  const [flash, setFlash]                           = useState(null);
  const [showPin, setShowPin]                       = useState(false);
  const [securityPinChallenge, setSecurityPinChallenge] = useState(null);
  const [pendingAction, setPendingAction]       = useState(null);
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
      const currentEffective = !!(permissions[roleId]?.[pageId] ?? DEFAULT_PERMISSIONS[roleId]?.[pageId]);
      updatePermissions({
        ...permissions,
        [roleId]: { ...permissions[roleId], [pageId]: !currentEffective },
      });
      showFlash('saved');

    } else if (type === 'toggleUser') {
      const { username, pageId, newValue } = pendingAction;
      const targetUser  = users.find((u) => u.username === username);
      const roleDefault = !!(permissions[targetUser?.role]?.[pageId] ?? DEFAULT_PERMISSIONS[targetUser?.role]?.[pageId]);
      if (newValue === roleDefault) {
        removeUserPermission(username, pageId);
      } else {
        updateUserPermission(username, pageId, newValue);
      }
      showFlash('saved');

    } else if (type === 'resetUserPerms') {
      resetUserPermissions(pendingAction.username);
      showFlash('saved');

    } else if (type === 'editUser') {
      const user = users.find(u => u.username === pendingAction.username);
      setUserFormState({
        mode: 'edit',
        data: { username: user.username, password: '', role: user.role, displayName: user.displayName || '' },
      });

    } else if (type === 'deleteUser') {
      deleteUser(pendingAction.username);
      showFlash('deleted');

    } else if (type === 'newUser') {
      setUserFormState({ mode: 'new' });
    }

    setPendingAction(null);
  };

  // handleSaveUser es async: hashea la contraseña antes de persistir
  const handleSaveUser = async (formData) => {
    if (userFormState.mode === 'new') {
      const hashedPw = await hashPassword(formData.password);
      const ok = addUser(formData.username, hashedPw, formData.role, formData.displayName || formData.username);
      if (!ok) { setDupError(true); return; }
      showFlash('created');
    } else {
      const originalUsername = userFormState.data.username;
      const updates = {
        username:    formData.username,
        role:        formData.role,
        displayName: formData.displayName || formData.username,
      };
      // Solo actualizar contraseña si el admin introdujo una nueva
      if (formData.password.trim()) {
        updates.password = await hashPassword(formData.password);
      }
      const ok = editUser(originalUsername, updates);
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

  const nonAdminUsers = sortedUsers.filter(u => u.role !== 'admin');

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-5xl">

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

              <div className="grid grid-cols-3 lg:grid-cols-11 divide-x divide-google-border">
                {PAGES.map((page) => {
                  const active = isAdmin
                    ? true
                    : !!(permissions[roleId]?.[page.id] ?? DEFAULT_PERMISSIONS[roleId]?.[page.id]);
                  return (
                    <div
                      key={page.id}
                      className="flex flex-col items-center gap-1.5 px-1 py-3 hover:bg-google-bg transition-colors"
                    >
                      <p className="text-[10px] font-medium text-google-dark text-center leading-tight">
                        {page.label}
                      </p>
                      <Toggle
                        checked={active}
                        onChange={() => requestAction({ type: 'toggle', roleId, pageId: page.id })}
                        disabled={isAdmin}
                      />
                      <span className={`text-[10px] ${active ? 'text-green-600' : 'text-google-gray'}`}>
                        {active ? 'Activo' : 'Inactivo'}
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
                    {/* Sede del equipo */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-xs text-google-gray whitespace-nowrap">Sede:</span>
                      <select
                        value={user.equipo || 'Ambos'}
                        onChange={(e) => updateUserEquipo(user.username, e.target.value)}
                        className="text-xs border border-google-border rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 text-google-dark cursor-pointer"
                      >
                        <option value="Palencia">Palencia</option>
                        <option value="Valladolid">Valladolid</option>
                        <option value="Ambos">Ambos</option>
                        <option value="Ninguno">Ninguno</option>
                      </select>
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

                  <div className="grid grid-cols-3 sm:grid-cols-11 gap-1.5">
                    {PAGES.map((page) => {
                      const isOverridden = userOverrides[page.id] !== undefined;
                      const effective    = isOverridden
                        ? userOverrides[page.id]
                        : !!(permissions[user.role]?.[page.id] ?? DEFAULT_PERMISSIONS[user.role]?.[page.id]);

                      return (
                        <div
                          key={page.id}
                          className={`flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg border transition-colors ${
                            isOverridden
                              ? 'bg-orange-50 border-orange-200'
                              : 'bg-google-bg border-google-border'
                          }`}
                        >
                          <p className="text-[10px] font-medium text-google-dark text-center leading-tight">
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
                            <span className="text-[10px] font-medium text-orange-600 bg-orange-100 px-1 py-0.5 rounded">
                              Custom
                            </span>
                          ) : (
                            <span className={`text-[10px] ${effective ? 'text-green-600' : 'text-google-gray'}`}>
                              {effective ? 'Activo' : 'Inactivo'}
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

      {/* Tabla de usuarios — contraseñas siempre ocultas (no recuperables) */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border bg-amber-50 flex items-center gap-3">
          <Users size={18} className="text-amber-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Usuarios del sistema</p>
            <p className="text-xs text-amber-600">
              Las contraseñas están cifradas con SHA-256 y no son recuperables. Para cambiarla, usa el botón Editar.
            </p>
          </div>
        </div>

        <div className="divide-y divide-google-border">
          {sortedUsers.map((user) => {
            const meta        = ROLE_META[user.role] || ROLE_META.comercial;
            const Icon        = meta.icon;
            const isProtected = user.username === 'Adolfo' || !!user.isUndeletable;

            return (
              <div
                key={user.username}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-google-bg transition-colors"
              >
                {/* Identidad */}
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={14} className={meta.iconColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-google-dark truncate">
                      {user.displayName || user.username}
                    </p>
                    <p className="text-xs text-google-gray">
                      @{user.username} · <span className={meta.text}>{meta.label}</span>
                    </p>
                  </div>
                </div>

                {/* Contraseña — nunca visible, cifrada en BD */}
                <div className="flex items-center gap-2">
                  <code className="text-sm text-google-gray bg-gray-100 px-2.5 py-1 rounded font-mono min-w-[90px] text-center select-none">
                    ••••••••
                  </code>
                  <span className="text-xs text-google-gray bg-gray-50 border border-google-border px-2 py-1 rounded">
                    SHA-256
                  </span>
                </div>

                {/* Botones de acción */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      if (user.securityPin) {
                        setSecurityPinChallenge({
                          expectedPin: user.securityPin,
                          onSuccess: () => {
                            setUserFormState({
                              mode: 'edit',
                              data: { username: user.username, password: '', role: user.role, displayName: user.displayName || '' },
                            });
                          },
                        });
                      } else {
                        requestAction({ type: 'editUser', username: user.username });
                      }
                    }}
                    className="p-1.5 text-google-blue hover:bg-blue-50 rounded-md transition-colors"
                    title="Editar usuario / Restablecer contraseña"
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
