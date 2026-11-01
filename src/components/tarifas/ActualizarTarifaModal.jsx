import { useRef, useState } from 'react';
import { AlertTriangle, ArrowRight, FileUp, Loader2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { extraerFactura } from '../../lib/energia/geminiCliente';
import { TARIFAS, aplicarVersion, valoresActuales } from '../../lib/tarifas/registro';
import { calcularCambios, limpiarRespuesta, promptTarifa, validarActualizacion } from '../../lib/tarifas/actualizador';
import { archivos, rpc, subirPdfs } from '../../lib/documentacionB2B/api';

const ESPERA_IA_MS = 45000;

async function sha256(buffer) {
  const h = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const fechaES = (iso) => (iso ? iso.split('-').reverse().join('-') : '—');

export default function ActualizarTarifaModal({ tarifaId, onClose, onGuardada }) {
  const { currentUser } = useAuth();
  const t = TARIFAS[tarifaId];
  const [fase, setFase] = useState('subir'); // subir | leyendo | cambios | guardando
  const [error, setError] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [res, setRes] = useState(null);
  const input = useRef(null);

  const leer = async (file) => {
    setError('');
    setArchivo(file);
    setFase('leyendo');
    try {
      const { datos } = await extraerFactura(file, {
        prompt: promptTarifa(tarifaId), version: `tarifa-${tarifaId}-1`, parse: JSON.parse, esperaMs: ESPERA_IA_MS,
      });
      const limpio = limpiarRespuesta(tarifaId, datos);
      const actuales = valoresActuales(tarifaId);
      const { errores, avisos } = validarActualizacion(tarifaId, limpio, actuales);
      const { filas, cambios } = calcularCambios(tarifaId, limpio.valores, actuales);
      setRes({ ...limpio, errores, avisos, filas, cambios });
      setFase('cambios');
    } catch (e) {
      setError(e.name === 'ExtraccionTimeout' ? 'La IA ha tardado demasiado. Vuelve a intentarlo.' : 'No se ha podido leer el PDF. Comprueba que es la hoja de esta tarifa.');
      setFase('subir');
    }
  };

  const guardar = async () => {
    setFase('guardando');
    setError('');
    try {
      const buffer = await archivo.arrayBuffer();
      const { urls, bucket } = await archivos(currentUser.username, 'subir_tarifa', { tarifaId });
      const ruta = Object.keys(urls)[0];
      await subirPdfs(urls, bucket, { [ruta]: new Uint8Array(buffer) });
      const version = await rpc('tarifa_guardar_version', currentUser.username, {
        p_tarifa_id: tarifaId, p_valores: res.valores, p_valida_desde: res.validaDesde, p_valida_hasta: res.validaHasta,
        p_pdf_path: ruta, p_pdf_sha256: await sha256(buffer), p_cambios: res.cambios,
      });
      aplicarVersion(tarifaId, version);
      onGuardada?.();
      onClose();
    } catch (e) {
      setError(e.message);
      setFase('cambios');
    }
  };

  const hayCambios = res && Object.keys(res.cambios).length > 0;
  const bloqueado = !res || res.errores.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-2xl max-h-[88vh] flex flex-col" data-testid="actualizar-tarifa">
        <div className="flex items-center justify-between px-6 py-4 border-b border-google-border">
          <div>
            <h3 className="text-base font-semibold text-google-dark">Actualizar tarifa</h3>
            <p className="text-xs text-google-gray mt-0.5">{t.nombre}: solo se cambian precios, porcentajes y fechas de validez</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {fase === 'subir' && (
            <button
              type="button"
              onClick={() => input.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) leer(f); }}
              className="w-full border-2 border-dashed border-google-border rounded-xl py-12 flex flex-col items-center gap-2 text-google-gray hover:border-google-blue hover:text-google-blue transition-colors"
            >
              <FileUp size={28} />
              <span className="text-sm font-medium">Sube el PDF de Endesa</span>
              <span className="text-xs">Arrástralo aquí o pulsa para elegirlo</span>
            </button>
          )}
          <input ref={input} type="file" accept="application/pdf" className="hidden" data-testid="tarifa-pdf"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) leer(f); e.target.value = ''; }} />

          {(fase === 'leyendo' || fase === 'guardando') && (
            <div className="py-14 flex flex-col items-center gap-3 text-google-gray">
              <Loader2 size={28} className="animate-spin text-google-blue" />
              <p className="text-sm">{fase === 'leyendo' ? 'Leyendo la hoja de tarifas con IA…' : 'Guardando la nueva versión…'}</p>
            </div>
          )}

          {fase === 'cambios' && res && (
            <div className="space-y-4">
              <p className="text-sm text-google-dark">
                Validez: <strong>{fechaES(res.validaDesde)}</strong> a <strong>{fechaES(res.validaHasta)}</strong>
              </p>
              {res.errores.length > 0 && (
                <div className="bg-red-50 rounded-lg px-3 py-2 text-sm text-red-700" data-testid="tarifa-errores">
                  <p className="font-semibold mb-1">No se puede guardar:</p>
                  <ul className="list-disc list-inside space-y-0.5 text-xs">{res.errores.slice(0, 8).map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              )}
              {res.descartadas.length > 0 && (
                <p className="text-xs text-amber-700">Se han descartado {res.descartadas.length} datos que no se pueden cambiar.</p>
              )}
              {!hayCambios && res.errores.length === 0 && <p className="text-sm text-google-gray">Los precios son iguales a los actuales.</p>}
              <div className="border border-google-border rounded-xl divide-y divide-gray-100">
                {res.filas.map((f) => (
                  <div key={f.ruta} data-testid={f.cambia ? 'tarifa-cambio' : undefined}
                    className={`flex items-center justify-between gap-3 px-3 py-1.5 text-xs ${f.cambia ? '' : 'opacity-40'}`}>
                    <span className="font-mono text-google-gray truncate">{f.ruta}</span>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      {res.avisos[f.ruta] && <span title={res.avisos[f.ruta]}><AlertTriangle size={13} className="text-amber-500" /></span>}
                      {f.cambia ? (
                        <>
                          <s className="text-google-gray">{f.antes}</s>
                          <ArrowRight size={12} className="text-google-gray" />
                          <strong className="text-google-dark">{f.despues}</strong>
                        </>
                      ) : <span>{f.antes}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {fase === 'cambios' && (
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-google-border">
            <button onClick={onClose} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
            <button onClick={guardar} disabled={bloqueado} className="btn-primary text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">Guardar</button>
          </div>
        )}
      </div>
    </div>
  );
}
