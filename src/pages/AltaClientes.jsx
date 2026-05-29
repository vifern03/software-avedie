import { useState, useRef, useEffect } from 'react';
import { Plus, FileCheck, Clock, AlertCircle, Trophy, Search, ChevronUp, ChevronDown, Trash2, Pencil, PenTool, X, Eye, FileText } from 'lucide-react';
import NewClientModal from '../components/NewClientModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import Pagination from '../components/Pagination';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

const MEDAL_COLORS = ['bg-yellow-400', 'bg-gray-300', 'bg-amber-600'];

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

function downloadBase64File(base64, clientName = 'documento') {
  const mime  = base64.split(';')[0].replace('data:', '');
  const ext   = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'bin';
  const link  = document.createElement('a');
  link.href   = base64;
  link.download = `${clientName.replace(/\s+/g, '_')}.${ext}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function FileCell({ value, clientName }) {
  if (!value) return <span className="text-google-gray">—</span>;
  if (typeof value === 'string' && value.startsWith('data:')) {
    return (
      <button onClick={() => downloadBase64File(value, clientName)}
        className="p-1 rounded hover:bg-slate-100 transition-colors" title="Descargar">
        <Eye size={15} className="text-slate-500" />
      </button>
    );
  }
  return <span className="inline-flex items-center justify-center p-1"><FileText size={15} className="text-slate-400" /></span>;
}

export default function AltaClientes({ tipo }) {
  const isB2B = tipo === 'B2B';
  const { clientesB2C, clientesB2B, addCliente, updateCliente, firmarContrato, formalizarContrato, deleteCliente, rankingComerciales } = useData();
  const { currentUser } = useAuth();
  const clientes = isB2B ? clientesB2B : clientesB2C;

  const [showModal,        setShowModal]        = useState(false);
  const [editClient,       setEditClient]        = useState(null);
  const [deleteTarget,     setDeleteTarget]      = useState(null);
  const [firmaTarget,      setFirmaTarget]       = useState(null);
  const [formalizarTarget, setFormalizarTarget]  = useState(null);
  const [search,           setSearch]            = useState('');
  const [timeFilter,       setTimeFilter]        = useState('');
  const [dateFilter,       setDateFilter]        = useState('');
  const [sortField,        setSortField]         = useState('fecha_tramitacion');
  const [sortDir,          setSortDir]           = useState('desc');

  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef(null);

  useEffect(() => { setCurrentPage(1); }, [search, dateFilter, timeFilter]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  };

  // 30 días antirrobo
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  cutoff.setHours(0, 0, 0, 0);

  const isComercial = currentUser?.role === 'comercial';

  const baseClientes = clientes.filter((c) => {
    const d = new Date(c.fecha_tramitacion || '');
    if (isNaN(d) || d < cutoff) return false;
    if (isComercial && c.comercial !== currentUser.username) return false;
    return true;
  });

  const totalPendienteFirma = baseClientes.filter((c) => c.estado === 'Pendiente Firma').length;
  const totalTramitados     = baseClientes.filter((c) => c.estado === 'Tramitado').length;
  const totalFormalizados   = baseClientes.filter((c) => c.estado === 'Formalizado').length;

  const handleModalSave = (data) => {
    if (editClient) updateCliente(editClient.id, data);
    else            addCliente(data, tipo);
  };

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

  const filtered = getTimeFilteredList(baseClientes, timeFilter)
    .filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = !search || (c.cups || '').toLowerCase().includes(q) || (c.cif_dni || '').toLowerCase().includes(q);
      const matchDate   = !dateFilter || c.fecha_tramitacion === dateFilter;
      return matchSearch && matchDate;
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

  const TOTAL_COLS = 20;

  const subtipo = (c) => c.subtipo === 'Otro' ? (c.subtipo_otro || 'Otro') : (c.subtipo || '—');

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark">
            Alta {isB2B ? 'B2B · Empresas' : 'B2C · Particulares'}
          </h1>
          <p className="text-sm text-google-gray mt-1">Gestión de contratos</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={16} />
          <span>Nuevo {isB2B ? 'Empresa' : 'Cliente'}</span>
        </button>
      </div>

      {/* Counter cards — 3 estados */}
      <div className="grid grid-cols-3 gap-4">
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

      {/* Ranking Ventas — solo admin y manager */}
      {!isComercial && (
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-google-gray mr-1">Tramitación:</span>
          <FilterPill label="Todo"                              active={timeFilter === ''}             onClick={() => setTimeFilter('')}            />
          <FilterPill label={`Este Mes (${monthName(0)})`}      active={timeFilter === 'mes_actual'}   onClick={() => setTimeFilter('mes_actual')}  />
          <FilterPill label={`Mes Anterior (${monthName(-1)})`} active={timeFilter === 'mes_anterior'} onClick={() => setTimeFilter('mes_anterior')} />
          <div className="flex items-center gap-1 ml-2">
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="input-field h-7 text-xs px-2 w-36" title="Fecha exacta de tramitación" />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50 transition-colors">
                <X size={13} />
              </button>
            )}
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
                <th className="table-header">DNI/CIF Esc.</th>
                <th className="table-header">Últ. Factura</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={TOTAL_COLS} className="text-center py-10 text-google-gray text-sm">
                    {baseClientes.length === 0
                      ? `No hay contratos recientes. Pulsa "Nuevo ${isB2B ? 'Empresa' : 'Cliente'}" para empezar.`
                      : 'No se encontraron resultados'}
                  </td>
                </tr>
              ) : (
                paginated.map((c) => (
                  <tr key={c.id} className="hover:bg-google-bg transition-colors">
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">{c.nombre}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.tipo === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>{c.tipo}</span>
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
                    <td className="table-cell tabular-nums text-xs text-google-gray">{c.fecha_firma || '—'}</td>
                    <td className="table-cell tabular-nums text-xs text-google-gray">{c.fecha_tramitacion || '—'}</td>
                    <td className="table-cell tabular-nums text-xs">
                      {c.fecha_formalizada
                        ? <span className="text-green-700 font-medium">{c.fecha_formalizada}</span>
                        : <span className="text-google-gray italic">—</span>}
                    </td>
                    <td className="table-cell"><StatusBadge estado={c.estado} /></td>
                    <td className="table-cell text-center"><FileCell value={c.dni_escaneado} clientName={`DNI_${c.nombre}`} /></td>
                    <td className="table-cell text-center"><FileCell value={c.ultima_factura} clientName={`Factura_${c.nombre}`} /></td>
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

      {(showModal || editClient) && (
        <NewClientModal
          tipo={tipo}
          onClose={() => { setShowModal(false); setEditClient(null); }}
          onSave={handleModalSave}
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
            estado:            editClient.estado,
            mail:              editClient.mail             || '',
            cuenta_bancaria:   editClient.cuenta_bancaria  || '',
            dni_escaneado:     editClient.dni_escaneado    || '',
            ultima_factura:    editClient.ultima_factura   || '',
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
