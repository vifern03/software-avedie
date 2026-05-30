import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Trash2, X, CheckCircle,
  Pencil, Clock, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

const todayStr = () => new Date().toISOString().split('T')[0];
const nowTime  = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const ESTADO_BADGE = {
  'Pendiente':    'bg-red-100    text-red-700',
  'En proceso':   'bg-orange-100 text-orange-700',
  'Solucionado':  'bg-blue-100   text-blue-700',
  'Caso Cerrado': 'bg-green-100  text-green-700',
};

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Nuevo reporte
// ─────────────────────────────────────────────────────────────────────────────
function NuevoReporteModal({ currentUser, onClose, onSave }) {
  const [form,   setForm]   = useState({ titulo: '', descripcion: '' });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: false }));
  };

  const validate = () => {
    const e = {};
    if (!form.titulo.trim())      e.titulo = true;
    if (!form.descripcion.trim()) e.descripcion = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave({
      creado_por:           currentUser.username,
      titulo:               form.titulo.trim(),
      descripcion:          form.descripcion.trim(),
      respuesta_admin:      '',
      confirmacion_usuario: '',
      estado:               'Pendiente',
      fecha:                todayStr(),
      hora:                 nowTime(),
    });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const ic = (f) => `input-field ${errors[f] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-google-blue flex items-center justify-center">
              <ClipboardList size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Nuevo Reporte</h2>
              <p className="text-xs text-google-gray">Describe el fallo o mejora encontrada</p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Título del reporte *</label>
            <input type="text" placeholder="Ej: Error al guardar cliente B2B"
              value={form.titulo} onChange={e => set('titulo', e.target.value)} className={ic('titulo')} />
            {errors.titulo && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Descripción *</label>
            <textarea placeholder="Describe el problema con detalle: qué ocurrió, cuándo, en qué sección..."
              value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={4} className={`${ic('descripcion')} resize-none`} />
            {errors.descripcion && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}>
              {saved ? <><CheckCircle size={15} /><span>Enviado</span></> : <span>Enviar Reporte</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Editar reporte (solo creador, solo Pendiente)
// ─────────────────────────────────────────────────────────────────────────────
function EditarReporteModal({ reporte, onClose, onSave }) {
  const [form,   setForm]   = useState({ titulo: reporte.titulo, descripcion: reporte.descripcion });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: false }));
  };

  const validate = () => {
    const e = {};
    if (!form.titulo.trim())      e.titulo = true;
    if (!form.descripcion.trim()) e.descripcion = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    await onSave(reporte.id, { titulo: form.titulo.trim(), descripcion: form.descripcion.trim() });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const ic = (f) => `input-field ${errors[f] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-google-blue flex items-center justify-center">
              <Pencil size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Editar Reporte</h2>
              <p className="text-xs text-google-gray">Solo puedes editar reportes en estado Pendiente</p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Título *</label>
            <input type="text" value={form.titulo}
              onChange={e => set('titulo', e.target.value)} className={ic('titulo')} />
            {errors.titulo && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Descripción *</label>
            <textarea value={form.descripcion} onChange={e => set('descripcion', e.target.value)}
              rows={4} className={`${ic('descripcion')} resize-none`} />
            {errors.descripcion && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}>
              {saved ? <><CheckCircle size={15} /><span>Guardado</span></> : <span>Guardar Cambios</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Victor escribe la solución (estado En proceso → Solucionado)
// ─────────────────────────────────────────────────────────────────────────────
function ResolverModal({ reporte, onClose, onSave }) {
  const [solucion, setSolucion] = useState('');
  const [error,    setError]    = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!solucion.trim()) { setError(true); return; }
    setSaving(true);
    await onSave(reporte.id, {
      estado:               'Solucionado',
      respuesta_admin:      solucion.trim(),
      confirmacion_usuario: '',
    });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-green-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center">
              <CheckCircle size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Resolver Incidencia</h2>
              <p className="text-xs text-google-gray truncate max-w-[220px]" title={reporte.titulo}>
                {reporte.titulo}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="bg-google-bg border border-google-border rounded-xl p-3">
            <p className="text-xs font-medium text-google-gray mb-1">Descripción del problema:</p>
            <p className="text-sm text-google-dark">{reporte.descripcion}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Solución / Respuesta <span className="text-red-500">*</span>
            </label>
            <textarea
              placeholder="Describe la solución aplicada..."
              value={solucion}
              onChange={e => { setSolucion(e.target.value); setError(false); }}
              rows={4}
              className={`input-field resize-none ${error ? '!border-red-400' : ''}`}
            />
            {error && <p className="text-red-500 text-xs mt-1">La solución es obligatoria para resolver el caso</p>}
          </div>
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                saved ? 'bg-green-500' : 'bg-green-600 hover:bg-green-700'
              }`}>
              {saved
                ? <><CheckCircle size={15} /><span>Resuelto</span></>
                : <><CheckCircle size={15} /><span>Resolver Incidencia</span></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Victor edita su respuesta mientras el comercial aún no ha confirmado
// ─────────────────────────────────────────────────────────────────────────────
function EditarRespuestaModal({ reporte, onClose, onSave, onReopener }) {
  const [respuesta, setRespuesta] = useState(reporte.respuesta_admin || '');
  const [error,     setError]     = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!respuesta.trim()) { setError(true); return; }
    setSaving(true);
    await onSave(reporte.id, { respuesta_admin: respuesta.trim() });
    setSaved(true);
    setTimeout(onClose, 700);
  };

  const handleReabrir = async () => {
    setSaving(true);
    await onReopener(reporte.id, {
      estado:          'En proceso',
      respuesta_admin: 'El administrador está revisando la incidencia...',
      confirmacion_usuario: '',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-google-blue flex items-center justify-center">
              <Pencil size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Editar Respuesta</h2>
              <p className="text-xs text-google-gray truncate max-w-[220px]" title={reporte.titulo}>
                {reporte.titulo}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleGuardar} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Respuesta / Solución <span className="text-red-500">*</span>
            </label>
            <textarea
              value={respuesta}
              onChange={e => { setRespuesta(e.target.value); setError(false); }}
              rows={4}
              className={`input-field resize-none ${error ? '!border-red-400' : ''}`}
            />
            {error && <p className="text-red-500 text-xs mt-1">La respuesta no puede estar vacía</p>}
          </div>
          <div className="flex items-center justify-between gap-3 pt-2 border-t border-google-border">
            <button
              type="button"
              onClick={handleReabrir}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors"
            >
              <Clock size={13} /> Reabrir y mover a En Proceso
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
              <button type="submit" disabled={saving}
                className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}>
                {saved ? <><CheckCircle size={15} /><span>Guardado</span></> : <span>Guardar Respuesta</span>}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Comercial confirma solución o reabre el caso
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmarSolucionModal({ reporte, onClose, onConfirmar }) {
  const [modo,   setModo]   = useState(null); // null | 'nok'
  const [motivo, setMotivo] = useState('');
  const [errorMotivo, setErrorMotivo] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleOk = async () => {
    setSaving(true);
    await onConfirmar(reporte.id, {
      estado:               'Caso Cerrado',
      confirmacion_usuario: 'Confirmado por el usuario',
    });
    onClose();
  };

  const handleNok = async () => {
    if (!motivo.trim()) { setErrorMotivo(true); return; }
    setSaving(true);
    await onConfirmar(reporte.id, {
      estado:               'Pendiente',
      respuesta_admin:      '',
      confirmacion_usuario: motivo.trim(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col">
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-google-blue flex items-center justify-center">
              <CheckCircle size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Confirmar Solución</h2>
              <p className="text-xs text-google-gray truncate max-w-[220px]" title={reporte.titulo}>
                {reporte.titulo}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {reporte.respuesta_admin && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs font-medium text-google-blue mb-1">Respuesta de Victor:</p>
              <p className="text-sm text-google-dark">{reporte.respuesta_admin}</p>
            </div>
          )}

          <p className="text-sm font-semibold text-google-dark">¿La solución ha funcionado?</p>

          {/* Opción A — Solucionado */}
          <button onClick={handleOk} disabled={saving}
            className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 transition-colors text-left">
            <CheckCircle size={20} className="text-green-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-700">Sí, está solucionado</p>
              <p className="text-xs text-green-600">El caso se cerrará definitivamente</p>
            </div>
          </button>

          {/* Opción B — Reapertura */}
          <div>
            <button onClick={() => setModo(modo === 'nok' ? null : 'nok')}
              className="w-full flex items-center gap-3 p-4 rounded-xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 transition-colors text-left">
              <AlertTriangle size={20} className="text-orange-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-orange-700">No, sigue fallando</p>
                <p className="text-xs text-orange-600">El caso volverá a "Pendiente" para que Victor lo revise</p>
              </div>
            </button>
            {modo === 'nok' && (
              <div className="mt-3 space-y-2">
                <textarea
                  placeholder="Describe brevemente por qué sigue fallando..."
                  value={motivo}
                  onChange={e => { setMotivo(e.target.value); setErrorMotivo(false); }}
                  rows={3}
                  className={`input-field resize-none ${errorMotivo ? '!border-red-400' : ''}`}
                />
                {errorMotivo && (
                  <p className="text-red-500 text-xs">Describe el motivo para reabrir el caso</p>
                )}
                <div className="flex justify-end">
                  <button onClick={handleNok} disabled={saving}
                    className="px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors">
                    Reabrir caso
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal: Confirmación de borrado
// ─────────────────────────────────────────────────────────────────────────────
function DeleteConfirm({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-sm mx-4 p-6 text-center space-y-4">
        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto">
          <Trash2 size={22} className="text-red-500" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-google-dark">¿Eliminar reporte?</h3>
          <p className="text-sm text-google-gray mt-1">Esta acción no se puede deshacer.</p>
        </div>
        <div className="flex items-center justify-center gap-3">
          <button onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: badge de estado
// ─────────────────────────────────────────────────────────────────────────────
function EstadoBadge({ estado }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${ESTADO_BADGE[estado] || 'bg-gray-100 text-gray-600'}`}>
      {estado}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: celda "Confirmación" para la vista de Victor
// ─────────────────────────────────────────────────────────────────────────────
function ConfirmacionCell({ valor }) {
  if (!valor) return <span className="text-google-gray/40 text-xs">—</span>;
  if (valor === 'Confirmado por el usuario') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full whitespace-nowrap">
        <CheckCircle size={11} /> Confirmado
      </span>
    );
  }
  return (
    <span className="block truncate max-w-[140px] text-xs text-orange-700" title={valor}>
      ↩ {valor}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportesSoftware() {
  const { currentUser } = useAuth();
  const isVictor = currentUser?.username === 'Victor';

  const [reportes,        setReportes]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [tableError,      setTableError]      = useState(false);
  const [showNuevo,       setShowNuevo]       = useState(false);
  const [editTarget,           setEditTarget]           = useState(null);
  const [resolverTarget,       setResolverTarget]       = useState(null);
  const [editRespuestaTarget,  setEditRespuestaTarget]  = useState(null);
  const [confirmarTarget,      setConfirmarTarget]      = useState(null);
  const [deleteTarget,         setDeleteTarget]         = useState(null);

  const loadReportes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('reportes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[reportes] Error al cargar:', error.message, error);
      setTableError(true);
    } else {
      setReportes(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadReportes(); }, [loadReportes]);

  // ── Crear ──────────────────────────────────────────────────────────────────
  const handleCreate = async (reporte) => {
    const { error } = await supabase.from('reportes').insert([reporte]);
    if (error) {
      console.error('[reportes] INSERT rechazado:', error.message, error);
      alert(`Error al guardar el reporte:\n${error.message}`);
    } else {
      await loadReportes();
    }
  };

  // ── Editar (creador, solo Pendiente) ───────────────────────────────────────
  const handleEdit = async (id, updates) => {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    const { error } = await supabase.from('reportes').update(updates).eq('id', id);
    if (error) { console.error('[reportes] EDIT:', error.message); await loadReportes(); }
  };

  // ── Victor: Marcar en proceso (acción directa, sin modal) ─────────────────
  const handleMarcarEnProceso = async (id) => {
    const updates = {
      estado:          'En proceso',
      respuesta_admin: 'El administrador está revisando la incidencia...',
      confirmacion_usuario: '',
    };
    setReportes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    const { error } = await supabase.from('reportes').update(updates).eq('id', id);
    if (error) { console.error('[reportes] EN_PROCESO:', error.message); await loadReportes(); }
  };

  // ── Victor: Editar respuesta en estado Solucionado ────────────────────────
  const handleEditRespuesta = async (id, updates) => {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    const { error } = await supabase.from('reportes').update(updates).eq('id', id);
    if (error) { console.error('[reportes] EDIT_RESPUESTA:', error.message); await loadReportes(); }
  };

  // ── Victor: Guardar solución (modal ResolverModal) ─────────────────────────
  const handleResolver = async (id, updates) => {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    const { error } = await supabase.from('reportes').update(updates).eq('id', id);
    if (error) { console.error('[reportes] RESOLVER:', error.message); await loadReportes(); }
  };

  // ── Comercial: Confirmar solución o reabrir caso ───────────────────────────
  const handleConfirmar = async (id, updates) => {
    setReportes(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
    const { error } = await supabase.from('reportes').update(updates).eq('id', id);
    if (error) { console.error('[reportes] CONFIRMAR:', error.message); await loadReportes(); }
  };

  // ── Borrar ─────────────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setReportes(prev => prev.filter(r => r.id !== id));
    const { error } = await supabase.from('reportes').delete().eq('id', id);
    if (error) { console.error('[reportes] DELETE:', error.message); await loadReportes(); }
  };

  const visibles = isVictor
    ? reportes
    : reportes.filter(r => r.creado_por === currentUser?.username);

  // Victor: 8 cols | Comercial: 6 cols
  const colSpan = isVictor ? 8 : 6;

  return (
    <div className="p-6 space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <ClipboardList size={22} className="text-google-blue" />
            Buzón de Incidencias
          </h1>
          <p className="text-sm text-google-gray mt-1">
            {isVictor
              ? 'Gestión de todos los reportes de software enviados por el equipo'
              : 'Envía reportes de errores o mejoras al equipo técnico'}
          </p>
        </div>
        <button onClick={() => setShowNuevo(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          <span>Nuevo Reporte</span>
        </button>
      </div>

      {tableError && (
        <div className="card p-5 border border-red-200 bg-red-50 text-sm text-red-700 space-y-1">
          <p className="font-semibold">Tabla "reportes" no encontrada en Supabase.</p>
          <p>Ejecuta el SQL de <code className="bg-red-100 px-1 rounded">supabase_init.sql</code> en el Editor SQL y recarga.</p>
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-google-dark">
            {isVictor ? 'Todos los reportes del equipo' : 'Mis Reportes'}
          </h2>
          <span className="text-xs text-google-gray">
            {visibles.length} {visibles.length === 1 ? 'reporte' : 'reportes'}
          </span>
        </div>

        {loading ? (
          <div className="py-16 text-center text-google-gray text-sm">Cargando reportes...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr>
                  <th className="table-header">Fecha</th>
                  {isVictor && <th className="table-header">Comercial</th>}
                  <th className="table-header">Título</th>
                  <th className="table-header">Descripción</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Respuesta</th>
                  {isVictor && <th className="table-header">Confirmación</th>}
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibles.length === 0 ? (
                  <tr>
                    <td colSpan={colSpan} className="text-center py-12 text-google-gray text-sm">
                      {isVictor
                        ? 'No hay reportes enviados todavía.'
                        : 'Aún no has enviado ningún reporte. Pulsa "Nuevo Reporte" para empezar.'}
                    </td>
                  </tr>
                ) : (
                  visibles.map(r => (
                    <tr key={r.id} className="hover:bg-google-bg transition-colors">

                      {/* Fecha */}
                      <td className="table-cell tabular-nums text-xs text-google-gray whitespace-nowrap">{r.fecha}</td>

                      {/* Comercial (solo Victor) */}
                      {isVictor && (
                        <td className="table-cell font-medium text-google-dark whitespace-nowrap">{r.creado_por}</td>
                      )}

                      {/* Título */}
                      <td className="table-cell font-medium text-google-dark max-w-[160px]">
                        <span className="block truncate" title={r.titulo}>{r.titulo}</span>
                      </td>

                      {/* Descripción */}
                      <td className="table-cell text-google-gray text-xs max-w-[200px]">
                        <span className="block truncate" title={r.descripcion}>{r.descripcion}</span>
                      </td>

                      {/* Estado */}
                      <td className="table-cell"><EstadoBadge estado={r.estado} /></td>

                      {/* Respuesta */}
                      <td className="table-cell text-xs max-w-[200px]">
                        {r.respuesta_admin
                          ? <span className="text-google-dark">{r.respuesta_admin}</span>
                          : <span className="italic text-google-gray/60">Esperando respuesta...</span>}
                      </td>

                      {/* Confirmación (solo Victor) */}
                      {isVictor && (
                        <td className="table-cell">
                          <ConfirmacionCell valor={r.confirmacion_usuario} />
                        </td>
                      )}

                      {/* Acciones */}
                      <td className="table-cell">
                        {isVictor ? (
                          // ── Acciones de Victor ─────────────────────────────
                          <div className="flex items-center gap-1.5">
                            {r.estado === 'Pendiente' && (
                              <button
                                onClick={() => handleMarcarEnProceso(r.id)}
                                title="Marcar en proceso"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-orange-100 text-orange-700 hover:bg-orange-200 transition-colors whitespace-nowrap"
                              >
                                <Clock size={12} /> Marcar en Proceso
                              </button>
                            )}
                            {r.estado === 'En proceso' && (
                              <button
                                onClick={() => setResolverTarget(r)}
                                title="Resolver incidencia"
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200 transition-colors whitespace-nowrap"
                              >
                                <CheckCircle size={12} /> Resolver
                              </button>
                            )}
                            {r.estado === 'Solucionado' && !r.confirmacion_usuario && (
                              <>
                                <span className="text-xs text-google-gray italic whitespace-nowrap">
                                  Esperando confirmación...
                                </span>
                                <button
                                  onClick={() => setEditRespuestaTarget(r)}
                                  title="Editar respuesta"
                                  className="p-1 rounded hover:bg-blue-50 transition-colors"
                                >
                                  <Pencil size={14} className="text-google-blue" />
                                </button>
                              </>
                            )}
                            {r.estado === 'Caso Cerrado' && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap">
                                <CheckCircle size={13} /> Caso Cerrado
                              </span>
                            )}
                            {/* Papelera para Victor siempre visible */}
                            <button
                              onClick={() => setDeleteTarget(r)}
                              title="Eliminar"
                              className="p-1 rounded hover:bg-red-50 transition-colors ml-1"
                            >
                              <Trash2 size={14} className="text-red-400" />
                            </button>
                          </div>
                        ) : (
                          // ── Acciones del comercial ─────────────────────────
                          r.creado_por === currentUser?.username ? (
                            r.estado === 'Pendiente' ? (
                              <div className="flex items-center gap-1">
                                <button onClick={() => setEditTarget(r)} title="Editar"
                                  className="p-1 rounded hover:bg-blue-50 transition-colors">
                                  <Pencil size={15} className="text-google-blue" />
                                </button>
                                <button onClick={() => setDeleteTarget(r)} title="Eliminar"
                                  className="p-1 rounded hover:bg-red-50 transition-colors">
                                  <Trash2 size={15} className="text-red-500" />
                                </button>
                              </div>
                            ) : r.estado === 'En proceso' ? (
                              <span className="text-google-gray/40 text-xs">—</span>
                            ) : r.estado === 'Solucionado' ? (
                              <button
                                onClick={() => setConfirmarTarget(r)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-blue-100 text-google-blue hover:bg-blue-200 transition-colors whitespace-nowrap"
                              >
                                <CheckCircle size={12} /> Confirmar Solución
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 whitespace-nowrap">
                                <CheckCircle size={13} /> Cerrado
                              </span>
                            )
                          ) : (
                            <span className="text-google-gray/40 text-xs">—</span>
                          )
                        )}
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showNuevo && (
        <NuevoReporteModal
          currentUser={currentUser}
          onClose={() => setShowNuevo(false)}
          onSave={handleCreate}
        />
      )}
      {editTarget && (
        <EditarReporteModal
          reporte={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={handleEdit}
        />
      )}
      {resolverTarget && (
        <ResolverModal
          reporte={resolverTarget}
          onClose={() => setResolverTarget(null)}
          onSave={handleResolver}
        />
      )}
      {editRespuestaTarget && (
        <EditarRespuestaModal
          reporte={editRespuestaTarget}
          onClose={() => setEditRespuestaTarget(null)}
          onSave={handleEditRespuesta}
          onReopener={handleEditRespuesta}
        />
      )}
      {confirmarTarget && (
        <ConfirmarSolucionModal
          reporte={confirmarTarget}
          onClose={() => setConfirmarTarget(null)}
          onConfirmar={handleConfirmar}
        />
      )}
      {deleteTarget && (
        <DeleteConfirm
          onConfirm={() => { handleDelete(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
