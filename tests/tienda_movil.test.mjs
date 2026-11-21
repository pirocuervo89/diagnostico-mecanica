import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const TMP = mkdtempSync(path.join(os.tmpdir(), 'dym-tienda-movil-'));
const PORT = 4161;
const BASE = `http://127.0.0.1:${PORT}`;
const PAGINA = 60; // debe coincidir con PAGE de public/js/tienda.js

let servidor = null;
let navegador = null;

function arrancar() {
  const proc = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      RUTA_DB_PATH: path.join(TMP, 'ruta.sqlite'),
      FORUM_DB_PATH: path.join(TMP, 'forum.sqlite'),
      FORUM_UPLOAD_DIR: path.join(TMP, 'forum-uploads'),
      GARAGE_UPLOAD_DIR: path.join(TMP, 'garage-uploads'),
      TUTORIAL_DB_PATH: path.join(TMP, 'tutorials.sqlite'),
      AI_PROVIDER: '', AI_API_KEY: '', GROQ_API_KEY: '', OPENROUTER_API_KEY: '',
      MISTRAL_API_KEY: '', CEREBRAS_API_KEY: '', OPENAI_API_KEY: '', GEMINI_API_KEY: '',
      WEB_SEARCH_ENABLED: '0', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  proc.stdout.resume();
  proc.stderr.resume();
  return proc;
}

async function esperarServidor(intentos = 80) {
  for (let i = 0; i < intentos; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch { /* arrancando */ }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('El servidor no arrancó para la prueba móvil');
}

async function parar(proc) {
  if (!proc) return;
  proc.kill('SIGTERM');
  await new Promise(r => proc.once('exit', r));
}

before(async () => {
  servidor = arrancar();
  await esperarServidor();
});

after(async () => {
  await navegador?.close();
  await parar(servidor);
  rmSync(TMP, { recursive: true, force: true });
});

test('en móvil la tienda carga por tandas, «Ver más» suma y la ficha abre y cierra', { timeout: 90000 }, async () => {
  // Dentro de Docker (y en CI) se ejecuta como root: Chromium necesita estos
  // permisos y no usar /dev/shm, que suele ser pequeño en los contenedores.
  const esRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  navegador = await chromium.launch({
    args: esRoot ? ['--no-sandbox', '--disable-dev-shm-usage'] : []
  });
  const contexto = await navegador.newContext({ ...devices['Pixel 7'] });
  const pagina = await contexto.newPage();

  const errores = [];
  pagina.on('console', m => { if (m.type() === 'error') errores.push(m.text()); });
  pagina.on('pageerror', e => errores.push(`EXCEPCIÓN: ${e}`));

  const pedidosProductos = [];
  pagina.on('request', r => {
    if (r.url().includes('/api/products')) pedidosProductos.push(r.url());
  });

  // Las fotos de producto viven en tiendas externas: se bloquean para que la
  // prueba no dependa de Amazon/AliExpress. Todo lo demás del sitio carga normal.
  await pagina.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === BASE) return route.continue();
    return route.fulfill({ status: 204, body: '' });
  });

  await pagina.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await pagina.waitForTimeout(800);

  // El catálogo completo (5 MB) no debe viajar al arrancar la app.
  assert.equal(pedidosProductos.length, 0, 'el arranque no debe pedir /api/products');

  const aceptar = pagina.getByRole('button', { name: /ACEPTAR TODAS/i });
  if (await aceptar.count()) await aceptar.first().tap({ timeout: 3000 }).catch(() => {});

  const inicio = Date.now();
  await pagina.locator('[data-view="tienda"]:visible').first().tap();
  await pagina.waitForSelector('#shopGrid .shop-card', { timeout: 10000 });
  const cargaMs = Date.now() - inicio;

  const tarjetas = await pagina.locator('#shopGrid .shop-card').count();
  assert.equal(tarjetas, PAGINA, `la tienda debe pintar ${PAGINA} tarjetas, no ${tarjetas}`);
  assert.match(await pagina.locator('#shopCount').innerText(), new RegExp(`^${PAGINA} de \\d`));
  assert.ok(cargaMs < 8000, `la tienda tardó ${cargaMs} ms en pintar (máximo 8000 ms)`);

  const overflow = await pagina.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `la tienda desborda ${overflow}px a lo ancho en móvil`);

  // Solo las primeras fotos se cargan ya; el resto espera a estar cerca.
  const cargas = await pagina.$$eval('#shopGrid .shop-card img', imgs => imgs.map(i => i.getAttribute('loading')));
  assert.equal(cargas.length, PAGINA);
  assert.ok(cargas.slice(0, 6).every(v => v === 'eager'), 'las 6 primeras fotos deben cargarse ya');
  assert.ok(cargas.slice(6).every(v => v === 'lazy'), 'el resto de fotos debe ser diferido');

  // «Ver más» añade otra tanda sin recargar la vista.
  await pagina.locator('#shopMore').tap();
  await pagina.waitForFunction(n => document.querySelectorAll('#shopGrid .shop-card').length === n, PAGINA * 2, { timeout: 8000 });
  assert.match(await pagina.locator('#shopCount').innerText(), new RegExp(`^${PAGINA * 2} de \\d`));

  // La ficha se abre con datos útiles y un enlace de compra real.
  await pagina.locator('#shopGrid .shop-card-title').first().tap();
  await pagina.waitForFunction(() => {
    const modal = document.querySelector('.shop-modal');
    return modal && !modal.hidden && modal.querySelector('.shop-modal-title')?.textContent.trim();
  }, null, { timeout: 8000 });

  const ficha = await pagina.evaluate(() => ({
    titulo: document.querySelector('.shop-modal-title').textContent.trim(),
    precio: document.querySelector('.shop-modal-price').textContent.trim(),
    categoria: document.querySelector('.shop-modal-cat').textContent.trim(),
    foto: document.querySelector('.shop-modal-img img')?.getAttribute('src') || '',
    enlace: document.querySelector('.shop-modal-foot a')?.getAttribute('href') || '',
    scrollBloqueado: document.body.classList.contains('shop-modal-open')
  }));
  assert.ok(ficha.titulo.length > 3, 'la ficha debe mostrar el nombre del producto');
  assert.ok(ficha.precio.length > 0, 'la ficha debe mostrar el precio');
  assert.ok(ficha.categoria.length > 0, 'la ficha debe mostrar la categoría');
  assert.match(ficha.foto, /^(https?:\/\/|\/)/, 'la ficha debe incluir la foto del producto');
  assert.match(ficha.enlace, /^https?:\/\//, 'la ficha debe incluir el enlace de compra');
  assert.equal(ficha.scrollBloqueado, true, 'la ficha debe bloquear el scroll de detrás');

  await pagina.locator('.shop-modal-close').tap();
  await pagina.waitForFunction(() => document.querySelector('.shop-modal')?.hidden, null, { timeout: 5000 });
  assert.equal(await pagina.evaluate(() => document.body.classList.contains('shop-modal-open')), false,
    'al cerrar la ficha debe liberarse el scroll');

  assert.deepEqual(errores, [], `errores de consola: ${errores.join(' | ')}`);
});
