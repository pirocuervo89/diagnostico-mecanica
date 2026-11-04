import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4132;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-testigos-test-'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let server;

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* arrancando */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('El servidor no arrancó a tiempo');
}

async function call(url, { method = 'GET', body } = {}) {
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    body: type.includes('application/json') ? await response.json().catch(() => null) : null
  };
}

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      AI_PROVIDER: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      MISTRAL_API_KEY: '', CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      FORUM_DB_PATH: path.join(TMP, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TMP, 'forum-uploads'),
      GARAGE_UPLOAD_DIR: path.join(TMP, 'garage-uploads')
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

after(() => {
  server?.kill();
  rmSync(TMP, { recursive: true, force: true });
});

test('testigos: catálogo con fichas completas y filtros', async () => {
  const catalog = await call('/api/testigos');
  assert.equal(catalog.status, 200);
  assert.ok(catalog.body.items.length >= 18, 'debe haber al menos 18 testigos');
  assert.equal(catalog.body.total, catalog.body.items.length);
  for (const item of catalog.body.items) {
    assert.ok(item.id && item.name && item.system && item.glyph);
    assert.ok(['rojo', 'amarillo', 'verde', 'azul', 'blanco'].includes(item.color));
    assert.ok(['critico', 'grave', 'precaucion', 'informativo'].includes(item.severity));
    assert.ok(item.severityLabel);
  }

  const red = await call('/api/testigos?color=rojo');
  assert.ok(red.body.items.length > 0);
  assert.ok(red.body.items.every(item => item.color === 'rojo'));

  const critical = await call('/api/testigos?severity=critico');
  assert.ok(critical.body.items.every(item => item.severity === 'critico'));

  const search = await call('/api/testigos?q=aceite');
  assert.ok(search.body.items.some(item => item.id === 'presion-aceite'));
});

test('testigos: la ficha trae las doce secciones y fuentes https', async () => {
  const detail = await call('/api/testigos/presion-aceite');
  assert.equal(detail.status, 200);
  const light = detail.body;
  for (const key of ['name', 'severity', 'meaning', 'driverText', 'technicalText', 'drivingRisk', 'system']) {
    assert.ok(light[key], `falta ${key}`);
  }
  for (const key of ['causes', 'relatedFaults', 'symptoms', 'checks', 'solutions']) {
    assert.ok(Array.isArray(light[key]) && light[key].length > 0, `falta ${key}`);
  }
  assert.ok(light.sources.length >= 2);
  assert.ok(light.sources.every(source => /^https:\/\//.test(source.url)));
  assert.equal(light.severity, 'critico');
  assert.equal(light.actNow, true);
  assert.ok(light.imageNote, 'debe aclarar que el símbolo no es una foto');

  const missing = await call('/api/testigos/no-existe');
  assert.equal(missing.status, 404);
});

test('testigos: estadísticas y aviso de visión', async () => {
  const stats = await call('/api/testigos/stats');
  assert.equal(stats.status, 200);
  assert.ok(stats.body.lights >= 18);
  assert.equal(stats.body.severities.length, 4);
  assert.equal(typeof stats.body.vision.available, 'boolean');
  assert.equal(stats.body.vision.available, false, 'sin claves no hay visión');
});

test('testigos: sin foto ni pistas no identifica y pide datos', async () => {
  const result = await call('/api/testigos/analizar', { method: 'POST', body: {} });
  assert.equal(result.status, 200);
  assert.equal(result.body.identified, false);
  assert.ok(result.body.needs.includes('color'));
  assert.ok(Array.isArray(result.body.candidates));
  assert.match(result.body.note, /sin fotograf|indica el color/i);
});

test('testigos: rechaza archivos que no son imagen', async () => {
  const bad = await call('/api/testigos/analizar', {
    method: 'POST',
    body: { dataUrl: 'data:text/plain;base64,QQ==' }
  });
  assert.equal(bad.status, 415);
});

test('testigos: foto sin proveedor de visión no inventa la identificación', async () => {
  const result = await call('/api/testigos/analizar', {
    method: 'POST',
    body: { dataUrl: `data:image/png;base64,${PNG}`, color: 'rojo', context: { brand: 'SEAT', model: 'León', year: '2019' } }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.identified, false);
  assert.match(result.body.note, /proveedor de IA con visión|no se identifica/i);
  assert.ok(result.body.candidates.every(item => item.color === 'rojo'));
});

test('testigos: la selección manual devuelve la ficha elegida', async () => {
  const result = await call('/api/testigos/analizar', {
    method: 'POST',
    body: { lightId: 'abs' }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.selected.id, 'abs');
  assert.match(result.body.selected.name, /ABS/);
  assert.equal(result.body.analysis, null);
});
