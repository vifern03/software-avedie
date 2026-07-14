import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Upload, FileSpreadsheet, X, CheckCircle, Wrench, FileCheck } from 'lucide-react';
import { useData } from '../context/DataContext';
import Pagination from '../components/Pagination';

/* Nombre EXACTO de la columna del Excel que contiene el CUPS a cruzar. */
const CUPS_COLUMN_HEADER = 'CUPS: CUPS';
const ITEMS_PER_PAGE = 15;

function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

/* Lee el Excel y devuelve TODAS las filas (no solo las que matchean contra la
   BD): cada una se conserva en registro_pendientes para no perder ningún dato.
   Usa header:1 (filas como arrays) para localizar la cabecera EXACTA sin que
   la librería la renombre por duplicados o caracteres especiales. Si el Excel
   no trae fila de cabecera (algún formato antiguo), usa la columna A como CUPS. */
async function extractRowsFromExcel(file) {
  const buffer = await fileToArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return { registros: [], columnFound: false };

  const headerRow = rows[0].map(h => String(h ?? '').trim());
  const cupsIdx    = headerRow.findIndex(h => h === CUPS_COLUMN_HEADER);
  const nombreIdx  = headerRow.findIndex(h => h === 'Nombre');
  const casoIdx    = headerRow.findIndex(h => h === 'Número del caso');
  const fechaIdx   = headerRow.findIndex(h => h === 'Fecha de creación');

  const columnFound = cupsIdx !== -1;
  const dataRows = columnFound ? rows.slice(1) : rows; // sin cabecera: todas las filas son datos

  const registros = dataRows
    .map(r => {
      const cups = String(r[columnFound ? cupsIdx : 0] ?? '').trim();
      if (!cups) return null;
      const raw_data = columnFound
        ? Object.fromEntries(headerRow.map((h, i) => [h || `col_${i}`, r[i] ?? '']))
        : { cups };
      return {
        cups,
        nombre:               columnFound ? String(r[nombreIdx] ?? '').trim()  || null : null,
        numero_caso:          columnFound ? String(r[casoIdx]   ?? '').trim()  || null : null,
        fecha_creacion_excel: columnFound ? String(r[fechaIdx]  ?? '').trim()  || null : null,
        origen_excel:         file.name,
        raw_data,
      };
    })
    .filter(Boolean);

  return { registros, columnFound };
}

/* Fechas del Excel vienen como "D/M/AAAA" (sin ceros a la izquierda) — Date()
   nativo las interpreta de forma ambigua/inconsistente entre navegadores, así
   que se parsean a mano. Devuelve null si no es un formato reconocible. */
