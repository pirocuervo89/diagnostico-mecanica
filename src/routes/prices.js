/**
 * Precios del catálogo: estado del refresco, consulta rápida y refresco manual.
 *
 * El refresco automático corre en el servidor (src/lib/price_sync.js); estas
 * rutas solo lo consultan o lo lanzan a mano.
 */
import express from 'express';
import {
  readCatalog,
  priceSyncStatus,
  priceSyncConfig,
  runPriceSync,
  isRunning
} from '../lib/price_sync.js';

const router = express.Router();
const MANUAL_COOLDOWN_MS = 5 * 60 * 1000;
let lastManualAt = 0;

router.get('/status', (_req, res) => {
  res.json(priceSyncStatus());
});

/**
 * Precios actuales por id. La página los consulta cada pocos minutos y
 * actualiza las tarjetas sin recargar. Solo id, precio, fecha y origen.
 */
router.get('/current', (_req, res) => {
  try {
    const { list } = readCatalog();
    const prices = {};
    for (const item of list) {
      if (!item || !item.id) continue;
      prices[item.id] = {
        price: item.price || '',
        checkedAt: item.priceCheckedAt || '',
        source: item.priceSource || ''
      };
    }
    res.json({ updatedAt: new Date().toISOString(), prices });
  } catch (err) {
    res.status(500).json({ error: 'No se pudo leer el catálogo', detail: err.message });
  }
});

router.post('/refresh', (req, res) => {
  const cfg = priceSyncConfig();
  if (cfg.adminToken && req.get('x-admin-token') !== cfg.adminToken) {
    return res.status(403).json({ error: 'Token de administración no válido' });
  }
  if (isRunning()) {
    return res.status(409).json({ error: 'Ya hay un refresco en marcha', status: priceSyncStatus() });
  }
  const wait = MANUAL_COOLDOWN_MS - (Date.now() - lastManualAt);
  if (wait > 0) {
    return res.status(429).json({
      error: 'Refresco manual en espera; prueba más tarde',
      retryAfterSeconds: Math.ceil(wait / 1000)
    });
  }

  lastManualAt = Date.now();
  const limit = Number(req.query.limit || req.body?.limit || 0) || undefined;
  // Se responde enseguida: la pasada tarda varios minutos y no debe colgar la petición.
  runPriceSync({ limit }).catch(err => console.error('[precios] error en refresco manual:', err.message));
  res.status(202).json({
    accepted: true,
    limit: limit || cfg.batch,
    status: priceSyncStatus()
  });
});

export default router;
