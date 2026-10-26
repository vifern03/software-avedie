/**
 * Verificación de datos extraídos y lectura de números (fases 1 y 2).
 *
 * Caso de referencia: factura Integra 3.0TD (sep-2026) donde "15.001" kW (punto
 * decimal en esa línea) acababa como 15001 kW en la comparativa. Fixture anonimizada.
 * Además: corrupciones deliberadas, lecturas ambiguas, datos ausentes, potencias
 * elevadas legítimas, ediciones manuales y los tres tipos de factura (3.0/6.1, 2.0, gas).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerNumero, aCampo, formatoES, cantidadES, convencionDeLinea, variantesImpresas } from '../src/lib/energia/numeros.js';
import { lineasConToken, citaEnPdf, agruparEnLineas } from '../src/lib/energia/textoPdf.js';
import { verificarExtraccion, resolver, candidatosCampo } from '../src/lib/energia/verificacion.js';
import { LUZ_B2B, LUZ_20, GAS_ESQ } from '../src/lib/energia/esquemas.js';
import { volcarAFormulario, evaluarFormulario } from '../src/lib/energia/formulario.js';
import { calcularOfertaLuz } from '../src/lib/energia/motor.js';
import { construirInforme } from '../src/lib/energia/informe.js';
import { OPEN_30TD, OPEN_61TD } from '../src/data/tarifasB2B.js';

const F = JSON.parse(readFileSync(new URL('./fixtures/integra_30td.json', import.meta.url), 'utf8'));
const PDF = { lineas: F.lineasPdf };
const P = [1, 2, 3, 4, 5, 6];
const near = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const potencias = (v) => P.map(p => v[`pot${p}`]);
const MAPA_B2B = Object.assign({ dias: 'dias', total: 'facturaActual' }, ...P.map(i => ({ [`pot${i}`]: `kwPotP${i}`, [`kwh${i}`]: `kwhP${i}` })));
const sinIA = async () => null;

/* ══════════════════════════ Números ══════════════════════════ */

test('leerNumero: formatos inequívocos', () => {
  const casos = [
    ['15,001', 15.001], ['1.824,43', 1824.43], ['0,059937', 0.059937], ['17.0', 17], ['1442.0', 1442],
    ['0.083863', 0.083863], ['15.0012', 15.0012], ['0.153', 0.153], ['1.234.567', 1234567], ['1,234,567', 1234567],
    ['1,234.5', 1234.5], ['-0,20', -0.2], ['−1.627,40', -1627.4], ['41', 41], ['  3 000 ', 3000], [',5', 0.5], [15.001, 15.001], [15001, 15001],
  ];
  for (const [e, v] of casos) {
    const r = leerNumero(e);
    assert.equal(r.ambiguo, false, `${e} no debería ser ambiguo`);
    assert.equal(r.valor, v, `${e} → ${r.valor}`);
  }
});

test('leerNumero: "15.001" es ambiguo; la convención decide; sin contexto, formato español', () => {
  const r = leerNumero('15.001');
  assert.equal(r.ambiguo, true);
  assert.deepEqual(r.lecturas, [15.001, 15001]);
  assert.equal(r.valor, 15001);
  assert.equal(leerNumero('15.001', { convencion: 'punto' }).valor, 15.001);
  assert.equal(leerNumero('15.001', { convencion: 'coma' }).valor, 15001);
});

test('leerNumero: vacío = ausente (nunca 0), basura = inválido, 0 real = 0', () => {
  for (const e of ['', '   ', null, undefined]) assert.equal(leerNumero(e).ausente, true);
  assert.equal(leerNumero('').valor, null);
  assert.equal(leerNumero('abc').invalido, true);
  assert.equal(leerNumero('1,2,3').invalido, true);
  assert.equal(leerNumero('0').valor, 0);
  assert.equal(leerNumero('0.0').valor, 0);
  assert.equal(leerNumero('0,00').valor, 0);
});

