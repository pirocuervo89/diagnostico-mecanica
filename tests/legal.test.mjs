import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const PAGES = ['aviso-legal', 'privacidad', 'cookies', 'afiliacion', 'terminos'];

test('las cinco páginas legales existen y tienen título y navegación', () => {
  for (const page of PAGES) {
    const html = read(`public/legal/${page}.html`);
    assert.match(html, /<html lang="es">/, `${page}: idioma`);
    assert.match(html, /<h1>/, `${page}: título principal`);
    assert.match(html, /class="legal-nav"/, `${page}: navegación legal`);
    assert.match(html, /consent\.js/, `${page}: consentimiento de cookies`);
  }
});

test('el aviso legal identifica al titular conforme a la LSSI', () => {
  const html = read('public/legal/aviso-legal.html');
  for (const field of ['Titular', 'NIF', 'Domicilio', 'Correo electrónico']) {
    assert.ok(html.includes(field), `falta ${field}`);
  }
});

test('la política de privacidad cubre RGPD y derechos', () => {
  const html = read('public/legal/privacidad.html');
  for (const term of ['RGPD', 'Base jurídica', 'Agencia Española de Protección de Datos', 'portabilidad']) {
    assert.ok(html.includes(term), `falta ${term}`);
  }
});

test('la política de cookies lista las cookies reales de la aplicación', () => {
  const html = read('public/legal/cookies.html');
  assert.match(html, /dym_forum_session/);
  assert.match(html, /dym_consent_v1/);
  assert.match(html, /dym_tutorials_v1/);
  assert.match(html, /youtube-nocookie/);
  assert.match(html, /data-consent-open/, 'debe permitir reabrir el consentimiento');
});

test('la divulgación de afiliado de Amazon está presente y es literal', () => {
  const html = read('public/legal/afiliacion.html');
  assert.ok(html.includes('Como Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.'));
  assert.ok(read('public/index.html').includes('Como Afiliado de Amazon'), 'también en el pie de la web');
});

test('robots.txt y sitemap.xml publican las páginas legales', () => {
  const robots = read('public/robots.txt');
  assert.match(robots, /Sitemap: https?:\/\//);
  assert.match(robots, /Disallow: \/api\//);
  const sitemap = read('public/sitemap.xml');
  for (const page of PAGES) assert.ok(sitemap.includes(`legal/${page}.html`), `sitemap sin ${page}`);
});

test('la web carga el consentimiento antes que el resto de scripts', () => {
  const html = read('public/index.html');
  const consent = html.indexOf('/js/consent.js');
  const app = html.indexOf('/js/app.js');
  assert.ok(consent > 0 && app > 0 && consent < app, 'consent.js debe ir antes de app.js');
  assert.ok(html.includes('/legal/cookies.html'), 'enlace a la política de cookies');
});
