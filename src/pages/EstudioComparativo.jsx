import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Calculator, Upload, FileText, Printer, Download, X, AlertTriangle, Loader2 } from 'lucide-react';
import { exportElementToPdf, slugifyFilename } from '../lib/exportPdf';

/* Estimación de tiempo de extracción proporcional al peso del archivo (no inventada):
   tiempo base de 4s (latencia fija de red + arranque del modelo) + 1.5s por cada
   500KB de archivo (el tiempo que tarda Gemini en "leer" más páginas/resolución). */
function estimateExtractionSeconds(fileSizeBytes) {
  const BASE_SECONDS = 4;
  const SECONDS_PER_500KB = 1.5;
  const chunks = fileSizeBytes / (500 * 1024);
  return Math.round(BASE_SECONDS + chunks * SECONDS_PER_500KB);
}

/* ── Tarifas Endesa LUZ ──────────────────────────────────────────────────────── */

const TARIFAS = [
  {
    id: 'directo',
    label: 'Luz Fija 24H — Canal Directo',
    shortLabel: 'Luz Fija 24H',
    tag: 'Canal Directo',
    tagClass: 'bg-blue-100 text-blue-700',
    sinMant: 0.109000,
    conMant: 0.104191,
    potPunta: 34.188,
    potValle: 34.188,
    validez: '09/06/2026 – 14/07/2026',
  },
  {
    id: 'prescriptor',
    label: 'Luz Fija 24H — Con Prescriptor',
    shortLabel: 'Luz Fija 24H',
    tag: 'Con Prescriptor',
    tagClass: 'bg-violet-100 text-violet-700',
    sinMant: 0.128235,
    conMant: 0.123426,
    potPunta: 34.188,
    potValle: 34.188,
    validez: '09/06/2026 – 14/07/2026',
  },
  {
    id: 'toc',
    label: 'Tu Otra Casa 50 (2.0TD)',
    shortLabel: 'Tu Otra Casa 50',
    tag: '2.0TD',
    tagClass: 'bg-emerald-100 text-emerald-700',
    sinMant: 0.154500,
    conMant: 0.150000,
    potPunta: 32.880,
    potValle: 5.904,
    validez: '01/06/2026 – 14/07/2026',
  },
  {
    id: 'tempo',
    label: 'Tempo 2.0TD — Precio Único 24H',
    shortLabel: 'Tempo 2.0TD',
    tag: 'Tempo',
    tagClass: 'bg-amber-100 text-amber-700',
    sinMant: 0.124777,
    conMant: 0.124777,
    potPunta: 44.704416,
    potValle: 17.725428,
    validez: '24/06/2026 – 14/07/2026',
  },
  {
    id: 'solar_basic',
    label: 'Endesa Solar Basic',
    shortLabel: 'Solar Basic',
    tag: 'Autoconsumo',
    tagClass: 'bg-yellow-100 text-yellow-700',
    // Precio "resto horas" promocionado (0,148707 €/kWh): el 15% exclusivo de horas Basic
    // (18h-10h) no se modela porque el comparador no desglosa consumo por banda horaria.
    sinMant: 0.148707,
    conMant: 0.148707,
    potPunta: 34.188,
    potValle: 34.188,
    isSolar: true,
    compExcedentes: 0, // Solar Basic no retribuye excedentes vertidos a la red
    bateriaVirtual: false,
    cuotaBateriaMes: 0,
    validez: '01/06/2026 – 14/07/2026',
  },
  {
    id: 'solar_plus',
    label: 'Endesa Solar Plus',
    shortLabel: 'Solar Plus',
    tag: 'Autoconsumo',
    tagClass: 'bg-orange-100 text-orange-700',
    sinMant: 0.148707,
    conMant: 0.148707,
    potPunta: 34.188,
    potValle: 34.188,
    isSolar: true,
    compExcedentes: 0.06,
    bateriaVirtual: false,
    cuotaBateriaMes: 0,
    validez: '01/06/2026 – 14/07/2026',
  },
  {
    id: 'solar_bateria',
    label: 'Endesa Solar Plus & Batería Virtual',
    shortLabel: 'Solar + Batería Virtual',
    tag: 'Autoconsumo',
    tagClass: 'bg-purple-100 text-purple-700',
    sinMant: 0.148707,
    conMant: 0.148707,
    potPunta: 34.188,
    potValle: 34.188,
    isSolar: true,
    compExcedentes: 0.06,
    bateriaVirtual: true,
    cuotaBateriaMes: 2,
    validez: '01/06/2026 – 14/07/2026',
  },
  {
    id: 'indexada_2.0td',
    label: 'Indexada a OMIE 2.0TD',
    shortLabel: 'Indexada OMIE',
    tag: 'OMIE',
    tagClass: 'bg-cyan-100 text-cyan-700',
    // Sin descuentos ni mantenimiento (la propia oferta lo indica). Precio de energía
    // dinámico por periodo: precio = A + (B × OMIEmes). Ver INIT.omie / cálculo más abajo.
    isIndexada: true,
    energiaA: { p1: 0.138015, p2: 0.070477, p3: 0.040620 },
    energiaB: { p1: 1.448,    p2: 1.239,    p3: 1.137 },
    potPunta: 31.216092,
    potValle: 4.237104,
    validez: '09/06/2026 – 14/07/2026',
  },
];

