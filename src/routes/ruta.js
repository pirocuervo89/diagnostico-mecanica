import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

// La sección «Ruta» usa datos libres de OpenStreetMap. Las peticiones salen
// del servidor y no del móvil por dos motivos: Nominatim exige un User-Agent
// identificable (el navegador no deja cambiarlo) y así se puede cachear para no
// castigar los servicios públicos con cada búsqueda.

const router = express.Router();

// Los avisos de la comunidad tienen que sobrevivir a un reinicio de Render:
// se guardan en SQLite, igual que el foro y el garaje. Si el disco no se puede
// abrir, la app sigue funcionando solo con memoria.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(process.env.RUTA_DB_PATH || path.join(__dirname, '..', '..', 'data', 'ruta.sqlite'));
let db = null;
try {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ruta_avisos (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      label TEXT NOT NULL,
      lat REAL NOT NULL,
      lon REAL NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      creado INTEGER NOT NULL,
      expira INTEGER NOT NULL,
      confirmaciones INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_ruta_avisos_expira ON ruta_avisos(expira);
  `);
} catch (error) {
  db = null;
  console.warn('[ruta] avisos sin persistencia:', error.message);
}

const UA = 'DiagnosticoYMecanica/1.0 (https://diagnostico-mecanica.onrender.com)';
const cache = new Map(); // clave -> { at, ttl, data }

function recordar(clave, ttl, data) {
  cache.set(clave, { at: Date.now(), ttl, data });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
}

function leer(clave) {
  const hit = cache.get(clave);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) { cache.delete(clave); return null; }
  return hit.data;
}

async function pedirJson(url, ms = 9000) {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(ms)
  });
  if (!r.ok) throw new Error(`upstream ${r.status}`);
  return r.json();
}

const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// ------------------------------------------------- avisos de la comunidad
// Lo que en Waze pone la gente: accidentes, retenciones, obras, controles...
// Sin cuentas ni base de datos: se guardan en memoria del servidor, caducan
// solos y se limitan por IP. Nunca se presentan como información oficial.
const TIPOS_AVISO = {
  accidente: { label: 'Accidente', ttl: 2 * 3600000 },
  retencion: { label: 'Retención', ttl: 45 * 60000 },
  obra: { label: 'Obras', ttl: 8 * 3600000 },
  policia: { label: 'Control policial', ttl: 60 * 60000 },
  peligro: { label: 'Peligro en la vía', ttl: 2 * 3600000 },
  vehiculo: { label: 'Vehículo averiado', ttl: 2 * 3600000 },
  objeto: { label: 'Objeto en la calzada', ttl: 2 * 3600000 },
  clima: { label: 'Mal tiempo', ttl: 3 * 3600000 }
};
const comunitarios = new Map();
const ultimoPorIp = new Map();
const MAX_COMUNITARIOS = 500;

// Al arrancar se recupera lo que siga vivo; lo caducado se borra.
if (db) {
  try {
    db.prepare('DELETE FROM ruta_avisos WHERE expira <= ?').run(Date.now());
    for (const fila of db.prepare('SELECT * FROM ruta_avisos').all()) {
      comunitarios.set(fila.id, { ...fila, name: fila.name || '' });
    }
  } catch (error) {
    console.warn('[ruta] no se pudieron recuperar los avisos:', error.message);
  }
}

function guardarEnDb(aviso) {
  if (!db) return;
  try {
    db.prepare(`INSERT INTO ruta_avisos (id, kind, label, lat, lon, name, creado, expira, confirmaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET expira = excluded.expira, confirmaciones = excluded.confirmaciones`)
      .run(aviso.id, aviso.kind, aviso.label, aviso.lat, aviso.lon, aviso.name || '',
        aviso.creado, aviso.expira, aviso.confirmaciones);
  } catch (error) {
    console.warn('[ruta] no se pudo guardar el aviso:', error.message);
  }
}

function borrarDeDb(id) {
  if (!db) return;
  try { db.prepare('DELETE FROM ruta_avisos WHERE id = ?').run(id); } catch (_e) { /* da igual */ }
}

function distanciaMetros(aLat, aLon, bLat, bLon) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function limpiarComunitarios() {
  const ahora = Date.now();
  for (const [id, aviso] of comunitarios) {
    if (aviso.expira > ahora) continue;
    comunitarios.delete(id);
    borrarDeDb(id);
  }
  for (const [ip, ts] of ultimoPorIp) if (ahora - ts > 10 * 60000) ultimoPorIp.delete(ip);
}

function comunitariosCerca(lat, lon, radio) {
  limpiarComunitarios();
  const ahora = Date.now();
  const salida = [];
  for (const aviso of comunitarios.values()) {
    if (distanciaMetros(lat, lon, aviso.lat, aviso.lon) > radio) continue;
    salida.push({ ...aviso, origen: 'comunidad', edadMs: ahora - aviso.creado });
  }
  return salida.sort((a, b) => b.creado - a.creado);
}

function conComunidad(listaOsm, lat, lon, radio) {
  return [...comunitariosCerca(lat, lon, radio), ...listaOsm];
}

router.use(express.json({ limit: '8kb' }));

// ---------------------------------------------------------------- geocodificar
router.get('/geocode', async (req, res) => {
  const q = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (q.length < 3) return res.status(400).json({ error: 'Escribe al menos 3 letras' });

  const clave = `geo|${q.toLowerCase()}`;
  const guardado = leer(clave);
  if (guardado) return res.json({ results: guardado, cached: true });

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=es&q=${encodeURIComponent(q)}`;
    const datos = await pedirJson(url);
    const results = (Array.isArray(datos) ? datos : []).map(item => ({
      name: String(item.display_name || '').split(',').slice(0, 3).join(',').trim(),
      full: item.display_name,
      lat: Number(item.lat),
      lon: Number(item.lon),
      type: item.type || item.category || ''
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon));

    recordar(clave, 60 * 60 * 1000, results);
    res.json({ results });
  } catch (_e) {
    res.status(502).json({ error: 'No se pudo buscar el destino ahora mismo' });
  }
});

// -------------------------------------------------------------------- ruta
router.get('/route', async (req, res) => {
  const [fLat, fLon] = String(req.query.from || '').split(',').map(Number);
  const [tLat, tLon] = String(req.query.to || '').split(',').map(Number);
  if (![fLat, fLon, tLat, tLon].every(Number.isFinite)) {
    return res.status(400).json({ error: 'Coordenadas no válidas' });
  }

  const clave = `ruta|${fLat.toFixed(4)},${fLon.toFixed(4)}|${tLat.toFixed(4)},${tLon.toFixed(4)}`;
  const guardado = leer(clave);
  // La caché guarda el objeto completo {route, routes}: al devolverlo había
  // que abrirlo, no envolverlo otra vez, o la segunda consulta llegaba sin
  // geometría y el mapa decía que el servicio no respondía.
  if (guardado) return res.json({ route: guardado.route, routes: guardado.routes, cached: true });

  try {
    // alternatives: hasta tres caminos para que el usuario elija. OJO: el OSRM
    // público rechaza `annotations=maxspeed` (400); el límite de la vía se
    // obtiene de los tags de OpenStreetMap en /avisos.
    const url = `https://router.project-osrm.org/route/v1/driving/${fLon},${fLat};${tLon},${tLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;
    const datos = await pedirJson(url, 14000);
    if (!Array.isArray(datos?.routes) || !datos.routes.length) {
      return res.status(404).json({ error: 'No hay ruta por carretera hasta ese punto' });
    }

    const normalizar = ruta => {
      const steps = [];
      (ruta.legs?.[0]?.steps || []).forEach(s => {
        const m = s.maneuver || {};
        steps.push({
          type: m.type || 'continue',
          modifier: m.modifier || '',
          name: s.name || '',
          ref: String(s.ref || m.ref || '').trim(),
          exit: Number.isFinite(m.exit) ? m.exit : null,
          distance: Math.round(s.distance || 0),
          lat: m.location?.[1],
          lon: m.location?.[0]
        });
      });

      // Los límites de la vía vienen de /avisos (tags maxspeed de OSM).
      const limits = [];

      return {
        distance: Math.round(ruta.distance || 0),
        duration: Math.round(ruta.duration || 0),
        geometry: (ruta.geometry?.coordinates || []).map(c => [c[1], c[0]]),
        steps,
        limits
      };
    };

    const routes = datos.routes.slice(0, 3).map(normalizar);
    const salida = { route: routes[0], routes };

    recordar(clave, 15 * 60 * 1000, salida);
    res.json(salida);
  } catch (_e) {
    res.status(502).json({ error: 'El servicio de rutas no responde. Inténtalo en un momento.' });
  }
});

// ------------------------------------------------------------------ radares
// OpenStreetMap tiene los radares fijos mapeados. No es el aviso en tiempo real
// de Waze: son los puntos conocidos y su velocidad, que es lo que se puede usar
// gratis y sin depender de otra app.
router.get('/avisos', async (req, res) => {
  const lat = num(req.query.lat, -90, 90);
  const lon = num(req.query.lon, -180, 180);
  const radio = num(req.query.radio, 500, 12000) || 6000;
  if (lat === null || lon === null) return res.status(400).json({ error: 'Faltan coordenadas' });

  // osm=0 devuelve solo los avisos de la comunidad: sirve para comprobar la
  // función sin depender de Overpass (y para no castigarlo en las pruebas).
  if (req.query.osm === '0') {
    return res.json({ avisos: comunitariosCerca(lat, lon, radio), radares: [], soloComunidad: true });
  }

  const clave = `aviso|${lat.toFixed(2)},${lon.toFixed(2)}|${Math.round(radio / 1000)}`;
  const guardado = leer(clave);
  if (guardado) {
    const avisos = conComunidad(guardado, lat, lon, radio);
    return res.json({ avisos, radares: avisos.filter(a => a.kind === 'radar'), cached: true });
  }

  // Radares fijos, semáforos, obras y peligros señalados en OpenStreetMap. No
  // es el aviso en directo de Waze: es lo que la comunidad tiene mapeado, que
  // se puede usar gratis y sin depender de otra app.
  const consulta = `[out:json][timeout:20];
    (
      node["highway"="speed_camera"](around:${radio},${lat},${lon});
      node["enforcement"="maxspeed"](around:${radio},${lat},${lon});
      node["man_made"="surveillance"]["surveillance:type"="ALPR"](around:${radio},${lat},${lon});
      node["highway"="traffic_signals"](around:${radio},${lat},${lon});
      node["hazard"](around:${radio},${lat},${lon});
      node["highway"="construction"](around:${radio},${lat},${lon});
      way["highway"="construction"](around:${radio},${lat},${lon});
      way["highway"]["maxspeed"](around:${radio},${lat},${lon});
    );
    out center tags 220;`;

  // Overpass rechaza (406) las peticiones sin User-Agent propio y a veces
  // tarda: se prueban dos servidores y, si ambos fallan, se sigue sin radares.
  // Primero los espejos con el planeta completo; osm.ch va al final porque su
  // extracto no cubre bien España y devolvía vacío como si no hubiera nada.
  const servidores = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.osm.ch/api/interpreter'
  ];
  let datos = null;
  for (const servidor of servidores) {
    try {
      const respuesta = await fetch(servidor, {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: new URLSearchParams({ data: consulta }),
        signal: AbortSignal.timeout(22000)
      });
      if (!respuesta.ok) continue;
      datos = await respuesta.json();
      break;
    } catch (_e) { /* se prueba el siguiente espejo */ }
  }

  try {
    if (!datos) throw new Error('sin datos');
    const etiquetas = { radar: 'Radar', camara: 'Cámara', obra: 'Obras', senal: 'Semáforo', peligro: 'Peligro', limite: 'Límite' };
    const avisos = (datos?.elements || [])
      .map(n => {
        const lat2 = Number.isFinite(n.lat) ? n.lat : n.center?.lat;
        const lon2 = Number.isFinite(n.lon) ? n.lon : n.center?.lon;
        const t = n.tags || {};
        let kind = '';
        if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed') kind = 'radar';
        else if (t.man_made === 'surveillance') kind = 'camara';
        else if (t.highway === 'traffic_signals') kind = 'senal';
        else if (t.highway === 'construction' || t.construction) kind = 'obra';
        else if (t.hazard) kind = 'peligro';
        else if (t.maxspeed && t.highway) kind = 'limite';
        if (!kind || !Number.isFinite(lat2) || !Number.isFinite(lon2)) return null;
        return {
          id: String(n.id),
          lat: lat2,
          lon: lon2,
          maxspeed: t.maxspeed || '',
          kind,
          label: etiquetas[kind] || 'Aviso',
          name: t.name || t.ref || t.hazard || t.description || ''
        };
      })
      .filter(Boolean);

    recordar(clave, 30 * 60 * 1000, avisos);
    const mezcla = conComunidad(avisos, lat, lon, radio);
    res.json({ avisos: mezcla, radares: mezcla.filter(a => a.kind === 'radar') });
  } catch (_e) {
    // Sin avisos la navegación sigue funcionando: no es un error de la ruta.
    // Se cachea el fallo unos minutos para no castigar a Overpass en cada viaje.
    recordar(clave, 3 * 60 * 1000, []);
    res.json({
      avisos: comunitariosCerca(lat, lon, radio),
      radares: [],
      aviso: 'No se pudieron cargar los avisos de OpenStreetMap ahora mismo'
    });
  }
});

// ------------------------------------------------- reportar / confirmar
router.post('/avisos', (req, res) => {
  const kind = String(req.body?.kind || '').trim();
  const tipo = TIPOS_AVISO[kind];
  if (!tipo) return res.status(400).json({ error: 'Tipo de aviso no válido' });
  const lat = num(req.body?.lat, -90, 90);
  const lon = num(req.body?.lon, -180, 180);
  if (lat === null || lon === null) return res.status(400).json({ error: 'Faltan coordenadas del aviso' });

  const ip = String(req.ip || req.socket?.remoteAddress || 'anon');
  const ahora = Date.now();
  if (ahora - (ultimoPorIp.get(ip) || 0) < 45000) {
    return res.status(429).json({ error: 'Espera un poco antes de mandar otro aviso' });
  }

  limpiarComunitarios();
  if (comunitarios.size >= MAX_COMUNITARIOS) {
    const masViejo = [...comunitarios.entries()].sort((a, b) => a[1].creado - b[1].creado)[0];
    if (masViejo) comunitarios.delete(masViejo[0]);
  }

  const aviso = {
    id: `c${ahora.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    kind,
    label: tipo.label,
    lat,
    lon,
    name: String(req.body?.nota || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    creado: ahora,
    expira: ahora + tipo.ttl,
    confirmaciones: 1
  };
  comunitarios.set(aviso.id, aviso);
  guardarEnDb(aviso);
  ultimoPorIp.set(ip, ahora);
  res.status(201).json({ aviso: { ...aviso, origen: 'comunidad', edadMs: 0 } });
});

// «Sigue ahí»: cada confirmación alarga un poco la vida del aviso, con techo,
// para que un accidente real no desaparezca al minuto y uno viejo no se eternice.
router.post('/avisos/:id/confirmar', (req, res) => {
  limpiarComunitarios();
  const aviso = comunitarios.get(String(req.params.id || ''));
  if (!aviso) return res.status(404).json({ error: 'Ese aviso ya no está activo' });
  aviso.confirmaciones += 1;
  aviso.expira = Math.min(aviso.expira + 15 * 60000, aviso.creado + 12 * 3600000);
  guardarEnDb(aviso);
  res.json({ aviso: { ...aviso, origen: 'comunidad', edadMs: Date.now() - aviso.creado } });
});

export default router;
