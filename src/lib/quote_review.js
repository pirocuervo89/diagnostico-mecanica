const OPERATIONS = [
  {
    id: 'distribucion',
    label: 'Distribución (correa o cadena)',
    test: /distribuci[oó]n|correa de distribuci[oó]n|cadena de distribuci[oó]n|kit de distribuci[oó]n|correa ba[ñn]ada/,
    total: [350, 1500],
    parts: [90, 600],
    labour: [3, 12],
    note: 'Depende mucho del motor: no es lo mismo una correa exterior que una cadena trasera.'
  },
  {
    id: 'embrague',
    label: 'Embrague y volante bimasa',
    test: /embrague|volante bimasa|kit de embrague/,
    total: [550, 1800],
    parts: [250, 1000],
    labour: [4, 10],
    note: 'El bimasa suele ser la pieza más cara; pide referencia y marca.'
  },
  {
    id: 'turbo',
    label: 'Turbo',
    test: /turbo(?:alimentador)?|turbocompresor/,
    total: [700, 2600],
    parts: [450, 1800],
    labour: [3, 8],
    note: 'Antes de cambiarlo hay que confirmar presión, holgura y fugas.'
  },
  {
    id: 'dpf',
    label: 'FAP / DPF / filtro de partículas',
    test: /fap|dpf|filtro de part[ií]culas|part[ií]culas/,
    total: [400, 2200],
    parts: [250, 1600],
    labour: [2, 8],
    note: 'Una limpieza puede ser suficiente; no aceptes sustitución sin diagnosis.'
  },
  {
    id: 'egr',
    label: 'Válvula EGR',
    test: /\begr\b|v[aá]lvula egr|recirculaci[oó]n de gases/,
    total: [180, 750],
    parts: [90, 450],
    labour: [1, 4],
    note: 'Limpieza y sustitución tienen precios muy distintos.'
  },
  {
    id: 'inyectores',
    label: 'Inyectores',
    test: /inyector(?:es)?|inyecci[oó]n/,
    total: [300, 1800],
    parts: [150, 1400],
    labour: [2, 6],
    note: 'Pide prueba de retorno o banco de inyectores antes de sustituir.'
  },
  {
    id: 'frenos_delanteros',
    label: 'Frenos delanteros (discos y/o pastillas)',
    test: /frenos? delanter|pastillas? delanter|discos? delanter|kit de frenos? delanter/,
    total: [100, 480],
    parts: [45, 280],
    labour: [1, 3],
    note: 'Discos y pastillas juntos suelen ser más caros que solo pastillas.'
  },
  {
    id: 'frenos_traseros',
    label: 'Frenos traseros (discos, pastillas o tambores)',
    test: /frenos? trasero|pastillas? trasero|discos? trasero|tambores?|zapatas/,
    total: [90, 500],
    parts: [40, 300],
    labour: [1, 3.5],
    note: 'En tambores cambia el despiece y el reglaje.'
  },
  {
    id: 'frenos',
    label: 'Sistema de frenos',
    test: /\bfrenos?\b|pastillas?|discos? de freno/,
    total: [90, 500],
    parts: [40, 300],
    labour: [1, 3],
    note: 'Falta concreción: pide qué eje y qué piezas.'
  },
  {
    id: 'amortiguadores',
    label: 'Amortiguadores',
    test: /amortiguador(?:es)?|suspensi[oó]n/,
    total: [220, 900],
    parts: [120, 600],
    labour: [2, 5],
    note: 'Se suelen cambiar por pares y hace falta alineación.'
  },
  {
    id: 'neumaticos',
    label: 'Neumáticos',
    test: /neum[aá]tic|rueda(?:s)?|cubierta/,
    total: [90, 1200],
    parts: [60, 1000],
    labour: [0.5, 2],
    note: 'Influye medida, marca, índice de carga y número de ruedas.'
  },
  {
    id: 'bateria',
    label: 'Batería',
    test: /bater[ií]a|acumulador/,
    total: [80, 320],
    parts: [60, 250],
    labour: [0.2, 1],
    note: 'Comprueba amperaje, tecnología y registro de batería si lo necesita.'
  },
  {
    id: 'bujias',
    label: 'Bujías / calentadores',
    test: /buj[ií]as?|calentador(?:es)?/,
    total: [50, 300],
    parts: [20, 180],
    labour: [0.5, 3],
    note: 'En algunos motores hay que desmontar admisión; pide horas.'
  },
  {
    id: 'aceite',
    label: 'Aceite y filtro',
    test: /cambio de aceite|aceite y filtro|filtro de aceite|aceite motor|aceite 5w|aceite 0w|aceite 10w|aceite sae/,
    total: [55, 190],
    parts: [20, 100],
    labour: [0.5, 1.5],
    note: 'Debe incluir la especificación del aceite y la referencia del filtro.'
  },
  {
    id: 'filtros',
    label: 'Filtros de aire, habitáculo o combustible',
    test: /filtro de aire|filtro de habit[aá]culo|filtro antipolen|filtro de combustible|filtro de gasoil/,
    total: [25, 160],
    parts: [10, 100],
    labour: [0.2, 1.5],
    note: 'No confundir con el filtro de aceite.'
  },
  {
    id: 'alternador',
    label: 'Alternador',
    test: /alternador/,
    total: [250, 900],
    parts: [150, 650],
    labour: [1.5, 4],
    note: 'Antes de cambiarlo mide carga, masa y regulador.'
  },
  {
    id: 'arranque',
    label: 'Motor de arranque',
    test: /motor de arranque|arranque|bendex/,
    total: [220, 800],
    parts: [130, 550],
    labour: [1.5, 4],
    note: 'Comprueba batería y relé antes de condenar el motor de arranque.'
  },
  {
    id: 'bomba_agua',
    label: 'Bomba de agua / termostato',
    test: /bomba de agua|termostato/,
    total: [180, 700],
    parts: [70, 450],
    labour: [1.5, 5],
    note: 'Si se cambia con la distribución, la mano de obra se comparte.'
  },
  {
    id: 'radiador',
    label: 'Radiador / refrigeración',
    test: /radiador|refrigerante|anticongelante/,
    total: [180, 800],
    parts: [80, 500],
    labour: [1.5, 5],
    note: 'Confirma si es fuga, tapón, termostato o radiador.'
  },
  {
    id: 'escape',
    label: 'Escape / catalizador',
    test: /catalizador|escape|silencioso|filtro de part[ií]culas/,
    total: [180, 1400],
    parts: [100, 1000],
    labour: [1, 4],
    note: 'Pide referencia y si es universal u original.'
  },
  {
    id: 'aire_acondicionado',
    label: 'Aire acondicionado',
    test: /aire acondicionado|recarga de gas|compresor del aire|carga de gas/,
    total: [60, 900],
    parts: [20, 700],
    labour: [0.5, 4],
    note: 'Una recarga no arregla una fuga; pide prueba de estanqueidad.'
  },
  {
    id: 'diagnosis',
    label: 'Diagnosis / lectura de códigos',
    test: /diagnosis|diagn[oó]stico|lectura de c[oó]digos|esc[aá]ner/,
    total: [25, 100],
    parts: [0, 0],
    labour: [0.2, 1],
    note: 'Si después haces la reparación, pregunta si descuentan la diagnosis.'
  }
];

