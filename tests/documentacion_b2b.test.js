import { test } from 'node:test';
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
  assert.ok(m.avisos.fiscal_via);
  assert.ok(m.avisos['s0.sum_via']);
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
  assert.equal(leida.avisos['s0.tension'], 'Deducido por la IA del documento: revísalo');

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

test('distribuidora sin texto: obligatoria; BAJA / NO_OFICIAL con ⚠', () => {
  const sin = modelo1({ distribuidoras: [{ texto_endesa: null, estado: 'ACTIVA' }] });
  assert.ok(obligatoriosVacios(sin).includes('s0.distribuidora'));
  const baja = modelo1({ distribuidoras: [{ ...dist, estado: 'BAJA' }] });
  assert.match(baja.avisos['s0.distribuidora'], /BAJA/);
});

test('comprobaciones cruzadas: CUPS, CIF y potencias', () => {
  const m = modelo1({ lecturas: lecturas([factura(10, { cups: 'ES0022000000000000XX1P', cif: 'B11111111', potencias: { p1: 10, p2: 9, p3: 9, p4: 9, p5: 9, p6: 9 } })]) });
  assert.match(m.avisos['s0.cups'], /otro CUPS/);
  assert.match(m.avisos.documento_numero, /otro CIF/);
  assert.match(m.avisos['s0.potencia_p1'], /15 kW/);
});

test('edición: modalidad recalcula el bloque y potencia cambia de tramo; quita el ⚠', () => {
  const m = modelo1();
  const dia = aplicarEdicion(m, 'modalidad', 'dia', OPEN_30TD);
  assert.match(lineas(dia.suministros[0].bloque_precios).at(-1), /20 %/);
  assert.equal(dia.avisos.modalidad, 'Texto de modalidad sin validar con un anexo real');
  assert.equal(aplicarEdicion(dia, 'modalidad', 'laboral', OPEN_30TD).avisos.modalidad, undefined);
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
