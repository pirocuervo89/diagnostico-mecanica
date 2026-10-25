#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = (name, fallback = null) => {
  const file = path.join(root, 'data', name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const readImport = (name, fallback = null) => {
  const file = path.join(root, 'data', 'imports', name);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const write = (name, value) => fs.writeFileSync(path.join(root, 'data', name), JSON.stringify(value, null, 2) + '\n');

const categoriesFile = read('technical-categories.json');
const sourcesFile = read('technical-sources.json');
const guidesFile = read('technical-guides.json');
const vehicles = read('vehicles.json', []);
const tutorialsFile = read('tutorials-seed.json', { videos: [] });
const documentsFile = read('biblioteca-documents.json', { documents: [] });

const dtcFile = readImport('obdex-dtc.json', { items: [] });
const pidsFile = readImport('obdex-pids.json', { items: [] });
const modelsFile = readImport('autoseeker-models.json', { items: [] });
const recallsFile = readImport('nhtsa-recalls.json', { items: [] });
const openEvFile = readImport('openev-vehicles.json', { items: [] });
const eeaFile = readImport('eea-co2cars-2025.json', { models: [], variants: [] });
const manufacturerDtcFile = readImport('wal33d-dtc.json', { items: [] });
const canDbcFile = readImport('opendbc-dbc.json', { items: [] });
const manifest = readImport('manifest.json', null);

const categories = categoriesFile.categories;
const categoryById = new Map(categories.map(category => [category.id, category]));
const sources = sourcesFile.sources;
const sourceById = new Map(sources.map(source => [source.id, source]));
const sourceByUrl = new Map(sources.map(source => [source.url, source.id]));
const entries = new Map();

const fold = value => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/_/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const yearRange = value => {
  const years = String(value || '').match(/\b(19|20)\d{2}\b/g) || [];
  if (!years.length) return { yearFrom: null, yearTo: null };
  return { yearFrom: Number(years[0]), yearTo: Number(years[years.length - 1]) };
};

const truncate = (value, max = 620) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const sourceList = ids => [...new Set((ids || []).filter(id => sourceById.has(id)))];
const sourceFor = entry => sourceList(entry.sourceIds).map(id => sourceById.get(id))[0] || null;

function add(entry) {
  if (!entry.id) throw new Error('Entrada sin id');
  if (entries.has(entry.id)) throw new Error(`ID duplicado: ${entry.id}`);
  const category = categoryById.get(entry.categoryId);
  if (!category) throw new Error(`Categoría inexistente en ${entry.id}: ${entry.categoryId}`);
  const relatedCategoryIds = [...new Set(entry.relatedCategoryIds || [])]
    .filter(id => categoryById.has(id) && id !== entry.categoryId);
  const sourceIds = sourceList(entry.sourceIds);
  const primary = sourceById.get(sourceIds[0]) || null;
  const searchText = fold([
    entry.title,
    entry.summary,
    category.title,
    entry.system,
    entry.brand,
    entry.model,
    entry.generation,
    entry.engine,
    entry.vehicleLabel,
    ...(entry.tags || []),
    ...(entry.engineCodes || []),
    ...(entry.components || []),
    ...relatedCategoryIds.map(id => categoryById.get(id).title)
  ].filter(Boolean).join(' '));
  entries.set(entry.id, {
    ...entry,
    categoryTitle: category.title,
    group: category.group,
    sourceIds,
    relatedCategoryIds,
    vehicleIds: [...new Set(entry.vehicleIds || [])],
    tags: [...new Set((entry.tags || []).filter(Boolean))],
    engineCodes: [...new Set((entry.engineCodes || []).filter(Boolean))],
    components: [...new Set((entry.components || []).filter(Boolean))],
    brand: entry.brand || '',
    model: entry.model || '',
    generation: entry.generation || '',
    yearFrom: Number.isFinite(Number(entry.yearFrom)) ? Number(entry.yearFrom) : null,
    yearTo: Number.isFinite(Number(entry.yearTo)) ? Number(entry.yearTo) : null,
    engine: entry.engine || '',
    system: entry.system || category.title,
    license: entry.license || primary?.license || 'Contenido editorial del proyecto',
    licenseClass: entry.licenseClass || primary?.licenseClass || 'project_editorial',
    attribution: entry.attribution || primary?.attribution || 'Diagnóstico y Mecánica',
    availability: entry.availability || 'full',
    searchText,
    updatedAt: '2026-10-25'
  });
}

const CATEGORY_KEYWORDS = [
  { id: 'turbo', terms: ['turbo', 'turbocharger', 'supercharger', 'wastegate', 'boost', 'charge air', 'intercooler'] },
  { id: 'egr-intake', terms: ['egr', 'exhaust gas recirculation', 'intake manifold', 'throttle', 'air intake', 'swirl flap'] },
  { id: 'dpf-emissions', terms: ['dpf', 'fap', 'particulate', 'catalyst', 'catalytic', 'oxygen sensor', 'lambda', 'nox', 'scr', 'adblue', 'evap', 'emission'] },
  { id: 'injection', terms: ['injector', 'injection', 'fuel', 'rail', 'ignition', 'spark', 'coil', 'misfire', 'glow plug'] },
  { id: 'cooling-lubrication', terms: ['cooling', 'coolant', 'thermostat', 'radiator', 'fan', 'oil', 'lubrication', 'oil pressure'] },
  { id: 'timing', terms: ['timing', 'camshaft', 'crankshaft', 'variable valve', 'vvt', 'cam position', 'crank position', 'chain'] },
  { id: 'clutch-transmission', terms: ['transmission', 'gearbox', 'clutch', 'gear', 'torque converter', 'differential', 'transfer case', 'drivetrain'] },
  { id: 'brakes-abs-esp', terms: ['brake', 'abs', 'wheel speed', 'stability', 'esc', 'ebd', 'parking brake'] },
  { id: 'suspension-steering', terms: ['suspension', 'steering', 'strut', 'ride control', 'power steering', 'alignment'] },
  { id: 'electrical-values', terms: ['battery', 'alternator', 'starter', 'charging', 'voltage', 'glow relay'] },
  { id: 'hybrid-ev', terms: ['hybrid', 'high voltage', 'high-voltage', 'inverter', 'battery pack', 'electric vehicle', 'traction motor'] },
  { id: 'can-diagnostics', terms: ['can', 'communication', 'data bus', 'network', 'module', 'pcm', 'ecm', 'tcm', 'bcm'] },
  { id: 'sensors-actuators', terms: ['sensor', 'actuator', 'position', 'pressure', 'temperature', 'mass air', 'maf', 'map sensor', 'oxygen'] },
  { id: 'adas', terms: ['camera', 'radar', 'lidar', 'parking assist', 'lane', 'blind spot', 'adaptive cruise', 'adas'] },
  { id: 'connectors-pinouts', terms: ['wiring', 'connector', 'terminal', 'wire', 'circuit'] },
  { id: 'ecu', terms: ['control module', 'ecu', 'pcm', 'ecm', 'immobilizer'] }
];

function relatedCategoriesForDtc(item) {
  const text = fold([
    item.category,
    item.titleEn,
    item.descriptionEn,
    ...item.components,
    ...item.causes.map(cause => cause.labelEn)
  ].filter(Boolean).join(' '));
  const found = CATEGORY_KEYWORDS
    .filter(mapping => mapping.terms.some(term => text.includes(fold(term))))
    .map(mapping => mapping.id);
  if (item.code.startsWith('U')) found.push('can-diagnostics');
  if (item.code.startsWith('C')) found.push('brakes-abs-esp');
  if (item.code.startsWith('B')) found.push('can-diagnostics');
  return [...new Set(found)];
}

function systemForDtc(item, related) {
  const labels = {
    turbo: 'Turbo y sobrealimentación',
    'egr-intake': 'EGR y admisión',
    'dpf-emissions': 'Emisiones y postratamiento',
    injection: 'Inyección y encendido',
    'cooling-lubrication': 'Refrigeración y lubricación',
    timing: 'Distribución',
    'clutch-transmission': 'Transmisión',
    'brakes-abs-esp': 'Frenos y ABS',
    'suspension-steering': 'Suspensión y dirección',
    'electrical-values': 'Sistema eléctrico',
    'hybrid-ev': 'Híbridos y eléctricos',
    'can-diagnostics': 'Redes y comunicación',
    'sensors-actuators': 'Sensores y actuadores',
    adas: 'ADAS',
    'connectors-pinouts': 'Cableado',
    ecu: 'Centralitas'
  };
  return labels[related[0]] || 'Diagnóstico OBD-II';
}

const repairLabel = value => ({ easy: 'Fácil', medium: 'Media', hard: 'Difícil' })[value] || value || 'No indicada';
const likelihoodLabel = value => ({ high: 'Alta', medium: 'Media', low: 'Baja' })[value] || value || 'Posible';
const FUEL_LABELS = {
  benzine: 'Gasolina',
  petrol: 'Gasolina',
  gasoline: 'Gasolina',
  diesel: 'Diésel',
  hybride: 'Híbrido',
  hybrid: 'Híbrido',
  'mild hybrid': 'Híbrido suave',
  'plug-in hybride': 'Híbrido enchufable',
  'plug-in hybrid': 'Híbrido enchufable',
  'petrol/electric': 'Híbrido gasolina',
  'diesel/electric': 'Híbrido diésel',
  elektrisch: 'Eléctrico',
  electric: 'Eléctrico',
  lpg: 'GLP',
  cng: 'GNC',
  hydrogen: 'Hidrógeno',
  e85: 'E85',
  'petrol (e85)': 'Gasolina/E85'
};
const fuelLabel = value => FUEL_LABELS[fold(value)] || value;

const BRAND_MAP = {
  abarth: 'Abarth',
  'alfa romeo': 'Alfa Romeo',
  alfaromeo: 'Alfa Romeo',
  'aston martin': 'Aston Martin',
  audi: 'Audi',
  bentley: 'Bentley',
  bmw: 'BMW',
  bugatti: 'Bugatti',
  buick: 'Buick',
  byd: 'BYD',
  cadillac: 'Cadillac',
  chevrolet: 'Chevrolet',
  chevy: 'Chevrolet',
  chrysler: 'Chrysler',
  citroen: 'Citroën',
  cupra: 'CUPRA',
  dacia: 'Dacia',
  daewoo: 'Daewoo',
  daf: 'DAF',
  dodge: 'Dodge',
  ds: 'DS',
  'ds automobiles': 'DS Automobiles',
  ferrari: 'Ferrari',
  fiat: 'Fiat',
  ford: 'Ford',
  genesis: 'Genesis',
  gmc: 'GMC',
  'general motors': 'GM',
  gm: 'GM',
  gwm: 'GWM',
  honda: 'Honda',
  hummer: 'Hummer',
  hyundai: 'Hyundai',
  infiniti: 'Infiniti',
  isuzu: 'Isuzu',
  iveco: 'Iveco',
  jaguar: 'Jaguar',
  jeep: 'Jeep',
  kia: 'Kia',
  kgm: 'KGM',
  lada: 'Lada',
  lamborghini: 'Lamborghini',
  lancia: 'Lancia',
  'land rover': 'Land Rover',
  lexus: 'Lexus',
  lincoln: 'Lincoln',
  lotus: 'Lotus',
  'lynk & co': 'Lynk & Co',
  man: 'MAN',
  maserati: 'Maserati',
  mazda: 'Mazda',
  mclaren: 'McLaren',
  'mercedes-amg': 'Mercedes-AMG',
  mercedes: 'Mercedes-Benz',
  'mercedes-benz': 'Mercedes-Benz',
  mercury: 'Mercury',
  mg: 'MG',
  mini: 'MINI',
  mitsubishi: 'Mitsubishi',
  nissan: 'Nissan',
  oldsmobile: 'Oldsmobile',
  opel: 'Opel',
  peugeot: 'Peugeot',
  plymouth: 'Plymouth',
  polestar: 'Polestar',
  pontiac: 'Pontiac',
  porsche: 'Porsche',
  ram: 'RAM',
  renault: 'Renault',
  'renault trucks': 'Renault Trucks',
  rover: 'Rover',
  saab: 'Saab',
  saleen: 'Saleen',
  saturn: 'Saturn',
  scania: 'Scania',
  seat: 'SEAT',
  skoda: 'Škoda',
  smart: 'smart',
  ssangyong: 'SsangYong',
  subaru: 'Subaru',
  suzuki: 'Suzuki',
  tesla: 'Tesla',
  toyota: 'Toyota',
  vauxhall: 'Vauxhall',
  volkswagen: 'Volkswagen',
  volvo: 'Volvo',
  vw: 'Volkswagen'
};

const brandName = raw => {
  const clean = String(raw ?? '').split(',')[0].replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return BRAND_MAP[fold(clean)] || clean.toLowerCase().replace(/(^|[\s\-/])([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
};

const cleanModel = (raw, rawBrand) => {
  let text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const brand = brandName(rawBrand);
  const aliases = [brand, ...String(rawBrand ?? '').split(/[,/]/).map(brandName)]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const normalizedText = fold(text);
    const normalizedAlias = fold(alias);
    if (!normalizedAlias) continue;
    if (normalizedText === normalizedAlias) {
      text = '';
      break;
    }
    if (normalizedText.startsWith(`${normalizedAlias} `)) {
      text = text.slice(alias.length).trim();
      break;
    }
  }
  const minor = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'con', 'para', 'por', 'en']);
  return text.split(/\s+/).map((token, index) => {
    if (!token) return token;
    if (/^[A-Z0-9+./&-]+$/.test(token) && (token.length <= 4 || /\d/.test(token))) return token;
    if (index > 0 && minor.has(token.toLowerCase())) return token.toLowerCase();
    return token[0].toUpperCase() + token.slice(1).toLowerCase();
  }).join(' ');
};

const slugify = (value, max = 72) => fold(value)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, max)
  .replace(/-+$/g, '');

const stableHash = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 12);
const numberOrNull = value => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const integerLabel = value => {
  const number = numberOrNull(value);
  return number === null ? '' : new Intl.NumberFormat('es-ES').format(number);
};

