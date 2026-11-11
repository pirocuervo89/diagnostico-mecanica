// Búsqueda web ligera para enriquecer el contexto del chat.
//
// Usa la versión HTML "lite" de DuckDuckGo (sin clave ni JavaScript) y extrae
// solo los resultados reales de la página. Todo fallo de red, de formato o de
// tiempo se traduce en una lista vacía: la ruta del chat nunca depende de que
// la web responda.
//
// WEB_SEARCH_ENABLED=0 desactiva las consultas externas.

const SEARCH_URL = 'https://lite.duckduckgo.com/lite/';
const HTML_SEARCH_URL = 'https://html.duckduckgo.com/html/';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 50;
const DEFAULT_LIMIT = 4;
const DEFAULT_TIMEOUT_MS = 4500;

const cache = new Map();

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  aacute: 'á', eacute: 'é', iacute: 'í', oacute: 'ó', uacute: 'ú',
  Aacute: 'Á', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Uacute: 'Ú',
  ntilde: 'ñ', Ntilde: 'Ñ', uuml: 'ü', Uuml: 'Ü', ccedil: 'ç', Ccedil: 'Ç',
  iexcl: '¡', iquest: '¿', ordm: 'º', ordf: 'ª', deg: '°',
  hellip: '…', mdash: '—', ndash: '–', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  laquo: '«', raquo: '»', times: '×', divide: '÷',
  euro: '€', pound: '£', copy: '©', reg: '®', trade: '™'
};

function decodeEntities(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (match, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&#(\d+);/g, (match, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    })
    .replace(/&([a-z][a-z0-9]+);/gi, (match, name) => {
      const key = name.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ENTITIES, key) ? ENTITIES[key] : match;
    });
}

