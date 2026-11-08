/**
 * Sincroniza el precio de cada ficha del catálogo (data/products.json) con Amazon.es.
 *
 * Reglas:
 *  - Si la ficha ya tiene un `listingPrice` observado y verificable, se usa tal cual.
 *  - Si no, se consulta la ficha de Amazon por ASIN y se guarda el precio real.
 *  - Si Amazon no devuelve precio (agotado, no disponible, bloqueo), la ficha se
 *    queda en "Consultar": nunca se inventa una cifra.
 *
 * Uso:
 *   node scripts/sync-prices.mjs            → todo el catálogo
 *   node scripts/sync-prices.mjs --limit 10 → solo 10 fichas (pruebas)
 *   node scripts/sync-prices.mjs --dry      → no escribe nada
 */
import fs from 'node:fs/promises';

const CATALOG = 'data/products.json';
const BACKUP = 'data/products.json.bak-prices';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const limitArg = args.indexOf('--limit');
const limit = limitArg >= 0 ? Number(args[limitArg + 1]) : Infinity;

const hasPrice = value => /\d/.test(String(value || ''));

const raw = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
const list = Array.isArray(raw) ? raw : raw.productos;

// Un precio válido en formato español: 1.234,56 € / 156,28 €
const normalise = text => {
  const m = String(text).match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  if (!m) return null;
  return `${m[1]},${m[2]} €`;
};

async function priceFromAmazon(asin) {
  const url = `https://www.amazon.es/dp/${encodeURIComponent(asin)}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'es-ES,es;q=0.9',
      Accept: 'text/html,application/xhtml+xml'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(25000)
  });
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const html = await res.text();
  if (/captcha|api-services-support@amazon/i.test(html) && !/corePrice/.test(html)) {
    return { error: 'bloqueo anti-robot' };
  }
  const core = html.match(/id="corePrice_feature_div"[\s\S]{0,4000}?a-offscreen">([^<]+)</);
  const any = html.match(/a-offscreen">([\d.]+,\d{2})\s*€</);
  const price = normalise(core?.[1] || any?.[1] || '');
  const unavailable = /No disponible|Actualmente no disponible|Sin stock/i.test(html);
  if (!price) return { error: unavailable ? 'sin stock' : 'sin precio en la ficha' };
  return { price };
}

const today = new Date().toISOString().slice(0, 10);
let updated = 0;
let reused = 0;
const failed = [];

// 1) Fichas que ya tienen un precio observado guardado: se promociona a `price`.
for (const item of list) {
  if (hasPrice(item.price)) continue;
  const observed = normalise(item.listingPrice || '');
  if (observed) {
    item.price = observed;
    item.priceCheckedAt = item.verifiedAt || today;
    item.priceSource = 'Amazon.es (ficha verificada)';
    reused += 1;
  }
}

// 2) Fichas sin precio: consulta directa por ASIN.
const pending = list.filter(item => !hasPrice(item.price) && item.asin).slice(0, limit);
console.log(`Fichas con precio ya resuelto: ${reused}. A consultar en Amazon: ${pending.length}.`);

let done = 0;
for (const item of pending) {
  done += 1;
  try {
    const { price, error } = await priceFromAmazon(item.asin);
    if (price) {
      item.price = price;
      item.priceCheckedAt = today;
      item.priceSource = `Amazon.es · ${item.asin}`;
      updated += 1;
      console.log(`[${done}/${pending.length}] ${price} · ${item.name.slice(0, 55)}`);
    } else {
      failed.push({ id: item.id, asin: item.asin, error });
      console.log(`[${done}/${pending.length}] ${error} · ${item.name.slice(0, 45)}`);
    }
  } catch (e) {
    failed.push({ id: item.id, asin: item.asin, error: e.message });
    console.log(`[${done}/${pending.length}] error de red · ${item.name.slice(0, 45)}`);
  }
  await sleep(900 + Math.random() * 600);
}

const withPrice = list.filter(item => hasPrice(item.price)).length;
console.log(`\nResultado: ${updated} nuevas + ${reused} recuperadas = ${withPrice}/${list.length} con precio visible.`);
if (failed.length) console.log(`Sin precio: ${failed.length} (se quedan en «Consultar»).`);

if (dry) {
  console.log('Modo --dry: no se ha escrito nada.');
} else {
  await fs.copyFile(CATALOG, BACKUP);
  await fs.writeFile(CATALOG, JSON.stringify(raw, null, 2) + '\n');
  console.log(`Guardado. Copia anterior en ${BACKUP}.`);
}
