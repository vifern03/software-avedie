import { useState, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Upload, FileText, Printer, Download, X, AlertTriangle, Loader2, Factory, Info, CheckCircle2, Ban } from 'lucide-react';
import { exportElementToPdf, slugifyFilename } from '../lib/exportPdf';
import { OPEN_30TD, OPEN_61TD, SIMPLY_30TD, SIMPLY_61TD, INDEXADA_30TD, INDEXADA_61TD } from '../data/tarifasB2B';
import { calcularOfertaLuz, calcularAhorro, extrapolarAnual, ESTADO, FRANJAS_P6, tramosPorPotencia } from '../lib/energia/motor';
import { PROMPT_EXTRACCION_LUZ, validarExtraccion, parsearRespuestaModelo } from '../lib/energia/extraccion';
import { parsearCurvaCSV } from '../lib/energia/curva';
import { extraerFactura, ExtraccionTimeout, ESPERA_MAX_MS } from '../lib/energia/geminiCliente';
import { estadoVigencia, ETIQUETA_ESTADO, fmtFechaES, hoyMadridISO } from '../lib/energia/vigencia';

/* ── Constantes ──────────────────────────────────────────────────────────────── */

/* Gemini 2.5 Pro con thinkingBudget 128: 17–22 s en facturas reales de 3–4 páginas
   (25/25 campos correctos). Espera máxima 45 s (ver geminiCliente.js). */
const PERIODS = [1, 2, 3, 4, 5, 6];

const CATALOGO = {
  '30': { open: OPEN_30TD, simply: SIMPLY_30TD, indexada: INDEXADA_30TD },
  '61': { open: OPEN_61TD, simply: SIMPLY_61TD, indexada: INDEXADA_61TD },
};
const NIVELES = [
  { id: '30', label: '3.0TD', sub: 'Baja tensión > 15 kW' },
  { id: '61', label: '6.1TD', sub: 'Alta tensión (Open hasta 450 kW)' },
];
const PRODUCTOS = [
  { id: 'open', label: 'Open' },
  { id: 'simply', label: 'Simply (autoconsumo)' },
  { id: 'indexada', label: 'Indexada OMIE' },
];

function estimateExtractionSeconds(bytes) {
  return Math.min(40, Math.round(20 + (bytes / (500 * 1024)) * 2));
}

