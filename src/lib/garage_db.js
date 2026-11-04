import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import { db, cleanText } from './forum_db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const UPLOAD_DIR = path.resolve(process.env.GARAGE_UPLOAD_DIR || path.join(ROOT, 'data', 'garage', 'uploads'));
const RELIABILITY_PATH = path.join(ROOT, 'data', 'engine-reliability.json');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const MAINTENANCE_ITEMS = [
  ['aceite', 'Aceite y filtro de aceite'],
  ['filtros', 'Filtros (aire, combustible, habitáculo)'],
  ['distribucion', 'Distribución (correa o cadena)'],
  ['correa_auxiliar', 'Correa auxiliar y tensores'],
  ['bujias', 'Bujías'],
  ['calentadores', 'Calentadores'],
  ['frenos', 'Frenos (discos, pastillas, tambores)'],
  ['neumaticos', 'Neumáticos'],
  ['refrigerante', 'Refrigerante'],
  ['liquido_frenos', 'Líquido de frenos'],
  ['embrague', 'Embrague'],
  ['bateria', 'Batería'],
  ['fap_egr', 'FAP / DPF y EGR'],
  ['otros', 'Otros mantenimientos']
];

export const EVENT_KINDS = [
  ['mantenimiento', 'Mantenimiento'],
  ['averia', 'Avería'],
  ['reparacion', 'Reparación'],
  ['inspeccion', 'Inspección de taller'],
  ['itv', 'ITV'],
  ['modificacion', 'Modificación'],
  ['gasto', 'Gasto']
];

export const DOCUMENT_KINDS = [
  ['ficha_tecnica', 'Ficha técnica'],
  ['permiso', 'Permiso de circulación'],
  ['factura', 'Factura'],
  ['presupuesto', 'Presupuesto'],
  ['informe', 'Informe de diagnosis'],
  ['foto', 'Fotografía'],
  ['otro', 'Otro documento']
];

const KIND_LABEL = Object.fromEntries(EVENT_KINDS);
const DOC_LABEL = Object.fromEntries(DOCUMENT_KINDS);
const MAINT_KEYS = new Set(MAINTENANCE_ITEMS.map(item => item[0]));

const PLATE_MODERN = /^\d{4}[A-Z]{3}$/;
const PLATE_OLD = /^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/;
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

db.exec(`
  CREATE TABLE IF NOT EXISTS garage_vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '',
    year INTEGER,
    plate TEXT NOT NULL DEFAULT '',
    vin TEXT NOT NULL DEFAULT '',
    engine_code TEXT NOT NULL DEFAULT '',
    displacement_cc INTEGER,
    power_ps INTEGER,
    power_kw INTEGER,
    fuel TEXT NOT NULL DEFAULT '',
    transmission TEXT NOT NULL DEFAULT '',
    seats INTEGER,
    mass_kg INTEGER,
    first_registration TEXT NOT NULL DEFAULT '',
    mileage INTEGER NOT NULL DEFAULT 0,
    acquired_at TEXT NOT NULL DEFAULT '',
    photo_name TEXT NOT NULL DEFAULT '',
    photo_mime TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS garage_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES garage_vehicles(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    item TEXT NOT NULL DEFAULT '',
    date TEXT NOT NULL,
    mileage INTEGER,
    cost REAL,
    description TEXT NOT NULL DEFAULT '',
    dtc TEXT NOT NULL DEFAULT '',
    cause TEXT NOT NULL DEFAULT '',
    checks TEXT NOT NULL DEFAULT '',
    parts TEXT NOT NULL DEFAULT '',
    next_date TEXT NOT NULL DEFAULT '',
    next_mileage INTEGER,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS garage_documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id INTEGER NOT NULL REFERENCES garage_vehicles(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS garage_vehicles_user ON garage_vehicles(user_id);
  CREATE INDEX IF NOT EXISTS garage_events_vehicle ON garage_events(vehicle_id, date);
  CREATE INDEX IF NOT EXISTS garage_documents_vehicle ON garage_documents(vehicle_id);
`);

const nowISO = () => new Date().toISOString();

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function text(value, max = 200) {
  return cleanText(value, max);
}

function intOrNull(value, { min = 0, max = 100000000 } = {}) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/[^\d-]/g, ''));
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < min || rounded > max) return null;
  return rounded;
}

function moneyOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(String(value).replace(',', '.').replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(n) || n < 0 || n > 1000000) return null;
  return Math.round(n * 100) / 100;
}