for (const model of modelsFile.items || []) {
  const specs = model.specs || {};
  const yearFrom = model.yearFrom;
  const yearTo = model.yearTo;
  const yearLabel = yearFrom ? `${yearFrom}–${yearTo || 'actualidad'}` : 'Años no indicados';
  const fuels = (model.fuels || []).map(fuelLabel);
  const power = specs.vermogen_pk ? `${specs.vermogen_pk} CV` : 'potencia no indicada';
  const body = specs.carrosserie || 'carrocería no indicada';
  add({
    id: `auto-${model.slug}`,
    type: 'vehicle_spec',
    entryType: 'Especificación de modelo',
    title: `${model.brand} ${model.model} ${model.generation || ''}`.trim(),
    summary: `${yearLabel} · ${fuels.join(', ') || 'combustible no indicado'} · ${power} · ${body}. Datos indicativos de fabricante/WLTP publicados por autoseeker.eu.`,
    categoryId: 'vehicles-engines',
    relatedCategoryIds: ['maintenance-manuals', 'workshop-manuals', 'repair-procedures', 'torque-specs'],
    brand: model.brand,
    model: model.model,
    generation: model.generation,
    yearFrom,
    yearTo,
    engine: '',
    engineCodes: [],
    fuel: fuels.join(', '),
    fuels,
    system: 'Vehículo / especificaciones',
    tags: [model.brand, model.model, model.generation, ...fuels, body, 'autoseeker'],
    status: 'reviewed',
    confidence: 'media',
    sourceIds: ['src-autoseeker'],
    refType: 'autoseeker',
    refId: model.slug,
    url: model.sourceUrl,
    availability: 'full',
    license: 'CC BY 4.0',
    licenseClass: 'importable_attribution',
    attribution: model.attribution,
    data: {
      brand: model.brand,
      model: model.model,
      generation: model.generation,
      status: model.status,
      yearFrom,
      yearTo,
      fuels,
      specs,
      note: 'Especificaciones indicativas del fabricante/WLTP recopiladas por autoseeker.eu. Verificar la ficha oficial de la versión y el mercado antes de usarlas para una reparación.'
    }
  });
}

