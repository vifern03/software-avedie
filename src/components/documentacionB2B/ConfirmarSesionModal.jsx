import { useState } from 'react';
import { Lock, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { abrirSesion } from '../../lib/documentacionB2B/api';

/** Pide la contraseña para abrir la sesión de esta sección, sin cerrar la del CRM. */
export default function ConfirmarSesionModal({ onConfirmada, onCancelar }) {
  const { currentUser } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e) => {
    e.preventDefault();
    setEnviando(true);
    setError('');
    try {
      await abrirSesion(currentUser.username, password);
      onConfirmada();
    } catch {
      setError('Contraseña incorrecta.');
      setEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <form onSubmit={enviar} className="bg-white rounded-2xl shadow-google w-full max-w-sm p-6 space-y-4" data-testid="confirmar-sesion">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center"><Lock size={18} className="text-google-blue" /></div>
          <div>
            <h3 className="text-sm font-semibold text-google-dark">Confirma tu contraseña</h3>
            <p className="text-xs text-google-gray">Estos documentos contienen datos personales.</p>
          </div>
        </div>
        <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)}
          className="input-field w-full" placeholder="Contraseña" aria-label="Contraseña" />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancelar} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
          <button type="submit" disabled={!password || enviando} className="btn-primary text-sm px-4 py-2 disabled:opacity-50 flex items-center gap-2">
            {enviando && <Loader2 size={14} className="animate-spin" />}Continuar
          </button>
        </div>
      </form>
    </div>
  );
}
