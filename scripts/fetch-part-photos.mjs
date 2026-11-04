/**
 * Descarga una foto real y distinta para cada pieza de preparación del catálogo
 * (data/tuning-products.json) desde Wikimedia Commons.
 *
 * Cómo elige las fotos:
 *  - Solo tira de categorías curadas de Commons (Category:Turbochargers, Category:Brake calipers…).
 *  - El título del archivo tiene que hablar de la pieza (regla `require`) o se descarta.
 *  - Lista negra: fuera presas, barcos, mangueras de jardín y demás temas que no son de coche.
 *  - Solo licencias libres: CC0, dominio público, CC BY y CC BY-SA.
 *  - Nunca repite la misma foto en dos piezas (ni el archivo ni el contenido).
 *  - Si una pieza no tiene foto libre válida, se queda la foto de su categoría.
 *
 * Uso: node scripts/fetch-part-photos.mjs [--force] [--cat turbo]
 */
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const CATALOG = 'data/tuning-products.json';
const META = 'data/recambios-images.json';
const OUT_DIR = 'public/img/recambios';
const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'diagnostico-mecanica/1.0 (catalogo de recambios)';

// Categorías de Commons que ya son de automoción de por sí: en ellas basta con que
// el título hable de la pieza. En las demás hay que mencionar además un coche,
// porque si no cuelan trenes, camiones o instalaciones de aire.
const AUTO_SAFE = new Set([
  'Turbochargers', 'Intercoolers', 'Alloy wheels', 'Automobile wheels',
  'Automobile outer rear-view mirrors', 'Automobile door mirrors', 'Automobile mirrors',
  'Brake calipers', 'Brake disks', 'Disk brakes', 'Coilovers', 'Shock absorbers',
  'Automobile headlamps', 'Automobile tuning', 'Bumpers', 'Spoilers',
  'Exhaust manifolds', 'Exhaust systems', 'Catalytic converters',
  'Intake manifolds', 'Throttle bodies', 'Engine control unit', 'Automobile computers',
  'Automobile electronics', 'Automobile seats', 'Steering wheels', 'Gear sticks',
  'Clutches', 'Automobile transmissions',
  'Spark plugs', 'Xenon', 'Osram', 'Castrol', 'Motor oil', 'Oil filters'
]);

// Palabras de contexto automovilístico que se exigen en las categorías dudosas.
const AUTO_CTX = /(car|auto|vehicle|automobile|engine|motor|diesel|petrol|gasoline|truck|lorry|van\b|bmw|vw\b|audi|ford|toyota|renault|peugeot|mercedes|opel|seat\b|skoda|porsche|ferrari|jaguar|volvo|honda|nissan|mazda|turbo|exhaust|brake|wheel|suspension|clutch|gearbox|automotive)/i;

// Temas que no son la pieza de un coche: si el título los menciona, se descarta.
const BLOCK = /(reservoir|dam\b|navy|naval|ship|boat|marine|vessel|submarine|schiffsmotor|excavator|garden|soaker|sewer|hydrant|pipeline|plumbing|irrigation|fountain|fire hose|fire truck|locomotive|steam engine|aircraft|airplane|helicopter|bicycle|bike|cycling|scooter|skateboard|motorcycle|tractor|harvester|mining truck|truck|lorry|bus\b|tram|museum|specimen|snail|shell|mollusc|diagram|schematic|drawing|blueprint|patent|postage|stamp|coin|sculpture|painting|logo|power plant|boiler|compressor station|water|petrol station|toy|model car|rc car|slot car|gas cylinder|gas bottle|vial|flashtube|flash tube|arc lamp|ultrapure|glowing|neon sign|fluorescent|street light|industrial|demonstration|for sale|DPLA|scania|military|army|police car|ambulance)/i;

// Fotos que son el coche entero o un desguace, no la pieza: fuera.
// Fotos que sí son de coche pero no de la pieza: calles de noche, redadas de
// convertidores robados, desguaces de parachoques y paisajes en un retrovisor.
const PHOTO_JUNK = /(city intersection|zebra crossing|storefront|foggy|sunrise|sunset|drops on|colored|coloured|bibendum|bumper bang|bumper shop|joshin|hillman|dart front bumper|raid|seized|homeland|confiscat|sapeurs|pompiers|fire (engine|brigade|truck)|police|ammunition|for sale|shopping|street scene|downtown|traffic jam|protest|mural|graffiti|bumper (damage|damaged|broken|anyone|ettes)|broken|damaged|dent|rust|winch|4x4|off.?road|tembo|snæfell|unsplash|townsend|pajero|volvo f|pelapone|volkswagen beetle|which is linking|dismantled|(1[89]\d{2}|20[0-2]\d)(?=[A-Z][a-z]))/i;

