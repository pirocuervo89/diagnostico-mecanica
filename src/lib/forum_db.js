import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { restoreDatabase, startAutoBackup, startUploadsSync } from './db_persist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const DB_PATH = path.resolve(process.env.FORUM_DB_PATH || path.join(DATA_DIR, 'forum.sqlite'));
const UPLOAD_DIR = path.resolve(process.env.FORUM_UPLOAD_DIR || path.join(DATA_DIR, 'forum', 'uploads'));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Si el disco está vacío (primer arranque en Render tras un despliegue),
// recuperamos cuentas y vehículos de la copia en la nube antes de abrir.
await restoreDatabase(DB_PATH);

export const db = new DatabaseSync(DB_PATH);
startAutoBackup(db, DB_PATH);
await startUploadsSync(UPLOAD_DIR, 'files/foro');


db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    bio TEXT NOT NULL DEFAULT '',
    specialty TEXT NOT NULL DEFAULT '',
    location TEXT NOT NULL DEFAULT '',
    avatar_color TEXT NOT NULL DEFAULT '#f39c12',
    reputation INTEGER NOT NULL DEFAULT 0,
    banned_until TEXT,
    created_at TEXT NOT NULL,
    last_seen TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    ip TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    position INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ref TEXT UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL REFERENCES categories(id),
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    vehicle_brand TEXT NOT NULL DEFAULT '',
    vehicle_model TEXT NOT NULL DEFAULT '',
    vehicle_year TEXT NOT NULL DEFAULT '',
    engine TEXT NOT NULL DEFAULT '',
    engine_code TEXT NOT NULL DEFAULT '',
    mileage TEXT NOT NULL DEFAULT '',
    dtcs TEXT NOT NULL DEFAULT '[]',
    symptoms TEXT NOT NULL DEFAULT '',
    conditions TEXT NOT NULL DEFAULT '',
    measurements TEXT NOT NULL DEFAULT '',
    tests TEXT NOT NULL DEFAULT '',
    repairs TEXT NOT NULL DEFAULT '',
    result TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'abierto',
    solution_reply_id INTEGER,
    search_text TEXT NOT NULL DEFAULT '',
    views INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    hidden_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    parent_id INTEGER REFERENCES replies(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    is_solution_proposal INTEGER NOT NULL DEFAULT 0,
    is_verified_solution INTEGER NOT NULL DEFAULT 0,
    verification_notes TEXT NOT NULL DEFAULT '',
    verified_by INTEGER REFERENCES users(id),
    verified_at TEXT,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    hidden_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    reply_id INTEGER REFERENCES replies(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS votes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    value INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, target_type, target_id)
  );

  CREATE TABLE IF NOT EXISTS ratings (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reply_id INTEGER NOT NULL REFERENCES replies(id) ON DELETE CASCADE,
    value INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, reply_id)
  );

  CREATE TABLE IF NOT EXISTS case_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL,
    target_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendiente',
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_low INTEGER NOT NULL REFERENCES users(id),
    user_high INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (user_low, user_high)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL REFERENCES dm_threads(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cases_status ON cases(status, is_hidden);
  CREATE INDEX IF NOT EXISTS idx_cases_category ON cases(category, is_hidden);
  CREATE INDEX IF NOT EXISTS idx_cases_user ON cases(user_id);
  CREATE INDEX IF NOT EXISTS idx_replies_case ON replies(case_id, is_hidden);
  CREATE INDEX IF NOT EXISTS idx_attachments_case ON attachments(case_id);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_dm_threads_low ON dm_threads(user_low);
  CREATE INDEX IF NOT EXISTS idx_dm_threads_high ON dm_threads(user_high);
  CREATE INDEX IF NOT EXISTS idx_dm_messages_thread ON dm_messages(thread_id);
`);

// Planes: columnas nuevas sobre las bases que ya existen (migración suave, sin
// perder cuentas ni coches).
for (const [column, definition] of [
  ['plan', "TEXT NOT NULL DEFAULT 'free'"],
  ['plan_expires_at', 'TEXT'],
  ['trial_ends_at', 'TEXT']
]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`); } catch { /* ya existe */ }
}
// A quien ya tenía cuenta se le dan los 30 días de prueba desde hoy.
try {
  db.prepare("UPDATE users SET trial_ends_at = ? WHERE trial_ends_at IS NULL").run(
    new Date(Date.now() + 30 * 86400000).toISOString()
  );
} catch { /* sin permiso de escritura: se sigue igual */ }

const CATEGORIES = [
  ['motor', 'Motor', 'Bloque, culata, lubricación y averías mecánicas internas.', 'engine'],
  ['turbo', 'Turbo y sobrealimentación', 'Turbocompresor, geometría variable, intercooler y presión de soplado.', 'wind'],
  ['inyeccion', 'Inyección y combustible', 'Bombas, inyectores, rampa, filtros y mezcla.', 'oil'],
  ['electricidad', 'Electricidad', 'Batería, alternador, arranque, masas y consumos.', 'battery'],
  ['electronica', 'Electrónica y centralitas', 'ECU, CAN, cableado, módulos y programación.', 'cpu'],
  ['frenos', 'Frenos y ABS', 'Discos, pastillas, hidráulica, ABS, ESP y freno de mano.', 'brake'],
  ['embrague', 'Embrague', 'Pesado, hidráulico, bimasa y accionamiento.', 'wrench'],
  ['transmision', 'Transmisión', 'Caja manual, automática, diferencial, palieres y tracción.', 'car'],
  ['refrigeracion', 'Refrigeración', 'Radiador, termostato, bomba, ventiladores y anticongelante.', 'thermo'],
  ['climatizacion', 'Climatización', 'Aire acondicionado, compresor, habitáculo y sensores.', 'cloud'],
  ['distribucion', 'Distribución', 'Correa, cadena, tensores y puesta a punto.', 'clock'],
  ['emisiones', 'Emisiones', 'Catalizador, sondas lambda, humos y gases.', 'cloud'],
  ['dpf-fap', 'DPF / FAP', 'Filtro de partículas, regeneraciones y saturación.', 'alert'],
  ['egr', 'EGR', 'Válvula EGR, enfriador, obstrucciones y admisión.', 'refresh'],
  ['sensores', 'Sensores', 'MAP, MAF, temperatura, presión, cigüeñal y árbol de levas.', 'pulse'],
  ['diagnosis-obd', 'Diagnosis OBD', 'Lecturas, códigos DTC, datos en vivo y pruebas con escáner.', 'search'],
  ['mantenimiento', 'Mantenimiento', 'Aceites, filtros, revisiones e intervalos de servicio.', 'check'],
  ['herramientas', 'Herramientas de taller', 'Útiles, equipos de medida y procedimientos de taller.', 'wrench']
];

const insertCategory = db.prepare(`
  INSERT INTO categories (id, name, description, icon, position)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    icon = excluded.icon,
    position = excluded.position
`);
CATEGORIES.forEach((c, i) => insertCategory.run(c[0], c[1], c[2], c[3], i));

export const CASE_STATUSES = ['abierto', 'investigacion', 'solucion_propuesta', 'solucion_verificada', 'cerrado'];
export const CATEGORY_IDS = new Set(CATEGORIES.map(c => c[0]));

const nowISO = () => new Date().toISOString();

