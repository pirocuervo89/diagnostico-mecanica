import express from 'express';

import { userFromSession, isBanned } from '../lib/forum_db.js';
import { planState } from '../lib/plans.js';
import {
  listVehicles, garageStats, createVehicle, updateVehicle, deleteVehicle, getVehicle,
  saveVehiclePhoto, deleteVehiclePhoto, getVehiclePhoto,
  createEvent, updateEvent, deleteEvent,
  createDocument, getDocumentFile, deleteDocument,
  buildAIContext
} from '../lib/garage_db.js';

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
    try {
      const result = handler(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
    } catch (error) {
      next(error);
    }
  };
}

function idParam(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw Object.assign(new Error('Identificador no válido.'), { status: 400 });
  return n;
}

router.use((req, _res, next) => {
  const token = parseCookies(req.headers.cookie || '')[COOKIE] || '';
  req.user = userFromSession(token);
  next();
});

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Inicia sesión para usar Mi garaje.' });
  if (req.user.banned || isBanned(req.user)) return res.status(403).json({ error: 'Esta cuenta está suspendida temporalmente.' });
  next();
}

// Escrituras: límite amplio pero suficiente para bloquear un script desbocado.
const writes = new Map();
function writeLimit(req, res, next) {
  const key = Number(req.user?.id || 0);
  const now = Date.now();
  if (writes.size > 2000) {
    for (const [k, v] of writes) if (v.reset < now) writes.delete(k);
  }
  const bucket = writes.get(key);
  if (!bucket || bucket.reset < now) {
    writes.set(key, { count: 1, reset: now + 10 * 60000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 120) return res.status(429).json({ error: 'Demasiadas acciones seguidas. Espera unos minutos.' });
  next();
}

router.use(requireUser);

router.get('/status', route((req, res) => {
  res.json({
    ok: true,
    user: { id: Number(req.user.id), displayName: req.user.display_name },
    ...garageStats(Number(req.user.id))
  });
}));

router.get('/vehicles', route((req, res) => {
  const userId = Number(req.user.id);
  const plan = planState(req.user);
  res.json({
    vehicles: listVehicles(userId),
    stats: garageStats(userId),
    plan: { id: plan.id, name: plan.name, vehicles: plan.vehicles, trialActive: plan.trialActive, trialDaysLeft: plan.trialDaysLeft }
  });
}));

// Cada plan lleva un número máximo de coches: 1 en la prueba gratuita, 2 en
// Pro y 10 en Full. Se comprueba en el servidor para que el límite sea real,
// no solo un texto en la pantalla de precios.
router.post('/vehicles', writeLimit, route((req, res) => {
  const userId = Number(req.user.id);
  const plan = planState(req.user);
  const actuales = listVehicles(userId).length;
  if (actuales >= plan.vehicles) {
    return res.status(402).json({
      error: plan.id === 'full'
        ? `Has llegado al máximo de tu plan ${plan.name} (${plan.vehicles} coches). Borra uno que ya no uses para añadir otro.`
        : `Tu plan ${plan.name} permite ${plan.vehicles} coche${plan.vehicles === 1 ? '' : 's'} y ya lo tienes${plan.vehicles === 1 ? '' : 's'}. Con el plan Full (9,99 €/mes) llevas hasta 10 coches, cada uno con su mantenimiento y sus facturas.`,
      limit: plan.vehicles,
      used: actuales,
      upgrade: plan.id === 'full' ? null : 'full',
      plansUrl: '/#planes'
    });
  }
  const vehicle = createVehicle(userId, req.body || {});
  res.status(201).json({ vehicle, saved: true });
}));

router.get('/vehicles/:id', route((req, res) => {
  const vehicle = getVehicle(Number(req.user.id), idParam(req.params.id));
  res.json({ vehicle, aiContext: buildAIContext(vehicle) });
}));

router.put('/vehicles/:id', writeLimit, route((req, res) => {
  const vehicle = updateVehicle(Number(req.user.id), idParam(req.params.id), req.body || {});
  res.json({ vehicle, saved: true });
}));

router.delete('/vehicles/:id', writeLimit, route((req, res) => {
  const result = deleteVehicle(Number(req.user.id), idParam(req.params.id), { confirm: req.body?.confirm === true });
  res.json(result);
}));

router.post('/vehicles/:id/photo', writeLimit, route((req, res) => {
  const vehicle = saveVehiclePhoto(Number(req.user.id), idParam(req.params.id), req.body?.data);
  res.json({ vehicle, saved: true });
}));

router.delete('/vehicles/:id/photo', writeLimit, route((req, res) => {
  const vehicle = deleteVehiclePhoto(Number(req.user.id), idParam(req.params.id));
  res.json({ vehicle, saved: true });
}));

router.get('/vehicles/:id/photo', route((req, res) => {
  const photo = getVehiclePhoto(Number(req.user.id), idParam(req.params.id));
  res.setHeader('Content-Type', photo.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(photo.path);
}));

router.post('/vehicles/:id/events', writeLimit, route((req, res) => {
  const event = createEvent(Number(req.user.id), idParam(req.params.id), req.body || {});
  res.status(201).json({ event, saved: true });
}));

router.put('/events/:eventId', writeLimit, route((req, res) => {
  const event = updateEvent(Number(req.user.id), idParam(req.params.eventId), req.body || {});
  res.json({ event, saved: true });
}));

router.delete('/events/:eventId', writeLimit, route((req, res) => {
  res.json(deleteEvent(Number(req.user.id), idParam(req.params.eventId)));
}));

router.post('/vehicles/:id/documents', writeLimit, route((req, res) => {
  const document = createDocument(Number(req.user.id), idParam(req.params.id), req.body || {});
  res.status(201).json({ document, saved: true });
}));

router.get('/documents/:documentId', route((req, res) => {
  const file = getDocumentFile(Number(req.user.id), idParam(req.params.documentId));
  res.setHeader('Content-Type', file.mime);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.name)}"`);
  res.sendFile(file.path);
}));

router.delete('/documents/:documentId', writeLimit, route((req, res) => {
  res.json(deleteDocument(Number(req.user.id), idParam(req.params.documentId)));
}));

router.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[GARAJE]', error);
  res.status(status).json({ error: status >= 500 ? 'Error interno de Mi garaje.' : error.message });
});

export default router;
