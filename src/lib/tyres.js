/**
 * Neumáticos y llantas: cálculo de medidas, diámetro exterior y equivalencias.
 *
 * Criterios de equivalencia usados (los habituales en España para turismo):
 *  - Variación del diámetro exterior dentro de ±3 %.
 *  - Anchura de sección que no supere en más de 30 mm la original.
 *  - Índice de carga y código de velocidad iguales o superiores al original.
 *
 * Esto es una ayuda de cálculo, no un certificado: la equivalencia válida es la
 * que figure en la ficha técnica o la que confirme el ingeniero de la ITV.
 */

export const DIAMETER_TOLERANCE_PCT = 3;
export const MAX_WIDTH_INCREASE_MM = 30;
export const MIN_RIM = 13;
export const MAX_RIM = 24;

export function toInt(value, fallback = NaN) {
  const n = Number(String(value ?? '').replace(',', '.').trim());
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/** Valida y normaliza una medida 205/55 R16. */
export function parseSize(width, profile, rim) {
  const w = toInt(width);
  const p = toInt(profile);
  const r = toInt(rim);
  const errors = [];
  if (!(w >= 125 && w <= 355)) errors.push('La anchura debe estar entre 125 y 355 mm.');
  if (!(p >= 25 && p <= 85)) errors.push('El perfil debe estar entre 25 y 85 %.');
  if (!(r >= MIN_RIM && r <= MAX_RIM)) errors.push(`La llanta debe estar entre ${MIN_RIM} y ${MAX_RIM} pulgadas.`);
  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    width: w,
    profile: p,
    rim: r,
    size: `${w}/${p} R${r}`,
    errors: []
  };
}

/** Diámetro exterior en mm: llanta + dos flancos. */
export function outerDiameter(width, profile, rim) {
  return rim * 25.4 + 2 * (width * (profile / 100));
}

export function circumference(width, profile, rim) {
  return Math.PI * outerDiameter(width, profile, rim);
}

/** Vueltas por kilómetro, para comparar con el cuentakilómetros. */
export function revsPerKm(width, profile, rim) {
  return 1_000_000 / circumference(width, profile, rim);
}

/**
 * Anchuras de llanta orientativas para una sección dada.
 * Aproximación al catálogo ETRTO: se redondea a media pulgada.
 */
export function rimWidthRange(width) {
  const ideal = width / 25.4 - 1.5;
  const round = n => Math.round(n * 2) / 2;
  const min = Math.max(3.5, round(ideal - 1));
  const max = Math.min(13, round(ideal + 1));
  return { min, max, ideal: round(ideal) };
}

function buildSize(width, profile, rim) {
  const diameter = outerDiameter(width, profile, rim);
  return {
    size: `${width}/${profile} R${rim}`,
    width,
    profile,
    rim,
    diameter: Number(diameter.toFixed(1)),
    circumference: Number(circumference(width, profile, rim).toFixed(1)),
    revsPerKm: Math.round(revsPerKm(width, profile, rim)),
    rimWidth: rimWidthRange(width)
  };
}

/**
 * Busca medidas alternativas cuya circunferencia quede dentro de tolerancia.
 * Devuelve todas las candidatas agrupadas por diámetro de llanta.
 */
