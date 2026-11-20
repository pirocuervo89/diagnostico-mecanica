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

  const clave = `aviso|${lat.toFixed(2)},${lon.toFixed(2)}|${Math.round(radio / 1000)}`;
  const guardado = leer(clave);
  if (guardado) return res.json({ avisos: guardado, radares: guardado.filter(a => a.kind === 'radar'), cached: true });

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
    res.json({ avisos, radares: avisos.filter(a => a.kind === 'radar') });
  } catch (_e) {
    // Sin avisos la navegación sigue funcionando: no es un error de la ruta.
    // Se cachea el fallo unos minutos para no castigar a Overpass en cada viaje.
    recordar(clave, 3 * 60 * 1000, []);
    res.json({ avisos: [], radares: [], aviso: 'No se pudieron cargar los avisos ahora mismo' });
  }
});

export default router;
