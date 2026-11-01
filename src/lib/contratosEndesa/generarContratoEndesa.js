// Generador del contrato y del anexo de precios de Endesa (B2B) para el CRM de Grupo Avedie.
//
// Funciona en el navegador y en Node (pdf-lib). No usa IA: escribe los datos ya
// validados sobre las plantillas base, que son los PDF originales de Endesa sin
// los datos del cliente. Si un dato no cabe o falta algo obligatorio, LANZA UN
// ERROR en vez de recortarlo, porque es un documento contractual.
//
//   import { generarContrato, generarAnexo, bloquePreciosOpen } from './generarContratoEndesa.js'
//   const bytes = await generarContrato(basePdfBytes, campos.contrato, datos, opciones)

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib'

const NEGRO = rgb(0, 0, 0)
const TAM_MIN = 5 // tamaño mínimo al que se permite reducir un texto que no cabe

export const OBLIGATORIOS = {
  contrato: [
    'oferta_numero', 'titular_nombre', 'tipo_documento', 'documento_numero', 'idioma',
    'actividad', 'telefono1', 'fiscal_via', 'fiscal_cp', 'fiscal_localidad', 'fiscal_provincia',
    'sum_via', 'sum_cp', 'sum_localidad', 'sum_provincia', 'contacto_nombre', 'contacto_dni',
    'contacto_telefono', 'contacto_email', 'tipo_solicitud', 'cups', 'distribuidora',
    'equipo_medida', 'producto', 'tarifa_acceso', 'tramo_potencia', 'potencia_p1', 'tension',
    'cuenta_titular', 'iban', 'fecha_firma',
  ],
  anexo: [
    'validez_desde', 'validez_hasta', 'titular_nombre', 'documento_numero',
    'sum_direccion_completa', 'cups', 'tarifa_acceso', 'producto',
  ],
}

// ---------------------------------------------------------------------------
// Utilidades de formato (mismo formato que los documentos de Endesa)
// ---------------------------------------------------------------------------

/** 2026-10-29 | Date -> "29-10-2026" */
export function fechaEndesa(f) {
  const d = f instanceof Date ? f : new Date(`${f}T12:00:00`)
  if (Number.isNaN(d.getTime())) throw new Error(`Fecha no válida: ${f}`)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`
}

/**
 * Precio como lo imprime Endesa: hasta 6 decimales, sin ceros finales y coma decimal.
 *   0.19884 -> "0,19884" · 0.228942 -> "0,228942" · 21.876927 -> "21,876927"
 * Lanza error si el precio trae más de 6 decimales (no se redondea un precio en silencio).
 */
export function numEndesa(n, maxDecimales = 6) {
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error(`Número no válido: ${n}`)
  const fijo = n.toFixed(maxDecimales)
  if (Math.abs(Number(fijo) - n) > 1e-12) throw new Error(`El precio ${n} tiene más de ${maxDecimales} decimales`)
  return fijo.replace(/\.?0+$/, '').replace('.', ',')
}

// Texto del descuento indefinido según la modalidad Open.
// plana y laboral: literal de los anexos reales de Endesa.
// dia, fin_de_semana y noche: texto de la hoja de tarifas (ver MODALIDADES_SIN_VALIDAR).
export const HORAS_DESCUENTO_OPEN = {
  plana: 'las 24h todos los días',
  laboral: 'de 8h a 24h de lunes a viernes excepto fines de semana y festivos*',
  dia: 'de 8h a 24h todos los días del año',
  fin_de_semana: 'las 24h del día de sábados, domingos y festivos nacionales',
  noche: 'de 0h a 8h todos los días del año',
}
// En 6.1TD la hoja de tarifas fija otras horas para Día y Noche.
export const HORAS_DESCUENTO_OPEN_61TD = {
  ...HORAS_DESCUENTO_OPEN,
  dia: 'de 8h a 24h de lunes a viernes, y de 18h a 24h sábados, domingos y festivos nacionales',
  noche: 'de 0h a 8h de lunes a viernes, y de 0h a 18h sábados, domingos y festivos nacionales',
}
export const MODALIDADES_SIN_VALIDAR = ['dia', 'fin_de_semana', 'noche']

/** Potencia contratada como la imprime Endesa: 16.5 -> "16.5" (punto decimal) */
export function potenciaEndesa(kw) {
  if (kw === null || kw === undefined || kw === '') return ''
  const n = Number(kw)
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Potencia no válida: ${kw}`)
  return String(n)
}

