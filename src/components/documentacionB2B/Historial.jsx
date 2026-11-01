import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Loader2, Pencil, Search, Share2, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { cargarPlantillas, descargarBytes, descargarVersion, rpc, SesionRequerida } from '../../lib/documentacionB2B/api';
import { construirPdfs, guardarVersion } from '../../lib/documentacionB2B/flujo';
import Pagination from '../Pagination';
import ConfirmActionModal from '../ConfirmActionModal';
import EditorDocumentacion from './EditorDocumentacion';
import PantallaCarga from './PantallaCarga';

const POR_PAGINA = 15;
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES') : '');
const PASOS_GUARDAR = [{ id: 'pdf', label: 'Generando documentos', segundos: 1 }, { id: 'guardar', label: 'Guardando', segundos: 2 }];

function CompartirModal({ fila, onCerrar, onGuardado }) {
  const { currentUser, users } = useAuth();
  const [sel, setSel] = useState(fila.compartido_con || []);
  const [error, setError] = useState('');
  const lista = (users || []).filter((u) => u.username !== fila.generado_por);
  const guardar = async () => {
    try {
      await rpc('doc_b2b_compartir', currentUser.username, { p_id: fila.id, p_usuarios: sel });
      onGuardado();
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-sm p-5 space-y-3" data-testid="compartir-modal">
        <h3 className="text-sm font-semibold text-google-dark">Compartir documentación</h3>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {lista.map((u) => (
            <label key={u.username} className="flex items-center gap-2 text-sm text-google-dark py-1">
              <input type="checkbox" checked={sel.includes(u.username)} value={u.username}
                onChange={(e) => setSel((s) => (e.target.checked ? [...s, u.username] : s.filter((x) => x !== u.username)))} />
              {u.displayName || u.username}
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onCerrar} className="btn-secondary text-sm px-3 py-1.5">Cancelar</button>
          <button onClick={guardar} data-testid="compartir-guardar" className="btn-primary text-sm px-3 py-1.5">Guardar</button>
        </div>
      </div>
    </div>
  );
}

/** Ventana de edición superpuesta, con fondo desenfocado, sobre la última versión. */
function EdicionModal({ fila, onCerrar, onGuardado, onSesion }) {
  const { currentUser } = useAuth();
  const actor = currentUser.username;
  const [estado, setEstado] = useState(null);
  const [error, setError] = useState('');
  const [sucio, setSucio] = useState(false);
  const [guardando, setGuardando] = useState(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const detalle = await rpc('doc_b2b_detalle', actor, { p_id: fila.id });
        const plantillas = await cargarPlantillas(actor);
        const modelo = detalle.datos;
        const pdfs = await construirPdfs(plantillas, modelo);
        if (vivo) setEstado({ modelo, pdfs, plantillas, version: detalle.version_actual });
      } catch (e) {
        if (e instanceof SesionRequerida) onSesion();
        else if (vivo) setError(e.message);
      }
    })();
    return () => { vivo = false; };
  }, [fila.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const cerrar = () => {
    if (sucio && !window.confirm('Tienes cambios sin guardar. ¿Salir sin guardar?')) return;
    onCerrar();
  };

  const guardar = async ({ modelo, editados, pdfs }) => {
    setGuardando('guardar');
    setError('');
    try {
      await guardarVersion({ actor, id: fila.id, versionBase: estado.version, modelo, editados, pdfs });
      onGuardado();
    } catch (e) {
      if (e instanceof SesionRequerida) onSesion();
      setError(e.message);
      setGuardando(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] bg-black/30 backdrop-blur-sm overflow-y-auto p-4" data-testid="edicion-modal">
      {guardando && <PantallaCarga titulo="Guardando nueva versión" pasos={PASOS_GUARDAR} actual={guardando} />}
      <div className="bg-white rounded-2xl shadow-google w-full max-w-5xl mx-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-google-border sticky top-0 bg-white rounded-t-2xl z-40">
          <div>
            <h3 className="text-base font-semibold text-google-dark">Documentación de {fila.titular}</h3>
            <p className="text-xs text-google-gray">Versión {fila.version_actual}</p>
          </div>
          <button onClick={cerrar} className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" aria-label="Cerrar" data-testid="cerrar-edicion"><X size={18} /></button>
        </div>
        <div className="p-6">
          {error && <p className="mb-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          {!estado && !error && <div className="py-16 flex justify-center"><Loader2 size={26} className="animate-spin text-google-blue" /></div>}
          {estado && (
            <EditorDocumentacion
              inicial={estado.modelo}
              pdfsIniciales={estado.pdfs}
              plantillas={estado.plantillas}
              textoGuardar="Guardar datos"
              onGuardar={guardar}
              onCambios={setSucio}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Entrada({ fila, onCambio, onSesion, onError }) {
  const { currentUser } = useAuth();
  const actor = currentUser.username;
  const [abierta, setAbierta] = useState(false);
  const [borrar, setBorrar] = useState(false);
  const [compartir, setCompartir] = useState(false);
  const [editar, setEditar] = useState(false);
  const borrada = fila.estado === 'borrada';

  const bajar = async (doc) => {
    try {
      const urls = await descargarVersion(actor, fila.id);
      const bytes = await descargarBytes(urls[doc.path].url);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      a.download = `${doc.nombre} - ${fila.cif}.pdf`;
      a.click();
    } catch (e) {
      if (e instanceof SesionRequerida) onSesion();
      else onError(e.message);
    }
  };

  const confirmarBorrar = async () => {
    setBorrar(false);
    try {
      await rpc('doc_b2b_borrar', actor, { p_id: fila.id });
      onCambio();
    } catch (e) {
      if (e instanceof SesionRequerida) onSesion();
      else onError(e.message);
    }
  };

  return (
    <div className="border border-google-border rounded-xl bg-white" data-testid="entrada-historial" data-titular={fila.titular} data-estado={fila.estado}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setAbierta((a) => !a)} className="flex-1 min-w-0 text-left" data-testid="entrada-desplegar">
          <p className={`text-sm font-medium text-google-dark truncate ${borrada ? 'line-through text-google-gray' : ''}`}>Documentación de {fila.titular}</p>
          <p className="text-xs text-google-gray mt-0.5">
            {fila.cif} · {fila.num_suministros} CUPS · {fecha(fila.generado_at)} · Generado por: {fila.generado_por_nombre} · v{fila.version_actual}
            {borrada && <> · <span data-testid="borrado-por">Borrado por: {fila.borrado_por_nombre} ({fecha(fila.borrado_at)})</span></>}
          </p>
          <p className="text-[11px] text-google-blue mt-1 flex items-center gap-1">
            <ChevronDown size={12} className={`transition-transform ${abierta ? 'rotate-180' : ''}`} />
            {abierta ? 'Pulsa para ocultar la documentación' : 'Pulsa para mostrar la documentación'}
          </p>
        </button>
        <div className="flex items-center gap-1 flex-shrink-0">
          {fila.puede_editar && <button onClick={() => setEditar(true)} data-testid="entrada-editar" className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" title="Editar" aria-label="Editar"><Pencil size={15} /></button>}
          {fila.puede_borrar && <button onClick={() => setBorrar(true)} data-testid="entrada-borrar" className="p-1.5 rounded-lg hover:bg-red-50 text-google-gray hover:text-red-600" title="Borrar" aria-label="Borrar"><Trash2 size={15} /></button>}
          {fila.puede_compartir && !borrada && <button onClick={() => setCompartir(true)} data-testid="entrada-compartir" className="p-1.5 rounded-lg hover:bg-gray-100 text-google-gray" title="Compartir" aria-label="Compartir"><Share2 size={15} /></button>}
        </div>
      </div>
      {abierta && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-100 space-y-1.5">
          {(fila.documentos || []).map((d) => (
            <p key={d.tipo} className="text-sm text-google-dark">
              <span className="font-medium">{d.nombre}:</span>{' '}
              {fila.puede_descargar
                ? <button onClick={() => bajar(d)} data-testid={`bajar-${d.tipo}`} className="text-google-blue hover:underline">Pulsa para descargar</button>
                : <span className="text-google-gray">{borrada ? 'Solo admin y manager' : 'Faltan campos obligatorios: complétalos para descargar'}</span>}
            </p>
          ))}
        </div>
      )}
      {borrar && <ConfirmActionModal
        title="Borrar documentación"
        message="La entrada quedará tachada en el historial y sus CUPS volverán a estar libres."
        confirmLabel="Borrar"
        confirmClassName="bg-red-600 hover:bg-red-700"
        onConfirm={confirmarBorrar}
        onCancel={() => setBorrar(false)}
      />}
      {compartir && <CompartirModal fila={fila} onCerrar={() => setCompartir(false)} onGuardado={() => { setCompartir(false); onCambio(); }} />}
      {editar && <EdicionModal fila={fila} onCerrar={() => setEditar(false)} onSesion={onSesion} onGuardado={() => { setEditar(false); onCambio(); }} />}
    </div>
  );
}

/** Historial, siempre visible bajo el área principal. */
export default function Historial({ recarga, onCambio, onSesion, enfoque }) {
  const { currentUser } = useAuth();
  const puedeGlobal = ['admin', 'manager'].includes(currentUser.role);
  const [modo, setModo] = useState('mias');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState({ total: 0, filas: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { if (enfoque) { setBusqueda(enfoque); setPagina(1); } }, [enfoque]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await rpc('doc_b2b_listar', currentUser.username, {
        p_modo: modo, p_busqueda: busqueda || null, p_limite: POR_PAGINA, p_desde: (pagina - 1) * POR_PAGINA,
      });
      setDatos(r);
      setError('');
    } catch (e) {
      if (e instanceof SesionRequerida) onSesion();
      else setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [currentUser.username, modo, busqueda, pagina, onSesion]);

  useEffect(() => { const t = setTimeout(cargar, 200); return () => clearTimeout(t); }, [cargar, recarga]);

  const pestana = (id, label) => (
    <button onClick={() => { setModo(id); setPagina(1); }} data-testid={`tab-${id}`}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${modo === id ? 'text-google-blue border-google-blue' : 'text-google-gray border-transparent hover:text-google-dark'}`}>
      {label}
    </button>
  );

  return (
    <section className="mt-10" data-testid="historial">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-google-border mb-4">
        <div className="flex">
          {pestana('mias', 'Mi documentación')}
          {puedeGlobal && pestana('global', 'Documentación global')}
        </div>
        <label className="relative mb-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-google-gray" />
          <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Buscar por titular, CIF o CUPS"
            className="input-field pl-8 text-xs w-64" data-testid="historial-buscar" />
        </label>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {cargando && datos.filas.length === 0 && <div className="py-8 flex justify-center"><Loader2 size={22} className="animate-spin text-google-blue" /></div>}
      {!cargando && datos.filas.length === 0 && <p className="py-8 text-center text-sm text-google-gray">Todavía no hay documentación generada</p>}
      <div className="space-y-2">
        {datos.filas.map((f) => <Entrada key={f.id} fila={f} onCambio={onCambio} onSesion={onSesion} onError={setError} />)}
      </div>
      {datos.total > POR_PAGINA && (
        <Pagination currentPage={pagina} totalPages={Math.ceil(datos.total / POR_PAGINA)} onPageChange={setPagina} />
      )}
    </section>
  );
}
