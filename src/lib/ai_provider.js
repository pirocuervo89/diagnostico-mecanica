// Motor de IA del proyecto, independiente del proveedor.
//
// Habla el formato OpenAI (`/chat/completions`), que comparten Groq,
// OpenRouter, Mistral, Cerebras, Together, DeepSeek, OpenAI, Pollinations y los
// gateways compatibles. Google Gemini queda como proveedor alternativo para no
// romper instalaciones que ya tengan su clave.
//
// `callAI` recorre una cadena: el proveedor forzado (si lo hay), los presets
// configurados y, como último recurso, Pollinations, que no necesita clave.
// Cada proveedor tiene su propio cooldown, de forma que un fallo de Groq no
// bloquea a OpenRouter. Si todo falla se devuelve un error agregado y la ruta
// usa el motor experto local: la web nunca se queda sin respuesta y nunca
// expone la clave.

const PRESETS = {
  groq: {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    keyEnv: 'GROQ_API_KEY'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    keyEnv: 'OPENROUTER_API_KEY'
  },
  mistral: {
    id: 'mistral',
    label: 'Mistral AI',
    kind: 'openai',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-large-latest',
    keyEnv: 'MISTRAL_API_KEY'
  },
  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai',
    baseUrl: 'https://api.cerebras.ai/v1',
    model: 'llama-3.3-70b',
    keyEnv: 'CEREBRAS_API_KEY'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    keyEnv: 'OPENAI_API_KEY'
  },
  // Cualquier otro servicio compatible: basta con AI_BASE_URL + AI_API_KEY.
  compatible: {
    id: 'compatible',
    label: 'Proveedor compatible',
    kind: 'openai',
    baseUrl: '',
    model: '',
    keyEnv: 'AI_API_KEY'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    kind: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.8-flash',
    keyEnv: 'GEMINI_API_KEY'
  },
  // Preset gratuito y sin clave: último recurso cuando no hay nada configurado
  // o cuando todas las claves fallan. No admite imágenes.
  pollinations: {
    id: 'pollinations',
    label: 'Pollinations (gratis)',
    kind: 'openai',
    baseUrl: 'https://text.pollinations.ai/openai',
    model: 'openai-fast',
    keyEnv: '',
    free: true
  }
};

// Orden de preferencia cuando no se fuerza AI_PROVIDER: primero el interruptor
// genérico, después los presets y Gemini al final.
const AUTO_ORDER = ['compatible', 'groq', 'openrouter', 'mistral', 'cerebras', 'openai', 'gemini'];

// Orden para visión. Pollinations queda fuera a propósito: solo acepta texto.
const AUTO_VISION_ORDER = ['gemini', 'openai', 'openrouter', 'mistral', 'groq', 'cerebras', 'compatible'];

export function listProviders() {
  return Object.values(PRESETS).map(p => ({
    id: p.id,
    label: p.label,
    model: p.model,
    keyEnv: p.keyEnv,
    kind: p.kind,
    free: Boolean(p.free)
  }));
}

