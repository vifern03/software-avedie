import { useState } from 'react';
import { AlertTriangle, Clock, Phone, RefreshCw, Calendar, Zap } from 'lucide-react';
import { useData } from '../context/DataContext';
import Pagination from '../components/Pagination';

const UrgencyBadge = ({ days }) => {
  if (days <= 0)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle size={11} /> Vencido
      </span>
    );
  if (days <= 7)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
        <AlertTriangle size={11} /> {days}d restantes
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">
      <Clock size={11} /> {days}d restantes
    </span>
  );
};

const ProgressBar = ({ days }) => {
  const pct   = Math.max(0, Math.min(100, (days / 30) * 100));
  const color = days <= 0 ? 'bg-red-600' : days <= 7 ? 'bg-red-500' : 'bg-orange-400';
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

const RADAR_PER_PAGE = 10;

export default function RadarRenovaciones() {
  const { clientes } = useData();
  const now = new Date();
  const [urgentesPage, setUrgentesPage] = useState(1);
  const [proximasPage, setProximasPage] = useState(1);

  const renovaciones = clientes
    .filter((c) => {
      const dateRef = c.fecha_formalizada || c.fecha_tramitacion;
      if (!dateRef) return false;
      const inicio = new Date(dateRef);
      const expiry = new Date(inicio);
      expiry.setFullYear(expiry.getFullYear() + 1);
      const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      return days <= 30;
    })
    .map((c) => {
      const dateRef = c.fecha_formalizada || c.fecha_tramitacion;
      const inicio  = new Date(dateRef);
      const expiry  = new Date(inicio);
      expiry.setFullYear(expiry.getFullYear() + 1);
      const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      return { ...c, fecha_vencimiento: expiry.toISOString().split('T')[0], dias_restantes: daysUntilExpiry };
    })
    .sort((a, b) => a.dias_restantes - b.dias_restantes);

  const urgentes = renovaciones.filter((r) => r.dias_restantes <= 7);
  const proximas = renovaciones.filter((r) => r.dias_restantes > 7 && r.dias_restantes <= 30);

  const urgentesTotalPages = Math.ceil(urgentes.length / RADAR_PER_PAGE);
  const proximasTotalPages = Math.ceil(proximas.length / RADAR_PER_PAGE);
  const paginatedUrgentes  = urgentes.slice((urgentesPage - 1) * RADAR_PER_PAGE, urgentesPage * RADAR_PER_PAGE);
  const paginatedProximas  = proximas.slice((proximasPage - 1) * RADAR_PER_PAGE, proximasPage * RADAR_PER_PAGE);

  const groups = [
    { label: '🔴 Urgente — menos de 7 días (o vencidos)', items: urgentes, paginated: paginatedUrgentes, totalPages: urgentesTotalPages, page: urgentesPage, setPage: setUrgentesPage, borderColor: 'border-red-300',    bgHeader: 'bg-red-50'    },
    { label: '🟠 Próximas — 8 a 30 días',                 items: proximas, paginated: paginatedProximas, totalPages: proximasTotalPages, page: proximasPage, setPage: setProximasPage, borderColor: 'border-orange-300', bgHeader: 'bg-orange-50' },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <RefreshCw size={22} className="text-google-blue" />
            Radar de Renovaciones
          </h1>
          <p className="text-sm text-google-gray mt-1">
            Contratos que vencen en menos de 30 días · {renovaciones.length} alertas activas
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium text-red-700">{urgentes.length} urgentes</span>
          </div>
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-xs font-medium text-orange-700">{proximas.length} próximas</span>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <div key={g.label} className={`card border ${g.borderColor} overflow-hidden`}>
            <div className={`px-5 py-3 ${g.bgHeader} border-b ${g.borderColor}`}>
              <p className="text-sm font-semibold text-google-dark">{g.label}</p>
            </div>
            <div className="divide-y divide-google-border">
              {g.paginated.map((r) => (
                <div key={r.id} className="px-5 py-4 hover:bg-google-bg transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-google-blue-light flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-google-blue">
                          {r.nombre.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-google-dark">{r.nombre}</p>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.tipo === 'B2B' ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                            {r.tipo}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-google-gray flex-wrap">
                          <span className="flex items-center gap-1"><Phone size={11} /> {r.telefono}</span>
                          <span className="flex items-center gap-1"><Zap size={11} /> {r.tarifa}</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={11} /> Ref.: {r.fecha_formalizada || r.fecha_tramitacion || '—'}
                          </span>
                          <span className="flex items-center gap-1 text-red-600 font-medium">
                            <Calendar size={11} /> Vence: {r.fecha_vencimiento}
                          </span>
                        </div>
                        <div className="mt-2">
                          <ProgressBar days={r.dias_restantes} />
                        </div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 text-right space-y-2">
                      <UrgencyBadge days={r.dias_restantes} />
                      <p className="text-xs text-google-gray">{r.comercial}</p>
                      <button className="text-xs text-google-blue hover:underline font-medium block ml-auto">
                        Contactar
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <Pagination currentPage={g.page} totalPages={g.totalPages} onPageChange={g.setPage} />
          </div>
        )
      )}

      {renovaciones.length === 0 && (
        <div className="card p-12 text-center">
          <RefreshCw size={36} className="text-google-gray mx-auto mb-3 opacity-40" />
          <p className="text-google-gray">No hay contratos próximos a vencer</p>
          <p className="text-xs text-google-gray mt-1">
            Los contratos aparecerán aquí cuando falten 30 días o menos para su vencimiento anual
          </p>
        </div>
      )}
    </div>
  );
}
