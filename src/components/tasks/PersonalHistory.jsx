import { useEffect, useMemo, useState } from 'react';
import { History } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { describirEvento, enSegundaPersona } from '../../lib/tasksLogica';
import { fechaHora, haceCuanto } from '../../lib/tasksFechas';
import { Modal } from './ui';

/** Historial personal: lo que he hecho en Tasks (últimos 150 eventos). */
export default function PersonalHistory({ onClose, onOpenTask }) {
  const { acciones, tareas, nombreDe, ahora } = useTasks();
  const [eventos, setEventos] = useState(null);
  const [error, setError] = useState('');
  const titulos = useMemo(() => Object.fromEntries(tareas.map((t) => [t.id, t.title])), [tareas]);

  useEffect(() => {
    acciones.cargarHistorialPersonal().then(setEventos).catch((e) => { setError(e.message); setEventos([]); });
  }, [acciones]);

  return (
    <Modal titulo="Mi historial" icono={History} onClose={onClose} ancho="max-w-xl">
      <div className="max-h-[65vh] overflow-y-auto px-5 py-4">
        {eventos === null && <div className="space-y-3 animate-pulse">{[0, 1, 2, 3].map((i) => <div key={i} className="h-3 bg-gray-100 rounded w-4/5" />)}</div>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        {eventos && !error && eventos.length === 0 && <p className="text-sm text-google-gray">Todavía no hay actividad tuya en Tasks.</p>}
        {eventos && eventos.length > 0 && (
          <ol className="space-y-2.5">
            {eventos.map((ev) => {
              const titulo = titulos[ev.task_id];
              return (
                <li key={ev.id} className="text-sm">
                  <p className="text-google-dark">
                    {enSegundaPersona(describirEvento(ev, (u) => (u === ev.actor ? 'Tú' : nombreDe(u)), ahora))}
                    {ev.type === 'commented' && ev.payload?.comment && <span className="text-google-gray">: «{String(ev.payload.comment).slice(0, 120)}»</span>}
                  </p>
                  <p className="text-xs text-google-gray">
                    {titulo
                      ? <button type="button" className="text-google-blue hover:underline" onClick={() => { onOpenTask(ev.task_id); onClose(); }}>{titulo}</button>
                      : <span>(tarea ya no visible)</span>}
                    {' · '}<time title={fechaHora(ev.created_at)}>{haceCuanto(ev.created_at, ahora)}</time>
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </Modal>
  );
}
