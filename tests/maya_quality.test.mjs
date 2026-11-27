import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyMayaQuery, confidenceFor, sanitizeCitations, evidenceInstruction
} from '../src/lib/maya_quality.js';

test('Maya distingue saludo, seguridad, aclaración y diagnóstico', () => {
  assert.equal(classifyMayaQuery('hola, buenas').mode, 'social');
  assert.equal(classifyMayaQuery('gracias por la ayuda').mode, 'social');

  const safety = classifyMayaQuery('el pedal de freno se va al fondo y no frena');
  assert.equal(safety.mode, 'safety');
  assert.equal(safety.needsSources, true);

  const clarify = classifyMayaQuery('hace un ruido');
  assert.equal(clarify.mode, 'clarify');
  assert.equal(clarify.needsSources, false);

  const diagnose = classifyMayaQuery('Golf VII 2.0 TDI hace un ruido al frenar');
  assert.equal(diagnose.mode, 'diagnose');
  assert.equal(diagnose.needsSources, true);
});

test('Maya busca fuentes para DTC y mantenimiento, no para un saludo', () => {
  assert.equal(classifyMayaQuery('P0299 pérdida de potencia').needsSources, true);
  assert.equal(classifyMayaQuery('cada cuánto se cambia la correa de distribución').needsSources, true);
  assert.equal(classifyMayaQuery('hola').needsSources, false);
});

test('el contraste sube con ficha exacta y fuentes independientes', () => {
  const intent = { mode: 'diagnose', safety: false };
  const low = confidenceFor({ intent });
  assert.equal(low.level, 'low');
  assert.equal(low.sources, 0);

  const medium = confidenceFor({ intent, dtcExact: true });
  assert.equal(medium.level, 'medium');

  const high = confidenceFor({
    intent,
    dtcExact: true,
    engine: true,
    forumCount: 2,
    webCount: 2,
    symptomCount: 2
  });
  assert.equal(high.level, 'high');
  assert.equal(high.sources, 4);
  assert.match(high.note, /fuentes independientes/);

  assert.equal(confidenceFor({ intent: { mode: 'social' } }).level, 'na');
  // Un aviso de seguridad sin fuente no se disfraza de contraste medio.
  assert.equal(confidenceFor({ intent: { mode: 'safety', safety: true } }).level, 'low');
});

test('las citas inventadas se eliminan y las válidas se conservan', () => {
  assert.equal(sanitizeCitations('Válido [1] y [2], inventado [7].', 2), 'Válido [1] y [2], inventado.');
  assert.equal(sanitizeCitations('Sin fuentes [3].', 0), 'Sin fuentes.');
  assert.equal(sanitizeCitations('Dos [2] y una [1].', 2), 'Dos [2] y una [1].');
});

test('el modo aclarar pide una sola pregunta y el modo seguridad manda parar', () => {
  const clarify = evidenceInstruction({ mode: 'clarify' }, { label: 'Contraste bajo', sources: 0 });
  assert.match(clarify, /UNA sola pregunta/);
  assert.match(clarify, /No escribas cifras/);

  const safety = evidenceInstruction({ mode: 'safety' }, { label: 'Contraste medio', sources: 1 });
  assert.match(safety, /primera frase debe ser la advertencia/);
  assert.match(safety, /No inventes números de fuente/);
});
