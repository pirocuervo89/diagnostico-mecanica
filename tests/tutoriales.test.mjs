import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4124;
const BASE = `http://127.0.0.1:${PORT}`;
const TUTORIAL_ID = 'yt-SExzL3icJTI';
const TEST_TUTORIAL_ID = 'yt-abc12345678';

let server;
let adminCookie = '';
let userCookie = '';
let playlistId = 0;
let reportId = 0;

const TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'dym-tutorials-test-'));
const FORUM_DB = path.join(TEST_DIR, 'forum.sqlite');
const FORUM_UPLOADS = path.join(TEST_DIR, 'uploads');

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function request(url, { method = 'GET', body, cookie = '' } = {}) {
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
    cookie: cookieFrom(response)
  };
}

async function waitForHealth(retries = 40) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch { /* servidor aún arrancando */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('El servidor no arrancó a tiempo');
}

function startServer() {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      GEMINI_API_KEY: '',
      YOUTUBE_API_KEY: '',
      FORUM_DB_PATH: FORUM_DB,
      FORUM_UPLOAD_DIR: FORUM_UPLOADS
    },
    stdio: 'ignore'
  });
  return waitForHealth();
}

async function stopServer() {
  if (!server) return;
  const processToStop = server;
  server = null;
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      processToStop.kill('SIGKILL');
      resolve();
    }, 2500);
    processToStop.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    processToStop.kill('SIGTERM');
  });
}

before(async () => {
  await startServer();
});

after(async () => {
  await stopServer();
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* archivos aún abiertos */ }
});

test('tutoriales: metadatos, categorías y semilla verificada', async () => {
  const { status, body } = await request('/api/tutorials/meta');
  assert.equal(status, 200);
  assert.equal(body.categories.length, 20);
  assert.equal(body.stats.total, 193);
  assert.ok(body.stats.subcategories >= 50);
  assert.ok(body.stats.durationSeconds > 0);
  assert.ok(body.stats.byLanguage.some(item => item.language === 'es'));
  assert.ok(body.stats.byVehicleType.some(item => item.vehicleType === 'coche'));
  assert.equal(body.providerStatus.youtubeApi, false);
  assert.ok(body.providers.some(provider => provider.id === 'youtube'));
});

test('tutoriales: búsqueda por DTC y filtros combinados', async () => {
  const search = await request('/api/tutorials?q=P0299&embeddable=1&limit=6');
  assert.equal(search.status, 200);
  assert.ok(search.body.total >= 1);
  assert.ok(search.body.items.some(item => item.dtcs.includes('P0299')));

  const filtered = await request('/api/tutorials?category=electricidad&subcategory=alternador&language=es&embeddable=1&limit=10');
  assert.equal(filtered.status, 200);
  assert.ok(filtered.body.total >= 1);
  assert.ok(filtered.body.items.every(item => item.categoryId === 'electricidad'));
  assert.ok(filtered.body.items.every(item => item.subcategoryId === 'alternador'));
  assert.ok(filtered.body.items.every(item => item.language === 'es'));

  const accentless = await request('/api/tutorials?q=inyeccion&limit=5');
  assert.equal(accentless.status, 200);
  assert.ok(accentless.body.total >= 1);
});

test('tutoriales: paginación sin repetir resultados', async () => {
  const first = await request('/api/tutorials?limit=5&offset=0&sort=title');
  const second = await request('/api/tutorials?limit=5&offset=5&sort=title');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.items.length, 5);
  assert.equal(second.body.items.length, 5);
  assert.equal(first.body.hasMore, true);
  const firstIds = new Set(first.body.items.map(item => item.id));
  assert.ok(second.body.items.every(item => !firstIds.has(item.id)));
});

