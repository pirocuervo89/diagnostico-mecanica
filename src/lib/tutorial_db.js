import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_DIR = path.join(ROOT, 'data');
const CATEGORIES_PATH = path.resolve(process.env.TUTORIAL_CATEGORIES_PATH || path.join(DATA_DIR, 'tutorial-categories.json'));
const SEED_PATH = path.resolve(process.env.TUTORIAL_SEED_PATH || path.join(DATA_DIR, 'tutorials-seed.json'));
const DB_PATH = path.resolve(process.env.TUTORIAL_DB_PATH || (
  process.env.FORUM_DB_PATH
    ? path.join(path.dirname(path.resolve(process.env.FORUM_DB_PATH)), 'tutorials.sqlite')
    : path.join(DATA_DIR, 'tutorials.sqlite')
));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const tutorialsDb = new DatabaseSync(DB_PATH);

tutorialsDb.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tutorials (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL DEFAULT 'youtube',
    video_id TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    embed_url TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    title_fold TEXT NOT NULL DEFAULT '',
    channel TEXT NOT NULL DEFAULT '',
    channel_fold TEXT NOT NULL DEFAULT '',
    channel_url TEXT NOT NULL DEFAULT '',
    thumbnail TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    duration_seconds INTEGER,
    duration_label TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'und',
    language_label TEXT NOT NULL DEFAULT '',
    level TEXT NOT NULL DEFAULT 'intermedio',
    source_type TEXT NOT NULL DEFAULT 'community',
    category_id TEXT NOT NULL,
    subcategory_id TEXT NOT NULL,
    category_name TEXT NOT NULL DEFAULT '',
    subcategory_name TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    systems TEXT NOT NULL DEFAULT '[]',
    brand TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT '',
    engine_code TEXT NOT NULL DEFAULT '',
    fuel TEXT NOT NULL DEFAULT '',
    year_from INTEGER,
    year_to INTEGER,
    vehicle_type TEXT NOT NULL DEFAULT 'coche',
    dtcs TEXT NOT NULL DEFAULT '[]',
    symptoms TEXT NOT NULL DEFAULT '[]',
    components TEXT NOT NULL DEFAULT '[]',
    tools TEXT NOT NULL DEFAULT '[]',
    free INTEGER NOT NULL DEFAULT 1,
    embeddable INTEGER NOT NULL DEFAULT 1,
    license TEXT NOT NULL DEFAULT '',
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    verification_source TEXT NOT NULL DEFAULT '',
    last_checked_at TEXT,
    published_label TEXT NOT NULL DEFAULT '',
    view_count INTEGER,
    local_views INTEGER NOT NULL DEFAULT 0,
    risk_level TEXT NOT NULL DEFAULT 'bajo',
    warnings TEXT NOT NULL DEFAULT '[]',
    market TEXT,
    search_text TEXT NOT NULL DEFAULT '',
    is_seed INTEGER NOT NULL DEFAULT 0,
    is_hidden INTEGER NOT NULL DEFAULT 0,
    hidden_reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tutorial_favorites (
    user_id INTEGER NOT NULL,
    tutorial_id TEXT NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, tutorial_id)
  );

  CREATE TABLE IF NOT EXISTS tutorial_history (
    user_id INTEGER NOT NULL,
    tutorial_id TEXT NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
    last_viewed_at TEXT NOT NULL,
    view_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, tutorial_id)
  );

  CREATE TABLE IF NOT EXISTS tutorial_playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tutorial_playlist_items (
    playlist_id INTEGER NOT NULL REFERENCES tutorial_playlists(id) ON DELETE CASCADE,
    tutorial_id TEXT NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    added_at TEXT NOT NULL,
    PRIMARY KEY (playlist_id, tutorial_id)
  );

  CREATE TABLE IF NOT EXISTS tutorial_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tutorial_id TEXT NOT NULL REFERENCES tutorials(id) ON DELETE CASCADE,
    user_id INTEGER,
    reason TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pendiente',
    resolved_by INTEGER,
    resolved_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tutorials_category ON tutorials(category_id, subcategory_id, is_hidden);
  CREATE INDEX IF NOT EXISTS idx_tutorials_brand ON tutorials(brand, model, engine_code);
  CREATE INDEX IF NOT EXISTS idx_tutorials_language ON tutorials(language, level, source_type);
  CREATE INDEX IF NOT EXISTS idx_tutorials_duration ON tutorials(duration_seconds);
  CREATE INDEX IF NOT EXISTS idx_tutorials_views ON tutorials(local_views, view_count);
  CREATE INDEX IF NOT EXISTS idx_tutorials_hidden ON tutorials(is_hidden);
  CREATE INDEX IF NOT EXISTS idx_tutorial_favorites_user ON tutorial_favorites(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_tutorial_history_user ON tutorial_history(user_id, last_viewed_at);
  CREATE INDEX IF NOT EXISTS idx_tutorial_playlists_user ON tutorial_playlists(user_id, updated_at);
  CREATE INDEX IF NOT EXISTS idx_tutorial_reports_status ON tutorial_reports(status, created_at);
`);

const nowISO = () => new Date().toISOString();
const fold = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const cleanText = (value, max = 500) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const escapeLike = value => String(value).replace(/[\\%_]/g, match => `\\${match}`);

function jsonArray(value) {
  if (Array.isArray(value)) return value.map(item => cleanText(item, 120)).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(item => cleanText(item, 120)).filter(Boolean) : [];
    } catch { /* contenido inválido */ }
  }
  return [];
}

function parseJson(value, fallback = []) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeVideo(video, { isSeed = false } = {}) {
  const videoId = cleanText(video.videoId || String(video.id || '').replace(/^yt-/, ''), 40);
  const id = cleanText(video.id || (videoId ? `yt-${videoId}` : ''), 80);
  const title = cleanText(video.title, 240);
  const categoryId = cleanText(video.categoryId || video.category, 80);
  const subcategoryId = cleanText(video.subcategoryId || video.subcategory, 80);
  if (!id || !title || !categoryId || !subcategoryId) {
    throw Object.assign(new Error('Cada tutorial necesita id, title, categoryId y subcategoryId.'), { status: 400 });
  }
  const tags = jsonArray(video.tags);
  const systems = jsonArray(video.systems);
  const dtcs = jsonArray(video.dtcs).map(v => v.toUpperCase());
  const symptoms = jsonArray(video.symptoms);
  const components = jsonArray(video.components);
  const tools = jsonArray(video.tools);
  const warnings = jsonArray(video.warnings);
  const categoryName = cleanText(video.categoryName, 120);
  const subcategoryName = cleanText(video.subcategoryName, 120);
  const titleFold = fold(title);
  const channel = cleanText(video.channel, 120);
  const searchText = fold([
    title, video.description, channel, categoryId, categoryName, subcategoryId, subcategoryName,
    tags.join(' '), systems.join(' '), video.brand, video.model, video.engineCode, video.fuel,
    dtcs.join(' '), symptoms.join(' '), components.join(' '), tools.join(' '),
    video.languageLabel, video.level, video.vehicleType
  ].filter(Boolean).join(' '));
  return {
    id,
    provider: cleanText(video.provider || 'youtube', 40),
    video_id: videoId,
    url: cleanText(video.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''), 500),
    embed_url: cleanText(video.embedUrl || (videoId ? `https://www.youtube.com/embed/${videoId}` : ''), 500),
    title,
    title_fold: titleFold,
    channel,
    channel_fold: fold(channel),
    channel_url: cleanText(video.channelUrl, 500),
    thumbnail: cleanText(video.thumbnail, 500),
    description: cleanText(video.description, 1200),
    duration_seconds: parseNumber(video.durationSeconds),
    duration_label: cleanText(video.durationLabel, 30),
    language: cleanText(video.language || 'und', 12),
    language_label: cleanText(video.languageLabel || 'No determinada', 40),
    level: cleanText(video.level || 'intermedio', 24),
    source_type: cleanText(video.sourceType || 'community', 24),
    category_id: categoryId,
    subcategory_id: subcategoryId,
    category_name: categoryName || categoryId,
    subcategory_name: subcategoryName || subcategoryId,
    tags: JSON.stringify(tags.slice(0, 20)),
    systems: JSON.stringify(systems.slice(0, 12)),
    brand: cleanText(video.brand, 80),
    model: cleanText(video.model, 120),
    engine_code: cleanText(video.engineCode, 80),
    fuel: cleanText(video.fuel, 40),
    year_from: parseNumber(video.yearFrom),
    year_to: parseNumber(video.yearTo),
    vehicle_type: cleanText(video.vehicleType || 'coche', 30),
    dtcs: JSON.stringify(dtcs.slice(0, 12)),
    symptoms: JSON.stringify(symptoms.slice(0, 12)),
    components: JSON.stringify(components.slice(0, 12)),
    tools: JSON.stringify(tools.slice(0, 12)),
    free: video.free === false ? 0 : 1,
    embeddable: video.embeddable === false ? 0 : 1,
    license: cleanText(video.license || 'No especificada', 120),
    verification_status: cleanText(video.verificationStatus || 'pending', 30),
    verification_source: cleanText(video.verificationSource || '', 120),
    last_checked_at: cleanText(video.lastCheckedAt || '', 30) || null,
    published_label: cleanText(video.publishedLabel, 60),
    view_count: parseNumber(video.viewCount),
    risk_level: cleanText(video.riskLevel || 'bajo', 20),
    warnings: JSON.stringify(warnings.slice(0, 8)),
    market: cleanText(video.market, 20) || null,
    search_text: searchText,
    is_seed: isSeed ? 1 : 0,
    created_at: nowISO(),
    updated_at: nowISO()
  };
}

