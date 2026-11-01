import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Info, Save } from 'lucide-react';
import campos from '../../lib/contratosEndesa/campos.json';
import camposPS from '../../lib/contratosEndesa/campos_puntos_suministro.json';
import { aplicarEdicion, camposVaciosAviso, estaCompleta, leerClave, obligatoriosVacios } from '../../lib/contratosEndesa/ensamblar';
import { MODALIDADES, TARIFA_ID } from '../../lib/contratosEndesa/constantes';
import { capaAnexo, capaContrato, capaPuntos } from '../../lib/documentacionB2B/capaVisor';
import { construirPdfs } from '../../lib/documentacionB2B/flujo';
import { obtenerTarifa } from '../../lib/tarifas/obtenerTarifa';
import VisorDocumento from './VisorDocumento';

const DOCS = [
  { tipo: 'contrato', label: 'Contrato' },
  { tipo: 'anexo_precios', label: 'Anexo de precios' },
  { tipo: 'anexo_puntos', label: 'Anexo de puntos de suministro' },
];

/** Avisos, botones de documento, visor con edición y «Guardar». */
export default function EditorDocumentacion({ inicial, pdfsIniciales, plantillas, onGuardar, textoGuardar = 'Guardar cambios', onCambios, controlesDocumento = false }) {
  const [modelo, setModelo] = useState(inicial);
  const [pdfs, setPdfs] = useState(pdfsIniciales);
  const [editados, setEditados] = useState({});
  const [tipo, setTipo] = useState('contrato');
  const [errorEdicion, setErrorEdicion] = useState('');
  const [verTodos, setVerTodos] = useState(false);

  const rojos = useMemo(() => {
    const v = obligatoriosVacios(modelo);
    modelo.suministros.forEach((s, i) => { if (!s.bloque_precios?.length) v.push(`s${i}.potencia_p1`); });
    return [...new Set(v)];
  }, [modelo]);
  const completa = useMemo(() => estaCompleta(modelo), [modelo]);
  const hayCambios = Object.keys(editados).length > 0;

  const capa = useMemo(() => {
    if (tipo === 'contrato') return capaContrato(campos.contrato, modelo);
    if (tipo === 'anexo_precios') return capaAnexo(campos.anexo, modelo);
    return capaPuntos(camposPS, modelo);
  }, [tipo, modelo]);

  const editar = async (clave, valor) => {
    setErrorEdicion('');
    const antes = leerClave(modelo, clave);
    if (String(antes ?? '') === String(valor ?? '')) return true;
    try {
      const { tarifa } = obtenerTarifa(TARIFA_ID[modelo.tarifa_acceso]);
      const nuevo = aplicarEdicion(modelo, clave, valor, tarifa);
      const generados = await construirPdfs(plantillas, nuevo);
      setModelo(nuevo);
      setPdfs(generados);
      setEditados((e) => {
        const n = { ...e, [clave]: { de: e[clave]?.de ?? antes ?? '', a: valor } };
        onCambios?.(true);
        return n;
      });
      return true;
    } catch (err) {
      setErrorEdicion(err.message);
      return false;
    }
  };

  // Tras guardar se sigue en el mismo documento, sin cambios pendientes.
  const guardar = async () => {
    const ok = await onGuardar({ modelo, editados, pdfs, plantillas });
    if (ok) { setEditados({}); onCambios?.(false); }
  };

  const vacios = camposVaciosAviso(modelo);
  const modalidad = MODALIDADES.find((m) => m.id === modelo.modalidad);
  const docs = DOCS.filter((d) => pdfs[d.tipo]);
  const iDoc = docs.findIndex((d) => d.tipo === tipo);
  const fechaFin = modelo.campos.validez_hasta;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-3" data-testid="aviso-1">
        <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-amber-500" />
        <p>
          <strong>Documentación generada con IA. Revísala completa antes de enviarla al cliente.</strong>{' '}
          Pasa el ratón por cualquier dato y pulsa el ✏️ para editarlo. Los datos marcados con ⚠ se han deducido o tomado por defecto: revísalos con especial atención.
        </p>
      </div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-google-dark flex gap-3" data-testid="aviso-2">
        <Info size={18} className="flex-shrink-0 mt-0.5 text-google-blue" />
        <div className="space-y-1">
          <p><strong>Modalidad: {modalidad?.label}</strong>{modelo.modalidad === 'plana' ? ' (por defecto)' : ''}. Confírmala con el cliente.</p>
          <p>
            Algunos campos se han dejado vacíos porque Endesa no suele rellenarlos, como{' '}
            {vacios.slice(0, 3).map((v, i) => <span key={v}>{i > 0 && (i === Math.min(vacios.length, 3) - 1 ? ' o ' : ', ')}<strong>{v}</strong></span>)}.
            {' '}No es obligatorio rellenarlos, pero puedes hacerlo si quieres.{' '}
            <button type="button" onClick={() => setVerTodos((v) => !v)} className="text-google-blue font-medium hover:underline">{verTodos ? 'Ver menos' : 'Ver todos'}</button>
          </p>
          {verTodos && <p className="text-xs text-google-gray" data-testid="vacios-todos">{vacios.join(' · ')}</p>}
        </div>
      </div>
      {modelo.tarifa_caducada && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-3" data-testid="aviso-caducada">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5 text-amber-500" />
          <p>La tarifa usada está fuera de vigencia (válida hasta {fechaFin}). Actualízala en Consulta de Tarifas cuando tengas la nueva.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {docs.map((d) => (
            <button key={d.tipo} onClick={() => setTipo(d.tipo)} data-testid={`doc-${d.tipo}`}
              className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${tipo === d.tipo ? 'bg-google-blue text-white shadow-sm' : 'bg-gray-100 text-google-gray hover:bg-gray-200'}`}>
              {d.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {controlesDocumento && (
            <label className="flex items-center gap-2 text-sm text-google-gray">
              Cambiar modalidad
              <select value={modelo.modalidad} onChange={(e) => editar('modalidad', e.target.value)} data-testid="selector-cambiar-modalidad" className="input-field text-sm py-1.5 w-40">
                {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          )}
          <button onClick={guardar} disabled={!hayCambios} data-testid="guardar-cambios"
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
            <Save size={15} /> {textoGuardar}
          </button>
        </div>
      </div>

      {tipo === 'anexo_precios' && (
        <label className="flex items-center gap-2 text-xs text-google-gray">
          Modalidad
          <select value={modelo.modalidad} onChange={(e) => editar('modalidad', e.target.value)} data-testid="selector-modalidad-anexo" className="input-field text-xs py-1 w-44">
            {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
      )}
      {errorEdicion && (tipo === 'anexo_precios' || controlesDocumento) && <p className="text-xs text-red-600">{errorEdicion}</p>}

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <VisorDocumento
            bytes={pdfs[tipo]}
            nombreArchivo={`${DOCS.find((d) => d.tipo === tipo).label} - ${modelo.campos.documento_numero}.pdf`}
            capa={capa}
            modelo={modelo}
            avisos={modelo.avisos}
            rojos={rojos}
            bloqueado={!completa}
            onEditar={editar}
            errorEdicion={errorEdicion}
            limpiarError={() => setErrorEdicion('')}
          />
        </div>
        {controlesDocumento && (
          <div className="sticky top-1/2 flex flex-col gap-2">
            <button onClick={() => setTipo(docs[iDoc - 1].tipo)} disabled={iDoc <= 0} data-testid="doc-anterior" aria-label="Documento anterior" title="Documento anterior"
              className="p-2 rounded-full border border-google-border bg-white text-google-dark hover:bg-gray-100 disabled:opacity-30"><ArrowLeft size={18} /></button>
            <button onClick={() => setTipo(docs[iDoc + 1].tipo)} disabled={iDoc >= docs.length - 1} data-testid="doc-siguiente" aria-label="Documento siguiente" title="Documento siguiente"
              className="p-2 rounded-full border border-google-border bg-white text-google-dark hover:bg-gray-100 disabled:opacity-30"><ArrowRight size={18} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
