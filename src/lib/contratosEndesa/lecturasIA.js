/**
 * Lecturas con IA de los documentos del Alta: una llamada por documento, con esquema
 * cerrado. La IA solo extrae: nunca decide precios, IBAN, CUPS ni CIF del contrato.
 */
export const VERSION_LECTURA = 'doc-b2b-2026-10-31.1';

const DIRECCION = '{ "via": "", "numero": "", "piso": "", "puerta": "", "cp": "", "localidad": "", "provincia": "" }';

export const PROMPT_FACTURA = `Lees una factura española de electricidad. Copia los datos tal como aparecen; no calcules ni inventes.
Devuelve EXCLUSIVAMENTE este JSON (usa null en lo que no aparezca):
{
  "cups": "",
  "cif": "NIF o CIF del titular",
  "domicilio_titular": ${DIRECCION},
  "suministro": ${DIRECCION},
  "potencias": { "p1": 0, "p2": 0, "p3": 0, "p4": 0, "p5": 0, "p6": 0 },
  "tension": "tensión de suministro tal como aparezca, por ejemplo 3X400/230"
}
"suministro" es la dirección del punto de suministro, no la del titular. "via" es solo la calle, sin el número.
"potencias": potencias contratadas en kW, como números con punto decimal.`;

export const PROMPT_CIF = `Lees una tarjeta de identificación fiscal española (CIF/NIF de empresa). Copia los datos tal como aparecen.
Devuelve EXCLUSIVAMENTE este JSON (usa null en lo que no aparezca):
{ "cif": "", "razon_social": "", "domicilio": ${DIRECCION} }
"domicilio" es el domicilio fiscal. "via" es solo la calle, sin el número.`;

export const PROMPT_DNI = `Lees un DNI o NIE español. Copia los datos tal como aparecen.
Devuelve EXCLUSIVAMENTE este JSON (usa null en lo que no aparezca):
{ "nombre": "nombre y apellidos", "dni": "" }`;

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null);

function direccion(d) {
  const o = d && typeof d === 'object' ? d : {};
  return Object.fromEntries(['via', 'numero', 'piso', 'puerta', 'cp', 'localidad', 'provincia'].map((k) => [k, texto(o[k])]));
}

function numero(v) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Esquemas cerrados: cualquier otra clave de la respuesta se ignora. */
export function limpiarFactura(j) {
  const o = typeof j === 'string' ? JSON.parse(j) : (j || {});
  const p = o.potencias && typeof o.potencias === 'object' ? o.potencias : {};
  return {
    cups: texto(o.cups),
    cif: texto(o.cif),
    domicilio_titular: direccion(o.domicilio_titular),
    suministro: direccion(o.suministro),
    potencias: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [`p${i}`, numero(p[`p${i}`])])),
    tension: texto(o.tension),
  };
}

export function limpiarCif(j) {
  const o = typeof j === 'string' ? JSON.parse(j) : (j || {});
  return { cif: texto(o.cif), razon_social: texto(o.razon_social), domicilio: direccion(o.domicilio) };
}

export function limpiarDni(j) {
  const o = typeof j === 'string' ? JSON.parse(j) : (j || {});
  return { nombre: texto(o.nombre), dni: texto(o.dni) };
}
