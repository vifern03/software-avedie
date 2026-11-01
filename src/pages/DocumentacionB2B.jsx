import { useCallback, useEffect, useRef, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cargarPlantillas, rpc, SesionRequerida } from '../lib/documentacionB2B/api';
import { construirPdfs, guardarVersion } from '../lib/documentacionB2B/flujo';
import EditorDocumentacion from '../components/documentacionB2B/EditorDocumentacion';
import GenerarDocumentacionModal from '../components/documentacionB2B/GenerarDocumentacionModal';
import Historial from '../components/documentacionB2B/Historial';
import PantallaCarga from '../components/documentacionB2B/PantallaCarga';

const PASOS_GUARDAR = [{ id: 'guardar', label: 'Guardando', segundos: 3 }];

export default function DocumentacionB2B() {
  const { currentUser } = useAuth();
  const actor = currentUser.username;
  const [abierta, setAbierta] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState('');
  const [carga, setCarga] = useState(0);
  const [avisoEdicion, setAvisoEdicion] = useState(false);
  const zona = useRef(null);

  const refrescar = useCallback(() => setRecarga((v) => v + 1), []);
  const sinSesion = useCallback(() => setError(new SesionRequerida().message), []);

  const mostrar = (r, edicion) => {
    setResultado(r);
    setCarga((v) => v + 1);
    setAvisoEdicion(edicion);
  };

  const generada = (r) => {
    mostrar(r, false);
    setAbierta(false);
    refrescar();
  };

  const editar = async (fila) => {
    const detalle = await rpc('doc_b2b_detalle', actor, { p_id: fila.id });
    const plantillas = await cargarPlantillas(actor);
    const pdfs = await construirPdfs(plantillas, detalle.datos);
    mostrar({ id: fila.id, version: detalle.version_actual, modelo: detalle.datos, pdfs, plantillas }, true);
  };

  useEffect(() => {
    if (!avisoEdicion) return undefined;
    zona.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const t = setTimeout(() => setAvisoEdicion(false), 5000);
    return () => clearTimeout(t);
  }, [avisoEdicion, carga]);

  const guardarCambios = async ({ modelo, editados, pdfs }) => {
    setGuardando(true);
    setError('');
    try {
      const { version } = await guardarVersion({ actor, id: resultado.id, versionBase: resultado.version, modelo, editados, pdfs });
      setResultado((r) => ({ ...r, modelo, pdfs, version }));
      refrescar();
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {guardando && <PantallaCarga titulo="Guardando" pasos={PASOS_GUARDAR} actual="guardar" />}

      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FileSignature size={20} className="text-google-blue" /></div>
        <div>
          <h1 className="text-xl font-semibold text-google-dark">Documentación B2B</h1>
          <p className="text-sm text-google-gray">Contrato y anexos de Endesa a partir de Alta B2B</p>
        </div>
      </div>

      <div className="flex justify-center">
        <button onClick={() => setAbierta(true)} data-testid="abrir-generar" className="btn-primary text-base px-6 py-3">Generar documentación</button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {resultado && (
        <section ref={zona} className="mt-6 scroll-mt-4" data-testid="resultado">
          {avisoEdicion && <p className="mb-3 text-sm text-google-blue bg-blue-50 rounded-lg px-3 py-2" data-testid="aviso-edicion">Se ha cargado la documentación arriba para editarla.</p>}
          <EditorDocumentacion key={carga} inicial={resultado.modelo} pdfsIniciales={resultado.pdfs} plantillas={resultado.plantillas} onGuardar={guardarCambios} controlesDocumento />
        </section>
      )}

      <Historial recarga={recarga} onCambio={refrescar} onSesion={sinSesion} onEditar={editar}
        onEliminadas={(ids) => setResultado((r) => (r && ids.includes(r.id) ? null : r))} />

      {abierta && <GenerarDocumentacionModal actor={actor} onCerrar={() => setAbierta(false)} onGenerada={generada} />}
    </div>
  );
}