function stripTags(value) {
  return decodeEntities(
    String(value || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function enabled(env) {
  const value = String(env?.WEB_SEARCH_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(value);
}

function safeLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(8, Math.floor(n)));
}

function safeTimeout(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.max(500, Math.min(15000, Math.floor(n)));
}

/** Extrae el href de los atributos de una etiqueta <a>. */
function hrefFromAttributes(attributes) {
  const match = String(attributes || '').match(/href\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  return match ? decodeEntities(match[1] ?? match[2] ?? '') : '';
}

/**
 * DuckDuckGo devuelve enlaces de redirección del tipo
 * //duckduckgo.com/l/?uddg=https%3A%2F%2Fejemplo.com%2F...
 * Se resuelve el destino real; si no es http(s), se descarta.
 */
function resolveResultUrl(href) {
  const raw = decodeEntities(href).trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw, 'https://duckduckgo.com');
    if (/(^|\.)duckduckgo\.com$/i.test(parsed.hostname) && parsed.pathname.startsWith('/l/')) {
      const target = parsed.searchParams.get('uddg');
      if (!target) return '';
      const destination = new URL(target, 'https://duckduckgo.com');
      // El parámetro `rut` es un token de la búsqueda, no de la página: si se
      // deja, el mismo hilo entra dos veces con URLs distintas.
      destination.searchParams.delete('rut');
      return /^https?:$/.test(destination.protocol) ? destination.toString() : '';
    }
    return /^https?:$/.test(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

const LINK_RE = /<a\b([^>]*\bclass\s*=\s*(?:"[^"]*\bresult-link\b[^"]*"|'[^']*\bresult-link\b[^']*')[^>]*)>([\s\S]*?)<\/a>/gi;
const SNIPPET_RE = /<td\b[^>]*\bclass\s*=\s*(?:"[^"]*\bresult-snippet\b[^"]*"|'[^']*\bresult-snippet\b[^']*')[^>]*>([\s\S]*?)<\/td>/gi;

// La versión completa (html.duckduckgo.com) usa otras clases. Desde un servidor
// en la nube la versión "lite" a veces no devuelve nada, así que se prueban las
// dos y se usa la que responda resultados.
const HTML_LINK_RE = /<a\b([^>]*\bclass\s*=\s*(?:"[^"]*\bresult__a\b[^"]*"|'[^']*\bresult__a\b[^']*')[^>]*)>([\s\S]*?)<\/a>/gi;
const HTML_SNIPPET_RE = /<a\b[^>]*\bclass\s*=\s*(?:"[^"]*\bresult__snippet\b[^"]*"|'[^']*\bresult__snippet\b[^']*')[^>]*>([\s\S]*?)<\/a>/gi;

/** Parsea el HTML de lite.duckduckgo.com y devuelve resultados ya limpios. */
export function parseWebResults(html, { limit = DEFAULT_LIMIT } = {}) {
  const links = [];
  const snippets = [];

  for (const match of String(html || '').matchAll(LINK_RE)) {
    const url = resolveResultUrl(hrefFromAttributes(match[1]));
    const title = stripTags(match[2]);
    links.push({ url, title });
  }
  for (const match of String(html || '').matchAll(SNIPPET_RE)) {
    snippets.push(stripTags(match[1]));
  }

  return collectResults(links, snippets, limit);
}

function collectResults(links, snippets, limit) {
  const results = [];
  const seen = new Set();
  for (let i = 0; i < links.length && results.length < safeLimit(limit); i += 1) {
    const { url, title } = links[i];
    if (!url || seen.has(url)) continue;
    const domain = domainOf(url);
    // DuckDuckGo mete publicidad (duckduckgo.com/y.js?ad_domain=...) entre los
    // resultados. No es una fuente: se descarta sin romper el emparejamiento de
    // fragmentos, que va por índice.
    if (!domain || domain === 'duckduckgo.com' || /\/y\.js$/i.test(new URL(url).pathname)) continue;
    seen.add(url);
    results.push({
      title: title || domain,
      url,
      snippet: snippets[i] || '',
      domain
    });
  }
  return results;
}

/** Parsea html.duckduckgo.com (clases result__a / result__snippet). */
export function parseHtmlResults(html, { limit = DEFAULT_LIMIT } = {}) {
  const links = [];
  const snippets = [];
  for (const match of String(html || '').matchAll(HTML_LINK_RE)) {
    links.push({ url: resolveResultUrl(hrefFromAttributes(match[1])), title: stripTags(match[2]) });
  }
  for (const match of String(html || '').matchAll(HTML_SNIPPET_RE)) {
    snippets.push(stripTags(match[1]));
  }
  return collectResults(links, snippets, limit);
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key, results) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

/**
 * Busca contexto web para una consulta. Nunca lanza excepción.
 * @param {string} query
 * @param {{limit?: number, timeoutMs?: number, env?: NodeJS.ProcessEnv}} options
 * @returns {Promise<Array<{title: string, url: string, snippet: string, domain: string}>>}
 */
export async function searchWebContext(query, { limit = DEFAULT_LIMIT, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  try {
    const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    if (!q || !enabled(env)) return [];

    const key = q.toLowerCase();
    const cached = readCache(key);
    if (cached) return cached.slice(0, safeLimit(limit));

    // Dos endpoints del mismo buscador: si el primero no devuelve resultados
    // (habitual cuando se llama desde un centro de datos), se prueba el otro.
    const endpoints = [
      { url: `${SEARCH_URL}?q=${encodeURIComponent(q)}`, parse: parseWebResults },
      { url: `${HTML_SEARCH_URL}?q=${encodeURIComponent(q)}`, parse: parseHtmlResults }
    ];

    for (const endpoint of endpoints) {
      let html = '';
      try {
        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'es-ES,es;q=0.9',
            'Cache-Control': 'no-cache'
          },
          signal: AbortSignal.timeout(safeTimeout(timeoutMs))
        });
        if (!response || !response.ok) continue;
        html = await response.text();
      } catch {
        continue;
      }
      const results = endpoint.parse(html, { limit: safeLimit(limit) });
      if (results.length) {
        writeCache(key, results);
        return results;
      }
    }

    writeCache(key, []);
    return [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Foros: la web del taller está en los hilos, no en las páginas comerciales.
// Se buscan dos cosas en paralelo: una consulta general que arrastre foros y
// otra restringida a los dominios donde de verdad se habla de averías, más la
// API pública de Stack Exchange (sin clave y con licencia CC BY-SA).
// ---------------------------------------------------------------------------

const FORUM_DOMAINS = [
  'forocoches.com',
  'areavag.com',
  'opinauto.es',
  'clubvwgolf.com',
  'reddit.com',
  'bimmerforums.com',
  'mechanics.stackexchange.com'
];

const FORUM_QUERY_HINT = '(site:forocoches.com OR site:areavag.com OR site:opinauto.es OR site:reddit.com)';

function isForum(domain) {
  const d = String(domain || '').toLowerCase();
  return FORUM_DOMAINS.some(f => d === f || d.endsWith(`.${f}`));
}

/**
 * Resultados de Stack Exchange (site=mechanics). Sin clave, límite de cortesía.
 * Devuelve [] ante cualquier fallo: es un extra, nunca una dependencia.
 */
async function searchStackExchange(query, { limit = 3, timeoutMs = 3500 } = {}) {
  // Stack Exchange está en inglés: con la consulta en español suele devolver
  // poco, así que se le pasa también una versión sin palabras vacías.
  const stop = /^(de|del|la|el|los|las|un|una|y|o|con|por|para|que|en|mi|al|se|su|sin|m[aá]s|muy|no|me|da|hace|tiene)$/i;
  const keywords = String(query || '')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stop.test(word))
    .slice(0, 6)
    .join(' ');

  for (const term of [query, keywords]) {
    if (!String(term || '').trim()) continue;
    try {
      const url = 'https://api.stackexchange.com/2.3/search/advanced'
        + `?order=desc&sort=relevance&pagesize=${safeLimit(limit)}&site=mechanics&filter=default`
        + `&q=${encodeURIComponent(String(term).slice(0, 200))}`;
      const response = await fetch(url, {
        headers: { 'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs)
      });
      if (!response.ok) continue;
      const data = await response.json().catch(() => null);
      const items = Array.isArray(data?.items) ? data.items : [];
      const mapped = items
        .filter(item => item && item.link && item.title)
        .map(item => ({
          title: decodeEntities(item.title),
          url: item.link,
          snippet: String(item.title || '').slice(0, 220),
          domain: 'mechanics.stackexchange.com',
          forum: true
        }));
      if (mapped.length) return mapped;
    } catch {
      // Se prueba el siguiente término; un fallo de red no puede tumbar el chat.
    }
  }
  return [];
}

// El mismo hilo puede llegar por dos consultas con parámetros distintos. La
// clave de deduplicado ignora query, hash, mayúsculas y www.
function samePageKey(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./i, '').toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return String(url || '').toLowerCase();
  }
}

function mergeResults(groups, { limit = 6 } = {}) {
  const seen = new Set();
  const merged = [];
  for (const group of groups) {
    for (const item of group || []) {
      if (!item || !item.url) continue;
      const pageKey = samePageKey(item.url);
      if (seen.has(pageKey)) continue;
      seen.add(pageKey);
      merged.push({ ...item, forum: item.forum ?? isForum(item.domain) });
    }
  }
  // Los hilos de foro primero: son los que aportan síntoma real de taller.
  merged.sort((a, b) => Number(Boolean(b.forum)) - Number(Boolean(a.forum)));
  return merged.slice(0, safeLimit(limit));
}

/**
 * Wikipedia (API oficial, sin clave). No es un foro, pero desde un centro de
 * datos responde siempre: sirve como última fuente cuando los buscadores
 * bloquean la IP del servidor.
 */
async function searchWikipedia(query, { limit = 3, timeoutMs = 3500 } = {}) {
  try {
    const url = 'https://es.wikipedia.org/w/api.php'
      + `?action=query&list=search&format=json&utf8=1&srlimit=${safeLimit(limit)}`
      + `&srsearch=${encodeURIComponent(String(query || '').slice(0, 200))}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': `${USER_AGENT} (diagnostico-mecanica)` },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return [];
    const data = await response.json().catch(() => null);
    const items = Array.isArray(data?.query?.search) ? data.query.search : [];
    return items.map(item => ({
      title: decodeEntities(stripTags(item.title)),
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/\s+/g, '_'))}`,
      snippet: stripTags(item.snippet || '').slice(0, 200),
      domain: 'es.wikipedia.org',
      forum: false
    }));
  } catch {
    return [];
  }
}

