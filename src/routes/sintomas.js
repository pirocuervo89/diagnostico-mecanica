import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { enrichDTC } from '../lib/dtc_enrich.js';

const router = Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dtcPath = path.join(__dirname, '../../data/dtc.json');
const symptomsPath = path.join(__dirname, '../../data/symptoms.json');

let db = [];
try { if (fs.existsSync(dtcPath)) db = JSON.parse(fs.readFileSync(dtcPath, 'utf8')); } catch (e) {}

let symptomsList = [];
try {
  if (fs.existsSync(symptomsPath)) {
    const raw = JSON.parse(fs.readFileSync(symptomsPath, 'utf8'));
    symptomsList = Array.isArray(raw) ? raw : (raw.sintomas || []);
  }
} catch (e) {}

router.get('/', (_req, res) => {
  const lista = symptomsList.map(s => ({
    id: s.id,
    nombre: s.name || s.n || s.id,
    palabras: Array.isArray(s.w) ? s.w : (Array.isArray(s.palabras) ? s.palabras : [])
  }));
  res.json(lista);
});

router.get('/:id', (req, res) => {
  const s = symptomsList.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Síntoma no encontrado' });
  const palabras = Array.isArray(s.w) ? s.w : (Array.isArray(s.palabras) ? s.palabras : []);
  const related = Array.isArray(s.relatedDtc) ? s.relatedDtc : null;
  const rel = (related
    ? related.map(code => db.find(x => String(x.code).toUpperCase() === String(code).toUpperCase())).filter(Boolean)
    : db.filter(x => palabras.some(p => `${x.code} ${x.title} ${x.description || ''}`.toLowerCase().includes(p.toLowerCase()))).slice(0, 10)
  ).map(enrichDTC);

  const causas = [];
  const comprobaciones = [];
  for (const d of rel) {
    for (const c of (d.causes || [])) {
      const text = typeof c === 'string' ? c : c.text;
      if (text && !causas.some(x => x.text === text)) causas.push({ likelihood: (c && c.likelihood) || 'posible', text });
    }
    for (const c of (d.checks || [])) {
      const text = typeof c === 'string' ? c : c.text;
      if (text && !comprobaciones.includes(text)) comprobaciones.push(text);
    }
  }

  res.json({
    id: s.id,
    sintoma: s.name || s.n || s.id,
    codigos: rel.map(x => ({
      codigo: x.code,
      descripcion: x.title,
      gravedad: x.severity,
      sistema: x.system
    })),
    posibles_causas: causas,
    comprobaciones: comprobaciones.slice(0, 8),
    soluciones: [
      'Confirmar la causa raíz con las comprobaciones indicadas antes de sustituir piezas.',
      'Reparar o sustituir únicamente el componente confirmado como defectuoso.',
      'Borrar la memoria de averías tras la reparación y verificar que el código no reaparece.'
    ],
    nota: 'Los códigos son hechos registrados por la ECU; las causas son hipótesis hasta confirmarse con pruebas físicas.'
  });
});

export default router;