for (const ev of openEvFile.items || []) {
  const brand = brandName(ev.make?.name || ev.make?.slug);
  const model = cleanModel(ev.model?.name || ev.model?.slug, ev.make?.name || ev.make?.slug);
  const trim = ev.trim?.name && fold(ev.trim.name) !== 'base' ? ev.trim.name : '';
  const variant = ev.variant?.name || '';
  const title = [brand, model, variant, trim].filter(Boolean).join(' ');
  const year = numberOrNull(ev.year);
  const power = numberOrNull(ev.powertrain?.system_power_kw);
  const torque = numberOrNull(ev.powertrain?.system_torque_nm);
  const battery = numberOrNull(ev.battery?.pack_capacity_kwh_net) ?? numberOrNull(ev.battery?.pack_capacity_kwh_gross);
  const ranges = (ev.range?.rated || [])
    .map(range => `${integerLabel(range.range_km)} km ${String(range.cycle || '').toUpperCase()}`.trim())
    .filter(Boolean);
  const bodyStyle = ({ sedan: 'berlina', suv: 'SUV', hatchback: 'compacto', wagon: 'familiar', coupe: 'cupé', mpv: 'monovolumen', pickup: 'pickup', van: 'furgoneta' })[fold(ev.body?.style)] || ev.body?.style || '';
  const motors = ev.powertrain?.motors?.length || 0;
  const summaryParts = [
    year ? String(year) : 'Año no indicado',
    bodyStyle,
    power ? `${power} kW` : '',
    torque ? `${torque} Nm` : '',
    battery ? `batería ${battery} kWh` : '',
    ranges.length ? ranges.join(' · ') : ''
  ].filter(Boolean);
  add({
    id: `ev-${slugify(ev.unique_code || `${brand}-${model}-${year}-${trim}-${variant}`, 90)}`,
    type: 'vehicle_spec',
    entryType: 'Especificación de vehículo eléctrico',
    title: title || `${brand} ${model}`.trim(),
    summary: `${summaryParts.join(' · ')}. Ficha de vehículo eléctrico de OpenEV Data.`,
    categoryId: 'hybrid-ev',
    relatedCategoryIds: ['vehicles-engines', 'electrical-values', 'can-diagnostics', 'maintenance-manuals'],
    brand,
    model,
    generation: variant || trim,
    yearFrom: year,
    yearTo: year,
    engine: motors ? `Motor eléctrico (${motors})` : 'Motor eléctrico',
    engineCodes: [],
    fuel: 'Eléctrico',
    fuels: ['Eléctrico'],
    system: 'Vehículo eléctrico',
    tags: [brand, model, variant, trim, 'eléctrico', 'OpenEV', ev.vehicle_type, ev.body?.style].filter(Boolean),
    status: 'reviewed',
    confidence: 'media',
    sourceIds: ['src-openev'],
    refType: 'openev',
    refId: ev.unique_code,
    url: 'https://github.com/open-ev-data/open-ev-data-dataset',
    availability: 'full',
    license: 'CDLA-Permissive-2.0',
    licenseClass: 'importable_redistributable',
    attribution: 'OpenEV Data contributors, CDLA-Permissive-2.0',
    data: {
      specKind: 'ev',
      brand,
      model,
      year,
      trim: ev.trim,
      variant: ev.variant,
      vehicleType: ev.vehicle_type,
      powertrain: ev.powertrain,
      battery: ev.battery,
      chargePorts: ev.charge_ports,
      charging: ev.charging,
      range: ev.range,
      body: ev.body,
      dimensions: ev.dimensions,
      weights: ev.weights,
      performance: ev.performance,
      markets: ev.markets,
      availability: ev.availability,
      sources: ev.sources,
      uniqueCode: ev.unique_code,
      note: 'Especificaciones eléctricas recopiladas por OpenEV Data a partir de fuentes públicas y del fabricante. Verificar la versión, el mercado y el equipamiento antes de usarlas en una reparación.'
    }
  });
}

