import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { GAS } from '../data/tarifasGas';
import { Calculator, Upload, FileText, Printer, X, AlertTriangle, Loader2 } from 'lucide-react';

/* ── Constantes ──────────────────────────────────────────────────────────────── */

const DIAS_MES   = 30.4167;   // 365 / 12 — factor de conversión €/mes → €/período
const PROXY_URL  = '/api/gemini';

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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
  });
}

/* ── Prompt extracción IA ────────────────────────────────────────────────────── */

const GAS_EXTRACTION_PROMPT = `Analiza esta factura de gas natural española y extrae los siguientes datos.
Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin bloques de código.
El JSON debe tener exactamente estos campos (usa null para strings no encontrados y 0 para números no encontrados):

{
  "nombreCliente": "razón social o nombre completo del titular",
  "cups": "código CUPS de gas limpio: extrae SOLO los caracteres alfanuméricos que empiezan por ES022 (18-20 caracteres totales, sin espacios ni saltos)",
  "diasFacturacion": número entero de días del período de facturación,
  "totalKwhGas": kWh totales de gas natural consumidos en el período de facturación,
  "tarifaRL": "RL.1", "RL.2" o "RL.3" según el tramo de consumo anual del punto de suministro,
  "importeTotalFactura": importe TOTAL a pagar de la factura en euros (importe final con todos los impuestos incluidos),
  "costeTerminoFijo": importe exacto cobrado en esta factura por el término fijo o de capacidad en euros del período facturado (0 si no aparece),
  "costeAlquilerContador": coste del alquiler del contador en euros (0 si no aparece),
  "tipoIVA": tipo de IVA aplicado en formato decimal (0.10, 0.21 o 0.07)
}

════════ REGLAS OBLIGATORIAS ════════

REGLA 1 — IVA GAS (2025-2026): El suministro de gas natural en España peninsular tributa al tipo reducido del 10% (medida temporal prorrogada). Devuelve 0.10 para facturas de gas peninsulares de 2024-2026. Solo devuelve 0.07 en Canarias (IGIC) o 0.21 si la factura es anterior a 2021 o lo indica explícitamente.

REGLA 2 — TÉRMINO FIJO vs. VARIABLE: El término fijo (también llamado término de capacidad o cuota fija) es el importe cobrado por tener el servicio activo, independiente del consumo. Extrae el importe EN EUROS del período facturado (no el precio unitario €/día o €/mes).

REGLA 3 — TRAMO RL: RL.1 = 0-5.000 kWh/año; RL.2 = 5.001-15.000 kWh/año; RL.3 = 15.001-50.000 kWh/año. Si no aparece explícitamente, inferir del consumo anual.

REGLA 4 — kWh: Extrae SOLO el consumo de gas en kWh del período facturado. Si la factura es combinada (luz+gas), extrae únicamente los kWh de gas.

REGLA 5 — CUPS DE GAS: El CUPS de gas empieza por "ES022" (no "ES002" que es electricidad). Extráelo limpio sin espacios.

REGLA 6 — IMPORTE TOTAL: El importe final a pagar incluyendo todos los conceptos e impuestos.

REGLA 7 — IMPUESTO HIDROCARBUROS: El ISH suele estar incluido en el precio del término variable. No lo confundas con el IVA.`;

/* ── Toggle mini ─────────────────────────────────────────────────────────────── */