/**
 * Bloque de precios del anexo para productos Open / TEMPO OPEN (precio de energía único).
 * Reproduce exactamente las líneas del ejemplo TEL3T - TEMPO OPEN 3.0TD.
 *   precioEnergia: €/kWh · potencias: [P1..P6] €/kW y año (hasta 6 decimales)
 *   descuentoPromocional / descuentoIndefinido: porcentaje entero (o null para omitir)
 *   modalidad: 'plana' | 'dia' | 'laboral' | 'fin_de_semana' | 'noche' (horas del descuento indefinido)
 *   tarifaAcceso: '3.0TD' | '6.1TD'
 */
export function bloquePreciosOpen({ precioEnergia, potencias, descuentoPromocional, mesesPromocion = 12, descuentoIndefinido, modalidad = 'plana', tarifaAcceso = '3.0TD' }) {
  if (!Array.isArray(potencias) || potencias.length !== 6) throw new Error('Se necesitan 6 precios de potencia (P1–P6)')
  const horas = (tarifaAcceso === '6.1TD' ? HORAS_DESCUENTO_OPEN_61TD : HORAS_DESCUENTO_OPEN)[modalidad]
  if (descuentoIndefinido != null && !horas) throw new Error(`Modalidad Open sin texto validado: ${modalidad}`)
  const lineas = [
    { texto: 'Término energía:', negrita: true },
    { texto: `Precio de Energía: ${numEndesa(precioEnergia)} Eur/kWh` },
    { texto: '' },
    { texto: 'Término Potencia', negrita: true },
    ...potencias.map((p, i) => ({ texto: `PRECIO POTENCIA P${i + 1}: ${numEndesa(p)} Eur/kW y año` })),
  ]
  if (descuentoPromocional != null || descuentoIndefinido != null) {
    lineas.push({ texto: '' }, { texto: 'Descuento:', negrita: true })
    if (descuentoPromocional != null) {
      const dur = mesesPromocion === 12 ? '1 año' : `${mesesPromocion} meses`
      lineas.push({ texto: `Descuento Promocional: ${descuentoPromocional} % sobre el término de energía durante ${dur}.` })
    }
    if (descuentoIndefinido != null) {
      lineas.push({ texto: `Descuento Indefinido: ${descuentoIndefinido} % sobre el término de energía ${horas}` })
    }
  }
  return lineas
}

// ---------------------------------------------------------------------------
// Núcleo
// ---------------------------------------------------------------------------

function ajustarTamano(font, texto, tam, maxAncho, id) {
  let t = tam
  while (font.widthOfTextAtSize(texto, t) > maxAncho && t > TAM_MIN) t -= 0.25
  if (font.widthOfTextAtSize(texto, t) > maxAncho) {
    throw new Error(`El campo "${id}" no cabe en su casilla: "${texto}"`)
  }
  return t
}

function dibujarTexto(page, fonts, campo, valor) {
  const texto = String(valor).trim()
  if (!texto) return
  const font = campo.bold ? fonts.bold : fonts.regular
  let size
  try {
    size = ajustarTamano(font, texto, campo.size, campo.max_width, campo.id)
  } catch (e) {
    throw e
  }
  const y = page.getHeight() - campo.baseline
  let x = campo.x
  if (campo.align === 'center') x = campo.center_x - font.widthOfTextAtSize(texto, size) / 2
  try {
    page.drawText(texto, { x, y, size, font, color: NEGRO })
  } catch (e) {
    throw new Error(`Carácter no admitido en "${campo.id}": "${texto}" (${e.message})`)
  }
}

function dibujarCheck(page, rect) {
  // rect en coordenadas "desde arriba": [x0, y0, x1, y1]
  const H = page.getHeight()
  const [x0, y0, x1, y1] = rect
  const w = x1 - x0
  const h = y1 - y0
  const p = (fx, fy) => ({ x: x0 + fx * w, y: H - (y0 + fy * h) })
  const a = p(0.22, 0.52)
  const b = p(0.42, 0.74)
  const c = p(0.80, 0.24)
  page.drawLine({ start: a, end: b, thickness: 1.5, color: NEGRO })
  page.drawLine({ start: b, end: c, thickness: 1.5, color: NEGRO })
}