const MONEY = /(\d{1,3}(?:[.\s]\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)\s*(?:€|eur(?:os)?)/gi;

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function round(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function money(value) {
  return `${new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value || 0))} €`;
}

function parseAmount(raw) {
  const value = String(raw || '').replace(/\s/g, '');
  if (!value) return null;
  let normalized;
  if (value.includes(',')) normalized = value.replace(/\./g, '').replace(',', '.');
  else if ((value.match(/\./g) || []).length === 1 && /\.\d{1,2}$/.test(value)) normalized = value;
  else normalized = value.replace(/\./g, '');
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? round(number) : null;
}

function amountsIn(line) {
  const found = [];
  const source = String(line || '');
  for (const match of source.matchAll(MONEY)) {
    const amount = parseAmount(match[1]);
    if (amount !== null) found.push(amount);
  }
  return found;
}

function lastAmount(line) {
  const values = amountsIn(line);
  return values.length ? values[values.length - 1] : null;
}

function cleanDescription(value) {
  return String(value || '')
    .replace(MONEY, '')
    .replace(/\b(?:importe|total|precio|u\.?d\.?|uds?\.?|cantidad)\b/gi, ' ')
    .replace(/\/\s*h\b/gi, ' ')
    // Sin importes delante, el «2,5 h x» de la mano de obra solo deja basura.
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:h|horas?)\b\s*(?:de\s+trabajo)?\s*[xX×]?\s*/gi, ' ')
    .replace(/[=+\-–—~<>]+\s*$/g, ' ')
    .replace(/^[\s:;,.·\-–—]+|[\s:;,.·\-–—]+$/g, '')
    .replace(/\s+[xX]$/, '')
    .replace(/\s+/g, ' ')
    .slice(0, 120);
}

