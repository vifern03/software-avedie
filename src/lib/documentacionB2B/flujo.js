/**
 * Orquestación de la generación: lecturas con IA, ensamblado, PDFs y guardado.
 * Cada lectura de IA es independiente: si una falla, sus campos quedan vacíos con ⚠.
 */
import { PDFDocument } from 'pdf-lib';
import campos from '../contratosEndesa/campos.json';
import camposPS from '../contratosEndesa/campos_puntos_suministro.json';
import { generarAnexo, generarAnexoPuntos, generarContrato } from '../contratosEndesa/generarContratoEndesa';
import { derivarDocumentos, ensamblar, estaCompleta } from '../contratosEndesa/ensamblar';
import { TARIFA_ID } from '../contratosEndesa/constantes';
import {
  PROMPT_CIF, PROMPT_DNI, PROMPT_FACTURA, VERSION_LECTURA, limpiarCif, limpiarDni, limpiarFactura,
} from '../contratosEndesa/lecturasIA';
import { extraerFactura } from '../energia/geminiCliente';
import { hoyMadridISO } from '../energia/vigencia';
import { obtenerTarifa, sincronizarTarifas } from '../tarifas/obtenerTarifa';
import { buscarDistribuidora } from '../distribuidoras';
import { fetchSingleDoc } from '../../context/DataContext';
import { archivos, cargarPlantillas, rpc, subirPdfs } from './api';
import { reducirDocumento } from './reducirDocumento';
import { comprobarCups } from './seleccion';

export const CAMPOS_DOC = { factura: ['factura_b2b_url', 'ultima_factura'], cif: ['cif_autonomo_url'], dni: ['dni_escaneado'] };

/** data:mime;base64,xxx → File. null si no es un documento utilizable. */
export function dataUrlAArchivo(dataUrl, nombre) {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return null;
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], nombre, { type: m[1] });
}

async function documentoDe(clienteId, columnas) {
  for (const c of columnas) {
    const archivo = dataUrlAArchivo(await fetchSingleDoc(clienteId, c), c);
    if (archivo) return reducirDocumento(archivo);
  }
  return null;
}

async function leer(archivo, prompt, limpiar) {
  if (!archivo) return null;
  try {
    const { datos } = await extraerFactura(archivo, { prompt, version: VERSION_LECTURA, parse: (t) => limpiar(JSON.parse(t)) });
    return datos;
  } catch (e) {
    console.warn('lectura IA:', e.message);
    return null;
  }
}

/** Genera los PDF. Con permitirVacios, para la vista y el guardado de incompletos. */
export async function construirPdfs(plantillas, modelo) {
  const d = derivarDocumentos(modelo);
  const op = { permitirVacios: true };
  const salida = {
    contrato: await generarContrato(plantillas.contrato, campos.contrato, d.contrato, op),
    anexo_precios: await generarAnexo(plantillas.anexo, campos.anexo, d.anexo, op),
  };
  if (d.puntos) salida.anexo_puntos = await generarAnexoPuntos(plantillas.puntos, camposPS, d.puntos, op);
  return salida;
}

/** Busca los CUPS en Alta B2B. Lanza un error con el motivo si no se puede continuar. */
export async function buscarAltas({ cups, actor }) {
  const [filas, activos] = await Promise.all([
    rpc('doc_b2b_buscar_cups', actor, { p_cups: cups }),
    rpc('doc_b2b_cups_activos', actor),
  ]);
  const { clientes, error } = comprobarCups(cups, filas, activos);
  if (error) throw new Error(error);
  return clientes;
}

export async function leerDocumentos({ clientes }) {
  const doc0 = clientes[0];
  const [facturas, cif, dni] = await Promise.all([
    Promise.all(clientes.map(async (c) => leer(await documentoDe(c.id, CAMPOS_DOC.factura), PROMPT_FACTURA, limpiarFactura))),
    documentoDe(doc0.id, CAMPOS_DOC.cif).then((f) => leer(f, PROMPT_CIF, limpiarCif)),
    documentoDe(doc0.id, CAMPOS_DOC.dni).then((f) => leer(f, PROMPT_DNI, limpiarDni)),
  ]);
  return { facturas, cif, dni };
}

/** Genera los PDF con la modalidad por defecto (Plana) y los guarda como versión 1. */
export async function generarDocumentacion({ clientes, lecturas, actor, onPaso }) {
  onPaso('plantillas');
  const plantillas = await cargarPlantillas(actor);

  onPaso('tarifa');
  await sincronizarTarifas({ forzar: true });
  const fechaISO = hoyMadridISO();
  const tarifaInfo = obtenerTarifa(TARIFA_ID[clientes[0].tarifa], fechaISO);
  const distribuidoras = await Promise.all(clientes.map((c) => buscarDistribuidora(c.cups)));

  onPaso('pdf');
  const modelo = ensamblar({ clientes, lecturas, distribuidoras, tarifaInfo, modalidad: 'plana', fechaISO });
  const pdfs = await construirPdfs(plantillas, modelo);

  onPaso('guardar');
  const { id, version } = await guardarNueva({ actor, clientes, modelo, pdfs });
  return { id, version, modelo, pdfs, plantillas };
}

async function sha256(bytes) {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const NOMBRE = { contrato: 'Contrato', anexo_precios: 'Anexo de precios', anexo_puntos: 'Anexo de puntos de suministro' };

async function subir(actor, id, version, pdfs) {
  const { urls, bucket } = await archivos(actor, 'subir', { id });
  const porRuta = {};
  const documentos = [];
  for (const [tipo, bytes] of Object.entries(pdfs)) {
    const path = `${id}/v${version}/${tipo}.pdf`;
    porRuta[path] = bytes;
    const paginas = (await PDFDocument.load(bytes)).getPageCount();
    documentos.push({ tipo, nombre: NOMBRE[tipo], path, sha256: await sha256(bytes), paginas });
  }
  await subirPdfs(urls, bucket, porRuta);
  return documentos;
}

export async function guardarNueva({ actor, clientes, modelo, pdfs }) {
  const id = crypto.randomUUID();
  const documentos = await subir(actor, id, 1, pdfs);
  await rpc('doc_b2b_crear_por_cups', actor, {
    p_id: id, p_cliente_ids: clientes.map((c) => c.id), p_producto: modelo.suministros[0].producto, p_modalidad: modelo.modalidad,
    p_tarifa_version_id: modelo.tarifa_version_id, p_datos: modelo, p_avisos: modelo.avisos, p_documentos: documentos, p_completa: estaCompleta(modelo),
  });
  return { id, version: 1 };
}

export async function guardarVersion({ actor, id, versionBase, modelo, editados, pdfs }) {
  const documentos = await subir(actor, id, versionBase + 1, pdfs);
  const version = await rpc('doc_b2b_nueva_version', actor, {
    p_id: id, p_version_base: versionBase, p_modalidad: modelo.modalidad, p_tarifa_version_id: modelo.tarifa_version_id,
    p_datos: modelo, p_avisos: modelo.avisos, p_editados: editados, p_documentos: documentos, p_completa: estaCompleta(modelo),
  });
  return { id, version };
}
