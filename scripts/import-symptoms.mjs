/**
 * Importa bases de síntomas externas (JSON con { metadata, sintomas: [...] })
 * a data/symptoms.json sin repetir lo que ya hay.
 *
 * Uso:
 *   node scripts/import-symptoms.mjs "sintoma 1" "sintoma 2" "sintoma 3"
 *
 * - Arregla los saltos de línea y tabuladores sueltos dentro de las cadenas
 *   (uno de los ficheros venía con JSON inválido).
 * - Descarta duplicados exactos y casi-duplicados (mismo síntoma con otras
 *   palabras) comparando con los 454 que ya existen y entre los ficheros.
 * - Solo acepta códigos DTC que existan en data/dtc.json: si no, la auditoría
 *   del proyecto falla.
 * - Los campos que faltan (categoría, palabras clave, componentes) los rellena
 *   después `npm run symptoms:build`.
 *
 * Es idempotente: si lo ejecutas dos veces no duplica nada.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SYMPTOMS_PATH = path.join(root, 'data/symptoms.json');
const DTC_PATH = path.join(root, 'data/dtc.json');

const normalize = value => String(value || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9\s-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'u', 'en', 'con',
  'sin', 'por', 'para', 'al', 'a', 'que', 'se', 'su', 'sus', 'es', 'son', 'esta', 'este', 'muy',
  'mas', 'menos', 'cuando', 'como', 'sobre', 'tras', 'entre', 'no', 'ni', 'ya', 'lo', 'le', 'les'
]);

const tokens = text => normalize(text).split(' ').filter(t => t.length > 2 && !STOPWORDS.has(t));

const jaccard = (a, b) => {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
};

const slug = text => normalize(text)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .split('-')
  .slice(0, 9)
  .join('-');

// Arregla cadenas con saltos de línea o tabuladores literales dentro de las
// comillas; es el único defecto que traían los ficheros de origen.
function repairJson(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (inString) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === '\\') { out += ch; escaped = true; continue; }
      if (ch === '"') { inString = false; out += ch; continue; }
      if (code < 0x20) {
        out += code === 9 ? '\\t' : code === 10 ? '\\n' : code === 13 ? '\\r'
          : `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

function readSource(file) {
  const raw = fs.readFileSync(file, 'utf8');
  try { return JSON.parse(raw); } catch { /* se intenta reparar */ }
  try { return JSON.parse(repairJson(raw)); } catch { /* puede estar cortado */ }

  // Fichero truncado a mitad de un objeto (le pasa a "sintoma 2": acaba en
  // "severidad" sin cerrar). Se rescatan todos los síntomas completos.
  try {
    const listStart = raw.indexOf('[', raw.indexOf('"sintomas"'));
    if (listStart < 0) throw new Error('sin lista de síntomas');
    const rest = raw.slice(listStart + 1);
    const cut = rest.lastIndexOf('},');
    if (cut < 0) throw new Error('sin objetos completos');
    const rescued = JSON.parse(`[${repairJson(rest.slice(0, cut + 1))}]`);
    console.warn(`${path.basename(file)}: fichero cortado, rescatados ${rescued.length} síntomas completos`);
    return { sintomas: rescued };
  } catch (error) {
    console.error(`No se pudo leer ${file}: ${error.message}`);
    return null;
  }
}

const severityMap = {
  'crítica': { urgency: 'Muy alta', risk: 'Riesgo muy alto: no circule. Pare en un lugar seguro y repará antes de usar el coche.' },
  critica: { urgency: 'Muy alta', risk: 'Riesgo muy alto: no circule. Pare en un lugar seguro y repará antes de usar el coche.' },
  alta: { urgency: 'Alta', risk: 'Riesgo alto: detenga el vehículo en un lugar seguro y no circule hasta diagnosticar el sistema.' },
  media: { urgency: 'Media', risk: 'Riesgo medio: puede circular con precaución hasta el taller, vigilando el síntoma.' },
  baja: { urgency: 'Baja', risk: 'Riesgo bajo: conviene revisarlo, pero no impide circular con normalidad.' }
};