function marcaDeAgua(pdf, fonts, texto) {
  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize()
    const size = 46
    const w = fonts.bold.widthOfTextAtSize(texto, size)
    page.drawText(texto, {
      x: width / 2 - (w / 2) * Math.cos(Math.PI / 4),
      y: height / 2 - (w / 2) * Math.sin(Math.PI / 4),
      size, font: fonts.bold, color: rgb(0.85, 0.1, 0.1), opacity: 0.25, rotate: degrees(45),
    })
  }
}

// Campos del contrato que pertenecen al punto de suministro (apartados B y C).
// En contratos de varios suministros Endesa los deja vacíos y los lleva al Anexo de Puntos de Suministro.
export const CAMPOS_SUMINISTRO_CONTRATO = [
  'sum_via', 'sum_numero', 'sum_escalera', 'sum_piso', 'sum_puerta', 'sum_cp', 'sum_localidad', 'sum_provincia',
  'sum_ref_catastral', 'cups', 'distribuidora', 'equipo_medida', 'producto', 'tarifa_acceso', 'tramo_potencia',
  'potencia_p1', 'potencia_p2', 'potencia_p3', 'potencia_p4', 'potencia_p5', 'potencia_p6', 'tension',
]
const CAMPOS_SUMINISTRO_ANEXO = ['sum_direccion_completa', 'cups', 'tarifa_acceso', 'producto']
export const OBLIGATORIOS_SUMINISTRO_PS = ['direccion', 'cups', 'producto', 'tarifa_acceso', 'tension', 'distribuidora', 'potencia_p1', 'equipo_medida']

function vacio(v) {
  return v === undefined || v === null || String(v).trim() === ''
}

async function abrir(basePdf) {
  const pdf = await PDFDocument.load(basePdf)
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  }
  return { pdf, fonts, pages: pdf.getPages() }
}

async function cerrar(pdf, fonts, titulo, opciones = {}) {
  if (opciones.marcaAgua) marcaDeAgua(pdf, fonts, opciones.marcaAgua)
  pdf.setTitle(titulo)
  pdf.setProducer('Grupo Avedie CRM')
  pdf.setCreator('Grupo Avedie CRM')
  return pdf.save()
}

/** Copia una región de la página base (recuadro vacío) desplazada hacia abajo `dy` puntos. */
async function duplicarRegion(pdf, basePdf, pageIndex, [x0, y0, x1, y1], dy) {
  const src = await PDFDocument.load(basePdf)
  const srcPage = src.getPage(pageIndex)
  const H = srcPage.getHeight()
  const emb = await pdf.embedPage(srcPage, { left: x0, right: x1, bottom: H - y1, top: H - y0 })
  pdf.getPage(pageIndex).drawPage(emb, { x: x0, y: H - y1 - dy, width: x1 - x0, height: y1 - y0 })
}

function desplazar(campo, dy) {
  return { ...campo, baseline: campo.baseline + dy }
}

function dibujarMultilinea(page, fonts, campo, valor) {
  const texto = String(valor).trim()
  if (!texto) return
  const font = campo.bold ? fonts.bold : fonts.regular
  const maxL = campo.max_lines || 1
  for (let size = campo.size; size >= TAM_MIN; size -= 0.25) {
    const palabras = texto.split(/\s+/)
    const lineas = []
    let actual = ''
    for (const p of palabras) {
      const prueba = actual ? `${actual} ${p}` : p
      if (font.widthOfTextAtSize(prueba, size) <= campo.max_width) actual = prueba
      else { if (actual) lineas.push(actual); actual = p }
    }
    if (actual) lineas.push(actual)
    if (lineas.length <= maxL && lineas.every((l) => font.widthOfTextAtSize(l, size) <= campo.max_width)) {
      const H = page.getHeight()
      lineas.forEach((l, i) => page.drawText(l, { x: campo.x, y: H - campo.baseline - i * campo.line_height, size, font, color: NEGRO }))
      return
    }
  }
  throw new Error(`El campo "${campo.id}" no cabe en su casilla: "${texto}"`)
}

