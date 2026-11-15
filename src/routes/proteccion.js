import express from 'express';

import { userFromSession, isBanned } from '../lib/forum_db.js';
import { getVehicle } from '../lib/garage_db.js';
import { extractDocumentText } from '../lib/document_scan.js';
import { reviewQuoteText, quoteBenchmarks } from '../lib/quote_review.js';
import { buildVehicleHealth } from '../lib/vehicle_health.js';
import { triageRoad } from '../lib/road_triage.js';

const router = express.Router();
const COOKIE = 'dym_forum_session';
const hits = new Map();

function cookieValue(header, name) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (at < 0) continue;
    const key = part.slice(0, at).trim();
    if (key === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return '';
}

function optionalUser(req) {
  const token = cookieValue(req.headers.cookie || '', COOKIE);
  if (!token) return null;
  try {
    const user = userFromSession(token);
    return user && !user.banned && !isBanned(user) ? user : null;
  } catch {
    return null;
  }
}

function requireUser(req, res) {
  const user = optionalUser(req);
  if (!user) {
    res.status(401).json({ error: 'Inicia sesión para ver la salud de tu garaje.' });
    return null;
  }
  return user;
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

function rateLimit(req, res, next) {
  const key = String(req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || 'anon').split(',')[0].trim();
  const now = Date.now();
  if (hits.size > 3000) {
    for (const [ip, bucket] of hits) if (bucket.reset < now) hits.delete(ip);
  }
  const bucket = hits.get(key);
  if (!bucket || bucket.reset < now) {
    hits.set(key, { count: 1, reset: now + 10 * 60000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 12) return res.status(429).json({ error: 'Demasiados análisis seguidos. Espera unos minutos.' });
  next();
}

router.get('/benchmarks', (_req, res) => {
  res.json({ ok: true, operations: quoteBenchmarks() });
});

router.post('/presupuesto', rateLimit, route(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const text = String(body.text || '').trim();
  const dataUrl = String(body.dataUrl || '').trim();
  if (!text && !dataUrl) {
    return res.status(400).json({ error: 'Escribe el presupuesto o adjunta una foto o PDF.' });
  }
  if (dataUrl.length > 17 * 1024 * 1024) {
    return res.status(413).json({ error: 'El archivo es demasiado grande. Usa una foto más ligera o un PDF de menos de 8 MB.' });
  }

  let extracted = { text, method: text ? 'texto_manual' : 'sin_texto', ocr: false, pages: null };
  if (!text) {
    extracted = await extractDocumentText({
      dataBase64: dataUrl,
      mimeType: body.mimeType,
      text: ''
    });
  }

  const review = reviewQuoteText(extracted.text);
  res.json({
    ok: true,
    review,
    meta: {
      method: extracted.method,
      ocr: Boolean(extracted.ocr),
      pages: extracted.pages || null,
      textLength: extracted.text.length,
      textPreview: extracted.text.slice(0, 1400)
    }
  });
}));

router.get('/salud/:id', route((req, res) => {
  const user = requireUser(req, res);
  if (!user) return;
  const vehicle = getVehicle(Number(user.id), idParam(req.params.id));
  res.json(buildVehicleHealth(vehicle));
}));

router.post('/triaje', rateLimit, route((req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const text = String(body.text || '').slice(0, 4000);
  const dtc = String(body.dtc || '').slice(0, 200);
  const flags = Array.isArray(body.flags) ? body.flags.slice(0, 12).map(String) : [];
  if (!text.trim() && !dtc.trim() && !flags.length) {
    return res.status(400).json({ error: 'Cuéntame el síntoma, el código o marca una señal de alarma.' });
  }

  const result = triageRoad({ text, dtc, flags });
  const user = optionalUser(req);
  if (user && body.vehicleId) {
    try {
      const vehicle = getVehicle(Number(user.id), Number(body.vehicleId));
      result.vehicle = {
        id: vehicle.id,
        name: [vehicle.brand, vehicle.model, vehicle.version].filter(Boolean).join(' '),
        mileage: vehicle.mileage || 0
      };
    } catch { /* el vehículo no es del usuario: no se añade */ }
  }
  res.json(result);
}));

router.use((error, _req, res, _next) => {
  const status = Number(error.status) || (String(error.message || '').includes('No se ha podido leer') ? 422 : 500);
  if (status >= 500) console.error('[PROTECCION]', error);
  res.status(status).json({
    error: status >= 500
      ? 'No se ha podido completar el análisis. Inténtalo de nuevo.'
      : error.message
  });
});

export default router;