function parseFechaExcel(str) {
  if (!str) return null;
  const parts = String(str).trim().split(/[/-]/);
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/* Timestamp para ordenar: prioriza la fecha original del Excel; si no se puede
   parsear, cae al created_at del registro (siempre válido, generado por BD). */
function sortTimestamp(r) {
  const fechaExcel = r.raw_data?.['Fecha de creación'] || r.fecha_creacion_excel;
  const parsed = parseFechaExcel(fechaExcel);
  if (parsed != null) return parsed;
  const created = new Date(r.created_at).getTime();
  return isNaN(created) ? 0 : created;
}

/* Mapeo de colores para el Estado ORIGINAL del Excel (raw_data->>'Estado') —
   puramente visual, no tiene relación con nuestro estado_incidencia interno
   (Pendiente de tareas / Tramitado), que sigue controlando el fondo naranja. */
function estadoOriginalBadge(estado) {
  if (!estado) return { label: '—', className: 'bg-gray-100 text-gray-500' };
  const e = estado.toLowerCase();
  if (e.includes('cancel'))                      return { label: estado, className: 'bg-red-100 text-red-700' };
  if (e.includes('recuperaci'))                  return { label: estado, className: 'bg-purple-100 text-purple-700' };
  if (e.includes('firma'))                        return { label: estado, className: 'bg-blue-100 text-blue-700' };
  if (e.includes('pendiente') || e.startsWith('pte'))
                                                    return { label: estado, className: 'bg-amber-100 text-amber-700' };
  if (e.includes('complet') || e.includes('resuel') || e.includes('activ') || e.includes('formaliz'))
                                                    return { label: estado, className: 'bg-green-100 text-green-700' };
  if (e.includes('rechaz') || e.includes('error'))
                                                    return { label: estado, className: 'bg-red-100 text-red-700' };
  return { label: estado, className: 'bg-gray-100 text-gray-700' };
}

export default function Pendientes() {
  const { clientes, registroPendientes, ingestExcelPendientes, tramitarPendiente, formalizarPendiente } = useData();

  const [dragging, setDragging]   = useState(false);
  const [dropped, setDropped]     = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState(null); // { type: 'success'|'error', text }
  const [currentPage, setCurrentPage] = useState(1);
  const fileRef = useRef(null);

  // Cualquier CUPS ya dado de alta (B2C o B2B) — para el circulito verde/rojo.
  const clientesCupsSet = useMemo(
    () => new Set(clientes.map(c => (c.cups || '').toUpperCase().trim()).filter(Boolean)),
    [clientes]
  );

  // TODOS los registros, en TODOS los estados (Pendiente de tareas, Tramitado,
  // Formalizado). Un contrato formalizado NUNCA se oculta ni se borra de esta
  // tabla — se queda como histórico visible, con su propio color pastel.
  const pendientes = useMemo(
    () => registroPendientes
      .slice()
      .sort((a, b) => sortTimestamp(b) - sortTimestamp(a)), // más nuevo primero
    [registroPendientes]
  );

  const handleTramitarClick = (r) => {
    if (window.confirm('¿Confirma que ya ha sido tramitado este contrato?')) {
      tramitarPendiente(r.id);
    }
  };

  const handleFormalizarClick = (r) => {
    if (window.confirm('¿Confirma que ya ha sido formalizado este contrato?')) {
      formalizarPendiente(r.id);
    }
  };

  const totalPages = Math.max(1, Math.ceil(pendientes.length / ITEMS_PER_PAGE));
  const paginated = pendientes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  // Si sube un Excel nuevo o se tramita/formaliza algo, la página actual puede
  // quedar fuera de rango — recolocar en la última página válida.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  async function handleFile(file) {
    if (!file) return;
    setDropped(file);
    setResultMsg(null);
    setIsProcessing(true);
    try {
      const { registros, columnFound } = await extractRowsFromExcel(file);
      if (!columnFound) {
        setResultMsg({ type: 'error', text: `No se ha encontrado la columna "${CUPS_COLUMN_HEADER}" en el Excel. Revisa que el nombre de la cabecera sea exacto (o que la primera fila sea la cabecera).` });
        return;
      }
      if (registros.length === 0) {
        setResultMsg({ type: 'error', text: `La columna "${CUPS_COLUMN_HEADER}" no contiene ningún valor.` });
        return;
      }
      const { inserted, error } = await ingestExcelPendientes(registros);
      if (error) {
        setResultMsg({ type: 'error', text: 'Error al guardar en la base de datos. ¿Has ejecutado supabase_pendientes_v2.sql? Inténtalo de nuevo.' });
        return;
      }
      setCurrentPage(1);
      setResultMsg({
        type: 'success',
        text: `${registros.length} fila(s) leídas del Excel · ${inserted} registradas en el embudo de Pendientes (todas, existan o no ya como contrato en el CRM).`,
      });
    } catch (err) {
      console.error('Pendientes — extractRowsFromExcel:', err);
      setResultMsg({ type: 'error', text: 'No se pudo leer el archivo. Comprueba que sea un Excel (.xlsx) válido.' });
    } finally {
      setIsProcessing(false);
    }
  }

  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-google-dark">Gestión de Pendientes</h1>
        <p className="text-sm text-google-gray mt-1">Embudo de incidencias — sube el Excel diario. Se conservan TODAS las filas, existan o no ya como contrato en el CRM.</p>
      </div>

      {/* Zona de subida */}
      <div className="bg-white border border-google-border rounded-xl shadow-sm p-5 mb-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">Subir Excel de incidencias (.xlsx)</p>
          <span className="text-[10px] font-semibold text-google-gray bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5">
            Columna esperada: "{CUPS_COLUMN_HEADER}"
          </span>
        </div>
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
            isProcessing ? 'border-blue-300 bg-blue-50 cursor-wait'
            : dragging    ? 'border-google-blue bg-blue-50 cursor-copy'
            : 'border-gray-200 bg-gray-50 hover:border-blue-300 cursor-pointer'
          }`}
          onDragOver={!isProcessing ? onDragOver  : undefined}
          onDragLeave={!isProcessing ? onDragLeave : undefined}
          onDrop={!isProcessing ? onDrop : undefined}
          onClick={() => { if (!isProcessing) fileRef.current?.click(); }}
        >
          <input
            ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }}
          />
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2.5 py-1">
              <FileSpreadsheet size={28} className="text-google-blue animate-pulse" />
              <p className="text-xs font-semibold text-google-blue">Procesando Excel y guardando en el registro de Pendientes...</p>
            </div>
          ) : dropped ? (
            <div className="flex items-center justify-center gap-2">
              <FileSpreadsheet size={16} className="text-google-blue flex-shrink-0" />
              <span className="text-sm font-medium text-google-dark truncate max-w-[240px]">{dropped.name}</span>
              <button type="button" className="text-gray-400 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); setDropped(null); setResultMsg(null); }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <>
              <Upload size={18} className="mx-auto mb-2 text-gray-400" />
              <p className="text-xs text-google-gray">Arrastra el Excel aquí o <span className="text-google-blue underline">selecciona un archivo</span></p>
              <p className="text-[11px] text-gray-400 mt-0.5">.xlsx · Todas las filas se guardan, tengan o no ya un contrato dado de alta</p>
            </>
          )}
        </div>
        {resultMsg && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 mt-3 border ${
            resultMsg.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
          }`}>
            {resultMsg.type === 'success'
              ? <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
              : <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
            <p className={`text-[11px] leading-relaxed ${resultMsg.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>{resultMsg.text}</p>
          </div>
        )}
      </div>

      {/* Tabla de pendientes */}
      <div className="bg-white border border-google-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-google-dark">Registro de incidencias</h2>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[11px] text-google-gray">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" /> Dado de alta en el CRM
            </span>
            <span className="flex items-center gap-1.5 text-[11px] text-google-gray">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" /> Sin alta todavía
            </span>
            <span className="text-[11px] font-semibold text-google-gray bg-gray-100 px-2 py-0.5 rounded-full">{pendientes.length}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr>
                <th className="table-header w-8"></th>
                <th className="table-header">Número OI</th>
                <th className="table-header">CUPS</th>
                <th className="table-header">Nº Caso</th>
                <th className="table-header">Fecha (Excel)</th>
                <th className="table-header">Estado Incidencia</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-google-gray text-sm">
                    No hay incidencias pendientes. Sube un Excel para empezar.
                  </td>
                </tr>
              ) : (
                paginated.map(r => {
                  const existeEnCrm = clientesCupsSet.has((r.cups || '').toUpperCase().trim());
                  const numeroOi = r.raw_data?.['Nombre'] || r.nombre || '';
                  const estadoOriginal = r.raw_data?.['Estado'] || null;
                  const badge = estadoOriginalBadge(estadoOriginal);
                  return (
                    <tr key={r.id} className={`transition-colors ${
                      r.estado_incidencia === 'Formalizado' ? 'bg-green-50 hover:bg-green-100'
                      : r.estado_incidencia === 'Tramitado'  ? 'bg-orange-50 hover:bg-orange-100'
                      : 'hover:bg-google-bg'
                    }`}>
                      <td className="table-cell">
                        <span
                          className={`w-3 h-3 rounded-full inline-block ${existeEnCrm ? 'bg-green-500' : 'bg-red-500'}`}
                          title={existeEnCrm ? 'Este CUPS ya está dado de alta en el CRM' : 'Este CUPS todavía no tiene contrato en el CRM'}
                        />
                      </td>
                      <td className="table-cell font-medium text-google-dark whitespace-nowrap">{numeroOi}</td>
                      <td className="table-cell text-google-gray font-mono text-xs">{r.cups}</td>
                      <td className="table-cell text-google-gray text-xs">{r.raw_data?.['Número del caso'] || r.numero_caso || ''}</td>
                      <td className="table-cell text-google-gray text-xs whitespace-nowrap">{r.fecha_creacion_excel || '—'}</td>
                      <td className="table-cell">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="table-cell">
                        {r.estado_incidencia === 'Formalizado' ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-green-700 whitespace-nowrap">
                            <FileCheck size={13} /> Formalizado
                          </span>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {r.estado_incidencia === 'Pendiente de tareas' && (
                              <button
                                onClick={() => handleTramitarClick(r)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition-colors whitespace-nowrap"
                                title="Marcar como tramitado"
                              >
                                <Wrench size={13} /> Tramitado
                              </button>
                            )}
                            <button
                              onClick={() => handleFormalizarClick(r)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-300 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors whitespace-nowrap"
                              title="Formalizar (queda como histórico, no se borra)"
                            >
                              <FileCheck size={13} /> Formalizar
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
      </div>
    </div>
  );
}
