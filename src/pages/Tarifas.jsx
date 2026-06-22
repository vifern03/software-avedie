import { useState } from 'react';
import { Zap, Flame, Factory, Info, X, AlertTriangle, Calculator } from 'lucide-react';
import EstudioComparativo from './EstudioComparativo';
import EstudioComparativoGas from './EstudioComparativoGas';
import { GAS } from '../data/tarifasGas';

/* GAS importado desde src/data/tarifasGas.js (fuente única de verdad) */

/* ── Datos B2C/Residencial extraídos de PDFs Endesa (09/06/2026 – 14/07/2026) ─ */

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


/* ── Datos B2B extraídos de PDFs Endesa (09/06/2026 – 23/06/2026) ───────────── */

const TEMPO = {
  energia:    { promo: 0.124777, base: 0.164180 },
  descuento:  24,
  potencia: [
    { p: 'P1', anyo: 44.704416, mes: 3.725368, desc: 'Laborables 8h–24h' },
    { p: 'P2', anyo: 17.725428, mes: 1.477119, desc: 'Laborables 0h–8h y fines de semana/festivos' },
  ],
  penalizacion: '5% del precio del contrato',
  validez: '09/06/2026 – 23/06/2026',
};

const OPEN_30TD = {
  potencias: ['15–30 kW', '30–50 kW', '50–100 kW', '> 100 kW'],
  baseEnergia: [0.198840, 0.198340, 0.197840, 0.197840],
  modalidades: [
    { label: 'Plana',        dto: 15, desc: 'Las 24h del día los 365 días al año' },
    { label: 'Día',          dto: 20, desc: 'De 8h a 24h todos los días del año' },
    { label: 'Laboral',      dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)' },
    { label: 'Fin de Semana',dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales' },
    { label: 'Noche',        dto: 55, desc: 'De 0h a 8h todos los días del año' },
  ],
  extraAnyo: 14,
  // Precios con descuentos incluidos (modalidad discount + 14% 1er año): [potencia][modalidad]
  matrix: [
    [0.141176, 0.131234, 0.121292, 0.081524, 0.061640],
    [0.140821, 0.130904, 0.120987, 0.081319, 0.061485],
    [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
    [0.140466, 0.130574, 0.120682, 0.081114, 0.061330],
  ],
  horasNoOpen: [0.171002, 0.170572, 0.170142, 0.170142],
  potenciaTerminos: [
    { p: 'P1', anyo: 21.876927, mes: 1.823077, dia: 0.059937 },
    { p: 'P2', anyo: 12.117621, mes: 1.009802, dia: 0.033199 },
    { p: 'P3', anyo:  5.981534, mes: 0.498461, dia: 0.016388 },
    { p: 'P4', anyo:  5.386333, mes: 0.448861, dia: 0.014757 },
    { p: 'P5', anyo:  4.013851, mes: 0.334488, dia: 0.010997 },
    { p: 'P6', anyo:  2.942287, mes: 0.245191, dia: 0.008061 },
  ],
  penalizacion: '5% de la energía pendiente facturada al precio sin descuentos',
  validez: '09/06/2026 – 23/06/2026',
};

const OPEN_61TD = {
  potencias: ['< 30 kW', '30–50 kW', '50–100 kW', '100–450 kW'],
  baseEnergia: [0.173916, 0.173916, 0.170416, 0.170416],
  modalidades: [
    { label: 'Plana',        dto: 15, desc: 'Las 24h del día los 365 días al año' },
    { label: 'Día',          dto: 20, desc: 'De 8h a 24h (L–V) y de 18h a 24h (S, D, festivos)' },
    { label: 'Laboral',      dto: 25, desc: 'De 8h a 24h de lunes a viernes (excepto festivos nacionales)' },
    { label: 'Fin de Semana',dto: 45, desc: 'Las 24h del día de sábados, domingos y festivos nacionales' },
    { label: 'Noche',        dto: 35, desc: 'De 0h a 8h (L–V) y de 0h a 18h (S, D, festivos)' },
  ],
  extraAnyo: 12,
  // Precios con descuentos incluidos (modalidad discount + 12% 1er año): [potencia][modalidad]
  matrix: [
    [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
    [0.126959, 0.118263, 0.109567, 0.074784, 0.092175],
    [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
    [0.124404, 0.115883, 0.107362, 0.073279, 0.090320],
  ],
  horasNoOpen: [0.153046, 0.153046, 0.149966, 0.149966],
  potenciaTerminos: [
    { p: 'P1', anyo: 31.095368, mes: 2.591281, dia: 0.085193 },
    { p: 'P2', anyo: 17.014709, mes: 1.417892, dia: 0.046616 },
    { p: 'P3', anyo:  8.301881, mes: 0.691823, dia: 0.022745 },
    { p: 'P4', anyo:  6.893829, mes: 0.574486, dia: 0.018887 },
    { p: 'P5', anyo:  3.625113, mes: 0.302093, dia: 0.009932 },
    { p: 'P6', anyo:  2.504181, mes: 0.208682, dia: 0.006861 },
  ],
  penalizacion: '10% del precio del Término de Energía × energía pendiente de suministro',
  validez: '09/06/2026 – 23/06/2026',
};

const B2B_SUBTABS = [
  { id: 'tempo',  label: 'TEMPO 2.0TD',  sub: 'Negocios ≤ 15 kW' },
  { id: 'open30', label: 'Open 3.0TD',   sub: 'Negocios 15–100+ kW' },
  { id: 'open61', label: 'Open 6.1TD',   sub: 'Alta Tensión hasta 450 kW' },
];

const TABS = [
  { id: 'luz',          label: 'Luz Residencial / Negocios (2.0TD)', icon: Zap,        activeText: 'text-google-blue',  activeBorder: 'border-google-blue'  },
  { id: 'gas',          label: 'Gas (RL.1 – RL.3)',                  icon: Flame,      activeText: 'text-orange-500',   activeBorder: 'border-orange-500'   },
  { id: 'industrial',   label: 'Industriales y Negocios (B2B)',      icon: Factory,    activeText: 'text-gray-700',     activeBorder: 'border-gray-600'     },
  { id: 'estudio',      label: 'Estudio Comparativo 2.0',            icon: Calculator, activeText: 'text-green-600',    activeBorder: 'border-green-600'    },
  { id: 'estudio-gas',  label: 'Estudio Comparativo Gas',            icon: Calculator, activeText: 'text-orange-500',   activeBorder: 'border-orange-500'   },
];

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function fmt(num) {
  return num.toLocaleString('es-ES', { minimumFractionDigits: 6, maximumFractionDigits: 6 });
}

/* ── Componentes compartidos ────────────────────────────────────────────────── */

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

function PermanenciaBadge({ penalizacion }) {
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 mb-5">
      <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
      <div>
        <span className="text-xs font-bold text-red-600">Con Permanencia de 1 Año</span>
        <span className="text-xs text-red-500 ml-2">·</span>
        <span className="text-xs text-red-500 ml-2">Penalización por rescisión anticipada: {penalizacion}</span>
      </div>
    </div>
  );
}

function PBadge({ p }) {
  const colors = {
    P1: 'bg-blue-600', P2: 'bg-blue-500', P3: 'bg-blue-400',
    P4: 'bg-blue-300', P5: 'bg-blue-200 !text-blue-700', P6: 'bg-blue-100 !text-blue-700',
  };
  return (
    <span className={`text-[10px] font-bold text-white rounded px-1.5 py-0.5 leading-none ${colors[p] || 'bg-gray-400'}`}>
      {p}
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

/* ── Tarjetas B2C Luz ───────────────────────────────────────────────────────── */

function LuzCard({ tarifa }) {
  const [mant, setMant] = useState(false);
  const [showBono, setShowBono] = useState(false);
  const data = mant ? tarifa.conMant : tarifa.sinMant;

  return (
    <>
      {showBono && <BonoSocialModal onClose={() => setShowBono(false)} />}
      <div className="bg-white border border-google-border rounded-xl shadow-sm flex flex-col">
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

          <div>
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Descuentos incluidos</p>
            <div className="flex flex-wrap gap-1.5">
              {tarifa.descuentos.map((d, i) => <DiscountBadge key={i} label={d} />)}
              {mant && <DiscountBadge label={tarifa.mantLabel} />}
            </div>
          </div>
        </div>

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

/* ── Tarjetas B2C Gas ───────────────────────────────────────────────────────── */

function GasCard({ tarifa }) {
  const [mant, setMant] = useState(false);
  const data = mant ? tarifa.conMant : tarifa.sinMant;
  const priceChanged = tarifa.conMant.promo !== tarifa.sinMant.promo;

  return (
    <div className="bg-white border border-google-border rounded-xl shadow-sm flex flex-col">
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

        <div>
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Término fijo (€/mes)</p>
          <div className="bg-gray-50 rounded-lg px-4 py-2.5 text-center">
            <span className="text-lg font-bold text-google-dark">{fmt(tarifa.terFijo)}</span>
          </div>
        </div>

        <div>
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">Descuentos incluidos</p>
          <div className="flex flex-wrap gap-1.5">
            {tarifa.descuentos.map((d, i) => <DiscountBadge key={i} label={d} />)}
            {mant && priceChanged && tarifa.mantLabel && <DiscountBadge label={tarifa.mantLabel} />}
          </div>
        </div>
      </div>

      <div className="px-5 pt-3 pb-4 border-t border-gray-100 flex items-center gap-2">
        <MiniToggle on={mant} onToggle={() => setMant(v => !v)} />
        {priceChanged ? (
          <span className="text-xs text-google-gray">
            Mantenimiento <span className="text-orange-600 font-semibold">(−3%)</span>
          </span>
        ) : (
          <span className="text-xs text-gray-400">Sin Dto. por Mantenimiento en RL.3</span>
        )}
      </div>

      <div className="px-5 pb-3">
        <p className="text-[10px] text-gray-400 text-right">Válida: {tarifa.validez}</p>
      </div>
    </div>
  );
}

/* ── Sección B2B: TEMPO 2.0TD ───────────────────────────────────────────────── */

function TempoSection() {
  return (
    <div>
      <PermanenciaBadge penalizacion={TEMPO.penalizacion} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Tarjeta principal — Precio energía */}
        <div className="lg:col-span-2 bg-white border border-google-border rounded-xl shadow-sm p-5">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-semibold text-google-dark">Tarifa TEMPO 2.0TD</h3>
              <p className="text-xs text-google-gray mt-0.5">Un solo precio las 24 horas del día · Potencia ≤ 15 kW</p>
            </div>
            <span className="flex-shrink-0 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">
              +{TEMPO.descuento}% 1er año
            </span>
          </div>

          {/* Precio grande */}
          <div className="bg-blue-50 rounded-xl px-6 py-5 text-center mb-5">
            <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-widest mb-2">Término de Energía · 24h</p>
            <p className="text-5xl font-bold text-google-blue tracking-tight">
              {fmt(TEMPO.energia.promo)}
            </p>
            <p className="text-sm text-blue-500 mt-1.5">€/kWh · Precio con descuentos incluidos</p>
            <p className="text-xs text-google-gray mt-2">
              Precio base sin descuento: <span className="line-through font-medium">{fmt(TEMPO.energia.base)} €/kWh</span>
            </p>
          </div>

          {/* Info descuento */}
          <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5">
            <Info size={13} className="text-blue-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Incluye <strong>+{TEMPO.descuento}% de descuento adicional</strong> en el Término de Energía durante el primer año desde la contratación.
            </p>
          </div>

          <p className="text-[10px] text-gray-400 text-right mt-3">
            Válida: {TEMPO.validez} · Tarifa 2.0TD
          </p>
        </div>

        {/* Tarjeta lateral — Potencia P1/P2 */}
        <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-4">Término de Potencia</p>
          <div className="space-y-3">
            {TEMPO.potencia.map(t => (
              <div key={t.p} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <PBadge p={t.p} />
                  <span className="text-[10px] text-google-gray leading-tight">{t.desc}</span>
                </div>
                <p className="text-xl font-bold text-google-dark">
                  {fmt(t.anyo)}
                  <span className="text-xs font-normal text-google-gray ml-1">€/kW·año</span>
                </p>
                <p className="text-xs text-google-gray mt-0.5">{fmt(t.mes)} €/kW·mes</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-google-gray">
              <span className="font-semibold">P1</span> aplica en días laborables de 8h a 24h.<br />
              <span className="font-semibold">P2</span> aplica en laborables de 0h a 8h y las 24h en fines de semana y festivos nacionales.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sección B2B: Open (3.0TD / 6.1TD) ─────────────────────────────────────── */

function OpenSection({ datos, titulo, subtitulo }) {
  const [potIdx,    setPotIdx]    = useState(0);
  const [modalIdx,  setModalIdx]  = useState(0);

  const precio      = datos.matrix[potIdx][modalIdx];
  const precioBase  = datos.baseEnergia[potIdx];
  const noOpen      = datos.horasNoOpen[potIdx];
  const modalidad   = datos.modalidades[modalIdx];

  return (
    <div>
      <PermanenciaBadge penalizacion={datos.penalizacion} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Panel izquierdo: selectores + precio dinámico */}
        <div className="xl:col-span-2 space-y-4">

          {/* Cabecera tarifa */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h3 className="text-base font-semibold text-google-dark">{titulo}</h3>
                <p className="text-xs text-google-gray mt-0.5">{subtitulo}</p>
              </div>
              <span className="flex-shrink-0 bg-blue-600 text-white text-xs font-bold px-2.5 py-1 rounded-lg whitespace-nowrap">
                +{datos.extraAnyo}% 1er año
              </span>
            </div>

            {/* Selector 1: Potencia */}
            <div className="mb-4">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">
                Potencia Contratada
              </p>
              <div className="flex flex-wrap gap-2">
                {datos.potencias.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => setPotIdx(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                      potIdx === i
                        ? 'bg-google-blue text-white border-google-blue shadow-sm'
                        : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector 2: Modalidad Open */}
            <div className="mb-5">
              <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-2">
                Modalidad Open
              </p>
              <div className="flex flex-wrap gap-2">
                {datos.modalidades.map((m, i) => (
                  <button
                    key={i}
                    onClick={() => setModalIdx(i)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors duration-150 ${
                      modalIdx === i
                        ? 'bg-google-blue text-white border-google-blue shadow-sm'
                        : 'bg-gray-50 text-google-gray border-google-border hover:border-google-blue hover:text-google-blue'
                    }`}
                  >
                    {m.label} <span className="opacity-75">({m.dto}%)</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-google-gray mt-2 italic leading-snug">
                <span className="font-medium not-italic text-google-dark">Horas {modalidad.label}:</span> {modalidad.desc}
              </p>
            </div>

            {/* Resultado dinámico */}
            <div className="bg-blue-50 rounded-xl p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1.5">
                    Horas Open — {modalidad.label}
                  </p>
                  <p className="text-4xl font-bold text-google-blue leading-none">{fmt(precio)}</p>
                  <p className="text-xs text-blue-500 mt-1.5">€/kWh</p>
                </div>
                <div className="text-center border-l border-blue-200 pl-4">
                  <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-1.5">
                    Horas No Open
                  </p>
                  <p className="text-4xl font-bold text-google-dark leading-none">{fmt(noOpen)}</p>
                  <p className="text-xs text-google-gray mt-1.5">€/kWh</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-blue-200 flex flex-wrap items-center gap-2">
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  +{datos.extraAnyo}% 1er año
                </span>
                <span className="text-xs text-blue-600">
                  Descuento adicional sobre 24h ya incluido en los precios mostrados
                </span>
              </div>
            </div>

            {/* Precio base */}
            <p className="text-xs text-google-gray text-right mt-2">
              Precio base sin descuentos ({datos.potencias[potIdx]}): <span className="font-medium line-through">{fmt(precioBase)} €/kWh</span>
            </p>
          </div>

          {/* Tabla completa de energía por modalidad */}
          <div className="bg-white border border-google-border rounded-xl shadow-sm p-5">
            <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-3">
              Tabla de precios — Término de Energía (€/kWh, con descuentos incluidos)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-google-gray font-medium rounded-l-lg">Potencia</th>
                    {datos.modalidades.map((m, i) => (
                      <th
                        key={i}
                        className={`text-center px-2 py-2 font-medium transition-colors ${
                          modalIdx === i ? 'bg-google-blue text-white' : 'text-google-gray'
                        }`}
                      >
                        {m.label}<br />
                        <span className="text-[10px] opacity-75">({m.dto}%)</span>
                      </th>
                    ))}
                    <th className="text-center px-2 py-2 text-google-gray font-medium rounded-r-lg">No Open</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.potencias.map((pot, pi) => (
                    <tr
                      key={pi}
                      className={`border-t border-gray-100 transition-colors ${
                        potIdx === pi ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-google-dark">{pot}</td>
                      {datos.modalidades.map((_, mi) => (
                        <td
                          key={mi}
                          className={`text-center px-2 py-2 font-mono transition-colors ${
                            potIdx === pi && modalIdx === mi
                              ? 'text-google-blue font-bold'
                              : 'text-google-dark'
                          }`}
                        >
                          {fmt(datos.matrix[pi][mi])}
                        </td>
                      ))}
                      <td className="text-center px-2 py-2 font-mono text-google-gray">
                        {fmt(datos.horasNoOpen[pi])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-400 text-right mt-2">Válida: {datos.validez}</p>
          </div>
        </div>

        {/* Panel derecho: Potencia P1–P6 */}
        <div className="bg-white border border-google-border rounded-xl shadow-sm p-5 h-fit">
          <p className="text-[10px] font-semibold text-google-gray uppercase tracking-wider mb-4">
            Término de Potencia (P1–P6)
          </p>
          <div className="space-y-2.5">
            {datos.potenciaTerminos.map(t => (
              <div key={t.p} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <PBadge p={t.p} />
                </div>
                <p className="text-sm font-bold text-google-dark">
                  {fmt(t.anyo)}
                  <span className="text-xs font-normal text-google-gray ml-1">€/kW·año</span>
                </p>
                <div className="flex gap-3 mt-0.5">
                  <p className="text-[11px] text-google-gray">{fmt(t.mes)} €/kW·mes</p>
                  <p className="text-[11px] text-google-gray">{fmt(t.dia)} €/kW·día</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-google-gray leading-relaxed">
              Los precios de potencia son precios base sin descuentos adicionales.<br />
              El cliente puede cambiar la modalidad Open una vez al mes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Componente principal ───────────────────────────────────────────────────── */

export default function Tarifas() {
  const [tab,    setTab]    = useState('luz');
  const [b2bSub, setB2bSub] = useState('tempo');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* Cabecera */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-google-dark">Consulta de Tarifas</h1>
        <p className="text-sm text-google-gray mt-1">Precios vigentes Endesa · Sin impuestos</p>
        <p className="text-sm text-gray-400 mt-0.5">Documento editado el 09/06/2026</p>
      </div>

      {/* Tabs principales */}
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
        <div className="flex flex-col gap-6">
          {/* Tarjetas: en mobile quedan debajo del botón (order-2), en desktop arriba (order-1) */}
          <div className="order-2 md:order-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {LUZ.map(t => <LuzCard key={t.id} tarifa={t} />)}
          </div>

          {/* Botón CTA: en mobile aparece primero (order-1), en desktop debajo centrado (order-2) */}
          <div className="order-1 md:order-2 flex justify-center">
            <button
              onClick={() => setTab('estudio')}
              className="flex items-center gap-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold text-sm px-7 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Calculator size={17} />
              Realizar Comparativa 2.0
            </button>
          </div>
        </div>
      )}

      {/* Tab: Gas */}
      {tab === 'gas' && (
        <div className="flex flex-col gap-6">
          <div className="order-2 md:order-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {GAS.map(t => <GasCard key={t.id} tarifa={t} />)}
          </div>
          <div className="order-1 md:order-2 flex justify-center">
            <button
              onClick={() => setTab('estudio-gas')}
              className="flex items-center gap-2.5 bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white font-semibold text-sm px-7 py-3 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0"
            >
              <Calculator size={17} />
              Realizar Comparativa Gas
            </button>
          </div>
        </div>
      )}

      {/* Tab: B2B Industrial */}
      {tab === 'industrial' && (
        <div>
          {/* Sub-tabs B2B */}
          <div className="flex gap-2 flex-wrap mb-6">
            {B2B_SUBTABS.map(st => (
              <button
                key={st.id}
                onClick={() => setB2bSub(st.id)}
                className={`flex flex-col items-start px-4 py-2.5 rounded-xl border text-left transition-colors duration-150 ${
                  b2bSub === st.id
                    ? 'bg-gray-900 text-white border-gray-900 shadow-sm'
                    : 'bg-white text-google-gray border-google-border hover:border-gray-400 hover:text-google-dark'
                }`}
              >
                <span className="text-sm font-semibold leading-tight">{st.label}</span>
                <span className={`text-[10px] leading-tight mt-0.5 ${b2bSub === st.id ? 'text-gray-300' : 'text-gray-400'}`}>
                  {st.sub}
                </span>
              </button>
            ))}
          </div>

          {/* Contenido sub-tab */}
          {b2bSub === 'tempo'  && <TempoSection />}
          {b2bSub === 'open30' && (
            <OpenSection
              datos={OPEN_30TD}
              titulo="Tarifa Open 3.0TD"
              subtitulo="Negocios con potencia > 15 kW · Elige la modalidad que mejor se adapta a tu consumo"
            />
          )}
          {b2bSub === 'open61' && (
            <OpenSection
              datos={OPEN_61TD}
              titulo="Tarifa Open 6.1TD"
              subtitulo="Alta Tensión hasta 450 kW · Modalidades adaptadas a cada perfil de consumo industrial"
            />
          )}
        </div>
      )}

      {/* Tab: Estudio Comparativo Luz */}
      {tab === 'estudio' && <EstudioComparativo />}

      {/* Tab: Estudio Comparativo Gas */}
      {tab === 'estudio-gas' && <EstudioComparativoGas />}
    </div>
  );
}
