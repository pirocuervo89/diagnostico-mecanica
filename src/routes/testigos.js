import express from 'express';

import { listLights, getLight, catalogStats, analyzeWarningPhoto } from '../lib/warning_lights.js';

const router = express.Router();

// Límite sencillo por IP: el análisis con visión gasta cuota del proveedor.
const hits = new Map();
function limit(req, res, next) {
  const key = req.ip || 'anon';
  const now = Date.now();
  if (hits.size > 500) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  const bucket = hits.get(key);
  if (!bucket || bucket.reset < now) {
    hits.set(key, { count: 1, reset: now + 10 * 60000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > 40) return res.status(429).json({ error: 'Demasiados análisis seguidos. Espera unos minutos.' });
  next();
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

router.get('/', route((req, res) => {
  res.json(listLights({
    q: req.query.q || '',
    color: req.query.color || '',
    severity: req.query.severity || ''
  }));
}));

router.get('/stats', route((_req, res) => {
  res.json(catalogStats());
}));

router.get('/:id', route((req, res) => {
  const light = getLight(req.params.id);
  if (!light) return res.status(404).json({ error: 'Testigo no encontrado en el catálogo.' });
  res.json(light);
}));

router.post('/analizar', limit, route(async (req, res) => {
  const body = req.body || {};
  const result = await analyzeWarningPhoto({
    dataUrl: body.dataUrl,
    color: body.color,
    hint: body.hint,
    lightId: body.lightId,
    context: body.context || {}
  });
  res.json(result);
}));

router.use((error, _req, res, _next) => {
  const status = Number(error.status) || 500;
  if (status >= 500) console.error('[TESTIGOS]', error);
  res.status(status).json({ error: status >= 500 ? 'Error interno del reconocimiento de testigos.' : error.message });
});

export default router;
