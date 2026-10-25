import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const router = express.Router();

const fold = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cache = new Map();

function readData(name) {
  const file = path.join(DATA_DIR, name);
  try {
    const stat = fs.statSync(file);
    const hit = cache.get(name);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.data;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache.set(name, { mtimeMs: stat.mtimeMs, size: stat.size, data });
    return data;
  } catch (error) {
    console.error(`[TECHNICAL] No se pudo leer ${name}: ${error.message}`);
    return null;
  }
}

function load() {
  const library = readData('technical-library.json');
  const sourcesFile = readData('technical-sources.json');
  if (!library || !sourcesFile) return null;
  const sourceById = new Map(sourcesFile.sources.map(s => [s.id, s]));
  const categoryById = new Map(library.categories.map(c => [c.id, c]));
  const pids = library.entries
    .filter(entry => entry.type === 'pid' && entry.data)
    .map(entry => ({
      code: entry.data.code,
      mode: entry.data.mode,
      pid: entry.data.pid,
      bytes: entry.data.bytes,
      nameEn: entry.data.nameEn || entry.title,
      formula: entry.data.formula || '',
      unit: entry.data.unit || '',
      range: entry.data.range || null,
      sourceIds: entry.sourceIds || [],
      license: entry.license,
      licenseClass: entry.licenseClass,
      entryId: entry.id
    }))
    .sort((a, b) => String(a.code).localeCompare(String(b.code), 'en'));
  const pidByCode = new Map(pids.map(p => [String(p.code).toUpperCase(), p]));
  return { library, sources: sourcesFile.sources, sourcesNotice: sourcesFile.notice, pids, sourceById, pidByCode, categoryById };
}

function limit(value, fallback = 40, max = 200) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : fallback;
}

function toSummary(entry, categoryById, sourceById) {
  return {
    id: entry.id,
    title: entry.title,
    summary: entry.summary,
    type: entry.type,
    entryType: entry.entryType,
    categoryId: entry.categoryId,
    categoryTitle: categoryById.get(entry.categoryId)?.title || entry.categoryId,
    group: entry.group,
    status: entry.status,
    confidence: entry.confidence,
    system: entry.system,
    brand: entry.brand || '',
    model: entry.model || '',
    generation: entry.generation || '',
    yearFrom: entry.yearFrom || null,
    yearTo: entry.yearTo || null,
    engine: entry.engine || '',
    engineCodes: entry.engineCodes || [],
    availability: entry.availability || '',
    licenseClass: entry.licenseClass || '',
    vehicleLabel: entry.vehicleLabel || '',
    vehicleIds: entry.vehicleIds,
    sourceCount: (entry.sourceIds || []).length,
    sourceNames: (entry.sourceIds || []).slice(0, 3).map(id => sourceById.get(id)?.title).filter(Boolean),
    url: entry.url || '',
    refType: entry.refType,
    refId: entry.refId,
    tags: (entry.tags || []).slice(0, 6)
  };
}

router.get('/meta', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const { library } = data;
  const vehicles = [...new Map(library.entries
    .filter(e => e.vehicleIds?.length && e.vehicleLabel)
    .map(e => [e.vehicleIds[0], { id: e.vehicleIds[0], label: e.vehicleLabel }])).values()]
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
  const facets = library.facets || {};
  res.json({
    version: library.version,
    generatedAt: library.generatedAt,
    notice: library.notice,
    counts: library.counts,
    groups: [...new Set(library.categories.map(c => c.group))],
    types: [...new Set(library.entries.map(e => e.type))],
    statuses: [...new Set(library.entries.map(e => e.status))],
    categories: library.categories,
    vehicles,
    facets: {
      brands: facets.brands || [],
      models: facets.models || [],
      generations: facets.generations || [],
      years: facets.years || [],
      engines: facets.engines || [],
      systems: facets.systems || [],
      availability: facets.availability || [],
      licenseClasses: facets.licenseClasses || []
    },
    sources: data.sources.length,
    pids: data.pids.length
  });
});

router.get('/coverage', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const categories = data.library.categories;
  const count = (key) => categories.filter(c => c.coverage === key).length;
  res.json({
    generatedAt: data.library.generatedAt,
    categories,
    summary: {
      data: count('data'),
      source: count('source'),
      pending: count('pending'),
      total: categories.length
    }
  });
});

router.get('/sources', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  res.json({ notice: data.sourcesNotice, sources: data.sources });
});

router.get('/pids', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const notice = data.library.imports?.notes?.[0] || 'PID estándar OBD-II importados de OBDex (CC0-1.0). La ECU debe declarar el PID y el valor depende del vehículo.';
  res.json({ notice, total: data.pids.length, pids: data.pids });
});

