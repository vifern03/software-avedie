import { memo, useState } from 'react';
import { Archive, Check, CalendarDays, Loader, MessageSquare, Pencil, Trash2, Users } from 'lucide-react';
import { Avatar, DeadlineChip, PrioridadChip } from './ui';
import { puedeCambiarEstado, puedeBorrar, esCompartida } from '../../lib/tasksPermisos';
import { fechaCorta, horaCorta } from '../../lib/tasksFechas';
import { responsablesDe } from '../../lib/tasksLogica';

/** Checkbox redondo para completar / reabrir, con animación sutil. */
export function CheckCompletar({ task, user, onToggle, size = 20 }) {
  const [animando, setAnimando] = useState(false);
  const completada = task.status === 'completed';
  const puede = puedeCambiarEstado(user, task) && !task.archived_at;
  const marcado = completada || animando;

  const click = (e) => {
    e.stopPropagation();
    if (!puede || animando) return;
    if (completada) { onToggle(task, 'pending'); return; }
    setAnimando(true);
    setTimeout(() => { onToggle(task, 'completed'); setAnimando(false); }, 380);
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={!puede}
      aria-label={completada ? `Reabrir «${task.title}»` : `Completar «${task.title}»`}
      aria-pressed={completada}
      title={!puede ? 'No puedes cambiar el estado de esta tarea' : completada ? 'Reabrir' : 'Marcar como completada'}
      className={`tasks-check flex-shrink-0 rounded-full border-2 flex items-center justify-center transition-all duration-200
        focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue focus-visible:ring-offset-1
        ${marcado ? 'bg-google-blue border-google-blue' : 'border-gray-400 hover:border-google-blue hover:bg-google-blue-light'}
        ${animando ? 'tasks-check-pop' : ''} disabled:opacity-40 disabled:cursor-not-allowed`}
      style={{ width: size, height: size }}
    >
      <Check size={size - 8} strokeWidth={3} className={`text-white transition-opacity duration-150 ${marcado ? 'opacity-100' : 'opacity-0'}`} />
    </button>
  );
}

function TaskRow({ task, user, ahora, colorDe, nombreDe, comentarios, onOpen, onToggle, onDelete, seleccionada }) {
  const completada = task.status === 'completed';
  const yo = user.username;
  const plan = task.planned_date ? `${fechaCorta(task.planned_date, ahora)}${task.planned_time ? ` ${horaCorta(task.planned_time)}` : ''}` : '';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(task.id); } }}
      className={`group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-google-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-google-blue
        ${seleccionada ? 'bg-google-blue-light/40' : ''}`}
    >
      <div className="pt-0.5"><CheckCompletar task={task} user={user} onToggle={onToggle} /></div>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className={`text-sm leading-snug break-words min-w-0 ${completada ? 'line-through text-google-gray' : 'text-google-dark'}`}>
            {task.title}
          </p>
          {/* Siempre visible en móvil; en escritorio al pasar el ratón */}
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-google-blue bg-blue-50 text-[11px] font-medium text-google-blue leading-none md:opacity-0 md:group-hover:opacity-100 md:group-focus-visible:opacity-100 transition-opacity">
            <Pencil size={10} /> Pincha para editar
          </span>
        </div>
        <p className="text-[13px] text-google-gray mt-1">
          Creado por <span className="font-semibold text-google-dark">{nombreDe(task.created_by)}{task.created_by === yo ? ' (tú)' : ''}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {task.status === 'in_progress' && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[11px] font-medium text-google-blue leading-none">
              <Loader size={10} /> En curso
            </span>
          )}
          <PrioridadChip prioridad={task.priority} />
          {!completada && <DeadlineChip task={task} ahora={ahora} />}
          {plan && (
            <span className="inline-flex items-center gap-1 text-[11px] text-google-gray" title="Fecha planificada">
              <CalendarDays size={11} /> Plan. {plan}
            </span>
          )}
          {comentarios > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-google-gray" title={`${comentarios} comentario(s)`}>
              <MessageSquare size={11} /> {comentarios}
            </span>
          )}
          {task.archived_at && (
            <span className="inline-flex items-center gap-1 text-[11px] text-google-gray"><Archive size={11} /> Archivada</span>
          )}
          {task.assignee !== yo && esCompartida(user, task) && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 border border-purple-200 text-[11px] font-medium text-purple-700 leading-none" title="Te la han compartido: puedes cambiar su estado y comentar">
              <Users size={10} /> Compartida
            </span>
          )}
        </div>
      </div>

      {/* Responsables (principal primero), uno debajo de otro y centrados */}
      <div className="self-center flex flex-col items-center gap-1">
        {responsablesDe(task).map((u, i) => (
          <div key={u} className="flex items-center gap-2">
            <span className="hidden sm:inline text-xs text-google-gray truncate max-w-[110px]">{nombreDe(u)}{u === yo ? ' (tú)' : ''}</span>
            <Avatar nombre={nombreDe(u)} color={colorDe(u)} size={24} title={`${i === 0 ? 'Responsable principal' : 'Responsable'}: ${nombreDe(u)}`} />
          </div>
        ))}
      </div>

      {onDelete && puedeBorrar(user, task) && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(task); }}
          onKeyDown={(e) => e.stopPropagation()}
          className="flex-shrink-0 self-center p-1.5 rounded-md text-google-gray hover:text-red-600 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
          title="Borrar tarea"
          aria-label={`Borrar «${task.title}»`}
        >
          <Trash2 size={15} />
        </button>
      )}
    </div>
  );
}

export default memo(TaskRow);
