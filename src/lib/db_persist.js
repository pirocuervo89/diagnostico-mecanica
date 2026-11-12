// Copia de seguridad remota de los archivos SQLite.
//
// Render (plan gratuito) borra el disco en cada despliegue, así que las cuentas
// y los coches se perdían. Aquí, si hay credenciales de Supabase Storage:
//   1. Al arrancar se descarga la última copia guardada ANTES de abrir la base.
//   2. Cada minuto (si ha cambiado algo) se sube el archivo completo.
//   3. Al apagar el proceso se sube una última vez.
//
// Variables de entorno:
//   SUPABASE_URL                https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   clave de servicio (service_role)
//   DB_BACKUP_BUCKET            nombre del bucket (por defecto mecanica-db)
//   DB_BACKUP_INTERVAL_MS       cada cuánto se sube (por defecto 60000)
//   DB_BACKUP_DISABLED=1        desactiva todo (pruebas locales)

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = String(
  process.env.SUPABASE_SERVICE_ROLE_KEY
  || process.env.SUPABASE_KEY
  || ''
).trim();
const BUCKET = String(process.env.DB_BACKUP_BUCKET || 'mecanica-db').trim();
const INTERVAL_MS = Math.max(15000, Number(process.env.DB_BACKUP_INTERVAL_MS || 60000));

export const backupEnabled = Boolean(
  SUPABASE_URL && SUPABASE_KEY && process.env.DB_BACKUP_DISABLED !== '1'
);

const bucketReady = new Set();
const uploaded = new Map(); // filePath -> "mtime:size" de la última copia subida
let closing = false;

function log(message) {
  console.log(`[db] ${message}`);
}

function headers(extra = {}) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    ...extra
  };
}

function objectUrl(key) {
  return `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`;
}

async function ensureBucket() {
  if (bucketReady.has(BUCKET)) return true;
  try {
    const res = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
    });
    // 400/409 = ya existe, que es lo normal a partir de la segunda vez.
    if (res.ok || res.status === 400 || res.status === 409) {
      bucketReady.add(BUCKET);
      return true;
    }
    const text = await res.text().catch(() => '');
    log(`aviso: no se pudo crear el bucket ${BUCKET} (${res.status}) ${text.slice(0, 200)}`);
  } catch (error) {
    log(`aviso: sin conexión al preparar el bucket: ${error.message}`);
  }
  return false;
}

// El objeto se guarda en `db/<nombre>.sqlite`, con los datos ya volcados del WAL.
function objectKey(dbPath) {
  return `db/${path.basename(dbPath)}`;
}

function removeSidecars(dbPath) {
  for (const suffix of ['-wal', '-shm', '-journal']) {
    try { fs.rmSync(`${dbPath}${suffix}`, { force: true }); } catch { /* da igual */ }
  }
}

function isValidSqlite(file) {
  let check = null;
  try {
    check = new DatabaseSync(file);
    const row = check.prepare('PRAGMA quick_check').get();
    const value = row ? Object.values(row)[0] : null;
    return String(value || '').toLowerCase() === 'ok';
  } catch {
    return false;
  } finally {
    try { check?.close(); } catch { /* da igual */ }
  }
}

/**
 * Descarga la copia remota del archivo antes de abrirlo.
 * Devuelve true si se ha restaurado algo.
 */
export async function restoreDatabase(dbPath) {
  if (!backupEnabled) return false;
  if (fs.existsSync(dbPath) && fs.statSync(dbPath).size > 0) {
    // Ya hay base local (desarrollo o reinicio sin despliegue): no la pisamos.
    return false;
  }
  try {
    const res = await fetch(objectUrl(objectKey(dbPath)), { headers: headers() });
    if (res.status === 404) {
      log(`${path.basename(dbPath)}: todavía no hay copia remota, se empieza de cero`);
      return false;
    }
    if (!res.ok) {
      log(`aviso: no se pudo descargar ${path.basename(dbPath)} (${res.status})`);
      return false;
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length < 512) {
      log(`aviso: copia remota de ${path.basename(dbPath)} demasiado pequeña, se ignora`);
      return false;
    }
    const temp = `${dbPath}.restore`;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(temp, bytes);
    if (!isValidSqlite(temp)) {
      fs.rmSync(temp, { force: true });
      log(`aviso: la copia remota de ${path.basename(dbPath)} está dañada, se ignora`);
      return false;
    }
    removeSidecars(dbPath);
    fs.renameSync(temp, dbPath);
    log(`${path.basename(dbPath)}: restaurados ${(bytes.length / 1024).toFixed(0)} KB desde la nube`);
    return true;
  } catch (error) {
    log(`aviso: sin nube al restaurar ${path.basename(dbPath)}: ${error.message}`);
    return false;
  }
}

