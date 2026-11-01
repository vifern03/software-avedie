import { destinatariosPermitidos } from '../src/lib/compartir.js';
import { test } from 'node:test';
import { describirCambios, etiquetaCampo, fechaHoraES } from '../src/lib/documentacionB2B/modificaciones.js';
import { comprobarCups, limpiarCups } from '../src/lib/documentacionB2B/seleccion.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import {
  HORAS_DESCUENTO_OPEN, bloquePreciosOpen, fechaEndesa, generarAnexo, generarAnexoPuntos, generarContrato, numEndesa, potenciaEndesa,
} from '../src/lib/contratosEndesa/generarContratoEndesa.js';
import {
  aplicarEdicion, bloqueSuministro, camposVaciosAviso, derivarDocumentos, direccionCompleta, ensamblar, estaCompleta,
  indiceTramo, obligatoriosVacios, provinciaEndesa,
} from '../src/lib/contratosEndesa/ensamblar.js';
import { PERMITIR_TARIFA_CADUCADA, PRODUCTO_TEXTO, TRAMO_POTENCIA } from '../src/lib/contratosEndesa/constantes.js';
import { limpiarCif, limpiarDni, limpiarFactura } from '../src/lib/contratosEndesa/lecturasIA.js';
import { OPEN_30TD, OPEN_61TD } from '../src/data/tarifasB2B.js';

const R = '_recursos_documentacion_b2b/plantillas/';
const hayPlantillas = (() => { try { readFileSync(`${R}contrato_base.pdf`); return true; } catch { return false; } })();
const pdfOpt = { skip: hayPlantillas ? false : 'plantillas locales no disponibles (bucket privado, carpeta sin versionar)' };
const campos = JSON.parse(readFileSync('src/lib/contratosEndesa/campos.json', 'utf8'));
const camposPS = JSON.parse(readFileSync('src/lib/contratosEndesa/campos_puntos_suministro.json', 'utf8'));
const base = hayPlantillas ? {
  contrato: readFileSync(`${R}contrato_base.pdf`), anexo: readFileSync(`${R}anexo_base.pdf`), puntos: readFileSync(`${R}puntos_suministro_base.pdf`),
} : {};

const vigente = (tarifa) => ({ tarifa, versionId: null, validaDesde: '2026-10-19', validaHasta: '2026-10-28', estado: 'vigente' });
const caducada = (tarifa) => ({ ...vigente(tarifa), estado: 'caducada' });

const cliente = (o = {}) => ({
  id: 1, nombre: 'TALLERES DEMO DEL NORTE, S.L.', cif_dni: 'B00000000', telefono: '600000000', mail: 'demo@ejemplo.es',
  cuenta_bancaria: 'ES00 0000 0000 0000 0000 0000', cups: 'ES0021000000000000XX0F', tarifa: '3.0TD', ...o,
});
const factura = (kw = 20, o = {}) => ({
  cups: 'ES0021000000000000XX0F', cif: 'B00000000',
  domicilio_titular: { via: 'CALLE MAYOR', numero: '1', cp: '34001', localidad: 'PALENCIA', provincia: 'PALENCIA' },
  suministro: { via: 'AVENIDA DE PRUEBA', numero: '25', cp: '34004', localidad: 'PALENCIA', provincia: 'PALENCIA' },
  potencias: { p1: kw, p2: kw, p3: kw, p4: kw, p5: kw, p6: kw }, tension: null, ...o,
});
const dist = { texto_endesa: 'BZZ - I-DE REDES ELECTRIC INTELI SAU - ES0021', estado: 'ACTIVA', verificado: true };
const lecturas = (f = [factura()]) => ({ facturas: f, cif: null, dni: { nombre: 'Persona Ficticia', dni: '00000000T' } });
const modelo1 = (o = {}) => ensamblar({
  clientes: [cliente()], lecturas: lecturas(), distribuidoras: [dist], tarifaInfo: vigente(OPEN_30TD), modalidad: 'plana', fechaISO: '2026-10-20', ...o,
});

