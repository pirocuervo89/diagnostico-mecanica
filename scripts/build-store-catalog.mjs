#!/usr/bin/env node
/**
 * Reconstruye el catálogo de recambios de tuning con productos reales de
 * Amazon.es: foto del vendedor, precio comprobado y enlace directo /dp/ASIN.
 *
 * - Conserva las fichas de tienda que ya existían.
 * - Archiva el catálogo curado anterior en data/tuning-products.curated.json.
 * - Descarga las fotos en public/img/tienda/<ASIN>.jpg.
 *
 * Uso: node scripts/build-store-catalog.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'data/tuning-products.json');
const CURATED = path.join(ROOT, 'data/tuning-products.curated.json');
const IMG_DIR = path.join(ROOT, 'public/img/tienda');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml'
};
const TARGET_PER_CATEGORY = 10;
const MAX_PER_QUERY = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CONFIG = {
  turbo: {
    queries: ['turbo coche', 'turbocharger coche', 'turbocompresor coche', 'turbo Garrett coche', 'turbo K03 coche', 'turbo K04 coche'],
    req: /\bturbo|turbocharger|turbocompresor\b/,
    ban: /ambientador|perfume|olor|pegatina|sticker|emblema|adorno|logo|letra|tapón|tapon|v[aá]lvula|wastegate|medidor|reloj|indicador|sensor|manguito|intercooler|controlador|aceite|limpiador|actuador|actuator|el[eé]ctric|e-booster|ventilador|motor de turbocompresor|kit de admisi[oó]n/,
    note: 'Turbo de reposición o mejora. Antes de comprar, compara referencia, bridas y caudal con el turbo original.'
  },
  intercooler: {
    queries: ['intercooler coche', 'intercooler universal', 'radiador intercooler coche'],
    req: /intercooler|intercambiador/,
    ban: /manguito|tubería|tuberia|sensor|emblema|pegatina|limpiador/,
    note: 'Intercooler para bajar la temperatura de admisión. Comprueba medidas, conexiones y espacio en el vano.'
  },
  'blow-off': {
    queries: ['válvula descarga blow off coche', 'blow off valve coche', 'dump valve coche'],
    req: /blow\s*off|descarga|dump\s*valve|\bbov\b/,
    ban: /herramienta|manguito|tubería|tuberia|adaptador|soporte|muelle/,
    note: 'Válvula de descarga. Revisa tipo de brida, muelle y si el motor necesita recirculación para no dar error.'
  },
  manguitos: {
    queries: ['manguitos silicona turbo coche', 'manguito silicona intercooler', 'kit manguitos silicona coche', 'manguito turbo silicona', 'abrazadera manguito turbo'],
    req: /manguito|silicona|abrazadera/,
    ban: /pegatina|emblema|herramienta|alicate|llave|tubo de escape|vac[ií]o|limpiaparabrisas/,
    note: 'Manguito de silicona reforzado. Mide el diámetro interior y confirma que soporta la presión de soplado.'
  },
  admision: {
    queries: ['kit admisión aire deportivo coche', 'filtro aire deportivo cónico coche', 'admisión directa coche'],
    req: /admisi[oó]n|filtro de aire|filtro aire|air intake/,
    ban: /filtro de aceite|filtro de combustible|filtro de habit[aá]culo|ambientador|limpiador|pegatina|emblema|compresor/,
    note: 'Admisión o filtro deportivo. Comprueba diámetro, sensor MAF y si necesitas homologación o ajuste de centralita.'
  },
  escape: {
    queries: ['escape deportivo coche', 'silencioso escape deportivo coche', 'downpipe coche'],
    req: /escape|silencioso|downpipe|colector/,
    ban: /pegatina|emblema|soporte|junta|tornillo|abrazadera|limpiador|pintura|funda|simulador|silbato|sound booster/,
    note: 'Elemento de escape. Verifica diámetro, anclajes y legalidad de emisiones antes de montarlo.'
  },
  'bombillas-led': {
    queries: ['bombillas led coche h7', 'bombillas led coche canbus', 'bombillas led coche h4', 'bombillas led coche h1', 'bombillas led coche h11'],
    req: /led|bombilla/,
    ban: /tira led|luz de ambiente|luz ambiental|interior|usb|ambiental|l[aá]mpara de mesa|foco|linterna|guirnalda|panel solar|festoon|matr[ií]cula|moto/,
    note: 'Bombilla LED para faro. Comprueba casquillo, CANBUS y homologación para circular.'
  },
  xenon: {
    queries: ['bombilla xenon coche d1s', 'bombilla xenon coche d2s', 'kit xenon coche hid'],
    req: /xen[oó]n|\bhid\b|d1s|d2s|d3s|d4s/,
    ban: /\bled\b|linterna|l[aá]mpara de mesa/,
    note: 'Lámpara o kit de xenón. Confirma casquillo, balastro y que el faro sea compatible con descarga.'
  },
  carroceria: {
    queries: ['alerón universal coche', 'difusor universal coche', 'faldones laterales coche', 'paragolpes tuning coche', 'taloneras deportivas coche', 'labio paragolpes universal', 'spoiler universal coche'],
    req: /aler[oó]n|spoiler|difusor|fald[oó]n|talonera|paragolpes|parachoques/,
    ban: /protector|protecci[oó]n|rejilla|embellecedor|adhesivo|goma|tira|pegatina|emblema|kit de fijaci[oó]n|tornillo|remache|alfombra|moqueta/,
    note: 'Pieza de carrocería o aerodinámica. Comprueba medidas, anclajes y acabado antes de pintar o montar.'
  },
  llantas: {
    queries: ['llanta aleación coche 17 pulgadas', 'llanta aleación coche 18 pulgadas', 'llanta coche 5x112', 'llanta aleación coche 19 pulgadas', 'llanta aleación coche 20 pulgadas'],
    req: /llanta|\brin\b|wheel/,
    ban: /moto|scooter|beb[eé]|juguete|tapa|tap[oó]n|tuerca|v[aá]lvula|neum[aá]tico|funda|protector|limpiador|limpia|llave|atv|utv|kart|remolque|carretilla|\b(1\.\d+|2\.\d+|3\.00)\s*[xX]/,
    note: 'Llanta de aleación. Verifica diámetro, anchura, ET, buje y tornillería antes de comprar.'
  },
  espejos: {
    queries: ['carcasa espejo retrovisor lateral coche', 'espejo retrovisor lateral coche', 'cristal espejo retrovisor lateral coche', 'intermitente espejo retrovisor coche'],
    req: /espejo|retrovisor/,
    ban: /beb[eé]|interior|panor[aá]mic|instructor|punto ciego|ventosa|clip|asiento/,
    note: 'Espejo o carcasa lateral. Confirma lado, forma, conexión eléctrica y si es calefactable.'
  },
  suspension: {
    queries: ['suspensión roscada coilover coche', 'amortiguadores deportivos coche', 'kit suspensión coche'],
    req: /suspensi[oó]n|coilover|amortiguador|muelle/,
    ban: /herramienta|compresor de muelle|pegatina|emblema|funda|protector|taco|silentblock/,
    note: 'Suspensión o amortiguador. Revisa compatibilidad por referencia, altura y necesidad de homologación.'
  },
  frenos: {
    queries: ['discos freno coche', 'pastillas freno coche', 'kit frenos deportivo coche', 'pastillas freno brembo', 'discos freno brembo', 'pastillas freno ate'],
    req: /freno|frenos|disco|pastilla/,
    ban: /l[ií]quido|limpiador|pintura|herramienta|sangrador|funda|pegatina|emblema|tapa|sram|bici|bicicleta|etap|mtb/,
    note: 'Componente de freno. Comprueba medida, eje y referencia; no mezcles compuestos sin revisar el equilibrio.'
  },
  electronica: {
    queries: ['escáner obd2 coche', 'máquina diagnosis coche obd2', 'adaptador obd2 coche', 'lector obd2 coche', 'interfaz obd2 coche'],
    req: /obd|diagnosis|diagn[oó]stico|esc[aá]ner|scanner/,
    ban: /c[aá]mara|radio|gps|barcode|c[oó]digo de barras|antena|altavoz|buj[ií]a|encendido/,
    note: 'Herramienta de diagnosis o adaptador OBD. Comprueba protocolos, app compatible y tipo de conexión.'
  },
  interior: {
    queries: ['volante deportivo coche', 'funda volante coche', 'pomo cambio coche'],
    req: /volante|pomo|palanca de cambios|funda/,
    ban: /pegatina|emblema|adhesivo|limpiador|protector de pantalla|soporte de tel[eé]fono/,
    note: 'Elemento de interior. Verifica diámetro, anclaje y compatibilidad con airbag y mandos.'
  },
  lubricantes: {
    queries: ['aceite motor 5w30 sintético coche', 'aceite motor 5w40 sintético coche', 'aceite motor 5w30 diésel', 'aceite motor 0w20 coche', 'aceite caja cambios coche', 'aceite motor 5w30', 'aceite motor 0w30', 'aceite motor 10w40', 'aceite motor dexos', 'aceite motor sintético 5w30'],
    req: /aceite/,
    ban: /aceite de oliva|esencial|cocina|\b[24]t\b|2 tiempos|motocicleta|moto|scooter|cortac[eé]sped|limpiador|aditivo|freno|direcci[oó]n/,
    note: 'Aceite o fluido. Confirma viscosidad, norma del fabricante y capacidad del cárter.'
  },
  transmision: {
    queries: ['kit embrague coche', 'volante bimasa coche', 'kit embrague volante bimasa', 'transmisión coche'],
    req: /embrague|clutch|transmisi[oó]n|volante bimasa|bimasa/,
    ban: /cable|pedal|herramienta|funda|pegatina|limpiador/,
    note: 'Kit de embrague o transmisión. Comprueba referencia, diámetro y si incluye volante bimasa.'
  }
};

const BRANDS = [
  'Bosch', 'Valeo', 'Sachs', 'LUK', 'Febi Bilstein', 'Mapco', 'RIDEX', 'Frankberg',
  'maXpeedingrods', 'Repsol', 'Osram', 'Philips', 'Autel', 'Launch', 'TOPDON', 'Vgate',
  'ANCEL', 'Simoni Racing', 'Momo', 'Autec', 'Rial', 'MAM', 'OCC Motorsport', 'Briteye',
  'XELORD', 'WinPower', 'AUXITO', 'SEALIGHT', 'Marsauto', 'SUPAREE', 'QUARKZMAN',
  'Swpeet', 'Glarks', 'GOTOTOP', 'Pindex', 'Ramair', 'VAN WEZEL', 'ATEC', 'Brembo',
  'ATE', 'TRW', 'Ferodo', 'Textar', 'Zimmermann', 'SKF', 'NRG', 'Sparco'
];

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clean(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function brandOf(title) {
  const found = BRANDS.find(b => title.toLowerCase().includes(b.toLowerCase()));
  if (found) return found;
  const first = title.split(/[\s,|]+/).find(w => w.length > 2 && !/^\d/.test(w));
  return (first || 'Tienda').replace(/[^\p{L}\p{N}+.-]/gu, '');
}

function priceValue(text) {
  const normalized = String(text || '').replace(/\./g, '').replace(',', '.').match(/\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : null;
}

async function search(query) {
  const url = `https://www.amazon.es/s?k=${encodeURIComponent(query)}&i=automotive`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Amazon respondió ${res.status}`);
  const html = await res.text();
  const parts = html.split('data-asin="').slice(1);
  const out = [];
  const seen = new Set();

  for (const part of parts) {
    const asin = part.slice(0, 10);
    if (!/^[A-Z0-9]{10}$/.test(asin) || seen.has(asin)) continue;
    seen.add(asin);
    const block = part.slice(0, 16000);
    if (/sponsored-ads\.amazon\.es/.test(block)) continue;

    const imgTag = (block.match(/<img[^>]*class="s-image"[^>]*>/) || [])[0] || '';
    const src = (imgTag.match(/src="([^"]+)"/) || [])[1] || '';
    const alt = (imgTag.match(/alt="([^"]*)"/) || [])[1] || '';
    const title = clean((block.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || '') || clean(alt);
    const price = clean((block.match(/<span class="a-offscreen">([^<]+)<\/span>/) || [])[1] || '');
    if (!src || !title) continue;

    out.push({
      asin,
      title,
      price,
      src: src.replace(/\._[A-Z0-9_,]+_\./, '._AC_UL640_.')
    });
    if (out.length >= 18) break;
  }
  return out;
}

async function downloadImage(url, asin) {
  const file = path.join(IMG_DIR, `${asin}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 8000) return true;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8000) return false;
    fs.writeFileSync(file, buf);
    return true;
  } catch {
    return false;
  }
}

function makeItem(product, category, cfg) {
  const title = product.title.slice(0, 180);
  const query = title.slice(0, 90);
  return {
    id: `tienda-amz-${product.asin.toLowerCase()}`,
    name: title,
    brand: brandOf(title),
    category,
    cars: [],
    fitment: ['Universal · comprueba medida, referencia y compatibilidad antes de comprar'],
    note: `${cfg.note} Producto real de tienda; el precio y el stock pueden cambiar.`,
    price: product.price || 'Consultar',
    priceValue: priceValue(product.price),
    query,
    source: 'tienda',
    image: `/img/tienda/${product.asin}.jpg`,
    photoKind: 'tienda',
    photoCredit: null,
    links: [
      { shop: 'Amazon', label: 'Ver en Amazon', url: `https://www.amazon.es/dp/${product.asin}` },
      { shop: 'eBay', label: 'Buscar en eBay', url: `https://www.ebay.es/sch/i.html?_nkw=${encodeURIComponent(query)}` }
    ]
  };
}

async function main() {
  if (!fs.existsSync(CATALOG)) throw new Error('No existe data/tuning-products.json');
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const cleanBuild = process.argv.includes('--clean');
  const current = readJSON(cleanBuild && fs.existsSync(CURATED) ? CURATED : CATALOG);
  if (!fs.existsSync(CURATED)) {
    fs.writeFileSync(CURATED, JSON.stringify(current, null, 2) + '\n');
    console.log(`Archivado catálogo curado en ${path.relative(ROOT, CURATED)}`);
  }

  const categories = current.categories || [];
  const legacy = (current.items || []).filter(i => {
    if (i.source !== 'tienda') return false;
    const cfg = CONFIG[i.category];
    if (!cfg) return false;
    const text = String(i.name || '').toLowerCase();
    return cfg.req.test(text) && !cfg.ban.test(text);
  });
  const usedAsins = new Set();
  for (const item of legacy) {
    const m = String(item.id).match(/amz-([a-z0-9]{10})$/i);
    if (m) usedAsins.add(m[1].toUpperCase());
  }

  const items = [...legacy];
  const report = [];

  for (const category of categories) {
    const cfg = CONFIG[category.id];
    if (!cfg) continue;
    const existing = items.filter(i => i.category === category.id).length;
    const needed = Math.max(0, TARGET_PER_CATEGORY - existing);
    if (!needed) {
      report.push({ category: category.id, legacy: existing, added: 0 });
      continue;
    }

    const accepted = [];
    const seen = new Set();
    for (const query of cfg.queries) {
      let perQuery = 0;
      try {
        const results = await search(query);
        for (const product of results) {
          if (accepted.length >= needed) break;
          if (perQuery >= MAX_PER_QUERY) break;
          if (usedAsins.has(product.asin) || seen.has(product.asin)) continue;
          const text = product.title.toLowerCase();
          if (!cfg.req.test(text) || cfg.ban.test(text)) continue;
          const ok = await downloadImage(product.src, product.asin);
          if (!ok) continue;

          seen.add(product.asin);
          usedAsins.add(product.asin);
          accepted.push(makeItem(product, category.id, cfg));
          perQuery += 1;
          await sleep(250);
        }
      } catch (err) {
        console.warn(`[${category.id}] ${query}: ${err.message}`);
      }
      if (accepted.length >= needed) break;
      await sleep(900);
    }

    items.push(...accepted);
    report.push({ category: category.id, legacy: existing, added: accepted.length });
    console.log(`${category.id}: ${existing} existentes + ${accepted.length} nuevos`);
    await sleep(800);
  }

  const byCategory = {};
  for (const item of items) byCategory[item.category] = (byCategory[item.category] || 0) + 1;
  const payload = {
    ...current,
    updated: new Date().toISOString().slice(0, 10),
    disclaimer: 'Catálogo de productos reales de tienda: cada ficha enlaza a su publicación de Amazon y muestra la foto del vendedor. El precio y el stock pueden cambiar. Las piezas son universales o requieren comprobar medida, referencia y compatibilidad con tu motor antes de comprar; la foto no garantiza el ajuste.',
    affiliate: {
      status: 'sin_cuenta',
      note: 'Los enlaces son directos a Amazon y todavía no llevan identificador de afiliado. Al dar de alta Amazon Associates, añade el parámetro de seguimiento en cada enlace desde data/tuning-products.json.'
    },
    stats: {
      ...(current.stats || {}),
      items: items.length,
      categories: categories.length,
      cars: (current.cars || []).length,
      shopItems: items.length,
      photos: items.filter(i => i.image).length,
      store: items.length,
      byCategory,
      lastSync: new Date().toISOString()
    },
    items
  };
  fs.writeFileSync(CATALOG, JSON.stringify(payload, null, 2) + '\n');

  const missing = categories.filter(c => (report.find(r => r.category === c.id)?.legacy || 0) + (report.find(r => r.category === c.id)?.added || 0) < 6);
  console.log(`\nTotal: ${items.length} fichas de tienda en ${categories.length} categorías.`);
  if (missing.length) console.warn(`Categorías con menos de 6 fichas: ${missing.map(c => c.id).join(', ')}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
