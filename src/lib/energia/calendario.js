/**
 * Calendario de periodos horarios de los peajes eléctricos (sistema peninsular).
 *
 * Fuente oficial: Circular 3/2020 de la CNMC (BOE-A-2020-1066), art. 7,
 * https://www.boe.es/buscar/act.php?id=BOE-A-2020-1066  (consultada 18/09/2026).
 *   - Temporadas peninsulares (3.0TD/6.1TD): alta = ene, feb, jul, dic;
 *     media-alta = mar, nov; media = jun, ago, sep; baja = abr, may, oct.
 *   - Tipo de día: A/B/B1/C = lunes a viernes no festivos de cada temporada;
 *     D = sábados, domingos, festivos y 6 de enero.
 *   - "Se consideran … días festivos los de ámbito nacional, definidos como tales
 *     en el calendario oficial del año correspondiente, con exclusión tanto de
 *     los festivos sustituibles como de los que no tienen fecha fija."
 *   - 3.0TD/6.1TD, días A–C: 0–8 h → P6; 9–14 h y 18–22 h → periodo "punta" de
 *     la temporada; 8–9 h, 14–18 h y 22–24 h → periodo "llano" de la temporada.
 *       A: P1 / P2 · B: P2 / P3 · B1: P3 / P4 · C: P4 / P5. Días D: todo P6.
 *   - 2.0TD (energía): punta 10–14 h y 18–22 h; llano 8–10, 14–18 y 22–24 h;
 *     valle 0–8 h y todas las horas de sábados, domingos, 6 de enero y festivos
 *     nacionales.
 *
 * Solo se implementa el calendario PENINSULAR. Baleares, Canarias, Ceuta y Melilla
 * tienen temporadas propias: el motor avisa y no clasifica esos territorios.
 *
 * Horas: hora oficial local del suministro (Europe/Madrid). Todas las funciones
 * trabajan con fechas civiles 'YYYY-MM-DD' y horas de inicio 0–23 SIN pasar por la
 * zona horaria del ordenador (el día de la semana se calcula con Date.UTC).
 */

/**
 * Festivos nacionales de fecha fija NO sustituibles usados por la Circular 3/2020
 * + 6 de enero (citado expresamente en el art. 7). Viernes Santo es festivo
 * nacional pero NO tiene fecha fija → no cuenta como día D en el peaje.
 * Los festivos que alguna comunidad sustituye en un año dado se excluyen por la
 * propia Circular; esta lista recoge los que el calendario oficial fija con
 * carácter nacional no sustituible.
 */
const FESTIVOS_FIJOS_MMDD = ['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25'];

export function festivosNacionales(year) {
  return FESTIVOS_FIJOS_MMDD.map(md => `${year}-${md}`);
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher). */
export function domingoPascua(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function viernesSanto(year) {
  return sumarDias(domingoPascua(year), -2);
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

/** 0 = domingo … 6 = sábado, sin depender de la zona horaria local. */
export function diaSemana(iso) {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function sumarDias(iso, n) {
  const { y, m, d } = parseISO(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Días entre dos fechas civiles, ambos incluidos (convención de facturación "del X al Y"). */
export function diasInclusivos(desdeISO, hastaISO) {
  const a = parseISO(desdeISO), b = parseISO(hastaISO);
  const ms = Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d);
  return Math.round(ms / 86400000) + 1;
}

/** Lista de fechas 'YYYY-MM-DD' entre desde y hasta (ambas incluidas). */
export function rangoFechas(desdeISO, hastaISO) {
  const out = [];
  for (let f = desdeISO; f <= hastaISO; f = sumarDias(f, 1)) out.push(f);
  return out;
}

export function esFestivoNacional(iso) {
  return festivosNacionales(parseISO(iso).y).includes(iso);
}

/** true si el día es de tipo D (sábado, domingo, festivo nacional o 6 de enero). */
export function esDiaTipoD(iso) {
  const w = diaSemana(iso);
  return w === 0 || w === 6 || esFestivoNacional(iso);
}

const TEMPORADA_POR_MES = {
  1: 'A', 2: 'A', 7: 'A', 12: 'A',
  3: 'B', 11: 'B',
  6: 'B1', 8: 'B1', 9: 'B1',
  4: 'C', 5: 'C', 10: 'C',
};

export function temporada(iso) {
  return TEMPORADA_POR_MES[parseISO(iso).m];
}

const PUNTA_LLANO = { A: [1, 2], B: [2, 3], B1: [3, 4], C: [4, 5] };

/**
 * Periodo regulado (1–6) de una hora de un suministro 3.0TD o 6.1TD peninsular.
 * @param {string} iso fecha civil
 * @param {number} hora hora de INICIO local (0–23)
 */
export function periodo6(iso, hora) {
  if (esDiaTipoD(iso)) return 6;
  if (hora < 8) return 6;
  const [punta, llano] = PUNTA_LLANO[temporada(iso)];
  if ((hora >= 9 && hora < 14) || (hora >= 18 && hora < 22)) return punta;
  return llano;
}

/** Periodo de energía 2.0TD: 1 punta, 2 llano, 3 valle. */
export function periodo3(iso, hora) {
  if (esDiaTipoD(iso) || hora < 8) return 3;
  if ((hora >= 10 && hora < 14) || (hora >= 18 && hora < 22)) return 1;
  return 2;
}

/**
 * ¿Es hora Open para una modalidad? `ventanas` viene del catálogo:
 *   { laborable: [[ini, fin], …], finde: [[ini, fin], …] }
 * "finde" = sábados, domingos y festivos nacionales. Hipótesis documentada: se
 * usa la misma lista de festivos que el peaje (el PDF de Open no la detalla).
 */
export function esHoraOpen(ventanas, iso, hora) {
  const tramos = esDiaTipoD(iso) ? ventanas.finde : ventanas.laborable;
  return tramos.some(([ini, fin]) => hora >= ini && hora < fin);
}

/**
 * Convierte el índice horario de una curva (1..N, formato distribuidora/Datadis:
 * la hora 1 es 00:00–01:00) en hora de inicio local, teniendo en cuenta los días
 * de cambio de hora (23 horas en marzo, 25 en octubre; el cambio es a las 2–3 h).
 */
export function horaInicioDesdeIndice(indice1, horasDelDia) {
  const i = indice1 - 1; // 0-based
  if (horasDelDia === 23) return i >= 2 ? i + 1 : i;   // 02:00 no existe
  if (horasDelDia === 25) return i >= 3 ? i - 1 : i;   // 02:00 se repite
  return i;
}

/** Días del rango que son laborables y contienen un festivo nacional sin fecha fija (Viernes Santo). */
export function viernesSantoEnRango(desdeISO, hastaISO) {
  const out = [];
  const y0 = parseISO(desdeISO).y, y1 = parseISO(hastaISO).y;
  for (let y = y0; y <= y1; y++) {
    const vs = viernesSanto(y);
    if (vs >= desdeISO && vs <= hastaISO) out.push(vs);
  }
  return out;
}
