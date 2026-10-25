import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');

const categories = read('data/symptom-categories.json');
const normalize = value => String(value || '').toLowerCase()
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const GENERIC_DTC_WORDS = new Set([
  'aire', 'caudal', 'presion', 'sensor', 'motor', 'fallo', 'averia', 'temperatura',
  'ruido', 'fuga', 'carga', 'senal', 'electrico', 'electricidad', 'arranque',
  'potencia', 'sistema', 'vehiculo', 'coche', 'alta', 'baja', 'media', 'tiempo',
  'frio', 'caliente', 'luz', 'luces', 'mando', 'ventilador', 'resistencia', 'consumo'
]);
const categoryById = new Map(categories.map(c => [c.id, c]));
const raw = read('data/symptoms.json');
const dtc = read('data/dtc.json');
const components = read('data/components.json');

const idOverrides = {
  'hill-holder': 'frenos-chasis',
  'ruedas': 'frenos-chasis',
  'coche-se-desvia': 'frenos-chasis',
  'desgaste-interior': 'frenos-chasis',
  'tpms-fallo': 'frenos-chasis',
  'ruido-caja-ralenti': 'transmision',
  'tapon-aceite-presion': 'motor',
  'motor-se-para': 'motor',
  'embrague-roce': 'transmision',
  'fuga-valvulina': 'transmision',
  'clonk-automatica': 'transmision',
  'agua-maletero': 'carroceria-confort',
  'chirrido-correa': 'motor',
  'taques-frio': 'motor',
  'arranque-frio': 'motor',
  'arranque-caliente': 'motor',
  'humo-gris-frio': 'motor',
  'cabeceo-frio': 'motor',
  'tirones-egr-frio': 'anticontaminacion',
  'tirones-carga': 'motor',
  'fap-sensor-diferencial': 'anticontaminacion',
  'fap-tubos-rotos': 'anticontaminacion',
  'limpia-atras-marcha': 'carroceria-confort',
  'limpias-no-paran': 'carroceria-confort',
  'marcha-atras-luz': 'carroceria-confort',
  'luz-matricula': 'carroceria-confort',
  'limpias-fallo': 'carroceria-confort',
  'limpias-lentos': 'carroceria-confort',
  'ventanillas-locas': 'carroceria-confort',
  'anillo-airbag': 'carroceria-confort',
  'freno-duro-vacio': 'frenos-chasis',
  'silbido-hidraulico': 'frenos-chasis',
  'silbido-alternador': 'electricidad',
  'freno-mano-destensado': 'frenos-chasis',
  'caudal-aire-cero': 'refrigeracion-clima',
  'silbido-deposito': 'combustible',
  'vacio-deposito': 'combustible'
};

const rules = [
  ['anticontaminacion', /\b(fap|dpf|particulas|adblue|scr|eolys|egr|nox|catalizador|anticontaminacion|regeneracion|hollin|amoniaco|azufre)\b/],
  ['turbo-admision', /\b(turbo|sobrealimentacion|admision|intercooler|caudal|maf|soplido|silbido|vacio|geometria|actuador|wastegate)\b/],
  ['refrigeracion-clima', /\b(clima|aire acondicionado|calefaccion|refrigerante|anticongelante|radiador|termostato|ventilador|compresor|recirculacion|goteo|agua|enfria|calienta|calentamiento)\b/],
  ['transmision', /\b(embrague|bimasa|caja de cambios|palanca|marchas|palier|transmision|valvulina|cambio|automatica|diferencial|cardan)\b/],
  ['frenos-chasis', /\b(freno|frenada|abs|esp|pastilla|pinza|disco|fading|frenado|pedal de freno)\b/],
  ['frenos-chasis', /\b(direccion|volante|suspension|amortiguador|bache|rueda|neumatico|llanta|alineaci|cama vieja|crujido|holgura|traqueteo|clonk|clonck|tpms|desgaste)\b/],
  ['combustible', /\b(inyector|inyeccion|bomba|combustible|gasolina|gasoil|diesel|deposito|mezcla|lambda|encendido|calentador|reserva|repostar|pvc|presion de combustible)\b/],
  ['electricidad', /\b(bateria|alternador|electric|electrico|electricos|fusible|masa|tension|voltaje|cuadro|aguja|pantalla|radio|sensor|centralita|inmovilizador|llave|mando|canbus|modulo|bujia|bobina)\b/],
  ['carroceria-confort', /\b(puerta|maletero|porton|asiento|elevalunas|ventanilla|cristal|cierre|espejo|retrovisor|claxon|limpia|escobilla|luz de cortesia|techo|matricula|intermitente|bombilla|moqueta|tapiceria|airbag|velocimetro)\b/],
  ['motor', /\b(motor|ralenti|potencia|tiron|humo|aceite|ruido|vibracion|calado|arranca|arranque|correa|distribucion|cadena|taque|biela|culata|valvula|compresion|lubricacion|sobrecalent)\b/]
];

