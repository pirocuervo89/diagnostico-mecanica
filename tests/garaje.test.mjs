import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4131;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-garaje-test-'));
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');

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
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    type: contentType,
    body: contentType.includes('application/json') ? await response.json().catch(() => null) : null,
    cookie: cookieFrom(response)
  };
}

async function registerUser(name) {
  const response = await call('/api/forum/auth/register', {
    method: 'POST',
    body: { username: name, displayName: name, password: 'clave-segura-123' }
  });
  assert.equal(response.status, 201);
  return response.cookie;
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

test('garaje: exige sesión para cualquier operación', async () => {
  const status = await call('/api/garage/status');
  assert.equal(status.status, 401);
  const vehicles = await call('/api/garage/vehicles');
  assert.equal(vehicles.status, 401);
  const detail = await call('/api/garage/vehicles/1');
  assert.equal(detail.status, 401);
});

test('garaje: alta de vehículo, validaciones y foto privada', async () => {
  const cookie = await registerUser('garaje_uno');
  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: {
      brand: 'Volkswagen', model: 'Golf', version: '2.0 TDI 150 CV', year: 2016,
      plate: '1234 ABC', vin: 'WVWZZZAUZJW123456', engineCode: 'CRLB',
      displacementCc: 1968, powerPs: 150, fuel: 'Diésel', seats: 5, massKg: 1385,
      firstRegistration: '2016-05-12', mileage: 142000
    }
  });
  assert.equal(created.status, 201);
  const vehicle = created.body.vehicle;
  assert.equal(vehicle.brand, 'Volkswagen');
  assert.equal(vehicle.plate, '1234ABC');
  assert.equal(vehicle.firstRegistration, '2016-05-12');
  assert.equal(vehicle.mileage, 142000);

  const invalid = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: { brand: 'Seat', model: 'León', vin: 'XXX' }
  });
  assert.equal(invalid.status, 400);

  const photo = await call(`/api/garage/vehicles/${vehicle.id}/photo`, {
    method: 'POST',
    cookie,
    body: { data: `data:image/png;base64,${PNG}` }
  });
  assert.equal(photo.status, 200);
  assert.equal(photo.body.vehicle.hasPhoto, true);

  const file = await fetch(`${BASE}/api/garage/vehicles/${vehicle.id}/photo`, { headers: { Cookie: cookie } });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') || '', /image\/png/);
  assert.match(file.headers.get('cache-control') || '', /no-store/);
});

test('garaje: mantenimiento documentado del motor enlazado', async () => {
  const cookie = await registerUser('garaje_dos');
  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: {
      brand: 'SEAT', model: 'León', version: '1.6 TDI', year: 2011,
      engineCode: 'CAYC', displacementCc: 1598, fuel: 'Diésel'
    }
  });
  const detail = await call(`/api/garage/vehicles/${created.body.vehicle.id}`, { cookie });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.vehicle.guide.matched, 'debe enlazar el motor documentado');
  assert.equal(detail.body.vehicle.guide.matched.confidence, 'codigo_motor');
  assert.ok(detail.body.vehicle.guide.items.length >= 3);
  assert.ok(detail.body.vehicle.guide.items.every(item => item.interval));
  assert.ok(detail.body.vehicle.guide.items.some(item => (item.sources || []).length > 0));
  assert.ok(detail.body.aiContext.garage);

  // Un código no documentado no debe heredar los intervalos de otra familia por
  // coincidir marca y cilindrada: CRLB es EA288, no EA189.
  const otherCode = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: {
      brand: 'Volkswagen', model: 'Golf', version: '2.0 TDI 150 CV', year: 2016,
      engineCode: 'CRLB', displacementCc: 1968, fuel: 'Diésel'
    }
  });
  const otherDetail = await call(`/api/garage/vehicles/${otherCode.body.vehicle.id}`, { cookie });
  assert.equal(otherDetail.body.vehicle.guide.matched, null);
  assert.match(otherDetail.body.vehicle.guide.note, /CRLB/);
  assert.equal(otherDetail.body.vehicle.guide.items.length, 0);

  const unmatched = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: { brand: 'Marca', model: 'Rara', version: '1.0', year: 2020 }
  });
  const unmatchedDetail = await call(`/api/garage/vehicles/${unmatched.body.vehicle.id}`, { cookie });
  assert.equal(unmatchedDetail.body.vehicle.guide.matched, null);
  assert.match(unmatchedDetail.body.vehicle.guide.note, /no está todavía/i);
});

