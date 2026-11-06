import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSize,
  outerDiameter,
  circumference,
  rimWidthRange,
  findEquivalents,
  parsePcd,
  checkWheelFit
} from '../src/lib/tyres.js';

test('parseSize acepta medidas reales y rechaza disparates', () => {
  assert.deepEqual(parseSize(205, 55, 16).size, '205/55 R16');
  assert.equal(parseSize(205, 55, 16).valid, true);
  assert.equal(parseSize(400, 55, 16).valid, false);
  assert.equal(parseSize(205, 10, 16).valid, false);
  assert.equal(parseSize(205, 55, 30).valid, false);
  assert.equal(parseSize('', '', '').valid, false);
});

test('diámetro exterior y circunferencia de 205/55 R16', () => {
  assert.equal(Number(outerDiameter(205, 55, 16).toFixed(1)), 631.9);
  assert.equal(Number(circumference(205, 55, 16).toFixed(1)), 1985.2);
});

test('rango orientativo de garganta para 205 mm', () => {
  const range = rimWidthRange(205);
  assert.equal(range.min, 5.5);
  assert.equal(range.max, 7.5);
});

test('equivalencias: todo dentro del 3 % y anchura razonable', () => {
  const result = findEquivalents(205, 55, 16);
  assert.equal(result.valid, true);
  assert.ok(result.alternatives.length > 20);
  for (const alt of result.alternatives) {
    assert.ok(Math.abs(alt.diffPct) <= 3, `${alt.size} se sale del 3 %`);
    assert.ok(Math.abs(alt.widthDelta) <= 30, `${alt.size} cambia demasiado de anchura`);
  }
  const sizes = result.alternatives.map(a => a.size);
  assert.ok(sizes.includes('225/45 R17'), 'falta la equivalencia clásica 225/45 R17');
  assert.ok(!sizes.includes('345/40 R14'), 'no debe proponer medidas desproporcionadas');
  // La misma llanta va primero en el agrupado.
  assert.equal(result.groups[0].rim, 16);
});

test('equivalencias rechaza medidas no válidas', () => {
  const result = findEquivalents(205, 55, 99);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length);
});

test('parsePcd entiende 5x112 y variantes', () => {
  assert.deepEqual(parsePcd('5x112'), { bolts: 5, spacing: 112, label: '5x112' });
  assert.equal(parsePcd('5 x 114,3').label, '5x114.3');
  assert.equal(parsePcd('cinco'), null);
  assert.equal(parsePcd('5x999'), null);
});

test('llanta compatible en cotas', () => {
  const result = checkWheelFit(
    { width: 7, diameter: 17, pcd: '5x112', et: 45, bore: 57.1 },
    { width: 7.5, diameter: 17, pcd: '5x112', et: 43, bore: 57.1 }
  );
  assert.equal(result.valid, true);
  assert.equal(result.verdict, 'compatible');
  assert.equal(result.trackChange, 4);
});

test('llanta con tornillería distinta es incompatible', () => {
  const result = checkWheelFit(
    { pcd: '5x112', bore: 57.1 },
    { pcd: '5x114.3', bore: 57.1 }
  );
  assert.equal(result.verdict, 'incompatible');
  assert.ok(result.checks.some(c => c.key === 'pcd' && c.status === 'fail'));
});

test('buje menor no entra y buje mayor exige centradores', () => {
  const small = checkWheelFit({ pcd: '5x112', bore: 66.6 }, { pcd: '5x112', bore: 57.1 });
  assert.ok(small.checks.some(c => c.key === 'bore' && c.status === 'fail'));

  const big = checkWheelFit({ pcd: '5x112', bore: 57.1 }, { pcd: '5x112', bore: 66.6 });
  assert.ok(big.checks.some(c => c.key === 'bore' && c.status === 'warn' && /anillos/.test(c.detail)));
});

test('ET muy distinto avisa y calcula la vía', () => {
  const result = checkWheelFit(
    { width: 7, diameter: 17, pcd: '5x112', et: 45, bore: 57.1 },
    { width: 7, diameter: 17, pcd: '5x112', et: 30, bore: 57.1 }
  );
  assert.equal(result.verdict, 'revisar');
  assert.equal(result.trackChange, 30);
  assert.ok(result.checks.some(c => c.key === 'et' && c.status === 'warn'));
});