const WHOLE_VEHICLE = /(hardtop|saloon|sedan|coup[eé]\b|cabriolet|hatchback|convertible|estate car|speedster|model t\b|wheel well|grill detail|bumper crop|missing bumper|broken .*bumper|worn|rusty|shattered|reflected in|front left|front right|rear left|rear right|left side|right side|interior of|engine bay|full time 4wd|\bpickup\b|\bvan\b|\bwagon\b|\btest drive\b|car show|motor show|tuning day|car meet|parking|garage find|scrapyard|junk yard|\btuned\b|2door|2-door|\bskyline\b|\bshogun\b|\bevery\b|E-DR30|DR30|\bF12\b|dozer|caterpillar|ringspann|taipei|101\b|handbook|ducati|kawasaki|harley|motorbike|\b(18|19|20)\d{2}\b|\b(19|20)\d{2}-\d{2}\b)/i;

// Categorías curadas de Commons por categoría del catálogo (en orden de preferencia),
// qué tiene que decir el título (require) y qué se prefiere si hay de sobra (prefer).
const RULES = {
  turbo: {
    cats: ['Turbochargers'],
    searches: ['turbocharger impeller', 'turbocharger cutaway', 'wastegate turbocharger'],
    require: /turbocharger|turbo|wastegate|impeller/i,
    prefer: /turbocharger|wastegate|impeller/i
  },
  intercooler: {
    cats: ['Intercoolers'],
    searches: ['intercooler core', 'top mount intercooler', 'front mount intercooler', 'charge cooler'],
    require: /intercooler|charge cooler/i,
    prefer: /intercooler|charge cooler/i
  },
  'blow-off': {
    cats: ['Blowoff valves'],
    searches: ['blow off valve', 'dump valve turbo', 'diverter valve turbo', 'wastegate turbo'],
    require: /blow.?off|dump valve|diverter valve|wastegate|recirculation valve/i,
    prefer: /blow.?off|dump valve|diverter valve|wastegate/i
  },
  manguitos: {
    cats: ['Hose clamps'],
    searches: ['intercooler hose silicone', 'radiator hose engine', 'coolant hose engine', 'turbo hose engine'],
    require: /(intercooler|radiator|coolant|silicone|turbo|engine).{0,20}hose|hose clamp|clamp/i,
    prefer: /silicone|intercooler|radiator|turbo|coolant|clamp/i
  },
  admision: {
    cats: ['Air filters', 'Intake manifolds', 'Throttle bodies'],
    searches: ['air filter engine', 'intake manifold engine', 'throttle body engine'],
    require: /air filter|intake manifold|throttle body|filter element/i,
    prefer: /air filter|intake manifold|throttle body/i
  },
  escape: {
    cats: ['Exhaust manifolds', 'Exhaust systems', 'Catalytic converters'],
    searches: ['exhaust manifold engine', 'exhaust muffler car', 'catalytic converter car'],
    require: /exhaust (manifold|system|pipe|muffler|silencer)|muffler|silencer|downpipe|catalytic converter/i,
    prefer: /exhaust manifold|muffler|silencer|catalytic converter/i
  },
  'bombillas-led': {
    cats: ['LED lamps', 'Automobile headlamps'],
    searches: ['LED car bulb', 'LED automotive lamp', 'car headlight lamp'],
    require: /(led|light emitting diode).{0,25}(bulb|lamp|headlight|headlamp|car|auto)|(car|automotive).{0,25}(led|bulb|lamp)|headlamp|headlight/i,
    prefer: /led.{0,20}(car|auto|bulb|lamp|head)|(car|auto).{0,20}led/i
  },
  xenon: {
    cats: ['Osram', 'Automobile headlamps', 'Xenon arc lamps'],
    searches: ['xenon headlight car', 'HID headlamp car', 'xenon bulb car'],
    require: /(xenon|hid).{0,30}(headlight|headlamp|bulb|lamp|car)|(headlight|headlamp|bulb).{0,20}(xenon|hid)|d[1-4][rs]\b/i,
    prefer: /xenon|hid|projector/i
  },
  carroceria: {
    cats: ['Automobile tuning', 'Bumpers', 'Spoilers'],
    searches: ['body kit car', 'rear spoiler car', 'bumper tuning car'],
    require: /body kit|bumper|spoiler|side skirt|diffuser/i,
    prefer: /body kit|spoiler|diffuser|side skirt/i
  },
  llantas: {
    cats: ['Alloy wheels', 'Automobile wheels'],
    searches: ['alloy wheel car', 'alloy rim close up'],
    require: /alloy (wheel|rim)|wheel rim|rim\b/i,
    prefer: /alloy (wheel|rim)|rim\b/i
  },
  espejos: {
    cats: ['Automobile outer rear-view mirrors', 'Automobile door mirrors', 'Automobile mirrors'],
    searches: ['car side mirror', 'car wing mirror'],
    require: /(side|outer|door|wing|rear.?view).{0,15}mirror/i,
    prefer: /mirror/i
  },
  suspension: {
    cats: ['Coilovers', 'Shock absorbers'],
    searches: ['coilover suspension car', 'shock absorber car', 'suspension strut car'],
    require: /shock absorber|coilover|damper|suspension strut|coil spring/i,
    prefer: /coilover|shock absorber|damper|strut|spring/i
  },
  frenos: {
    cats: ['Brake calipers', 'Brake disks', 'Disk brakes'],
    searches: ['brake disc car', 'brake caliper car', 'brake pad car'],
    require: /brake (disc|disk|rotor|caliper|pad|hose)|disc brake|caliper/i,
    prefer: /brake (disc|disk|rotor|caliper|pad)/i
  },
  electronica: {
    cats: ['Spark plugs', 'Engine control unit'],
    searches: ['spark plug ignition', 'engine control unit car', 'ignition coil engine'],
    require: /engine control unit|ecu\b|spark plug|ignition coil|glow plug/i,
    prefer: /spark plug|ignition coil|engine control unit|ecu/i
  },
  interior: {
    cats: ['Steering wheels', 'Gear sticks', 'Automobile seats'],
    searches: ['steering wheel car interior', 'gear stick car', 'car seat interior'],
    require: /steering wheel|gear stick|shift knob|gear lever|car seat/i,
    prefer: /steering wheel|gear stick|shift knob|gear lever|seat/i
  },
  lubricantes: {
    cats: ['Castrol', 'Motor oil', 'Oil filters'],
    searches: ['motor oil bottle', 'engine oil can', 'oil filter engine'],
    require: /motor oil|engine oil|oil (bottle|can|filter)|castrol/i,
    prefer: /motor oil|engine oil|oil filter|castrol/i
  },
  transmision: {
    cats: ['Gear sticks', 'Clutches'],
    searches: ['gear stick car', 'clutch disc engine', 'gear shifter car'],
    require: /clutch|gearbox|gear stick|gear lever|shifter|transmission/i,
    prefer: /clutch|gearbox|gear stick|shifter/i
  }
};