function dibujarBloquePrecios(page, fonts, pb, lineas, dy = 0) {
  if (!Array.isArray(lineas) || lineas.length === 0) throw new Error('Falta el bloque de precios del anexo')
  const H = page.getHeight()
  lineas.forEach((l, i) => {
    const baseline = pb.first_baseline + dy + i * pb.line_height
    if (baseline > pb.max_baseline + dy) throw new Error('El bloque de precios no cabe en el recuadro del anexo')
    if (!l.texto) return
    const font = l.negrita ? fonts.bold : fonts.regular
    if (font.widthOfTextAtSize(l.texto, pb.size) > pb.max_width) throw new Error(`Línea de precios demasiado larga: ${l.texto}`)
    page.drawText(l.texto, { x: pb.x, y: H - baseline, size: pb.size, font, color: NEGRO })
    if (l.negrita) {
      const w = font.widthOfTextAtSize(l.texto, pb.size)
      page.drawLine({ start: { x: pb.x, y: H - baseline - 0.6 }, end: { x: pb.x + w, y: H - baseline - 0.6 }, thickness: 0.4, color: NEGRO })
    }
  })
}

/**
 * Contrato (7 páginas).
 * datos.multipunto = true -> apartados B y C sin datos del suministro (van en el Anexo de Puntos de Suministro).
 */
export async function generarContrato(basePdf, mapa, datos, opciones) {
  const multi = datos.multipunto === true
  const obligatorios = OBLIGATORIOS.contrato.filter((k) => !(multi && CAMPOS_SUMINISTRO_CONTRATO.includes(k)))
  const faltan = obligatorios.filter((k) => vacio(datos[k]))
  if (faltan.length && !opciones?.permitirVacios) throw new Error(`Faltan datos obligatorios (contrato): ${faltan.join(', ')}`)
  const { pdf, fonts, pages } = await abrir(basePdf)
  for (const campo of mapa.fields) {
    if (multi && CAMPOS_SUMINISTRO_CONTRATO.includes(campo.id)) continue
    if (vacio(datos[campo.id])) continue
    dibujarTexto(pages[campo.page], fonts, campo, datos[campo.id])
  }
  for (const chk of mapa.checks || []) if (datos[chk.id] === true) dibujarCheck(pages[chk.page], chk.rect)
  return cerrar(pdf, fonts, `Contrato de energía Endesa - ${datos.documento_numero}`, opciones)
}

/**
 * Anexo de precios (3 páginas). Un recuadro por suministro (máximo 3, como en los anexos reales).
 * datos.suministros = [{ sum_direccion_completa, cups, tarifa_acceso, producto, bloque_precios }, ...]
 * (Compatibilidad: si no hay `suministros`, usa los campos sueltos de `datos`.)
 */
export async function generarAnexo(basePdf, mapa, datos, opciones) {
  const sums = datos.suministros || [{
    sum_direccion_completa: datos.sum_direccion_completa, cups: datos.cups,
    tarifa_acceso: datos.tarifa_acceso, producto: datos.producto, bloque_precios: datos.bloque_precios,
  }]
  const max = mapa.max_suministros || 3
  if (sums.length < 1 || sums.length > max) throw new Error(`El anexo admite de 1 a ${max} suministros (recibidos: ${sums.length})`)
  const faltan = OBLIGATORIOS.anexo.filter((k) => !CAMPOS_SUMINISTRO_ANEXO.includes(k) && vacio(datos[k]))
  sums.forEach((s, i) => CAMPOS_SUMINISTRO_ANEXO.forEach((k) => { if (vacio(s[k])) faltan.push(`suministro ${i + 1}: ${k}`) }))
  if (faltan.length && !opciones?.permitirVacios) throw new Error(`Faltan datos obligatorios (anexo): ${faltan.join(', ')}`)

  const { pdf, fonts, pages } = await abrir(basePdf)
  const pb = mapa.price_block
  for (let k = 1; k < sums.length; k++) await duplicarRegion(pdf, basePdf, pb.page, mapa.recuadro_suministro, k * mapa.pitch_suministro)
  for (const campo of mapa.fields) {
    if (CAMPOS_SUMINISTRO_ANEXO.includes(campo.id)) continue
    if (!vacio(datos[campo.id])) dibujarTexto(pages[campo.page], fonts, campo, datos[campo.id])
  }
  sums.forEach((s, k) => {
    const dy = k * mapa.pitch_suministro
    for (const campo of mapa.fields) {
      if (!CAMPOS_SUMINISTRO_ANEXO.includes(campo.id)) continue
      if (!vacio(s[campo.id])) dibujarTexto(pages[campo.page], fonts, desplazar(campo, dy), s[campo.id])
    }
    if (s.bloque_precios?.length || !opciones?.permitirVacios) dibujarBloquePrecios(pages[pb.page], fonts, pb, s.bloque_precios, dy)
  })
  return cerrar(pdf, fonts, `Anexo de Precios - ${datos.documento_numero}`, opciones)
}

