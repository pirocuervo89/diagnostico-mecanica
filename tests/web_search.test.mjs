import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchWebContext } from '../src/lib/web_search.js';

// Página real de lite.duckduckgo.com simplificada: enlace y snippet viven en
// filas distintas de la tabla, así que el parser debe emparejarlos por orden.
const FIXTURE = `<!DOCTYPE html>
<html><body><table>
<tr><td valign="top">1.&nbsp;</td><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.example.com%2Fp0299%3Fx%3D1%26y%3D2&rut=abc123" class='result-link'>Turbo <b>P0299</b> &amp; presi&#243;n</a></td></tr>
<tr><td>&nbsp;</td><td class='result-snippet'>Comprueba <b>manguitos</b> &quot;primero&quot; &amp; luego el sensor.</td></tr>
<tr><td valign="top">2.&nbsp;</td><td><a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fforo.example.org%2Fhilo%2F12" class="result-link extra">Fallo de turbo &#x2014; foro</a></td></tr>
<tr><td>&nbsp;</td><td class="result-snippet">Otro resultado con <script>alert(1)</script> m&#225;s etiquetas.</td></tr>
</table></body></html>`;

function withFetch(mock) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  return () => { globalThis.fetch = original; };
}

test('parsea resultados reales, resuelve redirecciones y limpia HTML', async () => {
  const calls = [];
  const restore = withFetch(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, text: async () => FIXTURE };
  });
  try {
    const results = await searchWebContext('p0299 turbo presion test parser', { env: {} });

    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.startsWith('https://lite.duckduckgo.com/lite/?q='));
    assert.match(calls[0].url, /p0299/);
    assert.match(calls[0].options.headers['User-Agent'], /Mozilla\/5\.0/);
    assert.equal(calls[0].options.headers['Accept-Language'], 'es-ES,es;q=0.9');

    assert.equal(results.length, 2);
    assert.deepEqual(results[0], {
      title: 'Turbo P0299 & presión',
      url: 'https://www.example.com/p0299?x=1&y=2',
      snippet: 'Comprueba manguitos "primero" & luego el sensor.',
      domain: 'example.com'
    });
    assert.deepEqual(results[1], {
      title: 'Fallo de turbo — foro',
      url: 'https://foro.example.org/hilo/12',
      snippet: 'Otro resultado con más etiquetas.',
      domain: 'foro.example.org'
    });
  } finally {
    restore();
  }
});

test('cachea en memoria por consulta y respeta el límite', async () => {
  let calls = 0;
  const restore = withFetch(async () => {
    calls += 1;
    return { ok: true, text: async () => FIXTURE };
  });
  try {
    const query = 'consulta cacheada unica 7f3a';
    const first = await searchWebContext(query, { env: {} });
    const second = await searchWebContext(query, { env: {} });
    const limited = await searchWebContext(query, { env: {}, limit: 1 });

    assert.equal(calls, 1, 'la segunda consulta debe salir de la caché');
    assert.equal(first.length, 2);
    assert.deepEqual(second, first);
    assert.equal(limited.length, 1);
    assert.deepEqual(limited[0], first[0]);
  } finally {
    restore();
  }
});

test('WEB_SEARCH_ENABLED=0 desactiva la búsqueda sin tocar la red', async () => {
  let calls = 0;
  const restore = withFetch(async () => {
    calls += 1;
    return { ok: true, text: async () => FIXTURE };
  });
  try {
    const results = await searchWebContext('consulta desactivada b81c', { env: { WEB_SEARCH_ENABLED: '0' } });
    assert.deepEqual(results, []);
    assert.equal(calls, 0);
  } finally {
    restore();
  }
});

test('nunca lanza excepción: red caída, HTTP no OK o consulta vacía devuelven []', async () => {
  let restore = withFetch(async () => { throw new Error('sin red'); });
  try {
    assert.deepEqual(await searchWebContext('red caida c02d', { env: {} }), []);
  } finally {
    restore();
  }

  restore = withFetch(async () => ({ ok: false, text: async () => '' }));
  try {
    assert.deepEqual(await searchWebContext('http 503 d47e', { env: {} }), []);
  } finally {
    restore();
  }

  let called = false;
  restore = withFetch(async () => { called = true; return { ok: true, text: async () => FIXTURE }; });
  try {
    assert.deepEqual(await searchWebContext('   ', { env: {} }), []);
    assert.equal(called, false);
  } finally {
    restore();
  }
});
