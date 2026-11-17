import { FileClock, UserPlus } from 'lucide-react';

/** Aviso compacto en las comparativas: se guardan solas y desde el Historial se puede dar de alta. */
export default function AvisoHistorialComparativas() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 via-indigo-50 to-white px-4 py-3 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-blue-500 to-indigo-500" />
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow">
          <FileClock size={16} />
        </div>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-google-dark">
            <span className="px-1.5 py-0.5 rounded-full bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wide">Novedad</span>
            Tus comparativas se guardan solas
          </p>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            Encuéntralas en <span className="font-semibold text-blue-700">Historial de Comparativas</span> y, desde allí, pulsa{' '}
            <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-700"><UserPlus size={11} />Alta</span>{' '}
            para crear el contrato en el CRM con los datos ya rellenos. Menos escribir, menos errores.
          </p>
        </div>
      </div>
    </div>
  );
}
