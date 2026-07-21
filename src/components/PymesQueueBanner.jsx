import { useState } from 'react';
import { WifiOff, Loader2, RotateCw, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useData } from '../context/DataContext';

// Banner global (visible en cualquier página) que muestra las visitas PYME
// que no se han podido confirmar aún en Supabase — normalmente por falta de
// cobertura del comercial en el momento de guardar. Los datos ya están a
// salvo en el dispositivo (localStorage) y se reintenta la subida sola en
// segundo plano; este banner es solo visibilidad + un botón de emergencia
// para reintentar ya o descartar un registro roto.
export default function PymesQueueBanner() {
  const { pymesQueuePending, flushPymesQueue, discardQueuedVisitaPyme } = useData();
  const [expanded, setExpanded] = useState(false);

  if (!pymesQueuePending || pymesQueuePending.length === 0) return null;

  const handleDiscard = (item) => {
    const ok = window.confirm(
      `¿Descartar definitivamente la visita a "${item.data?.nombre_empresa || 'sin nombre'}"?\n\nSe perderán estos datos: no se ha llegado a guardar en el CRM.`
    );
    if (ok) discardQueuedVisitaPyme(item.localId);
  };

  return (
    <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[70] w-[min(92vw,420px)] print:hidden">
      <div className="bg-white rounded-2xl shadow-google border border-amber-200 overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center gap-3 px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
            <WifiOff size={15} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">
              {pymesQueuePending.length === 1
                ? '1 visita PYME pendiente de subir'
                : `${pymesQueuePending.length} visitas PYME pendientes de subir`}
            </p>
            <p className="text-xs text-amber-700">Sin cobertura — se están reintentando solas</p>
          </div>
          <Loader2 size={16} className="text-amber-500 animate-spin flex-shrink-0" />
          {expanded ? <ChevronDown size={16} className="text-amber-600 flex-shrink-0" /> : <ChevronUp size={16} className="text-amber-600 flex-shrink-0" />}
        </button>

        {expanded && (
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-100">
            {pymesQueuePending.map(item => (
              <div key={item.localId} className="px-4 py-2.5 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-google-dark truncate">{item.data?.nombre_empresa || 'Sin nombre'}</p>
                  <p className="text-[11px] text-google-gray">
                    {item.data?.fecha} {item.data?.hora} · intento {item.attempts || 0}
                    {item.lastError ? ` · ${item.lastError}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  title="Descartar (perderá esta visita)"
                  onClick={() => handleDiscard(item)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            <div className="px-4 py-2.5 bg-gray-50">
              <button
                type="button"
                onClick={() => flushPymesQueue()}
                className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 py-1.5"
              >
                <RotateCw size={12} /> Reintentar ahora
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