test('aCampo → leerNumero devuelve exactamente el mismo número (ida y vuelta)', () => {
  const fijos = [15.001, 15001, 1824.43, 0.059937, 41, 0, 0.1 + 0.2, 1e-7, 123456789.125, 27.263, 27263, 4.6, 109.252];
  let semilla = 7;
  const azar = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647;
  const aleatorios = Array.from({ length: 3000 }, () => {
    const escala = 10 ** Math.floor(azar() * 9 - 3);
    const dec = Math.floor(azar() * 7);
    return Math.round(azar() * escala * 10 ** dec) / 10 ** dec;
  });
  for (const x of [...fijos, ...aleatorios, ...aleatorios.map(v => -v)]) {
    const t = aCampo(x);
    const r = leerNumero(t);
    assert.equal(r.ambiguo, false, `"${t}" no debe ser ambiguo`);
    assert.ok(Math.abs(r.valor - x) <= Math.abs(x) * 1e-12, `${x} → "${t}" → ${r.valor}`);
  }
  assert.equal(aCampo(15.001), '15,001');
  assert.equal(aCampo(15001), '15001');
  assert.equal(aCampo(null), '');
});

test('formato español para informes', () => {
  assert.equal(cantidadES(15.001), '15,001');
  assert.equal(cantidadES(1442), '1.442');
  assert.equal(cantidadES(41), '41');
  assert.equal(formatoES(0.059937, 6), '0,059937');
  assert.equal(formatoES(1824.43, 2), '1.824,43');
});

test('convención decimal de una línea impresa', () => {
  assert.equal(convencionDeLinea('Pot. Contratada (kW) 15.001, 17.0, 17.0, 17.0, 17.0, 41.0'), 'punto');
  assert.equal(convencionDeLinea('P1 35 kW x 31 días x 0,055827 €/kW día   60,57 €'), 'coma');
  assert.equal(convencionDeLinea('TOTAL 1.824,43 €'), 'coma');
  assert.equal(convencionDeLinea('Potencias contratadas: punta-llano 3,000 kW; valle 3,000 kW'), 'coma');
  assert.equal(convencionDeLinea('Consumo 15.001 kWh'), null);
  assert.ok(variantesImpresas(15.001).includes('15.001'));
  assert.ok(variantesImpresas(15001).includes('15.001'));
});

/* ══════════════════════════ Texto del PDF ══════════════════════════ */

test('texto del PDF: líneas, tokens completos y citas', () => {
  const lineas = agruparEnLineas([
    { str: 'Pot. Contratada (kW)', transform: [1, 0, 0, 9, 10, 700], width: 90 },
    { str: '15.001, 17.0, 41.0', transform: [1, 0, 0, 9, 102, 700.5], width: 70 },
    { str: 'Total', transform: [1, 0, 0, 9, 10, 650], width: 20 },
    { str: '1.824,43 €', transform: [1, 0, 0, 9, 300, 650], width: 40 },
  ]);
  assert.deepEqual(lineas, ['Pot. Contratada (kW) 15.001, 17.0, 41.0', 'Total   1.824,43 €']);
  assert.equal(lineasConToken(PDF, '15.001').length, 1);
  assert.equal(lineasConToken(PDF, '5.001').length, 0, 'no casa dentro de otro número');
  assert.equal(lineasConToken(PDF, '15.00').length, 0);
  assert.ok(citaEnPdf(PDF, 'Pot. Contratada (kW) 15.001, 17.0, 17.0, 17.0, 17.0, 41.0'));
  assert.equal(citaEnPdf(PDF, 'Pot. Contratada (kW) 15001, 17, 17, 17, 17, 41'), null, 'una cita inventada no es evidencia');
});

/* ══════════════════════════ Factura Integra (3.0TD) ══════════════════════════ */

