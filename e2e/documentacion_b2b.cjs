// Recorrido completo de Documentación B2B (5 escenarios de §8.2) contra Supabase de PRUEBAS.
//   1) node e2e/documentacion_b2b_datos.mjs <ref> preparar
//   2) vite apuntando a pruebas en el puerto indicado
//   3) node e2e/documentacion_b2b.cjs <puerto> <carpeta_salida>
// /api/gemini se simula: devuelve datos ficticios según la marca escrita en cada documento.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [puerto = '5190', salida = 'e2e_salida'] = process.argv.slice(2);
const URL_APP = `http://localhost:${puerto}`;
const CLAVE = 'prueba1234';
fs.mkdirSync(salida, { recursive: true });

const resultados = [];
let actual = '';
const ok = (c, msg) => {
  if (!c) throw new Error(`[${actual}] ${msg}`);
  console.log(`  ok  ${msg}`);
};

const hojaOpen = JSON.parse(fs.readFileSync('tests/fixtures/tarifa_ia_open30.json', 'utf8'));
hojaOpen.valida_desde = '2026-11-01';
hojaOpen.valida_hasta = '2026-12-31';
hojaOpen.valores['potenciaTerminos.0.anyo'] = 22.5;

function respuestaIA(prompt, dataB64) {
  const marca = dataB64 ? Buffer.from(dataB64, 'base64').toString('latin1') : '';
  if (prompt.includes('hoja de tarifas')) return hojaOpen;
  if (prompt.includes('tarjeta de identificación fiscal')) {
    return { cif: null, razon_social: 'FICTICIA', domicilio: { via: 'CALLE FISCAL', numero: '7', cp: '34001', localidad: 'PALENCIA', provincia: 'PALENCIA' } };
  }
  if (prompt.includes('DNI o NIE')) return { nombre: 'Persona Ficticia', dni: '00000000T' };
  const cups = /FACTURA (\S+)/.exec(marca)?.[1];
  const kw = { 'ES0021000000000902XX0F': 20, 'ES0022000000000903XX1P': 44, 'ES0021000000000904XX0F': 63, 'ES0021000000000905XX0F': 120 }[cups] || 20;
  return {
    cups, cif: null,
    domicilio_titular: { via: 'CALLE TITULAR', numero: '1', cp: '34001', localidad: 'PALENCIA', provincia: 'PALENCIA' },
    suministro: { via: `AVENIDA ${String(cups).slice(-8, -4)}`, numero: '25', cp: '34004', localidad: 'PALENCIA', provincia: 'PALENCIA' },
    potencias: { p1: kw, p2: kw, p3: kw, p4: kw, p5: kw, p6: kw },
    tension: null,
  };
}

async function textoPdf(ruta) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(ruta)), verbosity: 0 }).promise;
  let t = '';
  for (let i = 1; i <= d.numPages; i++) t += `${(await (await d.getPage(i)).getTextContent()).items.map((x) => x.str).join(' ')}\n`;
  return { texto: t, paginas: d.numPages };
}

async function sesion(navegador, usuario) {
  const ctx = await navegador.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('  [pageerror]', e.message));
  await p.addInitScript(() => {
    // Chromium sin ventana no tiene visor de PDF: el iframe no llega a cargar y print() no se
    // puede observar. Se comprueba que Imprimir crea el marco con un PDF real.
    window.__pdfs = {};
    const crear = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => { const u = crear(blob); if (blob?.type === 'application/pdf') window.__pdfs[u] = blob.size; return u; };
  });
  await p.route('**/api/gemini', async (r) => {
    const b = r.request().postDataJSON();
    await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ response: JSON.stringify(respuestaIA(b.text, b.file?.data)) }) });
  });
  await p.goto(URL_APP, { timeout: 150000, waitUntil: 'domcontentloaded' });
  await p.waitForSelector('input', { timeout: 150000 });
  const ins = await p.locator('input').all();
  await ins[0].fill(usuario);
  await ins[1].fill(CLAVE);
  await ins[1].press('Enter');
  await p.waitForSelector('nav, aside', { timeout: 30000 });
  await p.waitForTimeout(1500);
  return { ctx, p };
}

async function abrirSeccion(p) {
  await p.getByRole('button', { name: 'Documentación B2B', exact: true }).first().click();
  await p.waitForSelector('[data-testid="abrir-generar"]', { timeout: 20000 });
}

