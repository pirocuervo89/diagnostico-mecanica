#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const importsDir = path.join(root, 'data', 'imports');
const rawDir = path.join(importsDir, 'raw');
fs.mkdirSync(importsDir, { recursive: true });
fs.mkdirSync(rawDir, { recursive: true });

const today = new Date().toISOString();
const UA = 'DiagnosticoMecanica-Biblioteca/2.0 (importacion de datos abiertos)';
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(url, { as = 'text', retries = 3, timeout = 120000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : '*/*' },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return as === 'json' ? await response.json() : await response.text();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

async function requestBuffer(url, { retries = 3, timeout = 120000 } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < retries) await sleep(1200 * attempt);
    }
  }
  throw lastError;
}

function saveRaw(relative, buffer) {
  const file = path.join(rawDir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buffer);
  return {
    file: path.relative(root, file),
    bytes: buffer.length,
    sha256: sha256(buffer)
  };
}

function writeImport(name, value) {
  const file = path.join(importsDir, name);
  const text = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(file, text);
  return { file: path.relative(root, file), bytes: Buffer.byteLength(text), sha256: sha256(text) };
}

function readImport(name) {
  const file = path.join(importsDir, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const openEvTag = 'v1.24.0';
const openEvUrl = `https://github.com/open-ev-data/open-ev-data-dataset/releases/download/${openEvTag}/open-ev-data-${openEvTag}.json`;
const openEvLicenseUrl = 'https://raw.githubusercontent.com/open-ev-data/open-ev-data-dataset/main/LICENCE';
const openEvRelease = await request(openEvUrl, { as: 'json' });
const openEvLicense = await request(openEvLicenseUrl);
const openEvVehicles = Array.isArray(openEvRelease.vehicles) ? openEvRelease.vehicles : [];
if (openEvVehicles.length < 1000) throw new Error(`OpenEV Data: se esperaban al menos 1.000 vehículos y hay ${openEvVehicles.length}`);
const openEvFiles = {
  raw: saveRaw(`openev/open-ev-data-${openEvTag}.json`, Buffer.from(JSON.stringify(openEvRelease, null, 2) + '\n')),
  license: saveRaw('openev/LICENCE', Buffer.from(openEvLicense)),
  data: writeImport('openev-vehicles.json', {
    version: 1,
    importedAt: today,
    source: 'src-openev',
    release: openEvTag,
    sourceUrl: openEvUrl,
    license: 'CDLA-Permissive-2.0',
    licenseUrl: openEvLicenseUrl,
    attribution: 'OpenEV Data contributors, CDLA-Permissive-2.0',
    generatedAt: openEvRelease.generated_at || null,
    count: openEvVehicles.length,
    items: openEvVehicles
  })
};

const wal33dBase = 'https://raw.githubusercontent.com/Wal33D/dtc-database/main';
const wal33dFiles = [
  ['acura_codes.txt', 'ACURA', 'Acura'],
  ['audi_codes.txt', 'AUDI', 'Audi'],
  ['bmw_codes.txt', 'BMW', 'BMW'],
  ['buick_codes.txt', 'BUICK', 'Buick'],
  ['cadillac_codes.txt', 'CADILLAC', 'Cadillac'],
  ['chevy_codes.txt', 'CHEVY', 'Chevrolet'],
  ['chrysler_codes.txt', 'CHRYSLER', 'Chrysler'],
  ['dodge_codes.txt', 'DODGE', 'Dodge'],
  ['ford_codes.txt', 'FORD', 'Ford'],
  ['geo_codes.txt', 'GEO', 'Geo'],
  ['gm_codes.txt', 'GM', 'GM'],
  ['gmc_codes.txt', 'GMC', 'GMC'],
  ['honda_codes.txt', 'HONDA', 'Honda'],
  ['infiniti_codes.txt', 'INFINITI', 'Infiniti'],
  ['jaguar_codes.txt', 'JAGUAR', 'Jaguar'],
  ['jeep_codes.txt', 'JEEP', 'Jeep'],
  ['kia_codes.txt', 'KIA', 'Kia'],
  ['lexus_codes.txt', 'LEXUS', 'Lexus'],
  ['lincoln_codes.txt', 'LINCOLN', 'Lincoln'],
  ['mazda_codes.txt', 'MAZDA', 'Mazda'],
  ['mercedes_codes.txt', 'MERCEDES', 'Mercedes-Benz'],
  ['mercury_codes.txt', 'MERCURY', 'Mercury'],
  ['mitsubishi_codes.txt', 'MITSUBISHI', 'Mitsubishi'],
  ['nissan_codes.txt', 'NISSAN', 'Nissan'],
  ['oldsmobile_codes.txt', 'OLDSMOBILE', 'Oldsmobile'],
  ['plymouth_codes.txt', 'PLYMOUTH', 'Plymouth'],
  ['pontiac_codes.txt', 'PONTIAC', 'Pontiac'],
  ['saturn_codes.txt', 'SATURN', 'Saturn'],
  ['subaru_codes.txt', 'SUBARU', 'Subaru'],
  ['suzuki_codes.txt', 'SUZUKI', 'Suzuki'],
  ['toyota_codes.txt', 'TOYOTA', 'Toyota'],
  ['volkswagen_codes.txt', 'VOLKSWAGEN', 'Volkswagen'],
  ['other_codes.txt', 'OTHER', 'Otras marcas / no específico']
];
const wal33dLicense = await request(`${wal33dBase}/LICENSE`);
const wal33dDb = await requestBuffer(`${wal33dBase}/data/dtc_codes.db`);
const wal33dEntries = [];
const wal33dRawFiles = {};
for (const [file, manufacturer, manufacturerLabel] of wal33dFiles) {
  const text = await request(`${wal33dBase}/data/source-data/${file}`);
  wal33dRawFiles[file] = saveRaw(`wal33d/${file}`, Buffer.from(text));
  const seen = new Set();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([PBCU][0-9A-F]{4})\s*-\s*(.+)$/i);
    if (!match) continue;
    const code = match[1].toUpperCase();
    const description = match[2].replace(/\s+/g, ' ').trim();
    if (!description || seen.has(code)) continue;
    seen.add(code);
    wal33dEntries.push({
      code,
      manufacturer,
      manufacturerLabel,
      description,
      family: code.slice(0, 2),
      sourceFile: file,
      sourceId: 'src-wal33d-dtc',
      license: 'MIT'
    });
  }
  await sleep(60);
}
if (wal33dEntries.length < 6000) throw new Error(`Wal33D: se esperaban al menos 6.000 definiciones y hay ${wal33dEntries.length}`);
const wal33dFile = writeImport('wal33d-dtc.json', {
  version: 1,
  importedAt: today,
  source: 'src-wal33d-dtc',
  sourceUrl: 'https://github.com/Wal33D/dtc-database',
  license: 'MIT',
  licenseUrl: 'https://github.com/Wal33D/dtc-database/blob/main/LICENSE',
  attribution: 'DTC Database by Wal33D (Waleed Judah), MIT',
  count: wal33dEntries.length,
  note: 'Definiciones por fabricante compiladas por el proyecto Wal33D. No sustituyen al boletín o manual oficial del fabricante. OTHER agrupa códigos sin marca específica.',
  items: wal33dEntries
});
const wal33dFileEntries = {
  rawDb: saveRaw('wal33d/dtc_codes.db', wal33dDb),
  license: saveRaw('wal33d/LICENSE', Buffer.from(wal33dLicense))
};

