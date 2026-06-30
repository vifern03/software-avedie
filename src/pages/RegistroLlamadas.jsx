import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Phone, Search, X, Loader2, Camera, Eye, CheckCircle,
  MapPin, Clock, AlertCircle, Plus, Users,
  Shield, Briefcase, UserCheck, Download, Pencil, ChevronDown, ChevronUp, History,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';

// ─── Constantes ────────────────────────────────────────────────────────────────

export const CALLES_PALENCIA = [
  'AV SANTANDER',
  'MAYOR ANTIGUA',
  'VICTORIO MACHO',
  'P. LA JULIA',
  'SANTIAGO AMON',
  'MARIA DE MOLINA',
  'FELIPE II',
  'CASAÑÉ',
  'SANTIAGO',
  'TELLO TELLEZ DE MENESES',
  'URB LOS OLMILLOS',
  'COMUNIDADES PROPIETARIOS',
];

export const CALLES_VALLADOLID = [
  'DON SANCHO',
  'PORTILLO DE BALBOA',
  'TIRSO DE MOLINA',
  'LOPE DE RUEDA',
  'MORADAS',
  'LEON',
  'SAN QUIRCE',
  'ALBERTO FERNANDEZ',
  'MIRABEL',
  'TORRECILLA',
  'CARDENAL TORQUEMADA',
  'CARDENAL CISNEROS',
  'CALLE CERRADA',
  'AVENIDA PALENCIA',
  'CALLE LINARES',
  'CALLE GONZALEZ DUEÑAS',
  'CALLE REAL DE BURGOS',
];

export const PROVINCIAS_CONFIG = [
  { id: 'Palencia',   calles: CALLES_PALENCIA },
  { id: 'Valladolid', calles: CALLES_VALLADOLID },
];

export const ESTADOS_GESTION = [
  { id: 'No contesta',               bg: 'bg-gray-100',   text: 'text-gray-600',   dot: 'bg-gray-400',   ring: 'ring-gray-300'   },
  { id: 'Rechaza',                   bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500',    ring: 'ring-red-300'    },
  { id: 'Rechaza (Lista Negra)',      bg: 'bg-red-900',    text: 'text-red-100',    dot: 'bg-red-300',    ring: 'ring-red-700'    },
  { id: 'Se pasa por Tienda',        bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500',   ring: 'ring-blue-300'   },
  { id: 'Aceptada - Trámite Online', bg: 'bg-green-100',  text: 'text-green-700',  dot: 'bg-green-500',  ring: 'ring-green-300'  },
  { id: 'Llamar más tarde',          bg: 'bg-yellow-100', text: 'text-yellow-700', dot: 'bg-yellow-500', ring: 'ring-yellow-300' },
];

const ITEMS_PER_PAGE = 15;

const ROLE_BADGE = {
  admin:     { label: 'Administrador', Icon: Shield,    bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-700'   },
  manager:   { label: 'Manager',       Icon: Briefcase, bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  comercial: { label: 'Comercial',     Icon: UserCheck, bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-700'  },
};

// ─── Utilidades ────────────────────────────────────────────────────────────────

const fmtFechaHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
        checked ? 'bg-violet-600' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
        checked ? 'translate-x-[18px]' : 'translate-x-0.5'
      }`} />
    </button>
  );
}

// ─── Modal: Compartir provincia ───────────────────────────────────────────────

function CompartirModal({ provincia, users, callesPermisos, onToggle, onClose }) {
  const operadores = users.filter(u => u.role !== 'admin');

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-google-border bg-violet-50 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Users size={15} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-google-dark">Acceso a {provincia}</h2>
              <p className="text-xs text-google-gray mt-0.5">Activa el acceso de cada operador a todas las calles</p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors ml-3 flex-shrink-0">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 space-y-3 max-h-72 overflow-y-auto">
          {operadores.length === 0 ? (
            <p className="text-sm text-google-gray text-center py-6">No hay operadores registrados</p>
          ) : operadores.map(user => {
            const hasAccess = callesPermisos[user.username]?.[provincia] === true;
            const meta = ROLE_BADGE[user.role] || ROLE_BADGE.comercial;
            const { Icon } = meta;
            return (
              <div key={user.username} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg ${meta.bg} border ${meta.border} flex items-center justify-center flex-shrink-0`}>
                  <Icon size={14} className={meta.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-google-dark truncate">
                    {user.displayName || user.username}
                    {user.displayName && user.displayName !== user.username && (
                      <span className="ml-1.5 text-xs text-google-gray font-normal">@{user.username}</span>
                    )}
                  </p>
                  <p className={`text-xs ${meta.text}`}>{meta.label}</p>
                </div>
                <Toggle checked={hasAccess} onChange={() => onToggle(user.username, provincia, !hasAccess)} />
              </div>
            );
          })}
        </div>
        <div className="px-6 pb-5 pt-3 border-t border-google-border flex justify-end">
          <button onClick={onClose} className="btn-primary text-sm px-5 py-2">Cerrar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Badge de estado ───────────────────────────────────────────────────────────

function EstadoBadge({ estado, size = 'sm' }) {
  const estadosList = estado ? estado.split(', ').filter(Boolean) : [];
  const first = estadosList[0];
  const cfg = ESTADOS_GESTION.find(e => e.id === first);
  if (!cfg) return <span className="text-xs text-google-gray">—</span>;
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full whitespace-nowrap ${px} ${cfg.bg} ${cfg.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
        {first}
      </span>
      {estadosList.length > 1 && (
        <span className="text-[10px] text-google-gray font-medium">+{estadosList.length - 1}</span>
      )}
    </span>
  );
}

// ─── Botones de estado (compartido entre GestionModal y EditarGestionModal) ────