export function fold(value = '') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function cleanText(value, max = 4000) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, max);
}

function toInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    bio: user.bio,
    specialty: user.specialty,
    location: user.location,
    avatarColor: user.avatar_color,
    reputation: Number(user.reputation || 0),
    bannedUntil: user.banned_until || null,
    createdAt: user.created_at,
    lastSeen: user.last_seen,
    plan: user.plan || 'free',
    planExpiresAt: user.plan_expires_at || null,
    trialEndsAt: user.trial_ends_at || null
  };
}

function userById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function userByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get(username);
}

function ensureBannable(id) {
  const user = userById(id);
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  return user;
}

export function isBanned(user) {
  return Boolean(user?.banned_until && user.banned_until > nowISO());
}

export function registerUser({ username, displayName, password }, meta = {}) {
  const cleanUsername = cleanText(username, 24).toLowerCase();
  const name = cleanText(displayName || username, 60);
  if (!/^[a-z0-9._-]{3,24}$/.test(cleanUsername)) {
    throw Object.assign(new Error('El usuario debe tener 3-24 caracteres: letras, números, punto, guion o guion bajo.'), { status: 400 });
  }
  if (String(password || '').length < 8 || String(password || '').length > 200) {
    throw Object.assign(new Error('La contraseña debe tener entre 8 y 200 caracteres.'), { status: 400 });
  }
  if (userByUsername(cleanUsername)) {
    throw Object.assign(new Error('Ese nombre de usuario ya existe.'), { status: 409 });
  }
  const first = Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n) === 0;
  const role = first ? 'admin' : 'user';
  const { salt, hash } = hashPassword(String(password));
  const colors = ['#f39c12', '#22d3ee', '#7c9cff', '#4ade80', '#f472b6', '#facc15'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const created = nowISO();
  // 30 días de prueba desde el alta, como en el plan Gratis.
  const trialEnds = new Date(Date.now() + 30 * 86400000).toISOString();
  const info = db.prepare(`
    INSERT INTO users (username, display_name, password_salt, password_hash, role, avatar_color, created_at, last_seen, plan, trial_ends_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'free', ?)
  `).run(cleanUsername, name, salt, hash, role, color, created, created, trialEnds);
  return publicUser(userById(Number(info.lastInsertRowid)));
}

export function loginUser({ username, password }) {
  const user = userByUsername(cleanText(username, 24));
  if (!user || !verifyPassword(String(password || ''), user.password_salt, user.password_hash)) {
    throw Object.assign(new Error('Usuario o contraseña incorrectos.'), { status: 401 });
  }
  if (isBanned(user)) {
    throw Object.assign(new Error('Esta cuenta está suspendida temporalmente.'), { status: 403 });
  }
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowISO(), user.id);
  return publicUser(userById(user.id));
}

export function createSession(userId, { ip = '', userAgent = '' } = {}) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const created = nowISO();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)')
    .run(tokenHash(raw), userId, created, expires, cleanText(ip, 80), cleanText(userAgent, 300));
  return { token: raw, expiresAt: expires };
}

export function deleteSession(raw) {
  if (!raw) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(raw));
}

export function userFromSession(raw) {
  if (!raw) return null;
  const row = db.prepare(`
    SELECT u.*, s.expires_at AS session_expires
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?
  `).get(tokenHash(raw));
  if (!row) return null;
  if (row.session_expires <= nowISO()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(raw));
    return null;
  }
  if (isBanned(row)) return { ...publicUser(row), banned: true };
  db.prepare('UPDATE users SET last_seen = ? WHERE id = ?').run(nowISO(), row.id);
  return publicUser(row);
}

export function updateProfile(userId, data) {
  const current = userById(userId);
  if (!current) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });
  const displayName = cleanText(data.displayName ?? current.display_name, 60) || current.display_name;
  const bio = cleanText(data.bio ?? current.bio, 500);
  const specialty = cleanText(data.specialty ?? current.specialty, 120);
  const location = cleanText(data.location ?? current.location, 120);
  db.prepare('UPDATE users SET display_name = ?, bio = ?, specialty = ?, location = ? WHERE id = ?')
    .run(displayName, bio, specialty, location, userId);
  return publicUser(userById(userId));
}

export function deleteAccount(userId) {
  const user = userById(userId);
  if (!user) throw Object.assign(new Error('Usuario no encontrado'), { status: 404 });

  const attachments = db.prepare(`
    SELECT stored_name FROM attachments
    WHERE user_id = ?
       OR case_id IN (SELECT id FROM cases WHERE user_id = ?)
       OR reply_id IN (SELECT id FROM replies WHERE user_id = ?)
  `).all(userId, userId, userId);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE replies SET verified_by = NULL WHERE verified_by = ?').run(userId);
    db.prepare('UPDATE cases SET solution_reply_id = NULL WHERE solution_reply_id IN (SELECT id FROM replies WHERE user_id = ?)').run(userId);
    db.prepare('UPDATE case_history SET user_id = NULL WHERE user_id = ?').run(userId);
    db.prepare('UPDATE reports SET resolved_by = NULL WHERE resolved_by = ?').run(userId);
    db.prepare('DELETE FROM dm_threads WHERE user_low = ? OR user_high = ?').run(userId, userId);
    db.prepare('DELETE FROM reports WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM attachments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM replies WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM cases WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  for (const attachment of attachments) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(String(attachment.stored_name)))); } catch { /* ya no existe */ }
  }
  return { ok: true, deleted: Number(userId) };
}

export function listCategories() {
  return db.prepare(`
    SELECT c.*, (
      SELECT COUNT(*) FROM cases x
      WHERE x.category = c.id AND x.is_hidden = 0
    ) AS cases_count
    FROM categories c ORDER BY c.position
  `).all().map(c => ({
    id: c.id,
    name: c.name,
    description: c.description,
    icon: c.icon,
    cases: Number(c.cases_count)
  }));
}

function caseScore(row, tokens) {
  const text = row.search_text || '';
  let score = 0;
  for (const token of tokens) {
    if (text.includes(token)) score += token.length > 4 ? 3 : 2;
  }
  if (row.status === 'solucion_verificada') score += 6;
  else if (row.status === 'solucion_propuesta') score += 3;
  return score;
}

