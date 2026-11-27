import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extraerMaya, accionesPorReglas, MAYA_VISTAS, normalizarAccionMaya } from '../src/routes/api.js';

test('el catálogo de Maya cubre todas las vistas de la app', () => {
  for (const vista of ['inicio', 'chat', 'garaje', 'obd', 'dtc', 'testigos', 'luz', 'productos', 'tienda', 'tutoriales', 'tuning', 'vehiculos', 'diagnostico', 'ruta', 'planes', 'foro', 'informe', 'sala', 'compra', 'contacto', 'fiabilidad', 'neumaticos', 'centinela']) {
    assert.ok(MAYA_VISTAS.has(vista), `falta la vista ${vista}`);
  }
});

test('las frases naturales abren la vista o lanzan la acción correcta', () => {
  assert.deepEqual(accionesPorReglas('abre el garaje'), [{ hacer: 'abrir', donde: 'garaje' }]);
  assert.deepEqual(accionesPorReglas('enséñame los planes'), [{ hacer: 'abrir', donde: 'planes' }]);
  assert.deepEqual(accionesPorReglas('llévame a Valencia'), [{ hacer: 'ruta', que: 'valencia' }]);
  assert.deepEqual(accionesPorReglas('busca bombillas H7 LED'), [{ hacer: 'buscar', donde: 'tienda', que: 'bombillas h7 led' }]);
  assert.deepEqual(accionesPorReglas('conecta el escáner OBD'), [{ hacer: 'conectar_obd' }]);
  assert.deepEqual(accionesPorReglas('se ha encendido un testigo raro'), [{ hacer: 'camara' }]);
  assert.deepEqual(accionesPorReglas('pásame la foto de la ficha técnica'), [{ hacer: 'camara_docs' }]);
  assert.deepEqual(accionesPorReglas('prueba la app entera'), [{ hacer: 'probar' }]);
  assert.deepEqual(accionesPorReglas('arma el centinela'), [{ hacer: 'abrir', donde: 'centinela' }, { hacer: 'centinela', accion: 'armar' }]);
});

test('las acciones de ruta encadenan abrir y actuar', () => {
  assert.deepEqual(accionesPorReglas('reporta un accidente'), [
    { hacer: 'abrir', donde: 'ruta' },
    { hacer: 'reportar', kind: 'accidente' }
  ]);
  assert.deepEqual(accionesPorReglas('silencia la voz del GPS'), [
    { hacer: 'abrir', donde: 'ruta' },
    { hacer: 'voz_gps', accion: 'off' }
  ]);
  assert.deepEqual(accionesPorReglas('detén la navegación'), [{ hacer: 'navegacion', accion: 'detener' }]);
});

test('extraerMaya acepta una acción o un array de hasta tres', () => {
  const una = extraerMaya('Te llevo.\nMAYAJSON {"hacer":"abrir","donde":"ruta"}');
  assert.equal(una.texto, 'Te llevo.');
  assert.deepEqual(una.acciones, [{ hacer: 'abrir', donde: 'ruta' }]);

  const varias = extraerMaya('Te llevo.\nMAYAJSON {"acciones":[{"hacer":"abrir","donde":"garaje"},{"hacer":"camara_docs"},{"hacer":"navegacion","accion":"detener"},{"hacer":"probar"}]}');
  assert.equal(varias.texto, 'Te llevo.');
  assert.equal(varias.acciones.length, 3);
  assert.deepEqual(varias.acciones, [
    { hacer: 'abrir', donde: 'garaje' },
    { hacer: 'camara_docs' },
    { hacer: 'navegacion', accion: 'detener' }
  ]);
});

test('extraerMaya descarta vistas y acciones fuera de la lista blanca', () => {
  const r = extraerMaya('MAYAJSON {"acciones":[{"hacer":"abrir","donde":"pagar"},{"hacer":"borrar_cuenta"},{"hacer":"reportar","kind":"radar"}]}');
  assert.deepEqual(r.acciones, [{ hacer: 'reportar', kind: 'policia' }]);
  assert.equal(r.texto, '');
});

test('normalizarAccionMaya normaliza inicio/home y textos', () => {
  assert.deepEqual(normalizarAccionMaya({ hacer: 'abrir', donde: 'Home' }), { hacer: 'abrir', donde: 'home' });
  assert.deepEqual(normalizarAccionMaya({ hacer: 'buscar', que: '  filtro   de aceite  ' }), { hacer: 'buscar', que: 'filtro de aceite' });
  assert.equal(normalizarAccionMaya({ hacer: 'abrir' }), null);
});
