import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = 4133;
const BASE = `http://127.0.0.1:${PORT}`;
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-lighting-test-'));
const TAG = 'etiqueta-prueba-21';

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

async function call(url) {
  const response = await fetch(`${BASE}${url}`);
  const contentType = response.headers.get('content-type') || '';
  return {
    status: response.status,
    type: contentType,
    body: contentType.includes('application/json') ? await response.json().catch(() => null) : null
  };
}

before(async () => {
  server = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      AFFILIATE_TAG_AMAZON: TAG,
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

test('luz y multimedia: familias verificadas, imágenes y precios', async () => {
  const response = await call('/api/lighting-media');
  assert.equal(response.status, 200);
  const data = response.body;
  assert.ok(Array.isArray(data.families));
  assert.ok(data.families.length >= 7, 'debe incluir las familias nuevas de luz y cámaras');
  assert.ok(data.stats.products >= 33, 'debe haber al menos 33 fichas verificadas');
  assert.equal(data.stats.products, data.families.reduce((n, f) => n + f.products.length, 0));
  assert.equal(data.stats.verified, data.stats.products, 'todas las fichas publicadas deben estar verificadas');

  const withProducts = data.families.filter(f => f.products.length > 0);
  assert.ok(withProducts.length >= 5);
  assert.ok(data.families.some(f => f.id === 'luz-trabajo' && f.products.length > 0));
  assert.ok(data.families.some(f => f.id === 'camaras' && f.products.length > 0));

  for (const family of data.families) {
    for (const product of family.products) {
      assert.ok(product.id, 'cada ficha debe tener id');
      assert.ok(product.name, 'cada ficha debe tener nombre');
      assert.ok(product.image && product.image.startsWith('/img/productos/'), `${product.id} debe tener foto local`);
      assert.equal(product.imageStatus, 'verified', `${product.id} debe tener foto verificada`);
      assert.equal(product.linkStatus, 'verified', `${product.id} debe tener enlace verificado`);
      assert.match(product.affiliateUrl || '', /^https:\/\/www\.amazon\./i, `${product.id} debe tener enlace Amazon`);
      assert.match(product.affiliateUrl, new RegExp(`[?&]tag=${TAG}`), `${product.id} debe llevar la etiqueta de afiliación`);
    }
  }

  const priced = data.families.flatMap(f => f.products).filter(p => p.price || p.listingPrice);
  assert.ok(priced.length >= 30, 'casi todas las fichas deben mostrar precio o precio observado');
  assert.ok(priced.some(p => p.listingPrice && p.listingPrice.includes('€')), 'debe conservar el precio observado');
});

test('luz y multimedia: las fotos se sirven de verdad', async () => {
  const data = (await call('/api/lighting-media')).body;
  const sample = data.families.flatMap(f => f.products).slice(0, 4);
  for (const product of sample) {
    const image = await fetch(`${BASE}${product.image}`);
    assert.equal(image.status, 200, `la foto ${product.image} debe responder 200`);
    assert.match(image.headers.get('content-type') || '', /^image\//, 'la foto debe servirse como imagen');
  }
});

test('afiliación: también se aplica al detalle de producto', async () => {
  const response = await call('/api/products/amz-b0d845vtg7');
  assert.equal(response.status, 200);
  assert.match(response.body.affiliateUrl, new RegExp(`[?&]tag=${TAG}`));
  assert.match(response.body.affiliateUrl, /^https:\/\/www\.amazon\./);
});