function n(v, fb = 0) {
  if (v === null || v === undefined) return fb;
  const s = String(v).trim().replace(/\s/g, '');
  if (!s) return fb;
  // "1.200" o "27.263" = miles (formato español); "0.153" o "1,5" = decimales.
  const t = s.includes(',') ? s.replace(/\./g, '').replace(',', '.')
    : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s;
  const x = parseFloat(t);
  return isNaN(x) ? fb : x;
}
const eur = (v) => (v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
const kwhFmt = (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' kWh';

function PBadge({ p }) {
  const colors = { P1: 'bg-blue-600', P2: 'bg-blue-500', P3: 'bg-blue-400', P4: 'bg-blue-300', P5: 'bg-blue-200 !text-blue-700', P6: 'bg-blue-100 !text-blue-700' };
  return <span className={`text-[10px] font-bold text-white rounded px-1.5 py-0.5 leading-none ${colors[p] || 'bg-gray-400'}`}>{p}</span>;
}

const ESTADO_UI = {
  [ESTADO.OK]: { label: 'Calculada', cls: 'bg-green-100 text-green-700' },
  [ESTADO.DATOS_INSUFICIENTES]: { label: 'Faltan datos', cls: 'bg-amber-100 text-amber-800' },
  [ESTADO.NO_ELEGIBLE]: { label: 'No elegible', cls: 'bg-red-100 text-red-700' },
  [ESTADO.NO_DISPONIBLE]: { label: 'No disponible', cls: 'bg-gray-200 text-gray-700' },
};

const INIT = Object.assign(
  {
    cliente: '', cups: '', asesor: '', asesorLibre: '', notas: '',
    fechaEmision: '', desde: '', hasta: '', dias: '',
    excesos: '0', reactiva: '0', alquiler: '0', bonoSocial: '0',
    facturaActual: '', otrosNoComparables: '0', iva: '0.21',
    excedentesKwh: '0', omie: '',
  },
  ...PERIODS.map(i => ({ [`kwhP${i}`]: '', [`kwPotP${i}`]: '', [`kwMaxP${i}`]: '' })),
  ...FRANJAS_P6.map(f => ({ [`p6_${f.id}`]: '' })),
);

/* ══════════════════════════════════════════════════════════════════════════════ */

export default function EstudioComparativoB2B() {
  const { users } = useAuth();

  const [nivel, setNivel] = useState('30');
  const [productoId, setProductoId] = useState('open');
  const [modalidadId, setModalidadId] = useState('plana');
  const [autoconsumo, setAutoconsumo] = useState(false);
  // Tramo comercial elegido por el comercial, por nivel. Independiente de las potencias P1–P6.
  const [tramoSel, setTramoSel] = useState({ '30': null, '61': null });
  const [form, setForm] = useState(INIT);
  const [curvaInfo, setCurvaInfo] = useState(null); // { nombre, curva, errores }
  const [incidencias, setIncidencias] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [dropped, setDropped] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [pdfError, setPdfError] = useState('');
  const fileRef = useRef(null);
  const curvaRef = useRef(null);
  const countdownRef = useRef(null);

  const set = k => e => {
    setForm(f => ({ ...f, [k]: e.target.value }));
    // Al editar una potencia, el tramo vuelve a calcularse automáticamente (Pc = máx P1–P6).
    if (k.startsWith('kwPotP')) setTramoSel({ '30': null, '61': null });
  };

  /* ════════════ EXTRACCIÓN IA ════════════ */

  async function extractFromInvoice(file) {
    const estimated = estimateExtractionSeconds(file.size);
    setEstimatedSeconds(estimated);
    setRemainingSeconds(estimated);
    setIsExtracting(true);
    setExtractionDone(false);
    setExtractionError('');
    setIncidencias([]);
    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => setRemainingSeconds(s => Math.max(0, s - 1)), 1000);
    try {
      const { datos: ex } = await extraerFactura(file, { prompt: PROMPT_EXTRACCION_LUZ, parse: parsearRespuestaModelo });
      const v = validarExtraccion(ex);
      const d = v.datos;
      setIncidencias(v.incidencias);

      if (d.tarifaAcceso === '2.0TD') {
        setExtractionError('La factura es 2.0TD: usa la pestaña "Comparativas 2.0". No se han volcado datos.');
        return;
      }
      if (d.tarifaAcceso === '6.1TD') setNivel('61');
      else if (d.tarifaAcceso === '3.0TD') setNivel('30');

      const ivaPct = d.importes.ivaPct;
      const ivaRate = ivaPct != null ? ivaPct / 100 : n(form.iva, 0.21);
      setForm(f => {
        const next = { ...f };
        PERIODS.forEach((p, i) => {
          next[`kwhP${p}`] = d.kwhPeriodo[i] != null ? String(d.kwhPeriodo[i]) : '0';
          next[`kwPotP${p}`] = d.potenciasKw[i] != null ? String(d.potenciasKw[i]) : '';
          next[`kwMaxP${p}`] = d.maximetrosKw[i] != null ? String(d.maximetrosKw[i]) : '';
        });
        next.cliente = d.titular || f.cliente;
        next.cups = d.cups || f.cups;
        next.fechaEmision = d.fechaEmision || '';
        next.desde = d.periodo.desde || '';
        next.hasta = d.periodo.hasta || '';
        next.dias = d.dias != null ? String(d.dias) : '';
        next.excesos = String(d.importes.excesos ?? 0);
        next.reactiva = String(d.importes.reactiva ?? 0);
        next.alquiler = String(d.importes.alquiler ?? 0);
        next.bonoSocial = String(d.importes.bonoSocial ?? 0);
        next.facturaActual = d.importes.total != null ? String(d.importes.total) : '';
        next.otrosNoComparables = d.importes.otrosServicios ? String(Math.round(d.importes.otrosServicios * (1 + ivaRate) * 100) / 100) : '0';
        next.iva = String(ivaRate);
        next.excedentesKwh = String(d.excedentesKwh ?? 0);
        FRANJAS_P6.forEach(fr => { next[`p6_${fr.id}`] = ''; });
        return next;
      });
      if ((d.excedentesKwh || 0) > 0) setAutoconsumo(true);
      setTramoSel({ '30': null, '61': null }); // tramo automático por Pc = máx(P1–P6)
      setCurvaInfo(null);
      setExtractionDone(true);
    } catch (err) {
      if (err instanceof ExtraccionTimeout) {
        setExtractionError(`No se obtuvo un resultado válido en ${ESPERA_MAX_MS / 1000} s. Pulsa "Reintentar" o introduce los datos manualmente.`);
      } else {
        setExtractionError(err.message?.startsWith('La respuesta') || err.message?.startsWith('El servicio')
          ? err.message
          : 'No se han podido extraer los datos. Revisa el documento o introdúcelos manualmente.');
      }
    } finally {
      clearInterval(countdownRef.current);
      setIsExtracting(false);
    }
  }

  function handleFileUpload(file) {
    if (!file) return;
    setDropped(file);
    extractFromInvoice(file);
  }
  const onDragOver = useCallback(e => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFileUpload(f); };

  async function handleCurva(file) {
    if (!file) return;
    const texto = await file.text();
    const r = parsearCurvaCSV(texto, { desde: form.desde || undefined, hasta: form.hasta || undefined });
    setCurvaInfo({ nombre: file.name, ...r });
  }

  async function handleDownloadPdf() {
    setIsExportingPdf(true);
    setPdfError('');
    try {
      const cliente = form.cliente.trim() || 'informe';
      const fechaCorta = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
      await exportElementToPdf('ecb2b-informe', `Comparativa_${slugifyFilename(cliente)}_${fechaCorta}.pdf`);
    } catch {
      setPdfError('No se pudo generar el PDF. Prueba de nuevo o usa "Imprimir informe".');
    } finally {
      setIsExportingPdf(false);
    }
  }

  /* ════════════ CÁLCULO (motor determinista) ════════════ */

  const producto = CATALOGO[nivel][productoId];
  const hoy = hoyMadridISO();
  const kwhPeriodo = PERIODS.map(i => n(form[`kwhP${i}`]));
  const potenciasKw = PERIODS.map(i => n(form[`kwPotP${i}`]));
  const desgloseLleno = FRANJAS_P6.every(f => form[`p6_${f.id}`] !== '');
  const desgloseP6 = desgloseLleno ? Object.fromEntries(FRANJAS_P6.map(f => [f.id, n(form[`p6_${f.id}`])])) : undefined;
  const curva = curvaInfo?.curva?.length && !curvaInfo.errores.length ? curvaInfo.curva : undefined;
  const periodo = form.desde && form.hasta ? { desde: form.desde, hasta: form.hasta } : undefined;

  const entrada = {
    potenciasKw, dias: n(form.dias), periodo, kwhPeriodo, desgloseP6, curva,
    omie: form.omie === '' ? null : n(form.omie),
    tieneAutoconsumo: autoconsumo, excedentesKwh: n(form.excedentesKwh),
    mantenidos: { excesos: n(form.excesos), reactiva: n(form.reactiva), alquiler: n(form.alquiler), bonoSocial: n(form.bonoSocial) },
    ivaRate: n(form.iva, 0.21), fechaOferta: hoy, 
  };

  const resultadosModalidad = useMemo(() => {
    if (!producto.modalidades) return null;
    return producto.modalidades.map(m => ({ modalidad: m, r: calcularOfertaLuz({ ...entrada, producto, modalidadId: m.id, tramoIdx: tramoSel[nivel] }) }));
  }, [JSON.stringify(entrada), productoId, nivel, tramoSel[nivel]]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultado = producto.modalidades
    ? resultadosModalidad.find(x => x.modalidad.id === modalidadId)?.r
    : calcularOfertaLuz({ ...entrada, producto });

  const mejor = resultadosModalidad
    ? resultadosModalidad.filter(x => x.r.estado === ESTADO.OK).sort((a, b) => a.r.total - b.r.total)[0]
    : null;

  const factActual = n(form.facturaActual);
  const otros = n(form.otrosNoComparables);
  const costeActual = factActual - otros;
  const ok = resultado?.estado === ESTADO.OK;
  const ahorro = ok ? calcularAhorro(costeActual, resultado.total) : { ahorroEur: null, ahorroPct: null };
  const extrap = ok ? extrapolarAnual(ahorro.ahorroEur, entrada.dias) : null;
  const isReady = factActual > 0 && entrada.dias > 0 && kwhPeriodo.some(x => x > 0) && potenciasKw.some(x => x > 0);

  const modalidadSel = producto.modalidades?.find(m => m.id === modalidadId);
  const vig = estadoVigencia(producto.contratacion, hoy);
  const asesorDisplay = form.asesor === '__otro__' ? form.asesorLibre : form.asesor;
  const today = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
  const tituloOferta = producto.modalidades ? `${producto.nombre} — ${modalidadSel?.label}` : producto.nombre;
  const incidenciasVisibles = incidencias.filter(i => i.nivel !== 'info');
  const incidenciasInfo = incidencias.filter(i => i.nivel === 'info');

  /* ════════════ RENDER ════════════ */

  return (
    <>
      <style>{`
        @media print {
          @page { margin: 12mm; size: A4 portrait; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      `}</style>

      <div className="grid grid-cols-1 xl:grid-cols-[480px_1fr] gap-6 items-start print:block">

        {/* ── COLUMNA IZQUIERDA ── */}
        <div className="space-y-4 print:hidden">

          {isReady && (
            <div className="flex gap-3 justify-end">
              <button onClick={handleDownloadPdf} disabled={isExportingPdf}
                className="flex items-center gap-2 bg-white border border-google-border text-google-dark text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-wait">
                {isExportingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {isExportingPdf ? 'Generando PDF…' : 'Descargar'}
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-2 bg-google-dark text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors">
                <Printer size={15} /> Imprimir informe
              </button>
            </div>
          )}
          {pdfError && <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{pdfError}</p>}

          {/* 1 · Factura */}
          <section className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">1 · Factura del cliente</p>
              <span className="text-[10px] font-semibold text-google-blue bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">Extracción IA + validación</span>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${isExtracting ? 'border-blue-300 bg-blue-50 cursor-wait' : dragging ? 'border-google-blue bg-blue-50 cursor-copy' : 'border-gray-200 bg-gray-50 hover:border-blue-300 cursor-pointer'}`}
              onDragOver={!isExtracting ? onDragOver : undefined}
              onDragLeave={!isExtracting ? onDragLeave : undefined}
              onDrop={!isExtracting ? onDrop : undefined}
              onClick={() => { if (!isExtracting) fileRef.current?.click(); }}
            >
              <input ref={fileRef} id="ecb2b-factura" type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-2 w-full">
                  <Loader2 size={26} className="text-google-blue animate-spin" />
                  <p className="text-xs font-semibold text-google-blue">Analizando factura con IA…</p>
                  <p className="text-[11px] text-blue-400">{remainingSeconds > 0 ? `Tiempo estimado: ${remainingSeconds} s` : 'Casi listo…'}</p>
                  <div className="h-1.5 w-full max-w-[240px] bg-blue-100 rounded-full overflow-hidden">
                    <div className="h-full bg-google-blue rounded-full transition-all duration-500 ease-linear"
                      style={{ width: `${estimatedSeconds > 0 ? Math.min(96, ((estimatedSeconds - remainingSeconds) / estimatedSeconds) * 100) : 0}%` }} />
                  </div>
                </div>
              ) : dropped ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={16} className="text-google-blue flex-shrink-0" />
                  <span className="text-sm font-medium text-google-dark truncate max-w-[220px]">{dropped.name}</span>
                  <button type="button" className="text-gray-400 hover:text-red-500" onClick={e => { e.stopPropagation(); setDropped(null); setExtractionDone(false); setExtractionError(''); }}><X size={14} /></button>
                </div>
              ) : (
                <><Upload size={18} className="mx-auto mb-2 text-gray-400" /><p className="text-xs text-google-gray">Arrastra la factura 3.0TD / 6.1TD o <span className="text-google-blue underline">selecciona un archivo</span></p></>
              )}
            </div>
            {extractionDone && !isExtracting && (
              <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mt-3">
                <strong>Revisión obligatoria:</strong> la IA solo transcribe; los importes se validan y calculan con código. Revisa cada campo antes de presentar el estudio.
              </p>
            )}
            {extractionError && !isExtracting && (
              <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 flex items-center justify-between gap-3">
                <span>{extractionError}</span>
                {dropped && <button type="button" id="ecb2b-reintentar" onClick={() => extractFromInvoice(dropped)} className="flex-shrink-0 px-2.5 py-1 rounded-md border border-red-300 bg-white font-semibold hover:bg-red-100">Reintentar</button>}
              </div>
            )}
            {incidenciasVisibles.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {incidenciasVisibles.map((i, k) => (
                  <li key={k} className={`text-[11px] rounded-lg px-3 py-2 border ${i.nivel === 'error' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                    <strong>{i.nivel === 'error' ? 'Error' : 'Aviso'}:</strong> {i.mensaje}
                  </li>
                ))}
              </ul>
            )}
            {incidenciasInfo.length > 0 && (
              <ul className="mt-2 space-y-1">
                {incidenciasInfo.map((i, k) => <li key={k} className="text-[10px] text-google-gray flex gap-1.5"><Info size={11} className="flex-shrink-0 mt-0.5" />{i.mensaje}</li>)}
              </ul>
            )}
          </section>

          {/* 2 · Oferta */}
          <section className="bg-white border border-google-border rounded-xl shadow-sm p-5 space-y-3">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">2 · Oferta Endesa a comparar</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1.5 block">Tarifa de acceso</label>
                <div className="flex rounded-lg overflow-hidden border border-google-border">
                  {NIVELES.map(nv => (
                    <button key={nv.id} type="button" onClick={() => setNivel(nv.id)}
                      className={`flex-1 py-2 text-xs font-medium ${nivel === nv.id ? 'bg-gray-800 text-white' : 'bg-white text-google-gray hover:bg-gray-50'}`}>{nv.label}</button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{NIVELES.find(x => x.id === nivel).sub}</p>
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1.5 block">Producto</label>
                <select value={productoId} onChange={e => setProductoId(e.target.value)} className="input-field text-sm" id="ecb2b-producto">
                  {PRODUCTOS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
            {producto.modalidades && (
              <div>
                <p className="text-[10px] font-medium text-google-gray mb-1.5">Modalidad Open</p>
                <div className="flex flex-wrap gap-2">
                  {producto.modalidades.map(m => (
                    <button key={m.id} type="button" onClick={() => setModalidadId(m.id)} title={m.desc}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${modalidadId === m.id ? 'bg-google-blue text-white border-google-blue' : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue'}`}>
                      {m.label} <span className="opacity-75">({m.dto}% + {producto.extraAnyo}%)</span>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-google-gray mt-2">
                  {modalidadSel?.label}: precio Open en {modalidadSel?.periodosOpen.map(x => 'P' + x).join(', ')}{modalidadSel?.periodosOpen.length < 6 ? '; resto de periodos a precio No Open' : ''}.
                </p>
                {ok && resultado.tramo && (
                  <p className="text-[11px] text-google-dark mt-1">
                    Tramo de potencia: <strong>{resultado.tramo}</strong> · Open {resultado.precioOpen.toLocaleString('es-ES', { minimumFractionDigits: 6 })} €/kWh · No Open {resultado.precioNoOpen.toLocaleString('es-ES', { minimumFractionDigits: 6 })} €/kWh
                  </p>
                )}
              </div>
            )}
            {productoId === 'indexada' && (
              <div>
                <label htmlFor="ecb2b-omie" className="text-[10px] font-medium text-google-gray mb-1 block">OMIE medio del periodo facturado (€/kWh) *</label>
                <input id="ecb2b-omie" type="text" inputMode="decimal" value={form.omie} onChange={set('omie')} placeholder="p. ej. 0,065" className="input-field text-sm w-40" />
              </div>
            )}
            {productoId === 'simply' && (
              <label className="flex items-center gap-2 text-xs text-google-dark">
                <input type="checkbox" checked={autoconsumo} onChange={e => setAutoconsumo(e.target.checked)} id="ecb2b-autoconsumo" />
                El suministro tiene autoconsumo instalado (requisito de Simply)
              </label>
            )}
            {producto.tramos && (
              <div>
                <p className="text-[10px] font-medium text-google-gray mb-1.5">Tramo comercial de potencia (Pc) *</p>
                <div className="flex flex-wrap gap-2">
                  {producto.tramos.map((t, i) => (
                    <button key={t.label} type="button" id={`ecb2b-tramo${i}`}
                      onClick={() => setTramoSel(ts => ({ ...ts, [nivel]: i }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${tramoSel[nivel] === i || (tramoSel[nivel] == null && resultado?.tramo === t.label) ? 'bg-google-blue text-white border-google-blue' : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-google-gray mt-1.5 leading-snug">
                  Se aplica automáticamente el tramo de Pc = máx(P1–P6). El término de potencia usa los kW de cada periodo.
                </p>
                {potenciasKw.some(x => x > 0) && (
                  <p className="text-[10px] text-google-dark mt-1" id="ecb2b-tramos-potencia">
                    Según cada potencia: {tramosPorPotencia(producto, potenciasKw).map(x => `${x.p} ${x.kw} kW → ${x.label}`).join(' · ')}
                  </p>
                )}
              </div>
            )}
            {ok && resultado.simulacion === 'fuera_limite' && (
              <p className="text-[10px] text-google-gray" id="ecb2b-nota-simulacion">
                {resultado.avisos.find(a => a.startsWith('Simulación con precios del tramo'))}
              </p>
            )}
            {resultado?.fueraDeAmbito && !ok && (
              <p className="text-[11px] text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2" id="ecb2b-fuera-ambito">
                <strong>Fuera del ámbito de esta oferta.</strong> {resultado.motivos[0]} Puedes seguir comparando con otro producto o tarifa de acceso.
              </p>
            )}
            {vig !== 'vigente' && (
              <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
                <strong>{ETIQUETA_ESTADO[vig]}.</strong> {producto.contratacion?.incidencia || `Ventana de contratación: ${producto.validez}.`}
              </p>
            )}
            <p className="text-[10px] text-gray-400">Contratación: {producto.validez} · Fuente: {producto.contratacion?.fuente}</p>
          </section>

          {/* 3 · Consumo y potencia */}
          <section className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">3 · Consumo facturado y potencia por periodo</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div><label htmlFor="ecb2b-desde" className="text-[10px] font-medium text-google-gray mb-1 block">Consumo desde</label><input id="ecb2b-desde" type="date" value={form.desde} onChange={set('desde')} className="input-field text-xs" /></div>
              <div><label htmlFor="ecb2b-hasta" className="text-[10px] font-medium text-google-gray mb-1 block">Consumo hasta</label><input id="ecb2b-hasta" type="date" value={form.hasta} onChange={set('hasta')} className="input-field text-xs" /></div>
              <div><label htmlFor="ecb2b-dias" className="text-[10px] font-medium text-google-gray mb-1 block">Días facturados *</label><input id="ecb2b-dias" type="text" inputMode="decimal" value={form.dias} onChange={set('dias')} className="input-field text-xs" /></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-google-gray">
                    <th className="text-left px-1 py-1 font-medium">Periodo</th>
                    <th className="text-left px-1 py-1 font-medium">kWh facturados</th>
                    <th className="text-left px-1 py-1 font-medium">Pot. contratada (kW)</th>
                    <th className="text-left px-1 py-1 font-medium">Maxímetro (kW)</th>
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map(i => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-1 py-1.5"><PBadge p={`P${i}`} /></td>
                      <td className="px-1 py-1.5"><input id={`ecb2b-kwh${i}`} type="text" inputMode="decimal" value={form[`kwhP${i}`]} onChange={set(`kwhP${i}`)} className="input-field text-xs py-1.5" /></td>
                      <td className="px-1 py-1.5"><input id={`ecb2b-pot${i}`} type="text" inputMode="decimal" value={form[`kwPotP${i}`]} onChange={set(`kwPotP${i}`)} className="input-field text-xs py-1.5" /></td>
                      <td className="px-1 py-1.5"><input id={`ecb2b-max${i}`} type="text" inputMode="decimal" value={form[`kwMaxP${i}`]} onChange={set(`kwMaxP${i}`)} className="input-field text-xs py-1.5" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2">El maxímetro es informativo (del periodo facturado, no del año móvil). Los excesos de potencia se trasladan desde la factura (sección 5).</p>
          </section>

          {/* 4 · Horas Open */}
          {producto.modalidades && (
            <section className="bg-white border border-google-border rounded-xl shadow-sm p-5 space-y-3">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">4 · Reparto horas Open / No Open</p>
              <p className="text-[11px] text-google-gray leading-snug">
                Por defecto el reparto es por periodos: Plana, todos a precio Open; Día y Laboral, P1–P5 a precio Open
                y P6 a No Open; Fin de Semana y Noche, P6 a precio Open y P1–P5 a No Open. Opcional: con la curva
                horaria o el desglose del P6 se calcula hora a hora según las franjas del PDF.
              </p>
              <div>
                <input ref={curvaRef} id="ecb2b-curva" type="file" accept=".csv,.txt" className="hidden" onChange={e => { handleCurva(e.target.files[0]); e.target.value = ''; }} />
                <button type="button" onClick={() => curvaRef.current?.click()} className="text-xs font-medium text-google-blue border border-blue-200 bg-blue-50 rounded-lg px-3 py-1.5 hover:bg-blue-100">
                  Cargar curva horaria (CSV Datadis / distribuidora)
                </button>
                {curvaInfo && (
                  <div className="mt-2 text-[11px]">
                    <p className="text-google-dark">{curvaInfo.nombre}: {curvaInfo.curva.length} horas dentro del periodo.
                      <button type="button" className="ml-2 text-red-500" onClick={() => setCurvaInfo(null)}>Quitar</button></p>
                    {curvaInfo.errores.slice(0, 3).map((e, k) => <p key={k} className="text-red-700">{e}</p>)}
                  </div>
                )}
              </div>
              <div>
                <p className="text-[10px] font-medium text-google-gray mb-1.5">…o desglose del P6 (opcional, cálculo hora a hora) · P6 facturado: ({kwhFmt(kwhPeriodo[5])})</p>
                <div className="grid grid-cols-2 gap-2">
                  {FRANJAS_P6.map(f => (
                    <div key={f.id}>
                      <label htmlFor={`ecb2b-p6-${f.id}`} className="text-[10px] text-google-gray block mb-0.5">{f.label} (kWh)</label>
                      <input id={`ecb2b-p6-${f.id}`} type="text" inputMode="decimal" value={form[`p6_${f.id}`]} onChange={set(`p6_${f.id}`)} className="input-field text-xs py-1.5" />
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* 5 · Importes de la factura actual */}
          <section className="bg-white border border-google-border rounded-xl shadow-sm p-5 space-y-3">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">5 · Factura actual y conceptos que se mantienen</p>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="ecb2b-total" className="text-[10px] font-medium text-google-gray mb-1 block">Total factura actual (€) *</label><input id="ecb2b-total" type="text" inputMode="decimal" value={form.facturaActual} onChange={set('facturaActual')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-otros" className="text-[10px] font-medium text-google-gray mb-1 block">Conceptos no energéticos en el total (€, IVA incl.)</label><input id="ecb2b-otros" type="text" inputMode="decimal" value={form.otrosNoComparables} onChange={set('otrosNoComparables')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-excesos" className="text-[10px] font-medium text-google-gray mb-1 block">Excesos de potencia (€)</label><input id="ecb2b-excesos" type="text" inputMode="decimal" value={form.excesos} onChange={set('excesos')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-reactiva" className="text-[10px] font-medium text-google-gray mb-1 block">Energía reactiva (€)</label><input id="ecb2b-reactiva" type="text" inputMode="decimal" value={form.reactiva} onChange={set('reactiva')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-alquiler" className="text-[10px] font-medium text-google-gray mb-1 block">Alquiler contador (€)</label><input id="ecb2b-alquiler" type="text" inputMode="decimal" value={form.alquiler} onChange={set('alquiler')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-bono" className="text-[10px] font-medium text-google-gray mb-1 block">Financiación bono social (€)</label><input id="ecb2b-bono" type="text" inputMode="decimal" value={form.bonoSocial} onChange={set('bonoSocial')} className="input-field text-sm" /></div>
              {productoId === 'simply' && (
                <div><label htmlFor="ecb2b-exc" className="text-[10px] font-medium text-google-gray mb-1 block">Excedentes vertidos (kWh)</label><input id="ecb2b-exc" type="text" inputMode="decimal" value={form.excedentesKwh} onChange={set('excedentesKwh')} className="input-field text-sm" /></div>
              )}
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">IVA / IGIC</label>
                <div className="flex rounded-lg overflow-hidden border border-google-border">
                  {[['0.21', '21%'], ['0.1', '10%'], ['0.03', 'IGIC 3%']].map(([v, l]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, iva: v }))}
                      className={`flex-1 py-2 text-xs font-medium ${n(form.iva) === n(v) ? 'bg-google-blue text-white' : 'bg-white text-google-gray hover:bg-blue-50'}`}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 leading-snug">Excesos, reactiva, alquiler y bono social no dependen de la comercializadora: se mantienen iguales en la oferta (no se recalculan) para no inflar el ahorro.</p>
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
              <div><label htmlFor="ecb2b-cliente" className="text-[10px] font-medium text-google-gray mb-1 block">Cliente</label><input id="ecb2b-cliente" type="text" value={form.cliente} onChange={set('cliente')} className="input-field text-sm" /></div>
              <div><label htmlFor="ecb2b-cups" className="text-[10px] font-medium text-google-gray mb-1 block">CUPS</label><input id="ecb2b-cups" type="text" value={form.cups} onChange={set('cups')} className="input-field text-sm font-mono" /></div>
              <div>
                <label htmlFor="ecb2b-asesor" className="text-[10px] font-medium text-google-gray mb-1 block">Asesor</label>
                <select id="ecb2b-asesor" value={form.asesor} onChange={set('asesor')} className="input-field text-sm">
                  <option value="">— Seleccionar —</option>
                  {(users ?? []).map(u => <option key={u.username} value={u.displayName}>{u.displayName}</option>)}
                  <option value="__otro__">Otro (especificar)</option>
                </select>
                {form.asesor === '__otro__' && <input type="text" value={form.asesorLibre} onChange={set('asesorLibre')} className="input-field text-sm mt-2" />}
              </div>
              <div><label htmlFor="ecb2b-notas" className="text-[10px] font-medium text-google-gray mb-1 block">Notas</label><input id="ecb2b-notas" type="text" value={form.notas} onChange={set('notas')} className="input-field text-sm" /></div>
            </div>
            <button type="button" onClick={() => { setForm(INIT); setDropped(null); setExtractionDone(false); setExtractionError(''); setIncidencias([]); setCurvaInfo(null); setAutoconsumo(false); }} className="text-xs text-google-gray hover:text-red-500">Limpiar formulario</button>
          </section>
        </div>

        {/* ── COLUMNA DERECHA — Informe ── */}
        <div className="print:w-full">
          {!isReady ? (
            <div className="bg-white border border-google-border rounded-xl shadow-sm p-12 text-center flex flex-col items-center gap-3 min-h-[300px] justify-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center"><Factory size={26} className="text-gray-600" /></div>
              <p className="text-sm font-semibold text-google-dark">El informe aparecerá aquí</p>
              <p className="text-xs text-google-gray max-w-xs">Necesita días facturados, consumo, potencias contratadas y total de la factura actual.</p>
            </div>
          ) : (
            <div id="ecb2b-informe" className="bg-white border border-google-border rounded-xl shadow-sm overflow-hidden print:border-0 print:shadow-none print:rounded-none">

              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-8 pt-7 pb-6 text-white">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">GRUPO AVEDIE · COMPARATIVA ENERGÉTICA B2B</p>
                    <h3 className="text-xl font-bold leading-tight">{form.cliente || 'Sin nombre'}</h3>
                    {form.cups && <p className="text-xs text-gray-300 font-mono mt-1">{form.cups}</p>}
                  </div>
                  <div className="bg-white rounded-xl px-4 py-3 flex-shrink-0"><img src="/endesa-logo.png" alt="Endesa" className="h-14 w-auto object-contain" /></div>
                </div>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="bg-white/20 px-3 py-1.5 rounded-full font-semibold">{tituloOferta}</span>
                  {ok && resultado.tramo && <span className="bg-white/20 px-3 py-1.5 rounded-full">Tramo {resultado.tramo}</span>}
                  {periodo && <span className="bg-white/20 px-3 py-1.5 rounded-full">Consumo {fmtFechaES(periodo.desde)} – {fmtFechaES(periodo.hasta)}</span>}
                  <span className="bg-white/20 px-3 py-1.5 rounded-full">{entrada.dias} días</span>
                  {form.fechaEmision && <span className="bg-white/20 px-3 py-1.5 rounded-full">Factura emitida {fmtFechaES(form.fechaEmision)}</span>}
                </div>
                <p className="text-xs text-gray-300 mt-3">{today}{asesorDisplay ? ` · ${asesorDisplay}` : ''} · Oferta contratable {producto.validez}</p>
              </div>

              {!ok ? (
                <div className="mx-6 my-6 rounded-xl border border-amber-300 bg-amber-50 px-5 py-4">
                  <p className="text-sm font-bold text-amber-900 flex items-center gap-2"><Ban size={16} /> {ESTADO_UI[resultado.estado].label}: no se muestra coste ni ahorro</p>
                  <ul className="mt-2 space-y-1 text-[12px] text-amber-900 list-disc pl-5">
                    {resultado.motivos.map((m, k) => <li key={k}>{m}</li>)}
                  </ul>
                </div>
              ) : (
                <>
                  <div className="px-6 pt-5 pb-3">
                    <table className="w-full text-sm">
                      <tbody>
                        {resultado.lineas.map((l, k) => (
                          <tr key={k} className="border-b border-gray-50 align-top">
                            <td className="py-1.5 pr-3 text-google-dark">
                              {l.concepto}{l.origen === 'factura_actual' && <span className="text-google-gray"> †</span>}
                              <div className="text-[11px] text-google-gray">{l.detalle}</div>
                            </td>
                            <td className={`py-1.5 text-right tabular-nums font-semibold whitespace-nowrap ${l.importe < 0 ? 'text-green-700' : 'text-google-dark'}`}>{eur(l.importe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-6 py-3 flex justify-between items-center border-t-2 border-gray-200">
                    <span className="font-bold text-google-dark">TOTAL SIMULADO CON ENDESA</span>
                    <span className="text-2xl font-bold text-google-blue tabular-nums">{eur(resultado.total)}</span>
                  </div>

                  <div className="mx-4 mb-4 rounded-xl border border-gray-200 overflow-hidden">
                    <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50">
                      <div className="bg-white rounded-xl p-3 text-center border border-gray-200">
                        <p className="text-[10px] text-google-gray mb-1">Factura actual comparable</p>
                        <p className="text-xl font-bold text-google-dark tabular-nums">{eur(costeActual)}</p>
                        {otros > 0 && <p className="text-[9px] text-google-gray mt-0.5">Total {eur(factActual)} − {eur(otros)} no energéticos</p>}
                      </div>
                      <div className="bg-white rounded-xl p-3 text-center border border-blue-200">
                        <p className="text-[10px] text-google-blue font-medium mb-1">Con Endesa (simulado)</p>
                        <p className="text-xl font-bold text-google-blue tabular-nums">{eur(resultado.total)}</p>
                      </div>
                    </div>
                    <div className={`px-5 py-4 text-center ${ahorro.ahorroEur >= 0 ? 'bg-green-600' : 'bg-red-600'}`}>
                      <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">
                        {ahorro.ahorroEur >= 0 ? 'Ahorro en este periodo facturado' : 'Sobrecoste en este periodo facturado'}
                      </p>
                      <p className="text-3xl font-bold text-white tabular-nums">{eur(Math.abs(ahorro.ahorroEur))}</p>
                      {ahorro.ahorroPct != null && <p className="text-sm text-white/90 mt-1">{Math.abs(ahorro.ahorroPct).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % {ahorro.ahorroEur >= 0 ? 'menos' : 'más'} que la factura actual</p>}
                    </div>
                    {extrap != null && (
                      <p className="text-[11px] text-google-gray px-4 py-2.5 bg-white">
                        Extrapolación lineal a 365 días: {eur(extrap)}. <strong>No es un ahorro anual garantizado</strong>: se basa en un único periodo de {entrada.dias} días; para un estudio anual se necesitan 12 facturas o la curva anual.
                      </p>
                    )}
                  </div>
                </>
              )}

              {resultadosModalidad && (
                <div className="px-6 pb-4">
                  <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Modalidades Open con estos datos</p>
                  <table className="w-full text-xs">
                    <tbody>
                      {resultadosModalidad.map(({ modalidad, r }) => (
                        <tr key={modalidad.id} className={`border-b border-gray-50 ${modalidad.id === modalidadId ? 'bg-blue-50/60' : ''}`}>
                          <td className="py-1.5 pr-2 font-medium text-google-dark whitespace-nowrap">{modalidad.label}</td>
                          <td className="py-1.5 pr-2"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${ESTADO_UI[r.estado].cls}`}>{ESTADO_UI[r.estado].label}</span></td>
                          <td className="py-1.5 text-right tabular-nums">{r.estado === ESTADO.OK ? eur(r.total) : <span className="text-google-gray">no comparable</span>}</td>
                          <td className="py-1.5 pl-2 text-right">{mejor?.modalidad.id === modalidad.id && <span className="text-[10px] text-green-700 font-semibold inline-flex items-center gap-1"><CheckCircle2 size={11} />menor coste calculable</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[10px] text-google-gray mt-1.5">Las modalidades no calculables no se comparan ni se recomiendan.</p>
                </div>
              )}

              <div className="px-6 pb-6">
                <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Supuestos y avisos</p>
                <ul className="space-y-1 text-[11px] text-google-dark list-disc pl-5">
                  <li>Simulación: oferta contratable {producto.validez} aplicada al consumo facturado{periodo ? ` del ${fmtFechaES(periodo.desde)} al ${fmtFechaES(periodo.hasta)}` : ''}. No es el precio que se habría contratado entonces ni garantiza el ahorro futuro.</li>
                  <li>Precios Endesa sin impuestos que ya incluyen peajes, cargos y los descuentos publicados; no se vuelven a descontar.</li>
                  <li>† Conceptos mantenidos de la factura actual (no dependen de la comercializadora; no recalculados).</li>
                  {vig !== 'vigente' && <li className="text-amber-800">{ETIQUETA_ESTADO[vig]}{producto.contratacion?.incidencia ? `: ${producto.contratacion.incidencia}` : ''}</li>}
                  {(resultado?.avisos || []).map((a, k) => <li key={`a${k}`} className="text-amber-800">{a}</li>)}
                  {incidenciasVisibles.map((i, k) => <li key={`i${k}`} className="text-amber-800">Factura: {i.mensaje}</li>)}
                  {form.notas && <li>Nota: {form.notas}</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
