import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', '..');
const OCR_DIR = path.join(ROOT, 'data', 'ocr');
const MAX_FILE_BYTES = 12 * 1024 * 1024;

const MIME_EXTENSIONS = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const BRANDS = [
  'Volkswagen', 'Audi', 'SEAT', 'Škoda', 'Skoda', 'BMW', 'Mercedes-Benz', 'Mercedes',
  'Opel', 'Vauxhall', 'Ford', 'Renault', 'Dacia', 'Peugeot', 'Citroën', 'Citroen',
  'Toyota', 'Lexus', 'Honda', 'Nissan', 'Mazda', 'Hyundai', 'Kia', 'Fiat', 'Alfa Romeo',
  'Volvo', 'Mini', 'Porsche', 'Jaguar', 'Land Rover', 'Jeep', 'Dodge', 'Chevrolet',
  'Mitsubishi', 'Subaru', 'Suzuki', 'MG', 'BYD', 'Chery', 'Omoda', 'Jaecoo', 'Cupra',
  'Tesla', 'Smart', 'Lancia', 'DS', 'Abarth', 'Saab', 'Rover', 'Daewoo', 'Lada'
];

const MODEL_ALIASES = {
  'vw-golf-vii-r-75': ['Golf R', 'Golf VII R', 'Golf 7.5 R', 'Golf Mk7 R'],
  'vw-golf-vii-gti-performance-75': ['Golf GTI', 'Golf VII GTI', 'GTI Performance'],
  'vw-golf-vii-20-tdi-150': ['Golf 2.0 TDI', 'Golf VII TDI', 'Golf 7 TDI'],
  'bmw-320d-f30': ['320d', 'Serie 3 320d', 'F30 320d'],
  'mercedes-c220d-w205': ['C 220 d', 'C220d', 'Clase C 220'],
  'renault-clio-iv-15-dci-90': ['Clio 1.5 dCi', 'Clio IV dCi'],
  'ford-focus-mk3-15-tdci-120': ['Focus 1.5 TDCi', 'Focus Mk3'],
  'audi-a3-8v-20-tdi-150': ['A3 2.0 TDI', 'A3 8V'],
  'seat-leon-5f-20-tdi-150': ['León 2.0 TDI', 'Leon 2.0 TDI', 'León 5F'],
  'toyota-corolla-e210-18-hybrid': ['Corolla 1.8 Hybrid', 'Corolla E210', 'Corolla híbrido'],
  'vw-golf-iv-19-tdi-110': ['Golf IV', 'Golf Mk4', 'Golf 1.9 TDI'],
  'vw-golf-v-20-tdi-140': ['Golf V', 'Golf Mk5', 'Golf 2.0 TDI 140'],
  'peugeot-205-19-gti': ['205 GTI', 'Peugeot 205 GTI'],
  'peugeot-206-20-hdi-90': ['206 2.0 HDi', 'Peugeot 206 HDi'],
  'peugeot-308-iii-15-bluehdi-130': ['308 III', '308 BlueHDi', 'Peugeot 308 1.5 BlueHDi']
};

function fold(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function compact(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeBase64File(dataBase64) {
  const raw = String(dataBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!raw) throw new Error('No se ha recibido ningún archivo.');
  if (raw.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 64) throw new Error('El archivo supera el límite de 12 MB.');
  const buffer = Buffer.from(raw, 'base64');
  if (!buffer.length) throw new Error('El archivo está vacío.');
  if (buffer.length > MAX_FILE_BYTES) throw new Error('El archivo supera el límite de 12 MB.');
  return buffer;
}

function detectFileType(buffer, declaredMime = '') {
  if (buffer.subarray(0, 4).toString('ascii') === '%PDF') return { mime: 'application/pdf', kind: 'pdf' };
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return { mime: 'image/png', kind: 'image' };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image' };
  }
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', kind: 'image' };
  }
  const mime = String(declaredMime || '').split(';')[0].trim().toLowerCase();
  if (MIME_EXTENSIONS[mime]) {
    return { mime, kind: mime === 'application/pdf' ? 'pdf' : 'image' };
  }
  throw new Error('Formato no admitido. Usa JPG, PNG, WebP o PDF.');
}

let ocrWorkerPromise = null;

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      const langs = [];
      if (fs.existsSync(path.join(OCR_DIR, 'spa.traineddata'))) langs.push('spa');
      if (fs.existsSync(path.join(OCR_DIR, 'eng.traineddata'))) langs.push('eng');
      if (!langs.length) throw new Error('No están instalados los datos OCR locales.');
      const options = { cacheMethod: 'none', logger: () => {} };
      if (fs.existsSync(OCR_DIR)) options.langPath = OCR_DIR;
      return createWorker(langs, 1, options);
    })().catch(error => {
      ocrWorkerPromise = null;
      throw error;
    });
  }
  return ocrWorkerPromise;
}