const eeaTable = '[CO2Emission].[latest].[co2cars_2025Pv31]';
const eeaModelsQuery = `SELECT Mk, Cn, Ft, [Ec (cm3)] AS Ec, [Ep (KW)] AS Ep, COUNT(*) AS Registrations, MIN([M (kg)]) AS MassMin, MAX([M (kg)]) AS MassMax, MIN([Ewltp (g/km)]) AS Co2Min, MAX([Ewltp (g/km)]) AS Co2Max FROM ${eeaTable} GROUP BY Mk, Cn, Ft, [Ec (cm3)], [Ep (KW)] ORDER BY Mk, Cn, Ft, Ec, Ep`;
const eeaVariantsQuery = `SELECT Mk, Cn, Va, Ve, Ft, [Ec (cm3)] AS Ec, [Ep (KW)] AS Ep, COUNT(*) AS Registrations, MIN([M (kg)]) AS MassMin, MAX([M (kg)]) AS MassMax FROM ${eeaTable} GROUP BY Mk, Cn, Va, Ve, Ft, [Ec (cm3)], [Ep (KW)] ORDER BY Mk, Cn, Va, Ve, Ft, Ec, Ep`;
const eeaEndpoint = 'https://discodata.eea.europa.eu/sql';

async function eeaRows(query) {
  const rows = [];
  for (let page = 1; page <= 60; page++) {
    const url = `${eeaEndpoint}?${new URLSearchParams({ query, p: String(page), nrOfHits: '5000' })}`;
    const payload = await request(url, { as: 'json', retries: 5, timeout: 300000 });
    if (payload.errors) throw new Error(`EEA Discodata: ${JSON.stringify(payload.errors).slice(0, 400)}`);
    const pageRows = Array.isArray(payload.results) ? payload.results : [];
    if (!pageRows.length) break;
    rows.push(...pageRows);
    if (pageRows.length < 5000) break;
    await sleep(250);
  }
  return rows;
}

