(function () {
  'use strict';

  const view = document.getElementById('view-ruta');
  if (!view) return;

  const $ = s => view.querySelector(s);
  const elMapa = $('#rutaMap');
  const elBuscar = $('#rutaBuscar');
  const elDestino = $('#rutaDestino');
  const elResultados = $('#rutaResultados');
  const elPanel = $('#rutaPanel');
  const elAviso = $('#rutaAviso');
  const elVel = $('#rutaVelocidad');
  const elGps = $('#rutaGps');
  const elNoche = $('#rutaNoche');
  const elMicro = $('#rutaMicro');
  const elInfo = $('#rutaInfo');
  const elEta = $('#rutaEta');
  const elBanner = $('#rutaBanner');
  const elBannerFlecha = view.querySelector('#rutaBannerFlecha') || view.querySelector('.ruta-banner-flecha');
  const elBannerDist = $('#rutaBannerDist');
  const elBannerTexto = $('#rutaBannerTexto');
  const elBannerEta = $('#rutaBannerEta');
  let elBrujula = null;

  let mapa = null;
  let capaTiles = null;
  let yo = null;
  let halo = null;
  let destino = null;
  let capaAvisos = null;
  let capaTrafico = null;
  let traficoActivo = false;
  let capaRuta = null;
  let capaRutaGlow = null;
  let alternativas = [];
  let seleccion = 0;
  let paso = 0;
  let navegando = false;
  let siguiendo = false;
  let ultimaPos = null;
  let ultimaVez = 0;
  let velocidad = 0;
  let rumbo = 0;
  let avisados = new Set();
  let avisos = [];
  let limites = [];
  let temporizadorBusqueda = 0;
  let noche = true;
  let reconocimiento = null;
  let codigosOBD = new Set();
  let gpsIniciado = false;
  let temporizadorGps = 0;
  let sondeoGps = 0;
  let nombreDestino = '';
  let destinoCoord = null;
  let fueraRuta = 0;
  let ultimoRecalculo = 0;
  let vozActiva = true;
  let desvioActual = 0;
  let rotacion = false;      // plugin de giro cargado
  let rumboAuto = true;      // mapa orientado al rumbo del coche
  let giro = 0;              // grados que lleva girado el mapa
  let animacionGiro = 0;

  const CLAVE_NOCHE = 'dm_ruta_noche';
  const CLAVE_VOZ = 'dm_ruta_voz';
  const CLAVE_OBD = 'dm_obd_ultimo';
  const CLAVE_POS = 'dm_ruta_ultima';
  const CLAVE_RUMBO = 'dm_ruta_rumbo';
  const CLAVE_RECIENTES = 'dm_ruta_recientes';

  // ------------------------------------------------------------ utilidades
  const metros = m => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`);
  const minutos = s => {
    const m = Math.max(1, Math.round(s / 60));
    return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
  };

  function distancia(aLat, aLon, bLat, bLon) {
    const R = 6371000;
    const rad = Math.PI / 180;
    const dLat = (bLat - aLat) * rad;
    const dLon = (bLon - aLon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function rumboEntre(a, b) {
    const rad = Math.PI / 180;
    const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
    const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }

  function instruccion(s) {
    if (!s) return 'Continúa';
    const m = s.modifier || '';
    const via = s.ref ? ` por la ${s.ref}` : '';
    const salida = Number.isFinite(s.exit) ? ` (salida ${s.exit})` : '';
    const nombre = s.name ? ` en ${s.name}` : '';
    if (s.type === 'depart') return `Sal${via || nombre}`;
    if (s.type === 'arrive') return 'Llegas a tu destino';
    if (s.type === 'roundabout' || s.type === 'rotary') return `Toma la rotonda${salida}${nombre}`;
    if (s.type === 'merge') return `Incorpórate${via}${nombre}`;
    if (s.type === 'fork') return `Coge el desvío ${m === 'left' ? 'izquierdo' : 'derecho'}${via}${nombre}`;
    if (s.type === 'end of road') return `Al final de la vía, ${m === 'left' ? 'izquierda' : 'derecha'}${nombre}`;
    if (s.type === 'continue' || s.type === 'new name') return `Continúa${via}${nombre}`;
    const giro = m === 'left' || m === 'slight left' || m === 'sharp left'
      ? 'a la izquierda'
      : m === 'right' || m === 'slight right' || m === 'sharp right' ? 'a la derecha' : 'recto';
    return `Gira ${giro}${via}${nombre}`;
  }

  function flecha(s) {
    const m = `${s?.type || ''} ${s?.modifier || ''}`;
    if (/roundabout|rotary/.test(m)) return '↻';
    if (/left/.test(m)) return '↰';
    if (/right/.test(m)) return '↱';
    if (/uturn/.test(m)) return '↺';
    if (/arrive/.test(m)) return '⚑';
    return '↑';
  }

  function pitido(frecuencia = 880) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frecuencia;
      gan.gain.setValueAtTime(.0001, ctx.currentTime);
      gan.gain.exponentialRampToValueAtTime(.28, ctx.currentTime + .03);
      gan.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .5);
      osc.connect(gan).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + .55);
      setTimeout(() => ctx.close?.(), 900);
    } catch (_e) { /* sin audio */ }
  }

  function decir(texto) {
    if (!vozActiva) return;
    try { window.MayaHablar?.(texto); } catch (_e) { /* opcional */ }
  }

  function pintarBotonVoz(activa) {
    const boton = view.querySelector('#rutaVoz');
    if (!boton) return;
    boton.textContent = activa ? '🔊' : '🔇';
    boton.setAttribute('aria-pressed', String(activa));
    boton.title = activa ? 'Silenciar las indicaciones' : 'Activar las indicaciones por voz';
    boton.setAttribute('aria-label', boton.title);
  }

  function alternarVoz() {
    vozActiva = !vozActiva;
    try { localStorage.setItem(CLAVE_VOZ, vozActiva ? '1' : '0'); } catch (_e) { /* nada */ }
    pintarBotonVoz(vozActiva);
    if (vozActiva) decir('Voz activada');
    else avisar('Indicaciones silenciadas.', 'info', 3000);
  }

  function avisar(texto, tono = 'info', ms = 6000) {
    if (!elAviso) return;
    elAviso.textContent = texto;
    elAviso.dataset.tono = tono;
    elAviso.hidden = false;
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => { elAviso.hidden = true; }, ms);
  }

  // ------------------------------------------------------------ mapa y tema
  function cuandoLeaflet(cb, intentos = 0) {
    if (window.L) { cargarRotacion().then(ok => { rotacion = ok; cb(); }); return; }
    if (intentos > 40) {
      elMapa.innerHTML = '<div class="ruta-sin-mapa"><b>No se pudo cargar el mapa</b><a href="https://www.google.com/maps" target="_blank" rel="noopener">Abrir en Google Maps</a></div>';
      return;
    }
    setTimeout(() => cuandoLeaflet(cb, intentos + 1), 250);
  }

  function temaInicial() {
    try {
      const guardado = localStorage.getItem(CLAVE_NOCHE);
      if (guardado === '0') return false;
      if (guardado === '1') return true;
    } catch (_e) { /* sin almacenamiento */ }
    const hora = new Date().getHours();
    return hora >= 20 || hora < 7;
  }

  function aplicarTema(oscuro) {
    noche = oscuro;
    if (!mapa) return;
    if (capaTiles) mapa.removeLayer(capaTiles);
    // CARTO empezó a devolver teselas con la marca de agua «API KEY REQUIRED»
    // y OpenStreetMap bloquea el uso desde apps. Esri sirve las dos capas sin
    // clave: gris oscuro de noche y callejero de día.
    const url = oscuro
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
    capaTiles = L.tileLayer(url, {
      maxZoom: 19,
      // La capa oscura de Esri solo sirve teselas hasta el zoom 16: por encima
      // devuelve un cartel blanco de «Map data not available». Se escala la
      // última buena, aunque se vea algo más blanda, en vez de dejar el mapa
      // en blanco justo cuando toca conducir.
      maxNativeZoom: oscuro ? 16 : 19,
      attribution: '&copy; OpenStreetMap &copy; Esri'
    }).addTo(mapa);
    view.querySelector('.ruta-shell')?.setAttribute('data-tema', oscuro ? 'noche' : 'dia');
    if (elNoche) {
      elNoche.dataset.on = oscuro ? '1' : '0';
      elNoche.setAttribute('aria-pressed', String(oscuro));
      elNoche.title = oscuro ? 'Cambiar a mapa de día' : 'Cambiar a mapa de noche';
    }
    try { localStorage.setItem(CLAVE_NOCHE, oscuro ? '1' : '0'); } catch (_e) { /* nada */ }
  }

  function initMapa() {
    if (mapa || !window.L) return;
    mapa = L.map(elMapa, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      // Giro del mapa: con el plugin cargado, arrastrar y tocar sigue cayendo
      // en el sitio correcto aunque el mapa esté girado. El rumbo arriba es
      // lo que de verdad hace útil un navegador en el coche.
      rotate: rotacion,
      bearing: 0,
      rotateControl: false,
      touchRotate: false,
      shiftKeyRotate: false
    }).setView([40.4168, -3.7038], 6);
    aplicarTema(temaInicial());
    capaAvisos = L.layerGroup().addTo(mapa);
    capaTrafico = L.layerGroup().addTo(mapa);
    mapa.on('dragstart', () => { siguiendo = false; });
    engancharTrafico();
    setTimeout(() => mapa.invalidateSize(), 250);
  }

  // ------------------------------------------------------------ tráfico en vivo
  const COLOR_TRAFICO = { fluido: '#22c55e', lento: '#eab308', congestionado: '#f97316', parado: '#ef4444' };
  async function actualizarTrafico() {
    if (!traficoActivo || !mapa) return;
    const c = mapa.getCenter();
    const b = mapa.getBounds();
    const bbox = `${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}`;
    try {
      const r = await fetch(`/api/ruta/trafico?lat=${c.lat}&lon=${c.lng}&bbox=${encodeURIComponent(bbox)}`);
      if (r.status === 204) {
        avisar('Tráfico no disponible (sin clave API configurada).', 'info', 4000);
        traficoActivo = false;
        elTrafico?.setAttribute('aria-pressed', 'false');
        elTrafico?.classList.remove('activo');
        return;
      }
      const data = await r.json();
      capaTrafico?.clearLayers();
      const segs = data.segmentos || [];
      for (const s of segs) {
        const color = COLOR_TRAFICO[s.nivel] || '#94a3b8';
        if (Array.isArray(s.coords) && s.coords.length > 1) {
          L.polyline(s.coords, { color, weight: 5, opacity: .85, lineCap: 'round' }).addTo(capaTrafico);
        } else if (Number.isFinite(s.lat) && Number.isFinite(s.lon)) {
          L.circleMarker([s.lat, s.lon], { radius: 6, color, fillColor: color, fillOpacity: .9 }).addTo(capaTrafico);
        }
      }
      if (segs.length) avisar(`Tráfico: ${segs.length} tramos · ${data.fuente || ''}`, 'info', 2500);
    } catch (e) {
      avisar('Error cargando tráfico.', 'warn', 3000);
    }
  }
  // Refrescar tráfico al mover el mapa (con debounce)
  let traficoTimer = 0;
  // se engancha cuando el mapa existe
  function engancharTrafico() {
    if (!mapa) return;
    mapa.on('moveend', () => {
      if (!traficoActivo) return;
      clearTimeout(traficoTimer);
      traficoTimer = setTimeout(actualizarTrafico, 1200);
    });
  }

  // ------------------------------------------------------------ rotación
  // leaflet-rotate se sirve desde /vendor (no otro CDN) y se carga antes de
  // crear el mapa: parchea la conversión ratón→coordenadas, que es justo lo
  // que se rompe cuando giras un mapa con CSS.
  function cargarRotacion() {
    if (window.L?.Map?.prototype?.setBearing) return Promise.resolve(true);
    if (cargarRotacion.promesa) return cargarRotacion.promesa;
    cargarRotacion.promesa = new Promise(resolver => {
      const s = document.createElement('script');
      s.src = '/vendor/leaflet-rotate/leaflet-rotate.js';
      s.async = true;
      s.onload = () => resolver(Boolean(window.L?.Map?.prototype?.setBearing));
      s.onerror = () => resolver(false);
      document.head.appendChild(s);
    });
    return cargarRotacion.promesa;
  }

  function normalizarGrados(g) {
    return ((g % 360) + 540) % 360 - 180;
  }

  // La aguja marca dónde queda el norte y las chinchetas se enderezan solas.
  function pintarBrujula() {
    if (!elBrujula) return;
    elBrujula.style.setProperty('--ruta-aguja', `${giro.toFixed(1)}deg`);
    elBrujula.classList.toggle('activa', rumboAuto);
    elBrujula.setAttribute('aria-pressed', String(rumboAuto));
    elBrujula.title = rumboAuto
      ? 'Rumbo arriba · toca para poner el norte arriba'
      : 'Norte arriba · toca para seguir tu rumbo';
    elBrujula.setAttribute('aria-label', elBrujula.title);
    view.querySelector('.ruta-shell')?.style.setProperty('--ruta-contra', `${(-giro).toFixed(1)}deg`);
  }

  function aplicarGiro(grados, opciones = {}) {
    if (!rotacion || !mapa?.setBearing) return;
    const objetivo = normalizarGrados(grados);
    const desde = mapa.getBearing();
    const delta = normalizarGrados(objetivo - desde);
    giro = objetivo;
    cancelAnimationFrame(animacionGiro);
    if (opciones.inmediato || Math.abs(delta) < 1) {
      mapa.setBearing(objetivo);
      pintarBrujula();
      return;
    }
    const inicio = performance.now();
    const dur = Math.min(420, 140 + Math.abs(delta) * 2.6);
    const paso = ahora => {
      const t = Math.min(1, (ahora - inicio) / dur);
      const suave = t < .5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
      mapa.setBearing(desde + delta * suave);
      pintarBrujula();
      if (t < 1) animacionGiro = requestAnimationFrame(paso);
      else mapa.setBearing(objetivo);
    };
    animacionGiro = requestAnimationFrame(paso);
  }

  function seguirRumbo(forzar = false) {
    if (!rumboAuto || !rotacion || !mapa) return;
    if (!navegando && !forzar) return;
    if (!Number.isFinite(rumbo)) return;
    if (Math.abs(normalizarGrados(-rumbo - mapa.getBearing())) < 3) return;
    aplicarGiro(-rumbo);
  }

  function alternarRumbo() {
    if (!rotacion) {
      avisar('Este navegador no puede girar el mapa. Actualízalo para tener el rumbo arriba.', 'aviso', 6000);
      return;
    }
    rumboAuto = !rumboAuto;
    try { localStorage.setItem(CLAVE_RUMBO, rumboAuto ? '1' : '0'); } catch (_e) { /* sin almacenamiento */ }
    pintarBrujula();
    if (rumboAuto) {
      decir('Mapa al rumbo');
      aplicarGiro(-rumbo);
    } else {
      decir('Norte arriba');
      aplicarGiro(0);
    }
  }

  // ------------------------------------------------------------ marcadores
  function iconoYo() {
    return L.divIcon({
      className: 'ruta-punto',
      html: `<span class="ruta-punto-halo"></span>
        <span class="ruta-rumbo"></span>
        <span class="ruta-coche"><img src="/img/hero/golf-hero.webp" alt="" aria-hidden="true"><svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 16.5h14M6.5 16.5v1.8c0 .4-.3.7-.7.7h-1c-.4 0-.7-.3-.7-.7v-1.8M19.9 16.5v1.8c0 .4-.3.7-.7.7h-1c-.4 0-.7-.3-.7-.7v-1.8" fill="none" stroke="#04121c" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M3.6 16.5v-3.1c0-.5.3-.9.8-1l1.3-.4 1.7-3.1c.2-.4.6-.6 1-.6h6.9c.4 0 .8.2 1 .6l1.7 3.1 1.3.4c.5.1.8.5.8 1v3.1c0 .4-.3.7-.7.7H4.3c-.4 0-.7-.3-.7-.7Z" fill="#eaf7ff" stroke="#04121c" stroke-width="1.4"/>
          <path d="M7.2 12.2h9.6l-1.2-2.4H8.4Z" fill="#38e1ff"/>
        </svg></span>`,
      iconSize: [56, 56],
      iconAnchor: [28, 28]
    });
  }

  function iconoDestino() {
    return L.divIcon({ className: 'ruta-destino', html: '<span></span>', iconSize: [26, 26], iconAnchor: [13, 24] });
  }

  const ICONO_AVISO = {
    radar: '🚨', camara: '📷', obra: '🚧', senal: '🚦', peligro: '⚠️',
    accidente: '💥', retencion: '🚗', policia: '👮', vehiculo: '🛠️', objeto: '🪨', clima: '🌧️'
  };

  // Radio de aviso por tipo: un accidente se avisa antes que un semáforo.
  const RADIO_AVISO = { senal: 180, objeto: 300, vehiculo: 400, obra: 420, peligro: 450, accidente: 700, policia: 650, retencion: 500, clima: 700 };

  const TIPOS_REPORTE = [
    ['accidente', '💥', 'Accidente'],
    ['retencion', '🚗', 'Retención'],
    ['obra', '🚧', 'Obras'],
    ['policia', '👮', 'Control'],
    ['peligro', '⚠️', 'Peligro'],
    ['vehiculo', '🛠️', 'Avería']
  ];

  function hace(ms) {
    const min = Math.max(0, Math.round(ms / 60000));
    if (min < 1) return 'ahora mismo';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    return `hace ${h} h`;
  }

  function iconoAviso(a) {
    const etiqueta = a.maxspeed ? String(a.maxspeed).replace(/[^0-9]/g, '') : ICONO_AVISO[a.kind] || '⚠️';
    return L.divIcon({
      className: `ruta-aviso ruta-aviso-${a.kind}`,
      html: `<span>${etiqueta}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  // ------------------------------------------------------------ GPS
  function pintarVelocidad(v, limite) {
    if (!elVel) return;
    elVel.hidden = false;
    elVel.querySelector('b').textContent = String(Math.max(0, Math.round(v)));
    const marca = elVel.querySelector('small');
    if (marca) marca.textContent = limite ? `LÍMITE ${limite}` : '';
    const exceso = limite && v > limite + 5;
    elVel.classList.toggle('exceso', Boolean(exceso));
  }

  // Límite de la vía: el tag maxspeed del tramo de OpenStreetMap más cercano.
  function limiteActual(lat, lon) {
    if (!limites.length) return null;
    let mejor = null;
    let mejorD = 60;
    for (const l of limites) {
      const d = distancia(lat, lon, l.lat, l.lon);
      if (d < mejorD) { mejorD = d; mejor = l; }
    }
    return mejor ? mejor.kmh : null;
  }

  // El coche es el mismo de la portada: la foto va fija y lo que gira es la
  // flecha del rumbo, como el avatar de Waze. Girar la foto de tres cuartos
  // dejaba el coche atravesado en el mapa.
  function girarCoche(icono, grados) {
    const rumboEl = icono?.querySelector?.('.ruta-rumbo') || icono;
    if (rumboEl) rumboEl.style.transform = `rotate(${grados}deg)`;
  }

  function alMover(pos) {
    const { latitude: lat, longitude: lon, accuracy, speed, heading } = pos.coords;
    const ahora = Date.now();
    if (ultimaPos) {
      if (Number.isFinite(heading) && heading !== null) rumbo = heading;
      else if (distancia(ultimaPos.lat, ultimaPos.lon, lat, lon) > 4) rumbo = rumboEntre(ultimaPos, { lat, lon });
    }
    if (Number.isFinite(speed) && speed !== null) velocidad = speed * 3.6;
    else if (ultimaPos && ultimaVez) {
      const dt = (ahora - ultimaVez) / 1000;
      if (dt > .8) velocidad = distancia(ultimaPos.lat, ultimaPos.lon, lat, lon) / dt * 3.6;
    }
    ultimaPos = { lat, lon };
    ultimaVez = ahora;
    try { localStorage.setItem(CLAVE_POS, JSON.stringify({ lat, lon, ts: ahora })); } catch (_e) { /* sin espacio */ }

    const limite = limiteActual(lat, lon);
    pintarVelocidad(Math.min(velocidad, 260), limite);

    if (!yo) {
      yo = L.marker([lat, lon], { icon: iconoYo(), zIndexOffset: 500 }).addTo(mapa);
      halo = L.circle([lat, lon], { radius: Math.min(accuracy || 25, 200), color: '#38e1ff', weight: 1, fillColor: '#38e1ff', fillOpacity: .12 }).addTo(mapa);
      if (!destino) mapa.setView([lat, lon], 16);
    } else {
      yo.setLatLng([lat, lon]);
      halo.setLatLng([lat, lon]);
      halo.setRadius(Math.min(accuracy || 25, 200));
    }
    girarCoche(yo.getElement(), rumbo);
    // Rumbo arriba: el mapa gira con el coche. Solo con velocidad suficiente
    // para que el temblor del GPS no maree el mapa parado en un semáforo.
    if (rumboAuto && navegando && velocidad > 6) seguirRumbo();
    // Actualizar scroll de la carretera 3D con la posición real
    if (navegando && vista3dActiva) {
      scrollOffset3d += velocidad / 3.6 * 0.1; // m/s * factor
      if (scrollOffset3d > 1) scrollOffset3d -= 1;
    }

    if (navegando) {
      seguirRuta(lat, lon);
      // Zoom según velocidad: de cerca en ciudad, abierto en autovía, sin que
      // el usuario tenga que tocar el mapa mientras conduce.
      if (siguiendo) {
        const z = zoomPorVelocidad(velocidad);
        // Modo primera persona: el coche queda en la parte inferior del mapa.
        // Se desplaza el centro hacia arriba para que la carretera quede delante.
        const px = mapa.latLngToContainerPoint([lat, lon]);
        const offset = mapa.getSize().y * 0.40;
        const target = mapa.containerPointToLatLng([px.x, px.y + offset]);
        mapa.setView(target, z, { animate: true, duration: 0.5 });
      }
    } else if (siguiendo) {
      mapa.setView([lat, lon], 16, { animate: true });
    }
    vigilarAvisos(lat, lon);
  }

  function zoomPorVelocidad(v) {
    if (v < 25) return 18;
    if (v < 60) return 17;
    if (v < 100) return 16;
    return 15;
  }

  function errorGps(err) {
    avisar(err && err.code === 1
      ? 'Dale permiso de ubicación al navegador para ver dónde estás.'
      : 'No se pudo leer el GPS. Sal al exterior y vuelve a intentarlo.', 'aviso', 8000);
  }

  function arrancarGps() {
    if (!navigator.geolocation) { avisar('Este navegador no tiene GPS disponible.', 'aviso', 8000); return; }
    gpsIniciado = true;
    navigator.geolocation.watchPosition(alMover, errorGps, { enableHighAccuracy: true, maximumAge: 4000, timeout: 20000 });
    // Respaldo: hay móviles (y posiciones simuladas) donde watchPosition no
    // entrega nada aunque una consulta puntual sí responde. Si en 8 s no ha
    // llegado ninguna posición, se pregunta cada 2 s. En cuanto llega una, se
    // para el sondeo y manda el reloj normal.
    clearTimeout(temporizadorGps);
    temporizadorGps = setTimeout(() => {
      if (ultimaPos || sondeoGps) return;
      // Sin señal (parking, túnel, interior) no se deja el mapa vacío: se pinta
      // la última posición conocida y se sigue intentando el GPS de verdad.
      if (!ultimaPos) {
        try {
          const guardada = JSON.parse(localStorage.getItem(CLAVE_POS) || 'null');
          if (guardada && Number.isFinite(guardada.lat) && Number.isFinite(guardada.lon)) {
            alMover({ coords: { latitude: guardada.lat, longitude: guardada.lon, accuracy: null, speed: null, heading: null } });
            avisar('Sin señal GPS: te muestro tu última posición conocida.', 'info', 7000);
          }
        } catch (_e) { /* nada guardado */ }
      }
      sondeoGps = setInterval(() => {
        if (ultimaPos) { clearInterval(sondeoGps); sondeoGps = 0; return; }
        navigator.geolocation.getCurrentPosition(
          alMover,
          () => {},
          { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
        );
      }, 2000);
    }, 8000);
  }

  // ------------------------------------------------------------ búsqueda
  function pintarResultados(lista) {
    if (!elResultados) return;
    if (!lista.length) {
      elResultados.innerHTML = '<p class="ruta-vacio">No encuentro ese sitio. Prueba con «calle», «ciudad» o un nombre conocido.</p>';
      elResultados.hidden = false;
      return;
    }
    elResultados.innerHTML = lista.map(r => `
      <button type="button" class="ruta-result" data-lat="${r.lat}" data-lon="${r.lon}" data-nombre="${String(r.name || '').replace(/"/g, '&quot;')}">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z"/><circle cx="12" cy="10" r="2.6"/></svg>
        <span><b>${r.name || 'Destino'}</b><small>${r.type || ''}</small></span>
      </button>`).join('');
    elResultados.hidden = false;
  }

  async function buscar(texto) {
    const q = String(texto || '').trim();
    if (q.length < 3) return;
    elResultados.hidden = false;
    elResultados.innerHTML = '<p class="ruta-vacio">Buscando…</p>';
    try {
      const r = await fetch(`/api/ruta/geocode?q=${encodeURIComponent(q)}`);
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || 'Error');
      pintarResultados(datos.results || []);
    } catch (_e) {
      elResultados.innerHTML = '<p class="ruta-vacio">No se pudo buscar. Revisa la conexión.</p>';
    }
  }

  function leerRecientes() {
    try { return JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || '[]'); } catch (_e) { return []; }
  }
  function guardarReciente(nombre, lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const lista = leerRecientes().filter(r => !(Math.abs(r.lat - lat) < 1e-4 && Math.abs(r.lon - lon) < 1e-4));
    lista.unshift({ nombre: nombre || 'Destino', lat, lon, ts: Date.now() });
    try { localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista.slice(0, 6))); } catch (_e) { /* sin espacio */ }
    pintarRecientes();
  }
  function pintarRecientes() {
    const box = view.querySelector('#rutaRecientes');
    if (!box) return;
    const lista = leerRecientes();
    if (!lista.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<span class="ruta-recientes-titulo">Recientes</span>' +
      lista.map(r => `<button type="button" class="ruta-reciente" data-lat="${r.lat}" data-lon="${r.lon}" data-nombre="${String(r.nombre).replace(/"/g, '&quot;')}">${r.nombre}</button>`).join('');
    box.querySelectorAll('[data-lat]').forEach(b => {
      b.addEventListener('click', () => {
        elDestino.value = b.dataset.nombre;
        fijarDestino(Number(b.dataset.lat), Number(b.dataset.lon), b.dataset.nombre);
      });
    });
  }
  pintarRecientes();

  elBuscar?.addEventListener('submit', e => { e.preventDefault(); buscar(elDestino.value); });
  elDestino?.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    if (elDestino.value.trim().length < 3) { elResultados.hidden = true; return; }
    temporizadorBusqueda = setTimeout(() => buscar(elDestino.value), 550);
  });
  elResultados?.addEventListener('click', e => {
    const btn = e.target.closest('[data-lat]');
    if (!btn) return;
    elResultados.hidden = true;
    elDestino.value = btn.dataset.nombre || 'Destino';
    fijarDestino(Number(btn.dataset.lat), Number(btn.dataset.lon), btn.dataset.nombre || 'Destino');
  });

  // ------------------------------------------------------------ ruta
  async function fijarDestino(lat, lon, nombre = '') {
    if (!mapa) return;
    nombreDestino = nombre || nombreDestino || 'Destino';
    destinoCoord = { lat, lon };
    guardarReciente(nombre, lat, lon);
    fueraRuta = 0;
    if (destino) mapa.removeLayer(destino);
    destino = L.marker([lat, lon], { icon: iconoDestino() }).addTo(mapa);

    const desde = ultimaPos || { lat: mapa.getCenter().lat, lon: mapa.getCenter().lng };
    elPanel.hidden = false;
    elPanel.innerHTML = '<div class="ruta-calc"><i></i><span>Calculando la mejor ruta…</span></div>';

    try {
      const r = await fetch(`/api/ruta/route?from=${desde.lat},${desde.lon}&to=${lat},${lon}`);
      const datos = await r.json();
      if (!r.ok || !datos.route) throw new Error(datos.error || 'Sin ruta');
      alternativas = Array.isArray(datos.routes) && datos.routes.length ? datos.routes : [datos.route];
      if (Array.isArray(datos.route.limits) && datos.route.limits.length) limites = datos.route.limits;
      seleccion = 0;
      paso = 0;
      avisados.clear();
      pintarRuta();
      pintarPanel();
      cargarAvisos();
      // En el móvil el panel queda al pie del mapa: se deja a la vista para no
      // tener que buscar el botón de arrancar la navegación.
      const shell = view.querySelector('.ruta-shell');
      shell?.classList.add('ruta-con-ruta');
      // Se encuadra el mapa entero (panel incluido), no solo el panel: si se
      // centraba el panel, la cabecera del mapa quedaba fuera de pantalla.
      setTimeout(() => shell?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
    } catch (err) {
      elPanel.innerHTML = `<p class="ruta-error">${err.message || 'No se pudo calcular la ruta.'}</p>`;
    }
  }

  function rutaActiva() { return alternativas[seleccion] || null; }

  function pintarRuta(ajustar = true) {
    const ruta = rutaActiva();
    if (!ruta || !mapa) return;
    if (capaRuta) mapa.removeLayer(capaRuta);
    if (capaRutaGlow) mapa.removeLayer(capaRutaGlow);
    capaRutaGlow = L.polyline(ruta.geometry, { color: '#38e1ff', weight: 17, opacity: .15, lineCap: 'round' }).addTo(mapa);
    capaRuta = L.polyline(ruta.geometry, { color: '#5ce6ff', weight: 5, opacity: .96, lineCap: 'round' }).addTo(mapa);
    if (ajustar) mapa.fitBounds(capaRuta.getBounds(), { padding: [40, 40] });
  }

  function horaDeLlegada(segundos) {
    const t = new Date(Date.now() + Math.max(0, segundos) * 1000);
    return t.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  function pintarEta(ruta, segundos) {
    if (!elEta || !ruta) return;
    elEta.hidden = false;
    elEta.innerHTML = `<b>${minutos(segundos)}</b><span>${metros(ruta.distance)}</span><i>${horaDeLlegada(segundos)}</i>`;
  }

  function pintarBanner(ruta, pasoActual) {
    if (!elBanner) return;
    if (!ruta || !navegando) { elBanner.hidden = true; return; }
    const s = ruta.steps[pasoActual || 0] || ruta.steps[0];
    if (!s) { elBanner.hidden = true; return; }
    elBanner.hidden = false;
    if (elBannerFlecha) elBannerFlecha.textContent = flecha(s);
    const d = ultimaPos && Number.isFinite(s.lat)
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : (s.distance || 0);
    if (elBannerDist) elBannerDist.textContent = `En ${metros(d)}`;
    if (elBannerTexto) elBannerTexto.textContent = instruccion(s);
    if (elBannerEta && ruta) elBannerEta.textContent = `${minutos(ruta.duration)} · ${metros(ruta.distance)}`;
  }

  function pintarPanel() {
    const ruta = rutaActiva();
    if (!ruta || !elPanel) return;
    const s = ruta.steps[paso] || ruta.steps[0];
    const aSiguiente = s && Number.isFinite(s.lat) && ultimaPos
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : s?.distance || 0;
    const otras = alternativas.length > 1 ? `
      <div class="ruta-alternativas" role="group" aria-label="Rutas disponibles">
        ${alternativas.map((r, i) => `
          <button type="button" class="ruta-alt${i === seleccion ? ' activa' : ''}" data-ruta="${i}">
            <b>${i === 0 ? 'Recomendada' : `Alternativa ${i + 1}`}</b><small>${metros(r.distance)} · ${minutos(r.duration)}</small>
          </button>`).join('')}
      </div>` : '';
    elPanel.innerHTML = `
      <div class="ruta-destino-linea">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z"/><circle cx="12" cy="10" r="2.2"/></svg>
        <b>${nombreDestino || 'Destino'}</b>
      </div>
      <div class="ruta-sheet">
        <div class="ruta-resumen">
          <div class="ruta-flecha">${flecha(s)}</div>
          <div class="ruta-sig">
            <small>${navegando ? `EN ${metros(aSiguiente)}` : 'PRÓXIMO PASO'}</small>
            <strong>${instruccion(s)}</strong>
          </div>
          <div class="ruta-datos"><b>${metros(ruta.distance)}</b><span>${minutos(ruta.duration)}</span></div>
        </div>
        ${otras}
        <div class="ruta-pasos-preview">
          ${ruta.steps.slice(paso + 1, paso + 4).map(p => `<span>${flecha(p)} ${instruccion(p)} · ${metros(p.distance)}</span>`).join('')}
        </div>
        <button type="button" class="ruta-empezar" id="rutaEmpezar">${navegando ? '⏹ Detener navegación' : '▶ Iniciar navegación'}</button>
      </div>`;
    pintarEta(ruta, ruta.duration);
    pintarBanner(ruta, paso);

    elPanel.querySelector('#rutaEmpezar')?.addEventListener('click', alternarNavegacion);
    elPanel.querySelectorAll('[data-ruta]').forEach(btn => {
      btn.addEventListener('click', () => {
        seleccion = Number(btn.dataset.ruta) || 0;
        paso = 0;
        avisados.clear();
        pintarRuta();
        pintarPanel();
        cargarAvisos();
      });
    });
  }

  function alternarNavegacion() {
    navegando = !navegando;
    elShell?.classList.toggle('ruta-conduciendo', navegando);
    elShell?.classList.toggle('ruta-navegando', navegando);
    const elParar = document.getElementById('rutaParar');
    if (elParar) elParar.hidden = !navegando;
    if (navegando) {
      // Al arrancar, el panel de inicio desaparece y todo pasa a pantalla
      // completa: solo carretera, coche y avisos.
      elPanel.hidden = true;
      elShell?.classList.add('ruta-completa');
      document.body.classList.add('ruta-pantalla-completa');
      if (elShell?.requestFullscreen && !document.fullscreenElement) {
        try { elShell.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_e) { /* fallback: clase fija */ }
      }
      siguiendo = true;
      paso = 0;
      // Rumbo arriba al conducir, salvo que lo hayas dejado en norte a mano.
      try { rumboAuto = localStorage.getItem(CLAVE_RUMBO) !== '0'; } catch (_e) { rumboAuto = true; }
      pintarBrujula();
      // De noche el mapa oscuro se lee mejor en el coche, pero solo se cambia
      // si el usuario no había elegido tema a mano.
      try { if (localStorage.getItem(CLAVE_NOCHE) === null) aplicarTema(true); } catch (_e) { /* nada */ }
      avisar('Navegación iniciada. Te aviso de radares, obras y averías.', 'ok', 5000);
      if (ultimaPos) {
        // Modo primera persona: el coche queda en la parte inferior del mapa.
        mapa.setView([ultimaPos.lat, ultimaPos.lon], zoomPorVelocidad(velocidad), { animate: true, duration: 0.8 });
        // Desplazar el centro hacia arriba para que el coche quede abajo.
        const px = mapa.latLngToContainerPoint([ultimaPos.lat, ultimaPos.lon]);
        const target = mapa.containerPointToLatLng([px.x, px.y + mapa.getSize().y * 0.4]);
        mapa.panTo(target, { animate: true, duration: 0.6 });
      }
      seguirRumbo(true);
      decir('Navegación iniciada. Nos vamos.');
      revisarOBD(true);
    } else {
      // Al parar se vuelve al norte: un mapa torcido sin ruta activa confunde.
      rumboAuto = false;
      aplicarGiro(0);
      pintarBrujula();
      decir('Navegación detenida');
      avisar('Navegación detenida.', 'info', 3000);
      if (demoActiva) detenerDemo();
      // Se sale de pantalla completa y vuelve el panel de inicio.
      elShell?.classList.remove('ruta-completa');
      document.body.classList.remove('ruta-pantalla-completa');
      if (document.fullscreenElement && document.exitFullscreen) {
        try { document.exitFullscreen().catch(() => {}); } catch (_e) { /* nada */ }
      }
    }
    pintarPanel();
    pintarBanner(rutaActiva(), paso);
    // Durante la navegación el panel de inicio no se muestra.
    if (rutaActiva()) elPanel.hidden = navegando;
  }

  function restante(lat, lon) {
    const ruta = rutaActiva();
    if (!ruta) return 0;
    let total = 0;
    for (let i = paso; i < ruta.steps.length; i += 1) total += ruta.steps[i].distance || 0;
    const s = ruta.steps[paso];
    if (s && Number.isFinite(s.lat)) total += distancia(lat, lon, s.lat, s.lon);
    return total;
  }

  // Metros de cualquier punto a la línea de la ruta: sirve para saber si el
  // coche se ha desviado y para no avisar de un accidente que no te pilla de
  // paso (Waze avisa de lo que hay en tu camino, no del vecindario entero).
  function distanciaPuntoARuta(lat, lon) {
    const pts = rutaActiva()?.geometry || [];
    if (pts.length < 2) return 0;
    const rad = Math.PI / 180;
    const cos = Math.cos(lat * rad);
    const aM = (la, lo) => [(lo - lon) * cos * 111320, (la - lat) * 110540];
    let mejor = Infinity;
    for (let i = 1; i < pts.length; i += 1) {
      const [ax, ay] = aM(pts[i - 1][0], pts[i - 1][1]);
      const [bx, by] = aM(pts[i][0], pts[i][1]);
      const dx = bx - ax;
      const dy = by - ay;
      const largo = dx * dx + dy * dy;
      const t = largo ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / largo)) : 0;
      const d = Math.hypot(ax + t * dx, ay + t * dy);
      if (d < mejor) mejor = d;
    }
    return mejor;
  }

  function distanciaARuta(lat, lon) {
    return distanciaPuntoARuta(lat, lon);
  }

  async function recalcular(lat, lon) {
    if (!destinoCoord || Date.now() - ultimoRecalculo < 15000) return;
    ultimoRecalculo = Date.now();
    avisar('Te has salido de la ruta. Busco otra…', 'info', 6000);
    decir('Recalculando ruta');
    try {
      const r = await fetch(`/api/ruta/route?from=${lat},${lon}&to=${destinoCoord.lat},${destinoCoord.lon}`);
      const datos = await r.json();
      if (!r.ok || !datos.route) throw new Error(datos.error || 'Sin ruta');
      alternativas = Array.isArray(datos.routes) && datos.routes.length ? datos.routes : [datos.route];
      if (Array.isArray(datos.route.limits) && datos.route.limits.length) limites = datos.route.limits;
      seleccion = 0;
      paso = 0;
      avisados.clear();
      pintarRuta(false);
      pintarPanel();
      mapa.setView([lat, lon], 17);
      cargarAvisos();
    } catch (_e) {
      avisar('No se pudo recalcular. Sigue la ruta marcada.', 'aviso', 6000);
    }
  }

  function seguirRuta(lat, lon) {
    const ruta = rutaActiva();
    const s = ruta?.steps[paso];
    if (!s) return;
    const desvio = distanciaARuta(lat, lon);
    desvioActual = desvio;
    if (navegando) {
      fueraRuta = desvio > 60 ? fueraRuta + 1 : 0;
      if (fueraRuta >= 2) { fueraRuta = 0; recalcular(lat, lon); }
    }
    const d = Number.isFinite(s.lat) ? distancia(lat, lon, s.lat, s.lon) : 0;
    if (desvio <= 60 && d < 45 && paso < ruta.steps.length - 1) {
      paso += 1;
      const siguiente = ruta.steps[paso];
      decir(instruccion(siguiente));
      if (siguiente.type === 'arrive') avisar('Has llegado a tu destino.', 'ok', 9000);
      pintarPanel();
      pintarBanner(ruta, paso);
    }
    const quedan = restante(lat, lon);
    const resumen = elPanel.querySelector('.ruta-datos b');
    if (resumen) resumen.textContent = metros(quedan);
    if (ruta) {
      const proporcion = ruta.distance ? Math.min(1, quedan / ruta.distance) : 0;
      pintarEta(ruta, ruta.duration * proporcion);
      const distanciaTurno = elPanel.querySelector('.ruta-sig small');
      const siguiente = ruta.steps[paso];
      if (distanciaTurno && siguiente && Number.isFinite(siguiente.lat)) {
        distanciaTurno.textContent = `EN ${metros(distancia(lat, lon, siguiente.lat, siguiente.lon))}`;
      }
    }
    pintarBanner(ruta, paso);
  }

  // ------------------------------------------------------------ avisos (OSM)
  async function cargarAvisos() {
    const ruta = rutaActiva();
    if (!ruta || !mapa || !capaAvisos) return;
    const puntos = ruta.geometry;
    const lat = puntos.reduce((a, p) => a + p[0], 0) / puntos.length;
    const lon = puntos.reduce((a, p) => a + p[1], 0) / puntos.length;
    try {
      const r = await fetch(`/api/ruta/avisos?lat=${lat}&lon=${lon}&radio=9000`);
      const datos = await r.json();
      avisos = Array.isArray(datos.avisos) ? datos.avisos : [];
      // Los límites de velocidad no se pintan como chinchetas: son demasiados.
      // Se usan para el velocímetro.
      limites = avisos
        .filter(a => a.kind === 'limite')
        .map(a => ({ lat: a.lat, lon: a.lon, kmh: parseInt(String(a.maxspeed).match(/(\d+)/)?.[1] || '', 10) || 0 }))
        .filter(l => l.kmh > 0);
      capaAvisos.clearLayers();
      avisos.filter(a => a.kind !== 'limite').forEach(pintarAviso);
      const visibles = avisos.filter(a => a.kind !== 'limite');
      if (elInfo) {
        elInfo.textContent = visibles.length
          ? `${visibles.length} avisos en la zona (${visibles.filter(a => a.kind === 'radar').length} radares)`
          : 'Sin avisos conocidos en esta zona';
      }
    } catch (_e) { /* sin avisos se navega igual */ }
  }

  function flechaPara(s) {
    const m = s?.modifier || '';
    if (m === 'left') return '↰';
    if (m === 'right') return '↱';
    if (m === 'straight') return '↑';
    if (s?.type === 'roundabout') return '↻';
    if (s?.type === 'exit') return '↗';
    return '↑';
  }

  // ============================================================
  // GPS 3D · Vista de conducción inmersiva (pseudo-3D)
  // ============================================================
  let vista3dActiva = false;
  let animacion3d = null;
  let canvas3d = null;
  let ctx3d = null;
  let carretera3d = [];
  let progreso3d = 0;
  let scrollOffset3d = 0;
  let signos3d = [];
  let imagenCoche3d = null;
  let spriteCoche3d = null;
  // Cargar la imagen del coche GT4
  imagenCoche3d = new Image();
  imagenCoche3d.src = '/img/hero/golf-hero.webp';

  // Recorta el coche de la foto y difumina los bordes para integrarlo en la
  // escena (evita el rectángulo de fondo del estudio).
  function prepararSpriteCoche3d() {
    if (spriteCoche3d || !imagenCoche3d || !imagenCoche3d.complete || !imagenCoche3d.naturalWidth) return;
    const W = imagenCoche3d.naturalWidth, H = imagenCoche3d.naturalHeight;
    const sx = W * 0.05, sy = H * 0.16, sw = W * 0.93, sh = H * 0.82;
    const c = document.createElement('canvas');
    c.width = Math.round(sw);
    c.height = Math.round(sh);
    const g = c.getContext('2d');
    g.drawImage(imagenCoche3d, sx, sy, sw, sh, 0, 0, c.width, c.height);
    g.globalCompositeOperation = 'destination-in';
    const grad = g.createRadialGradient(c.width / 2, c.height * 0.58, Math.min(c.width, c.height) * 0.28, c.width / 2, c.height * 0.58, Math.max(c.width, c.height) * 0.6);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(0.72, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
    spriteCoche3d = c;
  }

  function init3d() {
    canvas3d = document.getElementById('ruta3d');
    if (!canvas3d) return false;
    ctx3d = canvas3d.getContext('2d');
    canvas3d.width = canvas3d.clientWidth || window.innerWidth;
    canvas3d.height = canvas3d.clientHeight || window.innerHeight;
    return true;
  }

  function generarCarretera3d() {
    const ruta = rutaActiva();
    if (!ruta || !ruta.geometry) return [];
    const pts = ruta.geometry;
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b[1] - a[1], dy = b[0] - a[0];
      const dist = Math.sqrt(dx * dx + dy * dy) * 111000;
      const heading = Math.atan2(dx, dy) * 180 / Math.PI;
      segs.push({ lat: a[0], lon: a[1], dist, heading, curva: 0 });
    }
    // Calcular curvas
    for (let i = 1; i < segs.length - 1; i++) {
      const dh = normalizarGrados(segs[i + 1].heading - segs[i].heading);
      segs[i].curva = dh;
    }
    return segs;
  }

  function generarSignos3d() {
    const ruta = rutaActiva();
    if (!ruta || !ruta.steps) return [];
    const signos = [];
    let distAcum = 0;
    for (const s of ruta.steps) {
      if (s.distance > 0) distAcum += s.distance;
      const txt = s.ref ? `${s.ref} · ${s.name || ''}`.trim() : (s.name || '');
      if (txt) signos.push({ dist: distAcum, texto: txt, tipo: s.type, modifier: s.modifier, exit: s.exit });
    }
    return signos;
  }

  function dibujar3dLegacy() {
    if (!ctx3d || !canvas3d) return;
    const w = canvas3d.width, h = canvas3d.height;
    const cx = w / 2;
    const horizonte = h * 0.35;

    // Limpiar
    ctx3d.fillStyle = '#0a1220';
    ctx3d.fillRect(0, 0, w, h);

    // Cielo con gradiente (modo noche)
    const grad = ctx3d.createLinearGradient(0, 0, 0, horizonte);
    grad.addColorStop(0, '#050a14');
    grad.addColorStop(0.5, '#0a1220');
    grad.addColorStop(1, '#1a2a3f');
    ctx3d.fillStyle = grad;
    ctx3d.fillRect(0, 0, w, horizonte);

    // Estrellas
    ctx3d.fillStyle = 'rgba(255, 255, 255, .6)';
    for (let i = 0; i < 30; i++) {
      const sx = (i * 137 + 50) % w;
      const sy = (i * 73 + 20) % (horizonte * 0.8);
      const ss = (i % 3) + 1;
      ctx3d.fillRect(sx, sy, ss, ss);
    }

    // Horizonte (línea de luz)
    ctx3d.strokeStyle = 'rgba(34, 211, 238, .3)';
    ctx3d.lineWidth = 1;
    ctx3d.beginPath();
    ctx3d.moveTo(0, horizonte);
    ctx3d.lineTo(w, horizonte);
    ctx3d.stroke();

    // Suelo (pasto/asfalto a los lados)
    ctx3d.fillStyle = '#0e1a2b';
    ctx3d.fillRect(0, horizonte, w, h - horizonte);

    // Objetos en los bordes (árboles/edificios) que pasan
    const numObj = 8;
    for (let i = 0; i < numObj; i++) {
      const z = (i + (scrollOffset3d * numObj)) % numObj / numObj;
      const scale = 1 - z * 0.8;
      const y = horizonte + (h - horizonte) * (1 - z);
      const side = i % 2 === 0 ? -1 : 1;
      const x = cx + side * (120 + 60 * scale);
      const objH = 30 * scale;
      const objW = 8 * scale;
      ctx3d.fillStyle = side === -1 ? 'rgba(34, 211, 238, .4)' : 'rgba(168, 85, 247, .4)';
      ctx3d.fillRect(x - objW / 2, y - objH, objW, objH);
      // Glow
      ctx3d.fillStyle = side === -1 ? 'rgba(34, 211, 238, .15)' : 'rgba(168, 85, 247, .15)';
      ctx3d.fillRect(x - objW, y - objH - 5, objW * 2, objH + 10);
    }

    // Carretera: pseudo-3D con segmentos
    const segs = carretera3d;
    if (segs.length === 0) {
      // Sin ruta: carretera recta genérica
      dibujarCarreteraRecta(w, h, cx, horizonte);
      dibujarCoche3d(w, h);
      return;
    }

    // Calcular posición actual en la ruta
    const ruta = rutaActiva();
    const pos = ultimaPos;
    let idxActual = 0;
    if (pos) {
      let mejor = Infinity;
      for (let i = 0; i < segs.length; i++) {
        const d = distancia(pos.lat, pos.lon, segs[i].lat, segs[i].lon);
        if (d < mejor) { mejor = d; idxActual = i; }
      }
    }

    // Dibujar segmentos de carretera con perspectiva (trapezoidal, más realista)
    const numSegs = 50;
    const segW = 220; // ancho de la carretera en el horizonte
    const roadColor = '#1e2d42';
    const roadColorNear = '#2a3a50';
    const laneColor = '#f0f8ff';
    const edgeColor = '#38e1ff';

    // Acumular curva para que la carretera se doble progresivamente
    let curvaAcum = 0;

    for (let i = 0; i < numSegs; i++) {
      const idx = Math.min(idxActual + i, segs.length - 1);
      const seg = segs[idx];
      const z = i / numSegs; // 0 = cerca, 1 = lejos
      const scale = 1 - z * 0.82;
      const y = horizonte + (h - horizonte) * (1 - z);
      const roadW = segW * scale * (1 + z * 0.3);
      curvaAcum += (seg.curva || 0) * (1 - z) * 0.5;
      const curvaOffset = curvaAcum * z * 40;
      const x = cx + curvaOffset;

      // Segmento anterior para trapezoide
      const zPrev = (i - 1) / numSegs;
      const scalePrev = 1 - zPrev * 0.82;
      const yPrev = horizonte + (h - horizonte) * (1 - zPrev);
      const roadWPrev = segW * scalePrev * (1 + zPrev * 0.3);
      let curvaAcumPrev = curvaAcum - (seg.curva || 0) * (1 - z) * 0.5;
      const curvaOffsetPrev = curvaAcumPrev * zPrev * 40;
      const xPrev = cx + curvaOffsetPrev;

      // Dibujar trapezoide de carretera
      ctx3d.fillStyle = z < 0.5 ? roadColorNear : roadColor;
      ctx3d.beginPath();
      ctx3d.moveTo(xPrev - roadWPrev / 2, yPrev);
      ctx3d.lineTo(xPrev + roadWPrev / 2, yPrev);
      ctx3d.lineTo(x + roadW / 2, y);
      ctx3d.lineTo(x - roadW / 2, y);
      ctx3d.closePath();
      ctx3d.fill();

      // Líneas de carril (centro)
      if (i % 3 === 0) {
        ctx3d.strokeStyle = laneColor;
        ctx3d.lineWidth = 2 * scale;
        ctx3d.setLineDash([10 * scale, 10 * scale]);
        ctx3d.globalAlpha = 0.7;
        ctx3d.beginPath();
        ctx3d.moveTo(xPrev, yPrev);
        ctx3d.lineTo(x, y);
        ctx3d.stroke();
        ctx3d.setLineDash([]);
        ctx3d.globalAlpha = 1;
      }

      // Bordes de la carretera (glow cyan)
      ctx3d.strokeStyle = edgeColor;
      ctx3d.lineWidth = 2 * scale;
      ctx3d.globalAlpha = 0.6;
      ctx3d.beginPath();
      ctx3d.moveTo(xPrev - roadWPrev / 2, yPrev);
      ctx3d.lineTo(x - roadW / 2, y);
      ctx3d.stroke();
      ctx3d.beginPath();
      ctx3d.moveTo(xPrev + roadWPrev / 2, yPrev);
      ctx3d.lineTo(x + roadW / 2, y);
      ctx3d.stroke();
      ctx3d.globalAlpha = 1;
    }

    // Dibujar carteles de autopista
    dibujarSignos3d(w, h, cx, horizonte, idxActual, segs);

    // Dibujar el coche (GT4)
    dibujarCoche3d(w, h);

    // HUD: velocidad y distancia
    dibujarHud3d(w, h);
  }

  // ============================================================
  // Modo 3D exterior GT4 · escena de conducción (referencia 1)
  // ============================================================
  let ultimoFrame3d = 0;

  function proyecto3d(z, idxActual, segs, w, h, horizonte, cx) {
    const n = segs.length;
    const idxBase = Math.max(0, Math.min(n - 1, idxActual));
    const idx = Math.min(Math.max(0, n - 1), idxBase + Math.round(z * 35));
    const h0 = segs[idxBase]?.heading || 0;
    // Rumbo suavizado y limitado: evita que un giro lejano dispare la calzada
    // fuera de pantalla y mantiene un ribbon continuo en curvas.
    const dHraw = normalizarGrados((segs[idx]?.heading || h0) - h0);
    const dH = Math.max(-24, Math.min(24, dHraw));
    const x = cx + Math.tan(dH * Math.PI / 180) * (h - horizonte) * 0.55 * z;
    const onda = Math.sin(idx * 0.045) * 0.016 + Math.sin(idx * 0.013 + 1.7) * 0.011;
    const y = horizonte + (h - horizonte) * Math.pow(1 - z, 1.55) - onda * h * z * 2.2;
    const ancho = Math.max(3, w * 0.92 * Math.pow(1 - z, 1.12));
    const escala = Math.max(0.05, Math.pow(1 - z, 1.1));
    return { x, y, ancho, escala, idx, dH };
  }

  function dibujarCielo3d(w, h, horizonte, t, idxActual) {
    const cielo = ctx3d.createLinearGradient(0, 0, 0, horizonte);
    cielo.addColorStop(0, '#03060d');
    cielo.addColorStop(0.45, '#0a1a33');
    cielo.addColorStop(0.8, '#12395e');
    cielo.addColorStop(1, '#3d6f8f');
    ctx3d.fillStyle = cielo;
    ctx3d.fillRect(0, 0, w, horizonte);
    ctx3d.fillStyle = 'rgba(220,240,255,.5)';
    for (let i = 0; i < 26; i++) {
      ctx3d.fillRect((i * 173 + 31) % w, (i * 67 + 13) % (horizonte * 0.62), (i % 3) + 1, (i % 3) + 1);
    }
    const solX = w * 0.74, solY = horizonte - h * 0.11;
    const halo = ctx3d.createRadialGradient(solX, solY, 0, solX, solY, h * 0.26);
    halo.addColorStop(0, 'rgba(255,196,92,.55)');
    halo.addColorStop(0.35, 'rgba(255,150,60,.18)');
    halo.addColorStop(1, 'rgba(255,120,40,0)');
    ctx3d.fillStyle = halo;
    ctx3d.fillRect(0, 0, w, horizonte + 40);
    ctx3d.fillStyle = '#ffd28a';
    ctx3d.beginPath();
    ctx3d.arc(solX, solY, h * 0.045, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 4; i++) {
      const cx0 = ((i * 0.27 + 0.1) * w + t * 2.4 * (i + 1)) % (w + 120) - 60;
      const cy0 = horizonte * (0.28 + i * 0.09);
      ctx3d.beginPath();
      ctx3d.ellipse(cx0, cy0, 60 + i * 18, 10 + i * 2, 0, 0, Math.PI * 2);
      ctx3d.fill();
    }
    const par = (idxActual * 1.6) % w;
    const capa = (color, base, amp, fase) => {
      ctx3d.fillStyle = color;
      ctx3d.beginPath();
      ctx3d.moveTo(-10, horizonte);
      for (let x = -10; x <= w + 10; x += 12) {
        const y = base - (Math.sin((x + par) * 0.006 + fase) * amp + Math.sin((x + par) * 0.017 + fase * 2) * amp * 0.42 + amp * 0.5);
        ctx3d.lineTo(x, Math.max(0, Math.min(horizonte, y)));
      }
      ctx3d.lineTo(w + 10, horizonte);
      ctx3d.closePath();
      ctx3d.fill();
    };
    capa('rgba(18,42,66,.9)', horizonte - h * 0.012, h * 0.075, 0.7);
    capa('rgba(10,26,44,.95)', horizonte, h * 0.045, 2.1);
  }

  function dibujarSenalLimite3d(w, h, horizonte, idxActual, segs, cx) {
    if (!ultimaPos) return;
    const kmh = limiteActual(ultimaPos.lat, ultimaPos.lon);
    if (!kmh) return;
    const p = proyecto3d(0.34, idxActual, segs, w, h, horizonte, cx);
    const r = Math.max(11, 24 * p.escala + 7);
    const x = p.x + p.ancho * 0.52 + r * 0.9;
    const y = p.y - r * 1.9;
    ctx3d.save();
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.beginPath(); ctx3d.arc(x, y, r, 0, Math.PI * 2); ctx3d.fill();
    ctx3d.strokeStyle = '#dc2626';
    ctx3d.lineWidth = Math.max(3, r * 0.18);
    ctx3d.beginPath(); ctx3d.arc(x, y, r * 0.84, 0, Math.PI * 2); ctx3d.stroke();
    ctx3d.fillStyle = '#0f172a';
    ctx3d.font = `bold ${Math.round(r * 1.05)}px sans-serif`;
    ctx3d.textAlign = 'center';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillText(String(kmh), x, y + 1);
    ctx3d.fillStyle = 'rgba(200,230,240,.7)';
    ctx3d.font = `${Math.max(8, r * 0.34)}px sans-serif`;
    ctx3d.fillText('mapa', x, y + r * 1.35);
    ctx3d.restore();
  }

  function dibujarGantry3d(w, h, horizonte, idxActual, segs, cx) {
    const r = rutaActiva();
    const s = r?.steps?.[paso] || r?.steps?.[0];
    if (!s?.name) return;
    const p = proyecto3d(0.68, idxActual, segs, w, h, horizonte, cx);
    const an = Math.min(w * 0.56, 150 * p.escala + 40);
    const al = Math.max(16, 30 * p.escala + 10);
    const x = p.x - an / 2;
    const y = p.y - al - 26 * p.escala;
    // Poste
    ctx3d.fillStyle = 'rgba(120,140,160,.55)';
    ctx3d.fillRect(p.x - 1.5 * p.escala, p.y - 26 * p.escala, 3 * p.escala, 26 * p.escala);
    // Panel verde de autopista
    ctx3d.fillStyle = 'rgba(8,52,40,.94)';
    ctx3d.fillRect(x, y, an, al);
    ctx3d.strokeStyle = 'rgba(230,245,255,.85)';
    ctx3d.lineWidth = 1.5;
    ctx3d.strokeRect(x, y, an, al);
    ctx3d.fillStyle = '#eaf7ff';
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.font = `bold ${Math.max(9, al * 0.34)}px sans-serif`;
    ctx3d.fillText((flechaPara(s) + ' ') + recortar(s.name, 16), x + 8, y + al * 0.5);
    ctx3d.textAlign = 'right';
    ctx3d.font = `bold ${Math.max(8, al * 0.28)}px sans-serif`;
    ctx3d.fillText(`${s.distance ? Math.round(s.distance) + ' m' : ''}`, x + an - 8, y + al * 0.5);
  }

  function dibujar3d() {
    if (!ctx3d || !canvas3d) return;
    const w = canvas3d.width, h = canvas3d.height;
    const cx = w / 2, horizonte = h * 0.34;
    const ahora = performance.now();
    const t = ahora / 1000;
    ultimoFrame3d = ahora;

    const ruta = rutaActiva();
    if (ruta && ruta.geometry && carretera3d.length !== Math.max(0, ruta.geometry.length - 1)) {
      carretera3d = generarCarretera3d();
      signos3d = generarSignos3d();
    }
    const segs = carretera3d;
    let idxActual = 0;
    if (ultimaPos && segs.length) {
      let mejor = Infinity;
      for (let i = 0; i < segs.length; i++) {
        const d = distancia(ultimaPos.lat, ultimaPos.lon, segs[i].lat, segs[i].lon);
        if (d < mejor) { mejor = d; idxActual = i; }
      }
    }

    dibujarCielo3d(w, h, horizonte, t, idxActual);
    const suelo = ctx3d.createLinearGradient(0, horizonte, 0, h);
    suelo.addColorStop(0, '#122a22');
    suelo.addColorStop(0.45, '#0d1f19');
    suelo.addColorStop(1, '#07110d');
    ctx3d.fillStyle = suelo;
    ctx3d.fillRect(0, horizonte, w, h - horizonte);

    const N = 64;
    const pts = [];
    for (let i = 0; i <= N; i++) pts.push(proyecto3d(i / N, idxActual, segs, w, h, horizonte, cx));

    // Vegetación y edificios lejanos.
    for (let i = 2; i <= N - 2; i += 3) {
      const p = pts[i];
      if (p.escala < 0.08) continue;
      const lado = i % 2 === 0 ? -1 : 1;
      const bx = p.x + lado * (p.ancho * 0.5 + 26 * p.escala);
      const by = p.y;
      if (i % 9 === 0) {
        const bw = 18 * p.escala, bh = (34 + (i % 5) * 12) * p.escala;
        ctx3d.fillStyle = 'rgba(10,24,38,.9)';
        ctx3d.fillRect(bx - bw / 2, by - bh, bw, bh);
        ctx3d.fillStyle = 'rgba(120,220,255,.35)';
        for (let wy = 0; wy < 3; wy++) {
          if ((i + wy) % 3 === 0) ctx3d.fillRect(bx - bw * 0.25, by - bh + (wy + 0.6) * bh / 4, bw * 0.18, 3 * p.escala + 1);
        }
      } else {
        const th = (46 + (i % 4) * 10) * p.escala;
        const tw = th * 0.42;
        ctx3d.fillStyle = '#3b2a1c';
        ctx3d.fillRect(bx - 1.5 * p.escala, by - 4 * p.escala, 3 * p.escala, 4 * p.escala + 1);
        ctx3d.fillStyle = '#0f3a2c';
        ctx3d.beginPath();
        ctx3d.moveTo(bx, by - th);
        ctx3d.lineTo(bx + tw / 2, by);
        ctx3d.lineTo(bx - tw / 2, by);
        ctx3d.closePath();
        ctx3d.fill();
        ctx3d.fillStyle = '#1d5c44';
        ctx3d.beginPath();
        ctx3d.moveTo(bx, by - th * 0.72);
        ctx3d.lineTo(bx + tw * 0.32, by - th * 0.18);
        ctx3d.lineTo(bx - tw * 0.32, by - th * 0.18);
        ctx3d.closePath();
        ctx3d.fill();
      }
    }

    // Asfalto.
    for (let i = 1; i <= N; i++) {
      const a = pts[i - 1], b = pts[i];
      const grad = ctx3d.createLinearGradient(0, b.y, 0, a.y + 0.01);
      grad.addColorStop(0, '#22384f');
      grad.addColorStop(1, '#2f4762');
      ctx3d.fillStyle = grad;
      ctx3d.beginPath();
      ctx3d.moveTo(a.x - a.ancho / 2, a.y);
      ctx3d.lineTo(a.x + a.ancho / 2, a.y);
      ctx3d.lineTo(b.x + b.ancho / 2, b.y);
      ctx3d.lineTo(b.x - b.ancho / 2, b.y);
      ctx3d.closePath();
      ctx3d.fill();
    }
    // Arcén.
    for (const lado of [-1, 1]) {
      ctx3d.beginPath();
      for (let i = 0; i <= N; i++) {
        const p = pts[i];
        const x = p.x + lado * (p.ancho / 2 + 8 * p.escala);
        if (i === 0) ctx3d.moveTo(x, p.y); else ctx3d.lineTo(x, p.y);
      }
      for (let i = N; i >= 0; i--) {
        const p = pts[i];
        ctx3d.lineTo(p.x + lado * p.ancho / 2, p.y);
      }
      ctx3d.closePath();
      ctx3d.fillStyle = 'rgba(70,90,80,.35)';
      ctx3d.fill();
    }
    // Bordes luminosos.
    for (const lado of [-1, 1]) {
      ctx3d.beginPath();
      for (let i = 0; i <= N; i++) {
        const p = pts[i];
        const x = p.x + lado * p.ancho / 2;
        if (i === 0) ctx3d.moveTo(x, p.y); else ctx3d.lineTo(x, p.y);
      }
      ctx3d.strokeStyle = 'rgba(56,225,255,.75)';
      ctx3d.shadowColor = '#38e1ff';
      ctx3d.shadowBlur = 8;
      ctx3d.lineWidth = 2.5;
      ctx3d.stroke();
      ctx3d.shadowBlur = 0;
    }
    // Línea central discontinua con sensación de avance.
    const fase = Math.floor(t * 10);
    for (let i = 1; i <= N; i++) {
      if (((i + fase) % 6) > 2) continue;
      const a = pts[i - 1], b = pts[i];
      ctx3d.strokeStyle = 'rgba(240,248,255,.85)';
      ctx3d.lineWidth = Math.max(1, 4 * b.escala);
      ctx3d.beginPath();
      ctx3d.moveTo(a.x, a.y);
      ctx3d.lineTo(b.x, b.y);
      ctx3d.stroke();
    }
    // Ruta azul luminosa.
    ctx3d.save();
    ctx3d.strokeStyle = 'rgba(56,140,255,.9)';
    ctx3d.shadowColor = '#2f8cff';
    ctx3d.shadowBlur = 14;
    for (let i = 1; i <= N - 4; i++) {
      const a = pts[i - 1], b = pts[i];
      ctx3d.lineWidth = Math.max(2, 7 * b.escala);
      ctx3d.beginPath();
      ctx3d.moveTo(a.x, a.y);
      ctx3d.lineTo(b.x, b.y);
      ctx3d.stroke();
    }
    ctx3d.restore();
    // Flechas de dirección sobre la carretera.
    for (const z of [0.12, 0.3, 0.52]) {
      const p = proyecto3d(z, idxActual, segs, w, h, horizonte, cx);
      const tam = 26 * p.escala + 6;
      const dir = Math.max(-0.9, Math.min(0.9, p.dH / 35));
      ctx3d.save();
      ctx3d.translate(p.x, p.y);
      ctx3d.strokeStyle = 'rgba(140,220,255,.95)';
      ctx3d.shadowColor = '#38e1ff';
      ctx3d.shadowBlur = 12;
      ctx3d.lineWidth = Math.max(2, 5 * p.escala);
      ctx3d.beginPath();
      ctx3d.moveTo(-tam, tam * 0.45);
      ctx3d.lineTo(dir * tam * 0.45, -tam * 0.55);
      ctx3d.lineTo(tam, tam * 0.45);
      ctx3d.stroke();
      ctx3d.restore();
    }
    // Guardarraíles.
    for (const lado of [-1, 1]) {
      let prev = null;
      for (let i = 2; i <= N - 3; i += 4) {
        const p = pts[i];
        if (p.escala < 0.07) continue;
        const x = p.x + lado * (p.ancho / 2 + 4 * p.escala);
        if (prev) {
          ctx3d.strokeStyle = 'rgba(170,200,220,.6)';
          ctx3d.lineWidth = Math.max(1, 2.2 * p.escala);
          ctx3d.beginPath();
          ctx3d.moveTo(prev.x, prev.y - 10 * prev.s);
          ctx3d.lineTo(x, p.y - 10 * p.escala);
          ctx3d.stroke();
        }
        ctx3d.fillStyle = 'rgba(160,180,200,.55)';
        ctx3d.fillRect(x - 1.5 * p.escala, p.y - 12 * p.escala, 3 * p.escala, 12 * p.escala);
        prev = { x, y: p.y, s: p.escala };
      }
    }
    // Paso elevado ocasional.
    const paso = Math.floor(idxActual / 120);
    const zPaso = 0.4 + (paso % 3) * 0.07;
    const pp = proyecto3d(zPaso, idxActual, segs, w, h, horizonte, cx);
    ctx3d.fillStyle = 'rgba(12,26,40,.95)';
    ctx3d.fillRect(pp.x - pp.ancho * 0.62, pp.y - 26 * pp.escala, pp.ancho * 1.24, 12 * pp.escala);
    ctx3d.fillStyle = 'rgba(90,120,145,.5)';
    for (const lado of [-1, 1]) {
      ctx3d.fillRect(pp.x + lado * pp.ancho * 0.6 - 2 * pp.escala, pp.y - 26 * pp.escala, 4 * pp.escala, 26 * pp.escala);
    }

    dibujarGantry3d(w, h, horizonte, idxActual, segs, cx);
    dibujarSenalLimite3d(w, h, horizonte, idxActual, segs, cx);
    dibujarCoche3d(w, h, t);
    dibujarHud3d(w, h);
  }

  function dibujarCarreteraRecta(w, h, cx, horizonte) {
    const numSegs = 50;
    const segW = 220;
    for (let i = 0; i < numSegs; i++) {
      const z = i / numSegs;
      const scale = 1 - z * 0.82;
      const y = horizonte + (h - horizonte) * (1 - z);
      const roadW = segW * scale * (1 + z * 0.3);
      const zPrev = (i - 1) / numSegs;
      const scalePrev = 1 - zPrev * 0.82;
      const yPrev = horizonte + (h - horizonte) * (1 - zPrev);
      const roadWPrev = segW * scalePrev * (1 + zPrev * 0.3);
      ctx3d.fillStyle = z < 0.5 ? '#2a3a50' : '#1e2d42';
      ctx3d.beginPath();
      ctx3d.moveTo(cx - roadWPrev / 2, yPrev);
      ctx3d.lineTo(cx + roadWPrev / 2, yPrev);
      ctx3d.lineTo(cx + roadW / 2, y);
      ctx3d.lineTo(cx - roadW / 2, y);
      ctx3d.closePath();
      ctx3d.fill();
      if (i % 3 === 0) {
        ctx3d.strokeStyle = '#f0f8ff';
        ctx3d.lineWidth = 2 * scale;
        ctx3d.setLineDash([10 * scale, 10 * scale]);
        ctx3d.globalAlpha = 0.7;
        ctx3d.beginPath();
        ctx3d.moveTo(cx, yPrev);
        ctx3d.lineTo(cx, y);
        ctx3d.stroke();
        ctx3d.setLineDash([]);
        ctx3d.globalAlpha = 1;
      }
      ctx3d.strokeStyle = '#38e1ff';
      ctx3d.lineWidth = 2 * scale;
      ctx3d.globalAlpha = 0.6;
      ctx3d.beginPath();
      ctx3d.moveTo(cx - roadWPrev / 2, yPrev);
      ctx3d.lineTo(cx - roadW / 2, y);
      ctx3d.stroke();
      ctx3d.beginPath();
      ctx3d.moveTo(cx + roadWPrev / 2, yPrev);
      ctx3d.lineTo(cx + roadW / 2, y);
      ctx3d.stroke();
      ctx3d.globalAlpha = 1;
    }
  }

  function dibujarSignos3d(w, h, cx, horizonte, idxActual, segs) {
    const signos = signos3d;
    if (signos.length === 0) return;
    // Calcular distancia acumulada hasta el índice actual
    let distAcum = 0;
    for (let i = 0; i < idxActual && i < segs.length; i++) distAcum += segs[i].dist;
    // Dibujar signos próximos
    for (const s of signos) {
      const distRestante = s.dist - distAcum;
      if (distRestante < 0 || distRestante > 2000) continue;
      const z = Math.min(1, distRestante / 2000);
      const scale = 1 - z * 0.6;
      const y = horizonte + (h - horizonte) * (1 - z) * 0.5;
      const signW = 160 * scale;
      const signH = 80 * scale;
      const x = cx + (s.modifier === 'right' ? 100 : s.modifier === 'left' ? -100 : 0) * scale;
      // Fondo del cartel (estilo autopista)
      ctx3d.fillStyle = 'rgba(5, 10, 20, .95)';
      ctx3d.fillRect(x - signW / 2, y - signH / 2, signW, signH);
      ctx3d.strokeStyle = s.exit ? '#22d3ee' : '#f0f8ff';
      ctx3d.lineWidth = 3 * scale;
      ctx3d.strokeRect(x - signW / 2, y - signH / 2, signW, signH);
      // Banda superior (azul autopista)
      ctx3d.fillStyle = s.exit ? 'rgba(34, 211, 238, .3)' : 'rgba(56, 189, 248, .2)';
      ctx3d.fillRect(x - signW / 2, y - signH / 2, signW, signH * 0.3);
      // Texto principal
      ctx3d.fillStyle = '#f0f8ff';
      ctx3d.font = `bold ${Math.round(14 * scale)}px sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      const lineas = s.texto.split(' ').slice(0, 4).join(' ');
      ctx3d.fillText(lineas, x, y - 5 * scale);
      // Distancia
      ctx3d.fillStyle = 'rgba(255, 255, 255, .7)';
      ctx3d.font = `${Math.round(11 * scale)}px sans-serif`;
      ctx3d.fillText(`${distRestante} m`, x, y + 15 * scale);
      if (s.exit) {
        ctx3d.fillStyle = '#22d3ee';
        ctx3d.font = `bold ${Math.round(12 * scale)}px sans-serif`;
        ctx3d.fillText('▶ TOMAR ESTA SALIDA', x, y + 30 * scale);
      } else {
        ctx3d.fillStyle = 'rgba(255, 255, 255, .5)';
        ctx3d.font = `${Math.round(10 * scale)}px sans-serif`;
        ctx3d.fillText('NO TOMAR', x, y + 30 * scale);
      }
    }
  }

  function dibujarCoche3d(w, h, t = 0) {
    prepararSpriteCoche3d();
    const carW = Math.min(w * 0.40, 190);
    const carH = carW * 1.10;
    const cx = w / 2;
    const cy = h - carH * 0.78 + Math.sin(t * 7) * Math.min(2.2, velocidad / 45);
    // Estelas laterales a velocidad.
    if (velocidad > 25) {
      ctx3d.save();
      ctx3d.strokeStyle = 'rgba(56,225,255,.2)';
      ctx3d.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const off = carW * (0.55 + i * 0.16);
        const largo = Math.min(h * 0.18, 40 + velocidad * 1.2);
        ctx3d.beginPath();
        ctx3d.moveTo(cx - off, cy + carH * 0.3);
        ctx3d.lineTo(cx - off - 6, cy + carH * 0.3 + largo);
        ctx3d.stroke();
        ctx3d.beginPath();
        ctx3d.moveTo(cx + off, cy + carH * 0.3);
        ctx3d.lineTo(cx + off + 6, cy + carH * 0.3 + largo);
        ctx3d.stroke();
      }
      ctx3d.restore();
    }
    // Sombra.
    ctx3d.fillStyle = 'rgba(0,0,0,.55)';
    ctx3d.beginPath();
    ctx3d.ellipse(cx, cy + carH / 2 + 6, carW / 2 + 10, 12, 0, 0, Math.PI * 2);
    ctx3d.fill();
    // Halo bajo el coche.
    const glow = ctx3d.createRadialGradient(cx, cy + carH / 2, 0, cx, cy + carH / 2, carW);
    glow.addColorStop(0, 'rgba(56,225,255,.38)');
    glow.addColorStop(1, 'rgba(56,225,255,0)');
    ctx3d.fillStyle = glow;
    ctx3d.fillRect(cx - carW, cy - carH / 2, carW * 2, carH * 2);
    // GT4 (misma imagen del proyecto, no se sustituye).
    if (spriteCoche3d) {
      ctx3d.drawImage(spriteCoche3d, cx - carW / 2, cy - carH / 2, carW, carH);
    } else if (imagenCoche3d && imagenCoche3d.complete && imagenCoche3d.naturalWidth) {
      ctx3d.save();
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(cx - carW / 2, cy - carH / 2, carW, carH, carW * 0.1);
      else ctx3d.rect(cx - carW / 2, cy - carH / 2, carW, carH);
      ctx3d.clip();
      ctx3d.drawImage(imagenCoche3d, cx - carW / 2, cy - carH / 2, carW, carH);
      ctx3d.restore();
    } else {
      ctx3d.fillStyle = '#facc15';
      ctx3d.beginPath();
      ctx3d.roundRect(cx - carW / 2, cy - carH / 2, carW, carH, 12);
      ctx3d.fill();
      ctx3d.fillStyle = '#0b1220';
      ctx3d.fillRect(cx - carW / 2 + 10, cy - carH / 2 + 15, carW - 20, carH * 0.24);
    }
    // Luces traseras.
    ctx3d.fillStyle = 'rgba(255,77,109,.9)';
    ctx3d.shadowColor = '#ff4d6d';
    ctx3d.shadowBlur = 16;
    ctx3d.fillRect(cx - carW * 0.36, cy + carH * 0.36, carW * 0.16, carH * 0.035);
    ctx3d.fillRect(cx + carW * 0.2, cy + carH * 0.36, carW * 0.16, carH * 0.035);
    ctx3d.shadowBlur = 0;
  }

  function dibujarHud3d(w, h) {
    // Velocidad
    ctx3d.fillStyle = 'rgba(10, 16, 30, .85)';
    ctx3d.fillRect(10, 10, 90, 50);
    ctx3d.strokeStyle = 'rgba(34, 211, 238, .4)';
    ctx3d.lineWidth = 1;
    ctx3d.strokeRect(10, 10, 90, 50);
    ctx3d.fillStyle = '#22d3ee';
    ctx3d.font = 'bold 28px sans-serif';
    ctx3d.textAlign = 'left';
    ctx3d.fillText(`${Math.round(velocidad)}`, 20, 42);
    ctx3d.fillStyle = '#f0f8ff';
    ctx3d.font = '10px sans-serif';
    ctx3d.fillText('KM/H', 60, 42);
    // Etiqueta de modo.
    ctx3d.fillStyle = 'rgba(10,16,30,.72)';
    ctx3d.fillRect(w / 2 - 62, 10, 124, 24);
    ctx3d.strokeStyle = 'rgba(56,225,255,.35)';
    ctx3d.lineWidth = 1;
    ctx3d.strokeRect(w / 2 - 62, 10, 124, 24);
    ctx3d.fillStyle = '#7ee7ff';
    ctx3d.font = 'bold 11px sans-serif';
    ctx3d.textAlign = 'center';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillText('3D EXTERIOR · GT4', w / 2, 22);
    // Límite de la vía (dato de mapa).
    const kmh = ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null;
    if (kmh) {
      const r = 17, lx = w - 30, ly = 88;
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.beginPath(); ctx3d.arc(lx, ly, r, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = '#dc2626';
      ctx3d.lineWidth = 4;
      ctx3d.beginPath(); ctx3d.arc(lx, ly, r * 0.82, 0, Math.PI * 2); ctx3d.stroke();
      ctx3d.fillStyle = '#0f172a';
      ctx3d.font = 'bold 17px sans-serif';
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText(String(kmh), lx, ly + 1);
      ctx3d.fillStyle = 'rgba(200,230,240,.7)';
      ctx3d.font = '9px sans-serif';
      ctx3d.fillText('mapa', lx, ly + r + 8);
    }
    // Distancia restante
    const ruta = rutaActiva();
    if (ruta) {
      const rest = restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0);
      ctx3d.fillStyle = 'rgba(10, 16, 30, .85)';
      ctx3d.fillRect(w - 130, 10, 120, 50);
      ctx3d.strokeStyle = 'rgba(34, 211, 238, .4)';
      ctx3d.strokeRect(w - 130, 10, 120, 50);
      ctx3d.fillStyle = '#f0f8ff';
      ctx3d.font = 'bold 16px sans-serif';
      ctx3d.textAlign = 'right';
      ctx3d.fillText(rest > 1000 ? `${(rest / 1000).toFixed(1)} km` : `${Math.round(rest)} m`, w - 20, 32);
      ctx3d.font = '11px sans-serif';
      ctx3d.fillStyle = 'rgba(255, 255, 255, .7)';
      const min = ruta.duration ? Math.round(ruta.duration / 60) : 0;
      const llegada = ruta.duration ? new Date(Date.now() + ruta.duration * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
      ctx3d.fillText(min ? `${min} min · ${llegada}` : '', w - 20, 50);
    }
    // Avisos de estado: no fingir posición ni ruta si faltan datos.
    const sinGps = !ultimaPos || (ultimaVez && Date.now() - ultimaVez > 10000);
    if (sinGps) {
      const txt = 'SIN SEÑAL GPS · posición no disponible';
      ctx3d.fillStyle = 'rgba(30,8,14,.9)';
      const an = Math.min(w - 30, 280), x = (w - an) / 2, y = h * 0.46;
      ctx3d.fillRect(x, y, an, 30);
      ctx3d.strokeStyle = 'rgba(255,77,109,.8)';
      ctx3d.lineWidth = 1.5;
      ctx3d.strokeRect(x, y, an, 30);
      ctx3d.fillStyle = '#ff8aa1';
      ctx3d.font = 'bold 12px sans-serif';
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText(txt, w / 2, y + 15);
    } else if (!ruta) {
      const txt = 'SIN RUTA ACTIVA · modo 3D exterior';
      ctx3d.fillStyle = 'rgba(6,10,18,.82)';
      const an = Math.min(w - 30, 260), x = (w - an) / 2, y = h * 0.46;
      ctx3d.fillRect(x, y, an, 28);
      ctx3d.strokeStyle = 'rgba(56,225,255,.4)';
      ctx3d.lineWidth = 1;
      ctx3d.strokeRect(x, y, an, 28);
      ctx3d.fillStyle = '#9fd8ea';
      ctx3d.font = 'bold 11px sans-serif';
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText(txt, w / 2, y + 14);
    }
    // Próxima maniobra (banner inferior)
    const s = ruta?.steps?.[paso] || ruta?.steps?.[0];
    if (s && s.name) {
      ctx3d.fillStyle = 'rgba(10, 16, 30, .9)';
      ctx3d.fillRect(10, h - 70, w - 20, 60);
      ctx3d.strokeStyle = 'rgba(34, 211, 238, .5)';
      ctx3d.lineWidth = 2;
      ctx3d.strokeRect(10, h - 70, w - 20, 60);
      ctx3d.fillStyle = '#22d3ee';
      ctx3d.font = 'bold 24px sans-serif';
      ctx3d.textAlign = 'left';
      ctx3d.fillText(flechaPara(s), 25, h - 42);
      ctx3d.fillStyle = '#f0f8ff';
      ctx3d.font = 'bold 14px sans-serif';
      ctx3d.fillText(s.name || 'Continúa', 60, h - 42);
      ctx3d.fillStyle = 'rgba(255, 255, 255, .6)';
      ctx3d.font = '11px sans-serif';
      ctx3d.fillText(`En ${s.distance ? (s.distance > 1000 ? (s.distance/1000).toFixed(1)+' km' : s.distance+' m') : ''}`, 60, h - 22);
    }
  }

  function iniciar3d() {
    if (!init3d()) return;
    // Un solo modo de vista a la vez: si AR está abierto, se cierra.
    if (typeof vistaArActiva !== 'undefined' && vistaArActiva && typeof detenerAr === 'function') detenerAr();
    vista3dActiva = true;
    carretera3d = generarCarretera3d();
    signos3d = generarSignos3d();
    document.getElementById('ruta3dToggle')?.classList.add('activo');
    document.querySelector('.ruta-shell')?.classList.add('ruta-3d-activo');
    canvas3d.hidden = false;
    canvas3d.width = canvas3d.clientWidth || window.innerWidth;
    canvas3d.height = canvas3d.clientHeight || window.innerHeight;
    const loop = () => {
      if (!vista3dActiva) return;
      dibujar3d();
      animacion3d = requestAnimationFrame(loop);
    };
    loop();
  }

  function detener3d() {
    vista3dActiva = false;
    if (animacion3d) cancelAnimationFrame(animacion3d);
    animacion3d = null;
    document.getElementById('ruta3dToggle')?.classList.remove('activo');
    document.querySelector('.ruta-shell')?.classList.remove('ruta-3d-activo');
    if (canvas3d) canvas3d.hidden = true;
  }

  function toggle3d() {
    if (vista3dActiva) detener3d(); else iniciar3d();
  }

  // Conectar el botón
  document.getElementById('ruta3dToggle')?.addEventListener('click', toggle3d);

  // ============================================================
  // ADAS AR · Realidad Aumentada
  // ============================================================
  let vistaArActiva = false;
  let streamAr = null;
  let animacionAr = null;
  let canvasAr = null;
  let ctxAr = null;
  let videoAr = null;
  let modeloCoco = null;
  let deteccionesAr = [];
  let ultimoAnalisisAr = 0;
  let moduloCabina3d = null;
  let cabina3dLista = false;

  async function montarCabina3d() {
    if (cabina3dLista) return;
    try {
      moduloCabina3d = await import('/js/cabina3d.js');
      moduloCabina3d.montar(document.getElementById('rutaCabina3d'));
      cabina3dLista = true;
    } catch (e) {
      console.warn('Cabina 3D no disponible, se usa la 2D:', e);
      moduloCabina3d = null;
    }
  }

  // --- Orientación del móvil: alineación espacial aproximada del AR ---
  let arBaseAlpha = null;
  let arBaseBeta = null;
  let arHeadingRel = 0;
  let arPitchRel = 0;
  let arSensoresOk = false;
  let arSensorFn = null;

  function onOrientacion(e) {
    if (e.alpha == null && e.beta == null) return;
    arSensoresOk = true;
    if (arBaseAlpha == null) { arBaseAlpha = e.alpha || 0; arBaseBeta = e.beta || 0; }
    let da = (e.alpha || 0) - arBaseAlpha;
    while (da > 180) da -= 360;
    while (da < -180) da += 360;
    arHeadingRel = da;
    arPitchRel = (e.beta || 0) - arBaseBeta;
  }

  function iniciarSensoresAr() {
    if (arSensorFn) return;
    if (typeof DeviceOrientationEvent === 'undefined') return;
    arSensorFn = onOrientacion;
    const permiso = DeviceOrientationEvent.requestPermission;
    if (typeof permiso === 'function') {
      permiso().then(r => { if (r === 'granted') window.addEventListener('deviceorientation', arSensorFn, { passive: true }); })
        .catch(() => {});
    } else {
      window.addEventListener('deviceorientation', arSensorFn, { passive: true });
    }
  }

  function detenerSensoresAr() {
    if (arSensorFn) { window.removeEventListener('deviceorientation', arSensorFn); arSensorFn = null; }
    arSensoresOk = false;
  }

  // Fija el ancho real del carril actual en metros (referencia conocida).
  function calibrarAncho(metros) {
    const m = Number(metros);
    if (!Number.isFinite(m) || m < 1.5 || m > 8) {
      avisar('Indica un ancho entre 1,5 y 8 metros.', 'aviso', 3000);
      return false;
    }
    anchoRealM = m;
    if (carrilSuave && carrilSuave.ancho > 0.2) anchoRef = carrilSuave.ancho;
    anchoCalibrado = true;
    const anchoM = anchoRef > 0.2 && carrilSuave ? (carrilSuave.ancho * anchoRealM) / anchoRef : m;
    avisar(`Ancho de carril calibrado a ${m.toFixed(1)} m (medido ${anchoM.toFixed(1)} m).`, 'ok', 4000);
    return true;
  }

  // Intermitente manual del usuario (no hay acceso al del coche).
  function fijarIntermitente(lado) {
    const valor = lado === 'izq' || lado === 'der' ? lado : null;
    intermitenteAuto = false;
    intermitente = intermitente === valor ? null : valor;
    clearTimeout(intermitenteTimer);
    if (intermitente) intermitenteTimer = setTimeout(() => fijarIntermitente(null), 20000);
    const izq = document.getElementById('rutaInterIzq');
    const der = document.getElementById('rutaInterDer');
    if (izq) { izq.classList.toggle('activo', intermitente === 'izq'); izq.setAttribute('aria-pressed', String(intermitente === 'izq')); }
    if (der) { der.classList.toggle('activo', intermitente === 'der'); der.setAttribute('aria-pressed', String(intermitente === 'der')); }
    return intermitente;
  }

  function calibrarAr() {
    arBaseAlpha = null;
    arBaseBeta = null;
    arHeadingRel = 0;
    arPitchRel = 0;
    // La calibración también centra el carril: el desvío actual pasa a ser el cero.
    carrilBias = carrilSuave ? carrilSuave.offset : 0;
    if (carrilSuave && carrilSuave.ancho > 0.2) anchoRef = carrilSuave.ancho;
    carrilBuenas = 0;
    carrilMalas = 0;
    document.getElementById('rutaCalibrar')?.classList.add('calibrado');
    avisar(arSensoresOk ? 'AR calibrada con la orientación del móvil.' : 'Este móvil no envía orientación; AR sin calibrar.', arSensoresOk ? 'ok' : 'aviso', 3000);
  }

  // --- Visión artificial local: carriles y señales ---
  const VW = 160, VH = 120;
  let lienzoVision = null;
  let ctxVision = null;
  let carrilInfo = null;
  let carrilSuave = null;
  let bufferL = [], bufferR = [];
  let carrilBias = 0;
  let anchoRef = 0;
  let anchoRealM = 3.5;      // referencia conocida (carril estándar)
  let anchoCalibrado = false;
  let ultimoAvisoCurva = 0;
  let ultimoAvisoAncho = 0;
  let ultimaVozCarril = 0;
  let curvaDesde = 0;
  let anchoDesde = 0;
  let curvaAnunciada = false;
  let anchoAnunciado = false;
  let ultimoAvisoCambio = 0;
  let ultimoAvisoIncorporacion = 0;
  let desvioDesde = 0;
  let incorporacionDesde = 0;
  let cambioAnunciado = false;
  let incorporacionAnunciada = false;
  let intermitente = null;
  let intermitenteAuto = false;
  let intermitenteTimer = 0;
  let desvioSigno = 0;
  let hudCambioHasta = 0;
  let hudCambioTexto = '';
  let graciaCarrilHasta = 0;
  let carrilBuenas = 0;
  let carrilMalas = 0;
  let senalInfo = null;
  let ultimoAnalisisVision = 0;
  let arInicio = 0;
  let ultimoAvisoCarril = 0;
  let ultimoIntentoTexto = 0;
  let senalTexto = '';

  function initVision() {
    if (lienzoVision) return;
    lienzoVision = document.createElement('canvas');
    lienzoVision.width = VW;
    lienzoVision.height = VH;
    ctxVision = lienzoVision.getContext('2d', { willReadFrequently: true });
  }

  // Ajuste cuadrático u = A·d² + B·d + C por mínimos cuadrados.
  function regresionCuadratica(pts) {
    const n = pts.length;
    if (n < 5) return null;
    let S0 = n, S1 = 0, S2 = 0, S3 = 0, S4 = 0, T0 = 0, T1 = 0, T2 = 0;
    for (const [u, d] of pts) {
      const d2 = d * d;
      S1 += d; S2 += d2; S3 += d2 * d; S4 += d2 * d2;
      T0 += u; T1 += u * d; T2 += u * d2;
    }
    const M = [[S4, S3, S2, T2], [S3, S2, S1, T1], [S2, S1, S0, T0]];
    for (let i = 0; i < 3; i++) {
      let piv = i;
      for (let r = i + 1; r < 3; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      if (Math.abs(M[piv][i]) < 1e-9) return null;
      [M[i], M[piv]] = [M[piv], M[i]];
      const p = M[i][i];
      for (let c = i; c < 4; c++) M[i][c] /= p;
      for (let r = 0; r < 3; r++) {
        if (r === i) continue;
        const f = M[r][i];
        if (!f) continue;
        for (let c = i; c < 4; c++) M[r][c] -= f * M[i][c];
      }
    }
    return { A: M[0][3], B: M[1][3], C: M[2][3] };
  }

  // Respaldo lineal u = B·d + C: permite enganchar antes con pocos puntos
  // (rectas y arranque de cámara) hasta que haya datos para la parábola.
  function regresionLineal(pts) {
    const n = pts.length;
    if (n < 4) return null;
    let Sd = 0, Sd2 = 0, Su = 0, Sud = 0;
    for (const [u, d] of pts) { Sd += d; Sd2 += d * d; Su += u; Sud += u * d; }
    const den = n * Sd2 - Sd * Sd;
    if (!den) return null;
    const B = (n * Sud - Sd * Su) / den;
    const C = (Su - B * Sd) / n;
    return { A: 0, B, C };
  }

  function analizarVision(ahora) {
    initVision();
    if (!ctxVision || !videoAr || videoAr.readyState < 2 || !videoAr.videoWidth) return;
    ctxVision.drawImage(videoAr, 0, 0, VW, VH);
    let datos;
    try { datos = ctxVision.getImageData(0, 0, VW, VH).data; } catch (_e) { return; }

    let rojos = 0, rMinX = VW, rMaxX = 0, rMinY = VH, rMaxY = 0;

    for (let y = 0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        const i = (y * VW + x) * 4;
        const r = datos[i], g = datos[i + 1], b = datos[i + 2];
        // Señal roja (círculo de límite/prohibición) en la mitad superior.
        if (y < VH * 0.5 && r > 135 && r - g > 55 && r - b > 55) {
          rojos++;
          if (x < rMinX) rMinX = x;
          if (x > rMaxX) rMaxX = x;
          if (y < rMinY) rMinY = y;
          if (y > rMaxY) rMaxY = y;
        }
      }
    }

    // Carriles con corrección de perspectiva (trapecio normalizado u/d) y
    // ajuste cuadrático: sigue curvas y tolera líneas discontinuas porque
    // cada segmento claro se asigna a su lado con la predicción anterior.
    const ROI_Y0 = Math.round(VH * 0.55);
    const ROI_Y1 = Math.round(VH * 0.98);
    const Wtop = VW * 0.34;
    const Wbot = VW * 0.92;
    for (let y = ROI_Y0; y <= ROI_Y1; y += 2) {
      const d = (ROI_Y1 - y) / (ROI_Y1 - ROI_Y0); // 0 = cerca, 1 = lejos
      const medio = (Wbot + (Wtop - Wbot) * d) / 2;
      // Segmentos claros de la fila (las líneas discontinuas dejan huecos).
      const runs = [];
      let ini = -1;
      for (let x = 2; x < VW - 2; x++) {
        const i = (y * VW + x) * 4;
        const r = datos[i], g = datos[i + 1], b = datos[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx > 150 && (mx - mn) < 45) { if (ini < 0) ini = x; }
        else if (ini >= 0) {
          const largo = x - ini;
          if (largo >= 2 && largo <= VW * 0.12) runs.push((ini + x - 1) / 2);
          ini = -1;
        }
      }
      if (ini >= 0) {
        const largo = VW - 2 - ini;
        if (largo >= 2 && largo <= VW * 0.12) runs.push((ini + VW - 3) / 2);
      }
      const us = runs.map(x => (x - VW / 2) / medio).filter(u => Math.abs(u) < 1.8).sort((a, b) => a - b);
      if (us.length < 2) continue;
      // Emparejar segmentos por ancho y centro esperados: funciona aunque el
      // carril esté desplazado, en curva y con huecos de línea discontinua.
      const refOffset = carrilSuave ? carrilSuave.offset : 0;
      const refAncho = carrilSuave ? Math.abs(carrilSuave.cR - carrilSuave.cL) : 0.72;
      // Rango de ancho relativo al carril conocido: permite detectar
      // estrechamientos sin aceptar parejas de ruido.
      const minPar = carrilSuave ? Math.max(0.35, refAncho * 0.55) : 0.5;
      const maxPar = carrilSuave ? Math.min(3, refAncho * 1.7) : 1.9;
      let par = null;
      for (let i = 0; i < us.length; i++) {
        for (let j = i + 1; j < us.length; j++) {
          const anchoPar = us[j] - us[i];
          if (anchoPar < minPar || anchoPar > maxPar) continue;
          const centroPar = (us[i] + us[j]) / 2;
          const score = Math.abs(centroPar - refOffset) + Math.abs(anchoPar - refAncho) * 0.6;
          if (!par || score < par.score) par = { a: us[i], b: us[j], score };
        }
      }
      if (par) {
        bufferL.push([par.a, d, ahora]);
        bufferR.push([par.b, d, ahora]);
      } else if (us.length === 1 && carrilSuave) {
        // Con modelo previo, un único trazo se asigna a su lado esperado:
        // así las discontinuas rellenan sus huecos a lo largo del tiempo.
        const pL = carrilSuave.aL * d * d + carrilSuave.bL * d + carrilSuave.cL;
        const pR = carrilSuave.aR * d * d + carrilSuave.bR * d + carrilSuave.cR;
        const pc = (pL + pR) / 2;
        const mitad = Math.max(0.3, Math.abs(pR - pL) / 2);
        const z = (us[0] - pc) / mitad;
        if (z <= -0.2 && z >= -2.2) bufferL.push([us[0], d, ahora]);
        else if (z >= 0.2 && z <= 2.2) bufferR.push([us[0], d, ahora]);
      }
    }

    // Búfer temporal: rellena los huecos de las líneas discontinuas.
    const corte = ahora - 1400;
    bufferL = bufferL.filter(p => p[2] >= corte);
    bufferR = bufferR.filter(p => p[2] >= corte);
    if (bufferL.length > 400) bufferL.splice(0, bufferL.length - 400);
    if (bufferR.length > 400) bufferR.splice(0, bufferR.length - 400);
    const puntosL = bufferL.map(p => [p[0], p[1]]);
    const puntosR = bufferR.map(p => [p[0], p[1]]);
    const span = pts => pts.length ? Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1])) : 0;
    const calidad = (pts, f) => {
      if (!f || pts.length < 5) return 0;
      let err = 0;
      for (const [u, d] of pts) err += Math.abs(u - (f.A * d * d + f.B * d + f.C));
      return Math.min(1, Math.max(0, 1 - (err / pts.length) / 0.28));
    };
    const fL = regresionCuadratica(puntosL) || regresionLineal(puntosL);
    const fR = regresionCuadratica(puntosR) || regresionLineal(puntosR);
    let detectado = false;
    if (fL && fR && span(puntosL) > 0.22 && span(puntosR) > 0.22 && Math.abs(fL.A) < 3 && Math.abs(fR.A) < 3) {
      const w0 = fR.C - fL.C;
      const w7 = (fR.A * 0.49 + fR.B * 0.7 + fR.C) - (fL.A * 0.49 + fL.B * 0.7 + fL.C);
      const qL = calidad(puntosL, fL), qR = calidad(puntosR, fR);
      if (w0 > 0.4 && w0 < 2.8 && Math.abs(w7 - w0) < 1.2 && qL > 0.35 && qR > 0.35) {
        const conf = Math.min(1, (puntosL.length + puntosR.length) / 24) * ((qL + qR) / 2);
        const offset = (fL.C + fR.C) / 2;
        const curvatura = (fL.A + fR.A) / 2;
        detectado = true;
        const A = 0.22;
        if (!carrilSuave) {
          carrilSuave = { aL: fL.A, bL: fL.B, cL: fL.C, aR: fR.A, bR: fR.B, cR: fR.C, offset, conf, ancho: w0, curv: curvatura, ts: ahora };
          if (!anchoRef) anchoRef = w0;
        } else {
          carrilSuave.aL += (fL.A - carrilSuave.aL) * A;
          carrilSuave.bL += (fL.B - carrilSuave.bL) * A;
          carrilSuave.cL += (fL.C - carrilSuave.cL) * A;
          carrilSuave.aR += (fR.A - carrilSuave.aR) * A;
          carrilSuave.bR += (fR.B - carrilSuave.bR) * A;
          carrilSuave.cR += (fR.C - carrilSuave.cR) * A;
          carrilSuave.offset += (offset - carrilSuave.offset) * A;
          carrilSuave.conf += (conf - carrilSuave.conf) * A;
          carrilSuave.ancho += (w0 - carrilSuave.ancho) * A;
          carrilSuave.curv += (curvatura - carrilSuave.curv) * A;
          carrilSuave.ts = ahora;
        }
      }
    }
    // Si se pierde la detección, se mantiene un instante y luego se apaga.
    if (!detectado && carrilSuave && ahora - carrilSuave.ts > 900) carrilSuave = null;
    carrilInfo = carrilSuave ? { ok: true, conf: carrilSuave.conf, offset: carrilSuave.offset } : null;

    // Señal: caja roja aproximadamente cuadrada.
    const anchoR = rMaxX - rMinX, altoR = rMaxY - rMinY;
    if (rojos > 90 && anchoR > 10 && altoR > 10) {
      const ratio = anchoR / altoR;
      if (ratio > 0.6 && ratio < 1.7) senalInfo = { x: rMinX, y: rMinY, w: anchoR, h: altoR };
      else senalInfo = null;
    } else {
      senalInfo = null;
    }

    // Lectura opcional del número con la API de texto del navegador (si existe).
    if (senalInfo && 'TextDetector' in window && ahora - ultimoIntentoTexto > 2500) {
      ultimoIntentoTexto = ahora;
      try {
        const det = new window.TextDetector();
        det.detect(videoAr).then(lista => {
          const nums = (lista || []).map(t => (String(t.rawValue || '').match(/\b(10|20|30|40|50|60|70|80|90|100|110|120|130)\b/) || [])[0]).filter(Boolean);
          if (nums.length) senalTexto = nums[0];
        }).catch(() => {});
      } catch (_e) { /* sin lector de texto */ }
    }
  }

  function dibujarVision(w, h) {
    // Carriles suavizados, reproyectados desde la vista normalizada.
    if (carrilSuave && carrilInfo && carrilInfo.ok) {
      const sx = w / VW, sy = h / VH;
      const ROI_Y0 = Math.round(VH * 0.55);
      const ROI_Y1 = Math.round(VH * 0.98);
      const Wtop = VW * 0.34;
      const Wbot = VW * 0.92;
      const sesgo = carrilSuave.offset - carrilBias; // 0 = centrado tras calibrar
      const senalizado = intermitente && ((sesgo > 0 && intermitente === 'der') || (sesgo < 0 && intermitente === 'izq'));
      const col = senalizado ? '#fbbf24' : Math.abs(sesgo) > 0.42 ? '#ef4444' : Math.abs(sesgo) > 0.24 ? '#fbbf24' : '#22c55e';
      const proyectar = (a, b, c, d) => {
        const y = ROI_Y1 - d * (ROI_Y1 - ROI_Y0);
        const ancho = Wbot + (Wtop - Wbot) * d;
        const u = a * d * d + b * d + c;
        return [((VW / 2) + (u * ancho) / 2) * sx, y * sy];
      };
      ctxAr.save();
      ctxAr.lineWidth = 3;
      ctxAr.strokeStyle = col;
      ctxAr.shadowColor = col;
      ctxAr.shadowBlur = 10;
      for (const [a, b, c] of [[carrilSuave.aL, carrilSuave.bL, carrilSuave.cL], [carrilSuave.aR, carrilSuave.bR, carrilSuave.cR]]) {
        ctxAr.beginPath();
        for (let k = 0; k <= 12; k++) {
          const [px, py] = proyectar(a, b, c, k / 12);
          if (k === 0) ctxAr.moveTo(px, py); else ctxAr.lineTo(px, py);
        }
        ctxAr.stroke();
      }
      ctxAr.restore();
      // Antirrebote: el aviso exige varios análisis seguidos con desvío.
      const desviado = Math.abs(sesgo) > 0.42 && carrilSuave.conf > 0.5;
      if (desviado) { carrilBuenas++; carrilMalas = 0; } else { carrilMalas++; if (carrilMalas > 2) carrilBuenas = 0; }
      // Si el usuario señaliza ese lado, la salida es intencionada: no se avisa.
      if (carrilBuenas >= 3 && !senalizado && Date.now() > graciaCarrilHasta) {
        ctxAr.fillStyle = 'rgba(239,68,68,.92)';
        ctxAr.font = `bold ${Math.max(11, w * 0.03)}px sans-serif`;
        ctxAr.textAlign = 'center';
        ctxAr.textBaseline = 'middle';
        ctxAr.fillText('⚠ SALIDA DE CARRIL', w / 2, h * 0.30);
        if (Date.now() - ultimoAvisoCarril > 9000) {
          ultimoAvisoCarril = Date.now();
          ultimaVozCarril = ultimoAvisoCarril;
          decir('Atención, te acercas al borde del carril.');
        }
      }

      // Avisos de curva cerrada y carril estrecho: histéresis de 0,8 s,
      // cooldown de 15 s y turno de palabra compartido con el resto.
      const agora = Date.now();
      const confOk = carrilSuave.conf > 0.5;
      const magCurv = Math.abs(carrilSuave.curv);
      const anchoRel = anchoRef > 0.2 ? carrilSuave.ancho / anchoRef : 1;
      const estrecho = confOk && anchoRel < 0.85;
      if (confOk && magCurv > 0.4) {
        if (!curvaDesde) curvaDesde = agora;
      } else { curvaDesde = 0; curvaAnunciada = false; }
      if (curvaDesde && !curvaAnunciada && agora - curvaDesde > 800 &&
          agora - ultimoAvisoCurva > 15000 && agora - ultimaVozCarril > 3500) {
        curvaAnunciada = true;
        ultimoAvisoCurva = agora;
        ultimaVozCarril = agora;
        decir(`Atención, curva cerrada a la ${carrilSuave.curv > 0 ? 'derecha' : 'izquierda'}.`);
      }
      if (estrecho) {
        if (!anchoDesde) anchoDesde = agora;
      } else { anchoDesde = 0; anchoAnunciado = false; }
      if (anchoDesde && !anchoAnunciado && agora - anchoDesde > 800 &&
          agora - ultimoAvisoAncho > 15000 && agora - ultimaVozCarril > 3500) {
        anchoAnunciado = true;
        ultimoAvisoAncho = agora;
        ultimaVozCarril = agora;
        const anchoMaviso = anchoRef > 0.2 ? (carrilSuave.ancho * anchoRealM) / anchoRef : 0;
        decir(anchoMaviso > 0
          ? `Atención, carril estrecho, unos ${anchoMaviso.toFixed(1)} metros.`
          : 'Atención, carril estrecho.');
      }

      // Cambio de carril con histéresis: entra a 0,55, sale a 0,30 y exige
      // que la dirección se mantenga; confirma si el intermitente coincide.
      const ladoCambio = sesgo > 0 ? 'derecha' : 'izquierda';
      const senalCoincide = intermitente && ((sesgo > 0 && intermitente === 'der') || (sesgo < 0 && intermitente === 'izq'));
      if (confOk && Math.abs(sesgo) > 0.55) {
        const signo = sesgo > 0 ? 1 : -1;
        if (!desvioDesde) { desvioDesde = agora; desvioSigno = signo; }
        else if (signo !== desvioSigno) { desvioDesde = agora; desvioSigno = signo; }
      } else if (Math.abs(sesgo) < 0.3) {
        desvioDesde = 0;
        desvioSigno = 0;
        cambioAnunciado = false;
        // Maniobra terminada: el intermitente puesto para confirmarla se apaga.
        if (intermitenteAuto) fijarIntermitente(null);
      }
      if (desvioDesde && !cambioAnunciado && agora - desvioDesde > 1200 &&
          agora - ultimoAvisoCambio > 12000 && agora - ultimaVozCarril > 3500) {
        cambioAnunciado = true;
        ultimoAvisoCambio = agora;
        ultimaVozCarril = agora;
        hudCambioTexto = senalCoincide ? `✔ Cambio ${ladoCambio} confirmado` : `↔ Cambio de carril ${ladoCambio}`;
        hudCambioHasta = agora + 3500;
        decir(senalCoincide
          ? `Cambio de carril a la ${ladoCambio} confirmado por el intermitente.`
          : `Cambio de carril a la ${ladoCambio}.`);
        // Se mantiene encendido hasta centrar el carril (ver histéresis) y
        // se da un margen para no avisar de “salida” al volver al centro.
        if (senalCoincide) { intermitenteAuto = true; graciaCarrilHasta = agora + 5000; }
      }

      // Incorporación: ensanchamiento sostenido (carril de aceleración/unión).
      const incorpora = confOk && anchoRel > 1.28;
      if (incorpora) {
        if (!incorporacionDesde) incorporacionDesde = agora;
      } else { incorporacionDesde = 0; incorporacionAnunciada = false; }
      if (incorporacionDesde && !incorporacionAnunciada && agora - incorporacionDesde > 1000 &&
          agora - ultimoAvisoIncorporacion > 20000 && agora - ultimaVozCarril > 3500) {
        incorporacionAnunciada = true;
        ultimoAvisoIncorporacion = agora;
        ultimaVozCarril = agora;
        decir('Posible incorporación: el carril se ensancha.');
      }
    }

    // Señal detectada
    if (senalInfo) {
      const sx = w / VW, sy = h / VH;
      const x = senalInfo.x * sx, y = senalInfo.y * sy;
      const an = senalInfo.w * sx, al = senalInfo.h * sy;
      ctxAr.strokeStyle = 'rgba(255,77,109,.9)';
      ctxAr.lineWidth = 2;
      ctxAr.strokeRect(x, y, an, al);
      ctxAr.fillStyle = 'rgba(255,77,109,.9)';
      ctxAr.font = `bold ${Math.max(9, w * 0.025)}px sans-serif`;
      ctxAr.textAlign = 'left';
      ctxAr.textBaseline = 'alphabetic';
      ctxAr.fillText(senalTexto ? `Señal: ${senalTexto}` : 'Señal detectada', x, Math.max(12, y - 5));
    }
  }

  function initAr() {
    canvasAr = document.getElementById('rutaArCanvas');
    videoAr = document.getElementById('rutaArVideo');
    if (!canvasAr || !videoAr) return false;
    ctxAr = canvasAr.getContext('2d');
    canvasAr.width = canvasAr.clientWidth || window.innerWidth;
    canvasAr.height = canvasAr.clientHeight || window.innerHeight;
    return true;
  }

  async function iniciarAr() {
    if (!initAr()) return;
    // Un solo modo de vista a la vez: si 3D está abierto, se cierra.
    if (vista3dActiva) detener3d();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      avisar('Tu navegador no soporta cámara. Usa Chrome actualizado.', 'error', 8000);
      return;
    }
    avisar('Activando cámara...', 'info', 2000);
    try {
      streamAr = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      videoAr.srcObject = streamAr;
      await videoAr.play().catch(() => {});
      vistaArActiva = true;
      document.getElementById('rutaArToggle')?.classList.add('activo');
      document.querySelector('.ruta-shell')?.classList.add('ruta-ar-activo');
      canvasAr.classList.add('activo');
      videoAr.classList.add('activo');
      ajustarTamanoAr();
      montarCabina3d();
      iniciarSensoresAr();
      initVision();
      // Arranque rápido: reiniciar búfer y analizar el primer fotograma ya.
      arInicio = Date.now();
      bufferL = [];
      bufferR = [];
      carrilSuave = null;
      ultimoAnalisisVision = 0;
      analizarVision(arInicio);
      document.getElementById('rutaCalibrar')?.classList.remove('calibrado');
      // Cargar modelo COCO-SSD (lazy, solo si está disponible)
      if (typeof cocoSsd !== 'undefined' && !modeloCoco) {
        cocoSsd.load().then(m => { modeloCoco = m; avisar('Detección de objetos activada.', 'ok', 3000); }).catch(e => console.warn('COCO-SSD no disponible:', e));
      }
      const loop = () => {
        if (!vistaArActiva) return;
        dibujarAr();
        animacionAr = requestAnimationFrame(loop);
      };
      loop();
      avisar('ADAS AR activado. Cámara trasera en directo.', 'ok', 4000);
    } catch (e) {
      avisar('No se pudo acceder a la cámara. Verifica los permisos.', 'error', 6000);
      console.error('Error cámara AR:', e);
    }
  }

  function detenerAr() {
    vistaArActiva = false;
    if (animacionAr) cancelAnimationFrame(animacionAr);
    animacionAr = null;
    if (streamAr) {
      streamAr.getTracks().forEach(t => t.stop());
      streamAr = null;
    }
    if (videoAr) videoAr.srcObject = null;
    document.getElementById('rutaArToggle')?.classList.remove('activo');
    document.querySelector('.ruta-shell')?.classList.remove('ruta-ar-activo');
    if (canvasAr) canvasAr.classList.remove('activo');
    if (videoAr) videoAr.classList.remove('activo');
    if (moduloCabina3d) {
      try { moduloCabina3d.apagar(); } catch (_e) { /* nada */ }
      moduloCabina3d = null;
      cabina3dLista = false;
    }
    detenerSensoresAr();
    carrilInfo = null;
    carrilSuave = null;
    bufferL = [];
    bufferR = [];
    carrilBias = 0;
    const panelAnchoDetener = document.getElementById('rutaAnchoPanel');
    if (panelAnchoDetener) panelAnchoDetener.hidden = true;
    carrilBuenas = 0;
    carrilMalas = 0;
    curvaDesde = 0;
    anchoDesde = 0;
    curvaAnunciada = false;
    anchoAnunciado = false;
    graciaCarrilHasta = 0;
    desvioDesde = 0;
    incorporacionDesde = 0;
    cambioAnunciado = false;
    incorporacionAnunciada = false;
    clearTimeout(intermitenteTimer);
    intermitente = null;
    intermitenteAuto = false;
    document.getElementById('rutaInterIzq')?.classList.remove('activo');
    document.getElementById('rutaInterDer')?.classList.remove('activo');
    senalInfo = null;
    senalTexto = '';
  }

  function toggleAr() {
    if (vistaArActiva) detenerAr(); else iniciarAr();
  }

  function dibujarAr() {
    if (!ctxAr || !canvasAr || !videoAr) return;
    // Mantener el canvas nítido y ajustado al tamaño real de la pantalla.
    ajustarTamanoAr();
    const w = canvasAr.width, h = canvasAr.height;
    // Limpiar canvas (transparente para ver el video)
    ctxAr.clearRect(0, 0, w, h);

    // Detección de objetos (cada 500ms para no saturar)
    const ahora = Date.now();
    if (modeloCoco && videoAr.readyState >= 2 && ahora - ultimoAnalisisAr > 500) {
      ultimoAnalisisAr = ahora;
      modeloCoco.detect(videoAr).then(preds => {
        deteccionesAr = preds.filter(p => p.score > 0.5);
      }).catch(() => {});
    }

    // Dibujar detecciones
    for (const d of deteccionesAr) {
      const [x, y, bw, bh] = d.bbox;
      const scaleX = w / (videoAr.videoWidth || w);
      const scaleY = h / (videoAr.videoHeight || h);
      const rx = x * scaleX, ry = y * scaleY, rw = bw * scaleX, rh = bh * scaleY;
      // Caja de detección
      ctxAr.strokeStyle = d.class === 'car' || d.class === 'truck' || d.class === 'bus' ? '#ff4d6d' : '#38e1ff';
      ctxAr.lineWidth = 2;
      ctxAr.strokeRect(rx, ry, rw, rh);
      // Etiqueta
      ctxAr.fillStyle = d.class === 'car' || d.class === 'truck' || d.class === 'bus' ? 'rgba(255, 77, 109, .8)' : 'rgba(56, 225, 255, .8)';
      ctxAr.fillRect(rx, ry - 18, rw, 18);
      ctxAr.fillStyle = '#fff';
      ctxAr.font = 'bold 11px sans-serif';
      ctxAr.textAlign = 'left';
      ctxAr.fillText(`${d.class} ${Math.round(d.score * 100)}%`, rx + 4, ry - 5);
      // Distancia estimada (aproximada, basada en tamaño del bounding box)
      if (d.class === 'car' || d.class === 'truck' || d.class === 'bus' || d.class === 'motorcycle') {
        const distEst = Math.round(2000 / (rh || 1));
        if (distEst < 200) {
          ctxAr.fillStyle = distEst < 30 ? '#ff4d6d' : distEst < 60 ? '#fbbf24' : 'rgba(255, 255, 255, .7)';
          ctxAr.font = 'bold 10px sans-serif';
          ctxAr.fillText(`~${distEst}m`, rx + 4, ry + rh + 14);
          if (distEst < 30) {
            // Aviso de proximidad
            ctxAr.fillStyle = 'rgba(255, 77, 109, .9)';
            ctxAr.font = 'bold 12px sans-serif';
            ctxAr.textAlign = 'center';
            ctxAr.fillText('⚠ PROXIMIDAD', rx + rw / 2, ry - 25);
            ctxAr.textAlign = 'left';
          }
        }
      }
    }

    // Línea de ruta dinámica (color según la maniobra) pintada sobre la calzada.
    const ruta = rutaActiva();
    const s = ruta?.steps?.[paso] || ruta?.steps?.[0];
    if (ruta && ruta.geometry && ruta.geometry.length > 1) {
      dibujarRutaAr(w, h, ruta, s);
    }

    // Visión local: carriles y señales (cada ~300 ms).
    const ahoraVision = Date.now();
    // Durante los primeros segundos se analiza más a menudo para enganchar antes.
    const intervaloVision = (ahoraVision - arInicio) < 3000 ? 200 : 300;
    if (ahoraVision - ultimoAnalisisVision > intervaloVision) {
      ultimoAnalisisVision = ahoraVision;
      analizarVision(ahoraVision);
    }
    dibujarVision(w, h);

    // HUD: velocidad
    // Cabina: 3D real si está disponible; si no, dibujo 2D de respaldo.
    const dist = ruta ? restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0) : 0;
    const eta = ruta ? Math.round((ruta.duration || 0) / 60) : 0;
    if (cabina3dLista && moduloCabina3d) {
      const v = velocidad;
      const marcha = v < 1 ? 'N' : v < 20 ? '1' : v < 40 ? '2' : v < 70 ? '3' : v < 100 ? '4' : '5';
      moduloCabina3d.actualizar({ velocidad: v, marcha, distancia: dist, eta, color: colorManiobra(s) });
    } else {
      dibujarCockpit(w, h, s, ruta);
    }

    // Panel superior de maniobra.
    dibujarPanelAr(w, h, s);

    // Señal de límite de velocidad (dato cartográfico de OpenStreetMap).
    dibujarSenalLimite(w, h, ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null);
  }

  function dibujarSenalLimite(w, h, kmh) {
    const r = Math.min(28, w * 0.065);
    const x = w - 12 - r;
    const y = 12 + Math.min(74, h * 0.1) + 16 + r;
    ctxAr.beginPath();
    ctxAr.arc(x, y, r, 0, Math.PI * 2);
    ctxAr.fillStyle = '#ffffff'; ctxAr.fill();
    ctxAr.lineWidth = Math.max(4, r * 0.18);
    ctxAr.strokeStyle = '#d81f2a'; ctxAr.stroke();
    ctxAr.fillStyle = '#0a1018';
    ctxAr.font = `bold ${r * 0.92}px sans-serif`;
    ctxAr.textAlign = 'center'; ctxAr.textBaseline = 'middle';
    ctxAr.fillText(kmh ? String(kmh) : '—', x, y + 1);
    ctxAr.fillStyle = 'rgba(200,220,240,0.75)';
    ctxAr.font = `${r * 0.34}px sans-serif`;
    ctxAr.fillText('mapa', x, y + r + r * 0.55);
  }

  // ---- utilidades de dibujo AR ----
  function hexRgba(hex, a) {
    const t = String(hex).replace('#', '');
    const r = parseInt(t.slice(0, 2), 16), g = parseInt(t.slice(2, 4), 16), b = parseInt(t.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }
  function rrect(x, y, an, al, r) {
    const rr = Math.min(r, an / 2, al / 2);
    ctxAr.beginPath();
    ctxAr.moveTo(x + rr, y);
    ctxAr.arcTo(x + an, y, x + an, y + al, rr);
    ctxAr.arcTo(x + an, y + al, x, y + al, rr);
    ctxAr.arcTo(x, y + al, x, y, rr);
    ctxAr.arcTo(x, y, x + an, y, rr);
    ctxAr.closePath();
  }
  function colorManiobra(s) {
    if (!s) return '#22d3ee';
    const m = String(s.modifier || '');
    if (m.includes('uturn') || m.includes('sharp')) return '#ef4444';
    if (m.includes('left') || m.includes('right')) return '#fb923c';
    if (m.includes('slight')) return '#fbbf24';
    if (s.type === 'roundabout' || s.type === 'rotary') return '#a855f7';
    if (s.type === 'exit' || s.type === 'off ramp') return '#f59e0b';
    return '#22c55e';
  }
  function recortar(t, max) {
    const c = String(t || '');
    return c.length > max ? `${c.slice(0, max - 1)}…` : c;
  }
  function ajustarTamanoAr() {
    if (!canvasAr) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const an = Math.round((canvasAr.clientWidth || window.innerWidth) * dpr);
    const al = Math.round((canvasAr.clientHeight || window.innerHeight) * dpr);
    if (an && al && (canvasAr.width !== an || canvasAr.height !== al)) {
      canvasAr.width = an;
      canvasAr.height = al;
    }
  }

  // Calzada pintada en perspectiva con colores según la maniobra y flechas
  // que avanzan hacia el horizonte (sensación de movimiento real).
  function dibujarRutaAr(w, h, ruta, s) {
    const pts = ruta.geometry;
    const n = Math.min(26, pts.length);
    if (n < 2) return;
    const col = colorManiobra(s);
    const baseY = h * 0.72;
    const topY = h * 0.30;
    const nearW = Math.min(w * 0.30, 240);
    const farW = nearW * 0.12;
    // Alineación aproximada con la orientación real del móvil.
    const shiftX = arSensoresOk ? Math.max(-w * 0.34, Math.min(w * 0.34, -arHeadingRel * 2.4)) : 0;
    const shiftY = arSensoresOk ? Math.max(-h * 0.12, Math.min(h * 0.12, arPitchRel * 1.6)) : 0;
    let curva = 0;
    const coords = [];
    for (let i = 0; i < n; i++) {
      const z = i / (n - 1);
      if (i > 0 && i < pts.length - 1) {
        const a = pts[i - 1], b = pts[i], c = pts[i + 1];
        const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const h2 = Math.atan2(c[1] - b[1], c[0] - b[0]);
        let d = h2 - h1;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        curva += d;
      }
      const off = Math.max(-0.42, Math.min(0.42, curva));
      const x = w / 2 + off * z * z * w * 0.9 + shiftX;
      const y = baseY + (topY - baseY) * z + shiftY;
      const half = (nearW + (farW - nearW) * z) / 2;
      coords.push({ x, y, half, z });
    }

    ctxAr.save();
    // cinta de calzada
    const g = ctxAr.createLinearGradient(0, baseY, 0, topY);
    g.addColorStop(0, hexRgba(col, 0.55));
    g.addColorStop(0.6, hexRgba(col, 0.30));
    g.addColorStop(1, hexRgba(col, 0.05));
    ctxAr.fillStyle = g;
    ctxAr.beginPath();
    coords.forEach((p, i) => (i ? ctxAr.lineTo(p.x - p.half, p.y) : ctxAr.moveTo(p.x - p.half, p.y)));
    for (let i = coords.length - 1; i >= 0; i--) ctxAr.lineTo(coords[i].x + coords[i].half, coords[i].y);
    ctxAr.closePath();
    ctxAr.fill();

    // bordes luminosos
    ctxAr.lineWidth = 2.5;
    ctxAr.strokeStyle = hexRgba(col, 0.95);
    ctxAr.shadowColor = col;
    ctxAr.shadowBlur = 16;
    for (const side of [-1, 1]) {
      ctxAr.beginPath();
      coords.forEach((p, i) => (i ? ctxAr.lineTo(p.x + side * p.half, p.y) : ctxAr.moveTo(p.x + side * p.half, p.y)));
      ctxAr.stroke();
    }
    ctxAr.shadowBlur = 0;

    // eje discontinuo animado
    ctxAr.lineWidth = Math.max(2, nearW * 0.03);
    ctxAr.strokeStyle = 'rgba(255,255,255,0.8)';
    ctxAr.setLineDash([14, 18]);
    ctxAr.lineDashOffset = -(performance.now() / 25) % 32;
    ctxAr.beginPath();
    coords.forEach((p, i) => (i ? ctxAr.lineTo(p.x, p.y) : ctxAr.moveTo(p.x, p.y)));
    ctxAr.stroke();
    ctxAr.setLineDash([]);

    // flechas que avanzan
    const phase = (performance.now() / 1200) % 1;
    for (let k = 0; k < 6; k++) {
      const z = ((k / 6) + phase) % 1;
      const idx = Math.min(coords.length - 1, Math.round(z * (coords.length - 1)));
      const p = coords[idx];
      const sz = Math.max(4, nearW * 0.16 * (1 - z * 0.85));
      ctxAr.fillStyle = hexRgba(col, 0.9 * (1 - z * 0.7));
      ctxAr.beginPath();
      ctxAr.moveTo(p.x, p.y - sz);
      ctxAr.lineTo(p.x - sz, p.y + sz * 0.6);
      ctxAr.lineTo(p.x - sz * 0.5, p.y + sz * 0.6);
      ctxAr.lineTo(p.x, p.y + sz * 0.1);
      ctxAr.lineTo(p.x + sz * 0.5, p.y + sz * 0.6);
      ctxAr.lineTo(p.x + sz, p.y + sz * 0.6);
      ctxAr.closePath();
      ctxAr.fill();
    }
    ctxAr.restore();
  }

  // Cabina: salpicadero curvo, volante GT4 y paneles digitales.
  function dibujarCockpit(w, h, s, ruta) {
    const dashH = h * 0.28;
    const dashTop = h - dashH;
    ctxAr.save();

    // salpicadero
    ctxAr.beginPath();
    ctxAr.moveTo(0, h);
    ctxAr.lineTo(0, dashTop + h * 0.06);
    ctxAr.quadraticCurveTo(w * 0.5, dashTop - h * 0.06, w, dashTop + h * 0.06);
    ctxAr.lineTo(w, h);
    ctxAr.closePath();
    const dg = ctxAr.createLinearGradient(0, dashTop, 0, h);
    dg.addColorStop(0, 'rgba(16,22,32,0.93)');
    dg.addColorStop(0.45, 'rgba(9,13,20,0.985)');
    dg.addColorStop(1, '#04070d');
    ctxAr.fillStyle = dg;
    ctxAr.fill();

    // filo superior luminoso
    ctxAr.beginPath();
    ctxAr.moveTo(0, dashTop + h * 0.06);
    ctxAr.quadraticCurveTo(w * 0.5, dashTop - h * 0.06, w, dashTop + h * 0.06);
    ctxAr.strokeStyle = 'rgba(56,225,255,0.28)';
    ctxAr.lineWidth = 2;
    ctxAr.stroke();

    // volante GT4
    const wheelR = Math.min(w * 0.46, h * 0.26);
    const wcx = w / 2;
    const wcy = h * 0.90;
    ctxAr.lineWidth = wheelR * 0.13;
    ctxAr.strokeStyle = '#0b0f15';
    ctxAr.beginPath();
    ctxAr.arc(wcx, wcy, wheelR, Math.PI * 1.02, Math.PI * 1.98);
    ctxAr.stroke();
    ctxAr.lineWidth = Math.max(1.5, wheelR * 0.02);
    ctxAr.strokeStyle = 'rgba(56,225,255,0.35)';
    ctxAr.beginPath();
    ctxAr.arc(wcx, wcy, wheelR * 0.95, Math.PI * 1.06, Math.PI * 1.94);
    ctxAr.stroke();
    ctxAr.strokeStyle = '#11161f';
    ctxAr.lineWidth = wheelR * 0.07;
    for (const a of [Math.PI * 1.30, Math.PI * 1.70]) {
      ctxAr.beginPath();
      ctxAr.moveTo(wcx, wcy);
      ctxAr.lineTo(wcx + Math.cos(a) * wheelR * 0.92, wcy + Math.sin(a) * wheelR * 0.92);
      ctxAr.stroke();
    }
    ctxAr.fillStyle = '#0e141d';
    ctxAr.beginPath();
    ctxAr.arc(wcx, wcy, wheelR * 0.2, 0, Math.PI * 2);
    ctxAr.fill();
    ctxAr.fillStyle = '#38e1ff';
    ctxAr.font = `bold ${Math.max(9, wheelR * 0.13)}px sans-serif`;
    ctxAr.textAlign = 'center';
    ctxAr.textBaseline = 'middle';
    ctxAr.fillText('GT4', wcx, wcy);

    // paneles digitales
    const bh = Math.min(70, h * 0.09);
    const bw = Math.min(150, w * 0.34);
    dibujarPanelVelocidad(12, dashTop + 10, bw, bh);
    dibujarPanelRuta(w - bw - 12, dashTop + 10, bw, bh, ruta);

    ctxAr.restore();
  }

  function dibujarPanelVelocidad(x, y, bw, bh) {
    rrect(x, y, bw, bh, 12);
    ctxAr.fillStyle = 'rgba(5,9,15,0.85)';
    ctxAr.fill();
    ctxAr.strokeStyle = 'rgba(34,211,238,0.4)';
    ctxAr.lineWidth = 1.5;
    ctxAr.stroke();
    ctxAr.fillStyle = '#22d3ee';
    ctxAr.textAlign = 'left';
    ctxAr.textBaseline = 'middle';
    ctxAr.font = `bold ${bh * 0.52}px sans-serif`;
    ctxAr.fillText(`${Math.round(velocidad)}`, x + 12, y + bh * 0.42);
    ctxAr.fillStyle = 'rgba(200,220,240,0.7)';
    ctxAr.font = `${bh * 0.18}px sans-serif`;
    ctxAr.fillText('KM/H', x + 12, y + bh * 0.8);
    const v = velocidad;
    const marcha = v < 1 ? 'N' : v < 20 ? '1' : v < 40 ? '2' : v < 70 ? '3' : v < 100 ? '4' : '5';
    ctxAr.fillStyle = 'rgba(56,225,255,0.95)';
    ctxAr.textAlign = 'right';
    ctxAr.font = `bold ${bh * 0.5}px sans-serif`;
    ctxAr.fillText(marcha, x + bw - 14, y + bh * 0.5);
  }

  function dibujarPanelRuta(x, y, bw, bh, ruta) {
    rrect(x, y, bw, bh, 12);
    ctxAr.fillStyle = 'rgba(5,9,15,0.85)';
    ctxAr.fill();
    ctxAr.strokeStyle = 'rgba(56,225,255,0.3)';
    ctxAr.lineWidth = 1.5;
    ctxAr.stroke();
    const rest = ruta ? restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0) : 0;
    const min = ruta ? Math.round((ruta.duration || 0) / 60) : 0;
    const restTxt = rest >= 1000 ? `${(rest / 1000).toFixed(1)} km` : `${Math.round(rest)} m`;
    ctxAr.fillStyle = '#f0f8ff';
    ctxAr.textAlign = 'right';
    ctxAr.textBaseline = 'middle';
    ctxAr.font = `bold ${bh * 0.32}px sans-serif`;
    ctxAr.fillText(restTxt, x + bw - 12, y + bh * 0.38);
    ctxAr.fillStyle = 'rgba(200,220,240,0.65)';
    ctxAr.font = `${bh * 0.2}px sans-serif`;
    ctxAr.fillText(`${min} min`, x + bw - 12, y + bh * 0.74);
  }

  // Panel superior con la próxima maniobra, coloreado según su tipo.
  function dibujarPanelAr(w, h, s) {
    if (!s) return;
    const px = 12, py = 12, pw = w - 24, ph = Math.min(74, h * 0.1);
    rrect(px, py, pw, ph, 16);
    ctxAr.fillStyle = 'rgba(6,10,16,0.84)';
    ctxAr.fill();
    ctxAr.strokeStyle = 'rgba(56,225,255,0.3)';
    ctxAr.lineWidth = 1.5;
    ctxAr.stroke();
    const col = colorManiobra(s);
    const ab = ph - 20;
    rrect(px + 10, py + 10, ab, ab, 12);
    ctxAr.fillStyle = hexRgba(col, 0.92);
    ctxAr.fill();
    ctxAr.fillStyle = '#04121c';
    ctxAr.textAlign = 'center';
    ctxAr.textBaseline = 'middle';
    ctxAr.font = `bold ${ab * 0.6}px sans-serif`;
    ctxAr.fillText(flechaPara(s), px + 10 + ab / 2, py + 10 + ab / 2 + 2);
    const aSig = s && Number.isFinite(s.lat) && ultimaPos
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : (s.distance || 0);
    ctxAr.textAlign = 'left';
    ctxAr.fillStyle = '#f0f8ff';
    ctxAr.font = `bold ${ph * 0.24}px sans-serif`;
    ctxAr.fillText(recortar(s.name || 'Continúa', 18), px + 10 + ab + 14, py + ph * 0.44);
    ctxAr.fillStyle = 'rgba(200,220,240,0.7)';
    ctxAr.font = `${ph * 0.19}px sans-serif`;
    ctxAr.fillText(`En ${aSig > 1000 ? `${(aSig / 1000).toFixed(1)} km` : `${Math.round(aSig)} m`}`, px + 10 + ab + 14, py + ph * 0.74);
    ctxAr.textAlign = 'right';
    ctxAr.fillStyle = '#eaf7ff';
    ctxAr.font = `bold ${ph * 0.26}px sans-serif`;
    ctxAr.fillText(`${Math.round(velocidad)} km/h`, px + pw - 14, py + ph * 0.42);
    const rr = rutaActiva();
    const restM = rr ? restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0) : 0;
    const etaM = rr ? Math.round((rr.duration || 0) / 60) : 0;
    const restTxt = restM >= 1000 ? `${(restM / 1000).toFixed(1)} km` : `${Math.round(restM)} m`;
    ctxAr.fillStyle = 'rgba(200,220,240,0.65)';
    ctxAr.font = `${ph * 0.17}px sans-serif`;
    ctxAr.fillText(rr ? `${restTxt} · ${etaM} min` : 'Sin ruta', px + pw - 14, py + ph * 0.72);

    // Indicador de curvatura y ancho de carril (solo con detección fiable).
    if (carrilSuave && carrilInfo && carrilSuave.conf > 0.25) {
      const curv = carrilSuave.curv;
      const mag = Math.abs(curv);
      const dirTxt = mag < 0.05 ? '⬆' : curv > 0 ? '↱' : '↰';
      const etiqueta = mag < 0.05 ? 'Recta' : mag < 0.18 ? 'Curva suave' : mag < 0.4 ? 'Curva' : 'Curva cerrada';
      const anchoRel = anchoRef > 0.2 ? carrilSuave.ancho / anchoRef : 1;
      const anchoM = anchoRef > 0.2 ? (carrilSuave.ancho * anchoRealM) / anchoRef : 0;
      const txt1 = `${dirTxt} ${etiqueta}`;
      const txt2 = anchoM > 0 ? `${anchoCalibrado ? '' : '≈'}Ancho ${anchoM.toFixed(1)} m` : 'Ancho —';
      const ch = Math.max(26, ph * 0.42);
      const cw = Math.min(pw, Math.max(w * 0.5, 220));
      const cx = px + (pw - cw) / 2;
      const cy = py + ph + 8;
      rrect(cx, cy, cw, ch, ch / 2);
      ctxAr.fillStyle = 'rgba(6,10,16,0.72)';
      ctxAr.fill();
      const alerta = mag > 0.4 || anchoRel < 0.85 || anchoRel > 1.25;
      ctxAr.strokeStyle = alerta ? 'rgba(251,191,36,0.75)' : 'rgba(56,225,255,0.35)';
      ctxAr.lineWidth = 1.2;
      ctxAr.stroke();
      ctxAr.textAlign = 'center';
      ctxAr.textBaseline = 'middle';
      ctxAr.font = `bold ${ch * 0.42}px sans-serif`;
      ctxAr.fillStyle = alerta ? '#fbbf24' : '#7ee7ff';
      ctxAr.fillText(txt1, cx + cw * 0.28, cy + ch / 2 + 1);
      ctxAr.fillText(txt2, cx + cw * 0.72, cy + ch / 2 + 1);
      ctxAr.strokeStyle = 'rgba(160,190,220,0.25)';
      ctxAr.lineWidth = 1;
      ctxAr.beginPath();
      ctxAr.moveTo(cx + cw / 2, cy + ch * 0.22);
      ctxAr.lineTo(cx + cw / 2, cy + ch * 0.78);
      ctxAr.stroke();

      // Estado de maniobra: cambio de carril, incorporación o intermitente.
      const ahoraHud = Date.now();
      const sesgoHud = carrilSuave.offset - carrilBias;
      const confHud = carrilSuave.conf > 0.5;
      let estadoTxt = '', estadoCol = '#7ee7ff';
      if (confHud && Math.abs(sesgoHud) > 0.5) {
        estadoTxt = `↔ Cambio de carril ${sesgoHud > 0 ? 'derecha' : 'izquierda'}`;
        estadoCol = '#fbbf24';
      } else if (confHud && anchoRel > 1.22) {
        estadoTxt = '⇥ Posible incorporación';
        estadoCol = '#a5f3fc';
      } else if (ahoraHud < hudCambioHasta && hudCambioTexto) {
        estadoTxt = hudCambioTexto;
        estadoCol = '#86efac';
      } else if (intermitente) {
        estadoTxt = intermitente === 'der' ? '↱ Intermitente derecho' : '↰ Intermitente izquierdo';
        estadoCol = '#fbbf24';
      }
      if (estadoTxt) {
        const ch2 = ch * 0.84;
        const cw2 = Math.min(pw, Math.max(w * 0.44, 190));
        const cx2 = px + (pw - cw2) / 2;
        const cy2 = cy + ch + 6;
        rrect(cx2, cy2, cw2, ch2, ch2 / 2);
        ctxAr.fillStyle = 'rgba(6,10,16,0.78)';
        ctxAr.fill();
        ctxAr.strokeStyle = 'rgba(160,200,220,0.3)';
        ctxAr.lineWidth = 1;
        ctxAr.stroke();
        ctxAr.textAlign = 'center';
        ctxAr.textBaseline = 'middle';
        ctxAr.font = `bold ${ch2 * 0.42}px sans-serif`;
        ctxAr.fillStyle = estadoCol;
        ctxAr.fillText(estadoTxt, cx2 + cw2 / 2, cy2 + ch2 / 2 + 1);
      }
    }
  }

  // Conectar el botón AR
  document.getElementById('rutaArToggle')?.addEventListener('click', toggleAr);
  document.getElementById('rutaCalibrar')?.addEventListener('click', calibrarAr);
  // Panel visual para calibrar el ancho del carril sin usar la voz.
  const panelAncho = document.getElementById('rutaAnchoPanel');
  const inputAncho = document.getElementById('rutaAnchoInput');
  document.getElementById('rutaAnchoBtn')?.addEventListener('click', () => {
    if (!panelAncho || !inputAncho) return;
    inputAncho.value = String(anchoRealM);
    panelAncho.hidden = false;
  });
  document.getElementById('rutaAnchoCancel')?.addEventListener('click', () => {
    if (panelAncho) panelAncho.hidden = true;
  });
  document.getElementById('rutaAnchoOk')?.addEventListener('click', () => {
    const m = parseFloat(String(inputAncho?.value || '').replace(',', '.'));
    if (calibrarAncho(m) && panelAncho) panelAncho.hidden = true;
  });
  panelAncho?.querySelectorAll('[data-ancho]').forEach(boton => {
    boton.addEventListener('click', () => { if (inputAncho) inputAncho.value = boton.dataset.ancho; });
  });
  document.getElementById('rutaInterIzq')?.addEventListener('click', () => fijarIntermitente('izq'));
  document.getElementById('rutaInterDer')?.addEventListener('click', () => fijarIntermitente('der'));
  // Botón para detener la navegación (el panel de inicio está oculto).
  document.getElementById('rutaParar')?.addEventListener('click', () => {
    if (navegando) alternarNavegacion();
  });

  // Iniciar 3D automáticamente al iniciar navegación (salvo que ya esté AR).
  const _alternarNavOriginal = alternarNavegacion;
  alternarNavegacion = function() {
    _alternarNavOriginal();
    if (navegando) {
      if (!vista3dActiva && !vistaArActiva) setTimeout(() => { if (!vista3dActiva && !vistaArActiva) iniciar3d(); }, 300);
    } else {
      detener3d();
    }
  };

  // ------------------------------------------------------------ modo demo
  // Recorrido simulado sobre la ruta real para enseñar el navegador sin
  // circular. Se marca claramente como DEMO para no confundirlo con GPS.
  let demoActiva = false;
  let demoTimer = null;
  let demoIdx = 0;

  function alternarDemo() {
    if (demoActiva) { detenerDemo(); return; }
    const r = rutaActiva();
    if (!r || !r.geometry || r.geometry.length < 2) {
      avisar('Para la demo, calcula primero una ruta.', 'aviso', 5000);
      return;
    }
    demoActiva = true;
    demoIdx = 0;
    document.getElementById('rutaDemo')?.classList.add('activo');
    document.body.classList.add('ruta-demo');
    if (!navegando) alternarNavegacion();
    avisar('MODO DEMO: recorrido simulado, no es tu posición real.', 'aviso', 7000);
    decir('Modo demostración. Recorrido simulado.');
    demoTimer = setInterval(() => {
      const rr = rutaActiva();
      if (!rr || !rr.geometry || rr.geometry.length < 2) { detenerDemo(); return; }
      demoIdx = (demoIdx + 2) % rr.geometry.length;
      const [lat, lon] = rr.geometry[demoIdx];
      velocidad = 38 + (demoIdx % 34);
      ultimaPos = { lat, lon };
      ultimaVez = Date.now();
      if (!yo && mapa) {
        yo = L.marker([lat, lon], { icon: iconoYo(), zIndexOffset: 500 }).addTo(mapa);
        mapa.setView([lat, lon], 16);
      } else if (yo) {
        yo.setLatLng([lat, lon]);
      }
      if (mapa) {
        const z = zoomPorVelocidad(velocidad);
        const px = mapa.latLngToContainerPoint([lat, lon]);
        const target = mapa.containerPointToLatLng([px.x, px.y + mapa.getSize().y * 0.4]);
        mapa.setView(target, z, { animate: true, duration: 0.4 });
      }
      try { seguirRuta(lat, lon); } catch (_e) { /* nada */ }
      if (vista3dActiva) {
        scrollOffset3d += velocidad / 3.6 * 0.1;
        if (scrollOffset3d > 1) scrollOffset3d -= 1;
      }
    }, 900);
  }

  function detenerDemo() {
    demoActiva = false;
    if (demoTimer) clearInterval(demoTimer);
    demoTimer = null;
    document.getElementById('rutaDemo')?.classList.remove('activo');
    document.body.classList.remove('ruta-demo');
    avisar('Modo demo detenido.', 'info', 3000);
  }

  document.getElementById('rutaDemo')?.addEventListener('click', alternarDemo);

  function vigilarAvisos(lat, lon) {
    if (!capaAvisos) return;
    const pendientes = avisos.filter(a => !avisados.has(a.id));
    for (const a of pendientes) {
      const d = distancia(lat, lon, a.lat, a.lon);
      const radio = a.kind === 'radar' ? 700 : (RADIO_AVISO[a.kind] || 450);
      if (d > radio) continue;
      // Con ruta activa solo se avisa de lo que está en el corredor de la ruta.
      if (navegando && rutaActiva() && distanciaPuntoARuta(a.lat, a.lon) > 160) continue;
      avisados.add(a.id);
      const texto = a.kind === 'radar'
        ? `Radar a ${metros(d)}${a.maxspeed ? `, límite ${a.maxspeed}` : ''}`
        : `${a.label} a ${metros(d)}`;
      avisar(texto, a.kind === 'radar' ? 'radar' : 'aviso', 9000);
      // Sin navegación activa no se habla ni se pita: solo se deja el cartel,
      // para no interrumpir al que está consultando el mapa parado.
      if (navegando) {
        pitido(a.kind === 'radar' ? 980 : 700);
        try { navigator.vibrate?.([60, 40, 60]); } catch (_e) {}
        decir(texto);
      }
    }
  }

  // ------------------------------------------------------------ OBD conectado
  function leerOBD() {
    try { return JSON.parse(localStorage.getItem(CLAVE_OBD) || 'null'); } catch (_e) { return null; }
  }

  function gravedad(codigo) {
    const c = String(codigo).toUpperCase();
    if (/^P0(1|2|3|5|6|7|8)/.test(c)) return 'alta';
    if (/^P0(4|9)|^P2/.test(c)) return 'media';
    if (/^U|^B/.test(c)) return 'baja';
    return 'media';
  }

  function revisarOBD(primera = false) {
    const datos = leerOBD();
    const lista = Array.isArray(datos?.dtcs) ? datos.dtcs : [];
    if (!lista.length) return;
    const nuevos = lista.filter(c => !codigosOBD.has(c));
    lista.forEach(c => codigosOBD.add(c));
    if (!nuevos.length) return;
    const graves = nuevos.filter(c => gravedad(c) === 'alta');
    const texto = nuevos.length === 1
      ? `Nueva avería detectada: ${nuevos[0]}`
      : `Nuevas averías detectadas: ${nuevos.join(', ')}`;
    avisar(`${texto}${graves.length ? ' · gravedad alta, revisa el motor' : ' · revisa cuando puedas'}`, graves.length ? 'radar' : 'aviso', 12000);
    pitido(graves.length ? 1200 : 620);
    decir(`${texto}. ${graves.length ? 'Gravedad alta. Reduce la marcha y revisa el motor.' : 'No es urgente.'}`);
    if (!primera && window.MayaHablar) {
      // Deja rastro para el chat: la IA verá el código la próxima vez.
      try { window.dispatchEvent(new CustomEvent('ruta:obd', { detail: { dtcs: nuevos } })); } catch (_e) {}
    }
  }

  // ------------------------------------------------------------ voz
  // Copiloto: destino dicho por voz -> se confirma antes de arrancar.
  let pendienteDestino = null;
  let esperandoSi = false;

  async function prepararDestinoVoz(q) {
    const consulta = String(q || '').trim();
    if (consulta.length < 3) { avisar('¿A dónde quieres ir?', 'info', 5000); return; }
    try {
      const r = await fetch(`/api/ruta/geocode?q=${encodeURIComponent(consulta)}`);
      const datos = await r.json();
      const primero = datos?.results?.[0];
      if (!primero) {
        avisar('No encuentro ese sitio. ¿Puedes repetirlo?', 'aviso', 6000);
        decir('No encuentro ese sitio. ¿Puedes repetirlo?');
        return;
      }
      pendienteDestino = primero;
      esperandoSi = true;
      avisar(`He encontrado ${primero.name}. ¿Iniciamos la navegación?`, 'ok', 9000);
      decir(`He encontrado ${primero.name}. ¿Iniciamos la navegación?`);
    } catch (_e) {
      avisar('No pude buscar el destino ahora mismo.', 'aviso', 5000);
    }
  }

  async function iniciarPendiente() {
    if (!pendienteDestino) return;
    const d = pendienteDestino;
    pendienteDestino = null;
    await fijarDestino(d.lat, d.lon, d.name);
    if (rutaActiva() && !navegando) alternarNavegacion();
    decir('Vamos allá.');
  }

  function resumenRuta() {
    const r = rutaActiva();
    if (!r) { decir('No hay una ruta activa.'); return null; }
    const resta = restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0);
    const min = Math.round((r.duration || 0) / 60);
    const s = r.steps?.[paso];
    const texto = `Quedan ${resta > 1000 ? `${(resta / 1000).toFixed(1)} kilómetros` : `${Math.round(resta)} metros`} y unos ${min} minutos.${s ? ` ${instruccion(s)}.` : ''}`;
    decir(texto);
    avisar(texto, 'info', 7000);
    return { resta, min };
  }

  function repetirInstruccion() {
    const s = rutaActiva()?.steps?.[paso];
    if (s) decir(instruccion(s));
    return Boolean(s);
  }

  function dictarDestino() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { avisar('Este navegador no permite dictar. Escribe el destino.', 'aviso', 6000); return; }
    if (reconocimiento) { try { reconocimiento.stop(); } catch (_e) {} reconocimiento = null; }
    reconocimiento = new SR();
    reconocimiento.lang = 'es-ES';
    reconocimiento.interimResults = false;
    reconocimiento.maxAlternatives = 1;
    avisar('Te escucho… di el destino o «nos vamos».', 'info', 7000);
    reconocimiento.onresult = async event => {
      const dicho = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (!dicho) return;
      const t = dicho.toLowerCase();

      // 1) Confirmación de destino pendiente.
      if (esperandoSi) {
        if (/(^|\b)(s[ií]|vale|dale|vamos|arranca|inicia|de acuerdo|ok|adelante)\b/i.test(t)) {
          esperandoSi = false;
          await iniciarPendiente();
          return;
        }
        if (/(^|\b)(no|cancela|para|espera|d[eé]jalo)\b/i.test(t)) {
          esperandoSi = false;
          pendienteDestino = null;
          avisar('Vale, no iniciamos la ruta.', 'info', 4000);
          decir('Vale, no iniciamos la ruta.');
          return;
        }
      }

      // 2) Cambios de modo por voz.
      if (/modo\s+(c[aá]mara|ar|realidad)/i.test(t)) { if (!vistaArActiva) iniciarAr(); return; }
      if (/modo\s+(3d|tres d)|mapa\s+3d/i.test(t)) { if (!vista3dActiva) iniciar3d(); return; }
      if (/mapa\s+(2d|normal|cl[aá]sico)|vista\s+mapa/i.test(t)) {
        if (vistaArActiva) detenerAr();
        if (vista3dActiva) detener3d();
        decir('Mapa normal.');
        return;
      }

      // 3) Repetir / resumen / detener.
      if (/repite|repetir|otra vez/i.test(t)) { repetirInstruccion(); return; }
      if (/qu[eé] falta|c[oó]mo voy|estado|c[oó]mo vamos|cu[aá]nto queda/i.test(t)) { resumenRuta(); return; }
      if (/det[eé]n|para(r)?\s+(la\s+)?navegaci[oó]n|stop/i.test(t) && navegando) { alternarNavegacion(); return; }

      // 4) Arrancar si ya hay ruta.
      if (/nos vamos|vamos|arranca|inicia|salimos/i.test(t) && rutaActiva()) { alternarNavegacion(); return; }

      // 5) Si no, se interpreta como destino y se pide confirmación.
      const limpio = dicho.replace(/^(ll[eé]vame|llevar|ir|ve|vamos|ruta|quiero ir)\s+(a|hacia|para|al|a la)?\s*/i, '').trim();
      elDestino.value = limpio || dicho;
      prepararDestinoVoz(limpio || dicho);
    };
    reconocimiento.onerror = () => avisar('No te he oído. Prueba otra vez.', 'aviso', 5000);
    reconocimiento.onend = () => { reconocimiento = null; };
    try { reconocimiento.start(); } catch (_e) { avisar('No se pudo abrir el micrófono.', 'aviso', 5000); }
  }

  // ------------------------------------------------- avisos de la comunidad
  function popupAviso(a) {
    const comunidad = a.origen === 'comunidad';
    const edad = a.creado ? hace(Date.now() - a.creado) : '';
    return `<div class="ruta-popup">
      <b>${a.label || 'Aviso'}${a.maxspeed ? ` · ${a.maxspeed}` : ''}</b>
      ${a.name ? `<small>${a.name}</small>` : ''}
      <small>${comunidad ? 'Aviso de usuario, sin verificar' : 'OpenStreetMap'}${edad ? ` · ${edad}` : ''}</small>
      ${comunidad ? `<button type="button" class="ruta-confirmar" data-confirmar="${a.id}">Sigue ahí (${a.confirmaciones || 1})</button>` : ''}
    </div>`;
  }

  function pintarAviso(a) {
    if (!capaAvisos) return null;
    return L.marker([a.lat, a.lon], { icon: iconoAviso(a), title: a.label || 'Aviso' })
      .bindPopup(popupAviso(a))
      .addTo(capaAvisos);
  }

  function montarReporte() {
    const hud = view.querySelector('.ruta-hud');
    if (!hud || hud.querySelector('#rutaReportar')) return;
    const boton = document.createElement('button');
    boton.id = 'rutaReportar';
    boton.type = 'button';
    boton.className = 'ruta-fab ruta-fab-reportar';
    boton.textContent = '⚠';
    boton.title = 'Reportar una incidencia';
    boton.setAttribute('aria-label', 'Reportar una incidencia en la vía');
    hud.appendChild(boton);

    const hoja = document.createElement('div');
    hoja.id = 'rutaReporte';
    hoja.className = 'ruta-reporte';
    hoja.hidden = true;
    hoja.setAttribute('role', 'dialog');
    hoja.setAttribute('aria-label', 'Reportar incidencia');
    hoja.innerHTML = '<p>¿Qué hay en la vía?</p>' +
      TIPOS_REPORTE.map(([kind, ico, txt]) =>
        `<button type="button" data-reportar="${kind}"><span>${ico}</span>${txt}</button>`).join('') +
      '<button type="button" class="cerrar" data-cerrar-reporte="1">✕ Cerrar</button>';
    hud.appendChild(hoja);

    boton.addEventListener('click', () => { hoja.hidden = !hoja.hidden; });
    hoja.addEventListener('click', ev => {
      if (ev.target.closest('[data-cerrar-reporte]')) { hoja.hidden = true; return; }
      const b = ev.target.closest('[data-reportar]');
      if (b) reportar(b.dataset.reportar);
    });
    // Cerrar al tocar fuera del panel.
    document.addEventListener('click', ev => {
      if (hoja.hidden) return;
      if (!hoja.contains(ev.target) && ev.target !== boton) {
        hoja.hidden = true;
      }
    });
  }

  async function reportar(kind) {
    const hoja = view.querySelector('#rutaReporte');
    if (!ultimaPos) {
      avisar('Esperando al GPS: sin tu posición no puedo situar el aviso.', 'aviso', 6000);
      return;
    }
    try {
      const r = await fetch('/api/ruta/avisos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, lat: ultimaPos.lat, lon: ultimaPos.lon })
      });
      const datos = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(datos.error || 'No se pudo enviar el aviso');
      avisos = [datos.aviso, ...avisos];
      pintarAviso(datos.aviso);
      if (hoja) hoja.hidden = true;
      avisar('Aviso enviado. Gracias: ayuda a los que vienen detrás.', 'ok', 6000);
      if (navegando) decir('Aviso enviado');
    } catch (err) {
      avisar(err.message || 'No se pudo enviar el aviso.', 'aviso', 6000);
    }
  }

  view.addEventListener('click', async ev => {
    const btn = ev.target.closest('[data-confirmar]');
    if (!btn) return;
    try {
      const r = await fetch(`/api/ruta/avisos/${encodeURIComponent(btn.dataset.confirmar)}/confirmar`, { method: 'POST' });
      if (!r.ok) throw new Error('inactivo');
      const datos = await r.json();
      btn.textContent = `Sigue ahí (${datos.aviso.confirmaciones})`;
      btn.disabled = true;
      avisar('Gracias: aviso confirmado.', 'ok', 4000);
    } catch (_e) {
      btn.textContent = 'Ya no está activo';
      btn.disabled = true;
    }
  });

  montarReporte();

  // En pantalla completa, un botón pequeño para hablar con la IA sin salir
  // de la navegación: el GPS sigue avisando por voz en segundo plano.
  (function montarChat() {
    const hud = view.querySelector('.ruta-hud');
    if (!hud || hud.querySelector('#rutaChat')) return;
    const boton = document.createElement('button');
    boton.id = 'rutaChat';
    boton.type = 'button';
    boton.className = 'ruta-fab ruta-fab-chat';
    boton.textContent = '💬';
    boton.title = 'Hablar con la IA sin salir de la navegación';
    boton.setAttribute('aria-label', boton.title);
    boton.addEventListener('click', () => { window.showView?.('chat'); window.MayaEscuchar?.(); });
    hud.appendChild(boton);
  })();

  // Botón de voz en el HUD, debajo del de reportar.
  (function montarVoz() {
    const hud = view.querySelector('.ruta-hud');
    if (!hud || hud.querySelector('#rutaVoz')) return;
    const boton = document.createElement('button');
    boton.id = 'rutaVoz';
    boton.type = 'button';
    boton.className = 'ruta-fab ruta-fab-voz';
    boton.addEventListener('click', alternarVoz);
    hud.appendChild(boton);
    try { vozActiva = localStorage.getItem(CLAVE_VOZ) !== '0'; } catch (_e) { vozActiva = true; }
    pintarBotonVoz(vozActiva);
  })();

  // Brújula: gira el mapa al rumbo del coche o lo devuelve al norte.
  (function montarBrujula() {
    const hud = view.querySelector('.ruta-hud');
    if (!hud) return;
    elBrujula = hud.querySelector('#rutaBrujula');
    if (!elBrujula) {
      elBrujula = document.createElement('button');
      elBrujula.id = 'rutaBrujula';
      elBrujula.type = 'button';
      elBrujula.className = 'ruta-fab ruta-fab-brujula';
      elBrujula.innerHTML = '<span class="ruta-aguja"><svg viewBox="0 0 24 24" aria-hidden="true">'
        + '<path d="M12 2.4 16.6 12.2 12 10.3 7.4 12.2Z" fill="#38e1ff"/>'
        + '<path d="M12 21.6 7.4 11.8 12 13.7l4.6-1.9Z" fill="#7b8ea8"/></svg></span><small>N</small>';
      elBrujula.addEventListener('click', alternarRumbo);
      hud.appendChild(elBrujula);
    }
    try { rumboAuto = localStorage.getItem(CLAVE_RUMBO) !== '0'; } catch (_e) { rumboAuto = true; }
    pintarBrujula();
  })();

  // Panel de rotación manual: girar el mapa 90° izquierda/derecha + reset.
  (function montarRotacionManual() {
    const hud = view.querySelector('.ruta-hud');
    if (!hud) return;
    const panel = document.createElement('div');
    panel.className = 'ruta-rotacion-panel';
    panel.innerHTML =
      '<button class="ruta-rotacion-btn" id="rutaGirarIzq" title="Girar mapa 90° a la izquierda" aria-label="Girar 90° izquierda">↺</button>' +
      '<button class="ruta-rotacion-btn" id="rutaGirarDer" title="Girar mapa 90° a la derecha" aria-label="Girar 90° derecha">↻</button>' +
      '<button class="ruta-rotacion-btn" id="rutaResetGiro" title="Poner el norte arriba" aria-label="Resetear rotación">N</button>';
    hud.appendChild(panel);
    const izq = panel.querySelector('#rutaGirarIzq');
    const der = panel.querySelector('#rutaGirarDer');
    const reset = panel.querySelector('#rutaResetGiro');
    izq?.addEventListener('click', () => {
      if (!rotacion || !mapa?.setBearing) return;
      aplicarGiro(giro + 90);
      avisar('Mapa girado 90° a la izquierda', 'info', 1500);
    });
    der?.addEventListener('click', () => {
      if (!rotacion || !mapa?.setBearing) return;
      aplicarGiro(giro - 90);
      avisar('Mapa girado 90° a la derecha', 'info', 1500);
    });
    reset?.addEventListener('click', () => {
      if (!rotacion || !mapa?.setBearing) return;
      aplicarGiro(0, { inmediato: true });
      avisar('Norte arriba', 'info', 1500);
    });
  })();

  elMicro?.addEventListener('click', dictarDestino);
  $('#rutaMas')?.addEventListener('click', () => mapa?.zoomIn());
  $('#rutaMenos')?.addEventListener('click', () => mapa?.zoomOut());
  elNoche?.addEventListener('click', () => aplicarTema(!noche));

  // Pantalla completa: en el móvil, el mapa ocupa todo y desaparecen cabecera y
  // pie. Usa la API del navegador si existe y, si no, una capa fija propia.
  const elShell = view.querySelector('.ruta-shell');
  const elFull = $('#rutaFull');
  const elTrafico = $('#rutaTrafico');
  function pantallaCompletaActiva() {
    return Boolean(document.fullscreenElement || elShell?.classList.contains('ruta-completa'));
  }
  function pintarBotonFull(activa) {
    if (!elFull) return;
    elFull.setAttribute('aria-pressed', String(activa));
    elFull.setAttribute('aria-label', activa ? 'Salir de pantalla completa' : 'Pantalla completa');
    elFull.title = activa ? 'Salir de pantalla completa' : 'Pantalla completa';
    elFull.textContent = activa ? '⤢' : '⛶';
  }
  async function alternarPantallaCompleta() {
    const activa = pantallaCompletaActiva();
    if (activa) {
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch (_e) { /* ya salió */ }
      }
      elShell?.classList.remove('ruta-completa');
      document.body.classList.remove('ruta-pantalla-completa');
      pintarBotonFull(false);
      setTimeout(() => mapa?.invalidateSize(), 180);
      return;
    }
    // En Android el elemento raíz entra en pantalla completa; si el navegador
    // no lo permite (iOS antiguo), la clase fija hace lo mismo dentro de la app.
    if (elShell?.requestFullscreen) {
      try { await elShell.requestFullscreen({ navigationUI: 'hide' }); } catch (_e) { /* fallback */ }
    }
    elShell?.classList.add('ruta-completa');
    document.body.classList.add('ruta-pantalla-completa');
    pintarBotonFull(true);
    setTimeout(() => mapa?.invalidateSize(), 220);
  }
  elFull?.addEventListener('click', alternarPantallaCompleta);
  elTrafico?.addEventListener('click', () => {
    traficoActivo = !traficoActivo;
    elTrafico.setAttribute('aria-pressed', String(traficoActivo));
    elTrafico.classList.toggle('activo', traficoActivo);
    if (!traficoActivo) {
      capaTrafico?.clearLayers();
      avisar('Tráfico desactivado.', 'info', 2000);
    } else {
      avisar('Cargando tráfico en vivo…', 'info', 2000);
      actualizarTrafico();
    }
  });
  document.addEventListener('fullscreenchange', () => {
    const activa = Boolean(document.fullscreenElement);
    if (!activa && elShell?.classList.contains('ruta-completa') && !document.fullscreenElement) {
      // El usuario salió con el gesto del sistema: se limpia también la clase.
      elShell.classList.remove('ruta-completa');
      document.body.classList.remove('ruta-pantalla-completa');
    }
    pintarBotonFull(pantallaCompletaActiva());
    setTimeout(() => mapa?.invalidateSize(), 180);
  });
  elGps?.addEventListener('click', () => {
    siguiendo = true;
    if (!gpsIniciado) arrancarGps();
    if (ultimaPos) mapa?.setView([ultimaPos.lat, ultimaPos.lon], 16);
    else avisar('Esperando al GPS…', 'info', 4000);
  });

  // ------------------------------------------------------------ arranque
  function iniciarVista() {
    cuandoLeaflet(() => {
      initMapa();
      mapa?.invalidateSize();
      // El GPS se enciende al abrir la vista y no se vuelve a pedir en cada
      // visita: el reloj de posición sigue vivo mientras la app esté abierta.
      if (!gpsIniciado) arrancarGps();
      revisarOBD(true);
    });
  }

  document.addEventListener('viewchange', e => {
    document.body.classList.toggle('viendo-ruta', e.detail?.name === 'ruta');
    if (e.detail?.name !== 'ruta') return;
    iniciarVista();
    setTimeout(() => mapa?.invalidateSize(), 200);
  });

  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-home-ruta]')) {
      window.showView?.('ruta') || document.querySelector('[data-view="ruta"]')?.click();
    }
  });

  window.addEventListener('obd:dtcs', () => revisarOBD());
  setInterval(() => revisarOBD(), 45000);

  if (document.querySelector('.view.active')?.id === 'view-ruta') {
    document.body.classList.add('viendo-ruta');
    iniciarVista();
  }

  // La IA llama aquí cuando el usuario dice «llévame a...». Se busca el sitio,
  // se abre la ruta y se traza sola; si no se encuentra, se dice claro.
  async function irA(texto) {
    const q = String(texto || '').trim();
    window.showView?.('ruta');
    await new Promise(r => setTimeout(r, 500));
    cuandoLeaflet(async () => {
      initMapa();
      if (!gpsIniciado) arrancarGps();
      if (q.length < 3) { elDestino?.focus(); return; }
      elDestino.value = q;
      try {
        const r = await fetch(`/api/ruta/geocode?q=${encodeURIComponent(q)}`);
        const datos = await r.json();
        const primero = (datos.results || [])[0];
        if (!primero) { avisar(`No encuentro «${q}». Prueba con la calle y la ciudad.`, 'aviso', 8000); return; }
        fijarDestino(primero.lat, primero.lon, primero.name || q);
        decir(`Vamos a ${primero.name || q}`);
      } catch (_e) {
        avisar('No se pudo buscar ese destino. Revisa la conexión.', 'aviso', 6000);
      }
    });
  }

  window.Ruta = {
    ir: (lat, lon, nombre) => { window.showView?.('ruta'); setTimeout(() => fijarDestino(lat, lon, nombre), 700); },
    irA,
    // Control de navegación por voz/IA: arranca o detiene sin tocar botones.
    iniciarNavegacion: () => { if (!navegando) alternarNavegacion(); return navegando; },
    detenerNavegacion: () => { if (navegando) alternarNavegacion(); return navegando; },
    alternarNavegacion: () => { alternarNavegacion(); return navegando; },
    reportar: (kind) => reportar(kind),
    pantallaCompleta: () => alternarPantallaCompleta(),
    // Modos y copiloto para MAYA.
    modoAr: () => { if (!vistaArActiva) iniciarAr(); return vistaArActiva; },
    modo3d: () => { if (!vista3dActiva) iniciar3d(); return vista3dActiva; },
    modoMapa: () => { if (vistaArActiva) detenerAr(); if (vista3dActiva) detener3d(); return true; },
    repetir: () => repetirInstruccion(),
    resumen: () => resumenRuta(),
    confirmarDestino: () => { esperandoSi = false; iniciarPendiente(); return true; },
    cancelarDestino: () => { esperandoSi = false; pendienteDestino = null; return true; },
    demo: () => { alternarDemo(); return demoActiva; },
    calibrarAr: () => { calibrarAr(); return arSensoresOk; },
    calibrarAncho: (m) => calibrarAncho(m),
    anchoReal: () => anchoRealM,
    intermitente: (lado) => { if (lado === undefined) return intermitente; fijarIntermitente(lado); return intermitente; },
    carril: () => carrilInfo ? {
      conf: Number(carrilInfo.conf.toFixed(2)),
      offset: Number(carrilInfo.offset.toFixed(2)),
      desvio: Number((carrilInfo.offset - carrilBias).toFixed(2)),
      ancho: Number((carrilSuave?.ancho || 0).toFixed(2)),
      anchoRel: anchoRef && carrilSuave ? Number((carrilSuave.ancho / anchoRef).toFixed(2)) : 1,
      anchoM: anchoRef && carrilSuave ? Number(((carrilSuave.ancho * anchoRealM) / anchoRef).toFixed(1)) : 0,
      anchoCalibrado,
      curv: Number((carrilSuave?.curv || 0).toFixed(2))
    } : null,
    // Para pruebas y para Maya: fuerza o consulta la voz sin tocar la UI.
    voz: (activa) => { if (typeof activa === 'boolean' && activa !== vozActiva) alternarVoz(); return vozActiva; },
    incidencias: () => avisos.filter(a => a.origen === 'comunidad'),
    // Giro del mapa: sin argumento consulta; con grados lo fija a mano.
    rumbo: (grados) => {
      if (typeof grados === 'number' && rotacion) {
        rumboAuto = false;
        aplicarGiro(grados, { inmediato: true });
        pintarBrujula();
      }
      return {
        soportado: Boolean(rotacion),
        auto: rumboAuto,
        grados: mapa ? Number(mapa.getBearing().toFixed(1)) : 0
      };
    },
    // Autochequeo: con el mapa girado, el centro de la pantalla tiene que
    // seguir correspondiendo al centro geográfico del mapa.
    // Referencia al mapa para pruebas y depuración.
    mapa: () => mapa,
    pruebaGiro: () => {
      if (!mapa) return null;
      const c = mapa.getCenter();
      const p = mapa.containerPointToLatLng(mapa.getSize().divideBy(2));
      return { errorMetros: Math.round(distancia(c.lat, c.lng, p.lat, p.lng)) };
    },
    // Estado mínimo para que Maya sepa dónde está el coche y adónde va.
    // Sin datos de GPS no devuelve posición inventada.
    estado: () => ({
      posicion: ultimaPos ? { lat: Number(ultimaPos.lat.toFixed(5)), lon: Number(ultimaPos.lon.toFixed(5)) } : null,
      destino: destinoCoord ? { lat: Number(destinoCoord.lat.toFixed(5)), lon: Number(destinoCoord.lon.toFixed(5)), nombre: nombreDestino || '' } : null,
      navegando: Boolean(navegando)
    })
  };
})();
