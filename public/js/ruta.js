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

  function alMover(pos, esRespaldo = false) {
    const { latitude: lat, longitude: lon, accuracy, speed, heading } = pos.coords;
    const ahora = Date.now();
    // Si llega un fix real, el aviso de «sin señal» deja de ser cierto.
    if (!esRespaldo && elAviso && !elAviso.hidden && /^Sin señal GPS/.test(elAviso.textContent)) elAviso.hidden = true;
    // Filtro de jitter: a baja velocidad se ignoran microsaltos del GPS.
    if (ultimaPos) {
      const salto = distancia(ultimaPos.lat, ultimaPos.lon, lat, lon);
      const dtSalto = (ahora - (ultimaVez || ahora)) / 1000;
      const velMs = Number.isFinite(speed) && speed !== null ? speed : 0;
      if (yo && salto < 1.5 && velMs < 1.2 && dtSalto < 4) return;
    }
    if (ultimaPos) {
      if (Number.isFinite(heading) && heading !== null) rumbo = heading;
      else if (distancia(ultimaPos.lat, ultimaPos.lon, lat, lon) > 4) rumbo = rumboEntre(ultimaPos, { lat, lon });
    }
    // Suavizado: el GPS de móvil salta varios km/h entre fixes. Se acerca al
    // valor nuevo sin copiarlo de golpe, pero reacciona rápido si el cambio
    // es grande (frenada o incorporación a autovía).
    let velocidadObjetivo = null;
    if (Number.isFinite(speed) && speed !== null) velocidadObjetivo = Math.max(0, speed * 3.6);
    else if (ultimaPos && ultimaVez) {
      const dt = (ahora - ultimaVez) / 1000;
      const salto = distancia(ultimaPos.lat, ultimaPos.lon, lat, lon);
      const calculada = salto / dt * 3.6;
      // Un salto de cientos de metros entre dos fixes no es velocidad real:
      // suele ser el GPS recolocándose o un túnel. Se descarta el pico.
      if (dt > .8 && !(dt < 4 && salto > 220) && calculada < 260) velocidadObjetivo = Math.max(0, calculada);
    }
    if (velocidadObjetivo !== null) {
      const saltoVel = Math.abs(velocidadObjetivo - velocidad);
      const factorVel = saltoVel > 25 ? 0.65 : 0.3;
      velocidad += (velocidadObjetivo - velocidad) * factorVel;
      if (velocidadObjetivo < 1 && velocidad < 1.5) velocidad = 0;
      if (velocidad > 260) velocidad = 260;
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
    // Si ya hay una posición, un error suelto del GPS (un túnel, el primer
    // fix del arranque) no debe pedir permisos que ya están dados.
    if (ultimaPos) return;
    if (err && err.code === 1) {
      navigator.permissions?.query?.({ name: 'geolocation' })
        .then(p => {
          avisar(p.state === 'granted'
            ? 'GPS sin señal. Sal al exterior y espera unos segundos.'
            : 'Dale permiso de ubicación al navegador para ver dónde estás.', 'aviso', 8000);
        })
        .catch(() => avisar('No se pudo leer el GPS. Sal al exterior y vuelve a intentarlo.', 'aviso', 8000));
      return;
    }
    avisar('No se pudo leer el GPS. Sal al exterior y vuelve a intentarlo.', 'aviso', 8000);
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
            alMover({ coords: { latitude: guardada.lat, longitude: guardada.lon, accuracy: null, speed: null, heading: null } }, true);
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
    // Los resultados mandan: ni recientes ni alertas deben quedar encima.
    const recientes = view.querySelector('#rutaRecientes');
    if (recientes) recientes.hidden = true;
    if (elAviso) elAviso.hidden = true;
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
    // Al conducir no se muestran recientes: tapaban la tarjeta de maniobra.
    if (navegando) { box.hidden = true; box.innerHTML = ''; return; }
    const lista = leerRecientes();
    if (!lista.length) { box.hidden = true; box.innerHTML = ''; return; }
    box.hidden = false;
    box.innerHTML = '<span class="ruta-recientes-titulo">Recientes</span>' +
      lista.map(r => `<button type="button" class="ruta-reciente" data-lat="${r.lat}" data-lon="${r.lon}" data-nombre="${String(r.nombre).replace(/"/g, '&quot;')}">${r.nombre}</button>`).join('');
    box.querySelectorAll('[data-lat]').forEach(b => {
      b.addEventListener('click', async () => {
        elDestino.value = b.dataset.nombre;
        await fijarDestino(Number(b.dataset.lat), Number(b.dataset.lon), b.dataset.nombre);
        if (rutaActiva() && (vistaArActiva || vista3dActiva) && !navegando) alternarNavegacion();
      });
    });
  }
  pintarRecientes();

  elBuscar?.addEventListener('submit', e => { e.preventDefault(); buscar(elDestino.value); });
  elDestino?.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    if (elDestino.value.trim().length < 3) { elResultados.hidden = true; pintarRecientes(); return; }
    temporizadorBusqueda = setTimeout(() => buscar(elDestino.value), 550);
  });
  elResultados?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-lat]');
    if (!btn) return;
    elResultados.hidden = true;
    const nombre = btn.dataset.nombre || 'Destino';
    elDestino.value = nombre;
    await fijarDestino(Number(btn.dataset.lat), Number(btn.dataset.lon), nombre);
    // En cámara/3D, elegir destino arranca la guía sin un segundo toque.
    if (rutaActiva() && (vistaArActiva || vista3dActiva) && !navegando) alternarNavegacion();
  });

  // ------------------------------------------------------------ ruta
  // Espera a tener una posición real antes de calcular. Si se pide una ruta
  // nada más abrir la vista, el GPS todavía no ha fijado y usar el centro del
  // mapa mandaba al usuario a una ruta de cientos de kilómetros.
  async function esperarPosicion(ms = 9000) {
    if (ultimaPos) return ultimaPos;
    if (!gpsIniciado) arrancarGps();
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      await new Promise(r => setTimeout(r, 250));
      if (ultimaPos) return ultimaPos;
    }
    return null;
  }

  async function fijarDestino(lat, lon, nombre = '') {
    if (!mapa) return;
    nombreDestino = nombre || nombreDestino || 'Destino';
    destinoCoord = { lat, lon };
    gasolineras3d = [];
    gasolinerasError = '';
    panelGas3d = false;
    panelAvisos3d = false;
    guardarReciente(nombre, lat, lon);
    const recientes = view.querySelector('#rutaRecientes');
    if (recientes) recientes.hidden = true;
    fueraRuta = 0;
    if (destino) mapa.removeLayer(destino);
    destino = L.marker([lat, lon], { icon: iconoDestino() }).addTo(mapa);

    elPanel.hidden = false;
    elPanel.innerHTML = '<div class="ruta-calc"><i></i><span>Buscando tu posición…</span></div>';
    const pos = await esperarPosicion();
    const desde = pos || { lat: mapa.getCenter().lat, lon: mapa.getCenter().lng };
    if (!pos) avisar('Sin GPS: la ruta se calcula desde el centro del mapa.', 'aviso', 7000);
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

  // Tiempo que queda, no la duración completa del viaje. Se usa en los HUD de
  // 3D y ADAS para que minutos y hora de llegada no se contradigan.
  function segundosRestantesRuta(ruta, rest) {
    if (!ruta?.duration) return 0;
    if (!ruta.distance) return ruta.duration;
    return ruta.duration * Math.min(1, Math.max(0, rest) / ruta.distance);
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
      // El buscador sigue disponible, pero sus listas no deben tapar el HUD.
      elResultados.hidden = true;
      const recientesNav = view.querySelector('#rutaRecientes');
      if (recientesNav) { recientesNav.hidden = true; recientesNav.innerHTML = ''; }
      elDestino?.blur();
      elShell?.classList.add('ruta-completa');
      document.body.classList.add('ruta-pantalla-completa');
      if (elShell?.requestFullscreen && !document.fullscreenElement) {
        try { elShell.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_e) { /* fallback: clase fija */ }
      }
      siguiendo = true;
      paso = 0;
      // OSRM entrega un primer paso "depart" en el punto de salida. Si se deja
      // como paso activo, al alejarse del origen ya nunca se alcanza y la
      // navegación se queda mostrando ese paso para siempre.
      const rutaNav = rutaActiva();
      if (rutaNav?.steps?.[0]?.type === 'depart' && rutaNav.steps.length > 1) paso = 1;
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
    const s = ruta.steps[paso];
    // `paso` apunta a la próxima maniobra. Su `distance` es el tramo que viene
    // después de esa maniobra, no lo que falta hasta ella: sumarla otra vez
    // hacía que la ETA creciera al acercarse al cruce.
    let total = s && Number.isFinite(s.lat) ? distancia(lat, lon, s.lat, s.lon) : 0;
    for (let i = paso + 1; i < ruta.steps.length; i += 1) total += ruta.steps[i].distance || 0;
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
    recalculando = true;
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
    } finally {
      recalculando = false;
    }
  }

  function indicePuntoRuta3d(lat, lon) {
    const pts = rutaActiva()?.geometry || [];
    let mejor = 0;
    let dMejor = Infinity;
    for (let i = 0; i < pts.length; i += 1) {
      const d = distancia(lat, lon, pts[i][0], pts[i][1]);
      if (d < dMejor) { dMejor = d; mejor = i; }
    }
    return mejor;
  }

  function seguirRuta(lat, lon) {
    const ruta = rutaActiva();
    let s = ruta?.steps[paso];
    if (!s) return;
    // También cubre el recalculo: si vuelve a aparecer "depart", se salta.
    if (navegando && s.type === 'depart' && paso < ruta.steps.length - 1) {
      paso += 1;
      s = ruta.steps[paso];
    }
    // Un salto de GPS puede dejar varias maniobras atrás. Se avanzan las que
    // ya quedaron detrás de la posición actual para que el ETA no cuente el
    // camino de vuelta al cruce perdido.
    if (navegando) {
      const idxActual = indicePuntoRuta3d(lat, lon);
      while (paso < ruta.steps.length - 1) {
        const proximo = ruta.steps[paso];
        if (!Number.isFinite(proximo.lat)) break;
        const idxProximo = indicePuntoRuta3d(proximo.lat, proximo.lon);
        if (idxProximo <= idxActual - 1 && distancia(lat, lon, proximo.lat, proximo.lon) > 30) {
          paso += 1;
          s = ruta.steps[paso];
        } else {
          break;
        }
      }
    }
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
  let ultimoPintado3d = 0;
  let recalculando = false;
  let canvas3d = null;
  let ctx3d = null;
  let carretera3d = [];
  let firmaRuta3d = '';
  let idx3dSuave = null;
  let progreso3d = 0;
  let scrollOffset3d = 0;
  let zoomFondo3d = 1;
  let botones3d = [];

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

  // ============================================================
  // GPS 3D v2 · conducción procedural sobre la ruta real
  // Sin foto de fondo, sin cabina y sin cámara: todo se genera en canvas.
  // ============================================================
  let ultimoFrame3d = 0;
  let trazado3d = [];
  let modoNoche3d = false;
  let tipoVia3d = 'carretera';
  let tipoVia3dAnterior = '';
  let avisoTipoVia3dHasta = 0;
  let avisoToast3d = '';
  let avisoToast3dHasta = 0;
  let ultimoExceso3d = 0;
  let gasolineras3d = [];
  let gasolinerasCargando = false;
  let gasolinerasError = '';
  let panelGas3d = false;
  let panelAvisos3d = false;
  let gasolinerasGuardadas3d = null;
  let avisos3dGuardados = null;

  const CLAVE_GAS_3D = 'dm_ruta_gasolineras_guardadas';
  const CLAVE_AVISOS_3D = 'dm_ruta_avisos_guardados';

  function leerLista3d(clave) {
    try {
      const v = JSON.parse(localStorage.getItem(clave) || '[]');
      return Array.isArray(v) ? v : [];
    } catch (_e) { return []; }
  }

  function guardarLista3d(clave, lista) {
    try { localStorage.setItem(clave, JSON.stringify(Array.isArray(lista) ? lista.slice(0, 50) : [])); } catch (_e) { /* sin espacio */ }
  }

  function listaGasGuardadas3d() {
    if (!gasolinerasGuardadas3d) gasolinerasGuardadas3d = leerLista3d(CLAVE_GAS_3D);
    return gasolinerasGuardadas3d;
  }

  function listaAvisosGuardados3d() {
    if (!avisos3dGuardados) avisos3dGuardados = leerLista3d(CLAVE_AVISOS_3D);
    return avisos3dGuardados;
  }

  function textoCorto3d(texto, ancho) {
    let t = String(texto || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    if (ctx3d.measureText(t).width <= ancho) return t;
    while (t.length > 3 && ctx3d.measureText(`${t}…`).width > ancho) t = t.slice(0, -1);
    return `${t.trim()}…`;
  }

  function indiceActual3d() {
    if (!carretera3d.length) return 0;
    if (!ultimaPos) return 0;
    let mejor = 0;
    let dMejor = Infinity;
    for (let i = 0; i < carretera3d.length; i += 1) {
      const s = carretera3d[i];
      const d = distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon);
      if (d < dMejor) { dMejor = d; mejor = i; }
    }
    return mejor;
  }

  function curvaturaMedia3d(idx) {
    if (!carretera3d.length) return 0;
    let total = 0;
    let n = 0;
    for (let i = Math.max(1, idx); i < Math.min(carretera3d.length, idx + 22); i += 1) {
      total += Math.abs(carretera3d[i].curva || 0);
      n += 1;
    }
    return n ? total / n : 0;
  }

  function tipoVia3dActual(idx) {
    const ruta = rutaActiva();
    if (!ruta) return 'carretera';
    const s = ruta.steps?.[paso] || ruta.steps?.[0] || {};
    const ref = String(s.ref || '').toUpperCase().replace(/\s+/g, '');
    const nombre = String(`${s.name || ''} ${ruta.name || ''}`).toLowerCase();
    const kmh = ultimaPos ? Number(limiteActual(ultimaPos.lat, ultimaPos.lon)) || 0 : 0;
    const curva = curvaturaMedia3d(idx);
    if (/^(A|AP|E)-?\d/.test(ref) || /autov[ií]a|autopista|autopista|freeway|motorway/.test(nombre) || kmh >= 100) return 'autovia';
    if (/puerto|coll|sierra|monta[nñ]a|mirador|desfiladero/.test(nombre) || (curva > 9 && (!kmh || kmh <= 90))) return 'montana';
    if (kmh && kmh <= 50) return /avenida|plaza|paseo|ronda|granv[ií]a/.test(nombre) ? 'ciudad' : 'pueblo';
    if (/calle|avenida|plaza|paseo|ronda|traves[ií]a|urbano/.test(nombre)) return 'ciudad';
    if (/^(N|C)-?\d/.test(ref) || /comarcal|carretera/.test(nombre)) return 'comarcal';
    if (kmh <= 90) return 'carretera';
    return 'carretera';
  }

  function etiquetaTipoVia3d(tipo) {
    return ({
      autovia: 'AUTOVÍA',
      carretera: 'CARRETERA',
      comarcal: 'CARRETERA COMARCAL',
      montana: 'PUERTO DE MONTAÑA',
      pueblo: 'TRAVESÍA DE PUEBLO',
      ciudad: 'CASCO URBANO'
    })[tipo] || 'CARRETERA';
  }

  function puntoPorS3d(s) {
    if (!trazado3d.length) return null;
    let mejor = trazado3d[0];
    let dMejor = Infinity;
    for (const p of trazado3d) {
      const d = Math.abs((p.s || 0) - s);
      if (d < dMejor) { dMejor = d; mejor = p; }
    }
    return mejor;
  }

  function construirTrazado3d(idxBase, w, h, horizonte, cx) {
    const segs = carretera3d;
    const FOCAL = Math.max(300, w * 1.38) * zoomFondo3d;
    const anchoVia = tipoVia3d === 'autovia' ? 10.4 : tipoVia3d === 'ciudad' ? 7.2 : 8.2;
    const MAX = 260;
    const out = [];
    const proyectar = (s, latM) => {
      const persp = FOCAL / Math.max(1.8, s);
      const depth = Math.pow(Math.max(0, 1 - s / MAX), 1.35);
      const escala = Math.min(48, persp * (0.72 + 0.28 * depth));
      return {
        s,
        x: cx + latM * escala,
        y: horizonte + (h - horizonte) * depth,
        ancho: anchoVia * escala,
        escala,
        lat: latM
      };
    };
    if (!segs.length) {
      const lat0 = Math.sin(0.4) * 4;
      for (let s = 1.8; s <= MAX; s *= 1.055) {
        const lat = Math.sin(s * 0.010) * 3 + Math.sin(s * 0.0035 + 0.4) * 4 - lat0;
        out.push(proyectar(s, lat));
      }
      return out;
    }
    const base = segs[Math.max(0, Math.min(segs.length - 1, idxBase))];
    const h0 = (base.heading || 0) * Math.PI / 180;
    const cosLat = Math.cos(base.lat * Math.PI / 180);
    let ultimoAvance = 1.8;
    let cortar = false;
    const add = (lat, lon) => {
      const dx = (lon - base.lon) * 111320 * cosLat;
      const dy = (lat - base.lat) * 110540;
      const avance = dx * Math.sin(h0) + dy * Math.cos(h0);
      const lateral = dx * Math.cos(h0) - dy * Math.sin(h0);
      if (avance < 1.8) return;
      if (avance < ultimoAvance - 2) { cortar = true; return; }
      if (avance < ultimoAvance + 0.45) return;
      ultimoAvance = avance;
      out.push(proyectar(avance, lateral));
    };
    out.push(proyectar(1.8, 0));
    for (let i = idxBase; i < segs.length - 1 && ultimoAvance < MAX && !cortar; i += 1) {
      const a = segs[i];
      const b = segs[i + 1];
      const d = a.dist || 8;
      const pasos = Math.max(1, Math.min(14, Math.ceil(d / 3)));
      for (let k = 1; k <= pasos && ultimoAvance < MAX && !cortar; k += 1) {
        const t = k / pasos;
        add(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);
      }
    }
    for (let p = 0; p < 2; p += 1) {
      for (let i = 1; i < out.length - 1; i += 1) out[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4;
    }
    for (const p of out) {
      const k = Math.min(1, p.s / 32);
      p.x = cx + (p.x - cx) * k;
    }
    for (let p = 0; p < 3; p += 1) {
      for (let i = 1; i < out.length - 1; i += 1) out[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4;
    }
    return out;
  }

  function puntoTrazado3d(z) {
    if (!trazado3d.length) return null;
    const t = Math.max(0, Math.min(1, z));
    const pos = t * (trazado3d.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    const a = trazado3d[i];
    const b = trazado3d[Math.min(trazado3d.length - 1, i + 1)];
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      ancho: a.ancho + (b.ancho - a.ancho) * f,
      escala: a.escala + (b.escala - a.escala) * f
    };
  }

  function panel3d(x, y, ancho, alto, radio = 14, alpha = 0.86) {
    ctx3d.fillStyle = `rgba(10, 13, 18, ${alpha})`;
    ctx3d.beginPath();
    if (ctx3d.roundRect) ctx3d.roundRect(x, y, ancho, alto, radio);
    else ctx3d.rect(x, y, ancho, alto);
    ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(255,255,255,.09)';
    ctx3d.lineWidth = 1;
    ctx3d.stroke();
  }

  function dibujarIconoGiro3d(x, y, tipo, color = '#f8fafc', escala = 1) {
    ctx3d.save();
    ctx3d.translate(x, y);
    ctx3d.scale(escala, escala);
    ctx3d.strokeStyle = color;
    ctx3d.fillStyle = color;
    ctx3d.lineWidth = 5;
    ctx3d.lineCap = 'round';
    ctx3d.lineJoin = 'round';
    const m = String(tipo || '').toLowerCase();
    if (m.includes('left') || m.includes('izq')) {
      ctx3d.beginPath();
      ctx3d.moveTo(8, 18); ctx3d.lineTo(8, 8); ctx3d.lineTo(-8, 8);
      ctx3d.moveTo(-2, 0); ctx3d.lineTo(-10, 8); ctx3d.lineTo(-2, 16);
      ctx3d.stroke();
    } else if (m.includes('round') || m.includes('rotonda')) {
      ctx3d.beginPath(); ctx3d.arc(0, 2, 11, Math.PI * 0.15, Math.PI * 1.55); ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.moveTo(9, -6); ctx3d.lineTo(12, 2); ctx3d.lineTo(4, 2); ctx3d.stroke();
    } else if (m.includes('straight') || m.includes('recto') || m === '') {
      ctx3d.beginPath();
      ctx3d.moveTo(0, 16); ctx3d.lineTo(0, -10);
      ctx3d.moveTo(-8, -2); ctx3d.lineTo(0, -10); ctx3d.lineTo(8, -2);
      ctx3d.stroke();
    } else {
      ctx3d.beginPath();
      ctx3d.moveTo(-8, 8); ctx3d.lineTo(8, 8);
      ctx3d.moveTo(1, 1); ctx3d.lineTo(9, 8); ctx3d.lineTo(1, 15);
      ctx3d.stroke();
    }
    ctx3d.restore();
  }

  function perfil3d(w, horizonte, base, amplitud, fase, color) {
    ctx3d.fillStyle = color;
    ctx3d.beginPath();
    ctx3d.moveTo(-10, horizonte);
    for (let x = -10; x <= w + 10; x += 12) {
      const y = base - (Math.sin(x * 0.006 + fase) * amplitud + Math.sin(x * 0.017 + fase * 2) * amplitud * 0.42 + amplitud * 0.5);
      ctx3d.lineTo(x, Math.max(0, Math.min(horizonte, y)));
    }
    ctx3d.lineTo(w + 10, horizonte);
    ctx3d.closePath();
    ctx3d.fill();
  }

  function dibujarSkyline3d(w, horizonte, tipo) {
    const ciudad = tipo === 'ciudad';
    const pueblo = tipo === 'pueblo';
    if (!ciudad && !pueblo) return;
    let x = -12;
    let i = 0;
    while (x < w + 12) {
      const ancho = ciudad ? 22 + (i * 37 % 45) : 34 + (i * 19 % 38);
      const alto = ciudad ? 28 + (i * 53 % Math.max(35, horizonte * 0.48)) : 18 + (i * 31 % 30);
      const y = horizonte - alto;
      ctx3d.fillStyle = ciudad ? (i % 2 ? '#263444' : '#1d2b39') : '#c9bda6';
      ctx3d.fillRect(x, y, ancho, alto);
      if (pueblo) {
        ctx3d.fillStyle = '#8f4b35';
        ctx3d.beginPath();
        ctx3d.moveTo(x - 3, y);
        ctx3d.lineTo(x + ancho / 2, y - 9);
        ctx3d.lineTo(x + ancho + 3, y);
        ctx3d.closePath();
        ctx3d.fill();
        ctx3d.fillStyle = 'rgba(40,55,70,.45)';
        ctx3d.fillRect(x + ancho * 0.2, y + alto * 0.44, ancho * 0.16, alto * 0.18);
        ctx3d.fillRect(x + ancho * 0.62, y + alto * 0.44, ancho * 0.16, alto * 0.18);
      } else {
        ctx3d.fillStyle = 'rgba(255,220,145,.24)';
        for (let f = 0; f < 8; f += 1) {
          if ((i + f) % 3 === 0) ctx3d.fillRect(x + 5 + (f % 3) * (ancho - 10) / 3, y + 7 + Math.floor(f / 3) * (alto / 4), 3, 3);
        }
      }
      x += ancho + 3 + (i * 11 % 10);
      i += 1;
    }
  }

  function dibujarFondoDetalle3d(w, h, horizonte, tipo) {
    const noche = modoNoche3d;
    const cielo = ctx3d.createLinearGradient(0, 0, 0, horizonte);
    if (noche) {
      cielo.addColorStop(0, '#02050c');
      cielo.addColorStop(0.42, '#07162a');
      cielo.addColorStop(0.78, '#123456');
      cielo.addColorStop(1, '#36576e');
    } else {
      cielo.addColorStop(0, '#4a8fc7');
      cielo.addColorStop(0.45, '#83b9dd');
      cielo.addColorStop(0.78, '#c8dfe5');
      cielo.addColorStop(1, '#e9e2c7');
    }
    ctx3d.fillStyle = cielo;
    ctx3d.fillRect(0, 0, w, horizonte + 2);

    if (noche) {
      ctx3d.fillStyle = 'rgba(255,255,255,.65)';
      for (let i = 0; i < 36; i += 1) ctx3d.fillRect((i * 173 + 31) % w, (i * 67 + 13) % (horizonte * 0.64), (i % 3) + 1, (i % 3) + 1);
      const lunaX = w * 0.74;
      const lunaY = horizonte * 0.3;
      ctx3d.fillStyle = 'rgba(230,240,255,.8)';
      ctx3d.beginPath(); ctx3d.arc(lunaX, lunaY, Math.max(7, h * 0.024), 0, Math.PI * 2); ctx3d.fill();
    } else {
      const solX = w * 0.74;
      const solY = horizonte * 0.3;
      const halo = ctx3d.createRadialGradient(solX, solY, 0, solX, solY, h * 0.34);
      halo.addColorStop(0, 'rgba(255,246,196,.9)');
      halo.addColorStop(0.25, 'rgba(255,226,150,.42)');
      halo.addColorStop(1, 'rgba(255,214,130,0)');
      ctx3d.fillStyle = halo;
      ctx3d.fillRect(0, 0, w, horizonte + 20);
      ctx3d.fillStyle = '#fff4c8';
      ctx3d.beginPath(); ctx3d.arc(solX, solY, Math.max(8, h * 0.026), 0, Math.PI * 2); ctx3d.fill();
      ctx3d.fillStyle = 'rgba(255,255,255,.52)';
      for (let i = 0; i < 5; i += 1) {
        const cx0 = ((i * 0.24 + 0.08) * w + (ultimoFrame3d || 0) * 0.002 * (i + 1)) % (w + 150) - 70;
        const cy0 = horizonte * (0.18 + i * 0.07);
        ctx3d.beginPath();
        ctx3d.ellipse(cx0, cy0, 42 + i * 18, 8 + i * 2, 0, 0, Math.PI * 2);
        ctx3d.fill();
      }
    }

    if (tipo === 'montana') {
      perfil3d(w, horizonte, horizonte - h * 0.01, h * 0.13, 1.4, noche ? '#0e2432' : '#6f8c83');
      perfil3d(w, horizonte, horizonte + h * 0.005, h * 0.09, 2.8, noche ? '#0a1b28' : '#4f7566');
      if (!noche) {
        ctx3d.fillStyle = 'rgba(245,248,248,.82)';
        ctx3d.beginPath();
        ctx3d.moveTo(w * 0.18, horizonte - h * 0.13);
        ctx3d.lineTo(w * 0.23, horizonte - h * 0.055);
        ctx3d.lineTo(w * 0.13, horizonte - h * 0.055);
        ctx3d.closePath(); ctx3d.fill();
      }
    } else if (tipo === 'autovia') {
      perfil3d(w, horizonte, horizonte, h * 0.045, 0.4, noche ? '#0a1b28' : '#7a9a78');
      perfil3d(w, horizonte, horizonte + 1, h * 0.026, 2.2, noche ? '#0b1f2b' : '#5f845e');
    } else {
      perfil3d(w, horizonte, horizonte, h * 0.038, 0.9, noche ? '#0b1c29' : '#7f9b82');
    }

    dibujarSkyline3d(w, horizonte, tipo);

    const suelo = ctx3d.createLinearGradient(0, horizonte, 0, h);
    if (noche) {
      suelo.addColorStop(0, '#14251e');
      suelo.addColorStop(0.5, '#0c1a16');
      suelo.addColorStop(1, '#07110f');
    } else if (tipo === 'ciudad' || tipo === 'pueblo') {
      suelo.addColorStop(0, '#7f8e75');
      suelo.addColorStop(0.5, '#66745f');
      suelo.addColorStop(1, '#4f5d4c');
    } else {
      suelo.addColorStop(0, '#8ca76c');
      suelo.addColorStop(0.5, '#6f9459');
      suelo.addColorStop(1, '#4f7445');
    }
    ctx3d.fillStyle = suelo;
    ctx3d.fillRect(0, horizonte, w, h - horizonte);

    const bruma = ctx3d.createLinearGradient(0, horizonte - h * 0.06, 0, horizonte + 8);
    bruma.addColorStop(0, 'rgba(210,230,235,0)');
    bruma.addColorStop(1, noche ? 'rgba(18,42,60,.45)' : 'rgba(230,239,226,.45)');
    ctx3d.fillStyle = bruma;
    ctx3d.fillRect(0, horizonte - h * 0.06, w, h * 0.06 + 8);
  }

  function dibujarArbol3d(x, base, alto, tipo) {
    const ancho = alto * (tipo === 'montana' ? 0.36 : 0.42);
    ctx3d.fillStyle = '#4a2f1e';
    ctx3d.fillRect(x - Math.max(1, ancho * 0.06), base - alto * 0.2, Math.max(2, ancho * 0.12), alto * 0.2);
    const verde = modoNoche3d ? '#0d3228' : (tipo === 'montana' ? '#1f5a43' : '#2f6b45');
    const verde2 = modoNoche3d ? '#123e2f' : '#4a8a52';
    for (let i = 0; i < 3; i += 1) {
      const y = base - alto * (0.18 + i * 0.25);
      const a = ancho * (1 - i * 0.2);
      ctx3d.fillStyle = i % 2 ? verde2 : verde;
      ctx3d.beginPath();
      ctx3d.moveTo(x, y - alto * 0.38);
      ctx3d.lineTo(x + a / 2, y);
      ctx3d.lineTo(x - a / 2, y);
      ctx3d.closePath();
      ctx3d.fill();
    }
  }

  function dibujarCasa3d(x, base, alto, ancho) {
    ctx3d.fillStyle = modoNoche3d ? '#29302d' : '#d8c9ae';
    ctx3d.fillRect(x - ancho / 2, base - alto, ancho, alto);
    ctx3d.fillStyle = modoNoche3d ? '#421f18' : '#9b4b35';
    ctx3d.beginPath();
    ctx3d.moveTo(x - ancho * 0.6, base - alto);
    ctx3d.lineTo(x, base - alto * 1.42);
    ctx3d.lineTo(x + ancho * 0.6, base - alto);
    ctx3d.closePath();
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? 'rgba(255,207,120,.48)' : '#5b6b73';
    ctx3d.fillRect(x - ancho * 0.26, base - alto * 0.6, ancho * 0.18, alto * 0.2);
    ctx3d.fillRect(x + ancho * 0.08, base - alto * 0.6, ancho * 0.18, alto * 0.2);
    ctx3d.fillStyle = modoNoche3d ? '#1a1712' : '#69453a';
    ctx3d.fillRect(x - ancho * 0.08, base - alto * 0.3, ancho * 0.16, alto * 0.3);
  }

  function dibujarEdificio3d(x, base, alto, ancho, variante = 0) {
    const fachadasDia = ['#7f8c95', '#96a2a8', '#707e88', '#a4aaa5', '#89959b'];
    const fachadasNoche = ['#1b2733', '#22303c', '#17222d', '#26323a'];
    const fachada = modoNoche3d ? fachadasNoche[variante % fachadasNoche.length] : fachadasDia[variante % fachadasDia.length];
    ctx3d.fillStyle = fachada;
    ctx3d.fillRect(x - ancho / 2, base - alto, ancho, alto);
    // Cornisa, cubierta y sombra lateral para que no parezca un bloque plano.
    ctx3d.fillStyle = modoNoche3d ? '#0e1821' : '#55636c';
    ctx3d.fillRect(x - ancho / 2, base - alto, ancho, Math.max(2, alto * 0.035));
    ctx3d.fillStyle = 'rgba(10,20,28,.12)';
    ctx3d.fillRect(x + ancho * 0.3, base - alto, ancho * 0.2, alto);
    if (alto > 24) {
      ctx3d.fillStyle = modoNoche3d ? '#151d25' : '#66737b';
      ctx3d.fillRect(x - ancho * 0.16, base - alto - Math.max(2, alto * 0.04), ancho * 0.32, Math.max(2, alto * 0.04));
    }
    const cols = Math.max(2, Math.floor(ancho / 11));
    const filas = Math.max(2, Math.floor((alto - 10) / 13));
    const colorVentana = modoNoche3d ? 'rgba(255,209,120,.58)' : 'rgba(26,42,54,.58)';
    for (let c = 0; c < cols; c += 1) {
      for (let f = 0; f < filas; f += 1) {
        if ((c + f) % 4 === 0) continue;
        const wx = x - ancho / 2 + 4 + c * (ancho - 8) / cols;
        const wy = base - alto + 7 + f * (alto - 15) / filas;
        ctx3d.fillStyle = colorVentana;
        ctx3d.fillRect(wx, wy, Math.max(2, ancho / cols * 0.5), Math.max(2, alto / filas * 0.38));
        if (!modoNoche3d) {
          ctx3d.fillStyle = 'rgba(255,255,255,.22)';
          ctx3d.fillRect(wx, wy, Math.max(1, ancho / cols * 0.5), 1);
        }
      }
    }
    ctx3d.fillStyle = modoNoche3d ? '#3a2a17' : '#45525a';
    ctx3d.fillRect(x - ancho * 0.1, base - alto * 0.14, ancho * 0.2, alto * 0.14);
    ctx3d.fillStyle = modoNoche3d ? '#263340' : '#6d7980';
    ctx3d.fillRect(x - ancho / 2, base - alto * 0.18, ancho, Math.max(2, alto * 0.035));
  }

  function dibujarFarola3d(x, base, alto) {
    ctx3d.strokeStyle = modoNoche3d ? 'rgba(174,190,200,.72)' : 'rgba(87,102,107,.75)';
    ctx3d.lineWidth = Math.max(1, alto * 0.018);
    ctx3d.beginPath();
    ctx3d.moveTo(x, base);
    ctx3d.lineTo(x, base - alto);
    ctx3d.lineTo(x + alto * 0.13, base - alto);
    ctx3d.stroke();
    const lx = x + alto * 0.13;
    const ly = base - alto;
    const halo = ctx3d.createRadialGradient(lx, ly, 0, lx, ly, alto * 0.18);
    halo.addColorStop(0, modoNoche3d ? 'rgba(255,216,145,.8)' : 'rgba(255,239,190,.35)');
    halo.addColorStop(1, 'rgba(255,216,145,0)');
    ctx3d.fillStyle = halo;
    ctx3d.beginPath(); ctx3d.arc(lx, ly, alto * 0.18, 0, Math.PI * 2); ctx3d.fill();
  }

  function dibujarBanco3d(x, base, alto) {
    const an = Math.max(8, alto * 1.9);
    const asiento = base - alto * 0.36;
    ctx3d.fillStyle = 'rgba(0,0,0,.18)';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base, an * 0.56, Math.max(1, alto * 0.07), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.strokeStyle = modoNoche3d ? 'rgba(125,139,146,.72)' : 'rgba(76,88,94,.82)';
    ctx3d.lineWidth = Math.max(1, alto * 0.07);
    ctx3d.beginPath();
    ctx3d.moveTo(x - an * 0.38, asiento); ctx3d.lineTo(x - an * 0.38, base);
    ctx3d.moveTo(x + an * 0.38, asiento); ctx3d.lineTo(x + an * 0.38, base);
    ctx3d.stroke();
    ctx3d.fillStyle = modoNoche3d ? '#4b3525' : '#a86d43';
    ctx3d.fillRect(x - an / 2, asiento, an, Math.max(1, alto * 0.13));
    ctx3d.fillRect(x - an / 2, asiento - alto * 0.25, an, Math.max(1, alto * 0.10));
    ctx3d.fillStyle = modoNoche3d ? '#5c422d' : '#bf8151';
    ctx3d.fillRect(x - an / 2, asiento, an, Math.max(1, alto * 0.035));
  }

  function dibujarPapelera3d(x, base, alto) {
    const an = Math.max(4, alto * 0.48);
    const h = alto * 0.76;
    ctx3d.fillStyle = 'rgba(0,0,0,.16)';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base, an * 0.7, Math.max(1, alto * 0.05), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? '#283137' : '#58666c';
    ctx3d.fillRect(x - an / 2, base - h, an, h);
    ctx3d.strokeStyle = modoNoche3d ? 'rgba(145,160,166,.55)' : 'rgba(205,213,210,.55)';
    ctx3d.lineWidth = Math.max(1, alto * 0.035);
    ctx3d.strokeRect(x - an / 2, base - h, an, h);
    ctx3d.fillStyle = modoNoche3d ? '#3b464b' : '#778489';
    ctx3d.fillRect(x - an * 0.58, base - h - Math.max(1, alto * 0.08), an * 1.16, Math.max(1, alto * 0.10));
    ctx3d.fillStyle = modoNoche3d ? '#20282c' : '#3e4a4f';
    ctx3d.fillRect(x - an * 0.25, base - h * 0.68, an * 0.5, Math.max(1, alto * 0.06));
  }

  function dibujarBolardo3d(x, base, alto) {
    const an = Math.max(2, alto * 0.19);
    ctx3d.fillStyle = 'rgba(0,0,0,.15)';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base, an * 1.25, Math.max(1, alto * 0.045), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? '#3e4a4f' : '#66757a';
    ctx3d.fillRect(x - an / 2, base - alto, an, alto);
    ctx3d.fillStyle = modoNoche3d ? '#a9b7b8' : '#eef1e9';
    ctx3d.fillRect(x - an / 2, base - alto * 0.72, an, Math.max(1, alto * 0.13));
    ctx3d.fillStyle = modoNoche3d ? '#5b6a6e' : '#819095';
    ctx3d.beginPath();
    ctx3d.arc(x, base - alto, an * 0.55, 0, Math.PI * 2);
    ctx3d.fill();
  }

  function dibujarJardinera3d(x, base, alto) {
    const an = Math.max(7, alto * 1.75);
    const h = alto * 0.42;
    ctx3d.fillStyle = 'rgba(0,0,0,.15)';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base, an * 0.56, Math.max(1, alto * 0.06), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? '#4d4033' : '#8d7458';
    ctx3d.fillRect(x - an / 2, base - h, an, h);
    ctx3d.fillStyle = modoNoche3d ? '#5a4b3a' : '#a58a68';
    ctx3d.fillRect(x - an / 2, base - h, an, Math.max(1, alto * 0.07));
    ctx3d.fillStyle = modoNoche3d ? '#173a2d' : '#3c7b4b';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base - h - alto * 0.18, an * 0.48, alto * 0.32, 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? '#20513b' : '#57965a';
    ctx3d.beginPath();
    ctx3d.arc(x - an * 0.18, base - h - alto * 0.28, alto * 0.18, 0, Math.PI * 2);
    ctx3d.arc(x + an * 0.20, base - h - alto * 0.23, alto * 0.14, 0, Math.PI * 2);
    ctx3d.fill();
  }

  function dibujarMarquesina3d(x, base, alto, ancho) {
    const an = Math.max(18, ancho);
    const h = Math.max(14, alto);
    ctx3d.fillStyle = 'rgba(0,0,0,.18)';
    ctx3d.beginPath();
    ctx3d.ellipse(x, base, an * 0.52, Math.max(1, h * 0.08), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.strokeStyle = modoNoche3d ? 'rgba(133,151,158,.72)' : 'rgba(82,99,105,.82)';
    ctx3d.lineWidth = Math.max(1, h * 0.045);
    for (const sx of [-1, 1]) {
      ctx3d.beginPath();
      ctx3d.moveTo(x + sx * an * 0.42, base);
      ctx3d.lineTo(x + sx * an * 0.42, base - h);
      ctx3d.stroke();
    }
    ctx3d.fillStyle = modoNoche3d ? 'rgba(100,139,151,.35)' : 'rgba(184,218,220,.44)';
    ctx3d.fillRect(x - an * 0.43, base - h * 0.78, an * 0.86, h * 0.55);
    ctx3d.strokeStyle = modoNoche3d ? 'rgba(176,201,207,.38)' : 'rgba(235,246,242,.58)';
    ctx3d.lineWidth = Math.max(1, h * 0.02);
    ctx3d.strokeRect(x - an * 0.43, base - h * 0.78, an * 0.86, h * 0.55);
    ctx3d.fillStyle = modoNoche3d ? '#263238' : '#e9eee9';
    ctx3d.fillRect(x - an * 0.52, base - h, an * 1.04, Math.max(1, h * 0.075));
    ctx3d.fillStyle = modoNoche3d ? '#d6b36b' : '#f4f0d7';
    ctx3d.fillRect(x - an * 0.31, base - h * 0.64, an * 0.62, Math.max(1, h * 0.13));
    ctx3d.fillStyle = modoNoche3d ? '#27353b' : '#526168';
    ctx3d.fillRect(x - an * 0.28, base - h * 0.31, an * 0.56, Math.max(1, h * 0.055));
    ctx3d.fillStyle = modoNoche3d ? '#1c292d' : '#5f7276';
    for (const sx of [-1, 1]) ctx3d.fillRect(x + sx * an * 0.24, base - h * 0.30, Math.max(1, h * 0.025), h * 0.30);
  }

  function dibujarEntornoDetalle3d(w, h, horizonte, tipo) {
    const pts = trazado3d;
    for (let i = pts.length - 1; i >= 5; i -= 3) {
      const p = pts[i];
      if (p.escala < 2.2) continue;
      const lado = i % 2 ? 1 : -1;
      const off = p.ancho * 0.64 + (7 + (i % 3) * 2) * p.escala;
      if (off > w) continue;
      const x = p.x + lado * off;
      if (x < -w * 0.15 || x > w * 1.15) continue;
      const base = p.y;
      if (tipo === 'montana') {
        const alto = Math.min(h * 0.30, (5.5 + (i % 4) * 1.7) * p.escala);
        dibujarArbol3d(x, base, alto, 'montana');
        if (i % 11 === 0) {
          ctx3d.fillStyle = modoNoche3d ? '#202b31' : '#9b927f';
          ctx3d.beginPath();
          ctx3d.moveTo(x + lado * 4 * p.escala, base);
          ctx3d.lineTo(x + lado * 2 * p.escala, base - 2.5 * p.escala);
          ctx3d.lineTo(x + lado * 5.5 * p.escala, base - 1.2 * p.escala);
          ctx3d.closePath(); ctx3d.fill();
        }
      } else if (tipo === 'ciudad') {
        if (p.escala > 22) continue;
        const alto = Math.min(h * 0.23, (6.5 + (i % 5) * 1.8) * p.escala);
        const ancho = Math.min(8 * p.escala, w * 0.10);
        dibujarEdificio3d(x, base, alto, ancho, i);
        if (i % 7 === 0) {
          for (const l of [-1, 1]) {
            dibujarFarola3d(p.x + l * (p.ancho / 2 + 2.2 * p.escala), base, Math.min(h * 0.18, 5.8 * p.escala));
          }
        }
        if (i % 11 === 0) dibujarArbol3d(p.x + lado * (p.ancho / 2 + 3.1 * p.escala), base, Math.min(h * 0.12, 3.6 * p.escala), 'ciudad');
      } else if (tipo === 'pueblo') {
        if (p.escala > 24) continue;
        const alto = Math.min(h * 0.20, (4.5 + (i % 3) * 1.6) * p.escala);
        dibujarCasa3d(x, base, alto, Math.min(6.5 * p.escala, w * 0.085));
        if (i % 8 === 0) {
          ctx3d.fillStyle = modoNoche3d ? '#37453c' : '#6d7e5e';
          ctx3d.fillRect(x - 4 * p.escala, base - 0.8 * p.escala, 8 * p.escala, 0.8 * p.escala);
        }
        if (i % 13 === 0) dibujarArbol3d(p.x + lado * (p.ancho / 2 + 3 * p.escala), base, Math.min(h * 0.10, 3.3 * p.escala), 'carretera');
      } else if (tipo === 'autovia') {
        if (i % 5 === 0) {
          dibujarArbol3d(p.x + lado * (p.ancho / 2 + 4.2 * p.escala), base, Math.min(h * 0.15, 4.2 * p.escala), 'carretera');
        }
        if (i % 9 === 0) {
          ctx3d.strokeStyle = modoNoche3d ? 'rgba(125,145,155,.6)' : 'rgba(95,111,115,.65)';
          ctx3d.lineWidth = Math.max(1, 0.11 * p.escala);
          const xl = p.x + lado * (p.ancho * 0.58);
          const alt = Math.min(h * 0.28, 9 * p.escala);
          ctx3d.beginPath(); ctx3d.moveTo(xl, base); ctx3d.lineTo(xl, base - alt); ctx3d.lineTo(xl + lado * 1.6 * p.escala, base - alt); ctx3d.stroke();
          const halo = ctx3d.createRadialGradient(xl + lado * 1.6 * p.escala, base - alt, 0, xl + lado * 1.6 * p.escala, base - alt, 1.9 * p.escala);
          halo.addColorStop(0, modoNoche3d ? 'rgba(255,229,160,.72)' : 'rgba(255,241,198,.25)');
          halo.addColorStop(1, 'rgba(255,229,160,0)');
          ctx3d.fillStyle = halo;
          ctx3d.beginPath(); ctx3d.arc(xl + lado * 1.6 * p.escala, base - alt, 1.9 * p.escala, 0, Math.PI * 2); ctx3d.fill();
        }
      } else {
        const alto = Math.min(h * 0.24, (4.8 + (i % 4) * 1.4) * p.escala);
        dibujarArbol3d(x, base, alto, 'carretera');
        if (i % 13 === 0) {
          ctx3d.strokeStyle = modoNoche3d ? 'rgba(110,95,70,.7)' : 'rgba(139,122,91,.72)';
          ctx3d.lineWidth = Math.max(1, 0.16 * p.escala);
          ctx3d.beginPath();
          ctx3d.moveTo(p.x + lado * p.ancho * 0.56, base);
          ctx3d.lineTo(p.x + lado * p.ancho * 0.69, base);
          ctx3d.stroke();
        }
      }
    }
  }

  function dibujarMobiliarioUrbano3d(w, h, tipo) {
    if (tipo !== 'ciudad' && tipo !== 'pueblo') return;
    const pts = trazado3d;
    const aceraAncho = tipo === 'ciudad' ? 3.9 : 3.4;
    for (let i = pts.length - 1; i >= 0; i -= 1) {
      const p = pts[i];
      if (p.escala < 3 || p.escala > 20) continue;
      const s = p.s || 0;
      if (s < 7) continue;
      const bucket = Math.floor(s / 13);
      const fase = s - bucket * 13;
      const lado = bucket % 2 ? 1 : -1;
      const acera = p.x + lado * (p.ancho / 2 + aceraAncho * p.escala);
      if (acera < -18 || acera > w + 18) continue;
      const base = p.y;
      const escala = p.escala;
      const altoBanco = Math.min(h * 0.075, 1.5 * escala);
      const altoPieza = Math.min(h * 0.055, 1.15 * escala);
      if (fase < 1.5) {
        switch (bucket % 6) {
          case 0:
          case 4: dibujarBanco3d(acera, base, altoBanco); break;
          case 1:
          case 5: dibujarPapelera3d(p.x + lado * (p.ancho / 2 + 2.7 * escala), base, altoPieza); break;
          case 2: dibujarJardinera3d(acera, base, Math.min(h * 0.065, 1.3 * escala)); break;
          default: dibujarBolardo3d(p.x + lado * (p.ancho / 2 + 1.9 * escala), base, Math.min(h * 0.052, 1.0 * escala)); break;
        }
      }
      if (Math.abs(s - 87) < 2) {
        dibujarMarquesina3d(acera, base, Math.min(h * 0.12, 3.1 * escala), Math.min(w * 0.16, 5.6 * escala));
      }
    }
  }

  function dibujarCalzadaDetalle3d(w, h, horizonte, tipo) {
    const pts = trazado3d;
    if (pts.length < 3) return;
    ctx3d.save();
    ctx3d.lineJoin = 'round';
    const banda = (extra, color) => {
      ctx3d.fillStyle = color;
      ctx3d.beginPath();
      for (let i = 0; i < pts.length; i += 1) {
        const p = pts[i];
        const x = p.x - (p.ancho + extra * p.escala) / 2;
        if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
      }
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i];
        ctx3d.lineTo(p.x + (p.ancho + extra * p.escala) / 2, p.y);
      }
      ctx3d.closePath();
      ctx3d.fill();
    };
    if (tipo === 'ciudad' || tipo === 'pueblo') {
      banda(4.4, modoNoche3d ? 'rgba(75,84,83,.95)' : 'rgba(160,167,159,.98)');
      banda(3.4, modoNoche3d ? 'rgba(47,56,57,.96)' : 'rgba(195,199,190,.98)');
    } else {
      banda(2.6, modoNoche3d ? 'rgba(58,55,43,.96)' : 'rgba(190,174,133,.98)');
      banda(1.7, modoNoche3d ? 'rgba(74,66,48,.96)' : 'rgba(153,135,96,.98)');
    }
    const asfalto = ctx3d.createLinearGradient(0, horizonte, 0, h);
    if (modoNoche3d) {
      asfalto.addColorStop(0, '#34475c');
      asfalto.addColorStop(0.45, '#24374b');
      asfalto.addColorStop(1, '#142435');
    } else {
      asfalto.addColorStop(0, '#5b6670');
      asfalto.addColorStop(0.45, '#414b53');
      asfalto.addColorStop(1, '#2c343a');
    }
    banda(0, asfalto);

    // Acera y bordillo en ciudad/pueblo: separa la calzada de las fachadas.
    if (tipo === 'ciudad' || tipo === 'pueblo') {
      for (const lado of [-1, 1]) {
        ctx3d.strokeStyle = modoNoche3d ? 'rgba(225,231,226,.22)' : 'rgba(238,241,232,.66)';
        ctx3d.lineWidth = Math.max(1, 0.09 * (pts[Math.min(8, pts.length - 1)]?.escala || 1));
        ctx3d.beginPath();
        pts.forEach((p, i) => {
          const x = p.x + lado * (p.ancho / 2 + 2.0 * p.escala);
          if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
        });
        ctx3d.stroke();
      }
    }

    for (const off of [-2.15, 2.15]) {
      for (let i = 1; i < pts.length; i += 1) {
        const a = pts[i - 1];
        const b = pts[i];
        ctx3d.strokeStyle = 'rgba(5,10,16,.23)';
        ctx3d.lineWidth = Math.min(18, Math.max(1, 0.55 * b.escala));
        ctx3d.beginPath();
        ctx3d.moveTo(a.x + off * a.escala, a.y);
        ctx3d.lineTo(b.x + off * b.escala, b.y);
        ctx3d.stroke();
      }
    }

    const linea = (off, dash, color, ancho, alpha = 1) => {
      ctx3d.save();
      ctx3d.strokeStyle = color;
      ctx3d.globalAlpha = alpha;
      ctx3d.lineCap = 'round';
      ctx3d.lineJoin = 'round';
      ctx3d.lineWidth = ancho;
      if (dash) ctx3d.setLineDash(dash);
      ctx3d.beginPath();
      pts.forEach((p, i) => {
        const x = p.x + off * p.ancho;
        if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
      });
      ctx3d.stroke();
      ctx3d.restore();
    };
    const bordeAncho = Math.min(3.2, Math.max(1, 0.10 * pts[Math.min(8, pts.length - 1)].escala));
    linea(-0.405, null, 'rgba(241,247,250,.92)', bordeAncho);
    linea(0.405, null, 'rgba(241,247,250,.92)', bordeAncho);
    if (tipo === 'autovia') {
      linea(-0.13, [18, 14], 'rgba(235,242,246,.72)', Math.max(1, bordeAncho * 0.72));
      linea(0.13, [18, 14], 'rgba(235,242,246,.72)', Math.max(1, bordeAncho * 0.72));
    } else {
      linea(0, [17, 15], 'rgba(235,242,246,.7)', Math.max(1, bordeAncho * 0.72));
    }

    // Guía luminosa del carril derecho, como la referencia.
    ctx3d.save();
    ctx3d.strokeStyle = 'rgba(41,196,235,.26)';
    ctx3d.shadowColor = '#2cc8ee';
    ctx3d.shadowBlur = 9;
    ctx3d.lineWidth = Math.min(7, Math.max(2, 0.15 * pts[Math.min(8, pts.length - 1)].escala));
    ctx3d.beginPath();
    pts.forEach((p, i) => {
      const x = p.x + 0.245 * p.ancho;
      if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
    });
    ctx3d.stroke();
    ctx3d.restore();

    // Guardarraíl o bordillo.
    if (tipo !== 'ciudad' && tipo !== 'pueblo') {
      for (const lado of [-1, 1]) {
        ctx3d.strokeStyle = modoNoche3d ? 'rgba(145,162,170,.58)' : 'rgba(150,160,162,.76)';
        ctx3d.lineWidth = Math.max(1, Math.min(3, 0.075 * (pts[0]?.escala || 1)));
        ctx3d.beginPath();
        pts.forEach((p, i) => {
          const x = p.x + lado * (p.ancho / 2 + 0.22 * p.escala);
          if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
        });
        ctx3d.stroke();
        for (let i = 8; i < pts.length; i += 10) {
          const p = pts[i];
          const x = p.x + lado * (p.ancho / 2 + 0.22 * p.escala);
          ctx3d.strokeStyle = 'rgba(105,121,128,.52)';
          ctx3d.lineWidth = Math.max(1, 0.10 * p.escala);
          ctx3d.beginPath();
          ctx3d.moveTo(x, p.y);
          ctx3d.lineTo(x, p.y - 0.74 * p.escala);
          ctx3d.stroke();
        }
      }
    }
    ctx3d.restore();

    dibujarFlechasDetalle3d(w, h);
  }

  function dibujarFlechasDetalle3d(w, h) {
    for (let s = 18; s <= 112; s += 24) {
      const p = puntoPorS3d(s);
      const q = puntoPorS3d(s + 5);
      if (!p || !q) continue;
      const ang = Math.atan2(q.x - p.x, -(q.y - p.y));
      const half = Math.min(13, Math.max(3, p.ancho * 0.055));
      const len = Math.min(24, Math.max(5, p.ancho * 0.075));
      ctx3d.save();
      ctx3d.translate(p.x + p.ancho * 0.245, p.y);
      ctx3d.rotate(ang);
      ctx3d.strokeStyle = modoNoche3d ? 'rgba(90,226,255,.9)' : 'rgba(36,205,241,.92)';
      ctx3d.shadowColor = '#20c9f0';
      ctx3d.shadowBlur = Math.max(2, p.ancho * 0.025);
      ctx3d.lineWidth = Math.min(5, Math.max(2.2, p.ancho * 0.025));
      ctx3d.lineCap = 'round';
      ctx3d.lineJoin = 'round';
      ctx3d.beginPath();
      ctx3d.moveTo(-half, len * 0.55);
      ctx3d.lineTo(0, -len * 0.45);
      ctx3d.lineTo(half, len * 0.55);
      ctx3d.stroke();
      ctx3d.restore();
    }
  }

  function dibujarSenalesDetalle3d(w, h, horizonte) {
    const ruta = rutaActiva();
    const s = ruta?.steps?.[paso];
    const kmh = ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null;
    if (kmh) {
      const p = puntoPorS3d(55);
      if (p) {
        const r = Math.max(11, Math.min(24, p.ancho * 0.075));
        const x = Math.max(r + 8, Math.min(w - r - 8, p.x + p.ancho / 2 + 3.5 * p.escala));
        const y = Math.max(horizonte + 30, Math.min(h * 0.78, p.y - r * 2.2));
        ctx3d.strokeStyle = 'rgba(140,150,155,.8)';
        ctx3d.lineWidth = Math.max(1.5, r * 0.12);
        ctx3d.beginPath(); ctx3d.moveTo(x, y + r); ctx3d.lineTo(x, p.y); ctx3d.stroke();
        ctx3d.fillStyle = '#f8fafc';
        ctx3d.beginPath(); ctx3d.arc(x, y, r, 0, Math.PI * 2); ctx3d.fill();
        ctx3d.strokeStyle = '#dc2626';
        ctx3d.lineWidth = Math.max(3, r * 0.16);
        ctx3d.beginPath(); ctx3d.arc(x, y, r * 0.8, 0, Math.PI * 2); ctx3d.stroke();
        ctx3d.fillStyle = '#111827';
        ctx3d.font = `900 ${Math.max(10, r * 1.02)}px system-ui, sans-serif`;
        ctx3d.textAlign = 'center';
        ctx3d.textBaseline = 'middle';
        ctx3d.fillText(String(kmh), x, y + 1);
      }
    }

    const salida = s && (Number.isFinite(s.exit) || /off ramp|fork|end of road/i.test(s.type || ''));
    const distSalida = ultimaPos && Number.isFinite(s?.lat)
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : 0;
    // La salida solo entra en el campo visual cuando está cerca: si queda a
    // 400 m, el cartel no puede estar ya plantado delante del coche.
    if (salida && (!ultimaPos || distSalida <= 220)) {
      const z = Math.max(35, Math.min(150, distSalida || 82));
      const p = puntoPorS3d(z);
      if (p) {
        const an = Math.max(64, Math.min(148, 8.5 * p.escala));
        const al = Math.max(24, an * 0.30);
        const x = Math.max(8, Math.min(w - an - 8, Math.max(p.x + p.ancho / 2 + 5 * p.escala, w - an - 18)));
        const y = Math.max(horizonte + 14, p.y - al - 3 * p.escala);
        const poste = Math.max(8, Math.min(h * 0.12, 5 * p.escala));
        ctx3d.fillStyle = 'rgba(126,140,146,.72)';
        ctx3d.fillRect(x + an * 0.16, y + al, Math.max(2, an * 0.018), poste);
        ctx3d.fillRect(x + an * 0.80, y + al, Math.max(2, an * 0.018), poste);
        ctx3d.fillStyle = '#0d5b3a';
        ctx3d.fillRect(x, y, an, al);
        ctx3d.strokeStyle = 'rgba(230,248,240,.9)';
        ctx3d.lineWidth = 1.4;
        ctx3d.strokeRect(x, y, an, al);
        ctx3d.fillStyle = '#f4fff8';
        ctx3d.textAlign = 'left';
        ctx3d.textBaseline = 'middle';
        ctx3d.font = `900 ${Math.max(8, Math.min(14, al * 0.34))}px system-ui, sans-serif`;
        const salidaTxt = Number.isFinite(s.exit) ? `SALIDA ${s.exit}` : 'SALIDA';
        ctx3d.fillText(salidaTxt, x + 7, y + al * 0.34);
        ctx3d.font = `600 ${Math.max(6, Math.min(10, al * 0.20))}px system-ui, sans-serif`;
        ctx3d.fillText(textoCorto3d(s.name || s.ref || '', an - 14), x + 7, y + al * 0.68);
      }
    }

    const curva = carretera3d[Math.max(0, Math.min(carretera3d.length - 1, indiceActual3d()))]?.curva || 0;
    if (Math.abs(curva) > 5) {
      const lado = curva > 0 ? -1 : 1;
      [28, 42, 56].forEach((ss, i) => {
        const p = puntoPorS3d(ss);
        if (!p) return;
        const r = Math.max(8, Math.min(18, p.ancho * 0.058));
        const x = p.x + lado * (p.ancho / 2 + 3.5 * p.escala);
        const y = p.y - r * 2.1;
        if (x < r || x > w - r) return;
        ctx3d.fillStyle = '#facc15';
        ctx3d.fillRect(x - r, y - r, r * 2, r * 2);
        ctx3d.strokeStyle = '#1f2937';
        ctx3d.lineWidth = Math.max(2, r * 0.16);
        ctx3d.beginPath();
        const dir = curva > 0 ? -1 : 1;
        ctx3d.moveTo(x + dir * r * 0.45, y - r * 0.5);
        ctx3d.lineTo(x - dir * r * 0.35, y);
        ctx3d.lineTo(x + dir * r * 0.45, y + r * 0.5);
        ctx3d.stroke();
        if (i === 0) {
          ctx3d.strokeStyle = 'rgba(125,135,140,.8)';
          ctx3d.lineWidth = Math.max(1, r * 0.1);
          ctx3d.beginPath(); ctx3d.moveTo(x, y + r); ctx3d.lineTo(x, p.y); ctx3d.stroke();
        }
      });
    }

    if (tipoVia3d === 'pueblo' || tipoVia3d === 'ciudad') {
      const p = puntoPorS3d(105);
      if (p) {
        const an = Math.min(96, Math.max(62, w * 0.15));
        const al = an * 0.46;
        const x = Math.max(8, Math.min(w - an - 8, p.x - p.ancho / 2 - an - 3 * p.escala));
        const y = Math.max(horizonte + 18, p.y - al - 4 * p.escala);
        const poste = Math.max(8, 4 * p.escala);
        ctx3d.fillStyle = 'rgba(120,135,140,.8)';
        ctx3d.fillRect(x + an * 0.2, y + al, Math.max(2, an * 0.02), poste);
        ctx3d.fillRect(x + an * 0.78, y + al, Math.max(2, an * 0.02), poste);
        ctx3d.fillStyle = '#f8fafc';
        ctx3d.fillRect(x, y, an, al);
        ctx3d.strokeStyle = '#b91c1c';
        ctx3d.lineWidth = Math.max(1.2, an * 0.035);
        ctx3d.strokeRect(x, y, an, al);
        ctx3d.fillStyle = '#111827';
        ctx3d.textAlign = 'center';
        ctx3d.textBaseline = 'middle';
        ctx3d.font = `900 ${Math.max(7, an * 0.16)}px system-ui, sans-serif`;
        ctx3d.fillText(tipoVia3d === 'ciudad' ? 'CIUDAD' : 'PUEBLO', x + an / 2, y + al * 0.32);
        ctx3d.fillStyle = '#334155';
        ctx3d.font = `700 ${Math.max(5, an * 0.075)}px system-ui, sans-serif`;
        ctx3d.fillText(tipoVia3d === 'ciudad' ? 'CASCO URBANO' : 'TRAVESÍA', x + an / 2, y + al * 0.61);
        ctx3d.fillStyle = '#94a3b8';
        const bw = an * 0.08;
        for (let b = 0; b < 5; b += 1) {
          const bh = al * (0.08 + (b % 3) * 0.045);
          ctx3d.fillRect(x + an * 0.26 + b * bw * 1.35, y + al * 0.80 - bh, bw, bh);
        }
      }
    }
  }

  function dibujarVehiculo3d(x, base, ancho, tipo, dir, color) {
    const alto = ancho * (tipo === 'van' ? 0.82 : tipo === 'suv' ? 0.71 : 0.61);
    ctx3d.save();
    ctx3d.translate(x, base);
    ctx3d.fillStyle = 'rgba(0,0,0,.28)';
    ctx3d.beginPath();
    ctx3d.ellipse(0, 1, ancho * 0.54, Math.max(2, ancho * 0.08), 0, 0, Math.PI * 2);
    ctx3d.fill();
    // Ruedas.
    ctx3d.fillStyle = '#080b0e';
    ctx3d.fillRect(-ancho * 0.48, -alto * 0.17, Math.max(2, ancho * 0.15), alto * 0.19);
    ctx3d.fillRect(ancho * 0.33, -alto * 0.17, Math.max(2, ancho * 0.15), alto * 0.19);
    // Carrocería.
    const cuerpo = ctx3d.createLinearGradient(0, -alto, 0, 0);
    cuerpo.addColorStop(0, color);
    cuerpo.addColorStop(0.62, color);
    cuerpo.addColorStop(1, 'rgba(18,25,31,.94)');
    ctx3d.fillStyle = cuerpo;
    ctx3d.beginPath();
    if (ctx3d.roundRect) ctx3d.roundRect(-ancho / 2, -alto * 0.82, ancho, alto * 0.82, Math.max(2, ancho * 0.10));
    else ctx3d.rect(-ancho / 2, -alto * 0.82, ancho, alto * 0.82);
    ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(8,15,21,.68)';
    ctx3d.lineWidth = Math.max(1, ancho * 0.018);
    ctx3d.stroke();
    // Cabina y luneta.
    ctx3d.fillStyle = modoNoche3d ? '#0c1b26' : '#263944';
    ctx3d.beginPath();
    if (ctx3d.roundRect) ctx3d.roundRect(-ancho * 0.34, -alto * 0.98, ancho * 0.68, alto * 0.33, Math.max(1, ancho * 0.05));
    else ctx3d.rect(-ancho * 0.34, -alto * 0.98, ancho * 0.68, alto * 0.33);
    ctx3d.fill();
    ctx3d.fillStyle = modoNoche3d ? 'rgba(124,173,194,.24)' : 'rgba(169,213,229,.40)';
    ctx3d.fillRect(-ancho * 0.27, -alto * 0.94, ancho * 0.54, Math.max(1, alto * 0.09));
    // Matrícula / parachoques.
    ctx3d.fillStyle = '#111a20';
    ctx3d.fillRect(-ancho * 0.34, -alto * 0.26, ancho * 0.68, Math.max(1, alto * 0.10));
    ctx3d.fillStyle = '#e7edf0';
    ctx3d.fillRect(-ancho * 0.10, -alto * 0.235, ancho * 0.20, Math.max(1, alto * 0.045));
    if (dir > 0) {
      // Trasera: pilotos rojos y reflejo.
      ctx3d.fillStyle = '#ff3548';
      ctx3d.fillRect(-ancho * 0.41, -alto * 0.44, ancho * 0.16, Math.max(1, alto * 0.08));
      ctx3d.fillRect(ancho * 0.25, -alto * 0.44, ancho * 0.16, Math.max(1, alto * 0.08));
      ctx3d.fillStyle = 'rgba(255,45,65,.18)';
      ctx3d.fillRect(-ancho * 0.44, -alto * 0.38, ancho * 0.88, Math.max(1, alto * 0.04));
    } else {
      // Frente: faros y parrilla.
      ctx3d.fillStyle = modoNoche3d ? '#fff0ba' : '#f8f4d8';
      ctx3d.fillRect(-ancho * 0.42, -alto * 0.43, ancho * 0.17, Math.max(1, alto * 0.09));
      ctx3d.fillRect(ancho * 0.25, -alto * 0.43, ancho * 0.17, Math.max(1, alto * 0.09));
      ctx3d.fillStyle = '#111a20';
      ctx3d.fillRect(-ancho * 0.18, -alto * 0.41, ancho * 0.36, Math.max(1, alto * 0.07));
      if (modoNoche3d) {
        ctx3d.fillStyle = 'rgba(255,225,144,.20)';
        ctx3d.beginPath();
        ctx3d.ellipse(0, -alto * 0.40, ancho * 0.58, alto * 0.18, 0, 0, Math.PI * 2);
        ctx3d.fill();
      }
    }
    // Techo y detalle de techo.
    ctx3d.fillStyle = 'rgba(255,255,255,.16)';
    ctx3d.fillRect(-ancho * 0.30, -alto * 0.88, ancho * 0.60, Math.max(1, alto * 0.025));
    if (tipo === 'van') {
      ctx3d.fillStyle = 'rgba(19,27,32,.45)';
      ctx3d.fillRect(-ancho * 0.40, -alto * 0.79, ancho * 0.80, Math.max(1, alto * 0.22));
    }
    ctx3d.restore();
  }

  function dibujarTrafico3d(w, h, tipo) {
    if (!navegando || !trazado3d.length) return;
    const t = (ultimoFrame3d || performance.now()) / 1000;
    const avance = Math.max(7, Math.min(23, (Number(velocidad) || 45) * 0.18));
    const coches = [
      { base: 38, carril: 0.24, color: '#d5dce0', dir: 1, tipo: 'sedan' },
      { base: 126, carril: 0.23, color: '#5a6570', dir: 1, tipo: 'suv' },
      { base: 198, carril: 0.24, color: '#b8c4cb', dir: 1, tipo: 'van' },
      { base: 72, carril: -0.24, color: '#e7ebed', dir: -1, tipo: 'sedan' },
      { base: 156, carril: -0.23, color: '#3f4c57', dir: -1, tipo: 'suv' }
    ];
    const lista = coches.map(c => {
      const crudo = c.dir > 0 ? c.base + t * avance : c.base - t * (avance + 5);
      return { ...c, s: 34 + ((crudo % 210) + 210) % 210 };
    }).sort((a, b) => b.s - a.s);
    for (const c of lista) {
      const p = puntoPorS3d(c.s);
      if (!p || p.y < h * 0.30 || p.y > h * 0.97) continue;
      const an = Math.min(w * 0.085, Math.max(7, p.ancho * 0.20));
      if (an < 6) continue;
      const carril = c.carril * p.ancho;
      if (p.x + carril < -an || p.x + carril > w + an) continue;
      dibujarVehiculo3d(p.x + carril, p.y, an, c.tipo, c.dir, c.color);
    }
  }

  function dibujarCocheGt4Detalle3d(w, h) {
    const idx = indiceActual3d();
    const curva = carretera3d[Math.min(carretera3d.length - 1, idx + 1)]?.curva || 0;
    const cw = Math.max(126, Math.min(w * 0.26, h * 0.38, 250));
    const ch = cw * 0.54;
    const base = h - Math.max(96, h * 0.115);
    const tilt = Math.max(-3.4, Math.min(3.4, -curva * 0.18));
    const rebote = navegando ? Math.sin((ultimoFrame3d || performance.now()) / 190) * Math.min(1.1, velocidad / 110) : 0;
    const x = w / 2 + Math.max(-18, Math.min(18, -curva * 0.8));

    ctx3d.save();
    ctx3d.translate(x, base + rebote);
    const X = (v) => v * cw;
    const Y = (v) => v * ch;
    ctx3d.fillStyle = 'rgba(0,0,0,.38)';
    ctx3d.beginPath();
    ctx3d.ellipse(0, 2, cw * 0.31, Math.max(3, ch * 0.07), 0, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.rotate(tilt * Math.PI / 180);

    // Ruedas y pasos de rueda.
    ctx3d.fillStyle = '#0b0d10';
    for (const sx of [-1, 1]) {
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(sx * X(0.40) - X(0.075), Y(-0.18), X(0.15), Y(0.20), X(0.035));
      else ctx3d.rect(sx * X(0.40) - X(0.075), Y(-0.18), X(0.15), Y(0.20));
      ctx3d.fill();
    }

    // Silueta trasera del GT4.
    const carroceria = ctx3d.createLinearGradient(0, Y(-0.86), 0, Y(0.02));
    carroceria.addColorStop(0, '#0a2f76');
    carroceria.addColorStop(0.34, '#0d56c7');
    carroceria.addColorStop(0.7, '#1678e8');
    carroceria.addColorStop(1, '#0a3a88');
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.475), Y(-0.035));
    ctx3d.bezierCurveTo(X(-0.51), Y(-0.28), X(-0.47), Y(-0.45), X(-0.36), Y(-0.51));
    ctx3d.lineTo(X(-0.31), Y(-0.70));
    ctx3d.bezierCurveTo(X(-0.21), Y(-0.82), X(0.21), Y(-0.82), X(0.31), Y(-0.70));
    ctx3d.lineTo(X(0.36), Y(-0.51));
    ctx3d.bezierCurveTo(X(0.47), Y(-0.45), X(0.51), Y(-0.28), X(0.475), Y(-0.035));
    ctx3d.lineTo(X(0.42), Y(0.025));
    ctx3d.lineTo(X(-0.42), Y(0.025));
    ctx3d.closePath();
    ctx3d.fillStyle = carroceria;
    ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(1,8,18,.82)';
    ctx3d.lineWidth = Math.max(1.2, cw * 0.009);
    ctx3d.stroke();

    // Brillos laterales y hombros.
    ctx3d.fillStyle = 'rgba(109,198,255,.35)';
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.46), Y(-0.30));
    ctx3d.quadraticCurveTo(X(-0.38), Y(-0.46), X(-0.28), Y(-0.52));
    ctx3d.lineTo(X(-0.33), Y(-0.29));
    ctx3d.closePath();
    ctx3d.fill();
    ctx3d.fillStyle = 'rgba(2,18,46,.35)';
    ctx3d.beginPath();
    ctx3d.moveTo(X(0.47), Y(-0.22));
    ctx3d.quadraticCurveTo(X(0.43), Y(-0.42), X(0.34), Y(-0.51));
    ctx3d.lineTo(X(0.38), Y(-0.22));
    ctx3d.closePath();
    ctx3d.fill();

    // Luna trasera y techo.
    const luna = ctx3d.createLinearGradient(0, Y(-0.76), 0, Y(-0.48));
    luna.addColorStop(0, '#07111d');
    luna.addColorStop(0.6, '#0c2034');
    luna.addColorStop(1, '#18374f');
    ctx3d.fillStyle = luna;
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.285), Y(-0.69));
    ctx3d.quadraticCurveTo(0, Y(-0.78), X(0.285), Y(-0.69));
    ctx3d.lineTo(X(0.235), Y(-0.50));
    ctx3d.lineTo(X(-0.235), Y(-0.50));
    ctx3d.closePath();
    ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(127,190,230,.18)';
    ctx3d.lineWidth = Math.max(1, cw * 0.006);
    ctx3d.stroke();
    ctx3d.fillStyle = 'rgba(255,255,255,.10)';
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.22), Y(-0.70));
    ctx3d.lineTo(X(-0.08), Y(-0.53));
    ctx3d.lineTo(X(0.03), Y(-0.53));
    ctx3d.lineTo(X(-0.12), Y(-0.70));
    ctx3d.closePath();
    ctx3d.fill();

    // Retrovisores.
    ctx3d.fillStyle = '#0c4ea9';
    for (const sx of [-1, 1]) {
      ctx3d.beginPath();
      ctx3d.ellipse(sx * X(0.465), Y(-0.54), X(0.052), Y(0.032), sx * 0.18, 0, Math.PI * 2);
      ctx3d.fill();
      ctx3d.strokeStyle = '#061c3b';
      ctx3d.lineWidth = Math.max(1, cw * 0.006);
      ctx3d.stroke();
    }

    // Alerón trasero con soportes tipo cuello de cisne.
    ctx3d.fillStyle = '#0a0e13';
    for (const sx of [-1, 1]) {
      ctx3d.beginPath();
      ctx3d.moveTo(sx * X(0.215), Y(-0.61));
      ctx3d.lineTo(sx * X(0.255), Y(-0.855));
      ctx3d.lineTo(sx * X(0.295), Y(-0.855));
      ctx3d.lineTo(sx * X(0.265), Y(-0.60));
      ctx3d.closePath();
      ctx3d.fill();
    }
    ctx3d.fillStyle = '#0b1016';
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.51), Y(-0.88));
    ctx3d.lineTo(X(0.51), Y(-0.88));
    ctx3d.lineTo(X(0.48), Y(-0.825));
    ctx3d.lineTo(X(-0.48), Y(-0.825));
    ctx3d.closePath();
    ctx3d.fill();
    ctx3d.fillStyle = '#151b22';
    ctx3d.fillRect(X(-0.52), Y(-0.89), X(0.018), Y(0.075));
    ctx3d.fillRect(X(0.502), Y(-0.89), X(0.018), Y(0.075));
    ctx3d.fillStyle = 'rgba(255,255,255,.22)';
    ctx3d.fillRect(X(-0.49), Y(-0.876), X(0.98), Math.max(1, ch * 0.006));

    // Panel trasero negro, pilotos y marca.
    ctx3d.fillStyle = '#070b10';
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.35), Y(-0.39));
    ctx3d.lineTo(X(0.35), Y(-0.39));
    ctx3d.lineTo(X(0.31), Y(-0.25));
    ctx3d.lineTo(X(-0.31), Y(-0.25));
    ctx3d.closePath();
    ctx3d.fill();
    for (const sx of [-1, 1]) {
      ctx3d.fillStyle = 'rgba(148,12,20,.85)';
      ctx3d.fillRect(sx * X(0.25) - X(0.055), Y(-0.355), X(0.11), Y(0.047));
      ctx3d.fillStyle = '#ff3345';
      for (let k = 0; k < 3; k += 1) {
        ctx3d.globalAlpha = 0.72 + k * 0.12;
        ctx3d.fillRect(sx * X(0.25) - X(0.05) + k * X(0.031), Y(-0.348), X(0.018), Y(0.032));
      }
      ctx3d.globalAlpha = 1;
    }
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.textAlign = 'center';
    ctx3d.textBaseline = 'middle';
    ctx3d.font = `900 ${Math.max(5, cw * 0.048)}px system-ui, sans-serif`;
    ctx3d.fillText('GT', 0, Y(-0.335));

    // Paragolpes, difusor y escapes.
    ctx3d.fillStyle = '#111820';
    ctx3d.beginPath();
    ctx3d.moveTo(X(-0.40), Y(-0.13));
    ctx3d.lineTo(X(0.40), Y(-0.13));
    ctx3d.lineTo(X(0.36), Y(-0.01));
    ctx3d.lineTo(X(-0.36), Y(-0.01));
    ctx3d.closePath();
    ctx3d.fill();
    ctx3d.fillStyle = '#05080c';
    ctx3d.fillRect(X(-0.28), Y(-0.12), X(0.56), Y(0.085));
    for (let k = 0; k < 6; k += 1) {
      ctx3d.fillStyle = 'rgba(150,160,165,.20)';
      ctx3d.fillRect(X(-0.26 + k * 0.09), Y(-0.11), Math.max(1, cw * 0.008), Y(0.07));
    }
    // Doble escape central, como el GT4 de pista.
    for (const sx of [-1, 1]) {
      ctx3d.fillStyle = '#070a0d';
      ctx3d.beginPath();
      ctx3d.arc(sx * X(0.072), Y(-0.030), Math.max(3, cw * 0.030), 0, Math.PI * 2);
      ctx3d.fill();
      ctx3d.strokeStyle = 'rgba(198,206,208,.55)';
      ctx3d.lineWidth = Math.max(1, cw * 0.008);
      ctx3d.stroke();
      ctx3d.fillStyle = '#111820';
      ctx3d.beginPath();
      ctx3d.arc(sx * X(0.072), Y(-0.030), Math.max(1.4, cw * 0.015), 0, Math.PI * 2);
      ctx3d.fill();
    }
    // Neumáticos traseros asomando bajo el difusor.
    for (const sx of [-1, 1]) {
      ctx3d.fillStyle = '#04070a';
      ctx3d.beginPath();
      ctx3d.ellipse(sx * X(0.415), Y(-0.015), X(0.072), Y(0.082), 0, 0, Math.PI * 2);
      ctx3d.fill();
      ctx3d.fillStyle = '#1b242d';
      ctx3d.beginPath();
      ctx3d.ellipse(sx * X(0.415), Y(-0.012), X(0.034), Y(0.040), 0, 0, Math.PI * 2);
      ctx3d.fill();
    }
    ctx3d.fillStyle = '#0b1118';
    ctx3d.fillRect(X(-0.10), Y(-0.18), X(0.20), Y(0.07));
    ctx3d.strokeStyle = 'rgba(220,228,230,.28)';
    ctx3d.lineWidth = Math.max(1, cw * 0.004);
    ctx3d.strokeRect(X(-0.10), Y(-0.18), X(0.20), Y(0.07));
    ctx3d.fillStyle = '#dbeafe';
    ctx3d.font = `800 ${Math.max(4, cw * 0.033)}px system-ui, sans-serif`;
    ctx3d.fillText('GT4', 0, Y(-0.145));

    // Pilotos encendidos y reflejo en el asfalto.
    ctx3d.fillStyle = 'rgba(255,48,66,.10)';
    ctx3d.beginPath();
    ctx3d.ellipse(0, Y(0.04), cw * 0.34, ch * 0.05, 0, 0, Math.PI * 2);
    ctx3d.fill();

    // Logotipo del alerón.
    ctx3d.fillStyle = 'rgba(255,255,255,.62)';
    ctx3d.font = `800 ${Math.max(3, cw * 0.022)}px system-ui, sans-serif`;
    ctx3d.fillText('GT4', 0, Y(-0.928));

    ctx3d.restore();
  }

  function dibujarBotonControl3d(x, y, r, icono, accion, activo = false) {
    ctx3d.fillStyle = activo ? 'rgba(30,163,197,.92)' : 'rgba(10,14,20,.86)';
    ctx3d.beginPath();
    ctx3d.arc(x, y, r, 0, Math.PI * 2);
    ctx3d.fill();
    ctx3d.strokeStyle = activo ? 'rgba(119,234,255,.8)' : 'rgba(255,255,255,.14)';
    ctx3d.lineWidth = Math.max(1, r * 0.055);
    ctx3d.stroke();
    dibujarIconoControl3d(icono, x, y, r * 0.62, activo ? '#ffffff' : '#dbeafe');
    botones3d.push({ x, y, r: r + Math.max(3, r * 0.16), accion });
  }

  function dibujarIconoControl3d(tipo, x, y, r, color) {
    ctx3d.save();
    ctx3d.translate(x, y);
    ctx3d.strokeStyle = color;
    ctx3d.fillStyle = color;
    ctx3d.lineWidth = Math.max(1.4, r * 0.18);
    ctx3d.lineCap = 'round';
    ctx3d.lineJoin = 'round';
    if (tipo === 'plus' || tipo === 'minus') {
      ctx3d.beginPath(); ctx3d.moveTo(-r * 0.7, 0); ctx3d.lineTo(r * 0.7, 0); ctx3d.stroke();
      if (tipo === 'plus') { ctx3d.beginPath(); ctx3d.moveTo(0, -r * 0.7); ctx3d.lineTo(0, r * 0.7); ctx3d.stroke(); }
    } else if (tipo === 'mic') {
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(-r * 0.25, -r * 0.85, r * 0.5, r * 0.85, r * 0.25);
      else ctx3d.rect(-r * 0.25, -r * 0.85, r * 0.5, r * 0.85);
      ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.arc(0, -r * 0.06, r * 0.52, 0, Math.PI); ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.moveTo(0, r * 0.46); ctx3d.lineTo(0, r * 0.82); ctx3d.stroke();
    } else if (tipo === 'gear') {
      ctx3d.beginPath(); ctx3d.arc(0, 0, r * 0.33, 0, Math.PI * 2); ctx3d.stroke();
      for (let k = 0; k < 8; k += 1) {
        const a = k * Math.PI / 4;
        ctx3d.beginPath();
        ctx3d.moveTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46);
        ctx3d.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78);
        ctx3d.stroke();
      }
    } else if (tipo === 'fuel') {
      ctx3d.strokeRect(-r * 0.42, -r * 0.62, r * 0.62, r * 1.22);
      ctx3d.beginPath(); ctx3d.moveTo(r * 0.2, -r * 0.38); ctx3d.lineTo(r * 0.52, -r * 0.16); ctx3d.lineTo(r * 0.52, r * 0.43); ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.moveTo(-r * 0.28, -r * 0.38); ctx3d.lineTo(-r * 0.28, -r * 0.62); ctx3d.stroke();
    } else if (tipo === 'bell') {
      ctx3d.beginPath();
      ctx3d.moveTo(-r * 0.55, r * 0.25);
      ctx3d.quadraticCurveTo(-r * 0.38, r * 0.05, -r * 0.34, -r * 0.28);
      ctx3d.quadraticCurveTo(-r * 0.25, -r * 0.72, 0, -r * 0.72);
      ctx3d.quadraticCurveTo(r * 0.25, -r * 0.72, r * 0.34, -r * 0.28);
      ctx3d.quadraticCurveTo(r * 0.38, r * 0.05, r * 0.55, r * 0.25);
      ctx3d.closePath(); ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.arc(0, r * 0.46, r * 0.16, 0, Math.PI * 2); ctx3d.fill();
    } else if (tipo === 'center') {
      ctx3d.beginPath(); ctx3d.arc(0, 0, r * 0.57, 0, Math.PI * 2); ctx3d.stroke();
      ctx3d.beginPath(); ctx3d.arc(0, 0, r * 0.17, 0, Math.PI * 2); ctx3d.fill();
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        ctx3d.beginPath(); ctx3d.moveTo(dx * r * 0.75, dy * r * 0.75); ctx3d.lineTo(dx * r * 1.08, dy * r * 1.08); ctx3d.stroke();
      }
    } else if (tipo === 'sun' || tipo === 'moon') {
      if (tipo === 'sun') {
        ctx3d.beginPath(); ctx3d.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx3d.stroke();
        for (let k = 0; k < 8; k += 1) {
          const a = k * Math.PI / 4;
          ctx3d.beginPath(); ctx3d.moveTo(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52); ctx3d.lineTo(Math.cos(a) * r * 0.83, Math.sin(a) * r * 0.83); ctx3d.stroke();
        }
      } else {
        ctx3d.beginPath(); ctx3d.arc(-r * 0.07, 0, r * 0.55, Math.PI * 0.28, Math.PI * 1.42); ctx3d.stroke();
      }
    } else if (tipo === 'map') {
      ctx3d.strokeRect(-r * 0.62, -r * 0.52, r * 1.24, r * 1.04);
      ctx3d.beginPath();
      ctx3d.moveTo(-r * 0.22, -r * 0.52); ctx3d.lineTo(-r * 0.22, r * 0.52);
      ctx3d.moveTo(r * 0.22, -r * 0.52); ctx3d.lineTo(r * 0.22, r * 0.52);
      ctx3d.moveTo(-r * 0.62, 0); ctx3d.lineTo(r * 0.62, 0);
      ctx3d.stroke();
    } else if (tipo === 'close') {
      ctx3d.beginPath();
      ctx3d.moveTo(-r * 0.55, -r * 0.55); ctx3d.lineTo(r * 0.55, r * 0.55);
      ctx3d.moveTo(r * 0.55, -r * 0.55); ctx3d.lineTo(-r * 0.55, r * 0.55);
      ctx3d.stroke();
    } else if (tipo === 'star') {
      ctx3d.beginPath();
      for (let k = 0; k < 10; k += 1) {
        const a = -Math.PI / 2 + k * Math.PI / 5;
        const rr = k % 2 ? r * 0.32 : r * 0.78;
        if (k) ctx3d.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx3d.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx3d.closePath(); ctx3d.stroke();
    }
    ctx3d.restore();
  }

  function gasolineraGuardada3d(g) {
    return listaGasGuardadas3d().some(x => Math.abs(x.lat - g.lat) < 1e-5 && Math.abs(x.lon - g.lon) < 1e-5);
  }

  function alternarGasolineraGuardada3d(g) {
    const lista = listaGasGuardadas3d().filter(x => !(Math.abs(x.lat - g.lat) < 1e-5 && Math.abs(x.lon - g.lon) < 1e-5));
    if (!gasolineraGuardada3d(g)) {
      lista.unshift({ name: g.name, brand: g.brand || '', lat: g.lat, lon: g.lon, ts: Date.now() });
      avisoToast3d = `Gasolinera guardada: ${g.name}`;
    } else {
      avisoToast3d = `Gasolinera eliminada: ${g.name}`;
    }
    gasolinerasGuardadas3d = lista;
    guardarLista3d(CLAVE_GAS_3D, lista);
    avisoToast3dHasta = performance.now() + 3200;
  }

  async function abrirGasolineras3d() {
    if (panelGas3d) { panelGas3d = false; return; }
    panelGas3d = true;
    panelAvisos3d = false;
    const base = ultimaPos || (rutaActiva()?.geometry?.[0] ? { lat: rutaActiva().geometry[0][0], lon: rutaActiva().geometry[0][1] } : null);
    if (!base) {
      gasolinerasError = 'Necesito una posición GPS para buscar gasolineras.';
      return;
    }
    if (gasolineras3d.length || gasolinerasCargando) return;
    gasolinerasCargando = true;
    gasolinerasError = '';
    try {
      const r = await fetch(`/api/ruta/gasolineras?lat=${base.lat}&lon=${base.lon}&radio=15000`);
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || 'Error');
      gasolineras3d = (Array.isArray(datos.gasolineras) ? datos.gasolineras : [])
        .filter(g => Number.isFinite(g.lat) && Number.isFinite(g.lon))
        .map(g => ({ ...g, distancia: distancia(base.lat, base.lon, g.lat, g.lon) }))
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 6);
      if (!gasolineras3d.length) gasolinerasError = 'No hay gasolineras cerca en este momento.';
    } catch (_e) {
      gasolinerasError = 'No se pudieron cargar las gasolineras. Revisa la conexión.';
    } finally {
      gasolinerasCargando = false;
    }
  }

  function alternarAvisos3d() {
    if (panelAvisos3d) { panelAvisos3d = false; return; }
    panelAvisos3d = true;
    panelGas3d = false;
    avisos3dGuardados = leerLista3d(CLAVE_AVISOS_3D);
  }

  function guardarAviso3d(a) {
    if (!a || !a.id) return;
    const lista = leerLista3d(CLAVE_AVISOS_3D);
    if (lista.some(x => x.id === a.id)) return;
    lista.unshift({ id: a.id, kind: a.kind, label: a.label || 'Aviso', lat: a.lat, lon: a.lon, name: a.name || '', ts: Date.now() });
    guardarLista3d(CLAVE_AVISOS_3D, lista);
    avisos3dGuardados = null;
  }

  function dibujarPanelGasolineras3d(w, h, u) {
    const pw = Math.min(w - 24 * u, 360 * u);
    const ph = Math.min(h - 74 * u, 350 * u);
    const x = (w - pw) / 2;
    const y = Math.max(68 * u, (h - ph) / 2);
    panel3d(x, y, pw, ph, 18 * u, 0.96);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `900 ${17 * u}px system-ui, sans-serif`;
    ctx3d.fillText('Gasolineras cerca', x + 16 * u, y + 24 * u);
    ctx3d.fillStyle = '#93a8c0';
    ctx3d.font = `600 ${10.5 * u}px system-ui, sans-serif`;
    ctx3d.fillText('Toca para ir · ★ para guardar', x + 16 * u, y + 42 * u);
    ctx3d.strokeStyle = 'rgba(255,255,255,.08)';
    ctx3d.lineWidth = 1;
    ctx3d.beginPath(); ctx3d.moveTo(x + 12 * u, y + 54 * u); ctx3d.lineTo(x + pw - 12 * u, y + 54 * u); ctx3d.stroke();
    ctx3d.fillStyle = 'rgba(220,232,240,.9)';
    ctx3d.font = `700 ${11 * u}px system-ui, sans-serif`;
    ctx3d.textAlign = 'right';
    const lista = gasolineras3d;
    if (gasolinerasCargando) {
      ctx3d.textAlign = 'center';
      ctx3d.fillStyle = '#93c5fd';
      ctx3d.font = `600 ${13 * u}px system-ui, sans-serif`;
      ctx3d.fillText('Buscando gasolineras…', x + pw / 2, y + ph / 2);
    } else if (!lista.length) {
      ctx3d.textAlign = 'center';
      ctx3d.fillStyle = '#fca5a5';
      ctx3d.font = `600 ${12 * u}px system-ui, sans-serif`;
      ctx3d.fillText(gasolinerasError || 'No hay gasolineras cerca.', x + pw / 2, y + ph / 2);
    } else {
      const rowH = Math.min(48 * u, (ph - 72 * u) / Math.max(1, lista.length));
      lista.forEach((g, i) => {
        const ry = y + 62 * u + i * rowH;
        if (i % 2 === 0) {
          ctx3d.fillStyle = 'rgba(255,255,255,.035)';
          ctx3d.fillRect(x + 10 * u, ry, pw - 20 * u, rowH - 3 * u);
        }
        ctx3d.textAlign = 'left';
        ctx3d.fillStyle = '#f1f5f9';
        ctx3d.font = `700 ${12 * u}px system-ui, sans-serif`;
        ctx3d.fillText(textoCorto3d(g.name || 'Gasolinera', pw - 118 * u), x + 16 * u, ry + rowH * 0.36);
        ctx3d.fillStyle = '#93a8c0';
        ctx3d.font = `500 ${9.5 * u}px system-ui, sans-serif`;
        ctx3d.fillText(textoCorto3d([g.brand, g.address].filter(Boolean).join(' · ') || 'Combustible', pw - 118 * u), x + 16 * u, ry + rowH * 0.72);
        ctx3d.textAlign = 'right';
        ctx3d.fillStyle = '#67e8f9';
        ctx3d.font = `800 ${11.5 * u}px system-ui, sans-serif`;
        const d = Number.isFinite(g.distancia) ? g.distancia : null;
        ctx3d.fillText(d != null ? metros(d) : '', x + pw - 58 * u, ry + rowH * 0.5);
        const starX = x + pw - 29 * u;
        const starY = ry + rowH * 0.5;
        const guardada = gasolineraGuardada3d(g);
        if (guardada) {
          ctx3d.fillStyle = 'rgba(250,204,21,.18)';
          ctx3d.beginPath(); ctx3d.arc(starX, starY, 13 * u, 0, Math.PI * 2); ctx3d.fill();
        }
        dibujarIconoControl3d('star', starX, starY, 12 * u, guardada ? '#facc15' : '#93a8c0');
        botones3d.push({
          x: x + pw / 2,
          y: ry + rowH / 2,
          w: pw - 30 * u,
          h: rowH - 4 * u,
          accion: async () => {
            panelGas3d = false;
            await fijarDestino(g.lat, g.lon, g.name || 'Gasolinera');
            if (rutaActiva() && !navegando) alternarNavegacion();
          }
        });
        botones3d.push({ x: starX, y: starY, r: 17 * u, accion: () => alternarGasolineraGuardada3d(g) });
      });
    }
    const closeX = x + pw - 19 * u;
    const closeY = y + 19 * u;
    dibujarIconoControl3d('close', closeX, closeY, 9 * u, '#cbd5e1');
    botones3d.push({ x: closeX, y: closeY, r: 18 * u, accion: () => { panelGas3d = false; } });
  }

  function dibujarPanelAvisos3d(w, h, u) {
    const lista = leerLista3d(CLAVE_AVISOS_3D);
    const pw = Math.min(w - 24 * u, 350 * u);
    const ph = Math.min(h - 74 * u, 320 * u);
    const x = (w - pw) / 2;
    const y = Math.max(68 * u, (h - ph) / 2);
    panel3d(x, y, pw, ph, 18 * u, 0.96);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `900 ${17 * u}px system-ui, sans-serif`;
    ctx3d.fillText('Avisos guardados', x + 16 * u, y + 24 * u);
    ctx3d.fillStyle = '#93a8c0';
    ctx3d.font = `600 ${10.5 * u}px system-ui, sans-serif`;
    ctx3d.fillText(`${lista.length} aviso${lista.length === 1 ? '' : 's'} de la ruta`, x + 16 * u, y + 42 * u);
    ctx3d.strokeStyle = 'rgba(255,255,255,.08)';
    ctx3d.beginPath(); ctx3d.moveTo(x + 12 * u, y + 54 * u); ctx3d.lineTo(x + pw - 12 * u, y + 54 * u); ctx3d.stroke();
    if (!lista.length) {
      ctx3d.textAlign = 'center';
      ctx3d.fillStyle = '#93a8c0';
      ctx3d.font = `600 ${12 * u}px system-ui, sans-serif`;
      ctx3d.fillText('Aún no has pasado por ningún aviso.', x + pw / 2, y + ph / 2 - 8 * u);
      ctx3d.fillText('Se guardarán solos al acercarte.', x + pw / 2, y + ph / 2 + 14 * u);
    } else {
      const rowH = Math.min(42 * u, (ph - 74 * u) / Math.min(5, lista.length));
      lista.slice(0, 5).forEach((a, i) => {
        const ry = y + 62 * u + i * rowH;
        ctx3d.textAlign = 'left';
        ctx3d.fillStyle = '#f1f5f9';
        ctx3d.font = `700 ${11.5 * u}px system-ui, sans-serif`;
        ctx3d.fillText(textoCorto3d(a.label || a.name || 'Aviso', pw - 40 * u), x + 16 * u, ry + rowH * 0.4);
        ctx3d.fillStyle = '#93a8c0';
        ctx3d.font = `500 ${9 * u}px system-ui, sans-serif`;
        const cuando = a.ts ? new Date(a.ts).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
        ctx3d.fillText(`${cuando}${a.name ? ` · ${textoCorto3d(a.name, pw * 0.42)}` : ''}`, x + 16 * u, ry + rowH * 0.76);
      });
    }
    const closeX = x + pw - 19 * u;
    const closeY = y + 19 * u;
    dibujarIconoControl3d('close', closeX, closeY, 9 * u, '#cbd5e1');
    botones3d.push({ x: closeX, y: closeY, r: 18 * u, accion: () => { panelAvisos3d = false; } });
  }

  function dibujarHud3d(w, h) {
    botones3d = [];
    const u = Math.max(0.72, Math.min(1.24, h / 768));
    const ruta = rutaActiva();
    let s = ruta?.steps?.[paso] || ruta?.steps?.[0];
    // Al arrancar, OSRM suele dejar delante el paso "depart" con 0 m. Se
    // muestra la siguiente maniobra real para que la tarjeta no diga "en 0 m".
    if (s?.type === 'depart' && ruta?.steps?.[paso + 1]) s = ruta.steps[paso + 1];
    const conGps = Boolean(ultimaPos);
    const rest = ruta ? (conGps ? restante(ultimaPos.lat, ultimaPos.lon) : (ruta.distance || 0)) : 0;
    const segundosRestantes = segundosRestantesRuta(ruta, rest);
    const min = ruta && rest > 0 ? Math.max(1, Math.round(segundosRestantes / 60)) : 0;
    const llegada = ruta ? horaDeLlegada(segundosRestantes) : '--:--';
    const kmh = ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null;
    const calle = s?.name || ruta?.name || 'Calle o carretera';
    const compacto = w < 560 || h < 440;

    // Tarjeta superior: solo cuando la ruta ya está en marcha.
    if (navegando && ruta) {
      const cw = Math.min(w - 96 * u, 382 * u);
      const ch = 106 * u;
      const x = 12 * u;
      const y = 12 * u;
      panel3d(x, y, cw, ch, 16 * u, 0.91);
      ctx3d.fillStyle = 'rgba(255,255,255,.055)';
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(x, y, cw, ch, 16 * u);
      else ctx3d.rect(x, y, cw, ch);
      ctx3d.fill();
      dibujarIconoGiro3d(x + 30 * u, y + 47 * u, s?.modifier || s?.type || '', '#f8fafc', Math.max(0.85, 0.95 * u));
      const distM = conGps && Number.isFinite(s?.lat) ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon) : (s?.distance || rest || 0);
      ctx3d.textAlign = 'left';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.font = `800 ${15.5 * u}px system-ui, sans-serif`;
      ctx3d.fillText(textoCorto3d(textoGiro3d(s), cw - 74 * u), x + 58 * u, y + 42 * u);
      ctx3d.fillStyle = '#e2e8f0';
      ctx3d.font = `900 ${19 * u}px system-ui, sans-serif`;
      ctx3d.fillText(`en ${metros(distM)}`, x + 58 * u, y + 65 * u);
      ctx3d.fillStyle = '#94a3b8';
      ctx3d.font = `500 ${11 * u}px system-ui, sans-serif`;
      ctx3d.fillText(textoCorto3d(calle, cw - 74 * u), x + 58 * u, y + 90 * u);
      if (Number.isFinite(s?.exit)) {
        const et = `SALIDA ${s.exit}`;
        ctx3d.font = `800 ${10.5 * u}px system-ui, sans-serif`;
        const ew = ctx3d.measureText(et).width + 14 * u;
        const ex = x + cw - ew - 10 * u;
        const ey = y + 8 * u;
        ctx3d.fillStyle = 'rgba(6,95,70,.95)';
        ctx3d.beginPath();
        if (ctx3d.roundRect) ctx3d.roundRect(ex, ey, ew, 20 * u, 10 * u);
        else ctx3d.rect(ex, ey, ew, 20 * u);
        ctx3d.fill();
        ctx3d.fillStyle = '#d1fae5';
        ctx3d.textAlign = 'center';
        ctx3d.fillText(et, ex + ew / 2, ey + 10 * u);
      }
    }

    // Velocidad real del GPS y límite de la vía.
    const vw = Math.min(w * 0.30, 174 * u);
    const vh = 76 * u;
    const vx = 12 * u;
    const vy = h - vh - 12 * u;
    panel3d(vx, vy, vw, vh, 16 * u, 0.9);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'alphabetic';
    ctx3d.fillStyle = velocidad > (kmh || 999) + 5 && kmh ? '#fca5a5' : '#f8fafc';
    const velTxt = String(Math.round(velocidad));
    const anchoVel = Math.max(28 * u, (vx + vw - 57 * u) - (vx + 13 * u));
    let fuenteVel = vh * 0.54;
    ctx3d.font = `900 ${Math.round(fuenteVel)}px system-ui, sans-serif`;
    const anchoVelTxt = ctx3d.measureText(velTxt).width;
    if (anchoVelTxt > anchoVel) fuenteVel = Math.max(vh * 0.32, fuenteVel * anchoVel / anchoVelTxt);
    ctx3d.font = `900 ${Math.round(fuenteVel)}px system-ui, sans-serif`;
    ctx3d.fillText(velTxt, vx + 13 * u, vy + vh * 0.67);
    ctx3d.fillStyle = '#94a3b8';
    ctx3d.font = `700 ${Math.round(vh * 0.14)}px system-ui, sans-serif`;
    ctx3d.fillText(conGps ? 'km/h GPS' : 'km/h', vx + 13 * u, vy + vh * 0.87);
    const sr = 22 * u;
    const sx = vx + vw - 31 * u;
    const sy = vy + vh / 2;
    if (kmh) {
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.beginPath(); ctx3d.arc(sx, sy, sr, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = '#dc2626'; ctx3d.lineWidth = 4.5 * u;
      ctx3d.beginPath(); ctx3d.arc(sx, sy, sr * 0.8, 0, Math.PI * 2); ctx3d.stroke();
      ctx3d.fillStyle = '#0f172a';
      ctx3d.font = `900 ${16 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText(String(kmh), sx, sy + 1);
    } else {
      ctx3d.strokeStyle = 'rgba(148,163,184,.7)'; ctx3d.lineWidth = 2 * u;
      ctx3d.beginPath(); ctx3d.arc(sx, sy, sr * 0.82, 0, Math.PI * 2); ctx3d.stroke();
      ctx3d.fillStyle = '#94a3b8';
      ctx3d.font = `800 ${12 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText('?', sx, sy + 1);
    }

    // ETA y distancia restante, con la misma composición de la referencia.
    if (ruta) {
      const ew = Math.min(w - vw - 36 * u, 410 * u);
      const eh = 76 * u;
      const ex = vw + 22 * u;
      const ey = h - eh - 12 * u;
      panel3d(ex, ey, ew, eh, 17 * u, 0.91);
      ctx3d.strokeStyle = 'rgba(34,197,94,.9)';
      ctx3d.lineWidth = 3 * u;
      ctx3d.beginPath();
      ctx3d.moveTo(ex + 4 * u, ey + 9 * u);
      ctx3d.lineTo(ex + ew - 18 * u, ey + 9 * u);
      ctx3d.lineTo(ex + ew - 8 * u, ey + 5 * u);
      ctx3d.stroke();
      ctx3d.textAlign = 'left';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillStyle = '#94a3b8';
      ctx3d.font = `800 ${10.5 * u}px system-ui, sans-serif`;
      ctx3d.fillText('ETA', ex + 13 * u, ey + 27 * u);
      ctx3d.fillStyle = '#f8fafc';
      const horaX = ex + 39 * u;
      const fuenteHora = 16.5 * u;
      ctx3d.font = `900 ${fuenteHora}px system-ui, sans-serif`;
      const anchoHora = ctx3d.measureText(llegada).width;
      ctx3d.fillText(llegada, horaX, ey + 27 * u);
      ctx3d.textAlign = 'right';
      ctx3d.fillStyle = '#67e8f9';
      const distTxt = rest > 1000 ? `${(rest / 1000).toFixed(1)} km` : `${Math.round(rest)} m`;
      const textoDist = `${distTxt} · ${min ? `${min} min` : '-- min'}`;
      const derechaDist = ex + ew - 13 * u;
      const disponibleDist = Math.max(0, derechaDist - (horaX + anchoHora) - 8 * u);
      let fuenteDist = 13 * u;
      ctx3d.font = `800 ${fuenteDist}px system-ui, sans-serif`;
      const anchoDist = ctx3d.measureText(textoDist).width;
      if (anchoDist > disponibleDist) {
        fuenteDist = Math.max(9.5 * u, fuenteDist * disponibleDist / anchoDist);
      }
      ctx3d.font = `800 ${fuenteDist}px system-ui, sans-serif`;
      ctx3d.fillText(textoDist, derechaDist, ey + 27 * u);
      ctx3d.textAlign = 'center';
      ctx3d.fillStyle = '#e2e8f0';
      ctx3d.font = `700 ${12 * u}px system-ui, sans-serif`;
      ctx3d.fillText(textoCorto3d(calle, ew - 28 * u), ex + ew / 2, ey + 56 * u);
    }

    if (navegando) {
      // Brújula.
      const cxBru = w - 42 * u;
      const cyBru = 39 * u;
      const rBru = Math.min(31 * u, h * 0.09);
      ctx3d.fillStyle = 'rgba(10,13,18,.86)';
      ctx3d.beginPath(); ctx3d.arc(cxBru, cyBru, rBru, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = 'rgba(255,255,255,.16)'; ctx3d.lineWidth = 1.4 * u; ctx3d.stroke();
      ctx3d.save();
      ctx3d.translate(cxBru, cyBru);
      ctx3d.rotate(((rumbo || 0) * Math.PI) / 180);
      ctx3d.fillStyle = '#ef4444';
      ctx3d.beginPath(); ctx3d.moveTo(0, -rBru * 0.62); ctx3d.lineTo(rBru * 0.17, 0); ctx3d.lineTo(-rBru * 0.17, 0); ctx3d.closePath(); ctx3d.fill();
      ctx3d.fillStyle = '#e2e8f0';
      ctx3d.beginPath(); ctx3d.moveTo(0, rBru * 0.62); ctx3d.lineTo(rBru * 0.17, 0); ctx3d.lineTo(-rBru * 0.17, 0); ctx3d.closePath(); ctx3d.fill();
      ctx3d.restore();
      ctx3d.fillStyle = '#f8fafc'; ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.font = `800 ${11 * u}px system-ui, sans-serif`;
      ctx3d.fillText('N', cxBru, cyBru - rBru * 0.6);

      // Controles táctiles.
      const bx = w - 27 * u;
      const rB = Math.min(19 * u, Math.max(13, h * 0.041));
      const top = Math.max(78 * u, cyBru + rBru + 14 * u);
      const bottom = h - 156 * u;
      const paso = Math.max(22 * u, Math.min(39 * u, (bottom - top) / 8));
      const acciones = [
        ['plus', () => { zoomFondo3d = Math.min(1.55, zoomFondo3d + 0.08); }, false],
        ['minus', () => { zoomFondo3d = Math.max(0.85, zoomFondo3d - 0.08); }, false],
        ['mic', () => document.getElementById('rutaMicro')?.click(), false],
        ['gear', () => document.getElementById('menuBtn')?.click(), false],
        ['fuel', () => abrirGasolineras3d(), panelGas3d],
        ['bell', () => alternarAvisos3d(), panelAvisos3d],
        [modoNoche3d ? 'sun' : 'moon', () => { modoNoche3d = !modoNoche3d; }, modoNoche3d],
        ['map', () => detener3d(), false]
      ];
      acciones.forEach(([tipo, accion, activo], i) => {
        dibujarBotonControl3d(bx, top + i * paso, rB, tipo, accion, activo);
      });
      // Centrar y gasolinera como en la botonera inferior de la referencia.
      if (w > 700 && h > 440) {
        dibujarBotonControl3d(w - 88 * u, h - 48 * u, rB, 'center', () => document.getElementById('rutaGps')?.click(), false);
        dibujarBotonControl3d(w - 142 * u, h - 48 * u, rB, 'fuel', () => abrirGasolineras3d(), panelGas3d);
      }
    } else if (ruta) {
      // Antes de arrancar, la búsqueda manda: un único botón para iniciar.
      const bw = Math.min(w - 40 * u, 250 * u);
      const bh = 42 * u;
      const bx = (w - bw) / 2;
      const by = h - 188 * u;
      ctx3d.fillStyle = 'rgba(22,163,74,.94)';
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(bx, by, bw, bh, 21 * u);
      else ctx3d.rect(bx, by, bw, bh);
      ctx3d.fill();
      ctx3d.fillStyle = '#f0fdf4';
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.font = `900 ${13 * u}px system-ui, sans-serif`;
      ctx3d.fillText('▶ INICIAR NAVEGACIÓN', bx + bw / 2, by + bh / 2 + 1);
      botones3d.push({ x: bx + bw / 2, y: by + bh / 2, w: bw, h: bh, accion: () => { if (!navegando) alternarNavegacion(); } });
    }

    if (panelGas3d) dibujarPanelGasolineras3d(w, h, u);
    if (panelAvisos3d) dibujarPanelAvisos3d(w, h, u);

    if (avisoToast3d && performance.now() < avisoToast3dHasta) {
      const tw = Math.min(w - 30 * u, 360 * u);
      const th = 34 * u;
      const tx = (w - tw) / 2;
      const ty = Math.max(66 * u, h * 0.16);
      ctx3d.fillStyle = 'rgba(8,17,28,.94)';
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(tx, ty, tw, th, 12 * u);
      else ctx3d.rect(tx, ty, tw, th);
      ctx3d.fill();
      ctx3d.strokeStyle = 'rgba(56,225,255,.35)'; ctx3d.lineWidth = 1; ctx3d.stroke();
      ctx3d.fillStyle = '#bff0ff'; ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.font = `700 ${11 * u}px system-ui, sans-serif`;
      ctx3d.fillText(textoCorto3d(avisoToast3d, tw - 24 * u), w / 2, ty + th / 2);
    }

    if (!conGps && ruta) {
      const tw = Math.min(w - 30 * u, 320 * u);
      const th = 28 * u;
      ctx3d.fillStyle = 'rgba(35,10,16,.92)';
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect((w - tw) / 2, h * 0.46, tw, th, 9 * u);
      else ctx3d.rect((w - tw) / 2, h * 0.46, tw, th);
      ctx3d.fill();
      ctx3d.fillStyle = '#fca5a5';
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.font = `700 ${11 * u}px system-ui, sans-serif`;
      ctx3d.fillText('SIN SEÑAL GPS · posición no disponible', w / 2, h * 0.46 + th / 2);
    }
    if (recalculando) {
      const tw = Math.min(w - 30 * u, 270 * u);
      const th = 27 * u;
      ctx3d.fillStyle = 'rgba(35,27,7,.92)';
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect((w - tw) / 2, h * 0.54, tw, th, 9 * u);
      else ctx3d.rect((w - tw) / 2, h * 0.54, tw, th);
      ctx3d.fill();
      ctx3d.fillStyle = '#fbbf24';
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.font = `700 ${11 * u}px system-ui, sans-serif`;
      ctx3d.fillText('↻ RECALCULANDO RUTA…', w / 2, h * 0.54 + th / 2);
    }
  }

  function textoGiro3d(s) {
    if (!s) return 'Continúa recto';
    if (s.type === 'arrive') return 'Llegada al destino';
    if (s.type === 'roundabout' || s.type === 'rotary') return 'Toma la rotonda';
    if (s.type === 'merge') return 'Incorpórate a la vía';
    if (s.type === 'fork') return 'Coge el desvío';
    if (s.type === 'end of road') return 'Al final de la vía';
    const m = String(s.modifier || '');
    if (/left/.test(m)) return 'Gira a la izquierda';
    if (/right/.test(m)) return 'Gira a la derecha';
    if (/uturn/.test(m)) return 'Cambio de sentido';
    return 'Continúa recto';
  }

  function dibujar3d() {
    if (!ctx3d || !canvas3d) return;
    const cw = canvas3d.clientWidth || window.innerWidth;
    const ch = canvas3d.clientHeight || window.innerHeight;
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const pw = Math.max(1, Math.round(cw * dpr));
    const ph = Math.max(1, Math.round(ch * dpr));
    if (canvas3d.width !== pw || canvas3d.height !== ph) {
      canvas3d.width = pw;
      canvas3d.height = ph;
    }
    ctx3d.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cw;
    const h = ch;
    ultimoFrame3d = performance.now();
    const ruta = rutaActiva();
    const firma = ruta ? `${ruta.distance}|${ruta.duration}|${ruta.geometry?.length}|${ruta.geometry?.[0]?.join(',')}` : 'demo';
    if (firma !== firmaRuta3d) {
      carretera3d = generarCarretera3d();
      firmaRuta3d = firma;
    }
    const idx = indiceActual3d();
    const tipo = tipoVia3dActual(idx);
    if (tipo !== tipoVia3dAnterior) {
      tipoVia3dAnterior = tipo;
      avisoToast3d = etiquetaTipoVia3d(tipo);
      avisoToast3dHasta = performance.now() + 4200;
    }
    tipoVia3d = tipo;
    const horizonte = h * (tipo === 'autovia' ? 0.31 : tipo === 'ciudad' || tipo === 'pueblo' ? 0.40 : tipo === 'montana' ? 0.28 : 0.33);
    trazado3d = construirTrazado3d(idx, w, h, horizonte, w / 2);
    if (!trazado3d.length) return;
    dibujarFondoDetalle3d(w, h, horizonte, tipo);
    dibujarEntornoDetalle3d(w, h, horizonte, tipo);
    dibujarCalzadaDetalle3d(w, h, horizonte, tipo);
    dibujarMobiliarioUrbano3d(w, h, tipo);
    dibujarTrafico3d(w, h, tipo);
    dibujarSenalesDetalle3d(w, h, horizonte);
    dibujarCocheGt4Detalle3d(w, h);
    dibujarHud3d(w, h);
  }

  function alPulsar3d(e) {
    if (!canvas3d) return;
    const rect = canvas3d.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    for (let i = botones3d.length - 1; i >= 0; i -= 1) {
      const b = botones3d[i];
      const dentro = b.w && b.h
        ? Math.abs(x - b.x) <= b.w / 2 && Math.abs(y - b.y) <= b.h / 2
        : Math.hypot(x - b.x, y - b.y) <= (b.r || 0) + 6;
      if (dentro) { b.accion?.(); return; }
    }
  }

  function iniciar3d() {
    if (!init3d()) return;
    idx3dSuave = null;
    // Un solo modo de vista a la vez: si AR está abierto, se cierra.
    if (typeof vistaArActiva !== 'undefined' && vistaArActiva && typeof detenerAr === 'function') detenerAr();
    vista3dActiva = true;
    zoomFondo3d = 1;
    // El 3D no pide cámara: la carretera, el coche y el entorno se generan
    // con la geometría real de la ruta. La cámara queda solo para el ADAS.
    document.getElementById('ruta3dToggle')?.classList.add('activo');
    document.getElementById('ruta3dToggle')?.setAttribute('aria-pressed', 'true');
    document.querySelector('.ruta-shell')?.classList.add('ruta-3d-activo');
    // La búsqueda y el HUD caben en cualquier orientación. No se fuerza
    // pantalla completa ni landscape al entrar: eso impedía escribir cómodo.
    canvas3d.hidden = false;
    canvas3d.width = canvas3d.clientWidth || window.innerWidth;
    canvas3d.height = canvas3d.clientHeight || window.innerHeight;
    canvas3d.onclick = alPulsar3d;
    // ~30 fps: suficiente para la escena y ahorra CPU/batería en móviles.
    const loop = (ts = 0) => {
      if (!vista3dActiva) return;
      if (!ultimoPintado3d || ts - ultimoPintado3d >= 33) {
        ultimoPintado3d = ts;
        dibujar3d();
      }
      animacion3d = requestAnimationFrame(loop);
    };
    ultimoPintado3d = 0;
    loop();
  }

  function detener3d() {
    vista3dActiva = false;
    if (animacion3d) cancelAnimationFrame(animacion3d);
    animacion3d = null;
    panelGas3d = false;
    panelAvisos3d = false;
    document.getElementById('ruta3dToggle')?.classList.remove('activo');
    document.getElementById('ruta3dToggle')?.setAttribute('aria-pressed', 'false');
    document.querySelector('.ruta-shell')?.classList.remove('ruta-3d-activo');
    if (canvas3d) canvas3d.hidden = true;
    detenerVisionCompartida();
    deteccionesAr = [];
    carrilSuave = null;
    carrilInfo = null;
    bufferL = [];
    bufferR = [];
    senalInfo = null;
    senalTexto = '';
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
  let obstaculosVision = [];
  let siguienteTrackId = 1;
  let avisosObjetos = new Map();
  let ultimoAnalisisAr = 0;
  let ultimoAvisoObjeto = 0;
  let loopVision = 0;
  let ultimoObjetoVision = 0;
  let moduloCabina3d = null;
  let cabina3dLista = false;
  let cabinaFotoLista = false;
  let arCristalImgY = 420;

  // La foto GT4 ya trae el interior completo; solo hay que cargarla y dejar
  // que su parabrisas transparente muestre la cámara. La 3D queda de respaldo.
  function medirCristalFoto(foto) {
    try {
      const c = document.createElement('canvas');
      c.width = foto.naturalWidth; c.height = foto.naturalHeight;
      const g = c.getContext('2d');
      g.drawImage(foto, 0, 0);
      const x = Math.round(c.width * 0.5);
      const data = g.getImageData(x, 0, 1, c.height).data;
      let ultimoTransparente = 0;
      for (let y = 0; y < c.height; y++) {
        const alpha = data[y * 4 + 3];
        if (alpha < 40) ultimoTransparente = y;
        else if (y > ultimoTransparente + 30 && ultimoTransparente > 80) break;
      }
      if (ultimoTransparente > 80) arCristalImgY = ultimoTransparente;
    } catch (_e) { /* se usa la altura de reserva */ }
  }

  // Altura real del borde inferior del cristal en píxeles del canvas AR.
  function baseCristalAr(h) {
    const foto = document.getElementById('rutaCabinaFoto');
    if (!foto || !foto.naturalWidth || !foto.clientWidth) return h * 0.42;
    // La foto se escala al 0.78 en CSS (transform) para alejar el habitáculo;
    // el cálculo del cristal debe seguir ese mismo factor o las líneas caen
    // fuera del parabrisas.
    const escalaCss = Math.max(foto.clientWidth / foto.naturalWidth, foto.clientHeight / foto.naturalHeight);
    const offsetY = foto.clientHeight - foto.naturalHeight * escalaCss;
    const yCss = offsetY + arCristalImgY * escalaCss;
    const factor = h / (canvasAr?.clientHeight || h);
    return Math.max(h * 0.24, Math.min(h * 0.48, yCss * factor));
  }

  function prepararCabinaFoto() {
    const foto = document.getElementById('rutaCabinaFoto');
    if (!foto) { montarCabina3d(); return; }
    const lista = () => {
      foto.classList.add('foto-lista');
      document.querySelector('.ruta-shell')?.classList.add('ruta-foto-activa');
      cabinaFotoLista = true;
      medirCristalFoto(foto);
    };
    if (foto.complete && foto.naturalWidth) { lista(); return; }
    foto.addEventListener('load', lista, { once: true });
    foto.addEventListener('error', () => { montarCabina3d(); }, { once: true });
  }

  async function montarCabina3d() {
    if (cabina3dLista) return;
    try {
      moduloCabina3d = await import('/js/cabina3d.js?v=20261126c');
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
  let arPitchDesde = 0;
  let arAvisoCalib = 0;
  let arPitchAnunciado = false;

  function onOrientacion(e) {
    if (e.alpha == null && e.beta == null) return;
    arSensoresOk = true;
    if (arBaseAlpha == null) { arBaseAlpha = e.alpha || 0; arBaseBeta = e.beta || 0; }
    let da = (e.alpha || 0) - arBaseAlpha;
    while (da > 180) da -= 360;
    while (da < -180) da += 360;
    arHeadingRel = da;
    arPitchRel = (e.beta || 0) - arBaseBeta;
    // Si el soporte se inclina de forma sostenida, la calibración deja de ser válida.
    const ahora = Date.now();
    if (Math.abs(arPitchRel) > 22) {
      if (!arPitchDesde) arPitchDesde = ahora;
      if (!arPitchAnunciado && ahora - arPitchDesde > 1500 && ahora - arAvisoCalib > 30000) {
        arPitchAnunciado = true;
        arAvisoCalib = ahora;
        avisar('El soporte se ha movido. Recalibra el AR con 🎯.', 'aviso', 6000);
      }
    } else if (Math.abs(arPitchRel) < 10) {
      arPitchDesde = 0;
      arPitchAnunciado = false;
    }
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
    arPitchDesde = 0;
    arPitchAnunciado = false;
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
    arPitchDesde = 0;
    arPitchAnunciado = false;
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
  let senalCandidata = null;
  let senalCandidataDesde = 0;
  let senalInfoHasta = 0;
  let ultimoAnalisisVision = 0;
  let arInicio = 0;
  let ultimoAvisoCarril = 0;
  let ultimoIntentoTexto = 0;
  let senalTexto = '';
  let senalAvisada = '';

  function initVision() {
    if (lienzoVision) return;
    lienzoVision = document.createElement('canvas');
    lienzoVision.width = VW;
    lienzoVision.height = VH;
    ctxVision = lienzoVision.getContext('2d', { willReadFrequently: true });
  }

  // Un único bucle de visión para AR y 3D: analiza carriles/señales y lanza
  // COCO-SSD; las dos vistas solo pintan el estado compartido.
  // TF.js y COCO-SSD pesan ~291 KB y solo se usan en AR/3D: se cargan al abrir
  // esas vistas. La portada ya no descarga el CDN; si falla, la guía y las
  // señales siguen funcionando y se avisa una sola vez.
  let cargandoCoco = null;

  function cargarScript(src, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const ya = [...document.scripts].find(s => s.src === src);
      if (ya && ya.dataset.cargado === '1') return resolve();
      let s = ya;
      if (!s) {
        s = document.createElement('script');
        s.src = src;
        s.async = true;
        document.head.appendChild(s);
      }
      const reloj = setTimeout(() => reject(new Error(`tiempo agotado: ${src}`)), timeout);
      s.addEventListener('load', () => { clearTimeout(reloj); s.dataset.cargado = '1'; resolve(); }, { once: true });
      s.addEventListener('error', () => { clearTimeout(reloj); reject(new Error(`no se pudo cargar: ${src}`)); }, { once: true });
    });
  }

  function asegurarModeloCoco() {
    if (modeloCoco) return Promise.resolve(modeloCoco);
    if (cargandoCoco) return cargandoCoco;
    const arranque = (async () => {
      if (typeof cocoSsd === 'undefined') {
        if (typeof tf === 'undefined') {
          await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
        }
        await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
      }
      if (typeof cocoSsd === 'undefined') throw new Error('COCO-SSD no disponible');
      const m = await cocoSsd.load();
      modeloCoco = m;
      avisar('Detección de objetos activada.', 'ok', 3000);
      return m;
    })().catch(err => {
      console.warn('COCO-SSD no disponible:', err?.message || err);
      avisar('Sin detección de objetos (no se pudo cargar el modelo). La guía de carril y las señales siguen activas.', 'info', 6000);
      return null;
    }).finally(() => { cargandoCoco = null; });
    cargandoCoco = arranque;
    return arranque;
  }

  function iniciarVisionCompartida() {
    if (loopVision) return;
    const paso = () => {
      if (!vistaArActiva && !vista3dActiva) { loopVision = 0; return; }
      const ahora = Date.now();
      const v = videoAr;
      if (v && v.readyState >= 2 && v.videoWidth) {
        const intervalo = (ahora - arInicio) < 3000 ? 200 : 300;
        if (ahora - ultimoAnalisisVision > intervalo) {
          ultimoAnalisisVision = ahora;
          analizarVision(ahora);
        }
        if (modeloCoco && ahora - ultimoObjetoVision > 500) {
          ultimoObjetoVision = ahora;
          modeloCoco.detect(v)
            .then(preds => { deteccionesAr = estabilizarDetecciones(preds, ahora); })
            .catch(() => {});
        }
      }
      loopVision = requestAnimationFrame(paso);
    };
    loopVision = requestAnimationFrame(paso);
  }

  function detenerVisionCompartida() {
    if (loopVision) cancelAnimationFrame(loopVision);
    loopVision = 0;
    ultimoObjetoVision = 0;
    ultimoAnalisisAr = 0;
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

  function centroCaja(b) {
    return [b[0] + b[2] / 2, b[1] + b[3] / 2];
  }

  // COCO no trae la clase «cono». Se detecta un naranja compacto y vertical
  // en la mitad inferior; se exige que aparezca dos fotogramas seguidos para
  // no avisar de una camiseta o de un piloto. Es conservador a propósito.
  function actualizarConosVision(candidatos, ahora) {
    const previos = obstaculosVision.filter(o => o.class === 'cone');
    const usados = new Set();
    const salida = [];
    const vw = videoAr?.videoWidth || 640;
    const vh = videoAr?.videoHeight || 480;
    for (const c of candidatos) {
      let mejor = -1;
      let mejorPunt = 0;
      previos.forEach((prev, i) => {
        if (usados.has(i)) return;
        const solape = iouCajas(prev.bbox, c.bbox);
        const [pcx, pcy] = centroCaja(prev.bbox);
        const [ncx, ncy] = centroCaja(c.bbox);
        const dist = Math.hypot((pcx - ncx) / vw, (pcy - ncy) / vh);
        const punt = solape + Math.max(0, 1 - dist / 0.25) * 0.2;
        if ((solape > 0.04 || dist < 0.2) && punt > mejorPunt) {
          mejorPunt = punt;
          mejor = i;
        }
      });
      const prev = mejor >= 0 ? previos[mejor] : null;
      if (prev) usados.add(mejor);
      salida.push({
        class: 'cone',
        score: c.score,
        bbox: c.bbox,
        lastSeen: ahora,
        trackId: prev?.trackId || `obj-${siguienteTrackId++}`,
        visto: prev ? (prev.visto || 1) + 1 : 1
      });
    }
    previos.forEach((prev, i) => {
      if (!usados.has(i) && ahora - (prev.lastSeen || 0) < 700) salida.push(prev);
    });
    obstaculosVision = salida.slice(0, 4);
  }

  function detectarConosVision(datos, ahora) {
    const y0 = Math.round(VH * 0.55);
    const mascara = new Uint8Array(VW * VH);
    let naranjas = 0;
    for (let y = y0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        const i = (y * VW + x) * 4;
        const r = datos[i], g = datos[i + 1], b = datos[i + 2];
        if (r > 165 && g > 45 && g < 175 && b < 95 && r - g > 40 && g - b > 5) {
          mascara[y * VW + x] = 1;
          naranjas++;
        }
      }
    }
    if (naranjas < 6) { actualizarConosVision([], ahora); return; }
    const visto = new Uint8Array(VW * VH);
    const candidatos = [];
    for (let y = y0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        const idx = y * VW + x;
        if (!mascara[idx] || visto[idx]) continue;
        const pila = [idx];
        visto[idx] = 1;
        let area = 0, minX = x, maxX = x, minY = y, maxY = y;
        while (pila.length) {
          const p = pila.pop();
          const py = Math.floor(p / VW), px = p - py * VW;
          area++;
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py < minY) minY = py;
          if (py > maxY) maxY = py;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || nx >= VW || ny < 0 || ny >= VH) continue;
            const nIdx = ny * VW + nx;
            if (mascara[nIdx] && !visto[nIdx]) { visto[nIdx] = 1; pila.push(nIdx); }
          }
        }
        const ancho = maxX - minX + 1, alto = maxY - minY + 1;
        const relleno = area / (ancho * alto);
        const ratio = ancho / alto;
        if (area < 8 || area > 500 || ancho < 2 || ancho > 24 || alto < 4 || alto > 42) continue;
        if (ratio < 0.2 || ratio > 1.1 || relleno < 0.22 || maxY < VH * 0.62) continue;
        const vw = videoAr?.videoWidth || 640;
        const vh = videoAr?.videoHeight || 480;
        candidatos.push({
          bbox: [minX / VW * vw, minY / VH * vh, ancho / VW * vw, alto / VH * vh],
          score: Math.min(0.95, 0.45 + area / 220)
        });
      }
    }
    candidatos.sort((a, b) => b.score - a.score);
    actualizarConosVision(candidatos.slice(0, 2), ahora);
  }

  // Carteles de corte/obra: se leen con la API de texto del navegador cuando
  // hay una señal roja estable. Se avisa una sola vez por cartel.
  function avisarSenal(texto) {
    const t = String(texto || '').toUpperCase().trim();
    if (!t || t === senalAvisada) return;
    if (/CORTE|CORTADA|CERRAD|OBRA|DESVIO|DESVÍO/.test(t)) {
      senalAvisada = t;
      decir('Calle cortada u obras. Reduce la velocidad.');
    } else if (/STOP|CEDA/.test(t)) {
      senalAvisada = t;
      decir('Señal de stop. Reduce la velocidad.');
    }
  }

  function analizarVision(ahora) {
    initVision();
    if (!ctxVision || !videoAr || videoAr.readyState < 2 || !videoAr.videoWidth) return;
    ctxVision.drawImage(videoAr, 0, 0, VW, VH);
    let datos;
    try { datos = ctxVision.getImageData(0, 0, VW, VH).data; } catch (_e) { return; }

    // Máscara de rojos de la mitad superior. Se agrupan por componentes
    // conexas para que dos señales o un piloto no se fundan en una caja
    // gigante que luego no coincide con ninguna señal real.
    const mascaraRoja = new Uint8Array(VW * VH);
    let rojos = 0;
    for (let y = 0; y < VH; y++) {
      for (let x = 0; x < VW; x++) {
        const i = (y * VW + x) * 4;
        const r = datos[i], g = datos[i + 1], b = datos[i + 2];
        if (y < VH * 0.55 && r > 135 && r - g > 55 && r - b > 55) {
          mascaraRoja[y * VW + x] = 1;
          rojos++;
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
      // Umbral adaptativo por fila: con sol directo o sombra, un 150 fijo
      // perdía el carril. Se toma el brillo máximo de la fila y se exige un
      // porcentaje alto, con suelo y techo para no detectar asfalto claro.
      let brilloFila = 0;
      for (let x = 2; x < VW - 2; x++) {
        const i = (y * VW + x) * 4;
        brilloFila = Math.max(brilloFila, datos[i], datos[i + 1], datos[i + 2]);
      }
      const umbralClaro = Math.max(118, Math.min(205, brilloFila * 0.62));
      for (let x = 2; x < VW - 2; x++) {
        const i = (y * VW + x) * 4;
        const r = datos[i], g = datos[i + 1], b = datos[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        if (mx > umbralClaro && (mx - mn) < 45) { if (ini < 0) ini = x; }
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

    // Señal: componente roja compacta, aproximadamente cuadrada. Se exige
    // estabilidad temporal (~0,7 s en la misma zona) para no marcar objetos
    // rojos pasajeros (pilotos, ropa, un coche rojo).
    let detectada = null;
    if (rojos > 40) {
      const visto = new Uint8Array(VW * VH);
      for (let y = 0; y < VH; y++) {
        for (let x = 0; x < VW; x++) {
          const idx = y * VW + x;
          if (!mascaraRoja[idx] || visto[idx]) continue;
          const pila = [idx];
          visto[idx] = 1;
          let area = 0, minX = x, maxX = x, minY = y, maxY = y;
          while (pila.length) {
            const p = pila.pop();
            const py = Math.floor(p / VW), px = p - py * VW;
            area++;
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = px + dx, ny = py + dy;
              if (nx < 0 || nx >= VW || ny < 0 || ny >= VH) continue;
              const nIdx = ny * VW + nx;
              if (mascaraRoja[nIdx] && !visto[nIdx]) { visto[nIdx] = 1; pila.push(nIdx); }
            }
          }
          const ancho = maxX - minX + 1, alto = maxY - minY + 1;
          const relleno = area / (ancho * alto);
          const ratio = ancho / alto;
          if (area < 45 || ancho < 8 || alto < 8 || ratio < 0.55 || ratio > 1.8 || relleno < 0.18) continue;
          const score = area * relleno;
          if (!detectada || score > detectada.score) {
            detectada = { x: minX, y: minY, w: ancho, h: alto, score };
          }
        }
      }
    }
    if (detectada) {
      const cxD = detectada.x + detectada.w / 2;
      const cyD = detectada.y + detectada.h / 2;
      const mismaZona = senalCandidata
        && Math.abs((senalCandidata.x + senalCandidata.w / 2) - cxD) < VW * 0.18
        && Math.abs((senalCandidata.y + senalCandidata.h / 2) - cyD) < VH * 0.18;
      if (!mismaZona) { senalCandidata = detectada; senalCandidataDesde = ahora; }
      else senalCandidata = detectada;
      if (senalCandidataDesde && ahora - senalCandidataDesde > 650) {
        senalInfo = detectada;
        senalInfoHasta = ahora + 1200;
      }
    } else {
      senalCandidata = null;
      senalCandidataDesde = 0;
      if (ahora > senalInfoHasta) senalInfo = null;
      if (!senalInfo && ahora - senalInfoHasta > 2500) {
        senalTexto = '';
        senalAvisada = '';
      }
    }

    // Lectura opcional del número con la API de texto del navegador (si existe).
    if (senalInfo && 'TextDetector' in window && ahora - ultimoIntentoTexto > 2500) {
      ultimoIntentoTexto = ahora;
      try {
        const det = new window.TextDetector();
        det.detect(videoAr).then(lista => {
          const txt = (lista || []).map(t => String(t.rawValue || '').toUpperCase()).join(' ').replace(/\s+/g, ' ').trim();
          const num = txt.match(/\b(10|20|30|40|50|60|70|80|90|100|110|120|130)\b/);
          const clave = txt.match(/\b(CORTE|CORTADA|CERRAD[OA]|OBRA|DESVIO|DESVÍO|STOP|CEDA)\b/);
          if (clave) {
            senalTexto = clave[0];
            avisarSenal(clave[0]);
          } else if (num) {
            senalTexto = num[0];
          }
        }).catch(() => {});
      } catch (_e) { /* sin lector de texto */ }
    }

    detectarConosVision(datos, ahora);
  }

  function dibujarVision(w, h) {
    // Carriles suavizados, reproyectados desde la vista normalizada.
    if (carrilSuave && carrilInfo && carrilInfo.ok && carrilSuave.conf > 0.22) {
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
        return mapearVisionPunto((VW / 2) + (u * ancho) / 2, y, w, h);
      };
      ctxAr.save();
      ctxAr.lineWidth = Math.max(2.5, w * 0.008);
      ctxAr.lineCap = 'round';
      ctxAr.lineJoin = 'round';
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
      const caja = mapearVisionRect(senalInfo.x, senalInfo.y, senalInfo.w, senalInfo.h, w, h);
      const x = caja.x, y = caja.y, an = caja.w, al = caja.h;
      ctxAr.strokeStyle = 'rgba(255,77,109,.9)';
      ctxAr.lineWidth = 2;
      ctxAr.strokeRect(x, y, an, al);
      ctxAr.fillStyle = 'rgba(255,77,109,.9)';
      ctxAr.font = `bold ${Math.max(9, w * 0.025)}px sans-serif`;
      ctxAr.textAlign = 'left';
      ctxAr.textBaseline = 'alphabetic';
      ctxAr.fillText(senalTexto ? `Señal cámara: ${senalTexto} (OCR)` : 'Señal (cámara)', x, Math.max(12, y - 5));
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
    // El ADAS es solo cámara: cualquier cabina/volante de una versión anterior
    // se elimina del DOM antes de pedir permiso, no se deja oculta detrás.
    document.getElementById('rutaCabinaFoto')?.remove();
    document.getElementById('rutaCabina3d')?.remove();
    if (moduloCabina3d) {
      try { moduloCabina3d.apagar(); } catch (_e) { /* nada */ }
      moduloCabina3d = null;
      cabina3dLista = false;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      avisar('Tu navegador no soporta cámara. Usa Chrome actualizado.', 'error', 8000);
      return;
    }
    avisar('Activando cámara...', 'info', 2000);
    try {
      let constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 960 }
        },
        audio: false
      };
      try {
        streamAr = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (e1) {
        // Reintento sin preferencia de cámara ni resolución: algunos móviles
        // rechazan la combinación exacta de constraints.
        streamAr = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      videoAr.srcObject = streamAr;
      await videoAr.play().catch(() => {});
      vistaArActiva = true;
      const botonAr = document.getElementById('rutaArToggle');
      botonAr?.classList.add('activo');
      botonAr?.setAttribute('aria-pressed', 'true');
      if (botonAr) {
        botonAr.textContent = '✕';
        botonAr.title = 'Salir del ADAS';
        botonAr.setAttribute('aria-label', 'Salir del ADAS');
      }
      document.querySelector('.ruta-shell')?.classList.add('ruta-ar-activo');
      // Pantalla completa real: sin barra del navegador no hay franja que corte
      // la cámara. Se pide dentro del gesto del botón AR.
      const shellAr = document.querySelector('.ruta-shell');
      if (shellAr?.requestFullscreen && !document.fullscreenElement) {
        try { shellAr.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_e) { /* fallback CSS */ }
      }
      shellAr?.classList.add('ruta-completa');
      document.body.classList.add('ruta-pantalla-completa');
      // La cabina de la foto es 16:9: en horizontal se ve entera, como la referencia.
      try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_e) { /* se queda como esté */ }
      canvasAr.classList.add('activo');
      videoAr.classList.add('activo');
      ajustarTamanoAr();
      // La cámara ocupa el 100 %: no queda ninguna capa de cabina o coche.
      iniciarSensoresAr();
      initVision();
      // Arranque rápido: reiniciar búfer y analizar el primer fotograma ya.
      arInicio = Date.now();
      bufferL = [];
      bufferR = [];
      carrilSuave = null;
      deteccionesAr = [];
      obstaculosVision = [];
      siguienteTrackId = 1;
      avisosObjetos.clear();
      ultimoAvisoObjeto = 0;
      senalAvisada = '';
      ultimoAnalisisVision = 0;
      analizarVision(arInicio);
      document.getElementById('rutaCalibrar')?.classList.remove('calibrado');
      asegurarModeloCoco();
      iniciarVisionCompartida();
      const loop = () => {
        if (!vistaArActiva) return;
        dibujarAr();
        animacionAr = requestAnimationFrame(loop);
      };
      loop();
      avisar('ADAS activado. Cámara trasera y guía de carril.', 'ok', 4000);
      // Si ya hay una ruta, se arranca la guía sin pedir otro toque.
      if (rutaActiva() && !navegando) setTimeout(() => { if (vistaArActiva && !navegando) alternarNavegacion(); }, 350);
    } catch (e) {
      avisar(`No se pudo acceder a la cámara (${e.name}: ${e.message}).`, 'error', 8000);
      console.error('Error cámara AR:', e);
    }
  }

  function detenerAr() {
    vistaArActiva = false;
    deteccionesAr = [];
    obstaculosVision = [];
    siguienteTrackId = 1;
    avisosObjetos.clear();
    ultimoAvisoObjeto = 0;
    if (animacionAr) cancelAnimationFrame(animacionAr);
    animacionAr = null;
    if (streamAr) {
      streamAr.getTracks().forEach(t => t.stop());
      streamAr = null;
    }
    if (videoAr) videoAr.srcObject = null;
    const botonAr = document.getElementById('rutaArToggle');
    botonAr?.classList.remove('activo');
    botonAr?.setAttribute('aria-pressed', 'false');
    if (botonAr) {
      botonAr.textContent = '🎮';
      botonAr.title = 'ADAS: cámara, carril y ruta';
      botonAr.setAttribute('aria-label', 'ADAS cámara completa');
    }
    document.querySelector('.ruta-shell')?.classList.remove('ruta-ar-activo');
    try { screen.orientation?.unlock?.(); } catch (_e) { /* nada */ }
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
    senalCandidata = null;
    senalCandidataDesde = 0;
    senalInfoHasta = 0;
    senalTexto = '';
    senalAvisada = '';
    detenerVisionCompartida();
  }

  function toggleAr() {
    if (vistaArActiva) detenerAr(); else iniciarAr();
  }

  const ETIQUETAS_COCO = {
    person: 'persona', bicycle: 'bici', car: 'coche', motorcycle: 'moto',
    bus: 'autobús', train: 'tren', truck: 'camión', boat: 'barco',
    'traffic light': 'semáforo', 'stop sign': 'stop', 'fire hydrant': 'hidrante',
    dog: 'perro', cat: 'gato', horse: 'caballo', cow: 'vaca',
    backpack: 'mochila', umbrella: 'paraguas', handbag: 'bolso', suitcase: 'maleta',
    bottle: 'botella', cup: 'vaso', chair: 'silla', bench: 'banco', bird: 'pájaro',
    cone: 'cono'
  };

  function etiquetaObjeto(clase) {
    const c = String(clase || '').toLowerCase();
    return ETIQUETAS_COCO[c] || c || 'objeto';
  }

  // Capa común de objetos: cajas, etiqueta traducida y distancia orientativa.
  // La usan AR y 3D leyendo el mismo deteccionesAr.
  // Clases que pueden invadir el carril. El perro y el cono también cuentan:
  // son obstáculos reales, no adornos del arcén.
  const CLASES_RIESGO = new Set(['car', 'truck', 'bus', 'motorcycle', 'bicycle', 'person', 'dog', 'cone']);

  function capitalizar(texto) {
    const t = String(texto || '');
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
  }

  // Solo interesa lo que está en el carril o justo delante. Se proyecta el
  // centro-bajo de la caja con la misma geometría que analizarVision; si no
  // hay carril fiable se usa un corredor central conservador. Así un coche
  // aparcado en el arcén o una persona en la acera no generan caja ni voz.
  function enTrayectoria(d) {
    const bbox = d && d.bbox;
    if (!Array.isArray(bbox) || bbox.length < 4 || !bbox.every(Number.isFinite)) return false;
    const [x, y, bw, bh] = bbox;
    // El dibujo mapea el vídeo con object-fit: cover (mapearVideoRect); la
    // comprobación de carril tiene que usar la misma proyección. Con el
    // estirado anterior, en vertical un coche del carril derecho se evaluaba
    // como si fuera por el centro y sí avisaba.
    const [px, py] = mapearVideoPunto(x, y, VW, VH);
    const [px2, py2] = mapearVideoPunto(x + bw, y + bh, VW, VH);
    const cx = (px + px2) / 2;
    const bottom = py2;
    if (bottom < VH * 0.62) return false;
    if (!carrilSuave || !carrilInfo?.ok || carrilSuave.conf <= 0.22) {
      // Sin carril fiable, solo el corredor central: un coche del carril de al
      // lado o aparcado en el arcén no debe generar aviso.
      return Math.abs(cx - VW / 2) < VW * 0.13;
    }
    const ROI_Y0 = VH * 0.55;
    const ROI_Y1 = VH * 0.98;
    const dY = Math.max(ROI_Y0, Math.min(ROI_Y1, bottom));
    const dn = (ROI_Y1 - dY) / (ROI_Y1 - ROI_Y0);
    const medio = (VW * 0.92 + (VW * 0.34 - VW * 0.92) * dn) / 2;
    const u = (cx - VW / 2) / medio;
    const uL = carrilSuave.aL * dn * dn + carrilSuave.bL * dn + carrilSuave.cL;
    const uR = carrilSuave.aR * dn * dn + carrilSuave.bR * dn + carrilSuave.cR;
    // Margen estrecho: el aviso es para lo que está dentro de mi carril, no
    // para el coche que va por el carril de al lado.
    const margen = 0.06;
    return u >= Math.min(uL, uR) - margen && u <= Math.max(uL, uR) + margen;
  }

  // Un aviso por objeto: el ID se conserva entre fotogramas y el mapa evita
  // repetir la frase mientras siga delante. Si el tracker pierde la caja y la
  // recupera con otro ID, la comprobación espacial también lo silencia.
  function avisarObjeto(d, caja, distEst, ahora, w, h) {
    if (!d || !caja || !CLASES_RIESGO.has(d.class)) return;
    const id = d.trackId || `${d.class}:${Math.round(caja.x)}:${Math.round(caja.y)}`;
    if (avisosObjetos.has(id)) return;
    const cx = (caja.x + caja.w / 2) / Math.max(1, w);
    const cy = (caja.y + caja.h / 2) / Math.max(1, h);
    for (const a of avisosObjetos.values()) {
      if (a.clase === d.class && ahora - a.ts < 15000
        && Math.hypot(a.cx - cx, a.cy - cy) < 0.22) {
        avisosObjetos.set(id, { clase: d.class, ts: ahora, cx, cy });
        return;
      }
    }
    // No se amontonan dos frases en el mismo segundo. El segundo objeto se
    // avisará en el siguiente fotograma, una sola vez.
    if (ahora - ultimoAvisoObjeto < 1000) return;
    avisosObjetos.set(id, { clase: d.class, ts: ahora, cx, cy });
    ultimoAvisoObjeto = ahora;
    ultimaVozCarril = ahora;
    const etiqueta = capitalizar(etiquetaObjeto(d.class));
    const dist = distEst ? Math.max(2, Math.round(distEst)) : 0;
    decir(dist
      ? `${etiqueta} a ${dist} metros. Reduce la velocidad.`
      : `${etiqueta} en tu trayectoria. Reduce la velocidad.`);
    if (avisosObjetos.size > 40) {
      for (const [k, v] of avisosObjetos) {
        if (ahora - v.ts > 30000) avisosObjetos.delete(k);
      }
    }
  }

  function dibujarDeteccionesEn(ctx, w, h, ahora) {
    const objetos = obstaculosVision.length ? deteccionesAr.concat(obstaculosVision) : deteccionesAr;
    for (const d of objetos) {
      if (d.class === 'cone' && (d.visto || 0) < 2) continue;
      if (!enTrayectoria(d)) continue;
      const [x, y, bw, bh] = d.bbox;
      const caja = mapearVideoRect(x, y, bw, bh, w, h);
      const rx = caja.x, ry = caja.y, rw = caja.w, rh = caja.h;
      if (rw < 8 || rh < 8) continue;
      const coche = d.class === 'car' || d.class === 'truck' || d.class === 'bus';
      const color = coche ? '#ff4d6d' : d.class === 'cone' ? '#fb923c' : '#38e1ff';
      // La proximidad va en la propia etiqueta: un aviso aparte se montaba
      // sobre el banner del HUD y en el cielo cuando la caja estaba arriba.
      const esRiesgo = CLASES_RIESGO.has(d.class);
      const distEst = esRiesgo ? distanciaCocheEstimada(d.class, rw, w) : 0;
      const tocaAbajo = ry + rh >= h * (2 / 3);
      const cerca = esRiesgo && ((distEst > 0 && distEst < 30) || tocaAbajo);
      const fondo = cerca ? 'rgba(176,12,42,.96)' : coche ? 'rgba(176,12,42,.92)' : 'rgba(0,110,130,.92)';
      // Trazo oscuro bajo el color: la caja se lee igual sobre cielo, asfalto
      // claro o el salpicadero. En móvil el mínimo sube a 3 px.
      ctx.lineWidth = Math.max(3, w * 0.006);
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.strokeStyle = color;
      ctx.strokeRect(rx, ry, rw, rh);

      const texto = `${cerca ? '⚠ ' : ''}${etiquetaObjeto(d.class)} ${Math.round(d.score * 100)}%`;
      const altoEtiqueta = Math.max(22, Math.min(28, w * 0.045));
      ctx.font = `bold ${Math.max(13, altoEtiqueta * 0.6)}px sans-serif`;
      const anchoEtiqueta = Math.min(w * 0.72, Math.max(64, ctx.measureText(texto).width + 12));
      const etiquetaX = Math.max(0, Math.min(rx, w - anchoEtiqueta));
      const etiquetaY = ry - altoEtiqueta >= 0 ? ry - altoEtiqueta : ry;
      ctx.fillStyle = fondo;
      ctx.fillRect(etiquetaX, etiquetaY, anchoEtiqueta, altoEtiqueta);
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, etiquetaX + 6, etiquetaY + altoEtiqueta / 2);
      if (!distEst) continue;
      const distTexto = `~${distEst} m`;
      ctx.font = `bold ${Math.max(12, Math.min(18, w * 0.028))}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      const distY = Math.min(h - 4, ry + rh + Math.max(14, w * 0.032));
      ctx.lineWidth = Math.max(3, w * 0.006);
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(distTexto, rx + 4, distY);
      ctx.fillStyle = distEst < 30 ? '#ff4d6d' : distEst < 60 ? '#fbbf24' : '#fff';
      ctx.fillText(distTexto, rx + 4, distY);
      if (cerca) avisarObjeto(d, caja, distEst, ahora, w, h);
    }
  }

  // Señal reconocida por visión: se pinta sobre su posición real en la imagen.
  function dibujarSenalCamaraEn(ctx, w, h) {
    if (!senalInfo) return;
    const caja = mapearVisionRect(senalInfo.x, senalInfo.y, senalInfo.w, senalInfo.h, w, h);
    let cx = caja.x + caja.w / 2;
    let cy = caja.y + caja.h / 2;
    const r = Math.max(12, Math.min(34, Math.max(caja.w, caja.h) * 0.62));
    const texto = senalTexto && (/^\d{1,3}$/.test(senalTexto) || /^[A-ZÁÉÍÓÚÑ]{3,12}$/.test(senalTexto)) ? senalTexto : '';
    const esNumero = /^\d+$/.test(texto);
    if (texto) {
      // En el ADAS el HUD superior se pinta después: si el disco cae debajo
      // del buscador o de la tarjeta de maniobra, se recoloca como aviso
      // flotante justo bajo el HUD en vez de quedar medio tapado.
      if (vistaArActiva) {
        const { dpr, u } = escalaHudAr(w, h);
        const cajaBuscar = medirBuscarAr();
        let techo = cajaBuscar ? (cajaBuscar.bottom + 6) * cajaBuscar.escala : 10 * dpr;
        if (rutaActiva()?.steps?.length) techo += 126 * u;
        if (cy - r < techo) cy = techo + r + 8 * dpr;
        cx = Math.max(r + 4, Math.min(w - r - 4, cx));
      }
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,.96)';
      ctx.fill();
      ctx.lineWidth = Math.max(4, r * 0.18);
      ctx.strokeStyle = '#c1121f';
      ctx.stroke();
      ctx.fillStyle = '#0a1018';
      ctx.font = `bold ${esNumero
        ? Math.max(15, Math.min(24, r * 0.95, w * 0.065))
        : Math.max(9, Math.min(16, r * 0.55, w * 0.045))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(texto, cx, cy + 1);
    } else {
      ctx.lineWidth = Math.max(3, w * 0.006);
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
      ctx.strokeStyle = 'rgba(255,77,109,.95)';
      ctx.strokeRect(caja.x, caja.y, caja.w, caja.h);
      const nota = 'TextDetector' in window ? 'Señal' : 'Señal · sin lectura';
      ctx.font = `bold ${Math.max(12, w * 0.026)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.lineWidth = Math.max(3, w * 0.006);
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(nota, cx, Math.max(16, caja.y - 7));
      ctx.fillStyle = '#ff8fa3';
      ctx.fillText(nota, cx, Math.max(16, caja.y - 7));
    }
  }

  // Guía de dirección sobre la calzada: bordes del carril, eje discontinuo y
  // flecha. Se alimenta de carrilSuave (misma fuente que los avisos) y quien
  // la llama se encarga de recortarla al cristal o a la mitad de cámara.
  function dibujarGuiaDireccionEn(ctx, w, h, alto) {
    // Sin carriles detectados no se inventa la guía: una flecha sobre la
    // calzada sin datos se lee como una indicación real y puede ser peligrosa.
    const tieneCarril = !!(carrilSuave && carrilInfo?.ok && carrilSuave.conf > 0.22);
    if (!tieneCarril) return;
    const baseY = Math.max(h * 0.16, Math.min(alto - 2, h * 0.92));
    const altoGuia = Math.max(30, Math.min(baseY - h * 0.06, h * 0.24));
    const topY = baseY - altoGuia;
    const sesgo = Math.max(-1, Math.min(1, carrilSuave.offset - carrilBias));
    const curv = Math.max(-1, Math.min(1, carrilSuave.curv));
    const anchoRel = anchoRef > 0.2
      ? Math.max(0.65, Math.min(1.55, carrilSuave.ancho / anchoRef)) : 1;
    const cx = w / 2;
    const abajo = cx + sesgo * w * 0.17;
    const arriba = cx + sesgo * w * 0.04 + curv * w * 0.08;
    const medio = (abajo + arriba) / 2 + curv * w * 0.05;
    const semiAbajo = w * 0.19 * anchoRel;
    const semiArriba = Math.max(2, semiAbajo * 0.16);
    const col = '#22d3ee';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Bordes del carril: sombra oscura + verde, para que se lean con sol.
    for (const lado of [-1, 1]) {
      const x0 = abajo + lado * semiAbajo;
      const xm = medio + lado * (semiAbajo + semiArriba) / 2;
      const x1 = arriba + lado * semiArriba;
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.quadraticCurveTo(xm, baseY - altoGuia * 0.62, x1, topY);
      ctx.strokeStyle = 'rgba(0,0,0,.45)';
      ctx.lineWidth = Math.max(4, w * 0.011);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(74,222,128,.95)';
      ctx.lineWidth = Math.max(2.4, w * 0.006);
      ctx.stroke();
    }

    // Eje discontinuo: sombra oscura, halo cian y blanco encima.
    ctx.setLineDash([Math.max(10, w * 0.024), Math.max(12, w * 0.03)]);
    ctx.lineDashOffset = -(performance.now() / 26) % 60;
    ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.lineWidth = Math.max(5, w * 0.012);
    ctx.beginPath();
    ctx.moveTo(abajo, baseY);
    ctx.quadraticCurveTo(medio, baseY - altoGuia * 0.62, arriba, topY);
    ctx.stroke();
    ctx.shadowColor = col;
    ctx.shadowBlur = Math.max(8, w * 0.018);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(3, w * 0.008);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;

    // La flecha sigue la próxima maniobra de la ruta, no solo la curva del
    // carril: así la guía dice «izquierda/derecha» como un GPS.
    const pasoRuta = rutaActiva()?.steps?.[paso];
    const modRuta = String(pasoRuta?.modifier || '');
    const sesgoRuta = modRuta.includes('left') ? -0.5 : modRuta.includes('right') ? 0.5 : 0;
    const ang = Math.atan2(arriba - medio, altoGuia * 0.62) + sesgoRuta;
    const tam = Math.max(12, Math.min(26, w * 0.038));
    ctx.translate(arriba, topY);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -tam * 0.95);
    ctx.lineTo(tam * 0.72, tam * 0.55);
    ctx.lineTo(0, tam * 0.22);
    ctx.lineTo(-tam * 0.72, tam * 0.55);
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.lineWidth = Math.max(2.5, w * 0.006);
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function dibujarAr() {
    if (!ctxAr || !canvasAr || !videoAr) return;
    // Mantener el canvas nítido y ajustado al tamaño real de la pantalla.
    ajustarTamanoAr();
    const w = canvasAr.width, h = canvasAr.height;
    // Limpiar canvas (transparente para ver el video)
    ctxAr.clearRect(0, 0, w, h);

    // La visión corre en un único bucle compartido con la vista 3D. Aquí solo
    // se pinta ese estado sobre la cámara completa: sin recorte de cristal,
    // sin cabina y sin dibujo de coche.
    const ahora = Date.now();
    dibujarGuiaDireccionEn(ctxAr, w, h, h);
    dibujarDeteccionesEn(ctxAr, w, h, ahora);
    dibujarSenalCamaraEn(ctxAr, w, h);

    const ruta = rutaActiva();
    const s = ruta?.steps?.[paso] || ruta?.steps?.[0];

    // HUD de navegación: maniobra grande bajo el buscador y barra inferior.
    dibujarPanelAr(w, h, s);
    dibujarInferiorAr(w, h, s);
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

  // El vídeo usa object-fit: cover. Sin esta conversión, una cámara 4:3 en
  // una pantalla vertical se estira y las cajas/líneas caen desplazadas.
  // Se trabaja en coordenadas del vídeo fuente y se recorta igual que el
  // navegador antes de pasar al canvas interno (que ya lleva el DPR).
  function mapearVideoPunto(x, y, cw, ch) {
    const vw = videoAr?.videoWidth || VW;
    const vh = videoAr?.videoHeight || VH;
    const escala = Math.max(cw / vw, ch / vh);
    const offsetX = (cw - vw * escala) / 2;
    const offsetY = (ch - vh * escala) / 2;
    return [offsetX + x * escala, offsetY + y * escala];
  }

  function mapearVideoRect(x, y, rw, rh, cw, ch) {
    const [px, py] = mapearVideoPunto(x, y, cw, ch);
    const [px2, py2] = mapearVideoPunto(x + rw, y + rh, cw, ch);
    return { x: px, y: py, w: Math.max(0, px2 - px), h: Math.max(0, py2 - py) };
  }

  // Las detecciones de visión se calculan sobre VW×VH, que es el vídeo entero
  // estirado a 4:3; se devuelven a píxeles del vídeo fuente antes de mapear.
  function mapearVisionPunto(px, py, cw, ch) {
    const vw = videoAr?.videoWidth || VW;
    const vh = videoAr?.videoHeight || VH;
    return mapearVideoPunto((px / VW) * vw, (py / VH) * vh, cw, ch);
  }

  function mapearVisionRect(x, y, rw, rh, cw, ch) {
    const [px, py] = mapearVisionPunto(x, y, cw, ch);
    const [px2, py2] = mapearVisionPunto(x + rw, y + rh, cw, ch);
    return { x: px, y: py, w: Math.max(0, px2 - px), h: Math.max(0, py2 - py) };
  }

  // Distancia orientativa por anchura aparente. La focal se estima con un FOV
  // horizontal de ~60° y cada clase tiene una anchura media real distinta.
  // No sustituye a un radar: sirve para ordenar avisos, no para frenar solo.
  function distanciaCocheEstimada(clase, anchoPx, anchoCanvas) {
    if (!anchoPx || !anchoCanvas) return null;
    const anchoReal = clase === 'truck' || clase === 'bus' ? 2.45
      : clase === 'motorcycle' || clase === 'bicycle' ? 0.8
      : clase === 'person' ? 0.6
      : clase === 'dog' ? 0.5
      : clase === 'cone' ? 0.4 : 1.8;
    const focal = anchoCanvas * 0.9;
    return Math.max(2, Math.min(200, Math.round((focal * anchoReal) / anchoPx)));
  }

  function iouCajas(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return 0;
    const x1 = Math.max(a[0], b[0]);
    const y1 = Math.max(a[1], b[1]);
    const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
    const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = Math.max(0, a[2]) * Math.max(0, a[3]);
    const areaB = Math.max(0, b[2]) * Math.max(0, b[3]);
    return inter / Math.max(1, areaA + areaB - inter);
  }

  // COCO-SSD analiza cada 500 ms y las cajas saltan. Se empareja cada coche
  // con su caja anterior, se suaviza la posición y se conserva ~0,7 s si un
  // fotograma no lo detecta. Así el recuadro sigue al vehículo sin temblar.
  function estabilizarDetecciones(preds, ahora) {
    const vw = videoAr?.videoWidth || 640;
    const vh = videoAr?.videoHeight || 480;
    // Las personas suelen salir con algo menos de confianza que un coche;
    // se les da un umbral ligeramente menor sin abrir la puerta a la basura.
    const nuevas = (preds || []).filter(p => p && p.score > (p.class === 'person' ? 0.42 : 0.5) && Array.isArray(p.bbox));
    const previas = deteccionesAr || [];
    const usadas = new Set();
    const salida = [];
    const centro = b => [b[0] + b[2] / 2, b[1] + b[3] / 2];
    for (const pred of nuevas) {
      let mejor = -1;
      let mejorPunt = 0;
      previas.forEach((prev, i) => {
        if (usadas.has(i) || prev.class !== pred.class) return;
        const solape = iouCajas(prev.bbox, pred.bbox);
        const [pcx, pcy] = centro(prev.bbox);
        const [ncx, ncy] = centro(pred.bbox);
        const dist = Math.hypot((pcx - ncx) / vw, (pcy - ncy) / vh);
        const punt = solape + Math.max(0, 1 - dist / 0.22) * 0.18;
        if ((solape > 0.08 || dist < 0.18) && punt > mejorPunt) {
          mejorPunt = punt;
          mejor = i;
        }
      });
      const caja = pred.bbox.slice();
      let score = Number(pred.score) || 0;
      let trackId = `obj-${siguienteTrackId++}`;
      if (mejor >= 0) {
        const prev = previas[mejor];
        usadas.add(mejor);
        trackId = prev.trackId || trackId;
        for (let k = 0; k < 4; k++) caja[k] = prev.bbox[k] + (caja[k] - prev.bbox[k]) * 0.55;
        score = (prev.score || score) * 0.25 + score * 0.75;
      }
      salida.push({ ...pred, bbox: caja, score, lastSeen: ahora, trackId });
    }
    // Mantener un instante las cajas que no aparecen en este fotograma.
    previas.forEach((prev, i) => {
      if (usadas.has(i) || salida.some(p => p.trackId === prev.trackId)) return;
      if (ahora - (prev.lastSeen || 0) < 700) salida.push({ ...prev, score: (prev.score || 0) * 0.9, lastSeen: prev.lastSeen || ahora });
    });
    return salida.slice(0, 12);
  }

  // Calzada pintada en perspectiva con colores según la maniobra y flechas
  // que avanzan hacia el horizonte (sensación de movimiento real).
  function dibujarRutaAr(w, h, ruta, s) {
    const pts = ruta.geometry;
    const n = Math.min(26, pts.length);
    if (n < 2) return;
    const col = colorManiobra(s);
    const baseY = baseCristalAr(h);
    const topY = baseY - h * 0.17;
    const nearW = Math.min(w * 0.50, 420);
    const farW = nearW * 0.07;
    // Guía plana sobre la calzada: sin curvas inventadas, sin cambios de
    // altura por los sensores y sin picos. Dos bordes rectos en perspectiva y
    // un eje discontinuo, todo en el mismo plano que el morro del coche.
    const coords = [];
    for (let i = 0; i < n; i++) {
      const z = i / (n - 1);
      const x = w / 2;
      const y = baseY + (topY - baseY) * z;
      const half = (nearW + (farW - nearW) * z) / 2;
      coords.push({ x, y, half, z });
    }

    ctxAr.save();
    // Solo bordes y eje: sin cinta rellena que parecía un triángulo pegado
    // sobre el cristal. Las líneas siguen un plano recto en perspectiva.
    ctxAr.lineWidth = Math.max(1.5, Math.min(3, w * 0.0035));
    ctxAr.strokeStyle = hexRgba(col, 0.82);
    ctxAr.shadowColor = col;
    ctxAr.shadowBlur = 6;
    for (const side of [-1, 1]) {
      ctxAr.beginPath();
      coords.forEach((p, i) => (i ? ctxAr.lineTo(p.x + side * p.half, p.y) : ctxAr.moveTo(p.x + side * p.half, p.y)));
      ctxAr.stroke();
    }
    ctxAr.shadowBlur = 0;

    // eje discontinuo animado
    ctxAr.lineWidth = Math.max(1.5, Math.min(3, w * 0.004));
    ctxAr.strokeStyle = 'rgba(255,255,255,0.72)';
    ctxAr.setLineDash([14, 18]);
    ctxAr.lineDashOffset = -(performance.now() / 25) % 32;
    ctxAr.beginPath();
    coords.forEach((p, i) => (i ? ctxAr.lineTo(p.x, p.y) : ctxAr.moveTo(p.x, p.y)));
    ctxAr.stroke();
    ctxAr.setLineDash([]);

    // flechas que avanzan
    const phase = (performance.now() / 1200) % 1;
    for (let k = 0; k < 3; k++) {
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
    const rest = ruta ? (ultimaPos ? restante(ultimaPos.lat, ultimaPos.lon) : (ruta.distance || 0)) : 0;
    const min = ruta && rest > 0 ? Math.max(1, Math.round(segundosRestantesRuta(ruta, rest) / 60)) : 0;
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

  // Panel antiguo (se conserva como referencia, ya no se pinta).
  function dibujarPanelArLegacy(w, h, s) {
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

  // HUD del ADAS: tarjeta de maniobra grande bajo el buscador y barra inferior
  // con velocidad, límite, distancia y hora de llegada. Sin cabina ni coche.
  // El canvas va escalado por DPR: todas las medidas del HUD se expresan en
  // CSS y se multiplican por la densidad; si no, en un móvil con dpr 3 salen
  // tres veces más pequeñas que en la QA.
  function escalaHudAr(w, h) {
    const dpr = canvasAr?.clientWidth ? w / canvasAr.clientWidth : 1;
    return { dpr, u: Math.max(0.78, Math.min(1.18, h / dpr / 780)) * dpr };
  }

  // Posición del buscador en píxeles del canvas, cacheada 500 ms: leer el
  // layout en cada fotograma a 60 fps no aporta nada y cuesta en móvil.
  let metricaBuscarAr = null;
  let metricaBuscarArTs = 0;
  function medirBuscarAr() {
    // Al navegar el buscador se oculta: la tarjeta de maniobra ocupa su hueco.
    if (document.querySelector('.ruta-shell')?.classList.contains('ruta-navegando')) {
      metricaBuscarAr = null;
      metricaBuscarArTs = 0;
      return null;
    }
    const ahora = performance.now();
    if (metricaBuscarAr && ahora - metricaBuscarArTs < 500) return metricaBuscarAr;
    metricaBuscarArTs = ahora;
    const b = document.getElementById('rutaBuscar')?.getBoundingClientRect();
    metricaBuscarAr = b && b.height
      ? { bottom: b.bottom, escala: canvasAr?.clientWidth ? canvasAr.width / canvasAr.clientWidth : 1 }
      : null;
    return metricaBuscarAr;
  }

  function dibujarPanelAr(w, h, s) {
    const { dpr, u } = escalaHudAr(w, h);
    const x = 10 * dpr;
    // La tarjeta empieza justo debajo del buscador real. Al navegar, el
    // buscador desaparece y la tarjeta sube al borde superior.
    const cajaBuscar = medirBuscarAr();
    const y = cajaBuscar
      ? Math.max(74 * dpr, (cajaBuscar.bottom + 6) * cajaBuscar.escala)
      : 10 * dpr;
    const pw = w - 20 * dpr;
    const ph = 92 * u;
    const ruta = rutaActiva();
    // Sin ruta no se pinta tarjeta: el buscador ya está arriba y la cámara
    // tiene que quedar limpia.
    if (!s) return;
    rrect(x, y, pw, ph, 18 * u);
    const fondo = ctxAr.createLinearGradient(0, y, 0, y + ph);
    fondo.addColorStop(0, 'rgba(5,11,20,.95)');
    fondo.addColorStop(1, 'rgba(3,7,14,.88)');
    ctxAr.fillStyle = fondo;
    ctxAr.fill();
    ctxAr.strokeStyle = 'rgba(56,225,255,.38)';
    ctxAr.lineWidth = 1.5;
    ctxAr.stroke();

    const ab = ph - 20 * u;
    const ax = x + 10 * u, ay = y + 10 * u;
    const col = colorManiobra(s);
    rrect(ax, ay, ab, ab, 14 * u);
    ctxAr.fillStyle = hexRgba(col, 0.95);
    ctxAr.fill();
    ctxAr.fillStyle = '#04121c';
    ctxAr.textAlign = 'center';
    ctxAr.textBaseline = 'middle';
    ctxAr.font = `800 ${ab * 0.58}px system-ui, sans-serif`;
    ctxAr.fillText(flechaPara(s), ax + ab / 2, ay + ab / 2 + 2);

    const d = ultimaPos && Number.isFinite(s.lat)
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : (s.distance || 0);
    const distanciaTxt = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.max(5, Math.round(d / 5) * 5)} m`;
    const tx = ax + ab + 12 * u;
    const anchoTexto = pw - (tx - x) - 84 * u;
    ctxAr.textAlign = 'left';
    ctxAr.fillStyle = '#7ee7ff';
    ctxAr.font = `800 ${11.5 * u}px system-ui, sans-serif`;
    ctxAr.fillText(s.type === 'arrive' ? 'DESTINO' : `EN ${distanciaTxt}`.toUpperCase(), tx, y + 20 * u);
    ctxAr.fillStyle = '#f8fafc';
    ctxAr.font = `800 ${18 * u}px system-ui, sans-serif`;
    ctxAr.fillText(recortar(instruccion(s), w < 520 ? 24 : 40), tx, y + 45 * u, Math.max(60, anchoTexto));
    ctxAr.fillStyle = '#b8c8dc';
    ctxAr.font = `600 ${12.5 * u}px system-ui, sans-serif`;
    ctxAr.fillText(recortar(s.name || nombreDestino || 'Sigue la ruta', w < 520 ? 26 : 42), tx, y + 68 * u, Math.max(60, anchoTexto));

    const rest = ruta ? (ultimaPos ? restante(ultimaPos.lat, ultimaPos.lon) : (ruta.distance || 0)) : 0;
    const segundosRestantes = segundosRestantesRuta(ruta, rest);
    const min = ruta && rest > 0 ? Math.max(1, Math.round(segundosRestantes / 60)) : 0;
    const llegada = ruta ? horaDeLlegada(segundosRestantes) : '--:--';
    ctxAr.textAlign = 'right';
    ctxAr.fillStyle = '#7ee7ff';
    ctxAr.font = `800 ${11 * u}px system-ui, sans-serif`;
    ctxAr.fillText('LLEGADA', x + pw - 12 * u, y + 20 * u);
    ctxAr.fillStyle = '#f8fafc';
    ctxAr.font = `800 ${19 * u}px system-ui, sans-serif`;
    ctxAr.fillText(llegada, x + pw - 12 * u, y + 44 * u);
    ctxAr.fillStyle = '#9fb6cf';
    ctxAr.font = `600 ${12 * u}px system-ui, sans-serif`;
    ctxAr.fillText(min ? `${min} min` : '-- min', x + pw - 12 * u, y + 66 * u);

    if (carrilSuave && carrilInfo?.ok && carrilSuave.conf > 0.25) {
      const curv = Math.abs(carrilSuave.curv);
      const estado = curv < 0.05 ? '⬆ Carril centrado' : curv < 0.2 ? '↗ Curva suave' : '↗ Curva';
      const anchoM = anchoRef > 0.2 ? (carrilSuave.ancho * anchoRealM) / anchoRef : 0;
      const texto = `${estado} · ${anchoM > 0 ? `${anchoM.toFixed(1)} m` : 'ancho —'}`;
      const ch = 26 * u;
      ctxAr.font = `700 ${11.5 * u}px system-ui, sans-serif`;
      const cw = Math.min(pw, Math.max(200 * u, ctxAr.measureText(texto).width + 28 * u));
      const cx = x + (pw - cw) / 2;
      const cy = y + ph + 6 * u;
      rrect(cx, cy, cw, ch, ch / 2);
      ctxAr.fillStyle = 'rgba(4,10,18,.78)';
      ctxAr.fill();
      ctxAr.strokeStyle = 'rgba(56,225,255,.28)';
      ctxAr.lineWidth = 1;
      ctxAr.stroke();
      ctxAr.fillStyle = '#bfe9f7';
      ctxAr.textAlign = 'center';
      ctxAr.textBaseline = 'middle';
      ctxAr.fillText(texto, cx + cw / 2, cy + ch / 2 + 1);
    }
  }

  function dibujarInferiorAr(w, h, s) {
    const { dpr, u } = escalaHudAr(w, h);
    const ruta = rutaActiva();
    const kmh = ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null;
    // Velocímetro abajo a la izquierda, por encima del botón de parar (68 px
    // CSS + 16 de margen), sin pisarlo en horizontal.
    const vx = 10 * dpr, vy = h - 62 * u - 100 * dpr, vw = 92 * u, vh = 62 * u;
    rrect(vx, vy, vw, vh, 16 * u);
    ctxAr.fillStyle = 'rgba(5,11,20,.9)';
    ctxAr.fill();
    ctxAr.strokeStyle = 'rgba(56,225,255,.35)';
    ctxAr.lineWidth = 1.2;
    ctxAr.stroke();
    ctxAr.textAlign = 'left';
    ctxAr.textBaseline = 'alphabetic';
    ctxAr.fillStyle = '#f8fafc';
    ctxAr.font = `900 ${30 * u}px system-ui, sans-serif`;
    ctxAr.fillText(String(Math.round(velocidad)), vx + 10 * u, vy + vh * 0.66);
    ctxAr.fillStyle = '#93a8c0';
    ctxAr.font = `700 ${9.5 * u}px system-ui, sans-serif`;
    ctxAr.fillText('km/h', vx + 10 * u, vy + vh * 0.86);

    if (kmh) {
      const lx = vx + vw + 24 * u, ly = vy + vh / 2, lr = 22 * u;
      ctxAr.beginPath();
      ctxAr.arc(lx, ly, lr, 0, Math.PI * 2);
      ctxAr.fillStyle = '#f8fafc';
      ctxAr.fill();
      ctxAr.strokeStyle = '#dc2626';
      ctxAr.lineWidth = 4.5 * u;
      ctxAr.beginPath();
      ctxAr.arc(lx, ly, lr * 0.8, 0, Math.PI * 2);
      ctxAr.stroke();
      ctxAr.fillStyle = '#0f172a';
      ctxAr.font = `900 ${16 * u}px system-ui, sans-serif`;
      ctxAr.textAlign = 'center';
      ctxAr.textBaseline = 'middle';
      ctxAr.fillText(String(kmh), lx, ly + 1);
    }

    const rest = ruta ? (ultimaPos ? restante(ultimaPos.lat, ultimaPos.lon) : (ruta.distance || 0)) : 0;
    const segundosRestantes = segundosRestantesRuta(ruta, rest);
    const min = ruta && rest > 0 ? Math.max(1, Math.round(segundosRestantes / 60)) : 0;
    const llegada = ruta ? horaDeLlegada(segundosRestantes) : '--:--';
    const ew = Math.min(w - 220 * u, 210 * u);
    if (ruta && ew > 90 * u) {
      const ex = (w - ew) / 2, ey = h - 78 * u, eh = 50 * u;
      rrect(ex, ey, ew, eh, 15 * u);
      ctxAr.fillStyle = 'rgba(5,11,20,.9)';
      ctxAr.fill();
      ctxAr.strokeStyle = 'rgba(56,225,255,.3)';
      ctxAr.lineWidth = 1.2;
      ctxAr.stroke();
      ctxAr.textAlign = 'left';
      ctxAr.textBaseline = 'middle';
      ctxAr.fillStyle = '#22d3ee';
      ctxAr.font = `900 ${16 * u}px system-ui, sans-serif`;
      ctxAr.fillText(rest >= 1000 ? `${(rest / 1000).toFixed(1)} km` : `${Math.round(rest)} m`, ex + 12 * u, ey + eh * 0.38);
      ctxAr.fillStyle = '#cbd5e1';
      ctxAr.font = `600 ${11 * u}px system-ui, sans-serif`;
      ctxAr.fillText(`${min} min · ${llegada}`, ex + 12 * u, ey + eh * 0.72, ew - 20 * u);
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
      if (vista3dActiva) guardarAviso3d(a);
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
    senal: () => senalInfo ? { x: senalInfo.x, y: senalInfo.y, w: senalInfo.w, h: senalInfo.h } : null,
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
