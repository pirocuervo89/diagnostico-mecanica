#!/usr/bin/env node
/**
 * Amplía data/products.json con recambios reales de Amazon.es.
 *
 * - No inventa nada: cada ficha sale de una búsqueda real y guarda su ASIN,
 *   su precio leído en la página y la foto del vendedor.
 * - Deduplica por ASIN contra todo lo que ya existe en el catálogo.
 * - Respeta el esquema de las fichas actuales (mismo formato que las 500 que ya
 *   hay), así la web y la app las pintan sin tocar el frontend.
 * - Los enlaces se guardan sin etiqueta de afiliado: la etiqueta se añade al
 *   servirlos (AFFILIATE_TAG_AMAZON / data/legal.json).
 *
 * Uso:
 *   node scripts/expand-parts.mjs                # todas las consultas
 *   node scripts/expand-parts.mjs --dry 3        # solo 3 consultas, sin guardar
 *   node scripts/expand-parts.mjs --limit 8      # máximo 8 fichas por consulta
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = path.join(ROOT, 'data/products.json');
const IMG_DIR = path.join(ROOT, 'public/img/productos');
const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0';
const HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'es-ES,es;q=0.9',
  'Accept': 'text/html,application/xhtml+xml'
};
const DRY = process.argv.includes('--dry');
const DRY_COUNT = DRY ? Number(process.argv[process.argv.indexOf('--dry') + 1]) || 3 : 0;
const MAX_PER_QUERY = Math.max(1, Number(process.argv[process.argv.indexOf('--limit') + 1]) || 6);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const BRANDS = [
  'Bosch', 'Mann', 'Mann-Filter', 'Mahle', 'Knecht', 'Filtron', 'Purflux', 'UFI', 'Hengst',
  'Febi Bilstein', 'Febi', 'Brembo', 'ATE', 'TRW', 'Textar', 'Ferodo', 'Valeo', 'Sachs',
  'LuK', 'SKF', 'INA', 'Contitech', 'Gates', 'Dayco', 'NGK', 'Denso', 'Beru', 'Champion',
  'Castrol', 'Mobil', 'Mobil 1', 'Total', 'TotalEnergies', 'Shell', 'Motul', 'Liqui Moly',
  'Liqui-Moly', 'Repsol', 'Cepsa', 'ELF', 'Fuchs', 'Ravenol', 'Kroon-Oil', 'Valvoline',
  'Cartechnic', 'Mannol', 'Eurol', 'Gulf', 'Petronas', 'Selenia', 'Helix', 'Varta',
  'Exide', 'Tudor', 'Banner', 'Yuasa', 'Febi', 'Lemförder', 'Lemforder', 'Meyle', 'Sidem',
  'Monroe', 'KYB', 'Bilstein', 'Sachs', 'Eibach', 'Febi', 'Nissens', 'Valeo', 'Hella',
  'Osram', 'Philips', 'Narva', 'AIC', 'Topran', 'Metzger', 'Pierburg', 'Vemo', 'Hella',
  'Febi Bilstein', 'Blue Print', 'Japanparts', 'Ashika', 'RIDEX', 'Stark', 'Febi'
];

const CATS = {
  Repuestos: { productType: 'recambio', note: 'Recambio de sustitución. Comprueba referencia, medida y compatibilidad con el motor antes de comprar.' },
  'Líquidos y Químicos': { productType: 'lubricante', note: 'Lubricante o fluido. Verifica la especificación del fabricante (viscosidad, norma ACEA/API, homologación) antes de comprar.' },
  Tuning: { productType: 'tuning', note: 'Pieza de mejora o estética. Comprueba medida, anclajes y homologación antes de comprar.' },
  Herramientas: { productType: 'herramienta', note: 'Herramienta universal; comprueba medidas y especificaciones antes de comprar.' },
  Diagnosis: { productType: 'diagnosis', note: 'Equipo de diagnosis o sensor de lectura. Comprueba protocolo y compatibilidad antes de comprar.' }
};

/**
 * Cada consulta: qué busca, dónde cae en el catálogo y qué texto debe cumplir
 * el título para no colar un producto que no es (ambientadores, pegatinas...).
 */