const eeaVariantsByModel = new Map();
for (const variant of eeaFile.variants || []) {
  const key = [variant.Mk, variant.Cn, variant.Ft, variant.Ec ?? '', variant.Ep ?? ''].join('|');
  if (!eeaVariantsByModel.has(key)) eeaVariantsByModel.set(key, []);
  eeaVariantsByModel.get(key).push({
    variant: variant.Va || '',
    version: variant.Ve || '',
    registrations: numberOrNull(variant.Registrations) || 0,
    massMin: numberOrNull(variant.MassMin),
    massMax: numberOrNull(variant.MassMax)
  });
}
for (const model of eeaFile.models || []) {
  const brand = brandName(model.Mk);
  const modelName = cleanModel(model.Cn, model.Mk);
  const fuelType = String(model.Ft || '');
  const fuel = fuelLabel(fuelType);
  const displacementCc = numberOrNull(model.Ec);
  const powerKw = numberOrNull(model.Ep);
  const massKg = numberOrNull(model.MassMin);
  const co2Wltp = numberOrNull(model.Co2Min);
  const registrations = numberOrNull(model.Registrations) || 0;
  const key = [model.Mk, model.Cn, model.Ft, model.Ec ?? '', model.Ep ?? ''].join('|');
  const variants = eeaVariantsByModel.get(key) || [];
  const refId = [model.Mk, model.Cn, model.Ft, model.Ec ?? '', model.Ep ?? ''].join(':');
  const related = ['vehicles-engines', 'maintenance-manuals', 'torque-specs'];
  if (fuelType && ['electric', 'hybrid', 'plug-in hybrid', 'petrol/electric', 'diesel/electric'].includes(fold(fuelType))) related.push('hybrid-ev');
  if (fold(fuelType).includes('diesel')) related.push('dpf-emissions', 'turbo');
  const summaryParts = [
    '2025 (provisional)',
    fuel,
    displacementCc ? `${integerLabel(displacementCc)} cm³` : '',
    powerKw ? `${integerLabel(powerKw)} kW` : '',
    massKg ? `${integerLabel(massKg)} kg` : '',
    co2Wltp !== null ? `${integerLabel(co2Wltp)} g/km WLTP` : '',
    `${integerLabel(registrations)} matriculaciones`
  ].filter(Boolean);
  add({
    id: `eea-2025-${stableHash(refId)}`,
    type: 'vehicle_spec',
    entryType: 'Homologación europea CO2',
    title: `${brand} ${modelName}`.trim(),
    summary: `${summaryParts.join(' · ')}. Datos de homologación de la EEA; no incluyen procedimientos de reparación.`,
    categoryId: 'vehicles-engines',
    relatedCategoryIds: [...new Set(related)],
    brand,
    model: modelName,
    generation: '',
    yearFrom: 2025,
    yearTo: 2025,
    engine: displacementCc ? `${integerLabel(displacementCc)} cm³` : fuel,
    engineCodes: [],
    fuel,
    fuels: [fuel],
    system: 'Vehículo / homologación',
    tags: [brand, modelName, fuel, 'EEA', 'homologación', '2025'].filter(Boolean),
    status: 'reviewed',
    confidence: 'alta',
    sourceIds: ['src-eea-co2-cars'],
    refType: 'eea_co2',
    refId,
    url: 'https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b',
    availability: 'partial',
    license: 'CC BY 4.0',
    licenseClass: 'importable_attribution',
    attribution: 'European Environment Agency (EEA), Monitoring of CO2 emissions from passenger cars, 2025 provisional data, CC BY 4.0',
    data: {
      specKind: 'homologation',
      brand,
      model: modelName,
      market: 'Unión Europea',
      year: 2025,
      status: 'provisional',
      fuelType,
      fuel,
      displacementCc,
      powerKw,
      massKg,
      massMin: numberOrNull(model.MassMin),
      massMax: numberOrNull(model.MassMax),
      co2WltpGKm: co2Wltp,
      co2Min: numberOrNull(model.Co2Min),
      co2Max: numberOrNull(model.Co2Max),
      registrations,
      manufacturerCode: model.Mk,
      modelCode: model.Cn,
      variants,
      variantCount: variants.length,
      note: 'Datos agregados de homologación y matriculación publicados por la EEA. No son una ficha técnica completa ni un manual de reparación; pueden variar por versión, mercado y equipamiento.'
    }
  });
}

