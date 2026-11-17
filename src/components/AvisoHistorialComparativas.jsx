import { FileClock, UserPlus, Pencil, ArrowBigRight } from 'lucide-react';

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
          <div className="mt-2 flex items-center gap-1.5">
            <ArrowBigRight size={26} className="flex-shrink-0 text-amber-500 fill-amber-400" />
            <p className="text-xs font-medium text-black leading-snug">
              Se guarda la <span className="font-bold">última tarifa que dejes seleccionada</span>; si cambias de tarifa, se actualiza esa misma comparativa.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const fechaCorta = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

/** Franja que indica que se está editando una comparativa abierta desde el Historial. */
export function AvisoEdicion({ ed }) {
  if (!ed) return null;
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <Pencil size={14} className="mt-0.5 flex-shrink-0 text-amber-600" />
      <p className="leading-relaxed">
        <span className="font-semibold">Editando la comparativa del {fechaCorta(ed.created_at)}</span>
        {ed.propia
          ? '. Los cambios (tarifa, datos…) se guardan en esa misma ficha del Historial.'
          : '. La original no se modifica: si cambias algo, se guarda como otro estudio a tu nombre en el mismo CUPS.'}
      </p>
    </div>
  );
}
