/* Exporta el nodo del informe (el "ticket") a un PDF de alta calidad, manteniendo
   colores de fondo y estructura. Escala el render para que quepa siempre en una
   única página A4 — así se evita que el corte de página parta texto por la mitad. */
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
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const canvasRatio = canvas.height / canvas.width;

  let renderWidth  = pageWidth;
  let renderHeight = pageWidth * canvasRatio;

  if (renderHeight > pageHeight) {
    renderHeight = pageHeight;
    renderWidth  = pageHeight / canvasRatio;
  }

  const x = (pageWidth  - renderWidth)  / 2;
  const y = (pageHeight - renderHeight) / 2;

  pdf.addImage(imgData, 'JPEG', x, y, renderWidth, renderHeight);
  pdf.save(filename);
}

export function slugifyFilename(text) {
  return (text || 'informe')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'informe';
}
