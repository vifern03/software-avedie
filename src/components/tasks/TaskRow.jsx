import { memo, useState } from 'react';
import { Archive, Check, CalendarDays, Loader, MessageSquare } from 'lucide-react';
import { Avatar, DeadlineChip, PrioridadChip } from './ui';
import { puedeCambiarEstado } from '../../lib/tasksPermisos';
import { fechaCorta, horaCorta } from '../../lib/tasksFechas';

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

function TaskRow({ task, user, ahora, colorDe, nombreDe, comentarios, onOpen, onToggle, seleccionada }) {
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
        <p className={`text-sm leading-snug break-words ${completada ? 'line-through text-google-gray' : 'text-google-dark'}`}>
          {task.title}
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
          {task.created_by !== yo && (
            <span className="text-[11px] text-google-gray">de {nombreDe(task.created_by)}</span>
          )}
          {comentarios > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-google-gray" title={`${comentarios} comentario(s)`}>
              <MessageSquare size={11} /> {comentarios}
            </span>
          )}
          {task.archived_at && (
            <span className="inline-flex items-center gap-1 text-[11px] text-google-gray"><Archive size={11} /> Archivada</span>
          )}
        </div>
      </div>

      {task.assignee !== yo && (
        <div className="flex items-center gap-2 pt-0.5">
          <span className="hidden sm:inline text-xs text-google-gray truncate max-w-[110px]">{nombreDe(task.assignee)}</span>
          <Avatar nombre={nombreDe(task.assignee)} color={colorDe(task.assignee)} size={24} title={`Responsable: ${nombreDe(task.assignee)}`} />
        </div>
      )}
    </div>
  );
}

export default memo(TaskRow);
