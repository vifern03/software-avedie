import { X, HelpCircle } from 'lucide-react';

export default function ConfirmActionModal({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', confirmClassName = 'bg-google-blue hover:bg-blue-700', onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4">

        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <HelpCircle size={18} className="text-google-blue" />
            </div>
            <h2 className="text-base font-semibold text-google-dark">{title}</h2>
          </div>
          <button onClick={onCancel} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5">
          <p className="text-sm text-google-dark leading-relaxed">{message}</p>
        </div>

        <div className="px-6 py-4 border-t border-google-border flex items-center justify-end gap-3">
          <button onClick={onCancel} className="btn-secondary">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${confirmClassName}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