const COLUMNS = [
  'id', 'provider', 'video_id', 'url', 'embed_url', 'title', 'title_fold', 'channel', 'channel_fold',
  'channel_url', 'thumbnail', 'description', 'duration_seconds', 'duration_label', 'language',
  'language_label', 'level', 'source_type', 'category_id', 'subcategory_id', 'category_name',
  'subcategory_name', 'tags', 'systems', 'brand', 'model', 'engine_code', 'fuel', 'year_from', 'year_to',
  'vehicle_type', 'dtcs', 'symptoms', 'components', 'tools', 'free', 'embeddable', 'license',
  'verification_status', 'verification_source', 'last_checked_at', 'published_label', 'view_count',
  'risk_level', 'warnings', 'market', 'search_text', 'is_seed', 'created_at', 'updated_at'
];

const updateColumns = COLUMNS.filter(column => !['id', 'created_at'].includes(column));
const upsertStatement = tutorialsDb.prepare(`
  INSERT INTO tutorials (${COLUMNS.join(', ')})
  VALUES (${COLUMNS.map(() => '?').join(', ')})
  ON CONFLICT(id) DO UPDATE SET
    ${updateColumns.map(column => `${column} = excluded.${column}`).join(', ')},
    created_at = tutorials.created_at
`);

export function upsertTutorial(video, options = {}) {
  const row = normalizeVideo(video, options);
  upsertStatement.run(...COLUMNS.map(column => row[column]));
  return getTutorial(row.id, null, true, { includeRelated: false });
}

