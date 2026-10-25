#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = (name) => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const readImport = (name) => {
  const file = path.join(root, 'data', 'imports', name);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
};
const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const categoriesFile = read('technical-categories.json');
const sourcesFile = read('technical-sources.json');
const vehicles = read('vehicles.json');
const library = read('technical-library.json');
const manifest = readImport('manifest.json');

const errors = [];
const fail = (message) => errors.push(message);
const categoryById = new Map(categoriesFile.categories.map(c => [c.id, c]));
const categoryIds = new Set(categoryById.keys());
const sourceIds = new Set(sourcesFile.sources.map(s => s.id));
const vehicleIds = new Set(vehicles.map(v => v.id));
const ids = new Set();
const statuses = new Set(['verified', 'reviewed', 'generic', 'metadata_only', 'source_only']);
const availabilities = new Set(['full', 'partial', 'metadata', 'link']);
const licenseClasses = new Set(['importable_redistributable', 'importable_attribution', 'importable_sharealike', 'metadata_links', 'project_editorial', 'pending']);

const expectedCategories = categoriesFile.categories.length;
if (expectedCategories !== 27) fail(`Se esperaban 27 categorías y hay ${expectedCategories}`);
if (new Set(categoriesFile.categories.map(c => c.number)).size !== expectedCategories) fail('Números de categoría duplicados');
for (let i = 1; i <= expectedCategories; i++) {
  if (!categoriesFile.categories.some(c => c.number === i)) fail(`Falta la categoría número ${i}`);
}
if (categoryIds.size !== expectedCategories) fail('IDs de categoría duplicados');

for (const entry of library.entries) {
  if (ids.has(entry.id)) fail(`ID duplicado: ${entry.id}`);
  ids.add(entry.id);
  if (!categoryIds.has(entry.categoryId)) fail(`${entry.id}: categoría inválida ${entry.categoryId}`);
  for (const id of entry.relatedCategoryIds || []) {
    if (!categoryIds.has(id)) fail(`${entry.id}: categoría relacionada inválida ${id}`);
  }
  for (const id of entry.sourceIds || []) {
    if (!sourceIds.has(id)) fail(`${entry.id}: fuente inválida ${id}`);
  }
  for (const id of entry.vehicleIds || []) {
    if (!vehicleIds.has(id)) fail(`${entry.id}: vehículo inválido ${id}`);
  }
  if (!statuses.has(entry.status)) fail(`${entry.id}: estado inválido ${entry.status}`);
  if (!availabilities.has(entry.availability)) fail(`${entry.id}: disponibilidad inválida ${entry.availability}`);
  if (!licenseClasses.has(entry.licenseClass)) fail(`${entry.id}: clase de licencia inválida ${entry.licenseClass}`);
  if (!entry.searchText) fail(`${entry.id}: searchText vacío`);
  if (entry.status === 'verified' && !(entry.sourceIds || []).length) fail(`${entry.id}: dato verificado sin fuente`);
  if (entry.status === 'source_only' && !entry.url) fail(`${entry.id}: fuente sin URL`);
  if (entry.status === 'metadata_only' && !entry.url) fail(`${entry.id}: metadatos sin URL`);
  if (entry.type === 'pid') {
    if (!entry.data?.code || !entry.data?.mode) fail(`${entry.id}: PID sin código o modo`);
    if (!(entry.sourceIds || []).length) fail(`${entry.id}: PID sin fuente`);
    if (entry.id !== `pid-${entry.data?.code}`) fail(`${entry.id}: ID de PID incoherente`);
  }
}