/* Impuesto Especial sobre la Electricidad — tipo vigente 5,113% */
const IE_RATE = 0.05113;

const PROXY_URL = '/api/gemini';

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

const EXTRACTION_PROMPT = `Analiza esta factura eléctrica española y extrae los siguientes datos.
Devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional, sin markdown, sin bloques de código.
El JSON debe tener exactamente estos campos (usa null para strings no encontrados y 0 para números no encontrados):

{
  "nombreCliente": "razón social o nombre completo del titular",
  "cups": "código CUPS limpio: extrae SOLO los 20-22 caracteres alfanuméricos que empiezan por ES (elimina espacios, saltos de línea y guiones)",
  "diasFacturacion": número entero de días del período de facturación,
  "totalKwhFacturados": suma total en kWh de TODOS los períodos de consumo de energía activa CONSUMIDA DE LA RED (P1+P2+P3+P4+P5+P6). NO incluir energía reactiva, excesos de potencia ni los kWh de excedentes exportados a la red que aparecen en la línea "Compensación de excedentes",
  "kwPotenciaPunta": potencia contratada en kW para el período punta (P1). Si solo hay una potencia única, ponla aquí,
  "kwPotenciaValle": potencia contratada en kW para el período valle (P2). Pon 0 si es tarifa monopunto o si solo hay una potencia,
  "importeTotalFacturaActual": importe TOTAL de la factura en euros ANTES de cualquier descuento comercial/fidelización post-IVA (líneas como "PARA TI", "Bienvenida", "Fidelización" que aparecen en una fila separada DESPUÉS del TOTAL y ANTES del "TOTAL A PAGAR"). Este valor representa el coste energético real con todos los impuestos incluidos. Si no existe descuento post-IVA, coincide con el TOTAL A PAGAR,
  "descuentoCupon": descuento comercial/fidelización post-IVA en euros como número POSITIVO (ej: si aparece "PARA TI -5,00 €" tras el TOTAL, devuelve 5.0). Devuelve 0 si no hay ningún descuento comercial post-IVA,
  "costeAlquilerContador": coste del alquiler del equipo de medida en euros (0 si no aparece),
  "costeBonoSocial": importe del bono social en euros (0 si no aparece),
  "compensacionExcedentes": importe de compensación por excedentes de autoconsumo en euros como número POSITIVO (ej: si la factura muestra "-29,72 €" de compensación de excedentes, devuelve 29.72). Devuelve 0 si no hay compensación de excedentes,
  "kwhExcedentesVertidos": kWh totales de energía excedentaria vertida/exportada a la red (autoconsumo). Es el kWh que multiplicado por el precio de compensación da el importe de "compensacionExcedentes" (ej: en la línea "Compensación excedente 784,746 kWh x -0,060000 Eur/kWh", devuelve 784.746). También puede aparecer como "Energía vertida a la red" en el resumen de consumo. Devuelve 0 si no hay excedentes,
  "tipoIVA": tipo de IVA en formato decimal. Localiza la línea con formato "IVA X % s/YY,YY €  ZZ,ZZ €": X es el PORCENTAJE, conviértelo a decimal (21→0.21, 10→0.10, 7→0.07). ZZ,ZZ es el importe en euros — NUNCA lo uses como tipo. Ejemplo: "IVA (*) 21 % s/47,62 €  10,00 €" → devuelve 0.21 (NO 0.10). NUNCA extraigas el importe en euros como tipo de IVA.
}

════════ REGLAS OBLIGATORIAS — MERCADO ELÉCTRICO ESPAÑOL ════════

REGLA 1 — IVA ELÉCTRICO — LEE SIEMPRE EL TIPO DE LA FACTURA:
El tipo de IVA sobre la electricidad varía según el decreto vigente en la fecha de factura:
• 0.21 (21%): tipo general, vigente desde el Real Decreto-ley 7/2026 (marzo 2026)
• 0.10 (10%): tipo reducido, en períodos con decreto de reducción temporal activo
• 0.07 (7%): IGIC, solo en Canarias
NO asumas un tipo fijo. Lee el número del porcentaje que aparece ANTES del símbolo % en la línea del IVA y conviértelo a decimal.

REGLA 2 — IVA MIXTO: Si la factura incluye conceptos con distintos tipos de IVA, usa el tipo aplicado sobre energía y potencia (el concepto principal). Lee ese porcentaje directamente de la factura.

REGLA 3 — NO confundas el Impuesto Especial de la Electricidad (IEE/IVPEE, 5,11%) con el IVA.
El IEE aparece como un porcentaje distinto antes del IVA. No lo uses para el campo tipoIVA.

REGLA 4 — CUPS:
Los caracteres del CUPS en el PDF pueden tener "O" (letra O) en lugar de "0" (cero) por OCR.
Corrige: las posiciones 3-6 del CUPS son SIEMPRE dígitos numéricos (ej. "ES0021", no "ESOO21").

REGLA 5 — kWh TOTALES:
Suma TODOS los consumos de energía activa CONSUMIDA DE LA RED (P1, P2, P3 y sus equivalentes).
Si la factura es combinada (luz+gas), extrae solo el consumo eléctrico en kWh, no el gas.
NUNCA incluyas los kWh de excedentes exportados a la red: en facturas con autoconsumo, los kWh que aparecen en "Compensación de excedentes" son energía que la instalación solar exporta, NO energía que el cliente consume.

REGLA 6 — IMPORTE TOTAL:
Usa el importe TOTAL FINAL a pagar, que incluye energía + potencia + IEE + IVA + bono social + alquiler (y con la compensación de excedentes ya descontada si la hay).

REGLA 7 — AUTOCONSUMO Y EXCEDENTES:

7A — COMPENSACIÓN DE EXCEDENTES (línea negativa dentro del desglose de energía, ANTES del IEE e IVA):
Si la factura incluye una línea "Compensación de excedentes" con importe negativo (ej: "-29,72 €"), esa compensación reduce la base imponible del IEE y del IVA:
- Extrae ese importe como número POSITIVO en "compensacionExcedentes" (ej: 29.72)
- Extrae el kWh vertido asociado a esa línea (el multiplicando de esa misma línea, ej. "784,746 kWh x -0,060000 Eur/kWh") como número POSITIVO en "kwhExcedentesVertidos" (ej: 784.746)
- En "importeTotalFacturaActual" usa el TOTAL FINAL de la factura (con la compensación ya descontada, que es lo que el cliente paga)
- En "totalKwhFacturados" usa SOLO los kWh consumidos de la red (Punta + Llano + Valle consumidos), NO los kWh de excedentes exportados
Ejemplo Iberdrola: energía bruta 41,61€ − compensación excedentes 29,72€ → IEE sobre base neta → total final 34,90€
→ importeTotalFacturaActual = 34.90, compensacionExcedentes = 29.72, kwhExcedentesVertidos = 495.38, totalKwhFacturados = 296.69 (NO 495.38)

7B — CRÉDITO POST-IVA / SOLAR WALLET / SALDO ENERGÉTICO (crédito aplicado DESPUÉS de todos los impuestos):
Si el crédito se aplica tras el IVA (ej: "Solar Wallet: -39,68€" aparece al final, después del total con IVA):
- Usa el SUBTOTAL BRUTO ANTES del crédito en "importeTotalFacturaActual" (ej: 42.44)
- Pon 0 en "compensacionExcedentes"

REGLA 8 — CUPS ENMASCARADO:
Si el CUPS aparece como "*" o está completamente oculto, devuelve null para el campo cups.

REGLA 9 — DESCUENTOS COMERCIALES POST-IVA ("PARA TI", "Bienvenida", "Fidelización", etc.):
Algunos comercializadores aplican un cupón/descuento de fidelización en una línea propia DESPUÉS del total impositivo:
  TOTAL 56,94 €
  PARA TI -5,00 €
  TOTAL A PAGAR 51,94 €
En ese caso:
- "importeTotalFacturaActual" = 56.94  (el TOTAL energético ANTES del cupón)
- "descuentoCupon" = 5.00              (el importe del cupón, como número positivo)
NUNCA pongas el TOTAL A PAGAR (51,94 €) en "importeTotalFacturaActual" cuando exista un descuento post-IVA de esta naturaleza.`;

