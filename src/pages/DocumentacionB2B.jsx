import { useCallback, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { SesionRequerida } from '../lib/documentacionB2B/api';
import GenerarDocumentacionModal from '../components/documentacionB2B/GenerarDocumentacionModal';
import Historial from '../components/documentacionB2B/Historial';

export default function DocumentacionB2B() {
  const { currentUser } = useAuth();
  const [abierta, setAbierta] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [error, setError] = useState('');

  const refrescar = useCallback(() => setRecarga((v) => v + 1), []);
  const sinSesion = useCallback(() => setError(new SesionRequerida().message), []);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FileSignature size={20} className="text-google-blue" /></div>
        <div>
          <h1 className="text-xl font-semibold text-google-dark">Documentación B2B</h1>
          <p className="text-sm text-google-gray">Contrato y anexos de Endesa a partir de Alta B2B</p>
        </div>
      </div>

      <button onClick={() => setAbierta(true)} data-testid="abrir-generar" className="btn-primary text-base px-6 py-3">Generar documentación</button>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <Historial recarga={recarga} onCambio={refrescar} onSesion={sinSesion} />

      {abierta && <GenerarDocumentacionModal actor={currentUser.username} onCerrar={() => { setAbierta(false); refrescar(); }} onGuardado={refrescar} />}
    </div>
  );
}
