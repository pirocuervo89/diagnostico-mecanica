/**
 * Auditoría de afiliación: comprueba que TODOS los productos del catálogo
 * tienen un enlace de compra válido y listo para llevar la etiqueta de Amazon.
 *
 * Uso:
 *   node scripts/audit-affiliates.mjs
 *   AFFILIATE_TAG_AMAZON=mietiqueta-21 node scripts/audit-affiliates.mjs
 *
 * Sale con código 1 si algún producto no se puede enlazar: así se puede usar en
 * un paso previo a publicar.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));

const ASIN = /^[A-Z0-9]{10}$/;
const CANONICAL = /^https:\/\/www\.amazon\.es\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?#].*)?$/;

function tag(url, value) {
  if (!value) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', value);
    return parsed.toString();
  } catch {
    return url;
  }
}

function itemsOf(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.items || raw?.products || raw?.tyres || [];
}

const catalogues = [
  {
    name: 'Productos',
    file: 'products.json',
    link: item => item.affiliateUrl,
    asin: item => item.asin
  },
  {
    name: 'Neumáticos',
    file: 'tyres.json',
    link: item => item.url,
    asin: item => item.asin
  },
  {
    name: 'Tuning y accesorios',
    file: 'tuning-products.json',
    link: item => (Array.isArray(item.links) ? (item.links.find(l => /amazon\./i.test(String(l?.url))) || item.links[0])?.url : ''),
    asin: item => item.asin
  }
];

const tagValue = String(process.env.AFFILIATE_TAG_AMAZON || '').trim();
const problems = [];
const rows = [];

for (const catalogue of catalogues) {
  const items = itemsOf(read(catalogue.file));
  const seen = new Map();
  let ok = 0;
  let missing = 0;
  let malformed = 0;
  let duplicates = 0;
  let amazon = 0;

  for (const item of items) {
    const url = String(catalogue.link(item) || '').trim();
    const asin = String(catalogue.asin(item) || '').trim();

    if (!url) {
      missing++;
      problems.push(`${catalogue.name}: ${item.id} sin enlace de compra`);
      continue;
    }
    if (!/^https:\/\//.test(url)) {
      malformed++;
      problems.push(`${catalogue.name}: ${item.id} enlace sin HTTPS (${url.slice(0, 60)})`);
      continue;
    }
    if (/amazon\./i.test(url)) {
      amazon++;
      const match = url.match(CANONICAL);
      if (!match) {
        malformed++;
        problems.push(`${catalogue.name}: ${item.id} enlace de Amazon no canónico (${url.slice(0, 70)})`);
        continue;
      }
      const code = match[1];
      if (!ASIN.test(code) || (asin && asin !== code)) {
        malformed++;
        problems.push(`${catalogue.name}: ${item.id} ASIN incoherente (enlace ${code}, ficha ${asin || '—'})`);
        continue;
      }
      if (seen.has(code)) {
        duplicates++;
        problems.push(`${catalogue.name}: ${item.id} repite el ASIN ${code} de ${seen.get(code)}`);
        continue;
      }
      seen.set(code, item.id);
    }
    ok++;
  }

  rows.push({ catálogo: catalogue.name, total: items.length, 'con enlace válido': ok, 'sin enlace': missing, 'formato': malformed, duplicados: duplicates, amazon });
}

console.log('\n=== AFILIACIÓN: estado del catálogo\n');
console.table(rows);
console.log(`Etiqueta de afiliado: ${tagValue ? `${tagValue} ✔` : 'NO CONFIGURADA (AFFILIATE_TAG_AMAZON vacío)'}`);

const sample = 'https://www.amazon.es/dp/B00M2IDYBA';
console.log(`Ejemplo real de enlace: ${tag(sample, tagValue)}`);

if (problems.length) {
  console.log(`\n=== INCIDENCIAS (${problems.length})`);
  for (const problem of problems.slice(0, 40)) console.log(` - ${problem}`);
  if (problems.length > 40) console.log(` … y ${problems.length - 40} más`);
  process.exitCode = 1;
} else {
  console.log('\nTodo el catálogo tiene enlace de compra válido y listo para la etiqueta.');
}