function MiniToggle({ on, onToggle, colorOn = 'bg-google-blue' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${on ? colorOn : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

/* ── Estado inicial ──────────────────────────────────────────────────────────── */

const INIT = {
  kwhGas: '',
  dias: '',
  cliente: '', cups: '',
  terminoFijoFactura: '0',
  alquilerContador: '0',
  facturaActual: '',
  asesor: '', asesorLibre: '',
  iva: '0.10',
  descuento: '0',
  notas: '',
};

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE PRINCIPAL
   ══════════════════════════════════════════════════════════════════════════════ */

export default function EstudioComparativoGas() {
  const { users } = useAuth();

  /* ── Estado ── */
  const [tarifaGasId, setTarifaGasId]           = useState('rl1');
  const [mant, setMant]                         = useState(false);
  const [incluyeTF, setIncluyeTF]               = useState(true);
  const [form, setForm]                         = useState(INIT);
  const [dragging, setDragging]                 = useState(false);
  const [dropped, setDropped]                   = useState(null);
  const [isExtracting, setIsExtracting]         = useState(false);
  const [extractionDone, setExtractionDone]     = useState(false);
  const [extractionError, setExtractionError]   = useState('');
  const fileRef         = useRef(null);
  const originalTitle   = useRef(document.title);

  /* ── Tarifa activa ── */
  const tarifa = GAS.find(t => t.id === tarifaGasId);

  /* ════════════ CÁLCULOS ════════════ */

  const asesorDisplay = form.asesor === '__otro__' ? (form.asesorLibre || '') : form.asesor;

  const kwhGas     = n(form.kwhGas);
  const dias       = n(form.dias);
  const dto        = n(form.descuento) / 100;
  const ivaRate    = n(form.iva, 0.10);
  const tfFactura  = n(form.terminoFijoFactura);
  const alqCont    = n(form.alquilerContador);
  const factActual = n(form.facturaActual);

  const basePrice  = mant ? tarifa.conMant.promo : tarifa.sinMant.promo;
  const precioVar  = basePrice * (1 - dto);
  const subtotVar  = kwhGas * precioVar;

  /* Término fijo Endesa: terFijo está en €/mes → convertir al período facturado */
  const tfEndesa   = incluyeTF ? (tarifa.terFijo / DIAS_MES) * dias : 0;

  const baseIVA    = subtotVar + tfEndesa + alqCont;
  const ivaImp     = baseIVA * ivaRate;
  const total      = baseIVA + ivaImp;

  /* Base de comparación: cuando TF no está incluido, se resta silenciosamente el
     TF que el cliente paga en su factura actual — sin texto explicativo en el informe */
  const factBase   = incluyeTF ? factActual : Math.max(0, factActual - tfFactura);

  const dif             = factBase - total;
  const ahorroPercent   = total > 0 ? (factBase / total - 1) : 0;
  const ahorroAnual     = dias  > 0 ? (dif / dias) * 365 : 0;

  const isReady = kwhGas > 0 && dias > 0 && factActual > 0;

  /* ════════════ PRINT TITLE ════════════ */

  const today       = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long',   year: 'numeric' });
  const todayShort  = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

  useEffect(() => {
    if (!isReady) return;
    const cliente  = form.cliente.trim() || 'Cliente';
    const titulo   = `${cliente} - GAS - ${todayShort}`;
    const onBefore = () => { document.title = titulo; };
    const onAfter  = () => { document.title = originalTitle.current; };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint',  onAfter);
    return () => { window.removeEventListener('beforeprint', onBefore); window.removeEventListener('afterprint', onAfter); };
  }, [isReady, form.cliente, todayShort]);

  /* ════════════ EXTRACCIÓN IA ════════════ */

  async function extractFromGasInvoice(file) {
    setIsExtracting(true);
    setExtractionDone(false);
    setExtractionError('');
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: GAS_EXTRACTION_PROMPT,
          history: [
            { role: 'user',  parts: [{ text: 'Actúa como experto en el mercado gasista español. Extrae datos estructurados de facturas de gas natural y devuelve JSON válido, aplicando correctamente las reglas de IVA y término fijo del sector del gas en España.' }] },
            { role: 'model', parts: [{ text: 'Entendido. Soy experto en facturas de gas natural español. IVA gas peninsular 2024-2026: 10%. Identificaré el término fijo en euros del período, los kWh de gas, el CUPS (ES022...) y el tramo RL. Devolveré exclusivamente el objeto JSON solicitado.' }] },
          ],
          file: { mimeType: file.type || 'application/octet-stream', data: base64 },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      let raw = data.response.trim();
      const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) raw = fenced[1].trim();
      else { const m = raw.match(/\{[\s\S]*\}/); if (m) raw = m[0]; }

      const ex = JSON.parse(raw);

      /* IVA */
      let ivaValue = form.iva;
      if (ex.tipoIVA != null) {
        const v = parseFloat(ex.tipoIVA);
        if      (Math.abs(v - 0.10) < 0.005) ivaValue = '0.10';
        else if (Math.abs(v - 0.07) < 0.005) ivaValue = '0.07';
        else                                  ivaValue = '0.21';
      }

      /* Auto-seleccionar tarifa RL */
      if (ex.tarifaRL) {
        const rl = ex.tarifaRL.toString().toLowerCase().replace(/[\s.]/g, '');
        if      (rl.includes('rl1') || rl === '1') setTarifaGasId('rl1');
        else if (rl.includes('rl2') || rl === '2') setTarifaGasId('rl2');
        else if (rl.includes('rl3') || rl === '3') setTarifaGasId('rl3');
      }

      setForm(f => ({
        ...f,
        cliente:            ex.nombreCliente              || f.cliente,
        cups:               ex.cups                       || f.cups,
        dias:               ex.diasFacturacion   != null  ? String(ex.diasFacturacion)      : f.dias,
        kwhGas:             ex.totalKwhGas       != null  ? String(ex.totalKwhGas)          : f.kwhGas,
        facturaActual:      ex.importeTotalFactura != null ? String(ex.importeTotalFactura)  : f.facturaActual,
        terminoFijoFactura: ex.costeTerminoFijo  != null  ? String(ex.costeTerminoFijo)     : f.terminoFijoFactura,
        alquilerContador:   ex.costeAlquilerContador != null ? String(ex.costeAlquilerContador) : f.alquilerContador,
        iva:                ivaValue,
      }));
      setExtractionDone(true);
    } catch (err) {
      console.error('[EC-GAS] Extracción IA:', err);
      setExtractionError('No se pudo extraer la información automáticamente. Revise que el archivo es legible o introduzca los datos manualmente.');
    } finally {
      setIsExtracting(false);
    }
  }

  /* ════════════ FILE HANDLERS ════════════ */

  function handleFileUpload(file) {
    if (!file) return;
    setDropped(file);
    setExtractionDone(false);
    setExtractionError('');
    extractFromGasInvoice(file);
  }

  const onDragOver  = useCallback(e => { e.preventDefault(); setDragging(true);  }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);
  const onDrop = e => {
    e.preventDefault(); setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  /* ══════════════════════════════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════════════════════════════ */

  return (
    <>
      {/* ── CSS impresión ── */}
      <style>{`
        @media print {
          @page { margin: 0; size: A4 portrait; }
          body * { visibility: hidden !important; }
          #ec-informe-gas, #ec-informe-gas * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #ec-informe-gas {
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
            <div className="flex justify-end">
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
              1 · Tarifa Endesa Gas a comparar <span className="text-red-400">*</span>
            </p>
            <div className="space-y-2 mb-4">
              {GAS.map(t => {
                const precio = mant ? t.conMant.promo : t.sinMant.promo;
                return (
                  <label
                    key={t.id}
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      tarifaGasId === t.id ? 'border-orange-400 bg-orange-50' : 'border-google-border hover:border-orange-200'
                    }`}
                  >
                    <input type="radio" name="tarifaGas" value={t.id} checked={tarifaGasId === t.id} onChange={() => setTarifaGasId(t.id)} className="accent-orange-500 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-google-dark">{t.title}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">{t.consumo}</span>
                      </div>
                      <p className="text-[11px] text-google-gray mt-0.5 font-mono">
                        {precio.toFixed(6)} €/kWh · TF {t.terFijo.toFixed(3)} €/mes · {t.validez}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Switch mantenimiento */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MiniToggle
                  on={mant && tarifa.hasMant}
                  onToggle={() => tarifa.hasMant && setMant(v => !v)}
                  colorOn="bg-orange-500"
                />
                {tarifa.hasMant ? (
                  <span className="text-xs text-google-gray">
                    Mantenimiento <span className="text-orange-600 font-semibold">(−3%)</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-400">Sin dto. de mantenimiento en RL.3</span>
                )}
              </div>
              {/* Switch TF */}
              <div className="flex items-center gap-2">
                <MiniToggle on={incluyeTF} onToggle={() => setIncluyeTF(v => !v)} colorOn="bg-orange-500" />
                <span className="text-xs text-google-gray">Incluir Término Fijo</span>
              </div>
            </div>
          </div>

          {/* 2 · Factura */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider">2 · Factura de gas del cliente</p>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-orange-500 bg-orange-50 border border-orange-200 rounded-full px-2 py-0.5">
                <Loader2 size={9} />
                IA · Extracción automática
              </span>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2.5 mb-3">
              <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-snug font-medium">⚠️ Los datos volcados deberán ser revisados minuciosamente antes de presentar el estudio.</p>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors ${
                isExtracting ? 'border-orange-300 bg-orange-50 cursor-wait'
                : dragging    ? 'border-orange-400 bg-orange-50 cursor-copy'
                : 'border-gray-200 bg-gray-50 hover:border-orange-300 cursor-pointer'
              }`}
              onDragOver={!isExtracting ? onDragOver   : undefined}
              onDragLeave={!isExtracting ? onDragLeave  : undefined}
              onDrop={!isExtracting      ? onDrop       : undefined}
              onClick={() => { if (!isExtracting) fileRef.current?.click(); }}
            >
              <input
                ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                onChange={e => { if (e.target.files[0]) handleFileUpload(e.target.files[0]); e.target.value = ''; }}
              />
              {isExtracting ? (
                <div className="flex flex-col items-center gap-2.5 py-1">
                  <Loader2 size={28} className="text-orange-500 animate-spin" />
                  <div>
                    <p className="text-xs font-semibold text-orange-500">Analizando factura con IA...</p>
                    <p className="text-[11px] text-orange-400 mt-0.5">Por favor, espere.</p>
                  </div>
                </div>
              ) : dropped ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText size={16} className="text-orange-500 flex-shrink-0" />
                  <span className="text-sm font-medium text-google-dark truncate max-w-[200px]">{dropped.name}</span>
                  <button type="button" className="text-gray-400 hover:text-red-500 transition-colors" onClick={e => { e.stopPropagation(); setDropped(null); setExtractionDone(false); setExtractionError(''); }}>
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <Upload size={18} className="mx-auto mb-2 text-gray-400" />
                  <p className="text-xs text-google-gray">Arrastra la factura de gas aquí o <span className="text-orange-500 underline">selecciona un archivo</span></p>
                  <p className="text-[11px] text-gray-400 mt-0.5">PDF, JPG o PNG · Los datos se volcarán automáticamente</p>
                </>
              )}
            </div>
            {extractionDone && !isExtracting && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mt-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  <span className="font-bold text-amber-700 block mb-0.5">⚠️ Revisión obligatoria</span>
                  Revise los campos volcados, especialmente el consumo en kWh y el término fijo, antes de presentar el estudio al cliente.
                </p>
              </div>
            )}
            {extractionError && !isExtracting && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 mt-3">
                <AlertTriangle size={13} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-red-700 leading-relaxed">{extractionError}</p>
              </div>
            )}
          </div>

          {/* 3 · Consumo */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">3 · Consumo facturado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">kWh Gas <span className="text-red-400">*</span></label>
                <input type="text" inputMode="decimal" value={form.kwhGas} onChange={set('kwhGas')} placeholder="kWh" className="input-field text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">Días facturación <span className="text-red-400">*</span></label>
                <input type="text" inputMode="decimal" value={form.dias} onChange={set('dias')} placeholder="días" className="input-field text-sm" />
              </div>
            </div>
            {kwhGas > 0 && (
              <div className="mt-3 bg-orange-50 rounded-lg px-3 py-2 border border-orange-100">
                <p className="text-[10px] text-orange-700 font-medium">Precio Endesa aplicado</p>
                <p className="text-xs font-bold text-orange-800 font-mono">
                  {precioVar.toFixed(6)} €/kWh
                  {dto > 0 && <span className="font-normal ml-2">(dto. adicional {pct(dto, 0)} incluido)</span>}
                </p>
              </div>
            )}
          </div>

          {/* 4 · Datos cliente */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">4 · Datos del cliente</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Nombre / Empresa</label>
                  <input type="text" value={form.cliente} onChange={set('cliente')} placeholder="Cliente" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">CUPS Gas</label>
                  <input type="text" value={form.cups} onChange={set('cups')} placeholder="ES022…" className="input-field text-sm font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">TF en factura (€)</label>
                  <input type="text" inputMode="decimal" value={form.terminoFijoFactura} onChange={set('terminoFijoFactura')} placeholder="0.00" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Alq. Contador (€)</label>
                  <input type="text" inputMode="decimal" value={form.alquilerContador} onChange={set('alquilerContador')} placeholder="0.00" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Factura actual (€) <span className="text-red-400">*</span></label>
                  <input type="text" inputMode="decimal" value={form.facturaActual} onChange={set('facturaActual')} placeholder="0.00" className="input-field text-sm" />
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
                  {form.asesor === '__otro__' && (
                    <input type="text" value={form.asesorLibre} onChange={set('asesorLibre')} placeholder="Nombre del asesor" className="input-field text-sm mt-2" autoFocus />
                  )}
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">IVA / IGIC</label>
                  <div className="flex rounded-lg overflow-hidden border border-google-border">
                    {[['0.21', 'IVA 21%'], ['0.10', 'IVA 10%'], ['0.07', 'IGIC 7%']].map(([v, l]) => (
                      <button key={v} type="button" onClick={() => setForm(f => ({ ...f, iva: v }))}
                        className={`flex-1 py-2 text-xs font-medium transition-colors ${form.iva === v ? 'bg-orange-500 text-white' : 'bg-white text-google-gray hover:bg-orange-50'}`}>
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
              <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center">
                <Calculator size={26} className="text-orange-500" />
              </div>
              <p className="text-sm font-semibold text-google-dark">El informe aparecerá aquí</p>
              <p className="text-xs text-google-gray max-w-xs text-center">
                Rellena al menos: consumo kWh, días de facturación y factura actual del cliente.
              </p>
            </div>
          ) : (
            <div id="ec-informe-gas" className="bg-white border border-google-border rounded-xl shadow-sm overflow-hidden">

              {/* ── Cabecera naranja ── */}
              <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-6 pt-6 pb-5 text-white relative">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-100 mb-1">GRUPO AVEDIE · COMPARATIVA ENERGÉTICA GAS</p>
                    <h3 className="text-xl font-bold leading-tight">{form.cliente || 'Sin nombre'}</h3>
                    {form.cups && <p className="text-xs text-orange-100 font-mono mt-0.5">{form.cups}</p>}
                  </div>
                  <div className="flex-shrink-0">
                    <div className="bg-white rounded-xl px-4 py-3">
                      <img src="/endesa-logo.png" alt="Endesa" className="h-16 w-auto object-contain" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pr-40">
                  <span className="bg-white/20 text-white text-[11px] font-semibold px-2.5 py-1 rounded-full">{tarifa.title}</span>
                  {mant && tarifa.hasMant && <span className="bg-white/20 text-white text-[11px] px-2.5 py-1 rounded-full">Con Mantenimiento −3%</span>}
                  <span className="bg-white/20 text-white text-[11px] px-2.5 py-1 rounded-full">{dias} días</span>
                  {n(form.descuento) > 0 && <span className="bg-white/20 text-white text-[11px] px-2.5 py-1 rounded-full">Dto. adicional {form.descuento}%</span>}
                </div>
                <div className="absolute bottom-4 right-6 text-right text-xs">
                  <p className="font-semibold text-white">{today}</p>
                  {asesorDisplay && <p className="text-orange-100 mt-0.5">{asesorDisplay}</p>}
                </div>
              </div>

              {/* ── Término de Energía ── */}
              <div className="px-6 pt-5 pb-4">
                <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">Término de Energía (Gas)</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">
                      {kwhGas} kWh × {precioVar.toFixed(6)} €/kWh
                      {dto > 0 && <span className="text-orange-500 ml-1.5 text-[11px]">(dto. {pct(dto, 0)} incluido)</span>}
                    </span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(subtotVar)}</span>
                  </div>
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs font-semibold text-google-dark">Subtotal Energía</span>
                    <span className="text-sm font-bold text-google-dark tabular-nums">{eur(subtotVar)}</span>
                  </div>
                </div>
              </div>

              {/* ── Término Fijo (solo si switch ON) ── */}
              {incluyeTF && (
                <>
                  <div className="border-t border-gray-100 mx-6" />
                  <div className="px-6 py-4">
                    <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">Término Fijo</p>
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">
                        {tarifa.terFijo.toFixed(3)} €/mes × {dias} días ÷ {DIAS_MES.toFixed(0)} días/mes
                      </span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(tfEndesa)}</span>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-gray-100 mx-6" />

              {/* ── Impuestos ── */}
              <div className="px-6 py-4 space-y-2">
                {alqCont > 0 && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">Alquiler de Contador</span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(alqCont)}</span>
                  </div>
                )}
                <div className="flex justify-between items-baseline text-sm">
                  <span className="text-google-gray">
                    {n(form.iva) === 0.07 ? 'IGIC' : 'IVA'} ({pct(ivaRate, 0)}) sobre {eur(baseIVA)}
                  </span>
                  <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(ivaImp)}</span>
                </div>
              </div>

              <div className="border-t-2 border-gray-200 mx-6" />

              {/* ── Total ── */}
              <div className="px-6 py-4 flex justify-between items-center">
                <span className="font-bold text-google-dark text-base">TOTAL ESTIMADO CON ENDESA</span>
                <span className="text-2xl font-bold text-orange-500 tabular-nums">{eur(total)}</span>
              </div>

              {/* ── Conclusiones ── */}
              <div className="mx-4 mb-5 rounded-xl overflow-hidden border border-green-200">
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 px-5 pt-4 pb-3">
                  <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider mb-4">Conclusiones del Estudio</p>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-white rounded-xl p-3 text-center border border-green-100">
                      <p className="text-[10px] text-google-gray mb-1">Factura actual</p>
                      <p className="text-xl font-bold text-google-dark tabular-nums">{eur(factBase)}</p>
                    </div>
                    <div className="bg-white rounded-xl p-3 text-center border border-orange-200">
                      <p className="text-[10px] text-orange-500 font-medium mb-1">Con Endesa Gas</p>
                      <p className="text-xl font-bold text-orange-500 tabular-nums">{eur(total)}</p>
                    </div>
                  </div>

                  <div className={`rounded-xl px-5 py-4 text-center mb-4 ${ahorroAnual >= 0 ? 'bg-green-500' : 'bg-red-500'}`}>
                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">
                      {ahorroAnual >= 0 ? 'Ahorro anual estimado' : 'Incremento anual estimado'}
                    </p>
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

                  {form.notas && (
                    <p className="text-[11px] text-green-800 mt-3 pt-3 border-t border-green-200">
                      <span className="font-semibold">Nota:</span> {form.notas}
                    </p>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </>
  );
}