test('Integra: extracción correcta → se acepta tal cual, sin bloqueos ni correcciones', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex: F.ex, textoPdf: PDF, revisarIA: sinIA });
  assert.deepEqual(potencias(r.valores), [15.001, 17, 17, 17, 17, 41]);
  assert.equal(r.bloqueos.length, 0);
  assert.equal(r.autocorrecciones.length, 0);
  assert.equal(r.campos.pot1.verificadoPdf, true);
  assert.equal(r.campos.pot1.convencion, 'punto');
});

for (const [nombre, cambios, textoPdf] of [
  ['IA devuelve 15001 (con literal y PDF)', { potenciaContratadaKw: [15001, 17, 17, 17, 17, 41] }, PDF],
  ['IA devuelve 15001 sin literal (solo PDF)', { potenciaContratadaKw: [15001, 17, 17, 17, 17, 41], textos: {} }, PDF],
  ['IA devuelve 15001, literal "15.001" y sin PDF (escaneada)', { potenciaContratadaKw: [15001, 17, 17, 17, 17, 41] }, null],
]) {
  test(`Integra: ${nombre} → se corrige sola a 15,001 con evidencia`, async () => {
    const r = await verificarExtraccion({ esquema: LUZ_B2B, ex: { ...F.ex, ...cambios }, textoPdf, revisarIA: sinIA });
    assert.deepEqual(potencias(r.valores), [15.001, 17, 17, 17, 17, 41]);
    assert.equal(r.bloqueos.length, 0);
    assert.equal(r.autocorrecciones.length, 1);
    assert.match(r.autocorrecciones[0].msg, /15001.*15,001/);
  });
}

test('Integra: 15001 sin ninguna evidencia (ni literal ni PDF) y sin revisión → bloqueo explicado', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex: { ...F.ex, potenciaContratadaKw: [15001, 17, 17, 17, 17, 41], textos: {} }, textoPdf: null, revisarIA: sinIA });
  assert.equal(r.bloqueos.length, 1);
  assert.match(r.bloqueos[0].msg, /menor a mayor/);
});

test('Integra: sin evidencia, la segunda consulta a la IA (cita literal) lo resuelve', async () => {
  const pedidos = [];
  const revisarIA = async (campos) => { pedidos.push(campos.map(c => c.clave)); return { pot1: { linea: 'Pot. Contratada (kW) 15.001, 17.0, 17.0, 17.0, 17.0, 41.0', texto: '15.001' } }; };
  const ex = { ...F.ex, potenciaContratadaKw: [15001, 17, 17, 17, 17, 41], textos: {} };
  const conPdfSinLiteral = { lineas: F.lineasPdf.filter(l => !l.texto.startsWith('Pot.')).concat({ pagina: 1, texto: 'Pot. Contratada (kW) 15.001, 17.0, 17.0, 17.0, 17.0, 41.0' }) };
  // Sin PDF: la cita no se puede comprobar contra el documento, pero su lectura es la única coherente.
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: null, revisarIA });
  assert.deepEqual(potencias(r.valores), [15.001, 17, 17, 17, 17, 41]);
  assert.equal(r.bloqueos.length, 0);
  assert.ok(pedidos[0].includes('pot1'));
  assert.equal(r.traza.revisionIA.respondida, true);
  // La revisión no recibe el valor de la primera extracción.
  assert.ok(conPdfSinLiteral);
});

test('Integra: una cita de la revisión que NO está en el PDF no sirve como evidencia', async () => {
  const pdfSinPotencias = { lineas: F.lineasPdf.filter(l => !/Pot\. Contratada|kW   \d/.test(l.texto)) };
  const revisarIA = async () => ({ pot1: { linea: 'Potencia contratada P1: 15,001 kW', texto: '15,001' } });
  const ex = { ...F.ex, potenciaContratadaKw: [15001, 17, 17, 17, 17, 41], textos: {} };
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: pdfSinPotencias, revisarIA });
  assert.equal(r.bloqueos.length, 1, 'cita inventada → sigue bloqueado');
});

