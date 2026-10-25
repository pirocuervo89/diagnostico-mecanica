// Normalización y enriquecimiento de códigos DTC.
// Rellena sistema, gravedad, descripción técnica, comprobaciones y causas
// para los códigos que no traen esos campos en data/dtc.json, sin modificar
// el archivo original. Distingue siempre entre causa "posible" y "frecuente".

const P_SYSTEM = {
  '0': 'Sistema de combustible y aire (mezcla)',
  '1': 'Sistema de combustible y aire (medición)',
  '2': 'Sistema de combustible y aire (inyección)',
  '3': 'Sistema de encendido / fallos de combustión',
  '4': 'Control de emisiones y auxiliares',
  '5': 'Control de velocidad / ralentí',
  '6': 'ECU / ordenador de a bordo',
  '7': 'Transmisión',
  '8': 'Transmisión / tracción',
  '9': 'Transmisión / control de tracción'
};

const HIGH_RISK_WORDS = [
  'airbag', 'freno', 'abs', 'esp', 'seguridad', 'sobrecalent', 'temperatura',
  'presion de aceite', 'presión de aceite', 'direccion', 'dirección', 'fuga',
  'catalizador', 'particulas', 'partículas', 'combustible', 'fallo de encendido',
  'inmovilizador', 'cortocircuito', 'no arranca', 'parada', 'presion del turbo',
  'presión del turbo', 'sobrealimentacion', 'sobrealimentación'
];

const LOW_RISK_WORDS = [
  'informacion', 'información', 'no critico', 'no crítico', 'historico', 'histórico',
  'monitor', 'preparacion', 'preparación', 'catalogo', 'catálogo'
];

const SYSTEM_CHECKS = {
  'Sistema de combustible y aire (mezcla)': [
    'Comprobar tomas de aire parásitas en admisión y manguitos.',
    'Revisar presión de combustible y estado del filtro.',
    'Monitorizar sondas lambda y correcciones de mezcla en vivo.'
  ],
  'Sistema de combustible y aire (medición)': [
    'Comprobar el sensor implicado (MAF/MAP) y su conector.',
    'Medir tensión de alimentación y masa del sensor con multímetro.',
    'Comparar el valor en vivo con el valor esperado en ralentí y aceleración.'
  ],
  'Sistema de combustible y aire (inyección)': [
    'Comprobar inyectores y su cableado.',
    'Verificar presión de rampa y caudal de retorno.',
    'Revisar filtro de combustible y calidad del combustible.'
  ],
  'Sistema de encendido / fallos de combustión': [
    'Leer contador de fallos de combustión por cilindro.',
    'En gasolina comprobar bujías y bobinas; en diésel revisar inyección.',
    'Verificar compresión si el fallo persiste en un solo cilindro.'
  ],
  'Control de emisiones y auxiliares': [
    'Inspeccionar válvula EGR, catalizador y filtro de partículas.',
    'Comprobar sonda lambda y sensores de temperatura de escape.',
    'Revisar manguitos y conexiones del sistema de admisión.'
  ],
  'ECU / ordenador de a bordo': [
    'Comprobar alimentación y masas de la unidad de control.',
    'Revisar continuidad del mazo y conectores del módulo.',
    'Verificar la codificación/actualización de software del módulo.'
  ],
  'Transmisión': [
    'Comprobar nivel y estado del aceite de transmisión.',
    'Revisar sensores de velocidad y cableado de la caja.',
    'Leer valores adaptativos y presiones internas con diagnosis.'
  ],
  'Transmisión / control de tracción': [
    'Revisar sensores de rueda y coronas magnéticas.',
    'Comprobar cableado y conectores del módulo de tracción.',
    'Verificar presión de neumáticos y estado del sistema.'
  ],
  'ABS/ESP': [
    'Leer códigos del módulo de frenos ABS/ESP.',
    'Inspeccionar sensores de rueda y coronas magnéticas.',
    'Comprobar tensión de alimentación del módulo de ABS.'
  ],
  'Red CAN / Electrónica': [
    'Verificar continuidad de las líneas CAN alta y baja.',
    'Comprobar resistencias de terminación (60 ohmios).',
    'Revisar conectores y empalmes sulfatados en la red.'
  ],
  'Carrocería / Seguridad': [
    'Comprobar conexiones del módulo y alimentación.',
    'Revisar interruptores, sensores y fusibles asociados.',
    'Validar el estado del airbag o elemento de seguridad con diagnosis.'
  ]
};

