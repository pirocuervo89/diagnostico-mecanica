// Enlaces de compra de las dos tiendas con las que trabajamos.
//
// Amazon se resuelve con la etiqueta de afiliado (que puede venir de Render o de
// data/legal.json) y Autodoc con el programa de Awin (merchant 120163). Si el
// publisher de Awin todavía no está configurado, el enlace a Autodoc se devuelve
// igualmente como búsqueda directa: el usuario nunca se queda sin la segunda
// opción de compra, simplemente esa visita aún no genera comisión.
//
// La consulta que se manda a Autodoc se arma con marca + nombre corto del
// recambio, no con el título entero de Amazon: su buscador funciona mejor con
// pocas palabras y devuelve resultados parecidos en vez de cero.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AUTODOC_MID = '120163';
// Autodoc no tiene una búsqueda por texto fiable: su catálogo se navega por
// vehículo. Por eso enlazamos a la ficha de marca/modelo cuando la conocemos y,
// si no, al catálogo general. Nunca a una URL inventada que acabe en 404.
const AUTODOC_HOME = 'https://www.autodoc.es/recambios';

const BRAND_SLUGS = {
  'seat': 'seat',
  'vw': 'vw',
  'volkswagen': 'vw',
  'renault': 'renault',
  'peugeot': 'peugeot',
  'citroen': 'citroen',
  'citroën': 'citroen',
  'opel': 'opel',
  'ford': 'ford',
  'toyota': 'toyota',
  'bmw': 'bmw',
  'audi': 'audi',
  'mercedes': 'mercedes-benz',
  'mercedes-benz': 'mercedes-benz',
  'fiat': 'fiat',
  'dacia': 'dacia',
  'nissan': 'nissan',
  'hyundai': 'hyundai',
  'kia': 'kia',
  'skoda': 'skoda',
  'škoda': 'skoda'
};

/** Página de marca (o marca/modelo) de Autodoc para un coche concreto. */
function carPath(car) {
  const words = String(car || '').trim().split(/\s+/);
  if (!words.length) return '';
  const brand = BRAND_SLUGS[words[0].toLowerCase()];
  if (!brand) return '';
  const model = words.slice(1).join(' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return model ? `${AUTODOC_HOME}/${brand}/${model}` : `${AUTODOC_HOME}/${brand}`;
}

function legal() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'legal.json'), 'utf8'));
  } catch {
    return {};
  }
}

export function amazonTag() {
  const fromEnv = String(process.env.AFFILIATE_TAG_AMAZON || '').trim();
  const candidate = fromEnv || String(legal().amazonTag || '').trim();
  return /^[a-z0-9][a-z0-9-]*?-[0-9]{2}$/i.test(candidate) ? candidate : '';
}

/** Añade la etiqueta de afiliado solo a enlaces de Amazon. */
export function withAmazonTag(url) {
  const tag = amazonTag();
  if (!tag || typeof url !== 'string' || !/^https?:\/\//i.test(url) || !/amazon\./i.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** Identificador de editor de Awin (solo dígitos). Vacío = sin configurar. */
export function awinPublisherId() {
  const candidate = String(process.env.AWIN_PUBLISHER_ID || legal().awinPublisher || '').trim();
  return /^\d{3,12}$/.test(candidate) ? candidate : '';
}

/** Envuelve cualquier URL de Autodoc en el enlace de seguimiento de Awin. */
export function withAwin(url) {
  const publisher = awinPublisherId();
  if (!publisher || typeof url !== 'string' || !/^https?:\/\//i.test(url)) return url;
  return `https://www.awin1.com/cread.php?awinmid=${AUTODOC_MID}&awinaffid=${publisher}&ued=${encodeURIComponent(url)}`;
}

// Palabras que no ayudan a buscar en Autodoc y alargan la consulta.
const NOISE = /\b(juego|set|kit|pack|par|unidad|universal|premium|profesional|original|nuevo|compatible|para|coche|coches|autom[oó]vil|veh[ií]culo|de|del|la|el|los|las|con|sin|y)\b/gi;

/** Consulta corta y legible: marca + tipo de pieza. */
export function autodocQuery(item) {
  const brand = String(item?.manufacturer || '').trim();
  const usableBrand = brand && !/no confirmado|recambio/i.test(brand) ? brand : '';
  const kind = String(item?.subcategory || item?.category || '').replace(/s$/i, '').trim();
  const name = String(item?.name || '')
    .replace(/[|,()[\]{}"]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = name.split(' ').filter(w => w.length > 2).slice(0, 5).join(' ');
  return [usableBrand, kind, words].filter(Boolean).join(' ').slice(0, 110).trim();
}

/** URL de compra en Autodoc para una ficha del catálogo (con Awin si hay ID). */
export function autodocUrlFor(item) {
  const models = Array.isArray(item?.compatibility?.models) ? item.compatibility.models : [];
  const path = models.map(carPath).find(Boolean) || AUTODOC_HOME;
  return withAwin(path);
}

/** URL de catálogo de Autodoc para una búsqueda libre del chat o el buscador. */
export function autodocSearch(text) {
  const query = String(text || '').replace(/\s+/g, ' ').trim();
  if (!query) return '';
  const car = Object.keys(BRAND_SLUGS).find(brand => new RegExp(`\\b${brand}\\b`, 'i').test(query));
  if (!car) return withAwin(AUTODOC_HOME);
  const after = query.slice(query.toLowerCase().indexOf(car) + car.length).trim().split(/\s+/)[0] || '';
  const model = after.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const path = model && model.length > 2 ? `${AUTODOC_HOME}/${BRAND_SLUGS[car]}/${model}` : `${AUTODOC_HOME}/${BRAND_SLUGS[car]}`;
  return withAwin(path);
}

/** Estado público de las dos afiliaciones (sin exponer claves). */
export function storeStatus() {
  return {
    amazon: { tag: amazonTag(), active: Boolean(amazonTag()) },
    autodoc: { publisher: awinPublisherId(), active: Boolean(awinPublisherId()), merchant: AUTODOC_MID }
  };
}
