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
const MAX_PER_QUERY = Math.max(1, Number(process.argv[process.argv.indexOf('--limit') + 1]) || 5);
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
  { q: 'camara boroscopio inspeccion motor', category: 'Diagnosis', subcategory: 'Boroscopios', req: /boroscopio|endoscopio|c[aá]mara/i, ban: /funda|ambientador|vigilancia/i, tags: ['diagnosis', 'inspeccion'] },

  // ---- FRENOS (segunda tanda, por eje y por marca) ----
  { q: 'pastillas de freno traseras coche', category: 'Repuestos', subcategory: 'Pastillas de freno traseras', req: /pastilla/i, ban: /limpiador|aditivo|pintura|funda|herramienta|sensor|disco/i, tags: ['frenos', 'pastillas', 'traseras'] },
  { q: 'pastillas de freno brembo coche', category: 'Repuestos', subcategory: 'Pastillas de freno', req: /brembo/i, ban: /limpiador|pintura|funda|herramienta|caliper|pinza|disco/i, tags: ['frenos', 'pastillas', 'brembo'] },
  { q: 'pastillas de freno bosch coche', category: 'Repuestos', subcategory: 'Pastillas de freno', req: /bosch/i, ban: /limpiador|pintura|funda|herramienta|bater[ií]a|disco/i, tags: ['frenos', 'pastillas', 'bosch'] },
  { q: 'pastillas de freno ate textar coche', category: 'Repuestos', subcategory: 'Pastillas de freno', req: /ate|textar|ferodo|trw/i, ban: /limpiador|pintura|funda|herramienta|disco/i, tags: ['frenos', 'pastillas'] },
  { q: 'discos de freno traseros coche', category: 'Repuestos', subcategory: 'Discos de freno traseros', req: /disco/i, ban: /pastilla|tapa|funda|pintura|herramienta|limpiador|radio/i, tags: ['frenos', 'discos'] },
  { q: 'discos de freno ventilados rallados coche', category: 'Repuestos', subcategory: 'Discos de freno', req: /disco/i, ban: /pastilla|funda|pintura|herramienta|limpiador|cubierta/i, tags: ['frenos', 'discos'] },
  { q: 'kit discos y pastillas de freno coche eje', category: 'Repuestos', subcategory: 'Kit de frenos', req: /kit|juego|pack/i, ban: /herramienta|llave|pintura|limpiador|funda/i, tags: ['frenos', 'kit'] },
  { q: 'pinza de freno coche', category: 'Repuestos', subcategory: 'Pinzas de freno', req: /pinza|caliper/i, ban: /pintura|funda|herramienta|pegatina/i, tags: ['frenos', 'pinza'] },
  { q: 'liquido de frenos dot 5.1 coche', category: 'Líquidos y Químicos', subcategory: 'Líquido de frenos DOT 5.1', req: /dot\s?5|5\.1/i, ban: /purga|herramienta|funda/i, tags: ['frenos', 'dot51', 'seguridad'] },
  { q: 'tambor de freno coche', category: 'Repuestos', subcategory: 'Tambores de freno', req: /tambor/i, ban: /funda|herramienta|pintura/i, tags: ['frenos', 'tambor'] },

  // ---- FILTROS POR MARCA Y VARIANTE ----
  { q: 'filtro de aceite bosch mann mahle coche', category: 'Repuestos', subcategory: 'Filtro de aceite', req: /filtro/i, ban: /aire|combustible|habit[aá]culo|admisi[oó]n|llave|herramienta/i, tags: ['filtro', 'aceite', 'mantenimiento'] },
  { q: 'filtro de aire motor mann bosch coche', category: 'Repuestos', subcategory: 'Filtro de aire', req: /filtro/i, ban: /aceite|combustible|habit[aá]culo|admisi[oó]n deportiva|ambientador/i, tags: ['filtro', 'aire', 'mantenimiento'] },
  { q: 'filtro habitaculo polen bosch coche', category: 'Repuestos', subcategory: 'Filtro de habitáculo', req: /habit[aá]culo|polen|antipolen|carb[oó]n/i, ban: /aceite|combustible|ambientador|funda/i, tags: ['filtro', 'habitaculo'] },
  { q: 'filtro de combustible mann diesel coche', category: 'Repuestos', subcategory: 'Filtro de combustible', req: /filtro/i, ban: /bomba|inyector|aditivo|limpiador|aire|habit/i, tags: ['filtro', 'combustible', 'diesel'] },
  { q: 'filtro de gasolina universal coche', category: 'Repuestos', subcategory: 'Filtro de gasolina', req: /filtro/i, ban: /bomba|inyector|aditivo|limpiador|aire|habit/i, tags: ['filtro', 'gasolina'] },
  { q: 'kit filtros mann aceite aire combustible', category: 'Repuestos', subcategory: 'Kit de filtros', req: /kit|juego|pack/i, ban: /herramienta|llave|ambientador|funda/i, tags: ['filtro', 'kit', 'mantenimiento'] },
  { q: 'filtro de aire panal coche', category: 'Repuestos', subcategory: 'Filtro de aire', req: /filtro/i, ban: /aceite|combustible|habit[aá]culo|admisi[oó]n deportiva|ambientador|pulverizador/i, tags: ['filtro', 'aire'] },

  // ---- ILUMINACIÓN ----
  { q: 'bombilla h4 coche homologada par', category: 'Repuestos', subcategory: 'Bombillas H4', req: /h4/i, ban: /funda|portalamparas|ambientador|portal[aá]mpara/i, tags: ['iluminacion', 'h4'] },
  { q: 'bombilla h7 halogena coche par', category: 'Repuestos', subcategory: 'Bombillas H7', req: /h7/i, ban: /funda|portalamparas|ambientador/i, tags: ['iluminacion', 'h7'] },
  { q: 'bombilla h11 coche antiniebla', category: 'Repuestos', subcategory: 'Bombillas H11', req: /h11/i, ban: /funda|portalamparas|ambientador/i, tags: ['iluminacion', 'h11'] },
  { q: 'bombilla h8 coche halogenea', category: 'Repuestos', subcategory: 'Bombillas H8', req: /h8/i, ban: /funda|portalamparas|ambientador|h8[0-9]/i, tags: ['iluminacion', 'h8'] },
  { q: 'kit bombillas led coche h7 canbus', category: 'Repuestos', subcategory: 'Kits LED', req: /led/i, ban: /tira|flexo|linterna|ambientador|funda|guirnalda/i, tags: ['iluminacion', 'led'] },
  { q: 'bombilla led matricula coche canbus', category: 'Repuestos', subcategory: 'Bombillas matrícula', req: /matr[ií]cula|w5w|t10/i, ban: /funda|ambientador|soporte|marco/i, tags: ['iluminacion', 'led', 'matricula'] },
  { q: 'bombilla p21w freno coche', category: 'Repuestos', subcategory: 'Bombillas de freno', req: /p21w|bau15|freno/i, ban: /funda|ambientador|portalamparas/i, tags: ['iluminacion', 'p21w'] },
  { q: 'bombilla py21w intermitente coche', category: 'Repuestos', subcategory: 'Bombillas intermitente', req: /py21w|bau15s|intermitente/i, ban: /funda|ambientador|portalamparas|rel[eé]/i, tags: ['iluminacion', 'intermitente'] },
  { q: 'bombilla interior led coche techo', category: 'Repuestos', subcategory: 'Bombillas interior', req: /interior|techo|plaf[oó]n/i, ban: /ambientador|funda|tira|guirnalda/i, tags: ['iluminacion', 'interior', 'led'] },

  // ---- SUSPENSIÓN ----
  { q: 'amortiguador trasero coche par', category: 'Repuestos', subcategory: 'Amortiguadores traseros', req: /amortiguador/i, ban: /funda|herramienta|muelle.*compresor|tope/i, tags: ['suspension', 'amortiguador'] },
  { q: 'amortiguador bilstein sachs coche', category: 'Repuestos', subcategory: 'Amortiguadores', req: /bilstein|sachs|monroe|kyb/i, ban: /funda|herramienta|compresor|pegatina/i, tags: ['suspension', 'amortiguador'] },
  { q: 'juego amortiguadores delanteros coche', category: 'Repuestos', subcategory: 'Amortiguadores delanteros', req: /amortiguador/i, ban: /funda|herramienta|compresor|tope/i, tags: ['suspension', 'amortiguador'] },
  { q: 'tope amortiguador guardapolvo coche', category: 'Repuestos', subcategory: 'Topes y guardapolvos', req: /tope|guardapolvo|fuelle/i, ban: /herramienta|funda|ambientador/i, tags: ['suspension', 'tope'] },
  { q: 'soporte amortiguador copela coche', category: 'Repuestos', subcategory: 'Soportes de amortiguador', req: /soporte|copela|torreta/i, ban: /herramienta|funda|t[eé]lefono|soporte.*m[oó]vil/i, tags: ['suspension', 'soporte'] },
  { q: 'brazo suspension trapecio coche', category: 'Repuestos', subcategory: 'Brazos de suspensión', req: /brazo|trapecio/i, ban: /herramienta|funda|extractor/i, tags: ['suspension', 'trapecio'] },
  { q: 'kit suspension roscada deportiva coche', category: 'Tuning', subcategory: 'Suspensión roscada', req: /suspensi[oó]n|roscada/i, ban: /funda|herramienta|compresor/i, tags: ['tuning', 'suspension'] },

  // ---- MOTOR Y ALIMENTACIÓN ----
  { q: 'bomba de combustible coche', category: 'Repuestos', subcategory: 'Bombas de combustible', req: /bomba.*(combustible|gasolina|gasoil)|(combustible|gasolina|gasoil).*bomba/i, ban: /herramienta|funda|aditivo|limpiador|aire/i, tags: ['combustible', 'bomba'] },
  { q: 'bomba de agua termostato kit coche', category: 'Repuestos', subcategory: 'Bombas de agua', req: /bomba|termostato/i, ban: /herramienta|funda|limpiaparabrisas|neum[aá]tic/i, tags: ['refrigeracion', 'bomba'] },
  { q: 'junta culata coche', category: 'Repuestos', subcategory: 'Juntas de culata', req: /junta|culata/i, ban: /funda|herramienta|pintura|silicona/i, tags: ['motor', 'culata'] },
  { q: 'kit distribucion gates contitech coche', category: 'Repuestos', subcategory: 'Kit de distribución', req: /distribuci[oó]n|correa/i, ban: /herramienta|llave|funda|tapa|pintura/i, tags: ['distribucion', 'correa', 'motor'] },
  { q: 'tensor correa polea coche', category: 'Repuestos', subcategory: 'Tensores y poleas', req: /tensor|polea/i, ban: /herramienta|funda|pintura/i, tags: ['correa', 'tensor', 'motor'] },
  { q: 'sensor cigueñal arbol levas coche', category: 'Repuestos', subcategory: 'Sensores de motor', req: /cig[eü][eé][aá]?[nñ]al|levas|rpm|revoluci/i, ban: /herramienta|funda|limpiador|soporte/i, tags: ['sensor', 'motor'] },
  { q: 'sensor temperatura refrigerante coche', category: 'Repuestos', subcategory: 'Sensores de temperatura', req: /temperatura|refrigerante/i, ban: /herramienta|funda|term[oó]metro|ambientador/i, tags: ['sensor', 'refrigeracion'] },
  { q: 'sensor presion aceite coche', category: 'Repuestos', subcategory: 'Sensores de presión', req: /presi[oó]n.*aceite|aceite.*presi[oó]n|oil pressure/i, ban: /herramienta|funda|man[oó]metro|bomba/i, tags: ['sensor', 'aceite'] },
  { q: 'valvula presion combustible coche', category: 'Repuestos', subcategory: 'Válvulas de combustible', req: /v[aá]lvula/i, ban: /herramienta|funda|pintura|neum[aá]tic/i, tags: ['combustible', 'valvula'] },
  { q: 'inyector diesel coche', category: 'Repuestos', subcategory: 'Inyectores', req: /inyector/i, ban: /limpiador|aditivo|herramienta|funda|probador/i, tags: ['diesel', 'inyectores'] },
  { q: 'compresor aire acondicionado coche', category: 'Repuestos', subcategory: 'Aire acondicionado', req: /compresor|aire acondicionado|climatizador/i, ban: /funda|herramienta|ventilador.*port[aá]til|refrigerador|nevera/i, tags: ['climatizacion', 'compresor'] },
  { q: 'filtro deshidratador aire acondicionado coche', category: 'Repuestos', subcategory: 'Aire acondicionado', req: /deshidratador|filtro.*aire acondicionado|secador/i, ban: /funda|herramienta|casa|hogar/i, tags: ['climatizacion', 'filtro'] },
  { q: 'radiador calefaccion coche', category: 'Repuestos', subcategory: 'Radiador de calefacción', req: /calefacci[oó]n/i, ban: /funda|herramienta|el[eé]ctric|port[aá]til|manta/i, tags: ['climatizacion', 'radiador'] },

  // ---- CARROCERÍA Y ÓPTICA ----
  { q: 'faro delantero coche recambio', category: 'Repuestos', subcategory: 'Faros', req: /faro|faros/i, ban: /funda|bombilla|led.*tira|ambientador|linterna|port[aá]til/i, tags: ['iluminacion', 'faro', 'carroceria'] },
  { q: 'piloto trasero coche recambio', category: 'Repuestos', subcategory: 'Pilotos traseros', req: /piloto|trasero/i, ban: /funda|bombilla|ambientador|linterna|moto/i, tags: ['iluminacion', 'piloto', 'carroceria'] },
  { q: 'espejo retrovisor coche recambio', category: 'Repuestos', subcategory: 'Retrovisores', req: /retrovisor|espejo/i, ban: /funda|adhesivo|pegatina|maquillaje|pared/i, tags: ['carroceria', 'retrovisor'] },
  { q: 'parrilla rejilla frontal coche', category: 'Repuestos', subcategory: 'Parrillas', req: /parrilla|rejilla/i, ban: /funda|ambientador|herramienta|barbacoa/i, tags: ['carroceria', 'parrilla'] },

  // ---- MANTENIMIENTO Y ACCESORIOS ----
  { q: 'escobilla limpiaparabrisas 24 pulgadas coche', category: 'Repuestos', subcategory: 'Escobillas', req: /escobilla/i, ban: /brazo|motor|dep[oó]sito|l[ií]quido/i, tags: ['escobillas', 'mantenimiento'] },
  { q: 'escobilla limpiaparabrisas 19 pulgadas coche', category: 'Repuestos', subcategory: 'Escobillas', req: /escobilla/i, ban: /brazo|motor|dep[oó]sito|l[ií]quido/i, tags: ['escobillas', 'mantenimiento'] },
  { q: 'bomba limpiaparabrisas coche', category: 'Repuestos', subcategory: 'Bombas limpiaparabrisas', req: /bomba/i, ban: /dep[oó]sito|funda|herramienta|aire/i, tags: ['limpiaparabrisas', 'bomba'] },
  { q: 'claxon coche 12v', category: 'Repuestos', subcategory: 'Claxon', req: /claxon|bocina/i, ban: /funda|herramienta|ambientador|bici/i, tags: ['electricidad', 'claxon'] },
  { q: 'relé intermitencia coche', category: 'Repuestos', subcategory: 'Relés', req: /rel[eé]/i, ban: /funda|herramienta|ambientador/i, tags: ['electricidad', 'rele'] },
  { q: 'fusibles coche surtido caja', category: 'Repuestos', subcategory: 'Fusibles', req: /fusible/i, ban: /herramienta.*pinza|funda|ambientador/i, tags: ['electricidad', 'fusibles'] },
  { q: 'termostato ventilador radiador coche', category: 'Repuestos', subcategory: 'Electroventiladores', req: /ventilador|electroventilador/i, ban: /port[aá]til|mano|usb|funda|hogar|mesa|torre/i, tags: ['refrigeracion', 'ventilador'] },
  { q: 'cable arranque bateria coche pinzas', category: 'Herramientas', subcategory: 'Cables de arranque', req: /cable|pinza/i, ban: /funda|ambientador|usb|cargador|datos/i, tags: ['herramienta', 'bateria', 'arranque'] },
  { q: 'cargador bateria coche mantenedor', category: 'Herramientas', subcategory: 'Cargadores de batería', req: /cargador|mantenedor/i, ban: /funda|m[oó]vil|usb.*tel[eé]fono|port[aá]til|linterna/i, tags: ['herramienta', 'bateria'] },
  { q: 'compresor aire neumaticos coche', category: 'Herramientas', subcategory: 'Compresores de aire', req: /compresor|inflador/i, ban: /funda|aer[oó]grafo|pintura|aire acondicionado/i, tags: ['herramienta', 'neumaticos'] },
  { q: 'llave dinamometrica coche taller', category: 'Herramientas', subcategory: 'Llaves dinamométricas', req: /dinamom[eé]trica|torque/i, ban: /funda|ambientador/i, tags: ['herramienta', 'taller'] },
  { q: 'juego llaves vaso carraca coche', category: 'Herramientas', subcategory: 'Juegos de vasos', req: /vaso|carraca|juego/i, ban: /funda|ambientador|cocina/i, tags: ['herramienta', 'taller'] },

  // ---- CAR AUDIO Y MULTIMEDIA ----
  { q: 'subwoofer coche 12 pulgadas', category: 'Tuning', subcategory: 'Subwoofers', req: /subwoofer|sub\s?woofer|altavoz.*graves/i, ban: /funda|ambientador|soporte.*m[oó]vil|cable|conector|rejilla/i, tags: ['audio', 'subwoofer', 'graves'] },
  { q: 'subwoofer coche activo amplificado', category: 'Tuning', subcategory: 'Subwoofers amplificados', req: /subwoofer|sub\s?woofer/i, ban: /funda|ambientador|soporte.*m[oó]vil|cable|conector|rejilla/i, tags: ['audio', 'subwoofer', 'activo'] },
  { q: 'altavoces coche 6.5 pulgadas vias separadas', category: 'Tuning', subcategory: 'Altavoces', req: /altavoz|altavoces|speaker/i, ban: /funda|ambientador|subwoofer|soporte.*m[oó]vil|rejilla.*altavoz/i, tags: ['audio', 'altavoces'] },
  { q: 'altavoces coche coaxiales 6x9', category: 'Tuning', subcategory: 'Altavoces coaxiales', req: /altavoz|altavoces|coaxial/i, ban: /funda|ambientador|subwoofer|soporte.*m[oó]vil/i, tags: ['audio', 'altavoces', 'coaxial'] },
  { q: 'kit altavoces coche componentes tweeter', category: 'Tuning', subcategory: 'Kits de altavoces', req: /kit|juego|componentes|tweeter/i, ban: /funda|ambientador|cable.*solo|soporte.*m[oó]vil/i, tags: ['audio', 'kit', 'tweeter'] },
  { q: 'amplificador coche 4 canales', category: 'Tuning', subcategory: 'Amplificadores', req: /amplificador|amplifier|etapa/i, ban: /funda|ambientador|soporte.*m[oó]vil|cable.*solo|fusible/i, tags: ['audio', 'amplificador'] },
  { q: 'radio coche bluetooth usb', category: 'Tuning', subcategory: 'Radios y pantallas', req: /radio|autorradio|pantalla|multimedia/i, ban: /funda|ambientador|soporte.*m[oó]vil|antena|mando.*volante|marco.*solo/i, tags: ['audio', 'radio', 'bluetooth'] },
  { q: 'pantalla android coche 2 din', category: 'Tuning', subcategory: 'Radios y pantallas', req: /pantalla|android|2\s?din|multimedia/i, ban: /funda|ambientador|soporte.*m[oó]vil|protector|cristal.*templado/i, tags: ['audio', 'pantalla', 'android'] },
  { q: 'kit cableado audio coche amplificador', category: 'Tuning', subcategory: 'Cableado de audio', req: /cable|kit|instalaci[oó]n/i, ban: /funda|ambientador|soporte.*m[oó]vil|cargador|usb.*tel[eé]fono/i, tags: ['audio', 'cableado'] },
  { q: 'caja subwoofer coche sellada', category: 'Tuning', subcategory: 'Cajas para subwoofer', req: /caja|recinto|bafle|subwoofer/i, ban: /funda|ambientador|cable|conector/i, tags: ['audio', 'caja', 'subwoofer'] },
  { q: 'tweeter coche agudos', category: 'Tuning', subcategory: 'Tweeters', req: /tweeter|agudo/i, ban: /funda|ambientador|soporte.*m[oó]vil|cable.*solo/i, tags: ['audio', 'tweeter'] },

  // ---- CARROCERÍA, BODY KITS Y REJILLAS ----
  { q: 'kit carroceria coche body kit', category: 'Tuning', subcategory: 'Kits de carrocería', req: /body\s?kit|kit.*carrocer|carrocer.*kit|faldo|talonera/i, ban: /funda|ambientador|pegatina|adhesivo|pintura|limpiador/i, tags: ['carroceria', 'body kit'] },
  { q: 'taloneras laterales coche', category: 'Tuning', subcategory: 'Taloneras', req: /talonera|fald[oó]n|faldilla/i, ban: /funda|ambientador|pegatina|pintura|limpiador/i, tags: ['carroceria', 'taloneras'] },
  { q: 'aleron coche universal', category: 'Tuning', subcategory: 'Alerones y spoilers', req: /aler[oó]n|spoiler|spoile/i, ban: /funda|ambientador|pegatina|pintura|limpiador/i, tags: ['carroceria', 'aleron'] },
  { q: 'rejilla parrilla deportiva coche', category: 'Tuning', subcategory: 'Rejillas deportivas', req: /rejilla|parrilla|grill/i, ban: /funda|ambientador|barbacoa|pintura|limpiador|aire acondicionado/i, tags: ['carroceria', 'rejilla'] },
  { q: 'paragolpes delantero coche recambio', category: 'Repuestos', subcategory: 'Paragolpes', req: /paragolpes|parachoques|defensa/i, ban: /funda|ambientador|pegatina|pintura|limpiador|protector.*paragolpes/i, tags: ['carroceria', 'paragolpes'] },
  { q: 'embellecedor cromado coche rejilla', category: 'Tuning', subcategory: 'Embellecedores', req: /embellecedor|cromado|moldura/i, ban: /funda|ambientador|pegatina|pintura|limpiador|espuma/i, tags: ['carroceria', 'embellecedor'] },
  { q: 'difeusor trasero coche deportivo', category: 'Tuning', subcategory: 'Difusores traseros', req: /difusor|difeusor/i, ban: /funda|ambientador|pegatina|pintura/i, tags: ['carroceria', 'difusor'] },
  { q: 'entrada aire capo coche', category: 'Tuning', subcategory: 'Tomas de aire', req: /toma.*aire|entrada.*aire|cap[oó]|hood/i, ban: /funda|ambientador|filtro de aire|admisi[oó]n directa|pegatina/i, tags: ['carroceria', 'toma de aire'] }
];