function parseHours(text) {
  const source = fold(text);
  const matches = [
    ...source.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?)\b/g)
  ].map(m => Number(m[1].replace(',', '.'))).filter(n => n > 0 && n <= 80);
  return matches.length ? Math.max(...matches) : null;
}

function parseLabourRate(text) {
  const source = fold(text);
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)\s*(?:\/|por\s*)\s*(?:h|hora)\b/,
    /(?:mano de obra|m\.?\s?o\.?)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)\s*(?:\/|por\s*)\s*(?:h|hora)\b/,
    /(?:precio|coste)\s*(?:de\s*)?(?:la\s*)?hora[^\d]{0,20}(\d+(?:[.,]\d+)?)/,
    /(?:mano de obra|m\.?\s?o\.?)[^\d]{0,50}(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?\s*(?:\/|por\s*)?\s*(?:h|hora)\b/,
    /(\d+(?:[.,]\d+)?)\s*(?:€|eur(?:os)?)?\s*(?:\/|por\s*)\s*(?:h|hora)\b\s*(?:de\s*)?(?:mano de obra|m\.?\s?o\.?)/
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) {
      const value = Number(match[1].replace(',', '.'));
      if (value > 0 && value <= 300) return round(value);
    }
  }
  return null;
}

function detectOperations(text) {
  const source = fold(text);
  const found = [];
  for (const operation of OPERATIONS) {
    if (operation.test.test(source)) found.push(operation);
  }
  return found.filter(operation => {
    if (operation.id !== 'frenos') return true;
    return !found.some(other => other.id === 'frenos_delanteros' || other.id === 'frenos_traseros');
  });
}

function classifyLine(description) {
  const source = fold(description);
  return OPERATIONS.find(operation => operation.test.test(source)) || null;
}

