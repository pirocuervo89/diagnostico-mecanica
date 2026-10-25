#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const importsDir = path.join(root, 'data', 'imports');
fs.mkdirSync(importsDir, { recursive: true });

const OBDEX_GENERIC_URL = 'https://foerbsnavi.github.io/OBDex/generic.json';
const OBDEX_PIDS_01_URL = 'https://foerbsnavi.github.io/OBDex/pids/mode01.json';
const OBDEX_PIDS_09_URL = 'https://foerbsnavi.github.io/OBDex/pids/mode09.json';
const AUTOSEEKER_URL = 'https://autoseeker.eu/data/models.json';

const NHTSA_TARGETS = [
  { label: 'Volkswagen Golf', make: 'volkswagen', model: 'golf', years: [2015, 2016, 2017, 2018, 2019, 2020, 2021] },
  { label: 'Volkswagen GTI', make: 'volkswagen', model: 'gti', years: [2015, 2016, 2017, 2018, 2019, 2020, 2021] },
  { label: 'Mercedes-Benz Clase C (C300, EE. UU.)', make: 'mercedes-benz', model: 'c300', years: [2015, 2016, 2017, 2018, 2019, 2020, 2021] },
  { label: 'Ford Focus', make: 'ford', model: 'focus', years: [2012, 2013, 2014, 2015, 2016, 2017, 2018] },
  { label: 'Audi A3', make: 'audi', model: 'a3', years: [2015, 2016, 2017, 2018, 2019, 2020] },
  { label: 'Toyota Corolla', make: 'toyota', model: 'corolla', years: [2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021] },
  { label: 'BMW 328i', make: 'bmw', model: '328i', years: [2012, 2013, 2014, 2015, 2016] },
  { label: 'BMW 330i (EE. UU.)', make: 'bmw', model: '330i', years: [2018, 2019] }
];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const today = new Date().toISOString();
const round = value => Number.isFinite(Number(value)) ? Math.round(Number(value) * 10) / 10 : value;

function localOrDownload(envName, url) {
  const local = process.env[envName];
  if (local && fs.existsSync(local)) return { text: fs.readFileSync(local, 'utf8'), url, cached: true };
  return { url, cached: false };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DiagnosticoMecanica-Biblioteca/1.0 (importacion de datos abiertos)' }
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}

async function readSource(envName, url) {
  const source = localOrDownload(envName, url);
  if (source.text) return source;
  return { text: await fetchText(url), url, cached: false };
}