const GOOD_LICENSE = /^(cc0|public domain|pd|cc-pd-mark|cc by 1\.0|cc by 2\.0|cc by 2\.5|cc by 3\.0|cc by 4\.0|cc by-sa 1\.0|cc by-sa 2\.0|cc by-sa 2\.5|cc by-sa 3\.0|cc by-sa 4\.0)$/i;

const stripTags = s => (s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const sleep = ms => new Promise(r => setTimeout(r, ms));

// La salida se duplica en un fichero para poder seguir el progreso aunque
// la salida estándar vaya en búfer.
const LOG = '.tmp/photos.log';
const rawLog = console.log.bind(console);
console.log = (...args) => {
  const line = args.join(' ');
  rawLog(line);
  try { fsSync.appendFileSync(LOG, line + '\n'); } catch { /* da igual */ }
};

async function api(params, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const url = new URL(API);
    url.search = new URLSearchParams({ format: 'json', ...params });
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      const json = JSON.parse(await res.text());
      if (json.error) throw new Error(json.error.info || 'API error');
      return json;
    } catch (err) {
      if (i === tries - 1) throw err;
      await sleep(3000 * (i + 1)); // la API corta si se va rápido
    }
  }
  return {};
}

/** Convierte una página de la API en candidata, o null si no sirve. */
function normalize(page, source) {
  const info = page.imageinfo?.[0];
  if (!info?.thumburl) return null;
  // El original tiene que ser una foto: un SVG es un diagrama, no una pieza real.
  if (info.mime === 'image/svg+xml') return null;
  if (!/\.(jpe?g|png|webp)$/i.test(String(info.url || '').split('?')[0])) return null;
  if (!/\.(jpe?g|png|webp)$/i.test(info.thumburl.split('?')[0])) return null;
  const license = stripTags(info.extmetadata?.LicenseShortName?.value);
  if (!GOOD_LICENSE.test(license)) return null;
  if ((info.width || 0) < 500 || (info.height || 0) < 350) return null;
  const title = page.title.replace(/^File:/, '');
  if (BLOCK.test(title) || WHOLE_VEHICLE.test(title) || PHOTO_JUNK.test(title)) return null;
  return {
    title: page.title,
    page: page.title,
    fileUrl: info.descriptionurl,
    imageUrl: info.thumburl,
    license,
    artist: stripTags(info.extmetadata?.Artist?.value) || 'Wikimedia Commons',
    credit: stripTags(info.extmetadata?.Credit?.value),
    source
  };
}

