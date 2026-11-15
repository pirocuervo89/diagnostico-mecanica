import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
let symptomCache = { mtime: 0, data: [] };
let dtcCache = { mtime: 0, data: [] };

function loadJson(file, cache) {
  try {
    const target = path.join(ROOT, 'data', file);
    const stat = fs.statSync(target);
    if (cache.mtime !== stat.mtimeMs) {
      const data = JSON.parse(fs.readFileSync(target, 'utf8'));
      cache.mtime = stat.mtimeMs;
      cache.data = Array.isArray(data) ? data : [];
    }
    return cache.data;
  } catch {
    return [];
  }
}

function symptoms() {
  return loadJson('symptoms.json', symptomCache);
}

function dtcs() {
  return loadJson('dtc.json', dtcCache);
}

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const STOPWORDS = new Set([
  'para', 'como', 'cuando', 'porque', 'desde', 'hasta', 'sobre', 'entre', 'tiene', 'tengo',
  'hace', 'esta', 'este', 'esto', 'mucho', 'poco', 'pero', 'aunque', 'solo', 'todo', 'nada',
  'coche', 'coches', 'vehiculo', 'motor', 'problema', 'fallo', 'pasa', 'ayer', 'ahora',
  'ruido', 'suena', 'noto', 'siento', 'esta', 'estan', 'del', 'las', 'los', 'con', 'por',
  'una', 'unos', 'unas', 'que', 'muy', 'mas', 'menos', 'poco', 'bastante'
]);

function tokens(value) {
  return [...new Set(fold(value).split(/[^a-z0-9]+/).filter(token => token.length >= 4 && !STOPWORDS.has(token)))];
}

const FLAGS = [
  {
    id: 'frenos',
    test: /no frena|pedal (?:se va|al fondo|al suelo)|freno(?:s)? (?:falla|no responde|bloqueado)|pierde liquido de frenos|fuga.*frenos/,
    level: 'rojo',
    label: 'Frenos',
    why: 'Un fallo de frenos puede dejarte sin capacidad de detener el coche.'
  },
  {
    id: 'temperatura',
    test: /temperatura (?:alta|rojo|max)|aguja.*rojo|se calienta|sobrecalent|refrigerante.*hirviendo|humo blanco.*motor/,
    level: 'rojo',
    label: 'Sobrecalentamiento',
    why: 'Seguir circulando con el motor caliente puede deformar la culata o griparlo.'
  },
  {
    id: 'aceite',
    test: /presion.*aceite|aceite.*presion|testigo.*aceite.*rojo|nivel.*aceite.*bajo|se ha quedado sin aceite/,
    level: 'rojo',
    label: 'Presión de aceite',
    why: 'Sin presión de aceite, el motor puede dañarse en pocos kilómetros.'
  },
  {
    id: 'fuego',
    test: /fuego|llamas|humo.*habitaculo|olor.*quemado|humo.*cable|se quema/,
    level: 'rojo',
    label: 'Posible incendio',
    why: 'Humo o olor a quemado dentro del habitáculo es una emergencia.'
  },
  {
    id: 'combustible',
    test: /fuga.*combustible|gasolina.*fuga|gasoil.*fuga|olor.*gasolina.*fuerte|olor.*combustible/,
    level: 'rojo',
    label: 'Fuga de combustible',
    why: 'Una fuga de combustible puede provocar un incendio.'
  },
  {
    id: 'direccion',
    test: /direccion.*(dura|bloqueada|no gira)|volante.*(duro|bloqueado)|pierde.*direccion/,
    level: 'rojo',
    label: 'Dirección',
    why: 'Si no puedes girar con control, el coche no es seguro.'
  },
  {
    id: 'rueda',
    test: /rueda.*(suelta|salta|bloquea)|vibracion.*rueda.*fuerte|se ha salido.*rueda/,
    level: 'rojo',
    label: 'Rueda',
    why: 'Una rueda suelta o bloqueada puede provocar una pérdida de control.'
  },
  {
    id: 'encendido',
    test: /testigo.*motor.*parpade|check engine.*parpade|parpadea.*motor/,
    level: 'rojo',
    label: 'Fallo de encendido activo',
    why: 'Un testigo de motor parpadeando indica fallos de combustión que pueden dañar el catalizador.'
  },
  {
    id: 'no_arranca',
    test: /no arranca|no enciende|no arranca el motor/,
    level: 'ambar',
    label: 'No arranca',
    why: 'Si no arranca, no es seguro intentar remolcarlo por tus medios.'
  },
  {
    id: 'humo',
    test: /humo (?:negro|azul|gris|blanco)|echa humo/,
    level: 'ambar',
    label: 'Humo',
    why: 'El color y el momento en que sale el humo orientan la causa, pero conviene revisarlo.'
  },
  {
    id: 'ruido',
    test: /ruido metalico|golpeteo|traqueteo|chirrido fuerte|silbido fuerte/,
    level: 'ambar',
    label: 'Ruido anómalo',
    why: 'Un ruido metálico o un golpeteo fuerte puede anunciar una avería cara.'
  },
  {
    id: 'testigo_rojo',
    test: /testigo.*rojo|luz.*roja|se ha encendido.*rojo/,
    level: 'ambar',
    label: 'Testigo rojo',
    why: 'Un testigo rojo suele indicar una avería que no conviene ignorar.'
  }
];