router.get('/pids/:code', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const pid = data.pidByCode.get(String(req.params.code || '').toUpperCase());
  if (!pid) return res.status(404).json({ error: 'PID no encontrado' });
  res.json({ ...pid, sources: (pid.sourceIds || []).map(id => data.sourceById.get(id)).filter(Boolean) });
});

router.get('/', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const { library, sourceById, categoryById } = data;
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const vehicleId = String(req.query.vehicleId || '').trim();
  const type = String(req.query.type || '').trim();
  const status = String(req.query.status || '').trim();
  const brand = String(req.query.brand || '').trim();
  const model = String(req.query.model || '').trim();
  const generation = String(req.query.generation || '').trim();
  const year = Number(req.query.year) || 0;
  const engine = String(req.query.engine || '').trim();
  const engineCode = String(req.query.engineCode || '').trim();
  const system = String(req.query.system || '').trim();
  const availability = String(req.query.availability || '').trim();
  const licenseClass = String(req.query.licenseClass || '').trim();

  if (category && !categoryById.has(category)) {
    return res.status(400).json({ error: 'Categoría no válida' });
  }
  if (type && !library.entries.some(entry => entry.type === type)) {
    return res.status(400).json({ error: 'Tipo de documento no válido' });
  }
  if (status && !library.entries.some(entry => entry.status === status)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  const terms = fold(q).split(/\s+/).filter(Boolean);
  let items = library.entries.map(entry => {
    let score = 0;
    const inPrimary = !category || entry.categoryId === category;
    const inRelated = !category || entry.relatedCategoryIds.includes(category);
    if (category) {
      if (!inPrimary && !inRelated) return null;
      score += inPrimary ? 20 : 4;
    }
    if (vehicleId && !entry.vehicleIds.includes(vehicleId)) return null;
    if (type && entry.type !== type) return null;
    if (status && entry.status !== status) return null;
    if (brand && fold(entry.brand) !== fold(brand)) return null;
    if (model && fold(entry.model) !== fold(model)) return null;
    if (generation && fold(entry.generation) !== fold(generation)) return null;
    if (year && !(entry.yearFrom && year >= entry.yearFrom && (!entry.yearTo || year <= entry.yearTo))) return null;
    if (engine && !fold(entry.engine).includes(fold(engine)) && !(entry.engineCodes || []).some(code => fold(code).includes(fold(engine)))) return null;
    if (engineCode && !(entry.engineCodes || []).some(code => fold(code) === fold(engineCode))) return null;
    if (system && !fold(entry.system).includes(fold(system))) return null;
    if (availability && entry.availability !== availability) return null;
    if (licenseClass && entry.licenseClass !== licenseClass) return null;
    if (terms.length) {
      const text = entry.searchText;
      if (!terms.every(term => text.includes(term))) return null;
      const title = fold(entry.title);
      if (terms.every(term => title.includes(term))) score += 30;
      if (title.startsWith(terms[0])) score += 30;
      if (terms.some(term => (entry.tags || []).some(tag => fold(tag).includes(term)))) score += 10;
    }
    return { entry, score, match: category ? (inPrimary ? 'primary' : 'related') : 'all' };
  }).filter(Boolean);

  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ca = categoryById.get(a.entry.categoryId)?.number || 99;
    const cb = categoryById.get(b.entry.categoryId)?.number || 99;
    if (ca !== cb) return ca - cb;
    return a.entry.title.localeCompare(b.entry.title, 'es');
  });

  const total = items.length;
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const pageSize = limit(req.query.limit);
  const page = items.slice(offset, offset + pageSize);

  res.json({
    total,
    offset,
    limit: pageSize,
    hasMore: offset + page.length < total,
    query: { q, category, vehicleId, type, status, brand, model, generation, year, engine, engineCode, system, availability, licenseClass },
    items: page.map(({ entry, match }) => ({ ...toSummary(entry, categoryById, sourceById), match }))
  });
});

router.get('/:id', (req, res) => {
  const data = load();
  if (!data) return res.status(503).json({ error: 'Biblioteca técnica no disponible' });
  const entry = data.library.entries.find(e => e.id === req.params.id);
  if (!entry) return res.status(404).json({ error: 'Entrada técnica no encontrada' });
  const category = data.categoryById.get(entry.categoryId);
  res.json({
    ...entry,
    category,
    relatedCategories: entry.relatedCategoryIds.map(id => data.categoryById.get(id)).filter(Boolean),
    sources: entry.sourceIds.map(id => data.sourceById.get(id)).filter(Boolean)
  });
});

export default router;