test('tutoriales: sugerencias y ficha con relacionados', async () => {
  const suggestions = await request('/api/tutorials/suggestions?q=alternador&limit=5');
  assert.equal(suggestions.status, 200);
  assert.ok(suggestions.body.items.length >= 1);
  assert.ok(suggestions.body.items.every(item => item.id && item.title));

  const detail = await request(`/api/tutorials/${TUTORIAL_ID}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tutorial.id, TUTORIAL_ID);
  assert.equal(detail.body.tutorial.verificationStatus, 'verified');
  assert.ok(Array.isArray(detail.body.related));
});

test('tutoriales: visita anónima y visita autenticada con historial', async () => {
  const anonymous = await request(`/api/tutorials/${TUTORIAL_ID}/view`, { method: 'POST' });
  assert.equal(anonymous.status, 200);
  assert.ok(anonymous.body.localViews >= 1);

  const admin = await request('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'tutorial_admin', displayName: 'Admin Tutoriales', password: 'claveSegura123' }
  });
  assert.equal(admin.status, 201);
  adminCookie = admin.cookie;

  const user = await request('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'tutorial_user', displayName: 'Usuario Tutoriales', password: 'claveSegura456' }
  });
  assert.equal(user.status, 201);
  userCookie = user.cookie;

  const authenticated = await request(`/api/tutorials/${TUTORIAL_ID}/view`, { method: 'POST', cookie: userCookie });
  assert.equal(authenticated.status, 200);
  assert.ok(authenticated.body.localViews >= 2);

  const library = await request('/api/tutorials/library', { cookie: userCookie });
  assert.equal(library.status, 200);
  assert.ok(library.body.history.items.some(item => item.id === TUTORIAL_ID));
});

test('tutoriales: favoritos requieren sesión y se sincronizan', async () => {
  const denied = await request(`/api/tutorials/${TUTORIAL_ID}/favorite`, { method: 'POST' });
  assert.equal(denied.status, 401);

  const added = await request(`/api/tutorials/${TUTORIAL_ID}/favorite`, { method: 'POST', cookie: userCookie });
  assert.equal(added.status, 200);
  assert.equal(added.body.favorite, true);

  const library = await request('/api/tutorials/library', { cookie: userCookie });
  assert.ok(library.body.favorites.items.some(item => item.id === TUTORIAL_ID));

  const removed = await request(`/api/tutorials/${TUTORIAL_ID}/favorite`, { method: 'POST', cookie: userCookie });
  assert.equal(removed.body.favorite, false);
});

test('tutoriales: listas privadas y elementos', async () => {
  const created = await request('/api/tutorials/playlists', {
    method: 'POST', cookie: userCookie, body: { name: 'Diagnóstico diésel' }
  });
  assert.equal(created.status, 201);
  playlistId = created.body.id;

  const added = await request(`/api/tutorials/playlists/${playlistId}/items`, {
    method: 'POST', cookie: userCookie, body: { tutorialId: TUTORIAL_ID }
  });
  assert.equal(added.status, 201);
  assert.ok(added.body.items.some(item => item.id === TUTORIAL_ID));

  const library = await request('/api/tutorials/library', { cookie: userCookie });
  assert.ok(library.body.playlists.some(item => item.id === playlistId && item.itemCount === 1));

  const removed = await request(`/api/tutorials/playlists/${playlistId}/items/${TUTORIAL_ID}`, {
    method: 'DELETE', cookie: userCookie
  });
  assert.equal(removed.status, 200);

  const deleted = await request(`/api/tutorials/playlists/${playlistId}`, {
    method: 'DELETE', cookie: userCookie
  });
  assert.equal(deleted.status, 200);
});

test('tutoriales: avisos, permisos y moderación', async () => {
  const invalid = await request(`/api/tutorials/${TUTORIAL_ID}/report`, {
    method: 'POST', cookie: userCookie, body: { reason: 'inventado' }
  });
  assert.equal(invalid.status, 400);

  const report = await request(`/api/tutorials/${TUTORIAL_ID}/report`, {
    method: 'POST', cookie: userCookie, body: { reason: 'enlace-roto', detail: 'Prueba automatizada' }
  });
  assert.equal(report.status, 201);
  reportId = report.body.id;

  const duplicate = await request(`/api/tutorials/${TUTORIAL_ID}/report`, {
    method: 'POST', cookie: userCookie, body: { reason: 'enlace-roto' }
  });
  assert.equal(duplicate.status, 409);

  const denied = await request('/api/tutorials/admin/reports', { cookie: userCookie });
  assert.equal(denied.status, 403);

  const queue = await request('/api/tutorials/admin/reports', { cookie: adminCookie });
  assert.equal(queue.status, 200);
  assert.ok(queue.body.reports.some(item => item.id === reportId));

  const resolved = await request(`/api/tutorials/admin/reports/${reportId}`, {
    method: 'PATCH', cookie: adminCookie, body: { action: 'descartar' }
  });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'descartado');
});

test('tutoriales: importación solo para admin y validación de categorías', async () => {
  const denied = await request('/api/tutorials/admin/import', {
    method: 'POST', cookie: userCookie, body: { videos: [] }
  });
  assert.equal(denied.status, 403);

  const invalid = await request('/api/tutorials/admin/import', {
    method: 'POST', cookie: adminCookie,
    body: { videos: [{ id: TEST_TUTORIAL_ID, title: 'Vídeo inválido', categoryId: 'no-existe', subcategoryId: 'tampoco' }] }
  });
  assert.equal(invalid.status, 201);
  assert.equal(invalid.body.imported, 0);
  assert.equal(invalid.body.errors.length, 1);

  const valid = await request('/api/tutorials/admin/import', {
    method: 'POST', cookie: adminCookie,
    body: {
      videos: [{
        id: TEST_TUTORIAL_ID,
        videoId: 'abc12345678',
        title: 'Comprobación de alternador con multímetro',
        categoryId: 'electricidad',
        subcategoryId: 'alternador',
        language: 'es',
        languageLabel: 'Español',
        level: 'principiante',
        sourceType: 'educational',
        vehicleType: 'coche',
        verificationStatus: 'verified',
        verificationSource: 'Prueba automatizada'
      }]
    }
  });
  assert.equal(valid.status, 201);
  assert.equal(valid.body.imported, 1);

  const detail = await request(`/api/tutorials/${TEST_TUTORIAL_ID}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tutorial.categoryName, 'Electricidad y electrónica');
  assert.equal(detail.body.tutorial.subcategoryName, 'Alternador y sistema de carga');

  const updated = await request('/api/tutorials/admin/import', {
    method: 'POST', cookie: adminCookie,
    body: {
      videos: [{
        id: TEST_TUTORIAL_ID,
        videoId: 'abc12345678',
        title: 'Comprobación de alternador con multímetro (actualizado)',
        categoryId: 'electricidad',
        subcategoryId: 'alternador',
        language: 'es',
        languageLabel: 'Español',
        level: 'principiante',
        sourceType: 'educational',
        vehicleType: 'coche',
        verificationStatus: 'verified',
        verificationSource: 'Prueba automatizada'
      }]
    }
  });
  assert.equal(updated.status, 201);
  assert.equal(updated.body.imported, 1);

  const stats = await request('/api/tutorials/stats');
  assert.equal(stats.body.total, 194);
  const refreshed = await request(`/api/tutorials/${TEST_TUTORIAL_ID}`);
  assert.equal(refreshed.body.tutorial.title, 'Comprobación de alternador con multímetro (actualizado)');
});