const FLAG_LABELS = {
  frenos: 'Los frenos no responden o el pedal se va al fondo',
  temperatura: 'Temperatura alta o testigo de refrigerante',
  aceite: 'Presión o nivel de aceite bajo',
  fuego: 'Humo o olor a quemado en el habitáculo',
  combustible: 'Olor fuerte a combustible o fuga',
  direccion: 'Dirección dura, bloqueada o con fuga',
  rueda: 'Rueda suelta, bloqueada o vibración muy fuerte',
  encendido: 'Testigo de motor parpadeando',
  no_arranca: 'El coche no arranca',
  humo: 'Humo negro, azul o blanco',
  ruido: 'Ruido metálico, golpeteo o traqueteo',
  testigo_rojo: 'Un testigo rojo encendido'
};

function severityOf(code, record) {
  const raw = fold(record?.severity);
  if (raw.includes('alta') || raw.includes('critic')) return 'alta';
  if (raw.includes('media')) return 'media';
  if (raw.includes('baja')) return 'baja';
  const prefix = String(code || '').toUpperCase()[0];
  if (prefix === 'P') return 'media';
  if (prefix === 'U') return 'media';
  if (prefix === 'C') return 'media';
  if (prefix === 'B') return 'baja';
  return 'media';
}

function findDtcs(text, explicit) {
  const source = String(text || '').toUpperCase();
  const codes = new Set([
    ...(Array.isArray(explicit) ? explicit : String(explicit || '').split(/[^A-Z0-9]+/)),
    ...[...source.matchAll(/\b([PBCU][0-9A-F]{4})\b/g)].map(match => match[1])
  ].map(code => String(code || '').toUpperCase()).filter(code => /^[PBCU][0-9A-F]{4}$/.test(code)));

  const all = dtcs();
  return [...codes].slice(0, 8).map(code => {
    const record = all.find(item => String(item.code || '').toUpperCase() === code);
    return {
      code,
      title: record?.title || 'Código no encontrado en la base local',
      system: record?.system || 'Sistema no identificado',
      severity: severityOf(code, record),
      description: record?.description || '',
      checks: (record?.checks || []).slice(0, 3).map(check => check.text || check).filter(Boolean)
    };
  });
}

function findSymptoms(text, dtcCodes, limit = 5) {
  const words = tokens(text);
  const codeSet = new Set((dtcCodes || []).map(item => item.code));
  if (!words.length && !codeSet.size) return [];
  return symptoms()
    .map(symptom => {
      const haystack = fold(`${symptom.name || symptom.n || ''} ${(symptom.w || []).join(' ')} ${symptom.area || ''} ${symptom.description || ''}`);
      let score = 0;
      let textScore = 0;
      for (const word of words) {
        if (haystack.includes(word)) {
          score += 2;
          textScore += 2;
        }
      }
      if (symptom.relatedDtc?.some(code => codeSet.has(String(code).toUpperCase()))) score += 7;
      return { symptom, score, textScore };
    })
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score || urgencyRank(b.symptom.urgency) - urgencyRank(a.symptom.urgency))
    .slice(0, limit)
    .map(item => ({
      id: item.symptom.id,
      name: item.symptom.name || item.symptom.n,
      area: item.symptom.area || item.symptom.category || '',
      urgency: item.symptom.urgency || 'Media',
      driveRisk: item.symptom.driveRisk || '',
      causes: (item.symptom.commonCauses || item.symptom.causeDetails || []).slice(0, 3).map(cause => cause.text).filter(Boolean),
      checks: (item.symptom.quickChecks || []).slice(0, 4),
      dtc: (item.symptom.relatedDtc || []).slice(0, 5),
      score: item.score,
      textScore: item.textScore
    }));
}

function urgencyRank(value) {
  const folded = fold(value);
  if (folded.includes('muy alta')) return 4;
  if (folded.includes('alta')) return 3;
  if (folded.includes('media')) return 2;
  if (folded.includes('baja')) return 1;
  return 2;
}

