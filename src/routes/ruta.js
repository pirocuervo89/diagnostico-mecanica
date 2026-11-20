import express from 'express';

// La sección «Ruta» usa datos libres de OpenStreetMap. Las peticiones salen
// del servidor y no del móvil por dos motivos: Nominatim exige un User-Agent
// identificable (el navegador no deja cambiarlo) y así se puede cachear para no
// castigar los servicios públicos con cada búsqueda.

const router = express.Router();

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
  if (guardado) return res.json({ route: guardado, cached: true });

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fLon},${fLat};${tLon},${tLat}?overview=full&geometries=geojson&steps=true&alternatives=false`;
    const datos = await pedirJson(url, 12000);
    const ruta = datos?.routes?.[0];
    if (!ruta) return res.status(404).json({ error: 'No hay ruta por carretera hasta ese punto' });

    const steps = [];
    (ruta.legs?.[0]?.steps || []).forEach(s => {
      const m = s.maneuver || {};
      steps.push({
        type: m.type || 'continue',
        modifier: m.modifier || '',
        name: s.name || '',
        distance: Math.round(s.distance || 0),
        lat: m.location?.[1],
        lon: m.location?.[0]
      });
    });

    const salida = {
      distance: Math.round(ruta.distance || 0),
      duration: Math.round(ruta.duration || 0),
      geometry: (ruta.geometry?.coordinates || []).map(c => [c[1], c[0]]),
      steps
    };

    recordar(clave, 15 * 60 * 1000, salida);
    res.json({ route: salida });
  } catch (_e) {
    res.status(502).json({ error: 'El servicio de rutas no responde. Inténtalo en un momento.' });
  }
});

// ------------------------------------------------------------------ radares
// OpenStreetMap tiene los radares fijos mapeados. No es el aviso en tiempo real
// de Waze: son los puntos conocidos y su velocidad, que es lo que se puede usar
// gratis y sin depender de otra app.
router.get('/radares', async (req, res) => {
  const lat = num(req.query.lat, -90, 90);
  const lon = num(req.query.lon, -180, 180);
  const radio = num(req.query.radio, 500, 12000) || 6000;
  if (lat === null || lon === null) return res.status(400).json({ error: 'Faltan coordenadas' });

  const clave = `rad|${lat.toFixed(2)},${lon.toFixed(2)}|${Math.round(radio / 1000)}`;
  const guardado = leer(clave);
  if (guardado) return res.json({ radares: guardado, cached: true });

  const consulta = `[out:json][timeout:20];
    (
      node["highway"="speed_camera"](around:${radio},${lat},${lon});
      node["enforcement"="maxspeed"](around:${radio},${lat},${lon});
      node["man_made"="surveillance"]["surveillance:type"="ALPR"](around:${radio},${lat},${lon});
    );
    out body 80;`;

  // Overpass rechaza (406) las peticiones sin User-Agent propio y a veces
  // tarda: se prueban dos servidores y, si ambos fallan, se sigue sin radares.
  const servidores = [
    'https://overpass.osm.ch/api/interpreter',
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
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
    const radares = (datos?.elements || [])
      .filter(n => Number.isFinite(n.lat) && Number.isFinite(n.lon))
      .map(n => ({
        id: String(n.id),
        lat: n.lat,
        lon: n.lon,
        maxspeed: n.tags?.maxspeed || '',
        kind: n.tags?.highway === 'speed_camera' ? 'radar' : 'camara',
        name: n.tags?.name || n.tags?.ref || ''
      }));

    recordar(clave, 30 * 60 * 1000, radares);
    res.json({ radares });
  } catch (_e) {
    // Sin radares la navegación sigue funcionando: no es un error de la ruta.
    res.json({ radares: [], aviso: 'No se pudieron cargar los radares ahora mismo' });
  }
});

export default router;