export function findEquivalents(width, profile, rim, options = {}) {
  const base = parseSize(width, profile, rim);
  if (!base.valid) {
    return { valid: false, errors: base.errors, origin: null, alternatives: [], groups: [], notes: [] };
  }

  const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : DIAMETER_TOLERANCE_PCT;
  const maxWidthIncrease = Number.isFinite(options.maxWidthIncrease) ? options.maxWidthIncrease : MAX_WIDTH_INCREASE_MM;
  const origin = buildSize(base.width, base.profile, base.rim);

  const alternatives = [];
  for (let r = Math.max(MIN_RIM, base.rim - 2); r <= Math.min(MAX_RIM, base.rim + 2); r += 1) {
    for (let w = 135; w <= 355; w += 5) {
      for (let p = 25; p <= 85; p += 5) {
        if (w === base.width && p === base.profile && r === base.rim) continue;
        const diameter = outerDiameter(w, p, r);
        const diffMm = diameter - origin.diameter;
        const diffPct = (diffMm / origin.diameter) * 100;
        if (Math.abs(diffPct) > tolerance) continue;

        const widthDelta = w - base.width;
        // Fuera del margen de anchura no es una alternativa razonable: descartar.
        if (Math.abs(widthDelta) > maxWidthIncrease) continue;

        const warnings = [];
        if (widthDelta > 20) {
          warnings.push(`Anchura +${widthDelta} mm: revisa paso de rueda y homologación.`);
        }
        if (widthDelta < -20) {
          warnings.push(`Anchura ${widthDelta} mm: puede quedar estirada sobre la llanta.`);
        }
        if (Math.abs(diffPct) > 2.5) {
          warnings.push('Diferencia de diámetro cerca del límite del 3 %: el velocímetro se desvía.');
        }

        const entry = {
          ...buildSize(w, p, r),
          diffMm: Number(diffMm.toFixed(1)),
          diffPct: Number(diffPct.toFixed(2)),
          widthDelta,
          sameRim: r === base.rim,
          warnings
        };
        alternatives.push(entry);
      }
    }
  }

  // Prioriza la misma llanta y, dentro de ella, las medidas más cercanas en
  // anchura y diámetro: 225/50 R16 antes que 175/65 R16, ambas válidas.
  const score = alt => Math.abs(alt.widthDelta) / maxWidthIncrease + Math.abs(alt.diffPct) / tolerance;
  alternatives.sort((a, b) =>
    (b.sameRim ? 1 : 0) - (a.sameRim ? 1 : 0) ||
    score(a) - score(b) ||
    a.width - b.width
  );

  const groups = [];
  for (const alt of alternatives) {
    let group = groups.find(g => g.rim === alt.rim);
    if (!group) {
      group = { rim: alt.rim, sameRim: alt.rim === base.rim, items: [] };
      groups.push(group);
    }
    if (group.items.length < 12) group.items.push(alt);
  }
  groups.sort((a, b) => (b.sameRim ? 1 : 0) - (a.sameRim ? 1 : 0) || a.rim - b.rim);

  return {
    valid: true,
    errors: [],
    origin: { ...origin, rimRange: rimWidthRange(base.width) },
    tolerance,
    maxWidthIncrease,
    alternatives,
    groups,
    notes: [
      `Solo se listan medidas con diámetro dentro del ±${tolerance} % (${origin.diameter.toFixed(1)} mm de referencia).`,
      'El índice de carga y el código de velocidad deben ser iguales o superiores a los del neumático original.',
      'La equivalencia definitiva es la que consta en la ficha técnica del vehículo o la que confirme la ITV.',
      'Al cambiar de medida hay que revisar la anchura de la llanta, el paso de rueda y la presión recomendada.'
    ]
  };
}

/** Formatea y valida una tornillería tipo 5x112. */
export function parsePcd(value) {
  const m = String(value ?? '').trim().match(/^(\d{1,2})\s*[x×]\s*([\d.,]+)$/i);
  if (!m) return null;
  const bolts = Number(m[1]);
  const spacing = Number(m[2].replace(',', '.'));
  if (!(bolts >= 3 && bolts <= 8) || !(spacing > 50 && spacing < 200)) return null;
  return { bolts, spacing, label: `${bolts}x${spacing}` };
}

