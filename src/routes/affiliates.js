/**
 * Estado de la afiliación para el panel privado del titular.
 *
 * Devuelve si la etiqueta de Amazon está activa, de dónde sale y cuántos
 * enlaces del catálogo la llevarían. No expone claves: solo cifras y el
 * identificador público de la etiqueta.
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const router = express.Router();

function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', name), 'utf8'));
  } catch {
    return null;
  }
}

function itemsOf(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.items || raw?.products || raw?.tyres || [];
}

function isTag(value) {
  return /^[a-z0-9][a-z0-9-]*?-[0-9]{2}$/i.test(String(value || '').trim());
}

const CATALOGUES = [
  {
    name: 'Productos',
    file: 'products.json',
    link: item => item.affiliateUrl || item.buyUrl || item.url
  },
  {
    name: 'Neumáticos',
    file: 'tyres.json',
    link: item => item.url
  },
  {
    name: 'Tuning y accesorios',
    file: 'tuning-products.json',
    link: item => {
      const links = Array.isArray(item.links) ? item.links : [];
      const amazon = links.find(entry => /amazon\./i.test(String(entry?.url || '')));
      return (amazon || links[0])?.url;
    }
  }
];

router.get('/', (req, res) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Cache-Control', 'no-store');

  const legal = read('legal.json') || {};
  const fromEnv = String(process.env.AFFILIATE_TAG_AMAZON || '').trim();
  const stored = String(legal.amazonTag || '').trim();
  const tag = isTag(fromEnv) ? fromEnv : (isTag(stored) ? stored : '');

  const catalogues = CATALOGUES.map(catalogue => {
    const items = itemsOf(read(catalogue.file));
    const withLink = items.filter(item => /^https?:\/\//i.test(String(catalogue.link(item) || '').trim())).length;
    return { name: catalogue.name, items: items.length, withLink };
  });

  res.json({
    tag,
    tagActive: Boolean(tag),
    tagSource: isTag(fromEnv) ? 'AFFILIATE_TAG_AMAZON' : (isTag(stored) ? 'data/legal.json' : ''),
    awinPublisher: String(process.env.AWIN_PUBLISHER_ID || '').trim() || '',
    // AliExpress y Temu: no tienen un identificador con formato fijo, así que
    // se informa de si existe la plantilla de seguimiento en el entorno.
    aliexpress: { active: Boolean(String(process.env.ALIEXPRESS_AFF_URL || '').trim()) },
    temu: { active: Boolean(String(process.env.TEMU_AFF_URL || '').trim()) },
    catalogue: catalogues,
    linkedItems: catalogues.reduce((total, entry) => total + entry.withLink, 0),
    siteUrl: legal.siteUrl || '',
    checkedAt: new Date().toISOString()
  });
});

export default router;