function mapCaseSummary(row, userId = null) {
  let dtcs = [];
  try { dtcs = JSON.parse(row.dtcs || '[]'); } catch { dtcs = []; }
  return {
    id: Number(row.id),
    ref: row.ref,
    category: row.category,
    categoryName: row.category_name,
    title: row.title,
    body: row.body,
    vehicle: {
      brand: row.vehicle_brand,
      model: row.vehicle_model,
      year: row.vehicle_year,
      engine: row.engine,
      engineCode: row.engine_code,
      mileage: row.mileage
    },
    dtcs,
    symptoms: row.symptoms,
    status: row.status,
    author: {
      username: row.username,
      displayName: row.display_name,
      role: row.author_role,
      reputation: Number(row.author_reputation || 0),
      avatarColor: row.avatar_color
    },
    replies: Number(row.replies_count || 0),
    votes: Number(row.score || 0),
    views: Number(row.views || 0),
    attachments: Number(row.attachments_count || 0),
    solutionReplyId: row.solution_reply_id ? Number(row.solution_reply_id) : null,
    userVote: Number(row.user_vote || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const CASE_SELECT = `
  SELECT c.*, cat.name AS category_name, u.username, u.display_name, u.role AS author_role,
    u.reputation AS author_reputation, u.avatar_color,
    (SELECT COUNT(*) FROM replies r WHERE r.case_id = c.id AND r.is_hidden = 0) AS replies_count,
    (SELECT COALESCE(SUM(v.value), 0) FROM votes v WHERE v.target_type = 'case' AND v.target_id = c.id) AS score,
    (SELECT COUNT(*) FROM attachments a WHERE a.case_id = c.id AND a.reply_id IS NULL) AS attachments_count,
    (SELECT v.value FROM votes v WHERE v.target_type = 'case' AND v.target_id = c.id AND v.user_id = ?) AS user_vote
  FROM cases c
  JOIN categories cat ON cat.id = c.category
  JOIN users u ON u.id = c.user_id
`;

export function listCases({ q = '', category = '', status = '', brand = '', model = '', engine = '', dtc = '', since = '', sort = 'relevancia', limit = 20, offset = 0, userId = null } = {}) {
  const clauses = ['c.is_hidden = 0'];
  const params = [userId || 0];
  if (category) { clauses.push('c.category = ?'); params.push(category); }
  if (status) { clauses.push('c.status = ?'); params.push(status); }
  if (brand) { clauses.push('c.vehicle_brand LIKE ?'); params.push(`%${brand}%`); }
  if (model) { clauses.push('c.vehicle_model LIKE ?'); params.push(`%${model}%`); }
  if (engine) { clauses.push('c.engine LIKE ?'); params.push(`%${engine}%`); }
  if (dtc) { clauses.push('c.dtcs LIKE ?'); params.push(`%${String(dtc).toUpperCase()}%`); }
  if (since) { clauses.push('c.updated_at >= ?'); params.push(since); }
  const term = cleanText(q, 160);
  if (term) {
    for (const token of fold(term).split(/\s+/).filter(Boolean).slice(0, 8)) {
      clauses.push('c.search_text LIKE ?');
      params.push(`%${token}%`);
    }
  }
  const where = clauses.join(' AND ');
  const total = Number(db.prepare(`SELECT COUNT(*) AS n FROM cases c WHERE ${where}`).get(...params.slice(1)).n);
  let rows = db.prepare(`${CASE_SELECT} WHERE ${where} ORDER BY c.updated_at DESC LIMIT 500`).all(...params);
  const tokens = fold(term).split(/\s+/).filter(t => t.length > 2);
  if (sort === 'relevancia' && tokens.length) {
    rows = rows.map(row => ({ row, score: caseScore(row, tokens) }))
      .sort((a, b) => b.score - a.score || b.row.updated_at.localeCompare(a.row.updated_at))
      .map(x => x.row);
  } else if (sort === 'votos') {
    rows.sort((a, b) => Number(b.score) - Number(a.score));
  } else if (sort === 'respuestas') {
    rows.sort((a, b) => Number(b.replies_count) - Number(a.replies_count));
  }
  const lim = toInt(limit, 20, 1, 50);
  const off = toInt(offset, 0, 0, 5000);
  return {
    total,
    limit: lim,
    offset: off,
    cases: rows.slice(off, off + lim).map(row => mapCaseSummary(row, userId))
  };
}

function attachmentRows(caseId, replyId = null) {
  const rows = replyId === null
    ? db.prepare('SELECT * FROM attachments WHERE case_id = ? AND reply_id IS NULL ORDER BY id').all(caseId)
    : db.prepare('SELECT * FROM attachments WHERE reply_id = ? ORDER BY id').all(replyId);
  return rows.map(a => ({
    id: Number(a.id),
    name: a.original_name,
    mime: a.mime,
    size: Number(a.size),
    sha256: a.sha256,
    url: `/api/forum/attachments/${Number(a.id)}`
  }));
}

export function getCaseDetail(id, userId = null, isModerator = false) {
  const row = db.prepare(`${CASE_SELECT} WHERE c.id = ?`).get(userId || 0, id);
  if (!row || (row.is_hidden && !isModerator)) return null;
  db.prepare('UPDATE cases SET views = views + 1 WHERE id = ?').run(id);
  const replyParams = [userId || 0, userId || 0, id];
  let replyVisibility = 'AND r.is_hidden = 0';
  if (!isModerator && userId) {
    replyVisibility = 'AND (r.is_hidden = 0 OR r.user_id = ?)';
    replyParams.push(userId);
  }
  const replies = db.prepare(`
    SELECT r.*, u.username, u.display_name, u.role AS author_role, u.reputation AS author_reputation,
      u.avatar_color,
      (SELECT COALESCE(SUM(v.value), 0) FROM votes v WHERE v.target_type = 'reply' AND v.target_id = r.id) AS score,
      (SELECT ROUND(AVG(rt.value), 1) FROM ratings rt WHERE rt.reply_id = r.id) AS rating_avg,
      (SELECT COUNT(*) FROM ratings rt WHERE rt.reply_id = r.id) AS rating_count,
      (SELECT v.value FROM votes v WHERE v.target_type = 'reply' AND v.target_id = r.id AND v.user_id = ?) AS user_vote,
      (SELECT rt.value FROM ratings rt WHERE rt.reply_id = r.id AND rt.user_id = ?) AS user_rating
    FROM replies r JOIN users u ON u.id = r.user_id
    WHERE r.case_id = ? ${replyVisibility}
    ORDER BY r.created_at ASC
  `).all(...replyParams).map(r => ({
    id: Number(r.id),
    parentId: r.parent_id ? Number(r.parent_id) : null,
    body: r.body,
    author: {
      username: r.username,
      displayName: r.display_name,
      role: r.author_role,
      reputation: Number(r.author_reputation || 0),
      avatarColor: r.avatar_color
    },
    proposal: Boolean(r.is_solution_proposal),
    verified: Boolean(r.is_verified_solution),
    verificationNotes: r.verification_notes,
    verifiedAt: r.verified_at,
    hidden: Boolean(r.is_hidden),
    votes: Number(r.score || 0),
    userVote: Number(r.user_vote || 0),
    rating: r.rating_avg === null ? null : Number(r.rating_avg),
    ratingCount: Number(r.rating_count || 0),
    userRating: r.user_rating === null ? null : Number(r.user_rating),
    attachments: attachmentRows(id, Number(r.id)),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
  const history = db.prepare(`
    SELECT h.action, h.detail, h.created_at, u.username, u.display_name
    FROM case_history h LEFT JOIN users u ON u.id = h.user_id
    WHERE h.case_id = ? ORDER BY h.id DESC LIMIT 80
  `).all(id).map(h => ({
    action: h.action,
    detail: h.detail,
    createdAt: h.created_at,
    username: h.username || 'sistema',
    displayName: h.display_name || 'Sistema'
  }));
  const result = mapCaseSummary(row, userId);
  result.conditions = row.conditions;
  result.measurements = row.measurements;
  result.tests = row.tests;
  result.repairs = row.repairs;
  result.result = row.result;
  result.hidden = Boolean(row.is_hidden);
  result.hiddenReason = row.hidden_reason;
  result.attachmentsList = attachmentRows(id);
  result.repliesList = replies;
  result.history = history;
  result.canEdit = Boolean(userId && (userId === Number(row.user_id) || isModerator));
  result.isModerator = Boolean(isModerator);
  return result;
}

function normalizeDtcs(input) {
  const raw = Array.isArray(input) ? input : String(input || '').split(/[\s,;]+/);
  const unique = [...new Set(raw.map(v => cleanText(v, 8).toUpperCase()).filter(v => /^[PBCU][0-9A-F]{4}$/.test(v)))];
  if (unique.length > 30) throw Object.assign(new Error('Máximo 30 códigos DTC.'), { status: 400 });
  return unique;
}

function buildSearchText(data) {
  return fold([
    data.title, data.body, data.vehicleBrand, data.vehicleModel, data.vehicleYear,
    data.engine, data.engineCode, data.mileage, (data.dtcs || []).join(' '),
    data.symptoms, data.conditions, data.measurements, data.tests, data.repairs, data.result
  ].join(' '));
}

function insertAttachments(caseId, replyId, userId, attachments) {
  const stmt = db.prepare(`
    INSERT INTO attachments (case_id, reply_id, user_id, original_name, stored_name, mime, size, sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const a of attachments || []) {
    stmt.run(caseId, replyId, userId, a.originalName, a.storedName, a.mime, a.size, a.sha256, nowISO());
  }
}

export function createCase(userId, data, attachments = []) {
  if (!CATEGORY_IDS.has(data.category)) throw Object.assign(new Error('Categoría no válida.'), { status: 400 });
  const title = cleanText(data.title, 160);
  const body = cleanText(data.body, 8000);
  if (title.length < 8) throw Object.assign(new Error('El título debe tener al menos 8 caracteres.'), { status: 400 });
  if (body.length < 20) throw Object.assign(new Error('Describe el caso con al menos 20 caracteres.'), { status: 400 });
  const dtcs = normalizeDtcs(data.dtcs);
  const clean = {
    title, body,
    category: data.category,
    vehicleBrand: cleanText(data.vehicleBrand, 60),
    vehicleModel: cleanText(data.vehicleModel, 60),
    vehicleYear: cleanText(data.vehicleYear, 20),
    engine: cleanText(data.engine, 100),
    engineCode: cleanText(data.engineCode, 60),
    mileage: cleanText(data.mileage, 30),
    dtcs,
    symptoms: cleanText(data.symptoms, 2000),
    conditions: cleanText(data.conditions, 2000),
    measurements: cleanText(data.measurements, 3000),
    tests: cleanText(data.tests, 3000),
    repairs: cleanText(data.repairs, 3000),
    result: cleanText(data.result, 2000),
    status: 'abierto'
  };
  const searchText = buildSearchText(clean);
  const created = nowISO();
  return transaction(() => {
    const info = db.prepare(`
      INSERT INTO cases (user_id, category, title, body, vehicle_brand, vehicle_model, vehicle_year,
        engine, engine_code, mileage, dtcs, symptoms, conditions, measurements, tests, repairs, result,
        status, search_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, clean.category, title, body, clean.vehicleBrand, clean.vehicleModel, clean.vehicleYear,
      clean.engine, clean.engineCode, clean.mileage, JSON.stringify(dtcs), clean.symptoms, clean.conditions,
      clean.measurements, clean.tests, clean.repairs, clean.result, clean.status, searchText, created, created);
    const id = Number(info.lastInsertRowid);
    const ref = `CASO-${String(id).padStart(5, '0')}`;
    db.prepare('UPDATE cases SET ref = ? WHERE id = ?').run(ref, id);
    insertAttachments(id, null, userId, attachments);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, userId, 'creado', 'Caso publicado en el foro.', created);
    recalcReputation(userId);
    return getCaseDetail(id, userId, false);
  });
}

export function updateCase(userId, caseId, data, isModerator = false) {
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!row || (row.is_hidden && !isModerator)) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  if (Number(row.user_id) !== userId && !isModerator) throw Object.assign(new Error('No tienes permisos para editar este caso.'), { status: 403 });
  if (isBanned(userById(userId))) throw Object.assign(new Error('Cuenta suspendida.'), { status: 403 });
  const fields = [
    ['title', 'title', 160], ['body', 'body', 8000], ['vehicleBrand', 'vehicle_brand', 60],
    ['vehicleModel', 'vehicle_model', 60], ['vehicleYear', 'vehicle_year', 20], ['engine', 'engine', 100],
    ['engineCode', 'engine_code', 60], ['mileage', 'mileage', 30], ['symptoms', 'symptoms', 2000],
    ['conditions', 'conditions', 2000], ['measurements', 'measurements', 3000], ['tests', 'tests', 3000],
    ['repairs', 'repairs', 3000], ['result', 'result', 2000]
  ];
  const updates = [];
  const params = [];
  const changed = [];
  for (const [key, column, max] of fields) {
    if (data[key] === undefined) continue;
    const value = cleanText(data[key], max);
    if (key === 'title' && value.length < 8) throw Object.assign(new Error('El título debe tener al menos 8 caracteres.'), { status: 400 });
    if (key === 'body' && value.length < 20) throw Object.assign(new Error('El cuerpo debe tener al menos 20 caracteres.'), { status: 400 });
    if (String(row[column]) !== value) {
      updates.push(`${column} = ?`);
      params.push(value);
      changed.push(key);
    }
  }
  if (data.dtcs !== undefined) {
    const dtcs = normalizeDtcs(data.dtcs);
    const encoded = JSON.stringify(dtcs);
    if (row.dtcs !== encoded) {
      updates.push('dtcs = ?');
      params.push(encoded);
      changed.push('dtcs');
    }
  }
  if (data.status !== undefined && ['abierto', 'investigacion', 'cerrado'].includes(data.status) && data.status !== row.status) {
    updates.push('status = ?');
    params.push(data.status);
    changed.push('status');
  }
  if (!updates.length) return getCaseDetail(caseId, userId, isModerator);
  const updated = nowISO();
  const next = { ...row };
  for (const [key, column] of fields) {
    if (data[key] !== undefined) next[column] = cleanText(data[key], 8000);
  }
  if (data.dtcs !== undefined) next.dtcs = JSON.stringify(normalizeDtcs(data.dtcs));
  next.status = data.status !== undefined && ['abierto', 'investigacion', 'cerrado'].includes(data.status) ? data.status : row.status;
  updates.push('search_text = ?', 'updated_at = ?');
  params.push(buildSearchText({
    title: next.title, body: next.body, vehicleBrand: next.vehicle_brand, vehicleModel: next.vehicle_model,
    vehicleYear: next.vehicle_year, engine: next.engine, engineCode: next.engine_code, mileage: next.mileage,
    dtcs: JSON.parse(next.dtcs || '[]'), symptoms: next.symptoms, conditions: next.conditions,
    measurements: next.measurements, tests: next.tests, repairs: next.repairs, result: next.result
  }), updated);
  params.push(caseId);
  transaction(() => {
    db.prepare(`UPDATE cases SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, 'editado', `Campos actualizados: ${changed.join(', ')}.`, updated);
  });
  return getCaseDetail(caseId, userId, isModerator);
}

function recalcCaseReputation(caseId) {
  const row = db.prepare('SELECT user_id FROM cases WHERE id = ?').get(caseId);
  if (!row) return;
  const authors = new Set([Number(row.user_id)]);
  for (const r of db.prepare('SELECT DISTINCT user_id FROM replies WHERE case_id = ?').all(caseId)) authors.add(Number(r.user_id));
  for (const id of authors) recalcReputation(id);
}

export function hideCase(userId, caseId, hidden, reason = '', isModerator = false) {
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!row) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  if (Number(row.user_id) !== userId && !isModerator) throw Object.assign(new Error('Sin permisos.'), { status: 403 });
  const detail = cleanText(reason, 300);
  transaction(() => {
    db.prepare('UPDATE cases SET is_hidden = ?, hidden_reason = ?, updated_at = ? WHERE id = ?')
      .run(hidden ? 1 : 0, detail, nowISO(), caseId);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, hidden ? 'ocultado' : 'restaurado', detail, nowISO());
    recalcCaseReputation(caseId);
  });
  return { ok: true, hidden: Boolean(hidden) };
}

export function createReply(userId, caseId, data, attachments = []) {
  const row = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!row || row.is_hidden) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  if (row.status === 'cerrado') throw Object.assign(new Error('El caso está cerrado; un moderador debe reabrirlo.'), { status: 409 });
  const body = cleanText(data.body, 6000);
  if (body.length < 2) throw Object.assign(new Error('La respuesta está vacía.'), { status: 400 });
  let parentId = data.parentId === undefined || data.parentId === null ? null : toInt(data.parentId, 0);
  if (parentId) {
    const parent = db.prepare('SELECT id FROM replies WHERE id = ? AND case_id = ? AND is_hidden = 0').get(parentId, caseId);
    if (!parent) throw Object.assign(new Error('La respuesta padre no pertenece a este caso.'), { status: 400 });
  }
  const proposal = Boolean(data.proposal);
  const created = nowISO();
  return transaction(() => {
    const info = db.prepare(`
      INSERT INTO replies (case_id, user_id, parent_id, body, is_solution_proposal, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(caseId, userId, parentId, body, proposal ? 1 : 0, created, created);
    const replyId = Number(info.lastInsertRowid);
    insertAttachments(caseId, replyId, userId, attachments);
    db.prepare('UPDATE cases SET updated_at = ? WHERE id = ?').run(created, caseId);
    if (proposal && row.status !== 'solucion_verificada') {
      db.prepare("UPDATE cases SET status = 'solucion_propuesta' WHERE id = ?").run(caseId);
    }
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, 'respuesta', proposal ? 'Solución propuesta.' : 'Nueva respuesta técnica.', created);
    recalcReputation(userId);
    return getCaseDetail(caseId, userId, false);
  });
}

function revokeSolutionIfHidden(row, userId, reason) {
  if (!row.is_verified_solution) return;
  const now = nowISO();
  const otherProposals = Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE case_id = ? AND id != ? AND is_solution_proposal = 1 AND is_hidden = 0').get(row.case_id, row.id).n);
  db.prepare("UPDATE replies SET is_verified_solution = 0, verification_notes = '', verified_by = NULL, verified_at = NULL WHERE id = ?").run(row.id);
  db.prepare('UPDATE cases SET status = ?, solution_reply_id = NULL, updated_at = ? WHERE id = ?')
    .run(otherProposals ? 'solucion_propuesta' : 'abierto', now, row.case_id);
  db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(row.case_id, userId, 'solucion_revocada', cleanText(reason || 'La solución verificada se ocultó y su verificación se retiró.', 300), now);
  recalcReputation(row.user_id);
}

export function hideReply(userId, replyId, hidden, reason = '', isModerator = false) {
  const row = db.prepare('SELECT * FROM replies WHERE id = ?').get(replyId);
  if (!row) throw Object.assign(new Error('Respuesta no encontrada'), { status: 404 });
  if (Number(row.user_id) !== userId && !isModerator) throw Object.assign(new Error('Sin permisos.'), { status: 403 });
  const detail = cleanText(reason, 300);
  transaction(() => {
    db.prepare('UPDATE replies SET is_hidden = ?, hidden_reason = ?, updated_at = ? WHERE id = ?')
      .run(hidden ? 1 : 0, detail, nowISO(), replyId);
    if (hidden) revokeSolutionIfHidden(row, userId, detail);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(row.case_id, userId, hidden ? 'respuesta_oculta' : 'respuesta_restaurada', detail, nowISO());
    recalcReputation(row.user_id);
  });
  return { ok: true, hidden: Boolean(hidden) };
}

export function markReplyProposal(userId, replyId, proposal = true) {
  const row = db.prepare('SELECT * FROM replies WHERE id = ? AND is_hidden = 0').get(replyId);
  if (!row) throw Object.assign(new Error('Respuesta no encontrada'), { status: 404 });
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(row.case_id);
  if (!c || c.is_hidden) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  const canEdit = Number(row.user_id) === userId || ['admin', 'moderator'].includes(userById(userId).role);
  if (!canEdit) throw Object.assign(new Error('No puedes marcar esta respuesta.'), { status: 403 });
  if (row.is_verified_solution && !proposal) throw Object.assign(new Error('Una solución verificada no puede convertirse en propuesta.'), { status: 409 });
  const value = proposal ? 1 : 0;
  const created = nowISO();
  db.prepare('UPDATE replies SET is_solution_proposal = ?, updated_at = ? WHERE id = ?').run(value, created, replyId);
  if (value && c.status !== 'solucion_verificada') {
    db.prepare("UPDATE cases SET status = 'solucion_propuesta', updated_at = ? WHERE id = ?").run(created, c.id);
  }
  db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(c.id, userId, value ? 'propuesta' : 'propuesta_retirada', value ? 'Respuesta marcada como propuesta de solución.' : 'Propuesta retirada.', created);
  return getCaseDetail(c.id, userId, ['admin', 'moderator'].includes(userById(userId).role));
}

export function verifySolution(userId, caseId, replyId, notes = '') {
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!c || c.is_hidden) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  const r = db.prepare('SELECT * FROM replies WHERE id = ? AND case_id = ? AND is_hidden = 0').get(replyId, caseId);
  if (!r) throw Object.assign(new Error('La respuesta no pertenece a este caso.'), { status: 400 });
  const verificationNotes = cleanText(notes, 1000);
  const created = nowISO();
  transaction(() => {
    db.prepare('UPDATE replies SET is_verified_solution = 0 WHERE case_id = ?').run(caseId);
    db.prepare(`UPDATE replies SET is_verified_solution = 1, verification_notes = ?, verified_by = ?, verified_at = ? WHERE id = ?`)
      .run(verificationNotes, userId, created, replyId);
    db.prepare("UPDATE cases SET status = 'solucion_verificada', solution_reply_id = ?, updated_at = ? WHERE id = ?")
      .run(replyId, created, caseId);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, 'solucion_verificada', verificationNotes || 'Solución verificada por moderación.', created);
    recalcReputation(r.user_id);
  });
  return getCaseDetail(caseId, userId, true);
}

export function unverifySolution(userId, caseId) {
  const c = db.prepare('SELECT * FROM cases WHERE id = ?').get(caseId);
  if (!c) throw Object.assign(new Error('Caso no encontrado'), { status: 404 });
  const previous = c.solution_reply_id ? db.prepare('SELECT user_id FROM replies WHERE id = ?').get(c.solution_reply_id) : null;
  transaction(() => {
    db.prepare('UPDATE replies SET is_verified_solution = 0, verification_notes = \'\', verified_by = NULL, verified_at = NULL WHERE case_id = ?').run(caseId);
    db.prepare("UPDATE cases SET status = 'solucion_propuesta', solution_reply_id = NULL, updated_at = ? WHERE id = ?").run(nowISO(), caseId);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, 'solucion_revocada', 'La verificación de la solución se ha retirado.', nowISO());
    if (previous) recalcReputation(previous.user_id);
  });
  return getCaseDetail(caseId, userId, true);
}

export function recalcReputation(userId) {
  const cases = Number(db.prepare('SELECT COUNT(*) AS n FROM cases WHERE user_id = ? AND is_hidden = 0').get(userId).n);
  const replies = Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE user_id = ? AND is_hidden = 0').get(userId).n);
  const caseVotes = Number(db.prepare(`
    SELECT COALESCE(SUM(v.value), 0) AS n FROM votes v
    JOIN cases c ON c.id = v.target_id AND c.is_hidden = 0
    WHERE v.target_type = 'case' AND c.user_id = ?
  `).get(userId).n);
  const replyVotes = Number(db.prepare(`
    SELECT COALESCE(SUM(v.value), 0) AS n FROM votes v
    JOIN replies r ON r.id = v.target_id AND r.is_hidden = 0
    JOIN cases c ON c.id = r.case_id AND c.is_hidden = 0
    WHERE v.target_type = 'reply' AND r.user_id = ?
  `).get(userId).n);
  const solutions = Number(db.prepare(`
    SELECT COUNT(*) AS n FROM replies r JOIN cases c ON c.id = r.case_id
    WHERE r.user_id = ? AND r.is_verified_solution = 1 AND r.is_hidden = 0 AND c.is_hidden = 0
  `).get(userId).n);
  const reputation = Math.max(0, cases * 2 + replies * 3 + caseVotes * 2 + replyVotes + solutions * 5);
  db.prepare('UPDATE users SET reputation = ? WHERE id = ?').run(reputation, userId);
  return reputation;
}

export function vote(userId, targetType, targetId, value) {
  if (!['case', 'reply'].includes(targetType)) throw Object.assign(new Error('Tipo de voto no válido.'), { status: 400 });
  const v = Number(value);
  if (![-1, 1].includes(v)) throw Object.assign(new Error('Voto no válido.'), { status: 400 });
  const table = targetType === 'case' ? 'cases' : 'replies';
  const target = targetType === 'case'
    ? db.prepare('SELECT * FROM cases WHERE id = ?').get(targetId)
    : db.prepare(`SELECT r.*, c.is_hidden AS case_hidden FROM replies r JOIN cases c ON c.id = r.case_id WHERE r.id = ?`).get(targetId);
  if (!target || target.is_hidden || target.case_hidden) throw Object.assign(new Error('Contenido no encontrado'), { status: 404 });
  if (Number(target.user_id) === userId) throw Object.assign(new Error('No puedes votar tu propio contenido.'), { status: 400 });
  const existing = db.prepare('SELECT value FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(userId, targetType, targetId);
  transaction(() => {
    if (existing && Number(existing.value) === v) {
      db.prepare('DELETE FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?').run(userId, targetType, targetId);
    } else {
      db.prepare(`
        INSERT INTO votes (user_id, target_type, target_id, value, created_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, target_type, target_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at
      `).run(userId, targetType, targetId, v, nowISO());
    }
    recalcReputation(target.user_id);
  });
  const score = Number(db.prepare('SELECT COALESCE(SUM(value), 0) AS n FROM votes WHERE target_type = ? AND target_id = ?').get(targetType, targetId).n);
  const current = db.prepare('SELECT value FROM votes WHERE user_id = ? AND target_type = ? AND target_id = ?').get(userId, targetType, targetId);
  return { score, userVote: current ? Number(current.value) : 0 };
}

export function rateReply(userId, replyId, value) {
  const v = Number(value);
  if (!Number.isInteger(v) || v < 1 || v > 5) throw Object.assign(new Error('La valoración debe estar entre 1 y 5.'), { status: 400 });
  const reply = db.prepare(`
    SELECT r.* FROM replies r JOIN cases c ON c.id = r.case_id
    WHERE r.id = ? AND r.is_hidden = 0 AND c.is_hidden = 0
  `).get(replyId);
  if (!reply) throw Object.assign(new Error('Respuesta no encontrada'), { status: 404 });
  if (Number(reply.user_id) === userId) throw Object.assign(new Error('No puedes valorar tu propia respuesta.'), { status: 400 });
  db.prepare(`
    INSERT INTO ratings (user_id, reply_id, value, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, reply_id) DO UPDATE SET value = excluded.value, created_at = excluded.created_at
  `).run(userId, replyId, v, nowISO());
  recalcReputation(reply.user_id);
  const stats = db.prepare('SELECT ROUND(AVG(value), 1) AS avg, COUNT(*) AS count FROM ratings WHERE reply_id = ?').get(replyId);
  return { rating: Number(stats.avg), count: Number(stats.count), userRating: v };
}

export function reportContent(userId, targetType, targetId, reason, detail = '') {
  if (!['case', 'reply'].includes(targetType)) throw Object.assign(new Error('Tipo de denuncia no válido.'), { status: 400 });
  const table = targetType === 'case' ? 'cases' : 'replies';
  const target = targetType === 'case'
    ? db.prepare('SELECT * FROM cases WHERE id = ?').get(targetId)
    : db.prepare('SELECT r.*, c.is_hidden AS case_hidden FROM replies r JOIN cases c ON c.id = r.case_id WHERE r.id = ?').get(targetId);
  if (!target || target.is_hidden || target.case_hidden) throw Object.assign(new Error('Contenido no encontrado'), { status: 404 });
  if (Number(target.user_id) === userId) throw Object.assign(new Error('No puedes denunciar tu propio contenido.'), { status: 400 });
  const dup = db.prepare('SELECT id FROM reports WHERE user_id = ? AND target_type = ? AND target_id = ? AND status = \'pendiente\'').get(userId, targetType, targetId);
  if (dup) throw Object.assign(new Error('Ya has denunciado este contenido.'), { status: 409 });
  const created = nowISO();
  const info = db.prepare(`
    INSERT INTO reports (target_type, target_id, user_id, reason, detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(targetType, targetId, userId, cleanText(reason, 120), cleanText(detail, 1000), created);
  const pending = Number(db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM reports WHERE target_type = ? AND target_id = ? AND status = \'pendiente\'').get(targetType, targetId).n);
  if (pending >= 5 && !target.is_hidden) {
    const autoReason = 'Oculto automáticamente tras 5 denuncias pendientes.';
    db.prepare(`UPDATE ${table} SET is_hidden = 1, hidden_reason = ? WHERE id = ?`).run(autoReason, targetId);
    const caseId = targetType === 'case' ? targetId : target.case_id;
    if (targetType === 'reply') revokeSolutionIfHidden(target, userId, autoReason);
    db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(caseId, userId, 'oculto_automatico', autoReason, created);
    if (targetType === 'case') recalcCaseReputation(caseId);
    else recalcReputation(target.user_id);
  }
  return { ok: true, id: Number(info.lastInsertRowid), reports: pending };
}

export function listReports(status = 'pendiente') {
  const rows = db.prepare(`
    SELECT rp.*, u.username AS reporter, u.display_name AS reporter_name,
      CASE WHEN rp.target_type = 'case' THEN (SELECT title FROM cases WHERE id = rp.target_id)
           ELSE (SELECT body FROM replies WHERE id = rp.target_id) END AS preview,
      CASE WHEN rp.target_type = 'case' THEN (SELECT is_hidden FROM cases WHERE id = rp.target_id)
           ELSE (SELECT is_hidden FROM replies WHERE id = rp.target_id) END AS target_hidden
    FROM reports rp JOIN users u ON u.id = rp.user_id
    WHERE (? = '' OR rp.status = ?)
    ORDER BY rp.created_at DESC LIMIT 200
  `).all(status || '', status || '');
  return rows.map(r => ({
    id: Number(r.id),
    targetType: r.target_type,
    targetId: Number(r.target_id),
    reason: r.reason,
    detail: r.detail,
    status: r.status,
    createdAt: r.created_at,
    reporter: r.reporter,
    reporterName: r.reporter_name,
    preview: String(r.preview || '').slice(0, 300),
    hidden: Boolean(r.target_hidden)
  }));
}

export function resolveReport(modId, reportId, action) {
  const rp = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  if (!rp) throw Object.assign(new Error('Denuncia no encontrada'), { status: 404 });
  const allowed = ['resuelta', 'descartada'];
  const status = allowed.includes(action) ? action : 'resuelta';
  db.prepare('UPDATE reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .run(status, modId, nowISO(), reportId);
  return { ok: true, status };
}

export function addHistory(caseId, userId, action, detail) {
  db.prepare('INSERT INTO case_history (case_id, user_id, action, detail, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(caseId, userId, cleanText(action, 40), cleanText(detail, 500), nowISO());
}

export function banUser(modId, targetUserId, days = 7, reason = '') {
  const target = ensureBannable(targetUserId);
  if (target.role === 'admin' && Number(target.id) !== Number(modId)) {
    throw Object.assign(new Error('No se puede suspender a otro administrador.'), { status: 403 });
  }
  const until = days === 0 ? null : new Date(Date.now() + Math.max(1, Math.min(365, Number(days) || 7)) * 86400000).toISOString();
  db.prepare('UPDATE users SET banned_until = ? WHERE id = ?').run(until, targetUserId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(targetUserId);
  return { ok: true, bannedUntil: until, reason: cleanText(reason, 300) };
}

export function setUserRole(modId, targetUserId, role) {
  const target = ensureBannable(targetUserId);
  if (!['user', 'moderator', 'admin'].includes(role)) throw Object.assign(new Error('Rol no válido.'), { status: 400 });
  if (Number(target.id) === Number(modId) && role !== 'admin') {
    throw Object.assign(new Error('No puedes quitarte el rol de administrador.'), { status: 400 });
  }
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, targetUserId);
  return { ok: true, role };
}

export function getProfile(username, viewerId = null) {
  const user = userByUsername(cleanText(username, 24));
  if (!user) return null;
  const cases = Number(db.prepare('SELECT COUNT(*) AS n FROM cases WHERE user_id = ? AND is_hidden = 0').get(user.id).n);
  const replies = Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE user_id = ? AND is_hidden = 0').get(user.id).n);
  const solutions = Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE user_id = ? AND is_verified_solution = 1').get(user.id).n);
  const helpful = Number(db.prepare(`
    SELECT COALESCE(SUM(v.value), 0) AS n FROM votes v JOIN replies r ON r.id = v.target_id
    WHERE v.target_type = 'reply' AND r.user_id = ? AND v.value > 0
  `).get(user.id).n);
  const recent = db.prepare(`
    SELECT c.id, c.ref, c.title, c.status, c.category, c.updated_at
    FROM cases c WHERE c.user_id = ? AND c.is_hidden = 0 ORDER BY c.updated_at DESC LIMIT 10
  `).all(user.id).map(c => ({
    id: Number(c.id), ref: c.ref, title: c.title, status: c.status, category: c.category, updatedAt: c.updated_at
  }));
  return {
    user: publicUser(user),
    stats: { cases, replies, solutions, helpful },
    recentCases: recent,
    isSelf: viewerId !== null && Number(viewerId) === Number(user.id),
    permissions: { canModerate: viewerId !== null && ['admin', 'moderator'].includes((userById(viewerId) || {}).role) }
  };
}

function dmPair(a, b) {
  const low = Math.min(Number(a), Number(b));
  const high = Math.max(Number(a), Number(b));
  return [low, high];
}

export function sendMessage(senderId, { to, threadId, body }) {
  const text = cleanText(body, 4000);
  if (text.length < 1) throw Object.assign(new Error('El mensaje está vacío.'), { status: 400 });
  let thread;
  if (threadId) {
    thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
    if (!thread || ![thread.user_low, thread.user_high].map(Number).includes(Number(senderId))) {
      throw Object.assign(new Error('Conversación no encontrada'), { status: 404 });
    }
  } else {
    const recipient = userByUsername(cleanText(to, 24));
    if (!recipient) throw Object.assign(new Error('Destinatario no encontrado'), { status: 404 });
    if (Number(recipient.id) === Number(senderId)) throw Object.assign(new Error('No puedes enviarte un privado a ti mismo.'), { status: 400 });
    const [low, high] = dmPair(senderId, recipient.id);
    thread = db.prepare('SELECT * FROM dm_threads WHERE user_low = ? AND user_high = ?').get(low, high);
    if (!thread) {
      const created = nowISO();
      const info = db.prepare('INSERT INTO dm_threads (user_low, user_high, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run(low, high, created, created);
      thread = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(Number(info.lastInsertRowid));
    }
  }
  const created = nowISO();
  const info = db.prepare('INSERT INTO dm_messages (thread_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
    .run(thread.id, senderId, text, created);
  db.prepare('UPDATE dm_threads SET updated_at = ? WHERE id = ?').run(created, thread.id);
  return { ok: true, threadId: Number(thread.id), messageId: Number(info.lastInsertRowid) };
}

export function listMessages(userId) {
  const rows = db.prepare(`
    SELECT t.*, 
      CASE WHEN t.user_low = ? THEN t.user_high ELSE t.user_low END AS other_id,
      (SELECT body FROM dm_messages m WHERE m.thread_id = t.id ORDER BY m.id DESC LIMIT 1) AS last_body,
      (SELECT COUNT(*) FROM dm_messages m WHERE m.thread_id = t.id AND m.sender_id != ? AND m.read_at IS NULL) AS unread
    FROM dm_threads t
    WHERE t.user_low = ? OR t.user_high = ?
    ORDER BY t.updated_at DESC
  `).all(userId, userId, userId, userId);
  const otherStmt = db.prepare('SELECT username, display_name, avatar_color, role FROM users WHERE id = ?');
  return rows.map(t => {
    const other = otherStmt.get(t.other_id);
    return {
      id: Number(t.id),
      with: { username: other.username, displayName: other.display_name, avatarColor: other.avatar_color, role: other.role },
      lastMessage: t.last_body,
      unread: Number(t.unread),
      updatedAt: t.updated_at
    };
  });
}

export function getThread(userId, threadId) {
  const t = db.prepare('SELECT * FROM dm_threads WHERE id = ?').get(threadId);
  if (!t || ![t.user_low, t.user_high].map(Number).includes(Number(userId))) {
    throw Object.assign(new Error('Conversación no encontrada'), { status: 404 });
  }
  const otherId = Number(t.user_low) === Number(userId) ? Number(t.user_high) : Number(t.user_low);
  const other = userById(otherId);
  const messages = db.prepare(`
    SELECT m.*, u.username, u.display_name, u.avatar_color
    FROM dm_messages m JOIN users u ON u.id = m.sender_id
    WHERE m.thread_id = ? ORDER BY m.id ASC
  `).all(threadId).map(m => ({
    id: Number(m.id),
    body: m.body,
    mine: Number(m.sender_id) === Number(userId),
    sender: { username: m.username, displayName: m.display_name, avatarColor: m.avatar_color },
    readAt: m.read_at,
    createdAt: m.created_at
  }));
  db.prepare('UPDATE dm_messages SET read_at = ? WHERE thread_id = ? AND sender_id != ? AND read_at IS NULL')
    .run(nowISO(), threadId, userId);
  return {
    id: Number(t.id),
    with: publicUser(other),
    messages,
    updatedAt: t.updated_at
  };
}

export function forumStats() {
  const cases = Number(db.prepare('SELECT COUNT(*) AS n FROM cases WHERE is_hidden = 0').get().n);
  const solved = Number(db.prepare("SELECT COUNT(*) AS n FROM cases WHERE is_hidden = 0 AND status = 'solucion_verificada'").get().n);
  const users = Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
  const replies = Number(db.prepare('SELECT COUNT(*) AS n FROM replies WHERE is_hidden = 0').get().n);
  return { cases, solved, users, replies };
}

export function findKnowledgeCases({ text = '', dtcs = [], vehicle = {}, limit = 5 } = {}) {
  const tokens = fold(text).split(/\s+/).filter(t => t.length > 2).slice(0, 12);
  const codes = (Array.isArray(dtcs) ? dtcs : []).map(c => String(c).toUpperCase()).filter(c => /^[PBCU][0-9A-F]{4}$/.test(c));
  const brand = fold(vehicle.brand || '');
  const model = fold(vehicle.model || '');
  const rows = db.prepare(`
    SELECT c.*, u.username, u.display_name, u.reputation,
      (SELECT body FROM replies r WHERE r.id = c.solution_reply_id AND r.is_hidden = 0) AS solution_body
    FROM cases c JOIN users u ON u.id = c.user_id
    WHERE c.is_hidden = 0
    ORDER BY c.updated_at DESC LIMIT 1000
  `).all();
  const scored = [];
  for (const row of rows) {
    let caseDtcs = [];
    try { caseDtcs = JSON.parse(row.dtcs || '[]'); } catch { caseDtcs = []; }
    let score = 0;
    for (const code of codes) if (caseDtcs.includes(code)) score += 30;
    if (brand && fold(row.vehicle_brand).includes(brand)) score += 10;
    if (model && fold(row.vehicle_model).includes(model)) score += 10;
    const haystack = row.search_text || '';
    for (const token of tokens) if (haystack.includes(token)) score += token.length > 4 ? 4 : 2;
    if (row.status === 'solucion_verificada') score += 12;
    else if (row.status === 'solucion_propuesta') score += 5;
    if (score < 8) continue;
    const confidence = score >= 45 ? 'alta' : score >= 22 ? 'media' : 'baja';
    scored.push({
      id: Number(row.id),
      ref: row.ref,
      title: row.title,
      category: row.category,
      status: row.status,
      vehicle: [row.vehicle_brand, row.vehicle_model, row.vehicle_year, row.engine].filter(Boolean).join(' '),
      dtcs: caseDtcs,
      symptoms: row.symptoms,
      solution: row.solution_body || '',
      author: row.display_name || row.username,
      score,
      confidence
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, toInt(limit, 5, 1, 10));
}

export function saveAttachments(userId, items) {
  if (!Array.isArray(items) || !items.length) return [];
  if (items.length > 4) throw Object.assign(new Error('Máximo 4 archivos por publicación.'), { status: 400 });
  const allowed = {
    'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
    'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
    'image/webp': { ext: 'webp', magic: null },
    'image/gif': { ext: 'gif', magic: [0x47, 0x49, 0x46, 0x38] },
    'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }
  };
  const prepared = [];
  for (const item of items) {
    const dataUrl = String(item?.data || '');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif)|application\/pdf);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) throw Object.assign(new Error('Formato de archivo no permitido. Usa JPG, PNG, WebP, GIF o PDF.'), { status: 400 });
    const mime = match[1];
    const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buffer.length || buffer.length > 2 * 1024 * 1024) {
      throw Object.assign(new Error('Cada archivo debe pesar menos de 2 MB.'), { status: 413 });
    }
    const rule = allowed[mime];
    if (rule.magic && !rule.magic.every((byte, i) => buffer[i] === byte)) {
      throw Object.assign(new Error('El contenido del archivo no coincide con su formato.'), { status: 400 });
    }
    if (mime === 'image/webp' && !(buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')) {
      throw Object.assign(new Error('El archivo WebP no es válido.'), { status: 400 });
    }
    const originalName = cleanText(item.name || `archivo.${rule.ext}`, 120).replace(/[^\w.\- ()áéíóúÁÉÍÓÚñÑ]/g, '_');
    const storedName = `${crypto.randomUUID()}.${rule.ext}`;
    prepared.push({ buffer, mime, originalName, storedName, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') });
  }
  for (const p of prepared) fs.writeFileSync(path.join(UPLOAD_DIR, p.storedName), p.buffer);
  return prepared;
}

export function discardAttachments(prepared = []) {
  for (const item of prepared || []) {
    try { fs.unlinkSync(path.join(UPLOAD_DIR, path.basename(item.storedName))); } catch {}
  }
}

export function getAttachment(id) {
  const row = db.prepare(`
    SELECT a.*, c.is_hidden, COALESCE(r.is_hidden, 0) AS reply_hidden
    FROM attachments a
    JOIN cases c ON c.id = a.case_id
    LEFT JOIN replies r ON r.id = a.reply_id
    WHERE a.id = ?
  `).get(id);
  if (!row || row.is_hidden || row.reply_hidden) return null;
  const filePath = path.join(UPLOAD_DIR, path.basename(row.stored_name));
  if (!fs.existsSync(filePath)) return null;
  return {
    path: filePath,
    name: row.original_name,
    mime: row.mime,
    size: Number(row.size),
    sha256: row.sha256
  };
}

export function isDuplicateRecent(userId, body, windowMinutes = 10) {
  const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
  const text = cleanText(body, 6000);
  const inCases = db.prepare('SELECT id FROM cases WHERE user_id = ? AND body = ? AND created_at > ? LIMIT 1').get(userId, text, since);
  const inReplies = db.prepare('SELECT id FROM replies WHERE user_id = ? AND body = ? AND created_at > ? LIMIT 1').get(userId, text, since);
  return Boolean(inCases || inReplies);
}

export function seedDemoData() {
  return forumStats();
}