function parseQuoteText(input) {
  const text = String(input || '').replace(/\r/g, '').trim();
  if (!text) throw Object.assign(new Error('Escribe o sube el presupuesto.'), { status: 400 });
  if (text.length > 30000) throw Object.assign(new Error('El texto del presupuesto es demasiado largo.'), { status: 413 });

  const lines = text.split(/\n|;+/).map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const lower = fold(text);
  const ivaIncluded = /iva\s*(?:incluido|incl\.?)|con\s+iva|iva\s*incluido/.test(lower);
  const ivaMissing = !ivaIncluded && !/\biva\b|\b21\s*%|\b10\s*%/.test(lower);

  let total = null;
  let base = null;
  let iva = null;
  let labourAmount = null;
  const items = [];

  for (const line of lines) {
    const amount = lastAmount(line);
    const folded = fold(line);
    if (amount === null) continue;

    const totalLine = /^(?:total)\b/.test(folded) || /importe total|total a pagar|total presupuesto|presupuesto total/.test(folded);
    if (totalLine && !/subtotal|base imponible|sin iva|a cuenta/.test(folded)) {
      total = amount;
      continue;
    }
    if (/iva\s*(?:incluido|incl\.?)|con\s+iva/.test(folded)) {
      total = amount;
      continue;
    }
    if (/base imponible|subtotal|base\b/.test(folded)) {
      if (base === null) base = amount;
      continue;
    }
    if (/\biva\b|\b21\s*%|\b10\s*%/.test(folded)) {
      if (iva === null) iva = amount;
      continue;
    }
    if (/mano de obra|m\.?\s?o\.?\b|horas? de trabajo/.test(folded)) {
      if (labourAmount === null) labourAmount = amount;
      const hours = parseHours(line);
      const rate = parseLabourRate(line);
      items.push({
        description: cleanDescription(line) || 'Mano de obra',
        amount,
        kind: 'labour',
        hours,
        rate,
        benchmark: null,
        status: 'mano_de_obra'
      });
      continue;
    }

    const description = cleanDescription(line);
    if (!description || description.length < 3) continue;
    const benchmark = classifyLine(description);
    const operationLike = /cambio|sustituci[oó]n|kit|reparaci[oó]n|montaje|desmontaje/.test(fold(description));
    let status = 'sin_referencia';
    if (benchmark) {
      const range = operationLike ? benchmark.total : benchmark.parts;
      const max = range[1];
      const min = range[0];
      if (max > 0 && amount > max * 1.25) status = 'alto';
      else if (max > 0 && amount >= min && amount <= max * 1.25) status = 'en_rango';
      else if (max > 0 && amount < min * 0.6) status = 'bajo';
    }
    items.push({
      description,
      amount,
      kind: 'part',
      benchmark: benchmark ? { id: benchmark.id, label: benchmark.label } : null,
      status
    });
  }

  if (total === null) {
    const itemTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    if (base !== null && iva !== null) total = round(base + iva);
    else if (itemTotal > 0) total = round(itemTotal + (!ivaIncluded && iva !== null ? iva : 0));
    else if (base !== null) total = base;
  }

  const hours = parseHours(text);
  const labourRate = parseLabourRate(text);
  const operations = detectOperations(text);
  const marketMin = operations.reduce((sum, operation) => sum + operation.total[0], 0);
  const marketMax = operations.reduce((sum, operation) => sum + operation.total[1], 0);
  const marketRange = operations.length && marketMax > 0
    ? { min: round(marketMin), max: round(marketMax), mid: round((marketMin + marketMax) / 2) }
    : null;

  return {
    text,
    lines,
    total,
    base,
    iva,
    ivaIncluded,
    ivaMissing,
    hours,
    labourRate,
    labourAmount,
    items,
    operations: operations.map(operation => ({
      id: operation.id,
      label: operation.label,
      total: operation.total,
      parts: operation.parts,
      labour: operation.labour,
      note: operation.note
    })),
    marketRange
  };
}

function duplicateItems(items) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    if (item.kind !== 'part') continue;
    const key = fold(item.description).replace(/[^a-z0-9]+/g, ' ').trim();
    const previous = seen.get(key);
    if (previous && Math.abs(previous.amount - item.amount) < 0.02) {
      duplicates.push(item.description);
    } else {
      seen.set(key, item);
    }
  }
  return duplicates;
}

function verdictFor(parsed) {
  const { total, marketRange, operations, items } = parsed;
  if (!total) {
    return { id: 'sin_total', label: 'Falta el total', tone: 'neutral', difference: null };
  }
  if (!marketRange) {
    return { id: 'sin_referencia', label: 'Sin referencia suficiente', tone: 'neutral', difference: null };
  }
  const difference = Math.round(((total - marketRange.mid) / marketRange.mid) * 100);
  if (total < marketRange.min * 0.55) {
    return { id: 'revisar', label: 'Sospechosamente bajo', tone: 'warn', difference };
  }
  if (difference <= -20) return { id: 'bueno', label: 'Buen precio', tone: 'ok', difference };
  if (difference <= 15) return { id: 'justo', label: 'Precio razonable', tone: 'ok', difference };
  if (difference <= 35) return { id: 'alto', label: 'Algo caro', tone: 'warn', difference };
  return { id: 'muy_alto', label: 'Muy por encima', tone: 'bad', difference };
}

