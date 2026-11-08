/**
 * Páginas de contenido con URL propia, pensadas para buscadores.
 *
 * La web principal es una SPA: todo vive en "/". Estas rutas generan HTML en el
 * servidor con título, descripción, canónicos, migas y datos estructurados para
 * que cada producto, motor y neumático sea una página indexable de verdad.
 *
 * No sustituyen a la aplicación: cada página enlaza de vuelta a ella.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = path.join(ROOT, 'data');

const cache = new Map();
function readJSON(name) {
  if (!cache.has(name)) {
    try {
      cache.set(name, JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')));
    } catch {
      cache.set(name, null);
    }
  }
  return cache.get(name);
}

const legal = () => readJSON('legal.json') || {};
export function baseUrl() {
  const raw = String(process.env.PUBLIC_BASE_URL || legal().siteUrl || '').trim();
  return raw.replace(/\/+$/, '') || 'https://diagnostico-mecanica.onrender.com';
}
const abs = p => `${baseUrl()}${p.startsWith('/') ? p : `/${p}`}`;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const strip = value => String(value ?? '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

function clip(text, max) {
  const clean = strip(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > max * 0.6 ? space : max).replace(/[,;:.\-–]$/, '')}…`;
}

function money(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    const value = raw.toFixed(2);
    return { amount: value, display: `${value.replace('.', ',')} €` };
  }
  const text = String(raw).trim();
  const match = text.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:\.\d{1,2})?)/);
  if (!match) return null;
  const normalized = match[1].includes(',')
    ? match[1].replace(/\./g, '').replace(',', '.')
    : match[1];
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return { amount: amount.toFixed(2), display: `${amount.toFixed(2).replace('.', ',')} €` };
}

function affiliateTag() {
  return String(process.env.AFFILIATE_TAG_AMAZON || '').trim();
}

export function affiliateUrl(url) {
  const tag = affiliateTag();
  if (!tag || typeof url !== 'string' || !/^https?:\/\//i.test(url) || !/amazon\./i.test(url)) return url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('tag', tag);
    return parsed.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- colecciones

export function products() {
  const raw = readJSON('products.json');
  const list = Array.isArray(raw) ? raw : raw?.items || raw?.products || [];
  return list.filter(item => item && item.id && item.name);
}

export function engines() {
  const raw = readJSON('engine-reliability.json');
  return (raw?.engines || []).filter(item => item && item.id);
}

export function tyres() {
  const raw = readJSON('tyres.json');
  return (raw?.tyres || []).filter(item => item && item.id);
}

const byId = list => new Map(list.map(item => [String(item.id), item]));

export function findProduct(id) {
  return byId(products()).get(String(id)) || null;
}
export function findEngine(id) {
  return byId(engines()).get(String(id)) || null;
}
export function findTyre(id) {
  return byId(tyres()).get(String(id)) || null;
}

// ---------------------------------------------------------------- plantilla

const NAV = [
  ['/productos', 'Productos'],
  ['/motores', 'Motores y averías'],
  ['/neumaticos', 'Neumáticos']
];

function layout({ title, description, canonical, image, robots, jsonLd, crumbs, body, published }) {
  const site = legal().brand || 'Diagnóstico y Mecánica';
  const graph = jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : '';
  const crumbHtml = crumbs.map((crumb, index) => {
    const last = index === crumbs.length - 1;
    const label = esc(crumb.label);
    return last
      ? `<li aria-current="page">${label}</li>`
      : `<li><a href="${esc(crumb.href)}">${label}</a></li>`;
  }).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#08090b">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${esc(robots || 'index,follow,max-image-preview:large')}">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="${esc(site)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <meta property="og:locale" content="es_ES">
  ${image ? `<meta property="og:image" content="${esc(image)}">\n  <meta name="twitter:card" content="summary_large_image">` : ''}
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts/fonts.css">
  <link rel="stylesheet" href="/css/legal.css?v=20261108a">
  <style>
    .seo-wrap { max-width: 1060px; margin: 0 auto; padding: 26px 20px 60px; }
    .crumbs { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; padding: 0; margin: 0 0 18px; font-size: 13px; color: var(--muted); }
    .crumbs li + li::before { content: "/"; margin-right: 6px; color: var(--muted-2); }
    .seo-h1 { font: 700 clamp(24px, 3.4vw, 38px)/1.15 var(--display); margin: 6px 0 10px; letter-spacing: -.02em; }
    .seo-lead { color: var(--muted); font-size: 17px; max-width: 76ch; margin: 0 0 22px; }
    .seo-hero { display: grid; grid-template-columns: minmax(0, 320px) minmax(0, 1fr); gap: 26px; align-items: start; margin-bottom: 26px; }
    @media (max-width: 720px) { .seo-hero { grid-template-columns: 1fr; } }
    .seo-figure { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; margin: 0; }
    .seo-figure img { display: block; width: 100%; height: auto; aspect-ratio: 4/3; object-fit: contain; background: #fff; }
    .seo-price { font: 700 30px/1 var(--display); color: var(--ok); margin: 0 0 4px; }
    .seo-meta { color: var(--muted); font-size: 13px; margin: 0 0 14px; }
    .seo-buy { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: #0b0b12; font-weight: 700;
      padding: 12px 18px; border-radius: 10px; text-decoration: none; margin: 4px 0 10px; }
    .seo-buy:hover { color: #0b0b12; filter: brightness(1.08); }
    .seo-note { font-size: 12.5px; color: var(--muted-2); line-height: 1.55; margin: 10px 0 0; }
    .seo-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; padding: 0; margin: 16px 0 0; list-style: none; }
    .seo-card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 12px; display: flex; flex-direction: column; gap: 6px; }
    .seo-card a { text-decoration: none; color: var(--text); font-weight: 600; font-size: 14px; line-height: 1.35; }
    .seo-card a:hover { color: var(--accent); }
    .seo-card img { width: 100%; height: 96px; object-fit: contain; background: #fff; border-radius: 8px; }
    .seo-card .p { color: var(--ok); font-weight: 700; font-size: 14px; }
    .seo-cta { border: 1px solid var(--line); background: var(--bg-soft); border-radius: 14px; padding: 18px 20px; margin: 30px 0 0; }
    .seo-cta a { font-weight: 700; }
    .seo-h2 { font: 700 clamp(19px, 2.2vw, 25px)/1.25 var(--display); margin: 34px 0 10px; }
    .seo-h3 { font: 700 17px/1.3 var(--display); margin: 22px 0 6px; }
    .seo-list { padding-left: 20px; margin: 8px 0; }
    .seo-list li { margin: 5px 0; }
    .seo-badge { display: inline-block; font: 600 12px/1 var(--mono); padding: 5px 9px; border-radius: 999px;
      background: var(--accent-soft); color: #c4b5fd; border: 1px solid rgba(167,139,250,.28); margin: 0 6px 6px 0; }
    .seo-pager { display: flex; gap: 10px; align-items: center; margin: 26px 0 0; font-size: 14px; }
  </style>
  ${graph}
</head>
<body>
  <a class="skip" href="#contenido">Saltar al contenido</a>
  <header class="legal-top">
    <a class="legal-brand" href="/">
      <span class="mark" aria-hidden="true"></span>
      <strong>${esc(site)}</strong>
    </a>
    <nav class="legal-nav" aria-label="Secciones">
      ${NAV.map(([href, label]) => `<a href="${href}">${label}</a>`).join('')}
      <a href="/">Herramientas</a>
    </nav>
  </header>
  <main id="contenido" class="seo-wrap">
    <ol class="crumbs">${crumbHtml}</ol>
    ${body}
    <aside class="seo-cta">
      <p><strong>¿Quieres comprobar tu coche?</strong> En la plataforma puedes leer la centralita con un ELM327, consultar averías por síntoma y cruzar el resultado con estas fichas.</p>
      <p><a href="/">Abrir las herramientas gratuitas →</a></p>
    </aside>
  </main>
  <footer class="legal-foot">
    <p>© ${new Date().getFullYear()} ${esc(site)}${published ? ` · Datos revisados el ${esc(published)}` : ''}</p>
    <nav aria-label="Enlaces del pie">
      <a href="/legal/aviso-legal.html">Aviso legal</a>
      <a href="/legal/privacidad.html">Privacidad</a>
      <a href="/legal/cookies.html">Cookies</a>
      <a href="/legal/afiliacion.html">Afiliación</a>
      <a href="/legal/terminos.html">Términos</a>
    </nav>
    <p class="legal-affiliate">Como Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables. El precio que pagas es el mismo.</p>
  </footer>
</body>
</html>
`;
}

const fmtDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function productCard(item) {
  const price = money(item.price);
  return `<li class="seo-card">
    ${item.image ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" loading="lazy" decoding="async" width="210" height="96">` : ''}
    <a href="/producto/${esc(item.id)}">${esc(item.name)}</a>
    ${price ? `<span class="p">${esc(price.display)}</span>` : '<span class="p">Consultar</span>'}
  </li>`;
}

function crumbsFor(extra) {
  return [{ label: 'Inicio', href: '/' }, ...extra];
}

// ---------------------------------------------------------------- productos

export function productPage(id) {
  const item = findProduct(id);
  if (!item) return null;

  const price = money(item.price);
  const canonical = abs(`/producto/${item.id}`);
  const buy = item.affiliateUrl ? affiliateUrl(item.affiliateUrl) : '';
  const description = clip(item.description || `${item.name} de ${item.manufacturer || 'fabricante'} en la sección ${item.category || 'recambios'}.`, 155);
  const checked = item.priceCheckedAt ? fmtDate(item.priceCheckedAt) : '';
  const sameShelf = products()
    .filter(other => other.id !== item.id && other.category === item.category)
    .slice(0, 8);

  const withBrand = `${item.name}${item.manufacturer ? ` · ${item.manufacturer}` : ''}`;
  const pageTitle = withBrand.length <= 66 ? `${withBrand} · precio` : clip(item.name, 66);

  const specs = [
    ['Fabricante', item.manufacturer],
    ['Categoría', [item.category, item.subcategory].filter(Boolean).join(' › ')],
    ['Tipo de producto', item.productType],
    ['Vendido por', item.seller],
    ['Código del vendedor', item.asin],
    ['Compatibility', item.compatibility?.type],
    ['Comprobado', checked]
  ].filter(([, value]) => value);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${canonical}#product`,
        name: item.name,
        description: strip(item.description || item.name).slice(0, 500),
        sku: item.id,
        ...(item.manufacturer ? { brand: { '@type': 'Brand', name: item.manufacturer } } : {}),
        ...(item.image ? { image: [abs(item.image)] } : {}),
        ...(item.category ? { category: item.category } : {}),
        ...(price ? {
          offers: {
            '@type': 'Offer',
            url: buy || canonical,
            price: price.amount,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
            ...(checked ? { priceValidUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10) } : {}),
            ...(item.seller ? { seller: { '@type': 'Organization', name: item.seller } } : {})
          }
        } : {})
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: abs('/') },
          { '@type': 'ListItem', position: 2, name: 'Productos', item: abs('/productos') },
          { '@type': 'ListItem', position: 3, name: item.name, item: canonical }
        ]
      }
    ]
  };

  const body = `
    <p class="legal-kicker">${esc(item.category || 'Recambio')}${item.subcategory ? ` · ${esc(item.subcategory)}` : ''}</p>
    <h1 class="seo-h1">${esc(item.name)}</h1>
    <p class="seo-lead">${esc(item.description || `Ficha de ${item.name}${item.manufacturer ? ` de ${item.manufacturer}` : ''}.`)}</p>
    <div class="seo-hero">
      <figure class="seo-figure">
        ${item.image
          ? `<img src="${esc(item.image)}" alt="${esc(item.name)}" width="320" height="240">`
          : '<div style="aspect-ratio:4/3;display:grid;place-items:center;color:var(--muted-2)">Sin fotografía verificada</div>'}
      </figure>
      <div>
        ${price ? `<p class="seo-price">${esc(price.display)}</p>` : '<p class="seo-price" style="color:var(--warn)">Precio no disponible</p>'}
        <p class="seo-meta">${item.seller ? `${esc(item.seller)}` : ''}${checked ? `${item.seller ? ' · ' : ''}Precio comprobado el ${esc(checked)}` : ''}</p>
        ${buy ? `<a class="seo-buy" href="${esc(buy)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta en ${esc(item.seller || 'la tienda')} →</a>` : ''}
        ${item.compatibility?.note ? `<p class="seo-note">${esc(item.compatibility.note)}</p>` : ''}
        <p class="seo-note">El importe puede cambiar en la tienda. La referencia válida es la del vendedor en el momento de la compra.</p>
      </div>
    </div>

    <h2 class="seo-h2">Características</h2>
    <table class="legal-table">
      <tbody>
        ${specs.map(([key, value]) => `<tr><th scope="row">${esc(key)}</th><td>${esc(value)}</td></tr>`).join('\n        ')}
      </tbody>
    </table>

    <h2 class="seo-h2">Antes de comprar</h2>
    <p>Comprueba la referencia exacta y la compatibilidad con tu vehículo: dos versiones del mismo modelo pueden llevar piezas distintas según motor, año y equipamiento. Si dudas, consulta la ficha técnica o pásanos el código de tu motor y lo cruzamos con nuestras tablas de averías.</p>
    ${item.tags?.length ? `<p>${item.tags.slice(0, 8).map(tag => `<span class="seo-badge">${esc(tag)}</span>`).join('')}</p>` : ''}

    ${sameShelf.length ? `<h2 class="seo-h2">Más de ${esc(item.category || 'esta sección')}</h2>
    <ul class="seo-grid">${sameShelf.map(productCard).join('')}</ul>` : ''}
  `;

  return {
    html: layout({
      title: pageTitle,
      description,
      canonical,
      image: item.image ? abs(item.image) : '',
      jsonLd,
      crumbs: crumbsFor([{ label: 'Productos', href: '/productos' }, { label: item.name }]),
      body,
      published: checked
    }),
    canonical
  };
}

// ---------------------------------------------------------------- motores

const severityLabel = { alta: 'Gravedad alta', media: 'Gravedad media', baja: 'Gravedad baja', 'media/alta': 'Gravedad media-alta' };

function costRows(cost) {
  if (!cost || typeof cost !== 'object') return '';
  const rows = [
    ['Diagnóstico', cost.diagnosis],
    ['Piezas', cost.parts],
    ['Mano de obra', cost.labour],
    ['Coste típico', cost.typical || cost.total]
  ].filter(([, value]) => value);
  return rows.length ? `<p class="seo-note">${rows.map(([key, value]) => `<strong>${esc(key)}:</strong> ${esc(value)}`).join(' · ')}</p>` : '';
}

export function enginePage(id) {
  const engine = findEngine(id);
  if (!engine) return null;

  const canonical = abs(`/motor/${engine.id}`);
  const label = engine.commercial && engine.family && engine.commercial !== engine.family
    ? `${engine.commercial} · ${engine.family}`
    : (engine.commercial || engine.family || engine.id);
  const heading = `Motor ${label}: averías, fiabilidad y mantenimiento`;
  const pageTitle = heading.length > 68 ? `Motor ${engine.commercial || engine.family}: averías y fiabilidad` : heading;
  const issues = Array.isArray(engine.issues) ? engine.issues : [];
  const description = clip(engine.summary || `${label}: averías conocidas, mantenimiento y fiabilidad.`, 155);

  const facts = [
    ['Marca', engine.brand],
    ['Grupo', engine.group],
    ['Familia', engine.family],
    ['Denominación comercial', engine.commercial],
    ['Códigos de motor', engine.codes],
    ['Años', engine.years],
    ['Cilindrada', engine.displacementCc ? `${engine.displacementCc} cc` : ''],
    ['Combustible', engine.fuel],
    ['Potencia', engine.powerPs],
    ['Alimentación', engine.aspiration],
    ['Inyección', engine.injection],
    ['Transmisión', engine.transmissionNote],
    ['Distribución', engine.distribution?.type],
    ['Cambio de distribución', engine.distribution?.interval || 'Sin intervalo oficial publicado']
  ].filter(([, value]) => value);

  const related = engines()
    .filter(other => other.id !== engine.id && (other.brand === engine.brand || other.group === engine.group))
    .slice(0, 6);

  const faq = [
    issues.length ? {
      q: `¿Qué averías tiene el motor ${engine.commercial || engine.family}?`,
      a: issues.map(issue => issue.title).join('. ') + '.'
    } : null,
    engine.reliability?.note ? {
      q: `¿Es fiable el motor ${engine.commercial || engine.family}?`,
      a: engine.reliability.note
    } : null,
    engine.distribution?.note ? {
      q: `¿Cuándo hay que cambiar la ${engine.distribution.type?.toLowerCase() || 'distribución'} de este motor?`,
      a: engine.distribution.note
    } : null
  ].filter(Boolean);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${canonical}#article`,
        headline: heading,
        description: strip(description),
        about: { '@type': 'Product', name: `Motor ${engine.commercial || engine.family}` },
        articleSection: 'Fiabilidad de motores',
        inLanguage: 'es-ES',
        dateModified: readJSON('engine-reliability.json')?.updated || undefined,
        author: { '@type': 'Organization', name: legal().brand || 'Diagnóstico y Mecánica' },
        publisher: { '@type': 'Organization', name: legal().brand || 'Diagnóstico y Mecánica' }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: abs('/') },
          { '@type': 'ListItem', position: 2, name: 'Motores', item: abs('/motores') },
          { '@type': 'ListItem', position: 3, name: engine.family || engine.id, item: canonical }
        ]
      },
      ...(faq.length ? [{
        '@type': 'FAQPage',
        mainEntity: faq.map(entry => ({
          '@type': 'Question',
          name: entry.q,
          acceptedAnswer: { '@type': 'Answer', text: strip(entry.a) }
        }))
      }] : [])
    ]
  };

  const issueHtml = issues.map((issue, index) => `
    <article>
      <h3 class="seo-h3">${index + 1}. ${esc(issue.title)}</h3>
      <p>${issue.severity ? `<span class="seo-badge">${esc(severityLabel[issue.severity] || issue.severity)}</span>` : ''}${issue.status ? `<span class="seo-badge">${esc(issue.status)}</span>` : ''}</p>
      ${issue.symptom?.length ? `<p><strong>Síntomas</strong></p><ul class="seo-list">${issue.symptom.map(line => `<li>${esc(line)}</li>`).join('')}</ul>` : ''}
      ${issue.cause ? `<p><strong>Causa:</strong> ${esc(issue.cause)}</p>` : ''}
      ${issue.checks?.length ? `<p><strong>Cómo comprobarlo</strong></p><ol class="seo-list">${issue.checks.map(line => `<li>${esc(line)}</li>`).join('')}</ol>` : ''}
      ${issue.solution ? `<p><strong>Solución:</strong> ${esc(issue.solution)}</p>` : ''}
      ${issue.risk ? `<p><strong>Riesgo si se ignora:</strong> ${esc(issue.risk)}</p>` : ''}
      ${costRows(issue.cost)}
    </article>`).join('\n');

  const maintenanceHtml = (engine.maintenance || []).length ? `
    <h2 class="seo-h2">Mantenimiento</h2>
    <table class="legal-table">
      <thead><tr><th>Elemento</th><th>Intervalo</th><th>Nota</th></tr></thead>
      <tbody>
        ${engine.maintenance.map(row => `<tr><td>${esc(row.item)}</td><td>${esc(row.interval || '—')}</td><td>${esc(row.note || '')}</td></tr>`).join('\n        ')}
      </tbody>
    </table>` : '';

  const sources = [
    ...(engine.sources || []),
    ...(engine.distribution?.sources || []),
    ...(engine.maintenance || []).flatMap(row => row.sources || [])
  ].filter(source => source?.url)
    .filter((source, index, list) => list.findIndex(s => s.url === source.url) === index);

  const sourcesHtml = sources.length ? `
    <h2 class="seo-h2">Fuentes consultadas</h2>
    <ul class="seo-list">
      ${sources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="nofollow noopener">${esc(source.title || source.url)}</a>${source.publisher ? ` · ${esc(source.publisher)}` : ''}${source.accessed ? ` · consultado el ${esc(fmtDate(source.accessed))}` : ''}</li>`).join('\n      ')}
    </ul>` : '';

  const body = `
    <p class="legal-kicker">Ficha de motor</p>
    <h1 class="seo-h1">${esc(heading)}</h1>
    <p class="seo-lead">${esc(engine.summary || '')}</p>
    <p>${engine.reliability?.verdict ? `<span class="seo-badge">Fiabilidad ${esc(engine.reliability.verdict)}</span>` : ''}${engine.confidence ? `<span class="seo-badge">Confianza ${esc(engine.confidence)}</span>` : ''}</p>

    <h2 class="seo-h2">Datos técnicos</h2>
    <table class="legal-table">
      <tbody>
        ${facts.map(([key, value]) => `<tr><th scope="row">${esc(key)}</th><td>${esc(value)}</td></tr>`).join('\n        ')}
      </tbody>
    </table>

    ${engine.reliability?.note ? `<h2 class="seo-h2">Fiabilidad</h2><p>${esc(engine.reliability.note)}</p>` : ''}
    ${engine.distribution?.note ? `<h2 class="seo-h2">Distribución</h2><p>${esc(engine.distribution.note)}</p>` : ''}

    <h2 class="seo-h2">Averías frecuentes (${issues.length})</h2>
    ${issueHtml || '<p>No hay averías documentadas para este motor en nuestra base.</p>'}

    ${maintenanceHtml}
    ${sourcesHtml}

    ${related.length ? `<h2 class="seo-h2">Otros motores relacionados</h2>
    <ul class="seo-list">${related.map(other => `<li><a href="/motor/${esc(other.id)}">${esc(other.commercial || other.family)} · ${esc(other.brand)}</a></li>`).join('')}</ul>` : ''}
  `;

  return {
    html: layout({
      title: pageTitle,
      description,
      canonical,
      jsonLd,
      crumbs: crumbsFor([{ label: 'Motores', href: '/motores' }, { label: engine.family || engine.id }]),
      body,
      published: readJSON('engine-reliability.json')?.updated ? fmtDate(readJSON('engine-reliability.json').updated) : ''
    }),
    canonical
  };
}

// ---------------------------------------------------------------- neumáticos

export function tyrePage(id) {
  const tyre = findTyre(id);
  if (!tyre) return null;

  const canonical = abs(`/neumatico/${tyre.id}`);
  const price = money(tyre.price);
  const buy = tyre.url ? affiliateUrl(tyre.url) : '';
  const name = `${tyre.brand} ${tyre.model} ${tyre.size}`;
  const seen = tyre.priceSeen || tyre.verifiedAt;
  const description = clip(`${tyre.brand} ${tyre.model} en medida ${tyre.size}, neumático de ${tyre.season || 'uso general'}${price ? ` desde ${price.display}` : ''}.`, 155);

  const labels = tyre.labels || {};
  const facts = [
    ['Marca', tyre.brand],
    ['Modelo', tyre.model],
    ['Medida', tyre.size],
    ['Anchura', tyre.width ? `${tyre.width} mm` : ''],
    ['Perfil', tyre.profile ? `${tyre.profile} %` : ''],
    ['Diámetro de llanta', tyre.rim ? `${tyre.rim}″` : ''],
    ['Índice de carga', tyre.load],
    ['Índice de velocidad', tyre.speed],
    ['Temporada', tyre.season],
    ['Tipo de vehículo', tyre.type],
    ['Etiqueta: adherencia en mojado', labels.wet],
    ['Etiqueta: ruido', labels.noise],
    ['Comprobado', seen ? fmtDate(seen) : '']
  ].filter(([, value]) => value);

  const sameSize = tyres().filter(other => other.id !== tyre.id && other.size === tyre.size).slice(0, 6);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${canonical}#product`,
        name,
        description: strip(description),
        sku: tyre.id,
        brand: { '@type': 'Brand', name: tyre.brand },
        ...(tyre.image ? { image: [abs(tyre.image)] } : {}),
        ...(price ? {
          offers: {
            '@type': 'Offer',
            url: buy || canonical,
            price: price.amount,
            priceCurrency: 'EUR',
            availability: 'https://schema.org/InStock',
            seller: { '@type': 'Organization', name: tyre.shop || 'Tienda' }
          }
        } : {})
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: abs('/') },
          { '@type': 'ListItem', position: 2, name: 'Neumáticos', item: abs('/neumaticos') },
          { '@type': 'ListItem', position: 3, name, item: canonical }
        ]
      }
    ]
  };

  const body = `
    <p class="legal-kicker">Neumático · ${esc(tyre.size)}</p>
    <h1 class="seo-h1">${esc(name)}</h1>
    <p class="seo-lead">${esc(description)}</p>
    <div class="seo-hero">
      <figure class="seo-figure">${tyre.image ? `<img src="${esc(tyre.image)}" alt="${esc(name)}" width="320" height="240">` : ''}</figure>
      <div>
        ${price ? `<p class="seo-price">${esc(price.display)}</p>` : ''}
        <p class="seo-meta">${esc(tyre.shop || '')}${seen ? `${tyre.shop ? ' · ' : ''}precio visto el ${esc(fmtDate(seen))}` : ''}</p>
        ${buy ? `<a class="seo-buy" href="${esc(buy)}" target="_blank" rel="sponsored nofollow noopener">Ver oferta en ${esc(tyre.shop || 'la tienda')} →</a>` : ''}
        <p class="seo-note">Confirma siempre la medida en la ficha técnica y en el flanco del neumático montado antes de comprar.</p>
      </div>
    </div>
    <h2 class="seo-h2">Características</h2>
    <table class="legal-table"><tbody>
      ${facts.map(([key, value]) => `<tr><th scope="row">${esc(key)}</th><td>${esc(value)}</td></tr>`).join('\n      ')}
    </tbody></table>
    ${sameSize.length ? `<h2 class="seo-h2">Misma medida</h2><ul class="seo-grid">${sameSize.map(other => `<li class="seo-card"><a href="/neumatico/${esc(other.id)}">${esc(other.brand)} ${esc(other.model)}</a><span class="p">${esc(money(other.price)?.display || 'Consultar')}</span></li>`).join('')}</ul>` : ''}
  `;

  return {
    html: layout({
      title: `${name} · precio y características`,
      description,
      canonical,
      image: tyre.image ? abs(tyre.image) : '',
      jsonLd,
      crumbs: crumbsFor([{ label: 'Neumáticos', href: '/neumaticos' }, { label: name }]),
      body,
      published: seen ? fmtDate(seen) : ''
    }),
    canonical
  };
}

// ---------------------------------------------------------------- índices

const PER_PAGE = 60;

export function productsIndex(page = 1) {
  const all = products();
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const slice = all.slice((current - 1) * PER_PAGE, current * PER_PAGE);
  const canonical = abs(current === 1 ? '/productos' : `/productos?page=${current}`);
  const withPrice = all.filter(item => money(item.price)).length;

  const body = `
    <p class="legal-kicker">Catálogo</p>
    <h1 class="seo-h1">Productos y recambios con precio comprobado</h1>
    <p class="seo-lead">${all.length} fichas de herramientas, recambios y consumibles, de las cuales ${withPrice} muestran el precio actual de la tienda. Cada ficha enlaza al vendedor y se revisa periódicamente.</p>
    <p class="seo-meta">Página ${current} de ${pages}</p>
    <ul class="seo-grid">${slice.map(productCard).join('')}</ul>
    <nav class="seo-pager" aria-label="Paginación">
      ${current > 1 ? `<a href="/productos${current - 1 === 1 ? '' : `?page=${current - 1}`}">← Anterior</a>` : ''}
      <span>${current} / ${pages}</span>
      ${current < pages ? `<a href="/productos?page=${current + 1}">Siguiente →</a>` : ''}
    </nav>
  `;

  return {
    html: layout({
      title: `Productos y recambios con precio · página ${current}`,
      description: clip(`Catálogo de ${all.length} productos de automoción con precio actualizado, fotografía y enlace al vendedor. Página ${current} de ${pages}.`, 155),
      canonical,
      robots: current > 1 ? 'noindex,follow' : undefined,
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'CollectionPage',
            '@id': `${canonical}#page`,
            name: 'Productos y recambios con precio',
            isPartOf: { '@type': 'WebSite', name: legal().brand || 'Diagnóstico y Mecánica', url: `${baseUrl()}/` }
          },
          {
            '@type': 'ItemList',
            itemListElement: slice.slice(0, 30).map((item, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              url: abs(`/producto/${item.id}`),
              name: item.name
            }))
          }
        ]
      },
      crumbs: crumbsFor([{ label: 'Productos' }]),
      body
    }),
    canonical
  };
}

export function enginesIndex() {
  const all = engines();
  const byBrand = new Map();
  for (const engine of all) {
    const key = engine.brand || 'Otros';
    if (!byBrand.has(key)) byBrand.set(key, []);
    byBrand.get(key).push(engine);
  }

  const body = `
    <p class="legal-kicker">Fiabilidad</p>
    <h1 class="seo-h1">Motores: averías frecuentes, fiabilidad y mantenimiento</h1>
    <p class="seo-lead">${all.length} motores documentados con sus fallos típicos, cómo comprobarlos, coste orientativo y fuentes consultadas. Ordenados por marca.</p>
    ${Array.from(byBrand.entries()).map(([brand, list]) => `
      <h2 class="seo-h2">${esc(brand)}</h2>
      <ul class="seo-list">
        ${list.map(engine => `<li><a href="/motor/${esc(engine.id)}">${esc(engine.commercial || engine.family)} · ${esc(engine.family)}</a>${engine.reliability?.verdict ? ` · fiabilidad ${esc(engine.reliability.verdict)}` : ''}</li>`).join('\n        ')}
      </ul>`).join('\n')}
  `;

  return {
    html: layout({
      title: 'Motores: averías frecuentes y fiabilidad',
      description: clip('Base de motores con averías típicas, síntomas, comprobaciones, costes orientativos y fuentes técnicas. Ordenada por marca y familia.', 155),
      canonical: abs('/motores'),
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: all.slice(0, 50).map((engine, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: abs(`/motor/${engine.id}`),
          name: `Motor ${engine.commercial || engine.family}`
        }))
      },
      crumbs: crumbsFor([{ label: 'Motores' }]),
      body
    })
  };
}

export function tyresIndex() {
  const all = tyres();
  const sizes = new Map();
  for (const tyre of all) {
    if (!sizes.has(tyre.size)) sizes.set(tyre.size, []);
    sizes.get(tyre.size).push(tyre);
  }

  const body = `
    <p class="legal-kicker">Neumáticos</p>
    <h1 class="seo-h1">Neumáticos por medida, con precio y características</h1>
    <p class="seo-lead">${all.length} neumáticos verificados en ${sizes.size} medidas. Cada ficha indica índices de carga y velocidad, temporada y precio visto en tienda.</p>
    ${Array.from(sizes.entries()).map(([size, list]) => `
      <h2 class="seo-h2">${esc(size)}</h2>
      <ul class="seo-list">
        ${list.map(tyre => `<li><a href="/neumatico/${esc(tyre.id)}">${esc(tyre.brand)} ${esc(tyre.model)}</a>${money(tyre.price) ? ` · ${esc(money(tyre.price).display)}` : ''}</li>`).join('\n        ')}
      </ul>`).join('\n')}
  `;

  return {
    html: layout({
      title: 'Neumáticos por medida con precio',
      description: clip('Neumáticos verificados por medida: índices de carga y velocidad, temporada, etiqueta europea y precio actualizado con enlace a la tienda.', 155),
      canonical: abs('/neumaticos'),
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: all.slice(0, 48).map((tyre, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: abs(`/neumatico/${tyre.id}`),
          name: `${tyre.brand} ${tyre.model} ${tyre.size}`
        }))
      },
      crumbs: crumbsFor([{ label: 'Neumáticos' }]),
      body
    })
  };
}

// ---------------------------------------------------------------- sitemap

export function sitemapXml() {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    { loc: '/', priority: '1.0', changefreq: 'daily' },
    { loc: '/productos', priority: '0.9', changefreq: 'daily' },
    { loc: '/motores', priority: '0.9', changefreq: 'weekly' },
    { loc: '/neumaticos', priority: '0.8', changefreq: 'weekly' },
    ...products().map(item => ({ loc: `/producto/${item.id}`, priority: '0.7', changefreq: 'weekly' })),
    ...engines().map(engine => ({ loc: `/motor/${engine.id}`, priority: '0.8', changefreq: 'monthly' })),
    ...tyres().map(tyre => ({ loc: `/neumatico/${tyre.id}`, priority: '0.6', changefreq: 'weekly' })),
    ...[['aviso-legal', 'Aviso legal'], ['privacidad', 'Privacidad'], ['cookies', 'Cookies'], ['afiliacion', 'Afiliación'], ['terminos', 'Términos']]
      .map(([slug]) => ({ loc: `/legal/${slug}.html`, priority: '0.3', changefreq: 'yearly' }))
  ];

  const urls = entries.map(entry => `  <url>\n    <loc>${abs(entry.loc)}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${entry.changefreq}</changefreq>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function urlCount() {
  return 4 + products().length + engines().length + tyres().length + 5;
}
