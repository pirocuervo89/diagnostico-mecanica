import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const products = JSON.parse(fs.readFileSync(path.join(root, 'data/products.json'), 'utf8'));
const allowed = new Set(['Herramientas', 'Diagnosis', 'Líquidos y Químicos', 'Repuestos', 'Maquinaria', 'Tuning']);
const errors = [];
const ids = new Set();
const names = new Set();
const asins = new Set();
const byCategory = {};
const productTypes = {};
let imageVerified = 0;
let imagePending = 0;
let linkVerified = 0;
let linkPending = 0;
let compatibilityKnown = 0;
let compatibilityUnknown = 0;

for (const p of products) {
  if (!p.id) errors.push('Producto sin id');
  if (ids.has(p.id)) errors.push(`ID duplicado: ${p.id}`);
  ids.add(p.id);
  const key = String(p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!key) errors.push(`${p.id}: sin nombre`);
  if (names.has(key)) errors.push(`Nombre duplicado: ${p.name}`);
  names.add(key);
  if (p.asin) {
    if (asins.has(p.asin)) errors.push(`ASIN duplicado: ${p.asin}`);
    asins.add(p.asin);
  }
  if (!allowed.has(p.category)) errors.push(`${p.id}: categoría no permitida ${p.category}`);
  byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  productTypes[p.productType || 'sin_tipo'] = (productTypes[p.productType || 'sin_tipo'] || 0) + 1;

  if (p.imageStatus === 'verified' && p.image) {
    const file = path.join(root, 'public', p.image.replace(/^\//, ''));
    if (!fs.existsSync(file)) errors.push(`${p.id}: imagen inexistente ${p.image}`);
    else if (fs.statSync(file).size < 4000) errors.push(`${p.id}: imagen demasiado pequeña`);
    else imageVerified++;
  } else imagePending++;

  if (p.linkStatus === 'verified' && /^https:\/\/(www\.)?amazon\.es\/dp\/[A-Z0-9]{10}$/.test(p.affiliateUrl || '')) linkVerified++;
  else linkPending++;

  if (p.compatibility && p.compatibility.type && p.compatibility.note) {
    if (p.compatibility.type === 'unknown') compatibilityUnknown++;
    else compatibilityKnown++;
  } else errors.push(`${p.id}: compatibilidad sin declarar`);

  if (/^(Profesional|Línea Económica|Genérico|Universal)$/i.test(String(p.manufacturer || ''))) {
    errors.push(`${p.id}: fabricante genérico no verificado (${p.manufacturer})`);
  }
}

if (products.length !== 500) errors.push(`Se esperaban 500 productos; hay ${products.length}`);

const audit = {
  generatedAt: new Date().toISOString(),
  verificationDate: new Date().toISOString().slice(0, 10),
  totalActive: products.length,
  uniqueIds: ids.size,
  uniqueNames: names.size,
  uniqueAsins: asins.size,
  imageVerified,
  imagePending,
  linkVerified,
  linkPending,
  compatibilityKnown,
  compatibilityUnknown,
  categories: Object.fromEntries(Object.entries(byCategory).sort((a, b) => b[1] - a[1])),
  productTypes,
  errors
};
fs.writeFileSync(path.join(root, 'data/auditoria-catalogo.json'), JSON.stringify(audit, null, 2) + '\n');
console.log(JSON.stringify({ ...audit, errors: errors.slice(0, 20), errorCount: errors.length }, null, 2));
if (errors.length) process.exitCode = 1;
