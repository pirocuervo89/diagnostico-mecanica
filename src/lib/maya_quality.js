// Capa de criterio de Maya. No llama a ninguna IA: decide qué tipo de pregunta
// es, si merece buscar fuentes, cuánto contraste hay y qué citas son válidas.
// Se mantiene separada de api.js para poder probarla sin arrancar el servidor.

function fold(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const SOCIAL_RE = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|que tal|gracias|muchas gracias|mil gracias|adios|hasta luego|nos vemos|ok|vale|perfecto)\b/;
const SAFETY_RE = /(no frena|pedal.*(fondo|blando|al suelo)|frenos.*(fallan|no responden)|humo.*(habitaculo|dentro)|(habitaculo|dentro).*humo|olor a quemado|olor a combustible|gasolina.*(fuga|gotea)|se acelera solo|acelera solo|sube de vueltas|se revoluciona|desbocad|no se apaga|se queda acelerad|temperatura.*(rojo|maxima)|aguja.*(rojo|maxima)|direccion.*(dura|bloqueada)|airbag.*(testigo|encendido))/;
const VAGUE_RE = /(no va bien|algo raro|hace algo|tiene algo|falla|no se que|no se lo que|me da miedo|esta raro|no funciona bien)/;
const TECH_RE = /(cada cuanto|cada cuantos|intervalo|mantenimiento|precio|cuanto cuesta|compatible|compatibilidad|referencia|recambio|par de apriete|torque|capacidad|litros|viscosidad|homologacion|itv|normativa|procedimiento|como se cambia|como cambiar|donde esta|esquema|fusible|rele|sensor|valvula|inyector|turbo|egr|dpf|fap|correa|cadena|embrague|bateria|alternador|arranque|radiador|termostato|bomba|filtro|bujia|bobina|sonda|caudalimetro|abs|esp|airbag|clima|aire acondicionado)/;
const DIAGNOSIS_RE = /(fallo|averia|ruido|sonido|tiron|humo|luz|testigo|arranc|fren|embrague|turbo|inyect|cambio|bateria|temperatura|aceite|filtro|correa|cadena|suspension|direccion|consumo|potencia|vibra|pierde|gotea|calienta|huele|silba|golpea|ratea)/;

/**
 * Decide el modo de respuesta antes de construir el prompt.
 * - social: saludo/gracias; no diagnosticar ni buscar.
 * - safety: riesgo; la advertencia manda.
 * - clarify: demasiado vago; una sola pregunta.
 * - diagnose: consulta técnica normal.
 */
export function classifyMayaQuery(query, context = {}) {
  const q = fold(query);
  const dtc = (String(context?.dtc || '').toUpperCase().match(/\b[PCBU]\d{4}\b/) || [])[0]
    || (String(query || '').toUpperCase().match(/\b[PCBU]\d{4}\b/) || [])[0]
    || '';
  const words = q.split(/\s+/).filter(Boolean);
  const vehicle = Boolean(context?.vehicleLabel || (context?.brand && context?.model));
  const hasSpecificSymptom = DIAGNOSIS_RE.test(q);
  const technical = TECH_RE.test(q) || Boolean(dtc);
  const safety = SAFETY_RE.test(q);
  const social = SOCIAL_RE.test(q) && words.length <= 6 && !dtc && !hasSpecificSymptom;
  const vague = !social && !safety && !dtc && !vehicle
    && (VAGUE_RE.test(q) || (words.length <= 5 && !technical));

  const mode = safety ? 'safety' : social ? 'social' : vague ? 'clarify' : 'diagnose';
  const needsSources = mode === 'safety' || mode === 'diagnose' || technical;

  return {
    mode,
    needsSources,
    dtc,
    vague,
    safety,
    technical,
    vehicle
  };
}

/**
 * Nivel de contraste: no es una probabilidad, es un recuento de apoyos.
 * Alta = ficha exacta o varias fuentes independientes; baja = solo texto libre.
 */
