import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  vehiclePage,
  vehicles,
  vehiclesIndex,
  productMeta,
  engineMeta,
  productPage,
  enginePage,
  tyrePage,
  productsIndex,
  enginesIndex,
  tyresIndex,
  sitemapXml,
  products,
  engines,
  tyres,
  baseUrl,
  affiliateUrl
} from '../src/lib/seo.js';

const firstProduct = products()[0];
const firstEngine = engines()[0];
const firstTyre = tyres()[0];

test('el sitemap incluye todo el contenido y es XML válido', () => {
  const xml = sitemapXml();
  assert.ok(xml.startsWith('<?xml'));
  assert.ok(xml.trim().endsWith('</urlset>'));
  const locs = xml.match(/<loc>/g) || [];
  assert.equal(locs.length, 5 + products().length + engines().length + vehicles().length + tyres().length + 5);
  assert.ok(xml.includes('/productos</loc>'));
  assert.ok(xml.includes(`/producto/${firstProduct.id}</loc>`));
  assert.ok(xml.includes(`/motor/${firstEngine.id}</loc>`));
});

test('la ficha de producto tiene título, canónico y datos de Product', () => {
  const page = productPage(firstProduct.id);
  assert.ok(page, 'la ficha debe existir');
  assert.match(page.html, /<title>[^<]{10,}<\/title>/);
  assert.match(page.html, new RegExp(`rel="canonical" href="${baseUrl()}/producto/${firstProduct.id}"`));
  assert.match(page.html, /"@type":"Product"/);
  assert.match(page.html, /"@type":"BreadcrumbList"/);
  assert.match(page.html, /<h1[^>]*>/);
  assert.match(page.html, /name="description" content="[^"]{40,}"/);
});

test('el producto lleva el precio real y el enlace de compra', () => {
  const withPrice = products().find(item => /\d/.test(String(item.price || '')) && item.affiliateUrl);
  const page = productPage(withPrice.id);
  const amount = String(withPrice.price).replace(/[^\d,.]/g, '').replace('.', '').replace(',', '.');
  assert.ok(page.html.includes(`"price":"${Number(amount).toFixed(2)}"`), 'el precio debe ir en JSON-LD');
  assert.ok(page.html.includes(withPrice.affiliateUrl.split('?')[0]), 'el enlace al vendedor debe estar');
});

test('una ficha inexistente devuelve null (el router responde 404)', () => {
  assert.equal(productPage('no-existe-123'), null);
  assert.equal(enginePage('no-existe-123'), null);
  assert.equal(tyrePage('no-existe-123'), null);
});

test('la ficha de motor incluye averías, fuentes y FAQ', () => {
  const page = enginePage(firstEngine.id);
  assert.match(page.html, /"@type":"Article"/);
  assert.match(page.html, /"@type":"FAQPage"/);
  assert.match(page.html, /Averías frecuentes/);
  assert.ok(page.html.length > 6000, 'la página debe tener contenido real');
});

test('la ficha de neumático declara Product y la medida', () => {
  const page = tyrePage(firstTyre.id);
  assert.match(page.html, /"@type":"Product"/);
  assert.ok(page.html.includes(firstTyre.size));
});

test('los índices enlazan al contenido y paginan sin duplicar canónicos', () => {
  const first = productsIndex(1);
  assert.equal(first.canonical, `${baseUrl()}/productos`);
  assert.match(first.html, /"@type":"ItemList"/);
  assert.match(first.html, /href="\/producto\//);
  assert.match(first.html, /rel="canonical" href="[^"]*\/productos"/);

  const second = productsIndex(2);
  assert.match(second.html, /name="robots" content="noindex,follow"/);
  assert.equal(second.canonical, `${baseUrl()}/productos?page=2`);

  assert.match(enginesIndex().html, /href="\/motor\//);
  assert.match(tyresIndex().html, /href="\/neumatico\//);
});

test('ningún título ni descripción se repite, y todos caben en Google', () => {
  const titles = new Map();
  const descriptions = new Map();
  const check = (id, meta, kind) => {
    assert.ok(meta.title.length <= 70, `${kind} ${id}: título de ${meta.title.length} caracteres`);
    assert.ok(meta.description.length >= 50, `${kind} ${id}: descripción de ${meta.description.length} caracteres`);
    assert.ok(meta.description.length <= 170, `${kind} ${id}: descripción de ${meta.description.length} caracteres`);
    const titleKey = meta.title.toLowerCase();
    assert.equal(titles.has(titleKey), false, `título repetido entre ${kind} ${id} y ${titles.get(titleKey)}`);
    titles.set(titleKey, `${kind} ${id}`);
    const descKey = meta.description.toLowerCase();
    assert.equal(descriptions.has(descKey), false, `descripción repetida entre ${kind} ${id} y ${descriptions.get(descKey)}`);
    descriptions.set(descKey, `${kind} ${id}`);
  };
  for (const item of products()) check(item.id, productMeta().get(item.id), 'producto');
  for (const engine of engines()) check(engine.id, engineMeta().get(engine.id), 'motor');
});

test('la portada declara el mismo dominio que el resto del sitio', () => {
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const canonical = (html.match(/rel="canonical" href="([^"]+)"/) || [])[1];
  assert.equal(canonical, `${baseUrl()}/`, 'el canonical de la portada debe salir de data/legal.json');
  assert.ok(html.includes(`property="og:url" content="${baseUrl()}/"`), 'og:url debe coincidir');
  assert.ok(html.includes('name="robots" content="index,follow'), 'la portada debe ser indexable');
});

test('las fichas de coche llevan datos técnicos, inspección y fuentes', () => {
  const car = vehicles()[0];
  const page = vehiclePage(car.id);
  assert.match(page.html, /"@type":"Article"/);
  assert.match(page.html, /Datos técnicos/);
  assert.match(page.html, /Qué revisar antes de comprar/);
  assert.match(page.html, /<link rel="canonical" href="[^"]+\/coche\//);
  assert.equal(vehiclePage('coche-que-no-existe'), null);
  assert.match(vehiclesIndex().html, /href="\/coche\//);
});

test('la etiqueta de afiliado se añade solo a enlaces de Amazon', () => {
  const previous = process.env.AFFILIATE_TAG_AMAZON;
  process.env.AFFILIATE_TAG_AMAZON = 'prueba-21';
  assert.equal(affiliateUrl('https://www.amazon.es/dp/B00M2IDYBA'), 'https://www.amazon.es/dp/B00M2IDYBA?tag=prueba-21');
  assert.equal(affiliateUrl('https://example.com/x'), 'https://example.com/x');
  if (previous === undefined) delete process.env.AFFILIATE_TAG_AMAZON;
  else process.env.AFFILIATE_TAG_AMAZON = previous;
});