function EstadosGrid({ estados, onToggle }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {ESTADOS_GESTION.map(cfg => (
        <button
          key={cfg.id}
          type="button"
          onClick={() => onToggle(cfg.id)}
          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left ${
            estados.includes(cfg.id)
              ? `${cfg.bg} ${cfg.text} border-current ring-2 ${cfg.ring}`
              : 'border-google-border text-google-gray hover:border-gray-300 hover:bg-google-bg'
          }`}
        >
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
          {cfg.id}
        </button>
      ))}
    </div>
  );
}

// ─── Modal: Registrar gestión ──────────────────────────────────────────────────

function GestionModal({ contacto, onClose, onSave }) {
  const [estados,       setEstados]       = useState(['No contesta']);
  const [comentarios,   setComentarios]   = useState('');
  const [tiempoLlamada, setTiempoLlamada] = useState('');
  const [capturaFile,   setCapturaFile]   = useState(null);
  const [capturaPreview,setCapturaPreview]= useState('');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [errors,        setErrors]        = useState({});
  const capturaRef = useRef(null);

  const fechaHoraAuto = useMemo(() => fmtFechaHora(new Date().toISOString()), []);
  const toggleEstado = (id) =>
    setEstados(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canSubmit = tiempoLlamada.trim().length > 0 && capturaFile !== null && estados.length > 0 && !saving;

  const handleCapturaFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturaFile(file);
    setErrors(prev => ({ ...prev, captura: false }));
    if (file.type === 'application/pdf') { setCapturaPreview('__pdf__'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCapturaPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!tiempoLlamada.trim())  e.tiempo  = true;
    if (!capturaFile)            e.captura = true;
    if (estados.length === 0)   e.estado  = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await onSave({ estado: estados.join(', '), comentarios, tiempoLlamada, capturaFile });
      if (result?.error) { setSaving(false); setErrors(e => ({ ...e, submit: result.error })); return; }
      setSaved(true);
      setTimeout(() => onClose(), 700);
    } catch (err) {
      console.error('handleSubmit error:', err);
      setSaving(false);
      setErrors(e => ({ ...e, submit: 'Error inesperado. Inténtalo de nuevo.' }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-google-border bg-violet-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center flex-shrink-0">
              <Phone size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-google-dark truncate">Registrar Gestión</h2>
              <p className="text-xs text-google-gray truncate">
                {contacto.nombre || 'Sin nombre'} — {contacto.direccion || contacto.calle}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors flex-shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto">
          <div className="flex items-center gap-2 bg-google-bg rounded-xl px-4 py-2.5">
            <Clock size={14} className="text-google-gray flex-shrink-0" />
            <div>
              <p className="text-[11px] text-google-gray font-medium uppercase tracking-wide leading-none mb-0.5">Fecha y hora automáticas</p>
              <p className="text-sm font-semibold text-google-dark">{fechaHoraAuto}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-google-dark mb-1.5">
              Estado de la gestión <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-google-gray mb-2.5">Puedes seleccionar varias opciones simultáneamente</p>
            <EstadosGrid estados={estados} onToggle={(id) => { toggleEstado(id); setErrors(e => ({ ...e, estado: false })); }} />
            {errors.estado && <p className="text-red-500 text-xs mt-1">Selecciona al menos un estado</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Tiempo de llamada <span className="text-red-500">* (obligatorio)</span>
            </label>
            <input
              type="text"
              placeholder="Ej: 08:34  o  3 min 45 seg"
              value={tiempoLlamada}
              onChange={e => { setTiempoLlamada(e.target.value); setErrors(v => ({ ...v, tiempo: false })); }}
              className={`input-field ${errors.tiempo ? '!border-red-400 focus:!ring-red-300' : ''}`}
            />
            {errors.tiempo && <p className="text-red-500 text-xs mt-1">El tiempo de llamada es obligatorio</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Captura del tiempo de llamada <span className="text-red-500">* (obligatoria)</span>
            </label>
            <input ref={capturaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleCapturaFile} />
            <button
              type="button"
              onClick={() => capturaRef.current?.click()}
              className={`flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed text-sm transition-colors ${
                capturaFile
                  ? 'border-green-400 text-green-700 bg-green-50'
                  : errors.captura
                    ? 'border-red-400 text-red-600 bg-red-50'
                    : 'border-google-border text-google-gray hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50'
              }`}
            >
              <Camera size={16} className="flex-shrink-0" />
              <span className="truncate">{capturaFile ? capturaFile.name : 'Subir captura de pantalla…'}</span>
            </button>
            {capturaPreview && capturaPreview !== '__pdf__' && (
              <img src={capturaPreview} alt="preview" className="mt-2 h-16 rounded-lg object-contain border border-google-border" />
            )}
            {capturaPreview === '__pdf__' && <p className="text-xs text-google-gray mt-1">PDF seleccionado</p>}
            {errors.captura && <p className="text-red-500 text-xs mt-1">La captura de pantalla es obligatoria</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Comentarios adicionales <span className="text-google-gray font-normal">(opcional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Observaciones, interés del cliente, próxima acción…"
              value={comentarios}
              onChange={e => setComentarios(e.target.value)}
              className="input-field resize-none"
            />
          </div>

          {errors.submit && (
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errors.submit}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={!canSubmit}
              title={!canSubmit ? 'Rellena el tiempo de llamada y sube la captura para continuar' : undefined}
              className={`btn-primary flex items-center gap-2 transition-all ${
                saved ? '!bg-green-500 hover:!bg-green-500' : !canSubmit ? '!opacity-40 !cursor-not-allowed' : ''
              }`}
            >
              {saving && !saved ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                : saved ? <><CheckCircle size={15} /> Guardado</>
                : 'Guardar Gestión'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modal: Editar gestión existente ──────────────────────────────────────────

function EditarGestionModal({ gestion, contacto, onClose, onSave }) {
  const [estados,       setEstados]       = useState(
    gestion.estado ? gestion.estado.split(', ').filter(Boolean) : ['No contesta']
  );
  const [comentarios,   setComentarios]   = useState(gestion.comentarios || '');
  const [tiempoLlamada, setTiempoLlamada] = useState(gestion.tiempo_llamada || '');
  const [capturaFile,   setCapturaFile]   = useState(null);
  const [capturaPreview,setCapturaPreview]= useState('');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [errors,        setErrors]        = useState({});
  const capturaRef = useRef(null);

  const toggleEstado = (id) =>
    setEstados(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canSubmit = tiempoLlamada.trim().length > 0 && estados.length > 0 && !saving;

  const handleCapturaFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturaFile(file);
    if (file.type === 'application/pdf') { setCapturaPreview('__pdf__'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCapturaPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!tiempoLlamada.trim() || estados.length === 0) {
      setErrors({ tiempo: !tiempoLlamada.trim(), estado: estados.length === 0 });
      return;
    }
    setSaving(true);
    try {
      const result = await onSave({
        gestionId:    gestion.id,
        estado:       estados.join(', '),
        comentarios,
        tiempoLlamada,
        capturaFile,
      });
      if (result?.error) { setSaving(false); setErrors(e => ({ ...e, submit: result.error })); return; }
      setSaved(true);
      setTimeout(() => onClose(), 700);
    } catch (err) {
      console.error('editSubmit error:', err);
      setSaving(false);
      setErrors(e => ({ ...e, submit: 'Error inesperado. Inténtalo de nuevo.' }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg flex flex-col max-h-[92vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-google-border bg-amber-50 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-amber-500 flex items-center justify-center flex-shrink-0">
              <Pencil size={16} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-google-dark truncate">Editar Gestión</h2>
              <p className="text-xs text-google-gray truncate">
                {contacto.nombre || 'Sin nombre'} · {fmtFechaHora(gestion.fecha_hora)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors flex-shrink-0 ml-3">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5 overflow-y-auto">
          <div>
            <label className="block text-xs font-semibold text-google-dark mb-1.5">
              Estado de la gestión <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-google-gray mb-2.5">Puedes seleccionar varias opciones simultáneamente</p>
            <EstadosGrid estados={estados} onToggle={(id) => { toggleEstado(id); setErrors(e => ({ ...e, estado: false })); }} />
            {errors.estado && <p className="text-red-500 text-xs mt-1">Selecciona al menos un estado</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Tiempo de llamada <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Ej: 08:34  o  3 min 45 seg"
              value={tiempoLlamada}
              onChange={e => { setTiempoLlamada(e.target.value); setErrors(v => ({ ...v, tiempo: false })); }}
              className={`input-field ${errors.tiempo ? '!border-red-400 focus:!ring-red-300' : ''}`}
            />
            {errors.tiempo && <p className="text-red-500 text-xs mt-1">El tiempo de llamada es obligatorio</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Nueva captura <span className="text-google-gray font-normal">(opcional — mantiene la actual si no subes una nueva)</span>
            </label>
            <input ref={capturaRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleCapturaFile} />
            <button
              type="button"
              onClick={() => capturaRef.current?.click()}
              className={`flex items-center gap-2 w-full px-4 py-3 rounded-xl border-2 border-dashed text-sm transition-colors ${
                capturaFile
                  ? 'border-green-400 text-green-700 bg-green-50'
                  : 'border-google-border text-google-gray hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50'
              }`}
            >
              <Camera size={16} className="flex-shrink-0" />
              <span className="truncate">{capturaFile ? capturaFile.name : 'Cambiar captura (opcional)…'}</span>
            </button>
            {capturaPreview && capturaPreview !== '__pdf__' && (
              <img src={capturaPreview} alt="preview" className="mt-2 h-16 rounded-lg object-contain border border-google-border" />
            )}
            {capturaPreview === '__pdf__' && <p className="text-xs text-google-gray mt-1">PDF seleccionado</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Comentarios <span className="text-google-gray font-normal">(opcional)</span>
            </label>
            <textarea
              rows={3}
              placeholder="Observaciones, interés del cliente…"
              value={comentarios}
              onChange={e => setComentarios(e.target.value)}
              className="input-field resize-none"
            />
          </div>

          {errors.submit && (
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errors.submit}</p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                saved
                  ? 'bg-green-500 text-white'
                  : !canSubmit
                    ? 'bg-amber-200 text-amber-400 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
              }`}
            >
              {saving && !saved ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                : saved ? <><CheckCircle size={15} /> Guardado</>
                : <><Pencil size={14} /> Actualizar Gestión</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Fila de contacto (con accordion de historial) ────────────────────────────

function ContactoRow({ contacto, gestiones, onGestion, onEditar, showCalle = false }) {
  const [loadingCaptura, setLoadingCaptura] = useState(false);
  const [expanded,       setExpanded]       = useState(false);

  const ultimaGestion    = gestiones?.[0] ?? null;
  const historicoGestiones = gestiones?.slice(1) ?? [];
  // Columnas totales: 11 base + 1 si showCalle
  const totalCols = showCalle ? 12 : 11;

  const handleVerComprobante = async () => {
    if (!ultimaGestion) return;
    setLoadingCaptura(true);
    const { data } = await supabase
      .from('telemarketing_gestiones')
      .select('captura_url')
      .eq('id', ultimaGestion.id)
      .single();
    setLoadingCaptura(false);
    const url = data?.captura_url;
    if (!url) return;

    if (url.startsWith('data:')) {
      const [header, b64] = url.split(',');
      const mime = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const objUrl = URL.createObjectURL(new Blob([arr], { type: mime }));
      const win = window.open(objUrl, '_blank', 'noopener,noreferrer');
      if (win) setTimeout(() => URL.revokeObjectURL(objUrl), 30000);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <tr className="hover:bg-google-bg/40 transition-colors">

        {/* FECHA / HORA */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-google-gray">
            {ultimaGestion ? fmtFechaHora(ultimaGestion.fecha_hora) : '—'}
          </span>
        </td>

        {/* NOMBRE / CUPS */}
        <td className="px-3 py-3 min-w-[160px]">
          <p className="font-medium text-google-dark text-sm leading-tight">
            {contacto.nombre || <span className="text-google-gray italic">Sin nombre</span>}
          </p>
          {contacto.cups && (
            <p className="text-[11px] text-google-gray font-mono truncate max-w-[180px]" title={contacto.cups}>
              {contacto.cups}
            </p>
          )}
        </td>

        {/* DIRECCIÓN */}
        <td className="px-3 py-3 min-w-[130px]">
          <p className="text-sm text-google-dark">{contacto.direccion || '—'}</p>
        </td>

        {/* CALLE — solo cuando no estamos en modo calle única */}
        {showCalle && (
          <td className="px-3 py-3 whitespace-nowrap">
            <span className="text-xs text-google-gray">{contacto.calle || '—'}</span>
          </td>
        )}

        {/* MÓVIL */}
        <td className="px-3 py-3 whitespace-nowrap">
          {contacto.movil
            ? <a href={`tel:${contacto.movil}`} className="text-sm text-violet-600 hover:underline font-mono">{contacto.movil}</a>
            : <span className="text-sm text-google-gray">—</span>}
        </td>

        {/* PRECIO ACTUAL */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-google-dark bg-google-bg px-2 py-0.5 rounded-full">
            {contacto.precio_actual || '—'}
          </span>
        </td>

        {/* ÚLTIMA GESTIÓN */}
        <td className="px-3 py-3">
          {ultimaGestion
            ? <EstadoBadge estado={ultimaGestion.estado} />
            : <span className="text-xs text-google-gray italic">Sin gestión</span>}
        </td>

        {/* REGISTRADO POR */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-google-dark">{ultimaGestion?.registrado_por || '—'}</span>
        </td>

        {/* TIEMPO */}
        <td className="px-3 py-3 whitespace-nowrap">
          <span className="text-xs text-google-gray font-mono">{ultimaGestion?.tiempo_llamada || '—'}</span>
        </td>

        {/* COMPROBANTE — lazy load */}
        <td className="px-3 py-3 text-center">
          {ultimaGestion ? (
            <button
              onClick={handleVerComprobante}
              disabled={loadingCaptura}
              className="p-1.5 rounded-lg text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-50"
              title={loadingCaptura ? 'Cargando...' : 'Ver comprobante'}
            >
              {loadingCaptura ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
            </button>
          ) : (
            <span className="text-google-gray text-xs">—</span>
          )}
        </td>

        {/* COMENTARIOS */}
        <td className="px-3 py-3 max-w-[160px]">
          {ultimaGestion?.comentarios
            ? <p className="text-xs text-google-gray leading-snug line-clamp-2" title={ultimaGestion.comentarios}>
                {ultimaGestion.comentarios}
              </p>
            : <span className="text-xs text-google-gray">—</span>}
        </td>

        {/* ACCIÓN */}
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="flex flex-col items-start gap-1.5">
            {/* Fila de botones */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onGestion(contacto)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
              >
                <Plus size={13} />
                Registrar
              </button>
              {ultimaGestion && (
                <button
                  onClick={() => onEditar(contacto, ultimaGestion)}
                  className="p-1.5 rounded-lg border border-google-border text-google-gray hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                  title="Editar gestión actual"
                >
                  <Pencil size={13} />
                </button>
              )}
            </div>
            {/* Accordion trigger */}
            {historicoGestiones.length > 0 && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex items-center gap-0.5 text-[11px] text-google-gray hover:text-violet-600 transition-colors"
              >
                {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {historicoGestiones.length === 1
                  ? '1 Registro Anterior'
                  : `${historicoGestiones.length} Registros Anteriores`}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Accordion: historial de gestiones anteriores */}
      {expanded && historicoGestiones.length > 0 && (
        <tr className="bg-gray-50 border-b border-gray-100">
          <td colSpan={totalCols} className="px-6 py-0">
            <div className="py-2 border-l-2 border-gray-200 pl-4 ml-1 space-y-0">
              <div className="flex items-center gap-1.5 mb-2">
                <History size={11} className="text-gray-400" />
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Historial de gestiones anteriores</span>
              </div>
              {historicoGestiones.map((g) => (
                <div key={g.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2 border-b border-gray-100 last:border-0">
                  <span className="text-[11px] text-gray-400 whitespace-nowrap font-mono">{fmtFechaHora(g.fecha_hora)}</span>
                  <EstadoBadge estado={g.estado} size="sm" />
                  <span className="text-[11px] text-gray-400">por <span className="font-medium">{g.registrado_por || '—'}</span></span>
                  {g.tiempo_llamada && (
                    <span className="text-[11px] text-gray-400 font-mono">{g.tiempo_llamada}</span>
                  )}
                  {g.comentarios && (
                    <span className="text-[11px] text-gray-500 flex-1 italic">"{g.comentarios}"</span>
                  )}
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function RegistroLlamadas() {
  const { currentUser, hasProvinciaAccess, callesPermisos, updateProvinciaAccess, users } = useAuth();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  // ── Estado de selección ──────────────────────────────────────────────────────
  const [provincia,      setProvincia]      = useState('Palencia');
  const [calleActual,    setCalleActual]    = useState(null);
  const [compartirProv,  setCompartirProv]  = useState(null);
  const [showModal,      setShowModal]      = useState(false);
  const [contactoActivo, setContactoActivo] = useState(null);
  const [editModal,      setEditModal]      = useState(null); // { gestion, contacto }
  const [currentPage,    setCurrentPage]    = useState(1);

  // ── Datos por calle ──────────────────────────────────────────────────────────
  const [contactos,    setContactos]    = useState([]);
  const [gestionesMap, setGestionesMap] = useState({});
  const [loading,      setLoading]      = useState(false);
  const [localSearch,  setLocalSearch]  = useState('');

  // ── Datos por búsqueda global (texto) ────────────────────────────────────────
  const [globalSearch,       setGlobalSearch]       = useState('');
  const [globalContactos,    setGlobalContactos]    = useState([]);
  const [globalGestionesMap, setGlobalGestionesMap] = useState({});
  const [globalLoading,      setGlobalLoading]      = useState(false);

  // ── Datos ciudad completa (filtros sin calle ni búsqueda) ────────────────────
  const [cityContactos, setCityContactos] = useState([]);
  const [cityGMap,      setCityGMap]      = useState({});
  const [cityLoading,   setCityLoading]   = useState(false);
  const cityProvRef = useRef(null);

  // ── Filtros de ciudad ────────────────────────────────────────────────────────
  const [filterOperador, setFilterOperador] = useState('');
  const [filterEstado,   setFilterEstado]   = useState('');
  const [filterDesde,    setFilterDesde]    = useState('');
  const [filterHasta,    setFilterHasta]    = useState('');

  // ── Estadísticas globales ────────────────────────────────────────────────────
  const [globalStats, setGlobalStats] = useState({ hoy: 0, mes: 0 });

  const now         = new Date();
  const todayStr    = now.toISOString().split('T')[0];
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const subtitleMes = (() => {
    const m = now.toLocaleString('es-ES', { month: 'long' });
    return m.charAt(0).toUpperCase() + m.slice(1);
  })();

  // ── Modos (mutuamente excluyentes) ──────────────────────────────────────────
  const isGlobalMode       = globalSearch.trim().length > 0;
  const isCityFilterActive = !!(filterOperador || filterEstado || filterDesde || filterHasta);
  const isCityMode         = isCityFilterActive && !calleActual && !isGlobalMode;
  const isCalleMode        = !!calleActual && !isGlobalMode;

  const activeContactos = isGlobalMode ? globalContactos    : isCityMode ? cityContactos : contactos;
  const activeGMap      = isGlobalMode ? globalGestionesMap : isCityMode ? cityGMap      : gestionesMap;
  const activeLoading   = loading || globalLoading || cityLoading;

  const showTable    = isCalleMode || isGlobalMode || isCityMode;
  const showCalleCol = !isCalleMode;

  // ── Stats ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    async function loadStats() {
      let q = supabase.from('telemarketing_gestiones').select('fecha_hora').is('deleted_at', null);
      if (!isAdmin) q = q.eq('registrado_por', currentUser.username);
      const { data } = await q;
      if (!data) return;
      setGlobalStats({
        hoy: data.filter(g => g.fecha_hora?.startsWith(todayStr)).length,
        mes: data.filter(g => g.fecha_hora?.startsWith(monthPrefix)).length,
      });
    }
    loadStats();
  }, [isAdmin, currentUser?.username, todayStr, monthPrefix]);

  // ── Calles visibles ──────────────────────────────────────────────────────────
  const callesConfig   = PROVINCIAS_CONFIG.find(p => p.id === provincia) || { calles: [] };
  const callesVisibles = useMemo(() => {
    if (isAdmin) return callesConfig.calles;
    return hasProvinciaAccess(provincia) ? callesConfig.calles : [];
  }, [isAdmin, callesConfig.calles, hasProvinciaAccess, provincia]);

  // ── Reset al cambiar provincia ───────────────────────────────────────────────
  useEffect(() => {
    setCalleActual(null);
    setContactos([]);
    setGestionesMap({});
    setLocalSearch('');
    setCurrentPage(1);
    setGlobalSearch('');
    setGlobalContactos([]);
    setGlobalGestionesMap({});
    setCityContactos([]);
    setCityGMap({});
    cityProvRef.current = null;
    setFilterOperador('');
    setFilterEstado('');
    setFilterDesde('');
    setFilterHasta('');
  }, [provincia]);

  // ── Carga al seleccionar calle ───────────────────────────────────────────────
  useEffect(() => {
    if (!calleActual) return;
    setLoading(true);
    setContactos([]);
    setGestionesMap({});
    setLocalSearch('');
    setCurrentPage(1);

    async function loadData() {
      const { data: ctData, error: ctErr } = await supabase
        .from('telemarketing_contactos')
        .select('*')
        .eq('provincia', provincia)
        .eq('calle', calleActual)
        .order('id', { ascending: true });

      if (ctErr) { setLoading(false); return; }
      setContactos(ctData ?? []);
      if (!ctData?.length) { setLoading(false); return; }

      const ids = ctData.map(c => c.id);
      const { data: gData } = await supabase
        .from('telemarketing_gestiones')
        .select('id, contacto_id, calle, provincia, estado, comentarios, tiempo_llamada, fecha_hora, registrado_por')
        .in('contacto_id', ids)
        .is('deleted_at', null)
        .order('fecha_hora', { ascending: false });

      const map = {};
      for (const g of (gData ?? [])) {
        if (!map[g.contacto_id]) map[g.contacto_id] = [];
        map[g.contacto_id].push(g);
      }
      setGestionesMap(map);
      setLoading(false);
    }
    loadData();
  }, [calleActual, provincia]);

  // ── Búsqueda global con debounce ─────────────────────────────────────────────
  const globalTimerRef = useRef(null);
  useEffect(() => {
    clearTimeout(globalTimerRef.current);
    const q = globalSearch.trim();
    if (!q) { setGlobalContactos([]); setGlobalGestionesMap({}); setGlobalLoading(false); return; }
    setGlobalLoading(true);
    globalTimerRef.current = setTimeout(async () => {
      const { data: ctData } = await supabase
        .from('telemarketing_contactos')
        .select('*')
        .eq('provincia', provincia)
        .or(`nombre.ilike.%${q}%,direccion.ilike.%${q}%,movil.ilike.%${q}%`)
        .order('calle', { ascending: true })
        .order('id',    { ascending: true });

      if (!ctData?.length) { setGlobalContactos([]); setGlobalGestionesMap({}); setGlobalLoading(false); return; }
      setGlobalContactos(ctData);

      const ids = ctData.map(c => c.id);
      const { data: gData } = await supabase
        .from('telemarketing_gestiones')
        .select('id, contacto_id, calle, provincia, estado, comentarios, tiempo_llamada, fecha_hora, registrado_por')
        .in('contacto_id', ids)
        .is('deleted_at', null)
        .order('fecha_hora', { ascending: false });

      const map = {};
      for (const g of (gData ?? [])) {
        if (!map[g.contacto_id]) map[g.contacto_id] = [];
        map[g.contacto_id].push(g);
      }
      setGlobalGestionesMap(map);
      setGlobalLoading(false);
    }, 350);
    return () => clearTimeout(globalTimerRef.current);
  }, [globalSearch, provincia]);

  // ── Carga ciudad completa cuando hay filtros sin calle/búsqueda ──────────────
  useEffect(() => {
    const cityFilterOn = isCityFilterActive && !calleActual && !globalSearch.trim();
    if (!cityFilterOn) {
      if (cityProvRef.current !== null) { setCityContactos([]); setCityGMap({}); cityProvRef.current = null; }
      return;
    }
    if (cityProvRef.current === provincia) return;
    cityProvRef.current = provincia;
    setCityLoading(true);

    async function loadCity() {
      const { data: ctData } = await supabase
        .from('telemarketing_contactos')
        .select('*')
        .eq('provincia', provincia)
        .order('calle', { ascending: true })
        .order('id',    { ascending: true });

      if (!ctData?.length) { setCityContactos([]); setCityGMap({}); setCityLoading(false); return; }
      setCityContactos(ctData);

      const ids = ctData.map(c => c.id);
      const { data: gData } = await supabase
        .from('telemarketing_gestiones')
        .select('id, contacto_id, calle, provincia, estado, comentarios, tiempo_llamada, fecha_hora, registrado_por')
        .in('contacto_id', ids)
        .is('deleted_at', null)
        .order('fecha_hora', { ascending: false });

      const map = {};
      for (const g of (gData ?? [])) {
        if (!map[g.contacto_id]) map[g.contacto_id] = [];
        map[g.contacto_id].push(g);
      }
      setCityGMap(map);
      setCityLoading(false);
    }
    loadCity();
  }, [isCityFilterActive, calleActual, globalSearch, provincia]);

  // ── Upload captura ───────────────────────────────────────────────────────────
  const uploadCaptura = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => resolve(null);
      reader.readAsDataURL(file);
    });

  // ── Guardar nueva gestión ────────────────────────────────────────────────────
  const handleSave = async ({ estado, comentarios, tiempoLlamada, capturaFile }) => {
    const captura_url = await uploadCaptura(capturaFile);
    if (!captura_url) return { error: 'No se pudo subir la captura' };

    const newGestion = {
      id:             Date.now(),
      contacto_id:    contactoActivo.id,
      calle:          calleActual || contactoActivo.calle,
      provincia,
      estado,
      comentarios:    comentarios.trim(),
      tiempo_llamada: tiempoLlamada.trim(),
      captura_url,
      fecha_hora:     new Date().toISOString(),
      registrado_por: currentUser?.username || 'Sistema',
    };

    const { error } = await supabase.from('telemarketing_gestiones').insert([newGestion]);
    if (error) { console.error('addGestion:', error); return { error }; }

    const { captura_url: _url, ...gestionForState } = newGestion;
    const prepender = (prev) => ({
      ...prev,
      [contactoActivo.id]: [gestionForState, ...(prev[contactoActivo.id] || [])],
    });

    if (globalSearch.trim()) setGlobalGestionesMap(prepender);
    else if (!calleActual && isCityFilterActive) setCityGMap(prepender);
    else setGestionesMap(prepender);

    setGlobalStats(prev => ({ hoy: prev.hoy + 1, mes: prev.mes + 1 }));
    setShowModal(false);
    setContactoActivo(null);
    return { error: null };
  };

  // ── Editar gestión existente ─────────────────────────────────────────────────
  const handleEditSave = async ({ gestionId, estado, comentarios, tiempoLlamada, capturaFile }) => {
    const updates = {
      estado,
      comentarios:    comentarios.trim(),
      tiempo_llamada: tiempoLlamada.trim(),
    };
    if (capturaFile) {
      const captura_url = await uploadCaptura(capturaFile);
      if (captura_url) updates.captura_url = captura_url;
    }

    const { error } = await supabase
      .from('telemarketing_gestiones')
      .update(updates)
      .eq('id', gestionId);

    if (error) { console.error('editGestion:', error); return { error }; }

    // Aplica el update a los tres mapas (solo el que tiene el id lo modificará)
    const applyEdit = (map) => {
      const next = { ...map };
      for (const cid of Object.keys(next)) {
        const idx = next[cid].findIndex(g => g.id === gestionId);
        if (idx !== -1) {
          next[cid] = next[cid].map((g, i) => i === idx ? { ...g, ...updates } : g);
          break;
        }
      }
      return next;
    };
    setGestionesMap(applyEdit);
    setGlobalGestionesMap(applyEdit);
    setCityGMap(applyEdit);

    setEditModal(null);
    return { error: null };
  };

  // ── Operadores únicos ────────────────────────────────────────────────────────
  const operadoresUnicos = useMemo(() =>
    [...new Set(
      Object.values(activeGMap).map(g => g[0]?.registrado_por).filter(Boolean)
    )].sort(),
  [activeGMap]);

  // ── Contactos filtrados ──────────────────────────────────────────────────────
  const contactosFiltrados = useMemo(() => {
    let list = activeContactos;

    if (isCalleMode && localSearch) {
      const q = localSearch.toLowerCase();
      list = list.filter(c =>
        (c.nombre    || '').toLowerCase().includes(q) ||
        (c.direccion || '').toLowerCase().includes(q) ||
        (c.movil     || '').toLowerCase().includes(q)
      );
    }
    if (filterOperador) {
      list = list.filter(c => activeGMap[c.id]?.[0]?.registrado_por === filterOperador);
    }
    if (filterEstado === '__sin_gestion__') {
      list = list.filter(c => !activeGMap[c.id]?.length);
    } else if (filterEstado) {
      list = list.filter(c => {
        const ug = activeGMap[c.id]?.[0];
        if (!ug) return false;
        return (ug.estado || '').split(', ').map(s => s.trim()).includes(filterEstado);
      });
    }
    if (filterDesde) {
      list = list.filter(c => {
        const ug = activeGMap[c.id]?.[0];
        return ug && ug.fecha_hora >= filterDesde;
      });
    }
    if (filterHasta) {
      list = list.filter(c => {
        const ug = activeGMap[c.id]?.[0];
        return ug && ug.fecha_hora <= filterHasta + 'T23:59:59';
      });
    }
    return list;
  }, [activeContactos, activeGMap, localSearch, isCalleMode, filterOperador, filterEstado, filterDesde, filterHasta]);

  const totalPages = Math.ceil(contactosFiltrados.length / ITEMS_PER_PAGE);
  const paginated  = contactosFiltrados.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => { setCurrentPage(1); }, [localSearch, filterOperador, filterEstado, filterDesde, filterHasta, isGlobalMode, isCityMode]);

  // ── Exportar Excel ───────────────────────────────────────────────────────────
  const exportarExcel = () => {
    const rows = contactosFiltrados.map(c => {
      const ug = activeGMap[c.id]?.[0];
      const histCount = (activeGMap[c.id]?.length ?? 1) - 1;
      return {
        'Ciudad':            provincia,
        'Calle':             c.calle || '—',
        'Nombre':            c.nombre || '—',
        'Dirección':         c.direccion || '—',
        'Móvil':             c.movil || '—',
        'CUPS':              c.cups || '—',
        'Precio Actual':     c.precio_actual || '—',
        'Última Gestión':    ug?.estado || 'Sin gestión',
        'Registrado Por':    ug?.registrado_por || '—',
        'Fecha Gestión':     ug ? fmtFechaHora(ug.fecha_hora) : '—',
        'Tiempo Llamada':    ug?.tiempo_llamada || '—',
        'Comentarios':       ug?.comentarios || '—',
        'Registros Histórico': histCount > 0 ? histCount : '—',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: Math.max(k.length, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Registro Llamadas');
    XLSX.writeFile(wb, `registro_llamadas_${provincia}_${todayStr}.xlsx`);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  const tableTitulo = isGlobalMode
    ? `Búsqueda: "${globalSearch}"`
    : isCityMode
      ? `Todos los contactos de ${provincia}`
      : calleActual;

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-5 max-w-7xl">

      {/* ── Cabecera ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
          <Phone size={22} className="text-violet-600" />
          Registro de Llamadas
        </h1>
        <p className="text-sm text-google-gray mt-1">Gestión de llamadas</p>
      </div>

      {/* ── Estadísticas globales ────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <Phone size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-google-dark leading-none">{globalStats.hoy}</p>
            <p className="text-sm text-google-gray mt-1">Gestiones hoy</p>
            {isAdmin && <p className="text-[11px] text-violet-500 mt-0.5">Todo el equipo</p>}
          </div>
        </div>
        <div className="card p-5 flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Clock size={18} className="text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-google-dark leading-none">{globalStats.mes}</p>
            <p className="text-sm text-google-gray mt-1">Gestiones en {subtitleMes}</p>
            {isAdmin && <p className="text-[11px] text-violet-500 mt-0.5">Todo el equipo</p>}
          </div>
        </div>
      </div>

      {/* ── Tabs de provincia + botón Compartir ─────────────────────────────── */}
      <div className="flex gap-2 flex-wrap items-center">
        {PROVINCIAS_CONFIG.map(prov => (
          <div key={prov.id} className="flex items-center gap-1.5">
            <button
              onClick={() => setProvincia(prov.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
                provincia === prov.id
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-white border border-google-border text-google-gray hover:border-violet-300 hover:text-violet-600'
              }`}
            >
              <MapPin size={14} />
              {prov.id}
              <span className={`text-[11px] rounded-full px-1.5 py-0.5 font-normal ${
                provincia === prov.id ? 'bg-violet-500 text-white' : 'bg-google-bg text-google-gray'
              }`}>
                {prov.calles.length}
              </span>
            </button>
            {isAdmin && (
              <button
                onClick={() => setCompartirProv(prov.id)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-google-border text-google-gray hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50 transition-all bg-white"
                title={`Gestionar acceso a ${prov.id}`}
              >
                <Users size={12} />
                Compartir
              </button>
            )}
          </div>
        ))}
      </div>

      {/* ══ ZONA CIUDAD ══════════════════════════════════════════════════════════ */}
      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-3">
        {/* Buscador global */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-400 pointer-events-none" />
          <input
            type="text"
            placeholder={`Buscar por Dirección, Móvil o Cliente en ${provincia}…`}
            value={globalSearch}
            onChange={e => {
              const val = e.target.value;
              setGlobalSearch(val);
              if (val.trim()) setCalleActual(null);
            }}
            className="w-full pl-8 pr-8 py-2.5 text-sm bg-white border border-blue-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-transparent placeholder:text-blue-300"
          />
          {globalSearch && (
            <button onClick={() => setGlobalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-400 hover:text-blue-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Fila de filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterOperador}
            onChange={e => setFilterOperador(e.target.value)}
            className="text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 text-google-dark bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Todos los operadores</option>
            {operadoresUnicos.map(op => <option key={op} value={op}>{op}</option>)}
          </select>

          <select
            value={filterEstado}
            onChange={e => setFilterEstado(e.target.value)}
            className="text-xs border border-blue-200 rounded-lg px-2.5 py-1.5 text-google-dark bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="">Todas las gestiones</option>
            <option value="__sin_gestion__">Sin gestión</option>
            {ESTADOS_GESTION.map(eg => <option key={eg.id} value={eg.id}>{eg.id}</option>)}
          </select>

          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-blue-500 font-medium whitespace-nowrap">Desde</label>
            <input type="date" value={filterDesde} onChange={e => setFilterDesde(e.target.value)}
              className="text-xs border border-blue-200 rounded-lg px-2 py-1.5 text-google-dark bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] text-blue-500 font-medium whitespace-nowrap">Hasta</label>
            <input type="date" value={filterHasta} min={filterDesde || undefined} onChange={e => setFilterHasta(e.target.value)}
              className="text-xs border border-blue-200 rounded-lg px-2 py-1.5 text-google-dark bg-white focus:outline-none focus:ring-2 focus:ring-blue-300" />
          </div>

          {isCityFilterActive && (
            <button
              onClick={() => { setFilterOperador(''); setFilterEstado(''); setFilterDesde(''); setFilterHasta(''); }}
              className="text-[11px] text-blue-500 hover:text-blue-700 underline underline-offset-2"
            >
              Limpiar filtros
            </button>
          )}

          {isAdmin && (
            <button
              onClick={exportarExcel}
              disabled={contactosFiltrados.length === 0}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              title={`Exportar ${contactosFiltrados.length} registros a Excel`}
            >
              <Download size={13} />
              Exportar Excel
            </button>
          )}
        </div>

        {(isGlobalMode || isCityMode) && (
          <p className="text-xs text-blue-500">
            {isGlobalMode
              ? `Búsqueda en toda ${provincia} — independiente de la calle seleccionada`
              : `Mostrando ${contactosFiltrados.length} de ${activeContactos.length} contactos en toda ${provincia}`
            }
          </p>
        )}
      </div>
      {/* ════════════════════════════════════════════════════════════════════════ */}

      {/* ── Tabs de calle ────────────────────────────────────────────────────── */}
      {callesVisibles.length === 0 ? (
        <div className="card p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <AlertCircle size={22} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-google-dark">Sin acceso a esta provincia</p>
            <p className="text-xs text-google-gray mt-1">
              {isAdmin ? `No hay calles configuradas para ${provincia}.` : 'Solicita al administrador que te habilite el acceso.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-3 md:mx-0">
          <div className="flex gap-2 px-3 md:px-0 pb-1 min-w-max">
            {callesVisibles.map(calle => (
              <button
                key={calle}
                onClick={() => { setCalleActual(calle); setGlobalSearch(''); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap border ${
                  calleActual === calle && !isGlobalMode
                    ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                    : 'bg-white border-google-border text-google-gray hover:border-violet-300 hover:text-violet-600 hover:bg-violet-50'
                }`}
              >
                {calle}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Placeholder cuando no hay modo activo ───────────────────────────── */}
      {!showTable && callesVisibles.length > 0 && (
        <div className="card p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center">
            <MapPin size={24} className="text-violet-500" />
          </div>
          <p className="text-sm font-medium text-google-dark">Selecciona una calle</p>
          <p className="text-xs text-google-gray">
            Elige una calle del menú superior, escribe en el buscador o activa un filtro para ver contactos
          </p>
        </div>
      )}

      {/* ── Tabla de contactos ───────────────────────────────────────────────── */}
      {showTable && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-google-border flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <MapPin size={15} className="text-violet-600 flex-shrink-0" />
              <h2 className="text-sm font-semibold text-google-dark truncate">{tableTitulo}</h2>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              {isCalleMode && (
                <div className="relative w-full sm:w-56">
                  <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Buscar en esta calle…"
                    value={localSearch}
                    onChange={e => setLocalSearch(e.target.value)}
                    className="input-field pl-8 text-sm w-full py-1.5"
                  />
                  {localSearch && (
                    <button onClick={() => setLocalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                      <X size={12} />
                    </button>
                  )}
                </div>
              )}
              <span className="text-xs text-google-gray whitespace-nowrap">
                {contactosFiltrados.length} de {activeContactos.length} contactos
              </span>
            </div>
          </div>

          {activeLoading ? (
            <div className="py-16 text-center">
              <Loader2 size={24} className="text-google-gray animate-spin mx-auto mb-2" />
              <p className="text-sm text-google-gray">Cargando contactos…</p>
            </div>
          ) : contactosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-google-gray text-sm">
              {activeContactos.length === 0
                ? (isGlobalMode ? 'No se encontraron contactos para esta búsqueda.'
                    : isCityMode  ? `No hay contactos en ${provincia}.`
                    : 'No hay contactos para esta calle.')
                : 'Sin resultados para los filtros actuales'}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-google-bg border-b border-google-border text-xs font-semibold text-google-gray uppercase tracking-wide">
                      <th className="px-3 py-3 text-left whitespace-nowrap">Fecha / Hora</th>
                      <th className="px-3 py-3 text-left">Nombre / CUPS</th>
                      <th className="px-3 py-3 text-left">Dirección</th>
                      {showCalleCol && <th className="px-3 py-3 text-left whitespace-nowrap">Calle</th>}
                      <th className="px-3 py-3 text-left">Móvil</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Precio Actual</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Última Gestión</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Registrado Por</th>
                      <th className="px-3 py-3 text-left">Tiempo</th>
                      <th className="px-3 py-3 text-center">Comprobante</th>
                      <th className="px-3 py-3 text-left">Comentarios</th>
                      <th className="px-3 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-google-border">
                    {paginated.map(contacto => (
                      <ContactoRow
                        key={contacto.id}
                        contacto={contacto}
                        gestiones={activeGMap[contacto.id] || []}
                        onGestion={(c) => { setContactoActivo(c); setShowModal(true); }}
                        onEditar={(c, g) => setEditModal({ gestion: g, contacto: c })}
                        showCalle={showCalleCol}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
            </>
          )}
        </div>
      )}

      {/* ── Modales ──────────────────────────────────────────────────────────── */}
      {compartirProv && (
        <CompartirModal
          provincia={compartirProv}
          users={users}
          callesPermisos={callesPermisos}
          onToggle={updateProvinciaAccess}
          onClose={() => setCompartirProv(null)}
        />
      )}

      {showModal && contactoActivo && (
        <GestionModal
          contacto={contactoActivo}
          onClose={() => { setShowModal(false); setContactoActivo(null); }}
          onSave={handleSave}
        />
      )}

      {editModal && (
        <EditarGestionModal
          gestion={editModal.gestion}
          contacto={editModal.contacto}
          onClose={() => setEditModal(null)}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}
