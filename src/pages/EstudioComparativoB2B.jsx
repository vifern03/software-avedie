import { useState, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Printer, Download, Factory, Upload, FileText, X, AlertTriangle, Loader2 } from 'lucide-react';
import { OPEN_30TD, OPEN_61TD, INDEXADA_30TD, INDEXADA_61TD } from '../data/tarifasB2B';
import { exportElementToPdf, slugifyFilename } from '../lib/exportPdf';

/* ── Constantes ──────────────────────────────────────────────────────────────── */

/* Impuesto Especial sobre la Electricidad — tipo vigente 5,113% (idéntico a Comparativas 2.0) */
const IE_RATE = 0.05113;

const PROXY_URL = '/api/gemini';

/* Timeout de seguridad: si Gemini no responde en este tiempo, se aborta la petición
   y se muestra un error en vez de dejar la carga colgada indefinidamente. */
const EXTRACTION_TIMEOUT_MS = 25000;

/* Estimación de tiempo de extracción proporcional al peso del archivo (no inventada):
   tiempo base de 4s (latencia fija de red + arranque del modelo) + 1.5s por cada
   500KB de archivo (el tiempo que tarda Gemini en "leer" más páginas/resolución). */
function estimateExtractionSeconds(fileSizeBytes) {
  const BASE_SECONDS = 4;
  const SECONDS_PER_500KB = 1.5;
  const chunks = fileSizeBytes / (500 * 1024);
  return Math.round(BASE_SECONDS + chunks * SECONDS_PER_500KB);
}

const NIVELES = [
  { id: '30', label: '3.0TD', sub: 'Negocios 15–100+ kW' },
  { id: '61', label: '6.1TD', sub: 'Alta Tensión hasta 450 kW' },
];

const TIPOS = [
  { id: 'open',     label: 'Fija / Open' },
  { id: 'indexada', label: 'Indexada a OMIE' },
];

const PERIODS = [1, 2, 3, 4, 5, 6];

/* ── Helpers ─────────────────────────────────────────────────────────────────── */

function n(v, fb = 0) {
  const x = parseFloat(String(v ?? '').replace(',', '.'));
  return isNaN(x) ? fb : x;
}

function eur(v) {
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function pct(v, d = 1) {
  return (v * 100).toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
}

function tarifaOpen(nivel) { return nivel === '30' ? OPEN_30TD : OPEN_61TD; }
function tarifaIndexada(nivel) { return nivel === '30' ? INDEXADA_30TD : INDEXADA_61TD; }

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
}

/* ── Prompt extracción IA ────────────────────────────────────────────────────── */

