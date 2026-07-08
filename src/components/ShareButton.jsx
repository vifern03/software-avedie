import { useState, useRef, useEffect } from 'react';
import { Share2, Check, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

// Calcula los display names de los usuarios con los que `user` puede compartir:
// - admin/manager: cualquier otro usuario (sin restricción)
// - comercial: solo los autorizados explícitamente por el admin en share_permissions
export function getShareTargets(user, users, sharePermissions) {
  if (!user) return [];
  const isPrivileged = user.role === 'admin' || user.role === 'manager';
  const allowedUsernames = isPrivileged
    ? users.filter(u => u.username !== user.username).map(u => u.username)
    : (sharePermissions?.[user.username] || []);

  return allowedUsernames
    .map(uname => users.find(u => u.username === uname))
    .filter(Boolean)
    .map(u => u.displayName || u.username);
}

export default function ShareButton({ cliente, onUpdate }) {
  const { currentUser, users, sharePermissions } = useAuth();
  const [open,      setOpen]      = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [selection, setSelection] = useState([]);
  const wrapRef = useRef(null);

  const shareTargets = getShareTargets(currentUser, users, sharePermissions);
  const sharedWith = cliente.compartido_con || [];
  const isShared   = sharedWith.length > 0;

  // Solo quien dio de alta el contrato (el "Tramitado por" original) puede
  // compartirlo. Un receptor de un contrato compartido no puede re-compartirlo
  // con otra persona. Admin/manager no tienen esta restricción.
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isOwner = isPrivileged
    || (cliente.comercial || '').toLowerCase() === (currentUser?.username || '').toLowerCase();

  const handleOpen = () => {
    setSelection([...sharedWith]);
    setSaved(false);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (u) =>
    setSelection(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(cliente.id, selection, currentUser?.username);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setOpen(false); setSaved(false); }, 700);
  };

  const tooltipLabel = isShared
    ? `Compartido con: ${sharedWith.join(', ')}`
    : 'Compartir con otro trabajador';

  if (!isOwner) {
    return (
      <span
        className="p-1 rounded text-gray-300 cursor-not-allowed inline-flex"
        title={isShared ? `Compartido con: ${sharedWith.join(', ')} (solo quien lo dio de alta puede compartirlo)` : 'Solo quien dio de alta este contrato puede compartirlo'}
      >
        <Share2 size={15} />
      </span>
    );
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={handleOpen}
        title={tooltipLabel}
        className={`p-1 rounded transition-colors ${
          isShared
            ? 'text-emerald-600 hover:bg-emerald-50'
            : 'text-slate-400 hover:bg-slate-100'
        }`}
      >
        <Share2 size={15} />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-[200] w-64 bg-white border border-google-border rounded-xl shadow-xl">
          {/* Header */}
          <div className="px-3 py-2.5 border-b border-google-border flex items-center justify-between bg-slate-50 rounded-t-xl">
            <div className="flex items-center gap-1.5">
              <Users size={13} className="text-google-blue" />
              <span className="text-xs font-semibold text-google-dark">
                {isShared ? 'Modificar acceso' : 'Compartir contrato'}
              </span>
            </div>
            <button onClick={() => setOpen(false)} className="text-google-gray hover:text-google-dark p-0.5">
              <X size={13} />
            </button>
          </div>

          {/* User list */}
          <div className="px-3 py-2.5 space-y-2">
            <p className="text-xs text-google-gray">Trabajadores con acceso a este contrato:</p>
            {shareTargets.length === 0 && (
              <p className="text-xs text-google-gray italic">
                No tienes autorización para compartir con nadie. Pídele al administrador que te asigne destinatarios en Gestión de Usuarios.
              </p>
            )}
            {shareTargets.map(u => (
              <button
                key={u}
                type="button"
                onClick={() => toggle(u)}
                className="flex items-center gap-2 w-full text-left group"
              >
                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                  selection.includes(u)
                    ? 'bg-google-blue border-google-blue'
                    : 'border-gray-300 bg-white group-hover:border-google-blue'
                }`}>
                  {selection.includes(u) && <Check size={10} className="text-white" strokeWidth={3} />}
                </div>
                <span className="text-xs text-google-dark">{u}</span>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-3 pb-3 pt-2 border-t border-google-border flex gap-2">
            <button
              onClick={() => setOpen(false)}
              className="flex-1 py-1.5 text-xs rounded-lg border border-google-border text-google-gray hover:bg-google-bg transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={saving || saved}
              className={`flex-1 py-1.5 text-xs rounded-lg text-white transition-colors disabled:opacity-60 ${
                saved ? 'bg-green-500' : 'bg-google-blue hover:bg-blue-700'
              }`}
            >
              {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