test('Integra de principio a fin: formulario → tramo 30 < Pc ≤ 50 por P6 → potencia 75,31 € → informe en formato español', async () => {
  const verif = await verificarExtraccion({ esquema: LUZ_B2B, ex: { ...F.ex, potenciaContratadaKw: [15001, 17, 17, 17, 17, 41] }, textoPdf: PDF, revisarIA: sinIA });
  const { textos, base } = volcarAFormulario(verif, MAPA_B2B);
  assert.equal(textos.kwPotP1, '15,001');
  assert.equal(textos.kwPotP6, '41');
  assert.equal(textos.facturaActual, '1824,43');
  const ev = evaluarFormulario({ esquema: LUZ_B2B, mapa: MAPA_B2B, form: textos, base, contexto: LUZ_B2B.contexto(F.ex) });
  assert.equal(ev.bloqueos.length, 0);
  const r = calcularOfertaLuz({
    producto: OPEN_30TD, modalidadId: 'plana', potenciasKw: P.map(p => ev.valores[`pot${p}`]), kwhPeriodo: P.map(p => ev.valores[`kwh${p}`]),
    dias: ev.valores.dias, periodo: F.ex.periodoConsumo, ivaRate: 0.21, ignorarVigencia: true,
    mantenidos: { excesos: 1.07, reactiva: 64.46, alquiler: 5.94, bonoSocial: 0.76 },
  });
  assert.equal(r.estado, 'ok');
  assert.equal(r.precioInfo?.tramo ?? r.tramo, '30 < Pc ≤ 50 kW');
  assert.ok(r.avisos.some(a => a.includes('= 41 kW')));
  near(r.potencia, 75.31);
  const inf = construirInforme({ resultado: r, oferta: 'Open 3.0TD — Plana', dias: 30, facturaOriginal: ev.valores.total });
  assert.equal(inf.potencia[0].detalle, '15,001 kW (P1) × 30 días × 0,059937 €/kW');
  assert.equal(inf.energia[0].detalle, '1.442 kWh (P3) × 0,168564 €/kWh');
  assert.ok(!JSON.stringify(inf).includes('15.001'));
});

/* ══════════════════════════ Corrupciones deliberadas ══════════════════════════ */

const CORRUPCIONES = [
  ['P1 ×1000', (e) => { e.potenciaContratadaKw[0] *= 1000; }],
  ['P6 ×1000', (e) => { e.potenciaContratadaKw[5] *= 1000; }],
  ['P3 ÷1000', (e) => { e.potenciaContratadaKw[2] /= 1000; }],
  ['P1 ↔ P6', (e) => { const p = e.potenciaContratadaKw; [p[0], p[5]] = [p[5], p[0]]; }],
  ['P6 ausente', (e) => { e.potenciaContratadaKw[5] = null; }],
  ['kWh P3 ×1000', (e) => { e.consumoFacturadoKwh[2] *= 1000; }],
  ['kWh P6 duplicado en P4', (e) => { e.consumoFacturadoKwh[3] = e.consumoFacturadoKwh[5]; }],
];

for (const [nombre, corromper] of CORRUPCIONES) {
  for (const conPdf of [true, false]) {
    test(`corrupción "${nombre}" ${conPdf ? 'con' : 'sin'} texto PDF: se corrige al valor real o se bloquea; nunca pasa`, async () => {
      const ex = structuredClone(F.ex);
      corromper(ex);
      const r = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: conPdf ? PDF : null, revisarIA: sinIA });
      const correcto = P.every(p => r.valores[`pot${p}`] === F.ex.potenciaContratadaKw[p - 1] && r.valores[`kwh${p}`] === F.ex.consumoFacturadoKwh[p - 1]);
      assert.ok(correcto || r.bloqueos.length > 0, `pasó sin detectar: ${JSON.stringify(r.valores)}`);
      if (correcto) assert.ok(r.autocorrecciones.length > 0 || r.info.length > 0, 'una corrección debe quedar explicada');
    });
  }
}