// La API devuelve los archivos por lotes (~50 con imageinfo), así que hay que
// seguir la continuación o la categoría se queda a medias.
async function fromCategory(name, maxBatches = 5) {
  const collected = [];
  let cont = {};
  for (let batch = 0; batch < maxBatches; batch++) {
    const json = await api({
      action: 'query',
      generator: 'categorymembers',
      gcmtitle: `Category:${name}`,
      gcmtype: 'file',
      gcmlimit: '200',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: '1200',
      ...cont
    });
    collected.push(...Object.values(json.query?.pages || {}));
    if (!json.continue) break;
    cont = json.continue;
    await sleep(900);
  }
  return collected;
}

// Búsqueda libre dentro de Commons (generator=search). Amplía mucho el surtido cuando
// las categorías ya se han quedado sin fotos sin usar; el filtro de título sigue igual.
async function fromSearch(query, maxBatches = 3) {
  const collected = [];
  let cont = {};
  for (let batch = 0; batch < maxBatches; batch++) {
    const json = await api({
      action: 'query',
      generator: 'search',
      gsrsearch: `filetype:bitmap ${query}`,
      gsrnamespace: '6',
      gsrlimit: '50',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: '1200',
      ...cont
    });
    collected.push(...Object.values(json.query?.pages || {}));
    if (!json.continue) break;
    cont = json.continue;
    await sleep(900);
  }
  return collected;
}

const force = process.argv.includes('--force');
const onlyCat = process.argv[2] === '--cat' ? process.argv[3] : null;

const catalog = JSON.parse(await fs.readFile(CATALOG, 'utf8'));
let meta = { updated: null, note: '', images: {} };
try { meta = JSON.parse(await fs.readFile(META, 'utf8')); } catch { /* primera vez */ }

await fs.mkdir(OUT_DIR, { recursive: true });

// Purga: se descartan las fotos ya guardadas cuyo título no pasa las reglas de hoy
// (coches enteros, camiones, viales de xenon…) para que se elija otra. Así, al
// endurecer las reglas, lo antiguo que no vale se reemplaza en la misma pasada.
const catOf = new Map(catalog.items.map(i => [i.id, i.category]));
let purged = 0;
for (const [id, m] of Object.entries({ ...meta.images })) {
  const spec = RULES[catOf.get(id)];
  const title = String(m.title || '').replace(/^File:/, '');
  const bad = !spec || BLOCK.test(title) || WHOLE_VEHICLE.test(title) || PHOTO_JUNK.test(title) || !spec.require.test(title);
  const missing = !fsSync.existsSync(path.join(OUT_DIR, `${id}.jpg`));
  if (bad || missing) {
    delete meta.images[id];
    await fs.rm(path.join(OUT_DIR, `${id}.jpg`), { force: true });
    purged++;
  }
}
if (purged) console.log(`Purgadas ${purged} fotos que ya no cumplen las reglas\n`);

const items = catalog.items.filter(i => i.source !== 'tienda' && (!onlyCat || i.category === onlyCat));
const usedPages = new Set(Object.values(meta.images).map(m => m.page));
const usedHashes = new Set(Object.values(meta.images).map(m => m.sha1).filter(Boolean));

const byCategory = {};
for (const item of items) (byCategory[item.category] = byCategory[item.category] || []).push(item);

