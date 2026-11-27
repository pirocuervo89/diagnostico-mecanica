#!/usr/bin/env node
/**
 * Amplía la biblioteca de tutoriales con vídeos reales de YouTube.
 * Verifica cada vídeo con oEmbed y asigna DTC, síntoma, componente y pieza.
 * Uso: node scripts/import-tutorials-2026.mjs [objetivo]
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SEED = path.join(ROOT, 'data/tutorials-seed.json');
const EXTRA = path.join(ROOT, 'data/tutorials-2026.json');
const CATEGORIES = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/tutorial-categories.json'), 'utf8'));
const TODAY = new Date().toISOString().slice(0, 10);
const TARGET = Math.max(20, Math.min(300, Number(process.argv[2]) || 200));
const SLEEP = ms => new Promise(resolve => setTimeout(resolve, ms));
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const categoryIndex = new Map();
for (const category of CATEGORIES) {
  for (const child of category.children || []) {
    categoryIndex.set(`${category.id}/${child.id}`, { categoryName: category.name, subcategoryName: child.name });
  }
}

// Código, búsqueda, categoría/subcategoría, componente, pieza, síntoma y nivel.
const DTC_TOPICS = [
  ['P0011', 'P0011 codigo fallo solenoide VVT diagnostico', 'distribuciones', 'variadores-de-fase', 'Solenoide de distribución variable', 'solenoide VVT', 'pérdida de potencia y ralentí inestable', 'avanzado'],
  ['P0016', 'P0016 codigo fallo sincronizacion ciguenal arbol de levas', 'distribuciones', 'comprobacion-del-calado', 'Cadena o correa de distribución', 'kit de distribución', 'arranque difícil y pérdida de potencia', 'avanzado'],
  ['P0087', 'P0087 presion de rail demasiado baja diagnostico', 'inyeccion-diesel', 'presion-de-rail', 'Bomba o regulador de alta presión', 'regulador de presión de rail', 'tirones y falta de potencia', 'avanzado'],
  ['P0101', 'P0101 caudalimetro MAF rango diagnostico', 'inyeccion-gasolina', 'mezcla-pobre', 'Caudalímetro MAF', 'caudalímetro', 'tirones y mezcla pobre', 'intermedio'],
  ['P0102', 'P0102 caudalimetro senal baja diagnostico', 'inyeccion-gasolina', 'mezcla-pobre', 'Caudalímetro MAF', 'caudalímetro', 'ralentí inestable y falta de potencia', 'intermedio'],
  ['P0113', 'P0113 sensor temperatura aire admision diagnostico', 'electricidad', 'sensores-de-temperatura', 'Sensor de temperatura del aire', 'sensor IAT', 'arranque difícil y consumo alto', 'intermedio'],
  ['P0128', 'P0128 termostato temperatura refrigerante baja', 'refrigeracion-climatizacion', 'termostatos', 'Termostato', 'termostato', 'no alcanza temperatura y calefacción fría', 'principiante'],
  ['P0171', 'P0171 mezcla pobre banco 1 diagnostico', 'inyeccion-gasolina', 'mezcla-pobre', 'Entrada de aire no medida o inyector', 'sensor MAF', 'tirones y ralentí inestable', 'intermedio'],
  ['P0172', 'P0172 mezcla rica banco 1 diagnostico', 'inyeccion-gasolina', 'mezcla-rica', 'Inyector o sensor de oxígeno', 'sonda lambda', 'consumo alto y humo negro', 'intermedio'],
  ['P0201', 'P0201 inyector cilindro 1 circuito diagnostico', 'inyeccion-gasolina', 'inyectores', 'Inyector del cilindro 1', 'inyector', 'fallo de combustión y motor tembloroso', 'avanzado'],
  ['P0234', 'P0234 sobrepresion turbo diagnostico', 'turbo', 'sobrepresion', 'Válvula wastegate o geometría del turbo', 'válvula wastegate', 'pérdida de potencia y modo emergencia', 'avanzado'],
  ['P0236', 'P0236 sensor presion turbo MAP diagnostico', 'turbo', 'presion-solicitada-y-real', 'Sensor de presión MAP', 'sensor MAP', 'tirones y falta de soplado', 'intermedio'],
  ['P0243', 'P0243 electrovalvula turbo diagnostico', 'turbo', 'electrovalvulas-de-control', 'Electroválvula de control del turbo', 'electroválvula turbo', 'falta de potencia y sobrepresión', 'avanzado'],
  ['P0299', 'P0299 turbo presion insuficiente diagnostico', 'turbo', 'presion-insuficiente', 'Turbo o fuga en el circuito de presión', 'turbo', 'pérdida de potencia y silbido', 'avanzado'],
  ['P0300', 'P0300 fallos de combustion aleatorios diagnostico', 'inyeccion-gasolina', 'fallos-de-combustion', 'Bujías, bobinas o inyectores', 'bujías', 'motor tembloroso y testigo de motor', 'intermedio'],
  ['P0301', 'P0301 fallo combustion cilindro 1 diagnostico', 'inyeccion-gasolina', 'fallos-de-combustion', 'Bujía o bobina del cilindro 1', 'bobina de encendido', 'tirones y ralentí inestable', 'intermedio'],
  ['P0302', 'P0302 fallo combustion cilindro 2 diagnostico', 'inyeccion-gasolina', 'fallos-de-combustion', 'Bujía o bobina del cilindro 2', 'bobina de encendido', 'tirones y ralentí inestable', 'intermedio'],
  ['P0303', 'P0303 fallo combustion cilindro 3 diagnostico', 'inyeccion-gasolina', 'fallos-de-combustion', 'Bujía o bobina del cilindro 3', 'bobina de encendido', 'tirones y ralentí inestable', 'intermedio'],
  ['P0304', 'P0304 fallo combustion cilindro 4 diagnostico', 'inyeccion-gasolina', 'fallos-de-combustion', 'Bujía o bobina del cilindro 4', 'bobina de encendido', 'tirones y ralentí inestable', 'intermedio'],
  ['P0325', 'P0325 sensor detonacion diagnostico', 'inyeccion-gasolina', 'sistemas-de-encendido', 'Sensor de detonación', 'sensor de detonación', 'pérdida de potencia y picado', 'avanzado'],
  ['P0335', 'P0335 sensor ciguenal diagnostico', 'electricidad', 'sensores-de-posicion', 'Sensor de cigüeñal', 'sensor de cigüeñal', 'no arranca o se cala', 'avanzado'],
  ['P0340', 'P0340 sensor arbol de levas diagnostico', 'distribuciones', 'arboles-de-levas', 'Sensor de árbol de levas', 'sensor de árbol de levas', 'arranque difícil y fallos de sincronización', 'avanzado'],
  ['P0351', 'P0351 bobina encendido cilindro 1 diagnostico', 'inyeccion-gasolina', 'sistemas-de-encendido', 'Bobina de encendido', 'bobina de encendido', 'fallo de combustión y tirones', 'intermedio'],
  ['P0401', 'P0401 flujo insuficiente EGR diagnostico', 'egr-dpf', 'valvula-egr', 'Válvula EGR obstruida', 'válvula EGR', 'tirones y humo negro', 'intermedio'],
  ['P0420', 'P0420 eficiencia catalizador baja diagnostico', 'egr-dpf', 'catalizadores', 'Catalizador o sonda lambda', 'catalizador', 'testigo de motor y olor a gasolina', 'avanzado'],
  ['P0442', 'P0442 fuga sistema EVAP diagnostico', 'averias-genericas', 'testigos-encendidos', 'Sistema EVAP o tapa de combustible', 'válvula EVAP', 'testigo de motor y olor a combustible', 'intermedio'],
  ['P0455', 'P0455 fuga grande EVAP diagnostico', 'averias-genericas', 'testigos-encendidos', 'Sistema EVAP o tapa de combustible', 'válvula EVAP', 'testigo de motor y olor a combustible', 'intermedio'],
  ['P0500', 'P0500 sensor velocidad vehiculo diagnostico', 'electricidad', 'sensores-de-posicion', 'Sensor de velocidad', 'sensor de velocidad', 'velocímetro inestable y testigo ABS', 'intermedio'],
  ['P0505', 'P0505 ralenti cuerpo mariposa diagnostico', 'inyeccion-gasolina', 'cuerpo-de-mariposa', 'Cuerpo de mariposa', 'cuerpo de mariposa', 'ralentí inestable y se cala', 'intermedio'],
  ['P0562', 'P0562 tension sistema baja diagnostico', 'electricidad', 'alternador', 'Batería o alternador', 'alternador', 'arranque difícil y testigos encendidos', 'intermedio'],
  ['P0700', 'P0700 fallo transmision diagnostico', 'transmision', 'diagnosis-electronica', 'Aceite o solenoide de la caja automática', 'aceite ATF', 'caja en emergencia y tirones', 'avanzado'],
  ['P0741', 'P0741 convertidor par deslizamiento diagnostico', 'transmision', 'convertidores-de-par', 'Convertidor de par o solenoide', 'aceite ATF', 'tirones y sobrecalentamiento de caja', 'avanzado'],
  ['P2002', 'P2002 filtro particulas eficiencia baja diagnostico', 'egr-dpf', 'filtro-de-particulas-diesel', 'Filtro de partículas o sensor diferencial', 'sensor de presión diferencial DPF', 'pérdida de potencia y regeneraciones fallidas', 'avanzado'],
  ['P2015', 'P2015 colector admision diagnostico', 'egr-dpf', 'colectores-de-admision', 'Colector de admisión variable', 'colector de admisión', 'tirones y falta de potencia', 'avanzado'],
  ['P2122', 'P2122 sensor pedal acelerador diagnostico', 'inyeccion-gasolina', 'cuerpo-de-mariposa', 'Sensor del pedal del acelerador', 'sensor de pedal', 'aceleración irregular y modo emergencia', 'avanzado'],
  ['P2135', 'P2135 sensores pedal acelerador correlacion', 'inyeccion-gasolina', 'cuerpo-de-mariposa', 'Sensor del pedal del acelerador', 'sensor de pedal', 'aceleración irregular y modo emergencia', 'avanzado'],
  ['P2183', 'P2183 sensor temperatura refrigerante diagnostico', 'refrigeracion-climatizacion', 'sensores-de-temperatura', 'Sensor de temperatura del refrigerante', 'sensor de temperatura refrigerante', 'temperatura errónea y ventilador loco', 'intermedio'],
  ['P2463', 'P2463 filtro particulas saturado diagnostico', 'egr-dpf', 'filtro-de-particulas-diesel', 'Filtro de partículas diésel', 'filtro de partículas DPF', 'pérdida de potencia y aviso de DPF', 'avanzado'],
  ['U0100', 'U0100 perdida comunicacion centralita motor', 'centralitas-diagnosis', 'falta-de-comunicacion', 'Centralita del motor o cableado CAN', 'centralita motor', 'no arranca y testigos de comunicación', 'avanzado'],
  ['C0035', 'C0035 sensor rueda delantera izquierda ABS', 'frenos-abs', 'sensores-de-rueda', 'Sensor de rueda ABS', 'sensor ABS', 'testigo ABS y control de estabilidad', 'intermedio']
];

const PROCEDURE_TOPICS = [
  ['cambio aceite y filtro', 'como cambiar aceite y filtro coche tutorial', 'mantenimientos', 'cambio-de-aceite-y-filtro', 'Aceite y filtro de aceite', 'filtro de aceite', 'mantenimiento', 'principiante'],
  ['filtro de aire', 'como cambiar filtro de aire coche tutorial', 'mantenimientos', 'filtro-de-aire', 'Filtro de aire', 'filtro de aire', 'mantenimiento', 'principiante'],
  ['filtro de habitaculo', 'como cambiar filtro de habitaculo coche tutorial', 'mantenimientos', 'filtro-de-habitaculo', 'Filtro de habitáculo', 'filtro de habitáculo', 'aire acondicionado con olor', 'principiante'],
  ['filtro combustible', 'como cambiar filtro de combustible diesel tutorial', 'mantenimientos', 'filtro-de-combustible', 'Filtro de combustible', 'filtro de combustible', 'tirones y arranque difícil', 'intermedio'],
  ['bujias', 'como cambiar bujias coche tutorial', 'mantenimientos', 'bujias', 'Bujías', 'bujías', 'fallos de combustión', 'principiante'],
  ['calentadores', 'como cambiar calentadores diesel tutorial', 'mantenimientos', 'calentadores-diesel', 'Calentadores diésel', 'calentadores diésel', 'arranque difícil en frío', 'intermedio'],
  ['bateria', 'como cambiar bateria coche tutorial', 'mantenimientos', 'bateria-de-12-v', 'Batería de 12 V', 'batería', 'no arranca', 'principiante'],
  ['correa distribucion', 'como cambiar correa de distribucion tutorial', 'distribuciones', 'correa-de-distribucion', 'Correa de distribución', 'kit de distribución', 'mantenimiento crítico', 'avanzado'],
  ['cadena distribucion', 'como comprobar cadena de distribucion ruido', 'distribuciones', 'cadena-de-distribucion', 'Cadena de distribución', 'kit de cadena de distribución', 'ruido de distribución', 'avanzado'],
  ['bomba agua', 'como cambiar bomba de agua coche tutorial', 'mantenimientos', 'bomba-de-agua', 'Bomba de agua', 'bomba de agua', 'pérdida de refrigerante', 'avanzado'],
  ['termostato', 'como cambiar termostato coche tutorial', 'mantenimientos', 'termostato', 'Termostato', 'termostato', 'no alcanza temperatura', 'intermedio'],
  ['refrigerante', 'como cambiar refrigerante coche purgar circuito', 'mantenimientos', 'refrigerante-y-anticongelante', 'Refrigerante', 'refrigerante', 'sobrecalentamiento', 'principiante'],
  ['liquido frenos', 'como cambiar liquido de frenos coche tutorial', 'mantenimientos', 'liquido-de-frenos', 'Líquido de frenos', 'líquido de frenos DOT 4', 'pedal esponjoso', 'intermedio'],
  ['pastillas freno', 'como cambiar pastillas de freno delanteras tutorial', 'frenos-abs', 'pastillas-de-freno', 'Pastillas de freno', 'pastillas de freno', 'frenada con ruido', 'principiante'],
  ['discos freno', 'como cambiar discos y pastillas de freno tutorial', 'frenos-abs', 'discos-de-freno', 'Discos de freno', 'discos de freno', 'vibración al frenar', 'intermedio'],
  ['purgado frenos', 'como purgar frenos coche tutorial', 'frenos-abs', 'purgado', 'Purgado del circuito de frenos', 'líquido de frenos', 'pedal esponjoso', 'intermedio'],
  ['sensor ABS', 'como cambiar sensor ABS coche tutorial', 'frenos-abs', 'sensores-de-rueda', 'Sensor de rueda ABS', 'sensor ABS', 'testigo ABS encendido', 'intermedio'],
  ['amortiguadores', 'como cambiar amortiguadores coche tutorial', 'direccion-suspension', 'amortiguadores', 'Amortiguadores', 'amortiguadores', 'ruido y rebote', 'avanzado'],
  ['rotulas', 'como cambiar rotula suspension coche tutorial', 'direccion-suspension', 'rotulas', 'Rótulas de suspensión', 'rótulas', 'golpeteo en baches', 'avanzado'],
  ['embrague', 'como cambiar embrague coche tutorial', 'transmision', 'embragues', 'Kit de embrague', 'kit de embrague', 'patinazo y olor', 'avanzado'],
  ['volante bimasa', 'como comprobar volante bimasa embrague', 'transmision', 'volantes-bimasa', 'Volante bimasa', 'volante bimasa', 'vibración al arrancar', 'avanzado'],
  ['aceite caja automatica', 'como cambiar aceite caja automatica tutorial', 'mantenimientos', 'mantenimiento-de-cajas-automaticas', 'Aceite de caja automática', 'aceite ATF', 'tirones en cambios', 'avanzado'],
  ['inyectores diesel', 'como comprobar inyectores diesel retorno', 'inyeccion-diesel', 'inyectores-electromagneticos', 'Inyectores diésel', 'inyectores diésel', 'tirones y humo', 'avanzado'],
  ['limpieza EGR', 'como limpiar valvula EGR tutorial', 'egr-dpf', 'valvula-egr', 'Válvula EGR', 'válvula EGR', 'tirones y humo negro', 'intermedio'],
  ['limpieza DPF', 'como limpiar filtro de particulas DPF tutorial', 'egr-dpf', 'filtro-de-particulas-diesel', 'Filtro de partículas diésel', 'limpiador DPF', 'pérdida de potencia y regeneraciones', 'avanzado'],
  ['sustituir turbo', 'como cambiar turbo coche tutorial', 'turbo', 'desmontaje-y-montaje', 'Turbocompresor', 'turbo', 'silbido y falta de potencia', 'avanzado'],
  ['sonda lambda', 'como cambiar sonda lambda tutorial', 'egr-dpf', 'sondas-lambda', 'Sonda lambda', 'sonda lambda', 'testigo de motor y consumo', 'intermedio'],
  ['caudalimetro', 'como limpiar o cambiar caudalimetro MAF', 'inyeccion-gasolina', 'mezcla-pobre', 'Caudalímetro MAF', 'caudalímetro', 'tirones y falta de potencia', 'intermedio'],
  ['cuerpo mariposa', 'como limpiar cuerpo de mariposa tutorial', 'inyeccion-gasolina', 'cuerpo-de-mariposa', 'Cuerpo de mariposa', 'cuerpo de mariposa', 'ralentí inestable', 'intermedio'],
  ['alternador', 'como comprobar alternador coche tutorial', 'electricidad', 'alternador', 'Alternador', 'alternador', 'batería que no carga', 'intermedio']
];

const TUNING_TOPICS = [
  ['asientos bucket', 'instalar asientos bucket deportivos coche tutorial', 'carroceria-confort', 'asientos-deportivos', 'Asientos deportivos tipo bucket', 'asientos bucket', 'mejora de sujeción', 'avanzado'],
  ['volante deportivo', 'instalar volante deportivo coche tutorial', 'carroceria-confort', 'volantes-deportivos', 'Volante deportivo', 'volante deportivo', 'mejora de tacto', 'intermedio'],
  ['alfombrillas', 'alfombrillas a medida coche instalacion', 'carroceria-confort', 'alfombrillas-y-acabados', 'Alfombrillas a medida', 'alfombrillas coche', 'acabado y protección', 'principiante'],
  ['body kit', 'instalar body kit coche tutorial', 'carroceria-confort', 'body-kits-y-paragolpes', 'Body kit', 'body kit', 'estética y aerodinámica', 'avanzado'],
  ['paragolpes', 'instalar paragolpes deportivo coche tutorial', 'carroceria-confort', 'body-kits-y-paragolpes', 'Paragolpes deportivo', 'paragolpes deportivo', 'estética', 'avanzado'],
  ['taloneras', 'instalar taloneras coche tutorial', 'carroceria-confort', 'taloneras-y-difusores', 'Taloneras', 'taloneras', 'estética y aerodinámica', 'intermedio'],
  ['downpipe', 'instalar downpipe escape coche tutorial', 'carroceria-confort', 'escape-y-downpipe', 'Downpipe deportivo', 'downpipe', 'más caudal de escape', 'avanzado'],
  ['cola escape', 'instalar cola de escape coche tutorial', 'carroceria-confort', 'colas-de-escape', 'Cola de escape', 'cola de escape', 'estética y sonido', 'principiante'],
  ['bombillas LED', 'instalar bombillas LED coche homologadas tutorial', 'carroceria-confort', 'iluminacion', 'Bombillas LED', 'bombillas LED H7', 'mejora de iluminación', 'principiante'],
  ['llantas', 'cambiar llantas coche medidas ET tutorial', 'direccion-suspension', 'llantas-y-neumaticos', 'Llantas de aleación', 'llantas', 'estética y peso no suspendido', 'intermedio'],
  ['turbo deportivo', 'instalar turbo deportivo coche tutorial', 'turbo', 'desmontaje-y-montaje', 'Turbo de mejora', 'turbo deportivo', 'más potencia', 'avanzado'],
  ['admision deportiva', 'instalar admision deportiva coche tutorial', 'turbo', 'admision-deportiva', 'Admisión deportiva', 'kit de admisión', 'sonido y caudal de aire', 'intermedio'],
  ['llave distancia', 'instalar modulo llave a distancia coche tutorial', 'carroceria-confort', 'cierres-centralizados', 'Módulo de llave a distancia', 'módulo llave a distancia', 'apertura sin llave', 'avanzado'],
  ['arranque boton', 'instalar arranque por boton coche tutorial', 'carroceria-confort', 'cierres-centralizados', 'Módulo de arranque por botón', 'módulo arranque por botón', 'arranque sin llave', 'avanzado'],
  ['Alientech KESS3', 'Alientech KESS3 tutorial reprogramacion', 'herramientas', 'maquinas-de-reprogramacion', 'Alientech KESS3', 'Alientech KESS3', 'lectura y escritura de ECU', 'avanzado'],
  ['Autotuner', 'Autotuner reprogramacion ECU tutorial', 'herramientas', 'maquinas-de-reprogramacion', 'Autotuner', 'Autotuner', 'reprogramación por OBD y bench', 'avanzado'],
  ['Magicmotorsport Flex', 'Magicmotorsport Flex tutorial ECU', 'herramientas', 'maquinas-de-reprogramacion', 'Magicmotorsport Flex', 'Magicmotorsport Flex', 'reprogramación de centralitas', 'avanzado'],
  ['PCMFlash', 'PCMFlash tutorial ECU reprogramacion', 'herramientas', 'maquinas-de-reprogramacion', 'PCMFlash', 'PCMFlash', 'lectura y escritura de ECU', 'avanzado'],
  ['HP Tuners', 'HP Tuners MPVI tutorial tuning', 'herramientas', 'maquinas-de-reprogramacion', 'HP Tuners MPVI', 'HP Tuners MPVI', 'calibración de motor', 'avanzado'],
  ['stage 1', 'reprogramacion stage 1 coche explicacion tutorial', 'centralitas-diagnosis', 'reprogramacion-ecu', 'Reprogramación Stage 1', 'reprogramación stage 1', 'más potencia con hardware de serie', 'avanzado']
];

const STOP = new Set(['para', 'como', 'coche', 'tutorial', 'diagnostico', 'fallo', 'codigo', 'con', 'del', 'las', 'los', 'una', 'instalar', 'cambiar', 'reprogramacion']);
function tokens(text) {
  return fold(text).split(/[^a-z0-9]+/).filter(token => token.length > 3 && !STOP.has(token));
}

function buildTopic(kind, row) {
  if (kind === 'dtc') {
    const [code, q, categoryId, subcategoryId, component, part, symptom, level] = row;
    return { kind, code, q, categoryId, subcategoryId, component, part, symptom, level, sourceType: 'community', riskLevel: 'medio', dtcs: [code] };
  }
  const [key, q, categoryId, subcategoryId, component, part, symptom, level] = row;
  return { kind, key, code: '', q, categoryId, subcategoryId, component, part, symptom, level, sourceType: kind === 'tuning' ? 'educational' : 'community', riskLevel: kind === 'tuning' ? 'medio' : 'bajo', dtcs: [] };
}

const TOPICS = [
  ...DTC_TOPICS.map(row => buildTopic('dtc', row)),
  ...PROCEDURE_TOPICS.map(row => buildTopic('procedure', row)),
  ...TUNING_TOPICS.map(row => buildTopic('tuning', row))
];

function scoreEntry(entry, topic) {
  const title = fold(entry.title || '');
  if (!title || !entry.id) return -99;
  if (/shorts|#short|clip corto/.test(title)) return -99;
  if (/\bmoto\b|scooter|quad|bicicleta/.test(title) && !/moto/.test(fold(topic.q))) return -99;
  if (entry.live_status === 'is_live' || entry.live_status === 'is_upcoming') return -99;
  const duration = Number(entry.duration || 0);
  if (duration && (duration < 60 || duration > 3600)) return -99;
  let score = 0;
  if (topic.code && title.includes(topic.code.toLowerCase())) score += 12;
  for (const token of tokens(topic.q)) if (title.includes(token)) score += 2;
  for (const token of tokens(topic.component)) if (title.includes(token)) score += 2;
  if (/\b(como|cambiar|instalar|reparar|limpiar|diagnostico|solucion|tutorial|guia)\b/.test(title)) score += 1;
  if (duration >= 120 && duration <= 1800) score += 1;
  return score;
}

async function searchTopic(topic) {
  try {
    const { stdout } = await execFileAsync('yt-dlp', [
      '--no-warnings', '--skip-download', '--flat-playlist', '-J', `ytsearch6:${topic.q}`
    ], { maxBuffer: 24 * 1024 * 1024, timeout: 50000 });
    const data = JSON.parse(stdout);
    return (data.entries || [])
      .filter(entry => entry && entry.id)
      .map(entry => ({ entry, score: scoreEntry(entry, topic), topic }))
      .filter(item => item.score >= 3)
      .sort((a, b) => b.score - a.score || Number(b.entry.view_count || 0) - Number(a.entry.view_count || 0))
      .slice(0, 3);
  } catch (error) {
    console.warn(`[búsqueda] ${topic.q}: ${error.message.split('\n')[0]}`);
    return [];
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function languageOf(title) {
  const text = String(title || '');
  if (/[áéíóúñ¿¡]/i.test(text) || /\b(como|cambiar|instalar|reparar|diagnostico|motor|averia|espanol)\b/i.test(fold(text))) {
    return { language: 'es', languageLabel: 'Español' };
  }
  return { language: 'en', languageLabel: 'Inglés' };
}

function durationLabel(seconds) {
  const total = Number(seconds || 0);
  if (!total) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

function makeVideo(entry, topic, meta) {
  const names = categoryIndex.get(`${topic.categoryId}/${topic.subcategoryId}`);
  if (!names) throw new Error(`Categoría de tutorial desconocida: ${topic.categoryId}/${topic.subcategoryId}`);
  const lang = languageOf(meta.title);
  const warnings = [];
  if (topic.categoryId === 'centralitas-diagnosis') warnings.push('La reprogramación solo debe hacerse con herramientas originales, copia de seguridad y conocimiento del protocolo.');
  if (['turbo', 'distribuciones', 'frenos-abs', 'transmision'].includes(topic.categoryId)) warnings.push('Respeta pares de apriete y usa útiles de calado o elevación certificados.');
  const symptom = topic.symptom || '';
  const description = [
    topic.code ? `Código ${topic.code}.` : '',
    symptom ? `Síntoma: ${symptom}.` : '',
    `Pieza probable: ${topic.component}.`,
    `Búsqueda de compra: ${topic.part}.`,
    'Vídeo de YouTube con metadatos verificados por oEmbed; revisa el procedimiento concreto en la ficha del motor antes de aplicarlo.'
  ].filter(Boolean).join(' ');
  return {
    id: `yt-${entry.id}`,
    provider: 'youtube',
    videoId: entry.id,
    url: `https://www.youtube.com/watch?v=${entry.id}`,
    embedUrl: `https://www.youtube.com/embed/${entry.id}`,
    title: String(meta.title || entry.title || '').slice(0, 240),
    channel: String(meta.author_name || entry.uploader || '').slice(0, 120),
    channelUrl: String(meta.author_url || (entry.channel_id ? `https://www.youtube.com/channel/${entry.channel_id}` : '')).slice(0, 500),
    thumbnail: `https://i.ytimg.com/vi/${entry.id}/hqdefault.jpg`,
    description,
    durationSeconds: Number(entry.duration || 0) || null,
    durationLabel: durationLabel(entry.duration),
    language: lang.language,
    languageLabel: lang.languageLabel,
    level: topic.level,
    sourceType: topic.sourceType,
    categoryId: topic.categoryId,
    subcategoryId: topic.subcategoryId,
    categoryName: names.categoryName,
    subcategoryName: names.subcategoryName,
    tags: [topic.code, topic.component, topic.part, symptom, 'tutorial verificado', 'pieza probable', names.categoryName, names.subcategoryName].filter(Boolean).slice(0, 20),
    systems: [names.categoryName],
    brand: '',
    model: '',
    engineCode: '',
    fuel: '',
    yearFrom: null,
    yearTo: null,
    vehicleType: 'coche',
    dtcs: topic.dtcs,
    symptoms: symptom ? [symptom] : [],
    components: [topic.component, `Pieza: ${topic.part}`],
    tools: [],
    free: true,
    embeddable: true,
    license: 'Estándar de YouTube',
    verificationStatus: 'verified',
    verificationSource: 'YouTube oEmbed',
    lastCheckedAt: TODAY,
    publishedLabel: '',
    viewCount: Number(entry.view_count || 0) || null,
    riskLevel: topic.riskLevel,
    warnings,
    market: null
  };
}

async function verify(id) {
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json' } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data?.title) return null;
    return data;
  } catch {
    return null;
  }
}

async function main() {
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  const existing = Array.isArray(seed) ? seed : seed.videos || [];
  const seen = new Set(existing.map(video => video.videoId || String(video.id || '').replace(/^yt-/, '')).filter(Boolean));
  const existingTitles = new Set(existing.map(video => fold(video.title)));
  console.log(`Semilla actual: ${existing.length} vídeos. Objetivo nuevo: ${TARGET}.`);

  const groups = [];
  let done = 0;
  for (let batchStart = 0; batchStart < TOPICS.length; batchStart += 6) {
    const batch = TOPICS.slice(batchStart, batchStart + 6);
    const found = await Promise.all(batch.map(searchTopic));
    groups.push(...found.flat());
    done += batch.length;
    console.log(`Búsquedas: ${done}/${TOPICS.length} · candidatos ${groups.length}`);
    await SLEEP(180);
  }

  const candidates = [];
  for (const item of groups) {
    if (!item?.entry?.id || seen.has(item.entry.id)) continue;
    seen.add(item.entry.id);
    candidates.push(item);
  }
  console.log(`Candidatos únicos: ${candidates.length}. Verificando con oEmbed...`);

  const added = [];
  for (let start = 0; start < candidates.length && added.length < TARGET; start += 8) {
    const batch = candidates.slice(start, start + 8);
    const checks = await Promise.all(batch.map(async item => ({ item, meta: await verify(item.entry.id) })));
    for (const check of checks) {
      if (!check.meta || added.length >= TARGET) continue;
      const titleKey = fold(check.meta.title);
      if (existingTitles.has(titleKey)) continue;
      try {
        const video = makeVideo(check.item.entry, check.item.topic, check.meta);
        existingTitles.add(titleKey);
        added.push(video);
      } catch (error) {
        console.warn(`[ficha] ${check.item.entry.id}: ${error.message}`);
      }
    }
    console.log(`Verificados y añadidos: ${added.length}/${TARGET}`);
  }

  if (added.length < TARGET) console.warn(`Aviso: solo se pudieron verificar ${added.length} vídeos nuevos.`);
  const merged = [...existing, ...added];
  const payload = {
    ...(Array.isArray(seed) ? {} : seed),
    version: Number(seed.version || 1) + 1,
    generatedAt: new Date().toISOString(),
    sourceNote: 'Vídeos de YouTube con metadatos verificados mediante oEmbed. Cada ficha declara DTC, síntoma, componente y pieza probable; no se inventan pasos ni compatibilidades.',
    videos: merged
  };
  fs.writeFileSync(path.join(ROOT, '.tmp', 'tutorials-seed-backup.json'), JSON.stringify(seed, null, 2) + '\n');
  fs.writeFileSync(EXTRA, JSON.stringify({ generatedAt: new Date().toISOString(), target: TARGET, added: added.length, videos: added }, null, 2) + '\n');
  fs.writeFileSync(SEED, JSON.stringify(payload, null, 2) + '\n');
  const byCategory = {};
  for (const video of added) byCategory[video.categoryName] = (byCategory[video.categoryName] || 0) + 1;
  console.log(JSON.stringify({ added: added.length, total: merged.length, byCategory }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
