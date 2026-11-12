#!/usr/bin/env node
/**
 * Retira del catálogo los artículos de radiocontrol, modelismo y juguete.
 *
 * Solo borra fichas que identifican un coche/vehículo de RC o un aparato de
 * modelismo. No toca piezas reales de automoción aunque compartan palabras
 * como "amortiguador" o "control remoto" (por ejemplo, luces de coche con mando).
 *
 *   node scripts/remove-rc-products.mjs            # informe, no escribe
 *   node scripts/remove-rc-products.mjs --write    # aplica y guarda
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'products.json');
const WRITE = process.argv.includes('--write');

const RC_PATTERNS = [
  /\b(?:coche|carro|veh[ií]culo|buggy|crawler|monster\s*truck|short\s*course|truck)\s+(?:(?:de|a|para)\s+)?(?:rc|radio\s*control|radiocontrol|control\s*remoto|teledirigid[oa])\b/i,
  /\b(?:rc|radio\s*control|radiocontrol|control\s*remoto|teledirigid[oa])\s+(?:car|coche|truck|buggy|crawler|drift|model)\b/i,
  /\b(?:piezas?|recambios?|repuestos?)\s+(?:para\s+)?(?:coche|carro|veh[ií]culo)\s+(?:rc|(?:de|a|para)\s+radio\s*control|control\s*remoto|teledirigid[oa])\b/i,
  /\b(?:scx10|trx4|trx-4|rc4wd|wltoys|feiyue|tamiya|traxxas|arrma|redcat|losi|gmade|hpi\s*racing)\b/i,
  /\b(?:dron|drone|quadcopter|helic[oó]ptero|aeromodelo|radiocontrol|scalextric|slot\s*car|mini\s*4wd)\b/i,
  /\b(?:rc|radio\s*control)\s+(?:1\/\d+|para\s+coche)\b/i,
  /\b1\/\d+\s+(?:rc|escala)\b.*\b(?:coche|buggy|crawler|truck|modelo)\b/i
];

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const items = Array.isArray(raw) ? raw : (raw.items || raw.products || []);

const removed = items.filter(item => {
  const haystack = [
    item.name,
    item.description,
    item.listingTitle,
    item.subcategory,
    ...(Array.isArray(item.searchTerms) ? item.searchTerms : [])
  ].filter(Boolean).join(' ');
  return RC_PATTERNS.some(re => re.test(haystack));
});

console.log(`Fichas de radiocontrol/modelismo detectadas: ${removed.length}`);
for (const item of removed) {
  console.log(`  · ${item.id} | ${item.category} / ${item.subcategory} | ${String(item.name).slice(0, 100)}`);
}

if (!removed.length) {
  console.log('Nada que retirar.');
} else if (WRITE) {
  const removedIds = new Set(removed.map(item => item.id));
  const kept = items.filter(item => !removedIds.has(item.id));
  const output = Array.isArray(raw) ? kept : { ...raw, items: kept };
  fs.writeFileSync(FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nGuardado en ${path.relative(ROOT, FILE)} (${kept.length} fichas).`);
  for (const item of removed) {
    if (typeof item.image === 'string' && item.image.startsWith('/img/')) {
      const imagePath = path.join(ROOT, 'public', item.image.replace(/^\//, ''));
      try { fs.unlinkSync(imagePath); console.log(`  imagen borrada: ${item.image}`); } catch { /* ya no existe */ }
    }
  }
} else {
  console.log('\nModo informe. Añade --write para aplicar.');
}
