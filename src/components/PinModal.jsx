import { useState, useRef, useEffect } from 'react';
import { Lock, ShieldCheck, X, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function PinModal({ onSuccess, onClose }) {
  const { pin: CORRECT_PIN } = useAuth();
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState(false);
  const [shake, setShake] = useState(false);
  const inputsRef = useRef([]);

  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const handleChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    setError(false);

    if (value && index < 3) {
      inputsRef.current[index + 1]?.focus();
    }

    if (newPin.every((d) => d !== '') && newPin.join('').length === 4) {
      const entered = newPin.join('');
      if (entered === CORRECT_PIN) {
        setTimeout(() => onSuccess(), 200);
      } else {
        setShake(true);
        setError(true);
        setTimeout(() => {
          setPin(['', '', '', '']);
          setShake(false);
          inputsRef.current[0]?.focus();
        }, 600);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div
        className={`bg-white rounded-2xl shadow-google w-full max-w-sm mx-4 overflow-hidden transition-transform ${shake ? 'animate-bounce' : ''}`}
        style={shake ? { animation: 'shake 0.4s ease-in-out' } : {}}
      >
        {/* Header */}
        <div className="relative bg-gradient-to-br from-google-blue to-blue-700 px-8 pt-8 pb-6 text-center">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock size={28} className="text-white" />
          </div>
          <h2 className="text-white text-xl font-semibold">Zona Protegida</h2>
          <p className="text-blue-100 text-sm mt-1">Introduce el PIN de administrador</p>
        </div>

        {/* Body */}
        <div className="px-8 py-7">
          {/* PIN inputs */}
          <div className="flex justify-center gap-3 mb-6">
            {pin.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (inputsRef.current[i] = el)}
                type="password"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className={`pin-input ${digit ? 'filled' : ''} ${error ? '!border-red-400 !bg-red-50' : ''}`}
                inputMode="numeric"
                pattern="\d*"
              />
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="flex items-center justify-center gap-2 text-red-500 text-sm mb-4">
              <AlertCircle size={15} />
              <span>PIN incorrecto. Inténtalo de nuevo.</span>
            </div>
          )}

          {/* Hint */}
          {!error && (
            <p className="text-center text-google-gray text-xs">
              Introduce los 4 dígitos del PIN
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 pb-6 flex items-center justify-center gap-2 text-google-gray text-xs">
          <ShieldCheck size={13} />
          <span>Acceso restringido al personal autorizado</span>
        </div>
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
