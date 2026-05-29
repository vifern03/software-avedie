import { useState } from 'react';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]     = useState(false);
  const [shake, setShake]     = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    const ok = login(username.trim(), password);
    if (!ok) {
      setError(true);
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  return (
    <div className="min-h-screen bg-google-bg flex items-center justify-center p-4">
      <div
        className="bg-white rounded-2xl shadow-google w-full max-w-sm overflow-hidden"
        style={shake ? { animation: 'shake 0.5s ease-in-out' } : {}}
      >
        {/* Header */}
        <div className="bg-gradient-to-br from-google-blue to-blue-700 px-8 pt-10 pb-8 text-center">
          <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden">
            <img
              src="https://multimedia-logos.infojobs.net/image/upload/w_155,h_155/9b/9b38ef65-853a-4c46-a58e-5e56bbceb467"
              alt="Grupo Avedie"
              className="w-16 h-16 object-contain"
            />
          </div>
          <h1 className="text-white text-2xl font-semibold">Grupo Avedie</h1>
          <p className="text-blue-100 text-sm mt-1">Software de Gestión</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-8 py-7 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-google-gray">Usuario</label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(false); }}
              className={`input-field w-full ${error ? '!border-red-400' : ''}`}
              placeholder="Introduce tu usuario"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-google-gray">Contraseña</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(false); }}
                className={`input-field w-full pr-10 ${error ? '!border-red-400' : ''}`}
                placeholder="Introduce tu contraseña"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark transition-colors"
                tabIndex={-1}
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm">
              <AlertCircle size={15} />
              <span>Usuario o contraseña incorrectos</span>
            </div>
          )}

          <button type="submit" className="btn-primary w-full mt-2">
            Iniciar Sesión
          </button>
        </form>

        <p className="text-center text-xs text-google-gray pb-6">
          Grupo Avedie · Acceso restringido
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-6px); }
          80%       { transform: translateX(6px); }
        }
      `}</style>
    </div>
  );
}
