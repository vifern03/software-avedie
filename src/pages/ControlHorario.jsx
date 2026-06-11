import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Clock, LogIn, LogOut, Pause, Play, FileSpreadsheet, Users,
  CalendarDays, CheckCircle, AlertCircle, Lock, Smartphone,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import ConfirmActionModal from '../components/ConfirmActionModal';

// ─── Constantes de convenio ───────────────────────────────────────────────────
const PAUSA_OBLIG_SEC  = 5.5 * 3600;       // 5h 30min consecutivos → pausa forzada
const DESCANSO_REQ_SEC = 2   * 3600;       // 2h descanso diario total requerido
const JORNADA_MAX_SEC  = 8 * 3600 + 5 * 60; // 8h 05m trabajo neto → parada automática
const ADMINS           = ['victor', 'adolfo'];

// ─── Utilidades ───────────────────────────────────────────────────────────────
const pad        = (n)   => String(n).padStart(2, '0');
const todayStr   = ()    => new Date().toISOString().split('T')[0];
const nowTimeStr = ()    => { const n = new Date(); return `${pad(n.getHours())}:${pad(n.getMinutes())}:${pad(n.getSeconds())}`; };
const timeToSec  = (t)   => { if (!t) return 0; const [h, m, s = 0] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };
const secToHms   = (s)   => { s = Math.max(0, s); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
const secToLabel = (s)   => { s = Math.max(0, s); const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}m`; };
const fmtFecha   = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

// ─── Lógica de jornada ────────────────────────────────────────────────────────

function deriveEstado(eventos) {
  if (!eventos?.length) return 'No_Iniciada';
  const t = eventos[eventos.length - 1].tipo;
  if (t === 'salida') return 'Finalizada';
  if (t === 'pausa')  return 'En_Pausa';
  return 'En_Jornada';
}

// Calcula tiempos acumulados. nowSec = segundo actual (o final del día).
function calcTiempos(eventos, nowSec) {
  let trabajadoSec = 0, descansadoSec = 0, consecutivoSec = 0;
  if (!eventos?.length) return { trabajadoSec, descansadoSec, consecutivoSec };
  for (let i = 0; i < eventos.length; i++) {
    const ev = eventos[i];
    if (ev.tipo === 'salida') break;
    const isLast  = i === eventos.length - 1;
    const nextSec = isLast ? nowSec : timeToSec(eventos[i + 1].hora);
    const dur     = Math.max(0, nextSec - timeToSec(ev.hora));
    if (ev.tipo === 'entrada' || ev.tipo === 'vuelta') {
      trabajadoSec += dur;
      if (isLast) consecutivoSec = dur;
    } else if (ev.tipo === 'pausa') {
      descansadoSec += dur;
    }
  }
  return { trabajadoSec, descansadoSec, consecutivoSec };
}

// Suma los segundos de descanso de todas las pausas COMPLETADAS anteriores a la última.
function calcDescansoAcumuladoPrevio(eventos) {
  let sec = 0;
  let lastPausaIdx = -1;
  for (let i = 0; i < eventos.length; i++) {
    if (eventos[i].tipo === 'pausa') lastPausaIdx = i;
  }
  for (let i = 0; i < lastPausaIdx; i++) {
    if (eventos[i].tipo === 'pausa' && eventos[i + 1]?.tipo === 'vuelta') {
      sec += Math.max(0, timeToSec(eventos[i + 1].hora) - timeToSec(eventos[i].hora));
    }
  }
  return sec;
}

// Extrae pares {inicio, fin, durMin} para cada pausa del día.
function extractPausas(eventos) {
  const pairs = [];
  if (!eventos) return pairs;
  for (let i = 0; i < eventos.length; i++) {
    if (eventos[i].tipo !== 'pausa') continue;
    const vuelta = eventos[i + 1]?.tipo === 'vuelta' ? eventos[i + 1].hora : null;
    const durMin = vuelta ? Math.round((timeToSec(vuelta) - timeToSec(eventos[i].hora)) / 60) : null;
    pairs.push({ inicio: eventos[i].hora, fin: vuelta, durMin });
  }
  return pairs;
}

// Detecta si el último evento de salida fue una parada automática en tiempo real.
function isAutoParado(eventos) {
  if (!eventos?.length) return false;
  const last = eventos[eventos.length - 1];
  return last?.tipo === 'salida' && last?.autoParado === true;
}

// Detecta si el cierre fue retroactivo (jornada olvidada del día anterior).
function isRetroactivoCerrado(eventos) {
  if (!eventos?.length) return false;
  const last = eventos[eventos.length - 1];
  return last?.tipo === 'salida' && last?.retroactivo === true;
}

// ─── Banco de pruebas internas (solo DEV) ─────────────────────────────────────
function runMockTests() {
  const results = [];

  // Caso A — Pausas dinámicas múltiples
  {
    const ev = [
      { tipo: 'entrada', hora: '08:00:00' },
      { tipo: 'pausa',   hora: '09:30:00' }, // 90m trabajo
      { tipo: 'vuelta',  hora: '10:00:00' }, // 30m pausa
      { tipo: 'pausa',   hora: '12:00:00' }, // 120m trabajo
      { tipo: 'vuelta',  hora: '12:45:00' }, // 45m pausa
      { tipo: 'pausa',   hora: '14:15:00' }, // 90m trabajo
      { tipo: 'vuelta',  hora: '14:45:00' }, // 30m pausa → total desc: 105m = 1h45m
    ];
    const nowSec = timeToSec('16:00:00'); // 75m trabajo final → total trabajo: 375m = 6h15m
    const { trabajadoSec, descansadoSec } = calcTiempos(ev, nowSec);
    const restanteSec = Math.max(0, DESCANSO_REQ_SEC - descansadoSec);
    const pass = trabajadoSec === 375 * 60 && descansadoSec === 105 * 60 && restanteSec === 15 * 60;
    results.push({
      name: 'Caso A — Pausas dinámicas múltiples',
      pass,
      detail: `Trabajado: ${secToLabel(trabajadoSec)} (esp. 6h 15m) | Descansado: ${secToLabel(descansadoSec)} (esp. 1h 45m) | Cupo restante: ${secToLabel(restanteSec)} (esp. 15m)`,
    });
  }

  // Caso B — Auto-pausa obligatoria a las 5h30m consecutivos
  {
    const ev = [{ tipo: 'entrada', hora: '07:00:00' }];
    const nowPrevio = timeToSec('12:29:59'); // 5h29m59s → NO debe disparar
    const nowExacto = timeToSec('12:30:00'); // 5h30m00s → SÍ debe disparar
    const { consecutivoSec: c1 } = calcTiempos(ev, nowPrevio);
    const { consecutivoSec: c2 } = calcTiempos(ev, nowExacto);
    const notYet = c1 < PAUSA_OBLIG_SEC;
    const fires  = c2 >= PAUSA_OBLIG_SEC;
    results.push({
      name: 'Caso B — Auto-pausa 5h30m consecutivos',
      pass: notYet && fires,
      detail: `12:29:59 → ${secToHms(c1)} consecutivo, dispara=${!notYet} | 12:30:00 → ${secToHms(c2)} consecutivo, dispara=${fires}`,
    });
  }

  // Caso C — Corte automático 8h05m (simulación a 5 seg del límite)
  {
    // Jornada: entrada 08:00, pausa 10:00, vuelta 11:00 (2h trabajo previo)
    // Para neto=8h04m55s: desde vuelta necesitamos 6h04m55s → now=17:04:55
    const ev = [
      { tipo: 'entrada', hora: '08:00:00' },
      { tipo: 'pausa',   hora: '10:00:00' },
      { tipo: 'vuelta',  hora: '11:00:00' },
    ];
    const nowMenos5 = timeToSec('17:04:55'); // neto = 8h04m55s → NO dispara
    const nowLimite = timeToSec('17:05:00'); // neto = 8h05m00s → DISPARA
    const { trabajadoSec: t1 } = calcTiempos(ev, nowMenos5);
    const { trabajadoSec: t2 } = calcTiempos(ev, nowLimite);
    const notYet = t1 < JORNADA_MAX_SEC;
    const fires  = t2 >= JORNADA_MAX_SEC;
    results.push({
      name: 'Caso C — Corte automático 8h05m',
      pass: notYet && fires,
      detail: `17:04:55 → neto ${secToHms(t1)} (${t1}s vs ${JORNADA_MAX_SEC}s), dispara=${!notYet} | 17:05:00 → neto ${secToHms(t2)}, dispara=${fires}`,
    });
  }

  // Caso D — Cierre retroactivo En_Jornada (sin pausas → salida = entrada + 8h05m)
  {
    const ev = [{ tipo: 'entrada', hora: '09:00:00' }];
    // lastWorkSec = 9*3600 = 32400; workedBefore = 0; remaining = JORNADA_MAX_SEC
    const lastWorkSec     = timeToSec('09:00:00');
    const workedBeforeSec = calcTiempos(ev, lastWorkSec).trabajadoSec;
    const remainingSec    = Math.max(0, JORNADA_MAX_SEC - workedBeforeSec);
    const salidaSec       = Math.min(lastWorkSec + remainingSec, 86399);
    const hora_salida     = secToHms(salidaSec);
    // Con la salida añadida, el total neto debe ser exactamente JORNADA_MAX_SEC
    const evConSalida  = [...ev, { tipo: 'salida', hora: hora_salida, retroactivo: true }];
    const { trabajadoSec } = calcTiempos(evConSalida, salidaSec);
    const pass = hora_salida === '17:05:00' && trabajadoSec === JORNADA_MAX_SEC;
    results.push({
      name: 'Caso D — Cierre retroactivo En_Jornada sin pausas',
      pass,
      detail: `Entrada 09:00 → salida calculada ${hora_salida} (esp. 17:05:00) | Neto: ${secToHms(trabajadoSec)} (esp. 08:05:00)`,
    });
  }

  // Caso E — Cierre retroactivo En_Pausa (salida = hora inicio última pausa)
  {
    const ev = [
      { tipo: 'entrada', hora: '08:00:00' },
      { tipo: 'pausa',   hora: '14:30:00' }, // 6h30m trabajadas antes de pausar
    ];
    const hora_salida = ev[ev.length - 1].hora; // '14:30:00'
    const endSec      = timeToSec(hora_salida);
    const evConSalida = [...ev, { tipo: 'salida', hora: hora_salida, retroactivo: true }];
    const { trabajadoSec } = calcTiempos(evConSalida, endSec);
    const expectedTrabajado = (6 * 3600 + 30 * 60); // 6h30m
    const pass = hora_salida === '14:30:00' && trabajadoSec === expectedTrabajado;
    results.push({
      name: 'Caso E — Cierre retroactivo En_Pausa (salida = inicio pausa)',
      pass,
      detail: `Última pausa a las 14:30:00 → hora_salida=${hora_salida} | Neto: ${secToLabel(trabajadoSec)} (esp. 6h 30m)`,
    });
  }

  return results;
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function RelojDigital({ now }) {
  return (
    <div className="flex items-center justify-center gap-2 sm:gap-3 py-4 sm:py-5">
      <Clock size={28} className="text-google-blue flex-shrink-0 hidden sm:block" />
      <span className="text-4xl sm:text-6xl font-mono font-bold text-google-dark tracking-widest tabular-nums select-none">
        {pad(now.getHours())}
        <span className="text-google-blue animate-pulse">:</span>
        {pad(now.getMinutes())}
        <span className="text-google-blue animate-pulse">:</span>
        {pad(now.getSeconds())}
      </span>
    </div>
  );
}

// Celda de pausa: "HH:MM:SS ──Nm──→ HH:MM:SS"
function PausaArrowCell({ inicio, fin, durMin }) {
  if (!inicio) {
    return <td className="px-3 py-3 text-center text-google-gray text-xs">—</td>;
  }
  return (
    <td className="px-2 py-3">
      <div className="flex items-center justify-center gap-1">
        <span className="text-xs font-mono text-orange-600 font-semibold whitespace-nowrap">{inicio}</span>
        <div className="flex flex-col items-center mx-1 min-w-[34px]">
          <span className="text-[10px] font-bold text-indigo-500 leading-none">
            {durMin != null ? `${durMin}m` : '…'}
          </span>
          <span className="text-google-gray text-sm leading-none">→</span>
        </div>
        <span className="text-xs font-mono text-green-600 font-semibold whitespace-nowrap">{fin ?? '—'}</span>
      </div>
    </td>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
export default function ControlHorario() {
  const { currentUser, users } = useAuth();
  const username = currentUser?.username ?? '';
  const isAdmin  = ADMINS.includes(username.toLowerCase());

  // ── Detección de móvil ───────────────────────────────────────────────────
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);

  // ── Reloj en tiempo real ─────────────────────────────────────────────────
  const [now, setNow] = useState(new Date());

  // ── Datos de fichaje ─────────────────────────────────────────────────────
  const [hoyFichaje,  setHoyFichaje]  = useState(null);
  const [loadingHoy,  setLoadingHoy]  = useState(true);
  const [historico,   setHistorico]   = useState([]);
  const [loadingHist, setLoadingHist] = useState(true);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [confirmando, setConfirmando] = useState(null); // 'entrada' | 'salida'
  const [saving,      setSaving]      = useState(false);
  const [savedMsg,    setSavedMsg]    = useState('');

  // ── Panel admin ──────────────────────────────────────────────────────────
  const [allFichajes,   setAllFichajes]   = useState([]);
  const [loadingAll,    setLoadingAll]    = useState(false);
  const [filtroUsuario, setFiltroUsuario] = useState('');
  const [filtroDesde,   setFiltroDesde]   = useState('');
  const [filtroHasta,   setFiltroHasta]   = useState('');

  // ── Refs para evitar re-triggers ─────────────────────────────────────────
  const savingRef      = useRef(false);
  const autoTriggerRef = useRef(null); // hora del último evento work que disparó auto-pausa
  const autoStopRef    = useRef(null); // id del fichaje al que ya se aplicó la parada automática
  const hoyRef         = useRef(null);

  // Mantener hoyRef sincronizado con state
  useEffect(() => { hoyRef.current = hoyFichaje; }, [hoyFichaje]);

  // ── Timer principal (1 segundo) ──────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Cargar fichaje de hoy ────────────────────────────────────────────────
  const loadHoy = useCallback(async () => {
    setLoadingHoy(true);
    const { data } = await supabase
      .from('fichajes')
      .select('id, hora_entrada, hora_salida, eventos')
      .eq('usuario', username)
      .eq('fecha', todayStr())
      .maybeSingle();
    const rec = data ? { ...data, eventos: data.eventos ?? [] } : null;
    setHoyFichaje(rec);
    hoyRef.current = rec;
    setLoadingHoy(false);
  }, [username]);

  // ── Cargar histórico + purgar > 45 días + cierre retroactivo ─────────────
  const loadHistorico = useCallback(async () => {
    setLoadingHist(true);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 45);
    await supabase.from('fichajes').delete()
      .eq('usuario', username).lt('fecha', cutoff.toISOString().split('T')[0]);

    const { data } = await supabase
      .from('fichajes')
      .select('id, fecha, hora_entrada, hora_salida, eventos')
      .eq('usuario', username)
      .order('fecha', { ascending: false });

    const registros = (data ?? []).map(r => ({ ...r, eventos: r.eventos ?? [] }));

    // ── Cierre retroactivo de jornadas olvidadas ────────────────────────────
    // Si el usuario se marchó sin fichar salida, al día siguiente el sistema
    // detecta el registro abierto y lo cierra automáticamente:
    //   • En_Pausa  → hora_salida = hora de inicio de la última pausa.
    //   • En_Jornada → hora_salida = hora en que se habrían completado 8h05m
    //                  netas desde la hora de entrada (incluyendo las pausas).
    const hoy = todayStr();
    const staleRecords = registros.filter(f => {
      if (f.fecha >= hoy || f.hora_salida) return false;
      const est = deriveEstado(f.eventos);
      return est === 'En_Jornada' || est === 'En_Pausa';
    });

    for (const stale of staleRecords) {
      const eventos = stale.eventos;
      const estado  = deriveEstado(eventos);
      let hora_salida = null;

      if (estado === 'En_Pausa') {
        // La última pausa registrada es el momento en que dejaron de trabajar
        hora_salida = eventos[eventos.length - 1].hora;
      } else {
        // En_Jornada: encontrar cuándo se habrían cumplido 8h05m netas
        const lastWorkEv = [...eventos].reverse().find(
          e => e.tipo === 'entrada' || e.tipo === 'vuelta'
        );
        if (lastWorkEv) {
          const lastWorkSec     = timeToSec(lastWorkEv.hora);
          // Tiempo neto trabajado ANTES del último tramo activo
          const workedBeforeSec = calcTiempos(eventos, lastWorkSec).trabajadoSec;
          const remainingSec    = Math.max(0, JORNADA_MAX_SEC - workedBeforeSec);
          // Hora de salida = inicio del último tramo + segundos restantes (max medianoche)
          hora_salida = secToHms(Math.min(lastWorkSec + remainingSec, 86399));
        }
      }

      if (!hora_salida) continue;

      const nuevosEventos = [...eventos, { tipo: 'salida', hora: hora_salida, retroactivo: true }];
      await supabase.from('fichajes')
        .update({ hora_salida, eventos: nuevosEventos })
        .eq('id', stale.id);
    }

    if (staleRecords.length > 0) {
      // Recargar los registros actualizados tras los cierres retroactivos
      const { data: data2 } = await supabase
        .from('fichajes')
        .select('id, fecha, hora_entrada, hora_salida, eventos')
        .eq('usuario', username)
        .order('fecha', { ascending: false });
      setHistorico((data2 ?? []).map(r => ({ ...r, eventos: r.eventos ?? [] })));
    } else {
      setHistorico(registros);
    }

    setLoadingHist(false);
  }, [username]);

  // ── Cargar todos (admin) ─────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAll(true);
    let q = supabase.from('fichajes')
      .select('id, usuario, fecha, hora_entrada, hora_salida, eventos')
      .order('fecha',   { ascending: false })
      .order('usuario', { ascending: true });
    if (filtroUsuario) q = q.eq('usuario',  filtroUsuario);
    if (filtroDesde)   q = q.gte('fecha',   filtroDesde);
    if (filtroHasta)   q = q.lte('fecha',   filtroHasta);
    const { data } = await q;
    setAllFichajes((data ?? []).map(r => ({ ...r, eventos: r.eventos ?? [] })));
    setLoadingAll(false);
  }, [isAdmin, filtroUsuario, filtroDesde, filtroHasta]);

  useEffect(() => { loadHoy(); loadHistorico(); }, [loadHoy, loadHistorico]);
  useEffect(() => { if (isAdmin) loadAll(); }, [loadAll, isAdmin]);

  // ── Registrar evento en BD ───────────────────────────────────────────────
  const registrarEvento = useCallback(async (tipo, obligatoria = false, autoParado = false) => {
    const rec  = hoyRef.current;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const hora  = nowTimeStr();
    const newEv = tipo === 'pausa'
      ? { tipo, hora, obligatoria }
      : (tipo === 'salida' && autoParado)
        ? { tipo, hora, autoParado: true }
        : { tipo, hora };
    const eventos  = [...(rec?.eventos ?? []), newEv];
    const updates  = { eventos };
    if (tipo === 'salida') updates.hora_salida = hora;

    let result;
    if (!rec) {
      const { data } = await supabase.from('fichajes')
        .insert([{ usuario: username, fecha: todayStr(), hora_entrada: hora, eventos }])
        .select('id, hora_entrada, hora_salida, eventos').single();
      result = data;
    } else {
      const { data } = await supabase.from('fichajes')
        .update(updates).eq('id', rec.id)
        .select('id, hora_entrada, hora_salida, eventos').single();
      result = data;
    }

    if (result) {
      const updated = { ...result, eventos: result.eventos ?? [] };
      setHoyFichaje(updated);
      hoyRef.current = updated;
      const MSGS = {
        entrada: `Entrada registrada a las ${hora}`,
        salida:  autoParado ? `Jornada detenida automáticamente a las ${hora} (límite 8h 05m)` : `Salida registrada a las ${hora}`,
        pausa:   obligatoria ? `Pausa obligatoria activada a las ${hora}` : `Jornada pausada a las ${hora}`,
        vuelta:  `Jornada reactivada a las ${hora}`,
      };
      setSavedMsg(MSGS[tipo] ?? '');
      setTimeout(() => setSavedMsg(''), 5000);
    }

    await loadHistorico();
    if (isAdmin) await loadAll();
    savingRef.current = false;
    setSaving(false);
  }, [username, isAdmin, loadHistorico, loadAll]);

  // ── Auto-pausa obligatoria (corre en cada tick de `now`) ─────────────────
  useEffect(() => {
    const rec = hoyRef.current;
    if (!rec || savingRef.current) return;
    const eventos = rec.eventos ?? [];
    if (deriveEstado(eventos) !== 'En_Jornada') return;
    const nowSec = timeToSec(nowTimeStr());
    const { consecutivoSec } = calcTiempos(eventos, nowSec);
    if (consecutivoSec < PAUSA_OBLIG_SEC) return;
    // Identificar el evento work actual para no disparar dos veces
    const lastWork = [...eventos].reverse().find(e => e.tipo === 'entrada' || e.tipo === 'vuelta');
    if (!lastWork || autoTriggerRef.current === lastWork.hora) return;
    autoTriggerRef.current = lastWork.hora;
    registrarEvento('pausa', true);
  }, [now, registrarEvento]);

  // ── Parada automática al alcanzar 8h05m de tiempo activo neto ────────────
  useEffect(() => {
    const rec = hoyRef.current;
    if (!rec || savingRef.current) return;
    if (autoStopRef.current === rec.id) return; // ya procesado para este fichaje
    const eventos = rec.eventos ?? [];
    const estado  = deriveEstado(eventos);
    if (estado === 'Finalizada' || estado === 'No_Iniciada') return;
    const nowSec = timeToSec(nowTimeStr());
    const { trabajadoSec } = calcTiempos(eventos, nowSec);
    if (trabajadoSec < JORNADA_MAX_SEC) return;
    autoStopRef.current = rec.id;
    registrarEvento('salida', false, true);
  }, [now, registrarEvento]);

  // ── Handlers UI ──────────────────────────────────────────────────────────
  const handleFichar = (tipo) => {
    setConfirmando(null);
    registrarEvento(tipo);
  };

  const handlePausaToggle = () => {
    const est = deriveEstado(hoyRef.current?.eventos ?? []);
    if (est === 'En_Jornada')  registrarEvento('pausa', false);
    else if (est === 'En_Pausa') registrarEvento('vuelta');
  };

  // ── Banco de pruebas (solo DEV, se ejecuta una vez al montar) ────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mockTestResults = useMemo(() => (import.meta.env.DEV ? runMockTests() : null), []);

  // ── Estado derivado (se recalcula cada segundo) ───────────────────────────
  const eventos       = hoyFichaje?.eventos ?? [];
  const estadoJornada = deriveEstado(eventos);
  const nowSec        = timeToSec(now.toTimeString().slice(0, 8));
  const { trabajadoSec, consecutivoSec } = calcTiempos(eventos, nowSec);

  // Pausa obligatoria activa
  const lastPausa          = [...eventos].reverse().find(e => e.tipo === 'pausa');
  const esPausaObligatoria = estadoJornada === 'En_Pausa' && lastPausa?.obligatoria === true;
  const descansoAnteSec    = esPausaObligatoria ? calcDescansoAcumuladoPrevio(eventos) : 0;
  const pausaActualSec     = esPausaObligatoria
    ? Math.max(0, nowSec - timeToSec(lastPausa.hora)) : 0;
  const totalDescansadoSec = descansoAnteSec + pausaActualSec;
  const restanteSec        = Math.max(0, DESCANSO_REQ_SEC - totalDescansadoSec);
  const canReactivate      = !esPausaObligatoria || restanteSec <= 0;

  // Aviso de pausa próxima (última hora antes del límite)
  const minutosParaOblig   = Math.round((PAUSA_OBLIG_SEC - consecutivoSec) / 60);
  const avisoCercano       = estadoJornada === 'En_Jornada' && consecutivoSec >= 4.5 * 3600;

  // ── Tabla histórica dinámica ──────────────────────────────────────────────
  const maxPausas = useMemo(
    () => Math.max(0, ...historico.map(r => extractPausas(r.eventos).length)),
    [historico]
  );

  // Trabajadores para selector admin
  const trabajadores = useMemo(
    () => [...new Set(users.map(u => u.username))].sort(),
    [users]
  );

  // ── Exportar Excel ───────────────────────────────────────────────────────
  const exportarExcel = async () => {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'CRM Grupo Avedie';
    const ws = wb.addWorksheet('Fichajes');
    ws.columns = [
      { header: 'Trabajador', key: 'usuario',      width: 22 },
      { header: 'Fecha',      key: 'fecha',         width: 14 },
      { header: 'H. Entrada', key: 'hora_entrada',  width: 13 },
      { header: 'H. Salida',  key: 'hora_salida',   width: 13 },
      { header: 'Total',      key: 'total',         width: 11 },
    ];
    ws.getRow(1).eachCell((cell) => {
      cell.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A73E8' } };
      cell.alignment = { horizontal: 'center' };
    });
    allFichajes.forEach((f) => {
      const endSec    = f.hora_salida ? timeToSec(f.hora_salida) : 0;
      const autoStop  = isAutoParado(f.eventos);
      const retroStop = !autoStop && isRetroactivoCerrado(f.eventos);
      const total  = autoStop
        ? '8h 05m (Parado Automático)'
        : retroStop
          ? `${secToLabel(calcTiempos(f.eventos, endSec).trabajadoSec)} (Cierre Retroactivo)`
          : f.hora_salida
            ? secToLabel(calcTiempos(f.eventos, endSec).trabajadoSec)
            : '—';
      ws.addRow({
        usuario:      f.usuario,
        fecha:        fmtFecha(f.fecha),
        hora_entrada: f.hora_entrada ?? '—',
        hora_salida:  f.hora_salida  ?? '—',
        total,
      });
    });
    ws.autoFilter = { from: 'A1', to: 'E1' };
    const d   = new Date();
    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
      `Fichajes_${d.getFullYear()}_${pad(d.getMonth() + 1)}_${pad(d.getDate())}.xlsx`
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-5xl mx-auto">

      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-semibold text-google-dark flex items-center gap-2">
          <Clock size={24} className="text-google-blue" />
          Control de Horario
        </h1>
        <p className="text-sm text-google-gray mt-0.5">Registra tu entrada y salida diaria</p>
      </div>

      {/* Aviso móvil */}
      {isMobile && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Smartphone size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 font-medium">
            Los fichajes solo pueden registrarse desde un ordenador. El historial está disponible en modo lectura.
          </p>
        </div>
      )}

      {/* ── Tarjeta de fichaje ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-google border border-google-border p-4 md:p-6 text-center">

        <RelojDigital now={now} />

        {/* Indicadores de estado — 2 col en móvil, 4 col en escritorio */}
        <div className="grid grid-cols-2 md:grid-cols-4 mb-5 md:mb-6 bg-google-bg rounded-xl overflow-hidden border border-google-border">
          <div className="px-4 py-3 border-r border-b border-google-border md:border-b-0">
            <p className="text-[11px] font-medium text-google-gray uppercase tracking-wide mb-0.5">Entrada</p>
            <p className={`text-sm md:text-base font-mono font-bold ${eventos.find(e => e.tipo === 'entrada') ? 'text-blue-600' : 'text-google-gray'}`}>
              {eventos.find(e => e.tipo === 'entrada')?.hora ?? '—'}
            </p>
          </div>
          <div className="px-4 py-3 border-b border-google-border md:border-b-0 md:border-r">
            <p className="text-[11px] font-medium text-google-gray uppercase tracking-wide mb-0.5">Tiempo activo</p>
            <p className={`text-sm md:text-base font-mono font-bold ${trabajadoSec > 0 ? 'text-google-dark' : 'text-google-gray'}`}>
              {estadoJornada !== 'No_Iniciada' ? secToHms(trabajadoSec) : '—'}
            </p>
          </div>
          <div className="px-4 py-3 border-r border-google-border">
            <p className="text-[11px] font-medium text-google-gray uppercase tracking-wide mb-0.5">Estado</p>
            <p className={`text-sm font-semibold ${
              estadoJornada === 'En_Jornada'  ? 'text-green-600' :
              estadoJornada === 'En_Pausa'    ? 'text-orange-500' :
              estadoJornada === 'Finalizada'  ? 'text-blue-600' : 'text-google-gray'
            }`}>
              {estadoJornada === 'No_Iniciada' ? 'Sin iniciar' :
               estadoJornada === 'En_Jornada'  ? 'Trabajando' :
               estadoJornada === 'En_Pausa'    ? 'En pausa' : 'Finalizada'}
            </p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-google-gray uppercase tracking-wide mb-0.5">Salida</p>
            <p className={`text-sm md:text-base font-mono font-bold ${hoyFichaje?.hora_salida ? 'text-red-600' : 'text-google-gray'}`}>
              {hoyFichaje?.hora_salida ?? '—'}
            </p>
          </div>
        </div>

        {/* Botones de fichaje — ocultos en móvil (política: solo desde PC) */}
        {!isMobile && (
          <div className="flex items-center justify-center gap-3 flex-wrap">

            {/* Entrada */}
            <button
              onClick={() => setConfirmando('entrada')}
              disabled={loadingHoy || estadoJornada !== 'No_Iniciada' || saving}
              className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-white font-semibold text-sm
                bg-blue-600 hover:bg-blue-700 active:bg-blue-800
                disabled:bg-blue-200 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <LogIn size={19} />
              Fichar Entrada
            </button>

            {/* Pausar / Reactivar — solo visible si hay jornada activa o pausada */}
            {(estadoJornada === 'En_Jornada' || estadoJornada === 'En_Pausa') && (
              <button
                onClick={handlePausaToggle}
                disabled={saving || (esPausaObligatoria && !canReactivate)}
                className={`flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-white font-semibold text-sm
                  transition-colors shadow-sm
                  ${estadoJornada === 'En_Pausa'
                    ? canReactivate
                      ? 'bg-green-600 hover:bg-green-700 active:bg-green-800 disabled:bg-green-200'
                      : 'bg-green-300 cursor-not-allowed'
                    : 'bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:bg-orange-200'
                  }
                  disabled:cursor-not-allowed`}
              >
                {estadoJornada === 'En_Pausa' ? (
                  esPausaObligatoria && !canReactivate ? (
                    <><Lock size={16} /> Reactivar en {secToHms(restanteSec)}</>
                  ) : (
                    <><Play size={19} /> Reactivar Jornada</>
                  )
                ) : (
                  <><Pause size={19} /> Pausar Jornada</>
                )}
              </button>
            )}

            {/* Salida */}
            <button
              onClick={() => setConfirmando('salida')}
              disabled={loadingHoy || estadoJornada !== 'En_Jornada' || saving}
              className="flex items-center gap-2.5 px-7 py-3.5 rounded-xl text-white font-semibold text-sm
                bg-red-600 hover:bg-red-700 active:bg-red-800
                disabled:bg-red-200 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <LogOut size={19} />
              Fichar Salida
            </button>
          </div>
        )}

        {/* Banner de pausa obligatoria */}
        {esPausaObligatoria && (
          <div className={`mt-4 flex items-center justify-center gap-2 text-sm rounded-xl px-4 py-2.5 border ${
            canReactivate
              ? 'text-green-700 bg-green-50 border-green-200'
              : 'text-amber-700 bg-amber-50 border-amber-200'
          }`}>
            {canReactivate ? <CheckCircle size={15} className="flex-shrink-0" /> : <Lock size={15} className="flex-shrink-0" />}
            <span>
              {canReactivate
                ? 'Descanso cumplido. Puedes reactivar tu jornada.'
                : `Pausa obligatoria por convenio · Descanso restante: ${secToLabel(restanteSec)}`}
            </span>
          </div>
        )}

        {/* Aviso de pausa próxima */}
        {avisoCercano && !esPausaObligatoria && (
          <div className="mt-3 flex items-center justify-center gap-1.5 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>Pausa obligatoria en <strong>{minutosParaOblig} min</strong></span>
          </div>
        )}

        {/* Mensaje de éxito / estado */}
        <div className="mt-3 min-h-[20px]">
          {savedMsg ? (
            <p className={`text-sm font-medium flex items-center justify-center gap-1.5 ${
              isAutoParado(eventos) ? 'text-amber-600' : 'text-green-600'
            }`}>
              {isAutoParado(eventos) ? <AlertCircle size={14} /> : <CheckCircle size={14} />} {savedMsg}
            </p>
          ) : estadoJornada === 'Finalizada' && isAutoParado(eventos) ? (
            <p className="text-sm text-amber-600 font-medium flex items-center justify-center gap-1.5">
              <AlertCircle size={14} /> Jornada detenida automáticamente · Límite 8h 05m alcanzado
            </p>
          ) : estadoJornada === 'Finalizada' ? (
            <p className="text-sm text-green-600 font-medium flex items-center justify-center gap-1.5">
              <CheckCircle size={14} /> Jornada completada · Total trabajado: {secToLabel(trabajadoSec)}
            </p>
          ) : estadoJornada === 'En_Pausa' && !esPausaObligatoria ? (
            <p className="text-sm text-orange-500 flex items-center justify-center gap-1.5">
              <Pause size={14} /> Pausa voluntaria activa
            </p>
          ) : estadoJornada === 'En_Jornada' && consecutivoSec > 0 ? (
            <p className="text-sm text-google-gray">
              Tiempo consecutivo actual: <span className="font-mono font-semibold text-google-dark">{secToLabel(consecutivoSec)}</span>
            </p>
          ) : estadoJornada === 'No_Iniciada' ? (
            <p className="text-sm text-google-gray">Registra tu entrada para comenzar la jornada.</p>
          ) : null}
        </div>
      </div>

      {/* ── Histórico personal ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl shadow-google border border-google-border overflow-hidden">
        <div className="px-6 py-4 border-b border-google-border flex items-center gap-2">
          <CalendarDays size={18} className="text-google-blue" />
          <h2 className="text-base font-semibold text-google-dark">Mis registros</h2>
          <span className="ml-auto text-xs text-google-gray bg-google-bg px-2 py-0.5 rounded-full">
            Últimos 45 días
          </span>
        </div>

        {loadingHist ? (
          <div className="py-12 text-center text-google-gray text-sm">Cargando registros…</div>
        ) : historico.length === 0 ? (
          <div className="py-12 text-center text-google-gray text-sm">Sin registros en los últimos 45 días</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-google-bg border-b border-google-border text-xs font-semibold text-google-gray uppercase tracking-wide">
                  <th className="px-5 py-3 text-left sticky left-0 bg-google-bg z-10">Fecha</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Entrada</th>
                  {Array.from({ length: maxPausas }, (_, i) => (
                    <th key={i} className="px-2 py-3 text-center whitespace-nowrap text-indigo-500">
                      Pausa {i + 1}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-center whitespace-nowrap">Salida</th>
                  <th className="px-5 py-3 text-center whitespace-nowrap">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-google-border">
                {historico.map((f) => {
                  const pausas      = extractPausas(f.eventos);
                  const endSec      = f.hora_salida ? timeToSec(f.hora_salida) : null;
                  const totalSec    = endSec !== null ? calcTiempos(f.eventos, endSec).trabajadoSec : null;
                  const autoStop    = isAutoParado(f.eventos);
                  const retroStop   = !autoStop && isRetroactivoCerrado(f.eventos);
                  return (
                    <tr key={f.id} className="hover:bg-google-bg/40 transition-colors">
                      <td className="px-5 py-3 font-semibold text-google-dark sticky left-0 bg-white z-10">
                        {fmtFecha(f.fecha)}
                      </td>
                      <td className="px-4 py-3 text-center font-mono text-blue-600 text-xs font-semibold">
                        {f.hora_entrada ?? '—'}
                      </td>
                      {Array.from({ length: maxPausas }, (_, i) => (
                        <PausaArrowCell
                          key={i}
                          inicio={pausas[i]?.inicio ?? null}
                          fin={pausas[i]?.fin    ?? null}
                          durMin={pausas[i]?.durMin ?? null}
                        />
                      ))}
                      <td className="px-4 py-3 text-center font-mono text-red-600 text-xs font-semibold">
                        {f.hora_salida ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-center font-mono font-bold">
                        {autoStop ? (
                          <span className="text-amber-600">
                            8h 05m{' '}
                            <span className="font-normal text-[10px] whitespace-nowrap">(Parado Automático)</span>
                          </span>
                        ) : retroStop ? (
                          <span className="text-indigo-600">
                            {secToLabel(totalSec ?? 0)}{' '}
                            <span className="font-normal text-[10px] whitespace-nowrap">(Cierre Retroactivo)</span>
                          </span>
                        ) : totalSec !== null ? (
                          <span className="text-green-600">{secToLabel(totalSec)}</span>
                        ) : (
                          <span className="text-google-gray font-normal">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Panel de administración ────────────────────────────────────────── */}
      {isAdmin && (
        <div className="bg-white rounded-2xl shadow-google border border-google-border overflow-hidden">
          <div className="px-6 py-4 border-b border-google-border bg-indigo-50 flex items-center gap-2">
            <Users size={18} className="text-indigo-600" />
            <h2 className="text-base font-semibold text-google-dark">Panel de Administración</h2>
            <span className="ml-1 text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full font-medium">
              Solo administradores
            </span>
          </div>

          <div className="px-6 py-4 border-b border-google-border flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Trabajador</label>
              <select
                value={filtroUsuario}
                onChange={(e) => setFiltroUsuario(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">Todos</option>
                {trabajadores.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Desde</label>
              <input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="input-field text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-google-gray mb-1.5">Hasta</label>
              <input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="input-field text-sm" />
            </div>
            <button
              onClick={exportarExcel}
              disabled={allFichajes.length === 0}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white
                bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileSpreadsheet size={16} />
              Exportar Excel
            </button>
          </div>

          {loadingAll ? (
            <div className="py-12 text-center text-google-gray text-sm">Cargando…</div>
          ) : allFichajes.length === 0 ? (
            <div className="py-12 text-center text-google-gray text-sm">
              No hay registros para los filtros seleccionados
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-google-bg border-b border-google-border">
                    {['Trabajador', 'Fecha', 'H. Entrada', 'H. Salida', 'Total'].map(h => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-google-gray uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-google-border">
                  {allFichajes.map((f) => {
                    const endSec    = f.hora_salida ? timeToSec(f.hora_salida) : null;
                    const totalSec  = endSec !== null ? calcTiempos(f.eventos, endSec).trabajadoSec : null;
                    const autoStop  = isAutoParado(f.eventos);
                    const retroStop = !autoStop && isRetroactivoCerrado(f.eventos);
                    return (
                      <tr key={f.id} className="hover:bg-google-bg/50 transition-colors">
                        <td className="px-6 py-3 font-medium text-google-dark">{f.usuario}</td>
                        <td className="px-6 py-3 text-google-dark">{fmtFecha(f.fecha)}</td>
                        <td className="px-6 py-3 font-mono text-blue-600">{f.hora_entrada ?? '—'}</td>
                        <td className="px-6 py-3 font-mono text-red-600">{f.hora_salida  ?? '—'}</td>
                        <td className="px-6 py-3 font-mono font-semibold">
                          {autoStop ? (
                            <span className="text-amber-600">
                              8h 05m <span className="font-normal text-xs">(Parado Automático)</span>
                            </span>
                          ) : retroStop ? (
                            <span className="text-indigo-600">
                              {secToLabel(totalSec ?? 0)}{' '}
                              <span className="font-normal text-xs">(Cierre Retroactivo)</span>
                            </span>
                          ) : totalSec !== null ? (
                            <span className="text-green-600">{secToLabel(totalSec)}</span>
                          ) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="px-6 py-2 text-xs text-google-gray border-t border-google-border">
                {allFichajes.length} registro{allFichajes.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Panel de pruebas internas (solo entorno DEV) ──────────────────── */}
      {import.meta.env.DEV && mockTestResults && (
        <div className="bg-white rounded-2xl border-2 border-amber-300 overflow-hidden">
          <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0" />
            <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wide">
              Banco de pruebas internas — Solo visible en DEV
            </h2>
            <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
              mockTestResults.every(r => r.pass)
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {mockTestResults.filter(r => r.pass).length}/{mockTestResults.length} OK
            </span>
          </div>
          <div className="px-6 py-4 space-y-3">
            {mockTestResults.map((r, i) => (
              <div
                key={i}
                className={`rounded-xl px-4 py-3 border ${
                  r.pass
                    ? 'bg-green-50 border-green-200'
                    : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {r.pass
                    ? <CheckCircle size={15} className="text-green-600 flex-shrink-0" />
                    : <AlertCircle size={15} className="text-red-600 flex-shrink-0" />
                  }
                  <span className={`text-sm font-semibold ${r.pass ? 'text-green-700' : 'text-red-700'}`}>
                    {r.name}
                  </span>
                  <span className={`ml-auto text-xs font-bold ${r.pass ? 'text-green-600' : 'text-red-600'}`}>
                    {r.pass ? 'PASS ✓' : 'FAIL ✗'}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-google-gray leading-relaxed break-all">
                  {r.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal de confirmación ──────────────────────────────────────────── */}
      {confirmando && (
        <ConfirmActionModal
          title={confirmando === 'entrada' ? 'Confirmar Entrada' : 'Confirmar Salida'}
          message="Esta acción no se puede modificar. ¿Está seguro de que desea registrar la hora?"
          confirmLabel={confirmando === 'entrada' ? 'Registrar Entrada' : 'Registrar Salida'}
          confirmClassName={
            confirmando === 'entrada' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'
          }
          onConfirm={() => handleFichar(confirmando)}
          onCancel={() => setConfirmando(null)}
        />
      )}
    </div>
  );
}
