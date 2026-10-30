import { useRef, useState } from 'react';
import { Loader2, Plus, SlidersHorizontal } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { puedeCrearParaOtros } from '../../lib/tasksPermisos';
import { PRIORIDADES } from '../../lib/tasksLogica';
import AssigneePicker from './AssigneePicker';
import { Etiqueta, useToast } from './ui';

const vacio = (yo, inicial = {}) => ({
  title: '', description: '', assignees: [yo], priority: 'normal',
  planned_date: '', planned_time: '', due_date: '', due_time: '',
  ...inicial,
});

/**
 * Formulario de creación. Solo el título es obligatorio; Enter crea.
 * `compacto` = barra de creación rápida de la lista (opciones plegadas).
 */
export default function TaskCreateForm({ inicial, compacto = false, onCreated, onCancel, inputRef }) {
  const { user, usuarios, colorDe, nombreDe, acciones } = useTasks();
  const toast = useToast();
  const paraOtros = puedeCrearParaOtros(user);
  const [form, setForm] = useState(() => vacio(user.username, inicial));
  const [opciones, setOpciones] = useState(!compacto || !!inicial?.planned_date);
  const [guardando, setGuardando] = useState(false);
  const localRef = useRef(null);
  const tituloRef = inputRef || localRef;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const enviar = async (e) => {
    e?.preventDefault();
    const title = form.title.trim();
    if (!title || guardando) return;
    if (title.length > 200) { toast('El título no puede superar 200 caracteres.', 'error'); return; }
    setGuardando(true);
    try {
      // Una sola tarea: el primero es el responsable principal; el resto se comparte.
      // Un comercial solo crea tareas propias: él es siempre el principal.
      const lista = paraOtros ? form.assignees : [user.username, ...form.assignees.filter((u) => u !== user.username)];
      const [principal, ...resto] = lista.length ? lista : [user.username];
      const rows = await acciones.crear({ ...form, title, assignees: [principal], shared_with: resto });
      toast('Tarea creada');
      setForm(vacio(user.username, compacto ? {} : inicial));
      if (compacto) setOpciones(false);
      onCreated?.(rows);
      tituloRef.current?.focus();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const onKeyTitulo = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); }
    if (e.key === 'Escape' && compacto && !form.title) { e.currentTarget.blur(); }
  };

  return (
    <form onSubmit={enviar} className={compacto ? 'bg-white border border-google-border rounded-xl shadow-sm' : ''}>
      <div className={`flex items-center gap-3 ${compacto ? 'px-4 py-2.5' : 'px-5 pt-4'}`}>
        <Plus size={18} className="text-google-blue flex-shrink-0" />
        <input
          ref={tituloRef}
          data-autofocus
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          onKeyDown={onKeyTitulo}
          maxLength={200}
          placeholder={compacto ? 'Añadir una tarea…' : 'Título de la tarea'}
          aria-label="Título de la tarea"
          className={`flex-1 min-w-0 text-sm text-google-dark placeholder-google-gray outline-none bg-transparent ${compacto ? 'py-1.5' : 'py-2 text-base font-medium border-b border-google-border focus:border-google-blue'}`}
        />
        {compacto && <span className="hidden md:inline text-[11px] text-google-gray whitespace-nowrap">Enter para crear</span>}
        {compacto && (
          <button
            type="button"
            onClick={() => setOpciones((v) => !v)}
            className={`w-10 h-10 -my-1 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue
              ${opciones ? 'bg-google-blue-light text-google-blue' : 'text-google-gray hover:bg-google-bg hover:text-google-blue'}`}
            aria-expanded={opciones}
            aria-label="Más opciones"
            title="Más opciones"
          >
            <SlidersHorizontal size={17} />
          </button>
        )}
        {compacto && (
          <button type="submit" disabled={!form.title.trim() || guardando} className="btn-primary !px-3 !py-2 sm:!py-1.5 text-xs disabled:opacity-40 flex items-center gap-1">
            {guardando ? <Loader2 size={13} className="animate-spin" /> : null} Crear
          </button>
        )}
      </div>

      {opciones && (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${compacto ? 'px-4 pb-4 pt-1 border-t border-google-border mt-1' : 'px-5 py-4'}`}>
          <div className="sm:col-span-2">
            <Etiqueta htmlFor="tc-desc">Descripción</Etiqueta>
            <textarea id="tc-desc" rows={compacto ? 2 : 3} maxLength={5000} value={form.description} onChange={(e) => set('description', e.target.value)} className="input-field resize-y" placeholder="Detalles (opcional)" />
          </div>
          <div className="sm:col-span-2">
            <Etiqueta htmlFor="tc-resp">Responsables {form.assignees.length > 1 && <span className="normal-case tracking-normal font-normal">· {nombreDe(paraOtros ? form.assignees[0] : user.username)} es el principal; los demás pueden cambiar el estado y comentar</span>}</Etiqueta>
            <AssigneePicker
              id="tc-resp"
              usuarios={usuarios}
              value={paraOtros ? form.assignees : [user.username, ...form.assignees.filter((u) => u !== user.username)]}
              onChange={(v) => set('assignees', v.length ? v : [user.username])}
              colorDe={colorDe}
              nombreDe={nombreDe}
              yo={user.username}
              fijos={paraOtros ? [] : [user.username]}
            />
          </div>
          <div>
            <Etiqueta htmlFor="tc-prio">Prioridad</Etiqueta>
            <select id="tc-prio" value={form.priority} onChange={(e) => set('priority', e.target.value)} className="input-field">
              {PRIORIDADES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="hidden sm:block" />
          <div>
            <Etiqueta htmlFor="tc-plan">Fecha planificada</Etiqueta>
            <div className="flex gap-2">
              <input id="tc-plan" type="date" value={form.planned_date} onChange={(e) => set('planned_date', e.target.value)} className="input-field" />
              <input type="time" aria-label="Hora planificada" disabled={!form.planned_date} value={form.planned_time} onChange={(e) => set('planned_time', e.target.value)} className="input-field !w-32 disabled:bg-google-bg" />
            </div>
          </div>
          <div>
            <Etiqueta htmlFor="tc-due">Fecha límite</Etiqueta>
            <div className="flex gap-2">
              <input id="tc-due" type="date" value={form.due_date} onChange={(e) => set('due_date', e.target.value)} className="input-field" />
              <input type="time" aria-label="Hora de la fecha límite" disabled={!form.due_date} value={form.due_time} onChange={(e) => set('due_time', e.target.value)} className="input-field !w-32 disabled:bg-google-bg" />
            </div>
          </div>
        </div>
      )}

      {!compacto && (
        <div className="px-5 py-4 border-t border-google-border flex items-center justify-between gap-3">
          <p className="text-xs text-google-gray hidden sm:block">Enter en el título para crear</p>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={!form.title.trim() || guardando} className="btn-primary disabled:opacity-40 flex items-center gap-1.5">
              {guardando && <Loader2 size={14} className="animate-spin" />} Crear tarea
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
