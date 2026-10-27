import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Loader2, Lock, Send, X, History } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { permisosTarea } from '../../lib/tasksPermisos';
import { ESTADOS, PRIORIDADES, PRIORIDAD_LABEL, describirEvento, diffCambios } from '../../lib/tasksLogica';
import { fechaCorta, fechaHora, haceCuanto, horaCorta } from '../../lib/tasksFechas';
import AssigneePicker from './AssigneePicker';
import { CheckCompletar } from './TaskRow';
import { Avatar, DeadlineChip, Etiqueta, useEscape, useToast } from './ui';

const textoFecha = (fecha, hora, ahora) => (fecha ? `${fechaCorta(fecha, ahora)}${hora ? ` · ${horaCorta(hora)}` : ''}` : 'Sin fecha');

const aForm = (t) => ({
  title: t.title || '',
  description: t.description || '',
  priority: t.priority || 'normal',
  planned_date: t.planned_date || '',
  planned_time: horaCorta(t.planned_time),
  due_date: t.due_date || '',
  due_time: horaCorta(t.due_time),
});

export default function TaskDetailDrawer({ taskId, onClose }) {
  const { tareas, user, usuarios, colorDe, nombreDe, acciones, ahora, cargando, eventosVivos } = useTasks();
  const toast = useToast();
  const task = useMemo(() => tareas.find((t) => t.id === taskId), [tareas, taskId]);
  const p = permisosTarea(user, task);

  const [form, setForm] = useState(() => (task ? aForm(task) : null));
  const [eventos, setEventos] = useState(null);
  const [comentario, setComentario] = useState('');
  const [ocupado, setOcupado] = useState('');
  const panelRef = useRef(null);

  useEscape(onClose);

  // Si la tarea deja de ser visible (reasignada, etc.), se cierra el panel.
  useEffect(() => { if (!task && !cargando) onClose(); }, [task, cargando, onClose]);

  // Re-sincroniza el formulario cuando cambia la tarea en servidor.
  const previaRef = useRef(null);
  useEffect(() => {
    if (!task) return;
    const previa = previaRef.current;
    previaRef.current = task;
    if (!previa || previa.id !== task.id) { setForm(aForm(task)); return; }
    // Si el usuario no tenía cambios locales sin guardar, adopta la versión del servidor.
    setForm((f) => (!f || Object.keys(diffCambios(previa, f)).length === 0 ? aForm(task) : f));
  }, [task]);

  const cargarEventos = () => {
    acciones.cargarEventos(taskId).then(setEventos).catch(() => setEventos([]));
  };
  useEffect(() => { setEventos(null); cargarEventos(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (task?.updated_at && eventos) cargarEventos(); }, [task?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eventos nuevos por Realtime (comentarios de otros, cambios…) → recargar historial.
  const vivo = eventosVivos?.[taskId];
  useEffect(() => { if (vivo && eventos) cargarEventos(); }, [vivo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Foco: al abrir va al panel; al cerrar vuelve al elemento de origen.
  const origenRef = useRef(null);
  useEffect(() => {
    origenRef.current = document.activeElement;
    return () => { const el = origenRef.current; if (el?.isConnected) el.focus?.(); };
  }, []);
  useEffect(() => { panelRef.current?.focus(); }, [taskId]);

  // Focus trap: Tab / Shift+Tab no salen del panel.
  const atraparFoco = (e) => {
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusables = [...panelRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.offsetParent !== null);
    if (!focusables.length) return;
    const primero = focusables[0];
    const ultimo = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === primero || document.activeElement === panelRef.current)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
  };

  if (!task || !form) return null;

  const cambios = diffCambios(task, form);
  const hayCambios = Object.keys(cambios).length > 0;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const ejecutar = async (clave, fn, ok) => {
    setOcupado(clave);
    try { await fn(); if (ok) toast(ok); cargarEventos(); return true; }
    catch (e) { toast(e.message, 'error'); return false; }
    finally { setOcupado(''); }
  };

  const guardar = () => {
    if (!form.title.trim()) { toast('El título es obligatorio.', 'error'); return; }
    const c = { ...cambios };
    if ('planned_date' in c && !c.planned_date) c.planned_time = null;
    if ('due_date' in c && !c.due_date) c.due_time = null;
    ejecutar('guardar', () => acciones.editar(task.id, c), 'Cambios guardados');
  };

  const cambiarEstado = (status) => {
    if (status === task.status) return;
    ejecutar('estado', () => acciones.cambiarEstado(task.id, status), status === 'completed' ? 'Tarea completada' : task.status === 'completed' ? 'Tarea reabierta' : null);
  };

  const enviarComentario = async (e) => {
    e?.preventDefault();
    const texto = comentario.trim();
    if (!texto) return;
    const ok = await ejecutar('comentar', () => acciones.comentar(task.id, texto));
    if (ok) setComentario('');
  };

  const historial = [...(eventos || [])].reverse();
  const soloLectura = !p.editar || !!task.archived_at;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[55] md:bg-black/10" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        tabIndex={-1}
        onKeyDown={atraparFoco}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de la tarea ${task.title}`}
        className="tasks-drawer fixed top-0 right-0 h-full w-full md:w-[460px] bg-white z-[56] shadow-google flex flex-col outline-none"
      >
        {/* Cabecera */}
        <div className="px-5 py-3.5 border-b border-google-border flex items-center gap-2">
          <CheckCompletar task={task} user={user} onToggle={(t, s) => cambiarEstado(s)} size={22} />
          <div className="flex rounded-lg border border-google-border overflow-hidden text-xs" role="group" aria-label="Estado">
            {ESTADOS.map((e) => (
              <button
                key={e.id}
                type="button"
                disabled={!p.cambiarEstado || !!task.archived_at || ocupado === 'estado'}
                onClick={() => cambiarEstado(e.id)}
                aria-pressed={task.status === e.id}
                className={`px-2.5 py-1.5 font-medium transition-colors disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-google-blue
                  ${task.status === e.id ? 'bg-google-blue text-white' : 'text-google-gray hover:bg-google-bg disabled:hover:bg-white'}`}
              >
                {e.id === 'completed' && task.status === 'completed' ? 'Completada' : e.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-1">
            {p.archivar && (
              <button
                type="button"
                onClick={() => ejecutar('archivar', () => acciones.archivar(task.id, !task.archived_at), task.archived_at ? 'Tarea desarchivada' : 'Tarea archivada')}
                disabled={ocupado === 'archivar'}
                className="p-2 rounded-md text-google-gray hover:bg-google-bg hover:text-google-dark"
                title={task.archived_at ? 'Desarchivar' : 'Archivar'}
                aria-label={task.archived_at ? 'Desarchivar' : 'Archivar'}
              >
                {task.archived_at ? <ArchiveRestore size={17} /> : <Archive size={17} />}
              </button>
            )}
            <button type="button" onClick={onClose} className="p-2 rounded-md text-google-gray hover:bg-google-bg hover:text-google-dark" aria-label="Cerrar detalle">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {task.archived_at && (
            <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-google-bg border border-google-border text-xs text-google-gray flex items-center gap-2">
              <Archive size={14} /> Archivada el {fechaHora(task.archived_at)}
            </div>
          )}
          {!p.editar && (
            <div className="mx-5 mt-4 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
              <Lock size={13} /> Solo {nombreDe(task.created_by)} o un administrador pueden editar esta tarea. Tú puedes cambiar su estado y comentar.
            </div>
          )}

          {/* Campos */}
          <div className="px-5 py-4 space-y-4">
            <textarea
              value={form.title}
              onChange={(e) => set('title', e.target.value.replace(/\n/g, ' '))}
              disabled={soloLectura}
              rows={1}
              maxLength={200}
              aria-label="Título"
              className={`w-full resize-none text-lg font-semibold text-google-dark outline-none bg-transparent rounded-md px-1 -mx-1 focus:bg-google-bg disabled:text-google-dark ${task.status === 'completed' ? 'line-through text-google-gray' : ''}`}
              style={{ fieldSizing: 'content' }}
            />
            <div className="flex flex-wrap gap-1.5"><DeadlineChip task={task} ahora={ahora} /></div>

            {soloLectura ? (
              <dl className="space-y-3">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">Descripción</dt>
                  <dd className={`text-sm whitespace-pre-wrap break-words ${task.description ? 'text-google-dark' : 'text-google-gray italic'}`}>{task.description || 'Sin descripción'}</dd>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">Responsable</dt>
                    <dd className="flex items-center gap-2 text-sm text-google-dark"><Avatar nombre={nombreDe(task.assignee)} color={colorDe(task.assignee)} size={22} /> {nombreDe(task.assignee)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">Prioridad</dt>
                    <dd className="text-sm text-google-dark">{PRIORIDAD_LABEL[task.priority] || task.priority}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">Fecha planificada</dt>
                    <dd className="text-sm text-google-dark">{textoFecha(task.planned_date, task.planned_time, ahora)}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-1">Fecha límite</dt>
                    <dd className="text-sm text-google-dark">{textoFecha(task.due_date, task.due_time, ahora)}{task.due_date && !task.due_time ? ' (final del día)' : ''}</dd>
                  </div>
                </div>
              </dl>
            ) : (
              <>
                <div>
                  <Etiqueta htmlFor="td-desc">Descripción</Etiqueta>
                  <textarea id="td-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="Añade detalles…" className="input-field resize-y" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1">
                    <Etiqueta htmlFor="td-resp">Responsable</Etiqueta>
                    {p.reasignar ? (
                      <AssigneePicker
                        id="td-resp"
                        multiple={false}
                        usuarios={usuarios}
                        value={[task.assignee]}
                        colorDe={colorDe}
                        nombreDe={nombreDe}
                        yo={user.username}
                        disabled={ocupado === 'reasignar'}
                        onChange={([u]) => { if (u && u !== task.assignee) ejecutar('reasignar', () => acciones.reasignar(task.id, u), `Reasignada a ${nombreDe(u)}`); }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 py-2 text-sm text-google-dark">
                        <Avatar nombre={nombreDe(task.assignee)} color={colorDe(task.assignee)} size={22} /> {nombreDe(task.assignee)}
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <Etiqueta htmlFor="td-prio">Prioridad</Etiqueta>
                    <select id="td-prio" value={form.priority} onChange={(e) => set('priority', e.target.value)} className="input-field">
                      {PRIORIDADES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Etiqueta htmlFor="td-plan">Fecha planificada</Etiqueta>
                    <div className="flex gap-2">
                      <input id="td-plan" type="date" value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} className="input-field" />
                      <input type="time" aria-label="Hora planificada" value={form.planned_time} disabled={!form.planned_date} onChange={(e) => set('planned_time', e.target.value)} className="input-field !w-32 disabled:bg-google-bg" />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <Etiqueta htmlFor="td-due">Fecha límite</Etiqueta>
                    <div className="flex gap-2">
                      <input id="td-due" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="input-field" />
                      <input type="time" aria-label="Hora de la fecha límite" value={form.due_time} disabled={!form.due_date} onChange={(e) => set('due_time', e.target.value)} className="input-field !w-32 disabled:bg-google-bg" />
                    </div>
                    {form.due_date && !form.due_time && <p className="text-[11px] text-google-gray mt-1">Sin hora: vence al final del día.</p>}
                  </div>
                </div>
              </>
            )}

            {hayCambios && !soloLectura && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setForm(aForm(task))} className="btn-secondary !py-1.5 text-xs">Descartar</button>
                <button type="button" onClick={guardar} disabled={ocupado === 'guardar'} className="btn-primary !py-1.5 text-xs flex items-center gap-1.5">
                  {ocupado === 'guardar' && <Loader2 size={13} className="animate-spin" />} Guardar cambios
                </button>
              </div>
            )}

            <p className="text-[11px] text-google-gray">
              Creada por {nombreDe(task.created_by)} · {fechaHora(task.created_at)}
              {task.completed_at && <> · Completada {task.completed_by ? `por ${nombreDe(task.completed_by)} ` : ''}{haceCuanto(task.completed_at, ahora)}</>}
            </p>
          </div>

          {/* Actividad */}
          <div className="border-t border-google-border px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-google-gray mb-3 flex items-center gap-1.5"><History size={12} /> Actividad</p>
            <form onSubmit={enviarComentario} className="flex items-end gap-2 mb-4">
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarComentario(e); }}
                rows={2}
                maxLength={2000}
                placeholder="Escribe un comentario…"
                aria-label="Comentario"
                className="input-field resize-none"
              />
              <button type="submit" disabled={!comentario.trim() || ocupado === 'comentar'} className="btn-primary !px-3 h-[38px] disabled:opacity-40" aria-label="Enviar comentario">
                {ocupado === 'comentar' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </form>
            <p className="hidden md:block -mt-3 mb-4 text-[11px] text-google-gray">Ctrl+Enter para enviar</p>

            {eventos === null ? (
              <div className="space-y-2 animate-pulse">{[0, 1, 2].map((i) => <div key={i} className="h-3 bg-gray-100 rounded w-3/4" />)}</div>
            ) : historial.length === 0 ? (
              <p className="text-xs text-google-gray">Sin actividad todavía.</p>
            ) : (
              <ol className="space-y-3">
                {historial.map((ev) => (
                  <li key={ev.id} className="flex gap-2.5">
                    <Avatar nombre={nombreDe(ev.actor)} color={colorDe(ev.actor)} size={22} />
                    <div className="flex-1 min-w-0">
                      {ev.type === 'commented' ? (
                        <>
                          <p className="text-xs text-google-gray"><span className="font-medium text-google-dark">{nombreDe(ev.actor)}</span> · {haceCuanto(ev.created_at, ahora)}</p>
                          <p className="mt-1 text-sm text-google-dark bg-google-bg border border-google-border rounded-lg px-3 py-2 whitespace-pre-wrap break-words">{ev.payload?.comment ?? ev.payload?.comentario ?? ''}</p>
                        </>
                      ) : (
                        <p className="text-xs text-google-gray leading-relaxed pt-0.5">
                          <span className="text-google-dark">{describirEvento(ev, nombreDe, ahora)}</span> · <time title={fechaHora(ev.created_at)}>{haceCuanto(ev.created_at, ahora)}</time>
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