function buildFlags(parsed) {
  const flags = [];
  const { total, marketRange, labourRate, labourAmount, ivaMissing, items, operations } = parsed;

  if (ivaMissing) {
    flags.push({
      level: 'warn',
      title: 'No se ve el IVA',
      detail: 'Confirma si el total lo incluye. Un presupuesto debe desglosar base, IVA y total.'
    });
  }
  if (labourRate && labourRate > 85) {
    flags.push({
      level: 'bad',
      title: `Hora de mano de obra a ${money(labourRate)}`,
      detail: 'Es una tarifa alta para taller independiente en España. Pide que justifiquen horas y operación.'
    });
  } else if (labourRate && labourRate > 60) {
    flags.push({
      level: 'warn',
      title: `Hora de mano de obra a ${money(labourRate)}`,
      detail: 'Está por encima de la media de muchos talleres independientes. Compara con otro presupuesto.'
    });
  }
  if (total && marketRange && total > marketRange.max * 1.25) {
    flags.push({
      level: 'bad',
      title: 'Total por encima del rango',
      detail: `El presupuesto supera en ${money(total - marketRange.max)} el extremo alto orientativo para las operaciones detectadas.`
    });
  }
  if (total && operations.length && !labourAmount && !/\bmano de obra\b/.test(fold(parsed.text))) {
    flags.push({
      level: 'warn',
      title: 'No hay línea de mano de obra',
      detail: 'Pregunta si está incluida en las piezas o si aparecerá después. Un presupuesto cerrado debe reflejarla.'
    });
  }
  if (total && total > 1200 && items.length < 4) {
    flags.push({
      level: 'warn',
      title: 'Presupuesto poco desglosado',
      detail: 'Para ese importe deberían verse referencias, unidades, horas y precio/hora.'
    });
  }
  const duplicates = duplicateItems(items);
  if (duplicates.length) {
    flags.push({
      level: 'warn',
      title: 'Posible línea duplicada',
      detail: `Revisa si está cobrado dos veces: ${duplicates.slice(0, 3).join(', ')}.`
    });
  }
  const generic = items.filter(item => item.kind === 'part' && !item.benchmark && item.amount >= 150);
  if (generic.length) {
    flags.push({
      level: 'warn',
      title: 'Piezas sin referencia',
      detail: 'Hay importes altos sin una operación reconocible. Pide referencia, marca y número de pieza.'
    });
  }
  if (parsed.iva !== null && parsed.base !== null) {
    const expected = parsed.base * 0.21;
    if (Math.abs(parsed.iva - expected) > Math.max(2, expected * 0.08)) {
      flags.push({
        level: 'warn',
        title: 'El IVA no cuadra con el 21 %',
        detail: `Base ${money(parsed.base)} e IVA ${money(parsed.iva)}. Comprueba el tipo aplicado o si hay descuentos.`
      });
    }
  }
  return flags;
}

function buildQuestions(parsed, flags) {
  const questions = [
    '¿El precio es cerrado o puede subir si aparece otra avería?',
    '¿La mano de obra incluye IVA y está desglosada por horas y precio/hora?',
    '¿Qué referencia exacta, marca y garantía tiene cada pieza?',
    '¿La avería está confirmada con una medición o solo con el código de avería?',
    '¿Se descuenta la diagnosis si acepto la reparación?',
    '¿Qué pasa si la pieza nueva no soluciona el fallo?'
  ];
  if (flags.some(flag => flag.title.includes('hora de mano de obra'))) {
    questions.unshift('¿Cuántas horas de mano de obra hay y a qué precio por hora?');
  }
  if (parsed.operations.some(op => op.id === 'dpf' || op.id === 'egr')) {
    questions.unshift('¿Han comprobado si una limpieza evita cambiar la pieza?');
  }
  if (parsed.operations.some(op => op.id === 'distribucion')) {
    questions.unshift('¿Se cambia también la bomba de agua y los tensores?');
  }
  if (parsed.items.some(item => item.kind === 'part' && !item.benchmark)) {
    questions.push('¿Puede enviarme el presupuesto con el despiece completo y referencias?');
  }
  return [...new Set(questions)].slice(0, 7);
}

