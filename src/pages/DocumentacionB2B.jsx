import { useCallback, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SesionRequerida } from '../lib/documentacionB2B/api';
import { guardarVersion } from '../lib/documentacionB2B/flujo';
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

  const refrescar = useCallback(() => setRecarga((v) => v + 1), []);
  const sinSesion = useCallback(() => setError(new SesionRequerida().message), []);

  const generada = (r) => {
    setResultado(r);
    setAbierta(false);
    refrescar();
  };

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

      <button onClick={() => setAbierta(true)} data-testid="abrir-generar" className="btn-primary text-base px-6 py-3">Generar documentación</button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {resultado && (
        <section className="mt-6" data-testid="resultado">
          <EditorDocumentacion key={resultado.id} inicial={resultado.modelo} pdfsIniciales={resultado.pdfs} plantillas={resultado.plantillas} onGuardar={guardarCambios} controlesDocumento />
        </section>
      )}

      <Historial recarga={recarga} onCambio={refrescar} onSesion={sinSesion} />

      {abierta && <GenerarDocumentacionModal actor={actor} onCerrar={() => setAbierta(false)} onGenerada={generada} />}
    </div>
  );
}
