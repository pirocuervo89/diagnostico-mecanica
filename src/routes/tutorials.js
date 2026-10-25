import express from 'express';
import { userFromSession } from '../lib/forum_db.js';
import {
  listTutorials, getTutorial, listSuggestions, recordView, toggleFavorite,
  listFavorites, listHistory, clearHistory, listPlaylists, createPlaylist,
  renamePlaylist, deletePlaylist, getPlaylist, addToPlaylist, removeFromPlaylist,
  createReport, listReports, resolveReport, setTutorialVisibility,
  tutorialStats, loadCategories, providerStatus, importTutorials
} from '../lib/tutorial_db.js';
import { providerInfo, verifyYouTubeVideo, searchYouTube } from '../lib/tutorial_providers.js';

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

function route(handler) {
  return (req, res, next) => {
    const handleError = error => {
      if (error?.status && !res.headersSent) {
        return res.status(error.status).json({ error: error.message });
      }
      next(error);
    };
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(handleError);
    } catch (error) {
      handleError(error);
    }
  };
}

function fail(res, status, message) {
  return res.status(status).json({ error: message });
}

function idParam(value) {
  const id = String(value || '').trim();
  if (!/^[a-zA-Z0-9_-]{3,80}$/.test(id)) {
    throw Object.assign(new Error('Identificador no válido'), { status: 400 });
  }
  return id;
}

function intParam(value) {
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
    if (item.count > max) return fail(res, 429, 'Demasiadas solicitudes seguidas. Espera un momento.');
    next();
  };
}

router.use((req, _res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  req.user = userFromSession(cookies[COOKIE] || '');
  next();
});

function requireUser(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión para guardar favoritos, listas e historial.');
  if (req.user.banned) return fail(res, 403, 'Esta cuenta está suspendida temporalmente.');
  next();
}

function requireMod(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión.');
  if (req.user.banned) return fail(res, 403, 'Esta cuenta está suspendida temporalmente.');
  if (!['admin', 'moderator'].includes(req.user.role)) return fail(res, 403, 'Esta acción requiere permisos de moderación.');
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) return fail(res, 401, 'Inicia sesión.');
  if (req.user.role !== 'admin') return fail(res, 403, 'Esta acción requiere ser administrador.');
  next();
}

router.get('/meta', route((_req, res) => {
  res.json({
    categories: loadCategories(),
    stats: tutorialStats(),
    providers: providerInfo(),
    providerStatus: providerStatus()
  });
}));

router.get('/providers', route((_req, res) => {
  res.json({ providers: providerInfo(), status: providerStatus() });
}));

router.get('/stats', route((_req, res) => {
  res.json(tutorialStats());
}));

router.get('/suggestions', route((req, res) => {
  res.json({ items: listSuggestions(req.query.q, Math.min(20, Number(req.query.limit) || 8)) });
}));

router.get('/session', route((req, res) => {
  res.json({ authenticated: Boolean(req.user), user: req.user || null });
}));

router.get('/library', requireUser, route((req, res) => {
  res.json({
    favorites: listFavorites(req.user.id, { limit: 60 }),
    history: listHistory(req.user.id, { limit: 40 }),
    playlists: listPlaylists(req.user.id)
  });
}));

router.get('/favorites', requireUser, route((req, res) => {
  res.json(listFavorites(req.user.id, { limit: req.query.limit, offset: req.query.offset }));
}));

router.get('/history', requireUser, route((req, res) => {
  res.json(listHistory(req.user.id, { limit: req.query.limit, offset: req.query.offset }));
}));

router.delete('/history', requireUser, route((req, res) => {
  res.json(clearHistory(req.user.id));
}));

router.get('/playlists', requireUser, route((req, res) => {
  res.json({ playlists: listPlaylists(req.user.id) });
}));

router.post('/playlists', requireUser, limitRequests('playlist-create', 20, 60000), route((req, res) => {
  res.status(201).json(createPlaylist(req.user.id, req.body?.name));
}));