const num = value => {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

/**
 * Comprueba si una llanta candidata puede montarse en el coche.
 * No certifica legalidad ni sustituye una prueba física: valida cotas.
 */
export function checkWheelFit(current = {}, candidate = {}) {
  const cur = {
    width: num(current.width),
    diameter: num(current.diameter),
    et: num(current.et),
    bore: num(current.bore),
    pcd: parsePcd(current.pcd)
  };
  const cand = {
    width: num(candidate.width),
    diameter: num(candidate.diameter),
    et: num(candidate.et),
    bore: num(candidate.bore),
    pcd: parsePcd(candidate.pcd)
  };

  const checks = [];
  const add = (key, label, status, detail) => checks.push({ key, label, status, detail });
  const errors = [];

  if (!cand.pcd || !cur.pcd) {
    errors.push('Indica la tornillería de las dos llantas con el formato 5x112.');
  } else if (cand.pcd.label !== cur.pcd.label) {
    add('pcd', 'Tornillería', 'fail', `La llanta es ${cand.pcd.label} y el coche ${cur.pcd.label}: no coincide el número de tornillos ni la distancia entre ellos.`);
  } else {
    add('pcd', 'Tornillería', 'ok', `Coincide: ${cand.pcd.label}.`);
  }

  if (cur.bore && cand.bore) {
    if (cand.bore < cur.bore) {
      add('bore', 'Diámetro del buje', 'fail', `El buje de la llanta (${cand.bore} mm) es menor que el del coche (${cur.bore} mm): no entra.`);
    } else if (cand.bore > cur.bore) {
      add('bore', 'Diámetro del buje', 'warn', `La llanta tiene el buje ${(cand.bore - cur.bore).toFixed(1)} mm mayor: hacen falta anillos centradores de ${cur.bore} mm.`);
    } else {
      add('bore', 'Diámetro del buje', 'ok', 'Coincide exactamente.');
    }
  } else {
    add('bore', 'Diámetro del buje', 'warn', 'Falta el diámetro del buje de una de las dos llantas.');
  }

  if (cur.et !== null && cand.et !== null) {
    const delta = cand.et - cur.et;
    const track = -2 * delta;
    if (Math.abs(delta) <= 5) {
      add('et', 'Desplazamiento (ET)', 'ok', `ET ${cand.et} frente a ${cur.et}: variación de ${delta > 0 ? '+' : ''}${delta} mm (${track > 0 ? '+' : ''}${track} mm de vía).`);
    } else if (delta > 0) {
      add('et', 'Desplazamiento (ET)', 'warn', `ET ${cand.et} frente a ${cur.et}: la llanta entra ${delta} mm hacia dentro. Revisa separación con amortiguador, pinza y paso de rueda.`);
    } else {
      add('et', 'Desplazamiento (ET)', 'warn', `ET ${cand.et} frente a ${cur.et}: la llanta sale ${Math.abs(delta)} mm hacia fuera y la vía crece ${Math.abs(track)} mm. Revisa roce con el paso de rueda y carga sobre rodamientos.`);
    }
  } else {
    add('et', 'Desplazamiento (ET)', 'warn', 'Falta el ET de una de las dos llantas.');
  }

  if (cur.width !== null && cand.width !== null) {
    const delta = cand.width - cur.width;
    if (delta > 1.5) add('width', 'Anchura de llanta', 'warn', `La llanta es ${delta}″ más ancha: puede rozar en paso de rueda y el neumático queda más estirado.`);
    else if (delta < -1.5) add('width', 'Anchura de llanta', 'warn', `La llanta es ${Math.abs(delta)}″ más estrecha: revisa que el neumático no quede demasiado ancho para la garganta.`);
    else add('width', 'Anchura de llanta', 'ok', `Diferencia de ${delta > 0 ? '+' : ''}${delta}″ respecto a la actual.`);
  } else {
    add('width', 'Anchura de llanta', 'warn', 'Falta la anchura de garganta de una de las dos llantas.');
  }

  if (cur.diameter !== null && cand.diameter !== null && cur.diameter !== cand.diameter) {
    add('diameter', 'Diámetro de llanta', 'warn', `Pasas de ${cur.diameter}″ a ${cand.diameter}″: el neumático debe compensar el diámetro total (revisa la pestaña de equivalencias).`);
  }

  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  const verdict = fails ? 'incompatible' : warns ? 'revisar' : 'compatible';

  return {
    valid: !errors.length,
    errors,
    verdict,
    checks,
    trackChange: cur.et !== null && cand.et !== null ? Number((-2 * (cand.et - cur.et)).toFixed(1)) : null,
    notes: [
      'Esta comprobación valida cotas, no homologación: la llanta debe estar homologada para el coche y el conjunto pasar la ITV.',
      'Antes de montar, gira la dirección a tope y comprueba separación real con pinza, amortiguador y paso de rueda.',
      'Los tornillos pueden ser fijos o móviles: usa los del tipo de llanta y el par de apriete del fabricante.'
    ]
  };
}

/** Ficha corta para la API. */
export function sizeSummary(width, profile, rim) {
  const base = parseSize(width, profile, rim);
  if (!base.valid) return null;
  return { ...buildSize(base.width, base.profile, base.rim), rimRange: rimWidthRange(base.width) };
}
