// Motor de IA del proyecto, independiente del proveedor.
//
// Habla el formato OpenAI (`/chat/completions`), que comparten Groq,
// OpenRouter, Mistral, Cerebras, Together, DeepSeek, OpenAI y los gateways
// compatibles. Google Gemini queda como proveedor alternativo para no romper
// instalaciones que ya tengan su clave.
//
// Si no hay clave, el proveedor falla o se agota la cuota, `callAI` devuelve
// `{ ok: false, reason }` y la ruta usa el motor experto local: la web nunca
// se queda sin respuesta y nunca expone la clave.

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
  }
};

// Orden de preferencia cuando no se fuerza AI_PROVIDER: primero el interruptor
// genérico, después los presets y Gemini al final.
const AUTO_ORDER = ['compatible', 'groq', 'openrouter', 'mistral', 'cerebras', 'openai', 'gemini'];

export function listProviders() {
  return Object.values(PRESETS).map(p => ({
    id: p.id,
    label: p.label,
    model: p.model,
    keyEnv: p.keyEnv,
    kind: p.kind
  }));
}

/**
 * Decide qué proveedor usar leyendo el entorno.
 * Devuelve null si no hay ninguna clave configurada.
 */
export function resolveProvider(env = process.env) {
  const forced = String(env.AI_PROVIDER || '').trim().toLowerCase();
  const model = String(env.AI_MODEL || '').trim();
  const baseUrl = String(env.AI_BASE_URL || '').trim();

  const build = (preset) => {
    const apiKey = String(env[preset.keyEnv] || '').trim();
    if (!apiKey) return null;
    return {
      id: preset.id,
      label: preset.label,
      kind: preset.kind,
      model: model || preset.model,
      baseUrl: baseUrl || preset.baseUrl,
      apiKey
    };
  };

  if (forced) {
    const preset = PRESETS[forced];
    if (!preset) return null;
    return build(preset);
  }

  for (const id of AUTO_ORDER) {
    const provider = build(PRESETS[id]);
    if (provider) {
      // Un servicio compatible necesita una URL: sin ella no hay a dónde llamar.
      if (provider.kind === 'openai' && !provider.baseUrl) continue;
      return provider;
    }
  }
  return null;
}

/** Estado público: nunca incluye claves. */
export function aiStatus(env = process.env) {
  const provider = resolveProvider(env);
  if (!provider) {
    return {
      configured: false,
      provider: null,
      model: null,
      fallback: 'expert_rules',
      note: 'No hay proveedor de IA configurado; se usará el motor experto local.',
      options: listProviders().filter(p => p.id !== 'compatible').map(p => p.id)
    };
  }
  return {
    configured: true,
    provider: provider.id,
    providerLabel: provider.label,
    model: provider.model,
    fallback: 'expert_rules',
    note: 'Proveedor de IA configurado. La clave no se expone en esta respuesta.',
    options: listProviders().filter(p => p.id !== 'compatible').map(p => p.id)
  };
}

// Tras un fallo no se reintenta en cada consulta: se usa el motor local unos
// minutos para no castigar al usuario ni gastar cuota.
let cooldownUntil = 0;

// La espera tras un fallo sigue lo que indique el proveedor (`Retry-After`) y,
// si no lo indica, es corta: bloquear la IA cinco minutos por una consulta
// seguida en una capa gratuita con límite por minuto es peor que reintentar.
function setCooldown(reason, retryAfterMs = 0) {
  const fallback = reason === 'auth' ? 5 * 60 * 1000 : 60 * 1000;
  const ms = retryAfterMs > 0 ? Math.min(Math.max(retryAfterMs, 1000), 120000) : fallback;
  cooldownUntil = Date.now() + ms;
}

export function resetCooldown() {
  cooldownUntil = 0;
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
  return /gpt-oss|qwen3|deepseek-r|(^|[\/-])o[34](-|$)/i.test(String(model));
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
        Authorization: `Bearer ${provider.apiKey}`
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
      console.warn(`[IA] ${provider.label} respondió ${response.status} (${status}); se usará motor local.`);
      setCooldown(reason, retryAfter);
      return { ok: false, reason, status: response.status, statusText: String(status), message, retryAfterMs: retryAfter || undefined };
    }

    const data = await response.json();
    usageLog(provider, data);
    const choice = data?.choices?.[0];
    const text = (choice?.message?.content || '').trim();
    const rawFinish = choice?.finish_reason;
    const finishReason = rawFinish === 'length' ? 'MAX_TOKENS' : (rawFinish ? String(rawFinish).toUpperCase() : 'STOP');

    if (!text) {
      setCooldown('empty');
      return { ok: false, reason: 'empty', finishReason, message: 'Respuesta vacía' };
    }

    cooldownUntil = 0;
    return { ok: true, text, finishReason, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.warn(`[IA] Error en llamada a ${provider.label} (${aborted ? 'timeout' : err.message}); se usará motor local.`);
    const reason = aborted ? 'timeout' : 'network';
    setCooldown(reason);
    return { ok: false, reason, message: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
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
      console.warn(`[IA] ${provider.label} respondió ${response.status} (${status}); se usará motor local.`);
      setCooldown(reason);
      return { ok: false, reason, status: response.status, statusText: status, message };
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
    const finishReason = candidate?.finishReason;

    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      const reason = blocked ? 'blocked' : 'empty';
      setCooldown(reason);
      return { ok: false, reason, finishReason, message: blocked || 'Respuesta vacía' };
    }

    cooldownUntil = 0;
    return { ok: true, text, finishReason, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    console.warn(`[IA] Error en llamada a ${provider.label} (${aborted ? 'timeout' : err.message}); se usará motor local.`);
    const reason = aborted ? 'timeout' : 'network';
    setCooldown(reason);
    return { ok: false, reason, message: err.message };
  } finally {
    clearTimeout(timeoutId);
  }
}

