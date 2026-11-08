/**
 * Refresco automático de los precios del catálogo de recambios.
 *
 * - Revisa solo las fichas con ASIN de Amazon y precio viejo (o sin precio).
 * - Nunca inventa cifras: si la ficha no devuelve precio, se deja como está.
 * - Escribe el catálogo de forma atómica (tmp + rename) para que una lectura
 *   a medias no rompa la API.
 * - Un cerrojo evita que dos pasadas (programada y manual) se pisen.
 *
 * Variables de entorno:
 *   PRICE_SYNC=0                 desactiva el refresco automático
 *   PRICE_SYNC_INTERVAL_MIN=20   minutos entre pasadas
 *   PRICE_SYNC_BATCH=30          fichas por pasada
 *   PRICE_SYNC_MAX_AGE_HOURS=24  antigüedad a partir de la cual se refresca
 *   PRICE_SYNC_ADMIN_TOKEN=...   exige cabecera x-admin-token en el refresco manual
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'products.json');
const STATE_PATH = path.join(DATA_DIR, 'price-sync-state.json');
const LOCK_PATH = path.join(DATA_DIR, '.price-sync.lock');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const LOCK_STALE_MS = 30 * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function priceSyncConfig() {
  const enabled = !['0', 'false', 'off', 'no'].includes(String(process.env.PRICE_SYNC ?? '1').toLowerCase());
  return {
    enabled,
    intervalMs: Math.max(5, Number(process.env.PRICE_SYNC_INTERVAL_MIN || 20)) * 60 * 1000,
    batch: Math.max(1, Math.min(200, Number(process.env.PRICE_SYNC_BATCH || 30))),
    maxAgeMs: Math.max(1, Number(process.env.PRICE_SYNC_MAX_AGE_HOURS || 24)) * 60 * 60 * 1000,
    adminToken: String(process.env.PRICE_SYNC_ADMIN_TOKEN || '').trim()
  };
}

/** Convierte "1.234,56 €" o "156,28€" en "1.234,56 €"; devuelve null si no hay cifra. */
export function parsePrice(text) {
  const m = String(text || '').match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/);
  return m ? `${m[1]},${m[2]} €` : null;
}

export const hasNumericPrice = value => /\d/.test(String(value || ''));

/** Una ficha se refresca si tiene ASIN y su precio falta o ha caducado. */
export function priceIsStale(item, maxAgeMs, now = Date.now()) {
  if (!item || !item.asin) return false;
  if (!hasNumericPrice(item.price)) return true;
  const checked = Date.parse(item.priceCheckedAt || '');
  if (!Number.isFinite(checked)) return true;
  return now - checked > maxAgeMs;
}

/** Aplica un precio observado; con precio nulo no toca la ficha. */
export function applyPrice(item, price, source, checkedAt) {
  if (!item || !price) return false;
  item.price = price;
  item.priceCheckedAt = checkedAt;
  item.priceSource = source;
  return true;
}

