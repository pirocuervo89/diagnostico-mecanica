import express from 'express';
import {
  userFromSession, loginUser, createSession, deleteSession,
  registerUser, registrationState
} from '../lib/forum_db.js';
import { agentQueueStats, listAgentTasks } from '../lib/maya_agent_db.js';

const router = express.Router();
const COOKIE = 'dym_forum_session';
const SESSION_MAX_AGE = 30 * 24 * 60 * 60;

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

function isSecureRequest(req) {
  return Boolean(req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

function sessionCookie(res, token, secure) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res, secure) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function currentUser(req) {
  return userFromSession(parseCookies(req.headers.cookie || '')[COOKIE] || '');
}

function publicAdminUser(user) {
  if (!user) return null;
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

// Límite sencillo por IP. El login y el alta son las dos únicas puertas.
const attempts = new Map();
function limited(name, max, windowMs) {
  return (req, res, next) => {
    const ip = req.socket.remoteAddress || 'anon';
    const key = `${name}:${ip}`;
    const now = Date.now();
    if (attempts.size > 2000) {
      for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    }
    const item = attempts.get(key);
    if (!item || item.reset < now) {
      attempts.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    item.count += 1;
    if (item.count > max) {
      return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos antes de volver a probar.' });
    }
    next();
  };
}

function workerConfigured() {
  return String(process.env.MAYA_AGENT_TOKEN || '').length >= 16;
}

router.get('/status', (req, res) => {
  const user = currentUser(req);
  const admin = Boolean(user && !user.banned && user.role === 'admin');
  const state = registrationState();
  res.json({
    ...state,
    user: publicAdminUser(user),
    admin,
    workerConfigured: workerConfigured(),
    stats: admin ? agentQueueStats() : null,
    tasks: admin ? listAgentTasks(8) : []
  });
});

// Alta única: solo funciona mientras no exista ninguna cuenta. La primera
// cuenta de la instalación es la administradora.
router.post('/setup', limited('admin-setup', 4, 15 * 60 * 1000), (req, res) => {
  try {
    if (req.body?.website) return res.status(400).json({ error: 'Solicitud rechazada.' });
    const state = registrationState();
    if (!state.setupOpen) {
      return res.status(409).json({ error: 'Ya existe una cuenta en esta instalación. Entra con la cuenta administradora.' });
    }
    const password = String(req.body?.password || '');
    if (String(req.body?.confirm || '') !== password) {
      return res.status(400).json({ error: 'Las dos contraseñas no coinciden.' });
    }
    const user = registerUser({
      username: req.body?.username,
      displayName: req.body?.displayName,
      password
    });
    if (user.role !== 'admin') {
      return res.status(409).json({ error: 'No se pudo crear la cuenta administradora. Actualiza la página y vuelve a intentarlo.' });
    }
    const session = createSession(user.id, {
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    sessionCookie(res, session.token, isSecureRequest(req));
    res.status(201).json({ user: publicAdminUser(user), expiresAt: session.expiresAt });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

router.post('/login', limited('admin-login', 10, 5 * 60 * 1000), (req, res) => {
  try {
    if (req.body?.website) return res.status(400).json({ error: 'Solicitud rechazada.' });
    const user = loginUser({ username: req.body?.username, password: req.body?.password });
    if (user.banned) {
      return res.status(403).json({ error: 'Esta cuenta está suspendida temporalmente.' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ error: 'Esta cuenta no es la administradora. Solo el administrador puede entrar aquí.' });
    }
    const session = createSession(user.id, {
      ip: req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    });
    sessionCookie(res, session.token, isSecureRequest(req));
    res.json({ user: publicAdminUser(user), expiresAt: session.expiresAt });
  } catch (error) {
    res.status(error.status || 401).json({ error: error.message });
  }
});

router.post('/logout', (req, res) => {
  const raw = parseCookies(req.headers.cookie || '')[COOKIE] || '';
  deleteSession(raw);
  clearSessionCookie(res, isSecureRequest(req));
  res.json({ ok: true });
});

export default router;