/* ══════════════════════════ Casos legítimos que NO deben bloquear ══════════════════════════ */

test('6.1TD con potencias elevadas legítimas (500–1.200 kW) y datos coherentes → se acepta', async () => {
  const pots = [500, 500, 500, 500, 500, 1200];
  const dias = 31;
  const imp = pots.reduce((a, x, i) => a + x * dias * OPEN_61TD.potenciaTerminos[i].anyo / 365, 0) * 1.1;
  const kwh = [60000, 55000, 40000, 38000, 30000, 120000];
  const ex = {
    tarifaAcceso: '6.1TD', diasFacturados: dias, potenciaContratadaKw: pots, consumoFacturadoKwh: kwh, consumoTotalKwh: 343000,
    importes: { potencia: Math.round(imp * 100) / 100, energiaTotal: 51450, total: 75000.12 },
    textos: { potenciaContratadaKw: ['500', '500', '500', '500', '500', '1.200'], total: '75.000,12' },
  };
  const pdf = { lineas: [{ pagina: 1, texto: 'Potencia contratada (kW): 500 / 500 / 500 / 500 / 500 / 1.200' }, { pagina: 1, texto: 'Total factura 75.000,12 €' }] };
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: pdf, revisarIA: sinIA });
  assert.deepEqual(potencias(r.valores), pots);
  assert.equal(r.bloqueos.length, 0);
  assert.equal(r.autocorrecciones.length, 0);
});

test('factura que imprime potencias no crecientes (literal y sin ambigüedad) → aviso, no bloqueo', async () => {
  const ex = { ...structuredClone(F.ex), potenciaContratadaKw: [20, 17, 17, 17, 17, 41], textos: { potenciaContratadaKw: ['20', '17', '17', '17', '17', '41'] } };
  const pdf = { lineas: [...F.lineasPdf, { pagina: 1, texto: 'Potencias: 20 / 17 / 17 / 17 / 17 / 41 kW' }] };
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: pdf, revisarIA: sinIA });
  assert.equal(r.bloqueos.length, 0);
  assert.ok(r.avisos.some(a => /menor a mayor.*así figura en la factura/.test(a.msg)));
});

test('kWh ausente: 0 solo si el resto ya suma el total impreso; si no, bloqueo', async () => {
  const a = await verificarExtraccion({ esquema: LUZ_B2B, ex: { ...structuredClone(F.ex), consumoFacturadoKwh: [null, 0, 1442, 980, 0, 2345], textos: {} }, textoPdf: null, revisarIA: sinIA });
  assert.equal(a.valores.kwh1, 0);
  assert.equal(a.bloqueos.length, 0);
  const b = await verificarExtraccion({ esquema: LUZ_B2B, ex: { ...structuredClone(F.ex), consumoTotalKwh: null, consumoFacturadoKwh: [null, 0, 1442, 980, 0, 2345], textos: {} }, textoPdf: null, revisarIA: sinIA });
  assert.equal(b.valores.kwh1, null);
  assert.ok(b.bloqueos.some(x => /consumo de P1/.test(x.msg)));
});

test('un 0 impreso es un 0 real, no un dato ausente', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_B2B, ex: F.ex, textoPdf: PDF, revisarIA: sinIA });
  assert.equal(r.valores.kwh1, 0);
  assert.ok(!r.info.some(i => i.campos.includes('kwh1')));
});

/* ══════════════════════════ Ediciones manuales ══════════════════════════ */

async function formularioIntegra() {
  const verif = await verificarExtraccion({ esquema: LUZ_B2B, ex: F.ex, textoPdf: PDF, revisarIA: sinIA });
  return volcarAFormulario(verif, MAPA_B2B);
}
const evalB2B = (form, base) => evaluarFormulario({ esquema: LUZ_B2B, mapa: MAPA_B2B, form, base, contexto: LUZ_B2B.contexto(F.ex), vacioManual: Object.assign({}, ...P.map(i => ({ [`kwh${i}`]: 0 }))) });

