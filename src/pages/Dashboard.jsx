import { UserCheck, Users, FileCheck, Clock, PenTool, Building2, BarChart2, Activity } from 'lucide-react';
import { useData } from '../context/DataContext';

const AltasMesCard = ({ icon: Icon, label, value, color }) => (
  <div className="card p-6 flex items-center gap-5">
    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon size={26} className="text-white" />
    </div>
    <div>
      <p className="text-5xl font-bold text-google-dark tabular-nums leading-none">{value}</p>
      <p className="text-sm text-google-gray mt-2">{label}</p>
    </div>
  </div>
);

const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="card p-5 flex items-start gap-4">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
      <Icon size={20} className="text-white" />
    </div>
    <div>
      <p className="text-2xl font-semibold text-google-dark">{value}</p>
      <p className="text-sm text-google-gray mt-0.5">{label}</p>
    </div>
  </div>
);

const typeColors = {
  'Alta B2C':      'bg-blue-100 text-blue-700',
  'Alta B2B':      'bg-indigo-100 text-indigo-700',
  'Actualización': 'bg-purple-100 text-purple-700',
  'Activación':    'bg-green-100 text-green-700',
  'Renovación':    'bg-teal-100 text-teal-700',
  'Alerta':        'bg-orange-100 text-orange-700',
  'Eliminación':   'bg-red-100 text-red-700',
};

export default function Dashboard({ onNavigate }) {
  const { clientes, clientesB2C, clientesB2B, actividades, rankingComerciales } = useData();

  const now = new Date();
  const mesActual = (() => { const m = now.toLocaleString('es-ES', { month: 'long' }); return m.charAt(0).toUpperCase() + m.slice(1); })();

  const altasMesB2C = clientesB2C.filter((c) => {
    const d = new Date(c.fecha_tramitacion || '');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const altasMesB2B = clientesB2B.filter((c) => {
    const d = new Date(c.fecha_tramitacion || '');
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const totalContratos    = clientes.length;
  const formalizados      = clientes.filter((c) => c.estado === 'Formalizado').length;
  const tramitados        = clientes.filter((c) => c.estado === 'Tramitado').length;
  const pendientesFirma   = clientes.filter((c) => c.estado === 'Pendiente Firma').length;

  const maxCerrados = Math.max(1, ...rankingComerciales.map((c) => c.cerrados));

  return (
    <div className="p-3 md:p-6 space-y-4 md:space-y-6 max-w-7xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark">Dashboard General</h1>
          <p className="text-sm text-google-gray mt-1">
            Resumen ejecutivo del punto de venta ·{' '}
            {now.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-full px-3 py-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-medium text-green-700">Sistema operativo</span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={FileCheck} label="Total Contratos"   value={totalContratos}  color="bg-google-blue" />
        <StatCard icon={Users}     label="Formalizados"      value={formalizados}    color="bg-green-500"   />
        <StatCard icon={Clock}     label="Tramitados"        value={tramitados}      color="bg-orange-500"  />
        <StatCard icon={PenTool}   label="Pendientes Firma"  value={pendientesFirma} color="bg-red-500"     />
        <AltasMesCard icon={UserCheck} label="Altas del Mes B2C" value={altasMesB2C} color="bg-blue-500"   />
        <AltasMesCard icon={Building2} label="Altas del Mes B2B" value={altasMesB2B} color="bg-indigo-500" />
      </div>

      {/* Two-column: ranking + activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Commercial ranking */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-google-border flex items-center gap-2">
            <BarChart2 size={16} className="text-google-blue" />
            <h2 className="text-sm font-semibold text-google-dark">Ranking Ventas {mesActual}</h2>
          </div>
          <div className="divide-y divide-google-border">
            {rankingComerciales.map((c, i) => (
              <div key={c.id} className="px-5 py-3 flex items-center gap-4 hover:bg-google-bg transition-colors">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-yellow-400 text-white'
                  : i === 1 ? 'bg-gray-300 text-gray-700'
                  : i === 2 ? 'bg-amber-600 text-white'
                  : 'bg-google-bg text-google-gray'
                }`}>
                  {i + 1}
                </span>
                <div className="w-8 h-8 rounded-full bg-google-blue flex items-center justify-center text-white text-xs font-semibold">
                  {c.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-google-dark truncate">{c.nombre}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <div
                      className="h-1.5 rounded-full bg-google-blue transition-all"
                      style={{ width: `${(c.cerrados / maxCerrados) * 100}%`, minWidth: 4 }}
                    />
                    <span className="text-xs text-google-gray">{c.cerrados} cerrados</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-google-dark">{c.cerrados}</p>
                  <p className="text-xs text-yellow-600">{c.pendientes} pend.</p>
                </div>
              </div>
            ))}
            {rankingComerciales.length === 0 && (
              <p className="text-center text-google-gray py-8 text-sm">Sin contratos registrados</p>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-google-border flex items-center gap-2">
            <Activity size={16} className="text-google-blue" />
            <h2 className="text-sm font-semibold text-google-dark">Actividad Reciente</h2>
          </div>
          <div className="divide-y divide-google-border">
            {actividades.slice(0, 8).map((a) => {
              let header = a.descripcion;
              let changes = null;
              try {
                const parsed = JSON.parse(a.descripcion);
                if (parsed?.type === 'structured') {
                  header  = parsed.header;
                  changes = parsed.changes;
                }
              } catch {}

              return (
                <div key={a.id} className="px-5 py-3 hover:bg-google-bg transition-colors">
                  <div className="flex items-start gap-3">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-0.5 whitespace-nowrap ${typeColors[a.tipo] || 'bg-gray-100 text-gray-600'}`}>
                      {a.tipo}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-google-dark">{header}</p>
                      {changes && changes.length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {changes.map((ch, i) => (
                            <li key={i} className="text-xs text-google-gray">
                              <span className="text-google-blue">•</span>{' '}
                              <strong className="text-google-dark">{ch.campo}</strong>: de{' '}
                              <span className={!ch.de ? 'italic' : ''}>{ch.de || 'Vacío'}</span>
                              {' ➔ '}
                              <span className={ch.a ? 'font-medium text-google-dark' : 'italic'}>{ch.a || 'Vacío'}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="text-xs text-google-gray mt-0.5">{a.hora}</p>
                    </div>
                  </div>
                </div>
              );
            })}
            {actividades.length === 0 && (
              <p className="text-center text-google-gray py-8 text-sm">Sin actividades recientes</p>
            )}
          </div>
          <button
            onClick={() => onNavigate?.('historial')}
            className="w-full block text-center py-3 text-sm text-google-blue font-medium hover:bg-google-bg transition-colors border-t border-google-border"
          >
            Ver todo el historial →
          </button>
        </div>
      </div>
    </div>
  );
}
