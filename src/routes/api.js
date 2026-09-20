import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const router = express.Router();

function readJSON(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8'));
  } catch (e) {
    console.error(`[DATA] ${name}: ${e.message}`);
    return [];
  }
}

function safeLimit(value, fallback = 100, max = 500) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n))) : fallback;
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'diagnostico-mecanica', time: new Date().toISOString() });
});

router.get('/stats', (_req, res) => {
  res.json({
    dtc: readJSON('dtc.json').length,
    symptoms: readJSON('symptoms.json').length,
    products: readJSON('products.json').length
  });
});

router.get('/dtc', (req, res) => {
  const { q = '', prefix = '', system = '', scope = '' } = req.query;
  const limit = safeLimit(req.query.limit);
  let list = readJSON('dtc.json');

  if (prefix) list = list.filter(d => String(d.code).startsWith(String(prefix).toUpperCase()));
  if (system) list = list.filter(d => String(d.system).toLowerCase().includes(String(system).toLowerCase()));
  if (scope) list = list.filter(d => d.scope === scope);

  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(d =>
      String(d.code).toLowerCase().includes(s) ||
      String(d.title || '').toLowerCase().includes(s) ||
      String(d.description || '').toLowerCase().includes(s) ||
      String(d.manufacturer || '').toLowerCase().includes(s)
    );
  }
  res.json(list.slice(0, limit));
});

router.get('/dtc/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const item = readJSON('dtc.json').find(d => String(d.code).toUpperCase() === code);
  if (!item) return res.status(404).json({ error: 'Código no encontrado' });
  res.json(item);
});

router.get('/symptoms', (_req, res) => res.json(readJSON('symptoms.json')));

router.get('/symptoms/:id', (req, res) => {
  const item = readJSON('symptoms.json').find(s => s.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Síntoma no encontrado' });
  res.json(item);
});

router.get('/products', (req, res) => {
  const { category = '', subcategory = '', q = '', tags = '' } = req.query;
  let list = readJSON('products.json');

  if (category) list = list.filter(p => p.category === category);
  if (subcategory) list = list.filter(p => p.subcategory === subcategory);

  if (tags) {
    const wanted = String(tags).split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
    list = list.filter(p => (p.tags || []).some(tag => wanted.includes(String(tag).toLowerCase())));
  }

  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter(p =>
      String(p.name).toLowerCase().includes(s) ||
      String(p.description || '').toLowerCase().includes(s) ||
      String(p.manufacturer || '').toLowerCase().includes(s)
    );
  }
  res.json(list);
});

router.get('/products/:id', (req, res) => {
  const item = readJSON('products.json').find(p => p.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(item);
});

router.post('/chat', (req, res) => {
  const { message = '', context = {} } = req.body || {};
  if (typeof message !== 'string' || message.length > 4000) {
    return res.status(400).json({ error: 'Mensaje no válido' });
  }
  res.json({ reply: buildReply(message.trim(), context || {}, readJSON('dtc.json')) });
});

function buildReply(msg, ctx, dtcList) {
  const m = msg.toLowerCase();
  const context = [];
  if (ctx.brand) context.push(`vehículo ${ctx.brand} ${ctx.model || ''} ${ctx.year || ''}`.trim());
  if (ctx.engine) context.push(`motor ${ctx.engine}`);
  if (ctx.dtc) context.push(`código ${ctx.dtc}`);
  if (ctx.symptoms) context.push(`síntomas: ${ctx.symptoms}`);

  const header = context.length ? `Contexto: ${context.join(', ')}.\n\n` : '';

  const codeMatch = msg.match(/\b[PBCU]\d{4}\b/i);
  if (codeMatch) {
    const code = codeMatch[0].toUpperCase();
    const dtc = dtcList.find(d => String(d.code).toUpperCase() === code);
    if (dtc) {
      return header +
        `Sobre el código ${dtc.code}: ${dtc.title}\n\n` +
        `Sistema: ${dtc.system}\n` +
        `Gravedad orientativa: ${dtc.severity}\n\n` +
        `Comprobaciones recomendadas:\n` +
        (dtc.checks || []).slice(0, 5).map((c, i) => `${i + 1}. ${c.text || c}`).join('\n') +
        `\n\nPosibles causas:\n` +
        (dtc.causes || []).slice(0, 4).map(c => `- ${c.text || c}`).join('\n') +
        `\n\nImportante: un DTC identifica una condición detectada por la electrónica; no demuestra por sí solo qué pieza hay que sustituir.`;
    }
    return header + `No tengo ${code} en la base local. Conserva el código exacto y, si puedes, añade marca, modelo, año, motor y síntomas.`;
  }

  if (/no arranca|no enciende|no gira/.test(m)) {
    return header + `Para un problema de arranque, comprueba:\n1. Batería en reposo y durante el arranque.\n2. Bornes y masas.\n3. Si el motor gira o solo hace clic.\n4. Testigo de inmovilizador.\n5. Alimentación/combustible según el motor.\n\nDime marca, modelo, año, motor y si el motor gira para acotar el diagnóstico.`;
  }

  if (/tirone|fallo|inestable|ralenti/.test(m)) {
    return header + `Para tirones o ralentí inestable:\n1. Leer DTC y datos en vivo.\n2. Determinar si falla uno o varios cilindros.\n3. Revisar encendido/inyección según el motor.\n4. Buscar entradas de aire y problemas de admisión.\n5. Comprobar presión de combustible si procede.\n\nSi el testigo de motor parpadea, evita seguir circulando hasta comprobar el problema.`;
  }

  if (/humo/.test(m)) {
    return header + `El color del humo orienta:\n- Negro: exceso de combustible o falta de aire.\n- Azul: consumo de aceite.\n- Blanco persistente con pérdida de refrigerante: investigar entrada de refrigerante.\n- Vapor blanco solo en frío: puede ser condensación.\n\nDime color, temperatura del motor y cuándo aparece.`;
  }

  if (/freno|abs|chirrido/.test(m)) {
    return header + `En frenos, revisa primero:\n1. Pastillas y discos.\n2. Nivel y estado del líquido.\n3. Pinzas y posibles rozamientos.\n4. Vibraciones durante la frenada.\n5. Si hay testigo ABS/ESP, leer el módulo correspondiente.\n\nSi hay metal contra metal o pérdida de frenada, no circules.`;
  }

  if (/calienta|temperatura|refrigerante/.test(m)) {
    return header + `Si el motor se calienta demasiado:\n1. Detén el vehículo si la temperatura entra en zona roja.\n2. Una vez seguro, comprobar nivel y fugas cuando el motor esté frío.\n3. Comprobar funcionamiento del electroventilador.\n4. Revisar termostato, bomba y circulación.\n5. Investigar gases en refrigerante si hay pérdida sin fuga externa.`;
  }

  if (/bateria|descarga|arranque electrico/.test(m)) {
    return header + `Para una batería que se descarga:\n1. Medir tensión en reposo.\n2. Medir tensión con motor en marcha.\n3. Revisar bornes y masas.\n4. Buscar consumo parasitario después de que las unidades entren en reposo.\n5. Comprobar antigüedad y estado real de la batería.`;
  }

  return header + `Puedo ayudarte con diagnóstico automotriz. Para hacerlo con más precisión, dime:\n- Marca y modelo\n- Año\n- Motor\n- Kilómetros\n- Síntoma exacto\n- Cuándo aparece: frío/caliente, acelerando, ralentí, carga, etc.\n- Código DTC si lo tienes\n\nEl diagnóstico es orientativo y debe confirmarse con mediciones y pruebas antes de sustituir piezas.`;
}

export default router;
