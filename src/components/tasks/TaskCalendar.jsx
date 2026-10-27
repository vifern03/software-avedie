import { useEffect, useMemo, useRef, useState } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import listPlugin from '@fullcalendar/list';
import interactionPlugin, { Draggable } from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import { CalendarClock, GripVertical, Inbox, Palette } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { ahoraMadridWallIso, posicionCalendario, horaCorta } from '../../lib/tasksFechas';
import { puedeMover, puedeVerEquipo } from '../../lib/tasksPermisos';
import { esActiva } from '../../lib/tasksLogica';
import { Avatar, useToast } from './ui';

/*
 * Zona horaria: FullCalendar trabaja en 'UTC' y le damos fechas "de pared" de Madrid
 * ('YYYY-MM-DDTHH:MM:00' sin zona). Así lo que se ve es siempre la hora de Madrid,
 * sea cual sea la zona del navegador, sin plugins extra. Al soltar/hacer clic, leemos
 * los componentes UTC del Date resultante = fecha/hora de Madrid.
 */
const pad = (n) => String(n).padStart(2, '0');
const fechaDe = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const horaDe = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;

const MQ_MOVIL = '(max-width: 639px)';
function useEsMovil() {
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia(MQ_MOVIL).matches);
  useEffect(() => {
    const mq = window.matchMedia(MQ_MOVIL);
    const h = (e) => setMovil(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return movil;
}

export default function TaskCalendar({ tareas, onOpen, onCrear }) {
  const { user, colorDe, nombreDe, acciones } = useTasks();
  const toast = useToast();
  const lateralRef = useRef(null);
  const calRef = useRef(null);
  const movil = useEsMovil();
  const [vista, setVista] = useState(movil ? 'listWeek' : 'dayGridMonth');

  // Cambiar de vista al cruzar el umbral móvil/escritorio.
  useEffect(() => {
    const api = calRef.current?.getApi();
    if (!api) return;
    if (movil && api.view.type === 'timeGridWeek') api.changeView('listWeek');
    if (!movil && api.view.type === 'listWeek') api.changeView('timeGridWeek');
  }, [movil]);

  // Al entrar en la vista semana (tras ajustar la altura), situarse en las 08:00.
  useEffect(() => {
    if (vista === 'timeGridWeek') requestAnimationFrame(() => calRef.current?.getApi().scrollToTime('08:00:00'));
  }, [vista]);

  const eventos = useMemo(() => tareas.flatMap((t) => {
    const pos = posicionCalendario(t);
    if (!pos) return [];
    const color = colorDe(t.assignee);
    const movible = puedeMover(user, t) && !t.archived_at;
    return [{
      id: t.id,
      title: t.title,
      start: pos.time ? `${pos.date}T${horaCorta(pos.time)}:00` : pos.date,
      allDay: !pos.time,
      backgroundColor: color,
      borderColor: color,
      editable: movible,
      durationEditable: false,
      classNames: [
        t.status === 'completed' ? 'tasks-ev-done' : '',
        pos.porDeadline ? 'tasks-ev-deadline' : '',
        movible ? '' : 'tasks-ev-locked',
      ].filter(Boolean),
      extendedProps: { porDeadline: pos.porDeadline, assignee: t.assignee },
    }];
  }), [tareas, colorDe, user?.username]); // eslint-disable-line react-hooks/exhaustive-deps

  const sinFecha = useMemo(
    () => tareas.filter((t) => esActiva(t) && !posicionCalendario(t)),
    [tareas],
  );

  // Leyenda de colores (admin/manager): personas con tareas en esta vista.
  const leyenda = useMemo(() => {
    if (!puedeVerEquipo(user)) return [];
    return [...new Set(tareas.map((t) => t.assignee))].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b)));
  }, [tareas, user?.role, nombreDe]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrastrar desde "Sin fecha" al calendario.
  useEffect(() => {
    if (!lateralRef.current) return undefined;
    const d = new Draggable(lateralRef.current, {
      itemSelector: '[data-movable="true"]',
      eventData: (el) => ({ title: el.dataset.title, create: true, extendedProps: { taskId: el.dataset.id } }),
    });
    return () => d.destroy();
  }, []);

  const mover = async (id, date, allDay, revert) => {
    try {
      await acciones.mover(id, fechaDe(date), allDay ? null : horaDe(date));
      toast('Tarea movida');
    } catch (e) {
      revert?.();
      toast(e.message, 'error');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0 bg-white border border-google-border rounded-xl shadow-sm p-2 sm:p-4 tasks-calendar">
        <FullCalendar
          ref={calRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          locale={esLocale}
          timeZone="UTC"
          now={() => ahoraMadridWallIso()}
          firstDay={1}
          initialView={vista}
          headerToolbar={movil
            ? { left: 'prev,next', center: 'title', right: 'dayGridMonth,listWeek' }
            : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek' }}
          buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', list: 'Agenda' }}
          height={vista === 'timeGridWeek' ? 680 : 'auto'}
          scrollTime="08:00:00"
          datesSet={(arg) => setVista(arg.view.type)}
          dayMaxEvents={movil ? 2 : 3}
          eventDisplay="block"
          nowIndicator
          allDayText="Todo el día"
          noEventsText="No hay tareas en estas fechas"
          slotEventOverlap={false}
          eventMaxStack={2}
          eventMinHeight={22}
          defaultTimedEventDuration="00:30"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          events={eventos}
          editable
          droppable
          eventStartEditable
          eventDurationEditable={false}
          eventClick={(info) => { info.jsEvent.preventDefault(); onOpen(info.event.id); }}
          dateClick={(info) => onCrear({ planned_date: fechaDe(info.date), planned_time: info.allDay ? '' : horaDe(info.date) })}
          eventDrop={(info) => mover(info.event.id, info.event.start, info.event.allDay, info.revert)}
          eventReceive={(info) => {
            const id = info.event.extendedProps.taskId;
            const { start, allDay } = info.event;
            info.event.remove();
            if (id) mover(id, start, allDay);
          }}
          eventContent={(arg) => {
            const porFechaLimite = arg.event.extendedProps.porDeadline;
            const tooltip = `${arg.event.title} · ${nombreDe(arg.event.extendedProps.assignee)}${porFechaLimite ? ' · (por fecha límite)' : ''}`;
            if (arg.view.type.startsWith('list')) {
              return (
                <span className="tasks-ev-list" title={tooltip}>
                  {porFechaLimite && <CalendarClock size={12} className="inline -mt-0.5 mr-1 text-google-gray" aria-label="Fecha límite" />}
                  {arg.event.title}
                  <span className="text-google-gray"> · {nombreDe(arg.event.extendedProps.assignee)}</span>
                </span>
              );
            }
            return (
              <div className="tasks-ev-inner" title={tooltip}>
                {porFechaLimite && <CalendarClock size={11} className="flex-shrink-0" />}
                {arg.timeText && <span className="tasks-ev-time">{arg.timeText}</span>}
                <span className="tasks-ev-title">{arg.event.title}</span>
              </div>
            );
          }}
        />
      </div>

      <div className="lg:w-64 flex-shrink-0 self-start w-full space-y-4">
        <aside className="bg-white border border-google-border rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-google-border">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-google-gray flex items-center gap-1.5"><Inbox size={12} /> Sin fecha · {sinFecha.length}</p>
            <p className="text-[11px] text-google-gray mt-0.5">Arrástralas al calendario para planificarlas.</p>
          </div>
          <ul ref={lateralRef} className="max-h-[420px] overflow-y-auto divide-y divide-google-border">
            {sinFecha.length === 0 && <li className="px-4 py-6 text-xs text-google-gray text-center">Todo tiene fecha.</li>}
            {sinFecha.map((t) => {
              const movible = puedeMover(user, t);
              return (
                <li
                  key={t.id}
                  data-id={t.id}
                  data-title={t.title}
                  data-movable={movible ? 'true' : 'false'}
                  role="button"
                  tabIndex={0}
                  title={movible ? 'Arrastra al calendario o pulsa para abrir' : 'Solo su creador puede planificarla'}
                  className={`flex items-center gap-2 px-3 py-2 text-sm hover:bg-google-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-google-blue ${movible ? 'cursor-grab' : 'cursor-pointer'}`}
                  onClick={() => onOpen(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(t.id); } }}
                >
                  {movible ? <GripVertical size={13} className="text-gray-300 flex-shrink-0" /> : <span className="w-[13px]" />}
                  <span className="flex-1 min-w-0 truncate text-google-dark">{t.title}</span>
                  <Avatar nombre={nombreDe(t.assignee)} color={colorDe(t.assignee)} size={18} />
                </li>
              );
            })}
          </ul>
        </aside>

        {leyenda.length > 0 && (
          <aside className="bg-white border border-google-border rounded-xl shadow-sm px-4 py-3" aria-label="Leyenda de colores">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-google-gray flex items-center gap-1.5 mb-2"><Palette size={12} /> Personas</p>
            <ul className="space-y-1.5">
              {leyenda.map((u) => (
                <li key={u} className="flex items-center gap-2 text-xs text-google-dark">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: colorDe(u) }} aria-hidden="true" />
                  <span className="truncate">{nombreDe(u)}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </div>
  );
}