const B2B_EXTRACTION_PROMPT = `Analiza esta factura eléctrica española de un suministro 3.0TD o 6.1TD (tarifa de acceso con 6 periodos P1-P6, típica de negocios/industria) y extrae los siguientes datos.
Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin bloques de código.
El JSON debe tener exactamente estos campos (usa null para strings no encontrados y 0 para números no encontrados):

{
  "nombreCliente": "razón social o nombre completo del titular",
  "cups": "código CUPS limpio: extrae SOLO los 20-22 caracteres alfanuméricos que empiezan por ES (elimina espacios, saltos de línea y guiones)",
  "peajeAcceso": "3.0TD" o "6.1TD" — lee el campo "Peaje de acceso a la red (ATR)" o "Tarifa de acceso"/"Tarifa" de la factura,
  "diasFacturacion": número entero de días del período de facturación,
  "kwhP1": kWh de energía activa CONSUMIDA DE LA RED en el periodo P1 de este período de facturación (0 si no aparece o es 0),
  "kwhP2": ídem periodo P2,
  "kwhP3": ídem periodo P3,
  "kwhP4": ídem periodo P4,
  "kwhP5": ídem periodo P5,
  "kwhP6": ídem periodo P6,
  "kwPotContratadaP1": kW de potencia contratada en el periodo P1. Muy frecuentemente la factura muestra una única lista de 6 números separados por "/" (ej. "Potencia contratada (kW): 35 / 51 / 51 / 51 / 51 / 51") — en ese caso el primer número es P1, el segundo P2, y así sucesivamente hasta P6,
  "kwPotContratadaP2": ídem periodo P2,
  "kwPotContratadaP3": ídem periodo P3,
  "kwPotContratadaP4": ídem periodo P4,
  "kwPotContratadaP5": ídem periodo P5,
  "kwPotContratadaP6": ídem periodo P6,
  "kwPotMaximaP1": kW de "Maxímetro" o "Potencia Máxima Demandada" EN ESTE PERIODO DE FACTURACIÓN (tabla de consumos/lecturas del periodo), para P1. IMPORTANTE: no uses la frase "Sus potencias máximas demandadas en el último año han sido..." — eso es un dato ANUAL distinto y NO debe usarse aquí. Usa 0 si no aparece el maxímetro de este periodo,
  "kwPotMaximaP2": ídem periodo P2,
  "kwPotMaximaP3": ídem periodo P3,
  "kwPotMaximaP4": ídem periodo P4,
  "kwPotMaximaP5": ídem periodo P5,
  "kwPotMaximaP6": ídem periodo P6,
  "importeTotalFactura": importe TOTAL A PAGAR de la factura en euros (el importe final con todos los impuestos y conceptos incluidos, tal cual figura en "TOTAL IMPORTE FACTURA"),
  "costeBonoSocial": importe del bono social en euros (0 si no aparece),
  "costeAlquilerContador": coste del alquiler del equipo de medida en euros (0 si no aparece),
  "tipoIVA": tipo de IVA en formato decimal. Localiza la línea con formato "IVA X % s/YY,YY €  ZZ,ZZ €": X es el PORCENTAJE, conviértelo a decimal (21→0.21, 10→0.10, 7→0.07). ZZ,ZZ es el importe en euros — NUNCA lo uses como tipo.
}

════════ REGLAS OBLIGATORIAS — MERCADO ELÉCTRICO ESPAÑOL (3.0TD / 6.1TD) ════════

REGLA 1 — IVA ELÉCTRICO: lee SIEMPRE el porcentaje impreso en la línea de IVA de la factura y conviértelo a decimal (21% general, 10% en periodos con reducción temporal activa, 7% IGIC en Canarias). No asumas un valor fijo.

REGLA 2 — CUPS: los caracteres del CUPS pueden tener "O" (letra) en vez de "0" (cero) por OCR. Las posiciones 3-6 son SIEMPRE dígitos numéricos (ej. "ES0021", no "ESOO21").

REGLA 3 — CONSUMO POR PERIODO: rellena kwhP1-kwhP6 con el consumo de energía activa de la red de cada periodo tal cual aparece en el desglose "Energía consumida" o "Consumos". Es habitual que P1, P2 y/o P3 sean 0 kWh (suministros industriales que solo consumen en periodos valle/nocturnos) — en ese caso pon 0, no null.

REGLA 4 — POTENCIA CONTRATADA: normalmente aparece como una única línea con 6 valores (uno por periodo, en orden P1→P6), o bien desglosada en la tabla de "Potencia facturada". Usa siempre el valor específico de cada periodo, nunca un valor único repetido si la factura da 6 valores distintos.

REGLA 5 — POTENCIA MÁXIMA DEMANDADA (maxímetro): es un dato informativo de la tabla de lecturas de ESTE periodo de facturación (columna "Maxímetro" o "Consumo/Potencia" en la fila "Maxímetro P1".."P6"). Distíntalo claramente del dato anual "Sus potencias máximas demandadas en el último año..." que NO debe usarse para estos campos.

REGLA 6 — IMPORTE TOTAL: usa el importe TOTAL FINAL a pagar (el que incluye energía, potencia, impuestos y cualquier cargo adicional como energía reactiva o regularizaciones — no los desglose, solo el total final de la factura).

REGLA 7 — PEAJE DE ACCESO: identifica si la factura es 3.0TD o 6.1TD a partir del campo "Peaje de acceso a la red (ATR)" o equivalente. Si no aparece explícitamente, infiere por la potencia contratada (por encima de ~450 kW o mención expresa de Alta Tensión → 6.1TD; si no, 3.0TD).`;

/* ── Mini componentes ────────────────────────────────────────────────────────── */

function MiniToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? 'bg-google-blue' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function PBadge({ p }) {
  const colors = {
    P1: 'bg-blue-600', P2: 'bg-blue-500', P3: 'bg-blue-400',
    P4: 'bg-blue-300', P5: 'bg-blue-200 !text-blue-700', P6: 'bg-blue-100 !text-blue-700',
  };
  return (
    <span className={`text-[10px] font-bold text-white rounded px-1.5 py-0.5 leading-none ${colors[p] || 'bg-gray-400'}`}>
      {p}
    </span>
  );
}

/* ── Estado inicial ──────────────────────────────────────────────────────────── */

const INIT = Object.assign(
  {
    dias: '',
    cliente: '', cups: '',
    bonoSocial: '0', alquilerContador: '0',
    compensacionExcedentes: '0',
    facturaActual: '',
    dtoCupones: '0',
    asesor: '', asesorLibre: '',
    iva: '0.21',
    descuento: '0',
    notas: '',
    // Precio medio de OMIE en junio de 2026: 69,59 €/MWh = 0,06959 €/kWh. Editable por el asesor.
    omie: '0.06959',
  },
  ...PERIODS.map(i => ({ [`kwhP${i}`]: '0', [`kwPotP${i}`]: '', [`kwMaxP${i}`]: '0' })),
);

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE
   ══════════════════════════════════════════════════════════════════════════════ */