function classify(item) {
  if (idOverrides[item.id]) return idOverrides[item.id];
  if (item.categoryId && categoryById.has(item.categoryId)) return item.categoryId;
  const text = `${item.id} ${item.n || item.name || ''}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [id, re] of rules) if (re.test(text)) return id;
  return 'motor';
}

const componentRules = [
  ['turbo', /turbo|sobrealiment|silbido del turbo|no sopla/],
  ['admision', /admision|caudal|maf|soplido|toma de aire|vacio/],
  ['egr', /egr/],
  ['dpf', /fap|dpf|particula|adblue|scr|nox|catalizador/],
  ['combustible', /inyector|combustible|gasolina|gasoil|diesel|deposito|bomba|mezcla|lambda|reserva|repostar/],
  ['distribucion', /distribucion|correa|cadena|taque/],
  ['transmision', /embrague|caja|marcha|palanca|bimasa|palier|transmision|valvulina|cambio/],
  ['frenos', /freno|abs|esp|pastilla|pinza|disco/],
  ['suspension', /suspension|amortiguador|bache|rueda|neumatico|volante|direccion|holgura/],
  ['sensores', /sensor|lambda|maf|caudalimetro|presion/],
  ['centralita', /centralita|ecu|electric|electron|bateria|alternador|arranque|fusible|masa|cuadro|inmovilizador|llave/],
  ['motor', /motor|ralenti|potencia|aceite|ruido|vibracion|humo|calado|temperatura|refrigerante|termostato/]
];

function relatedComponents(item) {
  if (Array.isArray(item.relatedComponents) && item.relatedComponents.length) return item.relatedComponents;
  const text = `${item.id} ${item.n || item.name || ''} ${(item.w || []).join(' ')}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const ids = [];
  for (const [id, re] of componentRules) if (re.test(text) && !ids.includes(id)) ids.push(id);
  return ids.slice(0, 4);
}

const seenIds = new Set();
const seenNames = new Set();
const removed = [];
const unique = [];

for (const item of raw) {
  const id = String(item.id || '').trim();
  const name = String(item.name || item.n || id).trim();
  const keyName = name.toLowerCase();
  if (!id || seenIds.has(id) || seenNames.has(keyName)) {
    removed.push({ id, name, reason: !id ? 'sin_id' : seenIds.has(id) ? 'id_duplicado' : 'nombre_duplicado' });
    continue;
  }
  seenIds.add(id);
  seenNames.add(keyName);
  const categoryId = classify({ ...item, n: name });
  const category = categoryById.get(categoryId);
  const words = Array.isArray(item.w) ? [...new Set(item.w.map(w => String(w).toLowerCase()).filter(Boolean))] : [];
  if (item.curated) {
    unique.push({
      ...item,
      id,
      n: name,
      name,
      categoryId,
      category: category.label,
      icon: item.icon || category.icon,
      w: words
    });
    continue;
  }
  const relationTokens = words
    .map(normalize)
    .filter(w => w.length >= 3 && !GENERIC_DTC_WORDS.has(w));
  let relatedDtc = Array.isArray(item.relatedDtc) && item.relatedDtc.length
    ? item.relatedDtc
    : (() => {
        const candidates = dtc
          .filter(d => Array.isArray(d.causes) && d.causes.length && Array.isArray(d.checks) && d.checks.length)
          .map(d => {
            const text = normalize(`${d.code} ${d.title} ${d.description || ''}`);
            const score = relationTokens.filter(w => text.includes(w)).length;
            return { code: d.code, title: d.title, score };
          })
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score);
        const filtered = (categoryId === 'electricidad' || categoryId === 'carroceria-confort')
          ? candidates
          : candidates.filter(x => !x.code.startsWith('U'));
        const pool = filtered.length ? filtered : [];
        const seen = new Set();
        const picked = [];
        for (const candidate of pool) {
          const key = normalize(candidate.title);
          if (seen.has(key)) continue;
          seen.add(key);
          picked.push(candidate.code);
          if (picked.length >= 6) break;
        }
        return picked;
      })();

  unique.push({
    ...item,
    id,
    n: name,
    name,
    categoryId,
    category: category.label,
    icon: item.icon || category.icon,
    relatedDtc,
    relatedComponents: relatedComponents(item),
    vehicleScope: 'generico',
    source: 'Catalogo interno de sintomas + data/dtc.json',
    validationStatus: 'relacion_derivada_por_palabras_clave',
    lastReviewed: '2026-10-23',
    w: words
  });
}

unique.sort((a, b) => {
  const ai = categories.findIndex(c => c.id === a.categoryId);
  const bi = categories.findIndex(c => c.id === b.categoryId);
  return ai - bi || String(a.n).localeCompare(String(b.n), 'es');
});

const counts = Object.fromEntries(categories.map(c => [c.id, unique.filter(s => s.categoryId === c.id).length]));
const withoutDtc = unique.filter(s => !s.relatedDtc.length).map(s => s.id);
const audit = {
  generatedAt: new Date().toISOString(),
  inputRecords: raw.length,
  uniqueRecords: unique.length,
  removedDuplicates: removed,
  categories: counts,
  withoutRelatedDtc: withoutDtc,
  withRelatedComponents: unique.filter(s => s.relatedComponents.length).length,
  totalDtcRelations: unique.reduce((n, s) => n + s.relatedDtc.length, 0),
  curatedRecords: unique.filter(s => s.curated).length,
  source: 'Datos internos existentes + 250 síntomas técnicos nuevos; relaciones DTC genéricas.',
  validation: 'Sin validacion por marca/modelo'
};

write('data/symptoms.json', unique);
write('data/auditoria-sintomas.json', audit);
console.log(JSON.stringify({
  input: raw.length,
  unique: unique.length,
  removed: removed.length,
  counts,
  withoutDtc: withoutDtc.length,
  withComponents: audit.withRelatedComponents,
  dtcRelations: audit.totalDtcRelations
}, null, 2));
