// Mide un PDF de informe: nº de páginas y posición/tamaño (mm) de la imagen del informe.
// Uso: node e2e/medirPdf.mjs <archivo.pdf>
import fs from 'node:fs';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function medirPdf(ruta) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(ruta)), verbosity: 0 }).promise;
  const pt2mm = 25.4 / 72;
  const page = await doc.getPage(1);
  const [, , wPt, hPt] = page.view;
  const ops = await page.getOperatorList();
  let img = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] === OPS.paintImageXObject) {
      // La matriz de colocación es el último "transform" antes de pintar la imagen.
      for (let j = i - 1; j >= 0; j--) if (ops.fnArray[j] === OPS.transform) { const [a, , , d, e, f] = ops.argsArray[j]; img = { ancho: a * pt2mm, alto: d * pt2mm, x: e * pt2mm, yInf: f * pt2mm }; break; }
      break;
    }
  }
  const r = { paginas: doc.numPages, pagina: { ancho: wPt * pt2mm, alto: hPt * pt2mm }, imagen: img };
  if (img) Object.assign(r, { margenIzq: img.x, margenDer: wPt * pt2mm - img.x - img.ancho, margenSup: hPt * pt2mm - img.yInf - img.alto, margenInf: img.yInf });
  return r;
}

if (/medirPdf\.mjs$/.test(process.argv[1] || '') && process.argv[2]) console.log(JSON.stringify(await medirPdf(process.argv[2]), (k, v) => typeof v === 'number' ? Math.round(v * 10) / 10 : v));
