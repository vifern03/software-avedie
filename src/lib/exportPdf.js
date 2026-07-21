/* Exporta el nodo del informe (el "ticket") a un PDF de alta calidad, manteniendo
   colores de fondo y estructura. Aplica un margen fijo y profesional en los 4 lados
   (en vez de centrar la imagen sin margen real) y escala el render para que quepa
   siempre en una única página A4 — así se evita que el corte de página parta texto
   por la mitad. */
export async function exportElementToPdf(elementId, filename) {
  const element = document.getElementById(elementId);
  if (!element) return;

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
  });

  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jsPDF('p', 'mm', 'a4');

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

  pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight);
  pdf.save(filename);
}

export function slugifyFilename(text) {
  return (text || 'informe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'informe';
}
