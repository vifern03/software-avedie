import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, X, Eye, FileText, Loader2, RefreshCw, History, UserPlus, Building2, Info, ChevronDown, ChevronRight, CornerDownRight, UserCheck, Pencil } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import NewClientModal from '../components/NewClientModal';
import ShareButton from '../components/ShareButton';
import Pagination from '../components/Pagination';
import DateInput from '../components/DateInput';
import { openPendingTab, openBase64InTab } from '../lib/attachmentTab';
import { TABLA, veTodasLasComparativas, obtenerArchivoComparativa, normalizarCups, esCupsCompleto, prepararEdicion } from '../lib/historialComparativas';
import { ESTADO_DOT, ESTADOS_CONTRATO, INCIDENCIA_DOT, mapaIncidenciasAbiertas } from '../lib/estadosContrato';

/* Historial de Comparativas: todas las comparativas descargadas o impresas.
 * Visibilidad: admin, manager y comerciales con sede ven todas; los comerciales sin
 * sede ven las suyas y las compartidas con ellos, y cualquiera cuyo CUPS completo
 * peguen en el buscador. No se pueden borrar. */

const ITEMS_PER_PAGE = 15;
const TIPO_LABEL = { luz_20: 'Luz 2.0', luz_b2b: 'Luz 3.0/6.1', gas: 'Gas' };

const eur = (n) => (n == null || n === '' ? '—' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const kwh = (n) => (n == null || n === '' ? '—' : `${Math.round(Number(n)).toLocaleString('es-ES')} kWh`);
const fechaHora = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
};
const isoDia = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const potenciasTexto = (p) => {
  if (!p) return '—';
  const vals = Object.entries(p).filter(([, v]) => v != null && Number(v) > 0);
  if (!vals.length) return '—';
  const unicos = [...new Set(vals.map(([, v]) => Number(v)))];
  if (unicos.length === 1) return `${unicos[0].toLocaleString('es-ES')} kW`;
  return vals.map(([k, v]) => `${k}: ${Number(v).toLocaleString('es-ES')}`).join(' · ');
};

const now = new Date();
const monthName = (offset) => {
  const m = new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleString('es-ES', { month: 'long' });
  return m.charAt(0).toUpperCase() + m.slice(1);
};
function enMes(iso, offset) {
  const d = new Date(iso);
  const ref = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
}

