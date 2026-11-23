import express from 'express';

// Maya habla con la voz del sistema (speechSynthesis) cuando el móvil tiene
// voces instaladas. Muchos Android no las traen y la app se quedaba muda: aquí
// se sintetiza el mismo texto y el navegador lo reproduce como audio normal.
//
// Google TTS devuelve 502 a partir de ~200 caracteres. El texto se parte en
// frases de como mucho 190 y los MP3 se encadenan; así una respuesta larga se
// lee entera en vez de fallar a mitad.
//
// No se guarda nada del usuario: solo se cachea el audio de un texto corto
// para no pedirlo dos veces (el saludo y los avisos se repiten mucho).

const router = express.Router();

const LANGS = new Set(['es', 'en', 'pt', 'fr', 'de', 'it']);
const MAX_CHARS = 1000;
const MAX_TROZO = 190;
const MAX_TROZOS = 6;
const MAX_ENTRIES = 120;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MIN_AUDIO_BYTES = 600;

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

// Divide sin cortar palabras y sin pasar del límite de Google. Las frases
// cortas se agrupan para no pedir un MP3 por cada punto.
export function dividirTexto(texto, max = MAX_TROZO) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (!limpio) return [];
  const frases = limpio.split(/(?<=[.!?;:])\s+/).filter(Boolean);
  const piezas = [];
  for (const frase of frases) {
    if (frase.length <= max) {
      piezas.push(frase);
      continue;
    }
    let parte = '';
    for (const palabra of frase.split(' ')) {
      if (palabra.length > max) {
        if (parte) { piezas.push(parte); parte = ''; }
        for (let i = 0; i < palabra.length; i += max) piezas.push(palabra.slice(i, i + max));
        continue;
      }
      if (parte && parte.length + 1 + palabra.length > max) {
        piezas.push(parte);
        parte = palabra;
      } else {
        parte = parte ? `${parte} ${palabra}` : palabra;
      }
    }
    if (parte) piezas.push(parte);
  }
  const trozos = [];
  for (const pieza of piezas) {
    const ultimo = trozos[trozos.length - 1];
    if (ultimo && ultimo.length + 1 + pieza.length <= max) trozos[trozos.length - 1] = `${ultimo} ${pieza}`;
    else trozos.push(pieza);
  }
  return trozos;
}

async function sintetizarTrozo(texto, lang) {
  const base = process.env.TTS_BASE_URL || 'https://translate.google.com/translate_tts';
  const separador = base.includes('?') ? '&' : '?';
  const url = `${base}${separador}ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(texto)}`;
  const respuesta = await fetch(url, {
    headers: {
      // Sin user agent de navegador el servicio devuelve 403.
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 15; Redmi) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
      Referer: 'https://translate.google.com/'
    },
    signal: AbortSignal.timeout(8000)
  });
  if (!respuesta.ok) throw new Error(`tts ${respuesta.status}`);
  const type = respuesta.headers.get('content-type') || 'audio/mpeg';
  if (!/audio|mpeg|octet-stream/i.test(type)) throw new Error('tts sin audio');
  const buf = Buffer.from(await respuesta.arrayBuffer());
  if (buf.length < MIN_AUDIO_BYTES) throw new Error('tts audio vacío');
  return buf;
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
    const trozos = dividirTexto(texto).slice(0, MAX_TROZOS);
    if (!trozos.length) throw new Error('texto sin trozos');
    const audios = [];
    for (const trozo of trozos) audios.push(await sintetizarTrozo(trozo, lang));
    const buf = Buffer.concat(audios);
    if (buf.length < MIN_AUDIO_BYTES) throw new Error('audio incompleto');

    cache.set(clave, { buf, type: 'audio/mpeg', at: Date.now() });
    limpiarCache();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('X-Voz-Cache', 'miss');
    res.setHeader('X-Voz-Trozos', String(trozos.length));
    res.send(buf);
  } catch (_err) {
    res.status(502).json({ error: 'La voz no está disponible ahora' });
  }
});

export default router;
