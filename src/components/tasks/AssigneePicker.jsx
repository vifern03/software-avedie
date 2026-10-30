import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { Avatar } from './ui';
import { normalizar } from '../../lib/tasksLogica';

/** Selector de usuarios. `multiple` → varios. `permitirVacio` → los chips se pueden quitar todos. `fijos` → usuarios que no se pueden quitar. */
const ROL_LABEL = { admin: 'Admin', manager: 'Manager', comercial: 'Comercial' };

export default function AssigneePicker({ usuarios, value, onChange, colorDe, nombreDe, multiple = true, disabled = false, id, yo, placeholder = 'Elige responsable…', permitirVacio = false, fijos = [] }) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const ref = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [abierto]);

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda);
    return [...usuarios]
      .filter((u) => !q || normalizar(`${u.display_name} ${u.username}`).includes(q))
      .sort((a, b) => (a.display_name || a.username).localeCompare(b.display_name || b.username));
  }, [usuarios, busqueda]);

  const toggle = (u) => {
    if (!multiple) { onChange([u]); setAbierto(false); return; }
    if (value.includes(u) && fijos.includes(u)) return;
    onChange(value.includes(u) ? value.filter((x) => x !== u) : [...value, u]);
  };

  return (
    <div
      className="relative"
      ref={ref}
      onKeyDown={(e) => {
        // Escape cierra solo el desplegable (no el modal/drawer que lo contiene).
        if (e.key === 'Escape' && abierto) { e.stopPropagation(); setAbierto(false); triggerRef.current?.focus(); }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        className="input-field flex items-center gap-1.5 flex-wrap min-h-[38px] text-left disabled:bg-google-bg disabled:cursor-not-allowed"
      >
        {value.length === 0 && <span className="text-google-gray">{placeholder}</span>}
        {value.map((u) => (
          <span key={u} className="inline-flex items-center gap-1 bg-google-bg border border-google-border rounded-full pl-0.5 pr-2 py-0.5 text-xs">
            <Avatar nombre={nombreDe(u)} color={colorDe(u)} size={18} />
            {nombreDe(u)}{u === yo ? ' (tú)' : ''}
            {multiple && !disabled && !fijos.includes(u) && (value.length > 1 || permitirVacio) && (
              <X size={12} className="text-google-gray hover:text-google-dark" onClick={(e) => { e.stopPropagation(); toggle(u); }} aria-label={`Quitar ${nombreDe(u)}`} />
            )}
          </span>
        ))}
        <ChevronDown size={14} className="ml-auto text-google-gray" />
      </button>

      {abierto && (
        <div className="absolute z-30 mt-1 w-full min-w-[240px] bg-white border border-google-border rounded-lg shadow-google overflow-hidden">
          <div className="p-2 border-b border-google-border flex items-center gap-2">
            <Search size={14} className="text-google-gray" />
            <input
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar persona…"
              className="flex-1 text-sm outline-none"
              aria-label="Buscar persona"
            />
          </div>
          <ul role="listbox" aria-multiselectable={multiple} className="max-h-60 overflow-y-auto py-1">
            {filtrados.map((u) => {
              const sel = value.includes(u.username);
              return (
                <li key={u.username}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={sel}
                    onClick={() => toggle(u.username)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-google-bg ${sel ? 'bg-google-blue-light/60' : ''}`}
                  >
                    <Avatar nombre={u.display_name || u.username} color={colorDe(u.username)} size={22} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate text-google-dark">{u.display_name || u.username}{u.username === yo ? ' (tú)' : ''}</span>
                      <span className="block text-[11px] text-google-gray">{u.username} · {ROL_LABEL[u.role] || u.role}</span>
                    </span>
                    {sel && <Check size={15} className="text-google-blue" />}
                  </button>
                </li>
              );
            })}
            {filtrados.length === 0 && <li className="px-3 py-3 text-sm text-google-gray">Sin resultados</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
