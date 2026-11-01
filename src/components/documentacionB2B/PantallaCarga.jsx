import { useEffect, useState } from 'react';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';

/** Carga superpuesta con pasos reales, tiempo estimado y barra de progreso. */
export default function PantallaCarga({ titulo, pasos, actual }) {
  const [t0] = useState(() => Date.now());
  const [, setTick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => setTick((v) => v + 1), 500);
    return () => clearInterval(i);
  }, []);

  const idx = Math.max(0, pasos.findIndex((p) => p.id === actual));
  const total = pasos.reduce((s, p) => s + p.segundos, 0);
  const hecho = pasos.slice(0, idx).reduce((s, p) => s + p.segundos, 0);
  const pct = Math.round((hecho / total) * 100);
  const restante = Math.max(1, Math.round(total - hecho - Math.min((Date.now() - t0) / 1000 - hecho, pasos[idx].segundos - 1) ));

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" data-testid="pantalla-carga">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-google-dark">{titulo}</h3>
        <p className="text-xs text-google-gray mt-0.5">Tiempo estimado: unos {restante} s</p>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-4 mb-5">
          <div className="h-full bg-google-blue rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <ul className="space-y-2.5">
          {pasos.map((p, i) => (
            <li key={p.id} className={`flex items-center gap-2.5 text-sm ${i > idx ? 'text-gray-400' : 'text-google-dark'}`}>
              {i < idx ? <CheckCircle2 size={16} className="text-green-600" />
                : i === idx ? <Loader2 size={16} className="text-google-blue animate-spin" />
                  : <Circle size={16} className="text-gray-300" />}
              {p.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
