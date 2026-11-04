/**
 * Descarga fotos de referencia para el catálogo de productos desde Wikimedia Commons.
 * Solo acepta licencias CC0, dominio público, CC BY y CC BY-SA, y guarda la
 * atribución exigida junto a cada imagen en data/product-images.json.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = 'public/img/products';
const META_FILE = 'data/product-images.json';
const API = 'https://commons.wikimedia.org/w/api.php';

const TARGETS = [
  { id: 'turbo', queries: ['turbocharger cutaway', 'turbocharger automotive', 'turbocharger'] },
  { id: 'intercooler', queries: ['intercooler car', 'intercooler'] },
  { id: 'blow-off', queries: ['blow off valve', 'dump valve turbo'] },
  { id: 'manguitos', queries: ['silicone hose engine', 'radiator hose silicone'] },
  { id: 'admision', queries: ['air filter cone car', 'air intake filter'] },
  { id: 'escape', queries: ['exhaust system car', 'sports exhaust'] },
  { id: 'bombillas-led', queries: ['LED car bulb', 'H7 LED lamp'] },
  { id: 'xenon', queries: ['xenon headlamp bulb', 'HID lamp car'] },
  { id: 'carroceria', queries: ['car body kit', 'rear spoiler car'] },
  { id: 'llantas', queries: ['alloy wheel car', 'alloy rim'] },
  { id: 'espejos', queries: ['car side mirror', 'wing mirror car'] },
  { id: 'suspension', queries: ['coilover suspension', 'car suspension strut'] },
  { id: 'frenos', queries: ['brake disc caliper', 'car brake caliper'] },
  { id: 'electronica', queries: ['OBD2 diagnostic connector', 'engine control unit'] }
];

const GOOD_LICENSE = /^(cc0|public domain|cc by 2\.0|cc by 3\.0|cc by 4\.0|cc by-sa 2\.0|cc by-sa 3\.0|cc by-sa 4\.0)$/i;

const stripTags = s => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

async function search(query) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `filetype:bitmap ${query}`,
    gsrnamespace: '6',
    gsrlimit: '12',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    iiurlwidth: '1200'
  });
  const res = await fetch(url, { headers: { 'User-Agent': 'diagnostico-mecanica/1.0 (catalog images)' } });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const json = await res.json();
  return Object.values(json.query?.pages || {});
}

function pick(pages) {
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!info?.thumburl) continue;
    const license = stripTags(info.extmetadata?.LicenseShortName?.value);
    if (!GOOD_LICENSE.test(license)) continue;
    return {
      page: p.title,
      fileUrl: info.descriptionurl,
      imageUrl: info.thumburl,
      license,
      artist: stripTags(info.extmetadata?.Artist?.value) || 'Wikimedia Commons',
      credit: stripTags(info.extmetadata?.Credit?.value)
    };
  }
  return null;
}

await fs.mkdir(OUT_DIR, { recursive: true });
const meta = { updated: new Date().toISOString().slice(0, 10), images: {} };

const sleep = ms => new Promise(r => setTimeout(r, ms));

for (const target of TARGETS) {
  const exists = await fs.access(path.join(OUT_DIR, `${target.id}.jpg`)).then(() => true, () => false);
  if (exists && !process.argv.includes('--force')) {
    console.log(target.id, '· ya existe, se omite');
    continue;
  }
  let found = null;
  for (const q of target.queries) {
    try {
      found = pick(await search(q));
    } catch (err) {
      console.warn('fallo búsqueda', q, err.message);
    }
    if (found) break;
    await sleep(1600);
  }
  if (!found) {
    console.warn('sin imagen aceptable para', target.id);
    continue;
  }
  const res = await fetch(found.imageUrl, { headers: { 'User-Agent': 'diagnostico-mecanica/1.0' } });
  if (!res.ok) {
    console.warn('no se pudo descargar', found.imageUrl, res.status);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const file = path.join(OUT_DIR, `${target.id}.jpg`);
  await fs.writeFile(file, buf);
  meta.images[target.id] = { ...found, path: `/${file.replace(/^public\//, '')}`, bytes: buf.length };
  console.log(target.id, '·', found.license, '·', found.artist, '·', buf.length, 'bytes');
  await sleep(1600);
}

await fs.writeFile(META_FILE, JSON.stringify(meta, null, 2));
console.log('metadatos en', META_FILE);