for (const vehicle of vehicles) {
  const years = yearRange(vehicle.years);
  const sourceIds = sourceList((vehicle.sources || []).map(source => sourceByUrl.get(source.url)));
  add({
    id: `vehicle-${vehicle.id}`,
    type: 'vehicle_dossier',
    entryType: 'Dossier de vehículo',
    title: `${vehicle.brand} ${vehicle.model} ${vehicle.version}`,
    summary: `${vehicle.years} · ${vehicle.generation}. ${vehicle.engine?.fuel || ''} ${vehicle.engine?.displacementCc || ''} cc, ${vehicle.engine?.powerPs || '?'} CV, ${vehicle.engine?.torqueNm || '?'} Nm. Dossier editorial con fuentes enlazadas; no es un manual oficial.`,
    categoryId: 'vehicles-engines',
    relatedCategoryIds: ['maintenance-manuals', 'repair-procedures', 'timing', 'torque-specs', 'brakes-abs-esp', 'clutch-transmission'],
    brand: vehicle.brand,
    model: vehicle.model,
    generation: vehicle.generation,
    yearFrom: years.yearFrom,
    yearTo: years.yearTo,
    engine: vehicle.engine?.code || '',
    engineCodes: vehicle.engine?.code ? [vehicle.engine.code] : [],
    vehicleIds: [vehicle.id],
    vehicleLabel: `${vehicle.brand} ${vehicle.model} ${vehicle.version}`,
    system: 'Vehículo / motor',
    tags: [vehicle.brand, vehicle.model, vehicle.generation, vehicle.engine?.fuel, vehicle.engine?.code, ...(vehicle.systems || [])].filter(Boolean),
    status: 'reviewed',
    confidence: vehicle.confidence || 'media',
    sourceIds,
    refType: 'vehicle',
    refId: vehicle.id,
    availability: 'partial',
    license: 'Contenido editorial con fuentes enlazadas',
    licenseClass: 'project_editorial',
    attribution: 'Diagnóstico y Mecánica',
    data: {
      id: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      generation: vehicle.generation,
      version: vehicle.version,
      years: vehicle.years,
      body: vehicle.body,
      engine: vehicle.engine,
      transmission: vehicle.transmission,
      emissions: vehicle.emissions,
      systems: vehicle.systems,
      inspection: vehicle.inspection,
      knownIssues: vehicle.knownIssues || [],
      buyingGuide: vehicle.buyingGuide || null,
      confidence: vehicle.confidence,
      notes: vehicle.notes,
      documentationScope: 'Dossier editorial: no sustituye al manual del fabricante ni contiene pares, esquemas o procedimientos oficiales completos.'
    }
  });

  const areaToCategory = area => {
    const text = fold(area);
    if (/haldex|traccion|diferencial|transmision|dsg|embrague|bimasa|caja|e-cvt/.test(text)) return 'clutch-transmission';
    if (/distribucion|cadena|correa|tensor/.test(text)) return 'timing';
    if (/freno|abs|rueda/.test(text)) return 'brakes-abs-esp';
    if (/suspension|direccion|chasis|rotula|silentblock|amortiguador/.test(text)) return 'suspension-steering';
    if (/refrigeracion|refrigerante|termostato|bomba|aceite|lubricacion/.test(text)) return 'cooling-lubrication';
    if (/admision|turbo|intercooler|mariposa|pcv|carbonilla/.test(text)) return 'turbo';
    if (/egr/.test(text)) return 'egr-intake';
    if (/dpf|fap|particulas|adblue|scr|catalizador|emisiones/.test(text)) return 'dpf-emissions';
    if (/inyeccion|inyector|combustible/.test(text)) return 'injection';
    if (/bateria hibrida|inversor|hibrid|alto voltaje/.test(text)) return 'hybrid-ev';
    if (/electronica|diagnosis|modulo|can|campana/.test(text)) return 'can-diagnostics';
    return 'repair-procedures';
  };

  (vehicle.inspection || []).forEach((inspection, index) => {
    const categoryId = areaToCategory(inspection.area);
    add({
      id: `inspection-${vehicle.id}-${index + 1}`,
      type: 'inspection',
      entryType: 'Punto de inspección',
      title: `${vehicle.brand} ${vehicle.model}: ${inspection.area}`,
      summary: inspection.check,
      categoryId,
      relatedCategoryIds: ['repair-procedures', 'maintenance-manuals'],
      brand: vehicle.brand,
      model: vehicle.model,
      generation: vehicle.generation,
      yearFrom: years.yearFrom,
      yearTo: years.yearTo,
      engine: vehicle.engine?.code || '',
      engineCodes: vehicle.engine?.code ? [vehicle.engine.code] : [],
      vehicleIds: [vehicle.id],
      vehicleLabel: `${vehicle.brand} ${vehicle.model} ${vehicle.version}`,
      system: inspection.area,
      tags: [inspection.area, vehicle.brand, vehicle.model, inspection.level, 'inspección'],
      status: 'reviewed',
      confidence: 'media',
      sourceIds,
      refType: 'inspection',
      refId: vehicle.id,
      availability: 'partial',
      license: 'Contenido editorial con fuentes enlazadas',
      licenseClass: 'project_editorial',
      attribution: 'Diagnóstico y Mecánica',
      data: {
        area: inspection.area,
        check: inspection.check,
        why: inspection.why,
        level: inspection.level,
        note: 'Checklist editorial del proyecto. No es un procedimiento oficial del fabricante.'
      }
    });
  });
}

for (const item of dtcFile.items || []) {
  const related = relatedCategoriesForDtc(item);
  const categoryId = 'obd-dtc-pids';
  const causes = item.causes.slice(0, 6).map(cause => ({
    likelihood: cause.likelihood,
    likelihoodLabel: likelihoodLabel(cause.likelihood),
    text: cause.labelEn
  }));
  const symptoms = item.symptoms.slice(0, 8);
  const repair = {
    ...item.repair,
    difficultyLabel: repairLabel(item.repair?.difficulty),
    costLabel: Array.isArray(item.repair?.costEur) ? `${item.repair.costEur[0]}–${item.repair.costEur[1]} € (estimación OBDex)` : '',
    hoursLabel: Array.isArray(item.repair?.hours) ? `${item.repair.hours[0]}–${item.repair.hours[1]} h (estimación OBDex)` : ''
  };
  add({
    id: `dtc-${item.code}`,
    type: 'dtc',
    entryType: 'Código DTC genérico',
    title: `${item.code} — ${item.titleEn}`,
    summary: `Código genérico OBD-II. ${truncate(item.descriptionEn, 620)}`,
    categoryId,
    relatedCategoryIds: related,
    engine: '',
    engineCodes: [],
    system: systemForDtc(item, related),
    tags: [item.code, item.family, item.category, ...item.components, ...related.map(id => categoryById.get(id).title)],
    status: 'reviewed',
    confidence: 'media',
    sourceIds: ['src-obdex'],
    refType: 'dtc',
    refId: item.code,
    url: 'https://github.com/foerbsnavi/obdex',
    availability: 'full',
    license: 'CC0-1.0',
    licenseClass: 'importable_redistributable',
    attribution: 'OBDex, CC0-1.0',
    components: item.components,
    data: {
      code: item.code,
      family: item.family,
      titleEn: item.titleEn,
      descriptionEn: truncate(item.descriptionEn, 1200),
      components: item.components,
      causes,
      symptoms,
      repair,
      flags: item.flags,
      relatedCodes: item.relatedCodes.slice(0, 8),
      sourceUrls: item.sourceUrls,
      scopeNote: 'Código genérico SAE/ISO. La definición, el umbral y las causas pueden variar según fabricante, motor, mercado y calibración. OBDex no cubre códigos específicos de fabricante.'
    }
  });
}

