import { useState, useRef, useEffect, useMemo } from 'react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Search, Filter, FileSpreadsheet, ChevronUp, ChevronDown, Database, Trash2, Pencil, Eye, Loader2, X, PenTool, FileCheck } from 'lucide-react';
import NewClientModal from '../components/NewClientModal';
import DeleteConfirmModal from '../components/DeleteConfirmModal';
import ConfirmActionModal from '../components/ConfirmActionModal';
import Pagination from '../components/Pagination';
import ShareButton from '../components/ShareButton';
import { useData, fetchSingleDoc } from '../context/DataContext';
import DateInput from '../components/DateInput';

function openBase64(base64, clientName = 'documento') {
  const mime = base64.split(';')[0].replace('data:', '');
  const ext  = mime === 'application/pdf' ? 'pdf' : mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'bin';
  const bytes = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(bytes.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < bytes.length; i++) ia[i] = bytes.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([ab], { type: mime }));
  // Abrir en nueva pestaña y disparar descarga con nombre del cliente
  const a = document.createElement('a');
  a.href = url; a.download = `${clientName.replace(/\s+/g, '_')}.${ext}`; a.target = '_blank';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Celda lazy — muestra ojo si el flag indica que hay doc; descarga al hacer clic
function FileCell({ hasDoc, clientId, campo, clientName }) {
  const [loading, setLoading] = useState(false);
  if (!hasDoc) return <span className="text-google-gray">—</span>;
  const handleClick = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchSingleDoc(clientId, campo);
      if (data) openBase64(data, clientName);
    } finally {
      setLoading(false);
    }
  };
  return (
    <button onClick={handleClick} disabled={loading}
      className="p-1 rounded hover:bg-slate-100 transition-colors" title="Descargar archivo">
      {loading
        ? <Loader2 size={15} className="text-slate-400 animate-spin" />
        : <Eye size={15} className="text-slate-500 hover:text-slate-800 transition-colors" />}
    </button>
  );
}

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

const now   = new Date();
const YEAR  = now.getFullYear();
const MONTH = now.getMonth();

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

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

