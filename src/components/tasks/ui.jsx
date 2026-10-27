import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Flag, X, CalendarClock } from 'lucide-react';
import { iniciales } from '../../lib/tasksColores';
import { alertaDeadline, etiquetaDeadline } from '../../lib/tasksFechas';
import { PRIORIDAD_LABEL } from '../../lib/tasksLogica';

/* ── Avatar con el color del usuario ──────────────────────────────────────── */
export function Avatar({ nombre, color, size = 22, title }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0 select-none"
      style={{ width: size, height: size, background: color, fontSize: Math.max(9, Math.round(size * 0.42)) }}
      title={title ?? nombre}
      aria-label={title ?? nombre}
    >
      {iniciales(nombre)}
    </span>
  );
}

/* ── Chips ───────────────────────────────────────────────────────────────── */
const PRIORIDAD_ESTILO = {
  urgent: 'bg-red-50 text-red-700 border-red-200',
  high: 'bg-orange-50 text-orange-700 border-orange-200',
  normal: 'bg-google-bg text-google-gray border-google-border',
  low: 'bg-slate-50 text-slate-500 border-slate-200',
};

export function PrioridadChip({ prioridad, siempre = false }) {
  if (!siempre && (prioridad === 'normal' || !prioridad)) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium leading-none ${PRIORIDAD_ESTILO[prioridad] || PRIORIDAD_ESTILO.normal}`}>
      <Flag size={10} />
      {PRIORIDAD_LABEL[prioridad] || prioridad}
    </span>
  );
}

export function DeadlineChip({ task, ahora }) {
  if (!task?.due_date) return null;
  const alerta = alertaDeadline(task, ahora);
  const estilo = alerta === 'vencida'
    ? 'text-red-700 bg-red-50 border-red-200'
    : alerta === 'proxima'
      ? 'text-amber-700 bg-amber-50 border-amber-200'
      : 'text-google-gray bg-white border-google-border';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium leading-none ${estilo}`}>
      <CalendarClock size={11} />
      {etiquetaDeadline(task, ahora)}
    </span>
  );
}

export const Etiqueta = ({ children, htmlFor }) => (
  <label htmlFor={htmlFor} className="block text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">{children}</label>
);

/* ── Skeleton y estados vacíos ────────────────────────────────────────────── */
export function SkeletonLista({ filas = 6 }) {
  return (
    <div className="bg-white border border-google-border rounded-xl shadow-sm divide-y divide-google-border" aria-busy="true" aria-label="Cargando tareas">
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
          <div className="w-5 h-5 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-gray-200 rounded" style={{ width: `${40 + ((i * 17) % 45)}%` }} />
            <div className="h-2.5 bg-gray-100 rounded w-24" />
          </div>
          <div className="w-6 h-6 rounded-full bg-gray-200" />
        </div>
      ))}
    </div>
  );
}

export function EstadoVacio({ icono: Icono = CheckCircle2, titulo, texto, children }) {
  return (
    <div className="bg-white border border-dashed border-google-border rounded-xl px-6 py-14 text-center">
      <div className="w-12 h-12 rounded-full bg-google-blue-light flex items-center justify-center mx-auto mb-3">
        <Icono size={22} className="text-google-blue" />
      </div>
      <p className="text-sm font-semibold text-google-dark">{titulo}</p>
      {texto && <p className="text-sm text-google-gray mt-1 max-w-sm mx-auto">{texto}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

/* ── Modal genérico (Escape cierra, foco inicial) ─────────────────────────── */
/* Pila de capas: Escape solo cierra la capa superior (modal sobre drawer, etc.). */
const pilaEscape = [];
let escuchando = false;
function onKeyEscape(e) {
  if (e.key !== 'Escape' || !pilaEscape.length) return;
  e.preventDefault();
  pilaEscape[pilaEscape.length - 1].current?.();
}
export function useEscape(onEscape, activo = true) {
  const ref = useRef(onEscape);
  ref.current = onEscape;
  useEffect(() => {
    if (!activo) return undefined;
    pilaEscape.push(ref);
    if (!escuchando) { window.addEventListener('keydown', onKeyEscape); escuchando = true; }
    return () => {
      const i = pilaEscape.lastIndexOf(ref);
      if (i >= 0) pilaEscape.splice(i, 1);
    };
  }, [activo]);
}
/** ¿Hay alguna capa (modal/drawer) abierta? */
export const hayCapaAbierta = () => pilaEscape.length > 0;

export function Modal({ titulo, onClose, children, ancho = 'max-w-lg', icono: Icono }) {
  useEscape(onClose);
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const el = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector('input,textarea,select,button');
    el?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 modal-backdrop p-4 overflow-y-auto" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} className={`bg-white rounded-2xl shadow-google w-full ${ancho} my-8`}>
        <div className="px-5 py-4 flex items-center justify-between border-b border-google-border">
          <div className="flex items-center gap-3">
            {Icono && (
              <div className="w-8 h-8 rounded-lg bg-google-blue-light flex items-center justify-center">
                <Icono size={16} className="text-google-blue" />
              </div>
            )}
            <h2 className="text-base font-semibold text-google-dark">{titulo}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-google-gray hover:text-google-dark hover:bg-google-bg" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ── Toasts ──────────────────────────────────────────────────────────────── */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const quitar = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const mostrar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, texto, tipo }]);
    setTimeout(() => quitar(id), tipo === 'error' ? 6000 : 3000);
  }, [quitar]);
  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col items-center gap-2 pointer-events-none w-[calc(100%-2rem)] max-w-md" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tipo === 'error' ? 'alert' : 'status'}
            className={`tasks-toast pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-lg shadow-google text-sm ${t.tipo === 'error' ? 'bg-red-600 text-white' : 'bg-google-dark text-white'}`}
          >
            {t.tipo === 'error' ? <AlertCircle size={16} className="flex-shrink-0" /> : <CheckCircle2 size={16} className="flex-shrink-0 text-green-300" />}
            <span className="flex-1">{t.texto}</span>
            <button onClick={() => quitar(t.id)} className="opacity-70 hover:opacity-100" aria-label="Cerrar aviso"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
