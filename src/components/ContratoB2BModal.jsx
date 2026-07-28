import { useState, useEffect, useRef } from 'react';
import { X, AlertTriangle, Download, Loader2 } from 'lucide-react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import { useData, fetchSingleDoc } from '../context/DataContext';
import { slugifyFilename } from '../lib/exportPdf';

const PROXY_URL = '/api/gemini';
const EXTRACTION_TIMEOUT_MS = 25000;

/* Plantillas .docx oficiales de Endesa con las etiquetas de docxtemplater ya
   insertadas en los huecos reales del Word — ver docs/plantillas-endesa/README.md.
   NO se reconstruye el contrato visualmente: se rellena el documento oficial. */
const TEMPLATE_FIJO = '/templates/contrato-endesa-fijo.docx';
const TEMPLATE_INDEXADO = '/templates/contrato-endesa-indexado.docx';

function esIndexado(cliente) {
  const t = `${cliente.id_producto || ''} ${cliente.tarifa || ''}`.toLowerCase();
  return t.includes('indexad');
}

/* Mismo criterio de estimación que EstudioComparativoB2B.jsx (base fija de red/arranque
   del modelo + tiempo proporcional al peso del documento adjunto). */
function estimateExtractionSeconds(fileSizeBytes) {
  const BASE_SECONDS = 5;
  const SECONDS_PER_500KB = 1.5;
  const chunks = fileSizeBytes / (500 * 1024);
  return Math.round(BASE_SECONDS + chunks * SECONDS_PER_500KB);
}

// data:<mime>;base64,<data> (mismo formato que guarda BINARY_FIELDS en Supabase,
// ver openBase64InTab en src/lib/attachmentTab.js) -> { mimeType, data, sizeBytes }
function parseDataUri(dataUri) {
  if (!dataUri) return null;
  const mimeType = dataUri.split(';')[0].replace('data:', '');
  const data = dataUri.split(',')[1] || '';
  return { mimeType, data, sizeBytes: Math.round((data.length * 3) / 4) };
}

// CIF: letra + 7 dígitos + dígito/letra de control. DNI: 8 dígitos + letra. NIE: X/Y/Z + 7 dígitos + letra.
const CIF_RE = /^[A-HJNPQRSUVW]\d{7}[0-9A-J]$/i;
const DNI_RE = /^\d{8}[A-Z]$/i;
const NIE_RE = /^[XYZ]\d{7}[A-Z]$/i;
function calcularTipoDoc(identificador) {
  const v = (identificador || '').trim().toUpperCase();
  if (CIF_RE.test(v)) return 'IDENTIFICADOR FISCAL';
  if (DNI_RE.test(v) || NIE_RE.test(v)) return 'NIF';
  return 'NIF';
}

function tramoPotencia(tarifa) {
  if ((tarifa || '').startsWith('6.1')) return '> 1kV (6.1TD)';
  return '> 15kW (3.0TD)';
}

const todayDDMMYYYY = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
};

const EXTRACTION_PROMPT = `Actúa como asistente administrativo experto en contratos de energía B2B españoles (Endesa, tarifas 3.0TD/6.1TD).
Te paso un documento adjunto (DNI, CIF de autónomo o factura) de un cliente que ya está dado de alta en nuestro CRM. Ya tenemos su nombre/razón social, CIF/NIF, teléfono, email, CUPS e IBAN — NO los pidas.
Extrae ÚNICAMENTE del documento adjunto los siguientes datos, y solo si aparecen de forma clara y evidente. Si un dato no aparece con confianza, devuelve null en ese campo — no inventes, no infieras, no reintentes.
Devuelve EXCLUSIVAMENTE un objeto JSON con esta forma exacta:
{
  "direccionCalle": string|null, "direccionNumero": string|null, "direccionEscalera": string|null, "direccionPiso": string|null, "direccionPuerta": string|null,
  "direccionCp": string|null, "direccionLocalidad": string|null, "direccionProvincia": string|null,
  "cnae": string|null, "actividad": string|null,
  "psReferenciaCatastral": string|null,
  "representanteNombre": string|null, "representanteDni": string|null, "representanteCargo": string|null, "representanteTelefono": string|null, "representanteEmail": string|null,
  "potenciaP1": string|null, "potenciaP2": string|null, "potenciaP3": string|null, "potenciaP4": string|null, "potenciaP5": string|null, "potenciaP6": string|null,
  "tension": string|null
}`;

