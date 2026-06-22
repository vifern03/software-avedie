import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, Search, X, Loader2, Camera, Eye, CheckCircle,
  MapPin, Clock, AlertCircle, Plus, Users,
  Shield, Briefcase, UserCheck,
} from 'lucide-react';
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
              <p className="text-xs text-google-gray mt-0.5">
                Activa el acceso de cada operador a todas las calles
              </p>
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
                <Toggle
                  checked={hasAccess}
                  onChange={() => onToggle(user.username, provincia, !hasAccess)}
                />
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
  const cfg = ESTADOS_GESTION.find(e => e.id === estado);
  if (!cfg) return <span className="text-xs text-google-gray">—</span>;
  const px = size === 'sm' ? 'px-2 py-0.5' : 'px-3 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full whitespace-nowrap ${px} ${cfg.bg} ${cfg.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {estado}
    </span>
  );
}

// ─── Modal de registro de gestión ─────────────────────────────────────────────

function GestionModal({ contacto, onClose, onSave }) {
  const [estado,        setEstado]        = useState('No contesta');
  const [comentarios,   setComentarios]   = useState('');
  const [tiempoLlamada, setTiempoLlamada] = useState('');
  const [capturaFile,   setCapturaFile]   = useState(null);
  const [capturaPreview,setCapturaPreview]= useState('');
  const [saving,        setSaving]        = useState(false);
  const [saved,         setSaved]         = useState(false);
  const [errors,        setErrors]        = useState({});
  const capturaRef = useRef(null);

  const fechaHoraAuto = useMemo(() => fmtFechaHora(new Date().toISOString()), []);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const canSubmit = tiempoLlamada.trim().length > 0 && capturaFile !== null && !saving;

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
    if (!tiempoLlamada.trim()) e.tiempo  = true;
    if (!capturaFile)           e.captura = true;
    if (!estado)                e.estado  = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const result = await onSave({ estado, comentarios, tiempoLlamada, capturaFile });
      if (result?.error) {
        setSaving(false);
        setErrors(e => ({ ...e, submit: result.error }));
        return;
      }
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
            <label className="block text-xs font-semibold text-google-dark mb-2.5">
              Estado de la gestión <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ESTADOS_GESTION.map(cfg => (
                <button
                  key={cfg.id}
                  type="button"
                  onClick={() => { setEstado(cfg.id); setErrors(e => ({ ...e, estado: false })); }}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left ${
                    estado === cfg.id
                      ? `${cfg.bg} ${cfg.text} border-current ring-2 ${cfg.ring}`
                      : 'border-google-border text-google-gray hover:border-gray-300 hover:bg-google-bg'
                  }`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                  {cfg.id}
                </button>
              ))}
            </div>
            {errors.estado && <p className="text-red-500 text-xs mt-1">Selecciona un estado</p>}
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
            {capturaPreview === '__pdf__' && (
              <p className="text-xs text-google-gray mt-1">PDF seleccionado</p>
            )}
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
            <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {errors.submit}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={!canSubmit}
              title={!canSubmit ? 'Rellena el tiempo de llamada y sube la captura para continuar' : undefined}
              className={`btn-primary flex items-center gap-2 transition-all ${
                saved
                  ? '!bg-green-500 hover:!bg-green-500'
                  : !canSubmit
                    ? '!opacity-40 !cursor-not-allowed'
                    : ''
              }`}
            >
              {saving && !saved
                ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                : saved
                  ? <><CheckCircle size={15} /> Guardado</>
                  : 'Guardar Gestión'
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Fila de contacto ─────────────────────────────────────────────────────────

function ContactoRow({ contacto, gestiones, onGestion }) {
  const [loadingCaptura, setLoadingCaptura] = useState(false);
  const ultimaGestion = gestiones?.[0] ?? null;

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
      // Base64 data URL → convertir a Blob para que window.open funcione en Chrome
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
            title={loadingCaptura ? 'Pensando...' : 'Ver comprobante'}
          >
            {loadingCaptura
              ? <Loader2 size={14} className="animate-spin" />
              : <Eye size={14} />}
          </button>
        ) : (
          <span className="text-google-gray text-xs">—</span>
        )}
      </td>

      {/* ACCIÓN */}
      <td className="px-3 py-3 whitespace-nowrap">
        <button
          onClick={() => onGestion(contacto)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium transition-colors"
        >
          <Plus size={13} />
          Registrar
        </button>
      </td>
    </tr>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────

export default function RegistroLlamadas() {
  const { currentUser, hasProvinciaAccess, callesPermisos, updateProvinciaAccess, users } = useAuth();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  const [provincia,       setProvincia]       = useState('Palencia');
  const [calleActual,     setCalleActual]     = useState(null);
  const [contactos,       setContactos]       = useState([]);
  const [gestionesMap,    setGestionesMap]    = useState({});
  const [loading,         setLoading]         = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [contactoActivo,  setContactoActivo]  = useState(null);
  const [search,          setSearch]          = useState('');
  const [currentPage,     setCurrentPage]     = useState(1);
  const [compartirProv,   setCompartirProv]   = useState(null);

  // Estadísticas globales (independientes de la calle seleccionada)
  const [globalStats, setGlobalStats] = useState({ hoy: 0, mes: 0 });

  const now          = new Date();
  const todayStr     = now.toISOString().split('T')[0];
  const monthPrefix  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const subtitleMes  = (() => {
    const m = now.toLocaleString('es-ES', { month: 'long' });
    return m.charAt(0).toUpperCase() + m.slice(1);
  })();

  // Carga de stats globales al montar y cuando el usuario cambia
  useEffect(() => {
    if (!currentUser) return;
    async function loadStats() {
      let q = supabase
        .from('telemarketing_gestiones')
        .select('fecha_hora')
        .is('deleted_at', null);
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

  // Calles visibles: admin → todas; operador → todas si tiene acceso a la provincia, si no, nada
  const callesConfig = PROVINCIAS_CONFIG.find(p => p.id === provincia) || { calles: [] };

  const callesVisibles = useMemo(() => {
    if (isAdmin) return callesConfig.calles;
    return hasProvinciaAccess(provincia) ? callesConfig.calles : [];
  }, [isAdmin, callesConfig.calles, hasProvinciaAccess, provincia]);

  useEffect(() => {
    setCalleActual(null);
    setContactos([]);
    setGestionesMap({});
    setSearch('');
    setCurrentPage(1);
  }, [provincia]);

  useEffect(() => {
    if (!calleActual) return;
    setLoading(true);
    setContactos([]);
    setGestionesMap({});
    setSearch('');
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
      // captura_url excluida del fetch inicial — se carga bajo demanda al pulsar el ojo
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

  // Convierte el archivo a base64 data-URL y lo guarda en la BD (sin dependencia de Storage/RLS)
  const uploadCaptura = (file) =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload  = (e) => resolve(e.target.result);
      reader.onerror = ()  => resolve(null);
      reader.readAsDataURL(file);
    });

  // Guardar gestión
  const handleSave = async ({ estado, comentarios, tiempoLlamada, capturaFile }) => {
    const captura_url = await uploadCaptura(capturaFile);
    if (!captura_url) return { error: 'No se pudo subir la captura' };

    const newGestion = {
      id:             Date.now(),
      contacto_id:    contactoActivo.id,
      calle:          calleActual,
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

    // En el estado local guardamos sin captura_url (lazy)
    const { captura_url: _url, ...gestionForState } = newGestion;
    setGestionesMap(prev => ({
      ...prev,
      [contactoActivo.id]: [gestionForState, ...(prev[contactoActivo.id] || [])],
    }));

    // Incremento inmediato de stats globales (fecha actual → siempre hoy y este mes)
    setGlobalStats(prev => ({ hoy: prev.hoy + 1, mes: prev.mes + 1 }));

    setShowModal(false);
    setContactoActivo(null);
    return { error: null };
  };

  const contactosFiltrados = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contactos;
    return contactos.filter(c =>
      (c.nombre    || '').toLowerCase().includes(q) ||
      (c.direccion || '').toLowerCase().includes(q) ||
      (c.movil     || '').toLowerCase().includes(q)
    );
  }, [contactos, search]);

  const totalPages = Math.ceil(contactosFiltrados.length / ITEMS_PER_PAGE);
  const paginated  = contactosFiltrados.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  useEffect(() => { setCurrentPage(1); }, [search]);

  // ─────────────────────────────────────────────────────────────────────────────
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

      {/* ── Tabs de calle ────────────────────────────────────────────────────── */}
      {callesVisibles.length === 0 ? (
        <div className="card p-8 flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
            <AlertCircle size={22} className="text-gray-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-google-dark">Sin acceso a esta provincia</p>
            <p className="text-xs text-google-gray mt-1">
              {isAdmin
                ? `No hay calles configuradas para ${provincia}.`
                : 'Solicita al administrador que te habilite el acceso a esta provincia.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-3 md:mx-0">
          <div className="flex gap-2 px-3 md:px-0 pb-1 min-w-max">
            {callesVisibles.map(calle => (
              <button
                key={calle}
                onClick={() => setCalleActual(calle)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all whitespace-nowrap border ${
                  calleActual === calle
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

      {/* ── Sin calle seleccionada ───────────────────────────────────────────── */}
      {!calleActual && callesVisibles.length > 0 && (
        <div className="card p-10 flex flex-col items-center gap-3 text-center">
          <div className="w-14 h-14 bg-violet-100 rounded-full flex items-center justify-center">
            <MapPin size={24} className="text-violet-500" />
          </div>
          <p className="text-sm font-medium text-google-dark">Selecciona una calle</p>
          <p className="text-xs text-google-gray">Elige una calle del menú superior para ver sus contactos</p>
        </div>
      )}

      {/* ── Tabla de contactos ───────────────────────────────────────────────── */}
      {calleActual && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-google-border flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2 flex-1">
              <MapPin size={16} className="text-violet-600" />
              <h2 className="text-sm font-semibold text-google-dark">{calleActual}</h2>
              <span className="text-xs text-google-gray bg-google-bg px-2 py-0.5 rounded-full">
                {contactosFiltrados.length} contacto{contactosFiltrados.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="relative w-full sm:w-64">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar nombre, dirección, móvil…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input-field pl-8 text-sm w-full"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {loading ? (
            <div className="py-16 text-center">
              <Loader2 size={24} className="text-google-gray animate-spin mx-auto mb-2" />
              <p className="text-sm text-google-gray">Cargando contactos…</p>
            </div>
          ) : contactosFiltrados.length === 0 ? (
            <div className="py-16 text-center text-google-gray text-sm">
              {contactos.length === 0
                ? 'No hay contactos para esta calle. Ejecuta el script de migración.'
                : 'Sin resultados para la búsqueda actual'}
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
                      <th className="px-3 py-3 text-left">Móvil</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Precio Actual</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Última Gestión</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Registrado Por</th>
                      <th className="px-3 py-3 text-left">Tiempo</th>
                      <th className="px-3 py-3 text-center">Comprobante</th>
                      <th className="px-3 py-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-google-border">
                    {paginated.map(contacto => (
                      <ContactoRow
                        key={contacto.id}
                        contacto={contacto}
                        gestiones={gestionesMap[contacto.id] || []}
                        onGestion={(c) => { setContactoActivo(c); setShowModal(true); }}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
              />
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
    </div>
  );
}
