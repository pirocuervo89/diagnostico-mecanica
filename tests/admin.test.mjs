import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4127;
const BASE = `http://127.0.0.1:${PORT}`;
const AGENT_TOKEN = 'admin-panel-token-0123456789';
const TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'dym-admin-'));
let server;
let adminCookie = '';
let userCookie = '';

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.()[0] || response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function request(url, { method = 'GET', body, cookie = '', headers = {} } = {}) {
  const allHeaders = { ...headers };
  if (body !== undefined) allHeaders['Content-Type'] = 'application/json';
  if (cookie) allHeaders.Cookie = cookie;
  const response = await fetch(`${BASE}${url}`, {
    method,
    headers: allHeaders,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null), cookie: cookieFrom(response) };
}

async function waitForHealth() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch { /* aún arrancando */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('El servidor no arrancó a tiempo');
}

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'test',
      AI_PROVIDER: '',
      AI_API_KEY: '',
      GEMINI_API_KEY: '',
      YOUTUBE_API_KEY: '',
      FORUM_DB_PATH: path.join(TEST_DIR, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TEST_DIR, 'uploads'),
      GARAGE_DB_PATH: path.join(TEST_DIR, 'garage.sqlite'),
      TUTORIAL_DB_PATH: path.join(TEST_DIR, 'tutorials.sqlite'),
      MAYA_AGENT_DB_PATH: path.join(TEST_DIR, 'maya-agent.sqlite'),
      MAYA_AGENT_TOKEN: AGENT_TOKEN
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

after(async () => {
  if (server) {
    const proc = server;
    server = null;
    await new Promise(resolve => {
      const timer = setTimeout(() => { proc.kill('SIGKILL'); resolve(); }, 2500);
      proc.once('exit', () => { clearTimeout(timer); resolve(); });
      proc.kill('SIGTERM');
    });
  }
  rmSync(TEST_DIR, { recursive: true, force: true });
});

test('el acceso de administrador está cerrado hasta crear la primera cuenta', async () => {
  const status = await request('/api/admin/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.users, 0);
  assert.equal(status.body.admins, 0);
  assert.equal(status.body.setupOpen, true);
  assert.equal(status.body.admin, false);
  assert.equal(status.body.user, null);
  assert.equal(status.body.workerConfigured, true);
  assert.equal(status.body.stats, null);
});

test('el alta exige contraseñas iguales y crea la única cuenta admin', async () => {
  const mismatch = await request('/api/admin/setup', {
    method: 'POST',
    body: {
      username: 'jefe',
      displayName: 'Jefe del taller',
      password: 'claveSegura123',
      confirm: 'otraClave123'
    }
  });
  assert.equal(mismatch.status, 400);

  const tooShort = await request('/api/admin/setup', {
    method: 'POST',
    body: { username: 'jefe', displayName: 'Jefe', password: 'corta', confirm: 'corta' }
  });
  assert.equal(tooShort.status, 400);

  const created = await request('/api/admin/setup', {
    method: 'POST',
    body: {
      username: 'jefe',
      displayName: 'Jefe del taller',
      password: 'claveSegura123',
      confirm: 'claveSegura123'
    }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.user.username, 'jefe');
  assert.equal(created.body.user.role, 'admin');
  assert.ok(created.cookie.startsWith('dym_forum_session='));
  adminCookie = created.cookie;

  const status = await request('/api/admin/status', { cookie: adminCookie });
  assert.equal(status.body.users, 1);
  assert.equal(status.body.admins, 1);
  assert.equal(status.body.setupOpen, false);
  assert.equal(status.body.admin, true);
  assert.equal(status.body.user.role, 'admin');
  assert.equal(status.body.stats.pending, 0);

  const second = await request('/api/admin/setup', {
    method: 'POST',
    body: { username: 'otro', password: 'claveSegura456', confirm: 'claveSegura456' }
  });
  assert.equal(second.status, 409);
});

test('el login del panel rechaza cuentas normales y contraseñas malas', async () => {
  const normal = await request('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'mecanico', displayName: 'Mecánico', password: 'claveSegura456' }
  });
  assert.equal(normal.status, 201);
  assert.equal(normal.body.user.role, 'user');
  userCookie = normal.cookie;

  const denied = await request('/api/admin/login', {
    method: 'POST',
    body: { username: 'mecanico', password: 'claveSegura456' }
  });
  assert.equal(denied.status, 403);
  assert.equal(denied.cookie, '');

  const wrong = await request('/api/admin/login', {
    method: 'POST',
    body: { username: 'jefe', password: 'noEsLaClave' }
  });
  assert.equal(wrong.status, 401);

  const login = await request('/api/admin/login', {
    method: 'POST',
    body: { username: 'jefe', password: 'claveSegura123' }
  });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.role, 'admin');
  assert.ok(login.cookie.startsWith('dym_forum_session='));
  adminCookie = login.cookie;

  const nonAdminStatus = await request('/api/admin/status', { cookie: userCookie });
  assert.equal(nonAdminStatus.body.admin, false);
  assert.ok(nonAdminStatus.body.user);
  assert.equal(nonAdminStatus.body.user.role, 'user');
});

test('solo el admin del panel puede encolar y ver órdenes', async () => {
  const anonymous = await request('/api/maya-agent/tasks', {
    method: 'POST', body: { instruction: 'Arregla el aviso del modo 3D' }
  });
  assert.equal(anonymous.status, 401);

  const denied = await request('/api/maya-agent/tasks', {
    method: 'POST', cookie: userCookie, body: { instruction: 'Arregla el aviso del modo 3D' }
  });
  assert.equal(denied.status, 403);

  const created = await request('/api/maya-agent/tasks', {
    method: 'POST', cookie: adminCookie, body: { instruction: 'Arregla el aviso del modo 3D' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.status, 'pending');

  const status = await request('/api/admin/status', { cookie: adminCookie });
  assert.equal(status.body.admin, true);
  assert.equal(status.body.stats.pending, 1);
  assert.ok(status.body.tasks.some(task => task.id === created.body.task.id));

  const loggedOut = await request('/api/admin/logout', { method: 'POST', cookie: adminCookie });
  assert.equal(loggedOut.status, 200);
  const afterLogout = await request('/api/admin/status', { cookie: adminCookie });
  assert.equal(afterLogout.body.admin, false);
});
