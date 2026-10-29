import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { agruparPorFecha } from '../../lib/tasksLogica';
import TaskRow from './TaskRow';

const COLOR_GRUPO = { vencidas: 'text-red-600', hoy: 'text-google-blue' };

export default function TaskList({ tareas, user, ahora, colorDe, nombreDe, comentarios, onOpen, onToggle, onDelete, seleccionada }) {
  const grupos = useMemo(() => agruparPorFecha(tareas, ahora), [tareas, ahora]);
  const [plegados, setPlegados] = useState({});

  return (
    <div className="space-y-4">
      {grupos.map((g) => {
        const plegado = !!plegados[g.key];
        return (
          <section key={g.key} aria-label={g.label}>
            <button
              type="button"
              onClick={() => setPlegados((p) => ({ ...p, [g.key]: !plegado }))}
              className="flex items-center gap-1.5 mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-google-gray hover:text-google-dark"
              aria-expanded={!plegado}
            >
              {plegado ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              <span className={COLOR_GRUPO[g.key] || ''}>{g.label}</span>
              <span className="font-normal normal-case tracking-normal">· {g.tasks.length}</span>
            </button>
            {!plegado && (
              <div className="bg-white border border-google-border rounded-xl shadow-sm divide-y divide-google-border overflow-hidden">
                {g.tasks.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    user={user}
                    ahora={ahora}
                    colorDe={colorDe}
                    nombreDe={nombreDe}
                    comentarios={comentarios[t.id] || 0}
                    onOpen={onOpen}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    seleccionada={seleccionada === t.id}
                  />
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