function resultFor(level) {
  if (level === 'rojo') {
    return {
      level,
      label: 'No circules',
      canDrive: false,
      headline: 'Detén el coche en un lugar seguro y pide asistencia.',
      tone: 'bad',
      immediate: [
        'Reduce la velocidad sin frenazos bruscos y busca un arcén, área de servicio o salida segura.',
        'Apaga el motor, pon el freno de mano y enciende las luces de emergencia.',
        'Si hay humo, olor a combustible o fuego, baja del coche y aléjate.',
        'Llama al 112 si hay riesgo para personas o al seguro/asistencia en carretera.'
      ],
      avoid: [
        'No sigas hasta el taller si el pedal de freno se va al fondo, la dirección no responde o huele a combustible.',
        'No abras el tapón del refrigerante con el motor caliente.',
        'No intentes arrancar otra vez si hay humo, golpes metálicos fuertes o pérdida de aceite.'
      ]
    };
  }
  if (level === 'ambar') {
    return {
      level,
      label: 'Circula con precaución',
      canDrive: true,
      headline: 'Puedes moverte despacio hasta un taller cercano, sin viajes largos.',
      tone: 'warn',
      immediate: [
        'Evita autopista y aceleraciones fuertes; ve por el camino más corto a un taller.',
        'Vigila temperatura, aceite y cualquier testigo nuevo durante el trayecto.',
        'Si el síntoma empeora, aparece humo o el coche pierde potencia, detente.'
      ],
      avoid: [
        'No sigas si el testigo de motor empieza a parpadear o la temperatura sube.',
        'No hagas un viaje largo ni remolques nada hasta revisarlo.'
      ]
    };
  }
  return {
    level: 'verde',
    label: 'Puedes circular',
    canDrive: true,
    headline: 'No se detectan señales de emergencia, pero conviene revisarlo esta semana.',
    tone: 'ok',
    immediate: [
      'Anota cuándo ocurre y si aparece algún testigo.',
      'Comprueba niveles de aceite y refrigerante en frío.',
      'Pide una revisión si el síntoma se repite o va a más.'
    ],
    avoid: [
      'No ignores un síntoma que empeora.',
      'No cambies piezas sin confirmar la causa.'
    ]
  };
}

function buildWhy(flags, matched, dtcsFound) {
  const why = [];
  for (const flag of flags) why.push(`${flag.label}: ${flag.why}`);
  for (const symptom of matched) {
    if (symptom.urgency && urgencyRank(symptom.urgency) >= 3) {
      why.push(`${symptom.name}: la base lo marca como urgencia ${symptom.urgency.toLowerCase()}.`);
    }
  }
  for (const code of dtcsFound) {
    why.push(`${code.code}: ${code.title} (${code.system}).`);
  }
  return [...new Set(why)].slice(0, 6);
}

export function triageRoad({ text = '', dtc = '', flags: flagIds = [] } = {}) {
  const source = fold(`${text} ${dtc} ${(Array.isArray(flagIds) ? flagIds : []).map(id => FLAG_LABELS[id] || '').join(' ')}`);
  const explicitFlags = new Set(Array.isArray(flagIds) ? flagIds : []);
  const flags = FLAGS.filter(flag => flag.test.test(source) || explicitFlags.has(flag.id));
  const dtcsFound = findDtcs(text, dtc);
  const matched = findSymptoms(text, dtcsFound);
  const highDtcs = dtcsFound.filter(code => code.severity === 'alta');
  const maxSymptom = Math.max(0, ...matched.map(symptom => urgencyRank(symptom.urgency)));
  let level = 'verde';
  if (flags.some(flag => flag.level === 'rojo') || highDtcs.length) level = 'rojo';
  else if (flags.length || dtcsFound.length || maxSymptom >= 2 || matched.length) level = 'ambar';

  const base = resultFor(level);
  const checks = [];
  for (const symptom of matched) checks.push(...(symptom.checks || []));
  for (const code of dtcsFound) checks.push(...(code.checks || []));
  const next = [...new Set(checks)].slice(0, 6);

  if (!next.length) {
    next.push('Anota el síntoma exacto, cuándo aparece y si hay algún testigo encendido.');
    next.push('Revisa niveles de aceite y refrigerante con el motor frío.');
    next.push('Si se repite, pide una lectura de códigos con escáner OBD.');
  }

  const confidence = flags.some(flag => flag.level === 'rojo') || dtcsFound.length || matched.length >= 2
    ? 'alta'
    : matched.length === 1 ? 'media' : 'baja';

  const share = [
    `Triaje en Diagnóstico y Mecánica: ${base.label}`,
    text ? `Síntoma: ${String(text).slice(0, 180)}` : '',
    dtcsFound.length ? `Códigos: ${dtcsFound.map(code => code.code).join(', ')}` : '',
    `Resultado: ${base.headline}`,
    '',
    'Es una orientación, no un diagnóstico. Si hay riesgo, llama al 112.'
  ].filter(Boolean).join('\n');

  return {
    ok: true,
    level: base.level,
    label: base.label,
    tone: base.tone,
    canDrive: base.canDrive,
    headline: base.headline,
    confidence,
    why: buildWhy(flags, matched, dtcsFound),
    immediate: base.immediate,
    avoid: base.avoid,
    symptoms: matched,
    dtcs: dtcsFound,
    next,
    help: {
      emergency: '112',
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=taller+mecanico+cerca+de+mi',
      insuranceHint: 'Llama a la asistencia de tu seguro si el coche no es seguro para circular.'
    },
    share,
    disclaimer: 'Orientación de seguridad basada en el texto y los códigos que has introducido. No sustituye una inspección física ni los servicios de emergencia. Ante cualquier duda, detente.'
  };
}

export { FLAG_LABELS };
