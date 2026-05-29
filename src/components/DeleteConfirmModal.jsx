import { AlertTriangle, X, ShieldAlert, Trash2 } from 'lucide-react';

export default function DeleteConfirmModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4">

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-red-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-red-500 flex items-center justify-center flex-shrink-0">
              <ShieldAlert size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Confirmar eliminación</h2>
              <p className="text-xs text-red-600 font-medium">Acción irreversible</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
            <AlertTriangle size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 leading-relaxed">
              ¿Estás seguro de que deseas eliminar este registro?{' '}
              <span className="font-semibold">Esta acción es irreversible.</span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-google-border rounded-b-2xl flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            <Trash2 size={15} />
            <span>Eliminar registro</span>
          </button>
        </div>
      </div>
    </div>
  );
}
