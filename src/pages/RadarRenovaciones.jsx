import { useState, useRef } from 'react';
import { AlertTriangle, Clock, Phone, RefreshCw, Calendar, Zap, CheckCircle, X } from 'lucide-react';
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

const todayStr = () => new Date().toISOString().split('T')[0];

const calcVencimiento = (refDate) => {
  if (!refDate) return '';
  const d = new Date(refDate + 'T12:00:00');
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

function RenovacionModal({ contrato, onClose, onConfirm }) {
  const hoy = todayStr();
  const [nuevaRef,   setNuevaRef]   = useState(hoy);
  const [nuevaVenc,  setNuevaVenc]  = useState(calcVencimiento(hoy));
  const [confirmado, setConfirmado] = useState(false);
  const submittingRef = useRef(false);

  const handleRefChange = (val) => {
    setNuevaRef(val);
    setNuevaVenc(calcVencimiento(val));
  };

  const handleConfirm = () => {
    if (submittingRef.current || !nuevaRef) return;
    submittingRef.current = true;
    setConfirmado(true);
    setTimeout(() => {
      onConfirm(contrato.id, nuevaRef, nuevaVenc);
      submittingRef.current = false;
      onClose();
    }, 900);
  };

  const filasDatos = [
    ['Cliente',   contrato.nombre],
    ['CUPS',      contrato.cups       || '—'],
    ['Tipo',      contrato.tipo],
    ['Tarifa',    contrato.tarifa     || '—'],
    ['Teléfono',  contrato.telefono   || '—'],
    ['Comercial', contrato.comercial  || '—'],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-2xl shadow-google w-full max-w-md mx-4 flex flex-col max-h-[92vh] overflow-hidden">

        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-google-border flex-shrink-0 bg-blue-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-google-blue">
              <RefreshCw size={16} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-google-dark">Confirmar Renovación</h2>
              <p className="text-xs text-google-gray">Revisa los datos y confirma las nuevas fechas</p>
            </div>
          </div>
          <button onClick={onClose} className="text-google-gray hover:text-google-dark transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">

          {/* Datos del contrato (solo lectura) */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-google-gray uppercase tracking-wide mb-3">Datos del contrato</p>
            <div className="space-y-1.5">
              {filasDatos.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 text-xs">
                  <span className="text-google-gray flex-shrink-0">{label}</span>
                  <span className="font-medium text-google-dark text-right truncate">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Nueva fecha de referencia */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
            <label className="block text-xs font-semibold text-blue-700 mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} /> Nueva Fecha de Referencia *
            </label>
            <input
              type="date"
              value={nuevaRef}
              onChange={(e) => handleRefChange(e.target.value)}
              className="input-field bg-white !border-blue-200 w-full"
            />
            <p className="text-xs text-blue-500 mt-1.5">Por defecto: hoy. Modifica si la fecha real de renovación es otra.</p>
          </div>

          {/* Nueva fecha de vencimiento (auto-calculada) */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
            <label className="block text-xs font-semibold text-green-700 mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} /> Nueva Fecha de Vencimiento (automática)
            </label>
            <input
              type="date"
              value={nuevaVenc}
              readOnly
              className="input-field bg-white !border-green-200 w-full cursor-not-allowed opacity-75"
            />
            <p className="text-xs text-green-600 mt-1.5">= Fecha de referencia + 1 año</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-google-border flex items-center justify-end gap-3 flex-shrink-0">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={confirmado}>
            Cancelar
          </button>
          <button
            type="button"
            disabled={confirmado || !nuevaRef}
            onClick={handleConfirm}
            className={`btn-primary flex items-center gap-2 ${confirmado ? '!bg-green-500 !border-green-500 hover:!bg-green-500' : ''}`}
          >
            {confirmado
              ? <><CheckCircle size={15} /><span>Renovado ✓</span></>
              : <><RefreshCw size={15} /><span>Confirmar Renovación</span></>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

const RADAR_PER_PAGE = 10;

export default function RadarRenovaciones() {
  const { clientes, renovarContrato } = useData();
  const now = new Date();
  const currentYearMonth = now.toISOString().slice(0, 7);

  const [urgentesPage,   setUrgentesPage]   = useState(1);
  const [proximasPage,   setProximasPage]   = useState(1);
  const [renovadosPage,  setRenovadosPage]  = useState(1);
  const [selectedContrato, setSelectedContrato] = useState(null);

  // Contratos dentro de 30 días, excluyendo los renovados este mes
  const alertasBase = clientes
    .filter((c) => {
      const dateRef = c.fecha_formalizada || c.fecha_tramitacion;
      if (!dateRef) return false;
      const inicio = new Date(dateRef);
      const expiry = new Date(inicio);
      expiry.setFullYear(expiry.getFullYear() + 1);
      const days = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
      if (days > 30) return false;
      // Excluir si fue renovado este mes calendario
      if (c.renovado && c.fecha_renovacion?.startsWith(currentYearMonth)) return false;
      return true;
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

  const urgentes = alertasBase.filter((r) => r.dias_restantes <= 7);
  const proximas  = alertasBase.filter((r) => r.dias_restantes > 7 && r.dias_restantes <= 30);

  // Contratos renovados durante el mes actual
  const renovadosEsteMes = clientes
    .filter((c) => c.renovado && c.fecha_renovacion?.startsWith(currentYearMonth))
    .sort((a, b) => (b.fecha_renovacion || '').localeCompare(a.fecha_renovacion || ''));

  const urgentesTotalPages  = Math.ceil(urgentes.length / RADAR_PER_PAGE);
  const proximasTotalPages  = Math.ceil(proximas.length / RADAR_PER_PAGE);
  const renovadosTotalPages = Math.ceil(renovadosEsteMes.length / RADAR_PER_PAGE);

  const paginatedUrgentes  = urgentes.slice((urgentesPage - 1) * RADAR_PER_PAGE, urgentesPage * RADAR_PER_PAGE);
  const paginatedProximas  = proximas.slice((proximasPage - 1) * RADAR_PER_PAGE, proximasPage * RADAR_PER_PAGE);
  const paginatedRenovados = renovadosEsteMes.slice((renovadosPage - 1) * RADAR_PER_PAGE, renovadosPage * RADAR_PER_PAGE);

  const alertasActivas = urgentes.length + proximas.length;

  const groups = [
    {
      label: '🔴 Urgente — menos de 7 días (o vencidos)',
      items: urgentes, paginated: paginatedUrgentes, totalPages: urgentesTotalPages,
      page: urgentesPage, setPage: setUrgentesPage,
      borderColor: 'border-red-300', bgHeader: 'bg-red-50',
    },
    {
      label: '🟠 Próximas — 8 a 30 días',
      items: proximas, paginated: paginatedProximas, totalPages: proximasTotalPages,
      page: proximasPage, setPage: setProximasPage,
      borderColor: 'border-orange-300', bgHeader: 'bg-orange-50',
    },
  ];

  const handleRenovar = (id, nuevaRef, nuevaVenc) => {
    renovarContrato(id, nuevaRef, nuevaVenc);
  };

  const getInitials = (nombre = '') =>
    nombre.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('');

  return (
    <div className="p-6 space-y-6 max-w-5xl">

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
            <RefreshCw size={22} className="text-google-blue" />
            Radar de Renovaciones
          </h1>
          <p className="text-sm text-google-gray mt-1">
            Contratos que vencen en menos de 30 días · {alertasActivas} alertas activas
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-medium text-red-700">{urgentes.length} urgentes</span>
          </div>
          <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-orange-400" />
            <span className="text-xs font-medium text-orange-700">{proximas.length} próximas</span>
          </div>
          <div className="flex items-center gap-1.5 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-medium text-green-700">{renovadosEsteMes.length} renovados este mes</span>
          </div>
        </div>
      </div>

      {/* Secciones Urgentes + Próximas */}
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
                        <span className="text-xs font-bold text-google-blue">{getInitials(r.nombre)}</span>
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
                      <button
                        onClick={() => setSelectedContrato(r)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-blue-300 text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-colors ml-auto"
                      >
                        <RefreshCw size={11} /> Renovado
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

      {alertasActivas === 0 && renovadosEsteMes.length === 0 && (
        <div className="card p-12 text-center">
          <RefreshCw size={36} className="text-google-gray mx-auto mb-3 opacity-40" />
          <p className="text-google-gray">No hay contratos próximos a vencer</p>
          <p className="text-xs text-google-gray mt-1">
            Los contratos aparecerán aquí cuando falten 30 días o menos para su vencimiento anual
          </p>
        </div>
      )}

      {/* Sección Renovados Recientemente */}
      {renovadosEsteMes.length > 0 && (
        <div className="card border border-green-200 overflow-hidden">
          <div className="px-5 py-3 bg-green-50 border-b border-green-200">
            <p className="text-sm font-semibold text-google-dark">🎉 Contratos Renovados Recientemente</p>
            <p className="text-xs text-green-700 mt-0.5">Tramitados como renovados durante el mes actual</p>
          </div>
          <div className="divide-y divide-google-border">
            {paginatedRenovados.map((r) => (
              <div key={r.id} className="px-5 py-4 hover:bg-green-50/50 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-bold text-green-700">{getInitials(r.nombre)}</span>
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
                        <span className="flex items-center gap-1 text-green-700 font-medium">
                          <Calendar size={11} /> Nueva ref.: {r.fecha_renovacion}
                        </span>
                        <span className="flex items-center gap-1 text-green-700 font-medium">
                          <Calendar size={11} /> Próx. vencimiento: {calcVencimiento(r.fecha_renovacion)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right space-y-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                      <CheckCircle size={11} /> Renovado
                    </span>
                    <p className="text-xs text-google-gray">{r.comercial}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pagination currentPage={renovadosPage} totalPages={renovadosTotalPages} onPageChange={setRenovadosPage} />
        </div>
      )}

      {/* Modal de renovación */}
      {selectedContrato && (
        <RenovacionModal
          contrato={selectedContrato}
          onClose={() => setSelectedContrato(null)}
          onConfirm={handleRenovar}
        />
      )}
    </div>
  );
}