function seedKey() {
  try {
    const stat = fs.statSync(SEED_PATH);
    return `${stat.size}:${stat.mtimeMs}`;
  } catch {
    return '';
  }
}

export function importSeedIfNeeded() {
  if (!fs.existsSync(SEED_PATH)) return { imported: 0, skipped: true, reason: 'seed-not-found' };
  const key = seedKey();
  const previous = tutorialsDb.prepare('SELECT value FROM meta WHERE key = ?').get('seed_key')?.value;
  if (previous === key) return { imported: 0, skipped: true, reason: 'unchanged' };
  const raw = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  const videos = Array.isArray(raw) ? raw : (raw.videos || []);
  if (!videos.length) return { imported: 0, skipped: true, reason: 'empty-seed' };
  tutorialsDb.exec('BEGIN');
  try {
    for (const video of videos) {
      const row = normalizeVideo(video, { isSeed: true });
      upsertStatement.run(...COLUMNS.map(column => row[column]));
    }
    tutorialsDb.prepare(`
      INSERT INTO meta (key, value) VALUES ('seed_key', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key);
    tutorialsDb.exec('COMMIT');
  } catch (error) {
    tutorialsDb.exec('ROLLBACK');
    throw error;
  }
  return { imported: videos.length, skipped: false };
}

let categoriesCache = { mtimeMs: 0, size: 0, data: [] };
export function loadCategories() {
  try {
    const stat = fs.statSync(CATEGORIES_PATH);
    if (categoriesCache.mtimeMs === stat.mtimeMs && categoriesCache.size === stat.size) {
      return categoriesCache.data;
    }
    const data = JSON.parse(fs.readFileSync(CATEGORIES_PATH, 'utf8'));
    categoriesCache = { mtimeMs: stat.mtimeMs, size: stat.size, data };
    return data;
  } catch (error) {
    console.error('[TUTORIALES] No se pudieron cargar las categorías:', error.message);
    return [];
  }
}

export function categoryIndex() {
  const categories = loadCategories();
  const byId = new Map();
  for (const category of categories) {
    byId.set(category.id, category);
    for (const child of category.children || []) {
      byId.set(`${category.id}/${child.id}`, { ...child, categoryId: category.id, categoryName: category.name });
    }
  }
  return byId;
}

export function categoryName(categoryId, subcategoryId) {
  const category = loadCategories().find(item => item.id === categoryId);
  const child = category?.children?.find(item => item.id === subcategoryId);
  return { categoryName: category?.name || categoryId, subcategoryName: child?.name || subcategoryId };
}

const VALID_SORTS = new Set(['relevance', 'newest', 'duration_asc', 'duration_desc', 'views', 'title']);
const VALID_LEVELS = new Set(['principiante', 'intermedio', 'avanzado', 'experto']);
const VALID_SOURCES = new Set(['official', 'educational', 'community']);
const VALID_DURATIONS = new Set(['short', 'medium', 'long']);

function tutorialFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    videoId: row.video_id,
    url: row.url,
    embedUrl: row.embed_url,
    title: row.title,
    channel: row.channel,
    channelUrl: row.channel_url,
    thumbnail: row.thumbnail,
    description: row.description,
    durationSeconds: row.duration_seconds,
    durationLabel: row.duration_label,
    language: row.language,
    languageLabel: row.language_label,
    level: row.level,
    sourceType: row.source_type,
    categoryId: row.category_id,
    subcategoryId: row.subcategory_id,
    categoryName: row.category_name,
    subcategoryName: row.subcategory_name,
    tags: parseJson(row.tags),
    systems: parseJson(row.systems),
    brand: row.brand,
    model: row.model,
    engineCode: row.engine_code,
    fuel: row.fuel,
    yearFrom: row.year_from,
    yearTo: row.year_to,
    vehicleType: row.vehicle_type,
    dtcs: parseJson(row.dtcs),
    symptoms: parseJson(row.symptoms),
    components: parseJson(row.components),
    tools: parseJson(row.tools),
    free: Boolean(row.free),
    embeddable: Boolean(row.embeddable),
    license: row.license,
    verificationStatus: row.verification_status,
    verificationSource: row.verification_source,
    lastCheckedAt: row.last_checked_at,
    publishedLabel: row.published_label,
    viewCount: row.view_count,
    localViews: Number(row.local_views || 0),
    riskLevel: row.risk_level,
    warnings: parseJson(row.warnings),
    market: row.market,
    isHidden: Boolean(row.is_hidden),
    hiddenReason: row.hidden_reason || '',
    isFavorite: Boolean(row.is_favorite),
    watched: Boolean(row.watched),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function buildWhere(params = {}, { includeHidden = false } = {}) {
  const where = [];
  const args = [];
  if (!includeHidden) where.push('is_hidden = 0');

  const q = fold(cleanText(params.q, 180));
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
    for (const term of terms) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      args.push(`%${escapeLike(term)}%`);
    }
  }

  const exactFilters = [
    ['category', 'category_id'], ['subcategory', 'subcategory_id'], ['fuel', 'fuel'],
    ['language', 'language'], ['level', 'level'], ['sourceType', 'source_type'],
    ['vehicleType', 'vehicle_type'], ['market', 'market']
  ];
  for (const [input, column] of exactFilters) {
    const value = cleanText(params[input], 120);
    if (value) {
      where.push(`${column} = ?`);
      args.push(value);
    }
  }
  for (const input of ['brand', 'model', 'engine']) {
    const value = fold(cleanText(params[input], 120));
    if (value) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      args.push(`%${escapeLike(value)}%`);
    }
  }

  if (params.dtc) {
    const dtc = fold(cleanText(params.dtc, 20)).toUpperCase();
    where.push("dtcs LIKE ? ESCAPE '\\'");
    args.push(`%${escapeLike(dtc)}%`);
  }
  for (const input of ['symptom', 'component', 'tool', 'tag']) {
    const value = fold(cleanText(params[input], 80));
    if (value) {
      where.push("search_text LIKE ? ESCAPE '\\'");
      args.push(`%${escapeLike(value)}%`);
    }
  }

  if (params.year) {
    const year = parseNumber(params.year);
    if (year) {
      where.push('(year_from IS NULL OR year_from <= ?) AND (year_to IS NULL OR year_to >= ?)');
      args.push(year, year);
    }
  }
  if (params.free === '1' || params.free === true) where.push('free = 1');
  if (params.embeddable === '1' || params.embeddable === true) where.push('embeddable = 1');
  if (params.withWarnings === '1' || params.withWarnings === true) where.push("warnings != '[]'");
  if (params.duration && VALID_DURATIONS.has(params.duration)) {
    if (params.duration === 'short') where.push('duration_seconds IS NOT NULL AND duration_seconds < 600');
    if (params.duration === 'medium') where.push('duration_seconds >= 600 AND duration_seconds < 1800');
    if (params.duration === 'long') where.push('duration_seconds >= 1800');
  }
  if (params.ids) {
    const ids = String(params.ids).split(',').map(v => cleanText(v, 80)).filter(Boolean).slice(0, 60);
    if (ids.length) {
      where.push(`id IN (${ids.map(() => '?').join(', ')})`);
      args.push(...ids);
    }
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', args };
}

export function listTutorials(params = {}) {
  const limit = Math.max(1, Math.min(60, parseNumber(params.limit, 24) || 24));
  const offset = Math.max(0, Math.min(5000, parseNumber(params.offset, 0) || 0));
  const sort = VALID_SORTS.has(params.sort) ? params.sort : 'relevance';
  const includeHidden = Boolean(params.includeHidden);
  const { sql: whereSql, args: whereArgs } = buildWhere(params, { includeHidden });
  const userId = parseNumber(params.userId, 0) || 0;
  const selectArgs = userId ? [userId, userId] : [];
  const selectUser = userId
    ? `, EXISTS(SELECT 1 FROM tutorial_favorites f WHERE f.user_id = ? AND f.tutorial_id = t.id) AS is_favorite,
       EXISTS(SELECT 1 FROM tutorial_history h WHERE h.user_id = ? AND h.tutorial_id = t.id) AS watched`
    : '';

  let orderSql = "ORDER BY (CASE language WHEN 'es' THEN 0 WHEN 'und' THEN 2 ELSE 1 END), local_views DESC, COALESCE(view_count, 0) DESC, title COLLATE NOCASE";
  const orderArgs = [];
  const q = fold(cleanText(params.q, 180));
  if (sort === 'relevance' && q) {
    orderSql = `ORDER BY
      (CASE WHEN title_fold = ? THEN 120 WHEN title_fold LIKE ? ESCAPE '\\' THEN 60 ELSE 0 END) DESC,
      (CASE WHEN channel_fold LIKE ? ESCAPE '\\' THEN 12 ELSE 0 END) DESC,
      (CASE language WHEN 'es' THEN 0 WHEN 'und' THEN 2 ELSE 1 END),
      local_views DESC, COALESCE(view_count, 0) DESC, title COLLATE NOCASE`;
    orderArgs.push(q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`);
  } else if (sort === 'newest') {
    orderSql = "ORDER BY COALESCE(last_checked_at, '') DESC, created_at DESC, title COLLATE NOCASE";
  } else if (sort === 'duration_asc') {
    orderSql = 'ORDER BY duration_seconds IS NULL, duration_seconds ASC, title COLLATE NOCASE';
  } else if (sort === 'duration_desc') {
    orderSql = 'ORDER BY duration_seconds IS NULL, duration_seconds DESC, title COLLATE NOCASE';
  } else if (sort === 'title') {
    orderSql = 'ORDER BY title COLLATE NOCASE';
  } else if (sort === 'views') {
    orderSql = "ORDER BY (CASE language WHEN 'es' THEN 0 WHEN 'und' THEN 2 ELSE 1 END), local_views DESC, COALESCE(view_count, 0) DESC, title COLLATE NOCASE";
  }

  const total = Number(tutorialsDb.prepare(`SELECT COUNT(*) AS n FROM tutorials t ${whereSql}`).get(...whereArgs)?.n || 0);
  const rows = tutorialsDb.prepare(`
    SELECT t.*${selectUser}
    FROM tutorials t
    ${whereSql}
    ${orderSql}
    LIMIT ? OFFSET ?
  `).all(...selectArgs, ...whereArgs, ...orderArgs, limit, offset);

  return {
    items: rows.map(tutorialFromRow),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    sort,
    filters: { ...params, sort }
  };
}