function buildSummary(parsed, verdict, flags) {
  if (!parsed.total) {
    return 'No se ha podido identificar un total. Revisa que el documento incluya el importe final o escríbelo a mano.';
  }
  if (!parsed.marketRange) {
    return `El presupuesto es de ${money(parsed.total)}, pero no se reconoce una operación concreta. Pide que detallen piezas, horas y referencias antes de comparar.`;
  }
  const { min, max } = parsed.marketRange;
  if (verdict.id === 'muy_alto') {
    return `El total de ${money(parsed.total)} está muy por encima del rango orientativo (${money(min)}–${money(max)}). Antes de aceptar, pide otro presupuesto y exige el desglose de horas y referencias.`;
  }
  if (verdict.id === 'alto') {
    return `El total de ${money(parsed.total)} queda algo por encima del rango orientativo (${money(min)}–${money(max)}). No es una locura, pero merece una segunda llamada.`;
  }
  if (verdict.id === 'bueno') {
    return `El total de ${money(parsed.total)} está por debajo del rango orientativo (${money(min)}–${money(max)}). Comprueba que no falten piezas, IVA o mano de obra.`;
  }
  if (verdict.id === 'revisar') {
    return `El total de ${money(parsed.total)} es sospechosamente bajo para las operaciones detectadas. Pregunta qué incluye exactamente y si hay piezas de segunda mano o mano de obra fuera.`;
  }
  return `El total de ${money(parsed.total)} entra dentro del rango orientativo (${money(min)}–${money(max)}). Revisa igualmente referencias, garantía y si el presupuesto es cerrado.`;
}

export function reviewQuoteText(text) {
  const parsed = parseQuoteText(text);
  const verdict = verdictFor(parsed);
  const flags = buildFlags(parsed);
  const questions = buildQuestions(parsed, flags);
  const summary = buildSummary(parsed, verdict, flags);
  const savings = verdict.id === 'muy_alto' || verdict.id === 'alto'
    ? round(Math.max(0, parsed.total - parsed.marketRange.max))
    : 0;

  const whatsapp = [
    'Hola, he revisado este presupuesto con Diagnóstico y Mecánica:',
    `Total: ${parsed.total ? money(parsed.total) : 'no detectado'}`,
    parsed.marketRange ? `Rango orientativo: ${money(parsed.marketRange.min)}–${money(parsed.marketRange.max)}` : '',
    `Valoración: ${verdict.label}${verdict.difference !== null ? ` (${verdict.difference > 0 ? '+' : ''}${verdict.difference} % sobre el centro del rango)` : ''}`,
    savings ? `Posible ahorro frente al extremo alto: ${money(savings)}` : '',
    '',
    'Antes de aceptar, preguntaría:',
    ...questions.slice(0, 5).map((question, index) => `${index + 1}. ${question}`),
    '',
    'Es una orientación, no una peritación. Confirma la avería y pide otro presupuesto.'
  ].filter(Boolean).join('\n');

  return {
    ok: true,
    parsed,
    verdict,
    flags,
    questions,
    summary,
    savings,
    whatsapp,
    disclaimer: 'Comparación orientativa basada en rangos de mercado y en las operaciones detectadas. No sustituye una peritación, una inspección física ni el presupuesto cerrado de un taller. Los precios varían por provincia, marca de pieza y motor.'
  };
}

export function quoteBenchmarks() {
  return OPERATIONS.map(({ id, label, total, parts, labour, note }) => ({ id, label, total, parts, labour, note }));
}

export { parseQuoteText, parseAmount, money };
