import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const vehicles = JSON.parse(fs.readFileSync(path.join(root, 'data/vehicles.json'), 'utf8'));

const pending = [
  { id: 'wiring', title: 'Esquemas eléctricos y de cableado', note: 'No se ha incorporado un manual oficial con licencia; no se inventan esquemas ni colores de cables.' },
  { id: 'torque', title: 'Pares de apriete', note: 'No hay valores oficiales verificados para esta versión en las fuentes disponibles.' },
  { id: 'fluids', title: 'Capacidades y especificaciones de fluidos', note: 'Faltan capacidades y normas exactas por motor/caja; no se deducen de otras versiones.' },
  { id: 'fuses', title: 'Ubicación de fusibles y relés', note: 'No se dispone de esquema de distribución verificado para esta variante.' },
  { id: 'sensors', title: 'Valores de referencia de sensores y actuadores', note: 'No se publican valores genéricos sin documentación oficial del motor y sistema.' },
  { id: 'timing', title: 'Procedimiento oficial de distribución y sincronización', note: 'Solo se identifica el tipo de distribución; falta el procedimiento y las marcas oficiales.' },
  { id: 'repair', title: 'Procedimientos oficiales de reparación y mantenimiento', note: 'Faltan procedimientos completos con pares, útiles y tolerancias del fabricante.' },
  { id: 'campaigns', title: 'Boletines técnicos y campañas', note: 'No se ha integrado una base de campañas oficiales por VIN.' }
];

const covered = [
  ['identity', 'Identificación de marca, modelo, generación y versión', v => v.brand && v.model && v.generation && v.version],
  ['engine', 'Datos de motor, cilindrada, potencia, par y distribución', v => v.engine && v.engine.displacementCc && v.engine.powerPs && v.engine.distribution],
  ['transmission', 'Transmisión, cambio y tracción', v => v.transmission && v.transmission.type && v.transmission.gears],
  ['emissions', 'Norma de emisiones y postratamiento', v => v.emissions && v.emissions.standard],
  ['systems', 'Sistemas electrónicos y mecánicos relevantes', v => Array.isArray(v.systems) && v.systems.length],
  ['inspection', 'Puntos de inspección y su justificación', v => Array.isArray(v.inspection) && v.inspection.length],
  ['sources', 'Fuentes y trazabilidad por versión', v => Array.isArray(v.sources) && v.sources.length]
];

const data = {
  generatedAt: new Date().toISOString(),
  notice: 'Dossier técnico compilado únicamente con los datos y fuentes ya verificados del proyecto. Los apartados sin documentación oficial se muestran como pendientes; no se inventan valores, esquemas ni procedimientos.',
  documentationGaps: pending,
  coverage: covered.map(([id, title]) => ({ id, title })),
  vehicles: vehicles.map(v => ({
    id: v.id,
    title: `${v.brand} ${v.model} ${v.version}`,
    brand: v.brand,
    model: v.model,
    generation: v.generation,
    version: v.version,
    years: v.years,
    body: v.body,
    image: v.image,
    confidence: v.confidence,
    notes: v.notes,
    engine: v.engine,
    transmission: v.transmission,
    emissions: v.emissions,
    systems: v.systems || [],
    inspection: v.inspection || [],
    sources: v.sources || [],
    covered: covered.filter(([, , test]) => test(v)).map(([id, title]) => ({ id, title })),
    pending: pending.map(({ id, title, note }) => ({ id, title, note })),
    status: 'parcial',
    statusLabel: 'Dossier parcial con fuentes'
  }))
};

fs.writeFileSync(path.join(root, 'data/library.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`library.json: ${data.vehicles.length} vehículos, ${data.coverage.length} apartados cubiertos, ${data.documentationGaps.length} pendientes`);