test('tutoriales: ocultar y restaurar un vídeo desde moderación', async () => {
  const hidden = await request(`/api/tutorials/admin/tutorials/${TEST_TUTORIAL_ID}/visibility`, {
    method: 'POST', cookie: adminCookie, body: { hidden: true, reason: 'Prueba de moderación' }
  });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.body.hidden, true);

  const publicView = await request(`/api/tutorials/${TEST_TUTORIAL_ID}`);
  assert.equal(publicView.status, 404);

  const adminView = await request(`/api/tutorials/${TEST_TUTORIAL_ID}`, { cookie: adminCookie });
  assert.equal(adminView.status, 200);
  assert.equal(adminView.body.tutorial.isHidden, true);

  const restored = await request(`/api/tutorials/admin/tutorials/${TEST_TUTORIAL_ID}/visibility`, {
    method: 'POST', cookie: adminCookie, body: { hidden: false }
  });
  assert.equal(restored.status, 200);
  assert.equal(restored.body.hidden, false);
});

test('tutoriales: persistencia de la base de datos tras reiniciar', async () => {
  await stopServer();
  await startServer();
  const detail = await request(`/api/tutorials/${TEST_TUTORIAL_ID}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.tutorial.id, TEST_TUTORIAL_ID);
  assert.equal(detail.body.tutorial.title, 'Comprobación de alternador con multímetro (actualizado)');
  const stats = await request('/api/tutorials/stats');
  assert.equal(stats.body.total, 194);
});