function pollinationsEnabled(env) {
  const value = String(env.POLLINATIONS_ENABLED ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(value);
}

function buildProvider(preset, env) {
  const isPollinations = preset.id === 'pollinations';
  const apiKey = String(env[preset.keyEnv] || '').trim();
  if (!isPollinations && !apiKey) return null;

  let baseUrl = String(env.AI_BASE_URL || '').trim() || preset.baseUrl;
  let model = String(env.AI_MODEL || '').trim() || preset.model;
  if (isPollinations) {
    if (!pollinationsEnabled(env)) return null;
    baseUrl = String(env.POLLINATIONS_BASE_URL || '').trim() || preset.baseUrl;
    model = String(env.POLLINATIONS_MODEL || '').trim() || preset.model;
  }
  // Un servicio compatible necesita una URL: sin ella no hay a dónde llamar.
  if (preset.kind === 'openai' && !baseUrl) return null;

  return {
    id: preset.id,
    label: preset.label,
    kind: preset.kind,
    model,
    baseUrl,
    apiKey,
    free: Boolean(preset.free)
  };
}

/**
 * Cadena completa de proveedores disponibles, en orden de uso.
 * Si AI_PROVIDER fuerza uno, va primero; Pollinations cierra la cadena.
 */
export function resolveProviders(env = process.env) {
  const forced = String(env.AI_PROVIDER || '').trim().toLowerCase();
  const order = [];
  // Un proveedor forzado solo se pone delante si tiene clave: si no, la cadena
  // no debe quedarse esperando a un servicio que no puede responder.
  if (forced && PRESETS[forced]) order.push(forced);
  for (const id of AUTO_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  if (!order.includes('pollinations')) order.push('pollinations');

  const providers = [];
  for (const id of order) {
    const preset = PRESETS[id];
    if (!preset) continue;
    const provider = buildProvider(preset, env);
    if (provider) providers.push(provider);
    // Claves extra del mismo proveedor (GROQ_API_KEY_2, _3...): cada cuenta
    // gratuita suma cuota y actúa como proveedor independiente en la cadena.
    // Así una web sin presupuesto puede tener tres IA gratuitas en paralelo.
    if (preset.keyEnv) {
      for (const suffix of ['_2', '_3', '_4']) {
        const extraKey = String(env[`${preset.keyEnv}${suffix}`] || '').trim();
        if (!extraKey) continue;
        const extra = buildProvider(preset, { ...env, [preset.keyEnv]: extraKey });
        if (!extra) continue;
        providers.push({ ...extra, id: `${preset.id}${suffix.toLowerCase()}`, label: `${preset.label} ${suffix.slice(1)}` });
      }
    }
  }
  return providers;
}

/**
 * Primer proveedor de la cadena. Devuelve null solo si no hay ninguno
 * (por ejemplo, con Pollinations desactivado y sin claves).
 */
export function resolveProvider(env = process.env) {
  return resolveProviders(env)[0] || null;
}

/** Estado público: nunca incluye claves. */
export function aiStatus(env = process.env) {
  const providers = resolveProviders(env);
  const options = listProviders().filter(p => p.id !== 'compatible').map(p => p.id);

  if (!providers.length) {
    return {
      configured: false,
      provider: null,
      model: null,
      fallback: 'expert_rules',
      note: 'No hay proveedor de IA configurado; se usará el motor experto local.',
      options,
      providers: []
    };
  }

  return {
    configured: true,
    provider: providers[0].id,
    providerLabel: providers[0].label,
    model: providers[0].model,
    fallback: 'expert_rules',
    note: 'Proveedores de IA disponibles en cascada. Las claves no se exponen en esta respuesta.',
    options,
    providers: providers.map(p => ({
      id: p.id,
      label: p.label,
      model: p.model,
      free: p.free === true,
      vision: providerSupportsVision(p)
    }))
  };
}

// Tras un fallo no se reintenta ese proveedor en cada consulta: se espera un
// tiempo que sigue lo que indique el proveedor (`Retry-After`) y, si no lo
// indica, es corto. El cooldown es independiente por proveedor (y por modo:
// texto o visión) para no bloquear toda la cadena por un solo servicio caído.
const cooldowns = new Map();

function cooldownKey(provider, mode = 'text') {
  return `${mode}:${provider.id}`;
}

function isCoolingDown(provider, mode = 'text') {
  return Date.now() < (cooldowns.get(cooldownKey(provider, mode)) || 0);
}

function setCooldown(provider, reason, retryAfterMs = 0, mode = 'text') {
  const fallback = reason === 'auth' ? 5 * 60 * 1000 : 60 * 1000;
  const ms = retryAfterMs > 0 ? Math.min(Math.max(retryAfterMs, 1000), 120000) : fallback;
  cooldowns.set(cooldownKey(provider, mode), Date.now() + ms);
}

function clearCooldown(provider, mode = 'text') {
  cooldowns.delete(cooldownKey(provider, mode));
}

export function resetCooldown(id) {
  if (!id) {
    cooldowns.clear();
    return;
  }
  cooldowns.delete(cooldownKey({ id }, 'text'));
  cooldowns.delete(cooldownKey({ id }, 'vision'));
}

function classifyError(status) {
  if (status === 429 || status === 402) return 'quota';
  if (status === 401 || status === 403) return 'auth';
  return 'provider_error';
}

// Los modelos de razonamiento (gpt-oss, qwen3, o-series) gastan tokens
// "pensando" antes de escribir. En una capa gratuita con límite de tokens por
// minuto conviene bajarlo: deja más presupuesto para la respuesta útil.
function supportsReasoningEffort(model = '') {
  return /gpt-oss|qwen3|deepseek-r|openai-fast|(^|[\/-])o[34](-|$)/i.test(String(model));
}

function usageLog(provider, data) {
  const usage = data?.usage;
  if (!usage) return;
  const reasoning = usage.completion_tokens_details?.reasoning_tokens;
  console.log(`[IA] ${provider.label}: prompt=${usage.prompt_tokens ?? '?'} completion=${usage.completion_tokens ?? '?'}${reasoning ? ` (razonamiento=${reasoning})` : ''}`);
}

async function callOpenAICompatible(provider, prompt, opts) {
  const { temperature = 0.4, maxOutputTokens = 4096, timeoutMs = 15000 } = opts;
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const effort = String(opts.reasoningEffort ?? process.env.AI_REASONING_EFFORT ?? 'low').trim();
  const useEffort = effort && supportsReasoningEffort(provider.model);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: provider.model,
        messages: [{ role: 'user', content: prompt }],
        temperature,
        max_tokens: maxOutputTokens,
        ...(useEffort ? { reasoning_effort: effort } : {}),
        stream: false
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const status = errData?.error?.code || errData?.error?.status || String(response.status);
      const message = errData?.error?.message || `HTTP ${response.status}`;
      const reason = classifyError(response.status);
      const retryAfter = Number(response.headers.get('retry-after') || 0) * 1000;
      console.warn(`[IA] ${provider.label} respondió ${response.status} (${status}); se prueba el siguiente proveedor.`);
      setCooldown(provider, reason, retryAfter);
      return { ok: false, reason, status: response.status, statusText: String(status), message, retryAfterMs: retryAfter || undefined };
    }

    const data = await response.json();
    usageLog(provider, data);
    const choice = data?.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    const rawFinish = choice?.finish_reason;

    // Algunos servicios gratuitos devuelven un 200 con el aviso de límite en el
    // propio texto (Pollinations: "Free limit reached..."). Eso no es una
    // respuesta: se trata como cuota agotada para no enseñárselo al usuario.
    if (/free limit reached|rate limit|too many requests|quota exceeded/i.test(text) && text.length < 400) {
      setCooldown(provider, 'quota');
      return { ok: false, reason: 'quota', message: text.slice(0, 120) };
    }
    const finishReason = rawFinish === 'length' ? 'MAX_TOKENS' : (rawFinish ? String(rawFinish).toUpperCase() : 'STOP');

    if (!text) {
      setCooldown(provider, 'empty');
      return { ok: false, reason: 'empty', finishReason, message: 'Respuesta vacía' };
    }

    clearCooldown(provider);
    return { ok: true, text, finishReason, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.warn(`[IA] Error en llamada a ${provider.label} (${aborted ? 'timeout' : err.message}); se prueba el siguiente proveedor.`);
    const reason = aborted ? 'timeout' : 'network';
    setCooldown(provider, reason);
    return { ok: false, reason, message: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Pollinations tiene tres puertas distintas al mismo modelo gratuito. Cada una
// falla por su cuenta: el POST /openai se encola a veces durante segundos, el
// GET de texto responde por otra ruta y, si la IP del servidor está limitada,
// un proxy público hace la petición desde otra IP. Se prueban en ese orden
// dentro del mismo proveedor para que una sola puerta caída no deje la web sin
// análisis de IA.
function compactForUrl(prompt, max = 1700) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const head = text.slice(0, 500);
  const tail = text.slice(-(max - 520));
  return `${head} … ${tail}`;
}

function parsePollinationsText(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const data = JSON.parse(text);
      return String(data?.choices?.[0]?.message?.content || data?.text || '').trim();
    } catch { /* texto plano */ }
  }
  return text;
}

async function pollinationsRoute(provider, prompt, opts, route) {
  const timeoutMs = Math.max(2000, Number(opts.timeoutMs) || 8000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // El preset guarda la URL completa del endpoint OpenAI; para el POST se le
  // añade /chat/completions igual que a cualquier proveedor compatible.
  const base = String(opts.baseUrl || provider.baseUrl || 'https://text.pollinations.ai/openai')
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/openai$/, '');

  try {
    let url;
    let init;
    if (route === 'post') {
      // Pollinations expone el formato OpenAI en /openai; una URL base de
      // pruebas tipo .../v1 usa la ruta estándar /chat/completions.
      url = /\/v\d+$/i.test(base) ? `${base}/chat/completions` : `${base}/openai`;
      init = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: opts.temperature ?? 0.35,
          max_tokens: Math.min(Number(opts.maxOutputTokens) || 1600, 2400),
          stream: false
        })
      };
    } else {
      const textBase = String(opts.textBaseUrl || 'https://text.pollinations.ai').replace(/\/+$/, '');
      const textUrl = `${textBase}/${encodeURIComponent(compactForUrl(prompt))}?model=${encodeURIComponent(provider.model)}`;
      url = route === 'proxy'
        ? `https://api.allorigins.win/raw?url=${encodeURIComponent(textUrl)}`
        : textUrl;
      init = { method: 'GET', headers: { 'Accept': 'text/plain,application/json' } };
    }

    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      console.warn(`[IA] Pollinations ruta ${route} respondió ${response.status}; siguiente ruta.`);
      return { ok: false, route, status: response.status, reason: classifyError(response.status) };
    }
    const raw = await response.text();
    const text = parsePollinationsText(raw);
    if (!text) return { ok: false, route, reason: 'empty' };
    if (/free limit reached|rate limit|too many requests|quota exceeded|payment required/i.test(text) && text.length < 400) {
      return { ok: false, route, reason: 'quota', message: text.slice(0, 120) };
    }
    return { ok: true, route, text };
  } catch (err) {
    return { ok: false, route, reason: err.name === 'AbortError' ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callPollinationsFree(provider, prompt, opts) {
  const env = opts.env || process.env;
  const proxyOff = ['0', 'false', 'off', 'no'].includes(String(env.POLLINATIONS_PROXY ?? '').trim().toLowerCase());
  // Las rutas GET solo tienen sentido contra el Pollinations real: con una URL
  // de pruebas propia (servidor local) se usa únicamente el POST.
  const realPollinations = /pollinations\.ai/i.test(String(provider.baseUrl || '')) || Boolean(opts.textBaseUrl);
  const routes = realPollinations ? ['post', 'get', ...(proxyOff ? [] : ['proxy'])] : ['post'];
  const started = Date.now();
  const budget = Math.max(6000, Math.min(Number(opts.timeoutMs) || 18000, 26000));
  const tried = [];

  for (const route of routes) {
    const left = budget - (Date.now() - started);
    if (left < 2500) { tried.push({ route, reason: 'deadline' }); break; }
    // Ruta corta: si una puerta está cerrada, se prueba la siguiente sin
    // dejar al usuario esperando veinte segundos.
    const share = Math.min(left, 6000);
    const result = await pollinationsRoute(provider, prompt, { ...opts, timeoutMs: share }, route);
    if (result.ok) {
      clearCooldown(provider);
      return {
        ok: true,
        text: result.text,
        finishReason: 'STOP',
        model: provider.model,
        provider: provider.id,
        providerLabel: route === 'post' ? provider.label : `${provider.label} · ruta ${route === 'get' ? 'texto' : 'espejo'}`
      };
    }
    tried.push({ route, reason: result.reason || 'provider_error', status: result.status });
  }

  const quota = tried.every(t => t.reason === 'quota');
  const reason = tried.some(t => t.reason === 'quota') ? 'quota' : (tried.some(t => t.reason === 'timeout') ? 'timeout' : 'provider_error');
  setCooldown(provider, quota ? 'quota' : reason);
  return { ok: false, reason, message: `Pollinations: ${tried.map(t => `${t.route}:${t.reason}`).join(', ')}`, errors: tried };
}

async function callGemini(provider, prompt, opts) {
  const { temperature = 0.4, maxOutputTokens = 4096, timeoutMs = 15000 } = opts;
  const url = `${provider.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': provider.apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature,
          maxOutputTokens,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const status = errData?.error?.status || String(response.status);
      const message = errData?.error?.message || `HTTP ${response.status}`;
      const reason = classifyError(response.status);
      console.warn(`[IA] ${provider.label} respondió ${response.status} (${status}); se prueba el siguiente proveedor.`);
      setCooldown(provider, reason);
      return { ok: false, reason, status: response.status, statusText: status, message };
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
    const finishReason = candidate?.finishReason;

    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      const reason = blocked ? 'blocked' : 'empty';
      setCooldown(provider, reason);
      return { ok: false, reason, finishReason, message: blocked || 'Respuesta vacía' };
    }

    clearCooldown(provider);
    return { ok: true, text, finishReason, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.warn(`[IA] Error en llamada a ${provider.label} (${aborted ? 'timeout' : err.message}); se prueba el siguiente proveedor.`);
    const reason = aborted ? 'timeout' : 'network';
    setCooldown(provider, reason);
    return { ok: false, reason, message: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Visión: solo algunos modelos aceptan imágenes. Se comprueba por nombre de
// modelo para no enviar una imagen a un modelo de texto y gastar cuota.
function providerSupportsVision(provider) {
  if (!provider) return false;
  // Pollinations es solo texto.
  if (provider.id === 'pollinations') return false;
  if (provider.kind === 'gemini') return true;
  return /vision|llava|pixtral|llama-4|gpt-4o|gpt-4\.1|claude|o4/i.test(String(provider.model || ''));
}

/**
 * Cadena de proveedores con visión. Se respeta AI_VISION_PROVIDER para poner
 * uno primero; el resto sigue en cascada. Pollinations nunca entra.
 */
export function resolveVisionProviders(env = process.env) {
  const providers = resolveProviders(env).filter(providerSupportsVision).map(p => ({ ...p }));
  const forced = String(env.AI_VISION_PROVIDER || '').trim().toLowerCase();
  let ordered = providers;
  if (forced) {
    const index = providers.findIndex(p => p.id === forced);
    if (index > 0) ordered = [providers[index], ...providers.slice(0, index), ...providers.slice(index + 1)];
  }

  // AI_VISION_MODEL solo debe aplicarse al proveedor elegido para visión; si se
  // aplicara a toda la cadena, un modelo de Gemini podría acabar en OpenAI.
  const visionModel = String(env.AI_VISION_MODEL || '').trim();
  if (visionModel && ordered.length) {
    const targetId = forced && ordered.some(p => p.id === forced) ? forced : ordered[0].id;
    const target = ordered.find(p => p.id === targetId);
    if (target) target.model = visionModel;
  }
  return ordered;
}

/**
 * Proveedor para analizar imágenes. Es independiente del de texto: así se
 * puede chatear con un modelo rápido y usar visión con otro sin tocar nada.
 * Se fuerza con AI_VISION_PROVIDER y AI_VISION_MODEL.
 */
export function resolveVisionProvider(env = process.env) {
  return resolveVisionProviders(env)[0] || null;
}

export function aiVisionStatus(env = process.env) {
  const providers = resolveVisionProviders(env);
  if (providers.length) {
    return {
      available: true,
      provider: providers[0].id,
      providerLabel: providers[0].label,
      model: providers[0].model,
      providers: providers.map(p => p.id)
    };
  }
  const any = resolveProviders(env);
  if (!any.length) return { available: false, reason: 'no_key' };
  return { available: false, reason: 'no_vision', provider: any[0].id, model: any[0].model };
}

function splitDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2].replace(/\s/g, '') };
}

async function callVisionProvider(provider, prompt, image, opts) {
  const { temperature = 0.2, maxOutputTokens = 900, timeoutMs = 30000 } = opts;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const isGemini = provider.kind === 'gemini';
  const url = isGemini
    ? `${provider.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(provider.model)}:generateContent`
    : `${provider.baseUrl.replace(/\/+$/, '')}/chat/completions`;

  const body = isGemini
    ? {
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mime, data: image.base64 } }] }],
        // Sin thinkingConfig: los modelos ligeros de Gemini rechazan
        // thinkingBudget 0 con un 400 y la imagen no necesita razonamiento.
        generationConfig: { temperature, maxOutputTokens }
      }
    : {
        model: provider.model,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.base64}` } }
          ]
        }],
        temperature,
        max_tokens: maxOutputTokens,
        stream: false
      };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: isGemini
        ? { 'Content-Type': 'application/json', 'x-goog-api-key': provider.apiKey }
        : {
            'Content-Type': 'application/json',
            ...(provider.apiKey ? { Authorization: `Bearer ${provider.apiKey}` } : {})
          },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = classifyError(response.status);
      const detail = errData?.error?.message || `HTTP ${response.status}`;
      console.warn(`[IA] ${provider.label} (visión) respondió ${response.status}: ${detail}; se prueba el siguiente proveedor.`);
      setCooldown(provider, reason, Number(response.headers.get('retry-after') || 0) * 1000, 'vision');
      return { ok: false, reason, status: response.status };
    }

    const data = await response.json();
    const text = (isGemini
      ? data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')
      : data?.choices?.[0]?.message?.content || '').trim();

    if (!text) {
      setCooldown(provider, 'empty', 0, 'vision');
      return { ok: false, reason: 'empty' };
    }
    clearCooldown(provider, 'vision');
    return { ok: true, text, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    setCooldown(provider, aborted ? 'timeout' : 'network', 0, 'vision');
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Llama en cascada a todos los proveedores con visión. Nunca lanza excepción
 * hacia la ruta.
 */
export async function callAIVision(prompt, imageDataUrl, opts = {}) {
  const env = opts.env || process.env;
  const providers = resolveVisionProviders(env);
  if (!providers.length) {
    const any = resolveProviders(env);
    return any.length
      ? { ok: false, reason: 'no_vision', providers: any.map(p => p.id) }
      : { ok: false, reason: 'no_key' };
  }

  const image = splitDataUrl(imageDataUrl);
  if (!image) return { ok: false, reason: 'bad_image' };

  const attempts = [];
  for (const provider of providers) {
    if (isCoolingDown(provider, 'vision')) {
      attempts.push({ provider: provider.id, reason: 'cooldown' });
      continue;
    }
    const result = await callVisionProvider(provider, prompt, image, opts);
    if (result.ok) return result;
    attempts.push({ provider: provider.id, reason: result.reason, status: result.status });
  }

  const concrete = attempts.find(a => a.reason !== 'cooldown');
  if (!concrete) return { ok: false, reason: 'cooldown', errors: attempts };
  return {
    ok: false,
    reason: concrete.reason,
    errors: attempts,
    aggregated: true,
    message: `Ningún proveedor con visión respondió (${attempts.map(a => `${a.provider}:${a.reason}`).join(', ')}).`
  };
}

/**
 * Llama al primer proveedor que responda. Nunca lanza excepción hacia la ruta.
 * @returns {Promise<{ok: boolean, text?: string, reason?: string, model?: string, provider?: string, providerLabel?: string, finishReason?: string, errors?: Array}>}
 */
// Pollinations gratis admite una respuesta cada 45 s por IP. Si se le llama más
// a menudo, contesta con el aviso de límite (o tarda hasta un minuto). Se lleva
// un control global para no gastar el turno en vano: mejor caer al motor local
// al instante que hacer esperar al usuario.
const FREE_MIN_INTERVAL_MS = 12 * 1000;
let lastFreeCallAt = 0;

/** Marca el hueco libre de Pollinations (útil en tests y tras un reinicio). */
export function resetFreeThrottle() {
  lastFreeCallAt = 0;
}

export async function callAI(prompt, opts = {}) {
  const env = opts.env || process.env;
  const providers = resolveProviders(env);
  if (!providers.length) return { ok: false, reason: 'no_key' };

  const startedAt = Date.now();
  const budgetMs = Math.max(5000, Math.min(Number(opts.deadlineMs || env.AI_DEADLINE_MS) || 35000, 90000));
  const attempts = [];
  for (const provider of providers) {
    if (isCoolingDown(provider)) {
      attempts.push({ provider: provider.id, reason: 'cooldown' });
      continue;
    }
    if (provider.free && Date.now() - lastFreeCallAt < FREE_MIN_INTERVAL_MS) {
      attempts.push({ provider: provider.id, reason: 'throttled' });
      continue;
    }
    // Presupuesto total de la cadena: aunque queden proveedores, no se puede
    // tener al usuario esperando. Se reparte lo que quede y, agotado, se pasa
    // al motor experto local (que responde al instante).
    const elapsed = Date.now() - startedAt;
    if (elapsed >= budgetMs) {
      attempts.push({ provider: provider.id, reason: 'deadline' });
      break;
    }
    const remaining = budgetMs - elapsed;
    const requestedMax = Number(opts.maxOutputTokens) || 1200;
    // Un proveedor gratuito que no contesta en 12 s está en cola: seguir
    // esperando solo alarga la pantalla. Se corta y se cae al motor local.
    // Las tres rutas gratuitas (POST, texto y espejo) se reparten este tope.
    const hardCap = provider.free ? 22000 : 20000;
    const wantedTimeout = provider.free
      ? Math.max(Number(opts.timeoutMs) || 0, requestedMax > 600 ? 24000 : 16000)
      : (Number(opts.timeoutMs) || 15000);
    const effectiveOpts = {
      ...opts,
      ...(provider.free ? { maxOutputTokens: Math.min(requestedMax, 3000) } : {}),
      timeoutMs: Math.max(2000, Math.min(wantedTimeout, hardCap, remaining))
    };
    const result = provider.kind === 'gemini'
      ? await callGemini(provider, prompt, effectiveOpts)
      : (provider.id === 'pollinations'
        ? await callPollinationsFree(provider, prompt, { ...effectiveOpts, env })
        : await callOpenAICompatible(provider, prompt, effectiveOpts));
    if (provider.free) lastFreeCallAt = Date.now();
    if (result.ok) return result;
    attempts.push({ provider: provider.id, reason: result.reason, status: result.status });
  }

  const concrete = attempts.find(a => a.reason !== 'cooldown');
  if (!concrete) return { ok: false, reason: 'cooldown', errors: attempts };
  return {
    ok: false,
    reason: concrete.reason,
    errors: attempts,
    aggregated: true,
    message: `Ningún proveedor de IA respondió (${attempts.map(a => `${a.provider}:${a.reason}`).join(', ')}).`
  };
}
