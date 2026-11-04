import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import apiRouter from './src/routes/api.js';
import sintomasRouter from './src/routes/sintomas.js';
import forumRouter from './src/routes/forum.js';
import garageRouter from './src/routes/garage.js';
import testigosRouter from './src/routes/testigos.js';
import tutorialsRouter from './src/routes/tutorials.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(compression());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '16mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

app.use('/api/forum', forumRouter);
app.use('/api/garage', garageRouter);
app.use('/api/testigos', testigosRouter);
app.use('/api/tutorials', tutorialsRouter);
app.use('/api', apiRouter);
app.use('/api/sintomas', sintomasRouter);
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  extensions: ['html']
}));

// Solo las rutas de la aplicación devuelven la página principal. Una petición
// a un archivo con extensión (js, css, imagen, modelo...) que no existe debe
// dar 404: si devolviera index.html, un recurso roto pasaría por correcto y el
// navegador intentaría ejecutar HTML como JavaScript.
const ASSET_PATH = /\.(?:js|mjs|css|map|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|glb|gltf|bin|wasm|json|txt|xml|pdf|mp4|webm)$/i;

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
});
