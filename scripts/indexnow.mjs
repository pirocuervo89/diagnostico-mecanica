/**
 * Aviso a IndexNow (Bing, Yandex, Seznam, Naver) de que las URLs del sitemap
 * existen o han cambiado.
 *
 * Google no usa IndexNow, pero Bing sí, y de Bing beben ChatGPT Search y
 * Copilot: es la vía más rápida para que 624 páginas nuevas se rastreen sin
 * esperar a que un buscador las descubra.
 *
 * Uso:
 *   node scripts/indexnow.mjs            (envía todo el sitemap)
 *   node scripts/indexnow.mjs --dry-run  (solo cuenta las URLs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KEY = fs.readdirSync(path.join(ROOT, 'public'))
  .find(name => /^[a-f0-9]{32}\.txt$/.test(name))
  ?.replace(/\.txt$/, '');

if (!KEY) {
  console.error('No hay clave de IndexNow en public/ (archivo <clave>.txt).');
  process.exit(1);
}

const SITE = process.env.SITE_URL || 'https://diagnostico-mecanica.onrender.com';
const dryRun = process.argv.includes('--dry-run');

const sitemap = await fetch(`${SITE}/sitemap.xml`).then(response => {
  if (!response.ok) throw new Error(`sitemap ${response.status}`);
  return response.text();
}).catch(error => {
  console.error(`No se pudo leer el sitemap: ${error.message}`);
  process.exit(1);
});

const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1].trim());
console.log(`URLs en el sitemap: ${urls.length}`);

if (dryRun) process.exit(0);

if (!urls.length) {
  console.error('El sitemap no tiene URLs: no se envía nada.');
  process.exit(1);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: new URL(SITE).host,
    key: KEY,
    keyLocation: `${SITE}/${KEY}.txt`,
    urlList: urls
  })
});

const body = await response.text();
console.log(`IndexNow: ${response.status} ${response.statusText}${body ? ` · ${body.slice(0, 200)}` : ''}`);
process.exit(response.ok ? 0 : 1);