/**
 * Anexo de Puntos de Suministro (CMT-00354). Solo para contratos de 2 o más suministros (máximo 3).
 * datos = { titular_nombre, documento_numero, suministros: [{ direccion, cups, producto, tarifa_acceso, tension,
 *           distribuidora, potencia_p1..p6, equipo_medida, iban?, autoconsumo?, energia_verde?, mantenimiento?, ref_catastral? }] }
 */
export async function generarAnexoPuntos(basePdf, mapa, datos, opciones) {
  const sums = datos.suministros || []
  if (sums.length < 2 || sums.length > mapa.max_suministros) {
    throw new Error(`El Anexo de Puntos de Suministro es para 2 a ${mapa.max_suministros} suministros (recibidos: ${sums.length})`)
  }
  const faltan = ['titular_nombre', 'documento_numero'].filter((k) => vacio(datos[k]))
  sums.forEach((s, i) => OBLIGATORIOS_SUMINISTRO_PS.forEach((k) => { if (vacio(s[k])) faltan.push(`suministro ${i + 1}: ${k}`) }))
  if (faltan.length && !opciones?.permitirVacios) throw new Error(`Faltan datos obligatorios (puntos de suministro): ${faltan.join(', ')}`)

  const { pdf, fonts, pages } = await abrir(basePdf)
  const page = pages[mapa.page]
  const H = page.getHeight()
  // Cabecera: "Nombre      NIF: XXXXX" en una línea, como Endesa
  const c = mapa.cabecera
  const nombre = String(datos.titular_nombre).trim()
  const nif = String(datos.documento_numero).trim()
  const anchoTotal = (s) => fonts.regular.widthOfTextAtSize(nombre, s) + c.separacion + fonts.bold.widthOfTextAtSize(`${c.etiqueta_nif} `, s) + fonts.regular.widthOfTextAtSize(nif, s)
  let size = c.size
  while (anchoTotal(size) > c.max_width && size > TAM_MIN) size -= 0.25
  if (anchoTotal(size) > c.max_width) throw new Error('El nombre del titular no cabe en la cabecera')
  let x = c.x
  page.drawText(nombre, { x, y: H - c.baseline, size, font: fonts.regular, color: NEGRO })
  x += fonts.regular.widthOfTextAtSize(nombre, size) + c.separacion
  page.drawText(`${c.etiqueta_nif} `, { x, y: H - c.baseline, size, font: fonts.bold, color: NEGRO })
  x += fonts.bold.widthOfTextAtSize(`${c.etiqueta_nif} `, size)
  page.drawText(nif, { x, y: H - c.baseline, size, font: fonts.regular, color: NEGRO })

  for (let k = 1; k < sums.length; k++) await duplicarRegion(pdf, basePdf, mapa.page, mapa.bloque, k * mapa.pitch)
  sums.forEach((s, k) => {
    for (const campo of mapa.fields) {
      if (vacio(s[campo.id])) continue
      const cdy = desplazar(campo, k * mapa.pitch)
      if (cdy.max_lines > 1) dibujarMultilinea(page, fonts, cdy, s[campo.id])
      else dibujarTexto(page, fonts, cdy, s[campo.id])
    }
  })
  return cerrar(pdf, fonts, `Anexo de Puntos de Suministro - ${nif}`, opciones)
}