const existing = JSON.parse(fs.readFileSync(SYMPTOMS_PATH, 'utf8'));
const knownDtc = new Set(JSON.parse(fs.readFileSync(DTC_PATH, 'utf8')).map(d => String(d.code).toUpperCase()));
const usedIds = new Set(existing.map(s => s.id));
const signatures = existing.map(s => ({ id: s.id, tokens: tokens(s.name || s.n) }));

const added = [];
const skipped = [];
const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('Uso: node scripts/import-symptoms.mjs "sintoma 1" "sintoma 2" ...');
  process.exit(1);
}

for (const arg of inputs) {
  const file = path.isAbsolute(arg) ? arg : path.resolve(arg);
  const data = readSource(file);
  if (!data || !Array.isArray(data.sintomas)) { skipped.push({ file, reason: 'sin_sintomas' }); continue; }
  let takenFromFile = 0;
  for (const item of data.sintomas) {
    const name = String(item.sintoma || item.name || '').trim();
    if (!name) { skipped.push({ file, reason: 'sin_nombre' }); continue; }
    const signature = tokens(name);
    if (!signature.length) { skipped.push({ file, name, reason: 'sin_palabras' }); continue; }

    // Duplicado exacto o casi idéntico (mismo síntoma con otras palabras).
    const dup = signatures.find(s => normalize(s.id) === normalize(item.id)
      || s.tokens.join(' ') === signature.join(' ')
      || jaccard(s.tokens, signature) >= 0.8);
    if (dup) { skipped.push({ file, name, reason: `duplicado_de_${dup.id}` }); continue; }

    let id = slug(name) || `sintoma-${added.length + 1}`;
    let suffix = 2;
    while (usedIds.has(id)) { id = `${slug(name)}-${suffix}`; suffix += 1; }
    usedIds.add(id);
    signatures.push({ id, tokens: signature });

    const sev = severityMap[normalize(item.severidad)] || severityMap.media;
    const causes = (item.causas_probables || []).map(text => ({ likelihood: 'posible', text: String(text) })).slice(0, 8);
    const checks = (item.pruebas_diagnosticas || []).map(String).slice(0, 8);
    const dtcs = (item.codigos_dtc_relacionados || [])
      .map(code => String(code).toUpperCase().trim())
      .filter(code => knownDtc.has(code));
    const words = [...new Set(tokens(name).concat(tokens(item.sistema || '')))];

    added.push({
      id,
      n: name,
      name,
      w: words,
      area: String(item.sistema || '').trim() || 'General',
      description: causes.length ? causes[0].text : name,
      urgency: sev.urgency,
      driveRisk: sev.risk,
      commonCauses: causes,
      quickChecks: checks,
      solutions: [],
      relatedDtc: [...new Set(dtcs)],
      source: String(item.fuente || '').trim() || 'Base externa de síntomas',
      sourceId: String(item.id || '').trim(),
      sourceType: 'base_externa_documental',
      validationStatus: 'importado_sin_validar_por_modelo',
      lastReviewed: new Date().toISOString().slice(0, 10),
      curated: false
    });
    takenFromFile += 1;
  }
  console.log(`${path.basename(file)}: ${takenFromFile} síntomas nuevos de ${data.sintomas.length}`);
}

const all = existing.concat(added);
fs.writeFileSync(SYMPTOMS_PATH, `${JSON.stringify(all, null, 2)}\n`);

console.log('');
console.log(`Añadidos: ${added.length}`);
console.log(`Descartados: ${skipped.length} (duplicados o incompletos)`);
if (skipped.length) {
  for (const s of skipped.slice(0, 12)) console.log(`  · ${s.reason}: ${s.name || s.file}`);
  if (skipped.length > 12) console.log(`  · …y ${skipped.length - 12} más`);
}
console.log(`Total en data/symptoms.json: ${all.length}. Ahora: npm run symptoms:build`);
