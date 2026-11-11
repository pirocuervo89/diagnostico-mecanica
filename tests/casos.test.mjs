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
      // La cadena incluye Pollinations sin clave; en pruebas se desactiva para
      // no salir a Internet ni depender de un servicio externo.
      POLLINATIONS_ENABLED: '0',
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
  assert.equal(body.tuning, 3);
  assert.ok(body.tuningProducts >= 230, 'debe incluir el catálogo de accesorios de tuning');
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

test('scanner de vehículo: el resumen IA es opcional y no bloquea el OCR', async () => {
  const { status, body } = await postJSON('/api/vehicle/scan/ai', {
    extracted: {
      brand: { value: 'Volkswagen' },
      model: { value: 'Golf' },
      year: { value: 2018 },
      vin: { value: 'WVWZZZAUZJW123456' },
      plate: { value: '1234ABC' }
    }
  });
  assert.equal(status, 200);
  assert.equal(body.ai, null);
});

test('scanner de vehículo: el resumen IA exige datos extraídos', async () => {
  const { status, body } = await postJSON('/api/vehicle/scan/ai', {});
  assert.equal(status, 400);
  assert.ok(body.error);
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

test('obd/protocols ofrece los ATSP estándar con datos verificables', async () => {
  const { status, body } = await getJSON('/api/obd/protocols');
  assert.equal(status, 200);
  assert.equal(body.recommended, 'ATSP0');
  assert.ok(body.protocols.length >= 11);
  const codes = body.protocols.map(p => p.code);
  for (const code of ['ATSP0', 'ATSP1', 'ATSP2', 'ATSP3', 'ATSP4', 'ATSP5', 'ATSP6', 'ATSP7', 'ATSP8', 'ATSP9', 'ATSPA']) {
    assert.ok(codes.includes(code), `debe incluir ${code}`);
  }
  assert.equal(new Set(codes).size, codes.length, 'no debe haber códigos duplicados');
  for (const p of body.protocols) {
    assert.ok(p.id && p.label && p.bus && p.pins && p.era && p.note, `${p.code} debe estar documentado`);
    assert.match(p.code, /^ATSP[0-9A-C]$/);
    assert.ok(['recomendado', 'estandar', 'especial'].includes(p.state));
  }
});

test('obd/scanners: solo adaptadores web verificables, de más barato a más caro', async () => {
  const { status, body } = await getJSON('/api/obd/scanners');
  assert.equal(status, 200);
  assert.equal(body.total, 5);
  assert.equal(body.items.length, 5);
  assert.deepEqual(body.items.map(i => i.rank), [1, 2, 3, 4, 5]);
  assert.ok(body.protocolCoverageNote, 'debe explicar la cobertura de protocolos');

  const passengerCodes = ['ATSP0', 'ATSP1', 'ATSP2', 'ATSP3', 'ATSP4', 'ATSP5', 'ATSP6', 'ATSP7', 'ATSP8', 'ATSP9'];
  for (const item of body.items) {
    const ps = item.protocolSupport;
    assert.ok(ps, `${item.id} debe declarar protocolos`);
    assert.deepEqual(ps.passenger, passengerCodes, `${item.id} debe cubrir los 10 protocolos de turismo`);
    assert.equal(ps.codes.length, ps.heavy ? 11 : 10);
    assert.equal(ps.heavy, item.forWeb);
    if (ps.heavy) assert.ok(ps.codes.includes('ATSPA'), `${item.id} debe declarar J1939`);
    assert.ok(ps.label && ps.note, `${item.id} debe explicar su cobertura`);
  }

  const priceOrder = [...body.items].sort((a, b) => a.price - b.price).map(i => i.id);
  assert.deepEqual(body.rankings.price, priceOrder, 'el orden por precio debe ir de más barato a más caro');
  const prices = priceOrder.map(id => body.items.find(i => i.id === id).price);
  assert.deepEqual(prices, [...prices].sort((a, b) => a - b));

  const ids = new Set(body.items.map(i => i.id));
  assert.equal(ids.size, body.items.length);
  for (const item of body.items) {
    assert.ok(item.name && item.brand && item.type, `${item.id} debe estar identificado`);
    assert.ok(item.price > 0, `${item.id} debe tener precio numérico`);
    assert.match(item.priceText, /€/);
    assert.match(item.url, /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}$/);
    assert.ok(existsSync(path.join(ROOT, 'public', item.image)), `${item.id} debe tener imagen local`);
    assert.ok(item.bestFor && item.limits.length, `${item.id} debe explicar uso y límites`);
    assert.ok(item.verification?.note, `${item.id} debe indicar cómo se verificó`);
  }

  assert.equal(body.items[0].id, 'elm327-usb-v15', 'el ELM327 USB debe ser el más barato');
  assert.equal(body.items[0].price, 20.99);
  assert.equal(body.rankings.price[0], 'elm327-usb-v15');
  for (const item of body.items) {
    assert.equal(item.forWeb, true, `${item.id} debe funcionar con esta web`);
    assert.match(item.connection, /BLE|USB/);
    assert.match(item.type, /Adaptador/);
    assert.doesNotMatch(item.type, /escáner|mano/i, `${item.id} no puede ser un escáner de mano`);
    assert.doesNotMatch(item.name, /X431|MK808|CRP919|CR Pro|NT530|AP200|AD600S|AD410/i);
  }
});

test('OBD-II: la lista de adaptadores va arriba y no quedan escáneres de mano', () => {
  const html = readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8');
  const list = html.indexOf('id="obdScannerList"');
  const config = html.indexOf('id="obdMode"');
  assert.ok(list > -1, 'debe existir la lista de adaptadores');
  assert.ok(config > -1, 'debe existir la configuración de conexión');
  assert.ok(list < config, 'la lista debe ir antes de la configuración');
  assert.doesNotMatch(html, /obd-scanners-wrap|data-scanner-tab|obdScannerFilter/);
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

test('ELM327Manager aplica el protocolo elegido y lo reporta en el simulador', async () => {
  const code = readFileSync(path.join(ROOT, 'public', 'js', 'obd.js'), 'utf8');
  const sandbox = {
    window: {}, navigator: {}, console,
    TextDecoder, TextEncoder, Promise, Date,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const manager = new sandbox.window.ELM327Manager();
  const info = await manager.connect('simulated', 38400, 'ATSP3');
  assert.equal(info.success, true);
  assert.equal(manager.protocolCode, 'ATSP3');
  assert.match(manager.protocolName, /9141/);

  await manager.disconnect();
  await manager.connect('simulated', 38400, 'ATSPA');
  assert.equal(manager.protocolCode, 'ATSPA');
  assert.match(manager.protocolName, /J1939/);

  await manager.disconnect();
});

test('ELM327Manager ignora un protocolo no soportado y vuelve a automático', async () => {
  const code = readFileSync(path.join(ROOT, 'public', 'js', 'obd.js'), 'utf8');
  const sandbox = {
    window: {}, navigator: {}, console,
    TextDecoder, TextEncoder, Promise, Date,
    setTimeout, clearTimeout, setInterval, clearInterval
  };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);

  const manager = new sandbox.window.ELM327Manager();
  await manager.connect('simulated', 38400, 'ATSPZZ');
  assert.equal(manager.protocolCode, 'ATSP0');

  await manager.disconnect();
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
test('catálogo final: productos con imagen y enlace locales verificados', async () => {
  const { status, body } = await getJSON('/api/products');
  assert.equal(status, 200);
  // El catálogo crece con cada tanda de recambios; lo que se exige es que no
  // haya fichas duplicadas y que ninguna quede sin imagen ni sin enlace.
  assert.ok(body.length >= 500, `catálogo demasiado corto: ${body.length}`);
  assert.equal(new Set(body.map(p => p.id)).size, body.length);
  assert.equal(new Set(body.map(p => p.name.toLowerCase())).size, body.length);
  const cats = new Set(body.map(p => p.category));
  for (const c of ['Herramientas', 'Diagnosis', 'Líquidos y Químicos', 'Repuestos', 'Maquinaria', 'Tuning']) assert.ok(cats.has(c), `falta categoría ${c}`);
  assert.ok(body.every(p => p.imageStatus === 'verified' && p.image));
  assert.ok(body.every(p => p.linkStatus === 'verified' && /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}(\?tag=[^&\s]+)?$/.test(p.affiliateUrl)));
  assert.ok(body.every(p => p.compatibility?.type && p.compatibility?.note));
  assert.ok(body.every(p => !/^(Profesional|Línea Económica|Genérico|Universal)$/i.test(p.manufacturer || '')));
  const tuning = await getJSON('/api/products?category=Tuning');
  assert.ok(tuning.body.length >= 40, `tuning demasiado corto: ${tuning.body.length}`);
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

test('tuning: tres etapas detalladas, sin fichas de coche y con categorías de piezas', async () => {
  const { status, body } = await getJSON('/api/tuning');
  assert.equal(status, 200);
  assert.equal(body.stages.length, 3);
  assert.equal(body.packages.length, 3);
  assert.ok(body.disclaimer);
  assert.ok(body.stages.every(s => s.id && s.name && s.summary && s.legality));
  assert.ok(body.stages.every(s => Array.isArray(s.powerLevers) && s.powerLevers.length >= 4));
  assert.ok(body.stages.every(s => Array.isArray(s.limits) && s.limits.length > 0));
  const sourceIds = new Set((body.sources || []).map(s => s.id));
  for (const stage of body.stages) {
    for (const id of stage.sources || []) assert.ok(sourceIds.has(id), `fuente ${id} inexistente`);
  }
  assert.ok(body.packages.every(p => !p.vehicle), 'las guías ya no deben colgar de un coche concreto');
  assert.ok(body.packages.every(p => Array.isArray(p.productCategories) && p.productCategories.length > 0));
  assert.ok(!JSON.stringify(body).match(/\+\s?\d+\s?(cv|ps|nm)/i), 'no debe prometer ganancias inventadas');
});

test('catálogo de accesorios de tuning: productos reales, categorías, filtros y enlaces', async () => {
  const { status, body } = await getJSON('/api/tuning-products');
  assert.equal(status, 200);
  assert.ok(body.items.length >= 230, 'debe haber un catálogo amplio de productos reales');
  assert.equal(body.categories.length, 21);
  const categoryIds = new Set(body.categories.map(c => c.id));
  for (const id of ['pantallas-carplay', 'iluminacion-ambiente', 'audio-video', 'interior-accesorios']) {
    assert.ok(categoryIds.has(id), `debe existir la categoría ${id}`);
  }
  const pantallas = body.items.filter(i => i.category === 'pantallas-carplay');
  assert.equal(pantallas.length, 30, 'debe haber 30 pantallas CarPlay/Android');
  assert.ok(pantallas.every(i => /\d+,\d{2} €/.test(i.price)), 'las pantallas deben tener precio real');
  assert.ok(pantallas.every(i => Number(i.price.replace('.', '').replace(',', '.').replace(' €', '')) <= 350), 'las pantallas no deben superar 350 €');
  assert.equal(body.items.filter(i => i.price === 'Consultar').length, 0, 'ninguna ficha debe quedar sin precio');
  assert.ok(body.items.filter(i => i.category === 'iluminacion-ambiente').length >= 15);
  assert.ok(body.items.filter(i => i.category === 'audio-video').length >= 8);
  assert.ok(body.items.filter(i => i.category === 'interior-accesorios').length >= 6);
  assert.ok(body.cars.length >= 15);
  assert.equal(body.items.filter(i => !i.image).length, 0, 'toda pieza debe tener imagen');
  assert.equal(body.items.filter(i => !(i.links || []).length).length, 0, 'toda pieza debe tener enlaces');
  assert.equal(body.items.filter(i => !(i.fitment || []).length).length, 0, 'toda pieza debe declarar compatibilidad');
  assert.ok(body.items.every(i => i.links.every(l => /^https:\/\//.test(l.url))));
  assert.ok(!body.affiliate || body.affiliate.status === 'sin_cuenta');
  assert.equal(body.stats.store, body.items.length);

  const turbo = await getJSON('/api/tuning-products?category=turbo');
  assert.equal(turbo.status, 200);
  assert.ok(turbo.body.items.length >= 8);
  assert.ok(turbo.body.items.every(i => i.category === 'turbo'));

  const golf = await getJSON('/api/tuning-products?car=vw-golf-7-gti');
  assert.ok(golf.body.items.length >= 20);
  assert.ok(golf.body.items.every(i => !(i.cars || []).length || i.cars.includes('vw-golf-7-gti')));

  const search = await getJSON('/api/tuning-products?q=intercooler');
  assert.ok(search.body.items.length > 0);

  const firstTurbo = body.items.find(i => i.category === 'turbo');
  const detail = await getJSON(`/api/tuning-products/${firstTurbo.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.category, 'turbo');
  assert.equal((await getJSON('/api/tuning-products/no-existe')).status, 404);

  // Todas las fichas son de tienda y conservan la ficha antigua que ya era real.
  const shop = body.items.filter(i => i.source === 'tienda');
  assert.equal(shop.length, body.items.length);
  assert.ok(shop.every(i => i.links.some(l => /^https:\/\/www\.amazon\.es\/dp\//.test(l.url))));
  const legacy = body.items.find(i => i.id === 'tienda-amz-b0gtmbtqf4');
  assert.ok(legacy, 'la ficha antigua debe seguir en el catálogo');
  assert.equal(legacy.category, 'admision');
  assert.equal((await getJSON('/api/tuning-products/tienda-amz-b0gtmbtqf4')).status, 200);
});

test('catálogo de accesorios: foto del vendedor, archivo local y enlaces únicos', async () => {
  const { body } = await getJSON('/api/tuning-products');

  // Ninguna ficha puede apuntar a una foto que no esté en disco.
  const sinArchivo = body.items.filter(i => !existsSync(path.join(ROOT, 'public', i.image.replace(/^\//, ''))));
  assert.deepEqual(sinArchivo.map(i => i.id), [], 'toda foto referenciada debe existir en public/');

  // Todas las fotos son del vendedor: las nuevas, por ASIN; las antiguas, del catálogo de tienda.
  for (const item of body.items) {
    assert.equal(item.photoKind, 'tienda', `${item.id} debe usar foto de tienda`);
    if (item.image.startsWith('/img/tienda/')) {
      const asin = item.id.slice('tienda-amz-'.length);
      assert.match(asin, /^[a-z0-9]{10}$/);
      assert.equal(item.image.toLowerCase(), `/img/tienda/${asin}.jpg`);
      assert.ok(item.links.some(l => /^https:\/\/www\.amazon\.es\/dp\/[A-Z0-9]{10}(\?tag=[^&\s]+)?$/.test(l.url) && l.url.includes(`/dp/${asin.toUpperCase()}`)), `${item.id} debe enlazar a su ASIN`);
    } else {
      assert.ok(item.image.startsWith('/img/productos/'), `${item.id} debe conservar su foto de tienda`);
    }
  }

  // No puede haber dos piezas compartiendo el mismo archivo.
  const repetidas = new Map();
  for (const item of body.items) repetidas.set(item.image, (repetidas.get(item.image) || 0) + 1);
  assert.deepEqual([...repetidas].filter(([, n]) => n > 1), [], 'ninguna foto puede estar repetida');

  for (const item of body.items) {
    const urls = item.links.map(l => l.url);
    assert.equal(new Set(urls).size, urls.length, `${item.id} no debe repetir enlaces`);
    assert.ok(urls.every(u => /^https:\/\//.test(u)), `${item.id} solo admite enlaces https`);
    assert.ok(item.query, `${item.id} debe declarar la consulta que se busca`);
  }
});

test('buscador universal incluye vehículos y tuning', async () => {
  const v = await getJSON('/api/search?q=golf');
  assert.equal(v.status, 200);
  assert.ok(v.body.groups.vehicles.length > 0);
  const t = await getJSON('/api/search?q=tuning');
  assert.equal(t.status, 200);
  assert.ok(t.body.groups.tuning.length > 0);
});

test('fiabilidad: motores, averías con fuente, estado honesto y filtros', async () => {
  const { status, body } = await getJSON('/api/reliability');
  assert.equal(status, 200);
  assert.ok(body.stats.engines >= 6);
  assert.ok(body.stats.issues >= 20);
  assert.equal(body.results.length, body.stats.engines);

  const estados = new Set((body.statusLegend || []).map(s => s.id));
  assert.deepEqual([...estados].sort(), ['confirmada', 'hipotesis', 'reportada']);
  assert.ok(body.notice && /motor/i.test(body.notice), 'la base debe avisar de que los datos son por motor');

  for (const engine of body.results) {
    assert.ok(engine.id && engine.family && engine.brand && engine.years);
    assert.ok(engine.issuesTotal > 0, `${engine.id} debe tener averías`);
    assert.ok(engine.distribution?.type, `${engine.id} debe declarar distribución`);
    assert.ok(engine.reliability?.verdict, `${engine.id} debe declarar fiabilidad`);
  }

  const detail = await getJSON(`/api/reliability/${body.results[0].id}`);
  assert.equal(detail.status, 200);
  for (const issue of detail.body.issues) {
    assert.ok(estados.has(issue.status), `estado válido en ${issue.id}`);
    assert.ok(issue.title && issue.cause && issue.solution && issue.checks?.length, `${issue.id} debe ser accionable`);
    assert.ok(issue.cost?.typical, `${issue.id} debe declarar coste orientativo`);
    assert.ok((issue.sources || []).every(s => /^https:\/\//.test(s.url)), `${issue.id} solo admite fuentes https`);
  }
  assert.ok(detail.body.sources?.length > 0, 'el motor debe declarar sus fuentes');
  assert.equal((await getJSON('/api/reliability/no-existe')).status, 404);

  const renault = await getJSON('/api/reliability?brand=Renault');
  assert.ok(renault.body.results.length > 0);
  assert.ok(renault.body.results.every(e => /renault/i.test(e.brand)));

  const cadena = await getJSON('/api/reliability?q=cadena');
  assert.ok(cadena.body.results.length > 0);
  assert.ok(cadena.body.results.some(e => e.issuesTotal > 0));

  const soloConfirmadas = await getJSON('/api/reliability?status=confirmada');
  assert.ok(soloConfirmadas.body.results.every(e => e.issues.every(i => i.status === 'confirmada')));

  const buscador = await getJSON('/api/search?q=cadena');
  assert.equal(buscador.status, 200);
  assert.ok(buscador.body.groups.reliability.length > 0);
  assert.ok(buscador.body.groups.reliability.every(x => x.type === 'reliability' && x.id && x.title));
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

test('cuenta: eliminar exige confirmación, borra usuario y cierra sesión', async () => {
  const username = `borrame_${Date.now().toString().slice(-8)}`;
  const created = await forumRequest('/api/forum/auth/register', {
    method: 'POST',
    body: { username, displayName: 'Cuenta de prueba', password: 'clave-segura-123' }
  });
  assert.equal(created.status, 201);
  const cookie = created.cookie;
  assert.ok(cookie.startsWith('dym_forum_session='));

  const vehicle = await forumRequest('/api/garage/vehicles', {
    method: 'POST', cookie,
    body: { brand: 'Seat', model: 'Ibiza', version: '1.0 TSI', year: 2019, mileage: 60000 }
  });
  assert.equal(vehicle.status, 201);
  const photo = await forumRequest(`/api/garage/vehicles/${vehicle.body.vehicle.id}/photo`, {
    method: 'POST', cookie,
    body: { data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=' }
  });
  assert.equal(photo.status, 200);

  const bad = await forumRequest('/api/forum/auth/account', {
    method: 'DELETE', cookie, body: { confirm: 'NO' }
  });
  assert.equal(bad.status, 400);

  const deleted = await forumRequest('/api/forum/auth/account', {
    method: 'DELETE', cookie, body: { confirm: 'ELIMINAR' }
  });
  assert.equal(deleted.status, 200);
  assert.equal(deleted.body.ok, true);
  assert.equal(deleted.body.deleted, true);

  const me = await forumRequest('/api/forum/auth/me', { cookie });
  assert.equal(me.body.user, null);

  const login = await forumRequest('/api/forum/auth/login', {
    method: 'POST', body: { username, password: 'clave-segura-123' }
  });
  assert.equal(login.status, 401);
});