/* ── Formato ─────────────────────────────────────────────────────────────── */
test('formatos Endesa: precios, potencias y fechas', () => {
  assert.equal(numEndesa(0.19884), '0,19884');
  assert.equal(numEndesa(0.228942), '0,228942');
  assert.equal(numEndesa(21.876927), '21,876927');
  assert.throws(() => numEndesa(0.1234567));
  assert.equal(potenciaEndesa(16.5), '16.5');
  assert.equal(potenciaEndesa('15.001'), '15.001');
  assert.equal(fechaEndesa('2026-10-29'), '29-10-2026');
  assert.equal(provinciaEndesa('Palencia'), 'PALENCIA ESPAÑA');
  assert.equal(provinciaEndesa('PALENCIA ESPAÑA'), 'PALENCIA ESPAÑA');
  assert.equal(direccionCompleta({ sum_via: 'MAYOR', sum_numero: '42', sum_cp: '34001', sum_localidad: 'PALENCIA', sum_provincia: 'PALENCIA' }), 'MAYOR 42 34001 PALENCIA PALENCIA PALENCIA');
});

/* ── Bloque de precios ───────────────────────────────────────────────────── */
const lineas = (b) => b.map((l) => l.texto);

test('bloque Open real (plana): literal de Endesa', () => {
  const b = bloquePreciosOpen({
    precioEnergia: 0.19884, potencias: [21.876927, 12.117621, 5.981534, 5.386333, 4.013851, 2.942287], descuentoPromocional: 16, descuentoIndefinido: 15,
  });
  assert.deepEqual(lineas(b), [
    'Término energía:', 'Precio de Energía: 0,19884 Eur/kWh', '', 'Término Potencia',
    'PRECIO POTENCIA P1: 21,876927 Eur/kW y año', 'PRECIO POTENCIA P2: 12,117621 Eur/kW y año', 'PRECIO POTENCIA P3: 5,981534 Eur/kW y año',
    'PRECIO POTENCIA P4: 5,386333 Eur/kW y año', 'PRECIO POTENCIA P5: 4,013851 Eur/kW y año', 'PRECIO POTENCIA P6: 2,942287 Eur/kW y año',
    '', 'Descuento:', 'Descuento Promocional: 16 % sobre el término de energía durante 1 año.',
    'Descuento Indefinido: 15 % sobre el término de energía las 24h todos los días',
  ]);
});

test('horas por modalidad: 6.1TD distingue Día y Noche; laboral validada', () => {
  const b = (modalidad, tarifaAcceso) => lineas(bloquePreciosOpen({ precioEnergia: 0.2, potencias: [1, 1, 1, 1, 1, 1], descuentoIndefinido: 20, modalidad, tarifaAcceso })).at(-1);
  assert.match(b('laboral', '3.0TD'), /de 8h a 24h de lunes a viernes excepto fines de semana y festivos\*/);
  assert.match(b('dia', '3.0TD'), /de 8h a 24h todos los días del año/);
  assert.match(b('dia', '6.1TD'), /de 18h a 24h sábados/);
  assert.match(b('noche', '6.1TD'), /de 0h a 18h sábados/);
  assert.equal(Object.keys(HORAS_DESCUENTO_OPEN).length, 5);
});

test('tramo por potencia máxima (63 kW → 50–100; 44 y 43,5 → 30–50)', () => {
  assert.equal(indiceTramo(OPEN_30TD, 63), 2);
  assert.equal(indiceTramo(OPEN_30TD, 44), 1);
  assert.equal(indiceTramo(OPEN_30TD, 43.5), 1);
  assert.equal(indiceTramo(OPEN_30TD, 101), 3);
  assert.equal(indiceTramo(OPEN_30TD, 0), -1);
  assert.equal(indiceTramo(OPEN_61TD, 30), 0);
  assert.equal(indiceTramo(OPEN_61TD, 100.5), 3);
  assert.equal(indiceTramo(OPEN_61TD, 451), 3, 'por encima de 450 kW, último tramo');
  const m = modelo1({ lecturas: lecturas([factura(0, { potencias: { p1: 49, p2: 63, p3: 63, p4: 63, p5: 63, p6: 63 } })]) });
  assert.match(lineas(m.suministros[0].bloque_precios)[1], /0,251088/, 'usa la potencia máxima');
});