function normSeverity(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('alta')) return 'Alta';
  if (s.includes('baja')) return 'Baja';
  if (s.includes('media')) return 'Media';
  return null;
}

function deriveSeverity(code, title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  if (LOW_RISK_WORDS.some(w => text.includes(w))) return 'Baja';
  if (HIGH_RISK_WORDS.some(w => text.includes(w))) return 'Alta';
  const prefix = String(code || '').toUpperCase().charAt(0);
  if (prefix === 'C' || prefix === 'U') return 'Media';
  return 'Media';
}

function deriveSystem(code, title, description) {
  const c = String(code || '').toUpperCase();
  const prefix = c.charAt(0);
  if (prefix === 'B') return 'Carrocería / Seguridad';
  if (prefix === 'C') return 'ABS/ESP';
  if (prefix === 'U') return 'Red CAN / Electrónica';
  const second = c.charAt(1);
  if (prefix === 'P' && P_SYSTEM[second]) return P_SYSTEM[second];

  const text = `${title || ''} ${description || ''}`.toLowerCase();
  if (text.includes('inyec')) return 'Sistema de combustible y aire (inyección)';
  if (text.includes('encend') || text.includes('combusti')) return 'Sistema de encendido / fallos de combustión';
  if (text.includes('freno') || text.includes('abs')) return 'ABS/ESP';
  if (text.includes('refriger') || text.includes('temperatura')) return 'Refrigeración';
  if (text.includes('transmis') || text.includes('cambio')) return 'Transmisión';
  return 'Gestión del motor';
}

function normalizeChecks(checks, system) {
  if (Array.isArray(checks) && checks.length) {
    return checks.map((c, i) => ({
      step: typeof c === 'object' && c ? (c.step || i + 1) : i + 1,
      text: typeof c === 'object' && c ? String(c.text || c.desc || '') : String(c)
    })).filter(c => c.text);
  }
  const base = SYSTEM_CHECKS[system] || [
    'Realizar inspección visual del circuito afectado.',
    'Comprobar alimentación, masas y conectores con multímetro.',
    'Monitorizar el parámetro en vivo y compararlo con el valor esperado.'
  ];
  return [
    ...base.map((text, i) => ({ step: i + 1, text })),
    { step: base.length + 1, text: 'Confirmar la causa con una prueba física antes de sustituir piezas.' }
  ];
}

function normalizeCauses(causes, system) {
  if (Array.isArray(causes) && causes.length) {
    return causes.map(c => {
      if (typeof c === 'object' && c) {
        return {
          likelihood: c.likelihood || 'posible',
          text: String(c.text || c.desc || '')
        };
      }
      return { likelihood: 'posible', text: String(c) };
    }).filter(c => c.text);
  }
  return [
    { likelihood: 'frecuente', text: 'Sensor o actuador con señal fuera de rango o intermitente.' },
    { likelihood: 'frecuente', text: 'Conexión suelta, sulfatada o mazo de cables dañado.' },
    { likelihood: 'posible', text: `Fallo interno del componente asociado al sistema: ${system}.` }
  ];
}

function enrichDTC(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const code = String(raw.code || '').toUpperCase();
  const title = raw.title || `Código de avería ${code}`;
  const description = raw.description || 'Fallo registrado por la unidad de control electrónica (ECU).';

  const system = (raw.system && raw.system !== 'undefined')
    ? raw.system
    : deriveSystem(code, title, description);

  const severity = normSeverity(raw.severity) || deriveSeverity(code, title, description);

  const checks = normalizeChecks(raw.checks, system);
  const causes = normalizeCauses(raw.causes, system);

  return {
    code,
    title,
    description,
    system,
    scope: raw.scope || 'generic',
    severity,
    checks,
    causes,
    // El código en sí es un hecho confirmado por la ECU; las causas mecánicas
    // son hipótesis salvo confirmación con pruebas físicas.
    electronicConfirmed: true,
    causesConfirmed: !!(raw.checks && raw.checks.length && raw.causes && raw.causes.length)
  };
}

export {
  enrichDTC,
  deriveSystem,
  deriveSeverity,
  normSeverity
};
