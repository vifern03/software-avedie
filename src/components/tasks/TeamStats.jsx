import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, Palette, RotateCcw, Users } from 'lucide-react';
import { useTasks } from '../../context/TasksContext';
import { estadisticasEquipo } from '../../lib/tasksLogica';
import { NOMBRES_COLOR, PALETA, colorAutomatico } from '../../lib/tasksColores';
import { puedeCambiarColor } from '../../lib/tasksPermisos';
import { Avatar, EstadoVacio, useToast } from './ui';

function SelectorColor({ nombre, actual, personalizado, onElegir }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const h = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setAbierto(false); } };
    document.addEventListener('mousedown', h);
    ref.current?.addEventListener('keydown', k);
    const el = ref.current;
    return () => { document.removeEventListener('mousedown', h); el?.removeEventListener('keydown', k); };
  }, [abierto]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setAbierto((v) => !v); }}
        className="p-1.5 rounded-md text-google-gray hover:bg-google-bg hover:text-google-dark"
        aria-label={`Cambiar color de ${nombre}`}
        title="Cambiar color"
      >
        <Palette size={15} />
      </button>
      {abierto && (
        <div className="absolute right-0 z-30 mt-1 p-3 bg-white border border-google-border rounded-lg shadow-google w-[188px]" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-6 gap-1.5">
            {PALETA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onElegir(c); setAbierto(false); }}
                className="w-6 h-6 rounded-full flex items-center justify-center ring-offset-1 hover:ring-2 hover:ring-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-google-blue"
                style={{ background: c }}
                aria-label={`${NOMBRES_COLOR[c] || c}${actual === c ? ' (actual)' : ''}`}
                title={NOMBRES_COLOR[c] || c}
              >
                {actual === c && <Check size={13} className="text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
          {personalizado && (
            <button type="button" onClick={() => { onElegir(null); setAbierto(false); }} className="mt-2.5 w-full text-xs text-google-gray hover:text-google-blue flex items-center justify-center gap-1">
              <RotateCcw size={12} /> Volver al automático
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamStats({ onVerTrabajador }) {
  const { tareas, usuarios, user, ahora, colorDe, nombreDe, prefs, acciones } = useTasks();
  const toast = useToast();
  const filas = useMemo(() => estadisticasEquipo(tareas, usuarios, user, ahora), [tareas, usuarios, user?.username, ahora]); // eslint-disable-line react-hooks/exhaustive-deps
  const admin = puedeCambiarColor(user);

  const totales = filas.reduce((a, f) => ({
    activas: a.activas + f.activas, vencidas: a.vencidas + f.vencidas, c7: a.c7 + f.completadas7, c30: a.c30 + f.completadas30,
  }), { activas: 0, vencidas: 0, c7: 0, c30: 0 });

  const elegirColor = async (u, c) => {
    try { await acciones.setColor(u, c); toast(c ? 'Color actualizado' : 'Color automático restaurado'); }
    catch (e) { toast(e.message, 'error'); }
  };

  if (!filas.length) {
    return <EstadoVacio icono={Users} titulo="Aún no hay datos de equipo" texto={user.role === 'manager' ? 'Aquí verás el avance de las tareas que asignes a tu equipo.' : 'Cuando haya tareas aparecerán aquí.'} />;
  }

  const kpis = [
    { label: 'Activas', valor: totales.activas, cls: 'text-google-dark' },
    { label: 'Vencidas', valor: totales.vencidas, cls: totales.vencidas ? 'text-red-600' : 'text-google-dark' },
    { label: 'Completadas 7 días', valor: totales.c7, cls: totales.c7 ? 'text-green-700' : 'text-google-dark' },
    { label: 'Completadas 30 días', valor: totales.c30, cls: totales.c30 ? 'text-green-700' : 'text-google-dark' },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-google-gray">
        {user.role === 'admin' ? 'Todas las tareas no archivadas, por responsable.' : 'Solo las tareas que has creado tú, por responsable.'}
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="bg-white border border-google-border rounded-xl shadow-sm px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-google-gray">{k.label}</p>
            <p className={`text-2xl font-semibold mt-1 tabular-nums ${k.cls}`}>{k.valor}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-google-border rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Trabajador</th>
              <th className="table-header text-right">Activas</th>
              <th className="table-header text-right">Vencidas</th>
              <th className="table-header text-right">Completadas 7 días</th>
              <th className="table-header text-right hidden sm:table-cell">Completadas 30 días</th>
              {admin && <th className="table-header w-10"><span className="sr-only">Color</span></th>}
              <th className="table-header w-8"><span className="sr-only">Ver tareas</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.username}
                tabIndex={0}
                aria-label={`Ver las tareas de ${nombreDe(f.username)}`}
                className="hover:bg-google-bg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-google-blue"
                onClick={() => onVerTrabajador?.(f.username)}
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); onVerTrabajador?.(f.username); } }}
                title="Ver sus tareas en la lista"
              >
                <td className="table-cell">
                  <div className="flex items-center gap-2.5">
                    <Avatar nombre={nombreDe(f.username)} color={colorDe(f.username)} size={26} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-google-dark truncate">{nombreDe(f.username)}</p>
                      <p className="hidden sm:block text-[11px] text-google-gray">{f.username}</p>
                    </div>
                  </div>
                </td>
                <td className="table-cell text-right tabular-nums">{f.activas}</td>
                <td className={`table-cell text-right tabular-nums ${f.vencidas ? 'text-red-600 font-semibold' : 'text-google-gray'}`}>{f.vencidas}</td>
                <td className="table-cell text-right tabular-nums">{f.completadas7}</td>
                <td className="table-cell text-right tabular-nums hidden sm:table-cell">{f.completadas30}</td>
                {admin && (
                  <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                    <SelectorColor
                      nombre={nombreDe(f.username)}
                      actual={colorDe(f.username)}
                      personalizado={!!prefs[f.username] && prefs[f.username] !== colorAutomatico(f.username)}
                      onElegir={(c) => elegirColor(f.username, c)}
                    />
                  </td>
                )}
                <td className="table-cell !px-2 text-google-gray"><ChevronRight size={16} aria-hidden="true" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
