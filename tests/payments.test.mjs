import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4134;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-payments-test-'));
const ORDERS = path.join(TMP, 'orders.json');

const PAID_TOKEN = 'tokenpagado123';
const UNPAID_TOKEN = 'tokenpendiente456';

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
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    headers: response.headers,
    body: contentType.includes('application/json') ? await response.json().catch(() => null) : await response.text()
  };
}

before(async () => {
  writeFileSync(ORDERS, JSON.stringify([
    {
      id: 'INF-PAGADO',
      token: PAID_TOKEN,
      paid: true,
      createdAt: '2026-11-05T10:00:00.000Z',
      paidAt: '2026-11-05T10:01:00.000Z',
      amount: 790,
      currency: 'eur',
      email: 'cliente@example.com',
      report: { brand: 'SEAT', model: 'León 1.6 TDI', year: '2016', engine: 'CAYC', km: '180000', dtc: 'P0401', symptoms: 'Pérdida de potencia y aviso de motor.' },
      sessionId: 'cs_test_pagado'
    },
    {
      id: 'INF-PENDIENTE',
      token: UNPAID_TOKEN,
      paid: false,
      createdAt: '2026-11-05T11:00:00.000Z',
      paidAt: null,
      amount: 790,
      currency: 'eur',
      email: '',
      report: { brand: 'VW', model: 'Golf', year: '2015', engine: 'CRLB', km: '', dtc: '', symptoms: '' },
      sessionId: 'cs_test_pendiente'
    }
  ], null, 1));

  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      STRIPE_SECRET_KEY: '',
      STRIPE_WEBHOOK_SECRET: '',
      REPORT_PRICE_CENTS: '790',
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

test('pagos: estado desactivado sin clave, con precio del entorno', async () => {
  const status = await call('/api/payments/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.provider, 'stripe');
  assert.equal(status.body.configured, false);
  assert.equal(status.body.webhookConfigured, false);
  assert.equal(status.body.amount, 790);
  assert.match(status.body.priceLabel, /7,90/);
  assert.equal(status.body.currency, 'eur');
  assert.ok(status.body.missing.includes('STRIPE_SECRET_KEY'));
});

test('pagos: comprar sin pasarela responde 503 y no crea pedido', async () => {
  const checkout = await call('/api/payments/checkout', {
    method: 'POST',
    body: { report: { brand: 'SEAT', model: 'León' } }
  });
  assert.equal(checkout.status, 503);
  assert.ok(checkout.body.missing.includes('STRIPE_SECRET_KEY'));
});

test('pagos: el webhook exige firma configurada', async () => {
  const webhook = await call('/api/payments/webhook', {
    method: 'POST',
    body: { type: 'checkout.session.completed' }
  });
  assert.equal(webhook.status, 503);
});

test('pagos: el informe pagado se descarga y el pendiente no', async () => {
  const paid = await call(`/api/payments/report/${PAID_TOKEN}`);
  assert.equal(paid.status, 200);
  assert.match(paid.headers.get('content-type') || '', /text\/html/);
  assert.equal(paid.headers.get('cache-control'), 'private, no-store');
  assert.match(paid.headers.get('x-robots-tag') || '', /noindex/);
  assert.match(paid.body, /SEAT/);
  assert.match(paid.body, /León 1\.6 TDI/);
  assert.match(paid.body, /INF-PAGADO/);

  const unpaid = await call(`/api/payments/report/${UNPAID_TOKEN}`);
  assert.equal(unpaid.status, 402);

  const missing = await call('/api/payments/report/no-existe');
  assert.equal(missing.status, 404);
});

test('pagos: la sesión de Stripe no está disponible sin clave', async () => {
  const session = await call('/api/payments/session/cs_test_pagado');
  assert.equal(session.status, 503);
});