export default function HistoricaDB() {
  const { clientes, updateCliente, updateCompartidoCon, firmarContrato, formalizarContrato, deleteCliente, docsFlags } = useData();

  const allCups = useMemo(
    () => new Set(clientes.map(c => (c.cups || '').toUpperCase().trim()).filter(Boolean)),
    [clientes]
  );

  const [editClient,       setEditClient]       = useState(null);
  const [deleteTarget,     setDeleteTarget]     = useState(null);
  const [firmaTarget,      setFirmaTarget]      = useState(null);
  const [formalizarTarget, setFormalizarTarget] = useState(null);
  const [search,           setSearch]           = useState('');
  const [filterComercial,  setFilterComercial]  = useState('');
  const [filterEstado,     setFilterEstado]     = useState('');
  const [timeFilter,       setTimeFilter]       = useState('');
  const [dateFrom,         setDateFrom]         = useState('');
  const [dateTo,           setDateTo]           = useState('');
  const [sortField,        setSortField]        = useState('fecha_tramitacion');
  const [sortDir,          setSortDir]          = useState('desc');

  const ITEMS_PER_PAGE = 15;
  const [currentPage, setCurrentPage] = useState(1);
  const tableScrollRef = useRef(null);

  useEffect(() => { setCurrentPage(1); }, [search, filterComercial, filterEstado, timeFilter, dateFrom, dateTo]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = 0;
  };

  const handleUpdate = (data) => {
    updateCliente(editClient.id, data);
    return { error: null };
  };

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  const clientesFormalizados = clientes.filter((c) => c.estado === 'Formalizado');
  const gestoresUnicos = [...new Set(clientesFormalizados.map((c) => c.comercial).filter(Boolean))].sort();
  const hasFilters = search || filterComercial || filterEstado || timeFilter || dateFrom || dateTo;

  const filtered = getTimeFilteredList(clientesFormalizados, timeFilter)
    .filter((c) => {
      const q = search.toLowerCase();
      const matchSearch    = !search          || (c.cups || '').toLowerCase().includes(q) || (c.cif_dni || '').toLowerCase().includes(q);
      const matchComercial = !filterComercial || c.comercial === filterComercial;
      const matchEstado    = !filterEstado    || c.estado    === filterEstado;
      const matchDateFrom  = !dateFrom        || (c.fecha_formalizada >= dateFrom);
      const matchDateTo    = !dateTo          || (c.fecha_formalizada <= dateTo);
      return matchSearch && matchComercial && matchEstado && matchDateFrom && matchDateTo;
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

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <ChevronUp size={11} className="opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp size={11} className="text-google-blue" />
      : <ChevronDown size={11} className="text-google-blue" />;
  };

  const subtipo = (c) => c.subtipo === 'Otro' ? (c.subtipo_otro || 'Otro') : (c.subtipo || '—');

  const exportToXLSX = async (data, suffix = '') => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CRM Grupo Avedie';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Contratos');

    sheet.columns = [
      { header: 'Cliente',          key: 'nombre',            width: 25 },
      { header: 'Tipo',             key: 'tipo',              width: 10 },
      { header: 'Línea de Negocio', key: 'linea_negocio',    width: 20 },
      { header: 'Subtipo',          key: 'subtipo_display',   width: 32 },
      { header: 'DNI/CIF',         key: 'cif_dni',           width: 16, style: { numFmt: '@' } },
      { header: 'Teléfono',        key: 'telefono',          width: 16, style: { numFmt: '@' } },
      { header: 'Mail',             key: 'mail',              width: 28 },
      { header: 'Cuenta Bancaria',  key: 'cuenta_bancaria',   width: 30, style: { numFmt: '@' } },
      { header: 'CUPS',             key: 'cups',              width: 30, style: { numFmt: '@' } },
      { header: 'Tarifa',           key: 'tarifa',            width: 12 },
      { header: 'Id Producto',      key: 'id_producto',       width: 20 },
      { header: 'Prescriptor',      key: 'creado_por',        width: 18 },
      { header: 'Vendido por',      key: 'vendido_por',       width: 18 },
      { header: 'Tramitado por',    key: 'tramitado_por',     width: 18 },
      { header: 'F. Firma',        key: 'fecha_firma',       width: 14 },
      { header: 'F. Tramitación',  key: 'fecha_tramitacion', width: 16 },
      { header: 'F. Formalizada',  key: 'fecha_formalizada', width: 16 },
      { header: 'Estado',          key: 'estado',            width: 18 },
      { header: 'Descripción',     key: 'descripcion',       width: 38 },
    ];

    // ── Cabecera: negrita, fondo azul pálido, texto centrado, bordes
    const hBorder = { style: 'thin', color: { argb: 'FFBDBDBD' } };
    sheet.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: 'FF1A237E' }, size: 11 };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF6' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border    = { top: hBorder, left: hBorder, bottom: hBorder, right: hBorder };
    });
    sheet.getRow(1).height = 22;

    // ── Filas de datos
    const dBorder = { style: 'thin', color: { argb: 'FFE0E0E0' } };
    const textCols = new Set([5, 6, 8, 9]); // DNI, Teléfono, Cuenta Bancaria, CUPS (1-indexed)

    data.forEach((c) => {
      const row = sheet.addRow({
        nombre:            c.nombre                 || '',
        tipo:              c.tipo                   || '',
        linea_negocio:     c.linea_negocio          || '',
        subtipo_display:   c.subtipo === 'Otro' ? (c.subtipo_otro || 'Otro') : (c.subtipo || ''),
        cif_dni:           String(c.cif_dni         || ''),
        telefono:          String(c.telefono        || ''),
        mail:              c.mail                   || '',
        cuenta_bancaria:   String(c.cuenta_bancaria || ''),
        cups:              String(c.cups            || ''),
        tarifa:            c.tarifa                 || '',
        id_producto:       c.id_producto            || '',
        creado_por:        c.creado_por             || '',
        vendido_por:       c.vendido_por            || '',
        tramitado_por:     c.comercial              || '',
        fecha_firma:       c.fecha_firma            || '',
        fecha_tramitacion: c.fecha_tramitacion      || '',
        fecha_formalizada: c.fecha_formalizada      || '',
        estado:            c.estado                 || '',
        descripcion:       c.descripcion            || '',
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
    const filename = `Contratos_Grupo_Avedie${suffix ? '_' + suffix : ''}_${datePart}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(
      new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      filename
    );
  };

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const paginated  = filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const TOTAL_COLS = 22;

  // Column definitions (20 cols, exact order)
  const sortableCols = [
    { field: 'nombre',            label: 'Cliente'          },
    { field: 'tipo',              label: 'Tipo'             },
    { field: 'linea_negocio',     label: 'Línea de Negocio' },
    { field: 'tarifa',            label: 'Tarifa'           },
    { field: 'comercial',         label: 'Tramitado por'    },
    { field: 'fecha_firma',       label: 'F. Firma'         },
    { field: 'fecha_tramitacion', label: 'F. Tramitación'   },
    { field: 'fecha_formalizada', label: 'F. Formalizada'   },
    { field: 'estado',            label: 'Estado'           },
  ];
  const isSortable = (f) => sortableCols.some((s) => s.field === f);

  const th = (field, label) => (
    <th key={field}
      className={`table-header ${isSortable(field) ? 'cursor-pointer hover:bg-gray-100' : ''}`}
      onClick={() => isSortable(field) && toggleSort(field)}>
      <div className="flex items-center gap-1">
        {label}
        {isSortable(field) && <SortIcon field={field} />}
      </div>
    </th>
  );

  return (
    <>
      <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
              <Database size={22} className="text-google-blue" />
              Base de Datos Histórica
            </h1>
            <p className="text-sm text-google-gray mt-1">Registro completo de clientes</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => exportToXLSX(clientesFormalizados, 'Completo')}
              className="btn-secondary flex items-center gap-2">
              <FileSpreadsheet size={15} />
              <span>Exportar Todo</span>
            </button>
            <button onClick={() => exportToXLSX(filtered, 'Vista')}
              className="btn-primary flex items-center gap-2">
              <FileSpreadsheet size={15} />
              <span>Exportar Vista Actual</span>
            </button>
          </div>
        </div>

        {/* Filters bar */}
        <div className="card px-5 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
              <input type="text" placeholder="Buscar por CUPS o DNI/CIF..." value={search}
                onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 h-9" />
            </div>
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-google-gray flex-shrink-0" />
              <select value={filterComercial} onChange={(e) => setFilterComercial(e.target.value)}
                className="input-field h-9 w-auto text-xs min-w-[160px]">
                <option value="">Todos los gestores</option>
                {gestoresUnicos.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value)}
              className="input-field h-9 w-auto text-xs">
              <option value="">Todos los estados</option>
              <option value="Pendiente Firma">Pendiente Firma</option>
              <option value="Tramitado">Tramitado</option>
              <option value="Formalizado">Formalizado</option>
            </select>
            {hasFilters && (
              <button onClick={() => { setSearch(''); setFilterComercial(''); setFilterEstado(''); setTimeFilter(''); setDateFrom(''); setDateTo(''); }}
                className="text-xs text-google-blue hover:underline">
                Limpiar filtros
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-google-gray mr-1">Tramitación:</span>
            <FilterPill label="Todo"                              active={timeFilter === ''}             onClick={() => setTimeFilter('')}            />
            <FilterPill label={`Este Mes (${monthName(0)})`}      active={timeFilter === 'mes_actual'}   onClick={() => setTimeFilter('mes_actual')}  />
            <FilterPill label={`Mes Anterior (${monthName(-1)})`} active={timeFilter === 'mes_anterior'} onClick={() => setTimeFilter('mes_anterior')} />
            <div className="flex flex-wrap items-center gap-2 ml-2">
              <span className="text-xs font-medium text-google-gray">F. Formalizada:</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-google-gray">Desde</label>
                <DateInput value={dateFrom} onChange={(iso) => setDateFrom(iso)}
                  className="input-field h-7 text-xs px-2 w-36" />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-google-gray">Hasta</label>
                <DateInput value={dateTo} onChange={(iso) => setDateTo(iso)}
                  className="input-field h-7 text-xs px-2 w-36" />
              </div>
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(''); setDateTo(''); }}
                  className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50 transition-colors" title="Limpiar rango de fechas">
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Table — orden exacto de 20 columnas */}
        <div className="card overflow-hidden">
          <div className="overflow-x-auto" ref={tableScrollRef}>
            <table className="w-full text-sm min-w-max">
              <thead>
                <tr>
                  {th('nombre',            'Cliente')}
                  {th('tipo',              'Tipo')}
                  {th('linea_negocio',     'Línea de Negocio')}
                  <th className="table-header">Subtipo</th>
                  <th className="table-header">DNI / CIF</th>
                  <th className="table-header">Teléfono</th>
                  <th className="table-header">Mail</th>
                  <th className="table-header">Cuenta Bancaria</th>
                  <th className="table-header">CUPS</th>
                  {th('tarifa',            'Tarifa')}
                  <th className="table-header">Id Producto</th>
                  <th className="table-header">Prescriptor</th>
                  <th className="table-header">Vendido por</th>
                  {th('comercial',         'Tramitado por')}
                  {th('fecha_firma',       'F. Firma')}
                  {th('fecha_tramitacion', 'F. Tramitación')}
                  {th('fecha_formalizada', 'F. Formalizada')}
                  {th('estado',            'Estado')}
                  <th className="table-header">DNI/CIF Esc.</th>
                  <th className="table-header">Últ. Factura</th>
                  <th className="table-header">Descripción</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={TOTAL_COLS} className="text-center py-12 text-google-gray">
                      {clientes.length === 0
                        ? 'La base de datos está vacía. Añade contratos desde Alta B2C o Alta B2B.'
                        : 'No hay registros que coincidan con los filtros'}
                    </td>
                  </tr>
                ) : (
                  paginated.map((c) => (
                    <tr key={c.id} className="hover:bg-google-bg transition-colors group">
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
                      <td className="table-cell text-google-gray text-xs">{c.vendido_por || '—'}</td>
                      <td className="table-cell text-google-gray text-xs">{c.comercial}</td>
                      <td className="table-cell tabular-nums text-xs text-google-gray">{formatDate(c.fecha_firma)}</td>
                      <td className="table-cell tabular-nums text-xs text-google-gray">{formatDate(c.fecha_tramitacion)}</td>
                      <td className="table-cell tabular-nums text-xs">
                        {c.fecha_formalizada
                          ? <span className="text-green-700 font-medium">{formatDate(c.fecha_formalizada)}</span>
                          : <span className="text-google-gray italic">—</span>}
                      </td>
                      <td className="table-cell"><StatusBadge estado={c.estado} /></td>
                      <td className="table-cell text-center"><FileCell hasDoc={docsFlags[c.id]?.tiene_dni}     clientId={c.id} campo="dni_escaneado"  clientName={`DNI_${c.nombre}`} /></td>
                      <td className="table-cell text-center"><FileCell hasDoc={docsFlags[c.id]?.tiene_factura} clientId={c.id} campo="ultima_factura" clientName={`Factura_${c.nombre}`} /></td>
                      <td className="table-cell text-google-gray text-xs max-w-[180px] truncate" title={c.descripcion || ''}>{c.descripcion || '—'}</td>
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
                              className="p-1 rounded hover:bg-green-50 transition-colors" title="Formalizar">
                              <FileCheck size={15} className="text-green-600" />
                            </button>
                          )}
                          <button onClick={() => setEditClient(c)}
                            className="p-1 rounded hover:bg-blue-50 transition-colors" title="Editar">
                            <Pencil size={15} className="text-google-blue" />
                          </button>
                          <ShareButton cliente={c} onUpdate={updateCompartidoCon} />
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
          <div className="px-5 py-3 border-t border-google-border bg-google-bg flex items-center justify-between">
            <p className="text-xs text-google-gray">
              Mostrando <span className="font-medium text-google-dark">{paginated.length}</span> de{' '}
              <span className="font-medium text-google-dark">{filtered.length}</span> registros formalizados
            </p>
            <p className="text-xs text-google-gray">Zona protegida · Admin</p>
          </div>
        </div>
      </div>

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

      {editClient && (
        <NewClientModal
          tipo={editClient.tipo}
          onClose={() => setEditClient(null)}
          onSave={handleUpdate}
          existingCups={allCups}
          editId={editClient.id}
          initialData={{
            nombre:            editClient.nombre,
            identificacion:    editClient.cif_dni,
            telefono:          editClient.telefono,
            cups:              editClient.cups,
            tarifa:            editClient.tarifa,
            linea_negocio:     editClient.linea_negocio    || '',
            subtipo:           editClient.subtipo          || '',
            subtipo_otro:      editClient.subtipo_otro     || '',
            id_producto:       editClient.id_producto      || '',
            creado_por:        editClient.creado_por       || '',
            vendido_por:       editClient.vendido_por      || '',
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
          }}
        />
      )}
    </>
  );
}
