#!/usr/bin/env node
/**
 * Recoloca fichas que están en la categoría equivocada.
 *
 * Solo actúa sobre consumibles y piezas, nunca sobre herramientas: una "llave
 * de bujías" es herramienta aunque el nombre diga "bujías", y un "probador de
 * líquido de frenos" es diagnosis. Por eso todas las reglas de movimiento
 * excluyen antes las palabras que delatan un útil.
 *
 *   node scripts/fix-categorias.mjs            # informe, no escribe
 *   node scripts/fix-categorias.mjs --write    # aplica y guarda
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = path.join(ROOT, 'data', 'products.json');
const WRITE = process.argv.includes('--write');

// Un útil se queda donde está aunque su nombre mencione la pieza.
const TOOL = /\b(llave|juego de|kit de herramientas|compresor de muelles|garras|extractor|soporte|bandeja|gato|pinza|man[oó]metro|refract[oó]metro|probador|l[aá]piz|tester|detector|c[aá]mara|esc[aá]ner|boroscopio|estetoscopio|cepillo|embudo|im[aá]n|ganchos|p[uú]as|dinamom[eé]trica|alicate|destornillador|martillo|taladro|lima|sierra|prensa|carraca|vasos|pistola|m[aá]quina|equipo)\b/i;

// Y una pieza también: el termostato "lleva refrigerante" pero no es líquido.
const PART = /\b(termostato|sensor|sonda|bomba|electroventilador|ventilador|radiador|junta|culata|manguito|manguera|v[aá]lvula|tap[oó]n|dep[oó]sito|tubo|tuber[ií]a|filtro|varilla|c[aá]rter|enfriador|intercooler|kit de distribuci[oó]n|correa|bomba de agua|soporte|abrazadera|brida|conector|relé|rele|medidor|interruptor|indicador|adaptador|carcasa|tornillo|presi[oó]n)\b/i;

// [categoría actual, prueba sobre el nombre, categoría destino, subcategoría destino]
const RULES = [
  // Filtros de aceite que acabaron en Líquidos y Químicos.
  [/^Líquidos y Químicos$/, /\bfiltro de aceite\b/i, 'Repuestos', 'Filtro de aceite'],
  // Anticongelante / refrigerante que acabó en Repuestos o Diagnosis.
  [/^(Repuestos|Diagnosis|Tuning)$/, /\b(anticongelante|refrigerante|g12|g13)\b/i, 'Líquidos y Químicos', 'Anticongelante'],
  // Aceite de motor (incluido 2T de moto) metido en Tuning o Repuestos.
  [/^(Tuning|Repuestos|Herramientas)$/, /\baceite (de )?motor\b|\b\d+W-\d{2}\b|\b2T\b/i, 'Líquidos y Químicos', 'Aceite motor'],
  // Líquido de frenos que acabó en Herramientas o Diagnosis.
  [/^(Herramientas|Diagnosis|Tuning)$/, /\bl[ií]quido de frenos\b/i, 'Líquidos y Químicos', 'Líquido de frenos DOT 4'],
  // Discos de freno en Tuning.
  [/^Tuning$/, /\bdiscos? de freno\b/i, 'Repuestos', 'Discos de freno'],
  // Amortiguadores en Tuning.
  [/^Tuning$/, /\bamortiguador/i, 'Repuestos', 'Amortiguadores'],
  // Bujías en Tuning.
  [/^Tuning$/, /\bbuj[ií]as?\b/i, 'Repuestos', 'Bujías'],
  // Filtros de aire "deportivos" en Tuning: son filtros, no accesorios.
  [/^Tuning$/, /\bfiltro de aire\b|\bfiltro deportivo\b/i, 'Repuestos', 'Filtro de aire'],
  // Pastillas de freno en cualquier sitio que no sea Repuestos.
  [/^(Tuning|Herramientas|Diagnosis)$/, /pastillas? de freno/i, 'Repuestos', 'Pastillas de freno']
];

// Subcategorías ambiguas dentro de Líquidos y Químicos.
const SUBCATS = {
  'Frenos': 'Líquido de frenos DOT 4',
  'Transmisión': 'Valvulina 75W-90',
  'Aceites motor': 'Aceites de Motor'
};

const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const items = Array.isArray(raw) ? raw : (raw.items || raw.products || []);

const moved = [];
const relabelled = [];
for (const item of items) {
  const name = String(item.name || '');
  const isPart = TOOL.test(name) || PART.test(name);
  if (!isPart) {
    for (const [from, test, to, sub] of RULES) {
      if (!from.test(String(item.category || ''))) continue;
      if (!test.test(name)) continue;
      if (item.category === to && item.subcategory === sub) break;
      moved.push({ id: item.id, from: `${item.category} / ${item.subcategory}`, to: `${to} / ${sub}`, name: name.slice(0, 66) });
      item.category = to;
      item.subcategory = sub;
      break;
    }
  }
  if (item.category === 'Líquidos y Químicos' && SUBCATS[item.subcategory]) {
    relabelled.push({ id: item.id, from: item.subcategory, to: SUBCATS[item.subcategory] });
    item.subcategory = SUBCATS[item.subcategory];
  }
}

console.log(`Fichas recolocadas: ${moved.length}`);
const byKind = {};
for (const m of moved) {
  const key = `${m.from}  →  ${m.to}`;
  byKind[key] = (byKind[key] || 0) + 1;
}
Object.entries(byKind).sort((a, b) => b[1] - a[1]).forEach(([k, n]) => console.log(`  ${n.toString().padStart(3)}  ${k}`));
console.log(`Subcategorías normalizadas: ${relabelled.length}`);
const relabelKinds = {};
for (const r of relabelled) relabelKinds[`${r.from} → ${r.to}`] = (relabelKinds[`${r.from} → ${r.to}`] || 0) + 1;
Object.entries(relabelKinds).forEach(([k, n]) => console.log(`  ${n.toString().padStart(3)}  ${k}`));

if (!moved.length && !relabelled.length) {
  console.log('Nada que corregir.');
} else if (WRITE) {
  fs.writeFileSync(FILE, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`\nGuardado en ${path.relative(ROOT, FILE)}`);
} else {
  console.log('\nModo informe. Añade --write para aplicar.');
  moved.slice(0, 10).forEach(m => console.log(`  · ${m.id}: ${m.name}`));
}
