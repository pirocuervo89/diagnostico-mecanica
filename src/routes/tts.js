import express from 'express';

// Maya habla con la voz del sistema (speechSynthesis) cuando el móvil tiene
// voces instaladas. Muchos Android no las traen y la app se quedaba muda: aquí
// se sintetiza el mismo texto y el navegador lo reproduce como audio normal.
//
// No se guarda nada del usuario: solo se cachea el audio de una frase corta
// para no pedirla dos veces (el saludo y los avisos se repiten mucho).

const router = express.Router();

const LANGS = new Set(['es', 'en', 'pt', 'fr', 'de', 'it']);
const MAX_CHARS = 300;
const MAX_ENTRIES = 120;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const cache = new Map(); // clave -> { buf, type, at }
const hits = new Map(); // ip -> { n, desde }

function limitado(ip) {
  const ahora = Date.now();
  const estado = hits.get(ip);
  if (!estado || ahora - estado.desde > 60_000) {
    hits.set(ip, { n: 1, desde: ahora });
    return false;
  }
  estado.n += 1;
  return estado.n > 90;
}

function limpiarCache() {
  const ahora = Date.now();
  for (const [clave, valor] of cache) {
    if (ahora - valor.at > CACHE_TTL_MS) cache.delete(clave);
  }
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
}

router.get('/', async (req, res) => {
  const texto = String(req.query.q || '').replace(/\s+/g, ' ').trim();
  const lang = LANGS.has(String(req.query.tl)) ? String(req.query.tl) : 'es';

  if (!texto) return res.status(400).json({ error: 'Falta el texto (q)' });
  if (texto.length > MAX_CHARS) {
    return res.status(413).json({ error: `Texto demasiado largo (máx. ${MAX_CHARS})` });
  }
  if (limitado(req.ip)) {
    return res.status(429).json({ error: 'Demasiadas peticiones de voz. Espera un momento.' });
  }

  const clave = `${lang}|${texto}`;
  const guardado = cache.get(clave);
  if (guardado) {
    res.setHeader('Content-Type', guardado.type);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Voz-Cache', 'hit');
    return res.send(guardado.buf);
  }

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(texto)}`;
    const respuesta = await fetch(url, {
      headers: {
        // Sin user agent de navegador el servicio devuelve 403.
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 15; Redmi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
        Referer: 'https://translate.google.com/'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!respuesta.ok) {
      return res.status(502).json({ error: 'La voz no está disponible ahora' });
    }

    const type = respuesta.headers.get('content-type') || 'audio/mpeg';
    if (!/audio|mpeg|octet-stream/i.test(type)) {
      return res.status(502).json({ error: 'La voz no está disponible ahora' });
    }

    const buf = Buffer.from(await respuesta.arrayBuffer());
    if (buf.length < 1200) {
      return res.status(502).json({ error: 'La voz no está disponible ahora' });
    }

    cache.set(clave, { buf, type: 'audio/mpeg', at: Date.now() });
    limpiarCache();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Voz-Cache', 'miss');
    res.send(buf);
  } catch (_err) {
    res.status(502).json({ error: 'La voz no está disponible ahora' });
  }
});

export default router;
