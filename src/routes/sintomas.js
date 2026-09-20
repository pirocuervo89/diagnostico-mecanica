import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = Router(), __dirname = path.dirname(fileURLToPath(import.meta.url));
const dtcPath = path.join(__dirname, '../../data/dtc.json');
let db = [];
try { if (fs.existsSync(dtcPath)) db = JSON.parse(fs.readFileSync(dtcPath, 'utf8')); } catch (e) {}

const LISTA = [
  { id: "tirones", nombre: "Tirones / Falta potencia", palabras: ["inyeccion", "encendido", "p030", "combustible", "bujia", "maf"] },
  { id: "humo", nombre: "Humo negro", palabras: ["gases", "mezcla", "rico", "p017", "maf", "lambda"] },
  { id: "turbo", nombre: "Turbo no sopla", palabras: ["sobrealimentacion", "turbo", "presion"] }
];

router.get('/', (req, res) => res.json(LISTA));

router.get('/:id', (req, res) => {
  const s = LISTA.find(x => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'No encontrado' });
  const rel = db.filter(x => s.palabras.some(p => `${x.code} ${x.title}`.toLowerCase().includes(p))).slice(0, 10);
  res.json({ sintoma: s.nombre, codigos: rel.map(x => ({ codigo: x.code || x.codigo, descripcion: x.title })) });
});
export default router;
