import { saveAs } from 'file-saver';

/* Informes PDF de las comparativas (luz 2.0, luz 3.0/6.1 y gas).
 *
 * "Descargar" e "Imprimir informe" usan EXACTAMENTE el mismo PDF: se genera una vez
 * por estado del informe (caché por contenido) y solo cambia la acción final
 * (guardar el archivo o abrir la impresión de ese archivo). Así la impresión no
 * depende del HTML de la página ni de la paginación del navegador.
 *
 * Maquetación: A4 vertical con márgenes de 13 mm (184 × 271 mm útiles). El informe
 * se fotografía a partir de una copia fuera de pantalla cuyo ancho se calcula para
 * que su proporción encaje en esa caja: así ocupa todo el ancho útil sin estirar ni
 * deformar la imagen, y en una sola página. */

const MARGEN_MM = 13;
const A4 = { ancho: 210, alto: 297 };
const UTIL = { ancho: A4.ancho - 2 * MARGEN_MM, alto: A4.alto - 2 * MARGEN_MM };
const ANCHO_MIN_PX = 760;   // ancho de maquetación de partida (legible al pasar a 184 mm)
const ANCHO_MAX_PX = 1100;  // más ancho haría la letra demasiado pequeña; por encima se reduce por alto

const cache = new Map(); // elementId → { clave, blob }

const esMovil = () => /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '') || window.innerWidth < 768;

/** Copia del informe fuera de pantalla, maquetada al ancho que mejor encaja en el A4. */
async function copiaMaquetada(element) {
  const caja = document.createElement('div');
  caja.setAttribute('aria-hidden', 'true');
  Object.assign(caja.style, { position: 'fixed', left: '-20000px', top: '0', background: '#ffffff', zIndex: '-1' });
  const copia = element.cloneNode(true);
  copia.removeAttribute('id');
  copia.style.width = '100%';
  copia.style.margin = '0';
  caja.appendChild(copia);
  document.body.appendChild(caja);

  const proporcion = UTIL.alto / UTIL.ancho;
  let ancho = Math.max(ANCHO_MIN_PX, Math.round(element.getBoundingClientRect().width));
  for (let i = 0; i < 4; i++) {
    caja.style.width = `${ancho}px`;
    const alto = copia.getBoundingClientRect().height;
    const necesario = Math.ceil(alto / proporcion);
    if (necesario <= ancho || ancho >= ANCHO_MAX_PX) break;
    ancho = Math.min(ANCHO_MAX_PX, necesario + 4);
  }
  await new Promise(r => requestAnimationFrame(() => r()));
  return { caja, copia };
}

/** Genera (o reutiliza) el PDF del informe. */
export async function generarPdfInforme(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  const clave = element.innerHTML;
  const previo = cache.get(elementId);
  if (previo && previo.clave === clave) return previo.blob;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
  const { caja, copia } = await copiaMaquetada(element);
  let canvas;
  try {
    const rect = copia.getBoundingClientRect();
    // Nitidez casi nativa en escritorio; en móvil se limita para no agotar la memoria.
    let scale = esMovil() ? 2 : 3;
    const MAX_PIXELS = esMovil() ? 6_000_000 : 18_000_000;
    if (rect.width * rect.height * scale * scale > MAX_PIXELS) scale = Math.max(1, Math.sqrt(MAX_PIXELS / (rect.width * rect.height)));
    canvas = await html2canvas(copia, { scale, useCORS: true, logging: false, backgroundColor: '#ffffff', windowWidth: Math.max(window.innerWidth, 1280) });
  } finally {
    caja.remove();
  }

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  let ancho = UTIL.ancho;
  let alto = (canvas.height * ancho) / canvas.width;
  if (alto > UTIL.alto) { alto = UTIL.alto; ancho = (canvas.width * alto) / canvas.height; } // informes muy largos: una página, sin cortar
  const x = MARGEN_MM + (UTIL.ancho - ancho) / 2;
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', x, MARGEN_MM, ancho, alto, undefined, 'FAST');

  const blob = pdf.output('blob');
  cache.set(elementId, { clave, blob });
  return blob;
}

/* Descargar: guarda el PDF. file-saver gestiona la compatibilidad con Safari/iOS. */
export async function exportElementToPdf(elementId, filename) {
  const blob = await generarPdfInforme(elementId);
  if (blob) saveAs(blob, filename);
}

/* Imprimir: abre la impresión del MISMO PDF (no del HTML de la página). En móvil, donde
   no se puede imprimir un PDF incrustado, se abre el PDF para imprimirlo desde el visor. */
export async function imprimirElementoPdf(elementId) {
  const blob = await generarPdfInforme(elementId);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  if (esMovil()) { window.open(url, '_blank'); return; }
  const marco = document.createElement('iframe');
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  marco.src = url;
  marco.onload = () => {
    setTimeout(() => {
      try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch { window.open(url, '_blank'); }
    }, 150);
  };
  document.body.appendChild(marco);
  setTimeout(() => { marco.remove(); URL.revokeObjectURL(url); }, 5 * 60 * 1000);
}

export function slugifyFilename(text) {
  return (text || 'informe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'informe';
}
