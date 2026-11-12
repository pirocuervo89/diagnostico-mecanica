import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import fs from 'node:fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRouter from './src/routes/api.js';
import sintomasRouter from './src/routes/sintomas.js';
import forumRouter from './src/routes/forum.js';
import garageRouter from './src/routes/garage.js';
import testigosRouter from './src/routes/testigos.js';
import tutorialsRouter from './src/routes/tutorials.js';
import paymentsRouter from './src/routes/payments.js';
import pricesRouter from './src/routes/prices.js';
import seoRouter from './src/routes/seo.js';
import affiliatesRouter from './src/routes/affiliates.js';
import { startPriceSync } from './src/lib/price_sync.js';
import { installShutdownBackup, backupStatus } from './src/lib/db_persist.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

// Verificación de Android: la app solo abre el dominio sin barra de direcciones
// si este archivo declara la huella SHA-256 de su firma. La huella es pública y
// vive en data/android.json; la variable de entorno la sustituye cuando se usa
// Play App Signing (la clave que firma en Play no es la del APK local).
let androidConfig = {};
try {
  androidConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'android.json'), 'utf8'));
} catch {
  androidConfig = {};
}
const ANDROID_PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || androidConfig.packageName || 'com.diagnosticomecanica.app';
const ANDROID_ENV_FINGERPRINTS = String(process.env.ANDROID_SHA256_FINGERPRINT || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const ANDROID_SHA256_FINGERPRINTS = ANDROID_ENV_FINGERPRINTS.length
  ? ANDROID_ENV_FINGERPRINTS
  : (Array.isArray(androidConfig.sha256Fingerprints) ? androidConfig.sha256Fingerprints : []);

app.disable('x-powered-by');
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({
  limit: '16mb',
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // microphone=(self) es obligatorio: con microphone=() el navegador bloquea
  // getUserMedia en toda la web, aunque el usuario conceda el permiso.
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(self), camera=(self)');
  next();
});

app.use('/api/forum', forumRouter);
app.use('/api/garage', garageRouter);
app.use('/api/testigos', testigosRouter);
app.use('/api/tutorials', tutorialsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/afiliados', affiliatesRouter);
app.use('/api', apiRouter);
app.use('/api/sintomas', sintomasRouter);
// Páginas con URL propia para buscadores. Va antes del estático porque también
// sirve el /sitemap.xml generado (debe sustituir al archivo fijo).
app.use(seoRouter);

app.get('/.well-known/assetlinks.json', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('application/json').send(JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: ANDROID_PACKAGE_NAME,
      sha256_cert_fingerprints: ANDROID_SHA256_FINGERPRINTS
    }
  }]));
});

// El service worker debe poder actualizarse aunque el resto del sitio se cachee.
app.get('/sw.js', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache');
  next();
});

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  extensions: ['html']
}));

// Solo las rutas de la aplicación devuelven la página principal. Una petición
// a un archivo con extensión (js, css, imagen, modelo...) que no existe debe
// dar 404: si devolviera index.html, un recurso roto pasaría por correcto y el
// navegador intentaría ejecutar HTML como JavaScript.
const ASSET_PATH = /\.(?:js|mjs|css|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|glb|gltf|bin|wasm|json|txt|xml|pdf|mp4|webm|apk|aab)$/i;

app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
  if (ASSET_PATH.test(req.path)) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Recurso no encontrado' }));
app.use((req, res) => {
  res.status(404).send('<!doctype html><html lang="es"><meta charset="utf-8"><title>404 · Recurso no encontrado</title><p>Recurso no encontrado.</p></html>');
});
app.use((err, req, res, _next) => {
  // Errores del cliente: no son fallos del servidor y no deben registrarse como tales.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es JSON válido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'El cuerpo de la petición es demasiado grande' });
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('==========================================');
  console.log(' DIAGNOSTICO Y MECANICA - servidor activo');
  console.log('==========================================');
  console.log(` Local: http://localhost:${PORT}`);
  console.log(` Red:   http://<tu-ip-local>:${PORT}`);
  console.log('');
  const backup = backupStatus();
  console.log(backup.enabled
    ? `[db] copia de seguridad activa en el bucket ${backup.bucket}`
    : '[db] SIN copia en la nube (faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  installShutdownBackup();
  startPriceSync();
});