export function getTutorial(id, userId = null, isAdmin = false, { includeRelated = true } = {}) {
  const uid = parseNumber(userId, 0) || 0;
  const selectUser = uid
    ? `, EXISTS(SELECT 1 FROM tutorial_favorites f WHERE f.user_id = ? AND f.tutorial_id = t.id) AS is_favorite,
       EXISTS(SELECT 1 FROM tutorial_history h WHERE h.user_id = ? AND h.tutorial_id = t.id) AS watched`
    : '';
  const row = tutorialsDb.prepare(`SELECT t.*${selectUser} FROM tutorials t WHERE t.id = ?`)
    .get(...(uid ? [uid, uid] : []), id);
  if (!row || (row.is_hidden && !isAdmin)) return null;
  const tutorial = tutorialFromRow(row);
  if (!includeRelated) return { tutorial, related: [], playlists: [] };

  const relatedRows = tutorialsDb.prepare(`
    SELECT t.* FROM tutorials t
    WHERE t.id != ? AND t.is_hidden = 0 AND (t.subcategory_id = ? OR t.category_id = ?)
    ORDER BY CASE WHEN t.subcategory_id = ? THEN 0 ELSE 1 END, t.local_views DESC, COALESCE(t.view_count, 0) DESC
    LIMIT 6
  `).all(id, tutorial.subcategoryId, tutorial.categoryId, tutorial.subcategoryId);

  const playlists = uid ? tutorialsDb.prepare(`
    SELECT p.id, p.name FROM tutorial_playlist_items i
    JOIN tutorial_playlists p ON p.id = i.playlist_id
    WHERE p.user_id = ? AND i.tutorial_id = ?
    ORDER BY p.name COLLATE NOCASE
  `).all(uid, id) : [];

  return { tutorial, related: relatedRows.map(tutorialFromRow), playlists };
}