test('precio base sin descuento, 18 % promocional y % de modalidad (Noche 55 / 35)', () => {
  const s = { potencia_p1: '40' };
  const b30 = lineas(bloqueSuministro(OPEN_30TD, '3.0TD', 'noche', s));
  assert.ok(b30.includes('Precio de Energía: 0,251588 Eur/kWh'));
  assert.match(b30.at(-2), /18 %/);
  assert.match(b30.at(-1), /55 %/);
  const b61 = lineas(bloqueSuministro(OPEN_61TD, '6.1TD', 'noche', s));
  assert.ok(b61.includes('Precio de Energía: 0,225162 Eur/kWh'));
  assert.match(b61.at(-1), /35 %/);
});

/* ── Ensamblado ──────────────────────────────────────────────────────────── */
test('valores por defecto y ⚠ correctos (1 CUPS, 3.0TD)', () => {
  const m = modelo1();
  assert.equal(m.campos.oferta_numero, '0000000');
  assert.equal(m.avisos.oferta_numero, 'Número de oferta pendiente');
  assert.equal(m.campos.tipo_documento, 'IDENTIFICADOR FISCAL');
  assert.equal(m.campos.iban, 'ES0000000000000000000000');
  assert.equal(m.campos.fiscal_provincia, 'PALENCIA ESPAÑA');
  assert.equal(m.campos.check_acepta_comunicaciones, false);
  assert.equal(m.campos.cnae, '');
  const s = m.suministros[0];
  assert.equal(s.producto, 'TEL3T - TEMPO OPEN 3.0TD');
  assert.equal(s.tramo_potencia, '> 15kW (3.0TD)');
  assert.equal(s.tension, '3X400/230');
  assert.equal(m.avisos['s0.tension'], 'Valor por defecto');
  assert.equal(s.potencia_p1, '20');
  assert.equal(m.avisos.fiscal_via, undefined, 'dato leído: sin aviso');
  assert.equal(m.avisos['s0.sum_via'], undefined, 'la dirección leída no lleva aviso');
  assert.equal(m.avisos.validez_desde, undefined);
  assert.equal(m.avisos.modalidad, undefined, 'Plana está validada');
  assert.equal(estaCompleta(m), true);
});

test('la tarjeta CIF tiene prioridad para el domicilio fiscal', () => {
  const m = modelo1({ lecturas: { ...lecturas(), cif: { cif: 'B00000000', domicilio: { via: 'PLAZA FISCAL', cp: '47001', localidad: 'VALLADOLID', provincia: 'VALLADOLID' } } } });
  assert.equal(m.campos.fiscal_via, 'PLAZA FISCAL');
});

test('6.1TD definitivo: textos propios, sin ⚠ fijos, sin tensión por defecto', () => {
  assert.equal(PRODUCTO_TEXTO['6.1TD'], 'TEMPO OPEN 6.1TD');
  assert.equal(TRAMO_POTENCIA['6.1TD'], '> 15kW (6.1TD)');
  const op = { clientes: [cliente({ tarifa: '6.1TD' })], tarifaInfo: vigente(OPEN_61TD) };
  const leida = modelo1({ ...op, lecturas: lecturas([factura(100, { tension: '20 kV' })]) });
  const s = leida.suministros[0];
  assert.equal(s.producto, 'TEMPO OPEN 6.1TD');
  assert.equal(s.tramo_potencia, '> 15kW (6.1TD)');
  assert.equal(s.tension, '20 kV');
  assert.equal(leida.avisos['s0.producto'], undefined);
  assert.equal(leida.avisos['s0.tramo_potencia'], undefined);
  assert.equal(leida.avisos['s0.tension'], undefined, 'tensión leída: sin aviso');

  const sin = modelo1({ ...op, lecturas: lecturas([factura(100)]) });
  assert.equal(sin.suministros[0].tension, '');
  assert.equal(sin.avisos['s0.tension'], 'No se pudo leer: complétalo');
  assert.ok(obligatoriosVacios(sin).includes('s0.tension'));
});