let done = 0;
let fallback = 0;

for (const [category, list] of Object.entries(byCategory)) {
  const spec = RULES[category] || { cats: [], searches: [], require: /./, prefer: /./ };
  const pool = [];
  const seen = new Set();
  let rejected = 0;

  const add = (pages, source, needsCarWord = !AUTO_SAFE.has(source)) => {
    for (const p of pages) {
      const cand = normalize(p, source);
      if (!cand) continue;
      if (usedPages.has(cand.page) || seen.has(cand.page)) continue;
      const title = cand.title;
      if (!spec.require.test(title)) { rejected++; continue; }
      if (needsCarWord && !AUTO_CTX.test(title)) { rejected++; continue; }
      cand.prefer = spec.prefer.test(title);
      seen.add(cand.page);
      pool.push(cand);
    }
  };

  for (const cat of spec.cats) {
    try {
      add(await fromCategory(cat), cat);
    } catch (err) {
      console.warn(`  ! categoría "${cat}" falló: ${err.message}`);
    }
    await sleep(1100);
  }

  // Las búsquedas ya van con la pieza y el coche en la consulta, así que el título
  // solo tiene que hablar de la pieza (regla `require`).
  for (const q of spec.searches || []) {
    try {
      add(await fromSearch(q), `search:${q}`, false);
    } catch (err) {
      console.warn(`  ! búsqueda "${q}" falló: ${err.message}`);
    }
    await sleep(1100);
  }

  // Las que mencionan la pieza de forma más concreta, primero.
  pool.sort((a, b) => Number(b.prefer) - Number(a.prefer));

  console.log(`\n${category}: ${list.length} piezas · ${pool.length} fotos válidas (${rejected} descartadas por título)`);

  for (const item of list) {
    if (!force && meta.images[item.id] && await fs.access(path.join(OUT_DIR, `${item.id}.jpg`)).then(() => true, () => false)) {
      console.log(`  = ${item.id} (ya tenía foto)`);
      done++;
      continue;
    }

    // Si la descarga falla (el CDN corta por tasa), se prueba con la siguiente foto.
    let saved = false;
    let lastError = 'sin foto libre válida';
    for (let attempt = 0; attempt < 4 && !saved; attempt++) {
      const pick = pool.shift();
      if (!pick) break;
      try {
        const res = await fetch(pick.imageUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('no es una imagen');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 12000) throw new Error(`demasiado pequeña (${buf.length} B)`);
        const sha1 = crypto.createHash('sha1').update(buf).digest('hex');
        if (usedHashes.has(sha1)) throw new Error('foto repetida');

        await fs.writeFile(path.join(OUT_DIR, `${item.id}.jpg`), buf);
        usedPages.add(pick.page);
        usedHashes.add(sha1);
        meta.images[item.id] = {
          title: pick.title,
          page: pick.page,
          fileUrl: pick.fileUrl,
          license: pick.license,
          artist: pick.artist,
          credit: pick.credit,
          source: pick.source,
          path: `/img/recambios/${item.id}.jpg`,
          bytes: buf.length,
          sha1
        };
        console.log(`  + ${item.id} · ${pick.license} · ${(buf.length / 1024).toFixed(0)} KB · ${pick.title.replace(/^File:/, '')}`);
        done++;
        saved = true;
      } catch (err) {
        lastError = err.message;
        // El CDN de imágenes corta por tasa; se espera de verdad antes de reintentar.
        await sleep(6000 * (attempt + 1));
      }
    }
    if (!saved) {
      console.log(`  - ${item.id}: ${lastError}, se queda la de categoría`);
      fallback++;
    }
    await sleep(1300);

    if ((done + fallback) % 25 === 0) {
      meta.updated = new Date().toISOString().slice(0, 10);
      await fs.writeFile(META, JSON.stringify(meta, null, 2));
    }
  }
}

meta.updated = new Date().toISOString().slice(0, 10);
meta.note = 'Fotos de referencia por pieza desde Wikimedia Commons (CC0, dominio público, CC BY y CC BY-SA), elegidas de categorías de automoción y con la página original y el autor para cumplir la atribución. No son fotos del producto exacto.';
await fs.writeFile(META, JSON.stringify(meta, null, 2));
console.log(`\nFotos propias: ${done} · sin foto propia: ${fallback} · total metadatos: ${Object.keys(meta.images).length}`);