for (const source of sourcesFile.sources) {
  if (!/^https:\/\//.test(source.url)) fail(`Fuente sin HTTPS: ${source.id}`);
  if (!source.categoryIds?.length) fail(`Fuente sin categoría: ${source.id}`);
  for (const id of source.categoryIds) if (!categoryIds.has(id)) fail(`Fuente ${source.id}: categoría inválida ${id}`);
  for (const id of source.vehicleIds || []) if (!vehicleIds.has(id)) fail(`Fuente ${source.id}: vehículo inválido ${id}`);
  if (source.httpStatus !== 200 && !source.note) fail(`Fuente ${source.id}: comprobación ${source.httpStatus} sin nota`);
}

const ownCount = new Map([...categoryIds].map(id => [id, 0]));
const relatedCount = new Map([...categoryIds].map(id => [id, 0]));
for (const entry of library.entries) {
  ownCount.set(entry.categoryId, (ownCount.get(entry.categoryId) || 0) + 1);
  for (const id of entry.relatedCategoryIds || []) {
    relatedCount.set(id, (relatedCount.get(id) || 0) + 1);
  }
}
for (const category of library.categories) {
  if (category.coverage === 'pending') fail(`Categoría pendiente: ${category.id}`);
  if (category.total + category.relatedTotal === 0) fail(`Categoría sin referencias: ${category.id}`);
  if (category.total !== ownCount.get(category.id)) fail(`Categoría ${category.id}: total ${category.total} no coincide con ${ownCount.get(category.id)}`);
  if (category.relatedTotal !== relatedCount.get(category.id)) fail(`Categoría ${category.id}: relacionadas ${category.relatedTotal} no coinciden con ${relatedCount.get(category.id)}`);
  if (category.dataCount + category.sourceCount < category.total) fail(`Categoría ${category.id}: datos y fuentes no cubren las entradas propias`);
}

const pids = library.entries.filter(entry => entry.type === 'pid');
if (pids.length < 100) fail(`Se esperaban al menos 100 PID y hay ${pids.length}`);
if (new Set(pids.map(pid => pid.data?.code)).size !== pids.length) fail('Códigos PID duplicados');
if (pids.filter(pid => pid.data?.formula).length < 90) fail('Demasiados PID sin fórmula');
const rpm = pids.find(pid => pid.data?.code === '010C');
if (!rpm) fail('Falta el PID 010C');
else if (!/256/.test(rpm.data.formula || '')) fail('La fórmula del PID 010C no parece válida');

const dossiers = library.entries.filter(entry => entry.type === 'vehicle_dossier');
if (dossiers.length !== vehicles.length) fail(`Hay ${dossiers.length} dossiers y ${vehicles.length} fichas de vehículo`);
if (library.entries.length !== library.counts.total) fail('El total de entradas no coincide con counts.total');
if (library.categories.length !== library.counts.categories) fail('El número de categorías no coincide con counts.categories');
if (library.counts.pids !== pids.length) fail(`counts.pids=${library.counts.pids} no coincide con ${pids.length}`);
if (library.counts.sources !== sourcesFile.sources.length) fail('counts.sources no coincide con technical-sources.json');
if (library.counts.vehicles !== dossiers.length) fail('counts.vehicles no coincide con los dossiers');

if (manifest) {
  for (const [key, file] of Object.entries(manifest.files || {})) {
    const full = path.join(root, file.file);
    if (!fs.existsSync(full)) {
      fail(`Archivo importado inexistente (${key}): ${file.file}`);
      continue;
    }
    const stat = fs.statSync(full);
    if (stat.size !== file.bytes) fail(`Tamaño distinto en ${file.file}`);
    if (sha256(full) !== file.sha256) fail(`SHA256 distinto en ${file.file}`);
  }
} else {
  fail('Falta data/imports/manifest.json');
}

if (library.imports?.importedAt !== manifest?.importedAt) fail('El registro de importaciones de la biblioteca no coincide con manifest.json');

const byCoverage = library.categories.reduce((acc, c) => {
  acc[c.coverage] = (acc[c.coverage] || 0) + 1;
  return acc;
}, {});

if (errors.length) {
  console.error(`Biblioteca técnica: ${errors.length} errores`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Biblioteca técnica válida: ${library.entries.length} entradas, ${library.categories.length} categorías.`);
console.log(`Cobertura: ${byCoverage.data || 0} con datos, ${byCoverage.source || 0} solo con fuentes, ${byCoverage.pending || 0} pendientes.`);
console.log(`Estados: ${Object.entries(library.counts.byStatus).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`Tipos: ${Object.entries(library.counts.byType).map(([k, v]) => `${k}=${v}`).join(', ')}`);
console.log(`PID: ${pids.length} · DTC: ${library.counts.dtc} · modelos: ${library.counts.models} · campañas: ${library.counts.recalls}`);