function dateOrEmpty(value, { allowFuture = false } = {}) {
  const raw = text(value, 10);
  if (!raw) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw fail('La fecha debe tener el formato AAAA-MM-DD.');
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw fail('La fecha indicada no existe.');
  if (!allowFuture && parsed.getTime() > Date.now() + 86400000) throw fail('La fecha no puede estar en el futuro.');
  return raw;
}

function normalisePlate(value) {
  const raw = text(value, 20).toUpperCase().replace(/[\s-]/g, '');
  if (!raw) return '';
  if (!PLATE_MODERN.test(raw) && !PLATE_OLD.test(raw) && !/^[A-Z0-9]{4,12}$/.test(raw)) {
    throw fail('La matrícula no tiene un formato válido.');
  }
  return raw;
}

function normaliseVin(value) {
  const raw = text(value, 30).toUpperCase().replace(/[\s-]/g, '');
  if (!raw) return '';
  if (!VIN_RE.test(raw)) throw fail('El bastidor (VIN) debe tener 17 caracteres y no puede contener I, O ni Q.');
  return raw;
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// -------------------------------------------------------------
// Catálogo documentado de motores (solo para orientar el mantenimiento)
// -------------------------------------------------------------
let reliabilityCache = { mtime: 0, engines: [] };

function reliabilityEngines() {
  try {
    const stat = fs.statSync(RELIABILITY_PATH);
    if (stat.mtimeMs !== reliabilityCache.mtime) {
      const data = JSON.parse(fs.readFileSync(RELIABILITY_PATH, 'utf8'));
      reliabilityCache = { mtime: stat.mtimeMs, engines: Array.isArray(data.engines) ? data.engines : [] };
    }
    return reliabilityCache.engines;
  } catch {
    return [];
  }
}

function engineCodes(engine) {
  return String(engine.codes || '')
    .split(/[,;/]|\by\b/)
    .map(code => code.replace(/[^A-Z0-9-]/gi, '').trim().toUpperCase())
    .filter(code => code.length >= 3 && code.length <= 8);
}

function engineMatch(vehicle) {
  const engines = reliabilityEngines();
  if (!engines.length) return null;
  const vehicleCode = String(vehicle.engine_code || '').toUpperCase().trim();
  const haystack = fold(`${vehicle.brand} ${vehicle.model} ${vehicle.version} ${vehicle.fuel}`);
  let best = null;

  for (const engine of engines) {
    // Si el usuario conoce el código de motor, solo vale ese código: emparejar
    // por marca y cilindrada cuando el código es otro distinto mostraría los
    // intervalos de un motor que no es el suyo (un EA288 como si fuera EA189).
    if (vehicleCode && !engineCodes(engine).includes(vehicleCode)) continue;
    let score = vehicleCode ? 10 : 0;
    let reason = vehicleCode ? 'codigo_motor' : '';
    const brandTokens = fold(engine.brand).split(/[\/,]/).map(part => part.trim()).filter(Boolean);
    if (brandTokens.some(token => token && haystack.includes(token))) score += 2;
    if (vehicle.displacement_cc && engine.displacementCc && Math.abs(engine.displacementCc - vehicle.displacement_cc) <= 120) score += 3;
    if (vehicle.fuel && fold(engine.fuel) === fold(vehicle.fuel)) score += 1;
    const familyTokens = fold(`${engine.family} ${engine.commercial}`)
      .split(/[^a-z0-9.]+/)
      .filter(token => token.length >= 3 && !/^(tsi|tdi|hdi|dci|cdi|gti|tfsi|tdci|bluehdi|multijet)\d*$/.test(token));
    if (familyTokens.some(token => haystack.includes(token))) score += 3;
    if (score >= 6 && (!best || score > best.score)) best = { engine, score, reason: reason || 'marca_y_motorizacion' };
  }
  return best;
}

function maintenanceKeyFor(label) {
  const value = fold(label);
  if (/aceite/.test(value) && !/frenos/.test(value)) return 'aceite';
  if (/filtro/.test(value)) return 'filtros';
  if (/distribu/.test(value)) return 'distribucion';
  if (/correa auxiliar|accesorios/.test(value)) return 'correa_auxiliar';
  if (/buj[ií]a|encendido/.test(value)) return 'bujias';
  if (/calentador/.test(value)) return 'calentadores';
  if (/l[ií]quido de frenos/.test(value)) return 'liquido_frenos';
  if (/freno|pastilla|disco/.test(value)) return 'frenos';
  if (/neum[aá]tic/.test(value)) return 'neumaticos';
  if (/refrigerante|anticongelante/.test(value)) return 'refrigerante';
  if (/embrague/.test(value)) return 'embrague';
  if (/bater[ií]a/.test(value)) return 'bateria';
  if (/fap|dpf|egr|part[ií]cula/.test(value)) return 'fap_egr';
  return 'otros';
}

export function maintenanceGuide(vehicle) {
  const match = engineMatch(vehicle);
  if (!match) {
    const code = String(vehicle.engine_code || '').trim().toUpperCase();
    return {
      matched: null,
      note: code
        ? `El código de motor ${code} no está todavía en la base documentada de fiabilidad. No se muestran intervalos: regístralos con el libro del fabricante de tu versión.`
        : 'Este motor no está todavía en la base documentada de fiabilidad. No se muestran intervalos: regístralos con el libro del fabricante de tu versión.',
      items: []
    };
  }
  const engine = match.engine;
  const items = (engine.maintenance || []).map(entry => ({
    key: maintenanceKeyFor(entry.item),
    label: entry.item,
    interval: entry.interval || '',
    note: entry.note || '',
    sources: (entry.sources || []).filter(source => source && source.url)
  }));
  return {
    matched: {
      id: engine.id,
      family: engine.family,
      commercial: engine.commercial,
      brand: engine.brand,
      confidence: match.reason
    },
    note: match.reason === 'codigo_motor'
      ? 'Intervalos publicados para este motor en la base de fiabilidad, con su fuente. Confirma siempre con el libro de mantenimiento de tu versión y tu mercado.'
      : `No se ha podido confirmar el código de motor: estos intervalos son los de ${engine.family}, una motorización equivalente de la misma marca, cilindrada y combustible. Confírmalos con el libro de mantenimiento de tu versión antes de usarlos.`,
    items
  };
}

// -------------------------------------------------------------
// Utilidades de vehículo
// -------------------------------------------------------------
const VEHICLE_FIELDS = [
  'brand', 'model', 'version', 'year', 'plate', 'vin', 'engine_code', 'displacement_cc',
  'power_ps', 'power_kw', 'fuel', 'transmission', 'seats', 'mass_kg', 'first_registration',
  'mileage', 'acquired_at', 'notes'
];

function publicVehicle(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    brand: row.brand,
    model: row.model,
    version: row.version,
    year: row.year === null ? null : Number(row.year),
    plate: row.plate,
    vin: row.vin,
    engineCode: row.engine_code,
    displacementCc: row.displacement_cc === null ? null : Number(row.displacement_cc),
    powerPs: row.power_ps === null ? null : Number(row.power_ps),
    powerKw: row.power_kw === null ? null : Number(row.power_kw),
    fuel: row.fuel,
    transmission: row.transmission,
    seats: row.seats === null ? null : Number(row.seats),
    massKg: row.mass_kg === null ? null : Number(row.mass_kg),
    firstRegistration: row.first_registration,
    mileage: Number(row.mileage || 0),
    acquiredAt: row.acquired_at,
    notes: row.notes,
    hasPhoto: Boolean(row.photo_name),
    photoUrl: row.photo_name ? `/api/garage/vehicles/${row.id}/photo` : '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function rowOf(userId, id) {
  const row = db.prepare('SELECT * FROM garage_vehicles WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw fail('Vehículo no encontrado en tu garaje.', 404);
  return row;
}

function cleanVehiclePayload(data = {}) {
  const out = {};
  out.brand = text(data.brand, 60);
  out.model = text(data.model, 80);
  if (!out.brand || !out.model) throw fail('Indica al menos la marca y el modelo.');
  out.version = text(data.version, 120);
  out.year = intOrNull(data.year, { min: 1950, max: 2100 });
  if (data.year !== '' && data.year != null && out.year === null) throw fail('El año no es válido.');
  out.plate = normalisePlate(data.plate);
  out.vin = normaliseVin(data.vin);
  out.engine_code = text(data.engineCode ?? data.engine_code, 24).toUpperCase();
  out.displacement_cc = intOrNull(data.displacementCc ?? data.displacement_cc, { min: 50, max: 10000 });
  out.power_ps = intOrNull(data.powerPs ?? data.power_ps, { min: 10, max: 2000 });
  out.power_kw = intOrNull(data.powerKw ?? data.power_kw, { min: 5, max: 1500 });
  out.fuel = text(data.fuel, 30);
  out.transmission = text(data.transmission, 40);
  out.seats = intOrNull(data.seats, { min: 1, max: 9 });
  out.mass_kg = intOrNull(data.massKg ?? data.mass_kg, { min: 300, max: 5000 });
  out.first_registration = dateOrEmpty(data.firstRegistration ?? data.first_registration);
  out.mileage = intOrNull(data.mileage, { min: 0, max: 2000000 }) ?? 0;
  out.acquired_at = dateOrEmpty(data.acquiredAt ?? data.acquired_at);
  out.notes = text(data.notes, 2000);
  return out;
}

export function listVehicles(userId) {
  const rows = db.prepare('SELECT * FROM garage_vehicles WHERE user_id = ? ORDER BY created_at ASC').all(userId);
  return rows.map(row => {
    const vehicle = publicVehicle(row);
    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM garage_events WHERE vehicle_id = ?) AS events,
        (SELECT COUNT(*) FROM garage_documents WHERE vehicle_id = ?) AS documents,
        (SELECT COALESCE(SUM(cost), 0) FROM garage_events WHERE vehicle_id = ?) AS spent
    `).get(row.id, row.id, row.id);
    const alerts = vehicleAlerts(row);
    return {
      ...vehicle,
      counts: {
        events: Number(stats.events || 0),
        documents: Number(stats.documents || 0),
        spent: Math.round(Number(stats.spent || 0) * 100) / 100
      },
      alerts: alerts.slice(0, 3)
    };
  });
}

export function garageStats(userId) {
  const vehicles = listVehicles(userId);
  return {
    vehicles: vehicles.length,
    alerts: vehicles.reduce((sum, vehicle) => sum + vehicle.alerts.filter(alert => alert.level === 'vencido').length, 0),
    upcoming: vehicles.reduce((sum, vehicle) => sum + vehicle.alerts.filter(alert => alert.level === 'proximo').length, 0),
    spent: Math.round(vehicles.reduce((sum, vehicle) => sum + (vehicle.counts.spent || 0), 0) * 100) / 100
  };
}

export function createVehicle(userId, data) {
  const payload = cleanVehiclePayload(data);
  const existing = db.prepare('SELECT COUNT(*) AS n FROM garage_vehicles WHERE user_id = ?').get(userId).n;
  if (Number(existing) >= 25) throw fail('Has alcanzado el máximo de 25 vehículos por cuenta.', 409);
  const created = nowISO();
  const info = db.prepare(`
    INSERT INTO garage_vehicles (user_id, brand, model, version, year, plate, vin, engine_code,
      displacement_cc, power_ps, power_kw, fuel, transmission, seats, mass_kg, first_registration,
      mileage, acquired_at, notes, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId, payload.brand, payload.model, payload.version, payload.year, payload.plate, payload.vin,
    payload.engine_code, payload.displacement_cc, payload.power_ps, payload.power_kw, payload.fuel,
    payload.transmission, payload.seats, payload.mass_kg, payload.first_registration, payload.mileage,
    payload.acquired_at, payload.notes, created, created
  );
  return publicVehicle(rowOf(userId, Number(info.lastInsertRowid)));
}

export function updateVehicle(userId, id, data) {
  const row = rowOf(userId, id);
  const merged = {};
  for (const key of VEHICLE_FIELDS) merged[key] = row[key];
  const payload = cleanVehiclePayload({ ...mapRowToInput(row), ...data });
  for (const key of VEHICLE_FIELDS) merged[key] = payload[key];
  db.prepare(`
    UPDATE garage_vehicles SET brand = ?, model = ?, version = ?, year = ?, plate = ?, vin = ?,
      engine_code = ?, displacement_cc = ?, power_ps = ?, power_kw = ?, fuel = ?, transmission = ?,
      seats = ?, mass_kg = ?, first_registration = ?, mileage = ?, acquired_at = ?, notes = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(
    merged.brand, merged.model, merged.version, merged.year, merged.plate, merged.vin, merged.engine_code,
    merged.displacement_cc, merged.power_ps, merged.power_kw, merged.fuel, merged.transmission,
    merged.seats, merged.mass_kg, merged.first_registration, merged.mileage, merged.acquired_at,
    merged.notes, nowISO(), id, userId
  );
  return publicVehicle(rowOf(userId, id));
}

function mapRowToInput(row) {
  return {
    brand: row.brand, model: row.model, version: row.version, year: row.year, plate: row.plate,
    vin: row.vin, engineCode: row.engine_code, displacementCc: row.displacement_cc,
    powerPs: row.power_ps, powerKw: row.power_kw, fuel: row.fuel, transmission: row.transmission,
    seats: row.seats, massKg: row.mass_kg, firstRegistration: row.first_registration,
    mileage: row.mileage, acquiredAt: row.acquired_at, notes: row.notes
  };
}

export function deleteVehicle(userId, id, { confirm } = {}) {
  const row = rowOf(userId, id);
  if (confirm !== true) throw fail('Confirma la eliminación del vehículo y de todo su historial.', 409);
  const documents = db.prepare('SELECT stored_name FROM garage_documents WHERE vehicle_id = ? AND user_id = ?').all(id, userId);
  db.prepare('DELETE FROM garage_vehicles WHERE id = ? AND user_id = ?').run(id, userId);
  for (const doc of documents) removeFile(doc.stored_name);
  if (row.photo_name) removeFile(row.photo_name);
  return { ok: true, deleted: Number(id) };
}

function removeFile(storedName) {
  try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(String(storedName)))); } catch { /* ya no existe */ }
}

// -------------------------------------------------------------
// Fotografía personal
// -------------------------------------------------------------
const IMAGE_RULES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: null }
};

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw fail('Formato no admitido. Usa JPG, PNG o WebP.', 415);
  const mime = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw fail('El archivo está vacío.');
  if (buffer.length > 6 * 1024 * 1024) throw fail('La fotografía no puede superar 6 MB.', 413);
  const rule = IMAGE_RULES[mime];
  if (rule.magic && !rule.magic.every((byte, index) => buffer[index] === byte)) {
    throw fail('El contenido del archivo no coincide con su formato.');
  }
  if (mime === 'image/webp' && !(buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')) {
    throw fail('El archivo WebP no es válido.');
  }
  return { buffer, mime, ext: rule.ext };
}

export function saveVehiclePhoto(userId, id, dataUrl) {
  const row = rowOf(userId, id);
  const { buffer, mime, ext } = decodeDataUrl(dataUrl);
  const storedName = `${crypto.randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);
  if (row.photo_name) removeFile(row.photo_name);
  db.prepare('UPDATE garage_vehicles SET photo_name = ?, photo_mime = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run(storedName, mime, nowISO(), id, userId);
  return publicVehicle(rowOf(userId, id));
}

export function deleteVehiclePhoto(userId, id) {
  const row = rowOf(userId, id);
  if (row.photo_name) removeFile(row.photo_name);
  db.prepare('UPDATE garage_vehicles SET photo_name = ?, photo_mime = ?, updated_at = ? WHERE id = ? AND user_id = ?')
    .run('', '', nowISO(), id, userId);
  return publicVehicle(rowOf(userId, id));
}

export function getVehiclePhoto(userId, id) {
  const row = rowOf(userId, id);
  if (!row.photo_name) throw fail('Este vehículo no tiene fotografía.', 404);
  const filePath = path.join(UPLOAD_DIR, path.basename(row.photo_name));
  if (!fs.existsSync(filePath)) throw fail('La fotografía ya no está disponible.', 404);
  return { path: filePath, mime: row.photo_mime || 'application/octet-stream' };
}

// -------------------------------------------------------------
// Eventos: mantenimiento, averías, reparaciones, historial
// -------------------------------------------------------------
function publicEvent(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    kindLabel: KIND_LABEL[row.kind] || row.kind,
    title: row.title,
    item: row.item,
    itemLabel: row.item ? (MAINTENANCE_ITEMS.find(([key]) => key === row.item)?.[1] || '') : '',
    date: row.date,
    mileage: row.mileage === null ? null : Number(row.mileage),
    cost: row.cost === null ? null : Number(row.cost),
    description: row.description,
    dtc: row.dtc,
    cause: row.cause,
    checks: row.checks,
    parts: row.parts,
    nextDate: row.next_date,
    nextMileage: row.next_mileage === null ? null : Number(row.next_mileage),
    createdAt: row.created_at
  };
}

function cleanEventPayload(data = {}, previous = null) {
  const kind = text(data.kind ?? previous?.kind, 20);
  if (!KIND_LABEL[kind]) throw fail('Tipo de registro no válido.');
  const title = text(data.title ?? previous?.title, 120);
  if (!title) throw fail('Escribe un título para el registro.');
  const item = text(data.item ?? previous?.item, 20);
  if (item && !MAINT_KEYS.has(item)) throw fail('Categoría de mantenimiento no válida.');
  const date = dateOrEmpty(data.date ?? previous?.date) || new Date().toISOString().slice(0, 10);
  const mileage = intOrNull(data.mileage ?? previous?.mileage, { min: 0, max: 2000000 });
  const cost = moneyOrNull(data.cost ?? previous?.cost);
  const nextDate = data.nextDate === '' ? '' : dateOrEmpty(data.nextDate ?? previous?.nextDate, { allowFuture: true });
  const nextMileage = intOrNull(data.nextMileage ?? previous?.nextMileage, { min: 0, max: 2000000 });
  if (nextMileage !== null && mileage !== null && nextMileage < mileage) {
    throw fail('El próximo mantenimiento no puede estar por debajo del kilometraje actual del registro.');
  }
  return {
    kind,
    title,
    item,
    date,
    mileage,
    cost,
    description: text(data.description ?? previous?.description, 4000),
    dtc: text(data.dtc ?? previous?.dtc, 40).toUpperCase(),
    cause: text(data.cause ?? previous?.cause, 2000),
    checks: text(data.checks ?? previous?.checks, 4000),
    parts: text(data.parts ?? previous?.parts, 2000),
    nextDate,
    nextMileage
  };
}

export function createEvent(userId, vehicleId, data) {
  rowOf(userId, vehicleId);
  const payload = cleanEventPayload(data);
  const info = db.prepare(`
    INSERT INTO garage_events (vehicle_id, user_id, kind, title, item, date, mileage, cost, description,
      dtc, cause, checks, parts, next_date, next_mileage, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    vehicleId, userId, payload.kind, payload.title, payload.item, payload.date, payload.mileage, payload.cost,
    payload.description, payload.dtc, payload.cause, payload.checks, payload.parts, payload.nextDate,
    payload.nextMileage, nowISO()
  );
  // Mantener el kilometraje del vehículo al día cuando el registro lo supera.
  if (payload.mileage && payload.mileage > 0) {
    db.prepare('UPDATE garage_vehicles SET mileage = ?, updated_at = ? WHERE id = ? AND user_id = ? AND mileage < ?')
      .run(payload.mileage, nowISO(), vehicleId, userId, payload.mileage);
  }
  return publicEvent(db.prepare('SELECT * FROM garage_events WHERE id = ? AND user_id = ?').get(Number(info.lastInsertRowid), userId));
}

export function updateEvent(userId, eventId, data) {
  const row = db.prepare('SELECT * FROM garage_events WHERE id = ? AND user_id = ?').get(eventId, userId);
  if (!row) throw fail('Registro no encontrado.', 404);
  const payload = cleanEventPayload({ ...mapEventToInput(row), ...data }, row);
  db.prepare(`
    UPDATE garage_events SET kind = ?, title = ?, item = ?, date = ?, mileage = ?, cost = ?, description = ?,
      dtc = ?, cause = ?, checks = ?, parts = ?, next_date = ?, next_mileage = ?
    WHERE id = ? AND user_id = ?
  `).run(
    payload.kind, payload.title, payload.item, payload.date, payload.mileage, payload.cost, payload.description,
    payload.dtc, payload.cause, payload.checks, payload.parts, payload.nextDate, payload.nextMileage, eventId, userId
  );
  return publicEvent(db.prepare('SELECT * FROM garage_events WHERE id = ? AND user_id = ?').get(eventId, userId));
}

function mapEventToInput(row) {
  return {
    kind: row.kind, title: row.title, item: row.item, date: row.date, mileage: row.mileage, cost: row.cost,
    description: row.description, dtc: row.dtc, cause: row.cause, checks: row.checks, parts: row.parts,
    nextDate: row.next_date, nextMileage: row.next_mileage
  };
}

export function deleteEvent(userId, eventId) {
  const row = db.prepare('SELECT vehicle_id FROM garage_events WHERE id = ? AND user_id = ?').get(eventId, userId);
  if (!row) throw fail('Registro no encontrado.', 404);
  db.prepare('DELETE FROM garage_events WHERE id = ? AND user_id = ?').run(eventId, userId);
  return { ok: true };
}

// -------------------------------------------------------------
// Documentación privada
// -------------------------------------------------------------
const DOC_RULES = {
  'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
  'image/webp': { ext: 'webp', magic: null },
  'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }
};

function publicDocument(row) {
  return {
    id: Number(row.id),
    kind: row.kind,
    kindLabel: DOC_LABEL[row.kind] || row.kind,
    name: row.name,
    mime: row.mime,
    size: Number(row.size),
    createdAt: row.created_at,
    url: `/api/garage/documents/${row.id}`
  };
}

export function createDocument(userId, vehicleId, { dataUrl, name, kind } = {}) {
  rowOf(userId, vehicleId);
  const docKind = text(kind, 24) || 'otro';
  if (!DOC_LABEL[docKind]) throw fail('Tipo de documento no válido.');
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw fail('Formato no admitido. Usa JPG, PNG, WebP o PDF.', 415);
  const mime = match[1];
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw fail('El archivo está vacío.');
  if (buffer.length > 8 * 1024 * 1024) throw fail('Cada documento debe pesar menos de 8 MB.', 413);
  const rule = DOC_RULES[mime];
  if (rule.magic && !rule.magic.every((byte, index) => buffer[index] === byte)) {
    throw fail('El contenido del archivo no coincide con su formato.');
  }
  if (mime === 'image/webp' && !(buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')) {
    throw fail('El archivo WebP no es válido.');
  }
  const total = db.prepare('SELECT COUNT(*) AS n FROM garage_documents WHERE vehicle_id = ? AND user_id = ?').get(vehicleId, userId).n;
  if (Number(total) >= 60) throw fail('Este vehículo ya tiene 60 documentos. Elimina alguno antes de subir más.', 409);
  const safeName = text(name, 120).replace(/[^\w.\- ()áéíóúÁÉÍÓÚñÑ]/g, '_') || `documento.${rule.ext}`;
  const storedName = `${crypto.randomUUID()}.${rule.ext}`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buffer);
  const info = db.prepare(`
    INSERT INTO garage_documents (vehicle_id, user_id, kind, name, stored_name, mime, size, sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(vehicleId, userId, docKind, safeName, storedName, mime, buffer.length,
    crypto.createHash('sha256').update(buffer).digest('hex'), nowISO());
  return publicDocument(db.prepare('SELECT * FROM garage_documents WHERE id = ? AND user_id = ?').get(Number(info.lastInsertRowid), userId));
}

export function getDocumentFile(userId, documentId) {
  const row = db.prepare('SELECT * FROM garage_documents WHERE id = ? AND user_id = ?').get(documentId, userId);
  if (!row) throw fail('Documento no encontrado.', 404);
  const filePath = path.join(UPLOAD_DIR, path.basename(row.stored_name));
  if (!fs.existsSync(filePath)) throw fail('El documento ya no está disponible.', 404);
  return { path: filePath, mime: row.mime, name: row.name };
}

export function deleteDocument(userId, documentId) {
  const row = db.prepare('SELECT * FROM garage_documents WHERE id = ? AND user_id = ?').get(documentId, userId);
  if (!row) throw fail('Documento no encontrado.', 404);
  db.prepare('DELETE FROM garage_documents WHERE id = ? AND user_id = ?').run(documentId, userId);
  removeFile(row.stored_name);
  return { ok: true };
}

// -------------------------------------------------------------
// Avisos y ficha completa
// -------------------------------------------------------------
function daysUntil(date) {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.ceil((target - Date.now()) / 86400000);
}

export function vehicleAlerts(row) {
  const today = new Date().toISOString().slice(0, 10);
  const mileage = Number(row.mileage || 0);
  const upcoming = db.prepare(`
    SELECT * FROM garage_events
    WHERE vehicle_id = ? AND (next_date != '' OR next_mileage IS NOT NULL)
    ORDER BY date DESC
  `).all(row.id);
  const latestByItem = new Map();
  for (const event of upcoming) {
    const key = event.item || event.kind;
    if (!latestByItem.has(key)) latestByItem.set(key, event);
  }
  const alerts = [];
  for (const event of latestByItem.values()) {
    const label = event.item
      ? (MAINTENANCE_ITEMS.find(([key]) => key === event.item)?.[1] || event.title)
      : event.title;
    const days = daysUntil(event.next_date);
    const kmLeft = event.next_mileage === null ? null : Number(event.next_mileage) - mileage;
    if (event.next_date && event.next_date <= today) {
      alerts.push({ level: 'vencido', label, detail: `Vencido el ${event.next_date}`, source: event.id });
    } else if (kmLeft !== null && kmLeft <= 0) {
      alerts.push({ level: 'vencido', label, detail: `Superado el límite de ${Number(event.next_mileage).toLocaleString('es-ES')} km`, source: event.id });
    } else if (days !== null && days <= 30) {
      alerts.push({ level: 'proximo', label, detail: `Vence en ${days} día${days === 1 ? '' : 's'} (${event.next_date})`, source: event.id });
    } else if (kmLeft !== null && kmLeft <= 1000) {
      alerts.push({ level: 'proximo', label, detail: `Faltan ${Math.max(0, kmLeft).toLocaleString('es-ES')} km`, source: event.id });
    }
  }
  return alerts;
}

export function getVehicle(userId, id) {
  const row = rowOf(userId, id);
  const events = db.prepare('SELECT * FROM garage_events WHERE vehicle_id = ? AND user_id = ? ORDER BY date DESC, id DESC')
    .all(id, userId).map(publicEvent);
  const documents = db.prepare('SELECT * FROM garage_documents WHERE vehicle_id = ? AND user_id = ? ORDER BY created_at DESC')
    .all(id, userId).map(publicDocument);
  const vehicle = publicVehicle(row);
  const year = new Date().getUTCFullYear();
  const spentThisYear = events
    .filter(event => String(event.date).startsWith(String(year)))
    .reduce((sum, event) => sum + (event.cost || 0), 0);
  const spendingByKind = {};
  for (const event of events) {
    if (!event.cost) continue;
    spendingByKind[event.kindLabel] = Math.round(((spendingByKind[event.kindLabel] || 0) + event.cost) * 100) / 100;
  }
  const lastMaintenance = {};
  for (const event of events) {
    if (event.kind !== 'mantenimiento' || !event.item || lastMaintenance[event.item]) continue;
    lastMaintenance[event.item] = { date: event.date, mileage: event.mileage, title: event.title, cost: event.cost };
  }
  return {
    ...vehicle,
    events,
    documents,
    alerts: vehicleAlerts(row),
    guide: maintenanceGuide(row),
    stats: {
      events: events.length,
      spentTotal: Math.round(events.reduce((sum, event) => sum + (event.cost || 0), 0) * 100) / 100,
      spentThisYear: Math.round(spentThisYear * 100) / 100,
      spendingByKind,
      lastMaintenance
    },
    maintenanceItems: MAINTENANCE_ITEMS.map(([key, label]) => ({ key, label })),
    eventKinds: EVENT_KINDS.map(([key, label]) => ({ key, label })),
    documentKinds: DOCUMENT_KINDS.map(([key, label]) => ({ key, label }))
  };
}

export function buildAIContext(vehicle) {
  return {
    source: 'mi_garaje',
    vehicleId: `garaje-${vehicle.id}`,
    brand: vehicle.brand,
    model: vehicle.model,
    version: vehicle.version,
    year: vehicle.year,
    engine: [vehicle.engineCode, vehicle.displacementCc ? `${vehicle.displacementCc} cc` : '', vehicle.powerPs ? `${vehicle.powerPs} CV` : '', vehicle.fuel].filter(Boolean).join(' · '),
    fuel: vehicle.fuel,
    mileage: vehicle.mileage,
    garage: {
      plate: vehicle.plate || undefined,
      firstRegistration: vehicle.firstRegistration || undefined,
      engineCode: vehicle.engineCode || undefined,
      maintenance: vehicle.events.filter(event => event.kind === 'mantenimiento').slice(0, 10)
        .map(event => `${event.date}: ${event.title}${event.mileage ? ` (${event.mileage} km)` : ''}${event.cost ? ` · ${event.cost} €` : ''}`),
      issues: vehicle.events.filter(event => ['averia', 'reparacion'].includes(event.kind)).slice(0, 10)
        .map(event => `${event.date}: ${event.title}${event.dtc ? ` [${event.dtc}]` : ''}${event.cause ? ` · causa: ${event.cause}` : ''}${event.parts ? ` · piezas: ${event.parts}` : ''}`),
      pendingAlerts: vehicle.alerts.map(alert => `${alert.label}: ${alert.detail}`),
      spentThisYear: vehicle.stats.spentThisYear,
      spentTotal: vehicle.stats.spentTotal,
      documentedMaintenance: vehicle.guide.items.map(item => `${item.label}: ${item.interval}`),
      reliabilityMatch: vehicle.guide.matched ? `${vehicle.guide.matched.family} (${vehicle.guide.matched.commercial})` : null,
      note: 'Datos introducidos por el propio usuario. No son verificaciones de taller.'
    }
  };
}