test('garaje: mantenimiento con aviso, historial y documento privado', async () => {
  const cookie = await registerUser('garaje_tres');
  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: { brand: 'Peugeot', model: '308', version: '1.6 HDi', year: 2013, mileage: 180000 }
  });
  const id = created.body.vehicle.id;

  const event = await call(`/api/garage/vehicles/${id}/events`, {
    method: 'POST',
    cookie,
    body: {
      kind: 'mantenimiento', title: 'Cambio de aceite y filtro', item: 'aceite',
      date: '2026-09-01', mileage: 179000, cost: 95.5,
      description: 'Aceite 5W-30 y filtro original', nextDate: '2027-09-01', nextMileage: 190000
    }
  });
  assert.equal(event.status, 201);
  assert.equal(event.body.event.cost, 95.5);
  assert.equal(event.body.event.itemLabel, 'Aceite y filtro de aceite');

  const issue = await call(`/api/garage/vehicles/${id}/events`, {
    method: 'POST',
    cookie,
    body: {
      kind: 'averia', title: 'Testigo de motor encendido', date: '2026-10-01', mileage: 180000,
      dtc: 'p0401', cause: 'EGR obstruida', checks: 'Lectura de DTC y prueba de vacío'
    }
  });
  assert.equal(issue.status, 201);
  assert.equal(issue.body.event.dtc, 'P0401');

  const nearAlert = await call(`/api/garage/vehicles/${id}/events`, {
    method: 'POST',
    cookie,
    body: {
      kind: 'mantenimiento', title: 'Neumáticos delanteros', item: 'neumaticos',
      date: '2026-10-20', mileage: 180000, cost: 210, nextMileage: 180500
    }
  });
  assert.equal(nearAlert.status, 201);

  const detail = await call(`/api/garage/vehicles/${id}`, { cookie });
  assert.equal(detail.body.vehicle.events.length, 3);
  assert.equal(detail.body.vehicle.stats.spentTotal, 305.5);
  assert.ok(detail.body.vehicle.alerts.some(alert => alert.level === 'proximo'));

  const document = await call(`/api/garage/vehicles/${id}/documents`, {
    method: 'POST',
    cookie,
    body: { dataUrl: `data:application/pdf;base64,${PDF}`, name: 'factura.pdf', kind: 'factura' }
  });
  assert.equal(document.status, 201);
  assert.equal(document.body.document.kindLabel, 'Factura');

  const file = await fetch(`${BASE}/api/garage/documents/${document.body.document.id}`, { headers: { Cookie: cookie } });
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-type') || '', /application\/pdf/);

  const deletedEvent = await call(`/api/garage/events/${issue.body.event.id}`, { method: 'DELETE', cookie });
  assert.equal(deletedEvent.status, 200);
});

test('garaje: cada usuario solo ve lo suyo', async () => {
  const owner = await registerUser('garaje_dueno');
  const intruder = await registerUser('garaje_intruso');

  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie: owner,
    body: { brand: 'Renault', model: 'Clio', version: '1.5 dCi', year: 2015, mileage: 90000 }
  });
  const id = created.body.vehicle.id;
  await call(`/api/garage/vehicles/${id}/documents`, {
    method: 'POST',
    cookie: owner,
    body: { dataUrl: `data:application/pdf;base64,${PDF}`, name: 'ficha.pdf', kind: 'ficha_tecnica' }
  });

  const list = await call('/api/garage/vehicles', { cookie: intruder });
  assert.equal(list.body.vehicles.length, 0);

  const detail = await call(`/api/garage/vehicles/${id}`, { cookie: intruder });
  assert.equal(detail.status, 404);

  const photo = await call(`/api/garage/vehicles/${id}/photo`, { cookie: intruder });
  assert.equal(photo.status, 404);

  const doc = await call('/api/garage/documents/1', { cookie: intruder });
  assert.equal(doc.status, 404);

  const remove = await call(`/api/garage/vehicles/${id}`, { method: 'DELETE', cookie: intruder, body: { confirm: true } });
  assert.equal(remove.status, 404);
});

test('garaje: eliminar exige confirmación explícita', async () => {
  const cookie = await registerUser('garaje_borra');
  const created = await call('/api/garage/vehicles', {
    method: 'POST',
    cookie,
    body: { brand: 'Ford', model: 'Focus', version: '1.6 TDCi', year: 2012 }
  });
  const id = created.body.vehicle.id;

  const withoutConfirm = await call(`/api/garage/vehicles/${id}`, { method: 'DELETE', cookie, body: {} });
  assert.equal(withoutConfirm.status, 409);

  const confirmed = await call(`/api/garage/vehicles/${id}`, { method: 'DELETE', cookie, body: { confirm: true } });
  assert.equal(confirmed.status, 200);
  const after = await call(`/api/garage/vehicles/${id}`, { cookie });
  assert.equal(after.status, 404);
});

test('scanner: extrae matrícula, matriculación, plazas y masa de una ficha', async () => {
  const scan = await call('/api/vehicle/scan', {
    method: 'POST',
    body: {
      text: 'Marca: Volkswagen\nModelo: Golf\nAño: 2016\nMotorización: 2.0 TDI 150 CV\nMatrícula: 1234 ABC\nFecha de primera matriculación: 12/05/2016\nNúmero de plazas: 5\nMasa en orden de marcha: 1385 kg\nVIN: WVWZZZAUZJW123456'
    }
  });
  assert.equal(scan.status, 200);
  assert.equal(scan.body.extracted.plate.value, '1234ABC');
  assert.equal(scan.body.extracted.firstRegistration.value, '2016-05-12');
  assert.equal(scan.body.extracted.seats.value, 5);
  assert.equal(scan.body.extracted.massKg.value, 1385);
  assert.equal(scan.body.extracted.brand.value, 'Volkswagen');
});