function normalizeDtc(raw) {
  return {
    code: String(raw.code || '').toUpperCase(),
    family: String(raw.code || '').slice(0, 2).toUpperCase(),
    category: raw.category || 'unknown',
    titleEn: raw.title?.en || raw.code,
    descriptionEn: raw.description?.en || '',
    components: [...new Set((raw.affected_components || []).filter(Boolean))],
    causes: (raw.common_causes || []).map(item => ({
      id: item.id || '',
      likelihood: item.likelihood || 'unknown',
      labelEn: item.label?.en || ''
    })).filter(item => item.labelEn),
    symptoms: (raw.symptoms || []).map(item => item.en).filter(Boolean),
    repair: {
      difficulty: raw.repair?.difficulty || '',
      diyPossible: Boolean(raw.repair?.diy_possible),
      costEur: raw.repair?.estimated_cost_eur || null,
      hours: raw.repair?.estimated_hours || null
    },
    flags: raw.flags || {},
    references: raw.references || [],
    relatedCodes: (raw.related_codes || []).filter(Boolean),
    sourceUrls: (raw.sources || []).filter(url => /^https:\/\//.test(String(url))),
    sourceId: 'src-obdex',
    license: 'CC0-1.0'
  };
}

function normalizePid(raw) {
  const mode = String(raw.mode || '01').padStart(2, '0');
  const pid = String(raw.pid || '').toUpperCase().padStart(2, '0');
  return {
    code: `${mode}${pid}`,
    mode,
    pid,
    bytes: raw.bytes ?? null,
    nameEn: raw.name?.en || `${mode}${pid}`,
    formula: raw.formula || '',
    unit: raw.unit || '',
    range: Array.isArray(raw.range) ? raw.range : null,
    sourceUrls: (raw.sources || []).filter(url => /^https:\/\//.test(String(url))),
    sourceId: 'src-obdex',
    license: 'CC0-1.0'
  };
}

function normalizeRecalls(results, matches) {
  const byCampaign = new Map();
  for (const result of results) {
    const campaign = String(result.NHTSACampaignNumber || '').trim();
    if (!campaign) continue;
    const match = matches.get(campaign) || { labels: new Set(), years: new Set() };
    if (result._target) {
      match.labels.add(result._target.label);
      match.years.add(result._target.year);
    }
    byCampaign.set(campaign, {
      campaign,
      manufacturer: result.Manufacturer || '',
      component: result.Component || '',
      summary: result.Summary || '',
      consequence: result.Consequence || '',
      remedy: result.Remedy || '',
      reportDate: result.ReportReceivedDate || '',
      parkIt: Boolean(result.parkIt),
      parkOutside: Boolean(result.parkOutSide),
      overTheAirUpdate: Boolean(result.overTheAirUpdate),
      modelYears: result.ModelYear || '',
      models: result.Model || '',
      labels: match.labels,
      years: match.years,
      sourceId: 'src-nhtsa-recalls',
      url: `https://www.nhtsa.gov/recalls?nhtsaId=${encodeURIComponent(campaign)}`
    });
    matches.set(campaign, match);
  }
  return [...byCampaign.values()].map(item => ({
    ...item,
    labels: [...item.labels],
    years: [...item.years].sort((a, b) => a - b)
  }));
}

async function importNhtsaRecalls() {
  const results = [];
  const matches = new Map();
  const queries = [];
  for (const target of NHTSA_TARGETS) {
    for (const year of target.years) {
      const params = new URLSearchParams({ make: target.make, model: target.model, modelYear: String(year) });
      const url = `https://api.nhtsa.gov/recalls/recallsByVehicle?${params.toString()}`;
      let payload;
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        payload = await response.json();
      } catch (error) {
        queries.push({ url, year, label: target.label, count: 0, error: error.message });
        continue;
      }
      const list = Array.isArray(payload.results) ? payload.results : [];
      queries.push({ url, year, label: target.label, count: list.length });
      for (const row of list) {
        results.push({ ...row, _target: { label: target.label, year } });
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
  }
  return { recalls: normalizeRecalls(results, matches), queries };
}

function parseAutoseeker(raw) {
  const models = Array.isArray(raw.models) ? raw.models : [];
  return models.map(model => ({
    slug: model.slug,
    brand: model.merk || '',
    model: model.model || '',
    generation: model.generatie || '',
    status: model.status || '',
    yearFrom: Number(model.bouwjaarVan) || null,
    yearTo: Number(model.bouwjaarTot) || null,
    fuels: model.fuels || [],
    specs: model.specs || {},
    sourceId: 'src-autoseeker',
    license: 'CC-BY-4.0',
    attribution: 'Especificaciones: autoseeker.eu, CC BY 4.0',
    sourceUrl: 'https://autoseeker.eu/data/'
  })).filter(model => model.slug && model.brand && model.model);
}

const genericSource = await readSource('OBDEX_GENERIC_FILE', OBDEX_GENERIC_URL);
const pids01Source = await readSource('OBDEX_PIDS01_FILE', OBDEX_PIDS_01_URL);
const pids09Source = await readSource('OBDEX_PIDS09_FILE', OBDEX_PIDS_09_URL);
const autoseekerSource = await readSource('AUTOSEEKER_FILE', AUTOSEEKER_URL);

const genericRaw = JSON.parse(genericSource.text);
const pidsRaw = [...JSON.parse(pids01Source.text), ...JSON.parse(pids09Source.text)];
const autoseekerRaw = JSON.parse(autoseekerSource.text);
const dtc = genericRaw.map(normalizeDtc).filter(item => /^[PBCU][0-9A-F]{4}$/.test(item.code));
const pids = pidsRaw.map(normalizePid).filter(item => item.code.length === 4);
const models = parseAutoseeker(autoseekerRaw);
const nhtsa = await importNhtsaRecalls();

if (dtc.length < 9000) throw new Error(`Se esperaban al menos 9.000 códigos DTC y se han obtenido ${dtc.length}`);
if (pids.length < 100) throw new Error(`Se esperaban al menos 100 PID y se han obtenido ${pids.length}`);
if (models.length < 200) throw new Error(`Se esperaban al menos 200 modelos y se han obtenido ${models.length}`);
if (nhtsa.recalls.length < 20) throw new Error(`Se esperaban al menos 20 campañas NHTSA y se han obtenido ${nhtsa.recalls.length}`);

const write = (name, value) => {
  const file = path.join(importsDir, name);
  const text = JSON.stringify(value, null, 2) + '\n';
  fs.writeFileSync(file, text);
  return { file: path.relative(root, file), bytes: Buffer.byteLength(text), sha256: sha256(text) };
};

const files = {
  dtc: write('obdex-dtc.json', {
    version: 1,
    importedAt: today,
    source: 'src-obdex',
    license: 'CC0-1.0',
    licenseUrl: 'https://github.com/foerbsnavi/OBDex/blob/main/LICENSE-DATA',
    attribution: 'OBD-II code data: OBDex (https://github.com/foerbsnavi/obdex), CC0-1.0',
    count: dtc.length,
    items: dtc
  }),
  pids: write('obdex-pids.json', {
    version: 1,
    importedAt: today,
    source: 'src-obdex',
    license: 'CC0-1.0',
    attribution: 'OBD-II PID data: OBDex (https://github.com/foerbsnavi/obdex), CC0-1.0',
    count: pids.length,
    items: pids
  }),
  models: write('autoseeker-models.json', {
    version: 1,
    importedAt: today,
    source: 'src-autoseeker',
    license: 'CC-BY-4.0',
    attribution: 'Especificaciones: autoseeker.eu, CC BY 4.0',
    count: models.length,
    items: models
  }),
  recalls: write('nhtsa-recalls.json', {
    version: 1,
    importedAt: today,
    source: 'src-nhtsa-recalls',
    license: 'Public domain US Government; no endorsement',
    count: nhtsa.recalls.length,
    queries: nhtsa.queries,
    items: nhtsa.recalls
  })
};

const manifest = {
  version: 1,
  importedAt: today,
  sources: [
    { id: 'src-obdex', url: OBDEX_GENERIC_URL, license: 'CC0-1.0', cached: genericSource.cached, count: dtc.length },
    { id: 'src-obdex', url: OBDEX_PIDS_01_URL, license: 'CC0-1.0', cached: pids01Source.cached, count: pidsRaw.filter(x => x.mode === '01').length },
    { id: 'src-obdex', url: OBDEX_PIDS_09_URL, license: 'CC0-1.0', cached: pids09Source.cached, count: pidsRaw.filter(x => x.mode === '09').length },
    { id: 'src-autoseeker', url: AUTOSEEKER_URL, license: 'CC-BY-4.0', cached: autoseekerSource.cached, count: models.length },
    { id: 'src-nhtsa-recalls', url: 'https://api.nhtsa.gov/recalls/recallsByVehicle', license: 'Public domain US Government; no endorsement', queries: nhtsa.queries.length, count: nhtsa.recalls.length }
  ],
  files,
  notes: [
    'OBDex cubre códigos genéricos; no incluye códigos específicos de fabricante.',
    'autoseeker publica especificaciones indicativas de fabricante/WLTP; requiere atribución CC BY 4.0.',
    'Las campañas NHTSA son del mercado estadounidense y no confirman aplicabilidad a versiones europeas ni a un VIN concreto.',
    'Ningún manual, esquema o PDF protegido se ha descargado en esta importación.'
  ]
};
const manifestWrite = write('manifest.json', manifest);
console.log(JSON.stringify({ dtc: dtc.length, pids: pids.length, models: models.length, recalls: nhtsa.recalls.length, files: Object.values(files), manifest: manifestWrite }, null, 2));
