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
    if (navegando) {
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
    }
    pintarPanel();
    pintarBanner(rutaActiva(), paso);
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

  // ============================================================
  // GPS 3D · Vista de conducción inmersiva (pseudo-3D)
  // ============================================================
  let vista3dActiva = false;
  let animacion3d = null;
  let canvas3d = null;
  let ctx3d = null;
  let carretera3d = [];
  let progreso3d = 0;
  let signos3d = [];
  let imagenCoche3d = null;
  // Cargar la imagen del coche GT4
  imagenCoche3d = new Image();
  imagenCoche3d.src = '/img/hero/golf-hero.webp';

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

  function dibujar3d() {
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
      const scale = 1 - z * 0.7;
      const y = horizonte + (h - horizonte) * (1 - z) * 0.6;
      const signW = 120 * scale;
      const signH = 60 * scale;
      const x = cx + (s.modifier === 'right' ? 80 : s.modifier === 'left' ? -80 : 0) * scale;
      // Fondo del cartel
      ctx3d.fillStyle = 'rgba(10, 16, 30, .9)';
      ctx3d.fillRect(x - signW / 2, y - signH / 2, signW, signH);
      ctx3d.strokeStyle = s.exit ? '#22d3ee' : '#f0f8ff';
      ctx3d.lineWidth = 2 * scale;
      ctx3d.strokeRect(x - signW / 2, y - signH / 2, signW, signH);
      // Texto
      ctx3d.fillStyle = '#f0f8ff';
      ctx3d.font = `bold ${Math.round(12 * scale)}px sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      const lineas = s.texto.split(' ').slice(0, 3).join(' ');
      ctx3d.fillText(lineas, x, y);
      if (s.exit) {
        ctx3d.fillStyle = '#22d3ee';
        ctx3d.font = `bold ${Math.round(10 * scale)}px sans-serif`;
        ctx3d.fillText('TOMAR ESTA SALIDA', x, y + 14 * scale);
      }
    }
  }

  function dibujarCoche3d(w, h) {
    const carW = 90, carH = 120;
    const cx = w / 2, cy = h - 150;
    // Sombra
    ctx3d.fillStyle = 'rgba(0, 0, 0, .6)';
    ctx3d.beginPath();
    ctx3d.ellipse(cx, cy + carH / 2 + 8, carW / 2 + 8, 10, 0, 0, Math.PI * 2);
    ctx3d.fill();
    // Glow bajo el coche
    const glow = ctx3d.createRadialGradient(cx, cy + carH / 2, 0, cx, cy + carH / 2, carW);
    glow.addColorStop(0, 'rgba(34, 211, 238, .4)');
    glow.addColorStop(1, 'rgba(34, 211, 238, 0)');
    ctx3d.fillStyle = glow;
    ctx3d.fillRect(cx - carW, cy - carH / 2, carW * 2, carH * 2);
    // Coche (imagen real del GT4)
    if (imagenCoche3d && imagenCoche3d.complete) {
      ctx3d.drawImage(imagenCoche3d, cx - carW / 2, cy - carH / 2, carW, carH);
    } else {
      // Fallback: coche dibujado
      ctx3d.fillStyle = '#eaf7ff';
      ctx3d.beginPath();
      ctx3d.roundRect(cx - carW / 2, cy - carH / 2, carW, carH, 12);
      ctx3d.fill();
      ctx3d.fillStyle = '#38e1ff';
      ctx3d.fillRect(cx - carW / 2 + 10, cy - carH / 2 + 15, carW - 20, 25);
    }
    // Luces traseras (glow rojo)
    ctx3d.fillStyle = 'rgba(255, 77, 109, .8)';
    ctx3d.shadowColor = '#ff4d6d';
    ctx3d.shadowBlur = 15;
    ctx3d.fillRect(cx - carW / 2 + 6, cy + carH / 2 - 12, 10, 5);
    ctx3d.fillRect(cx + carW / 2 - 16, cy + carH / 2 - 12, 10, 5);
    ctx3d.shadowBlur = 0;
  }

  function dibujarHud3d(w, h) {
    // Velocidad
    ctx3d.fillStyle = 'rgba(10, 16, 30, .8)';
    ctx3d.fillRect(10, 10, 80, 40);
    ctx3d.fillStyle = '#22d3ee';
    ctx3d.font = 'bold 24px sans-serif';
    ctx3d.textAlign = 'left';
    ctx3d.fillText(`${Math.round(velocidad)}`, 20, 38);
    ctx3d.fillStyle = '#f0f8ff';
    ctx3d.font = '10px sans-serif';
    ctx3d.fillText('KM/H', 55, 38);
    // Distancia restante
    const ruta = rutaActiva();
    if (ruta) {
      const rest = restante(ultimaPos?.lat || 0, ultimaPos?.lon || 0);
      ctx3d.fillStyle = 'rgba(10, 16, 30, .8)';
      ctx3d.fillRect(w - 120, 10, 110, 40);
      ctx3d.fillStyle = '#f0f8ff';
      ctx3d.font = 'bold 14px sans-serif';
      ctx3d.textAlign = 'right';
      ctx3d.fillText(rest > 1000 ? `${(rest/1000).toFixed(1)} km` : `${rest} m`, w - 20, 28);
      ctx3d.font = '10px sans-serif';
      ctx3d.fillText(ruta.duration ? `${Math.round(ruta.duration/60)} min` : '', w - 20, 42);
    }
  }

  function iniciar3d() {
    if (!init3d()) return;
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

  // Iniciar 3D automáticamente al iniciar navegación
  const _alternarNavOriginal = alternarNavegacion;
  alternarNavegacion = function() {
    _alternarNavOriginal();
    if (navegando) {
      // Iniciar 3D automáticamente
      setTimeout(() => { if (!vista3dActiva) iniciar3d(); }, 300);
    } else {
      detener3d();
    }
  };

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
  function dictarDestino() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { avisar('Este navegador no permite dictar. Escribe el destino.', 'aviso', 6000); return; }
    if (reconocimiento) { try { reconocimiento.stop(); } catch (_e) {} reconocimiento = null; }
    reconocimiento = new SR();
    reconocimiento.lang = 'es-ES';
    reconocimiento.interimResults = false;
    reconocimiento.maxAlternatives = 1;
    avisar('Te escucho… di el destino o «nos vamos».', 'info', 7000);
    reconocimiento.onresult = event => {
      const dicho = String(event.results?.[0]?.[0]?.transcript || '').trim();
      if (!dicho) return;
      if (/nos vamos|vamos|arranca|inicia/i.test(dicho) && rutaActiva()) { alternarNavegacion(); return; }
      const limpio = dicho.replace(/^(ll[eé]vame|llevar|ir|ve|vamos|ruta)\s+(a|hacia|para)?\s*/i, '').trim();
      elDestino.value = limpio || dicho;
      buscar(elDestino.value);
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
