/**
 * Texto impreso de la factura, leído SIN IA con pdf.js.
 *
 * Es la fuente independiente con la que se contrasta lo que devuelve Gemini: si un
 * número que la IA dice haber leído no aparece en el texto del PDF, no hay evidencia
 * documental de él. Las facturas escaneadas (o subidas como imagen) no tienen capa
 * de texto: en ese caso se devuelve null y la verificación se apoya solo en la IA y
 * en las reglas de coherencia.
 *
 * El documento no sale del navegador: pdf.js se ejecuta en local y solo se carga
 * cuando se sube una factura.
 */

async function cargarPdfjs() {
  if (typeof window === 'undefined') return import('pdfjs-dist/legacy/build/pdf.mjs');
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

/**
 * Agrupa los fragmentos de texto de una página en líneas (misma altura), ordenados
 * de izquierda a derecha. Los fragmentos muy separados se unen con varios espacios
 * para no pegar números de columnas distintas.
 */
export function agruparEnLineas(items) {
  const frags = items
    .filter(it => it.str && it.str.trim())
    .map(it => ({ str: it.str, x: it.transform[4], y: it.transform[5], w: it.width || 0, h: Math.abs(it.transform[3]) || it.height || 8 }));
  frags.sort((a, b) => b.y - a.y || a.x - b.x);
  const lineas = [];
  for (const f of frags) {
    const l = lineas.find(l => Math.abs(l.y - f.y) <= Math.max(2, Math.min(l.h, f.h) * 0.45));
    if (l) l.frags.push(f);
    else lineas.push({ y: f.y, h: f.h, frags: [f] });
  }
  return lineas
    .sort((a, b) => b.y - a.y)
    .map(l => {
      l.frags.sort((a, b) => a.x - b.x);
      let txt = '';
      let finAnterior = null;
      for (const f of l.frags) {
        if (finAnterior != null) {
          const hueco = f.x - finAnterior;
          txt += hueco > f.h * 1.5 ? '   ' : hueco > f.h * 0.15 ? ' ' : '';
        }
        txt += f.str;
        finAnterior = f.x + f.w;
      }
      return txt.replace(/\s+$/, '');
    })
    .filter(Boolean);
}

/**
 * @param {ArrayBuffer|Uint8Array} datos  contenido del PDF
 * @returns {Promise<{ lineas: {pagina:number, texto:string}[] } | null>}  null si no hay texto
 */
export async function extraerTextoPdf(datos, { maxPaginas = 8 } = {}) {
  const pdfjs = await cargarPdfjs();
  const data = datos instanceof Uint8Array ? new Uint8Array(datos) : new Uint8Array(datos.slice(0));
  const tarea = pdfjs.getDocument({ data, isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  const doc = await tarea.promise;
  try {
    const lineas = [];
    for (let p = 1; p <= Math.min(doc.numPages, maxPaginas); p++) {
      const page = await doc.getPage(p);
      const { items } = await page.getTextContent();
      for (const texto of agruparEnLineas(items)) lineas.push({ pagina: p, texto });
    }
    const conDigitos = lineas.filter(l => /\d/.test(l.texto)).length;
    return conDigitos >= 5 ? { lineas } : null; // escaneada o sin texto útil
  } finally {
    await tarea.destroy();
  }
}

/** Texto normalizado para comparar citas: sin acentos raros de espaciado y en minúsculas. */
export function normalizarTexto(s) {
  return String(s || '').replace(/[   ]/g, ' ').replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Líneas del PDF que contienen `token` como número completo (no como parte de otro:
 * "15.001" no casa con "115.001" ni con "15.0012").
 */
export function lineasConToken(textoPdf, token) {
  if (!textoPdf || token == null) return [];
  const t = String(token).trim();
  if (!t) return [];
  const re = new RegExp(`(^|[^\\d.,])${escapar(t)}(?![\\d]|[.,]\\d)`);
  return textoPdf.lineas.filter(l => re.test(l.texto.replace(/[   ]/g, ' ')));
}

/** ¿Aparece la cita (una línea copiada por la IA) en el texto del PDF? */
export function citaEnPdf(textoPdf, cita) {
  if (!textoPdf || !cita) return null;
  const c = normalizarTexto(cita);
  if (c.length < 4) return null;
  const quitarEsp = (s) => s.replace(/\s+/g, '');
  const cS = quitarEsp(c);
  // Las líneas del PDF pueden partir o juntar columnas: se compara sin espacios y
  // admitiendo que la cita abarque dos líneas consecutivas.
  for (let i = 0; i < textoPdf.lineas.length; i++) {
    const a = quitarEsp(normalizarTexto(textoPdf.lineas[i].texto));
    const ab = a + quitarEsp(normalizarTexto(textoPdf.lineas[i + 1]?.texto || ''));
    if (a.includes(cS) || ab.includes(cS) || (cS.length >= 12 && cS.includes(a) && a.length >= 12)) return textoPdf.lineas[i];
  }
  return null;
}
