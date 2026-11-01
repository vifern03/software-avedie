import { useEffect, useState } from 'react';
import { ArrowRight, History, Loader2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { rpc } from '../../lib/documentacionB2B/api';
import { describirCambios, fechaHoraES } from '../../lib/documentacionB2B/modificaciones';

const Valor = ({ texto, nuevo }) => (texto
  ? <span className={`inline-block rounded-md px-2 py-0.5 text-xs break-all ${nuevo ? 'bg-blue-50 text-google-blue font-medium' : 'bg-gray-100 text-google-gray'}`}>{texto}</span>
  : <span className="text-xs italic text-gray-400">vacío</span>);

function Tarjeta({ mod, multipunto }) {
  const { fecha, hora } = fechaHoraES(mod.fecha);
  return (
    <article className="border border-google-border rounded-xl bg-white shadow-sm overflow-hidden" data-testid="modificacion">
      <header className="flex items-center gap-3 px-4 py-3 bg-gray-50/70 border-b border-gray-100">
        <div className="w-9 h-9 rounded-full bg-google-blue text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
          {mod.nombre.charAt(0).toUpperCase()}
        </div>
        <p className="text-sm text-google-dark">
          <strong className="font-semibold">{mod.nombre}</strong> modificó el documento el {fecha} a las {hora}
        </p>
      </header>
      <ul className="divide-y divide-gray-100">
        {describirCambios(mod.editados, multipunto).map((c) => (
          <li key={c.clave} className="px-4 py-2.5 sm:flex sm:items-center sm:gap-3" data-testid="cambio">
            <span className="block sm:w-52 flex-shrink-0 text-xs font-medium text-google-gray mb-1 sm:mb-0">{c.campo}</span>
            <span className="flex flex-wrap items-center gap-2 min-w-0">
              <Valor texto={c.de} />
              <ArrowRight size={13} className="text-gray-400 flex-shrink-0" />
              <Valor texto={c.a} nuevo />
            </span>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Ventana con las modificaciones de una documentación, de la más reciente a la más antigua. */
export default function ModificacionesModal({ fila, onCerrar }) {
  const { currentUser } = useAuth();
  const [mods, setMods] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    rpc('doc_b2b_modificaciones_gestion', currentUser.username, { p_id: fila.id })
      .then((r) => setMods(r.filter((m) => describirCambios(m.editados).length > 0)))
      .catch((e) => setError(e.message));
  }, [fila.id, currentUser.username]);

  return (
    <div className="fixed inset-0 z-[60] bg-black/30 backdrop-blur-sm overflow-y-auto p-4 flex" data-testid="modificaciones-modal">
      <div className="bg-gray-50 rounded-2xl shadow-google w-full max-w-2xl m-auto overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-google-border">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0"><History size={19} className="text-google-blue" /></div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-google-dark">Modificaciones del contrato</h3>
            <p className="text-xs text-google-gray truncate">Documentación de {fila.titular}</p>
          </div>
          <button onClick={onCerrar} className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" aria-label="Cerrar" data-testid="cerrar-modificaciones"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {!mods && !error && <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-google-blue" /></div>}
          {mods?.length === 0 && <p className="py-12 text-center text-sm text-google-gray">Esta documentación todavía no tiene modificaciones.</p>}
          {mods?.map((m) => <Tarjeta key={m.version} mod={m} multipunto={fila.num_suministros > 1} />)}
        </div>
      </div>
    </div>
  );
}
