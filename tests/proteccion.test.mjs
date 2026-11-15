import test from 'node:test';
import assert from 'node:assert/strict';

import { parseAmount, parseQuoteText, reviewQuoteText } from '../src/lib/quote_review.js';
import { buildVehicleHealth, intervalKm, intervalMonths, statusLabel } from '../src/lib/vehicle_health.js';
import { triageRoad } from '../src/lib/road_triage.js';

test('el presupuesto razonable detecta operaciones, horas e IVA', () => {
  const review = reviewQuoteText(`Cambio de aceite y filtro 95 €
Pastillas delanteras 140 €
Mano de obra 2 h x 55 €/h 110 €
IVA 21% 72 €
Total 420 €`);

  assert.equal(review.parsed.total, 420);
  assert.equal(review.parsed.labourRate, 55);
  assert.equal(review.parsed.hours, 2);
  assert.equal(review.parsed.iva, 72);
  assert.equal(review.parsed.items.length, 3);
  assert.deepEqual(review.parsed.operations.map(operation => operation.id).sort(), ['aceite', 'frenos_delanteros']);
  assert.equal(review.verdict.id, 'justo');
  assert.equal(review.flags.some(flag => flag.title.includes('IVA')), false);
});

test('un presupuesto muy por encima avisa y calcula ahorro', () => {
  const review = reviewQuoteText(`Cambio de embrague y volante bimasa 2400 €
Mano de obra 8 h x 70 €/h 560 €
Total 2960 €`);

  assert.equal(review.verdict.id, 'muy_alto');
  assert.equal(review.parsed.total, 2960);
  assert.ok(review.savings > 0);
  assert.ok(review.flags.some(flag => flag.title === 'Total por encima del rango'));
  assert.ok(review.flags.some(flag => flag.title.includes('mano de obra')));
});

test('detecta líneas duplicadas y presupuestos sin total', () => {
  const duplicate = reviewQuoteText(`Filtro de aire 60 €
Filtro de aire 60 €
Total 120 €`);
  assert.ok(duplicate.flags.some(flag => flag.title === 'Posible línea duplicada'));

  const empty = reviewQuoteText('Presupuesto de reparación');
  assert.equal(empty.parsed.total, null);
  assert.equal(empty.verdict.id, 'sin_total');
});

test('un total con IVA incluido no se confunde con la línea de IVA', () => {
  const review = reviewQuoteText('Cambio de aceite y filtro 95 €\nMano de obra 1 h 55 €\nTotal IVA incluido 181,50 €');
  assert.equal(review.parsed.total, 181.5);
  assert.equal(review.parsed.iva, null);
  assert.equal(review.parsed.ivaIncluded, true);
  assert.equal(review.flags.some(flag => flag.title === 'No se ve el IVA'), false);
});

test('sin total explícito se reconstruye con base e IVA', () => {
  const review = reviewQuoteText('Pastillas delanteras 100 €\nIVA 21 % 21 €');
  assert.equal(review.parsed.total, 121);
  assert.notEqual(review.verdict.id, 'sin_total');
});

test('los importes españoles se interpretan sin perder céntimos', () => {
  assert.equal(parseAmount('1.234,56'), 1234.56);
  assert.equal(parseAmount('1.234'), 1234);
  assert.equal(parseAmount('89,90'), 89.9);
  assert.equal(parseAmount('12.5'), 12.5);
});

test('el triaje rojo manda parar con frenos, temperatura o DTC crítico', () => {
  for (const input of [
    { flags: ['frenos'] },
    { text: 'se calienta y la aguja está en rojo' },
    { dtc: 'U0100' }
  ]) {
    const result = triageRoad(input);
    assert.equal(result.level, 'rojo');
    assert.equal(result.canDrive, false);
    assert.ok(result.immediate.length >= 3);
    assert.ok(result.avoid.length >= 2);
  }
});

test('el triaje ámbar permite moverse despacio y el DTC medio no alarma de más', () => {
  for (const input of [
    { dtc: 'P0171' },
    { text: 'el motor ratea y da tirones' },
    { text: 'vibra al frenar' },
    { flags: ['humo'] }
  ]) {
    const result = triageRoad(input);
    assert.equal(result.level, 'ambar');
    assert.equal(result.canDrive, true);
    assert.ok(result.share.includes('Diagnóstico y Mecánica'));
  }
});

test('el triaje extrae códigos y síntomas relacionados', () => {
  const result = triageRoad({ text: 'testigo de motor encendido, el coche ratea y pierde potencia', dtc: 'P0300' });
  assert.ok(result.dtcs.some(code => code.code === 'P0300'));
  assert.ok(result.symptoms.length > 0);
  assert.ok(result.next.length > 0);
  assert.ok(result.why.some(item => item.includes('P0300')));
});

test('la salud del coche puntúa sistemas, acciones e historial', () => {
  const vehicle = {
    id: 7,
    brand: 'Seat',
    model: 'León',
    version: '1.4 TSI',
    year: 2018,
    plate: '1234ABC',
    vin: 'VSSZZZ5FZJR000001',
    firstRegistration: '2018-05-01',
    mileage: 120000,
    acquiredAt: '2020-01-01',
    fuel: 'Gasolina',
    alerts: [{ level: 'vencido', label: 'Aceite y filtro', detail: 'Superado el límite de 105.000 km' }],
    guide: {
      matched: true,
      items: [{ key: 'aceite', label: 'Aceite y filtro', interval: '15.000 km / 12 meses' }]
    },
    events: [{
      id: 1,
      kind: 'mantenimiento',
      kindLabel: 'Mantenimiento',
      item: 'aceite',
      title: 'Cambio de aceite',
      date: '2024-01-01',
      mileage: 100000,
      cost: 90
    }],
    documents: [{ id: 1, kind: 'ficha_tecnica', kindLabel: 'Ficha técnica', name: 'Ficha.pdf', mime: 'application/pdf', createdAt: '2024-01-01', url: '/api/garage/documents/1' }],
    stats: { spentTotal: 90, spentThisYear: 0 }
  };

  const health = buildVehicleHealth(vehicle);
  assert.equal(health.ok, true);
  assert.equal(health.systems.length, 5);
  assert.ok(health.score >= 0 && health.score <= 100);
  assert.ok(health.actions.length > 0);
  assert.ok(health.timeline.length >= 2);
  assert.equal(health.vehicle.name, 'Seat León 1.4 TSI');
  assert.ok(health.disclaimer.includes('No sustituye'));
});

test('los intervalos y las etiquetas de estado se calculan bien', () => {
  assert.equal(intervalKm('15.000 km'), 15000);
  assert.equal(intervalKm('cada 2 años'), null);
  assert.equal(intervalMonths('12 meses'), 12);
  assert.equal(intervalMonths('2 años'), 24);
  assert.equal(statusLabel(90).id, 'excelente');
  assert.equal(statusLabel(60).id, 'atencion');
  assert.equal(statusLabel(30).id, 'urgente');
});
