import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4135;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-webhook-test-'));
const ORDERS = path.join(TMP, 'orders.json');
const SECRET = 'whsec_test_secreto_local';
const TOKEN = 'tokenwebhook789';
const ORDER_ID = 'INF-WEBHOOK';
const SESSION_ID = 'cs_test_webhook';

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

before(async () => {
  writeFileSync(ORDERS, JSON.stringify([{
    id: ORDER_ID,
    token: TOKEN,
    paid: false,
    createdAt: '2026-11-05T12:00:00.000Z',
    paidAt: null,
    amount: 490,
    currency: 'eur',
    email: '',
    report: { brand: 'Ford', model: 'Focus 1.5 TDCi', year: '2017', engine: 'XWDB', km: '120000', dtc: 'P2002', symptoms: 'Aviso de DPF.' },
    sessionId: SESSION_ID
  }], null, 1));

  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STRIPE_SECRET_KEY: 'sk_test_clave_local_para_pruebas',
      STRIPE_WEBHOOK_SECRET: SECRET,
      REPORT_ORDERS_PATH: ORDERS,
      AI_PROVIDER: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      MISTRAL_API_KEY: '', CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      FORUM_DB_PATH: path.join(TMP, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TMP, 'forum-uploads'),
      GARAGE_UPLOAD_DIR: path.join(TMP, 'garage-uploads'),
      TUTORIAL_DB_PATH: path.join(TMP, 'tutorials.sqlite')
    },
    stdio: 'ignore'
  });
  await waitForHealth();
});

after(() => {
  server?.kill();
  rmSync(TMP, { recursive: true, force: true });
});

function signedEvent(payload) {
  return Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
}

test('webhook: la pasarela declara clave y secreto configurados', async () => {
  const status = await fetch(`${BASE}/api/payments/status`).then(r => r.json());
  assert.equal(status.configured, true);
  assert.equal(status.webhookConfigured, true);
  assert.equal(status.mode, 'test');
  assert.deepEqual(status.missing, []);
});

test('webhook: firma inválida no marca el pedido como pagado', async () => {
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: SESSION_ID, client_reference_id: ORDER_ID, payment_status: 'paid' } } });
  const response = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': 't=1,v1=firmafalsa' },
    body: payload
  });
  assert.equal(response.status, 400);

  const report = await fetch(`${BASE}/api/payments/report/${TOKEN}`);
  assert.equal(report.status, 402);
});

test('webhook: evento firmado y pagado desbloquea el informe', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: { object: { id: SESSION_ID, client_reference_id: ORDER_ID, payment_status: 'paid' } }
  });
  const response = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signedEvent(payload) },
    body: payload
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true });

  const report = await fetch(`${BASE}/api/payments/report/${TOKEN}`);
  assert.equal(report.status, 200);
  assert.match(await report.text(), /Ford/);
});

test('webhook: el mismo evento dos veces es idempotente', async () => {
  const payload = JSON.stringify({
    id: 'evt_test_1',
    type: 'checkout.session.completed',
    data: { object: { id: SESSION_ID, client_reference_id: ORDER_ID, payment_status: 'paid' } }
  });
  const response = await fetch(`${BASE}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'stripe-signature': signedEvent(payload) },
    body: payload
  });
  assert.equal(response.status, 200);
  const report = await fetch(`${BASE}/api/payments/report/${TOKEN}`);
  assert.equal(report.status, 200);
});
