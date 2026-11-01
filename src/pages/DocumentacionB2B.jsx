import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSignature, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { leerToken, rpc, SesionRequerida } from '../lib/documentacionB2B/api';
import { PASOS, guardarNueva, guardarVersion, prepararDocumentacion } from '../lib/documentacionB2B/flujo';
import { MODALIDADES } from '../lib/contratosEndesa/constantes';
import { normalizarCups } from '../lib/distribuidoras';
import ConfirmarSesionModal from '../components/documentacionB2B/ConfirmarSesionModal';
import EditorDocumentacion from '../components/documentacionB2B/EditorDocumentacion';
import Historial from '../components/documentacionB2B/Historial';
import PantallaCarga from '../components/documentacionB2B/PantallaCarga';

const POR_PAGINA = 15;
const MAX_CUPS = 3;

/** Motivo por el que no se puede seleccionar un contrato, o null. */
export function bloqueoProducto(c) {
  const producto = String(c.id_producto || '').toLowerCase();
  if (!producto.includes('open') || !['3.0TD', '6.1TD'].includes(c.tarifa)) return 'Aún no disponible';
  return null;
}

export default function DocumentacionB2B() {
  const { currentUser } = useAuth();
  const { clientes } = useData();
  const actor = currentUser.username;

  const [sesion, setSesion] = useState(() => !!leerToken(actor));
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState([]);
  const [modalidad, setModalidad] = useState('plana');
  const [activos, setActivos] = useState({});
  const [paso, setPaso] = useState(null);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [recarga, setRecarga] = useState(0);
  const [enfoque, setEnfoque] = useState('');

  const pedirSesion = useCallback(() => setSesion(false), []);
  const refrescar = useCallback(() => setRecarga((v) => v + 1), []);

  useEffect(() => {
    if (!sesion) return;
    rpc('doc_b2b_cups_activos', actor).then(setActivos).catch((e) => {
      if (e instanceof SesionRequerida) pedirSesion();
      else setError(e.message);
    });
  }, [actor, sesion, recarga, pedirSesion]);

  const contratos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (clientes || [])
      .filter((c) => ['B2B', 'CUR_B2B'].includes(c.tipo) && !c.deleted_at)
      .filter((c) => !q || [c.nombre, c.cif_dni, c.cups, c.id_producto, c.estado].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [clientes, busqueda]);

  const visibles = contratos.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const totalPaginas = Math.max(1, Math.ceil(contratos.length / POR_PAGINA));

  const mismaReglas = (c) => {
    const base = seleccion[0];
    if (!base || base.id === c.id) return null;
    if (String(base.cif_dni).trim().toUpperCase() !== String(c.cif_dni).trim().toUpperCase()) return 'Todos los CUPS deben ser del mismo CIF.';
    if (base.tarifa !== c.tarifa) return 'Todos los CUPS deben tener la misma tarifa de acceso (3.0TD o 6.1TD, sin mezclar).';
    return null;
  };

  const alternar = (c) => {
    setError('');
    if (seleccion.some((s) => s.id === c.id)) { setSeleccion((s) => s.filter((x) => x.id !== c.id)); return; }
    const regla = mismaReglas(c);
    if (regla) { setError(regla); return; }
    if (seleccion.length >= MAX_CUPS) { setError(`Máximo ${MAX_CUPS} CUPS por documentación.`); return; }
    setSeleccion((s) => [...s, c]);
  };

  const generar = async () => {
    setError('');
    setResultado(null);
    try {
      const r = await prepararDocumentacion({ clientes: seleccion, modalidad, actor, onPaso: setPaso });
      setPaso('guardar');
      const { id } = await guardarNueva({ actor, clientes: seleccion, modelo: r.modelo, pdfs: r.pdfs });
      setResultado({ ...r, id, version: 1 });
      setSeleccion([]);
      refrescar();
    } catch (e) {
      if (e instanceof SesionRequerida) pedirSesion();
      else setError(e.message);
    } finally {
      setPaso(null);
    }
  };

  const guardarCambios = async ({ modelo, editados, pdfs }) => {
    setPaso('guardar');
    setError('');
    try {
      const { version } = await guardarVersion({ actor, id: resultado.id, versionBase: resultado.version, modelo, editados, pdfs });
      setResultado((r) => ({ ...r, modelo, pdfs, version }));
      refrescar();
      return true;
    } catch (e) {
      if (e instanceof SesionRequerida) pedirSesion();
      else setError(e.message);
      return false;
    } finally {
      setPaso(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {!sesion && <ConfirmarSesionModal onConfirmada={() => setSesion(true)} onCancelar={() => {}} />}
      {paso && <PantallaCarga titulo="Generando documentación" pasos={PASOS} actual={paso} />}

      <div className="mb-6 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><FileSignature size={20} className="text-google-blue" /></div>
        <div>
          <h1 className="text-xl font-semibold text-google-dark">Documentación B2B</h1>
          <p className="text-sm text-google-gray">Contrato y anexos de Endesa a partir de Alta B2B</p>
        </div>
      </div>

      <section className="bg-white border border-google-border rounded-xl shadow-sm">
        <div className="p-4 border-b border-gray-100 flex flex-wrap items-center gap-3">
          <label className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-google-gray" />
            <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} data-testid="buscar-contratos"
              placeholder="Buscar por CIF, titular, CUPS, producto o estado" className="input-field pl-8 text-sm w-full" />
          </label>
          <label className="flex items-center gap-2 text-xs text-google-gray">
            Modalidad
            <select value={modalidad} onChange={(e) => setModalidad(e.target.value)} className="input-field text-sm py-1.5 w-40" data-testid="selector-modalidad">
              {MODALIDADES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <button onClick={generar} disabled={seleccion.length === 0 || !!paso || !sesion} data-testid="generar"
            className="btn-primary text-sm px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed">Generar documentación</button>
        </div>

        {seleccion.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100 flex flex-wrap gap-2">
            {seleccion.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1 text-xs bg-blue-50 text-google-blue rounded-full px-2.5 py-1">
                {s.cups}
                <button onClick={() => alternar(s)} aria-label="Quitar"><X size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {error && <p className="mx-4 mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2" data-testid="error-seleccion">{error}</p>}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-google-gray">
                <th className="px-4 py-2.5 w-8" />
                <th className="px-2 py-2.5 font-semibold">CIF</th>
                <th className="px-2 py-2.5 font-semibold">Titular</th>
                <th className="px-2 py-2.5 font-semibold">CUPS</th>
                <th className="px-2 py-2.5 font-semibold">Producto</th>
                <th className="px-2 py-2.5 font-semibold">Estado</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visibles.map((c) => {
                const bloqueo = bloqueoProducto(c);
                const activo = activos[normalizarCups(c.cups)];
                const marcado = seleccion.some((s) => s.id === c.id);
                const deshabilitado = !!bloqueo || !!activo;
                return (
                  <tr key={c.id} data-testid="fila-contrato" data-cups={c.cups} className={deshabilitado ? 'text-google-gray bg-gray-50/60' : 'hover:bg-blue-50/40'}>
                    <td className="px-4 py-2">
                      <input type="checkbox" checked={marcado} disabled={deshabilitado} onChange={() => alternar(c)} aria-label={`Seleccionar ${c.cups}`} />
                    </td>
                    <td className="px-2 py-2 whitespace-nowrap">{c.cif_dni}</td>
                    <td className="px-2 py-2">{c.nombre}</td>
                    <td className="px-2 py-2 font-mono text-xs">{c.cups}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{c.id_producto}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{c.estado}</td>
                    <td className="px-2 py-2 text-xs whitespace-nowrap">
                      {bloqueo && <span>{bloqueo}</span>}
                      {!bloqueo && activo && (
                        <button className="text-google-blue hover:underline" onClick={() => { setEnfoque(''); setTimeout(() => setEnfoque(normalizarCups(c.cups)), 0); }}>
                          Ya tiene documentación: ver
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibles.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-google-gray">No hay contratos de Alta B2B con esa búsqueda.</td></tr>}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-end gap-2 p-3 text-xs text-google-gray">
            <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">Anterior</button>
            Página {pagina} de {totalPaginas}
            <button disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-30">Siguiente</button>
          </div>
        )}
      </section>

      {resultado && (
        <section className="mt-6" data-testid="resultado">
          <EditorDocumentacion key={resultado.id} inicial={resultado.modelo} pdfsIniciales={resultado.pdfs} plantillas={resultado.plantillas} onGuardar={guardarCambios} />
        </section>
      )}

      {sesion && <Historial recarga={recarga} onCambio={refrescar} onSesion={pedirSesion} enfoque={enfoque} />}
    </div>
  );
}