router.get('/playlists/:id', requireUser, route((req, res) => {
  res.json(getPlaylist(req.user.id, intParam(req.params.id)));
}));

router.patch('/playlists/:id', requireUser, route((req, res) => {
  res.json(renamePlaylist(req.user.id, intParam(req.params.id), req.body?.name));
}));

router.delete('/playlists/:id', requireUser, route((req, res) => {
  res.json(deletePlaylist(req.user.id, intParam(req.params.id)));
}));

router.post('/playlists/:id/items', requireUser, limitRequests('playlist-item', 60, 60000), route((req, res) => {
  res.status(201).json(addToPlaylist(req.user.id, intParam(req.params.id), idParam(req.body?.tutorialId)));
}));

router.delete('/playlists/:id/items/:tutorialId', requireUser, route((req, res) => {
  res.json(removeFromPlaylist(req.user.id, intParam(req.params.id), idParam(req.params.tutorialId)));
}));

router.get('/admin/reports', requireMod, route((req, res) => {
  res.json({ reports: listReports(req.query.status || 'pendiente') });
}));

router.patch('/admin/reports/:id', requireMod, route((req, res) => {
  res.json(resolveReport(req.user.id, intParam(req.params.id), req.body?.action));
}));

router.post('/admin/tutorials/:id/visibility', requireMod, route((req, res) => {
  res.json(setTutorialVisibility(req.user.id, idParam(req.params.id), Boolean(req.body?.hidden), req.body?.reason));
}));

router.post('/admin/import', requireAdmin, limitRequests('import', 5, 60000), route((req, res) => {
  const videos = Array.isArray(req.body) ? req.body : req.body?.videos;
  res.status(201).json(importTutorials(videos, req.user.id));
}));

router.post('/admin/verify-youtube', requireAdmin, limitRequests('verify-youtube', 30, 60000), route(async (req, res) => {
  res.json(await verifyYouTubeVideo(req.body?.url || req.body?.videoId));
}));

router.post('/admin/search-youtube', requireAdmin, limitRequests('search-youtube', 15, 60000), route(async (req, res) => {
  const query = String(req.body?.query || '').trim();
  if (query.length < 3) return fail(res, 400, 'La búsqueda debe tener al menos 3 caracteres.');
  res.json({ items: await searchYouTube(query, Math.min(12, Number(req.body?.limit) || 6)) });
}));

router.get('/', route((req, res) => {
  res.json(listTutorials({
    ...req.query,
    userId: req.user?.id || null,
    includeHidden: Boolean(req.user && ['admin', 'moderator'].includes(req.user.role)),
    sort: req.query.sort
  }));
}));

router.post('/:id/view', limitRequests('view', 180, 60000), route((req, res) => {
  res.json(recordView(idParam(req.params.id), req.user?.id || null));
}));

router.post('/:id/favorite', requireUser, limitRequests('favorite', 60, 60000), route((req, res) => {
  res.json(toggleFavorite(req.user.id, idParam(req.params.id)));
}));

router.delete('/:id/favorite', requireUser, route((req, res) => {
  const current = getTutorial(idParam(req.params.id), req.user.id, false, { includeRelated: false });
  if (!current) return fail(res, 404, 'Tutorial no encontrado');
  if (current.tutorial.isFavorite) res.json(toggleFavorite(req.user.id, current.tutorial.id));
  else res.json({ favorite: false });
}));

router.post('/:id/report', requireUser, limitRequests('report', 10, 60000), route((req, res) => {
  res.status(201).json(createReport(req.user.id, idParam(req.params.id), req.body?.reason, req.body?.detail));
}));

router.get('/:id', route((req, res) => {
  const detail = getTutorial(idParam(req.params.id), req.user?.id || null, Boolean(req.user && ['admin', 'moderator'].includes(req.user.role)));
  if (!detail) return fail(res, 404, 'Tutorial no encontrado');
  res.json(detail);
}));

export default router;
