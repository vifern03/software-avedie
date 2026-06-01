import { useState, useEffect } from 'react';
import { History, UserPlus, Building2, RefreshCw, Edit, AlertTriangle, Trash2, CheckCircle, Store } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';

const typeConfig = {
  'Alta B2C':      { icon: UserPlus,      color: 'bg-blue-100 text-blue-700',     dot: 'bg-blue-500'    },
  'Alta B2B':      { icon: Building2,     color: 'bg-indigo-100 text-indigo-700', dot: 'bg-indigo-500'  },
  'Actualización': { icon: Edit,          color: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500'  },
  'Activación':    { icon: CheckCircle,   color: 'bg-green-100 text-green-700',   dot: 'bg-green-500'   },
  'Renovación':    { icon: RefreshCw,     color: 'bg-teal-100 text-teal-700',     dot: 'bg-teal-500'    },
  'Alerta':        { icon: AlertTriangle, color: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500'  },
  'Eliminación':   { icon: Trash2,        color: 'bg-red-100 text-red-700',       dot: 'bg-red-500'     },
  'Visita':        { icon: Store,         color: 'bg-cyan-100 text-cyan-700',     dot: 'bg-cyan-500'    },
};

const renderDesc = (text) => {
  if (!text) return <p className="text-sm text-google-dark">—</p>;

  try {
    const parsed = JSON.parse(text);
    if (parsed.type === 'structured') {
      return (
        <div>
          <p className="text-sm font-medium text-google-dark">{parsed.header}</p>
          {parsed.changes.length > 0 && (
            <ul className="mt-1.5 space-y-0.5">
              {parsed.changes.map((ch, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs">
                  <span className="text-google-blue flex-shrink-0 select-none">•</span>
                  <span className="text-google-gray">
                    <strong className="text-google-dark font-semibold">{ch.campo}</strong>
                    {': de '}
                    <span className={!ch.de ? 'italic text-google-gray' : ''}>{ch.de || 'Vacío'}</span>
                    {' ➔ '}
                    <span className={ch.a ? 'font-medium text-google-dark' : 'italic text-google-gray'}>{ch.a || 'Vacío'}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
  } catch {}

  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <p className="text-sm text-google-dark">
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={i}>{part.slice(2, -2)}</strong>
          : part
      )}
    </p>
  );
};

export default function HistorialActividades() {
  const { actividades, clearActividades } = useData();
  const { users } = useAuth();

  const [filterUser, setFilterUser] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Resetea a página 1 cuando cambia cualquier filtro
  useEffect(() => { setCurrentPage(1); }, [filterUser, filterDate, filterTipo]);

  // ── 1. Filtrado
  const filteredActivities = actividades.filter((a) => {
    if (filterUser && a.comercial !== filterUser) return false;
    if (filterDate && a.fecha !== filterDate) return false;
    if (filterTipo && a.tipo !== filterTipo) return false;
    return true;
  });

  // ── 2. Paginación por slice
  const totalPages        = Math.ceil(filteredActivities.length / itemsPerPage);
  const indexOfLastItem   = currentPage * itemsPerPage;
  const indexOfFirstItem  = indexOfLastItem - itemsPerPage;
  const currentActivities = filteredActivities.slice(indexOfFirstItem, indexOfLastItem);

  // ── 3. Agrupar SOLO la página actual por fecha para la timeline
  const groupedByDate = currentActivities.reduce((acc, a) => {
    if (!acc[a.fecha]) acc[a.fecha] = [];
    acc[a.fecha].push(a);
    return acc;
  }, {});
  const sortedDates = Object.keys(groupedByDate).sort((a, b) => (a < b ? 1 : -1));

  const formatDate = (dateStr) => {
    const d     = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Hoy';
    if (diff === 1) return 'Ayer';
    return d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  };

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-4xl">

      {/* Header */}
      <div className="space-y-3">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <History size={22} className="text-google-blue" />
            Historial de Actividades
          </h1>
          <p className="text-sm text-google-gray mt-1">Registro de todas las acciones del equipo comercial</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="input-field h-9 text-xs w-44"
          >
            <option value="">Todos los usuarios</option>
            {users.map((u) => (
              <option key={u.username} value={u.username}>{u.displayName || u.username}</option>
            ))}
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="input-field h-9 text-xs w-36"
          />
          <select
            value={filterTipo}
            onChange={(e) => setFilterTipo(e.target.value)}
            className="input-field h-9 text-xs w-44"
          >
            <option value="">Todas las acciones</option>
            <option value="Alta B2C">Alta B2C</option>
            <option value="Alta B2B">Alta B2B</option>
            <option value="Actualización">Actualización</option>
            <option value="Activación">Activación</option>
            <option value="Eliminación">Eliminación</option>
            <option value="Visita">Visita</option>
          </select>
          <button
            onClick={() => clearActividades()}
            className="btn-secondary flex items-center gap-2 !text-red-600 !border-red-200 hover:!bg-red-50 hover:!border-red-300"
          >
            <Trash2 size={14} />
            <span>Borrar Historial</span>
          </button>
        </div>
      </div>

      {/* Timeline — solo itera sobre la página actual */}
      {sortedDates.map((date) => (
        <div key={date}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-google-border" />
            <span className="text-xs font-semibold text-google-gray uppercase tracking-wider px-3">
              {formatDate(date)}
            </span>
            <div className="h-px flex-1 bg-google-border" />
          </div>

          <div className="space-y-2">
            {groupedByDate[date].map((a) => {
              const cfg  = typeConfig[a.tipo] || { icon: History, color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' };
              const Icon = cfg.icon;
              return (
                <div key={a.id} className="card p-4 flex items-start gap-4 hover:shadow-google transition-shadow">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.color}`}>
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.color}`}>{a.tipo}</span>
                      <span className="text-xs text-google-gray">{a.hora}</span>
                    </div>
                    {renderDesc(a.descripcion)}
                    <p className="text-xs text-google-gray mt-1">Por <span className="font-medium">{a.comercial}</span></p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Estado vacío */}
      {filteredActivities.length === 0 && (
        <div className="card p-12 text-center">
          <History size={36} className="text-google-gray mx-auto mb-3 opacity-40" />
          <p className="text-google-gray">No hay actividades registradas</p>
          <p className="text-xs text-google-gray mt-1">Las acciones del equipo aparecerán aquí automáticamente</p>
        </div>
      )}

      {/* ── Paginación — fuera del contenedor de scroll, siempre visible al pie */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 py-4 border-t border-google-border">
          <button
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-google-border bg-white text-google-gray hover:bg-google-bg hover:border-google-blue hover:text-google-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-sm text-gray-600">
            Página {currentPage} de {totalPages || 1}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-google-border bg-white text-google-gray hover:bg-google-bg hover:border-google-blue hover:text-google-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      )}

    </div>
  );
}