const eeaModels = (await eeaRows(eeaModelsQuery))
  .filter(row => /[A-Za-z]/.test(String(row.Mk || '')) && /[A-Za-z]/.test(String(row.Cn || '')));
const eeaVariants = (await eeaRows(eeaVariantsQuery))
  .filter(row => /[A-Za-z]/.test(String(row.Mk || '')) && /[A-Za-z]/.test(String(row.Cn || '')));
if (eeaModels.length < 10000) throw new Error(`EEA: se esperaban al menos 10.000 combinaciones y hay ${eeaModels.length}`);
if (eeaVariants.length < 50000) throw new Error(`EEA: se esperaban al menos 50.000 variantes y hay ${eeaVariants.length}`);
const eeaFiles = {
  data: writeImport('eea-co2cars-2025.json', {
    version: 1,
    importedAt: today,
    source: 'src-eea-co2-cars',
    dataset: 'eea_t_co2-emissions-cars-prov-2025_p_2025_v01_r00',
    table: 'co2cars_2025Pv31',
    year: 2025,
    status: 'provisional',
    sourceUrl: 'https://www.eea.europa.eu/en/datahub/datahubitem-view/fa8b1229-3db6-495d-b18e-9c9b3267c02b',
    sourceEndpoint: eeaEndpoint,
    doi: 'https://doi.org/10.2909/b4044b06-2e6b-4f8e-a6e6-66e0e98bb0dd',
    license: 'CC BY 4.0',
    licenseUrl: 'https://www.eea.europa.eu/en/legal-notice',
    attribution: 'European Environment Agency (EEA), Monitoring of CO2 emissions from passenger cars, 2025 provisional data, CC BY 4.0',
    query: eeaModelsQuery,
    variantsQuery: eeaVariantsQuery,
    countModels: eeaModels.length,
    countVariants: eeaVariants.length,
    models: eeaModels,
    variants: eeaVariants
  }),
  query: saveRaw('eea/co2cars-2025.query.sql', Buffer.from(`${eeaModelsQuery};\n\n${eeaVariantsQuery};\n`))
};

const opendbcTree = await request('https://api.github.com/repos/commaai/opendbc/git/trees/master?recursive=1', { as: 'json' });
const opendbcDbcFiles = (opendbcTree.tree || []).filter(item => item.type === 'blob' && /^opendbc\/dbc\/[^/]+\.dbc$/.test(item.path));
if (opendbcDbcFiles.length < 40) throw new Error(`openpilot/opendbc: se esperaban al menos 40 archivos DBC y hay ${opendbcDbcFiles.length}`);
const opendbcLicense = await request('https://raw.githubusercontent.com/commaai/opendbc/master/LICENSE');
const opendbcRawFiles = {};
const opendbcEntries = [];
for (const item of opendbcDbcFiles) {
  const url = `https://raw.githubusercontent.com/commaai/opendbc/master/${item.path}`;
  const text = await request(url);
  opendbcRawFiles[item.path] = saveRaw(`opendbc/${path.basename(item.path)}`, Buffer.from(text));
  const messages = [];
  let signalCount = 0;
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const message = line.match(/^BO_\s+(\d+)\s+(\S+)\s*:\s*(\d+)\s+(\S+)/);
    if (message) {
      current = { id: Number(message[1]), name: message[2], dlc: Number(message[3]), sender: message[4], signalCount: 0, signals: [] };
      messages.push(current);
      continue;
    }
    const signal = line.match(/^SG_\s+(\S+)/);
    if (signal && current) {
      signalCount++;
      current.signalCount++;
      if (current.signals.length < 10) current.signals.push(signal[1]);
    }
  }
  opendbcEntries.push({
    file: path.basename(item.path),
    path: item.path,
    bytes: item.size || Buffer.byteLength(text),
    sha256: sha256(text),
    messages: messages.slice(0, 80).map(message => ({
      id: message.id,
      name: message.name,
      dlc: message.dlc,
      sender: message.sender,
      signalCount: message.signalCount,
      signals: message.signals
    })),
    messageCount: messages.length,
    signalCount,
    sourceId: 'src-opendbc',
    license: 'MIT',
    sourceUrl: `https://github.com/commaai/opendbc/blob/master/${item.path}`
  });
  await sleep(80);
}
if (opendbcEntries.length < 40) throw new Error(`openpilot/opendbc: solo se han procesado ${opendbcEntries.length} archivos DBC`);
const opendbcFiles = {
  data: writeImport('opendbc-dbc.json', {
    version: 1,
    importedAt: today,
    source: 'src-opendbc',
    sourceUrl: 'https://github.com/commaai/opendbc',
    license: 'MIT',
    licenseUrl: 'https://github.com/commaai/opendbc/blob/master/LICENSE',
    attribution: 'openpilot/opendbc by comma.ai, MIT',
    count: opendbcEntries.length,
    note: 'Definiciones DBC publicadas por openpilot/opendbc. Son definiciones de red de la comunidad, no documentación oficial del fabricante. Los archivos originales se conservan en data/imports/raw/opendbc.',
    items: opendbcEntries
  }),
  license: saveRaw('opendbc/LICENSE', Buffer.from(opendbcLicense))
};