/* ── Toggle mini ─────────────────────────────────────────────────────────────── */

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

/* ── Estado inicial ──────────────────────────────────────────────────────────── */

const INIT = {
  kwhP1: '', kwhP2: '0', kwhP3: '0',
  kwPunta: '', kwValle: '',
  dias: '',
  cliente: '', cups: '',
  bonoSocial: '0', alquilerContador: '0',
  compensacionExcedentes: '0',
  excedentesKwh: '0',
  // Precio medio de OMIE en junio de 2026: 69,59 €/MWh = 0,06959 €/kWh. Valor orientativo
  // y editable: el asesor debe actualizarlo con el precio medio del mes que corresponda.
  omie: '0.06959',
  facturaActual: '',
  dtoCupones: '0',
  asesor: '', asesorLibre: '',
  iva: '0.21',
  descuento: '0',
  notas: '',
};

/* ══════════════════════════════════════════════════════════════════════════════
   COMPONENTE
   ══════════════════════════════════════════════════════════════════════════════ */

export default function EstudioComparativo() {
  const { users } = useAuth();

  const [tarifaId, setTarifaId]             = useState('directo');
  const [mant, setMant]                     = useState(false);
  const [compExcActiva, setCompExcActiva]   = useState(true);
  const [form, setForm]                     = useState(INIT);
  const [dragging, setDragging]             = useState(false);
  const [dropped, setDropped]               = useState(null);
  const [isExtracting, setIsExtracting]     = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [extractionError, setExtractionError] = useState('');
  const [estimatedSeconds, setEstimatedSeconds] = useState(0);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const fileRef       = useRef(null);
  const originalTitle = useRef(document.title);
  const countdownRef  = useRef(null);

  /* ════════════ CÁLCULOS ════════════ */

  const asesorDisplay = form.asesor === '__otro__' ? (form.asesorLibre || '') : form.asesor;
  const tarifa    = TARIFAS.find(t => t.id === tarifaId);
  const precioEn  = mant ? tarifa.conMant : tarifa.sinMant;

  const kwhP1    = n(form.kwhP1);
  const kwhP2    = n(form.kwhP2);
  const kwhP3    = n(form.kwhP3);
  const kwPunta  = n(form.kwPunta);
  const kwValle  = n(form.kwValle);
  const dias     = n(form.dias);
  const bono     = n(form.bonoSocial);
  const alqCont  = n(form.alquilerContador);
  const factActual = n(form.facturaActual);
  const dtoCup   = n(form.dtoCupones);
  const factBase = factActual; // el cupón/dto de fidelización nunca se aplica: se compara siempre el bruto de la factura
  const ivaRate  = n(form.iva, 0.21);
  const dto      = n(form.descuento) / 100;

  const potPuntaDia = tarifa.potPunta / 365;
  const potValleDia = tarifa.potValle / 365;
  const imtPotPunta = kwPunta * dias * potPuntaDia;
  const imtPotValle = kwValle * dias * potValleDia;
  const subtotPot   = imtPotPunta + imtPotValle;

  // Tarifas Indexadas a OMIE: precio por periodo = A + (B × OMIEmes), en vez de un
  // único precio fijo. Las demás tarifas mantienen el mismo precio en P1/P2/P3.
  const isIndexada = !!tarifa.isIndexada;
  const omie       = n(form.omie);
  const precioBaseP1 = isIndexada ? tarifa.energiaA.p1 + tarifa.energiaB.p1 * omie : precioEn;
  const precioBaseP2 = isIndexada ? tarifa.energiaA.p2 + tarifa.energiaB.p2 * omie : precioEn;
  const precioBaseP3 = isIndexada ? tarifa.energiaA.p3 + tarifa.energiaB.p3 * omie : precioEn;

  const precioP1 = precioBaseP1 * (1 - dto);
  const precioP2 = precioBaseP2 * (1 - dto);
  const precioP3 = precioBaseP3 * (1 - dto);
  const imtEnP1  = kwhP1 * precioP1;
  const imtEnP2  = kwhP2 * precioP2;
  const imtEnP3  = kwhP3 * precioP3;
  const subtotEn = imtEnP1 + imtEnP2 + imtEnP3;

  // Tarifas solares: la compensación se calcula a partir del kWh vertido y el precio de
  // la tarifa, tope legal (RD 244/2019): no puede superar el coste de la energía consumida.
  // El interruptor "compExcActiva" permite desactivar por completo la compensación.
  const excedentesKwh       = n(form.excedentesKwh);
  const excedentesManual    = n(form.compensacionExcedentes);
  const excedentesSolarBruto = (tarifa.isSolar && compExcActiva) ? excedentesKwh * tarifa.compExcedentes : 0;
  const excedentes          = compExcActiva ? (tarifa.isSolar ? Math.min(excedentesSolarBruto, subtotEn) : excedentesManual) : 0;
  // Batería Virtual: el excedente que supera el coste de la energía se acumula para
  // futuras facturas (no reduce el total de esta factura).
  const bateriaCredito      = (compExcActiva && tarifa.bateriaVirtual) ? Math.max(0, excedentesSolarBruto - subtotEn) : 0;
  const cuotaBateriaImporte = tarifa.cuotaBateriaMes ? (tarifa.cuotaBateriaMes * dias / 30) : 0;

  const baseIE  = subtotPot + subtotEn - excedentes + bono;
  const impElec = baseIE * IE_RATE;
  const baseIVA = subtotPot + subtotEn - excedentes + impElec + bono + alqCont + cuotaBateriaImporte;
  const ivaImp  = baseIVA * ivaRate;
  const total   = baseIVA + ivaImp;

  const dif           = factBase - total;
  const ahorroPercent = total > 0 ? (factBase / total - 1) : 0;
  const ahorroAnual   = dias  > 0 ? (dif / dias) * 365 : 0;
  const isReady = kwhP1 > 0 && kwPunta > 0 && dias > 0 && factActual > 0;

  /* ════════════ FECHAS ════════════ */

  const today      = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long',    year: 'numeric' });
  const todayShort = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });

  /* ════════════ PRINT TITLE ════════════ */

  useEffect(() => {
    if (!isReady) return;
    const cliente  = form.cliente.trim() || 'Cliente';
    const titulo   = `${cliente} - ${todayShort}`;
    const onBefore = () => { document.title = titulo; };
    const onAfter  = () => { document.title = originalTitle.current; };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint',  onAfter);
    return () => { window.removeEventListener('beforeprint', onBefore); window.removeEventListener('afterprint', onAfter); };
  }, [isReady, form.cliente, todayShort]);

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

    try {
      const base64 = await fileToBase64(file);
      const res = await fetch(PROXY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: EXTRACTION_PROMPT,
          history: [
            { role: 'user',  parts: [{ text: 'Actúa como experto en el mercado eléctrico español. Extrae datos estructurados de facturas eléctricas y devuelve JSON válido. Aplica correctamente las reglas de IVA españolas del sector eléctrico.' }] },
            { role: 'model', parts: [{ text: 'Entendido. Soy experto en facturas eléctricas españolas. Leeré el tipo de IVA directamente de la factura (21% general desde RD-ley 7/2026, 10% reducido, 7% IGIC en Canarias). Para compensación de excedentes de autoconsumo (reducción pre-IEE/IVA): extraeré el importe como número positivo en "compensacionExcedentes", el kWh vertido asociado en "kwhExcedentesVertidos", y usaré el total final pagado en "importeTotalFacturaActual". Para créditos post-IVA tipo Solar Wallet: usaré el subtotal bruto y pondré 0 en "compensacionExcedentes" y "kwhExcedentesVertidos". NUNCA incluiré los kWh de excedentes exportados en "totalKwhFacturados". Devolveré exclusivamente el objeto JSON solicitado.' }] },
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

      let ivaValue = form.iva;
      if (ex.tipoIVA != null) {
        const v = parseFloat(ex.tipoIVA);
        if      (Math.abs(v - 0.10) < 0.005) ivaValue = '0.10';
        else if (Math.abs(v - 0.07) < 0.005) ivaValue = '0.07';
        else                                  ivaValue = '0.21';
      }

      setForm(f => ({
        ...f,
        cliente:          ex.nombreCliente                     || f.cliente,
        cups:             ex.cups                              || f.cups,
        dias:             ex.diasFacturacion        != null    ? String(ex.diasFacturacion)              : f.dias,
        kwhP1:            ex.totalKwhFacturados     != null    ? String(ex.totalKwhFacturados)           : f.kwhP1,
        kwhP2:            '0',
        kwhP3:            '0',
        kwPunta:          ex.kwPotenciaPunta        != null    ? String(ex.kwPotenciaPunta)              : f.kwPunta,
        kwValle:          (ex.kwPotenciaValle != null && ex.kwPotenciaValle !== 0)
                            ? String(ex.kwPotenciaValle)
                            : (ex.kwPotenciaPunta != null ? String(ex.kwPotenciaPunta) : f.kwValle),
        facturaActual:          ex.importeTotalFacturaActual != null ? String(ex.importeTotalFacturaActual)    : f.facturaActual,
        alquilerContador:       ex.costeAlquilerContador    != null ? String(ex.costeAlquilerContador)        : f.alquilerContador,
        bonoSocial:             ex.costeBonoSocial          != null ? String(ex.costeBonoSocial)              : f.bonoSocial,
        compensacionExcedentes: ex.compensacionExcedentes   != null ? String(ex.compensacionExcedentes)       : f.compensacionExcedentes,
        excedentesKwh:          ex.kwhExcedentesVertidos    != null ? String(ex.kwhExcedentesVertidos)        : f.excedentesKwh,
        dtoCupones:             ex.descuentoCupon           != null ? String(ex.descuentoCupon)                : f.dtoCupones,
        iva:                    ivaValue,
      }));
      setExtractionDone(true);
    } catch (err) {
      console.error('[EC-LUZ] Extracción IA:', err);
      setExtractionError(err.message || 'No se pudo extraer la información automáticamente. Introduce los datos manualmente o inténtalo de nuevo.');
    } finally {
      clearInterval(countdownRef.current);
      setIsExtracting(false);
    }
  }

  async function handleDownloadPdf() {
    setIsExportingPdf(true);
    try {
      const cliente = form.cliente.trim() || 'informe';
      await exportElementToPdf('ec-informe', `Comparativa_${slugifyFilename(cliente)}_${todayShort.replace(/\//g, '-')}.pdf`);
    } finally {
      setIsExportingPdf(false);
    }
  }

  /* ════════════ FILE HANDLERS ════════════ */

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

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

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
          #ec-informe, #ec-informe * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          #ec-informe {
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
            <div className="space-y-2 mb-4">
              {TARIFAS.map(t => (
                <label
                  key={t.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                    tarifaId === t.id ? 'border-google-blue bg-blue-50' : 'border-google-border hover:border-blue-200'
                  }`}
                >
                  <input type="radio" name="tarifa" value={t.id} checked={tarifaId === t.id} onChange={() => setTarifaId(t.id)} className="accent-google-blue mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-google-dark">{t.label}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${t.tagClass}`}>{t.tag}</span>
                    </div>
                    <p className="text-[11px] text-google-gray mt-0.5 font-mono">
                      {t.isIndexada
                        ? <>Precio dinámico OMIE (A + B×OMIE)</>
                        : <>{(mant ? t.conMant : t.sinMant).toFixed(6)} €/kWh</>
                      } · Pot. P {t.potPunta.toFixed(3)} — V {t.potValle.toFixed(3)} €/kW·año
                      {t.isSolar && <> · Comp. excedentes {t.compExcedentes.toFixed(2)} €/kWh</>}
                      {t.cuotaBateriaMes > 0 && <> · Batería {t.cuotaBateriaMes}€/mes</>}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            {tarifa.isIndexada ? (
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
                {omie <= 0 && (
                  <p className="text-[10px] text-amber-600 mt-1">Introduce el precio OMIE del mes para un cálculo real; sin él solo se aplica el componente fijo A.</p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                <div className="flex items-center gap-2">
                  <MiniToggle on={mant} onToggle={() => setMant(v => !v)} />
                  <span className="text-xs text-google-gray">Mantenimiento <span className="text-google-blue font-semibold">(−3%)</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-google-gray">Comp. excedentes</span>
                  <MiniToggle on={compExcActiva} onToggle={() => setCompExcActiva(v => !v)} />
                </div>
              </div>
            )}
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
                    <p className="text-xs font-semibold text-google-blue text-center">Analizando factura con IA...</p>
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
                <><Upload size={18} className="mx-auto mb-2 text-gray-400" /><p className="text-xs text-google-gray">Arrastra la factura aquí o <span className="text-google-blue underline">selecciona un archivo</span></p><p className="text-[11px] text-gray-400 mt-0.5">PDF, JPG o PNG · Los datos se volcarán automáticamente</p></>
              )}
            </div>
            {extractionDone && !isExtracting && (
              <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mt-3">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800 leading-relaxed"><span className="font-bold text-amber-700 block mb-0.5">⚠️ Atención: Revisión obligatoria</span>Los datos han sido volcados automáticamente mediante IA. Revise todos los campos antes de presentar el estudio.</p>
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
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">3 · Consumo facturado (kWh)</p>
            <div className="grid grid-cols-3 gap-3">
              {[{ key: 'kwhP1', label: 'P1 · Punta', req: true }, { key: 'kwhP2', label: 'P2 · Llano' }, { key: 'kwhP3', label: 'P3 · Valle' }].map(({ key, label, req }) => (
                <div key={key}>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">{label} {req && <span className="text-red-400">*</span>}</label>
                  <input type="text" inputMode="decimal" value={form[key]} onChange={set(key)} placeholder="kWh" className="input-field text-sm" />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3 leading-relaxed">* En tarifas de precio fijo, se recomienda acumular todo el consumo en P1 (Punta).</p>
          </div>

          {/* 4 · Potencia y días */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">4 · Potencia contratada y período</p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">kW Punta <span className="text-red-400">*</span></label>
                <input type="text" inputMode="decimal" value={form.kwPunta} onChange={set('kwPunta')} placeholder="kW" className="input-field text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">kW Valle</label>
                <input type="text" inputMode="decimal" value={form.kwValle} onChange={set('kwValle')} placeholder="kW" className="input-field text-sm" />
              </div>
              <div>
                <label className="text-[10px] font-medium text-google-gray mb-1 block">Días fact. <span className="text-red-400">*</span></label>
                <input type="text" inputMode="decimal" value={form.dias} onChange={set('dias')} placeholder="días" className="input-field text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-google-gray">Precio potencia Punta / día</p>
                <p className="text-xs font-bold text-google-dark font-mono">{potPuntaDia.toFixed(6)} €/kW</p>
                <p className="text-[10px] text-gray-400">{tarifa.potPunta} ÷ 365</p>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2">
                <p className="text-[10px] text-google-gray">Precio potencia Valle / día</p>
                <p className="text-xs font-bold text-google-dark font-mono">{potValleDia.toFixed(6)} €/kW</p>
                <p className="text-[10px] text-gray-400">{tarifa.potValle} ÷ 365</p>
              </div>
            </div>
          </div>

          {/* 5 · Datos cliente e impuestos */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">5 · Datos del cliente e impuestos</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Nombre / Empresa</label>
                  <input type="text" value={form.cliente} onChange={set('cliente')} placeholder="Cliente" className="input-field text-sm" />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">CUPS</label>
                  <input type="text" value={form.cups} onChange={set('cups')} placeholder="ES..." className="input-field text-sm font-mono" />
                </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">
                    Excedentes vertidos a la red (kWh)
                    {tarifa.isSolar && <span className="ml-1 text-[9px] text-google-blue font-normal italic">Autoconsumo</span>}
                  </label>
                  <input
                    type="text" inputMode="decimal"
                    value={form.excedentesKwh}
                    onChange={set('excedentesKwh')}
                    disabled={!tarifa.isSolar || !compExcActiva}
                    placeholder="kWh"
                    className={`input-field text-sm ${(!tarifa.isSolar || !compExcActiva) ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-google-gray mb-1 block">Comp. excedentes (€)</label>
                  {tarifa.isSolar ? (
                    <div className={`input-field text-sm flex items-center justify-between gap-2 ${compExcActiva ? 'bg-gray-50' : 'bg-gray-100 opacity-50'}`}>
                      <span className="font-semibold text-green-700 tabular-nums">{eur(excedentes)}</span>
                      {compExcActiva && <span className="text-[9px] text-google-gray whitespace-nowrap">{excedentesKwh}×{tarifa.compExcedentes.toFixed(2)}</span>}
                    </div>
                  ) : (
                    <input
                      type="text" inputMode="decimal"
                      value={form.compensacionExcedentes}
                      onChange={set('compensacionExcedentes')}
                      disabled={!compExcActiva}
                      placeholder="0.00"
                      className={`input-field text-sm ${!compExcActiva ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
                    />
                  )}
                </div>
              </div>
              {!compExcActiva && (
                <p className="text-[10px] text-gray-400 leading-snug">Activa "Comp. excedentes" junto a Mantenimiento (arriba, sección 1) para habilitar estos campos.</p>
              )}
              {tarifa.isSolar && tarifa.compExcedentes === 0 && excedentesKwh > 0 && compExcActiva && (
                <p className="text-[10px] text-amber-600 leading-snug">Solar Basic no retribuye excedentes vertidos a la red (0 €/kWh).</p>
              )}
              {tarifa.bateriaVirtual && bateriaCredito > 0 && (
                <p className="text-[10px] text-purple-600 leading-snug">
                  Excedente no absorbido este período: {eur(bateriaCredito)} se acumulan en la Batería Virtual para próximas facturas.
                </p>
              )}
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
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.dtoCupones}
                    onChange={set('dtoCupones')}
                    placeholder="0.00"
                    className="input-field text-sm"
                  />
                </div>
                <div className="flex items-end">
                  {dtoCup > 0 && factActual > 0 ? (
                    <div className="w-full bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] text-orange-600 font-medium leading-none mb-0.5">Cupón no aplicado a la comparativa</p>
                      <p className="text-sm font-bold text-orange-700 tabular-nums">−{eur(dtoCup)}</p>
                      <p className="text-[9px] text-orange-400 mt-0.5">Se compara siempre con el bruto: {eur(factActual)}</p>
                    </div>
                  ) : (
                    <div className="w-full text-[10px] text-google-gray leading-snug px-1">
                      Este descuento es solo informativo: la comparativa siempre usa el importe bruto de la factura
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
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center">
                <Calculator size={26} className="text-google-blue" />
              </div>
              <p className="text-sm font-semibold text-google-dark">El informe aparecerá aquí</p>
              <p className="text-xs text-google-gray max-w-xs text-center">Rellena al menos: consumo P1, kW Punta, días de facturación y factura actual.</p>
            </div>
          ) : (
            <div id="ec-informe" className="bg-white border border-google-border rounded-xl shadow-sm overflow-hidden">

              {/* Cabecera azul */}
              <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 pt-8 pb-7 text-white relative">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-200 mb-1.5">GRUPO AVEDIE · COMPARATIVA ENERGÉTICA</p>
                    <h3 className="text-xl font-bold leading-tight">{form.cliente || 'Sin nombre'}</h3>
                    {form.cups && <p className="text-xs text-blue-200 font-mono mt-1">{form.cups}</p>}
                  </div>
                  <div className="flex-shrink-0">
                    <div className="bg-white rounded-xl px-4 py-3">
                      <img src="/endesa-logo.png" alt="Endesa" className="h-16 w-auto object-contain" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2.5 pr-40">
                  <span className="bg-white/20 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full">{tarifa.shortLabel}</span>
                  {isIndexada && <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">OMIE {omie.toFixed(4)} €/kWh</span>}
                  {mant && <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">Con Mantenimiento −3%</span>}
                  <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">{dias} días</span>
                  {n(form.descuento) > 0 && <span className="bg-white/20 text-white text-[11px] px-3 py-1.5 rounded-full">Dto. adicional {form.descuento}%</span>}
                </div>
                <div className="absolute bottom-6 right-8 text-right text-xs">
                  <p className="font-semibold text-white">{today}</p>
                  {asesorDisplay && <p className="text-blue-200 mt-0.5">{asesorDisplay}</p>}
                </div>
              </div>

              {/* Potencia */}
              <div className="px-6 pt-5 pb-4">
                <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">Término de Potencia</p>
                <div className="space-y-1.5">
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">{kwPunta} kW (Punta) × {dias} días × {potPuntaDia.toFixed(6)} €/kW</span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtPotPunta)}</span>
                  </div>
                  {kwValle > 0 && (
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">{kwValle} kW (Valle) × {dias} días × {potValleDia.toFixed(6)} €/kW</span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtPotValle)}</span>
                    </div>
                  )}
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
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">
                      {kwhP1} kWh (P1) × {precioP1.toFixed(6)} €/kWh
                      {isIndexada && <span className="text-cyan-600 ml-1.5 text-[11px]">({tarifa.energiaA.p1.toFixed(6)} + {tarifa.energiaB.p1} × {omie.toFixed(4)})</span>}
                      {dto > 0 && <span className="text-google-blue ml-1.5 text-[11px]">(dto. {pct(dto, 0)} incluido)</span>}
                    </span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtEnP1)}</span>
                  </div>
                  {kwhP2 > 0 && (
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">
                        {kwhP2} kWh (P2) × {precioP2.toFixed(6)} €/kWh
                        {isIndexada && <span className="text-cyan-600 ml-1.5 text-[11px]">({tarifa.energiaA.p2.toFixed(6)} + {tarifa.energiaB.p2} × {omie.toFixed(4)})</span>}
                      </span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtEnP2)}</span>
                    </div>
                  )}
                  {kwhP3 > 0 && (
                    <div className="flex justify-between items-baseline text-sm">
                      <span className="text-google-gray">
                        {kwhP3} kWh (P3) × {precioP3.toFixed(6)} €/kWh
                        {isIndexada && <span className="text-cyan-600 ml-1.5 text-[11px]">({tarifa.energiaA.p3.toFixed(6)} + {tarifa.energiaB.p3} × {omie.toFixed(4)})</span>}
                      </span>
                      <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(imtEnP3)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center bg-gray-50 rounded-lg px-3 py-2 mt-1">
                    <span className="text-xs font-semibold text-google-dark">Subtotal Energía</span>
                    <span className="text-sm font-bold text-google-dark tabular-nums">{eur(subtotEn)}</span>
                  </div>
                  {excedentes > 0 && (
                    <div className="flex justify-between items-baseline text-sm mt-1.5">
                      <span className="text-[12px] text-green-700">
                        Compensación excedentes (autoconsumo)
                        {tarifa.isSolar && <span className="text-google-gray ml-1">({excedentesKwh} kWh × {tarifa.compExcedentes.toFixed(2)} €/kWh)</span>}
                      </span>
                      <span className="font-semibold text-green-700 tabular-nums ml-4">−{eur(excedentes)}</span>
                    </div>
                  )}
                  {tarifa.bateriaVirtual && bateriaCredito > 0 && (
                    <div className="flex justify-between items-baseline text-sm mt-1">
                      <span className="text-[11px] text-purple-600">Saldo acumulado en Batería Virtual (próximas facturas)</span>
                      <span className="font-semibold text-purple-600 tabular-nums ml-4">{eur(bateriaCredito)}</span>
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
                {cuotaBateriaImporte > 0 && (
                  <div className="flex justify-between items-baseline text-sm">
                    <span className="text-google-gray">Cuota Batería Virtual ({tarifa.cuotaBateriaMes}€/mes)</span>
                    <span className="font-semibold text-google-dark tabular-nums ml-4">{eur(cuotaBateriaImporte)}</span>
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
