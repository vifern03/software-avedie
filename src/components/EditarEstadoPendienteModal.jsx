import { useState } from 'react';
import { X, Pencil } from 'lucide-react';

const ESTADOS = [
  { value: 'Pendiente de tareas', label: 'Pendiente', activeClass: 'bg-gray-700 border-gray-700 text-white' },
  { value: 'Tramitado',           label: 'Tramitado', activeClass: 'bg-orange-500 border-orange-500 text-white' },
  { value: 'Formalizado',         label: 'Formalizado', activeClass: 'bg-green-600 border-green-600 text-white' },
];

export default function EditarEstadoPendienteModal({ registro, onClose, onSave }) {
  const [estado, setEstado] = useState(registro.estado_incidencia || 'Pendiente de tareas');
  const [saving, setSaving] = useState(false);

  const nombre = registro.raw_data?.['Nombre'] || registro.nombre || registro.cups;

  const handleGuardar = async () => {
    setSaving(true);
    await onSave(estado);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4">

        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Pencil size={16} className="text-google-blue" />
            </div>
            <h2 className="text-base font-semibold text-google-dark">Editar estado del contrato</h2>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <p className="text-sm font-medium text-google-dark leading-tight">{nombre}</p>
            <p className="text-xs text-google-gray font-mono mt-0.5">{registro.cups}</p>
          </div>

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
