import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, FileCheck, Clock, AlertCircle, Trophy, Search, ChevronUp, ChevronDown, Trash2, Pencil, PenTool, X, Eye, FileText, BarChart2, CheckCircle } from 'lucide-react';
import NewClientModal from '../components/NewClientModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import Pagination from '../components/Pagination';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import DateInput from '../components/DateInput';

const MEDAL_COLORS = ['bg-yellow-400', 'bg-gray-300', 'bg-amber-600'];

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const now   = new Date();
const YEAR  = now.getFullYear();
const MONTH = now.getMonth();

function getTimeFilteredList(list, filter) {
  if (!filter) return list;
  return list.filter((c) => {
    const d = new Date(c.fecha_tramitacion || '');
    if (isNaN(d)) return false;
    if (filter === 'mes_actual')   return d.getMonth() === MONTH && d.getFullYear() === YEAR;
    if (filter === 'mes_anterior') {
      const pm = MONTH === 0 ? 11 : MONTH - 1;
      const py = MONTH === 0 ? YEAR - 1 : YEAR;
      return d.getMonth() === pm && d.getFullYear() === py;
    }
    return true;
  });
}

const monthName = (offset) => {
  const m = new Date(YEAR, MONTH + offset, 1).toLocaleString('es-ES', { month: 'long' });
  return m.charAt(0).toUpperCase() + m.slice(1);
};

const FilterPill = ({ label, active, onClick }) => (
  <button onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap ${
      active ? 'bg-google-blue text-white border-google-blue'
      : 'bg-google-bg text-google-gray border-google-border hover:bg-blue-50 hover:text-google-blue hover:border-blue-200'
    }`}>
    {label}
  </button>
);

function StatusBadge({ estado }) {
  const s = {
    'Pendiente Firma': 'bg-red-100 text-red-800',
    'Tramitado':       'bg-orange-100 text-orange-800',
    'Formalizado':     'bg-green-100 text-green-800',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${s[estado] || 'bg-gray-100 text-gray-700'}`}>
      {estado || '—'}
    </span>
  );
}