export default function EstudioComparativoB2B() {
  const { users } = useAuth();

  const [nivel, setNivel]     = useState('30');
  const [tipo, setTipo]       = useState('open');
  const [potIdx, setPotIdx]   = useState(0);
  const [modalIdx, setModalIdx] = useState(0);
  const [compExcActiva, setCompExcActiva] = useState(true);
  const [form, setForm]       = useState(INIT);
  const [dragging, setDragging]             = useState(false);
  const [dropped, setDropped]               = useState(null);
  const [isExtracting, setIsExtracting]     = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const fileRef = useRef(null);
  const countdownRef = useRef(null);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  /* ════════════ EXTRACCIÓN IA ════════════ */

  async function extractFromInvoice(file) {
    const estimated = estimateExtractionSeconds(file.size);
    setEstimatedSeconds(estimated);
    setRemainingSeconds(estimated);
    setIsExtracting(true);
    setExtractionDone(false);
    setExtractionError('');

    clearInterval(countdownRef.current);
    countdownRef.current = setInterval(() => {
      setRemainingSeconds(s => Math.max(0, s - 1));
    }, 1000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: B2B_EXTRACTION_PROMPT,
          history: [
            { role: 'user',  parts: [{ text: 'Actúa como experto en el mercado eléctrico español para suministros de negocio/industria 3.0TD y 6.1TD (6 periodos P1-P6). Extrae datos estructurados de facturas eléctricas y devuelve JSON válido.' }] },
            { role: 'model', parts: [{ text: 'Entendido. Soy experto en facturas eléctricas 3.0TD/6.1TD españolas. Extraeré el consumo, la potencia contratada y la potencia máxima demandada (maxímetro de este periodo, no el dato anual) para cada uno de los 6 periodos P1-P6, identificaré el peaje de acceso (3.0TD/6.1TD) y el tipo de IVA leyendo el porcentaje impreso en la factura. Devolveré exclusivamente el objeto JSON solicitado.' }] },
          ],
          file: { mimeType: file.type || 'application/octet-stream', data: base64 },
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      let raw = data.response.trim();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) raw = fenced[1].trim();
      else { const m = raw.match(/\{[\s\S]*\}/); if (m) raw = m[0]; }

      const ex = JSON.parse(raw);

      if (ex.peajeAcceso) {
        const pa = ex.peajeAcceso.toString().toLowerCase().replace(/\s/g, '');
        if      (pa.includes('6.1') || pa.includes('61td')) setNivel('61');
        else if (pa.includes('3.0') || pa.includes('30td')) setNivel('30');
      }

      let ivaValue = form.iva;
      if (ex.tipoIVA != null) {
        const v = parseFloat(ex.tipoIVA);
        if      (Math.abs(v - 0.10) < 0.005) ivaValue = '0.10';
        else if (Math.abs(v - 0.07) < 0.005) ivaValue = '0.07';
        else                                  ivaValue = '0.21';
      }

      setForm(f => {
        const next = { ...f, iva: ivaValue };
        PERIODS.forEach(i => {
          if (ex[`kwhP${i}`] != null)            next[`kwhP${i}`]  = String(ex[`kwhP${i}`]);
          if (ex[`kwPotContratadaP${i}`] != null) next[`kwPotP${i}`] = String(ex[`kwPotContratadaP${i}`]);
          if (ex[`kwPotMaximaP${i}`] != null)     next[`kwMaxP${i}`] = String(ex[`kwPotMaximaP${i}`]);
        });
        next.cliente          = ex.nombreCliente          || f.cliente;
        next.cups             = ex.cups                   || f.cups;
        next.dias             = ex.diasFacturacion  != null ? String(ex.diasFacturacion)      : f.dias;
        next.facturaActual    = ex.importeTotalFactura != null ? String(ex.importeTotalFactura) : f.facturaActual;
        next.bonoSocial       = ex.costeBonoSocial  != null ? String(ex.costeBonoSocial)      : f.bonoSocial;
        next.alquilerContador = ex.costeAlquilerContador != null ? String(ex.costeAlquilerContador) : f.alquilerContador;
        return next;
      });
      setExtractionDone(true);
    } catch (err) {
      console.error('[EC-B2B] Extracción IA:', err);
      if (err.name === 'AbortError') {
        setExtractionError(`La extracción ha tardado demasiado (más de ${Math.round(EXTRACTION_TIMEOUT_MS / 1000)}s). Revisa el documento o introduce los datos manualmente.`);
      } else {
        setExtractionError('Error al extraer los datos. Revisa el documento o introduce los datos manualmente.');
      }
    } finally {
      clearTimeout(timeoutId);
      clearInterval(countdownRef.current);
      setIsExtracting(false);
    }
  }

  async function handleDownloadPdf() {
    setIsExportingPdf(true);
    try {
      const cliente = form.cliente.trim() || 'informe';
      const fechaCorta = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-');
      await exportElementToPdf('ecb2b-informe', `Comparativa_${slugifyFilename(cliente)}_${fechaCorta}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  }

  function handleFileUpload(file) {
    if (!file) return;
    setDropped(file);
    setExtractionDone(false);
    setExtractionError('');
    extractFromInvoice(file);
  }

  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  /* ════════════ CÁLCULOS ════════════ */

  const asesorDisplay = form.asesor === '__otro__' ? (form.asesorLibre || '') : form.asesor;
  const isIndexada = tipo === 'indexada';

  const openData     = tarifaOpen(nivel);
  const indexadaData = tarifaIndexada(nivel);
  const potenciaTerminos = openData.potenciaTerminos; // idénticos en Open e Indexada (mismo peaje)

  const omie = n(form.omie);
  const modalidad = openData.modalidades[modalIdx];

  // Precio de energía por periodo: en Open, P1-P5 usan el precio de "horas Open" de la
  // modalidad elegida y P6 usa "horas No Open" (validado contra el comparador Excel de
  // referencia: en 3.0TD/6.1TD el periodo P6 —valle, noche/fin de semana— queda fuera de
  // las franjas Open de todas las modalidades). En Indexada, cada periodo tiene su propia
  // fórmula A + B×OMIE.
  const precioOpenBase   = openData.matrix[potIdx][modalIdx];
  const precioNoOpenBase = openData.horasNoOpen[potIdx];

  const dto = n(form.descuento) / 100;

  const precios = PERIODS.map(i => {
    const base = isIndexada
      ? indexadaData.energiaA[`p${i}`] + indexadaData.energiaB[`p${i}`] * omie
      : (i <= 5 ? precioOpenBase : precioNoOpenBase);
    return base * (1 - dto);
  });

  const kwh   = PERIODS.map(i => n(form[`kwhP${i}`]));
  const kwPot = PERIODS.map(i => n(form[`kwPotP${i}`]));
  const kwMax = PERIODS.map(i => n(form[`kwMaxP${i}`]));

  const dias     = n(form.dias);
  const bono     = n(form.bonoSocial);
  const alqCont  = n(form.alquilerContador);
  const factActual = n(form.facturaActual);
  const dtoCup   = n(form.dtoCupones);
  const factBase = factActual; // el cupón/dto de fidelización nunca se aplica: se compara siempre el bruto de la factura
  const ivaRate  = n(form.iva, 0.21);

  const potDiaTerminos = potenciaTerminos.map(t => t.anyo / 365);
  const imtPot = PERIODS.map((_, idx) => kwPot[idx] * dias * potDiaTerminos[idx]);
  const subtotPot = imtPot.reduce((a, b) => a + b, 0);

  const imtEn = PERIODS.map((_, idx) => kwh[idx] * precios[idx]);
  const subtotEn = imtEn.reduce((a, b) => a + b, 0);

  const totalKwh = kwh.reduce((a, b) => a + b, 0);

  // Excedentes: campo manual (no existe hoy ninguna tarifa solar B2B en el catálogo 3.0/6.1).
  const excedentes = compExcActiva ? n(form.compensacionExcedentes) : 0;

  const baseIE  = subtotPot + subtotEn - excedentes + bono;
  const impElec = baseIE * IE_RATE;
  const baseIVA = baseIE + impElec + alqCont;
  const ivaImp  = baseIVA * ivaRate;
  const total   = baseIVA + ivaImp;

  const dif           = factBase - total;
  const ahorroPercent = total > 0 ? (factBase / total - 1) : 0;
  const ahorroAnual   = dias > 0 ? (dif / dias) * 365 : 0;
  const isReady = kwPot[0] > 0 && dias > 0 && factActual > 0 && totalKwh > 0;

  const today      = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long',    year: 'numeric' });

  const tarifaLabel = isIndexada
    ? `Indexada a OMIE ${nivel === '30' ? '3.0TD' : '6.1TD'}`
    : `Open ${nivel === '30' ? '3.0TD' : '6.1TD'} — ${modalidad.label} (${openData.potencias[potIdx]})`;

  /* ══════════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════════ */

  return (
    <>
      {/* CSS impresión */}
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body * { visibility: hidden !important; }
          #ecb2b-informe, #ecb2b-informe * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #ecb2b-informe {
            position: fixed !important;
            inset: 0 !important;
            padding: 14mm 18mm !important;
            background: white !important;
            overflow: visible !important;
          }
        }
      `}</style>

      <div className="grid grid-cols-1 xl:grid-cols-[460px_1fr] gap-6 items-start">

        {/* ── COLUMNA IZQUIERDA ── */}
        <div className="space-y-4">

          <p className="text-xs text-gray-400 leading-relaxed">
            * Puede introducir los valores numéricos usando comas (,) para los decimales.
          </p>

          {isReady && (
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleDownloadPdf}
                disabled={isExportingPdf}
                className="flex items-center gap-2 bg-white border border-google-border text-google-dark text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
              >
                {isExportingPdf ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {isExportingPdf ? 'Generando PDF…' : 'Descargar'}
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 bg-google-dark text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-gray-800 transition-colors"
              >
                <Printer size={15} />
                Imprimir informe
              </button>
            </div>
          )}

          {/* 1 · Tarifa */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">
              1 · Tarifa Endesa a comparar <span className="text-red-400">*</span>
            </p>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1.5 block">Nivel de tensión</label>
                <div className="flex rounded-lg overflow-hidden border border-google-border">
                  {NIVELES.map(nv => (
                    <button key={nv.id} type="button" onClick={() => setNivel(nv.id)}
                      className={`flex-1 py-2 text-xs font-medium transition-colors ${nivel === nv.id ? 'bg-gray-800 text-white' : 'bg-white text-google-gray hover:bg-gray-50'}`}>
                      {nv.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">{NIVELES.find(nv => nv.id === nivel).sub}</p>
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1.5 block">Modalidad de precio</label>
                <div className="flex rounded-lg overflow-hidden border border-google-border">
                  {TIPOS.map(tp => (
                    <button key={tp.id} type="button" onClick={() => setTipo(tp.id)}
                      className={`flex-1 py-2 text-[11px] font-medium transition-colors ${tipo === tp.id ? 'bg-google-blue text-white' : 'bg-white text-google-gray hover:bg-blue-50'}`}>
                      {tp.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {isIndexada ? (
              <div className="pt-3 border-t border-gray-100">
                <label className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5 block">
                  Precio medio OMIE del mes (€/kWh) <span className="text-red-400">*</span>
                </label>
                <input
                  type="text" inputMode="decimal"
                  value={form.omie}
                  onChange={set('omie')}
                  placeholder="Ej. 0,065"
                  className="input-field text-sm w-40"
                />
                <p className="text-[10px] text-google-gray mt-1.5 leading-snug">
                  Precio final de energía por periodo = A + (B × OMIE). Se recalcula automáticamente en todo el informe al modificar este valor.
                </p>
                <p className="text-[10px] text-cyan-600 mt-1">
                  Precargado con el precio medio de OMIE de junio de 2026 (69,59 €/MWh). Puedes modificarlo con el valor del mes que corresponda.
                </p>
              </div>
            ) : (
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div>
                  <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Potencia contratada (bracket tarifario)</p>
                  <div className="flex flex-wrap gap-2">
                    {openData.potencias.map((p, i) => (
                      <button key={i} type="button" onClick={() => setPotIdx(i)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${potIdx === i ? 'bg-google-blue text-white border-google-blue' : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Modalidad Open</p>
                  <div className="flex flex-wrap gap-2">
                    {openData.modalidades.map((m, i) => (
                      <button key={i} type="button" onClick={() => setModalIdx(i)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${modalIdx === i ? 'bg-google-blue text-white border-google-blue' : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'}`}>
                        {m.label} <span className="opacity-75">({m.dto}%)</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-google-gray mt-2 leading-snug">
                    Precio en horas Open (P1-P5): <span className="font-mono font-semibold text-google-dark">{precioOpenBase.toFixed(6)} €/kWh</span> · Horas No Open (P6): <span className="font-mono font-semibold text-google-dark">{precioNoOpenBase.toFixed(6)} €/kWh</span>
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-xs text-google-gray">Comp. excedentes</span>
                <MiniToggle on={compExcActiva} onToggle={() => setCompExcActiva(v => !v)} />
              </div>
              <span className="text-[10px] text-gray-400">Válida: {(isIndexada ? indexadaData : openData).validez}</span>
            </div>
          </div>

          {/* 2 · Factura */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">2 · Factura del cliente</p>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-google-blue bg-blue-50 border border-blue-200 rounded-full px-2 py-0.5">
                <Loader2 size={9} />
                IA · Extracción automática
              </span>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 mb-3">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-snug font-medium">⚠️ Los datos volcados deberán ser revisados minuciosamente para evitar fallos en el estudio.</p>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                isExtracting ? 'border-blue-300 bg-blue-50 cursor-wait'
                : dragging    ? 'border-google-blue bg-blue-50 cursor-copy'
                : 'border-gray-200 bg-gray-50 hover:border-blue-300 cursor-pointer'
              }`}
              onDragOver={!isExtracting ? onDragOver  : undefined}
              onDragLeave={!isExtracting ? onDragLeave : undefined}
              onDrop={!isExtracting ? onDrop : undefined}
              onClick={() => { if (!isExtracting) fileRef.current?.click(); }}
            >
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }} />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-2.5 py-1 w-full">
                  <Loader2 size={28} className="text-google-blue animate-spin" />
                  <div className="w-full max-w-[240px]">
                    <p className="text-xs font-semibold text-google-blue text-center">Analizando documento con IA...</p>
                    <p className="text-[11px] text-blue-400 mt-0.5 text-center">
                      {remainingSeconds > 0 ? `Tiempo estimado: ${remainingSeconds}s` : 'Casi listo…'}
                    </p>
                    <div className="mt-2.5 h-1.5 w-full bg-blue-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-google-blue rounded-full transition-all duration-500 ease-linear"
                        style={{ width: `${estimatedSeconds > 0 ? Math.min(96, ((estimatedSeconds - remainingSeconds) / estimatedSeconds) * 100) : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : dropped ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={16} className="text-google-blue flex-shrink-0" />
                  <span className="text-sm font-medium text-google-dark truncate max-w-[200px]">{dropped.name}</span>
                  <button type="button" className="text-gray-400 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); setDropped(null); setExtractionDone(false); setExtractionError(''); }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <><Upload size={18} className="mx-auto mb-2 text-gray-400" /><p className="text-xs text-google-gray">Arrastra la factura aquí o <span className="text-google-blue underline">selecciona un archivo</span></p><p className="text-[11px] text-gray-400 mt-0.5">PDF, JPG o PNG · Rellena automáticamente los 18 campos de consumo/potencia</p></>
              )}
            </div>
            {extractionDone && !isExtracting && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mt-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-bold text-amber-700 block mb-0.5">⚠️ Atención: Revisión obligatoria</span>Los datos han sido volcados automáticamente mediante IA. Revise todos los campos (incluyendo el nivel 3.0TD/6.1TD detectado) antes de presentar el estudio.</p>
              </div>
            )}
            {extractionError && !isExtracting && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mt-3">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 leading-relaxed">{extractionError}</p>
              </div>
            )}
          </div>

          {/* 3 · Consumo y potencia por periodo */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">3 · Consumo y potencia por periodo (P1–P6)</p>
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-1 py-1 text-[10px] font-medium text-google-gray">Periodo</th>
                    <th className="text-left px-1 py-1 text-[10px] font-medium text-google-gray">Consumo (kWh)</th>
                    <th className="text-left px-1 py-1 text-[10px] font-medium text-google-gray">Pot. contratada (kW)</th>
                    <th className="text-left px-1 py-1 text-[10px] font-medium text-google-gray">Pot. máx. demandada (kW)</th>
                  </tr>
                </thead>
                <tbody>
                  {PERIODS.map(i => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="px-1 py-1.5 align-middle"><PBadge p={`P${i}`} /></td>
                      <td className="px-1 py-1.5"><input type="text" inputMode="decimal" value={form[`kwhP${i}`]} onChange={set(`kwhP${i}`)} placeholder="kWh" className="input-field text-xs py-1.5" /></td>
                      <td className="px-1 py-1.5"><input type="text" inputMode="decimal" value={form[`kwPotP${i}`]} onChange={set(`kwPotP${i}`)} placeholder="kW" className="input-field text-xs py-1.5" /></td>
                      <td className="px-1 py-1.5"><input type="text" inputMode="decimal" value={form[`kwMaxP${i}`]} onChange={set(`kwMaxP${i}`)} placeholder="kW" className="input-field text-xs py-1.5" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 mt-2.5 leading-relaxed">
              La Potencia Máxima Demandada (maxímetro) es solo informativa: identifica sobrepasamientos frente a la potencia contratada actual, pero no forma parte del cálculo del nuevo contrato propuesto.
            </p>
          </div>

          {/* 4 · Días y datos del cliente e impuestos */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">4 · Período, cliente e impuestos</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Días facturados <span className="text-red-400">*</span></label>
                  <input type="text" inputMode="decimal" value={form.dias} onChange={set('dias')} placeholder="días" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">CUPS</label>
                  <input type="text" value={form.cups} onChange={set('cups')} placeholder="ES..." className="input-field text-sm font-mono" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">Nombre / Empresa</label>
                <input type="text" value={form.cliente} onChange={set('cliente')} placeholder="Cliente" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Bono Social (€)</label>
                  <input type="text" inputMode="decimal" value={form.bonoSocial} onChange={set('bonoSocial')} placeholder="0.00" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Alq. Contador (€)</label>
                  <input type="text" inputMode="decimal" value={form.alquilerContador} onChange={set('alquilerContador')} placeholder="0.00" className="input-field text-sm" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">Comp. excedentes (€)</label>
                <input
                  type="text" inputMode="decimal"
                  value={form.compensacionExcedentes}
                  onChange={set('compensacionExcedentes')}
                  disabled={!compExcActiva}
                  placeholder="0.00"
                  className={`input-field text-sm ${!compExcActiva ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
                />
                {!compExcActiva && (
                  <p className="text-[10px] text-gray-400 mt-1 leading-snug">Activa "Comp. excedentes" en la sección 1 para habilitar este campo.</p>
                )}
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">Factura actual — bruta (€) <span className="text-red-400">*</span></label>
                <input type="text" inputMode="decimal" value={form.facturaActual} onChange={set('facturaActual')} placeholder="0.00" className="input-field text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">
                    Dto. fidelización / Cupones (€)
                    <span className="ml-1 text-[9px] text-google-gray font-normal italic">PARA TI, Bienvenida…</span>
                  </label>
                  <input type="text" inputMode="decimal" value={form.dtoCupones} onChange={set('dtoCupones')} placeholder="0.00" className="input-field text-sm" />
                </div>
                <div className="flex items-end">
                  {dtoCup > 0 && factActual > 0 ? (
                    <div className="w-full bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-orange-600 font-medium leading-none mb-0.5">Cupón no aplicado a la comparativa</p>
                      <p className="text-sm font-bold text-orange-700 tabular-nums">−{eur(dtoCup)}</p>
                    </div>
                  ) : (
                    <div className="w-full text-[10px] text-google-gray leading-snug px-1">
                      La comparativa siempre usa el importe bruto de la factura
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Asesor</label>
                  <select value={form.asesor} onChange={set('asesor')} className="input-field text-sm">
                    <option value="">— Seleccionar —</option>
                    {(users ?? []).map(u => <option key={u.username} value={u.displayName}>{u.displayName}</option>)}
                    <option value="__otro__">Otro (especificar)</option>
                  </select>
                  {form.asesor === '__otro__' && <input type="text" value={form.asesorLibre} onChange={set('asesorLibre')} placeholder="Nombre del asesor" className="input-field text-sm mt-2" autoFocus />}
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">IVA / IGIC</label>
                  <div className="flex rounded-lg overflow-hidden border border-google-border">
                    {[['0.21', 'IVA 21%'], ['0.10', 'IVA 10%'], ['0.07', 'IGIC 7%']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setForm(f => ({ ...f, iva: v }))}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${form.iva === v ? 'bg-google-blue text-white' : 'bg-white text-google-gray hover:bg-blue-50'}`}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Dto. adicional sobre energía (%)</label>
                  <input type="text" inputMode="decimal" value={form.descuento} onChange={set('descuento')} placeholder="0" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Notas</label>
                  <input type="text" value={form.notas} onChange={set('notas')} placeholder="Precio fijo, permanencia…" className="input-field text-sm" />
                </div>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-gray-100 flex justify-between items-center">
              <button type="button" onClick={() => { setForm(INIT); setDropped(null); setExtractionDone(false); setExtractionError(''); }} className="text-xs text-google-gray hover:text-red-500 transition-colors">
                Limpiar formulario
              </button>
              {isReady && <span className="text-[11px] text-green-600 font-medium">Informe listo →</span>}
            </div>
          </div>
        </div>

        {/* ── COLUMNA DERECHA — Informe ── */}
        <div>
          {!isReady ? (
            <div className="bg-white border border-google-border rounded-xl shadow-sm p-12 text-center flex flex-col items-center gap-3 min-h-[300px] justify-center">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Factory size={26} className="text-gray-600" />
              </div>
              <p className="text-sm font-semibold text-google-dark">El informe aparecerá aquí</p>
              <p className="text-xs text-google-gray max-w-xs text-center">Rellena al menos: kW contratada P1, días de facturación, consumo en algún periodo y factura actual.</p>
            </div>
          ) : (
            <div id="ecb2b-informe" className="bg-white border border-google-border rounded-xl shadow-sm overflow-hidden">

              {/* Cabecera azul */}
              <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-8 pt-8 pb-7 text-white relative">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-300 mb-1.5">GRUPO AVEDIE · COMPARATIVA ENERGÉTICA B2B</p>
                    <h3 className="text-xl font-bold leading-tight">{form.cliente || 'Sin nombre'}</h3>
                    {form.cups && <p className="text-xs text-gray-300 font-mono mt-1">{form.cups}</p>}
                  </div>
                  <div className="flex-shrink-0">
                    <div className="bg-white rounded-xl px-4 py-3">
                      <img src="/endesa-logo.png" alt="Endesa" className="h-16 w-auto object-contain" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5 pr-40">
                  <span className="bg-white/20 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">{tarifaLabel}</span>
                  {isIndexada && <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">OMIE {omie.toFixed(4)} €/kWh</span>}
                  <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">{dias} días</span>
                  {n(form.descuento) > 0 && <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">Dto. adicional {form.descuento}%</span>}
                </div>
                <div className="absolute bottom-6 right-8 text-right text-xs">
                  <p className="font-semibold text-white">{today}</p>
                  {asesorDisplay && <p className="text-gray-300 mt-0.5">{asesorDisplay}</p>}
                </div>
              </div>

              {/* Potencia */}
              <div className="px-6 pt-5 pb-4">
                <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">Término de Potencia</p>
                <div className="space-y-1.5">
                  {PERIODS.map((i, idx) => kwPot[idx] > 0 && (
                    <div key={i} className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">{kwPot[idx]} kW (P{i}) × {dias} días × {potDiaTerminos[idx].toFixed(6)} €/kW</span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtPot[idx])}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs font-semibold text-google-dark">Subtotal Potencia</span>
                    <span className="text-sm font-bold text-google-dark tabular-nums">{eur(subtotPot)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 mx-6" />

              {/* Energía */}
              <div className="px-6 py-4">
                <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">Término de Energía</p>
                <div className="space-y-1.5">
                  {PERIODS.map((i, idx) => kwh[idx] > 0 && (
                    <div key={i} className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">
                        {kwh[idx]} kWh (P{i}) × {precios[idx].toFixed(6)} €/kWh
                        {isIndexada && <span className="text-cyan-600 ml-1.5 text-[11px]">({indexadaData.energiaA[`p${i}`].toFixed(6)} + {indexadaData.energiaB[`p${i}`]} × {omie.toFixed(4)})</span>}
                        {dto > 0 && <span className="text-google-blue ml-1.5 text-[11px]">(dto. {pct(dto, 0)} incluido)</span>}
                      </span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtEn[idx])}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs font-semibold text-google-dark">Subtotal Energía</span>
                    <span className="text-sm font-bold text-google-dark tabular-nums">{eur(subtotEn)}</span>
                  </div>
                  {excedentes > 0 && (
                    <div className="flex justify-between items-baseline text-sm mt-1.5">
                      <span className="text-[12px] text-green-700">Compensación excedentes</span>
                      <span className="font-semibold text-green-700 tabular-nums ml-4">−{eur(excedentes)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t border-gray-100 mx-6" />

              {/* Impuestos */}
              <div className="px-6 py-4 space-y-2">
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-google-gray">Impuesto Eléctrico (5,11%) sobre {eur(baseIE)}</span>
                  <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(impElec)}</span>
                </div>
                {bono > 0 && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">Financiación Bono Social</span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(bono)}</span>
                  </div>
                )}
                {alqCont > 0 && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">Alquiler de Contador</span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(alqCont)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-google-gray">{n(form.iva) === 0.07 ? 'IGIC' : 'IVA'} ({pct(ivaRate, 0)}) sobre {eur(baseIVA)}</span>
                  <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(ivaImp)}</span>
                </div>
              </div>

              <div className="border-t-2 border-gray-200 mx-6" />

              {/* Total */}
              <div className="px-6 py-4 flex justify-between items-center">
                <span className="font-bold text-google-dark text-base">TOTAL ESTIMADO CON ENDESA</span>
                <span className="text-2xl font-bold text-google-blue tabular-nums">{eur(total)}</span>
              </div>

              {/* Conclusiones */}
              <div className="mx-4 mb-5 rounded-xl overflow-hidden border border-green-200">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 px-5 pt-4 pb-3">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-4">Conclusiones del Estudio</p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-xl p-3 text-center border border-green-100">
                      <p className="text-[10px] text-google-gray mb-1">Factura actual</p>
                      <p className="text-xl font-bold text-google-dark tabular-nums">{eur(factBase)}</p>
                      {dtoCup > 0 && (
                        <p className="text-[9px] text-orange-500 mt-0.5 leading-tight">
                          Bruto sin cupón (−{eur(dtoCup)} no aplicado)
                        </p>
                      )}
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-blue-200">
                      <p className="text-[10px] text-google-blue font-medium mb-1">Con Endesa</p>
                      <p className="text-xl font-bold text-google-blue tabular-nums">{eur(total)}</p>
                    </div>
                  </div>
                  <div className={`rounded-xl px-5 py-4 text-center mb-4 ${ahorroAnual >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">{ahorroAnual >= 0 ? 'Ahorro anual estimado' : 'Incremento anual estimado'}</p>
                    <p className="text-4xl font-bold text-white tabular-nums">{eur(Math.abs(ahorroAnual))}</p>
                    <p className="text-sm font-medium text-white/90 mt-3 leading-snug">
                      {dif >= 0
                        ? <>Un <span className="text-3xl font-extrabold text-white align-middle">{pct(ahorroPercent)}</span> más barato que el precio actual</>
                        : <>Un <span className="text-3xl font-extrabold text-white align-middle">{pct(Math.abs(ahorroPercent))}</span> más caro que el precio actual</>
                      }
                    </p>
                  </div>
                  <div className="bg-white rounded-lg p-3 text-center">
                    <p className="text-[10px] text-google-gray mb-0.5">Ahorro en factura</p>
                    <p className={`text-base font-bold tabular-nums ${dif >= 0 ? 'text-green-600' : 'text-red-600'}`}>{eur(Math.abs(dif))}</p>
                  </div>
                  {form.notas && <p className="text-[11px] text-green-800 mt-3 pt-3 border-t border-green-200"><span className="font-semibold">Nota:</span> {form.notas}</p>}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