/**
 * Cuando los buscadores bloquean la IP del servidor, se pide la misma búsqueda
 * a un lector público (r.jina.ai), que la ejecuta desde su propia red y
 * devuelve el HTML ya limpio. Sin clave y con el mismo parser.
 */
async function searchViaReader(query, { limit = 4, timeoutMs = 6000 } = {}) {
  try {
    const target = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(query || '').slice(0, 200))}`;
    const response = await fetch(`https://r.jina.ai/${target}`, {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/plain' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok) return [];
    const text = await response.text();
    // r.jina.ai devuelve markdown: se reutiliza el parser buscando enlaces.
    const links = [];
    const snippets = [];
    for (const match of text.matchAll(/\[([^\]]{8,160})\]\((https?:\/\/[^\s)]+)\)/g)) {
      const domain = domainOf(match[2]);
      if (!domain || domain === 'duckduckgo.com' || domain === 'r.jina.ai') continue;
      links.push({ url: match[2], title: match[1] });
      snippets.push('');
    }
    return collectResults(links, snippets, limit);
  } catch {
    return [];
  }
}

/**
 * Investigación completa: foros y web en paralelo, con diagnóstico por fuente.
 * Nunca lanza excepción. El diagnóstico sirve para saber desde el propio
 * servidor qué proveedor está bloqueado (Render bloquea unos y no otros).
 * @param {string} query
 * @param {{limit?: number, timeoutMs?: number, env?: NodeJS.ProcessEnv}} options
 * @returns {Promise<{refs: Array, backends: Array<{name: string, count: number, ms: number}>}>}
 */
