import { useState } from 'react';
import { Zap, Flame, Factory, Info, X } from 'lucide-react';

/* ── Datos extraídos de PDFs Endesa (vigentes 09/06/2026 – 14/07/2026) ─────── */

const BONO_SOCIAL = [
  { zona: 'Península y Baleares (< 10 kW)',       valor: '0,02431959 €/día' },
  { zona: 'Canarias (< 10 kW, cliente doméstico)', valor: '0,02009883 €/día' },
  { zona: 'Ceuta y Melilla',                        valor: '0,02029982 €/día' },
  { zona: 'Resto de casos',                         valor: '0,02070180 €/día' },
];

const LUZ = [
  {
    id: 'directo',
    title: 'Luz Fija 24H',
    canal: 'Canal Directo',
    canalColor: 'bg-blue-100 text-blue-700',
    desc: 'Precio único en energía y potencia, sin franjas horarias.',
    sinMant: { promo: 0.109000, noPromo: 0.160294 },
    conMant: { promo: 0.104191, noPromo: 0.160294 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% — 1 año (nuevas contrataciones)', '22% — indefinido sobre término de energía'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección',
    validez: '09/06/2026 – 14/07/2026',
  },
  {
    id: 'prescriptor',
    title: 'Luz Fija 24H',
    canal: 'Con Prescriptor',
    canalColor: 'bg-violet-100 text-violet-700',
    desc: 'Precio único sin franjas horarias. Canal venta con prescriptor.',
    sinMant: { promo: 0.128235, noPromo: 0.160294 },
    conMant: { promo: 0.123426, noPromo: 0.160294 },
    potPunta: 34.188000,
    potValle: 34.188000,
    descuentos: ['10% — 1 año (nuevas contrataciones)', '10% — indefinido sobre término de energía'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección (1 año)',
    validez: '09/06/2026 – 14/07/2026',
  },
  {
    id: 'tu-otra-casa',
    title: 'Tu Otra Casa 50',
    canal: '2.0TD',
    canalColor: 'bg-emerald-100 text-emerald-700',
    desc: '50% de descuento en las 50 horas de mayor consumo de cada mes.',
    isToc: true,
    sinMant: { promoH: 0.110250, restoH: 0.220000, noPromoH: 0.122500, noPromoR: 0.245000 },
    conMant: { promoH: 0.106575, restoH: 0.210000, noPromoH: 0.122500, noPromoR: 0.245000 },
    potPunta: 32.880000,
    potValle: 5.904000,
    descuentos: ['50% — en las 50h de mayor consumo del mes', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% adicional — serv. eléctrico en misma dirección (1 año)',
    validez: '01/06/2026 – 14/07/2026',
  },
];

const GAS = [
  {
    id: 'rl1',
    title: 'Gas RL.1',
    consumo: '0 – 5.000 kWh/año',
    terFijo: 7.181000,
    sinMant: { promo: 0.065590, noPromo: 0.093700 },
    conMant: { promo: 0.062779, noPromo: 0.093700 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% adicional — electricidad + gas en misma dirección',
    validez: '12/05/2026 – 14/07/2026',
  },
  {
    id: 'rl2',
    title: 'Gas RL.2',
    consumo: '5.001 – 15.000 kWh/año',
    terFijo: 14.600000,
    sinMant: { promo: 0.065100, noPromo: 0.093000 },
    conMant: { promo: 0.062310, noPromo: 0.093000 },
    hasMant: true,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: '3% adicional — electricidad + gas en misma dirección',
    validez: '12/05/2026 – 14/07/2026',
  },
  {
    id: 'rl3',
    title: 'Gas RL.3',
    consumo: '15.001 – 50.000 kWh/año',
    terFijo: 30.672000,
    sinMant: { promo: 0.061600, noPromo: 0.088000 },
    conMant: { promo: 0.061600, noPromo: 0.088000 },
    hasMant: false,
    descuentos: ['20% — 1 año (electricidad en misma dirección)', '10% — 1 año (nuevas contrataciones)'],
    mantLabel: null,
    validez: '12/05/2026 – 14/07/2026',
  },
];

const TABS = [
  { id: 'luz',        label: 'Luz Residencial / Negocios (2.0TD)', icon: Zap,     activeText: 'text-google-blue',  activeBorder: 'border-google-blue'  },
  { id: 'gas',        label: 'Gas (RL.1 – RL.3)',                  icon: Flame,   activeText: 'text-orange-500',   activeBorder: 'border-orange-500'   },
  { id: 'industrial', label: 'Tarifas Industriales',               icon: Factory, activeText: 'text-gray-600',     activeBorder: 'border-gray-500'     },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmt(num) {
  return num.toLocaleString('es-ES', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/* ── Sub-componentes ────────────────────────────────────────────────────────── */

function MiniToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none ${on ? 'bg-google-blue' : 'bg-gray-300'}`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function DiscountBadge({ label }) {
  return (
    <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[11px] font-medium px-2 py-0.5 rounded-full border border-green-200 leading-tight">
      <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {label}
    </span>
  );
}

function BonoSocialModal({ onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-google w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-google-dark">Bono Social — Costes regulados</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-google-gray">
            <X size={16} />
          </button>
        </div>
        <p className="text-xs text-google-gray mb-3">
          Coste fijo por cliente (comercialización): <strong className="text-google-dark">0,019121 €/día</strong> (sin impuestos)
        </p>
        <div className="divide-y divide-gray-100">
          {BONO_SOCIAL.map(z => (
            <div key={z.zona} className="flex justify-between items-start gap-3 py-1.5">
              <span className="text-xs text-google-gray leading-snug">{z.zona}</span>
              <span className="text-xs font-medium text-google-dark whitespace-nowrap">{z.valor}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-400 mt-3">Precios con impuestos incluidos. Válido para tarifa 2.0TD.</p>
      </div>
    </div>
  );
}

function LuzCard({ tarifa }) {
  const [mant, setMant] = useState(false);
  const [showBono, setShowBono] = useState(false);
  const data = mant ? tarifa.conMant : tarifa.sinMant;

  return (
    <>
      {showBono && <BonoSocialModal onClose={() => setShowBono(false)} />}
      <div className="bg-white border border-google-border rounded-xl shadow-sm flex flex-col">

        {/* Cabecera */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100">
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <h3 className="text-base font-semibold text-google-dark leading-tight">{tarifa.title}</h3>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${tarifa.canalColor}`}>
              {tarifa.canal}
            </span>
          </div>
          <p className="text-xs text-google-gray">{tarifa.desc}</p>
        </div>

        <div className="px-5 py-4 space-y-4 flex-1">

          {/* Término de energía */}
          {tarifa.isToc ? (
            <div>
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Término de energía (€/kWh)</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-blue-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-blue-500 font-medium mb-1">50h Promo</p>
                  <p className="text-lg font-bold text-google-blue leading-tight">{fmt(data.promoH)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">promocionado</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-[10px] text-google-gray font-medium mb-1">Resto h.</p>
                  <p className="text-lg font-bold text-google-dark leading-tight">{fmt(data.restoH)}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">promocionado</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1 text-center">
                <p className="text-[10px] text-google-gray">No promo: <span className="line-through">{fmt(data.noPromoH)}</span></p>
                <p className="text-[10px] text-google-gray">No promo: <span className="line-through">{fmt(data.noPromoR)}</span></p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Término de energía (€/kWh)</p>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-google-blue leading-tight">{fmt(data.promo)}</p>
                <p className="text-xs text-blue-500 mt-0.5">precio promocionado</p>
              </div>
              <p className="text-xs text-google-gray mt-1.5 text-center">
                No promocionado: <span className="line-through">{fmt(data.noPromo)}</span>
              </p>
            </div>
          )}

          {/* Término de potencia */}
          <div>
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Término de potencia (€/kW/año)</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between items-center">
                <span className="text-[10px] text-google-gray">Punta-llano</span>
                <span className="text-xs font-semibold text-google-dark">{tarifa.potPunta.toFixed(6)}</span>
              </div>
              <div className="bg-gray-50 rounded-lg px-3 py-2 flex justify-between items-center">
                <span className="text-[10px] text-google-gray">Valle</span>
                <span className="text-xs font-semibold text-google-dark">{tarifa.potValle.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {/* Descuentos */}
          <div>
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Descuentos incluidos</p>
            <div className="flex flex-wrap gap-1.5">
              {tarifa.descuentos.map((d, i) => <DiscountBadge key={i} label={d} />)}
              {mant && <DiscountBadge label={tarifa.mantLabel} />}
            </div>
          </div>
        </div>

        {/* Toggle mantenimiento + Bono Social */}
        <div className="px-5 pt-3 pb-4 border-t border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MiniToggle on={mant} onToggle={() => setMant(v => !v)} />
            <span className="text-xs text-google-gray">
              Mantenimiento <span className="text-google-blue font-semibold">(−3%)</span>
            </span>
          </div>
          <button
            onClick={() => setShowBono(true)}
            className="flex items-center gap-1 text-[11px] text-google-gray hover:text-google-blue transition-colors"
          >
            <Info size={12} />
            Bono Social
          </button>
        </div>

        <div className="px-5 pb-3">
          <p className="text-[10px] text-gray-400 text-right">Válida: {tarifa.validez} · 2.0TD · 0–15 kW</p>
        </div>
      </div>
    </>
  );
}

function GasCard({ tarifa }) {
  const [mant, setMant] = useState(false);
  const data = mant ? tarifa.conMant : tarifa.sinMant;
  const priceChanged = tarifa.conMant.promo !== tarifa.sinMant.promo;

  return (
    <div className="bg-white border border-google-border rounded-xl shadow-sm flex flex-col">

      {/* Cabecera */}
      <div className="px-5 pt-5 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h3 className="text-base font-semibold text-google-dark leading-tight">{tarifa.title}</h3>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
            {tarifa.consumo}
          </span>
        </div>
        <p className="text-xs text-google-gray">Precio fijo sin permanencia. Sin fluctuaciones del mercado.</p>
      </div>

      <div className="px-5 py-4 space-y-4 flex-1">

        {/* Término variable */}
        <div>
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">Término variable (€/kWh)</p>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-orange-600 leading-tight">{fmt(data.promo)}</p>
            <p className="text-xs text-orange-500 mt-0.5">precio promocionado</p>
          </div>
          <p className="text-xs text-google-gray mt-1.5 text-center">
            No promocionado: <span className="line-through">{fmt(data.noPromo)}</span>
          </p>
        </div>

        {/* Término fijo */}
        <div>
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Término fijo (€/mes)</p>
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-center">
            <span className="text-lg font-bold text-google-dark">{fmt(tarifa.terFijo)}</span>
          </div>
        </div>

        {/* Descuentos */}
        <div>
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Descuentos incluidos</p>
          <div className="flex flex-wrap gap-1.5">
            {tarifa.descuentos.map((d, i) => <DiscountBadge key={i} label={d} />)}
            {mant && priceChanged && tarifa.mantLabel && <DiscountBadge label={tarifa.mantLabel} />}
          </div>
        </div>
      </div>

      {/* Toggle */}
      <div className="px-5 pt-3 pb-4 border-t border-gray-100 flex items-center gap-2">
        <MiniToggle on={mant} onToggle={() => setMant(v => !v)} />
        {priceChanged ? (
          <span className="text-xs text-google-gray">
            Combo luz + gas <span className="text-orange-600 font-semibold">(−3%)</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">Sin descuento adicional disponible en RL.3</span>
        )}
      </div>

      <div className="px-5 pb-3">
        <p className="text-[10px] text-gray-400 text-right">Válida: {tarifa.validez}</p>
      </div>
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────────────────────── */

export default function Tarifas() {
  const [tab, setTab] = useState('luz');

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-google-dark">Consulta de Tarifas</h1>
        <p className="text-sm text-google-gray mt-1">Precios vigentes Endesa · Sin impuestos</p>
        <p className="text-sm text-gray-400 mt-0.5">Documento editado el 03/06/2026</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-google-border mb-6 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon;
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors duration-150 ${
                isActive
                  ? `${t.activeText} ${t.activeBorder}`
                  : 'text-google-gray border-transparent hover:text-google-dark hover:border-gray-300'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab: Luz */}
      {tab === 'luz' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {LUZ.map(t => <LuzCard key={t.id} tarifa={t} />)}
        </div>
      )}

      {/* Tab: Gas */}
      {tab === 'gas' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {GAS.map(t => <GasCard key={t.id} tarifa={t} />)}
        </div>
      )}

      {/* Tab: Industrial */}
      {tab === 'industrial' && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Factory size={28} className="text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-google-dark mb-2">Módulo en desarrollo</h3>
          <p className="text-sm text-google-gray max-w-xs">
            Las tarifas industriales (3.0TD / 6.1TD) estarán disponibles próximamente.
          </p>
        </div>
      )}
    </div>
  );
}