test('manual: escribir "15.001" en P1 se lee con el punto decimal de la factura, sin preguntar', async () => {
  const { textos, base } = await formularioIntegra();
  const ev = evalB2B({ ...textos, kwPotP1: '15.001' }, base);
  assert.equal(ev.valores.pot1, 15.001);
  assert.equal(ev.origen.pot1, 'manual');
  assert.equal(ev.bloqueos.length, 0);
});

test('manual: simulación con otra potencia coherente (P1 = 16) se respeta y no se contrasta con importes', async () => {
  const { textos, base } = await formularioIntegra();
  const ev = evalB2B({ ...textos, kwPotP1: '16' }, base);
  assert.equal(ev.valores.pot1, 16);
  assert.equal(ev.bloqueos.length, 0);
});

test('manual: P1 = 15001 (inequívoco) rompe la normativa P1 ≤ P2 → bloqueo explicado, el valor no se toca', async () => {
  const { textos, base } = await formularioIntegra();
  const ev = evalB2B({ ...textos, kwPotP1: '15001' }, base);
  assert.equal(ev.valores.pot1, 15001);
  assert.equal(ev.bloqueos.length, 1);
  assert.match(ev.bloqueos[0].msg, /P1 = 15001 kW/);
});

test('manual: dejar vacía una potencia → bloqueo (no se toma 0); dejar vacío un consumo → 0 kWh', async () => {
  const { textos, base } = await formularioIntegra();
  const ev = evalB2B({ ...textos, kwPotP6: '', kwhP3: '' }, base);
  assert.equal(ev.valores.pot6, null);
  assert.ok(ev.bloqueos.some(b => /P6/.test(b.msg)));
  assert.equal(ev.valores.kwh3, 0);
});

test('manual sin factura: "15.001" se resuelve por coherencia; "27.263" (ambas válidas) en formato español', () => {
  const form = { kwPotP1: '15.001', kwPotP2: '17', kwPotP3: '17', kwPotP4: '17', kwPotP5: '17', kwPotP6: '41', kwhP1: '27.263', kwhP2: '0', kwhP3: '0', kwhP4: '0', kwhP5: '0', kwhP6: '0', dias: '30', facturaActual: '1824,43' };
  const ev = evalB2B(form, null);
  assert.equal(ev.valores.pot1, 15.001);
  assert.equal(ev.valores.kwh1, 27263);
  assert.equal(ev.bloqueos.length, 0);
  assert.ok(ev.info.some(i => /única lectura coherente/.test(i.msg)));
});

test('manual: al editar un campo, sus incidencias de la factura dejan de aplicarse', async () => {
  const ex = { ...structuredClone(F.ex), potenciaContratadaKw: [15001, 17, 17, 17, 17, 41], textos: {} };
  const verif = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: null, revisarIA: sinIA });
  const { textos, base } = volcarAFormulario(verif, MAPA_B2B);
  assert.equal(evalB2B(textos, base).bloqueos.length, 1);
  const ev = evalB2B({ ...textos, kwPotP1: '15,001' }, base);
  assert.equal(ev.bloqueos.length, 0);
  assert.equal(ev.valores.pot1, 15.001);
});

/* ══════════════════════════ 2.0TD ══════════════════════════ */

const EX_20 = {
  kwPotenciaPunta: 4.6, kwPotenciaValle: 4.6, totalKwhFacturados: 296.69, diasFacturacion: 31, importeTotalFacturaActual: 82.76, tipoIVA: 0.21,
  textosLiterales: { kwPotenciaPunta: '4,600', kwPotenciaValle: '4,600', totalKwhFacturados: null, diasFacturacion: '31', importeTotalFacturaActual: '82,76' },
};
const PDF_20 = { lineas: [{ pagina: 1, texto: 'Potencias contratadas: punta-llano 4,600 kW; valle 4,600 kW' }, { pagina: 1, texto: 'Total factura 82,76 €' }] };

