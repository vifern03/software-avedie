import { useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Landmark, Plus, CalendarDays, Users, Search, Trash2, Pencil, CheckCircle, X, FileSpreadsheet, Camera, ExternalLink, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

const isMobileDevice = () => {
  const ua = navigator.userAgent || navigator.vendor || '';
  return /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(ua);
};

const todayStr = () => new Date().toISOString().split('T')[0];
const nowTime  = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

const _d    = new Date();
const _YEAR = _d.getFullYear();
const _MON  = _d.getMonth();
const monthName = (offset) => {
  const m = new Date(_YEAR, _MON + offset, 1).toLocaleString('es-ES', { month: 'long' });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

function VisitaPymeModal({ onClose, onSave, initialData, currentUsername }) {
  const isEdit   = !!initialData;
  const isMobile = isMobileDevice();
  const [form, setForm] = useState({
    fecha:              initialData?.fecha              || todayStr(),
    hora:               initialData?.hora               || nowTime(),
    persona_autorizada: initialData?.persona_autorizada || '',
    telefono_cliente:   initialData?.telefono_contacto_cliente  || '',
    correo_cliente:     initialData?.correo_electronico_cliente || '',
    comentarios:        initialData?.comentarios_visita         || '',
  });
  const [fotoFile,    setFotoFile]    = useState(null);
  const [fotoPreview, setFotoPreview] = useState(initialData?.foto_negocio_url || '');
  const [errors,      setErrors]      = useState({});
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const fileInputRef = useRef(null);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: false }));
  };

  const handleFotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setFotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!form.fecha.trim())              e.fecha              = true;
    if (!form.hora.trim())               e.hora               = true;
    if (!form.persona_autorizada.trim()) e.persona_autorizada = true;
    if (!fotoFile && !fotoPreview)       e.foto               = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const result = await onSave(form, fotoFile, initialData?.foto_negocio_url || '');
    if (result?.error) { setSaving(false); return; }
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  const ic = (f) => `input-field ${errors[f] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-emerald-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center">
              <Landmark size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">
                {isEdit ? 'Editar Visita PYME' : 'Nueva Visita PYME'}
              </h2>
              <p className="text-xs text-google-gray">
                {isEdit ? 'Modifica los datos y guarda los cambios' : 'Registra una visita a cliente empresa o autónomo'}
              </p>
            </div>
          </div>
          <button onClick={onClose} disabled={saving} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Bloqueo escritorio */}
          {!isMobile && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
              <span className="text-lg leading-none mt-0.5 flex-shrink-0">⚠️</span>
              <p className="text-sm font-medium text-amber-800">
                Por seguridad, el Registro de PYMEs solo puede completarse desde un teléfono móvil (se requiere foto en vivo del negocio).
              </p>
            </div>
          )}

          {/* Registrado por */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Registrado por</label>
            <input type="text" value={currentUsername} disabled
              className="input-field bg-gray-50 text-google-gray cursor-not-allowed" />
          </div>

          {/* Persona Autorizada */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Persona Autorizada *</label>
            <input type="text" placeholder="Nombre del representante / responsable"
              value={form.persona_autorizada} onChange={e => set('persona_autorizada', e.target.value)}
              className={ic('persona_autorizada')} />
            {errors.persona_autorizada && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Fecha y Hora */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Fecha *</label>
              <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)} className={ic('fecha')} />
              {errors.fecha && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Hora *</label>
              <input type="time" value={form.hora} onChange={e => set('hora', e.target.value)} className={ic('hora')} />
              {errors.hora && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            </div>
          </div>

          {/* Teléfono cliente */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Teléfono de contacto cliente</label>
            <input type="tel" placeholder="Ej: 612 345 678"
              value={form.telefono_cliente} onChange={e => set('telefono_cliente', e.target.value)}
              className="input-field" />
          </div>

          {/* Correo cliente */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Correo Electrónico Cliente</label>
            <input type="email" placeholder="cliente@empresa.com"
              value={form.correo_cliente} onChange={e => set('correo_cliente', e.target.value)}
              className="input-field" />
          </div>

          {/* Foto del negocio — OBLIGATORIA, solo cámara trasera */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              Foto del Negocio *
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFotoChange}
              className="hidden"
              disabled={!isMobile}
            />
            <button
              type="button"
              onClick={() => isMobile && fileInputRef.current?.click()}
              disabled={!isMobile}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed transition-colors text-sm ${
                !isMobile
                  ? 'border-amber-300 bg-amber-50 text-amber-600 cursor-not-allowed opacity-70'
                  : errors.foto
                    ? 'border-red-400 bg-red-50 text-red-600 hover:border-red-500 hover:bg-red-100'
                    : fotoPreview
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700 hover:border-emerald-500'
                      : 'border-google-border text-google-gray hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700'
              }`}>
              <Camera size={18} />
              <span>
                {!isMobile
                  ? 'Solo disponible desde el móvil'
                  : fotoFile
                    ? fotoFile.name
                    : fotoPreview && isEdit
                      ? 'Cambiar foto del negocio'
                      : 'Hacer Foto al Negocio (Obligatorio)'}
              </span>
            </button>
            {errors.foto && !fotoPreview && (
              <p className="text-red-500 text-xs mt-1">Debes hacer una foto del negocio para continuar</p>
            )}
            {fotoPreview && (
              <div className="mt-2 rounded-lg overflow-hidden border border-emerald-200">
                <img src={fotoPreview} alt="Foto del negocio" className="w-full h-36 object-cover" />
              </div>
            )}
          </div>

          {/* Comentarios */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Comentarios de la visita</label>
            <textarea rows={3} placeholder="Observaciones, acuerdos, próximos pasos..."
              value={form.comentarios} onChange={e => set('comentarios', e.target.value)}
              className="input-field resize-none" />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving || saved || !isMobile}
              className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''} ${!isMobile ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {saved
                ? <><CheckCircle size={15} /><span>Guardado</span></>
                : saving
                  ? <><Loader2 size={15} className="animate-spin" /><span>Guardando...</span></>
                  : <span>{isEdit ? 'Guardar Cambios' : 'Registrar Visita'}</span>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const FilterPill = ({ label, active, onClick }) => (
  <button onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap ${
      active
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-google-bg text-google-gray border-google-border hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200'
    }`}>
    {label}
  </button>
);

export default function RegistroVisitasPymes() {
  const { visitasPymes, addVisitaPyme, updateVisitaPyme, deleteVisitaPyme } = useData();
  const { currentUser } = useAuth();

  const isAdmin      = currentUser?.role === 'admin';
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [showModal,    setShowModal]    = useState(false);
  const [editVisita,   setEditVisita]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search,       setSearch]       = useState('');
  const [timeFilter,   setTimeFilter]   = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');

  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef(null);

  useEffect(() => { setCurrentPage(1); }, [search, timeFilter, fechaDesde, fechaHasta]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  };

  const now             = new Date();
  const todayISO        = now.toISOString().split('T')[0];
  const monthPrefix     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const prevMonthDate   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const mesNombre       = now.toLocaleString('es-ES', { month: 'long' }).replace(/^\w/, c => c.toUpperCase());

  const pymesBase    = isPrivileged
    ? visitasPymes
    : visitasPymes.filter(v => v.registrado_por === currentUser?.username);

  const visitasHoy   = pymesBase.filter(v => v.fecha === todayISO).length;
  const visitasMes   = pymesBase.filter(v => v.fecha.startsWith(monthPrefix)).length;
  const totalVisitas = pymesBase.length;

  const filtered = visitasPymes
    .filter(v => {
      const q = search.toLowerCase();
      const matchSearch = !search
        || v.persona_autorizada?.toLowerCase().includes(q)
        || v.registrado_por?.toLowerCase().includes(q)
        || v.telefono_contacto_cliente?.toLowerCase().includes(q)
        || v.correo_electronico_cliente?.toLowerCase().includes(q);
      const matchTime =
          timeFilter === 'hoy'          ? v.fecha === todayISO
        : timeFilter === 'mes_actual'   ? v.fecha.startsWith(monthPrefix)
        : timeFilter === 'mes_anterior' ? v.fecha.startsWith(prevMonthPrefix)
        : true;
      const matchFechaDesde = !fechaDesde || v.fecha >= fechaDesde;
      const matchFechaHasta = !fechaHasta || v.fecha <= fechaHasta;
      return matchSearch && matchTime && matchFechaDesde && matchFechaHasta;
    })
    .sort((a, b) => (a.fecha + a.hora < b.fecha + b.hora ? 1 : -1));

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSave = async (data, fotoFile, existingFotoUrl) => {
    if (editVisita) return await updateVisitaPyme(editVisita.id, data, fotoFile, existingFotoUrl);
    return await addVisitaPyme(data, fotoFile);
  };

  const exportToXLSX = async (data, suffix = '') => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM Grupo Avedie';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Visitas PYMES');
    sheet.columns = [
      { header: 'Fecha',              key: 'fecha',              width: 14 },
      { header: 'Hora',               key: 'hora',               width: 10 },
      { header: 'Registrado por',     key: 'registrado_por',     width: 20 },
      { header: 'Persona Autorizada', key: 'persona_autorizada', width: 28 },
      { header: 'Correo Persona',     key: 'correo',                      width: 28 },
      { header: 'Tel. Cliente',       key: 'telefono_contacto_cliente',  width: 18, style: { numFmt: '@' } },
      { header: 'Correo Cliente',     key: 'correo_electronico_cliente', width: 28 },
      { header: 'Foto (URL)',         key: 'foto_negocio_url',           width: 40 },
      { header: 'Comentarios',        key: 'comentarios_visita',         width: 40 },
    ];

    const hBorder = { style: 'thin', color: { argb: 'FFBDBDBD' } };
    sheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: 'FF1B5E20' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5E9' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { top: hBorder, left: hBorder, bottom: hBorder, right: hBorder };
    });
    sheet.getRow(1).height = 22;

    const dBorder = { style: 'thin', color: { argb: 'FFE0E0E0' } };
    data.forEach((v) => {
      const row = sheet.addRow({
        fecha:              v.fecha              || '',
        hora:               v.hora               || '',
        registrado_por:     v.registrado_por     || '',
        persona_autorizada: v.persona_autorizada || '',
        correo:                      v.correo                      || '',
        telefono_contacto_cliente:  String(v.telefono_contacto_cliente  || ''),
        correo_electronico_cliente: v.correo_electronico_cliente || '',
        foto_negocio_url:           v.foto_negocio_url           || '',
        comentarios_visita:         v.comentarios_visita         || '',
      });
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border    = { top: dBorder, left: dBorder, bottom: dBorder, right: dBorder };
        cell.alignment = { vertical: 'middle' };
        if (colNum === 6) {
          cell.numFmt = '@';
          if (typeof cell.value !== 'string') cell.value = String(cell.value ?? '');
        }
      });
    });

    const d   = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}`;
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Visitas_PYMES${suffix ? '_' + suffix : ''}_${datePart}.xlsx`
    );
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <Landmark size={22} className="text-emerald-600" />
            Registro de Visitas PYMES
          </h1>
          <p className="text-sm text-google-gray mt-1">Control de visitas a clientes empresa y autónomos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportToXLSX(visitasPymes, 'Completo')}
            className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={15} /><span>Exportar Todo</span>
          </button>
          <button onClick={() => exportToXLSX(filtered, 'Vista')}
            className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={15} /><span>Exportar Vista Actual</span>
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /><span>Nueva Visita PYME</span>
          </button>
        </div>
      </div>

      {/* Counter cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <CalendarDays size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{visitasHoy}</p>
            <p className="text-sm text-google-gray">Visitas Hoy</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <Users size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{visitasMes}</p>
            <p className="text-sm text-google-gray">Visitas {mesNombre}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-500 flex items-center justify-center flex-shrink-0">
            <Landmark size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{totalVisitas}</p>
            <p className="text-sm text-google-gray">Total Visitas PYMES</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card px-5 py-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por persona, comercial o teléfono..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-field pl-9 h-9 w-full" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterPill label="Todo"                           active={timeFilter === ''}           onClick={() => setTimeFilter('')} />
          <FilterPill label="Hoy"                            active={timeFilter === 'hoy'}        onClick={() => { setTimeFilter('hoy'); setFechaDesde(''); setFechaHasta(''); }} />
          <FilterPill label={`Este Mes (${monthName(0)})`}   active={timeFilter === 'mes_actual'}   onClick={() => { setTimeFilter('mes_actual'); setFechaDesde(''); setFechaHasta(''); }} />
          <FilterPill label={`Mes Anterior (${monthName(-1)})`} active={timeFilter === 'mes_anterior'} onClick={() => { setTimeFilter('mes_anterior'); setFechaDesde(''); setFechaHasta(''); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-google-gray w-full sm:w-auto">Fecha visita:</span>
          <div className="flex items-center gap-1">
            <label className="text-xs text-google-gray whitespace-nowrap">Desde</label>
            <input type="date" value={fechaDesde}
              onChange={e => { setFechaDesde(e.target.value); setTimeFilter(''); }}
              className="input-field h-7 text-xs px-2 w-36" />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-xs text-google-gray whitespace-nowrap">Hasta</label>
            <input type="date" value={fechaHasta}
              onChange={e => { setFechaHasta(e.target.value); setTimeFilter(''); }}
              className="input-field h-7 text-xs px-2 w-36" />
          </div>
          {(fechaDesde || fechaHasta) && (
            <button onClick={() => { setFechaDesde(''); setFechaHasta(''); }}
              className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Limpiar rango de fechas">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border">
          <h2 className="text-sm font-semibold text-google-dark">Visitas PYMES Registradas</h2>
        </div>
        <div className="overflow-x-auto" ref={tableScrollRef}>
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">Hora</th>
                <th className="table-header">Registrado por</th>
                <th className="table-header">Persona Autorizada</th>
                <th className="table-header">Tel. Cliente</th>
                <th className="table-header">Correo Cliente</th>
                <th className="table-header">Foto</th>
                <th className="table-header">Comentarios</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-google-gray text-sm">
                    {visitasPymes.length === 0
                      ? 'No hay visitas PYME registradas. Pulsa "+ Nueva Visita PYME" para empezar.'
                      : 'No se encontraron resultados con los filtros aplicados'}
                  </td>
                </tr>
              ) : (
                paginated.map(v => (
                  <tr key={v.id} className="hover:bg-google-bg transition-colors">
                    <td className="table-cell tabular-nums text-xs text-google-gray">{v.fecha}</td>
                    <td className="table-cell tabular-nums text-xs text-google-gray">{v.hora}</td>
                    <td className="table-cell text-google-gray text-xs">{v.registrado_por}</td>
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">{v.persona_autorizada}</td>
                    <td className="table-cell text-google-gray">{v.telefono_contacto_cliente || '—'}</td>
                    <td className="table-cell text-google-gray text-xs">{v.correo_electronico_cliente || '—'}</td>
                    <td className="table-cell text-center">
                      {v.foto_negocio_url
                        ? <a href={v.foto_negocio_url} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-800 font-medium">
                            <ExternalLink size={13} />Ver
                          </a>
                        : <span className="text-google-gray">—</span>}
                    </td>
                    <td className="table-cell text-google-gray text-xs max-w-[200px]">
                      <span className="line-clamp-2" title={v.comentarios_visita || ''}>
                        {v.comentarios_visita || '—'}
                      </span>
                    </td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1">
                        {(isPrivileged || v.registrado_por === currentUser?.username) ? (
                          <>
                            <button onClick={() => setEditVisita(v)}
                              className="p-1 rounded hover:bg-blue-50 transition-colors" title="Editar">
                              <Pencil size={15} className="text-google-blue" />
                            </button>
                            <button onClick={() => setDeleteTarget(v)}
                              className="p-1 rounded hover:bg-red-50 transition-colors" title="Eliminar">
                              <Trash2 size={15} className="text-red-500" />
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-google-gray">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={handlePageChange} />
        <div className="px-5 py-3 border-t border-google-border bg-google-bg">
          <p className="text-xs text-google-gray">
            Mostrando <span className="font-medium text-google-dark">{paginated.length}</span> de{' '}
            <span className="font-medium text-google-dark">{filtered.length}</span> visitas
          </p>
        </div>
      </div>

      {(showModal || editVisita) && (
        <VisitaPymeModal
          onClose={() => { setShowModal(false); setEditVisita(null); }}
          onSave={handleSave}
          initialData={editVisita || null}
          currentUsername={currentUser?.username || ''}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          onConfirm={() => { deleteVisitaPyme(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
