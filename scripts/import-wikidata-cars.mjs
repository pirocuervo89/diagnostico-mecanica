#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outFile = path.join(root, 'data', 'vehicle-catalog.json');
const UA = 'diagnostico-mecanica/1.0 (local vehicle catalog)';
const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const SPARQL = 'https://query.wikidata.org/sparql';

const BRANDS = [
  'Abarth','AC','Acadian','Acura','Adler','Aion','Aito','Alfa Romeo','Alpina','Alpine','Alvis','AMC','American Motors','Apollo','Ariel','Armstrong Siddeley','Artega','Aro','Aston Martin','Asuna','ATS','Auburn','Audi','Austin','Autobianchi','Avatr','AvtoVAZ',
  'Baojun','Beaumont','Bentley','Bestune','Bitter','Bizzarrini','BMW','Bollinger','Borgward','Bristol','Brilliance','Bugatti','Buick','BYD','Byd',
  'Cadillac','Canoo','Caterham','Chery','Chevrolet','Chrysler','Cisitalia','Citroën','Citroen','Cobalt','Connaught','Cooper','Cord','Cowin','Cunningham','Cupra',
  'Dacia','Daewoo','Daihatsu','Dallara','Datsun','Deepal','Delage','Delahaye','Denza','DeSoto','De Tomaso','DFSK','Dixi','Dodge','Dongfeng','DS','Duesenberg',
  'Eagle','Edsel','Eisenach','EMW','Emgrand','Englon','Exeed',
  'Faraday Future','Farizon','Fengon','Ferrari','Fiat','Fisker','Force Motors','Ford','FSO','FSM',
  'GAC','GAZ','Geely','General Motors','Genesis','Geo','Geometry','Ginetta','Gleagle','GMC','Gordon-Keeble','Graham','Great Wall','GTA','Gumpert','GWM',
  'Haima','Hansa','Haval','Healey','Hillman','Hino','Hindustan','Holden','Honda','Hongqi','Hongguang','Horch','Hozon','Hudson','Humber','Hummer','Hupmobile','Hurtan','Hyptec','Hyundai',
  'iCar','IM Motors','Imperial','Infiniti','Innocenti','Irizar','Isdera','Iso','Isuzu','Italdesign',
  'JAC','JAC Motors','Jaguar','Jeep','Jensen','Jetour','Jilin','Jinbei','Karma','Karry','KGM','KG Mobility','Kia','Koenigsegg','KTM',
  'Lada','Lagonda','Lamborghini','Lanchester','Lancia','Land Rover','LEVC','Lea-Francis','Leapmotor','Lexus','Li Auto','Lifan','Lincoln','Lisheng','Lister','Lloyd','London Taxi','Lordstown','Lotus','Lucid','Luxeed','Lynk & Co',
  'Mahindra','Maple','Marcos','Maruti','Maserati','Maxus','Maybach','Mazda','McLaren','Melkus','Mercedes-AMG','Mercedes-Benz','Mercedes-Maybach','Mercury','MG','Midas','MINI','Mini','Mitsubishi','Moretti','Morgan','Morris','Moskvitch','Multicar',
  'Nammi','Nash','Neta','Nio','NIO','Nissan','Nissan Diesel','Niva','Noble','NSU',
  'Oldsmobile','Oltcit','Omoda','Onvo','Opel','ORA','OSI','Oshan',
  'Packard','Pagani','Panhard','Passport','Peerless','Pegaso','Perodua','Peugeot','Pierce-Arrow','Plymouth','Polestar','Polski Fiat','Pontiac','Poer','Porsche','Praga','Premier','Prince','Proton',
  'Qiantu','Qoros',
  'Radar','Ram','Rambler','Range Rover','Refine','Reliant','Rely','Renault','Renault Korea','Riley','Rimac','Rising Auto','Rivian','Rocar','Roewe','Rolls-Royce','Rover','Rox','Roush',
  'Saab','Sabre','SAIC','Saleen','Samsung','Santana','Saturn','Scania','Scimitar','Scion','SEAT','Seres','Shelby','Siata','Singer','Škoda','Skoda','Smart','Sokon','SsangYong','Stola','Stutz','Subaru','Sunbeam','Suzuki','SWM','Syrena',
  'Talbot','Tank','Tata','Tatra','Tauro','Tesla','Toyota','Triumph','Trumpchi','Turner','TVR',
  'UAZ','UNI',
  'Vanden Plas','Vauxhall','Venucia','Volkswagen','Volvo','Voyah','VW',
  'Wanderer','Wey','Wiesmann','Wingle','Wolseley','Wuling',
  'Xiali','Xiaomi','XPeng','Xpeng',
  'Yangwang','Yamaha','Yema','Yugo',
  'Zastava','ZAZ','Zedriv','Zeekr','Zenvo','Zhidou','ZIL','Zotye'
];