// ---- POR MODELO DE COCHE ----
// El catálogo tiene piezas "universales"; con esto añadimos fichas que el
// vendedor declara compatibles con los coches más vendidos de España. Cada
// consulta exige que el título mencione el modelo, para no colar una pieza de
// otro coche con la misma forma.
const CARS = [
  { name: 'Seat Ibiza', re: /ibiza/i },
  { name: 'Seat León', re: /le[oó]n/i },
  { name: 'VW Golf', re: /golf/i },
  { name: 'VW Polo', re: /polo/i },
  { name: 'VW Passat', re: /passat/i },
  { name: 'Renault Clio', re: /clio/i },
  { name: 'Renault Mégane', re: /m[eé]gane/i },
  { name: 'Peugeot 206', re: /206/i },
  { name: 'Peugeot 208', re: /208/i },
  { name: 'Peugeot 308', re: /308/i },
  { name: 'Citroën C3', re: /c3\b/i },
  { name: 'Citroën C4', re: /c4\b/i },
  { name: 'Opel Corsa', re: /corsa/i },
  { name: 'Opel Astra', re: /astra/i },
  { name: 'Ford Focus', re: /focus/i },
  { name: 'Ford Fiesta', re: /fiesta/i },
  { name: 'Toyota Corolla', re: /corolla/i },
  { name: 'BMW Serie 3', re: /serie\s?3|e46|e90|e91|f30/i },
  { name: 'Audi A3', re: /a3\b|8p|8v|8l/i },
  { name: 'Audi A4', re: /a4\b|b6|b7|b8/i },
  { name: 'Mercedes Clase C', re: /clase c|w203|w204|w205/i },
  { name: 'Fiat Punto', re: /punto/i },
  { name: 'Dacia Sandero', re: /sandero/i },
  { name: 'Dacia Duster', re: /duster/i },
  { name: 'Nissan Qashqai', re: /qashqai/i },
  { name: 'Hyundai i30', re: /i30/i },
  { name: 'Kia Ceed', re: /ceed|cee'd/i },
  { name: 'Skoda Octavia', re: /octavia/i },
  { name: 'Seat Ateca', re: /ateca/i },
  { name: 'Renault Captur', re: /captur/i }
];

const MODEL_PARTS = [
  { q: 'pastillas de freno delanteras', subcategory: 'Pastillas de freno', req: /pastilla/i, ban: /limpiador|pintura|funda|herramienta|sensor|disco/i, tags: ['frenos', 'pastillas'] },
  { q: 'discos de freno delanteros', subcategory: 'Discos de freno', req: /disco/i, ban: /pastilla|tapa|funda|pintura|herramienta|limpiador/i, tags: ['frenos', 'discos'] },
  { q: 'filtro de aceite', subcategory: 'Filtro de aceite', req: /filtro/i, ban: /aire|combustible|habit[aá]culo|admisi[oó]n|llave|herramienta/i, tags: ['filtro', 'aceite'] },
  { q: 'filtro de aire', subcategory: 'Filtro de aire', req: /filtro/i, ban: /aceite|combustible|habit[aá]culo|admisi[oó]n deportiva|ambientador/i, tags: ['filtro', 'aire'] },
  { q: 'filtro de habitaculo', subcategory: 'Filtro de habitáculo', req: /habit[aá]culo|polen|antipolen|carb[oó]n/i, ban: /aceite|combustible|ambientador|funda/i, tags: ['filtro', 'habitaculo'] },
  { q: 'filtro de combustible', subcategory: 'Filtro de combustible', req: /filtro/i, ban: /bomba|inyector|aditivo|limpiador|aire|habit/i, tags: ['filtro', 'combustible'] },
  { q: 'amortiguador delantero', subcategory: 'Amortiguadores', req: /amortiguador/i, ban: /funda|herramienta|compresor|tope/i, tags: ['suspension', 'amortiguador'] },
  { q: 'bujias encendido juego', subcategory: 'Bujías', req: /buj[ií]a/i, ban: /incandescente|llave|herramienta|funda/i, tags: ['encendido', 'bujias'] },
  { q: 'bombilla h7', subcategory: 'Bombillas H7', req: /h7/i, ban: /funda|portalamparas|ambientador/i, tags: ['iluminacion', 'h7'] },
  { q: 'escobillas limpiaparabrisas', subcategory: 'Escobillas', req: /escobilla/i, ban: /brazo|motor|dep[oó]sito|l[ií]quido/i, tags: ['escobillas', 'mantenimiento'] },
  { q: 'rotula suspension', subcategory: 'Rótulas', req: /r[oó]tula/i, ban: /herramienta|funda|extractor/i, tags: ['suspension', 'rotula'] },
  { q: 'sensor abs', subcategory: 'Sensor ABS', req: /abs/i, ban: /llave|herramienta|funda|limpiador/i, tags: ['sensor', 'abs'] }
];

for (const car of CARS) {
  for (const part of MODEL_PARTS) {
    QUERIES.push({
      q: `${part.q} ${car.name}`,
      category: 'Repuestos',
      subcategory: part.subcategory,
      req: part.req,
      must: car.re,
      ban: part.ban,
      tags: [...part.tags, slugify(car.name), 'compatible'],
      fits: car.name
    });
  }
}

// ---- BODY KITS, TALONERAS Y REJILLAS POR MODELO ----
// Solo los coches con más mercado de accesorios en España. El título tiene que
// nombrar el modelo: si no, es una pieza universal colada en una ficha
// "compatible" y eso hace perder la confianza del cliente.
const BODY_CARS = [
  { name: 'Seat Ibiza', re: /ibiza/i },
  { name: 'Seat León', re: /le[oó]n/i },
  { name: 'VW Golf', re: /golf/i },
  { name: 'Renault Clio', re: /clio/i },
  { name: 'Peugeot 206', re: /206/i },
  { name: 'Opel Corsa', re: /corsa/i },
  { name: 'Ford Focus', re: /focus/i },
  { name: 'Audi A3', re: /a3\b|8p|8v|8l/i }
];

const BODY_PARTS = [
  { q: 'rejilla parrilla frontal deportiva', subcategory: 'Rejillas deportivas', req: /rejilla|parrilla|grill/i, ban: /funda|ambientador|barbacoa|pintura|limpiador|aire acondicionado|filtro/i, tags: ['carroceria', 'rejilla'] },
  { q: 'taloneras laterales', subcategory: 'Taloneras', req: /talonera|fald[oó]n|faldilla/i, ban: /funda|ambientador|pegatina|pintura|limpiador/i, tags: ['carroceria', 'taloneras'] },
  { q: 'kit carroceria body kit', subcategory: 'Kits de carrocería', req: /body\s?kit|kit.*carrocer|carrocer.*kit|talonera/i, ban: /funda|ambientador|pegatina|pintura|limpiador|filtro/i, tags: ['carroceria', 'body kit'] },
  { q: 'aleron trasero', subcategory: 'Alerones y spoilers', req: /aler[oó]n|spoiler/i, ban: /funda|ambientador|pegatina|pintura|limpiador/i, tags: ['carroceria', 'aleron'] }
];

for (const car of BODY_CARS) {
  for (const part of BODY_PARTS) {
    QUERIES.push({
      q: `${part.q} ${car.name}`,
      category: 'Tuning',
      subcategory: part.subcategory,
      req: part.req,
      must: car.re,
      ban: part.ban,
      tags: [...part.tags, slugify(car.name), 'compatible'],
      fits: car.name
    });
  }
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
    compatibility: query.fits
      ? {
          type: 'model',
          models: [query.fits],
          note: `El vendedor declara compatibilidad con ${query.fits}. Confirma motor, año y referencia antes de comprar.`
        }
      : {
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
  // El mismo producto puede venderse en dos ASIN distintos con el título
  // idéntico. El catálogo exige nombres únicos (SEO y tests), así que también
  // se deduplica por nombre normalizado.
  const usedNames = new Set();
  for (const item of catalog) {
    const asin = item.asin || (String(item.id).match(/^amz-([a-z0-9]{10})$/) || [])[1];
    if (asin) used.add(String(asin).toUpperCase());
    if (item.affiliateUrl) {
      const m = String(item.affiliateUrl).match(/\/dp\/([A-Z0-9]{10})/);
      if (m) used.add(m[1]);
    }
    if (item.name) usedNames.add(String(item.name).toLowerCase().trim());
  }
  console.log(`Catálogo actual: ${catalog.length} fichas · ${used.size} ASIN ya usados`);

    // --only=audio,carroceria... lanza solo las consultas de esas secciones, útil
  // para completar una familia sin repasar todo el catálogo.
  const ONLY = (process.env.ONLY_GROUPS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const selected = ONLY.length
    ? QUERIES.filter(query => ONLY.some(token =>
        String(query.category).toLowerCase().includes(token)
        || String(query.subcategory).toLowerCase().includes(token)
        || (query.tags || []).some(tag => String(tag).toLowerCase().includes(token))))
    : QUERIES;
  const queries = DRY ? selected.slice(0, DRY_COUNT) : selected;
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
        if (usedNames.has(clean(product.title).slice(0, 180).toLowerCase().trim())) continue;
        if (query.ban && query.ban.test(text)) continue;
        if (query.must && !query.must.test(text)) continue;
        if (query.req && !query.req.test(text)) continue;
        if (picked.some(p => p.asin === product.asin)) continue;
        picked.push(product);
        accepted += 1;
      }
      for (const product of picked) {
        const ok = await downloadImage(product.src, product.asin);
        if (!ok) continue;
        used.add(product.asin);
        const item = makeItem(product, query);
        usedNames.add(item.name.toLowerCase().trim());
        added.push(item);
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
