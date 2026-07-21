import { saveAs } from 'file-saver';

/* Exporta el nodo del informe (el "ticket") a un PDF de alta calidad, manteniendo
   colores de fondo y estructura. Aplica un margen fijo y profesional en los 4 lados
   (en vez de centrar la imagen sin margen real) y escala el render para que quepa
   siempre en una única página A4 — así se evita que el corte de página parta texto
   por la mitad. */
export async function exportElementToPdf(elementId, filename) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const ua = navigator.userAgent || '';
  const isMobile = /iPhone|iPad|iPod|Android|Mobile/i.test(ua) || window.innerWidth < 768;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // En escritorio scale:3 da nitidez casi nativa. En móvil, ese mismo scale genera
  // canvases enormes que revientan la memoria de Safari/Chrome (crash o descarga que
  // nunca llega): bajamos a scale:2 — suficiente para verse nítido sin OOM.
  let scale = isMobile ? 2 : 3;

  // Segunda red de seguridad: limita el total de píxeles del canvas resultante
  // independientemente del dispositivo (tickets muy largos + scale alto también
  // pueden agotar memoria en gama media). Si se excede, se reduce el scale hasta caber.
  const rect = element.getBoundingClientRect();
  const MAX_PIXELS = isMobile ? 6_000_000 : 18_000_000;
  const projectedPixels = rect.width * rect.height * scale * scale;
  if (projectedPixels > MAX_PIXELS) {
    scale = Math.max(1, Math.sqrt(MAX_PIXELS / (rect.width * rect.height)));
  }

  const canvas = await html2canvas(element, {
    scale,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 1.0);
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });

  const pageWidth  = pdf.internal.pageSize.getWidth();  // 210mm
  const pageHeight = pdf.internal.pageSize.getHeight(); // 297mm
  const margin = 15;

  const usableWidth  = pageWidth  - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  let imgWidth  = usableWidth;
  let imgHeight = (canvas.height * imgWidth) / canvas.width;

  // Si el ticket es más alto de lo que cabe en una página, se escala para que quepa
  // entero (evita cortar texto a la mitad); lo habitual es que quepa de sobra.
  if (imgHeight > usableHeight) {
    imgHeight = usableHeight;
    imgWidth  = (canvas.width * imgHeight) / canvas.height;
  }

  const x = margin + (usableWidth - imgWidth) / 2;
  const y = margin;

  pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight, undefined, 'FAST');

  // Blob + saveAs (file-saver, ya usado en el resto del CRM): file-saver ya trae su
  // propia gestión de compatibilidad con Safari/iOS internamente (usa el atributo
  // `download` cuando el navegador lo soporta de verdad, y cae a FileReader+popup si
  // no) — más fiable en conjunto que reimplementar esa lógica a mano con pdf.save().
  const blob = pdf.output('blob');
  saveAs(blob, filename);
}

export function slugifyFilename(text) {
  return (text || 'informe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'informe';
}
