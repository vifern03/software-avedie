import { useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import { buscarAltas, generarDocumentacion, leerDocumentos } from '../../lib/documentacionB2B/flujo';
import { MAX_CUPS, limpiarCups } from '../../lib/documentacionB2B/seleccion';
import { normalizarCups } from '../../lib/distribuidoras';

const PROGRESO = { plantillas: 10, tarifa: 30, pdf: 55, guardar: 80 };
const TIEMPO_GENERAR = '10 segundos';

/** Ventana de generación: CUPS, lectura de datos, confirmación y carga. */
export default function GenerarDocumentacionModal({ actor, onCerrar, onGenerada }) {
  const [fase, setFase] = useState('cups'); // cups | extrayendo | resumen | verificar | generando
  const [entradas, setEntradas] = useState(['']);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);
  const [paso, setPaso] = useState('plantillas');
  const abierta = useRef(true);

  const cups = limpiarCups(entradas);

  const cerrar = () => {
    abierta.current = false;
    onCerrar();
  };

  const extraer = async (e) => {
    e.preventDefault();
    setError('');
    setFase('extrayendo');
    try {
      const clientes = await buscarAltas({ cups, actor });
      const lecturas = await leerDocumentos({ clientes });
      if (!abierta.current) return;
      setDatos({ clientes, lecturas });
      setFase('resumen');
    } catch (err) {
      setError(err.message);
      setFase('cups');
    }
  };

  const generar = async () => {
    setError('');
    setFase('generando');
    try {
      onGenerada(await generarDocumentacion({ ...datos, actor, onPaso: setPaso }));
    } catch (err) {
      setError(err.message);
      setFase('verificar');
    }
  };

  return (
    <div className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm overflow-y-auto p-4 flex" data-testid="generar-modal">
      <div className="relative bg-white rounded-2xl shadow-google w-full m-auto max-w-lg">
        {fase !== 'generando' && (
          <button onClick={cerrar} className="absolute right-3 top-3 z-40 p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" aria-label="Cerrar" data-testid="cerrar-generar"><X size={18} /></button>
        )}
        <div className="p-6">
          {error && <p className="mb-4 mr-8 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" data-testid="error-generar">{error}</p>}

          {fase === 'cups' && (
            <form onSubmit={extraer} className="space-y-3" data-testid="paso-cups">
              <p className="text-sm font-medium text-google-dark pr-8">Introduzca el CUPS o los CUPS sobre los que quiere generar documentación</p>
              {entradas.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input autoFocus={i === entradas.length - 1} value={v} placeholder="CUPS" aria-label={`CUPS ${i + 1}`} data-testid="campo-cups"
                    onChange={(e) => setEntradas((l) => l.map((x, j) => (j === i ? e.target.value : x)))}
                    className="input-field w-full text-sm font-mono" />
                  {entradas.length > 1 && (
                    <button type="button" onClick={() => setEntradas((l) => l.filter((_, j) => j !== i))} data-testid="quitar-cups"
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" aria-label={`Quitar CUPS ${i + 1}`}><X size={16} /></button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 pt-1">
                {entradas.length < MAX_CUPS
                  ? <button type="button" onClick={() => setEntradas((l) => [...l, ''])} data-testid="anadir-cups" className="text-sm text-google-blue hover:underline flex items-center gap-1"><Plus size={14} /> Añadir otro CUPS</button>
                  : <span />}
                <button type="submit" disabled={cups.length === 0} data-testid="cups-continuar" className="btn-primary text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">Continuar</button>
              </div>
            </form>
          )}

          {fase === 'extrayendo' && (
            <div className="py-10 flex flex-col items-center gap-3" data-testid="extrayendo">
              <Loader2 size={26} className="animate-spin text-google-blue" />
              <p className="text-sm text-google-dark">Extrayendo datos del cliente…</p>
            </div>
          )}

          {fase === 'resumen' && (
            <div className="space-y-4" data-testid="resumen">
              <div className="text-sm text-google-dark space-y-1 pr-8">
                <p><span className="text-google-gray">Empresa:</span> {datos.clientes[0].nombre}</p>
                <p><span className="text-google-gray">NIF:</span> {datos.clientes[0].cif_dni}</p>
                <div className="flex gap-1">
                  <span className="text-google-gray">CUPS:</span>
                  <div className="font-mono text-xs leading-5">{datos.clientes.map((c) => <p key={c.id}>{normalizarCups(c.cups)}</p>)}</div>
                </div>
              </div>
              <p className="text-sm font-medium text-google-dark">¿Está seguro de que quiere generar documentación sobre este contrato?</p>
              <div className="flex justify-end gap-2">
                <button onClick={cerrar} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
                <button onClick={() => setFase('verificar')} className="btn-primary text-sm px-5 py-2">Sí</button>
              </div>
            </div>
          )}

          {fase === 'verificar' && (
            <div className="space-y-4" data-testid="verificar">
              <p className="text-sm text-google-dark pr-8">Verifique que los datos son correctos antes de generar la documentación.</p>
              <div className="flex justify-end">
                <button onClick={generar} data-testid="confirmar-generar" className="btn-primary text-sm px-5 py-2">Generar</button>
              </div>
            </div>
          )}

          {fase === 'generando' && (
            <div className="py-6" data-testid="carga-generar">
              <p className="text-sm text-google-dark text-center">Estamos generando tu documentación. Tiempo aproximado: {TIEMPO_GENERAR}</p>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden mt-5">
                <div className="h-full bg-google-blue rounded-full transition-all duration-700" style={{ width: `${PROGRESO[paso]}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
