import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, CloudOff, History, List, ListChecks, Plus, Search, Users, X, AlertCircle, Inbox, Archive, Send, Filter, ChevronDown,
} from 'lucide-react';
import { useTasks } from '../context/TasksContext';
import { filtrarTareas, PESTANAS, PRIORIDADES, ESTADOS } from '../lib/tasksLogica';
import { pestanasDisponibles, vistasDisponibles, puedeFiltrarPorTrabajador } from '../lib/tasksPermisos';
import TaskList from '../components/tasks/TaskList';
import TaskCreateForm from '../components/tasks/TaskCreateForm';
import TaskDetailDrawer from '../components/tasks/TaskDetailDrawer';
import TeamStats from '../components/tasks/TeamStats';
import PersonalHistory from '../components/tasks/PersonalHistory';
import { EstadoVacio, Modal, SkeletonLista, ToastProvider, hayCapaAbierta, useToast } from '../components/tasks/ui';

const TaskCalendar = lazy(() => import('../components/tasks/TaskCalendar'));

const VISTAS = {
  lista: { label: 'Lista', icon: List },
  calendario: { label: 'Calendario', icon: CalendarDays },
  equipo: { label: 'Equipo', icon: Users },
};

const VACIOS = {
  mis: { icono: CheckCircle2, titulo: 'No tienes tareas pendientes', texto: 'Crea una arriba o pulsa N en cualquier momento.' },
  proximas: { icono: CalendarDays, titulo: 'Nada para hoy ni para los próximos días', texto: 'Las tareas con fecha aparecerán aquí.' },
  vencidas: { icono: CheckCircle2, titulo: 'Sin tareas vencidas', texto: 'Vas al día. ¡Bien hecho!' },
  sinfecha: { icono: Inbox, titulo: 'Todas tus tareas tienen fecha', texto: '' },
  completadas: { icono: CheckCircle2, titulo: 'Aún no has completado tareas', texto: 'Al marcar una tarea como completada la verás aquí.' },
  asignadas: { icono: Send, titulo: 'No has asignado tareas a nadie', texto: 'Crea una tarea y elige a otra persona como responsable.' },
  todas: { icono: ListChecks, titulo: 'No hay tareas', texto: '' },
  archivadas: { icono: Archive, titulo: 'No hay tareas archivadas', texto: '' },
};

const leerPref = (k, def) => { try { return localStorage.getItem(k) || def; } catch { return def; } };
const guardarPref = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } };

function esCampoEditable(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function TasksPage({ onNavigate }) {
  const { tareas, user, ahora, colorDe, nombreDe, comentarios, cargando, disponible, usuarios, acciones } = useTasks();
  const toast = useToast();

  const vistas = vistasDisponibles(user);
  const pestanas = pestanasDisponibles(user);
  const [vista, setVistaState] = useState(() => {
    const v = leerPref('tasks_vista', 'lista');
    return vistas.includes(v) ? v : 'lista';
  });
  const setVista = (v) => { setVistaState(v); guardarPref('tasks_vista', v); };

  const [pestana, setPestana] = useState('mis');
  const [busqueda, setBusqueda] = useState('');
  const [trabajador, setTrabajador] = useState('');
  const [prioridad, setPrioridad] = useState('');
  const [estado, setEstado] = useState('');
  const [detalleId, setDetalleId] = useState(null);
  const [crear, setCrear] = useState(null); // null | { inicial }
  const [historial, setHistorial] = useState(false);
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false); // solo móvil
  const busquedaRef = useRef(null);

  const filtrosBase = { busqueda, trabajador, prioridad, estado };
  const filtradas = useMemo(
    () => filtrarTareas(tareas, user, { ...filtrosBase, pestana: vista === 'calendario' ? 'calendario' : pestana }, ahora),
    [tareas, user?.username, busqueda, trabajador, prioridad, estado, pestana, vista, ahora], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const conteos = useMemo(() => Object.fromEntries(pestanas.map((p) => [
    p, filtrarTareas(tareas, user, { busqueda, trabajador, prioridad, pestana: p }, ahora).length,
  ])), [tareas, user?.username, busqueda, trabajador, prioridad, ahora]); // eslint-disable-line react-hooks/exhaustive-deps

  const trabajadores = useMemo(() => {
    if (!puedeFiltrarPorTrabajador(user)) return [];
    const set = new Set(tareas.map((t) => t.assignee));
    if (user.role === 'admin') usuarios.forEach((u) => set.add(u.username));
    return [...set].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));
  }, [tareas, usuarios, user?.role, nombreDe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atajos: N = nueva tarea, / = buscar.
  useEffect(() => {
    const h = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || esCampoEditable(document.activeElement) || hayCapaAbierta()) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setCrear({ inicial: {} }); }
      if (e.key === '/') { e.preventDefault(); busquedaRef.current?.focus(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const onToggle = useCallback(async (task, status) => {
    try {
      await acciones.cambiarEstado(task.id, status);
      toast(status === 'completed' ? 'Tarea completada' : 'Tarea reabierta');
    } catch (e) { toast(e.message, 'error'); }
  }, [acciones, toast]);

  const cerrarDetalle = useCallback(() => setDetalleId(null), []);
  const filtrosActivos = [trabajador, prioridad, estado].filter(Boolean).length;
  const hayFiltros = !!(filtrosActivos || busqueda);
  const limpiar = () => { setTrabajador(''); setPrioridad(''); setEstado(''); setBusqueda(''); };

  const verTrabajador = (u) => {
    setTrabajador(u);
    setPestana(user.role === 'admin' ? 'todas' : 'asignadas');
    setVista('lista');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const cabecera = (
    <div className="flex flex-col gap-4 mb-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2 mr-auto">
          <ListChecks size={24} className="text-google-blue" /> Tareas
        </h1>
        <div className="flex rounded-lg border border-google-border bg-white p-0.5" role="tablist" aria-label="Vista">
          {vistas.map((v) => {
            const Icon = VISTAS[v].icon;
            return (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                aria-label={VISTAS[v].label}
                title={VISTAS[v].label}
                onClick={() => setVista(v)}
                className={`flex items-center justify-center gap-1.5 min-w-[44px] px-3 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue
                  ${vista === v ? 'bg-google-blue-light text-google-blue' : 'text-google-gray hover:text-google-dark'}`}
              >
                <Icon size={15} /> <span className="hidden sm:inline">{VISTAS[v].label}</span>
              </button>
            );
          })}
        </div>
        <button type="button" onClick={() => setHistorial(true)} className="p-2 rounded-lg border border-google-border bg-white text-google-gray hover:text-google-dark hover:bg-google-bg" title="Mi historial" aria-label="Mi historial">
          <History size={17} />
        </button>
        <button type="button" onClick={() => setCrear({ inicial: {} })} className="btn-primary flex items-center gap-1.5" title="Nueva tarea (N)" disabled={!disponible}>
          <Plus size={16} /> Nueva tarea <kbd className="hidden md:inline ml-1 text-[10px] bg-white/20 rounded px-1">N</kbd>
        </button>
      </div>

      {vista !== 'equipo' && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-google-gray" />
            <input
              ref={busquedaRef}
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setBusqueda(''); e.currentTarget.blur(); } }}
              placeholder="Buscar tareas…"
              aria-label="Buscar tareas"
              className="input-field !pl-9 md:!pr-9"
            />
            <kbd className="hidden md:flex absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-google-gray border border-google-border rounded px-1.5 py-0.5 pointer-events-none" title="Atajo para buscar">/</kbd>
          </div>
          <button
            type="button"
            onClick={() => setFiltrosAbiertos((v) => !v)}
            aria-expanded={filtrosAbiertos}
            aria-controls="tasks-filtros"
            className={`sm:hidden flex items-center gap-1.5 px-3 h-[38px] rounded-md border text-sm font-medium
              ${filtrosActivos ? 'border-google-blue text-google-blue bg-google-blue-light' : 'border-google-border text-google-gray bg-white'}`}
          >
            <Filter size={15} /> Filtros{filtrosActivos ? ` (${filtrosActivos})` : ''}
            <ChevronDown size={14} className={`transition-transform ${filtrosAbiertos ? 'rotate-180' : ''}`} />
          </button>
          <div id="tasks-filtros" className={`${filtrosAbiertos ? 'flex' : 'hidden'} sm:flex flex-wrap items-center gap-2 w-full sm:w-auto`}>
          {trabajadores.length > 0 && (
            <select value={trabajador} onChange={(e) => setTrabajador(e.target.value)} className="input-field w-full sm:!w-auto" aria-label="Filtrar por trabajador">
              <option value="">Todos los trabajadores</option>
              {trabajadores.map((u) => <option key={u} value={u}>{nombreDe(u)}</option>)}
            </select>
          )}
          <select value={prioridad} onChange={(e) => setPrioridad(e.target.value)} className="input-field flex-1 sm:flex-none sm:!w-auto" aria-label="Filtrar por prioridad">
            <option value="">Cualquier prioridad</option>
            {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="input-field flex-1 sm:flex-none sm:!w-auto" aria-label="Filtrar por estado">
            <option value="">Cualquier estado</option>
            {ESTADOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          {hayFiltros && (
            <button type="button" onClick={limpiar} className="text-xs text-google-gray hover:text-google-blue flex items-center gap-1 px-2 py-1">
              <X size={13} /> Limpiar
            </button>
          )}
          </div>
        </div>
      )}
    </div>
  );

  let cuerpo;
  if (!disponible && !cargando) {
    cuerpo = <EstadoVacio icono={CloudOff} titulo="Tareas no está disponible todavía" texto="El módulo de tareas aún no está activado en la base de datos. El resto del CRM funciona con normalidad." />;
  } else if (vista === 'equipo') {
    cuerpo = cargando && !tareas.length ? <SkeletonLista filas={5} /> : <TeamStats onVerTrabajador={verTrabajador} />;
  } else if (vista === 'calendario') {
    cuerpo = (
      <Suspense fallback={<SkeletonLista filas={8} />}>
        <TaskCalendar tareas={filtradas} onOpen={setDetalleId} onCrear={(inicial) => setCrear({ inicial })} />
      </Suspense>
    );
  } else {
    const vacio = VACIOS[pestana] || VACIOS.todas;
    cuerpo = (
      <div className="space-y-4">
        <nav className="flex gap-1 overflow-x-auto -mx-1 px-1 pb-1 border-b border-google-border" aria-label="Filtros rápidos">
          {pestanas.map((p) => {
            const activa = pestana === p;
            const n = conteos[p] || 0;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPestana(p)}
                aria-current={activa ? 'page' : undefined}
                className={`relative whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors
                  ${activa ? 'text-google-blue' : 'text-google-gray hover:text-google-dark'}`}
              >
                {PESTANAS[p]}
                {n > 0 && !['completadas', 'archivadas', 'todas'].includes(p) && (
                  <span className={`ml-1.5 text-[11px] px-1.5 py-0.5 rounded-full ${p === 'vencidas' ? 'bg-red-50 text-red-600' : 'bg-google-bg text-google-gray'}`}>{n}</span>
                )}
                {activa && <span className="absolute left-2 right-2 -bottom-[5px] h-[3px] rounded-t bg-google-blue" />}
              </button>
            );
          })}
        </nav>

        {!['completadas', 'archivadas'].includes(pestana) && disponible && <TaskCreateForm compacto />}

        {cargando && !tareas.length ? (
          <SkeletonLista />
        ) : filtradas.length === 0 ? (
          hayFiltros
            ? <EstadoVacio icono={Search} titulo="Ninguna tarea coincide con los filtros"><button type="button" onClick={limpiar} className="btn-secondary text-xs">Limpiar filtros</button></EstadoVacio>
            : <EstadoVacio icono={pestana === 'vencidas' ? AlertCircle : vacio.icono} titulo={vacio.titulo} texto={vacio.texto} />
        ) : (
          <TaskList
            tareas={filtradas}
            user={user}
            ahora={ahora}
            colorDe={colorDe}
            nombreDe={nombreDe}
            comentarios={comentarios}
            onOpen={setDetalleId}
            onToggle={onToggle}
            seleccionada={detalleId}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 pb-28 sm:pb-28 max-w-6xl mx-auto">
      {cabecera}
      {cuerpo}

      {detalleId && (
        <TaskDetailDrawer
          taskId={detalleId}
          onClose={cerrarDetalle}
          onVerPendientes={onNavigate ? (lote) => onNavigate('pendientes', { lote }) : undefined}
        />
      )}
      {crear && (
        <Modal titulo="Nueva tarea" icono={Plus} onClose={() => setCrear(null)} ancho="max-w-xl">
          <TaskCreateForm inicial={crear.inicial} onCreated={() => setCrear(null)} onCancel={() => setCrear(null)} />
        </Modal>
      )}
      {historial && <PersonalHistory onClose={() => setHistorial(false)} onOpenTask={setDetalleId} />}
    </div>
  );
}

export default function Tasks({ onNavigate }) {
  return (
    <ToastProvider>
      <TasksPage onNavigate={onNavigate} />
    </ToastProvider>
  );
}