test('tarifa caducada: no bloquea, imprime la validez real y marca ⚠ en las fechas', () => {
  assert.equal(PERMITIR_TARIFA_CADUCADA, true);
  const m = modelo1({ tarifaInfo: caducada(OPEN_30TD), fechaISO: '2026-10-31' });
  assert.equal(m.tarifa_caducada, true);
  assert.equal(m.campos.validez_desde, '19-10-2026');
  assert.equal(m.campos.validez_hasta, '28-10-2026');
  assert.ok(m.avisos.validez_desde);
  assert.ok(m.avisos.validez_hasta);
  assert.equal(m.campos.fecha_firma, '31-10-2026');
  assert.ok(m.suministros[0].bloque_precios.length > 0);
});

test('si la IA falla no se bloquea: campos vacíos con ⚠ y sin completar', () => {
  const m = modelo1({ lecturas: { facturas: [null], cif: null, dni: null } });
  assert.equal(m.avisos.contacto_nombre, 'No se pudo leer: complétalo');
  assert.equal(m.avisos['s0.potencia_p1'], 'No se pudo leer: complétalo');
  assert.equal(m.suministros[0].bloque_precios, null);
  assert.equal(estaCompleta(m), false);
  assert.ok(obligatoriosVacios(m).includes('s0.sum_via'));
});

test('distribuidora sin texto: obligatoria; BAJA / NO_OFICIAL sin ⚠', () => {
  const sin = modelo1({ distribuidoras: [{ texto_endesa: null, estado: 'ACTIVA' }] });
  assert.ok(obligatoriosVacios(sin).includes('s0.distribuidora'));
  const baja = modelo1({ distribuidoras: [{ ...dist, estado: 'BAJA' }] });
  assert.equal(baja.avisos['s0.distribuidora'], undefined);
});

test('comprobaciones cruzadas: CUPS y CIF; las potencias no llevan aviso', () => {
  const m = modelo1({ lecturas: lecturas([factura(10, { cups: 'ES0022000000000000XX1P', cif: 'B11111111', potencias: { p1: 10, p2: 9, p3: 9, p4: 9, p5: 9, p6: 9 } })]) });
  assert.match(m.avisos['s0.cups'], /otro CUPS/);
  assert.match(m.avisos.documento_numero, /otro CIF/);
  assert.equal(m.avisos['s0.potencia_p1'], undefined);
});

test('edición: modalidad recalcula el bloque y potencia cambia de tramo; quita el ⚠', () => {
  const m = modelo1();
  const dia = aplicarEdicion(m, 'modalidad', 'dia', OPEN_30TD);
  assert.match(lineas(dia.suministros[0].bloque_precios).at(-1), /20 %/);
  assert.equal(dia.avisos.modalidad, undefined);
  const pot = aplicarEdicion(m, 's0.potencia_p6', '60,5', OPEN_30TD);
  assert.equal(pot.suministros[0].potencia_p6, '60.5');
  assert.match(lineas(pot.suministros[0].bloque_precios)[1], /0,251088/);
  const via = aplicarEdicion(m, 's0.sum_via', 'CALLE NUEVA', OPEN_30TD);
  assert.equal(via.avisos['s0.sum_via'], undefined);
  assert.match(via.suministros[0].sum_direccion_completa, /^CALLE NUEVA 25/);
  assert.equal(m.suministros[0].sum_via, 'AVENIDA DE PRUEBA', 'no muta el modelo original');
});

