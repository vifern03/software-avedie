import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Phone, Plus, Search, Trash2, Pencil, X,
  CheckCircle, Camera, Loader2, Eye, Calendar,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_CLIENTE = [
  'Cliente Potencial',
  'En proceso / Rellamar',
  'No contesta',
  'Cliente Descartado',
];

const PERMANENCIA_OPTS = ['Sin permanencia', 'Con permanencia'];

const ITEMS_PER_PAGE = 15;

const TIPO_COLORS = {
  'Cliente Potencial':      'bg-green-100 text-green-700',
  'En proceso / Rellamar':  'bg-blue-100 text-blue-700',
  'No contesta':            'bg-gray-100 text-gray-600',
  'Cliente Descartado':     'bg-red-100 text-red-700',
};

// ─── Utilidades ───────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];
const nowTime  = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

// Parseo de YYYY-MM-DD sin conversión UTC → sin desfase de zona horaria
const parseDateParts = (dateStr) => {
  const [y, m, d] = (dateStr || '').split('-').map(Number);
  return { y, m: m - 1, d };
};

const fmtFecha = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

// ─── Modal de registro / edición ─────────────────────────────────────────────

function LlamadaModal({ onClose, onSave, initialData }) {
  const isEdit = !!initialData;

  const [form, setForm] = useState({
    fecha:          initialData?.fecha          || todayStr(),
    hora:           initialData?.hora           || nowTime(),
    nombre:         initialData?.nombre         || '',
    dni:            initialData?.dni            || '',
    precio_kw:      initialData?.precio_kw      != null ? String(initialData.precio_kw) : '',
    permanencia:    initialData?.permanencia    || 'Sin permanencia',
    tiempo_llamada: initialData?.tiempo_llamada || '',
    tipo_cliente:   initialData?.tipo_cliente   || 'Cliente Potencial',
    comentarios:    initialData?.comentarios    || '',
  });

  const [errors,         setErrors]         = useState({});
  const [saving,         setSaving]         = useState(false);
  const [saved,          setSaved]          = useState(false);
  const [capturaFile,    setCapturaFile]    = useState(null);
  const [capturaPreview, setCapturaPreview] = useState(initialData?.captura_url || '');
  const capturaRef = useRef(null);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: false }));
  };

  const handleCapturaFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturaFile(file);
    setErrors(e => ({ ...e, captura: false }));
    if (file.type === 'application/pdf') { setCapturaPreview('__pdf__'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setCapturaPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!form.fecha.trim())     e.fecha       = true;
    if (!form.hora.trim())      e.hora        = true;
    if (!form.nombre.trim())    e.nombre      = true;
    if (!form.dni.trim())       e.dni         = true;
    if (!form.tipo_cliente)     e.tipo_cliente = true;
    // Captura obligatoria solo en nuevo registro (edición mantiene la existente)
    if (!isEdit && !capturaFile) e.captura    = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const result = await onSave(form, capturaFile, initialData?.captura_url || '');
    if (result?.error) { setSaving(false); return; }
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  const ic = (f) => `input-field ${errors[f] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-lg mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        {/* Cabecera */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-violet-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center">
              <Phone size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">
                {isEdit ? 'Editar Llamada' : 'Nueva Llamada'}
              </h2>
              <p className="text-xs text-google-gray">
                {isEdit ? 'Modifica los datos y guarda los cambios' : 'Registra una llamada comercial'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Fecha y Hora */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Fecha *</label>
              <input type="date" value={form.fecha}
                onChange={e => set('fecha', e.target.value)} className={ic('fecha')} />
              {errors.fecha && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Hora *</label>
              <input type="time" value={form.hora}
                onChange={e => set('hora', e.target.value)} className={ic('hora')} />
              {errors.hora && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Nombre del cliente *</label>
            <input type="text" placeholder="Ej: María García López"
              value={form.nombre} onChange={e => set('nombre', e.target.value)} className={ic('nombre')} />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* DNI */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">DNI *</label>
            <input type="text" placeholder="Ej: 12345678Z"
              value={form.dni} onChange={e => set('dni', e.target.value)} className={ic('dni')} />
            {errors.dni && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Precio kW y Permanencia */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Precio actual kW (€)</label>
              <input type="number" step="0.0001" min="0" placeholder="Ej: 0.1450"
                value={form.precio_kw} onChange={e => set('precio_kw', e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Permanencia</label>
              <select value={form.permanencia}
                onChange={e => set('permanencia', e.target.value)} className="input-field">
                {PERMANENCIA_OPTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Tiempo de llamada */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Tiempo de llamada</label>
            <input type="text" placeholder="Ej: 08:34 o 8 min 34 seg"
              value={form.tiempo_llamada} onChange={e => set('tiempo_llamada', e.target.value)}
              className="input-field" />
          </div>

          {/* Captura (obligatoria en nuevo, opcional en edición) */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Subir captura de pantalla con el tiempo de la llamada{' '}
              {!isEdit
                ? <span className="text-red-500">* (obligatoria)</span>
                : <span className="font-normal">(opcional — se mantiene la actual si no subes nueva)</span>
              }
            </label>
            <input ref={capturaRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={handleCapturaFile} />
            <div className="flex items-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => capturaRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed text-sm transition-colors ${
                  capturaFile
                    ? 'border-green-400 text-green-700 bg-green-50'
                    : errors.captura
                      ? 'border-red-400 text-red-600 bg-red-50'
                      : 'border-google-border text-google-gray hover:border-violet-400 hover:text-violet-600 hover:bg-violet-50'
                }`}
              >
                <Camera size={16} />
                {capturaFile ? capturaFile.name.slice(0, 28) : 'Subir captura…'}
              </button>
              {capturaPreview && capturaPreview !== '__pdf__' && !capturaFile && (
                <a href={capturaPreview} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-violet-600 hover:underline">
                  <Eye size={13} /> Ver captura actual
                </a>
              )}
              {capturaPreview === '__pdf__' && (
                <span className="text-xs text-google-gray">PDF cargado</span>
              )}
            </div>
            {errors.captura && <p className="text-red-500 text-xs mt-1">La captura de pantalla es obligatoria</p>}
          </div>

          {/* Tipo de cliente */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Tipo de cliente *</label>
            <select value={form.tipo_cliente}
              onChange={e => set('tipo_cliente', e.target.value)} className={ic('tipo_cliente')}>
              {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.tipo_cliente && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Comentarios */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Comentarios</label>
            <textarea rows={3}
              placeholder="Observaciones, interés del cliente, próximos pasos..."
              value={form.comentarios} onChange={e => set('comentarios', e.target.value)}
              className="input-field resize-none" />
          </div>

          {/* Botones */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button
              type="submit"
              disabled={saving}
              className={`btn-primary flex items-center gap-2 ${saved ? '!bg-green-500 hover:!bg-green-500' : ''}`}
            >
              {saving && !saved
                ? <><Loader2 size={15} className="animate-spin" /> Guardando…</>
                : saved
                  ? <><CheckCircle size={15} /> Guardado</>
                  : isEdit ? 'Guardar cambios' : 'Registrar llamada'
              }
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function RegistroLlamadas() {
  const { currentUser } = useAuth();
  const isAdmin = currentUser?.role?.toLowerCase() === 'admin';

  // ── Estado ──────────────────────────────────────────────────────────────
  const [llamadas,     setLlamadas]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [showModal,    setShowModal]    = useState(false);
  const [editLlamada,  setEditLlamada]  = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [currentPage,  setCurrentPage]  = useState(1);

  // Filtros
  const [search,        setSearch]        = useState('');
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroTipo,    setFiltroTipo]    = useState('');
  const [fechaDesde,    setFechaDesde]    = useState('');
  const [fechaHasta,    setFechaHasta]    = useState('');

  // ── Fecha / mes en curso ────────────────────────────────────────────────
  const now      = new Date();
  const curYear  = now.getFullYear();
  const curMonth = now.getMonth(); // 0-indexed
  const todayISO = todayStr();

  const subtitleMes = (() => {
    const m = now.toLocaleString('es-ES', { month: 'long' });
    return `de ${m.charAt(0).toUpperCase() + m.slice(1)} ${curYear}`;
  })();

  // ── Carga de llamadas con visibilidad por rol ────────────────────────────
  const loadLlamadas = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('llamadas')
      .select('*')
      .is('deleted_at', null)
      .order('fecha', { ascending: false })
      .order('hora',  { ascending: false });

    if (!isAdmin) {
      const equipo = currentUser?.equipo || 'Ambos';
      if (equipo !== 'Ambos' && equipo !== 'Ninguno') {
        // Comercial/Manager con sede fija: solo ve su equipo
        q = q.eq('equipo', equipo);
      } else if (equipo === 'Ninguno') {
        // Sin equipo asignado: solo sus propios registros
        q = q.eq('registrado_por', currentUser.username);
      }
      // equipo = 'Ambos': acceso completo a su ámbito (sin restricción adicional)
    }

    const { data, error } = await q;
    if (!error) setLlamadas(data ?? []);
    setLoading(false);
  }, [currentUser, isAdmin]);

  useEffect(() => { loadLlamadas(); }, [loadLlamadas]);

  // ── Contadores INDIVIDUALES (solo currentUser.username) ──────────────────
  const myLlamadas = useMemo(
    () => llamadas.filter(l => l.registrado_por === currentUser?.username),
    [llamadas, currentUser]
  );

  const countHoy = useMemo(
    () => myLlamadas.filter(l => l.fecha === todayISO).length,
    [myLlamadas, todayISO]
  );

  const countMes = useMemo(
    () => myLlamadas.filter(l => {
      const { y, m } = parseDateParts(l.fecha);
      return y === curYear && m === curMonth;
    }).length,
    [myLlamadas, curYear, curMonth]
  );

  const countPotenciales = useMemo(
    () => myLlamadas.filter(l => {
      if (l.tipo_cliente !== 'Cliente Potencial') return false;
      const { y, m } = parseDateParts(l.fecha);
      return y === curYear && m === curMonth;
    }).length,
    [myLlamadas, curYear, curMonth]
  );

  // ── Filtrado de la tabla ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return llamadas.filter(l => {
      const matchSearch = !search ||
        (l.dni    || '').toLowerCase().includes(q) ||
        (l.nombre || '').toLowerCase().includes(q);
      const matchTipo   = !filtroTipo    || l.tipo_cliente   === filtroTipo;
      const matchUser   = !filtroUsuario || l.registrado_por === filtroUsuario;
      const matchDesde  = !fechaDesde    || l.fecha          >= fechaDesde;
      const matchHasta  = !fechaHasta    || l.fecha          <= fechaHasta;
      return matchSearch && matchTipo && matchUser && matchDesde && matchHasta;
    });
  }, [llamadas, search, filtroTipo, filtroUsuario, fechaDesde, fechaHasta]);

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => { setCurrentPage(1); }, [search, filtroTipo, filtroUsuario, fechaDesde, fechaHasta]);

  // Usuarios únicos visibles en los datos (para el select de filtro)
  const registradores = useMemo(
    () => [...new Set(llamadas.map(l => l.registrado_por).filter(Boolean))].sort(),
    [llamadas]
  );

  // ── Upload captura al bucket "llamadas-capturas" ──────────────────────────
  const uploadCaptura = async (file) => {
    const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const name = `${Date.now()}_${currentUser?.username || 'anon'}_${Math.random().toString(36).slice(2, 5)}.${ext}`;
    const { error } = await supabase.storage
      .from('llamadas-capturas')
      .upload(name, file, { upsert: false });
    if (error) { console.error('uploadCaptura:', error); return null; }
    return supabase.storage.from('llamadas-capturas').getPublicUrl(name).data.publicUrl;
  };

  // ── Guardar (INSERT o UPDATE) ─────────────────────────────────────────────
  const handleSave = async (form, capturaFile, existingCapturaUrl) => {
    let captura_url = existingCapturaUrl || '';
    if (capturaFile) {
      const url = await uploadCaptura(capturaFile);
      if (!url) return { error: 'No se pudo subir la captura' };
      captura_url = url;
    }

    const payload = {
      fecha:          form.fecha,
      hora:           form.hora,
      nombre:         form.nombre.trim(),
      dni:            form.dni.trim(),
      precio_kw:      form.precio_kw !== '' ? Number(form.precio_kw) : null,
      permanencia:    form.permanencia,
      tiempo_llamada: form.tiempo_llamada.trim(),
      captura_url,
      tipo_cliente:   form.tipo_cliente,
      comentarios:    form.comentarios.trim(),
      registrado_por: currentUser?.username || 'Sistema',
      equipo:         currentUser?.equipo   || 'Ambos',
    };

    if (editLlamada) {
      const { error } = await supabase.from('llamadas').update(payload).eq('id', editLlamada.id);
      if (error) { console.error('updateLlamada:', error); return { error }; }
      setLlamadas(prev => prev.map(l => l.id === editLlamada.id ? { ...l, ...payload } : l));
    } else {
      const newRecord = { id: Date.now(), ...payload };
      const { error } = await supabase.from('llamadas').insert([newRecord]);
      if (error) { console.error('addLlamada:', error); return { error }; }
      setLlamadas(prev => [newRecord, ...prev]);
    }

    setEditLlamada(null);
    return { error: null };
  };

  // ── Eliminar ──────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setLlamadas(prev => prev.filter(l => l.id !== id));
    const { error } = await supabase.from('llamadas')
      .update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (error) { console.error('deleteLlamada:', error); await loadLlamadas(); }
    setDeleteTarget(null);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">

      {/* Cabecera de página */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <Phone size={22} className="text-violet-600" />
            Registro de Llamadas
          </h1>
          <p className="text-sm text-google-gray mt-1">
            Control de llamadas comerciales y seguimiento de clientes
          </p>
        </div>
        <button
          onClick={() => { setEditLlamada(null); setShowModal(true); }}
          className="self-start md:self-auto flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors shadow-sm"
        >
          <Plus size={17} />
          Nueva Llamada
        </button>
      </div>

      {/* ── Tarjetas de contadores individuales ─────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Llamadas Hoy */}
        <div className="card p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-violet-600 flex-shrink-0">
            <Phone size={20} className="text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-google-dark tabular-nums leading-none">{countHoy}</p>
            <p className="text-sm text-google-gray mt-1">Llamadas Hoy</p>
          </div>
        </div>

        {/* Llamadas del Mes */}
        <div className="card p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-blue-500 flex-shrink-0">
            <Calendar size={20} className="text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-google-dark tabular-nums leading-none">{countMes}</p>
            <p className="text-sm text-google-gray mt-1">Llamadas del Mes</p>
            <p className="text-xs text-google-gray/60 mt-0.5 italic">{subtitleMes}</p>
          </div>
        </div>

        {/* Clientes Potenciales del Mes */}
        <div className="card p-5 flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-green-500 flex-shrink-0">
            <CheckCircle size={20} className="text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-google-dark tabular-nums leading-none">{countPotenciales}</p>
            <p className="text-sm text-google-gray mt-1">Clientes Potenciales</p>
            <p className="text-xs text-google-gray/60 mt-0.5 italic">{subtitleMes}</p>
          </div>
        </div>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-google-border bg-google-bg flex items-center gap-2">
          <Search size={14} className="text-google-gray" />
          <h2 className="text-sm font-semibold text-google-dark">Filtros y búsqueda</h2>
          {(search || filtroUsuario || filtroTipo || fechaDesde || fechaHasta) && (
            <button
              onClick={() => { setSearch(''); setFiltroUsuario(''); setFiltroTipo(''); setFechaDesde(''); setFechaHasta(''); }}
              className="ml-auto text-xs text-google-gray hover:text-red-600 flex items-center gap-1 transition-colors"
            >
              <X size={12} /> Limpiar filtros
            </button>
          )}
        </div>
        <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Búsqueda texto */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray pointer-events-none" />
            <input
              type="text"
              placeholder="DNI o nombre del cliente…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-9 text-sm"
            />
          </div>

          {/* Filtro por comercial */}
          <div>
            <select
              value={filtroUsuario}
              onChange={e => setFiltroUsuario(e.target.value)}
              className="input-field text-sm w-full"
            >
              <option value="">Todos los comerciales</option>
              {registradores.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* Filtro tipo cliente */}
          <div>
            <select
              value={filtroTipo}
              onChange={e => setFiltroTipo(e.target.value)}
              className="input-field text-sm w-full"
            >
              <option value="">Todos los tipos</option>
              {TIPOS_CLIENTE.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Rango de fechas */}
          <div className="flex gap-2">
            <input
              type="date"
              value={fechaDesde}
              onChange={e => setFechaDesde(e.target.value)}
              className="input-field text-sm flex-1 min-w-0"
              title="Desde"
            />
            <input
              type="date"
              value={fechaHasta}
              onChange={e => setFechaHasta(e.target.value)}
              className="input-field text-sm flex-1 min-w-0"
              title="Hasta"
            />
          </div>
        </div>
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone size={16} className="text-violet-600" />
            <h2 className="text-sm font-semibold text-google-dark">
              Llamadas registradas
              {isAdmin && (
                <span className="ml-1.5 text-[11px] font-normal text-google-gray bg-google-bg px-1.5 py-0.5 rounded-full">
                  Vista global
                </span>
              )}
            </h2>
          </div>
          <span className="text-xs text-google-gray bg-google-bg px-2 py-0.5 rounded-full">
            {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 size={24} className="text-google-gray animate-spin mx-auto mb-2" />
            <p className="text-sm text-google-gray">Cargando llamadas…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-google-gray text-sm">
            {llamadas.length === 0
              ? 'Sin llamadas registradas todavía'
              : 'No hay resultados para los filtros aplicados'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-google-bg border-b border-google-border text-xs font-semibold text-google-gray uppercase tracking-wide">
                    <th className="px-5 py-3 text-left sticky left-0 bg-google-bg z-10">Fecha</th>
                    <th className="px-4 py-3 text-left">Cliente / DNI</th>
                    <th className="px-4 py-3 text-center">Tipo</th>
                    <th className="px-4 py-3 text-center">Precio kW</th>
                    <th className="px-4 py-3 text-center">Permanencia</th>
                    <th className="px-4 py-3 text-center">Tiempo</th>
                    <th className="px-4 py-3 text-center">Captura</th>
                    <th className="px-4 py-3 text-left">Comentarios</th>
                    <th className="px-4 py-3 text-left">Comercial</th>
                    <th className="px-5 py-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-google-border">
                  {paginated.map(l => (
                    <tr key={l.id} className="hover:bg-google-bg/40 transition-colors">

                      {/* Fecha + Hora */}
                      <td className="px-5 py-3 sticky left-0 bg-white z-10 whitespace-nowrap">
                        <p className="font-semibold text-google-dark text-xs">{fmtFecha(l.fecha)}</p>
                        <p className="text-[11px] text-google-gray">{l.hora}</p>
                      </td>

                      {/* Nombre + DNI */}
                      <td className="px-4 py-3 min-w-[150px] max-w-[200px]">
                        <p className="font-medium text-google-dark truncate">{l.nombre}</p>
                        <p className="text-xs text-google-gray font-mono">{l.dni}</p>
                      </td>

                      {/* Tipo cliente */}
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${TIPO_COLORS[l.tipo_cliente] || 'bg-gray-100 text-gray-600'}`}>
                          {l.tipo_cliente}
                        </span>
                      </td>

                      {/* Precio kW */}
                      <td className="px-4 py-3 text-center font-mono text-xs text-google-dark whitespace-nowrap">
                        {l.precio_kw != null ? `${Number(l.precio_kw).toFixed(4)} €` : '—'}
                      </td>

                      {/* Permanencia */}
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          l.permanencia === 'Con permanencia'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {l.permanencia === 'Con permanencia' ? 'Con perm.' : 'Sin perm.'}
                        </span>
                      </td>

                      {/* Tiempo */}
                      <td className="px-4 py-3 text-center font-mono text-xs text-google-gray whitespace-nowrap">
                        {l.tiempo_llamada || '—'}
                      </td>

                      {/* Captura */}
                      <td className="px-4 py-3 text-center">
                        {l.captura_url ? (
                          <a
                            href={l.captura_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 hover:underline transition-colors"
                          >
                            <Eye size={13} /> Ver
                          </a>
                        ) : (
                          <span className="text-google-gray text-xs">—</span>
                        )}
                      </td>

                      {/* Comentarios */}
                      <td className="px-4 py-3 text-xs text-google-gray max-w-[180px]">
                        <p className="line-clamp-2">{l.comentarios || '—'}</p>
                      </td>

                      {/* Comercial */}
                      <td className="px-4 py-3 text-xs text-google-gray whitespace-nowrap">
                        {l.registrado_por}
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => { setEditLlamada(l); setShowModal(true); }}
                            className="p-1.5 rounded-lg text-google-gray hover:bg-blue-50 hover:text-blue-600 transition-colors"
                            title="Editar"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(l)}
                            className="p-1.5 rounded-lg text-google-gray hover:bg-red-50 hover:text-red-600 transition-colors"
                            title="Eliminar"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
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

      {/* Modal de registro / edición */}
      {showModal && (
        <LlamadaModal
          onClose={() => { setShowModal(false); setEditLlamada(null); }}
          onSave={handleSave}
          initialData={editLlamada}
        />
      )}

      {/* Modal de confirmación de borrado */}
      {deleteTarget && (
        <DeleteConfirmModal
          onConfirm={() => handleDelete(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