export function listSuggestions(q, limit = 8) {
  const query = fold(cleanText(q, 120));
  if (!query) return [];
  const terms = query.split(/\s+/).filter(Boolean).slice(0, 5);
  const where = terms.map(() => "search_text LIKE ? ESCAPE '\\'").join(' AND ');
  const args = terms.map(term => `%${escapeLike(term)}%`);
  return tutorialsDb.prepare(`
    SELECT id, title, category_name, subcategory_name, thumbnail, duration_label, language_label
    FROM tutorials WHERE is_hidden = 0 AND ${where}
    ORDER BY (CASE WHEN title_fold LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END) DESC,
             local_views DESC, COALESCE(view_count, 0) DESC
    LIMIT ?
  `).all(...args, `%${escapeLike(query)}%`, Math.max(1, Math.min(20, limit))).map(row => ({
    id: row.id,
    title: row.title,
    categoryName: row.category_name,
    subcategoryName: row.subcategory_name,
    thumbnail: row.thumbnail,
    durationLabel: row.duration_label,
    languageLabel: row.language_label
  }));
}

export function recordView(id, userId = null) {
  const exists = tutorialsDb.prepare('SELECT id FROM tutorials WHERE id = ? AND is_hidden = 0').get(id);
  if (!exists) throw Object.assign(new Error('Tutorial no encontrado'), { status: 404 });
  tutorialsDb.prepare('UPDATE tutorials SET local_views = local_views + 1 WHERE id = ?').run(id);
  const uid = parseNumber(userId, 0);
  if (uid) {
    const now = nowISO();
    tutorialsDb.prepare(`
      INSERT INTO tutorial_history (user_id, tutorial_id, last_viewed_at, view_count)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(user_id, tutorial_id) DO UPDATE SET
        last_viewed_at = excluded.last_viewed_at,
        view_count = tutorial_history.view_count + 1
    `).run(uid, id, now);
  }
  const row = tutorialsDb.prepare('SELECT local_views FROM tutorials WHERE id = ?').get(id);
  return { localViews: Number(row?.local_views || 0) };
}

export function toggleFavorite(userId, id) {
  const uid = parseNumber(userId, 0);
  if (!uid) throw Object.assign(new Error('Inicia sesión para guardar favoritos.'), { status: 401 });
  const exists = tutorialsDb.prepare('SELECT id FROM tutorials WHERE id = ? AND is_hidden = 0').get(id);
  if (!exists) throw Object.assign(new Error('Tutorial no encontrado'), { status: 404 });
  const current = tutorialsDb.prepare('SELECT 1 FROM tutorial_favorites WHERE user_id = ? AND tutorial_id = ?').get(uid, id);
  if (current) {
    tutorialsDb.prepare('DELETE FROM tutorial_favorites WHERE user_id = ? AND tutorial_id = ?').run(uid, id);
  } else {
    tutorialsDb.prepare('INSERT INTO tutorial_favorites (user_id, tutorial_id, created_at) VALUES (?, ?, ?)').run(uid, id, nowISO());
  }
  return { favorite: !current };
}

export function listFavorites(userId, { limit = 60, offset = 0 } = {}) {
  const uid = parseNumber(userId, 0);
  if (!uid) return { items: [], total: 0 };
  const max = Math.max(1, Math.min(60, parseNumber(limit, 60) || 60));
  const start = Math.max(0, Math.min(5000, parseNumber(offset, 0) || 0));
  const total = Number(tutorialsDb.prepare('SELECT COUNT(*) AS n FROM tutorial_favorites WHERE user_id = ?').get(uid).n || 0);
  const rows = tutorialsDb.prepare(`
    SELECT t.*, 1 AS is_favorite
    FROM tutorial_favorites f JOIN tutorials t ON t.id = f.tutorial_id
    WHERE f.user_id = ? AND t.is_hidden = 0
    ORDER BY f.created_at DESC
    LIMIT ? OFFSET ?
  `).all(uid, max, start);
  return { items: rows.map(tutorialFromRow), total, limit: max, offset: start };
}

