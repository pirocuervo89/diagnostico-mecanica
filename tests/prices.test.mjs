import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, priceIsStale, applyPrice, hasNumericPrice } from '../src/lib/price_sync.js';

test('parsePrice normaliza importes españoles y descarta lo que no es una cifra', () => {
  assert.equal(parsePrice('156,28 €'), '156,28 €');
  assert.equal(parsePrice('a-offscreen">1.234,56€'), '1.234,56 €');
  assert.equal(parsePrice('7.328,38'), '7.328,38 €');
  assert.equal(parsePrice('Consultar'), null);
  assert.equal(parsePrice('No disponible'), null);
  assert.equal(parsePrice(''), null);
  assert.equal(parsePrice(undefined), null);
});

test('hasNumericPrice distingue cifra de texto', () => {
  assert.equal(hasNumericPrice('9,99 €'), true);
  assert.equal(hasNumericPrice('Consultar'), false);
  assert.equal(hasNumericPrice('No disponible'), false);
});

test('priceIsStale solo refresca fichas con ASIN', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const day = 24 * 60 * 60 * 1000;
  assert.equal(priceIsStale({ price: '10,00 €', priceCheckedAt: '2026-11-08' }, day, now), false);
  // Sin ASIN no hay ficha de tienda que consultar: nunca se refresca.
  assert.equal(priceIsStale({ price: '10,00 €', priceCheckedAt: '2026-11-01' }, day, now), false);
  assert.equal(priceIsStale({ price: 'Consultar' }, day, now), false);
  assert.equal(priceIsStale({ price: 'Consultar', asin: 'B00TEST123' }, day, now), true);
  assert.equal(priceIsStale({ price: '10,00 €', priceCheckedAt: '2026-11-08', asin: 'B00TEST123' }, day, now), false);
  // Sin fecha válida se considera caducado.
  assert.equal(priceIsStale({ price: '10,00 €', asin: 'B00TEST123' }, day, now), true);
});

test('applyPrice guarda el precio observado y no inventa cifras', () => {
  const item = { id: 'x', price: 'Consultar' };
  assert.equal(applyPrice(item, '19,99 €', 'Amazon.es · B00TEST123', '2026-11-08'), true);
  assert.equal(item.price, '19,99 €');
  assert.equal(item.priceSource, 'Amazon.es · B00TEST123');
  assert.equal(item.priceCheckedAt, '2026-11-08');

  const untouched = { id: 'y', price: 'Consultar' };
  assert.equal(applyPrice(untouched, null, 'Amazon.es', '2026-11-08'), false);
  assert.equal(untouched.price, 'Consultar');
});