export function confidenceFor({
  intent = {},
  dtcExact = false,
  engine = false,
  forumCount = 0,
  webCount = 0,
  symptomCount = 0
} = {}) {
  if (intent.mode === 'social') {
    return {
      level: 'na',
      label: 'Sin consulta técnica',
      sources: 0,
      score: 0,
      note: 'Es una conversación breve; no hace falta contraste externo.'
    };
  }

  const forums = Math.max(0, Number(forumCount) || 0);
  const web = Math.max(0, Number(webCount) || 0);
  const sources = forums + web;
  let score = 0;
  if (dtcExact) score += 3;
  if (engine) score += 2;
  // La gravedad no es evidencia: un aviso de seguridad sin fuente sigue
  // siendo contraste bajo y así se muestra, para no dar falsa seguridad.
  if (forums >= 2) score += 2;
  else if (forums === 1) score += 1;
  if (web >= 2) score += 2;
  else if (web === 1) score += 1;
  if (Number(symptomCount) >= 2) score += 1;

  const level = score >= 5 ? 'high' : score >= 2 ? 'medium' : 'low';
  const label = level === 'high'
    ? 'Contraste alto'
    : level === 'medium'
      ? 'Contraste medio'
      : 'Contraste bajo';
  const note = level === 'high'
    ? 'Hay ficha exacta o varias fuentes independientes que apoyan la respuesta.'
    : level === 'medium'
      ? 'Hay algún dato del coche o fuente, pero conviene confirmar lo que dependa de la versión exacta.'
      : 'No hay fuente externa suficiente: lo que no esté en la ficha del coche se marca como no verificado.';

  return { level, label, sources, score, note };
}

/**
 * Quita citas [n] que no correspondan a una fuente entregada. Evita que el
 * modelo invente [7] cuando solo hay tres referencias.
 */
export function sanitizeCitations(text, sourceCount = 0) {
  const max = Math.max(0, Number(sourceCount) || 0);
  return String(text || '').replace(/\[(\d{1,2})\]/g, (match, raw) => {
    const n = Number(raw);
    return n >= 1 && n <= max ? match : '';
  }).replace(/[ \t]{2,}/g, ' ').replace(/\s+([.,;:!?])/g, '$1');
}

/**
 * Instrucciones que se añaden al prompt según el modo y el contraste.
 * No repite el prompt entero: solo cambia el criterio de esta respuesta.
 */
export function evidenceInstruction(intent = {}, confidence = {}) {
  const mode = intent.mode || 'diagnose';
  const modeLine = {
    social: 'Es un saludo o una frase social. Contesta en una o dos frases, no busques averías ni recomiendes piezas.',
    safety: 'Hay un posible riesgo. La primera frase debe ser la advertencia de parar o salir del coche; después, como máximo tres comprobaciones.',
    clarify: 'La consulta es demasiado vaga. Haz UNA sola pregunta concreta (DTC, cuándo ocurre, ruido o testigo) y no lances un diagnóstico largo. Como máximo, dos hipótesis condicionadas a la respuesta.',
    diagnose: 'Es una consulta técnica. Da como máximo tres hipótesis ordenadas y una comprobación concreta para cada una.'
  }[mode];

  const rules = [
    modeLine,
    `Fuentes externas disponibles: ${Number(confidence.sources) || 0}. Ficha DTC exacta: ${intent.dtc ? 'sí' : 'no'}. Nivel de contraste: ${confidence.label || 'sin calcular'}.`,
    'No escribas cifras, pares de apriete, intervalos, precios, referencias ni compatibilidades que no estén en el contexto o en una fuente citada. Si no está, escribe «no verificado».',
    'Cita solo las fuentes que aparecen en el contexto, con su número [n]. No inventes números de fuente ni URLs.',
    'Si dos fuentes se contradicen, dilo expresamente y explica qué dato es más fiable y por qué. No presentes una contradicción como si fuera una certeza.',
    'No uses la palabra «contrastado» si no hay al menos una fuente externa o una ficha exacta que lo respalde.'
  ];
  return rules.join('\n');
}
