import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  resolveProvider,
  aiStatus,
  callAI,
  resetCooldown,
  listProviders
} from '../src/lib/ai_provider.js';

// Servidor falso que imita a un proveedor compatible con OpenAI.
let server;
let port;
let received = [];
let nextReply = () => ({ status: 200, body: {} });

function mockEnv(extra = {}) {
  return {
    AI_PROVIDER: 'compatible',
    AI_API_KEY: 'clave-de-prueba',
    AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    AI_MODEL: 'modelo-de-prueba',
    ...extra
  };
}

before(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      received.push({
        url: req.url,
        method: req.method,
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : null
      });
      const reply = nextReply(req, raw);
      res.writeHead(reply.status || 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
});

after(() => new Promise(resolve => server.close(resolve)));

test('sin claves no hay proveedor y el estado lo declara', () => {
  const provider = resolveProvider({});
  assert.equal(provider, null);
  const status = aiStatus({});
  assert.equal(status.configured, false);
  assert.equal(status.fallback, 'expert_rules');
  assert.match(status.note, /motor experto local/);
});

test('el estado nunca devuelve la clave', () => {
  const env = mockEnv();
  const status = aiStatus(env);
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'compatible');
  assert.equal(status.model, 'modelo-de-prueba');
  assert.equal(JSON.stringify(status).includes('clave-de-prueba'), false);
});

test('orden de preferencia: genérico, Groq, OpenRouter, Mistral y Gemini al final', () => {
  assert.equal(resolveProvider({ AI_API_KEY: 'k', AI_BASE_URL: 'http://x/v1' }).id, 'compatible');
  assert.equal(resolveProvider({ GROQ_API_KEY: 'k' }).id, 'groq');
  assert.equal(resolveProvider({ OPENROUTER_API_KEY: 'k' }).id, 'openrouter');
  assert.equal(resolveProvider({ MISTRAL_API_KEY: 'k' }).id, 'mistral');
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'k' }).id, 'gemini');
  // AI_PROVIDER fuerza un proveedor concreto aunque haya otros configurados.
  assert.equal(resolveProvider({ AI_PROVIDER: 'groq', GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k2' }).id, 'groq');
  // AI_MODEL y AI_BASE_URL sustituyen los valores por defecto.
  const custom = resolveProvider({ GROQ_API_KEY: 'k', AI_MODEL: 'otro-modelo' });
  assert.equal(custom.model, 'otro-modelo');
  // Un proveedor desconocido no se inventa: se cae al motor local.
  assert.equal(resolveProvider({ AI_PROVIDER: 'inventado', GROQ_API_KEY: 'k' }), null);
});

test('el catálogo de proveedores es público y no lleva claves', () => {
  const list = listProviders();
  assert.ok(list.length >= 6);
  assert.ok(list.every(p => p.id && p.label && p.keyEnv && !('apiKey' in p)));
});

test('callAI usa el formato OpenAI: ruta, cabecera, modelo y mensaje', async () => {
  resetCooldown();
  received = [];
  nextReply = () => ({
    status: 200,
    body: { choices: [{ message: { content: '  Diagnóstico de prueba  ' }, finish_reason: 'stop' }] }
  });

  const result = await callAI('Ruido al frenar en un Golf IV', { env: mockEnv(), temperature: 0.2, maxOutputTokens: 512 });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Diagnóstico de prueba');
  assert.equal(result.finishReason, 'STOP');
  assert.equal(result.provider, 'compatible');
  assert.equal(result.model, 'modelo-de-prueba');

  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/v1/chat/completions');
  assert.equal(received[0].method, 'POST');
  assert.equal(received[0].auth, 'Bearer clave-de-prueba');
  assert.equal(received[0].body.model, 'modelo-de-prueba');
  assert.equal(received[0].body.temperature, 0.2);
  assert.equal(received[0].body.max_tokens, 512);
  assert.match(received[0].body.messages[0].content, /Ruido al frenar/);
});

test('una respuesta truncada se marca como MAX_TOKENS', async () => {
  resetCooldown();
  nextReply = () => ({
    status: 200,
    body: { choices: [{ message: { content: 'Informe a medias' }, finish_reason: 'length' }] }
  });
  const result = await callAI('Informe largo', { env: mockEnv() });
  assert.equal(result.ok, true);
  assert.equal(result.finishReason, 'MAX_TOKENS');
});

test('los errores del proveedor se clasifican sin romper la ruta', async () => {
  resetCooldown();
  nextReply = () => ({ status: 429, body: { error: { message: 'rate limit' } } });
  assert.equal((await callAI('x', { env: mockEnv() })).reason, 'quota');

  resetCooldown();
  nextReply = () => ({ status: 401, body: { error: { message: 'bad key' } } });
  assert.equal((await callAI('x', { env: mockEnv() })).reason, 'auth');

  resetCooldown();
  nextReply = () => ({ status: 500, body: { error: { message: 'boom' } } });
  assert.equal((await callAI('x', { env: mockEnv() })).reason, 'provider_error');

  resetCooldown();
  nextReply = () => ({ status: 200, body: { choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] } });
  assert.equal((await callAI('x', { env: mockEnv() })).reason, 'empty');

  resetCooldown();
  const sinRed = await callAI('x', { env: mockEnv({ AI_BASE_URL: 'http://127.0.0.1:1/v1' }) });
  assert.equal(sinRed.reason, 'network');
});

test('tras un fallo se espera antes de reintentar y no se martiriza al proveedor', async () => {
  resetCooldown();
  received = [];
  nextReply = () => ({ status: 429, body: { error: { message: 'rate limit' } } });
  const first = await callAI('x', { env: mockEnv() });
  assert.equal(first.reason, 'quota');

  const second = await callAI('x', { env: mockEnv() });
  assert.equal(second.reason, 'cooldown');
  assert.equal(received.length, 1);

  resetCooldown();
});

test('Gemini sigue disponible como proveedor alternativo', async () => {
  resetCooldown();
  received = [];
  nextReply = () => ({
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: 'Respuesta de Gemini' }] }, finishReason: 'STOP' }] }
  });

  const env = { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'clave-gemini', AI_BASE_URL: `http://127.0.0.1:${port}/v1beta` };
  const result = await callAI('Comprueba P0299', { env });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Respuesta de Gemini');
  assert.equal(result.provider, 'gemini');
  assert.match(received[0].url, /^\/v1beta\/models\/.+:generateContent$/);
  resetCooldown();
});
