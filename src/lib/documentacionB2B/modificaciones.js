/** Traduce los cambios guardados en cada versión a textos para la ventana de modificaciones. */
import { MODALIDADES } from '../contratosEndesa/constantes.js';

const ETIQUETAS = {
  modalidad: 'Modalidad',
  oferta_numero: 'Número de oferta',
  titular_nombre: 'Nombre del titular',
  cuenta_titular: 'Titular de la cuenta',
  tipo_documento: 'Tipo de documento',
  documento_numero: 'Número de documento',
  cnae: 'CNAE',
  actividad: 'Actividad',
  idioma: 'Idioma',
  telefono1: 'Teléfono de contacto 1',
  telefono2: 'Teléfono de contacto 2',
  email: 'Email',
  horario_contacto: 'Horario de contacto',
  fecha_nacimiento: 'Fecha de nacimiento',
  fiscal_via: 'Dirección fiscal',
  fiscal_numero: 'Número (domicilio fiscal)',
  fiscal_escalera: 'Escalera (domicilio fiscal)',
  fiscal_piso: 'Piso (domicilio fiscal)',
  fiscal_puerta: 'Puerta (domicilio fiscal)',
  fiscal_cp: 'Código postal (domicilio fiscal)',
  fiscal_localidad: 'Localidad (domicilio fiscal)',
  fiscal_provincia: 'Provincia (domicilio fiscal)',
  sum_via: 'Dirección de suministro',
  sum_numero: 'Número (suministro)',
  sum_escalera: 'Escalera (suministro)',
  sum_piso: 'Piso (suministro)',
  sum_puerta: 'Puerta (suministro)',
  sum_cp: 'Código postal (suministro)',
  sum_localidad: 'Localidad (suministro)',
  sum_provincia: 'Provincia (suministro)',
  sum_ref_catastral: 'Referencia catastral',
  sum_direccion_completa: 'Dirección del anexo',
  cups: 'CUPS',
  distribuidora: 'Distribuidora',
  equipo_medida: 'Equipo de medida',
  tension: 'Tensión',
  potencia_p1: 'Potencia P1',
  potencia_p2: 'Potencia P2',
  potencia_p3: 'Potencia P3',
  potencia_p4: 'Potencia P4',
  potencia_p5: 'Potencia P5',
  potencia_p6: 'Potencia P6',
  contacto_nombre: 'Nombre del contacto',
  contacto_dni: 'DNI del contacto',
  contacto_telefono: 'Teléfono del contacto',
  contacto_email: 'Email del contacto',
  contacto_cargo: 'Cargo del contacto',
  contacto_idioma: 'Idioma del contacto',
  contacto_horario: 'Horario del contacto',
  direccion_alternativa: 'Dirección alternativa',
  tipo_solicitud: 'Tipo de solicitud',
  check_tipo_solicitud: 'Casilla de tipo de solicitud',
  check_acepta_comunicaciones: 'Acepta comunicaciones',
  check_cargo_cuenta_renovacion: 'Cargo en cuenta en la renovación',
  iban: 'IBAN',
  fecha_firma: 'Fecha de firma',
  validez_desde: 'Validez desde',
  validez_hasta: 'Validez hasta',
};

const humanizar = (id) => {
  const t = id.replace(/_/g, ' ');
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** 's1.tension' con varios suministros → 'Tensión (suministro 2)'. */
export function etiquetaCampo(clave, multipunto = false) {
  const m = /^s(\d)\.(.+)$/.exec(clave);
  const id = m ? m[2] : clave;
  const etiqueta = ETIQUETAS[id] || humanizar(id);
  return m && multipunto ? `${etiqueta} · Suministro ${Number(m[1]) + 1}` : etiqueta;
}

export function valorLegible(clave, v) {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  const t = String(v ?? '').trim();
  if (clave === 'modalidad') return MODALIDADES.find((m) => m.id === t)?.label || t;
  return t;
}

/** Cambios reales de una versión; se descartan los que acabaron en el valor inicial. */
export function describirCambios(editados, multipunto = false) {
  return Object.entries(editados || {})
    .map(([clave, c]) => ({ clave, campo: etiquetaCampo(clave, multipunto), de: valorLegible(clave, c?.de), a: valorLegible(clave, c?.a) }))
    .filter((c) => c.de !== c.a);
}

const enMadrid = (iso, opciones) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...opciones }).format(new Date(iso));

export function fechaHoraES(iso) {
  return {
    fecha: enMadrid(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: enMadrid(iso, { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}
