import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const readText = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, data) => fs.writeFileSync(path.join(root, file), JSON.stringify(data, null, 2) + '\n');

const categories = read('data/symptom-categories.json');
const categoryById = new Map(categories.map(c => [c.id, c]));
const dtcCodes = new Set(read('data/dtc.json').map(d => String(d.code).toUpperCase()));
const componentIds = new Set(read('data/components.json').map(c => c.id));
const current = read('data/symptoms.json');
const today = '2026-10-23';

const areaConfig = {
  gasolina: {
    category: 'motor', area: 'Motor de gasolina', components: ['motor', 'sensores', 'centralita'],
    tools: ['Escáner OBD', 'Osciloscopio', 'Compresímetro', 'Manómetro de combustible'],
    causes: ['Mezcla o encendido fuera de especificación', 'Desgaste interno del motor'],
    checks: ['Leer DTC y parámetros en vivo', 'Comparar valores medidos con la especificación del fabricante'],
    solutions: ['Confirmar la causa con mediciones antes de sustituir piezas.', 'Reparar el sistema afectado y verificar la ausencia de fallos.']
  },
  diesel: {
    category: 'motor', area: 'Motor diésel', components: ['motor', 'combustible', 'sensores'],
    tools: ['Escáner OBD', 'Kit de retorno de inyectores', 'Compresímetro', 'Manómetro de combustible'],
    causes: ['Combustión deficiente por inyección o compresión', 'Entrada de aire o baja presión de combustible'],
    checks: ['Leer correcciones y presión de rail', 'Comprobar retorno de inyectores y compresión'],
    solutions: ['Reparar inyección o admisión según la medición.', 'Borrar adaptaciones y verificar en prueba de carretera.']
  },
  turbo: {
    category: 'turbo-admision', area: 'Turbo y sobrealimentación', components: ['turbo', 'admision', 'sensores'],
    tools: ['Escáner OBD', 'Manómetro de presión', 'Máquina de humo', 'Boroscopio'],
    causes: ['Fuga en circuito de presión o vacío', 'Actuador o geometría variable fuera de posición'],
    checks: ['Comparar presión real y solicitada', 'Prueba de estanqueidad con humo o presión'],
    solutions: ['Reparar la fuga o el actuador confirmado.', 'Verificar presión y ausencia de DTC en carga.']
  },
  admision: {
    category: 'turbo-admision', area: 'Admisión y mariposa', components: ['admision', 'sensores', 'turbo'],
    tools: ['Escáner OBD', 'Máquina de humo', 'Multímetro', 'Limpiador de admisión'],
    causes: ['Toma de aire no medida', 'Sensor o mariposa con lectura incorrecta'],
    checks: ['Prueba de humo en admisión', 'Comparar MAF, MAP y apertura de mariposa'],
    solutions: ['Sellar la toma de aire o reparar el sensor.', 'Adaptar la mariposa y verificar el ralentí.']
  },
  inyeccion: {
    category: 'combustible', area: 'Inyección y alimentación', components: ['combustible', 'sensores', 'motor'],
    tools: ['Escáner OBD', 'Manómetro de combustible', 'Kit de retorno', 'Multímetro'],
    causes: ['Presión de combustible fuera de rango', 'Inyector o regulador defectuoso'],
    checks: ['Medir presión de baja y alta', 'Comparar retorno y correcciones por cilindro'],
    solutions: ['Reparar el circuito de combustible confirmado.', 'Verificar presión, retorno y ausencia de fugas.']
  },
  encendido: {
    category: 'combustible', area: 'Encendido', components: ['motor', 'sensores', 'centralita'],
    tools: ['Escáner OBD', 'Osciloscopio', 'Multímetro', 'Herramienta de bujías'],
    causes: ['Componente de encendido degradado', 'Señal o alimentación intermitente'],
    checks: ['Contar fallos por cilindro', 'Inspeccionar bujía, bobina y señal primaria'],
    solutions: ['Sustituir solo el componente de encendido confirmado.', 'Verificar ausencia de fallos en frío y caliente.']
  },
  distribucion: {
    category: 'motor', area: 'Distribución', components: ['distribucion', 'motor', 'sensores'],
    tools: ['Kit de calado', 'Escáner OBD', 'Osciloscopio', 'Llave dinamométrica'],
    causes: ['Cadena o correa con holgura o desfase', 'Tensor o guía deteriorados'],
    checks: ['Comprobar marcas y ángulos de sincronización', 'Inspeccionar tensor, guías y piñones'],
    solutions: ['Sustituir el kit de distribución si hay holgura o desfase.', 'Verificar sincronización y compresión tras la reparación.']
  },
  lubricacion: {
    category: 'motor', area: 'Lubricación', components: ['motor', 'sensores'],
    tools: ['Manómetro de aceite', 'Escáner OBD', 'Boroscopio', 'Kit de análisis de aceite'],
    causes: ['Presión o calidad de aceite incorrecta', 'Fuga o obstrucción en el circuito'],
    checks: ['Medir presión con manómetro', 'Comprobar nivel, viscosidad y fugas'],
    solutions: ['Corregir la causa de la pérdida de presión o fuga.', 'Usar aceite y filtro con la especificación correcta.']
  },
  refrigeracion: {
    category: 'refrigeracion-clima', area: 'Refrigeración del motor', components: ['motor', 'sensores'],
    tools: ['Manómetro de refrigeración', 'Termómetro infrarrojo', 'Escáner OBD', 'Kit de prueba de gases'],
    causes: ['Pérdida de presión o circulación insuficiente', 'Termostato, bomba o ventilador defectuosos'],
    checks: ['Medir temperaturas y presión del circuito', 'Comprobar circulación, ventiladores y fugas'],
    solutions: ['Reparar la fuga o el componente que impide la circulación.', 'Purgar el circuito y verificar temperatura estabilizada.']
  },
  embrague: {
    category: 'transmision', area: 'Embrague', components: ['transmision', 'motor'],
    tools: ['Escáner OBD', 'Herramienta de purga', 'Calibre', 'Elevador'],
    causes: ['Desgaste o contaminación del disco', 'Fuga o aire en el circuito hidráulico'],
    checks: ['Prueba de patinaje y desacoplamiento', 'Revisar recorrido del pedal y fugas'],
    solutions: ['Sustituir el kit de embrague si el desgaste está confirmado.', 'Purgar y reparar el circuito hidráulico.']
  },
  manual: {
    category: 'transmision', area: 'Caja manual', components: ['transmision'],
    tools: ['Escáner OBD', 'Elevador', 'Llave dinamométrica', 'Herramienta de varillaje'],
    causes: ['Desgaste de sincronizadores o engranajes', 'Nivel o varillaje incorrectos'],
    checks: ['Comprobar nivel y estado del aceite', 'Revisar varillaje y ruido por marchas'],
    solutions: ['Reparar la caja o el varillaje confirmado.', 'Verificar cambios en frío y caliente.']
  },
  automatica: {
    category: 'transmision', area: 'Caja automática y DSG', components: ['transmision', 'centralita', 'sensores'],
    tools: ['Escáner OBD', 'Manómetro de transmisión', 'Termómetro', 'Equipo de cambio de ATF'],
    causes: ['Nivel o presión de aceite incorrectos', 'Electroválvula o mecatrónica defectuosa'],
    checks: ['Leer presiones, temperaturas y adaptaciones', 'Comprobar nivel y estado del ATF'],
    solutions: ['Reparar la mecatrónica o electroválvula confirmada.', 'Ajustar nivel y realizar adaptaciones.']
  },
  diferencial: {
    category: 'transmision', area: 'Diferencial y tracción integral', components: ['transmision'],
    tools: ['Escáner OBD', 'Elevador', 'Herramienta de holguras', 'Jeringa de aceite'],
    causes: ['Nivel o aceite incorrecto', 'Holgura o desgaste interno'],
    checks: ['Comprobar nivel y fugas', 'Escuchar y medir holguras en carga'],
    solutions: ['Cambiar el aceite o reparar el grupo confirmado.', 'Verificar ausencia de ruido en curva y carga.']
  },
  frenos: {
    category: 'frenos-chasis', area: 'Frenos', components: ['frenos', 'sensores'],
    tools: ['Calibre', 'Escáner OBD', 'Equipo de purga', 'Termómetro infrarrojo'],
    causes: ['Desgaste o agarrotamiento del mecanismo', 'Pérdida de presión o líquido contaminado'],
    checks: ['Medir espesores y temperaturas por rueda', 'Comprobar fugas y retención del pedal'],
    solutions: ['Sustituir el componente de freno confirmado.', 'Purgar y verificar eficacia y ausencia de arrastre.']
  },
  abs: {
    category: 'frenos-chasis', area: 'ABS y control de estabilidad', components: ['frenos', 'sensores', 'centralita'],
    tools: ['Escáner OBD', 'Multímetro', 'Osciloscopio', 'Equipo de calibración'],
    causes: ['Señal de rueda o sensor de estabilidad incorrecta', 'Módulo o cableado defectuoso'],
    checks: ['Comparar velocidades de rueda', 'Leer y calibrar sensores del chasis'],
    solutions: ['Reparar el sensor o cableado confirmado.', 'Calibrar el sistema y verificar en prueba dinámica.']
  },
  direccion: {
    category: 'frenos-chasis', area: 'Dirección', components: ['suspension', 'sensores', 'centralita'],
    tools: ['Escáner OBD', 'Elevador', 'Herramienta de holguras', 'Equipo de alineación'],
    causes: ['Holgura en cremallera o rótulas', 'Asistencia hidráulica o eléctrica deficiente'],
    checks: ['Comprobar holguras y fugas', 'Leer asistencia y sensores de par'],
    solutions: ['Reparar la holgura o la asistencia confirmada.', 'Alinear y verificar retorno al centro.']
  },
  suspension: {
    category: 'frenos-chasis', area: 'Suspensión', components: ['suspension'],
    tools: ['Elevador', 'Palanca de holguras', 'Alineador', 'Llave dinamométrica'],
    causes: ['Desgaste de amortiguador, muelle o silentblock', 'Holgura en rótulas o bieletas'],
    checks: ['Revisar holguras y fugas', 'Medir altura y geometría'],
    solutions: ['Sustituir el componente desgastado por eje cuando corresponda.', 'Alinear y comprobar ausencia de ruidos.']
  },
  rodamientos: {
    category: 'frenos-chasis', area: 'Rodamientos y ruedas', components: ['suspension', 'frenos'],
    tools: ['Elevador', 'Herramienta de holguras', 'Llave dinamométrica', 'Equilibradora'],
    causes: ['Rodamiento o buje desgastado', 'Equilibrado o alineación incorrectos'],
    checks: ['Mover la rueda y medir temperatura', 'Comprobar equilibrado y desgaste del neumático'],
    solutions: ['Sustituir el rodamiento o corregir el equilibrado confirmado.', 'Verificar par de apriete y ausencia de ruido.']
  },
  electrico: {
    category: 'electricidad', area: 'Sistema eléctrico', components: ['centralita', 'sensores'],
    tools: ['Multímetro', 'Pinza amperimétrica', 'Escáner OBD', 'Lámpara de pruebas'],
    causes: ['Cortocircuito, consumo parásito o masa deficiente', 'Conector o cableado dañado'],
    checks: ['Medir tensión, continuidad y consumo en reposo', 'Aislar circuitos y revisar masas'],
    solutions: ['Reparar el circuito o conector confirmado.', 'Verificar consumo y funcionamiento tras la reparación.']
  },
  alternador: {
    category: 'electricidad', area: 'Alternador y arranque', components: ['centralita', 'motor'],
    tools: ['Multímetro', 'Pinza amperimétrica', 'Escáner OBD', 'Herramienta de correas'],
    causes: ['Alternador o motor de arranque desgastado', 'Correa, masa o alimentación deficiente'],
    checks: ['Medir tensión de carga y caída de masa', 'Comprobar corriente de arranque y correa'],
    solutions: ['Reparar o sustituir el componente confirmado.', 'Verificar carga y arranque en frío y caliente.']
  },
  bateria: {
    category: 'electricidad', area: 'Batería y carga', components: ['centralita'],
    tools: ['Multímetro', 'Comprobador de batería', 'Pinza amperimétrica', 'Escáner OBD'],
    causes: ['Batería agotada o consumo parásito', 'Carga o codificación incorrectas'],
    checks: ['Medir tensión de reposo y arranque', 'Buscar consumo parásito y verificar carga'],
    solutions: ['Sustituir la batería si la prueba de capacidad falla.', 'Corregir el consumo o la carga y codificar si procede.']
  },
  sensores: {
    category: 'electricidad', area: 'Sensores y actuadores', components: ['sensores', 'centralita'],
    tools: ['Escáner OBD', 'Multímetro', 'Osciloscopio', 'Kit de terminales'],
    causes: ['Sensor defectuoso o señal fuera de rango', 'Alimentación, masa o conector deficientes'],
    checks: ['Comparar valor en vivo con referencia', 'Medir alimentación, señal y continuidad'],
    solutions: ['Sustituir el sensor solo tras verificar la señal.', 'Borrar adaptaciones y comprobar la lectura.']
  },
  ecu: {
    category: 'electricidad', area: 'ECU y redes de comunicación', components: ['centralita', 'sensores'],
    tools: ['Escáner profesional', 'Multímetro', 'Osciloscopio', 'Fuente estabilizada'],
    causes: ['Alimentación, masa o red CAN deficiente', 'Codificación o módulo incorrectos'],
    checks: ['Leer todos los módulos y medir red CAN', 'Comprobar alimentación, masas y codificación'],
    solutions: ['Reparar el cableado o módulo confirmado.', 'Codificar y verificar comunicación estable.']
  },
  egr: {
    category: 'anticontaminacion', area: 'Válvula EGR', components: ['egr', 'admision', 'sensores'],
    tools: ['Escáner OBD', 'Limpiador de EGR', 'Multímetro', 'Herramienta de actuadores'],
    causes: ['Carbonilla o actuador atascado', 'Sensor de posición o refrigerador defectuoso'],
    checks: ['Comparar posición real y solicitada', 'Inspeccionar carbonilla y fugas'],
    solutions: ['Limpiar o sustituir la EGR confirmada.', 'Verificar posición y ausencia de fugas.']
  },
  dpf: {
    category: 'anticontaminacion', area: 'Filtro DPF/FAP', components: ['dpf', 'sensores', 'motor'],
    tools: ['Escáner OBD', 'Manómetro diferencial', 'Termómetro infrarrojo', 'Equipo de diagnosis'],
    causes: ['Obstrucción por hollín o ceniza', 'Sensor o regeneración deficientes'],
    checks: ['Leer presión diferencial y carga de hollín', 'Comprobar temperaturas y sensores'],
    solutions: ['Realizar la regeneración o limpieza según el estado medido.', 'Reparar el sensor o la causa de la regeneración incompleta.']
  },
  scr: {
    category: 'anticontaminacion', area: 'SCR y AdBlue', components: ['dpf', 'sensores', 'centralita'],
    tools: ['Escáner OBD', 'Manómetro', 'Refractómetro', 'Herramienta de dosificación'],
    causes: ['Bomba, inyector o sensor SCR defectuosos', 'AdBlue contaminado o congelado'],
    checks: ['Medir presión y dosificación', 'Comprobar calidad del AdBlue y sensores NOx'],
    solutions: ['Reparar el componente SCR confirmado.', 'Restablecer el sistema y verificar dosificación.']
  },
  lambda: {
    category: 'anticontaminacion', area: 'Sonda lambda y catalizador', components: ['sensores', 'dpf', 'motor'],
    tools: ['Escáner OBD', 'Osciloscopio', 'Analizador de gases', 'Manómetro de contrapresión'],
    causes: ['Sensor envejecido o calefactor abierto', 'Fuga o catalizador degradado'],
    checks: ['Registrar señal de ambas sondas', 'Medir contrapresión y estanqueidad'],
    solutions: ['Sustituir la sonda o catalizador confirmado.', 'Verificar correcciones y emisiones tras la reparación.']
  },
  ac: {
    category: 'refrigeracion-clima', area: 'Aire acondicionado', components: ['sensores', 'centralita'],
    tools: ['Manómetros de A/C', 'Termómetro', 'Detector de fugas', 'Escáner OBD'],
    causes: ['Carga o presión incorrectas', 'Compresor, sensor o ventilador defectuosos'],
    checks: ['Medir presiones y temperaturas', 'Buscar fugas y comprobar embrague del compresor'],
    solutions: ['Recuperar y ajustar la carga según especificación.', 'Reparar la fuga o el componente confirmado.']
  },
  calefaccion: {
    category: 'refrigeracion-clima', area: 'Calefacción', components: ['sensores', 'motor'],
    tools: ['Termómetro', 'Escáner OBD', 'Herramienta de actuadores', 'Multímetro'],
    causes: ['Falta de caudal al radiador interior', 'Compuerta o válvula de mezcla atascada'],
    checks: ['Comparar temperaturas de entrada y salida', 'Probar compuertas y válvula'],
    solutions: ['Purgar o sustituir el radiador de calefacción confirmado.', 'Calibrar compuertas y verificar regulación.']
  },
  hibridos: {
    category: 'electricidad', area: 'Sistemas híbridos y eléctricos', components: ['centralita', 'sensores'],
    tools: ['Escáner específico', 'Multímetro de alta tensión', 'Termómetro', 'Equipo de aislamiento'],
    causes: ['Batería, inversor o módulo de control degradados', 'Refrigeración o conexión de alta tensión deficiente'],
    checks: ['Leer estado de batería y aislamiento', 'Comprobar temperaturas y códigos del sistema'],
    solutions: ['No intervenir en alta tensión sin formación y EPI.', 'Reparar el módulo o circuito según procedimiento del fabricante.']
  },
  confort: {
    category: 'carroceria-confort', area: 'Confort y carrocería', components: ['centralita', 'sensores'],
    tools: ['Multímetro', 'Escáner OBD', 'Herramienta de desmontaje', 'Lubricante específico'],
    causes: ['Mecanismo, sensor o módulo de confort defectuoso', 'Ajuste o conexión deficientes'],
    checks: ['Comprobar alimentación y señal del componente', 'Revisar ajuste, guías y conectores'],
    solutions: ['Reparar el mecanismo o módulo confirmado.', 'Ajustar y verificar el funcionamiento completo.']
  },
  seguridad: {
    category: 'carroceria-confort', area: 'Seguridad pasiva', components: ['sensores', 'centralita'],
    tools: ['Escáner OBD', 'Multímetro', 'Herramienta de airbag', 'Equipo de calibración'],
    causes: ['Conector, cableado o componente de seguridad defectuoso', 'Calibración o codificación incorrecta'],
    checks: ['Leer DTC de seguridad y medir circuitos', 'Comprobar conectores y calibración'],
    solutions: ['No manipular airbags sin formación y protocolo de seguridad.', 'Reparar el circuito y borrar el DTC tras la prueba.']
  }
};

