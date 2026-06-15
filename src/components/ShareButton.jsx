import { useState, useRef, useEffect } from 'react';
import { Share2, Check, Users, X } from 'lucide-react';

export const SHARE_USERS = [
  'CARMEN BALLESTEROS',
  'OSCAR ZAMARRO',
  'ELISA GARCIA',
  'ISABEL ERICE',
  'IRENE BONILLO',
];

export default function ShareButton({ cliente, onUpdate }) {
  const [open,      setOpen]      = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [selection, setSelection] = useState([]);
  const wrapRef = useRef(null);

  const sharedWith = cliente.compartido_con || [];
  const isShared   = sharedWith.length > 0;

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
    await onUpdate(cliente.id, selection);
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setOpen(false); setSaved(false); }, 700);
  };

  const tooltipLabel = isShared
    ? `Compartido con: ${sharedWith.join(', ')}`
    : 'Compartir con otro trabajador';

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
            {SHARE_USERS.map(u => (
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