test('Aviso 2: lista de campos vacíos', () => {
  const v = camposVaciosAviso(modelo1());
  assert.ok(v.includes('CNAE') && v.includes('horario de contacto') && v.includes('fecha de nacimiento'));
});

test('IA: esquema cerrado, descarta claves y valores no válidos', () => {
  const f = limpiarFactura({ cups: ' ES0021 ', iban: 'ES99', potencias: { p1: '15,5', p2: -1, p9: 3 }, suministro: { via: 'X', hack: 1 } });
  assert.equal(f.iban, undefined);
  assert.equal(f.potencias.p1, 15.5);
  assert.equal(f.potencias.p2, null);
  assert.equal(f.potencias.p9, undefined);
  assert.equal(f.suministro.hack, undefined);
  assert.equal(limpiarCif('{"cif":"B1","precio":1}').precio, undefined);
  assert.equal(limpiarDni({ nombre: null, dni: 5 }).dni, '5');
});

/* ── Generador con plantillas ────────────────────────────────────────────── */
const sum3 = () => [1, 2, 3].map((n) => cliente({ id: n, cups: `ES002100000000000${n}XX0F` }));

test('1 CUPS: contrato de 7 páginas y anexo de 3, sin marca de agua', pdfOpt, async () => {
  const d = derivarDocumentos(modelo1());
  const c = await PDFDocument.load(await generarContrato(base.contrato, campos.contrato, d.contrato));
  const a = await PDFDocument.load(await generarAnexo(base.anexo, campos.anexo, d.anexo));
  assert.equal(c.getPageCount(), 7);
  assert.equal(a.getPageCount(), 3);
  assert.equal(d.puntos, null);
});

test('3 CUPS: tres documentos; B y C vacíos en el contrato', pdfOpt, async () => {
  const m = modelo1({
    clientes: sum3(), distribuidoras: [dist, dist, dist],
    lecturas: lecturas([factura(20), factura(44), factura(63)]),
  });
  assert.equal(m.multipunto, true);
  assert.equal(estaCompleta(m), true);
  const d = derivarDocumentos(m);
  assert.equal(d.contrato.cups, '');
  assert.equal(d.contrato.sum_via, '');
  assert.equal(d.anexo.suministros.length, 3);
  assert.equal(d.puntos.suministros.length, 3);
  await generarContrato(base.contrato, campos.contrato, d.contrato);
  await generarAnexo(base.anexo, campos.anexo, d.anexo);
  await generarAnexoPuntos(base.puntos, camposPS, d.puntos);
  assert.match(d.anexo.suministros[2].bloque_precios[1].texto, /0,251088/);
  assert.match(d.anexo.suministros[1].bloque_precios[1].texto, /0,251588/);
});

test('errores del generador: falta dato, no cabe, más de 3 suministros', pdfOpt, async () => {
  const d = derivarDocumentos(modelo1());
  await assert.rejects(generarContrato(base.contrato, campos.contrato, { ...d.contrato, cups: '' }), /Faltan datos/);
  await assert.rejects(generarContrato(base.contrato, campos.contrato, { ...d.contrato, sum_numero: 'NÚMERO MUY LARGO QUE NO CABE EN SU CASILLA DE NINGUNA MANERA' }), /no cabe/);
  await assert.rejects(generarAnexo(base.anexo, campos.anexo, { ...d.anexo, suministros: [] }), /admite de 1 a 3/);
  const m3 = derivarDocumentos(modelo1({ clientes: sum3(), distribuidoras: [dist, dist, dist], lecturas: lecturas([factura(), factura(), factura()]) }));
  await assert.rejects(generarAnexoPuntos(base.puntos, camposPS, { ...m3.puntos, suministros: [...m3.puntos.suministros, m3.puntos.suministros[0]] }), /2 a 3/);
  await assert.rejects(generarAnexoPuntos(base.puntos, camposPS, { ...m3.puntos, suministros: [m3.puntos.suministros[0]] }), /2 a 3/);
});

