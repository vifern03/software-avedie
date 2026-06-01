import { useState, useRef, useEffect } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Store, Plus, CalendarDays, Users, Briefcase, Search, Trash2, Pencil, CheckCircle, X, FileSpreadsheet, Camera, Loader2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import Pagination from '../components/Pagination';
import DeleteConfirmModal from '../components/DeleteConfirmModal';

const TIPOS_GESTION = [
  'Facturas',
  'App',
  'Contrato Luz/Gas',
  'Incidencia',
  'Información Tarifas',
  'Otro',
];

const PUNTOS_VENTA = ['Valladolid', 'Palencia'];

const _d    = new Date();
const _YEAR = _d.getFullYear();
const _MON  = _d.getMonth();
const monthName = (offset) => {
  const m = new Date(_YEAR, _MON + offset, 1).toLocaleString('es-ES', { month: 'long' });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

const todayStr = () => new Date().toISOString().split('T')[0];
const nowTime  = () => {
  const n = new Date();
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`;
};

function VisitaModal({ onClose, onSave, initialData }) {
  const isEdit = !!initialData;
  const [form, setForm] = useState({
    fecha:       initialData?.fecha       || todayStr(),
    hora:        initialData?.hora        || nowTime(),
    dni:         initialData?.dni         || '',
    nombre:      initialData?.nombre      || '',
    punto_venta: initialData?.punto_venta || '',
    telefono:    initialData?.telefono    || '',
    mail:        initialData?.mail        || '',
    tipo:        initialData?.tipo        || '',
    tipo_otro:   initialData?.tipo_otro   || '',
  });
  const [errors,     setErrors]     = useState({});
  const [saved,      setSaved]      = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [dniFile,    setDniFile]    = useState(null);
  const [dniPreview, setDniPreview] = useState(initialData?.dni_cif_escaneado_url || '');
  const dniInputRef = useRef(null);

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    setErrors(e => ({ ...e, [field]: false }));
  };

  const handleDniChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDniFile(file);
    if (file.type === 'application/pdf') {
      setDniPreview('');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setDniPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const e = {};
    if (!form.fecha.trim())       e.fecha       = true;
    if (!form.hora.trim())        e.hora        = true;
    if (!form.dni.trim())         e.dni         = true;
    if (!form.nombre.trim())      e.nombre      = true;
    if (!form.punto_venta)        e.punto_venta = true;
    if (!form.tipo)               e.tipo        = true;
    if (form.tipo === 'Otro' && !form.tipo_otro.trim()) e.tipo_otro = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    const result = await onSave(form, dniFile, initialData?.dni_cif_escaneado_url || '');
    if (result?.error) { setSaving(false); return; }
    setSaved(true);
    setTimeout(() => onClose(), 800);
  };

  const ic = (f) => `input-field ${errors[f] ? '!border-red-400 focus:!ring-red-300' : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border bg-blue-50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-google-blue flex items-center justify-center">
              <Store size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">
                {isEdit ? 'Editar Visita' : 'Nueva Visita'}
              </h2>
              <p className="text-xs text-google-gray">
                {isEdit ? 'Modifica los datos y guarda los cambios' : 'Registra una visita presencial en tienda'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 overflow-y-auto">

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

          {/* DNI/CIF */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">DNI / CIF *</label>
            <input type="text" placeholder="Ej: 12345678Z" value={form.dni}
              onChange={e => set('dni', e.target.value)} className={ic('dni')} />
            {errors.dni && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Nombre */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Nombre y Apellidos *</label>
            <input type="text" placeholder="Ej: Juan García López" value={form.nombre}
              onChange={e => set('nombre', e.target.value)} className={ic('nombre')} />
            {errors.nombre && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Ubicación */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Ubicación (Punto de Venta) *</label>
            <select value={form.punto_venta} onChange={e => set('punto_venta', e.target.value)} className={ic('punto_venta')}>
              <option value="">Seleccionar ubicación...</option>
              {PUNTOS_VENTA.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            {errors.punto_venta && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Teléfono</label>
            <input type="tel" placeholder="Ej: 612 345 678" value={form.telefono}
              onChange={e => set('telefono', e.target.value)} className="input-field" />
          </div>

          {/* Mail */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Mail</label>
            <input type="email" placeholder="Ej: cliente@email.com" value={form.mail}
              onChange={e => set('mail', e.target.value)} className="input-field" />
          </div>

          {/* Tipo de Gestión */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">Tipo de Gestión *</label>
            <select value={form.tipo} onChange={e => set('tipo', e.target.value)} className={ic('tipo')}>
              <option value="">Seleccionar...</option>
              {TIPOS_GESTION.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {errors.tipo && <p className="text-red-500 text-xs mt-1">Obligatorio</p>}
            {form.tipo === 'Otro' && (
              <input type="text" placeholder="Detalla el motivo..." value={form.tipo_otro}
                onChange={e => set('tipo_otro', e.target.value)}
                className={`input-field mt-2 ${errors.tipo_otro ? '!border-red-400' : ''}`} />
            )}
            {errors.tipo_otro && <p className="text-red-500 text-xs mt-1">Por favor, detalla el motivo</p>}
          </div>

          {/* DNI/CIF Escaneado — OPCIONAL, libertad total (foto, imagen o PDF) */}
          <div>
            <label className="block text-xs font-medium text-google-gray mb-1.5">
              DNI/CIF Escaneado <span className="font-normal">(opcional — foto, imagen o PDF)</span>
            </label>
            <input
              ref={dniInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleDniChange}
              className="hidden"
            />
            <button type="button" onClick={() => dniInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-dashed border-google-border hover:border-google-blue hover:bg-blue-50 transition-colors text-sm text-google-gray hover:text-google-blue">
              <Camera size={18} />
              <span>
                {dniFile
                  ? dniFile.name
                  : dniPreview && isEdit
                    ? 'Cambiar adjunto'
                    : 'Adjuntar foto, imagen o PDF'}
              </span>
            </button>
            {dniPreview && (
              <div className="mt-2 rounded-lg overflow-hidden border border-google-border">
                <img src={dniPreview} alt="DNI/CIF escaneado" className="w-full h-28 object-cover" />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-google-border">
            <button type="button" onClick={onClose} disabled={saving} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving || saved}
              className={`btn-primary flex items-center gap-2 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}>
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
        ? 'bg-google-blue text-white border-google-blue'
        : 'bg-google-bg text-google-gray border-google-border hover:bg-blue-50 hover:text-google-blue hover:border-blue-200'
    }`}>
    {label}
  </button>
);

export default function RegistroVisitas() {
  const { visitas, addVisita, updateVisita, deleteVisita } = useData();
  const { currentUser } = useAuth();

  const isAdmin      = currentUser?.role === 'admin';
  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager';

  const [showModal,    setShowModal]    = useState(false);
  const [editVisita,   setEditVisita]   = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [search,       setSearch]       = useState('');
  const [timeFilter,   setTimeFilter]   = useState('');
  const [filterTipo,   setFilterTipo]   = useState('');
  const [fechaDesde,   setFechaDesde]   = useState('');
  const [fechaHasta,   setFechaHasta]   = useState('');

  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef(null);

  useEffect(() => { setCurrentPage(1); }, [search, timeFilter, filterTipo, fechaDesde, fechaHasta]);

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

  const visitasBase = isPrivileged
    ? visitas
    : visitas.filter(v => v.registrado_por === currentUser?.username);

  const visitasHoy = visitasBase.filter(v => v.fecha === todayISO).length;
  const visitasMes = visitasBase.filter(v => v.fecha.startsWith(monthPrefix)).length;
  const tipoMasRepetido = (() => {
    if (!visitasBase.length) return '—';
    const counts = {};
    visitasBase.forEach(v => { counts[v.tipo] = (counts[v.tipo] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
  })();

  const filtered = visitas
    .filter(v => {
      const q           = search.toLowerCase();
      const matchSearch = !search || v.dni.toLowerCase().includes(q) || v.nombre.toLowerCase().includes(q);
      const matchTime   = timeFilter === 'hoy'          ? v.fecha === todayISO
                        : timeFilter === 'mes_actual'   ? v.fecha.startsWith(monthPrefix)
                        : timeFilter === 'mes_anterior' ? v.fecha.startsWith(prevMonthPrefix)
                        : true;
      const matchTipo       = !filterTipo || v.tipo === filterTipo;
      const matchFechaDesde = !fechaDesde || v.fecha >= fechaDesde;
      const matchFechaHasta = !fechaHasta || v.fecha <= fechaHasta;
      return matchSearch && matchTime && matchTipo && matchFechaDesde && matchFechaHasta;
    })
    .sort((a, b) => {
      const da = a.fecha + a.hora;
      const db = b.fecha + b.hora;
      return da < db ? 1 : -1;
    });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const handleSave = async (data, dniFile, existingDniUrl) => {
    if (editVisita) return await updateVisita(editVisita.id, data, dniFile, existingDniUrl);
    return await addVisita(data, dniFile);
  };

  const tipoDisplay = (v) => v.tipo === 'Otro' ? (v.tipo_otro || 'Otro') : v.tipo;

  const exportVisitasToXLSX = async (data, suffix = '') => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM Grupo Avedie';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Visitas');
    sheet.columns = [
      { header: 'Fecha',           key: 'fecha',          width: 14 },
      { header: 'Hora',            key: 'hora',           width: 10 },
      { header: 'DNI / CIF',       key: 'dni',            width: 16, style: { numFmt: '@' } },
      { header: 'Nombre',          key: 'nombre',         width: 28 },
      { header: 'Teléfono',        key: 'telefono',       width: 16, style: { numFmt: '@' } },
      { header: 'Mail',            key: 'mail',           width: 28 },
      { header: 'Tipo de Gestión', key: 'tipo_display',   width: 22 },
      { header: 'Punto de Venta',  key: 'punto_venta',    width: 18 },
      { header: 'Registrado por',  key: 'registrado_por', width: 20 },
    ];

    const hBorder = { style: 'thin', color: { argb: 'FFBDBDBD' } };
    sheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: 'FF1A237E' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { top: hBorder, left: hBorder, bottom: hBorder, right: hBorder };
    });
    sheet.getRow(1).height = 22;

    const dBorder  = { style: 'thin', color: { argb: 'FFE0E0E0' } };
    const textCols = new Set([3, 5]);

    data.forEach((v) => {
      const row = sheet.addRow({
        fecha:          v.fecha           || '',
        hora:           v.hora            || '',
        dni:            String(v.dni      || ''),
        nombre:         v.nombre          || '',
        telefono:       String(v.telefono || ''),
        mail:           v.mail            || '',
        tipo_display:   v.tipo === 'Otro' ? (v.tipo_otro || 'Otro') : (v.tipo || ''),
        punto_venta:    v.punto_venta     || '',
        registrado_por: v.registrado_por  || '',
      });
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        cell.border    = { top: dBorder, left: dBorder, bottom: dBorder, right: dBorder };
        cell.alignment = { vertical: 'middle' };
        if (textCols.has(colNum)) {
          cell.numFmt = '@';
          if (typeof cell.value !== 'string') cell.value = String(cell.value ?? '');
        }
      });
    });

    const d   = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const datePart = `${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}`;
    const filename = `Visitas_Tienda${suffix ? '_' + suffix : ''}_${datePart}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <Store size={22} className="text-google-blue" />
            Registro de Visitas Tienda
          </h1>
          <p className="text-sm text-google-gray mt-1">Control de visitas y atención presencial en tienda</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => exportVisitasToXLSX(visitas, 'Completo')}
            className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={15} />
            <span>Exportar Todo</span>
          </button>
          <button onClick={() => exportVisitasToXLSX(filtered, 'Vista')}
            className="btn-secondary flex items-center gap-2">
            <FileSpreadsheet size={15} />
            <span>Exportar Vista Actual</span>
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>Nueva Visita</span>
          </button>
        </div>
      </div>

      {/* Counter cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-google-blue flex items-center justify-center flex-shrink-0">
            <CalendarDays size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{visitasHoy}</p>
            <p className="text-sm text-google-gray">Visitas Hoy</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500 flex items-center justify-center flex-shrink-0">
            <Users size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{visitasMes}</p>
            <p className="text-sm text-google-gray">Visitas {mesNombre}</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
            <Briefcase size={22} className="text-white" />
          </div>
          <div>
            <p className="text-base font-bold text-google-dark truncate max-w-[150px]" title={tipoMasRepetido}>
              {tipoMasRepetido}
            </p>
            <p className="text-sm text-google-gray">Gestión más frecuente</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card px-5 py-4 space-y-3">
        {/* Fila 1: búsqueda + select de tipo */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por DNI o nombre..." value={search}
              onChange={e => setSearch(e.target.value)} className="input-field pl-9 h-9 w-full" />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                <X size={14} />
              </button>
            )}
          </div>
          <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
            className="input-field h-9 text-xs min-w-[160px] flex-shrink-0">
            <option value="">Todos los tipos</option>
            {TIPOS_GESTION.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        {/* Fila 2: pills de rango rápido */}
        <div className="flex flex-wrap gap-2">
          <FilterPill label="Todo"
            active={timeFilter === ''}
            onClick={() => setTimeFilter('')} />
          <FilterPill label="Hoy"
            active={timeFilter === 'hoy'}
            onClick={() => { setTimeFilter('hoy'); setFechaDesde(''); setFechaHasta(''); }} />
          <FilterPill label={`Este Mes (${monthName(0)})`}
            active={timeFilter === 'mes_actual'}
            onClick={() => { setTimeFilter('mes_actual'); setFechaDesde(''); setFechaHasta(''); }} />
          <FilterPill label={`Mes Anterior (${monthName(-1)})`}
            active={timeFilter === 'mes_anterior'}
            onClick={() => { setTimeFilter('mes_anterior'); setFechaDesde(''); setFechaHasta(''); }} />
        </div>
        {/* Fila 3: rango de fechas personalizado */}
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
          <h2 className="text-sm font-semibold text-google-dark">Visitas Registradas</h2>
        </div>
        <div className="overflow-x-auto" ref={tableScrollRef}>
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr>
                <th className="table-header">Fecha</th>
                <th className="table-header">Hora</th>
                <th className="table-header">DNI / CIF</th>
                <th className="table-header">Nombre y Apellidos</th>
                <th className="table-header">Teléfono</th>
                <th className="table-header">Mail</th>
                <th className="table-header">Tipo de Gestión</th>
                <th className="table-header">Punto de Venta</th>
                <th className="table-header">Registrado por</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-center py-10 text-google-gray text-sm">
                    {visitas.length === 0
                      ? 'No hay visitas registradas. Pulsa "+ Nueva Visita" para empezar.'
                      : 'No se encontraron resultados con los filtros aplicados'}
                  </td>
                </tr>
              ) : (
                paginated.map(v => (
                  <tr key={v.id} className="hover:bg-google-bg transition-colors">
                    <td className="table-cell tabular-nums text-xs text-google-gray">{v.fecha}</td>
                    <td className="table-cell tabular-nums text-xs text-google-gray">{v.hora}</td>
                    <td className="table-cell font-mono text-xs text-google-gray">{v.dni}</td>
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">{v.nombre}</td>
                    <td className="table-cell text-google-gray">{v.telefono || '—'}</td>
                    <td className="table-cell text-google-gray text-xs">{v.mail || '—'}</td>
                    <td className="table-cell">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-google-blue whitespace-nowrap">
                        {tipoDisplay(v)}
                      </span>
                    </td>
                    <td className="table-cell">
                      {v.punto_venta
                        ? <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 whitespace-nowrap">{v.punto_venta}</span>
                        : <span className="text-google-gray">—</span>}
                    </td>
                    <td className="table-cell text-google-gray text-xs">{v.registrado_por}</td>
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1">
                        {isAdmin ? (
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
        <VisitaModal
          onClose={() => { setShowModal(false); setEditVisita(null); }}
          onSave={handleSave}
          initialData={editVisita || null}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          onConfirm={() => { deleteVisita(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