export async function researchSources(query, { limit = 6, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!q || !enabled(env)) return { refs: [], backends: [{ name: 'disabled', count: 0, ms: 0 }] };

  const run = async (name, fn) => {
    const started = Date.now();
    let items = [];
    try {
      items = (await fn()) || [];
    } catch {
      items = [];
    }
    return { name, items, ms: Date.now() - started };
  };

  const settled = await Promise.all([
    run('ddg-foros', () => searchWebContext(`${q} ${FORUM_QUERY_HINT}`, { limit: 4, timeoutMs, env })),
    run('ddg-general', () => searchWebContext(`${q} foro averia`, { limit: 4, timeoutMs, env })),
    run('stackexchange', () => searchStackExchange(q, { limit: 3, timeoutMs: Math.min(timeoutMs, 3500) })),
    run('wikipedia', () => searchWikipedia(q, { limit: 3, timeoutMs: Math.min(timeoutMs, 3500) }))
  ]);

  let refs = mergeResults(settled.map(s => s.items), { limit });

  // Si nada respondió, se insiste a través del lector público: lo que aquí está
  // bloqueado por IP, allí no lo está.
  if (!refs.length) {
    const viaReader = await run('reader', () => searchViaReader(`${q} foro coche`, { limit: 4 }));
    settled.push(viaReader);
    refs = mergeResults([viaReader.items], { limit });
  }

  return {
    refs,
    backends: settled.map(s => ({ name: s.name, count: s.items.length, ms: s.ms }))
  };
}

/**
 * Contexto de foros para una consulta: DDG general + DDG restringido a foros +
 * Stack Exchange (mecánica) + Wikipedia de respaldo. Nunca lanza excepción y
 * respeta WEB_SEARCH_ENABLED.
 * @param {string} query
 * @param {{limit?: number, timeoutMs?: number, env?: NodeJS.ProcessEnv}} options
 * @returns {Promise<Array<{title: string, url: string, snippet: string, domain: string, forum: boolean}>>}
 */
export async function searchForumContext(query, { limit = 6, timeoutMs = DEFAULT_TIMEOUT_MS, env = process.env } = {}) {
  try {
    const q = String(query || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!q || !enabled(env)) return [];

    const key = `forum:${q.toLowerCase()}`;
    const cached = readCache(key);
    if (cached) return cached.slice(0, safeLimit(limit));

    const { refs } = await researchSources(q, { limit, timeoutMs, env });
    writeCache(key, refs);
    return refs;
  } catch {
    return [];
  }
}

export { isForum };
