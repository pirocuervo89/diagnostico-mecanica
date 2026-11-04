import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { callAIVision, aiVisionStatus } from './ai_provider.js';
import { cleanText } from './forum_db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const DATA_PATH = process.env.WARNING_LIGHTS_PATH || path.join(ROOT, 'data', 'warning-lights.json');

const SEVERITY_ORDER = ['critico', 'grave', 'precaucion', 'informativo'];
const COLORS = ['rojo', 'amarillo', 'verde', 'azul', 'blanco'];
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

let cache = { mtime: 0, data: null };

function load() {
  const stat = fs.statSync(DATA_PATH);
  if (stat.mtimeMs !== cache.mtime) {
    cache = { mtime: stat.mtimeMs, data: JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')) };
  }
  return cache.data;
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function resolveSources(light, all) {
  return (light.sourceRefs || [])
    .map(key => all[key])
    .filter(source => source && /^https:\/\//.test(source.url))
    .map(source => ({ title: source.title, url: source.url }));
}

function publicLight(light, data) {
  return {
    id: light.id,
    name: light.name,
    color: light.color,
    severity: light.severity,
    severityLabel: data.severityLabels?.[light.severity] || light.severity,
    glyph: light.glyph,
    system: light.system,
    meaning: light.meaning,
    driverText: light.driverText,
    technicalText: light.technicalText,
    causes: light.causes || [],
    relatedFaults: light.relatedFaults || [],
    symptoms: light.symptoms || [],
    checks: light.checks || [],
    solutions: light.solutions || [],
    drivingRisk: light.drivingRisk,
    actNow: Boolean(light.actNow),
    brands: light.brands,
    differences: light.differences,
    confidence: light.confidence || 'general',
    imageNote: light.imageNote,
    sources: resolveSources(light, data.sources || {})
  };
}

function summary(light, data) {
  return {
    id: light.id,
    name: light.name,
    color: light.color,
    severity: light.severity,
    severityLabel: data.severityLabels?.[light.severity] || light.severity,
    glyph: light.glyph,
    system: light.system,
    actNow: Boolean(light.actNow),
    short: String(light.meaning || '').split('. ')[0] + '.',
    sourceCount: (light.sourceRefs || []).length
  };
}

export function listLights({ q = '', color = '', severity = '' } = {}) {
  const data = load();
  const query = fold(q);
  const wantedColor = fold(color);
  const wantedSeverity = fold(severity);
  const items = data.lights
    .filter(light => !wantedColor || fold(light.color) === wantedColor)
    .filter(light => !wantedSeverity || fold(light.severity) === wantedSeverity)
    .filter(light => !query || fold([
      light.name, light.meaning, light.system, light.brands, light.differences,
      (light.symptoms || []).join(' '), (light.causes || []).join(' ')
    ].join(' ')).includes(query))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) || a.name.localeCompare(b.name, 'es'));
  return {
    items: items.map(light => summary(light, data)),
    total: items.length,
    colors: COLORS,
    severities: SEVERITY_ORDER.map(key => ({ key, label: data.severityLabels?.[key] || key })),
    notice: data.notice
  };
}

export function getLight(id) {
  const data = load();
  const light = data.lights.find(item => item.id === String(id || ''));
  if (!light) return null;
  return publicLight(light, data);
}

export function catalogStats() {
  const data = load();
  const byColor = {};
  const bySeverity = {};
  for (const light of data.lights) {
    byColor[light.color] = (byColor[light.color] || 0) + 1;
    bySeverity[light.severity] = (bySeverity[light.severity] || 0) + 1;
  }
  return {
    lights: data.lights.length,
    byColor,
    bySeverity,
    severities: SEVERITY_ORDER.map(key => ({ key, label: data.severityLabels?.[key] || key })),
    colors: COLORS,
    sourceCount: Object.keys(data.sources || {}).length,
    version: data.version,
    notice: data.notice,
    vision: aiVisionStatus()
  };
}

function candidatesFor({ color = '', hint = '' } = {}) {
  const data = load();
  const wantedColor = fold(color);
  const needle = fold(hint);
  const scored = data.lights.map(light => {
    let score = 0;
    if (wantedColor && fold(light.color) === wantedColor) score += 4;
    if (needle) {
      const haystack = fold([light.name, light.meaning, light.system, light.symptoms, light.causes].join(' '));
      for (const token of needle.split(/\s+/).filter(token => token.length > 3)) {
        if (haystack.includes(token)) score += 2;
      }
    }
    return { light, score };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  return scored.map(({ light, score }) => ({ ...summary(light, data), score }));
}

function parseAIJson(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function decodeImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw Object.assign(new Error('Formato no admitido. Usa una foto JPG, PNG o WebP.'), { status: 415 });
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw Object.assign(new Error('La imagen está vacía.'), { status: 400 });
  if (buffer.length > MAX_IMAGE_BYTES) throw Object.assign(new Error('La imagen supera 4 MB. Redúcela antes de subirla.'), { status: 413 });
  return { mime: match[1], dataUrl: `data:${match[1]};base64,${buffer.toString('base64')}` };
}

const SYSTEM_PROMPT = `Eres un técnico de automoción que identifica testigos del cuadro de instrumentos.
Responde SOLO con un JSON válido, sin texto alrededor, con esta forma:
{"identified": true|false, "candidates": [{"id": "<id del catálogo>", "confidence": 0-100}], "color": "rojo|amarillo|verde|azul|blanco", "driverText": "...", "technicalText": "...", "severity": "critico|grave|precaucion|informativo", "safety": "...", "needs": ["color","modelo","año","motor"]}
Reglas: no inventes averías; si el símbolo no se ve con claridad, identified=false y explica qué falta; usa solo ids del catálogo; no superes 120 palabras por explicación.`;

export async function analyzeWarningPhoto({ dataUrl, color = '', hint = '', context = {}, lightId = '' } = {}) {
  const data = load();
  if (lightId) {
    const light = getLight(lightId);
    if (!light) throw Object.assign(new Error('Ese testigo no está en el catálogo.'), { status: 404 });
    return { selected: light, analysis: null, candidates: [], note: 'Ficha seleccionada manualmente: no hay diagnóstico automático.' };
  }

  const cleanHint = cleanText(hint, 240);
  const cleanColor = COLORS.includes(fold(color)) ? fold(color) : '';
  let image = null;
  if (dataUrl) image = decodeImage(dataUrl);

  const localCandidates = candidatesFor({ color: cleanColor, hint: cleanHint });
  const askFor = [];
  if (!cleanColor) askFor.push('color');
  if (!image && !cleanHint) askFor.push('foto o descripción');
  if (!context.brand) askFor.push('marca');
  if (!context.model) askFor.push('modelo');

  if (!image) {
    return {
      identified: false,
      analysis: null,
      candidates: localCandidates,
      color: cleanColor || null,
      note: localCandidates.length
        ? 'Sin fotografía no se identifica el símbolo: elige el testigo que se parece al del cuadro y abre su ficha.'
        : 'Indica el color del testigo o describe qué ves para acotar el catálogo.',
      needs: askFor,
      vision: aiVisionStatus()
    };
  }

  const catalog = data.lights.map(light => `${light.id} :: ${light.name} (${light.color}, ${light.severity})`).join('\n');
  const prompt = `${SYSTEM_PROMPT}\n\nCatálogo disponible:\n${catalog}\n\nDatos del vehículo: ${JSON.stringify({
    brand: cleanColor ? context.brand || '' : context.brand || '',
    model: context.model || '',
    year: context.year || '',
    engine: context.engine || ''
  })}\nPista del usuario: ${cleanHint || '(ninguna)'}`;

  const ai = await callAIVision(prompt, image.dataUrl, { temperature: 0.2, maxOutputTokens: 900, timeoutMs: 30000 });
  const vision = aiVisionStatus();

  if (!ai.ok) {
    return {
      identified: false,
      analysis: null,
      candidates: localCandidates,
      color: cleanColor || null,
      note: vision.available
        ? 'El proveedor de IA no respondió. Elige el testigo en el catálogo para ver la ficha completa.'
        : 'No hay proveedor de IA con visión configurado, así que no se identifica la foto automáticamente. Elige el testigo del catálogo: ninguna ficha se inventa.',
      needs: askFor,
      vision: aiVisionStatus(),
      aiReason: ai.reason
    };
  }

  const parsed = parseAIJson(ai.text);
  if (!parsed) {
    return {
      identified: false,
      analysis: null,
      candidates: localCandidates,
      color: cleanColor || null,
      note: 'La respuesta de la IA no se pudo interpretar. Elige el testigo en el catálogo.',
      needs: askFor,
      vision
    };
  }

  const valid = (parsed.candidates || [])
    .map(candidate => {
      const light = data.lights.find(item => item.id === String(candidate.id || ''));
      if (!light) return null;
      const confidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
      return { ...publicLight(light, data), confidence };
    })
    .filter(Boolean)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  const identified = Boolean(parsed.identified) && valid.length > 0 && valid[0].confidence >= 55;

  return {
    identified,
    analysis: {
      driverText: cleanText(parsed.driverText, 900),
      technicalText: cleanText(parsed.technicalText, 1200),
      severity: SEVERITY_ORDER.includes(parsed.severity) ? parsed.severity : null,
      safety: cleanText(parsed.safety, 500),
      providerLabel: ai.providerLabel,
      model: ai.model
    },
    candidates: valid,
    color: COLORS.includes(fold(parsed.color)) ? fold(parsed.color) : cleanColor || null,
    note: identified
      ? 'Identificación orientativa: confirma que el símbolo coincide con la ficha antes de actuar.'
      : 'La IA no identifica el símbolo con suficiente confianza. Elige el testigo del catálogo o sube una foto más nítida.',
    needs: identified ? [] : askFor,
    vision
  };
}
