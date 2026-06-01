import { useState, useRef, useEffect } from 'react';
import { Sparkles, X, Send, Paperclip, Copy, Check } from 'lucide-react';

// Todas las llamadas a Gemini pasan por /api/gemini (Vercel Function en producción,
// middleware de Vite en desarrollo local). La API key nunca llega al bundle del cliente.
const PROXY_URL = '/api/gemini';

// Máximo de adjuntos: 4 MB → base64 ~5.3 MB, dentro del límite de 6 MB de Netlify Functions
const MAX_FILE_MB = 4;

// Turnos de conversación que se envían al modelo (evita payloads infinitos)
const MAX_HISTORY_TURNS = 20;

const QUICK_ACTIONS = [
  {
    label: '📝 Correo Formal',
    template: 'Mejórame este borrador de correo electrónico para que suene mucho más profesional, formal y persuasivo para un cliente: ',
  },
  {
    label: '🔍 Revisar Factura',
    template: 'Analiza la imagen o documento adjunto. Revisa si todos los datos obligatorios (CIF, importes, conceptos) son correctos y avísame si detectas algún error: ',
  },
  {
    label: '🌍 Traducir',
    template: 'Traduce el siguiente texto al inglés manteniendo un tono corporativo y comercial impecable: ',
  },
];

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-google-bg border border-google-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="w-2 h-2 bg-google-gray rounded-full animate-bounce"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// Props: isOpen (bool), onOpenChange (fn) — estado controlado desde App.jsx
export default function AIAssistant({ isOpen, onOpenChange }) {
  const [messages,     setMessages]     = useState([]);
  const [inputText,    setInputText]    = useState('');
  const [attachedFile, setAttachedFile] = useState(null);
  const [isLoading,    setIsLoading]    = useState(false);
  const [fileError,    setFileError]    = useState('');
  const [copiedIdx,    setCopiedIdx]    = useState(null);

  const messagesEndRef = useRef(null);
  const fileInputRef   = useRef(null);
  const textareaRef    = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const autoResizeTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
  };

  // M-2: Validación de tamaño antes de FileReader
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`El archivo supera el límite de ${MAX_FILE_MB} MB. Adjunta un archivo más pequeño.`);
      setTimeout(() => setFileError(''), 4000);
      return;
    }
    setFileError('');
    setAttachedFile(file);
  };

  const applyQuickAction = (template) => {
    setInputText(template);
    setTimeout(() => {
      autoResizeTextarea();
      textareaRef.current?.focus();
    }, 0);
  };

  const handleSend = async () => {
    const text = inputText.trim();
    if ((!text && !attachedFile) || isLoading) return;

    const userMsg     = { role: 'user', content: text, fileName: attachedFile?.name ?? null };
    const currentFile = attachedFile;

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setAttachedFile(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    try {
      const recentMessages = messages.slice(-MAX_HISTORY_TURNS);

      const history = recentMessages.map(m => ({
        role:  m.role,
        parts: [{ text: m.content || ' ' }],
      }));
      const payload = { text, history };
      if (currentFile) {
        const base64 = await fileToBase64(currentFile);
        payload.file = { mimeType: currentFile.type, data: base64 };
      }

      const res  = await fetch(PROXY_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setMessages(prev => [...prev, { role: 'model', content: data.response }]);
    } catch (err) {
      console.error('AI error:', err.message || err);
      setMessages(prev => [...prev, {
        role:    'model',
        content: err.message || 'Lo siento, ha ocurrido un error al contactar con el asistente. Comprueba la conexión e inténtalo de nuevo.',
        isError: true,
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = (inputText.trim() || attachedFile) && !isLoading;

  return (
    <>
      {/* Botón flotante + tooltip — ocultos cuando el panel está abierto */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 hidden md:flex flex-col items-center gap-2 pointer-events-none">
          <div className="ai-float bg-slate-900/90 text-white text-xs font-medium rounded-lg py-1.5 px-3 shadow-lg whitespace-nowrap select-none">
            ✨ ¿Te ayudo con una gestión?
          </div>
          <button
            onClick={() => onOpenChange(true)}
            className="pointer-events-auto w-14 h-14 bg-google-blue hover:bg-google-blue-dark text-white rounded-full shadow-google flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95"
            title="Abrir Asistente IA Avedie"
          >
            <Sparkles size={22} />
          </button>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/10" onClick={() => onOpenChange(false)} />
      )}

      {/* Panel lateral deslizante */}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] z-50 bg-white shadow-google flex flex-col transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-google-blue flex-shrink-0">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white leading-tight">Asistente IA</p>
            <p className="text-xs text-blue-100">Gemini 2.5 Flash · Grupo Avedie</p>
          </div>
          <button
            onClick={() => onOpenChange(false)}
            className="text-white/80 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10"
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Área de mensajes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="flex flex-col items-center pt-10 space-y-3 text-center select-none">
              <div className="w-16 h-16 bg-google-blue-light rounded-full flex items-center justify-center">
                <Sparkles size={28} className="text-google-blue" />
              </div>
              <p className="text-sm font-semibold text-google-dark">¿En qué puedo ayudarte?</p>
              <p className="text-xs text-google-gray px-6 leading-relaxed">
                Soy el asistente IA de Grupo Avedie. Puedo redactar correos, analizar facturas, traducir textos y responder consultas profesionales.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[88%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-google-blue text-white rounded-br-sm'
                    : msg.isError
                    ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
                    : 'bg-google-bg text-google-dark border border-google-border rounded-bl-sm'
                }`}
              >
                {msg.fileName && (
                  <p className={`text-xs mb-1.5 font-medium flex items-center gap-1 ${
                    msg.role === 'user' ? 'text-blue-100' : 'text-google-gray'
                  }`}>
                    <Paperclip size={11} />
                    {msg.fileName}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                {msg.role === 'model' && (
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content).then(() => {
                          setCopiedIdx(idx);
                          setTimeout(() => setCopiedIdx(null), 2000);
                        });
                      }}
                      className="flex items-center gap-1 text-xs text-google-gray hover:text-google-blue transition-colors py-0.5 px-1 rounded"
                      title="Copiar mensaje"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check size={12} className="text-green-500" />
                          <span className="text-green-500 font-medium">¡Copiado!</span>
                        </>
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Píldoras de acción rápida */}
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 flex-shrink-0">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => applyQuickAction(action.template)}
              className="text-xs bg-google-bg hover:bg-google-blue-light text-google-gray hover:text-google-blue border border-google-border hover:border-google-blue rounded-full px-3 py-1.5 transition-colors duration-150 font-medium"
            >
              {action.label}
            </button>
          ))}
        </div>

        {/* Alerta de tamaño de archivo */}
        {fileError && (
          <div className="mx-4 mb-1.5 flex-shrink-0">
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
              {fileError}
            </p>
          </div>
        )}

        {/* Vista previa del adjunto */}
        {attachedFile && (
          <div className="px-4 pb-1.5 flex-shrink-0">
            <div className="flex items-center gap-2 bg-google-blue-light border border-google-blue/30 text-google-blue rounded-lg px-3 py-1.5 text-xs font-medium">
              <Paperclip size={12} className="flex-shrink-0" />
              <span className="flex-1 truncate">{attachedFile.name}</span>
              <button onClick={() => setAttachedFile(null)} className="hover:text-red-600 transition-colors flex-shrink-0">
                <X size={12} />
              </button>
            </div>
          </div>
        )}

        {/* Barra de input */}
        <div className="px-4 py-3 border-t border-google-border flex items-end gap-2 flex-shrink-0">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 text-google-gray hover:text-google-blue transition-colors p-2 rounded-lg hover:bg-google-blue-light mb-0.5"
            title={`Adjuntar imagen o PDF (máx. ${MAX_FILE_MB} MB)`}
          >
            <Paperclip size={18} />
          </button>
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => { setInputText(e.target.value); autoResizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder="Escribe tu consulta… (Enter para enviar)"
            rows={1}
            className="flex-1 resize-none text-sm text-google-dark placeholder-google-gray bg-google-bg border border-google-border rounded-xl px-3 py-2.5 outline-none focus:border-google-blue focus:ring-1 focus:ring-google-blue transition-colors overflow-y-auto"
            style={{ minHeight: '42px', maxHeight: '128px' }}
          />
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="flex-shrink-0 w-9 h-9 bg-google-blue hover:bg-google-blue-dark disabled:bg-google-border disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors duration-150 mb-0.5"
            title="Enviar"
          >
            <Send size={15} />
          </button>
        </div>
      </div>
    </>
  );
}
