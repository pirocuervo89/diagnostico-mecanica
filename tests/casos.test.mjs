import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';

import { filtrarProductosRecomendados } from '../ia_reasoning.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4123;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
const FORUM_TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'dym-forum-test-'));
const FORUM_DB = path.join(FORUM_TEST_DIR, 'forum.sqlite');
const FORUM_UPLOADS = path.join(FORUM_TEST_DIR, 'uploads');

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return true;
    } catch (e) { /* aún arrancando */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor no arrancó a tiempo');
}

async function getJSON(url) {
  const r = await fetch(`${BASE}${url}`);
  return { status: r.status, body: await r.json().catch(() => null) };
}

async function postJSON(url, body) {
  const r = await fetch(`${BASE}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: r.status, body: await r.json().catch(() => null) };
}


function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function forumRequest(url, { method = 'GET', body, cookie = '' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
    cookie: cookieFrom(response),
    headers: response.headers
  };
}

before(async () => {
  // GEMINI_API_KEY vacía => se prueba el motor experto local, sin gastar cuota de IA.
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    // Ninguna clave de IA: las pruebas no deben leer el .env real ni gastar
    // cuota de un proveedor externo. dotenv no sobrescribe lo ya definido, así
    // que estos valores vacíos aíslan la suite.
    env: {
      ...process.env, PORT: String(PORT), HOST: '127.0.0.1',
      AI_PROVIDER: '', AI_API_KEY: '', AI_BASE_URL: '', AI_MODEL: '',
      GROQ_API_KEY: '', OPENROUTER_API_KEY: '', MISTRAL_API_KEY: '',
      CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      FORUM_DB_PATH: FORUM_DB, FORUM_UPLOAD_DIR: FORUM_UPLOADS
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

after(() => {
  if (server) server.kill('SIGTERM');
  setTimeout(() => {
    try { rmSync(FORUM_TEST_DIR, { recursive: true, force: true }); } catch { /* archivos aún abiertos */ }
  }, 300);
});

// ---------------------------------------------------------------
// Servidor, rutas y datos JSON
// ---------------------------------------------------------------
test('health responde correctamente', async () => {
  const { status, body } = await getJSON('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('stats carga los datos JSON', async () => {
  const { status, body } = await getJSON('/api/stats');
  assert.equal(status, 200);
  assert.ok(body.dtc > 9000, 'debe haber más de 9000 DTC');
  assert.equal(body.symptoms, 454);
  assert.ok(body.products >= 200);
  assert.equal(body.vehicles, 15);
  assert.equal(body.tuning, 6);
  assert.equal(body.library, 15);
  assert.ok(Array.isArray(body.systems) && body.systems.length > 0, 'debe incluir sistemas reales');
  assert.equal(body.severity.Alta + body.severity.Media + body.severity.Baja, body.dtc);
  assert.ok(Array.isArray(body.productCategories) && body.productCategories.length > 0);
});

test('compra: fichas con recomendación y puntos documentados', async () => {
  const { status, body } = await getJSON('/api/buying');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body.items));
  assert.ok(body.items.length >= 15);
  assert.ok(body.items.every(item => item.recommendation?.label));
  assert.ok(body.items.every(item => Array.isArray(item.knownIssues)));
  assert.match(body.notice, /No es un porcentaje de averías/i);
});

test('scanner de vehículo: extrae y relaciona una ficha de texto', async () => {
  const { status, body } = await postJSON('/api/vehicle/scan', {
    text: 'Marca: Volkswagen\nModelo: Golf\nAño: 2018\nMotorización: 2.0 TDI 150 CV\nCilindrada: 1968 cc\nVIN: WVWZZZAUZJW123456'
  });
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.extracted.brand.value, 'Volkswagen');
  assert.equal(body.extracted.model.value, 'Golf');
  assert.equal(body.extracted.year.value, 2018);
  assert.equal(body.extracted.vin.value, 'WVWZZZAUZJW123456');
  assert.equal(body.linkedVehicleId, 'vw-golf-vii-20-tdi-150');
  assert.equal(body.meta.storage, 'sin_almacenamiento');

  const golf4 = await postJSON('/api/vehicle/scan', {
    text: 'Marca: Volkswagen\nModelo: Golf IV\nAño: 2002\nMotorización: 1.9 TDI 110 CV\nCilindrada: 1896 cc'
  });
  assert.equal(golf4.body.linkedVehicleId, 'vw-golf-iv-19-tdi-110');

  const peugeot = await postJSON('/api/vehicle/scan', {
    text: 'Marca: Peugeot\nModelo: 205 GTI\nAño: 1990\nMotorización: 1.9 GTI 130 CV\nCilindrada: 1905 cc'
  });
  assert.equal(peugeot.body.linkedVehicleId, 'peugeot-205-19-gti');
});

test('scanner de vehículo: rechaza formatos no admitidos', async () => {
  const { status, body } = await postJSON('/api/vehicle/scan', {
    dataBase64: Buffer.from('no es un documento').toString('base64'),
    mimeType: 'text/plain',
    fileName: 'nota.txt'
  });
  assert.ok(status === 400 || status === 422);
  assert.ok(body.error);
});

test('componentes del vehículo: catálogo genérico con hotspots válidos', async () => {
  const { status, body } = await getJSON('/api/components');
  assert.equal(status, 200);
  assert.ok(Array.isArray(body));
  assert.ok(body.length >= 12);
  const ids = body.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'los identificadores deben ser únicos');
  for (const component of body) {
    assert.ok(component.name && component.system && component.function);
    assert.ok(Array.isArray(component.symptoms) && component.symptoms.length > 0);
    assert.ok(Array.isArray(component.checks) && component.checks.length > 0);
    assert.ok(component.hotspot.x >= 0 && component.hotspot.x <= 100);
    assert.ok(component.hotspot.y >= 0 && component.hotspot.y <= 100);
  }
});

test('buscador universal: DTC exacto, síntoma y tutorial', async () => {
  const dtc = await getJSON('/api/search?q=P0299&limit=3');
  assert.equal(dtc.status, 200);
  assert.equal(dtc.body.groups.dtc[0].id, 'P0299');
  assert.ok(dtc.body.groups.tutorials.length > 0);
  assert.ok(dtc.body.total >= 2);

  const symptom = await getJSON('/api/search?q=tirones&limit=3');
  assert.equal(symptom.status, 200);
  assert.ok(symptom.body.groups.symptoms.some(s => s.id === 'tirones'));

  const component = await getJSON('/api/search?q=turbo&limit=3');
  assert.equal(component.status, 200);
  assert.ok(component.body.groups.components.some(c => c.id === 'turbo'));

  const empty = await getJSON('/api/search?q=');
  assert.equal(empty.status, 200);
  assert.equal(empty.body.total, 0);
});

test('contacto valida los datos sin guardar mensajes inválidos', async () => {
  const vacio = await postJSON('/api/contact', { name: '', email: '', message: '' });
  assert.equal(vacio.status, 400);

  const emailMalo = await postJSON('/api/contact', {
    name: 'Prueba', email: 'no-es-email', message: 'Mensaje de prueba válido.'
  });
  assert.equal(emailMalo.status, 400);

  const corto = await postJSON('/api/contact', {
    name: 'Prueba', email: 'prueba@example.com', message: 'corto'
  });
  assert.equal(corto.status, 400);
});

test('la ruta desconocida devuelve 404 JSON', async () => {
  const { status } = await getJSON('/api/no-existe');
  assert.equal(status, 404);
});

test('producto por id devuelve su ficha y 404 si no existe', async () => {
  const ok = await getJSON('/api/products/maletin-facom-pro');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.id, 'maletin-facom-pro');
  assert.equal(ok.body.linkStatus, 'verified');

  const missing = await getJSON('/api/products/no-existe-xyz');
  assert.equal(missing.status, 404);
});

test('estado de IA no expone la clave y usa el motor local sin configurar', async () => {
  const { status, body } = await getJSON('/api/ai/status');
  assert.equal(status, 200);
  assert.equal(body.configured, false);
  assert.equal(body.fallback, 'expert_rules');
  assert.equal(JSON.stringify(body).includes('GEMINI_API_KEY'), false);
});

// ---------------------------------------------------------------
// Diagnóstico por síntomas
// ---------------------------------------------------------------
test('listado de síntomas con icono, nombre y categoría', async () => {
  const { status, body } = await getJSON('/api/symptoms');
  assert.equal(status, 200);
  assert.equal(body.length, 454);
  assert.ok(body.every(s => s.id && s.name && s.icon && s.categoryId && s.category));
  assert.equal(new Set(body.map(s => s.id)).size, body.length, 'no debe haber IDs duplicados');
  assert.equal(new Set(body.map(s => s.name.toLowerCase())).size, body.length, 'no debe haber nombres duplicados');
});

test('250 síntomas nuevos con ficha técnica completa y trazabilidad genérica', async () => {
  const { status, body } = await getJSON('/api/symptoms');
  assert.equal(status, 200);
  const curated = body.filter(s => s.curated);
  assert.equal(curated.length, 250);
  assert.ok(curated.every(s => s.area && s.description && s.driveRisk && s.source));
  assert.ok(curated.every(s => s.commonCauses.length >= 2 && s.quickChecks.length >= 2));
  assert.ok(curated.every(s => s.tools.length >= 2 && s.solutions.length >= 1));
  assert.ok(curated.every(s => s.validationStatus === 'revision_generica_pendiente_modelo'));
});

test('categorías de síntomas y filtros de API', async () => {
  const meta = await getJSON('/api/symptoms/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.body.total, 454);
  assert.equal(meta.body.curated, 250);
  assert.equal(meta.body.categories.reduce((n, c) => n + c.count, 0), 454);
  assert.ok(meta.body.categories.every(c => c.id && c.label && c.count >= 0));
  const filtered = await getJSON('/api/symptoms?category=frenos-chasis');
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.length > 0);
  assert.ok(filtered.body.every(s => s.categoryId === 'frenos-chasis'));
  const search = await getJSON('/api/symptoms?q=turbo');
  assert.equal(search.status, 200);
  assert.ok(search.body.length > 0);
});

test('síntoma "tirones" relaciona códigos, causas, comprobaciones y solución', async () => {
  const { status, body } = await getJSON('/api/symptoms/tirones');
  assert.equal(status, 200);
  assert.ok(body.relatedDtc.length > 0, 'debe relacionar códigos DTC');
  assert.ok(body.relatedDtcInfo.length > 0);
  assert.ok(body.causeDetails.length > 0, 'debe indicar causas');
  assert.ok(body.quickChecks.length > 0, 'debe indicar comprobaciones');
  assert.ok(body.categoryId, 'debe indicar categoría');
  assert.ok(Array.isArray(body.relatedComponents));
  assert.ok(Array.isArray(body.tools));
  assert.ok(body.solutions.length > 0, 'debe indicar soluciones');
  assert.ok(body.causeDetails.every(c => c.likelihood), 'las causas distinguen probabilidad');
});

test('síntoma inexistente devuelve 404', async () => {
  const { status } = await getJSON('/api/symptoms/no-existe-xyz');
  assert.equal(status, 404);
});

// ---------------------------------------------------------------
// Códigos DTC: sistema, gravedad y descripción
// ---------------------------------------------------------------
test('DTC P0299 enriquecido con sistema, gravedad, comprobaciones y causas', async () => {
  const { status, body } = await getJSON('/api/dtc/P0299');
  assert.equal(status, 200);
  assert.equal(body.code, 'P0299');
  assert.ok(body.system, 'debe tener sistema');
  assert.ok(body.severity, 'debe tener gravedad');
  assert.ok(body.checks.length > 0);
  assert.ok(body.causes.length > 0);
  assert.equal(body.electronicConfirmed, true);
});

test('DTC genérico se completa con sistema y gravedad derivados', async () => {
  const { status, body } = await getJSON('/api/dtc/P0102');
  assert.equal(status, 200);
  assert.ok(body.system && body.system !== 'undefined');
  assert.ok(['Alta', 'Media', 'Baja'].includes(body.severity));
});

test('búsqueda de DTC insensible a acentos y prioriza por relevancia', async () => {
  const { body } = await getJSON('/api/dtc?q=presion&limit=5');
  assert.ok(body.length > 0);
  assert.equal(body[0].code, 'P0299');
});

test('filtro de DTC por gravedad', async () => {
  const { body } = await getJSON('/api/dtc?severity=Alta&limit=10');
  assert.ok(body.length > 0);
  assert.ok(body.every(d => d.severity === 'Alta'));
});

// ---------------------------------------------------------------
// Catálogo de productos y búsqueda
// ---------------------------------------------------------------
test('búsqueda de productos "freno" devuelve artículos de frenos', async () => {
  const { body } = await getJSON('/api/products?q=freno');
  assert.ok(body.length > 0);
  assert.ok(body.slice(0, 5).some(p => /freno/i.test(p.name)));
});

test('búsqueda de productos "aceite" devuelve aceites/filtros', async () => {
  const { body } = await getJSON('/api/products?q=aceite');
  assert.ok(body.length > 0);
  assert.ok(body.slice(0, 5).some(p => /aceite|filtro/i.test(p.name)));
});

test('búsqueda de productos "bateria" es insensible a acentos', async () => {
  const { body } = await getJSON('/api/products?q=bateria');
  assert.ok(body.length > 0);
});

test('categoría de productos filtra correctamente', async () => {
  const { body } = await getJSON('/api/products?category=Repuestos');
  assert.ok(body.length > 0);
  assert.ok(body.every(p => p.category === 'Repuestos'));
});

// ---------------------------------------------------------------
// Recomendaciones de ia_reasoning (unidad)
// ---------------------------------------------------------------
test('los saludos no recomiendan productos', () => {
  for (const saludo of ['hola', 'buenas tardes', 'hey', 'gracias', 'ok']) {
    assert.equal(filtrarProductosRecomendados(saludo, {}).length, 0, `"${saludo}" no debe recomendar`);
  }
});

test('consulta de frenos recomienda productos de frenos', () => {
  const r = filtrarProductosRecomendados('el pedal de freno esta blando y chirria', {});
  assert.ok(r.length > 0);
  assert.ok(r.some(p => /freno/i.test(`${p.name} ${p.subcategory}`)));
});

test('batería, turbo, aceite y filtros recomiendan productos coherentes', () => {
  const bateria = filtrarProductosRecomendados('la bateria se descarga sola', {});
  assert.ok(bateria.some(p => /bater|alternador|borne|voltimetr/i.test(p.name)));

  const turbo = filtrarProductosRecomendados('turbo con codigo P0299 falta de potencia', {});
  assert.ok(turbo.length > 0);

  const aceite = filtrarProductosRecomendados('necesito aceite de motor 5W-30 y filtro', {});
  const aceites = aceite.filter(p => p.group === 'mantenimiento');
  assert.ok(aceites.length > 0);
  assert.ok(aceites.every(p => /5w-?30/i.test(p.name)));
});

test('sin viscosidad no se recomienda un aceite genérico', () => {
  const r = filtrarProductosRecomendados('necesito cambiar el aceite', {});
  assert.equal(r.filter(p => p.group === 'mantenimiento').length, 0);
});

test('filtros: no confunde aire/combustible con filtros de aceite', () => {
  assert.equal(filtrarProductosRecomendados('filtro de aire', {}).length, 0);
  assert.equal(filtrarProductosRecomendados('filtro de combustible', {}).length, 0);
  const aceite = filtrarProductosRecomendados('filtro de aceite', {});
  assert.ok(aceite.length > 0);
  assert.ok(aceite.every(p => /filtro.*aceite|aceite.*filtro/i.test(p.name)));
});

test('frenos con ruido no recomiendan termómetro y sí útiles de freno', () => {
  const r = filtrarProductosRecomendados('los frenos hacen ruido al frenar', {});
  assert.ok(r.length > 0);
  assert.ok(r.every(p => !/termometro|infrarroj/i.test(p.name)));
  assert.ok(r.some(p => /freno/i.test(p.name)));
});

test('turbo no recomienda limpiador de inyectores ni repuestos sin confirmar', () => {
  const r = filtrarProductosRecomendados('turbo con P0299 y falta de potencia', { dtc: 'P0299' });
  assert.ok(r.length > 0);
  assert.ok(r.every(p => p.group !== 'repuesto'));
  assert.ok(r.every(p => !/limpia inyect|limpiador.*inyect/i.test(p.name)));
});

test('inyección gasolina no recomienda herramientas específicas diésel', () => {
  const r = filtrarProductosRecomendados('tirones e inyectores gasolina', {});
  assert.ok(r.length > 0);
  assert.ok(r.every(p => !/diesel|common rail/i.test(p.name)));
});

test('frenos separa líquido, herramienta y comprobación', () => {
  const r = filtrarProductosRecomendados('pedal blando, liquido de frenos DOT 4', {});
  assert.ok(r.length > 0 && r.length <= 4);
  assert.ok(r.some(p => p.group === 'limpieza_quimico' && /dot 4/i.test(p.name)));
  assert.ok(r.some(p => p.productType === 'diagnostico'));
  assert.ok(r.every(p => p.group !== 'repuesto'));
});

test('catálogo: ids únicos y fotos/enlaces verificados o marcados como pendientes', () => {
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  assert.equal(products.length, new Set(products.map(p => p.id)).size);
  assert.ok(products.filter(p => p.linkStatus === 'verified').length >= 30);
  for (const p of products) {
    assert.ok(['verified', 'missing'].includes(p.imageStatus), `${p.id} imageStatus`);
    assert.ok(['verified', 'missing'].includes(p.linkStatus), `${p.id} linkStatus`);
    if (p.linkStatus === 'verified') {
      assert.match(p.affiliateUrl, /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}$/, `${p.id} url`);
      assert.match(p.image || '', /^\/img\/productos\//, `${p.id} image`);
      assert.ok(existsSync(path.join(ROOT, 'public', p.image)), `${p.id} archivo de imagen`);
    } else {
      assert.equal(p.affiliateUrl, null, `${p.id} no debe tener enlace`);
      assert.equal(p.image, null, `${p.id} no debe tener foto`);
    }
  }
  assert.ok(!products.some(p => /media-amazon|unsplash/.test(String(p.affiliateUrl || ''))));
});

test('recomendaciones solo devuelven productos del catálogo y con estado de enlace', () => {
  const products = JSON.parse(readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  const ids = new Set(products.map(p => p.id));
  for (const q of ['pedal blando DOT 4', 'turbo P0299', 'bateria descargada', 'tirones e inyectores']) {
    const r = filtrarProductosRecomendados(q, {});
    assert.ok(r.length <= 4, q);
    for (const p of r) {
      assert.ok(ids.has(p.id), `${p.id} no está en el catálogo`);
      assert.ok(['verified', 'missing'].includes(p.linkStatus), `${p.id} linkStatus`);
      if (p.linkStatus === 'verified') {
        assert.match(p.affiliateUrl, /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}$/);
        assert.ok(existsSync(path.join(ROOT, 'public', p.image)), `${p.id} imagen`);
      }
    }
  }
});

// ---------------------------------------------------------------
// Chat IA (con motor local, sin cuota)
// ---------------------------------------------------------------
test('chat: saludo responde sin recomendar productos', async () => {
  const { status, body } = await postJSON('/api/chat', { message: 'hola' });
  assert.equal(status, 200);
  assert.ok(body.reply && body.reply.length > 0);
  assert.equal((body.productos_recomendados || []).length, 0);
});

test('chat: fallo de frenos da diagnóstico y productos de freno', async () => {
  const { status, body } = await postJSON('/api/chat', { message: 'el coche frena mal y el pedal esta blando' });
  assert.equal(status, 200);
  assert.ok(/freno/i.test(body.reply));
  assert.ok((body.productos_recomendados || []).length > 0);
});

test('chat: batería que se descarga', async () => {
  const { status, body } = await postJSON('/api/chat', { message: 'la bateria se descarga por la noche' });
  assert.equal(status, 200);
  assert.ok(/bater|alternador|carga/i.test(body.reply));
});

test('chat: turbo con P0299 da diagnóstico técnico', async () => {
  const { status, body } = await postJSON('/api/chat', { message: 'Seat Leon 2.0 TDI pierde potencia y marca P0299' });
  assert.equal(status, 200);
  assert.ok(/P0299|sobrealiment|turbo/i.test(body.reply));
  assert.ok((body.productos_recomendados || []).length > 0);
});

test('chat: identifica la versión por marca, modelo y motor sin id', async () => {
  const { status, body } = await postJSON('/api/chat', {
    message: '¿Qué mantenimiento reviso?',
    context: { brand: 'Volkswagen', model: 'Golf', engine: '2.0 TDI 150 CV' }
  });
  assert.equal(status, 200);
  assert.equal(body.vehicle?.id, 'vw-golf-vii-20-tdi-150');
  assert.match(body.reply, /Volkswagen Golf 2\.0 TDI 150/i);
});

test('chat: mensaje vacío devuelve 400', async () => {
  const { status } = await postJSON('/api/chat', { message: '   ' });
  assert.equal(status, 400);
});

test('chat: mensaje demasiado largo devuelve 413', async () => {
  const { status } = await postJSON('/api/chat', { message: 'a'.repeat(4001) });
  assert.equal(status, 413);
});

// ---------------------------------------------------------------
// Análisis OBD-II del servidor
// ---------------------------------------------------------------
test('obd/analyze rechaza dtcs que no son una lista', async () => {
  const { status } = await postJSON('/api/obd/analyze', { dtcs: 'P0299' });
  assert.equal(status, 400);
});

test('obd/analyze procesa códigos y telemetría', async () => {
  const { status, body } = await postJSON('/api/obd/analyze', {
    dtcs: ['P0299', 'P0300'],
    liveData: { RPM: { value: 850, unit: 'RPM' }, VOLTAGE: { value: 12.1, unit: 'V' } },
    vehicle: { brand: 'SEAT', model: 'Leon', year: '2017' },
    symptoms: 'falta de potencia'
  });
  assert.equal(status, 200);
  assert.equal(body.dtcDetails.length, 2);
  assert.ok(body.dtcDetails[0].system);
  assert.ok(body.reply.length > 0);
});

// ---------------------------------------------------------------
// Parser OBD-II (obd.js) evaluado en un sandbox con window
// ---------------------------------------------------------------
test('OBDParser decodifica DTC y PID correctamente', () => {
  const code = readFileSync(path.join(ROOT, 'public', 'js', 'obd.js'), 'utf8');
  const sandbox = { window: {}, navigator: {}, TextDecoder, TextEncoder, console };
  sandbox.window.navigator = sandbox.navigator;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const P = sandbox.window.OBDParser;
  assert.ok(P, 'OBDParser debe estar disponible');

  const dtcs = P.parseDTCs('43 02 99 03 00 00 00', 0x43);
  assert.equal(JSON.stringify([...dtcs].sort()), JSON.stringify(['P0299', 'P0300'].sort()));

  const p0029 = P.parseDTCs('43 00 29 00 00 00', 0x43);
  assert.equal(JSON.stringify(p0029), JSON.stringify(['P0029']));

  const sinCodigos = P.parseDTCs('43 00 00 00 00 00', 0x43);
  assert.equal(sinCodigos.length, 0);

  const rpm = P.parseMode01('010C', '41 0C 1A F8');
  assert.equal(rpm.value, Math.round(((0x1A * 256) + 0xF8) / 4));

  const coolant = P.parseMode01('0105', '41 05 7B');
  assert.equal(coolant.value, 0x7B - 40);

  const maf = P.parseMode01('0110', '41 10 03 E8');
  assert.equal(maf.value, 10);
  const trims = P.parseMode01('0106', '41 06 80');
  assert.equal(trims.value, 0);
  const map = P.parseMode01('010B', '41 0B 64');
  assert.equal(map.value, 100);
  const lambda = P.parseMode01('0144', '41 44 80 00');
  assert.equal(lambda.value, 1);
  const rail = P.parseMode01('0123', '41 23 0F A0');
  assert.equal(rail.value, 40000);
  const dpf = P.parseMode01('017C', '41 7C 0E 74');
  assert.equal(dpf.value, 330);
  const moduleVoltage = P.parseMode01('0142', '41 42 36 B0');
  assert.equal(moduleVoltage.value, 14);

  const vin = P.parseVIN('49 02 01 56 53 53 5A\r49 02 02 5A 5A 35 50 5A\r49 02 03 39 52 30 31 32\r49 02 04 33 34 35 00 00');
  assert.equal(vin, 'VSSZZZ5PZ9R012345');
});

test('ELM327Manager en modo simulado: conexión, DTC, telemetría, VIN y borrado', async () => {
  const code = readFileSync(path.join(ROOT, 'public', 'js', 'obd.js'), 'utf8');
  const sandbox = {
    window: {}, navigator: {}, console,
    TextDecoder, TextEncoder, Promise, Date,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const manager = new sandbox.window.ELM327Manager();
  const info = await manager.connect('simulated', 38400);
  assert.equal(info.success, true);
  assert.equal(manager.status, 'connected');

  const dtc = await manager.readDTCs();
  assert.ok(dtc.all.includes('P0299'));
  assert.ok(dtc.all.includes('P0300'));
  assert.ok(dtc.all.includes('P0101'));

  const tel = await manager.readSingleTelemetry();
  assert.equal(typeof tel.rpm, 'number');
  assert.equal(typeof tel.coolant, 'number');
  for (const key of ['speed','load','throttle','iat','maf','map','baro','timing','stft','ltft','lambda','o2','fuelLevel','oil','railBar','fuelRate','catalyst','dpf','ambient','torque','voltage']) {
    assert.equal(typeof tel[key], 'number', `${key} debe ser numérico en el simulador`);
  }
  assert.ok(tel.boost >= 0 && Number.isFinite(tel.boost));

  const vin = await manager.readVIN();
  assert.equal(vin, 'VSSZZZ5PZ9R012345');

  await manager.clearDTCs();
  const after = await manager.readDTCs();
  assert.equal(after.total, 0);

  await manager.disconnect();
  assert.equal(manager.status, 'disconnected');
});

test('ELM327Manager no declara borrado ni ausencia de averías sin respuesta válida', async () => {
  const code = readFileSync(path.join(ROOT, 'public', 'js', 'obd.js'), 'utf8');
  const sandbox = {
    window: {}, navigator: {}, console,
    TextDecoder, TextEncoder, Promise, Date,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const manager = new sandbox.window.ELM327Manager();
  await manager.connect('simulated', 38400);

  manager.send = async () => 'NO DATA\r\r>';
  await assert.rejects(() => manager.readDTCs(), /no respondió/i);
  await assert.rejects(() => manager.clearDTCs(), /no confirmó/i);

  await manager.disconnect();
});

// ---------------------------------------------------------------
// Foro de mecánicos: persistencia, permisos, privacidad y conocimiento
// ---------------------------------------------------------------
let forumAdmin = '';
let forumUser = '';
let forumIntruder = '';
let forumCaseId = 0;
let forumReplyId = 0;
let forumThreadId = 0;
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

test('foro: categorías completas y estado vacío público', async () => {
  const { status, body } = await forumRequest('/api/forum/categories');
  assert.equal(status, 200);
  const ids = body.categories.map(c => c.id);
  for (const id of ['motor', 'turbo', 'inyeccion', 'electricidad', 'electronica', 'frenos', 'embrague', 'transmision', 'refrigeracion', 'climatizacion', 'distribucion', 'emisiones', 'dpf-fap', 'egr', 'sensores', 'diagnosis-obd', 'mantenimiento', 'herramientas']) {
    assert.ok(ids.includes(id), `falta la categoría ${id}`);
  }
  const cases = await forumRequest('/api/forum/cases');
  assert.equal(cases.status, 200);
  assert.equal(cases.body.total, 0);
});

test('foro: publicar requiere sesión', async () => {
  const { status } = await forumRequest('/api/forum/cases', {
    method: 'POST',
    body: { category: 'motor', title: 'Intento sin sesión', body: 'Este caso no debe publicarse sin autenticación.' }
  });
  assert.equal(status, 401);
});

test('foro: primer usuario administrador y segundo usuario normal', async () => {
  const one = await forumRequest('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'mecanico_test', displayName: 'Mecánico Test', password: 'claveSegura123' }
  });
  assert.equal(one.status, 201);
  assert.equal(one.body.user.role, 'admin');
  assert.ok(one.cookie.startsWith('dym_forum_session='));
  forumAdmin = one.cookie;

  const two = await forumRequest('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'ayudante_test', displayName: 'Ayudante Test', password: 'claveSegura456' }
  });
  assert.equal(two.status, 201);
  assert.equal(two.body.user.role, 'user');
  forumUser = two.cookie;

  const me = await forumRequest('/api/forum/auth/me', { cookie: forumUser });
  assert.equal(me.body.user.username, 'ayudante_test');
});

test('foro: caso con datos técnicos y adjunto validado', async () => {
  const created = await forumRequest('/api/forum/cases', {
    method: 'POST',
    cookie: forumUser,
    body: {
      category: 'turbo',
      title: 'Falta de potencia en SEAT León con P0299',
      body: 'El vehículo entra en protección al acelerar en cuarta. Se comprobó el filtro y no hay fugas visibles.',
      vehicleBrand: 'SEAT',
      vehicleModel: 'León',
      vehicleYear: '2017',
      engine: '2.0 TDI 150 CV',
      engineCode: 'CRLB',
      mileage: '142000',
      dtcs: ['P0299', 'P0300', 'inventado'],
      symptoms: 'Falta de potencia y silbido',
      conditions: 'Aparece en cuesta y en cuarta',
      measurements: 'Presión real 1,2 bar frente a 1,8 solicitada',
      tests: 'Prueba de estanqueidad de admisión',
      repairs: 'Se sustituyó el filtro de aire',
      attachments: [{ name: 'foto.png', data: tinyPng }]
    }
  });
  assert.equal(created.status, 201);
  forumCaseId = created.body.id;
  assert.equal(created.body.ref, 'CASO-00001');
  assert.deepEqual(created.body.dtcs, ['P0299', 'P0300']);
  assert.equal(created.body.attachmentsList.length, 1);
  assert.equal(created.body.author.username, 'ayudante_test');

  const file = await fetch(`${BASE}${created.body.attachmentsList[0].url}`);
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
});

test('foro: búsqueda por DTC, marca y texto', async () => {
  const byDtc = await forumRequest('/api/forum/cases?dtc=P0299');
  assert.equal(byDtc.status, 200);
  assert.equal(byDtc.body.total, 1);
  const byBrand = await forumRequest('/api/forum/cases?brand=SEAT&q=potencia');
  assert.equal(byBrand.body.cases[0].id, forumCaseId);
  const byText = await forumRequest('/api/forum/cases?q=silbido');
  assert.equal(byText.body.total, 1);
  const empty = await forumRequest('/api/forum/cases?q=no-existe-xyz');
  assert.equal(empty.body.total, 0);
  const recent = await forumRequest('/api/forum/cases?days=1');
  assert.equal(recent.body.total, 1);
  const invalidDays = await forumRequest('/api/forum/cases?days=no-es-un-numero');
  assert.equal(invalidDays.status, 200);
  assert.equal(invalidDays.body.total, 1);
});

test('foro: respuestas encadenadas, propuesta, voto y valoración', async () => {
  const reply = await forumRequest(`/api/forum/cases/${forumCaseId}/replies`, {
    method: 'POST',
    cookie: forumUser,
    body: { body: 'Comprueba el actuador de la geometría variable y la varilla; suele agarrarse por carbonilla.', proposal: true }
  });
  assert.equal(reply.status, 201);
  forumReplyId = reply.body.repliesList[0].id;
  assert.equal(reply.body.status, 'solucion_propuesta');
  assert.equal(reply.body.repliesList[0].proposal, true);

  const chained = await forumRequest(`/api/forum/cases/${forumCaseId}/replies`, {
    method: 'POST',
    cookie: forumAdmin,
    body: { body: 'Confirmo la comprobación de la varilla en frío.', parentId: forumReplyId }
  });
  assert.equal(chained.status, 201);
  assert.equal(chained.body.repliesList.length, 2);
  assert.equal(chained.body.repliesList[1].parentId, forumReplyId);

  const vote = await forumRequest('/api/forum/vote', {
    method: 'POST', cookie: forumAdmin,
    body: { targetType: 'reply', targetId: forumReplyId, value: 1 }
  });
  assert.equal(vote.status, 200);
  assert.equal(vote.body.score, 1);

  const rating = await forumRequest(`/api/forum/replies/${forumReplyId}/rating`, {
    method: 'POST', cookie: forumAdmin, body: { value: 4 }
  });
  assert.equal(rating.status, 200);
  assert.equal(rating.body.rating, 4);
});

test('foro: solo moderación verifica una solución', async () => {
  const denied = await forumRequest(`/api/forum/cases/${forumCaseId}/solution`, {
    method: 'POST', cookie: forumUser, body: { replyId: forumReplyId, notes: 'Intento sin permiso' }
  });
  assert.equal(denied.status, 403);

  const verified = await forumRequest(`/api/forum/cases/${forumCaseId}/solution`, {
    method: 'POST', cookie: forumAdmin,
    body: { replyId: forumReplyId, notes: 'La presión alcanza el objetivo tras limpiar el actuador.' }
  });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'solucion_verificada');
  assert.equal(verified.body.repliesList.find(r => r.id === forumReplyId).verified, true);

  const knowledge = await forumRequest('/api/forum/knowledge?q=Seat%20Leon%20pierde%20potencia&dtc=P0299&brand=SEAT&model=Leon');
  assert.equal(knowledge.status, 200);
  assert.ok(knowledge.body.references.some(r => r.ref === 'CASO-00001' && r.confidence === 'alta'));
});

test('foro: la IA cita los casos internos y diferencia propuestas', async () => {
  const chat = await postJSON('/api/chat', { message: 'SEAT León 2.0 TDI pierde potencia y marca P0299' });
  assert.equal(chat.status, 200);
  assert.ok(chat.body.reply.includes('CASO-00001'));
  assert.ok(chat.body.reply.includes('Solución verificada'));
  assert.ok(Array.isArray(chat.body.forum_references) && chat.body.forum_references.length > 0);
});

test('foro: perfil, reputación y actualización de perfil', async () => {
  const profile = await forumRequest('/api/forum/users/ayudante_test');
  assert.equal(profile.status, 200);
  assert.equal(profile.body.stats.cases, 1);
  assert.ok(profile.body.stats.replies >= 1);
  assert.ok(profile.body.stats.solutions >= 1);
  assert.ok(profile.body.user.reputation > 0);

  const updated = await forumRequest('/api/forum/me', {
    method: 'PATCH', cookie: forumUser,
    body: { specialty: 'Turbo y sobrealimentación', location: 'Taller local', bio: 'Pruebas de presión y estanqueidad.' }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.user.specialty, 'Turbo y sobrealimentación');
});

test('foro: mensajes privados solo para sus participantes', async () => {
  const sent = await forumRequest('/api/forum/messages', {
    method: 'POST', cookie: forumAdmin,
    body: { to: 'ayudante_test', body: '¿Puedes subir la medición final de presión?' }
  });
  assert.equal(sent.status, 201);
  forumThreadId = sent.body.threadId;

  const inbox = await forumRequest('/api/forum/messages', { cookie: forumUser });
  assert.equal(inbox.status, 200);
  assert.equal(inbox.body.threads[0].id, forumThreadId);
  assert.equal(inbox.body.threads[0].unread, 1);

  const thread = await forumRequest(`/api/forum/messages/${forumThreadId}`, { cookie: forumUser });
  assert.equal(thread.status, 200);
  assert.equal(thread.body.messages.length, 1);

  const third = await forumRequest('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'intruso_test', displayName: 'Intruso', password: 'claveSegura789' }
  });
  forumIntruder = third.cookie;
  const denied = await forumRequest(`/api/forum/messages/${forumThreadId}`, { cookie: forumIntruder });
  assert.equal(denied.status, 404);
});

test('foro: denuncias y bandeja de moderación', async () => {
  const report = await forumRequest('/api/forum/reports', {
    method: 'POST', cookie: forumAdmin,
    body: { targetType: 'reply', targetId: forumReplyId, reason: 'Prueba de moderación' }
  });
  assert.equal(report.status, 201);

  const denied = await forumRequest('/api/forum/moderation/reports', { cookie: forumUser });
  assert.equal(denied.status, 403);

  const queue = await forumRequest('/api/forum/moderation/reports', { cookie: forumAdmin });
  assert.equal(queue.status, 200);
  assert.ok(queue.body.reports.some(r => r.targetType === 'reply' && r.targetId === forumReplyId));

  const resolved = await forumRequest(`/api/forum/moderation/reports/${queue.body.reports[0].id}`, {
    method: 'PATCH', cookie: forumAdmin, body: { action: 'descartada' }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'descartada');
});

test('foro: rechaza adjuntos falsos, spam y datos inválidos', async () => {
  const fake = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: {
      category: 'motor', title: 'Archivo falso de prueba', body: 'Contenido suficientemente largo para pasar la validación mínima.',
      attachments: [{ name: 'malo.png', data: 'data:image/png;base64,bm8tZXMtdW5hLWltYWdlbg==' }]
    }
  });
  assert.equal(fake.status, 400);

  const spam = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: {
      category: 'motor', title: 'Spam con enlaces', body: 'http://a.example http://b.example http://c.example http://d.example'
    }
  });
  assert.equal(spam.status, 400);

  const badCategory = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: { category: 'no-existe', title: 'Caso con categoría inválida', body: 'Contenido suficientemente largo para la prueba.' }
  });
  assert.equal(badCategory.status, 400);
});


test('foro: ocultar una solución verificada retira la verificación y protege sus adjuntos', async () => {
  const created = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: {
      category: 'frenos', title: 'Prueba de ocultación de solución verificada',
      body: 'Caso creado para comprobar que una solución oculta deja de estar verificada y no expone sus archivos.'
    }
  });
  assert.equal(created.status, 201);
  const caseId = created.body.id;
  const reply = await forumRequest(`/api/forum/cases/${caseId}/replies`, {
    method: 'POST', cookie: forumUser,
    body: { body: 'Propuesta con adjunto para comprobar la moderación.', proposal: true, attachments: [{ name: 'evidencia.png', data: tinyPng }] }
  });
  assert.equal(reply.status, 201);
  const replyId = reply.body.repliesList[0].id;
  const attachmentUrl = reply.body.repliesList[0].attachments[0].url;

  const verified = await forumRequest(`/api/forum/cases/${caseId}/solution`, {
    method: 'POST', cookie: forumAdmin, body: { replyId, notes: 'Verificación temporal de prueba.' }
  });
  assert.equal(verified.body.status, 'solucion_verificada');
  assert.equal((await fetch(`${BASE}${attachmentUrl}`)).status, 200);

  const hidden = await forumRequest(`/api/forum/replies/${replyId}`, {
    method: 'DELETE', cookie: forumAdmin, body: { reason: 'Prueba de ocultación' }
  });
  assert.equal(hidden.status, 200);
  const afterHide = await forumRequest(`/api/forum/cases/${caseId}`);
  assert.equal(afterHide.body.status, 'abierto');
  assert.equal(afterHide.body.solutionReplyId, null);
  assert.equal(afterHide.body.repliesList.length, 0);
  assert.equal((await fetch(`${BASE}${attachmentUrl}`)).status, 404);
  const authorView = await forumRequest(`/api/forum/cases/${caseId}`, { cookie: forumUser });
  assert.equal(authorView.body.repliesList.length, 1);
  assert.equal(authorView.body.repliesList[0].hidden, true);

  const restored = await forumRequest(`/api/forum/replies/${replyId}/visibility`, {
    method: 'PATCH', cookie: forumAdmin, body: { hidden: false, reason: 'Restauración de prueba' }
  });
  assert.equal(restored.status, 200);
  const afterRestore = await forumRequest(`/api/forum/cases/${caseId}`);
  assert.equal(afterRestore.body.repliesList.length, 1);
  assert.equal(afterRestore.body.status, 'abierto');
  assert.equal((await fetch(`${BASE}${attachmentUrl}`)).status, 200);
});


test('foro: limita los adjuntos a cuatro archivos por publicación', async () => {
  const four = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: {
      category: 'herramientas', title: 'Prueba de cuatro adjuntos permitidos',
      body: 'Caso de prueba para comprobar el límite de archivos por publicación en el foro.',
      attachments: [1, 2, 3, 4].map(i => ({ name: `pieza-${i}.png`, data: tinyPng }))
    }
  });
  assert.equal(four.status, 201);
  assert.equal(four.body.attachmentsList.length, 4);

  const five = await forumRequest('/api/forum/cases', {
    method: 'POST', cookie: forumAdmin,
    body: {
      category: 'herramientas', title: 'Prueba de cinco adjuntos rechazados',
      body: 'Caso de prueba para comprobar que no se aceptan más de cuatro archivos.',
      attachments: [1, 2, 3, 4, 5].map(i => ({ name: `pieza-${i}.png`, data: tinyPng }))
    }
  });
  assert.equal(five.status, 400);
});

test('foro: suspensión de usuario y cierre de sesión', async () => {
  const ban = await forumRequest('/api/forum/moderation/users/3/ban', {
    method: 'POST', cookie: forumAdmin, body: { days: 1, reason: 'Prueba de moderación' }
  });
  assert.equal(ban.status, 200);
  const banned = await forumRequest('/api/forum/auth/me', { cookie: forumIntruder });
  assert.equal(banned.body.user, null);

  const logout = await forumRequest('/api/forum/auth/logout', { method: 'POST', cookie: forumUser });
  assert.equal(logout.status, 200);
  const afterLogout = await forumRequest('/api/forum/auth/me', { cookie: forumUser });
  assert.equal(afterLogout.body.user, null);
});


// ---------------------------------------------------------------
// Evolución profesional: catálogo, vehículos, tuning e IA con contexto
// ---------------------------------------------------------------
test('catálogo final: 500 productos con imagen y enlace locales verificados', async () => {
  const { status, body } = await getJSON('/api/products');
  assert.equal(status, 200);
  assert.equal(body.length, 500);
  assert.equal(new Set(body.map(p => p.id)).size, 500);
  assert.equal(new Set(body.map(p => p.name.toLowerCase())).size, 500);
  const cats = new Set(body.map(p => p.category));
  for (const c of ['Herramientas', 'Diagnosis', 'Líquidos y Químicos', 'Repuestos', 'Maquinaria', 'Tuning']) assert.ok(cats.has(c), `falta categoría ${c}`);
  assert.ok(body.every(p => p.imageStatus === 'verified' && p.image));
  assert.ok(body.every(p => p.linkStatus === 'verified' && /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}$/.test(p.affiliateUrl)));
  assert.ok(body.every(p => p.compatibility?.type && p.compatibility?.note));
  assert.ok(body.every(p => !/^(Profesional|Línea Económica|Genérico|Universal)$/i.test(p.manufacturer || '')));
  const tuning = await getJSON('/api/products?category=Tuning');
  assert.equal(tuning.body.length, 40);
});

test('vehículos: fichas, guía de compra y relaciones coherentes', async () => {
  const { status, body } = await getJSON('/api/vehicles');
  assert.equal(status, 200);
  assert.ok(body.length >= 10);
  assert.ok(body.every(v => v.id && v.brand && v.model && v.version && v.years && v.image?.src));
  const golf = await getJSON('/api/vehicles/vw-golf-vii-r-75');
  assert.equal(golf.status, 200);
  assert.equal(golf.body.engine.powerPs, 310);
  assert.equal(golf.body.engine.torqueNm, 400);
  assert.ok(golf.body.buyingGuide.priorityChecks.length >= 5);
  assert.ok(golf.body.sources.length >= 2);
  const related = await getJSON('/api/vehicles/vw-golf-vii-r-75/related');
  assert.equal(related.status, 200);
  assert.ok(related.body.symptoms.length > 0);
  assert.ok(related.body.dtc.length > 0);
  assert.ok(related.body.products.length > 0);
  assert.ok(related.body.guide.verdict);
  assert.ok(related.body.relationDisclaimer);
  assert.ok(related.body.dtc.every(d => d.specificity === 'orientativo'));
  assert.ok(related.body.dtc.every(d => !/^Código (de Red|de Avería|Específico)/i.test(d.title)));
  assert.ok(related.body.symptoms.every(s => !['Dirección'].includes(s.area)), 'no debe mezclar sistemas no inspeccionados');
  assert.ok(related.body.products.every(p => /compatibilidad con este vehículo no está confirmada/i.test(p.relationNote || '')));
  assert.ok(!related.body.products.some(p => /hidr[aá]ulico|comprobador|probador|llave de filtro/i.test(p.name)));
  const bmw = await getJSON('/api/vehicles/bmw-320d-f30/related');
  assert.ok(bmw.body.products.some(p => /dpf|fap/i.test(p.name)), 'el diésel debe enlazar limpieza DPF');
  assert.ok(bmw.body.products.some(p => /egr/i.test(p.name)), 'el diésel debe enlazar limpieza EGR');
  assert.ok(!bmw.body.products.some(p => /buj[ií]a/i.test(p.name)), 'el diésel no debe enlazar bujías de encendido');
  assert.equal((await getJSON('/api/vehicles/no-existe')).status, 404);
});

test('tuning: etapas, paquetes y productos relacionados sin promesas de potencia', async () => {
  const { status, body } = await getJSON('/api/tuning');
  assert.equal(status, 200);
  assert.equal(body.stages.length, 3);
  assert.equal(body.packages.length, 6);
  assert.ok(body.disclaimer);
  const r = body.packages.find(p => p.id === 'tuning-golf-r-75');
  assert.ok(r);
  assert.equal(r.vehicle.id, 'vw-golf-vii-r-75');
  assert.ok(r.relatedProducts.length > 0);
  assert.ok(!JSON.stringify(r).match(/\+\s?\d+\s?(cv|ps|nm)/i), 'no debe prometer ganancias');
  assert.ok(r.legal);
});

test('buscador universal incluye vehículos, tuning y biblioteca', async () => {
  const v = await getJSON('/api/search?q=golf');
  assert.equal(v.status, 200);
  assert.ok(v.body.groups.vehicles.length > 0);
  const t = await getJSON('/api/search?q=tuning');
  assert.equal(t.status, 200);
  assert.ok(t.body.groups.tuning.length > 0);
  const l = await getJSON('/api/search?q=golf');
  assert.equal(l.status, 200);
  assert.ok(Array.isArray(l.body.groups.library));
  assert.ok(l.body.groups.library.length > 0);
  assert.ok(l.body.groups.library.every(x => x.type === 'library' && x.id && x.title));
  assert.ok(Array.isArray(l.body.groups.technical) && l.body.groups.technical.length > 0);
});

test('biblioteca técnica: índice, cobertura, carencias y detalle verificable', async () => {
  const { status, body } = await getJSON('/api/library');
  assert.equal(status, 200);
  assert.equal(body.total, 15);
  assert.equal(body.items.length, 15);
  assert.equal(body.documentationGaps.length, 8);
  assert.equal(body.coverage.length, 7);
  assert.ok(body.notice);
  assert.ok(body.brands.length >= 8);
  assert.ok(body.systems.includes('Motor EA888'));
  assert.ok(body.items.every(i => i.id && i.title && i.brand && i.image?.src));
  assert.ok(body.items.every(i => i.status === 'parcial' && i.statusLabel));
  assert.ok(body.items.every(i => i.sourceCount > 0 && i.coveredCount > 0 && i.pendingCount === 8));

  const golf = await getJSON('/api/library/vw-golf-vii-r-75');
  assert.equal(golf.status, 200);
  assert.equal(golf.body.brand, 'Volkswagen');
  assert.ok(golf.body.engine?.powerPs === 310 && golf.body.engine?.torqueNm === 400);
  assert.ok(golf.body.sources.length >= 2);
  assert.ok(golf.body.inspection.length >= 3);
  assert.ok(golf.body.documentationGaps.length === 8);
  assert.ok(golf.body.notice);

  const golfSearch = await getJSON('/api/library?q=golf');
  assert.equal(golfSearch.status, 200);
  assert.ok(golfSearch.body.items.length >= 3);
  const audi = await getJSON('/api/library?brand=Audi');
  assert.equal(audi.status, 200);
  assert.ok(audi.body.items.length === 1 && audi.body.items[0].brand === 'Audi');
  const motor = await getJSON('/api/library?system=Motor%20EA888');
  assert.equal(motor.status, 200);
  assert.ok(motor.body.items.every(i => i.systems.includes('Motor EA888')));
  assert.equal((await getJSON('/api/library/no-existe')).status, 404);
});

test('biblioteca técnica: 27 categorías, datos importados y fuentes con estados diferenciados', async () => {
  const meta = await getJSON('/api/technical/meta');
  assert.equal(meta.status, 200);
  assert.equal(meta.body.version, 4);
  assert.equal(meta.body.categories.length, 27);
  assert.equal(meta.body.counts.total, 37114);
  assert.equal(meta.body.counts.pids, 132);
  assert.equal(meta.body.counts.dtc, 9533);
  assert.equal(meta.body.counts.recalls, 109);
  assert.equal(meta.body.categories.filter(c => c.coverage === 'data').length, 25);
  assert.equal(meta.body.categories.filter(c => c.coverage === 'source').length, 2);
  assert.equal(meta.body.categories.filter(c => c.coverage === 'pending').length, 0);
  assert.equal(meta.body.counts.byStatus.verified, 241);
  assert.equal(meta.body.counts.byStatus.metadata_only, 193);
  assert.equal(meta.body.counts.byStatus.source_only, 53);
  assert.equal(meta.body.vehicles.length, 15);
  assert.ok(meta.body.facets.brands.includes('Volkswagen'));
  assert.ok(meta.body.facets.years.includes(2024));

  const pids = await getJSON('/api/technical/pids');
  assert.equal(pids.status, 200);
  assert.equal(pids.body.total, 132);
  assert.equal(pids.body.pids.length, 132);
  assert.ok(pids.body.pids.every(p => p.code && p.unit && p.sourceIds.length));
  assert.ok(pids.body.pids.filter(p => p.formula).length >= 90);

  const pid = await getJSON('/api/technical/pids/010C');
  assert.equal(pid.status, 200);
  assert.equal(pid.body.code, '010C');
  assert.match(pid.body.formula, /256/);
  assert.equal((await getJSON('/api/technical/pids/NOPE')).status, 404);

  const filters = await getJSON('/api/technical?category=egr-intake&limit=100');
  assert.equal(filters.status, 200);
  assert.ok(filters.body.total > 0);
  assert.ok(filters.body.items.every(item => item.categoryId === 'egr-intake' || item.match));

  const golf = await getJSON('/api/technical?vehicleId=vw-golf-vii-r-75&limit=100');
  assert.equal(golf.status, 200);
  assert.ok(golf.body.total >= 7);
  assert.ok(golf.body.items.every(item => item.vehicleIds.includes('vw-golf-vii-r-75')));

  for (const id of ['vw-golf-iv-19-tdi-110','vw-golf-v-20-tdi-140','peugeot-205-19-gti','peugeot-206-20-hdi-90','peugeot-308-iii-15-bluehdi-130']) {
    const vehicle = await getJSON(`/api/vehicles/${id}`);
    assert.equal(vehicle.status, 200);
    assert.ok(vehicle.body.engine?.powerPs > 0 && vehicle.body.engine?.torqueNm > 0);
    assert.ok(vehicle.body.inspection.length >= 5);
    assert.ok(vehicle.body.knownIssues.length >= 1);
    assert.ok(vehicle.body.sources.length >= 1);
    const technical = await getJSON(`/api/technical?vehicleId=${id}&limit=100`);
    assert.equal(technical.status, 200);
    assert.ok(technical.body.total >= 6, `${id} debe tener entradas técnicas`);
  }

  const search = await getJSON('/api/technical?q=P0299&limit=100');
  assert.equal(search.status, 200);
  assert.ok(search.body.total > 0);

  const dtcSearch = await getJSON('/api/technical?type=dtc&q=P0299&limit=20');
  assert.equal(dtcSearch.status, 200);
  assert.ok(dtcSearch.body.total > 0);
  assert.ok(dtcSearch.body.items.every(item => item.type === 'dtc'));

  const dtcDetail = await getJSON('/api/technical/dtc-P0299');
  assert.equal(dtcDetail.status, 200);
  assert.equal(dtcDetail.body.data.code, 'P0299');
  assert.ok(dtcDetail.body.data.causes.length > 0);

  const brands = await getJSON('/api/technical?type=vehicle_spec&brand=Volkswagen&limit=100');
  assert.equal(brands.status, 200);
  assert.ok(brands.body.total > 0);
  assert.ok(brands.body.items.every(item => item.brand === 'Volkswagen'));

  const year = await getJSON('/api/technical?type=vehicle_spec&year=2024&limit=100');
  assert.equal(year.status, 200);
  assert.ok(year.body.total > 0);
  assert.ok(year.body.items.every(item => item.yearFrom && item.yearFrom <= 2024 && (!item.yearTo || item.yearTo >= 2024)));

  const systems = await getJSON('/api/technical?system=Turbo&limit=20');
  assert.equal(systems.status, 200);
  assert.ok(systems.body.total > 0);

  const recalls = await getJSON('/api/technical?type=recall&limit=100');
  assert.equal(recalls.status, 200);
  assert.equal(recalls.body.total, 109);
  const recallDetail = await getJSON(`/api/technical/${encodeURIComponent(recalls.body.items[0].id)}`);
  assert.equal(recallDetail.status, 200);
  assert.ok(recallDetail.body.data.campaign);

  const sources = await getJSON('/api/technical?category=official-sources&type=source&limit=100');
  assert.equal(sources.status, 200);
  assert.equal(sources.body.total, 53);

  const detail = await getJSON('/api/technical/pid-010C');
  assert.equal(detail.status, 200);
  assert.equal(detail.body.status, 'verified');
  assert.ok(detail.body.sources.length >= 1);
  assert.equal((await getJSON('/api/technical/no-existe')).status, 404);

  const invalid = await getJSON('/api/technical?category=no-existe');
  assert.equal(invalid.status, 400);
  const invalidType = await getJSON('/api/technical?type=no-existe');
  assert.equal(invalidType.status, 400);
});

test('chat local añade referencias de la biblioteca técnica', async () => {
  const { status, body } = await postJSON('/api/chat', {
    message: 'Tengo el código P0299 y falta de potencia en un Golf 2.0 TSI',
    context: { vehicleId: 'vw-golf-vii-r-75' }
  });
  assert.equal(status, 200);
  assert.equal(body.source, 'expert_rules');
  assert.ok(Array.isArray(body.technical_references));
  assert.ok(body.technical_references.length > 0);
  assert.match(body.reply, /Referencias técnicas locales/);
});

test('IA local recibe y devuelve el contexto de una ficha de vehículo', async () => {
  const { status, body } = await postJSON('/api/chat', {
    message: '¿Qué debo revisar antes de comprar un Golf R 7.5?',
    context: { vehicleId: 'vw-golf-vii-r-75', brand: 'Volkswagen', model: 'Golf', engine: 'R 2.0 TSI' }
  });
  assert.equal(status, 200);
  assert.equal(body.source, 'expert_rules');
  assert.equal(body.vehicle.id, 'vw-golf-vii-r-75');
  assert.match(body.reply, /Golf R/);
  assert.ok(Array.isArray(body.productos_recomendados));
});

test('un archivo estático inexistente devuelve 404 y no la página principal', async () => {
  const missing = await fetch(`${BASE}/js/no-existe.js`);
  assert.equal(missing.status, 404);
  // No debe entregar la página principal haciéndola pasar por el archivo pedido.
  assert.doesNotMatch(await missing.text(), /Plataforma Automotriz/);
  assert.equal((await fetch(`${BASE}/img/no-existe.png`)).status, 404);
  // Las rutas de la aplicación siguen sirviendo la página principal.
  const view = await fetch(`${BASE}/vehiculos`);
  assert.equal(view.status, 200);
  assert.match(view.headers.get('content-type') || '', /text\/html/);
});

test('un JSON malformado devuelve 400 y no un error interno', async () => {
  const r = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{malformado'
  });
  assert.equal(r.status, 400);
  const body = await r.json().catch(() => null);
  assert.match(body?.error || '', /JSON/i);
});
