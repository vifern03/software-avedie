/**
 * Lectura de curvas horarias de consumo (CSV de distribuidora / Datadis).
 *
 * Formatos admitidos (separador ; o ,):
 *   fecha;hora;kwh                 fecha DD/MM/AAAA o AAAA-MM-DD o AAAA/MM/DD
 *   CUPS;Fecha;Hora;Consumo_kWh;…  (Datadis)
 * "hora" es el índice 1..24 (23 o 25 en los días de cambio de hora) o "HH:MM"
 * de FIN de la hora (01:00 = 00:00–01:00). Se convierte a hora de INICIO local
 * del suministro (Europe/Madrid) sin usar la zona horaria del ordenador.
 */
import { horaInicioDesdeIndice, diaSemana } from './calendario.js';

/** 23 h el último domingo de marzo, 25 h el último domingo de octubre (hora oficial peninsular). */
export function horasDelDiaMadrid(iso) {
  const [, m, d] = iso.split('-').map(Number);
  if ((m === 3 || m === 10) && diaSemana(iso) === 0 && d > 24) return m === 3 ? 23 : 25;
  return 24;
}

function fechaISO(s) {
  const t = String(s).trim();
  let m = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function numero(s) {
  const t = String(s).trim();
  if (!t) return NaN;
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
}

/**
 * @returns {{ curva: {fecha,hora,kwh}[], errores: string[], horasPorDia: Record<string, number> }}
 */
export function parsearCurvaCSV(texto, { desde, hasta } = {}) {
  const errores = [];
  const lineas = String(texto || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lineas.length) return { curva: [], errores: ['El archivo está vacío.'], horasPorDia: {} };
  const sep = lineas[0].includes(';') ? ';' : ',';
  let cab = lineas[0].split(sep).map(c => c.trim().toLowerCase());
  let iF = cab.findIndex(c => c.startsWith('fecha'));
  let iH = cab.findIndex(c => c.startsWith('hora'));
  let iK = cab.findIndex(c => c.includes('kwh') || c.startsWith('consumo') || c === 'ae');
  let datos = lineas.slice(1);
  if (iF === -1 || iH === -1 || iK === -1) {
    // Sin cabecera: fecha;hora;kwh
    iF = 0; iH = 1; iK = 2; datos = lineas;
  }
  const filas = [];
  for (const [n, l] of datos.entries()) {
    const c = l.split(sep);
    const fecha = fechaISO(c[iF] || '');
    const hRaw = String(c[iH] || '').trim();
    const idx = hRaw.includes(':') ? Number(hRaw.split(':')[0]) : Number(hRaw);
    const kwh = numero(c[iK] ?? '');
    if (!fecha || !(idx >= 1 && idx <= 25) || !isFinite(kwh)) { errores.push(`Línea ${n + 2}: formato no reconocido (${l.slice(0, 40)})`); continue; }
    filas.push({ fecha, idx: idx === 0 ? 24 : idx, kwh });
  }
  const horasPorDia = {};
  for (const f of filas) horasPorDia[f.fecha] = horasDelDiaMadrid(f.fecha);
  for (const f of filas) if (f.idx > horasPorDia[f.fecha]) errores.push(`${f.fecha}: índice horario ${f.idx} imposible para un día de ${horasPorDia[f.fecha]} h.`);
  const curva = [];
  for (const f of filas) {
    if (desde && f.fecha < desde) continue;
    if (hasta && f.fecha > hasta) continue;
    curva.push({ fecha: f.fecha, hora: horaInicioDesdeIndice(f.idx, horasPorDia[f.fecha]), kwh: f.kwh });
  }
  if (!curva.length) errores.push('La curva no tiene datos dentro del periodo de la factura.');
  return { curva, errores, horasPorDia };
}
