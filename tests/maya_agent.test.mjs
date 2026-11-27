import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4126;
const BASE = `http://127.0.0.1:${PORT}`;
const AGENT_TOKEN = 'test-agent-token-0123456789';
const TEST_DIR = mkdtempSync(path.join(os.tmpdir(), 'dym-maya-agent-'));
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
  for (let i = 0; i < 60; i++) {
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

test('taller de agentes: el primer usuario es admin y el resto no', async () => {
  const admin = await request('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'agenteadmin', displayName: 'Admin Agentes', password: 'claveSegura123' }
  });
  assert.equal(admin.status, 201);
  adminCookie = admin.cookie;

  const user = await request('/api/forum/auth/register', {
    method: 'POST',
    body: { username: 'agenteuser', displayName: 'Usuario Agentes', password: 'claveSegura456' }
  });
  assert.equal(user.status, 201);
  userCookie = user.cookie;

  const adminMe = await request('/api/maya-agent/me', { cookie: adminCookie });
  assert.equal(adminMe.status, 200);
  assert.equal(adminMe.body.admin, true);
  assert.equal(adminMe.body.workerConfigured, true);

  const userMe = await request('/api/maya-agent/me', { cookie: userCookie });
  assert.equal(userMe.body.admin, false);
  assert.equal(userMe.body.stats, null);
});

test('taller de agentes: solo el admin encola órdenes', async () => {
  const anonymous = await request('/api/maya-agent/tasks', {
    method: 'POST', body: { instruction: 'Arregla el botón de parar de la ruta' }
  });
  assert.equal(anonymous.status, 401);

  const denied = await request('/api/maya-agent/tasks', {
    method: 'POST', cookie: userCookie, body: { instruction: 'Arregla el botón de parar de la ruta' }
  });
  assert.equal(denied.status, 403);

  const created = await request('/api/maya-agent/tasks', {
    method: 'POST', cookie: adminCookie, body: { instruction: 'Arregla el botón de parar de la ruta' }
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.task.status, 'pending');
  assert.ok(created.body.task.id >= 1);

  const listed = await request('/api/maya-agent/tasks', { cookie: adminCookie });
  assert.equal(listed.status, 200);
  assert.ok(listed.body.tasks.some(task => task.id === created.body.task.id));
  assert.equal(listed.body.stats.pending, 1);
});

test('taller de agentes: el worker necesita token y cierra la orden', async () => {
  const noToken = await request('/api/maya-agent/next', { method: 'POST' });
  assert.equal(noToken.status, 401);

  const wrongToken = await request('/api/maya-agent/next', {
    method: 'POST', headers: { 'x-agent-token': 'token-incorrecto-123456' }
  });
  assert.equal(wrongToken.status, 401);

  const claim = await request('/api/maya-agent/next', {
    method: 'POST', headers: { 'x-agent-token': AGENT_TOKEN }
  });
  assert.equal(claim.status, 200);
  assert.ok(claim.body.task);
  assert.equal(claim.body.task.status, 'running');

  const progress = await request(`/api/maya-agent/tasks/${claim.body.task.id}/progress`, {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN },
    body: { message: 'OpenCode está trabajando…' }
  });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.task.progress, 'OpenCode está trabajando…');

  const empty = await request('/api/maya-agent/next', {
    method: 'POST', headers: { 'x-agent-token': AGENT_TOKEN }
  });
  assert.equal(empty.body.task, null);

  const closed = await request(`/api/maya-agent/tasks/${claim.body.task.id}/result`, {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN },
    body: { status: 'done', summary: 'Arreglado y probado', commit: 'abc1234', pushed: true }
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.task.status, 'done');
  assert.equal(closed.body.task.commit, 'abc1234');
  assert.equal(closed.body.task.pushed, true);
});

test('Maya solo acepta órdenes de agente desde la cuenta admin', async () => {
  const denied = await request('/api/chat', {
    method: 'POST', cookie: userCookie, body: { message: 'agente: arregla el modo 3D' }
  });
  assert.equal(denied.status, 403);

  const accepted = await request('/api/chat', {
    method: 'POST', cookie: adminCookie, body: { message: 'agente: arregla el modo 3D' }
  });
  assert.equal(accepted.status, 200);
  assert.ok(accepted.body.agent_task);
  assert.equal(accepted.body.agent_task.status, 'pending');

  const status = await request('/api/chat', {
    method: 'POST', cookie: adminCookie, body: { message: 'estado agentes' }
  });
  assert.equal(status.status, 200);
  assert.ok(Array.isArray(status.body.agent_tasks));
  assert.ok(status.body.agent_tasks.some(task => task.id === accepted.body.agent_task.id));
});

test('el worker recoge la orden por long-poll y publica el progreso', async () => {
  const created = await request('/api/maya-agent/tasks', {
    method: 'POST', cookie: adminCookie, body: { instruction: 'Revisa el aviso de GPS sin señal' }
  });
  assert.equal(created.status, 201);

  const wait = await request('/api/maya-agent/wait', {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN },
    body: { timeoutMs: 2500 }
  });
  assert.equal(wait.status, 200);
  assert.ok(wait.body.task);
  assert.equal(wait.body.task.status, 'running');

  const progress = await request(`/api/maya-agent/tasks/${wait.body.task.id}/progress`, {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN },
    body: { message: 'Pasando las pruebas…' }
  });
  assert.equal(progress.status, 200);
  assert.equal(progress.body.task.progress, 'Pasando las pruebas…');

  const closed = await request(`/api/maya-agent/tasks/${wait.body.task.id}/result`, {
    method: 'POST',
    headers: { 'x-agent-token': AGENT_TOKEN },
    body: { status: 'done', summary: 'Comprobado', pushed: false }
  });
  assert.equal(closed.status, 200);
  assert.equal(closed.body.task.progress, '');
});