// Visión: solo algunos modelos aceptan imágenes. Se comprueba por nombre de
// modelo para no enviar una imagen a un modelo de texto y gastar cuota.
function providerSupportsVision(provider) {
  if (!provider) return false;
  if (provider.kind === 'gemini') return true;
  return /vision|llava|pixtral|llama-4|gpt-4o|gpt-4\.1|claude|o4/i.test(String(provider.model || ''));
}

// Orden para buscar un proveedor con visión cuando el de texto no la tiene.
// Gemini se comprueba primero: cubre imágenes en su capa gratuita.
const AUTO_VISION_ORDER = ['gemini', 'openai', 'openrouter', 'mistral', 'groq', 'compatible'];

/**
 * Proveedor para analizar imágenes. Es independiente del de texto: así se
 * puede chatear con un modelo rápido y usar visión con otro sin tocar nada.
 * Se fuerza con AI_VISION_PROVIDER (y AI_VISION_MODEL para el modelo).
 */
export function resolveVisionProvider(env = process.env) {
  const forced = String(env.AI_VISION_PROVIDER || '').trim().toLowerCase();
  const visionModel = String(env.AI_VISION_MODEL || '').trim();
  const baseUrl = String(env.AI_BASE_URL || '').trim();

  const build = (preset) => {
    const apiKey = String(env[preset.keyEnv] || '').trim();
    if (!apiKey) return null;
    const provider = {
      id: preset.id,
      label: preset.label,
      kind: preset.kind,
      model: visionModel || preset.model,
      baseUrl: baseUrl || preset.baseUrl,
      apiKey
    };
    // Un servicio compatible sin URL no tiene a dónde enviar la imagen.
    if (provider.kind === 'openai' && !provider.baseUrl) return null;
    return providerSupportsVision(provider) ? provider : null;
  };

  if (forced) {
    const preset = PRESETS[forced];
    return preset ? build(preset) : null;
  }

  // Si el proveedor de texto ya acepta imágenes, se usa el mismo.
  const main = resolveProvider(env);
  if (main && providerSupportsVision(main)) return main;

  for (const id of AUTO_VISION_ORDER) {
    const provider = build(PRESETS[id]);
    if (provider) return provider;
  }
  return null;
}

export function aiVisionStatus(env = process.env) {
  const provider = resolveVisionProvider(env);
  if (provider) {
    return { available: true, provider: provider.id, providerLabel: provider.label, model: provider.model };
  }
  const any = resolveProvider(env);
  if (!any) return { available: false, reason: 'no_key' };
  return { available: false, reason: 'no_vision', provider: any.id, model: any.model };
}

function splitDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  return { mime: match[1], base64: match[2].replace(/\s/g, '') };
}

/**
 * Llama al proveedor activo con una imagen. Nunca lanza excepción hacia la ruta.
 */
export async function callAIVision(prompt, imageDataUrl, opts = {}) {
  const provider = resolveVisionProvider(opts.env || process.env);
  if (!provider) {
    const any = resolveProvider(opts.env || process.env);
    return any
      ? { ok: false, reason: 'no_vision', provider: any.id, model: any.model }
      : { ok: false, reason: 'no_key' };
  }
  if (Date.now() < cooldownUntil) return { ok: false, reason: 'cooldown' };

  const image = splitDataUrl(imageDataUrl);
  if (!image) return { ok: false, reason: 'bad_image' };

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
        : { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const reason = classifyError(response.status);
      const detail = errData?.error?.message || `HTTP ${response.status}`;
      console.warn(`[IA] ${provider.label} (visión) respondió ${response.status}: ${detail}; se pide selección manual.`);
      setCooldown(reason, Number(response.headers.get('retry-after') || 0) * 1000);
      return { ok: false, reason, status: response.status };
    }

    const data = await response.json();
    const text = (isGemini
      ? data?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('')
      : data?.choices?.[0]?.message?.content || '').trim();

    if (!text) {
      setCooldown('empty');
      return { ok: false, reason: 'empty' };
    }
    cooldownUntil = 0;
    return { ok: true, text, model: provider.model, provider: provider.id, providerLabel: provider.label };
  } catch (err) {
    const aborted = err.name === 'AbortError';
    setCooldown(aborted ? 'timeout' : 'network');
    return { ok: false, reason: aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Llama al proveedor activo. Nunca lanza excepción hacia la ruta.
 * @returns {Promise<{ok: boolean, text?: string, reason?: string, model?: string, provider?: string, providerLabel?: string, finishReason?: string}>}
 */
export async function callAI(prompt, opts = {}) {
  const provider = resolveProvider(opts.env || process.env);
  if (!provider) return { ok: false, reason: 'no_key' };
  if (Date.now() < cooldownUntil) return { ok: false, reason: 'cooldown' };

  if (provider.kind === 'gemini') return callGemini(provider, prompt, opts);
  return callOpenAICompatible(provider, prompt, opts);
}