for (const item of manufacturerDtcFile.items || []) {
  const manufacturerLabel = item.manufacturer === 'OTHER' ? 'Otras marcas / no específico' : item.manufacturerLabel;
  const related = relatedCategoriesForDtc({
    code: item.code,
    category: '',
    titleEn: item.description,
    descriptionEn: '',
    components: [manufacturerLabel],
    causes: []
  });
  add({
    id: `dtc-mfr-${slugify(item.manufacturer, 24)}-${item.code}`,
    type: 'dtc_manufacturer',
    entryType: 'Código DTC de fabricante',
    title: `${item.code} — ${item.description}`,
    summary: `Definición específica de ${manufacturerLabel} recopilada por Wal33D. ${truncate(item.description, 500)}`,
    categoryId: 'obd-dtc-pids',
    relatedCategoryIds: related.length ? related : ['electrical-values'],
    brand: item.manufacturer === 'OTHER' ? '' : manufacturerLabel,
    model: '',
    generation: '',
    engine: '',
    engineCodes: [],
    system: systemForDtc({ code: item.code }, related),
    tags: [item.code, item.family, manufacturerLabel, 'DTC fabricante', 'Wal33D'],
    status: 'reviewed',
    confidence: 'media',
    sourceIds: ['src-wal33d-dtc'],
    refType: 'dtc_manufacturer',
    refId: `${item.manufacturer}:${item.code}`,
    url: 'https://github.com/Wal33D/dtc-database',
    availability: 'full',
    license: 'MIT',
    licenseClass: 'importable_attribution',
    attribution: 'DTC Database by Wal33D (Waleed Judah), MIT',
    components: [],
    data: {
      code: item.code,
      manufacturer: item.manufacturer,
      manufacturerLabel,
      family: item.family,
      description: item.description,
      sourceFile: item.sourceFile,
      scopeNote: 'Definición específica de fabricante compilada por la comunidad. Puede variar según motor, año, mercado y calibración; no sustituye al boletín o manual oficial del fabricante.'
    }
  });
}

for (const pid of pidsFile.items || []) {
  const related = ['sensors-actuators', 'electrical-values'];
  if (pid.mode === '09') related.push('vehicles-engines');
  add({
    id: `pid-${pid.code}`,
    type: 'pid',
    entryType: `PID OBD-II modo ${pid.mode}`,
    title: `${pid.code} — ${pid.nameEn}`,
    summary: `Parámetro OBD-II estándar. Fórmula: ${pid.formula || 'no publicada'}${pid.unit ? ` · Unidad: ${pid.unit}` : ''}${pid.range ? ` · Rango: ${pid.range[0]} a ${pid.range[1]}` : ''}.`,
    categoryId: 'obd-dtc-pids',
    relatedCategoryIds: related,
    system: pid.mode === '09' ? 'Información del vehículo' : 'Datos en vivo OBD-II',
    tags: [pid.code, pid.mode, pid.pid, 'PID', 'OBD-II', pid.nameEn],
    status: 'verified',
    confidence: 'alta',
    sourceIds: ['src-obdex'],
    refType: 'pid',
    refId: pid.code,
    url: 'https://github.com/foerbsnavi/obdex',
    availability: 'full',
    license: 'CC0-1.0',
    licenseClass: 'importable_redistributable',
    attribution: 'OBDex, CC0-1.0',
    data: {
      code: pid.code,
      mode: pid.mode,
      pid: pid.pid,
      bytes: pid.bytes,
      nameEn: pid.nameEn,
      formula: pid.formula,
      unit: pid.unit,
      range: pid.range,
      sourceUrls: pid.sourceUrls,
      note: 'PID estándar. La ECU debe declararlo y la escala puede depender del protocolo y del vehículo.'
    }
  });
}

for (const dbc of canDbcFile.items || []) {
  const network = dbc.file.replace(/\.dbc$/i, '');
  add({
    id: `can-${slugify(network, 60)}`,
    type: 'can_dbc',
    entryType: 'Definición CAN (DBC)',
    title: `${network} — ${dbc.messageCount} mensajes`,
    summary: `Archivo DBC con ${integerLabel(dbc.messageCount)} mensajes y ${integerLabel(dbc.signalCount)} señales. Definición de red de la comunidad; no es documentación oficial del fabricante.`,
    categoryId: 'can-diagnostics',
    relatedCategoryIds: ['electrical-values', 'ecu', 'sensors-actuators'],
    brand: '',
    model: '',
    generation: '',
    engine: '',
    engineCodes: [],
    system: 'Red CAN / bus de datos',
    tags: [network, 'DBC', 'CAN', 'openpilot', 'opendbc'],
    status: 'reviewed',
    confidence: 'media',
    sourceIds: ['src-opendbc'],
    refType: 'opendbc_dbc',
    refId: dbc.path,
    url: dbc.sourceUrl,
    availability: 'full',
    license: 'MIT',
    licenseClass: 'importable_attribution',
    attribution: 'openpilot/opendbc by comma.ai, MIT',
    data: {
      file: dbc.file,
      path: dbc.path,
      bytes: dbc.bytes,
      sha256: dbc.sha256,
      messageCount: dbc.messageCount,
      signalCount: dbc.signalCount,
      messages: dbc.messages,
      rawUrl: `https://raw.githubusercontent.com/commaai/opendbc/master/${dbc.path}`,
      localPath: `data/imports/raw/opendbc/${dbc.file}`,
      note: 'Definición DBC publicada por openpilot/opendbc. Los identificadores, escalas y señales pueden variar entre modelos, años y configuraciones. No se presenta como esquema oficial del fabricante.'
    }
  });
}

const guideCategories = {
  'guide-connectors': 'connectors-pinouts',
  'guide-fuse-boxes': 'fuses-relays',
  'guide-relays': 'fuses-relays',
  'guide-vvt': 'timing'
};

for (const guide of guidesFile.guides || []) {
  add({
    id: guide.id,
    type: 'guide',
    entryType: 'Guía editorial genérica',
    title: guide.title,
    summary: guide.summary,
    categoryId: guideCategories[guide.id] || 'repair-procedures',
    relatedCategoryIds: ['repair-procedures'],
    system: guide.system,
    tags: guide.tags,
    status: 'generic',
    confidence: 'media',
    sourceIds: [],
    refType: 'guide',
    refId: guide.id,
    availability: 'full',
    license: 'Contenido editorial del proyecto',
    licenseClass: 'project_editorial',
    attribution: 'Diagnóstico y Mecánica',
    data: {
      steps: guide.steps,
      warnings: guide.warnings,
      note: guide.note
    }
  });
}

const tutorialCategoryHints = [
  { match: /egr|dpf|fap|adblue|emisiones/i, ids: ['egr-intake', 'dpf-emissions'] },
  { match: /turbo|admisi|sobrealiment/i, ids: ['turbo', 'egr-intake'] },
  { match: /freno|abs/i, ids: ['brakes-abs-esp'] },
  { match: /suspension|direccion/i, ids: ['suspension-steering'] },
  { match: /transmision|caja|embrague|dsg/i, ids: ['clutch-transmission'] },
  { match: /electricidad|electronica|centralita|can/i, ids: ['electrical-values', 'can-diagnostics', 'ecu'] },
  { match: /hibrido|electrico/i, ids: ['hybrid-ev'] },
  { match: /inyeccion|motor|distribucion/i, ids: ['injection', 'timing'] },
  { match: /refrigeracion|climatizacion|lubricacion/i, ids: ['cooling-lubrication'] },
  { match: /diagnosis|obd|dtc|averia/i, ids: ['obd-dtc-pids', 'repair-procedures'] }
];