export function listHistory(userId, { limit = 60, offset = 0 } = {}) {
  const uid = parseNumber(userId, 0);
  if (!uid) return { items: [], total: 0 };
  const max = Math.max(1, Math.min(60, parseNumber(limit, 60) || 60));
  const start = Math.max(0, Math.min(5000, parseNumber(offset, 0) || 0));
  const total = Number(tutorialsDb.prepare('SELECT COUNT(*) AS n FROM tutorial_history WHERE user_id = ?').get(uid).n || 0);
  const rows = tutorialsDb.prepare(`
    SELECT t.*, h.last_viewed_at, h.view_count AS history_views,
      EXISTS(SELECT 1 FROM tutorial_favorites f WHERE f.user_id = h.user_id AND f.tutorial_id = t.id) AS is_favorite
    FROM tutorial_history h JOIN tutorials t ON t.id = h.tutorial_id
    WHERE h.user_id = ? AND t.is_hidden = 0
    ORDER BY h.last_viewed_at DESC
    LIMIT ? OFFSET ?
  `).all(uid, max, start);
  return {
    items: rows.map(row => ({ ...tutorialFromRow(row), lastViewedAt: row.last_viewed_at, historyViews: Number(row.history_views || 0) })),
    total, limit: max, offset: start
  };
}

export function clearHistory(userId) {
  const uid = parseNumber(userId, 0);
  if (!uid) return { deleted: 0 };
  const result = tutorialsDb.prepare('DELETE FROM tutorial_history WHERE user_id = ?').run(uid);
  return { deleted: Number(result.changes || 0) };
}

export function listPlaylists(userId) {
  const uid = parseNumber(userId, 0);
  if (!uid) return [];
  return tutorialsDb.prepare(`
    SELECT p.id, p.name, p.created_at, p.updated_at,
      COUNT(i.tutorial_id) AS item_count,
      (SELECT t.thumbnail FROM tutorial_playlist_items x JOIN tutorials t ON t.id = x.tutorial_id
       WHERE x.playlist_id = p.id ORDER BY x.position LIMIT 1) AS cover
    FROM tutorial_playlists p
    LEFT JOIN tutorial_playlist_items i ON i.playlist_id = p.id
    WHERE p.user_id = ?
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `).all(uid).map(row => ({
    id: Number(row.id), name: row.name, itemCount: Number(row.item_count || 0),
    cover: row.cover || '', createdAt: row.created_at, updatedAt: row.updated_at
  }));
}

function playlistRow(userId, playlistId) {
  return tutorialsDb.prepare('SELECT * FROM tutorial_playlists WHERE id = ? AND user_id = ?').get(playlistId, userId);
}

