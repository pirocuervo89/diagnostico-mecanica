import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4137;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-proteccion-api-'));

let server;

async function waitForHealth(retries = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch { /* arrancando */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('El servidor no arrancó a tiempo');
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function call(url, { method = 'GET', body, cookie = '' } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    type,
    body: type.includes('application/json') ? await response.json().catch(() => null) : await response.text(),
    cookie: cookieFrom(response)
  };
}

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      FORUM_DB_PATH: path.join(TMP, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TMP, 'forum-uploads'),
      GARAGE_UPLOAD_DIR: path.join(TMP, 'garage-uploads'),
      TUTORIAL_DB_PATH: path.join(TMP, 'tutorials.sqlite'),
      AI_PROVIDER: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      MISTRAL_API_KEY: '', CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      WEB_SEARCH_ENABLED: '0',
      STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.resume();
  server.stderr.resume();
  await waitForHealth();
});

after(async () => {
  if (server) {
    server.kill('SIGTERM');
    await new Promise(resolve => server.once('exit', resolve));
  }
  rmSync(TMP, { recursive: true, force: true });
});

test('la página del protector se sirve como HTML limpio', async () => {
  const response = await fetch(`${BASE}/proteccion`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /text\/html/);
  const html = await response.text();
  assert.match(html, /Protector del conductor/);
  assert.match(html, /\/js\/proteccion\.js/);
});

test('la segunda opinión revisa un presupuesto por texto', async () => {
  const response = await call('/api/proteccion/presupuesto', {
    method: 'POST',
    body: {
      text: `Cambio de aceite y filtro 95 €
Pastillas delanteras 140 €
Mano de obra 2 h x 55 €/h 110 €
IVA 21% 72 €
Total 420 €`
    }
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.review.parsed.total, 420);
  assert.equal(response.body.review.verdict.id, 'justo');
  assert.equal(response.body.meta.method, 'texto_manual');
  assert.ok(response.body.review.questions.length >= 5);
});

test('la segunda opinión rechaza cuerpos vacíos', async () => {
  const response = await call('/api/proteccion/presupuesto', { method: 'POST', body: {} });
  assert.equal(response.status, 400);
  assert.match(response.body.error, /presupuesto|foto|PDF/);
});

test('el triaje distingue rojo de ámbar', async () => {
  const red = await call('/api/proteccion/triaje', { method: 'POST', body: { flags: ['frenos'] } });
  assert.equal(red.status, 200);
  assert.equal(red.body.level, 'rojo');
  assert.equal(red.body.canDrive, false);

  const amber = await call('/api/proteccion/triaje', { method: 'POST', body: { dtc: 'P0171' } });
  assert.equal(amber.status, 200);
  assert.equal(amber.body.level, 'ambar');
  assert.equal(amber.body.canDrive, true);
  assert.ok(amber.body.dtcs.some(code => code.code === 'P0171'));
});

test('la salud exige sesión y se calcula con el garaje real', async () => {
  const anonymous = await call('/api/proteccion/salud/1');
  assert.equal(anonymous.status, 401);

  const registration = await call('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'protectorapi', displayName: 'Protector API', password: 'clave-segura-123' }
  });
  assert.equal(registration.status, 201);
  assert.ok(registration.cookie);

  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie: registration.cookie,
    body: {
      brand: 'Seat',
      model: 'León',
      version: '1.4 TSI',
      year: 2018,
      plate: '1234ABC',
      vin: 'VSSZZZ5FZJR000001',
      firstRegistration: '2018-05-01',
      mileage: 120000
    }
  });
  assert.equal(created.status, 201);
  const vehicleId = created.body.vehicle.id;

  const event = await call(`/api/garage/vehicles/${vehicleId}/events`, {
    method: 'POST',
    cookie: registration.cookie,
    body: {
      kind: 'mantenimiento',
      item: 'aceite',
      title: 'Cambio de aceite y filtro',
      date: '2025-01-01',
      mileage: 100000,
      cost: 90
    }
  });
  assert.equal(event.status, 201);

  const health = await call(`/api/proteccion/salud/${vehicleId}`, { cookie: registration.cookie });
  assert.equal(health.status, 200);
  assert.equal(health.body.ok, true);
  assert.equal(health.body.systems.length, 5);
  assert.ok(health.body.score >= 0 && health.body.score <= 100);
  assert.ok(health.body.timeline.some(row => row.title.includes('aceite')));
  assert.ok(health.body.actions.length > 0);
});