async function recognizeImage(buffer) {
  const worker = await getOcrWorker();
  const result = await worker.recognize(buffer);
  return compact(result?.data?.text || '');
}

async function readPdf(buffer) {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = compact(result?.text || '');
    if (text.replace(/\s+/g, '').length >= 30) {
      return { text, method: 'pdf_text', pages: result?.total || null, ocr: false };
    }
    const shots = await parser.getScreenshot({ first: 2, desiredWidth: 1700 });
    const pages = Array.isArray(shots?.pages) ? shots.pages : [];
    const fragments = [];
    for (const page of pages.slice(0, 2)) {
      if (!page?.data) continue;
      fragments.push(await recognizeImage(page.data));
    }
    return {
      text: compact(fragments.join('\n')),
      method: fragments.length ? 'pdf_ocr' : 'pdf_empty',
      pages: result?.total || pages.length || null,
      ocr: fragments.length > 0
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

function contextValue(text, labels, pattern, flags = 'i') {
  const source = String(text || '');
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[:\\-]?\\s*(${pattern})`, flags);
    const match = source.match(re);
    if (match) return { value: compact(match[1]), explicit: true };
  }
  const generic = source.match(new RegExp(pattern, flags));
  return generic ? { value: compact(generic[1] || generic[0]), explicit: false } : null;
}

function parseYear(text) {
  const source = String(text || '');
  const contextual = source.match(/(?:a[nñ]o|ano(?:\s+modelo)?|a[nñ]o de fabricaci[oó]n|fecha de (?:primera )?matriculaci[oó]n|matriculaci[oó]n|model year|year)\s*[:\-]?\s*((?:19|20)\d{2})/i);
  if (contextual) return { value: Number(contextual[1]), explicit: true };
  const years = [...source.matchAll(/\b((?:19|20)\d{2})\b/g)]
    .map(m => Number(m[1]))
    .filter(y => y >= 2000 && y <= 2026);
  if (!years.length) return null;
  const counts = new Map();
  for (const year of years) counts.set(year, (counts.get(year) || 0) + 1);
  const value = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return { value, explicit: false };
}

function parseVin(text) {
  const candidates = String(text || '').toUpperCase().match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [];
  const vin = candidates.find(v => /[A-Z]/.test(v) && /\d/.test(v) && !/[IOQ]/.test(v));
  return vin || '';
}

function parseDisplacement(text) {
  const source = String(text || '');
  const cc = source.match(/\b([1-6][0-9]{3})\s*(?:cc|cm3|cm³|c\.c\.)\b/i);
  if (cc) return { displacementCc: Number(cc[1]), explicit: true };
  const liters = source.match(/\b([1-6](?:[.,][0-9]))\s*(?:l|litros?)\b/i);
  if (liters) return { displacementCc: Math.round(Number(liters[1].replace(',', '.')) * 1000), explicit: true };
  return null;
}

function parsePower(text) {
  const source = String(text || '');
  const ps = source.match(/\b([0-9]{2,4})\s*(?:cv|ps|hp)\b/i);
  const kw = source.match(/\b([0-9]{2,4})\s*kw\b/i);
  if (!ps && !kw) return null;
  const powerPs = ps ? Number(ps[1]) : Math.round(Number(kw[1]) * 1.35962);
  const powerKw = kw ? Number(kw[1]) : Math.round(Number(ps[1]) / 1.35962);
  return { powerPs, powerKw, explicit: true };
}

function parseBrand(text, vehicles) {
  const haystack = fold(text);
  for (const vehicle of vehicles) {
    if (haystack.includes(fold(vehicle.brand))) return { value: vehicle.brand, explicit: true };
  }
  const fromList = BRANDS.find(brand => new RegExp(`\\b${fold(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack));
  return fromList ? { value: fromList, explicit: true } : null;
}

function parseModel(text, vehicles) {
  const haystack = fold(text);
  const matches = [];
  for (const vehicle of vehicles) {
    const aliases = [vehicle.model, `${vehicle.brand} ${vehicle.model}`, ...(MODEL_ALIASES[vehicle.id] || [])];
    for (const alias of aliases) {
      const folded = fold(alias);
      if (folded.length < 3) continue;
      if (haystack.includes(folded)) {
        const specific = folded !== fold(vehicle.model) && folded !== fold(`${vehicle.brand} ${vehicle.model}`);
        matches.push({ vehicle, alias, score: folded.length + (specific ? 20 : 0), specific });
      }
    }
  }
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  if (!best) return null;
  const sameModel = matches.filter(m => m.vehicle.model === best.vehicle.model);
  const specific = sameModel.find(m => m.specific);
  return {
    value: best.vehicle.model,
    vehicleId: specific ? specific.vehicle.id : '',
    candidates: [...new Set(sameModel.map(m => m.vehicle.id))],
    explicit: true
  };
}

function linkVehicle(Model, vehicles, { brand, fuel, displacement, power }) {
  const candidates = vehicles.filter(v => {
    if (Model?.candidates?.length) return Model.candidates.includes(v.id);
    if (brand?.value) return fold(v.brand) === fold(brand.value) && fold(v.model) === fold(Model?.value || '');
    return false;
  });
  if (candidates.length <= 1) return candidates[0] || null;
  const scored = candidates.map(v => {
    let score = 0;
    if (fuel?.value && fold(v.engine?.fuel) === fold(fuel.value)) score += 3;
    if (displacement?.displacementCc && v.engine?.displacementCc &&
        Math.abs(v.engine.displacementCc - displacement.displacementCc) <= 120) score += 4;
    if (power?.powerPs && v.engine?.powerPs) {
      const diff = Math.abs(v.engine.powerPs - power.powerPs);
      if (diff <= 2) score += 6;
      else if (diff <= 12) score += 4;
      else if (diff <= 30) score += 1;
    }
    return { vehicle: v, score };
  }).sort((a, b) => b.score - a.score);
  return scored[0]?.score >= 3 && scored[0].score > (scored[1]?.score || 0) ? scored[0].vehicle : null;
}

function parseEngineCode(text) {
  const source = String(text || '');
  const match = source.match(/(?:c[oó]digo\s+(?:de\s+)?motor|engine\s+code|motor|engine)\b\s*[:\-]?\s*([A-Z0-9]{3,8})\b/i);
  if (!match) return null;
  const value = match[1].toUpperCase();
  if (/^(GASOLINA|DIESEL|DIESEL|MANUAL|AUTOMATICO|HYBRID|EURO)$/.test(value)) return null;
  return { value, explicit: true };
}

function parseFuel(text) {
  const source = fold(text);
  if (/\b(h[ií]brido|hybrid|phev|hev)\b/.test(source)) return { value: 'Híbrido', explicit: true };
  if (/\b(el[eé]ctrico|electric|bev)\b/.test(source)) return { value: 'Eléctrico', explicit: true };
  if (/\b(gasolina|petrol|tsi|tfsi|ecoboost|puretech|vvt-i)\b/.test(source)) return { value: 'Gasolina', explicit: true };
  if (/\b(di[eé]sel|diesel|tdi|hdi|dci|cdti|tdci|bluehdi|multijet)\b/.test(source)) return { value: 'Diésel', explicit: true };
  if (/\b(glp|autogas|lpg)\b/.test(source)) return { value: 'GLP', explicit: true };
  if (/\b(gnc|cng)\b/.test(source)) return { value: 'GNC', explicit: true };
  return null;
}

function parseTransmission(text) {
  const source = fold(text);
  if (/\b(dsg|s-?tronic|autom[aá]tic[oa]|automatic|zf|tiptronic|cvt|e-cvt)\b/.test(source)) {
    return { value: 'Automático', detail: /dsg/.test(source) ? 'DSG' : /e-cvt|cvt/.test(source) ? 'CVT' : 'Automático', explicit: true };
  }
  if (/\b(manual|6 velocidades|5 velocidades)\b/.test(source)) return { value: 'Manual', explicit: true };
  return null;
}

function parseEmission(text) {
  const source = String(text || '');
  const euro = source.match(/\bEuro\s*([0-9](?:\s*[a-z])?)\b/i);
  if (euro) return { value: `Euro ${euro[1].replace(/\s+/g, '').toUpperCase()}`, explicit: true };
  return null;
}

function parsePlate(text) {
  const source = String(text || '').toUpperCase();
  const labelled = source.match(/(?:MATR[I\u00cd]CULA|PLACA(?:\s+DE\s+MATR[I\u00cd]CULA)?|REGISTRATION)\s*[:\-]?\s*([0-9]{4}\s?[A-Z]{3}|[A-Z]{1,2}\s?[0-9]{4}\s?[A-Z]{1,2})\b/);
  if (labelled) return { value: labelled[1].replace(/\s+/g, ''), explicit: true };
  const modern = source.match(/\b([0-9]{4})\s?([A-Z]{3})\b/);
  const old = source.match(/\b([A-Z]{1,2})\s?([0-9]{4})\s?([A-Z]{1,2})\b/);
  if (modern) return { value: `${modern[1]}${modern[2]}`, explicit: false };
  if (old) return { value: `${old[1]}${old[2]}${old[3]}`, explicit: false };
  return null;
}

function parseFirstRegistration(text) {
  const source = String(text || '').toUpperCase();
  const match = source.match(/(?:FECHA\s+DE\s+(?:PRIMERA\s+)?MATRICULACI[O\u00d3]N|PRIMERA\s+MATRICULACI[O\u00d3]N|FECHA\s+DE\s+ALTA|MATRICULACI[O\u00d3]N)\s*[:\-]?\s*([0-9]{1,2})[\/.\-]([0-9]{1,2})[\/.\-]([0-9]{2,4})\b/);
  if (!match) return null;
  let year = Number(match[3]);
  if (year < 100) year += year > 70 ? 1900 : 2000;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!day || !month || month > 12 || day > 31 || year < 1950 || year > 2100) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
  return { value: iso, explicit: true };
}

function parseSeats(text) {
  const match = String(text || '').match(/(?:N[\u00ba\u00b0]?\s*(?:DE\s*)?PLAZAS|PLAZAS|SEATS)\s*[:\-]?\s*([1-9])\b/i);
  return match ? { value: Number(match[1]), explicit: true } : null;
}

function parseMass(text) {
  const match = String(text || '').match(/(?:MASA\s*(?:M[A\u00c1]XIMA\s*)?(?:ADMISIBLE|EN\s+ORDEN\s+DE\s+MARCHA)?|MMA|PESO\s*(?:M[A\u00c1]XIMO)?)\s*[:\-]?\s*([12]?[0-9]{3})\s*(?:KG)?\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (value < 500 || value > 5000) return null;
  return { value, explicit: true };
}

function field(value, confidence, explicit, note = '') {
  return {
    value: value ?? '',
    confidence: value ? confidence : 'desconocida',
    explicit: Boolean(explicit),
    note
  };
}

export async function scanVehicleDocument({ dataBase64, mimeType, fileName, text } = {}) {
  let sourceText = compact(text || '');
  let method = sourceText ? 'texto_manual' : 'sin_texto';
  let ocr = false;
  let pages = null;
  let fileType = null;

  if (!sourceText) {
    if (!dataBase64) throw new Error('Adjunta una ficha en PDF o una imagen, o escribe los datos manualmente.');
    const buffer = decodeBase64File(dataBase64);
    fileType = detectFileType(buffer, mimeType);
    if (!MIME_EXTENSIONS[fileType.mime]) throw new Error('Formato no admitido.');
    if (fileType.kind === 'pdf') {
      const result = await readPdf(buffer);
      sourceText = result.text;
      method = result.method;
      ocr = result.ocr;
      pages = result.pages;
    } else {
      sourceText = await recognizeImage(buffer);
      method = 'imagen_ocr';
      ocr = true;
    }
  }

  if (!sourceText || sourceText.replace(/\s+/g, '').length < 8) {
    throw new Error('No se ha podido leer texto suficiente. Prueba con una imagen más nítida, recorta la zona de datos o introduce los datos manualmente.');
  }

  const vehicles = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vehicles.json'), 'utf8'));
  const brand = parseBrand(sourceText, vehicles);
  const model = parseModel(sourceText, vehicles);
  const year = parseYear(sourceText);
  const displacement = parseDisplacement(sourceText);
  const power = parsePower(sourceText);
  const engineCode = parseEngineCode(sourceText);
  const fuel = parseFuel(sourceText);
  const transmission = parseTransmission(sourceText);
  const emission = parseEmission(sourceText);
  const vin = parseVin(sourceText);
  const plate = parsePlate(sourceText);
  const firstRegistration = parseFirstRegistration(sourceText);
  const seats = parseSeats(sourceText);
  const mass = parseMass(sourceText);
  const linkedVehicle = linkVehicle(model, vehicles, { brand, fuel, displacement, power });

  const extracted = {
    brand: field(brand?.value || linkedVehicle?.brand || '', brand?.explicit ? 'media' : 'baja', brand?.explicit, brand ? '' : 'No se ha reconocido la marca con seguridad.'),
    model: field(model?.value || '', model?.explicit ? 'media' : 'baja', model?.explicit, model ? '' : 'Confirma el modelo manualmente.'),
    generation: field(linkedVehicle?.generation || '', linkedVehicle ? 'media' : 'baja', Boolean(linkedVehicle), linkedVehicle ? '' : 'Generación no confirmada.'),
    year: field(year?.value || '', year?.explicit ? 'alta' : 'baja', year?.explicit, year ? (year.explicit ? '' : 'Año detectado sin etiqueta; confírmalo.') : 'Año no detectado.'),
    firstRegistration: field(firstRegistration?.value || '', 'alta', Boolean(firstRegistration), firstRegistration ? '' : 'Fecha de primera matriculación no detectada.'),
    plate: field(plate?.value || '', plate?.explicit ? 'alta' : 'baja', Boolean(plate), plate ? (plate.explicit ? '' : 'Matrícula detectada sin etiqueta; confírmala.') : 'Matrícula no detectada.'),
    vin: field(vin, vin ? 'alta' : 'desconocida', Boolean(vin), vin ? 'El VIN se muestra para validación y no se almacena en el servidor.' : 'VIN no detectado.'),
    engineCode: field(engineCode?.value || '', engineCode ? 'media' : 'desconocida', Boolean(engineCode), engineCode ? '' : 'Código de motor no detectado.'),
    displacementCc: field(displacement?.displacementCc || '', displacement ? 'alta' : 'desconocida', Boolean(displacement), displacement ? '' : 'Cilindrada no detectada.'),
    powerPs: field(power?.powerPs || '', power ? 'alta' : 'desconocida', Boolean(power), power ? '' : 'Potencia no detectada.'),
    powerKw: field(power?.powerKw || '', power ? 'alta' : 'desconocida', Boolean(power), ''),
    seats: field(seats?.value || '', 'alta', Boolean(seats), seats ? '' : 'Número de plazas no detectado.'),
    massKg: field(mass?.value || '', 'alta', Boolean(mass), mass ? '' : 'Masa no detectada.'),
    fuel: field(fuel?.value || '', fuel ? 'media' : 'desconocida', Boolean(fuel), fuel ? '' : 'Combustible no detectado.'),
    transmission: field(transmission?.detail || transmission?.value || '', transmission ? 'media' : 'desconocida', Boolean(transmission), transmission ? '' : 'Cambio no detectado.'),
    emissionStandard: field(emission?.value || '', emission ? 'alta' : 'desconocida', Boolean(emission), emission ? '' : 'Norma de emisiones no detectada.')
  };

  const priorities = { alta: 1, media: 0.7, baja: 0.4, desconocida: 0 };
  const values = Object.values(extracted).map(item => priorities[item.confidence] || 0);
  const overall = values.reduce((sum, value) => sum + value, 0) / values.length;

  const warnings = [
    'Los datos se han extraído automáticamente y pueden contener errores. Revísalos antes de continuar.',
    'Una fotografía exterior no identifica con exactitud la motorización, el año-modelo ni el equipamiento.',
    'El archivo no se envía a ningún servicio externo: el OCR y la extracción se ejecutan en el servidor local. Solo el texto extraído y redactado puede usarse para un resumen con IA.'
  ];
  if (!vin) warnings.push('Sin VIN no es posible confirmar la versión exacta ni las campañas pendientes.');
  if (plate) warnings.push('La matrícula y el bastidor son datos personales: se guardan solo en tu garaje privado y no se publican.');
  if (!engineCode) warnings.push('Sin código de motor, algunas comprobaciones y compatibilidades quedan como no confirmadas.');
  if (linkedVehicle) {
    warnings.push(`Se ha relacionado con ${linkedVehicle.brand} ${linkedVehicle.model} ${linkedVehicle.version} por el texto, no por el VIN. Confirma la versión exacta.`);
  }

  return {
    ok: true,
    extracted,
    linkedVehicleId: linkedVehicle?.id || '',
    confidence: {
      overall: overall >= 0.7 ? 'media-alta' : overall >= 0.4 ? 'media' : 'baja',
      score: Math.round(overall * 100),
      method
    },
    meta: {
      fileName: String(fileName || '').replace(/[^\w.\- ]/g, '').slice(0, 120),
      fileType: fileType?.mime || (sourceText ? 'texto' : ''),
      pages,
      ocr,
      processedAt: new Date().toISOString(),
      storage: 'sin_almacenamiento'
    },
    warnings
  };
}

export { MAX_FILE_BYTES };