export function createPlaylist(userId, name) {
  const uid = parseNumber(userId, 0);
  if (!uid) throw Object.assign(new Error('Inicia sesión para crear listas.'), { status: 401 });
  const cleanName = cleanText(name, 60);
  if (cleanName.length < 2) throw Object.assign(new Error('El nombre de la lista debe tener al menos 2 caracteres.'), { status: 400 });
  const count = Number(tutorialsDb.prepare('SELECT COUNT(*) AS n FROM tutorial_playlists WHERE user_id = ?').get(uid).n || 0);
  if (count >= 20) throw Object.assign(new Error('Has alcanzado el máximo de 20 listas.'), { status: 400 });
  const now = nowISO();
  const info = tutorialsDb.prepare('INSERT INTO tutorial_playlists (user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(uid, cleanName, now, now);
  return { id: Number(info.lastInsertRowid), name: cleanName, itemCount: 0, cover: '', createdAt: now, updatedAt: now };
}

export function renamePlaylist(userId, playlistId, name) {
  const uid = parseNumber(userId, 0);
  const playlist = playlistRow(uid, parseNumber(playlistId, 0));
  if (!playlist) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  const cleanName = cleanText(name, 60);
  if (cleanName.length < 2) throw Object.assign(new Error('El nombre de la lista debe tener al menos 2 caracteres.'), { status: 400 });
  tutorialsDb.prepare('UPDATE tutorial_playlists SET name = ?, updated_at = ? WHERE id = ?').run(cleanName, nowISO(), playlist.id);
  return { id: Number(playlist.id), name: cleanName };
}

export function deletePlaylist(userId, playlistId) {
  const uid = parseNumber(userId, 0);
  const playlist = playlistRow(uid, parseNumber(playlistId, 0));
  if (!playlist) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  tutorialsDb.prepare('DELETE FROM tutorial_playlists WHERE id = ?').run(playlist.id);
  return { deleted: true };
}

export function getPlaylist(userId, playlistId) {
  const uid = parseNumber(userId, 0);
  const playlist = playlistRow(uid, parseNumber(playlistId, 0));
  if (!playlist) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  const rows = tutorialsDb.prepare(`
    SELECT t.*, i.position, i.added_at,
      EXISTS(SELECT 1 FROM tutorial_favorites f WHERE f.user_id = ? AND f.tutorial_id = t.id) AS is_favorite
    FROM tutorial_playlist_items i JOIN tutorials t ON t.id = i.tutorial_id
    WHERE i.playlist_id = ? AND t.is_hidden = 0
    ORDER BY i.position ASC, i.added_at ASC
  `).all(uid, playlist.id);
  return {
    id: Number(playlist.id), name: playlist.name, createdAt: playlist.created_at, updatedAt: playlist.updated_at,
    items: rows.map(row => ({ ...tutorialFromRow(row), position: Number(row.position || 0) }))
  };
}

export function addToPlaylist(userId, playlistId, tutorialId) {
  const uid = parseNumber(userId, 0);
  const playlist = playlistRow(uid, parseNumber(playlistId, 0));
  if (!playlist) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  const tutorial = tutorialsDb.prepare('SELECT id FROM tutorials WHERE id = ? AND is_hidden = 0').get(tutorialId);
  if (!tutorial) throw Object.assign(new Error('Tutorial no encontrado'), { status: 404 });
  const max = Number(tutorialsDb.prepare('SELECT COALESCE(MAX(position), -1) AS n FROM tutorial_playlist_items WHERE playlist_id = ?').get(playlist.id).n ?? -1);
  tutorialsDb.prepare(`
    INSERT INTO tutorial_playlist_items (playlist_id, tutorial_id, position, added_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(playlist_id, tutorial_id) DO NOTHING
  `).run(playlist.id, tutorialId, max + 1, nowISO());
  tutorialsDb.prepare('UPDATE tutorial_playlists SET updated_at = ? WHERE id = ?').run(nowISO(), playlist.id);
  return getPlaylist(uid, playlist.id);
}

export function removeFromPlaylist(userId, playlistId, tutorialId) {
  const uid = parseNumber(userId, 0);
  const playlist = playlistRow(uid, parseNumber(playlistId, 0));
  if (!playlist) throw Object.assign(new Error('Lista no encontrada'), { status: 404 });
  tutorialsDb.prepare('DELETE FROM tutorial_playlist_items WHERE playlist_id = ? AND tutorial_id = ?').run(playlist.id, tutorialId);
  tutorialsDb.prepare('UPDATE tutorial_playlists SET updated_at = ? WHERE id = ?').run(nowISO(), playlist.id);
  return { removed: true };
}

const REPORT_REASONS = new Set(['enlace-roto', 'contenido-incorrecto', 'no-disponible', 'publicidad', 'seguridad', 'otro']);

export function createReport(userId, tutorialId, reason, detail = '') {
  const uid = parseNumber(userId, 0);
  if (!uid) throw Object.assign(new Error('Inicia sesión para enviar un aviso.'), { status: 401 });
  const tutorial = tutorialsDb.prepare('SELECT id FROM tutorials WHERE id = ? AND is_hidden = 0').get(tutorialId);
  if (!tutorial) throw Object.assign(new Error('Tutorial no encontrado'), { status: 404 });
  if (!REPORT_REASONS.has(reason)) throw Object.assign(new Error('Motivo de aviso no válido.'), { status: 400 });
  const pending = tutorialsDb.prepare("SELECT id FROM tutorial_reports WHERE user_id = ? AND tutorial_id = ? AND status = 'pendiente'").get(uid, tutorialId);
  if (pending) throw Object.assign(new Error('Ya tienes un aviso pendiente para este tutorial.'), { status: 409 });
  const info = tutorialsDb.prepare(`
    INSERT INTO tutorial_reports (tutorial_id, user_id, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)
  `).run(tutorialId, uid, reason, cleanText(detail, 500), nowISO());
  return { id: Number(info.lastInsertRowid), status: 'pendiente' };
}

export function listReports(status = 'pendiente') {
  const valid = ['pendiente', 'resuelto', 'descartado', 'todos'].includes(status) ? status : 'pendiente';
  const where = valid === 'todos' ? '' : 'WHERE r.status = ?';
  const rows = tutorialsDb.prepare(`
    SELECT r.*, t.title AS tutorial_title, t.channel, t.category_name, t.subcategory_name
    FROM tutorial_reports r JOIN tutorials t ON t.id = r.tutorial_id
    ${where}
    ORDER BY r.created_at DESC LIMIT 100
  `).all(...(valid === 'todos' ? [] : [valid]));
  return rows.map(row => ({
    id: Number(row.id), tutorialId: row.tutorial_id, userId: row.user_id,
    reason: row.reason, detail: row.detail, status: row.status,
    createdAt: row.created_at, resolvedAt: row.resolved_at,
    tutorialTitle: row.tutorial_title, channel: row.channel,
    categoryName: row.category_name, subcategoryName: row.subcategory_name
  }));
}

export function resolveReport(adminId, reportId, action) {
  const valid = new Set(['resolver', 'descartar', 'ocultar']);
  if (!valid.has(action)) throw Object.assign(new Error('Acción no válida.'), { status: 400 });
  const report = tutorialsDb.prepare('SELECT * FROM tutorial_reports WHERE id = ?').get(parseNumber(reportId, 0));
  if (!report) throw Object.assign(new Error('Aviso no encontrado'), { status: 404 });
  if (action === 'ocultar') {
    tutorialsDb.prepare("UPDATE tutorials SET is_hidden = 1, hidden_reason = ?, updated_at = ? WHERE id = ?")
      .run('Ocultado por moderación tras un aviso', nowISO(), report.tutorial_id);
  }
  const status = action === 'descartar' ? 'descartado' : 'resuelto';
  tutorialsDb.prepare('UPDATE tutorial_reports SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?')
    .run(status, parseNumber(adminId, 0) || null, nowISO(), report.id);
  return { id: Number(report.id), status, hidden: action === 'ocultar' };
}

export function setTutorialVisibility(adminId, tutorialId, hidden, reason = '') {
  const tutorial = tutorialsDb.prepare('SELECT id FROM tutorials WHERE id = ?').get(tutorialId);
  if (!tutorial) throw Object.assign(new Error('Tutorial no encontrado'), { status: 404 });
  tutorialsDb.prepare('UPDATE tutorials SET is_hidden = ?, hidden_reason = ?, updated_at = ? WHERE id = ?')
    .run(hidden ? 1 : 0, hidden ? cleanText(reason || 'Ocultado por moderación', 300) : '', nowISO(), tutorialId);
  return { id: tutorialId, hidden: Boolean(hidden), adminId: parseNumber(adminId, 0) || null };
}

export function tutorialStats() {
  const base = tutorialsDb.prepare(`
    SELECT COUNT(*) AS total,
      COUNT(DISTINCT category_id) AS categories,
      COUNT(DISTINCT subcategory_id) AS subcategories,
      COUNT(DISTINCT language) AS languages,
      COALESCE(SUM(duration_seconds), 0) AS duration,
      SUM(CASE WHEN warnings != '[]' THEN 1 ELSE 0 END) AS warnings,
      SUM(CASE WHEN local_views > 0 THEN 1 ELSE 0 END) AS watched,
      MAX(last_checked_at) AS last_checked
    FROM tutorials WHERE is_hidden = 0
  `).get();
  const byLanguage = tutorialsDb.prepare(`
    SELECT language, language_label AS label, COUNT(*) AS count
    FROM tutorials WHERE is_hidden = 0 GROUP BY language, language_label ORDER BY count DESC
  `).all();
  const byLevel = tutorialsDb.prepare(`
    SELECT level, COUNT(*) AS count FROM tutorials WHERE is_hidden = 0 GROUP BY level ORDER BY count DESC
  `).all();
  const bySource = tutorialsDb.prepare(`
    SELECT source_type AS sourceType, COUNT(*) AS count FROM tutorials WHERE is_hidden = 0 GROUP BY source_type ORDER BY count DESC
  `).all();
  const byCategory = tutorialsDb.prepare(`
    SELECT category_id AS categoryId, category_name AS categoryName, COUNT(*) AS count
    FROM tutorials WHERE is_hidden = 0 GROUP BY category_id, category_name ORDER BY count DESC, categoryName
  `).all();
  const byBrand = tutorialsDb.prepare(`
    SELECT brand, COUNT(*) AS count FROM tutorials
    WHERE is_hidden = 0 AND brand != '' GROUP BY brand ORDER BY count DESC, brand COLLATE NOCASE
  `).all();
  const byFuel = tutorialsDb.prepare(`
    SELECT fuel, COUNT(*) AS count FROM tutorials
    WHERE is_hidden = 0 AND fuel != '' GROUP BY fuel ORDER BY count DESC, fuel
  `).all();
  const byVehicleType = tutorialsDb.prepare(`
    SELECT vehicle_type AS vehicleType, COUNT(*) AS count FROM tutorials
    WHERE is_hidden = 0 GROUP BY vehicle_type ORDER BY count DESC
  `).all();
  return {
    total: Number(base.total || 0),
    categories: Number(base.categories || 0),
    subcategories: Number(base.subcategories || 0),
    languages: Number(base.languages || 0),
    durationSeconds: Number(base.duration || 0),
    warnings: Number(base.warnings || 0),
    watched: Number(base.watched || 0),
    lastChecked: base.last_checked || null,
    byLanguage, byLevel, bySource, byCategory, byBrand, byFuel, byVehicleType,
    reportsPending: Number(tutorialsDb.prepare("SELECT COUNT(*) AS n FROM tutorial_reports WHERE status = 'pendiente'").get().n || 0)
  };
}

export function importTutorials(videos, adminId = null) {
  if (!Array.isArray(videos) || !videos.length) throw Object.assign(new Error('Envía una lista de tutoriales.'), { status: 400 });
  if (videos.length > 1000) throw Object.assign(new Error('Máximo 1000 tutoriales por importación.'), { status: 400 });
  const categoryIds = categoryIndex();
  const imported = [];
  const errors = [];
  for (const [index, video] of videos.entries()) {
    try {
      const categoryId = cleanText(video.categoryId || video.category, 80);
      const subcategoryId = cleanText(video.subcategoryId || video.subcategory, 80);
      if (!categoryIds.has(`${categoryId}/${subcategoryId}`)) {
        throw new Error(`Categoría/subcategoría no válida: ${categoryId}/${subcategoryId}`);
      }
      const names = categoryName(categoryId, subcategoryId);
      const row = normalizeVideo({ ...video, ...names }, { isSeed: false });
      upsertStatement.run(...COLUMNS.map(column => row[column]));
      imported.push(row.id);
    } catch (error) {
      errors.push({ index, message: error.message });
    }
  }
  tutorialsDb.prepare(`
    INSERT INTO meta (key, value) VALUES ('last_import', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(JSON.stringify({ adminId, imported: imported.length, errors: errors.length, at: nowISO() }));
  return { imported: imported.length, errors };
}

export function providerStatus() {
  return {
    youtubeApi: Boolean(process.env.YOUTUBE_API_KEY),
    oembed: true,
    seedVideos: Number(tutorialsDb.prepare('SELECT COUNT(*) AS n FROM tutorials WHERE is_seed = 1').get().n || 0),
    note: process.env.YOUTUBE_API_KEY
      ? 'YouTube Data API configurada para búsquedas e importaciones verificadas.'
      : 'Sin YOUTUBE_API_KEY: la biblioteca local está operativa. Las búsquedas externas se abren en YouTube y las importaciones directas se verifican por oEmbed.'
  };
}

const seedResult = importSeedIfNeeded();
if (!seedResult.skipped) console.log(`[TUTORIALES] Semilla importada: ${seedResult.imported} vídeos verificados.`);