for (const video of tutorialsFile.videos || []) {
  const hintText = [video.categoryName, video.subcategoryName, ...(video.tags || [])].join(' ');
  const related = tutorialCategoryHints
    .filter(hint => hint.match.test(hintText))
    .flatMap(hint => hint.ids);
  add({
    id: `tutorial-${video.id}`,
    type: 'tutorial',
    entryType: 'Vídeo técnico',
    title: video.title,
    summary: video.description || `Vídeo de ${video.channel}`,
    categoryId: 'technical-tutorials',
    relatedCategoryIds: related,
    brand: video.brand || '',
    model: video.model || '',
    generation: '',
    yearFrom: video.yearFrom || null,
    yearTo: video.yearTo || null,
    engine: video.engineCode || '',
    engineCodes: video.engineCode ? [video.engineCode] : [],
    system: video.categoryName || 'Tutorial',
    tags: [video.channel, video.categoryName, video.subcategoryName, video.level, video.languageLabel, ...(video.dtcs || []), ...(video.tags || [])].filter(Boolean),
    status: 'metadata_only',
    confidence: 'baja',
    sourceIds: [],
    refType: 'tutorial',
    refId: video.id,
    url: video.url,
    availability: 'metadata',
    license: 'Metadatos enlazados; vídeo sujeto a YouTube y al canal',
    licenseClass: 'metadata_links',
    attribution: video.channel || 'Canal de YouTube',
    data: {
      channel: video.channel,
      channelUrl: video.channelUrl,
      duration: video.durationLabel,
      language: video.languageLabel,
      level: video.level,
      videoId: video.videoId,
      embedUrl: video.embedUrl,
      thumbnail: video.thumbnail,
      dtcs: video.dtcs || [],
      verificationSource: video.verificationSource,
      lastCheckedAt: video.lastCheckedAt,
      sourceNote: 'Metadatos verificados mediante YouTube oEmbed. El contenido técnico del vídeo no se ha validado como procedimiento oficial.'
    }
  });
}

for (const recall of recallsFile.items || []) {
  const labels = recall.labels || [];
  const brand = labels[0]?.split(' ')[0] || '';
  const years = recall.years || [];
  const model = labels[0]?.split(' ').slice(1).join(' ') || '';
  add({
    id: `recall-${recall.campaign}`,
    type: 'recall',
    entryType: 'Campaña de seguridad NHTSA',
    title: `${recall.campaign} — ${recall.component || 'Campaña de seguridad'}`,
    summary: `Campaña del mercado estadounidense para ${labels.join(', ') || 'vehículos indicados'} (${years.join(', ')}). ${truncate(recall.summary, 620)}`,
    categoryId: 'bulletins-recalls',
    relatedCategoryIds: ['official-sources'],
    brand,
    model,
    generation: '',
    yearFrom: years.length ? Math.min(...years) : null,
    yearTo: years.length ? Math.max(...years) : null,
    engine: '',
    engineCodes: [],
    system: 'Campaña de seguridad',
    tags: [recall.campaign, recall.manufacturer, recall.component, ...labels, 'NHTSA', 'EE. UU.'],
    status: 'verified',
    confidence: 'alta',
    sourceIds: ['src-nhtsa-recalls'],
    refType: 'recall',
    refId: recall.campaign,
    url: recall.url,
    availability: 'full',
    license: 'Datos públicos del Gobierno de EE. UU.; sin endoso',
    licenseClass: 'importable_redistributable',
    attribution: 'NHTSA Recalls API, Gobierno de EE. UU.',
    data: {
      campaign: recall.campaign,
      manufacturer: recall.manufacturer,
      component: recall.component,
      summary: recall.summary,
      consequence: recall.consequence,
      remedy: recall.remedy,
      reportDate: recall.reportDate,
      parkIt: recall.parkIt,
      parkOutside: recall.parkOutside,
      overTheAirUpdate: recall.overTheAirUpdate,
      modelYears: recall.modelYears,
      models: recall.models,
      labels,
      years,
      market: 'Estados Unidos',
      scopeNote: 'Campaña del mercado estadounidense. No confirma que la misma campaña aplique a una versión europea, a otro mercado o a un VIN concreto. Comprobar el VIN en el fabricante o en el organismo oficial correspondiente.'
    }
  });
}

for (const source of sources) {
  add({
    id: `source-${source.id}`,
    type: 'source',
    entryType: 'Fuente y licencia',
    title: source.title,
    summary: source.note || `Fuente localizada: ${source.publisher}`,
    categoryId: 'official-sources',
    relatedCategoryIds: source.categoryIds,
    system: 'Documentación / fuente',
    tags: [source.publisher, source.type, source.access, source.licenseClass, source.license, ...(source.categoryIds || [])],
    status: 'source_only',
    confidence: source.httpStatus === 200 ? 'media' : 'baja',
    sourceIds: [source.id],
    refType: 'source',
    refId: source.id,
    url: source.url,
    vehicleIds: source.vehicleIds || [],
    availability: 'link',
    license: source.license,
    licenseClass: source.licenseClass,
    attribution: source.attribution,
    data: {
      publisher: source.publisher,
      access: source.access,
      license: source.license,
      licenseClass: source.licenseClass,
      commercialUse: source.commercialUse,
      permissions: source.permissions,
      attribution: source.attribution,
      termsUrl: source.termsUrl,
      httpStatus: source.httpStatus,
      lastCheckedAt: source.lastCheckedAt,
      language: source.language,
      market: source.market,
      evidence: source.evidence,
      note: source.note,
      integration: source.licenseClass === 'metadata_links' || source.licenseClass === 'pending'
        ? 'Solo enlace o metadatos. No se ha copiado ni indexado el contenido protegido.'
        : 'Licencia compatible. Los datos importados se limitan a los archivos indicados en el registro de importaciones.'
    }
  });
}