const QUERIES = [
  // ---- ACEITES Y FLUIDOS ----
  { q: 'aceite motor 5w30 sintetico 5 litros', category: 'Líquidos y Químicos', subcategory: 'Aceite motor 5W-30', req: /5\s?w\s?-?\s?30|5w30/i, ban: /aditivo|limpiador|ambientador|filtro|tapón|tapon|embudo|bomba/i, tags: ['aceite', '5w30', 'motor'] },
  { q: 'aceite motor 5w40 sintetico 5 litros', category: 'Líquidos y Químicos', subcategory: 'Aceite motor 5W-40', req: /5\s?w\s?-?\s?40|5w40/i, ban: /aditivo|limpiador|ambientador|filtro|tapón|tapon|embudo|bomba/i, tags: ['aceite', '5w40', 'motor'] },
  { q: 'aceite motor 0w20 sintetico coche', category: 'Líquidos y Químicos', subcategory: 'Aceite motor 0W-20', req: /0\s?w\s?-?\s?20|0w20/i, ban: /aditivo|limpiador|filtro|tapón|tapon|embudo/i, tags: ['aceite', '0w20', 'motor'] },
  { q: 'aceite motor 0w30 sintetico coche', category: 'Líquidos y Químicos', subcategory: 'Aceite motor 0W-30', req: /0\s?w\s?-?\s?30|0w30/i, ban: /aditivo|limpiador|filtro|tapón|tapon|embudo/i, tags: ['aceite', '0w30', 'motor'] },
  { q: 'aceite motor 10w40 semisintetico coche', category: 'Líquidos y Químicos', subcategory: 'Aceite motor 10W-40', req: /10\s?w\s?-?\s?40|10w40/i, ban: /aditivo|limpiador|filtro|tapón|tapon|embudo|moto|2t|4t/i, tags: ['aceite', '10w40', 'motor'] },
  { q: 'aceite caja cambios automatica atf dexron', category: 'Líquidos y Químicos', subcategory: 'Aceite caja automática ATF', req: /atf|dexron|mercon|transmisi[oó]n|caja autom[aá]tica/i, ban: /filtro|aditivo|limpiador|direcci[oó]n/i, tags: ['atf', 'caja automatica', 'fluido'] },
  { q: 'valvulina aceite caja cambios manual 75w90', category: 'Líquidos y Químicos', subcategory: 'Valvulina 75W-90', req: /75\s?w\s?-?\s?90|75w90|valvulina/i, ban: /aditivo|limpiador|filtro|automatic/i, tags: ['valvulina', '75w90', 'caja manual'] },
  { q: 'liquido frenos dot 4 coche', category: 'Líquidos y Químicos', subcategory: 'Líquido de frenos DOT 4', req: /dot\s?4|dot4/i, ban: /purga|sangrador|herramienta|filtro/i, tags: ['frenos', 'dot4', 'seguridad'] },
  { q: 'refrigerante anticongelante g12 g13 coche', category: 'Líquidos y Químicos', subcategory: 'Refrigerante G12/G13', req: /refrigerante|anticongelante|g12|g13/i, ban: /limpiador|aditivo|radiador.*tapón|ambientador/i, tags: ['refrigerante', 'anticongelante', 'motor'] },
  { q: 'limpiaparabrisas liquido concentrado coche', category: 'Líquidos y Químicos', subcategory: 'Limpiaparabrisas', req: /limpiaparabrisas|parabrisas/i, ban: /escobilla|brazo|plumilla|funda/i, tags: ['limpiaparabrisas', 'mantenimiento'] },
  { q: 'aditivo limpiador inyectores diesel', category: 'Líquidos y Químicos', subcategory: 'Aditivos diésel', req: /aditivo|limpiador/i, ban: /ambientador|pegatina/i, tags: ['aditivo', 'diesel', 'inyectores'] },

  // ---- FILTROS ----
  { q: 'filtro de aceite coche', category: 'Repuestos', subcategory: 'Filtro de aceite', req: /filtro.*aceite|aceite.*filtro/i, ban: /aire|combustible|habit[aá]culo|admisi[oó]n|llave|herramienta/i, tags: ['filtro', 'aceite', 'mantenimiento'] },
  { q: 'filtro de aire motor coche', category: 'Repuestos', subcategory: 'Filtro de aire', req: /filtro.*aire|aire.*filtro/i, ban: /aceite|combustible|habit[aá]culo|admisi[oó]n deportiva|admisi[oó]n directa|ambientador/i, tags: ['filtro', 'aire', 'mantenimiento'] },
  { q: 'filtro habitaculo carbon activo coche', category: 'Repuestos', subcategory: 'Filtro de habitáculo', req: /habit[aá]culo|carb[oó]n activo|antipolen|polen/i, ban: /aceite|combustible|ambientador/i, tags: ['filtro', 'habitaculo', 'polen'] },
  { q: 'filtro de combustible diesel coche', category: 'Repuestos', subcategory: 'Filtro de combustible', req: /filtro.*(combustible|gasoil|gas[oó]leo|diesel)|(combustible|gasoil|gas[oó]leo|diesel).*filtro/i, ban: /bomba|inyector|aditivo|limpiador/i, tags: ['filtro', 'combustible', 'diesel'] },
  { q: 'filtro gasolina coche', category: 'Repuestos', subcategory: 'Filtro de gasolina', req: /filtro.*gasolina|gasolina.*filtro/i, ban: /bomba|inyector|aditivo|limpiador/i, tags: ['filtro', 'gasolina'] },
  { q: 'kit filtros aceite aire habitaculo coche', category: 'Repuestos', subcategory: 'Kit de filtros', req: /kit|juego|pack/i, ban: /herramienta|llave|ambientador/i, tags: ['filtro', 'kit', 'mantenimiento'] },

  // ---- FRENOS ----
  { q: 'pastillas de freno delanteras coche', category: 'Repuestos', subcategory: 'Pastillas de freno', req: /pastilla/i, ban: /limpiador|aditivo|pintura|funda|herramienta|sensor/i, tags: ['frenos', 'pastillas', 'seguridad'] },
  { q: 'discos de freno delanteros coche', category: 'Repuestos', subcategory: 'Discos de freno', req: /disco/i, ban: /pastilla|tapa|funda|pintura|herramienta|limpiador/i, tags: ['frenos', 'discos', 'seguridad'] },
  { q: 'latiguillo freno coche', category: 'Repuestos', subcategory: 'Latiguillos de freno', req: /latiguillo|manguito.*freno|freno.*manguito/i, ban: /funda|herramienta|limpiador/i, tags: ['frenos', 'latiguillo'] },
  { q: 'liquido direccion hidraulica coche', category: 'Líquidos y Químicos', subcategory: 'Líquido dirección', req: /direcci[oó]n/i, ban: /funda|herramienta|volante deportivo/i, tags: ['direccion', 'fluido'] },

  // ---- MOTOR ----
  { q: 'bujias encendido coche juego 4', category: 'Repuestos', subcategory: 'Bujías', req: /buj[ií]a/i, ban: /incandescente|precalentamiento|llave|herramienta|funda/i, tags: ['encendido', 'bujias', 'mantenimiento'] },
  { q: 'bujias incandescentes diesel calentadores', category: 'Repuestos', subcategory: 'Bujías incandescentes', req: /incandescente|calentador|precalentamiento/i, ban: /llave|herramienta|funda/i, tags: ['diesel', 'calentadores', 'encendido'] },
  { q: 'bobina encendido coche', category: 'Repuestos', subcategory: 'Bobinas de encendido', req: /bobina/i, ban: /funda|herramienta|cable.*buj[ií]a/i, tags: ['encendido', 'bobina'] },
  { q: 'kit distribucion correa bomba agua coche', category: 'Repuestos', subcategory: 'Kit de distribución', req: /distribuci[oó]n|correa/i, ban: /herramienta|llave|funda|tapa/i, tags: ['distribucion', 'correa', 'motor'] },
  { q: 'correa alternador accesorios coche', category: 'Repuestos', subcategory: 'Correa de accesorios', req: /correa/i, ban: /herramienta|funda|distribuci[oó]n/i, tags: ['correa', 'alternador', 'motor'] },
  { q: 'bomba de agua coche', category: 'Repuestos', subcategory: 'Bomba de agua', req: /bomba.*agua|agua.*bomba/i, ban: /herramienta|funda|limpiaparabrisas/i, tags: ['refrigeracion', 'bomba', 'motor'] },
  { q: 'termostato refrigerante coche', category: 'Repuestos', subcategory: 'Termostato', req: /termostato/i, ban: /herramienta|funda|sensor/i, tags: ['refrigeracion', 'termostato'] },
  { q: 'radiador refrigeracion coche', category: 'Repuestos', subcategory: 'Radiadores', req: /radiador/i, ban: /funda|herramienta|tapa|manguito|intercooler/i, tags: ['refrigeracion', 'radiador'] },
  { q: 'sensor lambda sonda oxigeno coche', category: 'Repuestos', subcategory: 'Sonda lambda', req: /lambda|sonda|ox[ií]geno/i, ban: /llave|herramienta|funda|limpiador/i, tags: ['sensor', 'lambda', 'emisiones'] },
  { q: 'sensor caudalimetro maf coche', category: 'Repuestos', subcategory: 'Caudalímetro MAF', req: /caudal[ií]metro|maf|flujo.*aire/i, ban: /llave|herramienta|funda|limpiador/i, tags: ['sensor', 'maf', 'admision'] },
  { q: 'sensor presion turbo map coche', category: 'Repuestos', subcategory: 'Sensor de presión MAP', req: /map|presi[oó]n/i, ban: /llave|herramienta|funda|man[oó]metro/i, tags: ['sensor', 'map', 'turbo'] },
  { q: 'sensor abs coche', category: 'Repuestos', subcategory: 'Sensor ABS', req: /abs/i, ban: /llave|herramienta|funda|limpiador/i, tags: ['sensor', 'abs', 'frenos'] },
  { q: 'valvula egr coche', category: 'Repuestos', subcategory: 'Válvula EGR', req: /egr|recirculaci[oó]n/i, ban: /limpiador|aditivo|funda|herramienta/i, tags: ['egr', 'emisiones', 'motor'] },
  { q: 'turbo turbocompresor coche', category: 'Repuestos', subcategory: 'Turbocompresores', req: /turbo/i, ban: /funda|herramienta|pegatina|ambientador|manguito|sensor|v[aá]lvula|reloj|indicador/i, tags: ['turbo', 'motor', 'potencia'] },
  { q: 'intercooler radiador aire coche', category: 'Repuestos', subcategory: 'Intercoolers', req: /intercooler|intercambiador/i, ban: /manguito|funda|herramienta|sensor/i, tags: ['intercooler', 'admision', 'potencia'] },

  // ---- TRANSMISIÓN ----
  { q: 'kit embrague coche volante bimasa', category: 'Repuestos', subcategory: 'Kit de embrague', req: /embrague|bimasa|volante/i, ban: /funda|herramienta|pomo|pedal/i, tags: ['embrague', 'transmision'] },
  { q: 'junta homocinetica transmision coche', category: 'Repuestos', subcategory: 'Homocinéticas', req: /homocin[eé]tica|junta.*transmisi[oó]n|palier/i, ban: /funda|herramienta/i, tags: ['transmision', 'homocinetica'] },
  { q: 'fuelle transmision coche', category: 'Repuestos', subcategory: 'Fueyes de transmisión', req: /fuelle/i, ban: /herramienta|amortiguador/i, tags: ['transmision', 'fuelle'] },

  // ---- SUSPENSIÓN Y DIRECCIÓN ----
  { q: 'amortiguador delantero coche', category: 'Repuestos', subcategory: 'Amortiguadores', req: /amortiguador/i, ban: /funda|herramienta|muelle.*compresor/i, tags: ['suspension', 'amortiguador'] },
  { q: 'rotula suspension coche', category: 'Repuestos', subcategory: 'Rótulas', req: /r[oó]tula/i, ban: /herramienta|funda|extractor/i, tags: ['suspension', 'rotula'] },
  { q: 'silentblock trapecio coche', category: 'Repuestos', subcategory: 'Silentblocks', req: /silentblock|silent block|goma/i, ban: /herramienta|funda/i, tags: ['suspension', 'silentblock'] },
  { q: 'bieleta estabilizadora coche', category: 'Repuestos', subcategory: 'Bieletas', req: /bieleta|estabilizadora/i, ban: /herramienta|funda/i, tags: ['suspension', 'bieleta'] },

  // ---- ELÉCTRICO ----
  { q: 'bateria coche 12v', category: 'Repuestos', subcategory: 'Baterías', req: /bater[ií]a/i, ban: /cargador|mantenedor|funda|bornes|herramienta/i, tags: ['bateria', 'electricidad'] },
  { q: 'alternador coche', category: 'Repuestos', subcategory: 'Alternadores', req: /alternador/i, ban: /funda|herramienta|correa/i, tags: ['alternador', 'electricidad'] },
  { q: 'motor de arranque coche', category: 'Repuestos', subcategory: 'Motores de arranque', req: /arranque/i, ban: /funda|herramienta|bater[ií]a|bot[oó]n/i, tags: ['arranque', 'electricidad'] },
  { q: 'bombilla led h7 coche homologada', category: 'Repuestos', subcategory: 'Bombillas H7', req: /h7/i, ban: /funda|portalamparas|ambientador/i, tags: ['iluminacion', 'h7', 'led'] },
  { q: 'escobillas limpiaparabrisas coche', category: 'Repuestos', subcategory: 'Escobillas', req: /escobilla/i, ban: /brazo|motor|dep[oó]sito|l[ií]quido/i, tags: ['escobillas', 'mantenimiento'] },

  // ---- TUNING ----
  { q: 'filtro aire deportivo conico coche', category: 'Tuning', subcategory: 'Filtros deportivos', req: /filtro|admisi[oó]n/i, ban: /habit[aá]culo|aceite|combustible|ambientador/i, tags: ['tuning', 'admision', 'deportivo'] },
  { q: 'kit admision directa coche', category: 'Tuning', subcategory: 'Admisión directa', req: /admisi[oó]n/i, ban: /filtro de aceite|habit[aá]culo|combustible/i, tags: ['tuning', 'admision'] },
  { q: 'manguitos silicona turbo coche', category: 'Tuning', subcategory: 'Manguitos de silicona', req: /manguito|silicona/i, ban: /funda|ambientador|pegatina/i, tags: ['tuning', 'turbo', 'silicona'] },
  { q: 'valvula blow off coche', category: 'Tuning', subcategory: 'Válvulas de descarga', req: /blow\s?off|descarga|dump/i, ban: /funda|pegatina|ambientador/i, tags: ['tuning', 'turbo', 'blow-off'] },
  { q: 'muelles suspension deportivos coche', category: 'Tuning', subcategory: 'Muelles deportivos', req: /muelle/i, ban: /compresor|herramienta|funda/i, tags: ['tuning', 'suspension'] },
  { q: 'separadores rueda coche', category: 'Tuning', subcategory: 'Separadores', req: /separador/i, ban: /funda|herramienta/i, tags: ['tuning', 'llantas'] },
  { q: 'volante deportivo coche', category: 'Tuning', subcategory: 'Volantes', req: /volante/i, ban: /funda|cubre|herramienta|bomba/i, tags: ['tuning', 'interior'] },
  { q: 'pomo cambio deportivo coche', category: 'Tuning', subcategory: 'Pomos de cambio', req: /pomo/i, ban: /funda|herramienta/i, tags: ['tuning', 'interior'] },

  // ---- HERRAMIENTAS Y DIAGNOSIS ----
  { q: 'llave filtro aceite coche', category: 'Herramientas', subcategory: 'Llaves de filtro', req: /llave|extractor/i, ban: /filtro de aire|ambientador/i, tags: ['herramienta', 'filtro', 'aceite'] },
  { q: 'llave bujias vaso coche', category: 'Herramientas', subcategory: 'Llaves de bujías', req: /llave|vaso/i, ban: /ambientador|funda/i, tags: ['herramienta', 'bujias'] },
  { q: 'gato hidraulico coche', category: 'Herramientas', subcategory: 'Gatos hidráulicos', req: /gato/i, ban: /funda|ambientador|juguete/i, tags: ['herramienta', 'taller'] },
  { q: 'caballetes coche taller', category: 'Herramientas', subcategory: 'Caballetes', req: /caballete|borriquet/i, ban: /funda|ambientador/i, tags: ['herramienta', 'taller', 'seguridad'] },
  { q: 'multimetro automocion coche', category: 'Diagnosis', subcategory: 'Multímetros', req: /mult[ií]metro|tester/i, ban: /funda|ambientador/i, tags: ['diagnosis', 'electricidad'] },
  { q: 'escaner obd2 coche bluetooth', category: 'Diagnosis', subcategory: 'Escáneres OBD2', req: /obd/i, ban: /funda|ambientador|soporte/i, tags: ['diagnosis', 'obd2'] },
  { q: 'camara boroscopio inspeccion motor', category: 'Diagnosis', subcategory: 'Boroscopios', req: /boroscopio|endoscopio|c[aá]mara/i, ban: /funda|ambientador|vigilancia/i, tags: ['diagnosis', 'inspeccion'] }
];

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