async function escribirCups(p, cups) {
  await p.click('[data-testid="abrir-generar"]');
  for (let i = 1; i < cups.length; i++) await p.click('[data-testid="anadir-cups"]');
  const campos = p.locator('[data-testid="campo-cups"]');
  for (let i = 0; i < cups.length; i++) await campos.nth(i).fill(cups[i]);
  await p.click('[data-testid="cups-continuar"]');
}
async function cerrar(p, conCambios = false) {
  if (conCambios) p.once('dialog', (d) => d.accept());
  await p.click('[data-testid="cerrar-generar"]');
  await p.waitForSelector('[data-testid="generar-modal"]', { state: 'detached' });
  await p.waitForTimeout(800);
}
async function debeRechazar(p, cups, texto, msg) {
  await escribirCups(p, cups);
  await p.waitForSelector('[data-testid="error-generar"]', { timeout: 30000 });
  ok((await p.innerText('[data-testid="error-generar"]')).includes(texto), msg);
  await cerrar(p);
}
async function generar(p, cups) {
  await escribirCups(p, cups);
  await p.waitForSelector('[data-testid="resumen"]', { timeout: 60000 });
  await p.getByRole('button', { name: 'Sí', exact: true }).click();
  await p.waitForSelector('[data-testid="verificar"]');
  const t0 = Date.now();
  await p.click('[data-testid="confirmar-generar"]');
  await p.waitForSelector('[data-testid="resultado"]', { timeout: 90000 });
  console.log(`  generar: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await p.waitForSelector('[data-testid^="campo-"]', { timeout: 60000 });
  await p.waitForTimeout(500);
}
async function editarCampo(p, clave, valor) {
  await p.locator(`[data-testid="campo-${clave}"]`).first().click();
  const ed = p.locator('[data-testid="editor-campo"]');
  await ed.locator('input,select').first().fill(valor);
  await ed.getByRole('button', { name: 'Aplicar' }).click();
}
async function descargar(p, nombre) {
  const [d] = await Promise.all([p.waitForEvent('download'), p.click('[data-testid="descargar"]')]);
  const r = path.join(salida, nombre);
  await d.saveAs(r);
  return r;
}
const entrada = (p, titular) => p.locator(`[data-testid="entrada-historial"][data-titular="${titular}"]`).first();

async function escenario(nombre, fn) {
  actual = nombre;
  console.log(`\n== ${nombre}`);
  try {
    await fn();
    resultados.push({ nombre, ok: true });
  } catch (e) {
    console.log(`  FALLO: ${e.message}`);
    resultados.push({ nombre, ok: false, error: e.message });
  }
}

(async () => {
  const b = await chromium.launch();
  const { p: admin } = await sesion(b, 'e2e_admin');

  await escenario('1. 1 CUPS Open 3.0TD', async () => {
    await abrirSeccion(admin);
    await admin.waitForSelector('[data-testid="tab-global"]');
    await admin.getByText('Todavía no hay documentación generada').waitFor();
    ok(await admin.locator('[data-testid="tab-mias"]').isVisible(), 'pestañas visibles con el historial vacío');
    ok(await admin.locator('[data-testid="selector-modalidad"]').count() === 0 && await admin.locator('[data-testid="fila-contrato"]').count() === 0, 'sin lista de contratos ni selector de modalidad');
    await generar(admin, ['es0021 0000 0000 0901 xx0f']);
    await admin.screenshot({ path: path.join(salida, 'e1_resultado.png'), fullPage: true });
    ok(await admin.locator('[data-testid="aviso-1"]').isVisible(), 'aviso 1');
    ok((await admin.locator('[data-testid="aviso-2"]').innerText()).includes('Modalidad: Plana (por defecto)'), 'aviso 2 con Plana por defecto');
    ok((await admin.locator('[data-testid="aviso-caducada"]').innerText()).includes('válida hasta 28-10-2026'), 'tarifa caducada: aviso, no bloquea');
    ok(await admin.locator('[data-testid="aviso-oferta_numero"]').count() > 0, '⚠ en número de oferta');
    ok(await admin.locator('[data-testid="doc-anexo_puntos"]').count() === 0, 'sin anexo de puntos con 1 CUPS');

    await admin.locator('[data-testid="campo-s0.sum_numero"]').click();
    await admin.locator('[data-testid="editor-campo"] input').fill('X'.repeat(200));
    await admin.getByRole('button', { name: 'Aplicar' }).click();
    await admin.waitForSelector('[data-testid="editor-error"]');
    ok((await admin.innerText('[data-testid="editor-error"]')).includes('no cabe'), 'texto que no cabe: error junto al campo');
    await admin.locator('[data-testid="editor-campo"] button[aria-label="Cancelar"]').click();

    await editarCampo(admin, 'fiscal_numero', '99');
    await admin.waitForTimeout(800);
    await admin.click('[data-testid="doc-anexo_precios"]');
    await admin.waitForTimeout(800);
    ok((await admin.locator('[data-testid="aviso-validez_desde"]').count()) > 0, '⚠ en validez del anexo');
    await admin.selectOption('[data-testid="selector-modalidad-anexo"]', 'laboral');
    await admin.waitForTimeout(800);
    ok((await admin.locator('[data-testid="aviso-2"]').innerText()).includes('Modalidad: Laboral'), 'modalidad cambiada');
    await admin.click('[data-testid="guardar-cambios"]');
    await admin.waitForSelector('[data-testid="pantalla-carga"]', { state: 'detached', timeout: 30000 });
    await admin.waitForTimeout(1500);
    ok((await entrada(admin, 'E2E UNO, S.L.').innerText()).includes('v2'), 'guardado como v2');

    const a = await descargar(admin, 'e1_anexo.pdf');
    const { texto, paginas } = await textoPdf(a);
    ok(paginas === 3, 'anexo de 3 páginas');
    ok(texto.includes('Descuento Indefinido: 25 %'), 'anexo con Laboral 25 %');
    ok(texto.includes('19-10-2026') && texto.includes('28-10-2026'), 'anexo imprime la validez real');
    ok(!/BORRADOR|SIN VALIDEZ/.test(texto), 'sin marca de agua');
    await admin.click('[data-testid="imprimir"]');
    await admin.waitForTimeout(1200);
    await admin.click('[data-testid="doc-contrato"]');
    await admin.waitForTimeout(800);
    const c = await textoPdf(await descargar(admin, 'e1_contrato.pdf'));
    ok(c.paginas === 7, 'contrato de 7 páginas');
    ok(c.texto.includes('BZZ - I-DE REDES'), 'distribuidora de Endesa');
    await admin.click('[data-testid="imprimir"]');
    await admin.waitForTimeout(1200);
    const marcos = await admin.evaluate(() => [...document.querySelectorAll('iframe[src^="blob:"]')].map((f) => window.__pdfs[f.src]));
    ok(marcos.length >= 2 && marcos.every((n) => n > 1000), 'Imprimir abre el PDF de los 2 documentos');
    await cerrar(admin);
  });

  await escenario('2. 3 CUPS mismo CIF', async () => {
    await debeRechazar(admin, ['ES0021000000000902XX0F', 'ES0021000000000907XX0F'], 'mismo CIF', 'mezclar CIF bloqueado');
    await generar(admin, ['ES0021000000000902XX0F', 'ES0022000000000903XX1P', 'ES0021000000000904XX0F']);
    for (const t of ['contrato', 'anexo_precios', 'anexo_puntos']) ok(await admin.locator(`[data-testid="doc-${t}"]`).count() === 1, `botón ${t}`);
    const c = await textoPdf(await descargar(admin, 'e2_contrato.pdf'));
    ok(!c.texto.includes('ES002') && !c.texto.includes('BZZ'), 'B y C vacíos en el contrato');
    await admin.click('[data-testid="doc-anexo_precios"]');
    await admin.waitForTimeout(800);
    const a = await textoPdf(await descargar(admin, 'e2_anexo.pdf'));
    ok(['0902', '0903', '0904'].every((n) => a.texto.includes(`00000000${n.slice(1)}`) || a.texto.includes(n)), '3 recuadros, uno por CUPS');
    ok(a.texto.includes('0,251588') && a.texto.includes('0,251088'), 'precio por tramo de cada suministro');
    await admin.click('[data-testid="doc-anexo_puntos"]');
    await admin.waitForTimeout(800);
    const ps = await textoPdf(await descargar(admin, 'e2_puntos.pdf'));
    ok(ps.texto.includes('NZZ - UNION FENOSA') && ps.texto.includes('BZZ - I-DE'), 'anexo de puntos con cada distribuidora');
    await admin.screenshot({ path: path.join(salida, 'e2_puntos.png'), fullPage: true });
    await cerrar(admin);
  });

  await escenario('3. CUPS ya documentado, borrar y regenerar', async () => {
    await admin.reload();
    await admin.waitForTimeout(1500);
    await abrirSeccion(admin);
    await debeRechazar(admin, ['ES0021000000000901XX0F'], 'Ya tiene documentación', 'CUPS documentado bloqueado');
    await debeRechazar(admin, ['ES0021000000000906XX0F'], 'TEMPO 2.0TD', 'TEMPO: indica el producto y no continúa');
    await debeRechazar(admin, ['ES0021000000000999XX0F'], 'No existe en Alta B2B', 'CUPS inexistente: no continúa');
    await admin.click('[data-testid="abrir-generar"]');
    await admin.click('[data-testid="anadir-cups"]');
    await admin.click('[data-testid="anadir-cups"]');
    ok(await admin.locator('[data-testid="anadir-cups"]').count() === 0, 'máximo 3 CUPS');
    await cerrar(admin);
    await admin.fill('[data-testid="historial-buscar"]', 'E2E UNO');
    await admin.waitForTimeout(1200);
    const e = entrada(admin, 'E2E UNO, S.L.');
    await e.locator('[data-testid="entrada-editar"]').click();
    await admin.waitForSelector('[data-testid="edicion-modal"] [data-testid="pagina-pdf"]', { timeout: 20000 });
    await admin.waitForTimeout(1200);
    await editarCampo(admin, 'fiscal_numero', '100');
    await admin.waitForTimeout(800);
    let mensaje = '';
    admin.once('dialog', async (d) => { mensaje = d.message(); await d.dismiss(); });
    await admin.click('[data-testid="cerrar-edicion"]');
    await admin.waitForTimeout(400);
    ok(mensaje === 'Tienes cambios sin guardar. ¿Salir sin guardar?', 'aviso al cerrar con cambios');
    ok(await admin.locator('[data-testid="edicion-modal"]').isVisible(), 'la ventana sigue abierta');
    admin.once('dialog', (d) => d.accept());
    await admin.click('[data-testid="cerrar-edicion"]');
    await e.locator('[data-testid="entrada-borrar"]').click();
    await admin.locator('button.bg-red-600').click();
    await admin.waitForSelector('[data-testid="entrada-historial"][data-titular="E2E UNO, S.L."][data-estado="borrada"]', { timeout: 15000 });
    ok(true, 'entrada borrada');
    ok((await e.locator('p').first().evaluate((n) => getComputedStyle(n).textDecorationLine)).includes('line-through'), 'tachada');
    ok((await e.locator('[data-testid="borrado-por"]').innerText()).includes('Borrado por: E2E Admin'), 'muestra Borrado por');
    await generar(admin, ['ES0021000000000901XX0F']);
    ok(await admin.locator('[data-testid="aviso-1"]').isVisible(), 'regenerar permitido');
    await cerrar(admin);
    await admin.fill('[data-testid="historial-buscar"]', '');
    await escribirCups(admin, ['ES0021000000000905XX0F']);
    await admin.waitForSelector('[data-testid="resumen"]', { timeout: 60000 });
    ok((await admin.innerText('[data-testid="resumen"]')).includes('B90000006'), 'resumen con empresa, NIF y CUPS');
    await admin.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await admin.waitForSelector('[data-testid="generar-modal"]', { state: 'detached' });
  });

  await escenario('4. Permisos', async () => {
    const { ctx: c1, p: sin } = await sesion(b, 'e2e_sin');
    ok(await sin.getByRole('button', { name: 'Documentación B2B', exact: true }).count() === 0, 'comercial sin acceso no ve el menú');
    await c1.close();

    const { ctx: c2, p: com } = await sesion(b, 'e2e_com');
    await com.route('**/rest/v1/configuracion*', async (r) => {
      const res = await r.fetch();
      const j = await res.json();
      const u = j.find?.((x) => x.clave === 'user_permissions');
      if (u) u.valor = { ...u.valor, e2e_com: { documentacion_b2b: true } };
      await r.fulfill({ response: res, json: j });
    });
    await com.reload();
    await com.waitForTimeout(2000);
    await abrirSeccion(com);
    await com.waitForSelector('[data-testid="historial"]');
    ok(await com.locator('[data-testid="tab-global"]').count() === 0, 'comercial no ve la pestaña global');
    await generar(com, ['ES0021000000000907XX0F']);
    await cerrar(com);
    await com.fill('[data-testid="historial-buscar"]', '');
    await com.waitForTimeout(1500);
    ok(await com.locator('[data-testid="entrada-historial"]').count() === 1, 'solo ve lo suyo');
    ok(await entrada(com, 'E2E COM, S.L.').locator('[data-testid="entrada-compartir"]').count() === 0, 'comercial no comparte');

    // El arranque renueva el token sin pedir nada
    const expiraAntes = await com.evaluate(() => JSON.parse(localStorage.getItem('crm_avedie_docb2b_token')).expira_at);
    await com.reload();
    await com.waitForTimeout(2000);
    const expiraDespues = await com.evaluate(() => JSON.parse(localStorage.getItem('crm_avedie_docb2b_token')).expira_at);
    ok(new Date(expiraDespues) > new Date(expiraAntes), 'el arranque renueva la sesión de la sección');

    // Sesión ya abierta sin token: la sección funciona sin contraseña y sin volver a entrar
    await com.evaluate(() => localStorage.removeItem('crm_avedie_docb2b_token'));
    await com.reload();
    await com.waitForTimeout(2000);
    await abrirSeccion(com);
    await com.waitForSelector('[data-testid="entrada-historial"]', { timeout: 15000 });
    ok(await com.locator('input[type=password]').count() === 0, 'sesión vieja: sin contraseña, con historial');

    const { ctx: c3, p: man } = await sesion(b, 'e2e_man');
    await abrirSeccion(man);
    await man.click('[data-testid="tab-global"]');
    await man.fill('[data-testid="historial-buscar"]', 'E2E TRES');
    await man.waitForTimeout(1500);
    await entrada(man, 'E2E TRES, S.L.').locator('[data-testid="entrada-compartir"]').click();
    await man.locator('[data-testid="compartir-modal"] input[value="e2e_com"]').check();
    await man.click('[data-testid="compartir-guardar"]');
    await man.waitForTimeout(1200);
    await c3.close();

    await com.reload();
    await com.waitForTimeout(2000);
    await abrirSeccion(com);
    await com.waitForTimeout(1500);
    const e = entrada(com, 'E2E TRES, S.L.');
    ok((await e.innerText()).includes('Generado por: E2E Admin'), 'compartido aparece con Generado por');
    ok(await e.locator('[data-testid="entrada-editar"]').count() === 0, 'destinatario no edita');
    ok(await e.locator('[data-testid="entrada-borrar"]').count() === 0, 'destinatario no borra');
    await e.locator('[data-testid="entrada-desplegar"]').click();
    const [d] = await Promise.all([com.waitForEvent('download'), com.click('[data-testid="bajar-contrato"]')]);
    await d.saveAs(path.join(salida, 'e4_compartido.pdf'));
    ok(fs.statSync(path.join(salida, 'e4_compartido.pdf')).size > 1000, 'destinatario descarga');

    await com.getByRole('button', { name: 'Consulta de Tarifas', exact: true }).first().click();
    await com.waitForTimeout(800);
    await com.getByRole('button', { name: /Luz B2B/ }).click();
    await com.waitForTimeout(500);
    ok(await com.getByText('Actualizar tarifa').count() === 0, 'comercial no ve Actualizar tarifa');
    await c2.close();
  });

  await escenario('5. Actualizar tarifa', async () => {
    await admin.getByRole('button', { name: 'Consulta de Tarifas', exact: true }).first().click();
    await admin.waitForTimeout(800);
    await admin.getByRole('button', { name: /Luz B2B/ }).click();
    await admin.waitForTimeout(500);
    await admin.getByRole('button', { name: /Open 3\.0TD/ }).first().click();
    await admin.waitForTimeout(500);
    await admin.click('[data-testid="actualizar-open30"]');
    await admin.waitForSelector('[data-testid="actualizar-tarifa"]');
    await admin.setInputFiles('[data-testid="tarifa-pdf"]', '_recursos_documentacion_b2b/tarifas_referencia/20261028_3.0TD_OPEN_18_V1.pdf');
    await admin.waitForSelector('[data-testid="tarifa-cambio"]', { timeout: 30000 });
    await admin.screenshot({ path: path.join(salida, 'e5_cambios.png') });
    const cambio = admin.locator('[data-testid="tarifa-cambio"]').first();
    ok(await cambio.locator('s').count() === 1, 'valor anterior tachado');
    ok((await cambio.innerText()).includes('22.5'), 'valor nuevo con flecha');
    await admin.getByRole('button', { name: 'Guardar', exact: true }).click();
    await admin.waitForSelector('[data-testid="actualizar-tarifa"]', { state: 'detached', timeout: 30000 });

    await abrirSeccion(admin);
    await generar(admin, ['ES0021000000000905XX0F']);
    ok(await admin.locator('[data-testid="aviso-s0.tension"]').count() > 0, '6.1TD sin tensión: ⚠ normal');
    ok(await admin.locator('[data-testid="descargar"]').isDisabled(), '6.1TD sin tensión: rojo y sin descarga');
    await editarCampo(admin, 's0.tension', '20 kV');
    await admin.waitForTimeout(800);
    ok(!(await admin.locator('[data-testid="descargar"]').isDisabled()), 'tensión completada: se descarga');
    const c61 = await textoPdf(await descargar(admin, 'e5_contrato61.pdf'));
    ok(c61.texto.includes('TEMPO OPEN 6.1TD') && c61.texto.includes('> 15kW (6.1TD)'), 'textos propios de 6.1TD');
    ok(c61.texto.includes('20 kV') && !c61.texto.includes('3X400/230'), 'tensión de 6.1TD, sin 3X400/230');
    await cerrar(admin, true);

    await admin.fill('[data-testid="historial-buscar"]', 'E2E COM');
    await admin.waitForTimeout(1200);
    await admin.click('[data-testid="tab-global"]');
    await admin.waitForTimeout(1200);
    await entrada(admin, 'E2E COM, S.L.').locator('[data-testid="entrada-borrar"]').click();
    await admin.locator('button.bg-red-600').click();
    await admin.waitForTimeout(1500);
    await generar(admin, ['ES0021000000000907XX0F']);
    await admin.click('[data-testid="doc-anexo_precios"]');
    await admin.waitForTimeout(800);
    const a = await textoPdf(await descargar(admin, 'e5_anexo.pdf'));
    ok(a.texto.includes('PRECIO POTENCIA P1: 22,5 Eur/kW'), 'el generador usa los precios nuevos');
    ok(a.texto.includes('01-11-2026') && a.texto.includes('31-12-2026'), 'validez de la nueva versión');
    ok(await admin.locator('[data-testid="aviso-caducada"]').count() === 0, 'tarifa vigente: sin aviso de caducidad');
    await cerrar(admin);
  });

  await escenario('6. Fotos y escaneados grandes', async () => {
    const r = await admin.evaluate(async () => {
      const { reducirDocumento, MAX_BYTES_IA } = await import('/src/lib/documentacionB2B/reducirDocumento.js');
      const c = document.createElement('canvas');
      c.width = 3000; c.height = 3000;
      const x = c.getContext('2d');
      const d = x.createImageData(3000, 3000);
      for (let i = 0; i < d.data.length; i += 65536) crypto.getRandomValues(d.data.subarray(i, Math.min(i + 65536, d.data.length)));
      for (let i = 3; i < d.data.length; i += 4) d.data[i] = 255;
      x.putImageData(d, 0, 0);
      const png = await new Promise((res) => c.toBlob(res, 'image/png'));
      const foto = new File([png], 'foto.png', { type: 'image/png' });
      const f = await reducirDocumento(foto);
      return { max: MAX_BYTES_IA, foto: [foto.size, f?.size, f?.type] };
    });
    console.log('  ', JSON.stringify(r));
    ok(r.foto[0] > r.max && r.foto[1] <= r.max && r.foto[2] === 'image/jpeg', 'foto grande reducida a lo que admite la IA');
    const hoja = path.join(salida, 'e6_escaneado.pdf');
    fs.writeFileSync(hoja, Buffer.concat([fs.readFileSync('_recursos_documentacion_b2b/tarifas_referencia/20261028_3.0TD_OPEN_18_V1.pdf'), Buffer.alloc(3200000, 32)]));
    const e = await admin.evaluate(async (b64) => {
      const { reducirDocumento } = await import('/src/lib/documentacionB2B/reducirDocumento.js');
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const f = await reducirDocumento(new File([bytes], 'esc.pdf', { type: 'application/pdf' }));
      return [bytes.length, f?.size, f?.type];
    }, fs.readFileSync(hoja).toString('base64'));
    console.log('  ', JSON.stringify(e));
    ok(e[0] > 3100000 && e[1] <= 3100000 && e[2] === 'image/jpeg', 'PDF grande convertido a imagen');
  });

  await b.close();
  console.log('\n===== RESUMEN');
  resultados.forEach((r) => console.log(`${r.ok ? 'OK   ' : 'FALLO'} ${r.nombre}${r.error ? ` — ${r.error}` : ''}`));
  process.exit(resultados.every((r) => r.ok) ? 0 : 1);
})();
