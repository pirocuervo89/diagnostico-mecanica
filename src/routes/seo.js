import express from 'express';
import {
  productPage,
  enginePage,
  tyrePage,
  productsIndex,
  enginesIndex,
  tyresIndex,
  sitemapXml
} from '../lib/seo.js';

const router = express.Router();

const HTML = 'text/html; charset=utf-8';

// Las fichas cambian poco (precio y fecha como mucho cada 20 minutos): una
// caché corta evita regenerar HTML en cada visita sin servir datos viejos.
function sendHtml(res, page) {
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  res.type(HTML).send(page.html);
}

function notFound(res, message) {
  res.status(404).setHeader('Cache-Control', 'no-store');
  res.type(HTML).send(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>404 · No encontrado</title><meta name="robots" content="noindex,follow">
<link rel="stylesheet" href="/css/legal.css?v=20261108a">
</head><body><main class="legal-wrap"><p class="legal-kicker">Error 404</p>
<h1>No encontramos esa página</h1><p>${message}</p>
<p><a href="/productos">Productos</a> · <a href="/motores">Motores</a> · <a href="/neumaticos">Neumáticos</a> · <a href="/">Inicio</a></p>
</main></body></html>`);
}

router.get('/sitemap.xml', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=1800');
  res.type('application/xml; charset=utf-8').send(sitemapXml());
});

router.get('/productos', (req, res) => {
  const page = productsIndex(req.query.page);
  if (!page) return notFound(res, 'La página del catálogo no existe.');
  return sendHtml(res, page);
});

router.get('/motores', (_req, res) => sendHtml(res, enginesIndex()));
router.get('/neumaticos', (_req, res) => sendHtml(res, tyresIndex()));

router.get('/producto/:id', (req, res) => {
  const page = productPage(req.params.id);
  return page ? sendHtml(res, page) : notFound(res, 'Ese producto no está en el catálogo o ha cambiado de identificador.');
});

router.get('/motor/:id', (req, res) => {
  const page = enginePage(req.params.id);
  return page ? sendHtml(res, page) : notFound(res, 'Ese motor no está en nuestra base de fiabilidad.');
});

router.get('/neumatico/:id', (req, res) => {
  const page = tyrePage(req.params.id);
  return page ? sendHtml(res, page) : notFound(res, 'Ese neumático no está en el catálogo.');
});

export default router;