function slugify(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

// Las marcas más largas primero: si no, "Mann" se come a "Mannol" y
// "Febi" a "Febi Bilstein".
const BRANDS_BY_LENGTH = [...BRANDS].sort((a, b) => b.length - a.length);

function brandOf(title) {
  const text = String(title).toLowerCase();
  const found = BRANDS_BY_LENGTH.find(b => text.includes(b.toLowerCase()));
  if (found) return found;
  const first = String(title).split(/[\s,|]+/).find(w => w.length > 2 && !/^\d/.test(w));
  return (first || 'Recambio').replace(/[^\p{L}\p{N}+.-]/gu, '');
}

function priceValue(text) {
  const raw = String(text || '').replace(/\./g, '').replace(',', '.');
  const match = raw.match(/\d+(?:\.\d+)?/);
  const n = match ? Number(match[0]) : null;
  return Number.isFinite(n) && n > 0 ? n : null;
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
    if (!src || !title || !priceValue(price)) continue;

    out.push({
      asin,
      title,
      price: price.replace(/\s+/g, ' ').trim(),
      src: src.replace(/\._[A-Z0-9_,]+_\./, '._AC_UL640_.')
    });
    if (out.length >= 40) break;
  }
  return out;
}

async function downloadImage(url, asin) {
  const file = path.join(IMG_DIR, `${asin}.jpg`);
  if (fs.existsSync(file) && fs.statSync(file).size > 6000) return true;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) });
    if (!res.ok) return false;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 6000) return false;
    fs.writeFileSync(file, buf);
    return true;
  } catch {
    return false;
  }
}

