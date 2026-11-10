import express from 'express';
import {
  registerUser, loginUser, createSession, deleteSession, userFromSession,
  publicUser, updateProfile, listCategories, listCases, getCaseDetail, createCase,
  updateCase, hideCase, createReply, hideReply, markReplyProposal, verifySolution, unverifySolution,
  vote, rateReply, reportContent, listReports, resolveReport, banUser, setUserRole,
  getProfile, sendMessage, listMessages, getThread, forumStats, findKnowledgeCases,
  saveAttachments, discardAttachments, getAttachment, isDuplicateRecent, cleanText, isBanned,
  deleteAccount, CASE_STATUSES
} from '../lib/forum_db.js';
import { listVehicles, deleteVehicle } from '../lib/garage_db.js';

const router = express.Router();
const COOKIE = 'dym_forum_session';

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

function sessionCookie(res, token, maxAge = 30 * 24 * 60 * 60, secure = false) {
  res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}

function clearSessionCookie(res, secure = false) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
}

function route(handler) {
  return (req, res, next) => {
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('Identificador no válido'), { status: 400 });
  return n;
}

const buckets = new Map();
function limitRequests(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.user?.id || req.socket.remoteAddress || 'anon'}`;
    const now = Date.now();
    if (buckets.size > 5000) {
      for (const [bucketKey, bucket] of buckets) if (bucket.reset < now) buckets.delete(bucketKey);
    }
    const item = buckets.get(key);
    if (!item || item.reset < now) {
      buckets.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    item.count += 1;
    if (item.count > max) return fail(res, 429, 'Demasiadas acciones seguidas. Espera un momento antes de continuar.');
    next();
  };
}

function spamGuard(req, res, next) {
  if (req.body?.website) return fail(res, 400, 'Solicitud rechazada.');
  const text = String(req.body?.body || req.body?.title || req.body?.message || '');
  if ((text.match(/https?:\/\//gi) || []).length > 3) {
    return fail(res, 400, 'El contenido tiene demasiados enlaces y se ha bloqueado como posible spam.');
  }
  next();
}

router.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  req.authToken = cookies[COOKIE] || '';
  req.user = userFromSession(req.authToken);
  next();
});

function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión para participar en el foro.');
  if (req.user.banned || isBanned(req.user)) return fail(res, 403, 'Esta cuenta está suspendida temporalmente.');
  next();
}

function requireMod(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión.');
  if (req.user.banned || isBanned(req.user)) return fail(res, 403, 'Esta cuenta está suspendida temporalmente.');
  if (!['admin', 'moderator'].includes(req.user.role)) return fail(res, 403, 'Esta acción requiere permisos de moderación.');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión.');
  if (req.user.banned || isBanned(req.user)) return fail(res, 403, 'Esta cuenta está suspendida temporalmente.');
  if (req.user.role !== 'admin') return fail(res, 403, 'Esta acción requiere ser administrador.');
  next();
}

router.get('/categories', (_req, res) => {
  res.json({ categories: listCategories(), statuses: CASE_STATUSES });
});

router.get('/stats', (_req, res) => {
  res.json(forumStats());
});

router.get('/cases', route((req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));
  const offset = Math.max(0, Math.min(5000, Number(req.query.offset) || 0));
  const days = Number(req.query.days);
  const since = Number.isFinite(days) && days > 0
    ? new Date(Date.now() - Math.max(1, Math.min(3650, days)) * 86400000).toISOString()
    : '';
  const result = listCases({
    q: req.query.q,
    category: req.query.category,
    status: req.query.status,
    brand: req.query.brand,
    model: req.query.model,
    engine: req.query.engine,
    dtc: req.query.dtc,
    since,
    sort: req.query.sort,
    limit,
    offset,
    userId: req.user?.id || null
  });
  res.json(result);
}));

router.get('/cases/:id', route((req, res) => {
  const detail = getCaseDetail(idParam(req.params.id), req.user?.id || null, Boolean(req.user && ['admin', 'moderator'].includes(req.user.role)));
  if (!detail) return fail(res, 404, 'Caso no encontrado');
  res.json(detail);
}));

router.post('/cases', requireUser, limitRequests('case', 8, 60000), spamGuard, route((req, res) => {
  const body = req.body || {};
  if (isDuplicateRecent(req.user.id, body.body)) return fail(res, 409, 'Ya has publicado un caso idéntico recientemente.');
  let attachments = [];
  try {
    attachments = saveAttachments(req.user.id, body.attachments || []);
    const detail = createCase(req.user.id, body, attachments);
    res.status(201).json(detail);
  } catch (error) {
    discardAttachments(attachments);
    throw error;
  }
}));

router.patch('/cases/:id', requireUser, limitRequests('edit', 20, 60000), spamGuard, route((req, res) => {
  const isMod = ['admin', 'moderator'].includes(req.user.role);
  res.json(updateCase(req.user.id, idParam(req.params.id), req.body || {}, isMod));
}));

router.delete('/cases/:id', requireUser, route((req, res) => {
  const isMod = ['admin', 'moderator'].includes(req.user.role);
  res.json(hideCase(req.user.id, idParam(req.params.id), true, cleanText(req.body?.reason, 300), isMod));
}));

router.post('/cases/:id/replies', requireUser, limitRequests('reply', 20, 60000), spamGuard, route((req, res) => {
  const caseId = idParam(req.params.id);
  if (isDuplicateRecent(req.user.id, req.body?.body)) return fail(res, 409, 'Ya has enviado esa misma respuesta recientemente.');
  let attachments = [];
  try {
    attachments = saveAttachments(req.user.id, req.body?.attachments || []);
    res.status(201).json(createReply(req.user.id, caseId, req.body || {}, attachments));
  } catch (error) {
    discardAttachments(attachments);
    throw error;
  }
}));

router.patch('/replies/:id/proposal', requireUser, route((req, res) => {
  res.json(markReplyProposal(req.user.id, idParam(req.params.id), req.body?.proposal !== false));
}));

router.patch('/replies/:id/visibility', requireUser, route((req, res) => {
  const isMod = ['admin', 'moderator'].includes(req.user.role);
  res.json(hideReply(req.user.id, idParam(req.params.id), Boolean(req.body?.hidden), cleanText(req.body?.reason, 300), isMod));
}));

router.delete('/replies/:id', requireUser, route((req, res) => {
  const isMod = ['admin', 'moderator'].includes(req.user.role);
  res.json(hideReply(req.user.id, idParam(req.params.id), true, cleanText(req.body?.reason, 300), isMod));
}));

router.post('/cases/:id/solution', requireMod, route((req, res) => {
  const caseId = idParam(req.params.id);
  const replyId = idParam(req.body?.replyId);
  res.json(verifySolution(req.user.id, caseId, replyId, req.body?.notes || ''));
}));

router.delete('/cases/:id/solution', requireMod, route((req, res) => {
  res.json(unverifySolution(req.user.id, idParam(req.params.id)));
}));

router.post('/vote', requireUser, limitRequests('vote', 80, 60000), route((req, res) => {
  const { targetType, targetId, value } = req.body || {};
  res.json(vote(req.user.id, targetType, idParam(targetId), value));
}));

router.post('/replies/:id/rating', requireUser, limitRequests('rating', 40, 60000), route((req, res) => {
  res.json(rateReply(req.user.id, idParam(req.params.id), req.body?.value));
}));

router.post('/reports', requireUser, limitRequests('report', 10, 60000), route((req, res) => {
  const { targetType, targetId, reason, detail } = req.body || {};
  if (!reason) return fail(res, 400, 'Indica el motivo de la denuncia.');
  res.status(201).json(reportContent(req.user.id, targetType, idParam(targetId), reason, detail || ''));
}));

router.get('/moderation/reports', requireMod, route((req, res) => {
  res.json({ reports: listReports(req.query.status || 'pendiente') });
}));

router.patch('/moderation/reports/:id', requireMod, route((req, res) => {
  res.json(resolveReport(req.user.id, idParam(req.params.id), req.body?.action));
}));

router.patch('/moderation/content', requireMod, route((req, res) => {
  const { type, id, hidden, note } = req.body || {};
  if (type === 'case') return res.json(hideCase(req.user.id, idParam(id), Boolean(hidden), note || '', true));
  if (type === 'reply') return res.json(hideReply(req.user.id, idParam(id), Boolean(hidden), note || '', true));
  return fail(res, 400, 'Tipo de contenido no válido.');
}));

router.post('/moderation/users/:id/ban', requireMod, route((req, res) => {
  res.json(banUser(req.user.id, idParam(req.params.id), req.body?.days ?? 7, req.body?.reason || ''));
}));

router.post('/moderation/users/:id/role', requireAdmin, route((req, res) => {
  res.json(setUserRole(req.user.id, idParam(req.params.id), req.body?.role));
}));

router.get('/users/:username', route((req, res) => {
  const profile = getProfile(req.params.username, req.user?.id || null);
  if (!profile) return fail(res, 404, 'Usuario no encontrado');
  res.json(profile);
}));

router.patch('/me', requireUser, route((req, res) => {
  res.json({ user: updateProfile(req.user.id, req.body || {}) });
}));

router.get('/messages', requireUser, route((req, res) => {
  res.json({ threads: listMessages(req.user.id) });
}));

router.post('/messages', requireUser, limitRequests('dm', 30, 60000), spamGuard, route((req, res) => {
  res.status(201).json(sendMessage(req.user.id, req.body || {}));
}));

router.get('/messages/:id', requireUser, route((req, res) => {
  res.json(getThread(req.user.id, idParam(req.params.id)));
}));

router.get('/attachments/:id', route((req, res) => {
  const file = getAttachment(idParam(req.params.id));
  if (!file) return fail(res, 404, 'Archivo no encontrado');
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Content-Length', String(file.size));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (file.mime === 'application/pdf') {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name)}"`);
  } else {
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  }
  res.sendFile(file.path);
}));

