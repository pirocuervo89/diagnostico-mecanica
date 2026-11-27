import fs from 'fs';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import { restoreDatabase, startAutoBackup } from './db_persist.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DB_PATH = path.resolve(process.env.MAYA_AGENT_DB_PATH || path.join(ROOT, 'data', 'maya-agent.sqlite'));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
await restoreDatabase(DB_PATH);

const db = new DatabaseSync(DB_PATH);
startAutoBackup(db, DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS maya_agent_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instruction TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_by INTEGER,
    created_at TEXT NOT NULL,
    claimed_at TEXT,
    finished_at TEXT,
    summary TEXT NOT NULL DEFAULT '',
    commit_hash TEXT NOT NULL DEFAULT '',
    pushed INTEGER NOT NULL DEFAULT 0,
    progress TEXT NOT NULL DEFAULT '',
    progress_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_maya_agent_status ON maya_agent_tasks(status, id);
`);

// Migración para instalaciones que ya tenían la tabla sin progreso en vivo.
const columnas = new Set(db.prepare('PRAGMA table_info(maya_agent_tasks)').all().map(c => c.name));
if (!columnas.has('progress')) db.exec("ALTER TABLE maya_agent_tasks ADD COLUMN progress TEXT NOT NULL DEFAULT ''");
if (!columnas.has('progress_at')) db.exec('ALTER TABLE maya_agent_tasks ADD COLUMN progress_at TEXT');

const nowISO = () => new Date().toISOString();

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    instruction: row.instruction,
    status: row.status,
    requestedBy: row.requested_by || null,
    createdAt: row.created_at,
    claimedAt: row.claimed_at || null,
    finishedAt: row.finished_at || null,
    summary: row.summary || '',
    commit: row.commit_hash || '',
    pushed: Boolean(row.pushed),
    progress: row.progress || '',
    progressAt: row.progress_at || null
  };
}

function taskById(id) {
  return fromRow(db.prepare('SELECT * FROM maya_agent_tasks WHERE id = ?').get(Number(id)));
}

export function createAgentTask(instruction, userId = null) {
  const text = String(instruction || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
  if (text.length < 5) {
    throw Object.assign(new Error('La orden es demasiado corta: describe qué está mal y qué debe arreglarse.'), { status: 400 });
  }
  const info = db.prepare(`
    INSERT INTO maya_agent_tasks (instruction, status, requested_by, created_at)
    VALUES (?, 'pending', ?, ?)
  `).run(text, Number(userId) || null, nowISO());
  return taskById(Number(info.lastInsertRowid));
}

export function listAgentTasks(limit = 20) {
  const max = Math.max(1, Math.min(50, Number(limit) || 20));
  return db.prepare('SELECT * FROM maya_agent_tasks ORDER BY id DESC LIMIT ?')
    .all(max)
    .map(fromRow);
}

export function claimNextAgentTask() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const row = db.prepare("SELECT * FROM maya_agent_tasks WHERE status = 'pending' ORDER BY id LIMIT 1").get();
    if (!row) return null;
    const info = db.prepare(`
      UPDATE maya_agent_tasks
      SET status = 'running', claimed_at = ?, progress = ?, progress_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(nowISO(), 'Preparando el repositorio…', nowISO(), row.id);
    if (info.changes) return taskById(row.id);
  }
  return null;
}

export function finishAgentTask(id, { status = 'done', summary = '', commit = '', pushed = false } = {}) {
  const finalStatus = ['done', 'error'].includes(status) ? status : 'done';
  const text = String(summary || '').slice(0, 4000);
  const info = db.prepare(`
    UPDATE maya_agent_tasks
    SET status = ?, finished_at = ?, summary = ?, commit_hash = ?, pushed = ?, progress = '', progress_at = ?
    WHERE id = ? AND status = 'running'
  `).run(finalStatus, nowISO(), text, String(commit || '').slice(0, 80), pushed ? 1 : 0, nowISO(), Number(id));
  if (!info.changes) {
    throw Object.assign(new Error('La orden no existe o ya no está en ejecución.'), { status: 409 });
  }
  return taskById(id);
}

export function updateAgentTaskProgress(id, message) {
  const text = String(message || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  if (!text) return taskById(id);
  const info = db.prepare(`
    UPDATE maya_agent_tasks
    SET progress = ?, progress_at = ?
    WHERE id = ? AND status = 'running'
  `).run(text, nowISO(), Number(id));
  if (!info.changes) {
    throw Object.assign(new Error('La orden no existe o ya no está en ejecución.'), { status: 409 });
  }
  return taskById(id);
}

export function agentQueueStats() {
  const rows = db.prepare('SELECT status, COUNT(*) AS n FROM maya_agent_tasks GROUP BY status').all();
  const byStatus = Object.fromEntries(rows.map(row => [row.status, Number(row.n)]));
  return {
    pending: byStatus.pending || 0,
    running: byStatus.running || 0,
    done: byStatus.done || 0,
    error: byStatus.error || 0
  };
}
