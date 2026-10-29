import { useState } from 'react';
import { X, Pencil, AlertTriangle } from 'lucide-react';
import { valorCampo, validarEdicion } from '../lib/pendientesEdicion';

const ESTADOS = [
  { value: 'Pendiente de tareas', label: 'Pendiente', activeClass: 'bg-gray-700 border-gray-700 text-white' },
  { value: 'Tramitado',           label: 'Tramitado', activeClass: 'bg-orange-500 border-orange-500 text-white' },
  { value: 'Formalizado',         label: 'Formalizado', activeClass: 'bg-green-600 border-green-600 text-white' },
];

const CAMPOS_TEXTO = [
  { key: 'nombre',               label: 'Nº OI' },
  { key: 'cups',                 label: 'CUPS', mono: true },
  { key: 'numero_caso',          label: 'Nº de caso' },
  { key: 'fecha_creacion_excel', label: 'Fecha (Excel)', placeholder: 'D/M/AAAA' },
];

/* editarCampos: admin y manager también editan Nº OI, CUPS, nº de caso y fecha;
   los comerciales solo cambian el estado. onSave recibe el formulario completo
   y puede devolver { error } para mostrarlo sin cerrar el modal. */
export default function EditarEstadoPendienteModal({ registro, onClose, onSave, editarCampos = false }) {
  const [form, setForm] = useState(() => ({
    nombre:               valorCampo(registro, 'nombre'),
    cups:                 valorCampo(registro, 'cups'),
    numero_caso:          valorCampo(registro, 'numero_caso'),
    fecha_creacion_excel: valorCampo(registro, 'fecha_creacion_excel'),
    estado_incidencia:    valorCampo(registro, 'estado_incidencia'),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const estado = form.estado_incidencia;
  const setEstado = (v) => setForm(f => ({ ...f, estado_incidencia: v }));

  const nombre = valorCampo(registro, 'nombre') || registro.cups;

  const handleGuardar = async () => {
    const errorValidacion = editarCampos ? validarEdicion(form) : null;
    if (errorValidacion) { setError(errorValidacion); return; }
    setSaving(true);
    setError(null);
    const res = await onSave(form);
    setSaving(false);
    if (res?.error) setError(res.error.message || 'No se pudo guardar. Inténtalo de nuevo.');
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4">

        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Pencil size={16} className="text-google-blue" />
            </div>
            <h2 className="text-base font-semibold text-google-dark">{editarCampos ? 'Editar pendiente' : 'Editar estado del contrato'}</h2>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {editarCampos ? (
            <div className="grid grid-cols-2 gap-3">
              {CAMPOS_TEXTO.map(c => (
                <div key={c.key} className={c.key === 'cups' ? 'col-span-2' : ''}>
                  <label className="block text-xs font-medium text-google-gray uppercase tracking-wider mb-1">{c.label}</label>
                  <input
                    type="text"
                    value={form[c.key]}
                    placeholder={c.placeholder}
                    onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                    className={`input-field h-9 ${c.mono ? 'font-mono text-xs' : 'text-sm'}`}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-google-dark leading-tight">{nombre}</p>
              <p className="text-xs text-google-gray font-mono mt-0.5">{registro.cups}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-google-gray uppercase tracking-wider mb-2">Nuevo estado</label>
            <div className="grid grid-cols-3 gap-2">
              {ESTADOS.map(e => (
                <button
                  key={e.value}
                  type="button"
                  onClick={() => setEstado(e.value)}
                  className={`px-2 py-2.5 rounded-xl border text-xs font-semibold transition-colors ${
                    estado === e.value ? e.activeClass : 'bg-white border-google-border text-google-gray hover:border-google-blue hover:text-google-blue'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg px-3 py-2 border bg-red-50 border-red-200">
              <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-google-border flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
          <button onClick={handleGuardar} disabled={saving} className="btn-primary">
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}
