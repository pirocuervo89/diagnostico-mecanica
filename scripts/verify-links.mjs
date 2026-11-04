/**
 * Comprueba uno a uno los enlaces del catálogo de recambios (data/tuning-products.json).
 *
 * Distingue tres casos:
 *  - ok        → la web responde 200/30x.
 *  - bloqueado → 401/403/429/503: la tienda corta a los robots, pero el enlace abre en un navegador.
 *  - roto      → 404/410 u otros errores: hay que arreglarlo.
 *
 * Uso: node scripts/verify-links.mjs [--json]
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';

// La salida se duplica en un fichero para poder seguir el progreso aunque
// la salida estándar vaya en búfer.
const rawLog = console.log.bind(console);
console.log = (...args) => {
  const line = args.join(' ');
  rawLog(line);
  try { fsSync.appendFileSync('.tmp/links.log', line + '\n'); } catch { /* da igual */ }
};

const CATALOG = 'data/tuning-products.json';
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));

const byUrl = new Map();
for (const item of catalog.items) {
  for (const link of item.links || []) {
    const entry = byUrl.get(link.url) || { url: link.url, shop: link.shop, items: [] };
    entry.items.push(item.id);
    byUrl.set(link.url, entry);
  }
}

const rows = [];
let i = 0;
for (const entry of byUrl.values()) {
  i++;
  const started = Date.now();
  let status = 0;
  let finalUrl = entry.url;
  let error = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(entry.url, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
        signal: AbortSignal.timeout(20000)
      });
      status = res.status;
      finalUrl = res.url;
      error = null;
      break;
    } catch (err) {
      error = err.message;
      status = 0;
      await sleep(1500);
    }
  }
  const verdict = status >= 200 && status < 400 ? 'ok'
    : [401, 403, 429, 503].includes(status) ? 'bloqueado'
      : 'roto';
  rows.push({ ...entry, status, finalUrl, verdict, error, ms: Date.now() - started });
  console.log(`${String(i).padStart(3)}/${byUrl.size} ${verdict.padEnd(10)} ${String(status).padStart(3)} ${entry.shop.padEnd(20)} ${entry.url.slice(0, 88)}${error ? ' · ' + error : ''}`);
  await sleep(300);
}

await fs.writeFile('.tmp/links-report.json', JSON.stringify(rows, null, 2));

const counts = rows.reduce((acc, r) => (acc[r.verdict] = (acc[r.verdict] || 0) + 1, acc), {});
console.log('\nEnlaces únicos:', rows.length, JSON.stringify(counts));
const broken = rows.filter(r => r.verdict === 'roto');
if (broken.length) {
  console.log('\nROTOS:');
  for (const b of broken) console.log(` - ${b.shop} ${b.url} -> ${b.status} ${b.error || ''} (${b.items.length} piezas)`);
}
