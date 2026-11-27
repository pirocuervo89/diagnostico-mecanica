import express from 'express';
import crypto from 'crypto';
import { userFromSession } from '../lib/forum_db.js';
import {
  createAgentTask, listAgentTasks, claimNextAgentTask, finishAgentTask, agentQueueStats,
  updateAgentTaskProgress
} from '../lib/maya_agent_db.js';

const router = express.Router();
const COOKIE = 'dym_forum_session';
const MIN_TOKEN_LENGTH = 16;

function parseCookies(header = '') {
  const out = {};
  for (const part of String(header).split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    const value = part.slice(at + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie || '')[COOKIE] || '';
  return userFromSession(token);
}

function requireAdmin(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'Inicia sesión con la cuenta de administrador.' });
  if (user.banned) return res.status(403).json({ error: 'Esta cuenta está suspendida.' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede usar el taller de agentes.' });
  req.adminUser = user;
  next();
}

function workerConfigured() {
  return String(process.env.MAYA_AGENT_TOKEN || '').length >= MIN_TOKEN_LENGTH;
}

function requireWorker(req, res, next) {
  if (!workerConfigured()) {
    return res.status(503).json({ error: 'Falta configurar MAYA_AGENT_TOKEN en el servidor.' });
  }
  const expected = String(process.env.MAYA_AGENT_TOKEN);
  const received = String(req.get('x-agent-token') || '');
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Token de agente no válido.' });
  }
  next();
}

router.get('/me', (req, res) => {
  const user = currentUser(req);
  const admin = Boolean(user && !user.banned && user.role === 'admin');
  res.json({
    admin,
    user: user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null,
    workerConfigured: workerConfigured(),
    stats: admin ? agentQueueStats() : null
  });
});

// El administrador encola una orden. La web nunca ejecuta comandos.
router.post('/tasks', requireAdmin, (req, res) => {
  try {
    const task = createAgentTask(req.body?.instruction, req.adminUser.id);
    res.status(201).json({ task, workerConfigured: workerConfigured() });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.get('/tasks', requireAdmin, (_req, res) => {
  res.json({ tasks: listAgentTasks(20), stats: agentQueueStats(), workerConfigured: workerConfigured() });
});

// Solo el worker local, con token, puede recoger y cerrar órdenes.
router.post('/next', requireWorker, (_req, res) => {
  res.json({ task: claimNextAgentTask() });
});

// Long-poll: el worker se queda esperando hasta 25 s. La orden se recoge en
// cuanto el administrador la envía, sin esperar al siguiente sondeo de 8 s.
router.post('/wait', requireWorker, async (req, res) => {
  try {
    const timeout = Math.min(25000, Math.max(1000, Number(req.body?.timeoutMs) || 20000));
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const task = claimNextAgentTask();
      if (task) return res.json({ task });
      await new Promise(resolve => setTimeout(resolve, 900));
    }
    res.json({ task: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// El worker publica en qué punto está para que el panel lo vea en vivo.
router.post('/tasks/:id/progress', requireWorker, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Identificador no válido.' });
  try {
    const task = updateAgentTaskProgress(id, req.body?.message);
    res.json({ task });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.post('/tasks/:id/result', requireWorker, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Identificador no válido.' });
  try {
    const task = finishAgentTask(id, {
      status: req.body?.status,
      summary: req.body?.summary,
      commit: req.body?.commit,
      pushed: Boolean(req.body?.pushed)
    });
    res.json({ task });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

export default router;
