import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Download, Pencil, Printer, X } from 'lucide-react';
import { leerClave } from '../../lib/contratosEndesa/ensamblar';
import { MODALIDADES, OPCIONES_CAMPO, TENSIONES_30TD } from '../../lib/contratosEndesa/constantes';

async function cargarPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

const medidor = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');

/** Punto donde acaba el texto del campo, desde el inicio de la zona, en puntos PDF. */
function finDelTexto(z, valor) {
  medidor.font = `${z.size}px Helvetica`;
  const ancho = medidor.measureText(String(valor ?? '')).width;
  return Math.min(z.centro === null ? ancho : z.centro - z.x + ancho / 2, z.w);
}

function opcionesDe(clave, modelo) {
  if (clave === 'modalidad') return MODALIDADES.map((m) => ({ valor: m.id, label: m.label }));
  const campo = clave.replace(/^s\d\./, '');
  if (campo.startsWith('check_')) return [{ valor: true, label: 'Sí' }, { valor: false, label: 'No' }];
  if (campo === 'tension' && modelo.tarifa_acceso === '3.0TD') return TENSIONES_30TD.map((t) => ({ valor: t, label: t }));
  return OPCIONES_CAMPO[campo]?.map((v) => ({ valor: v, label: v })) || null;
}

function EditorCampo({ clave, modelo, error, onGuardar, onCerrar }) {
  const inicial = leerClave(modelo, clave);
  const [valor, setValor] = useState(inicial ?? '');
  const opciones = opcionesDe(clave, modelo);
  return (
    <form
      data-testid="editor-campo"
      onSubmit={(e) => { e.preventDefault(); onGuardar(clave, valor); }}
      onClick={(e) => e.stopPropagation()}
      className="absolute z-30 left-0 top-full mt-1 bg-white border border-google-border rounded-lg shadow-google p-2 w-64 space-y-2"
    >
      {opciones ? (
        <select autoFocus className="input-field w-full text-xs" value={String(valor)} aria-label="Valor"
          onChange={(e) => {
            const o = opciones.find((x) => String(x.valor) === e.target.value);
            setValor(o.valor);
          }}>
          {!opciones.some((o) => String(o.valor) === String(valor)) && <option value={String(valor)}>{String(valor) || '—'}</option>}
          {opciones.map((o) => <option key={String(o.valor)} value={String(o.valor)}>{o.label}</option>)}
        </select>
      ) : (
        <input autoFocus className="input-field w-full text-xs" value={valor} aria-label="Valor" onChange={(e) => setValor(e.target.value)} />
      )}
      {error && <p className="text-[11px] text-red-600 leading-snug" data-testid="editor-error">{error}</p>}
      <div className="flex justify-end gap-1">
        <button type="button" onClick={onCerrar} className="p-1 text-google-gray hover:text-google-dark" aria-label="Cancelar"><X size={14} /></button>
        <button type="submit" className="btn-primary text-[11px] px-2.5 py-1">Aplicar</button>
      </div>
    </form>
  );
}

/**
 * Visor: una página cada vez, renderizada con pdf.js, y encima una capa HTML con los
 * campos, en las coordenadas de campos.json escaladas al ancho del lienzo.
 */