test('vista previa con vacíos: genera sin error si se permite; 6.1TD Día cabe en el recuadro', pdfOpt, async () => {
  const m = modelo1({ lecturas: { facturas: [null], cif: null, dni: null } });
  const d = derivarDocumentos(m);
  await assert.rejects(generarContrato(base.contrato, campos.contrato, d.contrato), /Faltan datos/);
  const op = { permitirVacios: true };
  await generarContrato(base.contrato, campos.contrato, d.contrato, op);
  await generarAnexo(base.anexo, campos.anexo, d.anexo, op);

  const m61 = modelo1({ clientes: [cliente({ tarifa: '6.1TD' })], tarifaInfo: vigente(OPEN_61TD), modalidad: 'noche', lecturas: lecturas([factura(100, { tension: '20 kV' })]) });
  await generarAnexo(base.anexo, campos.anexo, derivarDocumentos(m61).anexo);
});

test('ventana de generación: comprobación de los CUPS escritos', () => {
  const alta = (cups, cif, tarifa, id_producto) => ({ id: cups, cups, cif_dni: cif, tarifa, id_producto });
  const a = alta('ES0021000000000001XX0F', 'B1', '3.0TD', 'Open 3.0TD');
  const b = alta('ES0021000000000002XX0F', 'b1 ', '3.0TD', 'Open 3.0TD');
  assert.deepEqual(limpiarCups(['es0021 000000000001xx0f', '', 'ES0021000000000001XX0F']), ['ES0021000000000001XX0F']);
  assert.equal(comprobarCups([b.cups, a.cups], [a, b], {}).clientes[0], b);
  assert.match(comprobarCups(['ES1'], [a], {}).error, /No existe en Alta B2B: ES1/);
  assert.match(comprobarCups(['X'], [alta('X', 'B1', '2.0TD', 'TEMPO 2.0TD')], {}).error, /TEMPO 2\.0TD/);
  assert.match(comprobarCups(['X'], [alta('X', 'B1', '3.0TD', 'Luz Fija 24H')], {}).error, /Luz Fija 24H/);
  assert.match(comprobarCups([a.cups, 'Y'], [a, alta('Y', 'B2', '3.0TD', 'Open 3.0TD')], {}).error, /mismo CIF/);
  assert.match(comprobarCups([a.cups, 'Y'], [a, alta('Y', 'B1', '6.1TD', 'Open 6.1TD')], {}).error, /misma tarifa/);
  assert.match(comprobarCups([a.cups], [a], { [a.cups]: {} }).error, /Ya tiene documentación/);
});

const persona = (o = {}) => cliente({ nombre: 'VICTOR RAMIREZ SAGREDO P21', cif_dni: '12345678Z', ...o });
const lecturaDni = { nombre: 'VICTOR RAMIREZ SAGREDO', dni: '12345678Z' };

test('caso P21: el titular sale de la factura y se compara con el DNI, nunca del Alta', () => {
  const m = modelo1({ clientes: [persona()], lecturas: { facturas: [factura(20, { titular: 'VICTOR RAMIREZ SAGREDO' })], cif: null, dni: lecturaDni } });
  assert.equal(m.campos.titular_nombre, 'VICTOR RAMIREZ SAGREDO');
  assert.equal(m.campos.cuenta_titular, 'VICTOR RAMIREZ SAGREDO');
  assert.equal(derivarDocumentos(m).anexo.titular_nombre, 'VICTOR RAMIREZ SAGREDO');
  assert.equal(m.campos.documento_numero, '12345678Z');
  assert.equal(m.avisos.titular_nombre, undefined);
});