const clean = value => String(value || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

const key = value => clean(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const brandCandidates = [...new Map(BRANDS.map(brand => [key(brand), brand])).entries()]
  .filter(([k]) => k)
  .sort((a, b) => b[0].length - a[0].length);

function cleanBrand(value) {
  return clean(value)
    .replace(/\s*(Group|Grupo|Motor Company|Motors|Automobile|Automobiles|Cars|S\.A\.|S\.A|AG|AB|NV|Inc\.?|Ltd\.?|Limited|Company|Corporation|Corp\.?|Holdings?|Automotive|Mobility)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function brandFor(label, brandLabel) {
  const n = key(label);
  for (const [candidateKey, candidate] of brandCandidates) {
    if (n === candidateKey || n.startsWith(candidateKey + ' ')) {
      return { brand: candidate, matched: true, tokens: candidateKey.split(' ').length };
    }
  }
  const fallback = cleanBrand(brandLabel);
  if (fallback && !/^Q\d+$/i.test(fallback)) {
    const fk = key(fallback);
    if (fk && (n === fk || n.startsWith(fk + ' '))) {
      return { brand: fallback, matched: true, tokens: fk.split(' ').length };
    }
    return { brand: fallback, matched: false, tokens: 0 };
  }
  const first = label.split(/\s+/)[0];
  return { brand: first, matched: true, tokens: 1 };
}

function year(value) {
  const match = String(value || '').match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

function yearsLabel(item) {
  const start = year(item.start);
  const end = year(item.end);
  if (start && end) return start === end ? String(start) : `${start}–${end}`;
  if (start) return `${start}–actualidad`;
  return '';
}

function commonsTitle(url) {
  try {
    const parsed = new URL(url);
    const marker = '/Special:FilePath/';
    if (parsed.pathname.includes(marker)) {
      const raw = parsed.pathname.split(marker)[1];
      return raw ? `File:${decodeURIComponent(raw)}` : '';
    }
    if (parsed.pathname.startsWith('/wiki/File:')) {
      return decodeURIComponent(parsed.pathname.slice('/wiki/'.length));
    }
  } catch {
    return '';
  }
  return '';
}

function commonsPage(title) {
  return `https://commons.wikimedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_')).replace(/%3A/g, ':')}`;
}

async function sparql(query) {
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(240000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
}

async function imageInfo(titles) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: '720',
    titles: titles.join('|')
  });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`${COMMONS_API}?${params}`, {
        headers: { 'User-Agent': UA },
        signal: AbortSignal.timeout(90000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
  }
}

const query = `
SELECT ?item ?itemLabel ?brandLabel ?image ?start ?end ?descEs ?descEn ?classLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3231690 .
  ?item wdt:P176 ?brand .
  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL { ?item wdt:P571 ?start . }
  OPTIONAL { ?item wdt:P576 ?end . }
  OPTIONAL { ?item schema:description ?descEs . FILTER(lang(?descEs) = "es") }
  OPTIONAL { ?item schema:description ?descEn . FILTER(lang(?descEn) = "en") }
  OPTIONAL { ?item wdt:P279 ?class . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}`;

console.log('Consultando Wikidata…');
const result = await sparql(query);
const byId = new Map();
for (const row of result.results.bindings) {
  const entity = row.item?.value || '';
  const qid = entity.split('/').pop();
  const label = clean(row.itemLabel?.value);
  if (!qid || !label || /^Q\d+$/i.test(label)) continue;
  const current = byId.get(qid) || {
    qid,
    label,
    brandLabel: clean(row.brandLabel?.value),
    imageUrl: '',
    start: '',
    end: '',
    descEs: '',
    descEn: '',
    classes: new Set()
  };
  if (!current.imageUrl && row.image?.value) current.imageUrl = row.image.value;
  if (!current.start && row.start?.value) current.start = row.start.value;
  if (!current.end && row.end?.value) current.end = row.end.value;
  if (!current.descEs && row.descEs?.value) current.descEs = clean(row.descEs.value);
  if (!current.descEn && row.descEn?.value) current.descEn = clean(row.descEn.value);
  if (row.classLabel?.value) current.classes.add(clean(row.classLabel.value));
  byId.set(qid, current);
}
console.log(`Modelos únicos en Wikidata: ${byId.size}`);

const models = new Map();
for (const item of byId.values()) {
  const resolved = brandFor(item.label, item.brandLabel);
  const labelParts = item.label.split(/\s+/);
  let model = resolved.matched
    ? labelParts.slice(resolved.tokens).join(' ')
    : item.label;
  model = model.replace(/^[-–—:.,]+/, '').replace(/\s+/g, ' ').trim();
  if (!model) model = item.label;
  const brand = resolved.brand || item.brandLabel || item.label.split(/\s+/)[0];
  if (!brand || !model) continue;
  const title = resolved.matched && key(item.label).startsWith(key(brand) + ' ')
    ? item.label
    : (key(item.label).startsWith(key(brand) + ' ') ? item.label : `${brand} ${item.label}`);
  const classes = [...item.classes].filter(Boolean);
  const description = item.descEs || item.descEn || classes.join(' · ') || 'Modelo de automóvil catalogado en Wikidata.';
  const entry = {
    id: `wd-${item.qid}`,
    wikidataId: item.qid,
    brand,
    model,
    title,
    years: yearsLabel(item),
    description,
    segment: classes[0] || '',
    classes,
    imageUrl: item.imageUrl,
    commonsTitle: item.imageUrl ? commonsTitle(item.imageUrl) : '',
    source: {
      title: 'Wikidata',
      url: `https://www.wikidata.org/wiki/${item.qid}`,
      license: 'CC0 1.0',
      licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/'
    }
  };
  const dedupeKey = `${key(brand)}|${key(model)}`;
  const previous = models.get(dedupeKey);
  if (!previous) {
    models.set(dedupeKey, entry);
    continue;
  }
  const score = value => (value.imageUrl ? 10 : 0) + (value.years ? 3 : 0) + Math.min((value.description || '').length / 80, 3) + (value.classes?.length || 0);
  if (score(entry) > score(previous)) models.set(dedupeKey, entry);
}
console.log(`Modelos tras agrupar marca/modelo: ${models.size}`);

const list = [...models.values()];
const imageByTitle = new Map();
const titles = [...new Set(list.map(item => item.commonsTitle).filter(Boolean))];
console.log(`Fotos de Commons a verificar: ${titles.length}`);
const chunkSize = 50;
for (let index = 0; index < titles.length; index += chunkSize) {
  const chunk = titles.slice(index, index + chunkSize);
  try {
    const data = await imageInfo(chunk);
    const normalized = new Map((data.query?.normalized || []).map(item => [item.from, item.to]));
    for (const page of data.query?.pages || []) {
      if (page.missing || !page.imageinfo?.[0]) continue;
      const info = page.imageinfo[0];
      const meta = info.extmetadata || {};
      const title = page.title;
      const sourceUrl = info.descriptionurl || commonsPage(title);
      const cleanUrl = value => value ? String(value).split('?')[0] : '';
      const image = {
        src: cleanUrl(info.thumburl) || cleanUrl(info.url) || `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(title.replace(/^File:/, ''))}?width=720`,
        full: cleanUrl(info.url),
        credit: clean(meta.Artist?.value) || clean(meta.Credit?.value) || 'Wikimedia Commons',
        license: clean(meta.LicenseShortName?.value) || 'Ver licencia en Commons',
        licenseUrl: clean(meta.LicenseUrl?.value) || '',
        sourceUrl,
        note: 'Foto de Wikimedia Commons; puede corresponder a otra generación o equipamiento.'
      };
      imageByTitle.set(title, image);
      for (const [from, to] of normalized) if (to === title) imageByTitle.set(from, image);
    }
  } catch (error) {
    console.warn(`Lote ${Math.floor(index / chunkSize) + 1} fallido: ${error.message}`);
  }
  if ((index / chunkSize) % 10 === 0) console.log(`  ${Math.min(index + chunkSize, titles.length)}/${titles.length}`);
  await new Promise(resolve => setTimeout(resolve, 80));
}

const data = {
  generatedAt: new Date().toISOString(),
  source: 'Wikidata + Wikimedia Commons',
  notice: 'Catálogo de modelos de automóvil importado de Wikidata. Las fotos proceden de Wikimedia Commons y conservan autor, licencia y enlace a la ficha original. La foto puede corresponder a otra generación, versión o equipamiento.',
  brands: [],
  models: list.map(item => {
    const image = imageByTitle.get(item.commonsTitle) || (item.imageUrl ? {
      src: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(item.commonsTitle.replace(/^File:/, ''))}?width=720`,
      full: '',
      credit: 'Wikimedia Commons',
      license: 'Ver licencia en Commons',
      licenseUrl: '',
      sourceUrl: item.commonsTitle ? commonsPage(item.commonsTitle) : '',
      note: 'Foto de Wikimedia Commons; no se pudo leer la licencia en el último lote.'
    } : null);
    return {
      id: item.id,
      wikidataId: item.wikidataId,
      brand: item.brand,
      model: item.model,
      title: item.title,
      years: item.years,
      description: item.description,
      segment: item.segment,
      classes: item.classes,
      image,
      source: item.source
    };
  })
};

const counts = new Map();
for (const item of data.models) {
  const current = counts.get(item.brand) || { name: item.brand, count: 0, image: null };
  current.count += 1;
  if (!current.image && item.image?.src) current.image = item.image.src;
  counts.set(item.brand, current);
}
data.brands = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
fs.writeFileSync(outFile, JSON.stringify(data));
console.log(`Escrito ${outFile}: ${data.models.length} modelos, ${data.brands.length} marcas, ${(fs.statSync(outFile).size / 1024 / 1024).toFixed(1)} MB`);