export default function VisorDocumento({ bytes, nombreArchivo, capa, modelo, avisos, rojos, editable = true, bloqueado, onEditar, errorEdicion, limpiarError, flechasLaterales = false }) {
  const lienzo = useRef(null);
  const marco = useRef(null);
  const [pdf, setPdf] = useState(null);
  const [pagina, setPagina] = useState(1);
  const [dim, setDim] = useState({ w: 0, h: 0, escala: 1 });
  const [activo, setActivo] = useState(null);

  useEffect(() => {
    let vivo = true;
    let tarea;
    (async () => {
      const pdfjs = await cargarPdfjs();
      tarea = pdfjs.getDocument({ data: bytes.slice(0) });
      const doc = await tarea.promise;
      if (vivo) setPdf(doc);
    })();
    return () => { vivo = false; };
  }, [bytes]);

  useEffect(() => { setPagina((p) => (pdf && p > pdf.numPages ? 1 : p)); }, [pdf]);

  useEffect(() => {
    if (!pdf) return undefined;
    let tarea;
    let vivo = true;
    (async () => {
      const page = await pdf.getPage(Math.min(pagina, pdf.numPages));
      const escala = Math.min(1.5, ((marco.current?.clientWidth || 800) - 48) / page.getViewport({ scale: 1 }).width);
      const vp = page.getViewport({ scale: escala * (window.devicePixelRatio || 1) });
      const c = lienzo.current;
      if (!c || !vivo) return;
      c.width = vp.width;
      c.height = vp.height;
      const base = page.getViewport({ scale: escala });
      c.style.width = `${base.width}px`;
      c.style.height = `${base.height}px`;
      tarea = page.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c });
      await tarea.promise.catch(() => {});
      if (vivo) setDim({ w: base.width, h: base.height, escala });
    })();
    return () => { vivo = false; tarea?.cancel?.(); };
  }, [pdf, pagina]);

  const total = pdf?.numPages || 1;
  const url = () => URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const descargar = () => {
    const a = document.createElement('a');
    a.href = url();
    a.download = nombreArchivo;
    a.click();
  };
  const imprimir = () => {
    // Mismo método que el informe de las comparativas (src/lib/exportPdf.js)
    const direccion = url();
    if (/iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '') || window.innerWidth < 768) { window.open(direccion, '_blank'); return; }
    const marco = document.createElement('iframe');
    Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
    marco.src = direccion;
    marco.onload = () => {
      setTimeout(() => {
        try { marco.contentWindow.focus(); marco.contentWindow.print(); } catch { window.open(direccion, '_blank'); }
      }, 150);
    };
    document.body.appendChild(marco);
    setTimeout(() => { marco.remove(); URL.revokeObjectURL(direccion); }, 5 * 60 * 1000);
  };

  const zonas = (capa || []).filter((z) => z.page === pagina - 1);
  const e = dim.escala;
  const pasarPagina = (d) => { setActivo(null); setPagina((p) => Math.min(total, Math.max(1, p + d))); };

  return (
    <div className="flex items-start gap-2">
    <div className="flex-1 min-w-0 border border-google-border rounded-xl overflow-hidden bg-gray-50" data-testid="visor">
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-white border-b border-google-border">
        <div className="flex items-center gap-1">
          <button onClick={() => { setActivo(null); setPagina((p) => Math.max(1, p - 1)); }} disabled={pagina <= 1} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Página anterior"><ChevronLeft size={16} /></button>
          <select value={pagina} onChange={(ev) => { setActivo(null); setPagina(Number(ev.target.value)); }} className="text-xs bg-transparent px-1 py-1 text-google-dark" aria-label="Página">
            {Array.from({ length: total }, (_, i) => <option key={i + 1} value={i + 1}>Página {i + 1} de {total}</option>)}
          </select>
          <button onClick={() => { setActivo(null); setPagina((p) => Math.min(total, p + 1)); }} disabled={pagina >= total} className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" aria-label="Página siguiente"><ChevronRight size={16} /></button>
        </div>
        <div className="flex items-center gap-1">
          {bloqueado && <span className="text-[11px] text-red-600 mr-2">Completa los campos en rojo para descargar</span>}
          <button onClick={descargar} disabled={bloqueado} data-testid="descargar" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" title="Descargar" aria-label="Descargar"><Download size={16} /></button>
          <button onClick={imprimir} disabled={bloqueado} data-testid="imprimir" className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-30" title="Imprimir" aria-label="Imprimir"><Printer size={16} /></button>
        </div>
      </div>

      <div ref={marco} className="overflow-auto flex justify-center p-3">
        <div className="relative bg-white shadow-sm" style={{ minHeight: 200 }}>
          <canvas ref={lienzo} data-testid="pagina-pdf" />
          {editable && dim.w > 0 && zonas.map((z, i) => {
            const rojo = rojos.includes(z.clave);
            const aviso = avisos[z.clave];
            const abierto = activo === `${z.clave}-${i}`;
            return (
              <div
                key={`${z.clave}-${i}`}
                data-testid={`campo-${z.clave}`}
                className={`absolute group rounded-sm cursor-pointer ${rojo ? 'bg-red-200/60 ring-1 ring-red-500' : 'hover:bg-blue-200/40 hover:ring-1 hover:ring-google-blue'}`}
                style={{ left: z.x * e, top: z.top * e, width: Math.max(z.w * e, 14), height: Math.max(z.h * e, 10), zIndex: abierto ? 25 : 10 }}
                onClick={() => { limpiarError(); setActivo(`${z.clave}-${i}`); }}
              >
                {aviso && (
                  <span className="absolute top-1/2 -translate-y-1/2 z-20" style={{ left: finDelTexto(z, leerClave(modelo, z.clave)) * e + 2 }} title={aviso} data-testid={`aviso-${z.clave}`}>
                    <AlertTriangle size={12} className="text-amber-500 fill-amber-100" />
                  </span>
                )}
                <span title="Pulsa para editar este campo" className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-0.5 hidden group-hover:block">
                  <Pencil size={11} className="text-google-blue" />
                </span>
                {abierto && (
                  <EditorCampo
                    clave={z.clave}
                    modelo={modelo}
                    error={errorEdicion}
                    onCerrar={() => { limpiarError(); setActivo(null); }}
                    onGuardar={async (c, v) => { if (await onEditar(c, v)) setActivo(null); }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
    {flechasLaterales && (
      <div className="sticky top-1/2 flex flex-col gap-2">
        <button onClick={() => pasarPagina(-1)} disabled={pagina <= 1} data-testid="pagina-lateral-anterior" aria-label="Página anterior" title="Página anterior"
          className="p-2 rounded-full border border-google-border bg-white text-google-dark hover:bg-gray-100 disabled:opacity-30"><ArrowLeft size={18} /></button>
        <button onClick={() => pasarPagina(1)} disabled={pagina >= total} data-testid="pagina-lateral-siguiente" aria-label="Página siguiente" title="Página siguiente"
          className="p-2 rounded-full border border-google-border bg-white text-google-dark hover:bg-gray-100 disabled:opacity-30"><ArrowRight size={18} /></button>
      </div>
    )}
    </div>
  );
}