for (const document of documentsFile.documents || []) {
  add({
    id: document.id,
    type: 'document',
    entryType: document.partial ? 'Documento parcial' : 'Documento completo',
    title: document.title,
    summary: document.summary || truncate(document.text, 620),
    categoryId: categoryById.has(document.categoryId) ? document.categoryId : 'repair-procedures',
    relatedCategoryIds: document.relatedCategoryIds || [],
    brand: document.brand || '',
    model: document.model || '',
    generation: document.generation || '',
    yearFrom: document.yearFrom || null,
    yearTo: document.yearTo || null,
    engine: document.engineCode || '',
    engineCodes: document.engineCode ? [document.engineCode] : [],
    vehicleIds: document.vehicleIds || [],
    system: document.system || 'Documento importado',
    tags: document.tags || [],
    status: 'reviewed',
    confidence: 'media',
    sourceIds: sourceList(document.sourceIds),
    refType: 'document',
    refId: document.id,
    url: document.sourceUrl,
    availability: document.partial ? 'partial' : 'full',
    license: document.license,
    licenseClass: document.licenseClass,
    attribution: document.attribution || '',
    data: {
      fileName: document.fileName,
      mimeType: document.mimeType,
      pages: document.pages || null,
      sections: document.sections || [],
      chunkCount: document.chunkCount || 0,
      importedAt: document.importedAt,
      license: document.license,
      licenseClass: document.licenseClass,
      sourceUrl: document.sourceUrl,
      note: document.note || 'Documento importado con licencia declarada por el operador.'
    }
  });
}

const all = [...entries.values()].sort((a, b) => {
  const ca = categoryById.get(a.categoryId)?.number || 99;
  const cb = categoryById.get(b.categoryId)?.number || 99;
  if (ca !== cb) return ca - cb;
  return a.title.localeCompare(b.title, 'es');
});

const countBy = (items, key) => items.reduce((acc, item) => {
  const value = typeof key === 'function' ? key(item) : item[key];
  if (value !== undefined && value !== null && value !== '') acc[value] = (acc[value] || 0) + 1;
  return acc;
}, {});

const counts = {
  total: all.length,
  byType: countBy(all, 'type'),
  byStatus: countBy(all, 'status'),
  byAvailability: countBy(all, 'availability'),
  byLicenseClass: countBy(all, 'licenseClass'),
  categories: categories.length,
  pids: all.filter(entry => entry.type === 'pid').length,
  dtc: all.filter(entry => entry.type === 'dtc').length,
  dtcManufacturer: all.filter(entry => entry.type === 'dtc_manufacturer').length,
  canDbc: all.filter(entry => entry.type === 'can_dbc').length,
  models: all.filter(entry => entry.type === 'vehicle_spec').length,
  evSpecs: all.filter(entry => entry.data?.specKind === 'ev').length,
  homologationSpecs: all.filter(entry => entry.data?.specKind === 'homologation').length,
  vehicles: all.filter(entry => entry.type === 'vehicle_dossier').length,
  inspections: all.filter(entry => entry.type === 'inspection').length,
  tutorials: all.filter(entry => entry.type === 'tutorial').length,
  recalls: all.filter(entry => entry.type === 'recall').length,
  sources: sources.length,
  imported: all.filter(entry => entry.availability === 'full' || entry.availability === 'partial').length,
  complete: all.filter(entry => entry.availability === 'full').length,
  partial: all.filter(entry => entry.availability === 'partial').length,
  links: all.filter(entry => entry.availability === 'link').length,
  metadata: all.filter(entry => entry.availability === 'metadata').length
};

const categoryStats = categories.map(category => {
  const own = all.filter(entry => entry.categoryId === category.id);
  const related = all.filter(entry => entry.relatedCategoryIds.includes(category.id));
  const combined = [...own, ...related];
  const byAvailability = countBy(combined, 'availability');
  const byStatus = countBy(combined, 'status');
  const dataCount = combined.filter(entry => entry.availability === 'full' || entry.availability === 'partial').length;
  const sourceCount = combined.filter(entry => entry.availability === 'link' || entry.availability === 'metadata').length;
  const coverage = dataCount > 0 ? 'data' : sourceCount > 0 ? 'source' : 'pending';
  return {
    id: category.id,
    number: category.number,
    title: category.title,
    group: category.group,
    description: category.description,
    icon: category.icon,
    total: own.length,
    relatedTotal: related.length,
    dataCount,
    sourceCount,
    availability: byAvailability,
    status: byStatus,
    coverage
  };
});

const uniqueValues = (key) => [...new Set(all.map(entry => entry[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
const yearValues = [...new Set(all.flatMap(entry => {
  const values = [];
  if (entry.yearFrom) values.push(entry.yearFrom);
  if (entry.yearTo) values.push(entry.yearTo);
  return values;
}))].sort((a, b) => b - a);
const fuelValues = [...new Set(all.flatMap(entry => {
  if (Array.isArray(entry.fuels) && entry.fuels.length) return entry.fuels;
  return entry.fuel ? [entry.fuel] : [];
}))].sort((a, b) => String(a).localeCompare(String(b), 'es'));
const specKindValues = [...new Set(all.map(entry => entry.data?.specKind).filter(Boolean))].sort();
const sourceUsage = sources.map(source => ({
  id: source.id,
  title: source.title,
  license: source.license,
  licenseClass: source.licenseClass,
  access: source.access,
  httpStatus: source.httpStatus,
  entries: all.filter(entry => entry.sourceIds.includes(source.id)).length
})).sort((a, b) => b.entries - a.entries);

const result = {
  version: 4,
  generatedAt: new Date().toISOString(),
  notice: 'Biblioteca técnica reconstruida con 27 categorías. Incluye DTC genéricos y de fabricante, PID, vehículos eléctricos, homologaciones europeas, DBC CAN, especificaciones y campañas, conservando licencia y fuente. Los manuales protegidos, pinouts no descargados y portales de suscripción se muestran como enlaces o metadatos; no se presentan como documentos integrados.',
  imports: manifest,
  categories: categoryStats,
  counts,
  facets: {
    brands: uniqueValues('brand'),
    manufacturers: uniqueValues('brand'),
    models: uniqueValues('model'),
    fuels: fuelValues,
    specKinds: specKindValues,
    generations: uniqueValues('generation'),
    years: yearValues,
    engines: uniqueValues('engine'),
    systems: uniqueValues('system'),
    types: uniqueValues('type'),
    statuses: uniqueValues('status'),
    availability: uniqueValues('availability'),
    licenseClasses: uniqueValues('licenseClass')
  },
  sourceUsage,
  entries: all
};
write('technical-library.json', result);

console.log(`Biblioteca técnica: ${all.length} entradas, ${counts.dtc} DTC genéricos, ${counts.dtcManufacturer} DTC de fabricante, ${counts.pids} PID, ${counts.models} especificaciones de vehículo, ${counts.canDbc} DBC, ${counts.recalls} campañas.`);
console.log(`Categorías: ${categoryStats.filter(c => c.coverage === 'data').length} con datos, ${categoryStats.filter(c => c.coverage === 'source').length} solo fuentes, ${categoryStats.filter(c => c.coverage === 'pending').length} pendientes.`);
console.log(`Disponibilidad: ${JSON.stringify(counts.byAvailability)}`);
console.log(`Licencias: ${JSON.stringify(counts.byLicenseClass)}`);
