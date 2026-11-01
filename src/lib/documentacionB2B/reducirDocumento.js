/**
 * Ajusta un documento del Alta al tamaño que admite /api/gemini. Las funciones de Vercel
 * aceptan 4,5 MB de cuerpo y el archivo viaja en base64 (un tercio más).
 */
import { compressImageFile } from '../pymesOfflineQueue';

export const MAX_BYTES_IA = 3_100_000;
const MAX_PAGINAS = 3;
const ESCALA_PDF = 2;

const lienzoAArchivo = (c, nombre, calidad) => new Promise((resolve) => {
  c.toBlob((b) => resolve(b ? new File([b], nombre, { type: 'image/jpeg' }) : null), 'image/jpeg', calidad);
});

/** Primeras páginas de un PDF escaneado, una bajo otra, en una sola imagen. */
async function pdfAImagen(archivo) {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await archivo.arrayBuffer()) }).promise;
  const paginas = await Promise.all(Array.from({ length: Math.min(doc.numPages, MAX_PAGINAS) }, (_, i) => doc.getPage(i + 1)));
  const vistas = paginas.map((p) => p.getViewport({ scale: ESCALA_PDF }));
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.max(...vistas.map((v) => v.width));
  lienzo.height = vistas.reduce((s, v) => s + v.height, 0);
  const ctx = lienzo.getContext('2d');
  let y = 0;
  for (let i = 0; i < paginas.length; i++) {
    const c = document.createElement('canvas');
    c.width = vistas[i].width;
    c.height = vistas[i].height;
    await paginas[i].render({ canvasContext: c.getContext('2d'), viewport: vistas[i], canvas: c }).promise;
    ctx.drawImage(c, 0, y);
    y += c.height;
  }
  for (const calidad of [0.8, 0.6, 0.4]) {
    const f = await lienzoAArchivo(lienzo, archivo.name, calidad);
    if (f && f.size <= MAX_BYTES_IA) return f;
  }
  return null;
}

/** Devuelve el archivo listo para la IA, o null si no se puede reducir lo suficiente. */
export async function reducirDocumento(archivo) {
  if (archivo.size <= MAX_BYTES_IA) return archivo;
  try {
    if (archivo.type === 'application/pdf') return await pdfAImagen(archivo);
    const b = await compressImageFile(archivo);
    return b.size <= MAX_BYTES_IA ? new File([b], archivo.name, { type: b.type }) : null;
  } catch (e) {
    console.warn('reducir documento:', e.message);
    return null;
  }
}