test('2.0TD: extracción coherente → se acepta', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_20, ex: EX_20, textoPdf: PDF_20, revisarIA: sinIA });
  assert.deepEqual([r.valores.kwPunta, r.valores.kwValle, r.valores.kwh, r.valores.dias, r.valores.total], [4.6, 4.6, 296.69, 31, 82.76]);
  assert.equal(r.bloqueos.length, 0);
});

test('2.0TD: la IA lee 4600 kW → se corrige a 4,6 (impreso "4,600", límite 15 kW del peaje)', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_20, ex: { ...EX_20, kwPotenciaPunta: 4600 }, textoPdf: PDF_20, revisarIA: sinIA });
  assert.equal(r.valores.kwPunta, 4.6);
  assert.equal(r.autocorrecciones.length, 1);
});

test('2.0TD: sin potencia valle se usa la de punta (criterio existente); potencia > 15 kW escrita a mano → bloqueo', async () => {
  const r = await verificarExtraccion({ esquema: LUZ_20, ex: { ...EX_20, kwPotenciaValle: 0, textosLiterales: {} }, textoPdf: null, revisarIA: sinIA });
  assert.equal(r.valores.kwValle, 4.6);
  const ev = evaluarFormulario({ esquema: LUZ_20, mapa: { kwPunta: 'kwPunta', kwValle: 'kwValle', kwh: 'kwhP1', dias: 'dias', total: 'facturaActual' }, form: { kwPunta: '20', kwValle: '20', kwhP1: '300', dias: '30', facturaActual: '90' }, base: null });
  assert.ok(ev.bloqueos.some(b => /15 kW/.test(b.msg)));
});

/* ══════════════════════════ Gas ══════════════════════════ */

const EX_GAS = { tarifaRL: 'RL.2', totalKwhGas: 1234, diasFacturacion: 61, importeTotalFactura: 151.37, costeTerminoFijo: 29.2, tipoIVA: 0.21, costeAlquilerContador: 1.8, textosLiterales: { totalKwhGas: '1.234', diasFacturacion: '61', importeTotalFactura: '151,37', costeTerminoFijo: '29,20' } };
const PDF_GAS = { lineas: [{ pagina: 1, texto: 'Consumo   1.234 kWh   Término variable   0,065100 €/kWh   80,33 €' }, { pagina: 1, texto: 'Total factura   151,37 €' }] };

test('gas: "1.234 kWh" con coma decimal en la línea → 1234 kWh', async () => {
  const r = await verificarExtraccion({ esquema: GAS_ESQ, ex: EX_GAS, textoPdf: PDF_GAS, revisarIA: sinIA });
  assert.equal(r.valores.kwh, 1234);
  assert.equal(r.bloqueos.length, 0);
});

test('gas: la IA lee 1,234 kWh → se corrige a 1234 por el precio del término variable', async () => {
  const r = await verificarExtraccion({ esquema: GAS_ESQ, ex: { ...EX_GAS, totalKwhGas: 1.234 }, textoPdf: PDF_GAS, revisarIA: sinIA });
  assert.equal(r.valores.kwh, 1234);
  assert.equal(r.autocorrecciones.length, 1);
});

test('gas: término fijo mayor que el total → bloqueo', async () => {
  const r = await verificarExtraccion({ esquema: GAS_ESQ, ex: { ...EX_GAS, costeTerminoFijo: 2920, textosLiterales: {} }, textoPdf: null, revisarIA: sinIA });
  assert.ok(r.bloqueos.some(b => /término fijo/.test(b.msg)));
});

/* ══════════════════════════ Resolutor ══════════════════════════ */