router.get('/knowledge', route((req, res) => {
  const references = findKnowledgeCases({
    text: req.query.q || '',
    dtcs: String(req.query.dtc || '').split(/[\s,;]+/).filter(Boolean),
    vehicle: { brand: req.query.brand || '', model: req.query.model || '' },
    limit: req.query.limit || 5
  });
  res.json({ references });
}));

router.post('/auth/register', limitRequests('register', 6, 15 * 60000), route((req, res) => {
  if (req.body?.website) return fail(res, 400, 'Solicitud rechazada.');
  const user = registerUser(req.body || {});
  const session = createSession(user.id, { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] });
  sessionCookie(res, session.token, 30 * 24 * 60 * 60, isSecureRequest(req));
  res.status(201).json({ user, expiresAt: session.expiresAt });
}));

router.post('/auth/login', limitRequests('login', 10, 5 * 60000), route((req, res) => {
  const user = loginUser(req.body || {});
  const session = createSession(user.id, { ip: req.socket.remoteAddress, userAgent: req.headers['user-agent'] });
  sessionCookie(res, session.token, 30 * 24 * 60 * 60, isSecureRequest(req));
  res.json({ user, expiresAt: session.expiresAt });
}));

router.post('/auth/logout', route((req, res) => {
  deleteSession(req.authToken);
  clearSessionCookie(res, isSecureRequest(req));
  res.json({ ok: true });
}));

router.delete('/auth/account', limitRequests('account-delete', 3, 15 * 60000), route((req, res) => {
  if (!req.user) return fail(res, 401, 'Inicia sesión para eliminar tu cuenta.');
  if (String(req.body?.confirm || '').trim().toUpperCase() !== 'ELIMINAR') {
    return fail(res, 400, 'Escribe ELIMINAR para confirmar la eliminación de la cuenta.');
  }
  const vehicles = listVehicles(Number(req.user.id));
  for (const vehicle of vehicles) {
    deleteVehicle(Number(req.user.id), vehicle.id, { confirm: true });
  }
  deleteAccount(Number(req.user.id));
  clearSessionCookie(res, isSecureRequest(req));
  res.json({ ok: true, deleted: true });
}));

router.get('/auth/me', route((req, res) => {
  res.json({ user: req.user || null });
}));

router.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[FORO]', error);
  res.status(status).json({ error: status >= 500 ? 'Error interno del foro.' : error.message });
});

export default router;
