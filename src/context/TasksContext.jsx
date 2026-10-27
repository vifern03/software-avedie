import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';
import * as api from '../lib/tasksApi';
import { colorDeUsuario } from '../lib/tasksColores';
import { contadoresUsuario } from '../lib/tasksLogica';
import { puedeVer } from '../lib/tasksPermisos';

const TasksContext = createContext(null);

const VACIO = {
  disponible: false, cargando: false, tareas: [], usuarios: [], comentarios: {},
  contadores: { activas: 0, vencidas: 0, proximas: 0 },
  colorDe: () => '#5f6368', nombreDe: (u) => u, ahora: new Date(),
};

/** Ordena por created_at para tener un orden estable. */
const aLista = (mapa) => [...mapa.values()];

export function TasksProvider({ children }) {
  const { currentUser, hasAccess } = useAuth();
  const user = currentUser ? { username: currentUser.username, role: currentUser.role } : null;
  const username = user?.username || null;
  const role = user?.role || null;
  const activo = !!currentUser && hasAccess('tasks');

  const [mapa, setMapa] = useState(() => new Map());
  const [usuarios, setUsuarios] = useState([]);
  const [prefs, setPrefs] = useState({});
  const [comentarios, setComentarios] = useState({});
  // Último task_event recibido por Realtime, por tarea (el drawer abierto recarga su historial).
  const [eventosVivos, setEventosVivos] = useState({});
  const [cargando, setCargando] = useState(false);
  const [disponible, setDisponible] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());

  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;
  const userRef = useRef(user);
  userRef.current = user;
  const disponibleRef = useRef(false);
  const ultimaCarga = useRef(0);
  const cargaSeq = useRef(0);

  // ── Carga completa ────────────────────────────────────────────────────────
  const recargar = useCallback(async ({ silenciosa = false } = {}) => {
    const u = userRef.current;
    if (!u) return;
    const seq = ++cargaSeq.current;
    if (!silenciosa) setCargando(true);
    try {
      const [tareas, users, preferencias] = await Promise.all([
        api.fetchTareas(u),
        api.fetchUsuarios().catch(() => []),
        api.fetchPreferencias().catch(() => []),
      ]);
      if (seq !== cargaSeq.current) return;
      setMapa(new Map(tareas.map((t) => [t.id, t])));
      setUsuarios(users);
      setPrefs(Object.fromEntries(preferencias.filter((p) => p.color).map((p) => [p.username, p.color])));
      disponibleRef.current = true;
      setDisponible(true);
      ultimaCarga.current = Date.now();
      api.fetchConteoComentarios(tareas.map((t) => t.id))
        .then((c) => { if (seq === cargaSeq.current) setComentarios(c); })
        .catch(() => {});
    } catch (e) {
      if (seq !== cargaSeq.current) return;
      if (e?.noDisponible) {
        // BD sin el módulo de Tasks: contexto vacío, sin ruido.
        disponibleRef.current = false;
        setDisponible(false);
        setMapa(new Map());
      } else if (!silenciosa) {
        console.warn('[Tasks] Error cargando tareas:', e?.message);
      }
    } finally {
      if (seq === cargaSeq.current) setCargando(false);
    }
  }, []);

  // ── Ciclo de vida por usuario: carga + Realtime (un único canal) ──────────
  useEffect(() => {
    if (!activo || !username) {
      cargaSeq.current++;
      setMapa(new Map()); setUsuarios([]); setPrefs({}); setComentarios({}); setEventosVivos({});
      setDisponible(false); disponibleRef.current = false; setCargando(false);
      return undefined;
    }
    recargar();

    let suscritoAntes = false;
    const canal = supabase
      .channel(`tasks-rt-${username}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
        const u = userRef.current;
        setMapa((prev) => {
          const next = new Map(prev);
          if (payload.eventType === 'DELETE') {
            if (payload.old?.id) next.delete(payload.old.id);
            return next;
          }
          const row = payload.new;
          if (!row?.id) return prev;
          if (puedeVer(u, row)) {
            const actual = prev.get(row.id);
            if (actual && actual.updated_at && row.updated_at && actual.updated_at > row.updated_at) return prev;
            next.set(row.id, { ...actual, ...row });
          } else next.delete(row.id); // p. ej. reasignada a otra persona
          return next;
        });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_events' }, (payload) => {
        const ev = payload.new;
        // Solo eventos de tareas que el usuario ve.
        if (!ev?.task_id || !mapaRef.current.has(ev.task_id)) return;
        setEventosVivos((prev) => ({ ...prev, [ev.task_id]: ev.id }));
        // Los comentarios propios ya se sumaron al enviarlos.
        if (ev.type === 'commented' && ev.actor !== userRef.current?.username) {
          setComentarios((c) => ({ ...c, [ev.task_id]: (c[ev.task_id] || 0) + 1 }));
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Tras una reconexión, sincroniza lo que se haya perdido.
          if (suscritoAntes && disponibleRef.current) recargar({ silenciosa: true });
          suscritoAntes = true;
        }
      });

    const onVisible = () => {
      if (document.visibilityState === 'visible' && disponibleRef.current && Date.now() - ultimaCarga.current > 15000) {
        recargar({ silenciosa: true });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(canal);
    };
  }, [activo, username, role, recargar]);

  // Reloj para que "vencida / próxima" se actualice sola.
  useEffect(() => {
    if (!activo) return undefined;
    const id = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(id);
  }, [activo]);

  // ── Helpers de estado ─────────────────────────────────────────────────────
  const fusionar = useCallback((rows) => {
    const lista = (Array.isArray(rows) ? rows : [rows]).filter(Boolean);
    if (!lista.length) return;
    setMapa((prev) => {
      const next = new Map(prev);
      for (const r of lista) {
        if (puedeVer(userRef.current, r)) next.set(r.id, { ...prev.get(r.id), ...r });
        else next.delete(r.id);
      }
      return next;
    });
  }, []);

  /** Aplica un parche optimista y lo revierte si la RPC falla. */
  const optimista = useCallback(async (id, parche, llamada) => {
    const anterior = mapaRef.current.get(id);
    if (anterior) {
      setMapa((prev) => {
        const next = new Map(prev);
        next.set(id, { ...(prev.get(id) || anterior), ...parche });
        return next;
      });
    }
    try {
      const row = await llamada();
      if (row) fusionar(row);
      return row;
    } catch (e) {
      if (anterior) setMapa((prev) => { const next = new Map(prev); next.set(id, anterior); return next; });
      throw e;
    }
  }, [fusionar]);

  const actor = () => {
    const u = userRef.current?.username;
    if (!u) throw new api.TasksError('No hay sesión iniciada.');
    return u;
  };

  // ── Acciones ──────────────────────────────────────────────────────────────
  const acciones = useMemo(() => ({
    crear: async (datos) => { const rows = await api.crearTarea(actor(), datos); fusionar(rows); return rows; },
    crearDesdePendientes: async (lote) => { const row = await api.crearTareaPendientes(actor(), lote); fusionar(row); return row; },
    editar: async (id, cambios) => { const row = await api.editarTarea(actor(), id, cambios); fusionar(row); return row; },
    cambiarEstado: (id, status) => optimista(id, {
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    }, () => api.cambiarEstado(actor(), id, status)),
    reasignar: async (id, assignee) => { const row = await api.reasignarTarea(actor(), id, assignee); fusionar(row); return row; },
    mover: (id, fecha, hora) => optimista(id, { planned_date: fecha, planned_time: fecha ? hora || null : null },
      () => api.moverTarea(actor(), id, fecha, hora)),
    archivar: async (id, archivar) => { const row = await api.archivarTarea(actor(), id, archivar); fusionar(row); return row; },
    comentar: async (id, texto) => {
      const ev = await api.comentarTarea(actor(), id, texto);
      setComentarios((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
      return ev;
    },
    setColor: async (usernameObjetivo, color) => {
      await api.setColorUsuario(actor(), usernameObjetivo, color);
      setPrefs((p) => { const n = { ...p }; if (color) n[usernameObjetivo] = color; else delete n[usernameObjetivo]; return n; });
    },
    cargarEventos: (id) => api.fetchEventos(id),
    cargarHistorialPersonal: () => api.fetchHistorialPersonal(actor()),
    recargar: () => recargar(),
  }), [fusionar, optimista, recargar]); // eslint-disable-line react-hooks/exhaustive-deps

  const tareas = useMemo(() => aLista(mapa), [mapa]);

  const nombres = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.username, u.display_name || u.username])), [usuarios]);
  const nombreDe = useCallback((u) => (u ? nombres[u] || u : ''), [nombres]);
  const colorDe = useCallback((u) => colorDeUsuario(u, prefs), [prefs]);

  const contadores = useMemo(
    () => (username ? contadoresUsuario(tareas, username, ahora) : VACIO.contadores),
    [tareas, username, ahora],
  );

  const value = useMemo(() => ({
    disponible, cargando, tareas, usuarios, comentarios, prefs, contadores, ahora,
    colorDe, nombreDe, acciones, user, eventosVivos,
  }), [disponible, cargando, tareas, usuarios, comentarios, prefs, contadores, ahora, eventosVivos, colorDe, nombreDe, acciones, username, role]); // eslint-disable-line react-hooks/exhaustive-deps

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

export function useTasks() {
  return useContext(TasksContext) || VACIO;
}