export async function fetchAmazonPrice(asin, { fetchImpl = fetch } = {}) {
  const url = `https://www.amazon.es/dp/${encodeURIComponent(asin)}`;
  const res = await fetchImpl(url, {
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
  const core = html.match(/id="corePrice_feature_div"[\s\S]{0,4000}?a-offscreen">([^<]+)</);
  const any = html.match(/a-offscreen">([\d.]+,\d{2})\s*€</);
  const price = parsePrice(core?.[1] || any?.[1] || '');
  if (!price) {
    const unavailable = /No disponible|Actualmente no disponible|Sin stock/i.test(html);
    return { error: unavailable ? 'sin stock' : 'sin precio en la ficha' };
  }
  return { price };
}

function readCatalogSync() {
  const raw = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.productos;
  return { raw, list };
}

let catalogCache = null;

/** Catálogo con caché por mtime/tamaño (para la API de precios). */
export function readCatalog() {
  const stat = fs.statSync(CATALOG_PATH);
  if (catalogCache && catalogCache.mtimeMs === stat.mtimeMs && catalogCache.size === stat.size) {
    return catalogCache.data;
  }
  const data = readCatalogSync();
  catalogCache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
  return data;
}

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeState(patch) {
  const next = { ...readState(), ...patch, updatedAt: new Date().toISOString() };
  await fsp.writeFile(STATE_PATH, JSON.stringify(next, null, 2) + '\n');
}

async function acquireLock() {
  try {
    const stat = await fsp.stat(LOCK_PATH);
    if (Date.now() - stat.mtimeMs < LOCK_STALE_MS) return false;
    await fsp.rm(LOCK_PATH, { force: true });
  } catch { /* no existe: libre */ }
  await fsp.writeFile(LOCK_PATH, `${process.pid} ${new Date().toISOString()}\n`);
  return true;
}

async function releaseLock() {
  await fsp.rm(LOCK_PATH, { force: true });
}

let running = false;

export function isRunning() {
  return running;
}

/**
 * Una pasada de refresco. Devuelve un resumen con lo comprobado y actualizado.
 * `limit` limita las fichas de esta pasada (las más antiguas van primero).
 */
export async function runPriceSync({ limit, maxAgeMs, fetchImpl, dry = false, log = () => {} } = {}) {
  if (running) return { skipped: 'running' };
  const cfg = priceSyncConfig();
  const age = Number.isFinite(maxAgeMs) ? maxAgeMs : cfg.maxAgeMs;
  running = true;
  let locked = false;
  try {
    locked = await acquireLock();
    if (!locked) return { skipped: 'locked' };

    const { raw, list } = readCatalogSync();
    const candidates = list
      .filter(item => priceIsStale(item, age))
      .sort((a, b) => String(a.priceCheckedAt || '').localeCompare(String(b.priceCheckedAt || '')))
      .slice(0, limit || cfg.batch);

    if (!candidates.length) {
      await writeState({ lastRun: new Date().toISOString(), checked: 0, updated: 0, remaining: 0, error: null });
      return { checked: 0, updated: 0, remaining: 0 };
    }

    const today = new Date().toISOString().slice(0, 10);
    let updated = 0;
    const failures = [];

    for (const [index, item] of candidates.entries()) {
      try {
        const { price, error } = await fetchAmazonPrice(item.asin, { fetchImpl });
        if (price) {
          applyPrice(item, price, `Amazon.es · ${item.asin}`, today);
          updated += 1;
        } else {
          // Se marca la comprobación para no reintentar la misma ficha en cada pasada.
          item.priceCheckedAt = today;
          failures.push({ id: item.id, error });
        }
        log(`[${index + 1}/${candidates.length}] ${price || error} · ${String(item.name).slice(0, 50)}`);
      } catch (err) {
        item.priceCheckedAt = today;
        failures.push({ id: item.id, error: err.message });
        log(`[${index + 1}/${candidates.length}] error de red · ${String(item.name).slice(0, 50)}`);
      }
      await sleep(700 + Math.random() * 500);
    }

    if (!dry && updated) {
      const tmp = `${CATALOG_PATH}.tmp-${process.pid}`;
      await fsp.writeFile(tmp, JSON.stringify(raw, null, 2) + '\n');
      await fsp.rename(tmp, CATALOG_PATH);
    }

    const remaining = list.filter(item => priceIsStale(item, age)).length;
    await writeState({
      lastRun: new Date().toISOString(),
      checked: candidates.length,
      updated,
      remaining,
      failures: failures.slice(0, 20),
      error: null
    });
    return { checked: candidates.length, updated, remaining, failures: failures.length };
  } catch (err) {
    await writeState({ error: err.message, lastRun: new Date().toISOString() });
    throw err;
  } finally {
    running = false;
    if (locked) await releaseLock();
  }
}

/** Resumen ligero para /api/prices/status. */
export function priceSyncStatus() {
  const cfg = priceSyncConfig();
  let total = 0;
  let withAsin = 0;
  let stale = 0;
  let priced = 0;
  try {
    const { list } = readCatalog();
    total = list.length;
    for (const item of list) {
      if (hasNumericPrice(item.price)) priced += 1;
      if (item.asin) withAsin += 1;
      if (priceIsStale(item, cfg.maxAgeMs)) stale += 1;
    }
  } catch { /* catálogo ilegible */ }
  return {
    ...cfg,
    adminToken: undefined,
    requiresToken: Boolean(cfg.adminToken),
    running,
    total,
    withAsin,
    priced,
    stale,
    ...readState()
  };
}

let schedulerStarted = false;

/** Arranca el refresco periódico. Es idempotente y no bloquea el arranque. */
export function startPriceSync({ log = console.log } = {}) {
  const cfg = priceSyncConfig();
  if (!cfg.enabled || schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    try {
      const res = await runPriceSync({ log });
      if (res?.checked) log(`[precios] ${res.updated}/${res.checked} actualizados · quedan ${res.remaining}`);
    } catch (err) {
      log(`[precios] error: ${err.message}`);
    }
  };

  // Se espera un poco para no competir con el arranque del servidor.
  const first = setTimeout(tick, 20 * 1000);
  const timer = setInterval(tick, cfg.intervalMs);
  first.unref?.();
  timer.unref?.();
  log(`[precios] refresco automático activo: ${cfg.batch} fichas cada ${Math.round(cfg.intervalMs / 60000)} min · caducidad ${Math.round(cfg.maxAgeMs / 3600000)} h`);
}
