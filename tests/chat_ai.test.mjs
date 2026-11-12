import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import apiRouter from '../src/routes/api.js';
import { resetCooldown } from '../src/lib/ai_provider.js';

const AI_KEYS = [
  'AI_API_KEY', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'MISTRAL_API_KEY',
  'CEREBRAS_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY'
];

let server;
let base;

before(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  await new Promise(resolve => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise(resolve => server.close(resolve)));

async function postChat(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

test('/api/chat responde con el motor local al instante y sin red', async () => {
  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return originalFetch(url, options);
    networkCalls += 1;
    throw new Error('la ruta local no debe salir a la red');
  };
  try {
    const { status, body } = await postChat('/api/chat', {
      message: 'El motor hace un ruido metálico al acelerar y falta potencia',
      context: {}
    });

    assert.equal(status, 200);
    assert.equal(body.source, 'expert_rules');
    assert.equal(body.ai_pending, true);
    assert.ok(body.reply.length > 50);
    assert.ok(Array.isArray(body.forum_references));
    assert.ok(Array.isArray(body.productos_recomendados));
    assert.equal(networkCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('/api/chat/ai sin proveedores ni web devuelve el fallback local sin 500', async () => {
  const saved = {};
  for (const key of [...AI_KEYS, 'WEB_SEARCH_ENABLED', 'POLLINATIONS_ENABLED']) saved[key] = process.env[key];

  const originalFetch = globalThis.fetch;
  let networkCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (String(url).startsWith(base)) return originalFetch(url, options);
    networkCalls += 1;
    throw new Error('sin red en la prueba');
  };

  try {
    for (const key of AI_KEYS) delete process.env[key];
    process.env.WEB_SEARCH_ENABLED = '0';
    process.env.POLLINATIONS_ENABLED = '0';
    resetCooldown();

    const { status, body } = await postChat('/api/chat/ai', {
      message: 'Ruido en la distribución de un motor 1.6 TDI',
      context: {}
    });

    assert.equal(status, 200);
    assert.equal(body.source, 'expert_rules');
    assert.equal(typeof body.ai_error, 'string');
    assert.ok(body.ai_error.length > 0);
    assert.equal(body.ai_pending, false);
    assert.ok(body.reply.length > 50);
    assert.deepEqual(body.web_references, []);
    assert.ok(Array.isArray(body.forum_references));
    assert.ok(Array.isArray(body.productos_recomendados));
    assert.equal(networkCalls, 0, 'con WEB_SEARCH_ENABLED=0 y sin IA no debe haber red');
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of [...AI_KEYS, 'WEB_SEARCH_ENABLED', 'POLLINATIONS_ENABLED']) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    resetCooldown();
  }
});
