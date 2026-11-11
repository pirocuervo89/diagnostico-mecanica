import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  resolveProvider,
  resolveProviders,
  resolveVisionProviders,
  aiStatus,
  aiVisionStatus,
  callAI,
  callAIVision,
  resetCooldown,
  resetFreeThrottle,
  listProviders
} from '../src/lib/ai_provider.js';

// Servidor falso que imita a un proveedor compatible con OpenAI.
let server;
let port;
let received = [];
let nextReply = () => ({ status: 200, body: {} });

const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function mockEnv(extra = {}) {
  return {
    AI_PROVIDER: 'compatible',
    AI_API_KEY: 'clave-de-prueba',
    AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    AI_MODEL: 'modelo-de-prueba',
    // Por defecto las pruebas no salen a Internet: Pollinations se activa solo
    // en la prueba que lo apunta a este mismo servidor falso.
    POLLINATIONS_ENABLED: '0',
    ...extra
  };
}

function pollinationsEnv(extra = {}) {
  return {
    POLLINATIONS_ENABLED: '1',
    POLLINATIONS_BASE_URL: `http://127.0.0.1:${port}/v1`,
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

beforeEach(() => {
  received = [];
  resetCooldown();
  // El límite de Pollinations es global (1 llamada/45 s); sin reiniciarlo, una
  // prueba dejaría a la siguiente sin turno gratuito y el fallo sería del test.
  resetFreeThrottle();
  nextReply = () => ({ status: 200, body: {} });
});

const okReply = (text) => () => ({
  status: 200,
  body: { choices: [{ message: { content: text }, finish_reason: 'stop' }] }
});

test('sin claves no hay proveedor salvo que Pollinations esté desactivado', () => {
  const provider = resolveProvider({ POLLINATIONS_ENABLED: '0' });
  assert.equal(provider, null);
  const status = aiStatus({ POLLINATIONS_ENABLED: '0' });
  assert.equal(status.configured, false);
  assert.equal(status.fallback, 'expert_rules');
  assert.match(status.note, /motor experto local/);
  assert.deepEqual(status.providers, []);
});

test('sin claves Pollinations queda como último recurso gratuito', () => {
  assert.equal(resolveProvider({}).id, 'pollinations');
  const chain = resolveProviders({});
  assert.equal(chain.length, 1);
  assert.equal(chain[0].free, true);
  assert.equal(chain[0].apiKey, '');

  const status = aiStatus({});
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'pollinations');
  assert.equal(status.providers[0].id, 'pollinations');
  assert.equal(status.providers[0].free, true);
  assert.equal(status.providers[0].vision, false);
});

test('el estado nunca devuelve la clave', () => {
  const env = mockEnv();
  const status = aiStatus(env);
  assert.equal(status.configured, true);
  assert.equal(status.provider, 'compatible');
  assert.equal(status.model, 'modelo-de-prueba');
  assert.equal(JSON.stringify(status).includes('clave-de-prueba'), false);

  const withChain = aiStatus({ GROQ_API_KEY: 'clave-groq', OPENAI_API_KEY: 'clave-openai' });
  assert.deepEqual(withChain.providers.map(p => p.id), ['groq', 'openai', 'pollinations']);
  const serialized = JSON.stringify(withChain);
  assert.equal(serialized.includes('clave-groq'), false);
  assert.equal(serialized.includes('clave-openai'), false);
});

test('orden de preferencia: forzado, genérico, presets, Gemini y Pollinations al final', () => {
  assert.equal(resolveProvider({ AI_API_KEY: 'k', AI_BASE_URL: 'http://x/v1' }).id, 'compatible');
  assert.equal(resolveProvider({ GROQ_API_KEY: 'k' }).id, 'groq');
  assert.equal(resolveProvider({ OPENROUTER_API_KEY: 'k' }).id, 'openrouter');
  assert.equal(resolveProvider({ MISTRAL_API_KEY: 'k' }).id, 'mistral');
  assert.equal(resolveProvider({ GEMINI_API_KEY: 'k' }).id, 'gemini');

  const allKeys = {
    AI_API_KEY: 'k', AI_BASE_URL: 'http://x/v1',
    GROQ_API_KEY: 'k', OPENROUTER_API_KEY: 'k', MISTRAL_API_KEY: 'k',
    CEREBRAS_API_KEY: 'k', OPENAI_API_KEY: 'k', GEMINI_API_KEY: 'k'
  };
  assert.deepEqual(resolveProviders(allKeys).map(p => p.id), [
    'compatible', 'groq', 'openrouter', 'mistral', 'cerebras', 'openai', 'gemini', 'pollinations'
  ]);

  // AI_PROVIDER fuerza un proveedor concreto aunque haya otros configurados.
  const forced = { AI_PROVIDER: 'groq', GROQ_API_KEY: 'k', GEMINI_API_KEY: 'k2' };
  assert.equal(resolveProvider(forced).id, 'groq');
  assert.deepEqual(resolveProviders(forced).map(p => p.id), ['groq', 'gemini', 'pollinations']);

  // AI_MODEL y AI_BASE_URL sustituyen los valores por defecto.
  const custom = resolveProvider({ GROQ_API_KEY: 'k', AI_MODEL: 'otro-modelo' });
  assert.equal(custom.model, 'otro-modelo');

  // Un proveedor desconocido no se inventa: se usa la cadena normal.
  assert.equal(resolveProvider({ AI_PROVIDER: 'inventado', GROQ_API_KEY: 'k' }).id, 'groq');
  assert.equal(resolveProvider({ AI_PROVIDER: 'inventado' }).id, 'pollinations');
});

test('el catálogo de proveedores es público y no lleva claves', () => {
  const list = listProviders();
  assert.ok(list.length >= 7);
  assert.ok(list.every(p => p.id && p.label && typeof p.keyEnv === 'string' && !('apiKey' in p)));
  assert.ok(list.some(p => p.id === 'pollinations' && p.free === true && p.keyEnv === ''));
});

test('callAI usa el formato OpenAI: ruta, cabecera, modelo y mensaje', async () => {
  nextReply = okReply('  Diagnóstico de prueba  ');

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
  nextReply = () => ({
    status: 200,
    body: { choices: [{ message: { content: 'Informe a medias' }, finish_reason: 'length' }] }
  });
  const result = await callAI('Informe largo', { env: mockEnv() });
  assert.equal(result.ok, true);
  assert.equal(result.finishReason, 'MAX_TOKENS');
});

test('si el primer proveedor falla se prueba el siguiente de la cadena', async () => {
  const env = mockEnv({ AI_API_KEY: 'primera-clave', GROQ_API_KEY: 'segunda-clave' });
  nextReply = (req) => {
    if (req.headers.authorization === 'Bearer primera-clave') {
      return { status: 500, body: { error: { message: 'boom' } } };
    }
    return { status: 200, body: { choices: [{ message: { content: 'Respondió el segundo' }, finish_reason: 'stop' }] } };
  };

  const result = await callAI('Diagnóstico', { env });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Respondió el segundo');
  assert.equal(result.provider, 'groq');
  assert.equal(received.length, 2);
  assert.equal(received[0].auth, 'Bearer primera-clave');
  assert.equal(received[1].auth, 'Bearer segunda-clave');
});

test('sin claves callAI usa Pollinations con un mock local y sin cabecera Authorization', async () => {
  nextReply = okReply('Respuesta gratuita');

  const result = await callAI('Comprueba el nivel de aceite', { env: pollinationsEnv() });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Respuesta gratuita');
  assert.equal(result.provider, 'pollinations');
  assert.equal(result.model, 'openai-fast');
  assert.equal(received.length, 1);
  assert.equal(received[0].url, '/v1/chat/completions');
  assert.equal(received[0].auth, undefined);
  assert.equal(received[0].body.model, 'openai-fast');
});

test('el cooldown es independiente por proveedor', async () => {
  const env = mockEnv({ AI_API_KEY: 'primera-clave', GROQ_API_KEY: 'segunda-clave' });
  nextReply = (req) => {
    if (req.headers.authorization === 'Bearer primera-clave') {
      return { status: 429, body: { error: { message: 'rate limit' } } };
    }
    return { status: 200, body: { choices: [{ message: { content: 'Bien' }, finish_reason: 'stop' }] } };
  };

  const first = await callAI('x', { env });
  assert.equal(first.ok, true);
  assert.equal(first.provider, 'groq');

  const second = await callAI('x', { env });
  assert.equal(second.ok, true);
  assert.equal(second.provider, 'groq');

  // El primer proveedor solo se llamó una vez: está en cooldown. El segundo,
  // que sí responde, se usa en cada consulta.
  assert.equal(received.filter(r => r.auth === 'Bearer primera-clave').length, 1);
  assert.equal(received.filter(r => r.auth === 'Bearer segunda-clave').length, 2);
});

test('los errores del proveedor se clasifican sin romper la ruta', async () => {
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

test('si todos los proveedores fallan se devuelve un error agregado', async () => {
  nextReply = () => ({ status: 429, body: { error: { message: 'rate limit' } } });
  const env = pollinationsEnv({
    GROQ_API_KEY: 'k',
    AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    AI_MODEL: 'modelo-de-prueba'
  });

  const result = await callAI('x', { env });

  assert.equal(result.ok, false);
  assert.equal(result.aggregated, true);
  assert.equal(result.reason, 'quota');
  assert.deepEqual(result.errors.map(e => e.provider), ['groq', 'pollinations']);
  assert.ok(result.errors.every(e => e.reason === 'quota'));
});

test('tras un fallo se espera antes de reintentar y no se martiriza al proveedor', async () => {
  nextReply = () => ({ status: 429, body: { error: { message: 'rate limit' } } });
  const first = await callAI('x', { env: mockEnv() });
  assert.equal(first.reason, 'quota');

  const second = await callAI('x', { env: mockEnv() });
  assert.equal(second.reason, 'cooldown');
  assert.equal(received.length, 1);
});

test('Gemini sigue disponible como proveedor alternativo', async () => {
  nextReply = () => ({
    status: 200,
    body: { candidates: [{ content: { parts: [{ text: 'Respuesta de Gemini' }] }, finishReason: 'STOP' }] }
  });

  const env = {
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'clave-gemini',
    AI_BASE_URL: `http://127.0.0.1:${port}/v1beta`,
    POLLINATIONS_ENABLED: '0'
  };
  const result = await callAI('Comprueba P0299', { env });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Respuesta de Gemini');
  assert.equal(result.provider, 'gemini');
  assert.match(received[0].url, /^\/v1beta\/models\/.+:generateContent$/);
});

test('visión: Pollinations no entra en la cadena y sin visión se devuelve no_vision', () => {
  assert.deepEqual(resolveVisionProviders({}), []);
  assert.equal(aiVisionStatus({}).reason, 'no_vision');
});

test('visión: AI_VISION_MODEL se aplica solo al proveedor de visión elegido', () => {
  const env = {
    AI_VISION_PROVIDER: 'gemini',
    AI_VISION_MODEL: 'gemini-3.5-flash-lite',
    GEMINI_API_KEY: 'clave-gemini',
    POLLINATIONS_ENABLED: '0'
  };
  const provider = resolveVisionProviders(env)[0];
  assert.equal(provider.id, 'gemini');
  assert.equal(provider.model, 'gemini-3.5-flash-lite');
});

test('visión: usa el primer proveedor con visión y cae al siguiente si falla', async () => {
  nextReply = (req, raw) => {
    if (req.url.includes('generateContent')) {
      return { status: 200, body: { candidates: [{ content: { parts: [{ text: 'Gemini ve la foto' }] }, finishReason: 'STOP' }] } };
    }
    return { status: 500, body: { error: { message: 'sin visión' } } };
  };

  const env = {
    GEMINI_API_KEY: 'clave-gemini',
    OPENAI_API_KEY: 'clave-openai',
    AI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    POLLINATIONS_ENABLED: '1'
  };
  const result = await callAIVision('¿Qué testigo es?', imageDataUrl, { env });

  assert.equal(result.ok, true);
  assert.equal(result.text, 'Gemini ve la foto');
  assert.equal(result.provider, 'gemini');
  assert.ok(received.every(r => !String(r.auth || '').includes('pollinations')));
});
