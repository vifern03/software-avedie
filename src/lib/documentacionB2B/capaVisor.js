/**
 * Campos que pinta el visor sobre cada página: posición (coordenadas de campos.json,
 * en puntos PDF) y clave del modelo que edita cada uno.
 */
import { CAMPOS_SUMINISTRO_CONTRATO } from '../contratosEndesa/generarContratoEndesa.js';

const SUMINISTRO_ANEXO = ['sum_direccion_completa', 'cups', 'tarifa_acceso', 'producto'];
const NO_EDITABLES = new Set(['tarifa_acceso', 'tramo_potencia', 'producto']);

const zona = (c, clave, dy = 0) => ({
  clave, page: c.page ?? 0, x: c.x, top: c.baseline + dy - c.size, w: c.max_width, h: c.size + 2,
  size: c.size, centro: c.align === 'center' ? c.center_x : null,
});

export function capaContrato(mapa, modelo) {
  const lista = [];
  for (const c of mapa.fields) {
    const esSum = CAMPOS_SUMINISTRO_CONTRATO.includes(c.id);
    if (esSum && modelo.multipunto) continue;
    const clave = esSum ? `s0.${c.id}` : c.id;
    if (NO_EDITABLES.has(c.id)) continue;
    lista.push(zona(c, clave));
  }
  for (const chk of mapa.checks || []) {
    const [x0, y0, x1, y1] = chk.rect;
    lista.push({ clave: chk.id, page: chk.page, x: x0, top: y0, w: x1 - x0, h: y1 - y0, casilla: true });
  }
  return lista;
}

export function capaAnexo(mapa, modelo) {
  const lista = [];
  for (const c of mapa.fields) {
    if (!SUMINISTRO_ANEXO.includes(c.id)) { lista.push(zona(c, c.id)); continue; }
    if (NO_EDITABLES.has(c.id)) continue;
    modelo.suministros.forEach((_, k) => lista.push(zona(c, `s${k}.${c.id}`, k * mapa.pitch_suministro)));
  }
  // Recuadro de precios: edita la modalidad
  const pb = mapa.price_block;
  modelo.suministros.forEach((_, k) => {
    lista.push({
      clave: 'modalidad', page: pb.page, x: pb.x, top: pb.first_baseline + k * mapa.pitch_suministro - pb.size,
      w: pb.max_width / 2, h: pb.line_height * 2,
    });
  });
  return lista;
}

export function capaPuntos(mapa, modelo) {
  const lista = [];
  modelo.suministros.forEach((_, k) => {
    for (const c of mapa.fields) {
      const clave = c.id === 'direccion' ? `s${k}.sum_direccion_completa` : `s${k}.${c.id}`;
      if (NO_EDITABLES.has(c.id) || ['iban', 'autoconsumo', 'energia_verde', 'mantenimiento', 'ref_catastral'].includes(c.id)) continue;
      lista.push({ ...zona(c, clave, k * mapa.pitch), page: mapa.page });
    }
  });
  return lista;
}