/** Sube ahora mismo el archivo (si ha cambiado). */
export async function uploadDatabase(db, dbPath, { force = false } = {}) {
  if (!backupEnabled) return false;
  try {
    let stamp = '';
    try {
      stamp = `${fs.statSync(dbPath).mtimeMs}:${fs.statSync(dbPath).size}`;
    } catch {
      return false;
    }
    if (!force && uploaded.get(dbPath) === stamp) return false;

    // Volcamos el WAL al archivo principal para que la copia esté completa.
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* puede fallar si hay lectura abierta */ }

    if (!(await ensureBucket())) return false;

    const bytes = fs.readFileSync(dbPath);
    if (bytes.length < 512) return false;

    const res = await fetch(objectUrl(objectKey(dbPath)), {
      method: 'POST',
      headers: headers({
        'Content-Type': 'application/octet-stream',
        'x-upsert': 'true',
        'cache-control': 'no-store'
      }),
      body: bytes
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      log(`aviso: no se pudo subir ${path.basename(dbPath)} (${res.status}) ${text.slice(0, 160)}`);
      return false;
    }
    uploaded.set(dbPath, stamp);
    log(`${path.basename(dbPath)}: copia en la nube (${(bytes.length / 1024).toFixed(0)} KB)`);
    return true;
  } catch (error) {
    log(`aviso: fallo al subir ${path.basename(dbPath)}: ${error.message}`);
    return false;
  }
}

// ------------------------------------------------------------------
// Archivos subidos por el usuario (fotos de coche, facturas PDF, foro)
// ------------------------------------------------------------------
const uploadDirs = [];
const uploadedFiles = new Map(); // ruta local -> mtime:size

function walk(dir, base = dir, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push({ full, rel: path.relative(base, full).split(path.sep).join('/') });
  }
  return out;
}

async function listRemote(prefix) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix, limit: 1000, sortBy: { column: 'name', order: 'asc' } })
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

async function restoreUploads(dir, prefix) {
  if (!backupEnabled) return;
  try {
    if (!(await ensureBucket())) return;
    const items = await listRemote(`${prefix}/`);
    const flat = [];
    for (const item of items) {
      if (item.id) flat.push({ name: item.name });
      else {
        // Carpeta: pedimos su contenido un nivel más abajo.
        const children = await listRemote(`${prefix}/${item.name}/`);
        for (const child of children) if (child.id) flat.push({ name: `${item.name}/${child.name}` });
      }
    }
    let restored = 0;
    for (const item of flat) {
      const target = path.join(dir, ...String(item.name).split('/'));
      if (fs.existsSync(target)) continue;
      const res = await fetch(objectUrl(`${prefix}/${item.name}`), { headers: headers() });
      if (!res.ok) continue;
      const bytes = Buffer.from(await res.arrayBuffer());
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes);
      restored += 1;
    }
    if (restored) log(`${path.basename(dir)}: recuperados ${restored} archivo(s) de la nube`);
  } catch (error) {
    log(`aviso: no se pudieron recuperar archivos de ${path.basename(dir)}: ${error.message}`);
  }
}

async function syncUploads(dir, prefix) {
  if (!backupEnabled) return;
  try {
    if (!(await ensureBucket())) return;
    for (const file of walk(dir)) {
      let stamp;
      try {
        const st = fs.statSync(file.full);
        stamp = `${st.mtimeMs}:${st.size}`;
      } catch { continue; }
      if (uploadedFiles.get(file.full) === stamp) continue;
      const res = await fetch(objectUrl(`${prefix}/${file.rel}`), {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/octet-stream', 'x-upsert': 'true', 'cache-control': 'no-store' }),
        body: fs.readFileSync(file.full)
      });
      if (res.ok) uploadedFiles.set(file.full, stamp);
      else log(`aviso: no se pudo subir ${file.rel} (${res.status})`);
    }
  } catch (error) {
    log(`aviso: fallo al sincronizar ${path.basename(dir)}: ${error.message}`);
  }
}

/** Recupera y mantiene sincronizada una carpeta de archivos subidos. */
export async function startUploadsSync(dir, prefix) {
  if (!backupEnabled) return;
  if (!uploadDirs.some(item => item.dir === dir)) {
    uploadDirs.push({ dir, prefix });
    const timer = setInterval(() => {
      if (!closing) syncUploads(dir, prefix).catch(() => {});
    }, INTERVAL_MS);
    timer.unref?.();
  }
  await restoreUploads(dir, prefix);
  await syncUploads(dir, prefix);
}

const jobs = [];

/** Arranca la copia periódica de una base ya abierta. */
export function startAutoBackup(db, dbPath) {
  if (!backupEnabled) return;
  if (jobs.some(job => job.dbPath === dbPath)) return;
  jobs.push({ db, dbPath });
  const timer = setInterval(() => {
    if (!closing) uploadDatabase(db, dbPath).catch(() => {});
  }, INTERVAL_MS);
  timer.unref?.();
  log(`${path.basename(dbPath)}: copia automática cada ${Math.round(INTERVAL_MS / 1000)} s`);
}

export function backupStatus() {
  return {
    enabled: backupEnabled,
    bucket: backupEnabled ? BUCKET : null,
    intervalMs: INTERVAL_MS,
    databases: jobs.map(job => path.basename(job.dbPath)),
    uploadFolders: uploadDirs.map(item => item.prefix)
  };
}

async function flushAll() {
  if (!backupEnabled) return;
  closing = true;
  await Promise.allSettled([
    ...jobs.map(job => uploadDatabase(job.db, job.dbPath, { force: true })),
    ...uploadDirs.map(item => syncUploads(item.dir, item.prefix))
  ]);
}

export function installShutdownBackup() {
  if (!backupEnabled) return;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.once(signal, () => {
      // Render da unos segundos tras SIGTERM: subimos y dejamos que siga el apagado.
      flushAll().finally(() => process.exit(0));
    });
  }
  process.once('beforeExit', () => { flushAll().catch(() => {}); });
}