const previousManifest = readImport('manifest.json') || { sources: [], files: {}, notes: [] };
const newSourceRecords = [
  { id: 'src-openev', url: openEvUrl, license: 'CDLA-Permissive-2.0', cached: false, count: openEvVehicles.length },
  { id: 'src-wal33d-dtc', url: 'https://github.com/Wal33D/dtc-database', license: 'MIT', cached: false, count: wal33dEntries.length },
  { id: 'src-eea-co2-cars', url: 'https://discodata.eea.europa.eu/sql', license: 'CC BY 4.0', cached: false, count: eeaModels.length, variants: eeaVariants.length },
  { id: 'src-opendbc', url: 'https://github.com/commaai/opendbc', license: 'MIT', cached: false, count: opendbcEntries.length }
];
const sourceKey = source => `${source.id}|${source.url}`;
const sourceMap = new Map((previousManifest.sources || []).map(source => [sourceKey(source), source]));
for (const source of newSourceRecords) sourceMap.set(sourceKey(source), source);
const files = {
  ...(previousManifest.files || {}),
  openev: openEvFiles.data,
  'openev-raw': openEvFiles.raw,
  'openev-license': openEvFiles.license,
  wal33d: wal33dFile,
  'wal33d-raw-db': wal33dFileEntries.rawDb,
  'wal33d-license': wal33dFileEntries.license,
  eea: eeaFiles.data,
  'eea-query': eeaFiles.query,
  opendbc: opendbcFiles.data,
  'opendbc-license': opendbcFiles.license,
  ...Object.fromEntries(Object.entries(wal33dRawFiles).map(([name, meta]) => [`wal33d-source-${name}`, meta])),
  ...Object.fromEntries(Object.entries(opendbcRawFiles).map(([name, meta]) => [`opendbc-source-${name}`, meta]))
};
const manifest = {
  version: 2,
  importedAt: today,
  sources: [...sourceMap.values()],
  files,
  notes: [...new Set([
    ...(previousManifest.notes || []),
    'OpenEV Data se importa bajo CDLA-Permissive-2.0; las imágenes y enlaces de terceros no se copian.',
    'EEA CO2 cars 2025 es un conjunto provisional de homologación y matriculaciones; no contiene procedimientos de reparación.',
    'Wal33D DTC Database es una compilación MIT con definiciones por fabricante; no se presenta como boletín oficial.',
    'openpilot/opendbc DBC se importa bajo MIT como definiciones de red de la comunidad, no como esquema oficial del fabricante.',
    'Los manuales, esquemas y documentos de pago o con copyright no se han descargado ni redistribuido.'
  ])]
};
const manifestFile = writeImport('manifest.json', manifest);

console.log(JSON.stringify({
  openev: openEvVehicles.length,
  wal33d: wal33dEntries.length,
  eeaModels: eeaModels.length,
  eeaVariants: eeaVariants.length,
  opendbc: opendbcEntries.length,
  files: {
    openev: openEvFiles.data,
    wal33d: wal33dFile,
    eea: eeaFiles.data,
    opendbc: opendbcFiles.data,
    manifest: manifestFile
  }
}, null, 2));