function makeItem(product, query) {
  const cfg = CATS[query.category] || CATS.Repuestos;
  const name = clean(product.title).slice(0, 180);
  return {
    id: `amz-${product.asin.toLowerCase()}`,
    name,
    manufacturer: brandOf(name),
    category: query.category,
    subcategory: query.subcategory,
    description: `${name}. ${cfg.note}`,
    tags: [...new Set([...(query.tags || []), slugify(query.subcategory)])],
    price: product.price,
    image: `/img/productos/${product.asin}.jpg`,
    affiliateUrl: `https://www.amazon.es/dp/${product.asin}`,
    productType: cfg.productType,
    compatibility: {
      type: 'universal',
      note: 'Producto real de tienda: comprueba referencia, medida y compatibilidad con tu motor y año antes de comprar.'
    },
    imageStatus: 'verified',
    imageSource: product.src,
    linkStatus: 'verified',
    seller: 'Amazon.es',
    asin: product.asin,
    listingTitle: name
  };
}

async function main() {
  const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
  if (!Array.isArray(catalog)) throw new Error('data/products.json no es un array');
  fs.mkdirSync(IMG_DIR, { recursive: true });

  const used = new Set();
  for (const item of catalog) {
    const asin = item.asin || (String(item.id).match(/^amz-([a-z0-9]{10})$/) || [])[1];
    if (asin) used.add(String(asin).toUpperCase());
    if (item.affiliateUrl) {
      const m = String(item.affiliateUrl).match(/\/dp\/([A-Z0-9]{10})/);
      if (m) used.add(m[1]);
    }
  }
  console.log(`Catálogo actual: ${catalog.length} fichas · ${used.size} ASIN ya usados`);

  const queries = DRY ? QUERIES.slice(0, DRY_COUNT) : QUERIES;
  const added = [];
  const report = [];
  let backupDone = false;

  // Se guarda tras cada consulta: si la ejecución se corta (Amazon corta la
  // conexión, se reinicia el proceso...) no se pierde lo ya descargado. Como el
  // deduplicado es por ASIN, relanzar el script continúa donde se quedó.
  const flush = () => {
    if (DRY || !added.length) return;
    if (!backupDone) {
      fs.writeFileSync(`${CATALOG}.bak-expand`, JSON.stringify(catalog, null, 2) + '\n');
      backupDone = true;
    }
    fs.writeFileSync(CATALOG, JSON.stringify([...catalog, ...added], null, 2) + '\n');
  };

  for (const [index, query] of queries.entries()) {
    let accepted = 0;
    try {
      const results = await search(query.q);
      const picked = [];
      for (const product of results) {
        if (accepted >= MAX_PER_QUERY) break;
        if (used.has(product.asin)) continue;
        const text = product.title.toLowerCase();
        if (query.ban && query.ban.test(text)) continue;
        if (query.req && !query.req.test(text)) continue;
        if (picked.some(p => p.asin === product.asin)) continue;
        picked.push(product);
        accepted += 1;
      }
      for (const product of picked) {
        const ok = await downloadImage(product.src, product.asin);
        if (!ok) continue;
        used.add(product.asin);
        added.push(makeItem(product, query));
        await sleep(120);
      }
      console.log(`[${index + 1}/${queries.length}] ${query.subcategory}: ${picked.length} encontrados (total ${added.length})`);
      report.push({ subcategory: query.subcategory, found: picked.length });
      flush();
    } catch (err) {
      console.warn(`[${index + 1}/${queries.length}] ${query.subcategory}: ${err.message}`);
      report.push({ subcategory: query.subcategory, found: 0, error: err.message });
    }
    await sleep(900);
  }

  console.log(`\nNuevas fichas: ${added.length}`);
  const bySub = {};
  for (const item of added) bySub[item.subcategory] = (bySub[item.subcategory] || 0) + 1;
  console.log(bySub);

  if (DRY) {
    console.log('Modo --dry: no se guarda nada. Ejemplo:', JSON.stringify(added[0], null, 2));
    return;
  }

  flush();
  const merged = [...catalog, ...added];
  console.log(`Guardado: ${merged.length} fichas totales (${added.length} nuevas).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