const FilterPill = ({ label, active, onClick }) => (
  <button onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border whitespace-nowrap ${
      active ? 'bg-google-blue text-white border-google-blue'
      : 'bg-google-bg text-google-gray border-google-border hover:bg-blue-50 hover:text-google-blue hover:border-blue-200'
    }`}>
    {label}
  </button>
);

/* Id Producto del alta según la oferta comparada (si no hay equivalente claro, se deja vacío). */
const PRODUCTO_20 = {
  prescriptor: 'Luz Fija 24H (Con Prescriptor)', toc: 'Tu Otra Casa 50', tempo: 'TEMPO 2.0TD',
  solar_basic: 'Solar Basic', solar_plus: 'Solar Plus', solar_bateria: 'Solar Plus & Batería Virtual',
  'indexada_2.0td': 'Indexada 2.0TD',
};
function idProductoDesde(c) {
  const f = c.datos || {};
  if (c.tipo === 'gas') return c.tarifa_acceso ? `Gas ${c.tarifa_acceso}` : '';
  if (c.tipo === 'luz_20') return PRODUCTO_20[f.tarifaId] || '';
  if (c.tipo === 'luz_b2b') {
    if (f.productoId === 'open') return `Open ${c.tarifa_acceso}`;
    if ((f.productoId || '').startsWith('indexada')) return `Indexada ${c.tarifa_acceso}`;
  }
  return '';
}

/** Datos del formulario de alta que se pueden sacar de la comparativa. El resto lo rellena el usuario. */
function prefillAlta(c, usuario) {
  const consumoAnual = c.consumo_anual_kwh
    || (c.consumo_total_kwh && c.dias ? Math.round((Number(c.consumo_total_kwh) / Number(c.dias)) * 365) : null);
  const ahorro = c.ahorro_anual != null && Number(c.ahorro_anual) > 0 ? ` · ahorro estimado ${eur(c.ahorro_anual)}/año` : '';
  return {
    nombre: c.cliente || '',
    identificacion: '',
    telefono: '',
    cups: c.cups || '',
    tarifa: c.tarifa_acceso || '',
    linea_negocio: c.tipo === 'gas' ? 'Gas' : 'Electricidad',
    id_producto: idProductoDesde(c),
    descripcion: `Alta desde comparativa del ${fechaHora(c.created_at).split(' ')[0]} (${c.producto || TIPO_LABEL[c.tipo]})${ahorro}`,
    consumo_anual_est: consumoAnual != null ? String(consumoAnual) : '',
    estado: 'Enviado a Back Office',
    agente_gestor: usuario?.username || '',
  };
}

/** Botones de alta: 2.0 (y gas residencial RL.1-3) → B2C y B2B; 3.0 / 6.1 (y gas RL.4-6) → solo B2B. */
function tiposAlta(c) {
  if (c.tipo === 'luz_b2b') return ['B2B'];
  if (c.tipo === 'gas' && /RL\.[456]/.test(c.tarifa_acceso || '')) return ['B2B'];
  return ['B2C', 'B2B'];
}

function FileEye({ id, campo, disponible, titulo, Icon }) {
  const [cargando, setCargando] = useState(false);
  if (!disponible) return <span className="text-gray-300">—</span>;
  const abrir = async () => {
    if (cargando) return;
    setCargando(true);
    const tab = openPendingTab();
    try {
      openBase64InTab(tab, await obtenerArchivoComparativa(id, campo));
    } catch (e) {
      console.error('[Historial comparativas] archivo:', e);
      if (tab) tab.close();
    } finally {
      setCargando(false);
    }
  };
  return (
    <button onClick={abrir} disabled={cargando} title={titulo}
      className="p-1 rounded hover:bg-slate-100 transition-colors inline-flex items-center gap-1">
      {cargando ? <Loader2 size={15} className="text-slate-400 animate-spin" /> : <><Eye size={15} className="text-slate-500" />{Icon && <Icon size={11} className="text-slate-400" />}</>}
    </button>
  );
}

export default function HistorialComparativas({ onNavigate }) {
  const { currentUser, users } = useAuth();
  const { addCliente, registroPendientes, clientesCupsTodos } = useData();
  const veTodas = veTodasLasComparativas(currentUser);
  const miNombre = currentUser?.displayName || currentUser?.username;

  const [filas, setFilas] = useState([]);
  const [porCups, setPorCups] = useState([]);       // encontradas por CUPS completo (comerciales sin sede)
  const [estados, setEstados] = useState({});       // cliente_id → { estado, cups }
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [searchNombre, setSearchNombre] = useState('');
  const [filterAutor, setFilterAutor] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterAlta, setFilterAlta] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const [alta, setAlta] = useState(null); // { comparativa, tipo }
  const [abiertos, setAbiertos] = useState(() => new Set()); // CUPS con el desplegable abierto
  const alternar = (k) => setAbiertos(prev => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  const nombreDe = useMemo(() => Object.fromEntries(users.map(u => [u.username, u.displayName || u.username])), [users]);
  const incidencias = useMemo(() => mapaIncidenciasAbiertas(registroPendientes), [registroPendientes]);

  const cargarEstados = useCallback(async (lista) => {
    const ids = [...new Set(lista.map(c => c.cliente_id).filter(Boolean))];
    if (!ids.length) return;
    const { data, error: e } = await supabase.from('clientes').select('id, estado, cups, deleted_at').in('id', ids);
    if (e) { console.error('[Historial comparativas] estados:', e); return; }
    setEstados(prev => ({ ...prev, ...Object.fromEntries((data || []).filter(c => !c.deleted_at).map(c => [c.id, c])) }));
  }, []);

  const cargar = useCallback(async () => {
    if (!currentUser) return;
    setCargando(true);
    setError('');
    try {
      let lista;
      if (veTodas) {
        const { data, error: e } = await supabase.from(TABLA).select('*').order('created_at', { ascending: false });
        if (e) throw e;
        lista = data || [];
      } else {
        const [propias, compartidas] = await Promise.all([
          supabase.from(TABLA).select('*').eq('realizada_por', currentUser.username),
          supabase.from(TABLA).select('*').filter('compartido_con', 'cs', `{"${miNombre}"}`),
        ]);
        if (propias.error) throw propias.error;
        if (compartidas.error) throw compartidas.error;
        const m = new Map([...(propias.data || []), ...(compartidas.data || [])].map(c => [c.id, c]));
        lista = [...m.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      }
      setFilas(lista);
      cargarEstados(lista);
    } catch (e) {
      console.error('[Historial comparativas]', e);
      setError('No se pudo cargar el historial. Inténtalo de nuevo.');
    } finally {
      setCargando(false);
    }
  }, [currentUser, veTodas, miNombre, cargarEstados]);

  useEffect(() => { cargar(); }, [cargar]);

  // Comercial sin sede: un CUPS completo y correcto muestra también las comparativas de otros.
  const cupsBuscado = esCupsCompleto(search) ? normalizarCups(search) : '';
  useEffect(() => {
    if (veTodas || !cupsBuscado) { setPorCups([]); return; }
    let vivo = true;
    supabase.from(TABLA).select('*').eq('cups', cupsBuscado).then(({ data, error: e }) => {
      if (!vivo) return;
      if (e) { console.error('[Historial comparativas] CUPS:', e); return; }
      setPorCups(data || []);
      cargarEstados(data || []);
    });
    return () => { vivo = false; };
  }, [veTodas, cupsBuscado, cargarEstados]);

  useEffect(() => { setPage(1); }, [search, searchNombre, filterAutor, filterTipo, filterAlta, timeFilter, dateFilter]);

  const visibles = useMemo(() => {
    const m = new Map(filas.map(c => [c.id, c]));
    for (const c of porCups) if (!m.has(c.id)) m.set(c.id, c);
    return [...m.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [filas, porCups]);

  const autores = useMemo(() => [...new Set(visibles.map(c => c.realizada_por))].sort(), [visibles]);

  const estadoDe = (c) => {
    const cli = c.cliente_id ? estados[c.cliente_id] : null;
    if (!cli) return null;
    const inc = incidencias.get(normalizarCups(cli.cups));
    return inc ? { texto: inc, dot: INCIDENCIA_DOT, incidencia: true, estado: cli.estado } : { texto: cli.estado, dot: ESTADO_DOT[cli.estado] || 'bg-gray-400', estado: cli.estado };
  };

  const filtradas = visibles.filter((c) => {
    const q = normalizarCups(search);
    if (search && !(normalizarCups(c.cups).includes(q) || (c.cliente || '').toUpperCase().includes(search.trim().toUpperCase()))) return false;
    if (searchNombre && !(c.cliente || '').toLowerCase().includes(searchNombre.toLowerCase())) return false;
    if (filterAutor && c.realizada_por !== filterAutor) return false;
    if (filterTipo && c.tarifa_acceso !== filterTipo && !(filterTipo === 'gas' && c.tipo === 'gas')) return false;
    if (timeFilter === 'mes_actual' && !enMes(c.created_at, 0)) return false;
    if (timeFilter === 'mes_anterior' && !enMes(c.created_at, -1)) return false;
    if (dateFilter && isoDia(c.created_at) !== dateFilter) return false;
    if (filterAlta === 'sin_alta' && c.cliente_id) return false;
    if (filterAlta === 'con_alta' && !c.cliente_id) return false;
    if (ESTADOS_CONTRATO.includes(filterAlta) && estados[c.cliente_id]?.estado !== filterAlta) return false;
    return true;
  });

  // Un grupo por CUPS: la comparativa más reciente en la fila principal y los demás
  // estudios de ese CUPS en un desplegable (no como clientes aparte).
  const grupos = [];
  {
    const m = new Map();
    for (const c of filtradas) {
      const k = normalizarCups(c.cups) || `id:${c.id}`;
      let g = m.get(k);
      if (!g) { g = { clave: k, items: [] }; m.set(k, g); grupos.push(g); }
      g.items.push(c);
    }
    // Dentro de cada CUPS, los estudios se agrupan por factura (mismo importe, días y consumo):
    // una factura de otro mes es otro bloque; otra oferta sobre la misma factura, el mismo bloque.
    for (const g of grupos) {
      const bloques = new Map();
      for (const c of g.items) {
        const k = `${Math.round(Number(c.importe_actual) * 100) || 0}|${c.dias ?? ''}|${Math.round(Number(c.consumo_total_kwh)) || 0}`;
        if (!bloques.has(k)) bloques.set(k, []);
        bloques.get(k).push(c);
      }
      g.bloques = [...bloques.values()];
      g.items = g.bloques.flat();
      g.inicioBloque = new Map(g.bloques.map((b, n) => [b[0].id, { n: n + 1, b }]));
    }
  }
  const totalPages = Math.ceil(grupos.length / ITEMS_PER_PAGE);
  const pagina = grupos.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  const compartir = async (id, compartidoCon, sharedBy) => {
    const arr = Array.isArray(compartidoCon) ? compartidoCon : [];
    const shared_by = arr.length ? (sharedBy || currentUser?.username || null) : null;
    setFilas(prev => prev.map(c => (c.id === id ? { ...c, compartido_con: arr, shared_by } : c)));
    const { error: e } = await supabase.from(TABLA).update({ compartido_con: arr, shared_by }).eq('id', id);
    if (e) console.error('[Historial comparativas] compartir:', e);
    return { error: e || null };
  };

  const guardarAlta = async (data) => {
    const { comparativa, tipo } = alta;
    const r = await addCliente(data, tipo);
    if (r?.error) return r;
    if (r?.id) {
      const cambios = { cliente_id: r.id, alta_tipo: tipo };
      setFilas(prev => prev.map(c => (c.id === comparativa.id ? { ...c, ...cambios } : c)));
      setPorCups(prev => prev.map(c => (c.id === comparativa.id ? { ...c, ...cambios } : c)));
      setEstados(prev => ({ ...prev, [r.id]: { id: r.id, estado: data.estado, cups: data.cups } }));
      const { error: e } = await supabase.from(TABLA).update(cambios).eq('id', comparativa.id);
      if (e) console.error('[Historial comparativas] vínculo alta:', e);
    }
    return { error: null };
  };

  const TIPOS = [['', 'Todas'], ['2.0TD', '2.0'], ['3.0TD', '3.0'], ['6.1TD', '6.1'], ['gas', 'Gas']];

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <History size={22} className="text-google-blue" /> Historial de Comparativas
          </h1>
          <p className="text-sm text-google-gray mt-1">
            Cada comparativa se guarda sola en cuanto queda calculada.{' '}
            {veTodas ? 'Ves las de todo el equipo.' : 'Ves las tuyas y las compartidas contigo; pega un CUPS completo para buscar las de otros.'}
          </p>
        </div>
        <button onClick={cargar} className="btn-secondary flex items-center gap-2 text-sm" title="Recargar">
          <RefreshCw size={15} className={cargando ? 'animate-spin' : ''} /> <span className="hidden sm:inline">Actualizar</span>
        </button>
      </div>

      {/* Filtros */}
      <div className="card px-5 py-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por CUPS..." value={search}
              onChange={(e) => setSearch(e.target.value)} className="input-field pl-9 h-9 font-mono" id="hc-buscar-cups" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark"><X size={14} /></button>
            )}
          </div>
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input type="text" placeholder="Buscar por cliente..." value={searchNombre}
              onChange={(e) => setSearchNombre(e.target.value)} className="input-field pl-9 h-9" />
            {searchNombre && (
              <button onClick={() => setSearchNombre('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-google-gray hover:text-google-dark"><X size={14} /></button>
            )}
          </div>
          {veTodas && (
            <select value={filterAutor} onChange={(e) => setFilterAutor(e.target.value)} className="input-field h-9 !w-auto min-w-[180px] text-sm">
              <option value="">Realizada por...</option>
              {autores.map(a => <option key={a} value={a}>{nombreDe[a] || a}</option>)}
            </select>
          )}
          <select value={filterAlta} onChange={(e) => setFilterAlta(e.target.value)} className="input-field h-9 !w-auto min-w-[170px] text-sm">
            <option value="">Alta: todas</option>
            <option value="sin_alta">Sin dar de alta</option>
            <option value="con_alta">Dadas de alta</option>
            {ESTADOS_CONTRATO.map(e => <option key={e} value={e}>Alta · {e}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-google-gray mr-1">Fecha:</span>
          <FilterPill label="Todo" active={timeFilter === ''} onClick={() => setTimeFilter('')} />
          <FilterPill label={`Este Mes (${monthName(0)})`} active={timeFilter === 'mes_actual'} onClick={() => setTimeFilter('mes_actual')} />
          <FilterPill label={`Mes Anterior (${monthName(-1)})`} active={timeFilter === 'mes_anterior'} onClick={() => setTimeFilter('mes_anterior')} />
          <div className="flex items-center gap-1 ml-2">
            <DateInput value={dateFilter} onChange={(iso) => setDateFilter(iso)} className="input-field h-7 text-xs px-2 w-36" title="Fecha exacta" />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="p-1 rounded text-google-gray hover:text-red-500 hover:bg-red-50"><X size={13} /></button>
            )}
          </div>
          <div className="flex items-center gap-1 ml-4 border-l border-google-border pl-4">
            <span className="text-xs text-google-gray mr-1">Tarifa:</span>
            {TIPOS.map(([v, l]) => <FilterPill key={v} label={l} active={filterTipo === v} onClick={() => setFilterTipo(v)} />)}
          </div>
        </div>
        {!veTodas && cupsBuscado && (
          <p className="text-xs text-google-blue flex items-center gap-1"><Info size={12} /> Buscando el CUPS {cupsBuscado} en todas las comparativas.</p>
        )}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-google-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-semibold text-google-dark">Comparativas realizadas</h2>
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-google-gray">
            <span className="font-semibold text-google-dark">Estado del alta:</span>
            {ESTADOS_CONTRATO.map(e => (
              <span key={e} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${ESTADO_DOT[e]}`} />{e}</span>
            ))}
            <span className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-full ${INCIDENCIA_DOT}`} />Incidencia</span>
          </div>
        </div>
        {error && <p className="px-5 py-3 text-sm text-red-700 bg-red-50 border-b border-red-200">{error}</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-max" id="hc-tabla">
            <thead>
              <tr>
                <th className="table-header">Alta</th>
                <th className="table-header">Dar de alta</th>
                <th className="table-header">Fecha</th>
                <th className="table-header">Realizada por</th>
                <th className="table-header">Cliente</th>
                <th className="table-header">CUPS</th>
                <th className="table-header">Tarifa</th>
                <th className="table-header">Oferta</th>
                <th className="table-header">Potencia</th>
                <th className="table-header">Consumo</th>
                <th className="table-header">Días</th>
                <th className="table-header">Factura actual</th>
                <th className="table-header">Oferta Endesa</th>
                <th className="table-header">Ahorro</th>
                <th className="table-header text-center">Compartir</th>
                <th className="table-header text-center">Comparativa</th>
                <th className="table-header text-center">Factura</th>
              </tr>
            </thead>
            <tbody>
              {cargando && !visibles.length ? (
                <tr><td colSpan={17} className="text-center py-10 text-google-gray text-sm"><Loader2 size={18} className="inline animate-spin mr-2" />Cargando…</td></tr>
              ) : filtradas.length === 0 ? (
                <tr><td colSpan={17} className="text-center py-10 text-google-gray text-sm">
                  {visibles.length === 0 ? 'Todavía no hay comparativas guardadas. Se guardan solas en cuanto una comparativa queda calculada.' : 'No se encontraron resultados'}
                </td></tr>
              ) : pagina.flatMap((g) => {
                const abierto = abiertos.has(g.clave);
                return (abierto ? g.items : g.items.slice(0, 1)).flatMap((c, i) => {
                const sub = i > 0;
                const bloque = abierto && g.bloques.length > 1 ? g.inicioBloque.get(c.id) : null;
                const cabecera = bloque && (
                  <tr key={`f-${c.id}`}>
                    <td colSpan={17} className="bg-blue-50/70 border-l-4 border-blue-300 px-4 py-1.5 text-[11px] text-blue-800 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <FileText size={12} className="text-blue-500" />
                        <span className="font-semibold">Factura {bloque.n}</span>
                        <span className="text-blue-700/80">· {c.dias ?? '—'} días · {eur(c.importe_actual)} · {kwh(c.consumo_total_kwh)}{c.factura_nombre ? ` · ${c.factura_nombre}` : ''} · {bloque.b.length} {bloque.b.length === 1 ? 'oferta' : 'ofertas'}</span>
                      </span>
                    </td>
                  </tr>
                );
                const est = estadoDe(c);
                const ajena = c.realizada_por !== currentUser?.username;
                const compartidaConmigo = (c.compartido_con || []).includes(miNombre) && ajena;
                return [cabecera, (
                  <tr key={c.id} className={`transition-colors ${sub ? 'bg-slate-50 hover:bg-slate-100' : compartidaConmigo ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-google-bg'}`}>
                    <td className={`table-cell ${sub ? 'border-l-4 border-blue-200' : ''}`}>
                      {est ? (
                        <span className="flex items-center gap-1.5 whitespace-nowrap" title={est.incidencia ? `Incidencia abierta en Gestión de Pendientes · estado del contrato: ${est.estado}` : `Dada de alta (${c.alta_tipo || ''}) · ${est.texto}`}>
                          <span className={`w-3 h-3 rounded-full flex-shrink-0 ${est.dot}`} />
                          <span className={`text-xs ${est.incidencia ? 'text-red-700 font-semibold' : 'text-google-gray'}`}>{est.texto}</span>
                        </span>
                      ) : c.cliente_id ? (
                        <span className="flex items-center gap-1.5" title="Contrato dado de alta (no accesible o eliminado)"><span className="w-3 h-3 rounded-full bg-gray-300" /></span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {c.cliente_id ? (
                        <span className="text-xs text-google-gray whitespace-nowrap">Alta {c.alta_tipo}</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {tiposAlta(c).map(t => (
                            <button key={t} onClick={() => setAlta({ comparativa: c, tipo: t })}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium whitespace-nowrap transition-colors ${
                                t === 'B2C' ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-indigo-300 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}`}
                              title={`Abrir el formulario de Alta ${t} con los datos de esta comparativa`}>
                              {t === 'B2C' ? <UserPlus size={12} /> : <Building2 size={12} />} Alta {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="table-cell tabular-nums text-xs text-google-gray whitespace-nowrap">{fechaHora(c.created_at)}</td>
                    <td className="table-cell text-xs whitespace-nowrap">
                      <span className="font-semibold text-green-700">{nombreDe[c.realizada_por] || c.realizada_por}</span>
                      {compartidaConmigo && c.shared_by && <span className="block text-[10px] text-google-gray">Compartida por {nombreDe[c.shared_by] || c.shared_by}</span>}
                    </td>
                    <td className="table-cell font-medium text-google-dark whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {sub && <CornerDownRight size={13} className="text-blue-300 flex-shrink-0" />}
                        <span className={`max-w-[220px] truncate ${sub ? 'text-google-gray font-normal' : ''}`} title={c.cliente || ''}>{c.cliente || '—'}</span>
                        {!sub && !c.cliente_id && c.cups && clientesCupsTodos?.has(normalizarCups(c.cups)) && (
                          <span title="Este CUPS ya está dado de alta en el CRM"
                            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold flex-shrink-0">
                            <UserCheck size={11} /> Ya es cliente
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-google-gray font-mono text-xs whitespace-nowrap">
                      {c.cups || '—'}
                      {!sub && g.items.length > 1 && (
                        <button onClick={() => alternar(g.clave)} title={abierto ? 'Ocultar los otros estudios de este CUPS' : 'Ver los otros estudios de este CUPS'}
                          className="mt-0.5 flex items-center gap-0.5 font-sans text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline">
                          {abierto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          {abierto ? 'Ocultar ' : '+'}{g.items.length - 1} {g.items.length === 2 ? 'estudio' : 'estudios'}
                          {g.bloques.length > 1 && <span className="font-normal text-google-gray">· {g.bloques.length} facturas</span>}
                        </button>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded ${c.tipo === 'gas' ? 'bg-orange-50 text-orange-700' : 'bg-blue-50 text-google-blue'}`}>{c.tarifa_acceso || TIPO_LABEL[c.tipo]}</span>
                    </td>
                    <td className="table-cell text-xs text-google-gray max-w-[200px] truncate" title={c.producto || ''}>{c.producto || '—'}</td>
                    <td className="table-cell text-xs text-google-gray whitespace-nowrap max-w-[220px] truncate" title={potenciasTexto(c.potencias)}>{potenciasTexto(c.potencias)}</td>
                    <td className="table-cell text-xs text-google-gray tabular-nums whitespace-nowrap">{kwh(c.consumo_total_kwh)}</td>
                    <td className="table-cell text-xs text-google-gray tabular-nums">{c.dias ?? '—'}</td>
                    <td className="table-cell text-xs tabular-nums whitespace-nowrap">{eur(c.importe_actual)}</td>
                    <td className="table-cell text-xs tabular-nums whitespace-nowrap">{eur(c.importe_oferta)}</td>
                    <td className="table-cell text-xs tabular-nums whitespace-nowrap">
                      {c.ahorro == null ? '—' : (
                        <span className={Number(c.ahorro) >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                          {eur(c.ahorro)}{c.ahorro_pct != null && <span className="font-normal text-google-gray"> ({Number(c.ahorro_pct).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %)</span>}
                        </span>
                      )}
                    </td>
                    <td className="table-cell text-center">
                      <div className="inline-flex"><ShareButton cliente={{ ...c, comercial: c.realizada_por }} onUpdate={compartir} /></div>
                    </td>
                    <td className="table-cell text-center">
                      <div className="inline-flex items-center gap-0.5">
                        <FileEye id={c.id} campo="pdf_comparativa" disponible titulo="Ver la comparativa (PDF)" />
                        {onNavigate && (
                          <button onClick={() => { prepararEdicion(c, currentUser); onNavigate('tarifas'); }}
                            title={ajena ? 'Abrir en Comparativas para cambiar tarifa o datos (se guardará como otro estudio a tu nombre)' : 'Abrir en Comparativas para cambiar tarifa o datos'}
                            className="p-1 rounded hover:bg-amber-50 transition-colors">
                            <Pencil size={14} className="text-amber-600" />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="table-cell text-center"><FileEye id={c.id} campo="factura" disponible={c.tiene_factura} titulo={`Ver la factura${c.factura_nombre ? ` (${c.factura_nombre})` : ''}`} Icon={FileText} /></td>
                  </tr>
                )].filter(Boolean);
                });
              })}
            </tbody>
          </table>
        </div>
        <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
        <div className="px-5 py-3 border-t border-google-border bg-google-bg">
          <p className="text-xs text-google-gray">
            Mostrando <span className="font-medium text-google-dark">{pagina.length}</span> de{' '}
            <span className="font-medium text-google-dark">{grupos.length}</span> CUPS
            {' '}(<span className="font-medium text-google-dark">{filtradas.length}</span> {filtradas.length === 1 ? 'estudio' : 'estudios'})
          </p>
        </div>
      </div>

      {alta && (
        <NewClientModal
          key={`alta-${alta.comparativa.id}-${alta.tipo}`}
          tipo={alta.tipo}
          prefill
          initialData={prefillAlta(alta.comparativa, currentUser)}
          onClose={() => setAlta(null)}
          onSave={guardarAlta}
        />
      )}
    </div>
  );
}