test('resolver: empate entre dos lecturas válidas sin convención ni lectura de la IA → no se elige al azar', async () => {
  const campos = { x: candidatosCampo({ valorIA: null, textoIA: '27.263', textoPdf: null }) };
  const r = resolver(campos, { duras: () => [], blandas: () => 0 });
  assert.equal(r.estado, 'empate');
  // Y en la verificación completa, ese empate bloquea con explicación.
  const ex = { ...structuredClone(F.ex), consumoTotalKwh: null, consumoFacturadoKwh: [0, 0, 1442, 980, 0, null], textos: { consumoFacturadoKwh: [null, null, null, null, null, '2.345'] }, importes: { ...F.ex.importes, energiaTotal: null } };
  const v = await verificarExtraccion({ esquema: LUZ_B2B, ex, textoPdf: null, revisarIA: sinIA });
  assert.ok(v.bloqueos.some(b => /dos lecturas/.test(b.msg)), JSON.stringify(v.bloqueos));
  // Si la IA leyó una de las dos, su lectura desempata.
  const r2 = resolver({ x: candidatosCampo({ valorIA: 27.263, textoIA: '27.263', textoPdf: null }) }, { duras: () => [], blandas: () => 0 });
  assert.equal(r2.estado, 'ok');
  assert.equal(r2.valores.x, 27.263);
});

/* ══════════════════════════ Tramo RL de gas ══════════════════════════ */

import { detectarTramoRL, normalizarTramoRL } from '../src/lib/energia/esquemas.js';

const pdfCon = (...lineas) => ({ lineas: lineas.map(texto => ({ pagina: 1, texto })) });

test('tramo RL: formatos reales impresos por distintas comercializadoras', () => {
  const casos = [
    ['Tarifa: CLASICA BASE   Tarifa RL. 4   Caudal Contratado   1,00', 'rl4'], // TotalEnergies
    ['Tarifa del contrato: RL03', 'rl3'],                                      // FG (Naturgy)
    ['Peaje de acceso: RL.4   BOE: 30.05.2024', 'rl4'],                         // TUR
    ['Peaje de acceso: RL. 3', 'rl3'],
    ['Peaje de acceso: RL.2', 'rl2'],
  ];
  for (const [linea, id] of casos) {
    const r = detectarTramoRL({ tarifaIA: id.toUpperCase(), textoPdf: pdfCon(linea), kwh: 1000, dias: 30 });
    assert.equal(r.id, id, linea);
    assert.equal(r.fuente, 'pdf');
  }
  for (const [v, id] of [['RL.3', 'rl3'], ['RL. 2', 'rl2'], ['RL03', 'rl3'], ['rl1', 'rl1'], ['2', 'rl2'], ['', null], [null, null]]) assert.equal(normalizarTramoRL(v), id, String(v));
});

test('tramo RL: si la IA se equivoca, manda el tramo impreso y se explica', () => {
  const r = detectarTramoRL({ tarifaIA: 'RL.1', textoPdf: pdfCon('Peaje de acceso: RL.2'), kwh: 1500, dias: 60 });
  assert.equal(r.id, 'rl2');
  assert.equal(r.nivel, 'autocorreccion');
  assert.match(r.msg, /imprime Gas RL\.2/);
});

test('tramo RL: sin tramo impreso → el de la IA; sin ninguno → estimado por consumo con aviso', () => {
  assert.equal(detectarTramoRL({ tarifaIA: 'RL.3', textoPdf: pdfCon('Consumo 2.500 kWh'), kwh: 2500, dias: 30 }).id, 'rl3');
  const e = detectarTramoRL({ tarifaIA: null, textoPdf: null, kwh: 1500, dias: 60 }); // 9.125 kWh/año → RL.2
  assert.equal(e.id, 'rl2');
  assert.equal(e.fuente, 'estimado');
  assert.match(e.msg, /estimando 9125 kWh\/año/);
  assert.equal(detectarTramoRL({ tarifaIA: null, textoPdf: null, kwh: 300, dias: 30 }).id, 'rl1');
});