test('titular: factura ilegible, nombre del DNI con ⚠; sin nada, vacío y nunca el del Alta', () => {
  const conDni = modelo1({ clientes: [persona()], lecturas: { facturas: [null], cif: null, dni: lecturaDni } });
  assert.equal(conDni.campos.titular_nombre, 'VICTOR RAMIREZ SAGREDO');
  assert.equal(conDni.avisos.titular_nombre, 'No se pudo leer: complétalo');
  const sinNada = modelo1({ clientes: [persona()], lecturas: { facturas: [null], cif: null, dni: null } });
  assert.equal(sinNada.campos.titular_nombre, '');
  assert.ok(obligatoriosVacios(sinNada).includes('titular_nombre'));
});

test('titular de empresa: factura, comparada con la tarjeta CIF o recibo', () => {
  const lect = (razon, titular) => ({ facturas: [titular ? factura(20, { titular }) : null], cif: razon ? { razon_social: razon } : null, dni: lecturaDni });
  const f = modelo1({ lecturas: lect(null, 'Empresa De Factura SL') });
  assert.equal(f.campos.titular_nombre, 'EMPRESA DE FACTURA SL');
  assert.equal(f.avisos.titular_nombre, undefined, 'sin tarjeta con la que comparar');
  const sinFactura = modelo1({ lecturas: lect('EMPRESA REAL, S.L.', null) });
  assert.equal(sinFactura.campos.titular_nombre, 'EMPRESA REAL, S.L.');
  assert.equal(sinFactura.avisos.titular_nombre, 'No se pudo leer: complétalo');
  assert.equal(modelo1({ lecturas: lect('EMPRESA REAL, S.L.', 'EMPRESA REAL SL') }).avisos.titular_nombre, undefined);
  const distinta = modelo1({ lecturas: lect('EMPRESA REAL, S.L.', 'OTRA, S.A.') });
  assert.equal(distinta.campos.titular_nombre, 'OTRA, S.A.');
  assert.match(distinta.avisos.titular_nombre, /otro titular \(EMPRESA REAL, S\.L\.\)/);
});

test('el orden del nombre no cuenta como discrepancia entre factura y DNI', () => {
  const m = modelo1({ clientes: [persona()], lecturas: { facturas: [factura(20, { titular: 'RAMÍREZ SAGREDO, VICTOR' })], cif: null, dni: lecturaDni } });
  assert.equal(m.avisos.titular_nombre, undefined);
  const otro = modelo1({ clientes: [persona()], lecturas: { facturas: [factura(20, { titular: 'OTRA PERSONA' })], cif: null, dni: lecturaDni } });
  assert.match(otro.avisos.titular_nombre, /otro titular/);
});

test('⚠ solo en oferta, tensión por defecto y, si procede, caducidad, datos sin leer y discrepancias', () => {
  const m = modelo1({ lecturas: { facturas: [factura(20, { titular: 'TALLERES DEMO DEL NORTE, S.L.', tension: '3X400/230' })], cif: { cif: 'B00000000', razon_social: 'TALLERES DEMO DEL NORTE, S.L.', domicilio: { via: 'PLAZA', cp: '47001', localidad: 'VALLADOLID', provincia: 'VALLADOLID' } }, dni: lecturaDni } });
  assert.deepEqual(Object.keys(m.avisos), ['oferta_numero']);
  assert.deepEqual(Object.keys(modelo1({ modalidad: 'noche', lecturas: { facturas: [factura(20, { titular: 'X' })], cif: { cif: 'B00000000', razon_social: 'X', domicilio: { via: 'P', cp: '1', localidad: 'L', provincia: 'P' } }, dni: lecturaDni } }).avisos).sort(), ['oferta_numero', 's0.tension']);
});

test('nº de documento: Alta, luego factura, luego DNI', () => {
  const sin = cliente({ cif_dni: '' });
  assert.equal(modelo1({ clientes: [sin], lecturas: { facturas: [factura(20, { cif: 'B22222222' })], cif: null, dni: lecturaDni } }).campos.documento_numero, 'B22222222');
  assert.equal(modelo1({ clientes: [sin], lecturas: { facturas: [factura(20, { cif: null })], cif: null, dni: lecturaDni } }).campos.documento_numero, '12345678Z');
  assert.match(modelo1({ clientes: [persona()], lecturas: { facturas: [factura()], cif: null, dni: { ...lecturaDni, dni: '87654321X' } } }).avisos.documento_numero, /otro número/);
});

