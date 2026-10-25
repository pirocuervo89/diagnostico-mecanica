import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const symptoms = read('data/symptoms.json');
const categories = read('data/symptom-categories.json');
const dtcCodes = new Set(read('data/dtc.json').map(d => String(d.code).toUpperCase()));
const componentIds = new Set(read('data/components.json').map(c => c.id));
const categoryIds = new Set(categories.map(c => c.id));
const errors = [];
const ids = new Set();
const names = new Set();
const curated = symptoms.filter(s => s.curated);
const requiredCurated = ['name', 'description', 'area', 'categoryId', 'urgency', 'driveRisk', 'source', 'validationStatus', 'lastReviewed'];

for (const s of symptoms) {
  if (!s.id) errors.push('Registro sin id');
  if (!s.name) errors.push(`${s.id}: sin nombre`);
  if (!categoryIds.has(s.categoryId)) errors.push(`${s.id}: categoría inválida ${s.categoryId}`);
  if (ids.has(s.id)) errors.push(`${s.id}: id duplicado`);
  if (names.has(s.name.toLowerCase())) errors.push(`${s.id}: nombre duplicado`);
  ids.add(s.id);
  names.add(s.name.toLowerCase());
  for (const code of s.relatedDtc || []) {
    if (!dtcCodes.has(String(code).toUpperCase())) errors.push(`${s.id}: DTC inexistente ${code}`);
  }
  for (const id of s.relatedComponents || []) {
    if (!componentIds.has(id)) errors.push(`${s.id}: componente inexistente ${id}`);
  }
  if (s.curated) {
    for (const key of requiredCurated) {
      if (!s[key]) errors.push(`${s.id}: falta ${key}`);
    }
    if (!Array.isArray(s.commonCauses) || s.commonCauses.length < 2) errors.push(`${s.id}: causas insuficientes`);
    if (!Array.isArray(s.quickChecks) || s.quickChecks.length < 2) errors.push(`${s.id}: comprobaciones insuficientes`);
    if (!Array.isArray(s.tools) || s.tools.length < 2) errors.push(`${s.id}: herramientas insuficientes`);
    if (!Array.isArray(s.solutions) || s.solutions.length < 1) errors.push(`${s.id}: soluciones insuficientes`);
  }
}
if (curated.length !== 250) errors.push(`Se esperaban 250 síntomas nuevos; hay ${curated.length}`);

console.log(JSON.stringify({
  records: symptoms.length,
  categories: categories.length,
  curated: curated.length,
  withDtc: symptoms.filter(s => s.relatedDtc.length).length,
  withoutDtc: symptoms.filter(s => !s.relatedDtc.length).length,
  errors: errors.length
}, null, 2));
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