const CAMPO_VACIO = {
  direccionCalle: '', direccionNumero: '', direccionEscalera: '', direccionPiso: '', direccionPuerta: '',
  direccionCp: '', direccionLocalidad: '', direccionProvincia: '',
  cnae: '', actividad: '',
  psDireccionCalle: '', psDireccionNumero: '', psDireccionEscalera: '', psDireccionPiso: '', psDireccionPuerta: '',
  psCp: '', psLocalidad: '', psProvincia: '', psReferenciaCatastral: '',
  representanteNombre: '', representanteDni: '', representanteCargo: '', representanteTelefono: '', representanteEmail: '',
  potenciaP1: '', potenciaP2: '', potenciaP3: '', potenciaP4: '', potenciaP5: '', potenciaP6: '', tension: '',
  direccionAlternativa: '',
};

function Field({ label, value, onChange, required, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-medium text-google-gray mb-0.5">
        {label}{required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs px-2 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-google-blue/40 focus:border-google-blue"
      />
    </label>
  );
}

function Grupo({ titulo, children }) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-white bg-google-blue px-2.5 py-1 rounded">{titulo}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 px-0.5">{children}</div>
    </div>
  );
}

// Toggle de domiciliación — solo referencia visual al patrón ya usado en
// GestionUsuarios.jsx (mismas clases Tailwind), sin importar ni tocar ese fichero.
function DomiciliacionToggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none cursor-pointer ${
        checked ? 'bg-google-blue' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-[18px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function ContratoB2BModal({ cliente, onClose }) {
  const { docsFlags, guardarContratoGenerado } = useData();

  const [fase, setFase] = useState('extrayendo'); // 'extrayendo' | 'editando' | 'guardando'
  const [estimatedSeconds, setEstimatedSeconds] = useState(5);
  const [remainingSeconds, setRemainingSeconds] = useState(5);
  const [extractionError, setExtractionError] = useState('');
  const [iaRaw, setIaRaw] = useState(null);
  const [saveError, setSaveError] = useState('');
  const countdownRef = useRef(null);

  const [form, setForm] = useState({
    razonSocial: cliente.nombre || '',
    identificador: cliente.cif_dni || '',
    telefono1: cliente.telefono || '',
    telefono2: '',
    email: cliente.mail || '',
    cups: cliente.cups || '',
    ibanTitular: cliente.nombre || '',
    iban: cliente.cuenta_bancaria || '',
    ...CAMPO_VACIO,
  });
  const [domiciliado, setDomiciliado] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const tipoDoc = calcularTipoDoc(form.identificador);
  const fecha = todayDDMMYYYY();

  // ── Paso 1: extracción IA (solo si hay un documento adjunto del que extraer algo) ──
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const campo = docsFlags[cliente.id]?.tiene_factura_b2b ? 'factura_b2b_url'
        : docsFlags[cliente.id]?.tiene_dni ? 'dni_escaneado'
        : docsFlags[cliente.id]?.tiene_cif ? 'cif_autonomo_url'
        : null;

      if (!campo) { setFase('editando'); return; }

      const dataUri = await fetchSingleDoc(cliente.id, campo);
      const parsed = parseDataUri(dataUri);
      if (cancelled) return;
      if (!parsed || !parsed.data) { setFase('editando'); return; }

      const estimated = estimateExtractionSeconds(parsed.sizeBytes);
      setEstimatedSeconds(estimated);
      setRemainingSeconds(estimated);
      countdownRef.current = setInterval(() => setRemainingSeconds((s) => Math.max(0, s - 1)), 1000);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);

      try {
        const res = await fetch(PROXY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: EXTRACTION_PROMPT,
            history: [
              { role: 'user',  parts: [{ text: 'Vas a extraer datos de un documento adjunto (DNI, CIF de autónomo o factura) para rellenar un contrato de energía B2B. Devuelve solo JSON.' }] },
              { role: 'model', parts: [{ text: 'Entendido. Extraeré únicamente los datos que vea con claridad en el documento y devolveré null en el resto, sin inventar nada.' }] },
            ],
            file: { mimeType: parsed.mimeType, data: parsed.data },
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

        let raw = data.response.trim();
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) raw = fenced[1].trim();
        else { const m = raw.match(/\{[\s\S]*\}/); if (m) raw = m[0]; }

        const ex = JSON.parse(raw);
        setIaRaw(ex);
        setForm((f) => {
          const next = { ...f };
          Object.keys(CAMPO_VACIO).forEach((k) => {
            if (ex[k] != null && String(ex[k]).trim() !== '') next[k] = String(ex[k]).trim();
          });
          // Dirección del punto de suministro: si Gemini no la distingue de la
          // fiscal, se deja vacía (el comercial la copia a mano si coincide) —
          // nunca se asume igual sin que el documento lo confirme.
          return next;
        });
      } catch (err) {
        if (!cancelled) setExtractionError(err.name === 'AbortError' ? 'La IA tardó demasiado en responder.' : (err.message || 'Error al extraer datos.'));
      } finally {
        clearInterval(countdownRef.current);
        if (!cancelled) setFase('editando');
      }
    }

    run();
    return () => { cancelled = true; clearInterval(countdownRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Generar contrato: carga la plantilla .docx oficial (fijo o indexado
  // según el producto contratado), inyecta los datos del formulario con
  // docxtemplater y descarga el .docx real — nunca se reconstruye el
  // documento visualmente. ────────────────────────────────────────────────
  const handleGenerar = async () => {
    setFase('guardando');
    setSaveError('');
    try {
      const templateUrl = esIndexado(cliente) ? TEMPLATE_INDEXADO : TEMPLATE_FIJO;
      const res = await fetch(templateUrl);
      if (!res.ok) throw new Error(`No se pudo cargar la plantilla del contrato (${templateUrl}).`);
      const arrayBuffer = await res.arrayBuffer();

      const zip = new PizZip(arrayBuffer);
      const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

      const productoContratado = cliente.id_producto || cliente.tarifa || '';
      doc.render({
        numero_oferta: 'Grupo Avedie',
        razon_social: form.razonSocial,
        tipo_doc: tipoDoc,
        identificador: form.identificador,
        idioma: 'CASTELLANO',
        cnae: form.cnae,
        actividad: form.actividad,
        telefono1: form.telefono1,
        telefono2: form.telefono2,
        email: form.email,
        direccion_calle: form.direccionCalle,
        direccion_numero: form.direccionNumero,
        direccion_escalera: form.direccionEscalera,
        direccion_piso: form.direccionPiso,
        direccion_puerta: form.direccionPuerta,
        direccion_cp: form.direccionCp,
        direccion_localidad: form.direccionLocalidad,
        direccion_provincia: form.direccionProvincia,
        ps_direccion_calle: form.psDireccionCalle,
        ps_direccion_numero: form.psDireccionNumero,
        ps_direccion_escalera: form.psDireccionEscalera,
        ps_direccion_piso: form.psDireccionPiso,
        ps_direccion_puerta: form.psDireccionPuerta,
        ps_cp: form.psCp,
        ps_localidad: form.psLocalidad,
        ps_provincia: form.psProvincia,
        ps_referencia_catastral: form.psReferenciaCatastral,
        representante_nombre: form.representanteNombre,
        representante_dni: form.representanteDni,
        representante_cargo: form.representanteCargo,
        representante_telefono: form.representanteTelefono,
        representante_email: form.representanteEmail,
        direccion_alternativa: form.direccionAlternativa,
        cups: form.cups,
        producto_contratado: productoContratado,
        tarifa: cliente.tarifa || '',
        tramo_potencia: tramoPotencia(cliente.tarifa),
        p1: form.potenciaP1, p2: form.potenciaP2, p3: form.potenciaP3,
        p4: form.potenciaP4, p5: form.potenciaP5, p6: form.potenciaP6,
        tension: form.tension,
        iban_titular: form.ibanTitular,
        iban: form.iban,
        fecha,
      });

      const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      const cifSlug = (form.identificador || 'SINCIF').replace(/[^a-zA-Z0-9]/g, '');
      const filename = `CONTRATO_ENDESA_${cifSlug}_${slugifyFilename(form.razonSocial)}.docx`;
      saveAs(blob, filename);

      const archivoBase64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const result = await guardarContratoGenerado({
        clienteId: cliente.id,
        datosFormulario: { ...form, domiciliado, tipoDoc, fecha },
        extraccionIaRaw: iaRaw,
        archivoBase64,
      });
      if (result?.error) throw new Error(result.error.message || 'Error al guardar el contrato.');

      onClose();
    } catch (err) {
      console.error('handleGenerar:', err);
      let msg = err.message || 'Error al generar el contrato.';
      if (err?.properties?.errors?.length) {
        msg = 'Error en la plantilla: ' + err.properties.errors
          .map((e) => e.properties?.explanation || e.properties?.id || e.message)
          .join('; ');
      }
      setSaveError(msg);
      setFase('editando');
    }
  };

  const potencias = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop bg-black/30">
      {/* z-[60], no z-50: el footer de este modal puede llegar a la esquina
          inferior derecha, donde el chip flotante del Asistente IA (z-50,
          ver AIAssistant.jsx) se solapaba con el botón de generar. */}
      <div className="bg-white rounded-2xl shadow-google w-full max-w-4xl mx-4 flex flex-col max-h-[94vh] overflow-hidden">

        {/* Cabecera */}
        <div className="px-6 py-4 flex items-center justify-between border-b border-google-border bg-indigo-50 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-google-dark">Generar Contrato B2B — {cliente.nombre}</h2>
            <p className="text-xs text-google-gray">
              Plantilla oficial Endesa ({esIndexado(cliente) ? 'indexada' : 'fija'}, {cliente.tarifa}) · Nº Oferta: Grupo Avedie · {fecha}
            </p>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Paso 1: extracción IA */}
        {fase === 'extrayendo' && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24">
            <Loader2 size={36} className="text-google-blue animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-google-dark">Extrayendo datos de la ficha del cliente y documentos adjuntos con Inteligencia Artificial...</p>
              <p className="text-xs text-google-gray mt-1">
                Tiempo estimado: {remainingSeconds > 0 ? `${remainingSeconds}s` : `${estimatedSeconds}s aprox.`}
              </p>
            </div>
          </div>
        )}

        {/* Paso 2: formulario */}
        {fase !== 'extrayendo' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="sticky top-0 z-10 bg-amber-50 border-b border-amber-300 px-4 py-2.5 flex items-start gap-2">
              <AlertTriangle size={15} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-900 leading-snug">
                <strong>Atención:</strong> estos datos han sido extraídos automáticamente por IA a partir de la ficha del cliente y la documentación adjunta.
                Es obligatorio revisar minuciosamente cada campo antes de generar el contrato. Cualquier error en el documento final generado será
                responsabilidad del comercial que lo valide, no del sistema.
              </p>
            </div>

            {extractionError && (
              <div className="mx-4 mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] text-orange-700">
                {extractionError} — completa los campos que falten a mano.
              </div>
            )}

            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <div><span className="text-google-gray">Nº Oferta:</span> <span className="font-semibold">Grupo Avedie</span></div>
                <div><span className="text-google-gray">Fecha:</span> <span className="font-semibold">{fecha}</span></div>
                <div><span className="text-google-gray">Idioma:</span> <span className="font-semibold">CASTELLANO</span></div>
                <div><span className="text-google-gray">Tipo de doc.:</span> <span className="font-semibold">{tipoDoc}</span></div>
              </div>

              <Grupo titulo="A. Datos del cliente titular del suministro">
                <Field label="Razón Social / Apellidos, Nombre" required className="col-span-2 md:col-span-3" value={form.razonSocial} onChange={set('razonSocial')} />
                <Field label="Nº (CIF/NIF)" required value={form.identificador} onChange={set('identificador')} />
                <Field label="CNAE" value={form.cnae} onChange={set('cnae')} />
                <Field label="Actividad" value={form.actividad} onChange={set('actividad')} />
                <Field label="Tlf. contacto 1" required value={form.telefono1} onChange={set('telefono1')} />
                <Field label="Tlf. contacto 2" value={form.telefono2} onChange={set('telefono2')} />
                <Field label="E-mail" required value={form.email} onChange={set('email')} />
                <Field label="Dirección" required value={form.direccionCalle} onChange={set('direccionCalle')} />
                <Field label="Nº" required value={form.direccionNumero} onChange={set('direccionNumero')} />
                <Field label="Escalera" value={form.direccionEscalera} onChange={set('direccionEscalera')} />
                <Field label="Piso" value={form.direccionPiso} onChange={set('direccionPiso')} />
                <Field label="Puerta" value={form.direccionPuerta} onChange={set('direccionPuerta')} />
                <Field label="Código Postal" required value={form.direccionCp} onChange={set('direccionCp')} />
                <Field label="Localidad" required value={form.direccionLocalidad} onChange={set('direccionLocalidad')} />
                <Field label="Provincia" required value={form.direccionProvincia} onChange={set('direccionProvincia')} />
              </Grupo>

              <Grupo titulo="B. Dirección del punto de suministro">
                <Field label="Dirección" required value={form.psDireccionCalle} onChange={set('psDireccionCalle')} />
                <Field label="Nº" required value={form.psDireccionNumero} onChange={set('psDireccionNumero')} />
                <Field label="Escalera" value={form.psDireccionEscalera} onChange={set('psDireccionEscalera')} />
                <Field label="Piso" value={form.psDireccionPiso} onChange={set('psDireccionPiso')} />
                <Field label="Puerta" value={form.psDireccionPuerta} onChange={set('psDireccionPuerta')} />
                <Field label="Código Postal" required value={form.psCp} onChange={set('psCp')} />
                <Field label="Localidad" required value={form.psLocalidad} onChange={set('psLocalidad')} />
                <Field label="Provincia" required value={form.psProvincia} onChange={set('psProvincia')} />
                <Field label="Referencia Catastral" value={form.psReferenciaCatastral} onChange={set('psReferenciaCatastral')} />
                <Field label="CUPS" required value={form.cups} onChange={set('cups')} />
              </Grupo>

              <Grupo titulo="C. Representante / Firmante">
                <Field label="Apellidos, Nombre" required className="col-span-2 md:col-span-3" value={form.representanteNombre} onChange={set('representanteNombre')} />
                <Field label="DNI" required value={form.representanteDni} onChange={set('representanteDni')} />
                <Field label="Cargo" value={form.representanteCargo} onChange={set('representanteCargo')} />
                <Field label="Teléfono" required value={form.representanteTelefono} onChange={set('representanteTelefono')} />
                <Field label="E-mail" required value={form.representanteEmail} onChange={set('representanteEmail')} />
              </Grupo>

              <Grupo titulo="D. Dirección alternativa de facturación (opcional)">
                <Field label="Dirección alternativa" className="col-span-2 md:col-span-3" value={form.direccionAlternativa} onChange={set('direccionAlternativa')} />
              </Grupo>

              <Grupo titulo={`E. Tarifa y potencias contratadas (${cliente.tarifa})`}>
                {potencias.map((p) => (
                  <Field key={p} label={`Potencia ${p} (kW)`} required value={form[`potencia${p}`]} onChange={set(`potencia${p}`)} />
                ))}
                <Field label="Tensión (V)" required value={form.tension} onChange={set('tension')} />
              </Grupo>

              <Grupo titulo="F. Datos bancarios">
                <Field label="Titular de la cuenta" required className="col-span-2 md:col-span-3" value={form.ibanTitular} onChange={set('ibanTitular')} />
                <Field label="IBAN" required className="col-span-2 md:col-span-3" value={form.iban} onChange={set('iban')} />
              </Grupo>
              <div className="flex items-center gap-2.5 px-0.5">
                <DomiciliacionToggle checked={domiciliado} onChange={() => setDomiciliado((v) => !v)} />
                <span className="text-xs text-google-dark">Cargo en cuenta bancaria actual con pago domiciliado <span className="text-google-gray">(solo en caso de renovación)</span></span>
              </div>
            </div>
          </div>
        )}

        {/* Footer: acciones */}
        {fase !== 'extrayendo' && (
          <div className="px-6 py-3.5 border-t border-google-border bg-google-bg flex items-center justify-end gap-2 flex-shrink-0">
            {saveError && <p className="text-xs text-red-600 mr-auto">{saveError}</p>}
            <button onClick={onClose} disabled={fase === 'guardando'} className="btn-secondary text-sm px-4 py-1.5">
              Cancelar
            </button>
            <button
              onClick={handleGenerar}
              disabled={fase === 'guardando'}
              className="btn-primary text-sm px-4 py-1.5 flex items-center gap-1.5"
            >
              {fase === 'guardando'
                ? <><Loader2 size={14} className="animate-spin" /> Generando...</>
                : <><Download size={14} /> Generar y Descargar Contrato</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