test('dirección de suministro: escalera, piso y puerta en su casilla; el anexo lleva el formato de Endesa', () => {
  const suministro = { via: 'CALLE MAYOR', numero: '42', escalera: 'A', piso: 'BAJ', puerta: 'B', cp: '34001', localidad: 'PALENCIA', provincia: 'PALENCIA' };
  const m = modelo1({ lecturas: lecturas([factura(20, { suministro })]) });
  const s = m.suministros[0];
  assert.deepEqual([s.sum_escalera, s.sum_piso, s.sum_puerta], ['A', 'BAJ', 'B']);
  assert.equal(s.sum_direccion_completa, 'CALLE MAYOR 42 34001 PALENCIA PALENCIA PALENCIA');
  const contrato = derivarDocumentos(m).contrato;
  assert.deepEqual([contrato.sum_escalera, contrato.sum_piso, contrato.sum_puerta], ['A', 'BAJ', 'B']);
  assert.equal(m.avisos['s0.sum_piso'], undefined);
  assert.equal(aplicarEdicion(m, 's0.sum_piso', '2', OPEN_30TD).suministros[0].sum_direccion_completa, 'CALLE MAYOR 42 34001 PALENCIA PALENCIA PALENCIA');
});

test('lectura del DNI: NOMBRE APELLIDOS; la factura trae titular y escalera', () => {
  assert.equal(limpiarDni({ nombre: 'VICTOR', apellidos: 'RAMIREZ SAGREDO', dni: '1' }).nombre, 'VICTOR RAMIREZ SAGREDO');
  const f = limpiarFactura({ titular: 'X', suministro: { escalera: '2', piso: 'BAJ' } });
  assert.equal(f.titular, 'X');
  assert.equal(f.suministro.escalera, '2');
  assert.equal(f.suministro.piso, 'BAJ');
});

test('modificaciones: textos legibles, sin cambios que vuelven al valor inicial', () => {
  const c = describirCambios({
    modalidad: { de: 'plana', a: 'finde' },
    titular_nombre: { de: 'A', a: 'B' },
    's0.sum_piso': { de: '', a: 'BAJ' },
    check_acepta_comunicaciones: { de: false, a: true },
    iban: { de: 'X', a: 'X' },
  });
  assert.deepEqual(c.map((x) => [x.campo, x.de, x.a]), [
    ['Modalidad', 'Plana', 'Fin de Semana'],
    ['Nombre del titular', 'A', 'B'],
    ['Piso (suministro)', '', 'BAJ'],
    ['Acepta comunicaciones', 'No', 'Sí'],
  ]);
  assert.equal(etiquetaCampo('s1.tension', true), 'Tensión · Suministro 2');
  assert.equal(etiquetaCampo('s0.tension', false), 'Tensión');
});

test('modificaciones: fecha y hora españolas, en horario de Madrid', () => {
  assert.deepEqual(fechaHoraES('2026-11-01T11:30:00Z'), { fecha: '01/11/2026', hora: '12:30' });
  assert.deepEqual(fechaHoraES('2026-07-01T22:05:00Z'), { fecha: '02/07/2026', hora: '00:05' });
});

test('compartir: todos con todos por defecto; el bloqueo solo quita a esa persona', () => {
  const u = ['a', 'b', 'c'].map((username) => ({ username }));
  const nombres = (bloqueos) => destinatariosPermitidos(u[0], u, bloqueos).map((x) => x.username);
  assert.deepEqual(nombres({}), ['b', 'c']);
  assert.deepEqual(nombres({ a: ['b'] }), ['c']);
  assert.deepEqual(nombres({ b: ['c'] }), ['b', 'c'], 'el bloqueo de otro no afecta');
});
