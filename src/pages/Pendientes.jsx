import { useState, useRef, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, Upload, FileSpreadsheet, X, CheckCircle, Wrench, FileCheck } from 'lucide-react';
import { useData } from '../context/DataContext';

/* Nombre EXACTO de la columna del Excel que contiene el CUPS a cruzar. */
const CUPS_COLUMN_HEADER = 'CUPS: CUPS';

const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload  = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

/* Lee el Excel y devuelve la lista de valores CUPS bajo la columna "CUPS: CUPS".
   Usa header:1 (filas como arrays) para poder localizar la cabecera EXACTA sin que
   la librería la renombre por duplicados o caracteres especiales. */
async function extractCupsFromExcel(file) {
  const buffer = await fileToArrayBuffer(file);
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (rows.length === 0) return { cups: [], columnFound: false };

  const headerRow = rows[0].map(h => String(h ?? '').trim());
  const colIdx = headerRow.findIndex(h => h === CUPS_COLUMN_HEADER);
  if (colIdx === -1) return { cups: [], columnFound: false };

  const cups = rows.slice(1)
    .map(r => String(r[colIdx] ?? '').trim())
    .filter(Boolean);
  return { cups, columnFound: true };
}

export default function Pendientes() {
  const { clientes, marcarPendientesPorCups, tramitarIncidencia, formalizarIncidencia } = useData();

  const [dragging, setDragging]   = useState(false);
  const [dropped, setDropped]     = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState(null); // { type: 'success'|'error', text }
  const fileRef = useRef(null);

  const pendientes = useMemo(
    () => clientes.filter(c => c.estado_incidencia === 'Pendiente de tareas' || c.estado_incidencia === 'Tramitado'),
    [clientes]
  );

  async function handleFile(file) {
    if (!file) return;
    setDropped(file);
    setResultMsg(null);
    setIsProcessing(true);
    try {
      const { cups, columnFound } = await extractCupsFromExcel(file);
      if (!columnFound) {
        setResultMsg({ type: 'error', text: `No se ha encontrado la columna "${CUPS_COLUMN_HEADER}" en el Excel. Revisa que el nombre de la cabecera sea exacto.` });
        return;
      }
      if (cups.length === 0) {
        setResultMsg({ type: 'error', text: `La columna "${CUPS_COLUMN_HEADER}" no contiene ningún valor.` });
        return;
      }
      const { matched, error } = await marcarPendientesPorCups(cups);
      if (error) {
        setResultMsg({ type: 'error', text: 'Error al actualizar la base de datos. Inténtalo de nuevo.' });
        return;
      }
      setResultMsg({
        type: 'success',
        text: `${cups.length} CUPS leídos del Excel · ${matched} contrato(s) encontrados y marcados como "Pendiente de tareas"${matched < cups.length ? ` (${cups.length - matched} CUPS no coinciden con ningún contrato)` : ''}.`,
      });
    } catch (err) {
      console.error('Pendientes — extractCupsFromExcel:', err);
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
        <p className="text-sm text-google-gray mt-1">Embudo de incidencias — sube el Excel diario y cruza los contratos por CUPS.</p>
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
              <p className="text-xs font-semibold text-google-blue">Procesando Excel y cruzando con la base de datos...</p>
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
              <p className="text-[11px] text-gray-400 mt-0.5">.xlsx · Busca la columna "{CUPS_COLUMN_HEADER}" y marca esos CUPS como "Pendiente de tareas"</p>
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
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-google-dark">Contratos en el embudo de incidencias</h2>
          <span className="text-[11px] font-semibold text-google-gray bg-gray-100 px-2 py-0.5 rounded-full">{pendientes.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max">
            <thead>
              <tr>
                <th className="table-header">Cliente</th>
                <th className="table-header">Tipo</th>
                <th className="table-header">CUPS</th>
                <th className="table-header">Comercial</th>
                <th className="table-header">Estado Incidencia</th>
                <th className="table-header">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pendientes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-google-gray text-sm">
                    No hay contratos pendientes de incidencia. Sube un Excel para empezar.
                  </td>
                </tr>
              ) : (
                pendientes.map(c => (
                  <tr key={c.id} className={`transition-colors ${
                    c.estado_incidencia === 'Tramitado' ? 'bg-orange-100 hover:bg-orange-200' : 'hover:bg-google-bg'
                  }`}>
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">{c.nombre}</td>
                    <td className="table-cell text-google-gray text-xs">{(c.tipo === 'CUR' || c.tipo === 'CUR_B2B') ? 'CUR' : c.tipo}</td>
                    <td className="table-cell text-google-gray font-mono text-xs">{c.cups || '—'}</td>
                    <td className="table-cell text-google-gray text-xs">{c.comercial || '—'}</td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${
                        c.estado_incidencia === 'Tramitado' ? 'bg-orange-200 text-orange-800' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {c.estado_incidencia}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        {c.estado_incidencia === 'Pendiente de tareas' && (
                          <button
                            onClick={() => tramitarIncidencia(c.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-orange-300 bg-orange-50 text-orange-700 text-xs font-medium hover:bg-orange-100 transition-colors whitespace-nowrap"
                            title="Marcar como tramitado"
                          >
                            <Wrench size={13} /> Tramitar
                          </button>
                        )}
                        <button
                          onClick={() => formalizarIncidencia(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-green-300 bg-green-50 text-green-700 text-xs font-medium hover:bg-green-100 transition-colors whitespace-nowrap"
                          title="Formalizar y sacar del embudo"
                        >
                          <FileCheck size={13} /> Formalizar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