const severityRisk = {
  Alta: 'Riesgo alto: detenga el vehículo en un lugar seguro y no circule hasta diagnosticar el sistema.',
  Media: 'Riesgo moderado: realice las comprobaciones antes de continuar circulando.',
  Baja: 'Riesgo bajo: puede circular con precaución y revisar el sistema en el próximo mantenimiento.'
};

function slug(value) {
  return String(value).toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

const rows = readText('data/symptoms-250.tsv').split(/\r?\n/).filter(Boolean);
if (rows[0].startsWith('area|')) rows.shift();
if (rows.length !== 250) throw new Error(`El TSV debe contener 250 síntomas; contiene ${rows.length}`);

const existingNames = new Set(current.map(s => String(s.name || s.n).toLowerCase()));
const existingIds = new Set(current.map(s => s.id));
const added = [];
const skipped = [];

for (const line of rows) {
  const parts = line.split('|');
  if (parts.length !== 7) throw new Error(`Línea inválida: ${line.slice(0, 80)}`);
  const [area, name, description, severity, causeText, checkText, dtcText] = parts.map(x => x.trim());
  const config = areaConfig[area];
  const category = categoryById.get(config?.category);
  if (!config || !category) throw new Error(`Área o categoría no definida: ${area}`);
  if (!name || !description || !severity || !causeText || !checkText) throw new Error(`Campos incompletos: ${name}`);
  if (!['Alta', 'Media', 'Baja'].includes(severity)) throw new Error(`Gravedad inválida: ${name}`);

  let id = slug(`${area}-${name}`);
  let suffix = 2;
  while (existingIds.has(id)) id = `${slug(`${area}-${name}`)}-${suffix++}`;
  if (existingNames.has(name.toLowerCase())) {
    skipped.push({ name, reason: 'nombre_duplicado' });
    continue;
  }

  const specificCauses = causeText.split(';').map(x => x.trim()).filter(Boolean);
  const specificChecks = checkText.split(';').map(x => x.trim()).filter(Boolean);
  const relatedDtc = dtcText ? [...new Set(dtcText.split(',').map(x => x.trim().toUpperCase()).filter(Boolean))] : [];
  for (const code of relatedDtc) {
    if (!dtcCodes.has(code)) throw new Error(`${name}: DTC inexistente ${code}`);
  }
  const components = [...new Set(config.components)].filter(id => componentIds.has(id));

  added.push({
    id,
    n: name,
    name,
    w: [...new Set(slug(name).split('-').filter(w => w.length > 2))],
    categoryId: config.category,
    category: category.label,
    area: config.area,
    icon: category.icon,
    description,
    urgency: severity,
    driveRisk: severityRisk[severity],
    commonCauses: specificCauses.map(text => ({ likelihood: 'posible', text })),
    causeDetails: specificCauses.map(text => ({ likelihood: 'posible', text })),
    quickChecks: specificChecks,
    tools: config.tools,
    solutions: config.solutions,
    relatedDtc,
    relatedComponents: components,
    vehicleScope: 'generico',
    modelsAffected: [],
    referenceValues: [],
    referenceNote: 'No se incluyen valores de referencia porque requieren la documentación del motor y la versión concreta.',
    source: 'Elaboración técnica propia a partir de principios generales de diagnosis; sin validación por marca, modelo ni motor.',
    sourceType: 'conocimiento_tecnico_generico',
    validationStatus: 'revision_generica_pendiente_modelo',
    lastReviewed: today,
    curated: true
  });
  existingIds.add(id);
  existingNames.add(name.toLowerCase());
}

if (added.length !== 250) throw new Error(`Se esperaban 250 síntomas nuevos; se generaron ${added.length}`);

const merged = [...current, ...added].sort((a, b) => {
  const ai = categories.findIndex(c => c.id === a.categoryId);
  const bi = categories.findIndex(c => c.id === b.categoryId);
  return ai - bi || String(a.name || a.n).localeCompare(String(b.name || b.n), 'es');
});

const counts = Object.fromEntries(categories.map(c => [c.id, merged.filter(s => s.categoryId === c.id).length]));
const audit = {
  generatedAt: new Date().toISOString(),
  baseRecords: current.length,
  addedRecords: added.length,
  totalRecords: merged.length,
  duplicatesSkipped: skipped,
  categories: counts,
  withRelatedDtc: merged.filter(s => (s.relatedDtc || []).length).length,
  withoutRelatedDtc: merged.filter(s => !(s.relatedDtc || []).length).length,
  curatedRecords: merged.filter(s => s.curated).length,
  source: '204 síntomas previos + 250 síntomas técnicos nuevos. Los nuevos no acreditan compatibilidad por modelo.',
  validation: 'Relaciones DTC y componentes genéricas; pendientes de validación por motor y versión.'
};

write('data/symptoms.json', merged);
write('data/auditoria-sintomas.json', audit);
console.log(JSON.stringify({
  base: current.length,
  added: added.length,
  total: merged.length,
  counts,
  withDtc: audit.withRelatedDtc,
  withoutDtc: audit.withoutRelatedDtc
}, null, 2));