function openBase64File(base64) {
  const mime = base64.split(';')[0].replace('data:', '');
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  const blob = new Blob([ab], { type: mime });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function FileCell({ value, clientName }) {
  if (!value) return <span className="text-google-gray">—</span>;
  if (value.startsWith('data:')) {
    return (
      <button onClick={() => openBase64File(value)}
        className="p-1 rounded hover:bg-slate-100 transition-colors" title="Ver archivo">
        <Eye size={15} className="text-slate-500" />
      </button>
    );
  }
  return (
    <a href={value} target="_blank" rel="noopener noreferrer"
      className="p-1 rounded hover:bg-slate-100 transition-colors" title="Ver archivo">
      <Eye size={15} className="text-slate-500" />
    </a>
  );
}

function DocIcon({ value, label, clientName }) {
  if (!value) return null;
  if (value.startsWith('data:')) {
    return (
      <button onClick={() => openBase64File(value)}
        className="p-1 rounded hover:bg-indigo-50 transition-colors" title={label}>
        <Eye size={15} className="text-indigo-400 hover:text-indigo-600" />
      </button>
    );
  }
  return (
    <a href={value} target="_blank" rel="noopener noreferrer"
      className="p-1 rounded hover:bg-indigo-50 transition-colors" title={label}>
      <Eye size={15} className="text-indigo-400 hover:text-indigo-600" />
    </a>
  );
}

function ConsumoModal({ cliente, onClose, onSave }) {
  const [valor,  setValor]  = useState('');
  const [error,  setError]  = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleGuardar = async () => {
    const num = Number(valor);
    if (!valor.trim() || isNaN(num) || num <= 0) { setError(true); return; }
    setSaving(true);
    await onSave(cliente.id, num);
    setSaved(true);
    setTimeout(() => onClose(), 700);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleGuardar();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 modal-backdrop">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-xs mx-4 overflow-hidden">

        {/* Cabecera */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-google-border bg-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-google-blue flex items-center justify-center flex-shrink-0">
              <BarChart2 size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-google-dark">Consumo Anual Estimado</h2>
              <p className="text-xs text-google-gray mt-0.5 leading-snug max-w-[200px]">
                Por favor, introduzca el consumo estimado para el cálculo de comisiones.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors flex-shrink-0 ml-2">
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="px-5 py-5 space-y-3">
          <p className="text-xs text-google-gray font-medium">
            Cliente: <span className="text-google-dark font-semibold">{cliente.nombre}</span>
          </p>
          <div>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="number"
                min="1"
                step="1"
                placeholder="Ej: 45000"
                value={valor}
                onChange={e => { setValor(e.target.value); setError(false); }}
                onKeyDown={handleKey}
                className={`input-field flex-1 text-right tabular-nums text-base font-semibold ${error ? '!border-red-400 focus:!ring-red-300' : ''}`}
              />
              <span className="text-sm font-semibold text-google-gray whitespace-nowrap">kWh</span>
            </div>
            {error && (
              <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                <AlertCircle size={12} /> Introduce un número mayor que cero
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-google-border bg-google-bg flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-secondary text-sm px-4 py-1.5">
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={saving || saved}
            className={`btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5 ${saved ? 'bg-green-500 hover:bg-green-500' : ''}`}
          >
            {saved
              ? <><CheckCircle size={14} /><span>Guardado</span></>
              : saving
                ? <span>Guardando...</span>
                : <span>Guardar Consumo</span>}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AltaClientes({ tipo }) {
  const isB2B = tipo === 'B2B';
  const { clientes: allClientes, clientesB2C, clientesB2B, addCliente, updateCliente, setConsumoAnualEst, firmarContrato, formalizarContrato, deleteCliente, rankingComerciales } = useData();

  const allCups = useMemo(
    () => new Set(allClientes.map(c => (c.cups || '').toUpperCase().trim()).filter(Boolean)),
    [allClientes]
  );
  const { currentUser, users } = useAuth();
  const clientes = isB2B ? clientesB2B : clientesB2C;

  const [showModal,        setShowModal]        = useState(false);
  const [showCurModal,     setShowCurModal]     = useState(false);
  const [editClient,       setEditClient]        = useState(null);
  const [deleteTarget,     setDeleteTarget]      = useState(null);
  const [firmaTarget,      setFirmaTarget]       = useState(null);
  const [formalizarTarget, setFormalizarTarget]  = useState(null);
  const [search,           setSearch]            = useState('');
  const [searchNombre,     setSearchNombre]      = useState('');
  const [filterComercial,  setFilterComercial]   = useState('');
  const [filterTipo,       setFilterTipo]        = useState('');
  const [timeFilter,       setTimeFilter]        = useState('');
  const [dateFilter,       setDateFilter]        = useState('');
  const [sortField,        setSortField]         = useState('fecha_tramitacion');
  const [sortDir,          setSortDir]           = useState('desc');

  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef(null);

  const comercialesDisponibles = useMemo(() => {
    const fromUsers = users.map(u => u.username);
    const fromData  = clientes.map(c => c.comercial).filter(Boolean);
    return [...new Set([...fromUsers, ...fromData])].sort();
  }, [users, clientes]);

  useEffect(() => { setCurrentPage(1); }, [search, searchNombre, filterComercial, dateFilter, timeFilter, filterTipo]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  };

  // 30 días antirrobo
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);

  const isPrivileged = currentUser?.role === 'admin' || currentUser?.role === 'manager';
  const isAdmin      = currentUser?.role === 'admin';
  const userEquipo   = currentUser?.equipo || 'Ambos';
  const isTeamMember = !isPrivileged && (userEquipo === 'Palencia' || userEquipo === 'Valladolid');

  // Contadores: siempre individuales
  const baseClientes = clientes.filter((c) => {
    const d = new Date(c.fecha_tramitacion || '');
    if (isNaN(d) || d < cutoff) return false;
    if (!isPrivileged && c.comercial !== currentUser?.username) return false;
    return true;
  });

  const totalPendienteFirma = baseClientes.filter((c) => c.estado === 'Pendiente Firma').length;
  const totalTramitados     = baseClientes.filter((c) => c.estado === 'Tramitado').length;
  const totalFormalizados   = baseClientes.filter((c) => c.estado === 'Formalizado').length;

  // Tabla: miembros de equipo ven todos los contratos del equipo (DataContext ya los acota por sede)
  const baseTabla = isTeamMember
    ? clientes.filter((c) => {
        const d = new Date(c.fecha_tramitacion || '');
        return !isNaN(d) && d >= cutoff;
      })
    : baseClientes;

  const handleModalSave = async (data) => {
    if (editClient) {
      updateCliente(editClient.id, data);
      return { error: null };
    }
    const saveTipo = showCurModal ? (isB2B ? 'CUR_B2B' : 'CUR') : tipo;
    return await addCliente(data, saveTipo);
  };

  const closeModal = () => { setShowModal(false); setShowCurModal(false); setEditClient(null); };
  const modalTipoActivo = editClient ? editClient.tipo : showCurModal ? (isB2B ? 'CUR_B2B' : 'CUR') : tipo;

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp size={12} className="opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-google-blue" />
      : <ChevronDown size={12} className="text-google-blue" />;
  };

  const filtered = getTimeFilteredList(baseTabla, timeFilter)
    .filter((c) => {
      const q  = search.toLowerCase();
      const qn = searchNombre.toLowerCase();
      const matchSearch    = !search          || (c.cups || '').toLowerCase().includes(q) || (c.cif_dni || '').toLowerCase().includes(q);
      const matchNombre    = !searchNombre    || (c.nombre || '').toLowerCase().includes(qn);
      const matchComercial = !filterComercial || c.comercial === filterComercial;
      const matchDate      = !dateFilter      || c.fecha_tramitacion === dateFilter;
      const matchTipo      = !filterTipo      || c.tipo === filterTipo;
      return matchSearch && matchNombre && matchComercial && matchDate && matchTipo;
    })
    .sort((a, b) => {
      let va = a[sortField] ?? '';
      let vb = b[sortField] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const TOTAL_COLS = isB2B ? 22 : 21;
  const [consumoTarget, setConsumoTarget] = useState(null);

  const subtipo = (c) => c.subtipo === 'Otro' ? (c.subtipo_otro || 'Otro') : (c.subtipo || '—');

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark">
            Alta {isB2B ? 'B2B · Empresas' : 'B2C · Particulares'}
          </h1>
          <p className="text-sm text-google-gray mt-1">Gestión de contratos</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCurModal(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-red-300 bg-red-50 text-red-700 text-sm font-medium hover:bg-red-100 transition-colors">
            <Plus size={16} />
            <span>Alta CUR</span>
          </button>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
            <Plus size={16} />
            <span>{isB2B ? 'Nueva Empresa' : 'Nuevo Cliente'}</span>
          </button>
        </div>
      </div>

      {/* Counter cards — 3 estados */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-500 flex items-center justify-center flex-shrink-0">
            <AlertCircle size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{totalPendienteFirma}</p>
            <p className="text-sm text-google-gray">Pendiente Firma</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
            <Clock size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{totalTramitados}</p>
            <p className="text-sm text-google-gray">Tramitados</p>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
            <FileCheck size={22} className="text-white" />
          </div>
          <div>
            <p className="text-3xl font-bold text-google-dark">{totalFormalizados}</p>
            <p className="text-sm text-google-gray">Formalizados</p>
          </div>
        </div>
      </div>

      {/* Ranking Ventas — solo administrador */}
      {isAdmin && (
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-google-border flex items-center gap-2">
            <Trophy size={16} className="text-yellow-500" />
            <h2 className="text-sm font-semibold text-google-dark">Ranking Ventas {monthName(0)}</h2>
          </div>
          {rankingComerciales.length === 0 ? (
            <p className="text-center text-google-gray py-6 text-sm">Sin contratos registrados</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-google-border">
              {rankingComerciales.map((c, i) => (
                <div key={c.id} className="px-4 py-4 text-center hover:bg-google-bg transition-colors">
                  <div className={`w-9 h-9 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold text-white ${i < 3 ? MEDAL_COLORS[i] : 'bg-google-gray'}`}>
                    {c.avatar}
                  </div>
                  <p className="text-xs font-medium text-google-dark truncate" title={c.nombre}>{c.nombre.split(' ')[0]}</p>
                  <p className="text-lg font-bold text-google-dark mt-1">{c.cerrados}</p>
                  <p className="text-xs text-yellow-600">{c.pendientes} pend.</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters bar */}
      <div className="card px-5 py-4 space-y-3">
        {/* Fila 1: buscador CUPS / DNI-CIF */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por CUPS o DNI/CIF..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 h-9" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Fila 2: buscador por nombre + filtro por comercial */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por nombre..." value={searchNombre}
              onChange={(e) => setSearchNombre(e.target.value)} className="input-field pl-9 h-9" />
            {searchNombre && (
              <button onClick={() => setSearchNombre('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <select value={filterComercial} onChange={(e) => setFilterComercial(e.target.value)}
              className="input-field h-9 min-w-[180px] text-sm">
              <option value="">Filtrar por comercial...</option>
              {comercialesDisponibles.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {filterComercial && (
              <button onClick={() => setFilterComercial('')}
                className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50 transition-colors" title="Quitar filtro">
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Fila 3: filtros de tramitación */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-google-gray mr-1">Tramitación:</span>
          <FilterPill label="Todo"                              active={timeFilter === ''}             onClick={() => setTimeFilter('')}            />
          <FilterPill label={`Este Mes (${monthName(0)})`}      active={timeFilter === 'mes_actual'}   onClick={() => setTimeFilter('mes_actual')}  />
          <FilterPill label={`Mes Anterior (${monthName(-1)})`} active={timeFilter === 'mes_anterior'} onClick={() => setTimeFilter('mes_anterior')} />
          <div className="flex items-center gap-1 ml-2">
            <DateInput value={dateFilter} onChange={(iso) => setDateFilter(iso)}
              className="input-field h-7 text-xs px-2 w-36" title="Fecha exacta de tramitación" />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50 transition-colors">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 ml-4 border-l border-google-border pl-4">
            <span className="text-xs text-google-gray mr-1">Tipo:</span>
            <FilterPill label="Todos" active={filterTipo === ''} onClick={() => setFilterTipo('')} />
            <FilterPill label={isB2B ? 'B2B' : 'B2C'} active={filterTipo === (isB2B ? 'B2B' : 'B2C')} onClick={() => setFilterTipo(isB2B ? 'B2B' : 'B2C')} />
            <FilterPill label="CUR" active={filterTipo === (isB2B ? 'CUR_B2B' : 'CUR')} onClick={() => setFilterTipo(isB2B ? 'CUR_B2B' : 'CUR')} />
          </div>
        </div>
      </div>

      {/* Table — orden exacto de 20 columnas */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border">
          <h2 className="text-sm font-semibold text-google-dark">
            {isB2B ? 'Empresas Registradas' : 'Clientes Particulares'}
          </h2>
        </div>
        <div className="overflow-x-auto" ref={tableScrollRef}>
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('nombre')}><div className="flex items-center gap-1">Cliente <SortIcon field="nombre" /></div></th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('tipo')}><div className="flex items-center gap-1">Tipo <SortIcon field="tipo" /></div></th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('linea_negocio')}><div className="flex items-center gap-1">Línea de Negocio <SortIcon field="linea_negocio" /></div></th>
                <th className="table-header">Subtipo</th>
                <th className="table-header">{isB2B ? 'CIF' : 'DNI'}</th>
                <th className="table-header">Teléfono</th>
                <th className="table-header">Mail</th>
                <th className="table-header">Cuenta Bancaria</th>
                <th className="table-header">CUPS</th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('tarifa')}><div className="flex items-center gap-1">Tarifa <SortIcon field="tarifa" /></div></th>
                <th className="table-header">Id Producto</th>
                <th className="table-header">Creado por</th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('comercial')}><div className="flex items-center gap-1">Tramitado por <SortIcon field="comercial" /></div></th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('fecha_firma')}><div className="flex items-center gap-1">F. Firma <SortIcon field="fecha_firma" /></div></th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('fecha_tramitacion')}><div className="flex items-center gap-1">F. Tramitación <SortIcon field="fecha_tramitacion" /></div></th>
                <th className="table-header cursor-pointer" onClick={() => toggleSort('fecha_formalizada')}><div className="flex items-center gap-1">F. Formalizada <SortIcon field="fecha_formalizada" /></div></th>
                <th className="table-header">Estado</th>
                <th className="table-header">{isB2B ? 'Docs' : 'DNI/CIF Esc.'}</th>
                <th className="table-header">Últ. Factura</th>
                <th className="table-header">Descripción</th>
                {isB2B && <th className="table-header">Consumo Anual Est.</th>}
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS} className="text-center py-10 text-google-gray text-sm">
                    {baseClientes.length === 0
                      ? `No hay contratos recientes. Pulsa "${isB2B ? 'Nueva Empresa' : 'Nuevo Cliente'}" para empezar.`
                      : 'No se encontraron resultados'}
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-google-bg transition-colors">
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">{c.nombre}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.tipo === 'B2B'                            ? 'bg-indigo-100 text-indigo-700'
                        : (c.tipo === 'CUR' || c.tipo === 'CUR_B2B') ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                      }`}>
                        {(c.tipo === 'CUR' || c.tipo === 'CUR_B2B') ? 'CUR' : c.tipo}
                      </span>
                    </td>
                    <td className="table-cell text-google-gray text-xs">{c.linea_negocio || '—'}</td>
                    <td className="table-cell text-google-gray text-xs max-w-[140px] truncate" title={subtipo(c)}>{subtipo(c)}</td>
                    <td className="table-cell text-google-gray font-mono text-xs">{c.cif_dni}</td>
                    <td className="table-cell text-google-gray">{c.telefono}</td>
                    <td className="table-cell text-google-gray text-xs">{c.mail || '—'}</td>
                    <td className="table-cell text-google-gray font-mono text-xs">{c.cuenta_bancaria || '—'}</td>
                    <td className="table-cell text-google-gray font-mono text-xs truncate max-w-[130px]">{c.cups}</td>
                    <td className="table-cell">
                      <span className="bg-blue-50 text-google-blue text-xs font-medium px-2 py-0.5 rounded">{c.tarifa}</span>
                    </td>
                    <td className="table-cell text-google-gray text-xs">{c.id_producto || '—'}</td>
                    <td className="table-cell text-google-gray text-xs">{c.creado_por || '—'}</td>
                    <td className="table-cell text-google-gray text-xs">{c.comercial}</td>
                    <td className="table-cell tabular-nums text-xs text-google-gray">{formatDate(c.fecha_firma)}</td>
                    <td className="table-cell tabular-nums text-xs text-google-gray">{formatDate(c.fecha_tramitacion)}</td>
                    <td className="table-cell tabular-nums text-xs">
                      {c.fecha_formalizada
                        ? <span className="text-green-700 font-medium">{formatDate(c.fecha_formalizada)}</span>
                        : <span className="text-google-gray italic">—</span>}
                    </td>
                    <td className="table-cell"><StatusBadge estado={c.estado} /></td>
                    <td className="table-cell text-center">
                      {isB2B ? (
                        <div className="flex items-center justify-center gap-0.5">
                          <DocIcon value={c.cif_autonomo_url} label="Ver CIF / Autónomo" clientName={`CIF_${c.nombre}`} />
                          <DocIcon value={c.dni_escaneado}    label="Ver DNI"            clientName={`DNI_${c.nombre}`} />
                          <DocIcon value={c.factura_b2b_url}  label="Ver Factura"        clientName={`Factura_${c.nombre}`} />
                          <DocIcon value={c.justo_titulo_url} label="Ver Justo Título"   clientName={`JustoTitulo_${c.nombre}`} />
                          {!c.cif_autonomo_url && !c.dni_escaneado && !c.factura_b2b_url && !c.justo_titulo_url && (
                            <span className="text-google-gray">—</span>
                          )}
                        </div>
                      ) : (
                        <FileCell value={c.dni_escaneado} clientName={`DNI_${c.nombre}`} />
                      )}
                    </td>
                    <td className="table-cell text-center"><FileCell value={c.ultima_factura} clientName={`Factura_${c.nombre}`} /></td>
                    <td className="table-cell text-google-gray text-xs max-w-[180px] truncate" title={c.descripcion || ''}>{c.descripcion || '—'}</td>
                    {isB2B && (
                      <td className="table-cell text-center">
                        {!isPrivileged ? (
                          <span className="text-google-gray">—</span>
                        ) : c.consumo_anual_est != null && c.consumo_anual_est !== '' ? (
                          <span className="text-xs font-medium text-google-dark tabular-nums whitespace-nowrap">
                            {Number(c.consumo_anual_est).toLocaleString('es-ES')} kWh
                          </span>
                        ) : (
                          <button
                            onClick={() => setConsumoTarget(c)}
                            className="px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors whitespace-nowrap"
                          >
                            Rellenar
                          </button>
                        )}
                      </td>
                    )}
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1">
                        {c.estado === 'Pendiente Firma' && (
                          <button onClick={() => setFirmaTarget(c)}
                            className="p-1 rounded hover:bg-blue-50 transition-colors" title="Registrar Firma">
                            <PenTool size={15} className="text-google-blue" />
                          </button>
                        )}
                        {c.estado === 'Tramitado' && (
                          <button onClick={() => setFormalizarTarget(c)}
                            className="p-1 rounded hover:bg-green-50 transition-colors" title="Formalizar contrato">
                            <FileCheck size={15} className="text-green-600" />
                          </button>
                        )}
                        <button onClick={() => setEditClient(c)}
                          className="p-1 rounded hover:bg-blue-50 transition-colors" title="Editar">
                          <Pencil size={15} className="text-google-blue" />
                        </button>
                        <button onClick={() => setDeleteTarget(c)}
                          className="p-1 rounded hover:bg-red-50 transition-colors" title="Eliminar">
                          <Trash2 size={15} className="text-red-500" />
                        </button>
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
            <span className="font-medium text-google-dark">{filtered.length}</span> registros
          </p>
        </div>
      </div>

      {/* Modales de acción */}
      {firmaTarget && (
        <ConfirmActionModal
          title="Confirmar Firma"
          message="¿Confirmar que el contrato ha sido firmado por el cliente?"
          confirmLabel="Sí, registrar firma"
          confirmClassName="bg-google-blue hover:bg-blue-700"
          onConfirm={() => { firmarContrato(firmaTarget.id); setFirmaTarget(null); }}
          onCancel={() => setFirmaTarget(null)}
        />
      )}

      {formalizarTarget && (
        <ConfirmActionModal
          title="Confirmar Formalización"
          message="¿Confirmar que el contrato ha sido formalizado y activado por la distribuidora?"
          confirmLabel="Sí, formalizar"
          confirmClassName="bg-green-600 hover:bg-green-700"
          onConfirm={() => { formalizarContrato(formalizarTarget.id); setFormalizarTarget(null); }}
          onCancel={() => setFormalizarTarget(null)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          onConfirm={() => { deleteCliente(deleteTarget.id); setDeleteTarget(null); }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {consumoTarget && (
        <ConsumoModal
          cliente={consumoTarget}
          onClose={() => setConsumoTarget(null)}
          onSave={async (id, val) => { setConsumoAnualEst(id, val); }}
        />
      )}

      {(showModal || showCurModal || editClient) && (
        <NewClientModal
          key={editClient?.id ?? 'new'}
          tipo={modalTipoActivo}
          onClose={closeModal}
          onSave={handleModalSave}
          existingCups={allCups}
          editId={editClient?.id}
          initialData={editClient ? {
            nombre:            editClient.nombre,
            identificacion:    editClient.cif_dni          || '',
            telefono:          editClient.telefono,
            cups:              editClient.cups,
            tarifa:            editClient.tarifa,
            linea_negocio:     editClient.linea_negocio    || '',
            subtipo:           editClient.subtipo          || '',
            subtipo_otro:      editClient.subtipo_otro     || '',
            id_producto:       editClient.id_producto      || '',
            creado_por:        editClient.creado_por       || '',
            descripcion:       editClient.descripcion      || '',
            consumo_anual_est: editClient.consumo_anual_est != null ? editClient.consumo_anual_est : '',
            estado:            editClient.estado,
            mail:              editClient.mail             || '',
            cuenta_bancaria:   editClient.cuenta_bancaria  || '',
            dni_escaneado:     editClient.dni_escaneado    || '',
            ultima_factura:    editClient.ultima_factura   || '',
            cif_autonomo_url:  editClient.cif_autonomo_url || '',
            justo_titulo_url:  editClient.justo_titulo_url  || '',
            factura_b2b_url:   editClient.factura_b2b_url   || '',
            fecha_tramitacion: editClient.fecha_tramitacion || '',
            agente_gestor:     editClient.comercial        || '',
            fecha_firma:       editClient.fecha_firma       ?? null,
            fecha_formalizada: editClient.fecha_formalizada ?? null,
          } : null}
        />
      )}
    </div>
  );
}
