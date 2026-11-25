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
      if (dt > .8) velocidadObjetivo = Math.max(0, distancia(ultimaPos.lat, ultimaPos.lon, lat, lon) / dt * 3.6);
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
  let coche3dListo = false;
  let moduloCoche3d = null;
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
  let signos3d = [];
  let imagenCoche3d = null;
  let spriteCoche3d = null;
  let zoomFondo3d = 1;
  let botones3d = [];
  let stream3d = null;
  let camara3dActiva = false;
  // Escena ilustrada del 3D: coche azul y carretera, sin HUD quemado. Los datos
  // (giro, velocidad, límite, ETA) se pintan aparte y salen de la ruta real.
  const imagenEscena3d = new Image();
  imagenEscena3d.src = '/img/gps-3d-carretera-limpia.webp';

  function arrancarCamara3d() {
    if (!navigator.mediaDevices?.getUserMedia) return;
    (async () => {
      try {
        let s = null;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 960 } },
            audio: false
          });
        } catch (_e1) {
          s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        stream3d = s;
        const v = document.getElementById('rutaArVideo');
        if (v) {
          videoAr = v;
          v.srcObject = s;
          await v.play().catch(() => {});
        }
        camara3dActiva = true;
      } catch (e) {
        camara3dActiva = false;
        console.warn('Cámara 3D no disponible:', e);
      }
    })();
  }

  function detenerCamara3d() {
    camara3dActiva = false;
    if (stream3d) {
      try { stream3d.getTracks().forEach(t => t.stop()); } catch (_e) { /* nada */ }
      stream3d = null;
    }
    const v = document.getElementById('rutaArVideo');
    if (v && v.srcObject) v.srcObject = null;
  }

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
    // La foto del GT4 es de estudio, con fondo azul. Un degradado radial no lo
    // quitaba y el coche parecía un recorte pegado en la carretera. Se recorta
    // con la silueta real (coordenadas normalizadas sobre la foto original) y
    // se difumina el borde para integrarlo en la escena. El coche y la imagen
    // siguen siendo los del proyecto: solo se elimina el fondo.
    const PUNTOS = [
      [0.104, 0.858], [0.110, 0.800], [0.120, 0.737], [0.200, 0.669],
      [0.280, 0.601], [0.350, 0.527], [0.420, 0.463], [0.510, 0.438],
      [0.584, 0.448], [0.640, 0.484], [0.690, 0.516], [0.688, 0.466],
      [0.700, 0.416], [0.892, 0.423], [0.894, 0.463], [0.860, 0.509],
      [0.848, 0.605], [0.848, 0.747], [0.820, 0.847], [0.784, 0.893],
      [0.720, 0.897], [0.340, 0.897], [0.148, 0.886], [0.110, 0.868]
    ];
    const mascara = document.createElement('canvas');
    mascara.width = c.width;
    mascara.height = c.height;
    const mg = mascara.getContext('2d');
    mg.filter = 'blur(5px)';
    mg.fillStyle = '#fff';
    mg.beginPath();
    PUNTOS.forEach(([x, y], i) => {
      const px = (x * W - sx) / sw * c.width;
      const py = (y * H - sy) / sh * c.height;
      if (i) mg.lineTo(px, py); else mg.moveTo(px, py);
    });
    mg.closePath();
    mg.fill();
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(mascara, 0, 0);
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
    const p = puntoTrazado3d(z);
    if (p) return { ...p, idx: idxActual, dH: 0 };
    return { x: cx, y: horizonte, ancho: w * 0.6, escala: 1, idx: idxActual, dH: 0 };
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
    if (!ultimaPos || !trazado3d.length) return;
    const kmh = limiteActual(ultimaPos.lat, ultimaPos.lon);
    if (!kmh) return;
    // Una señal a ~55 m, de tamaño acotado y sin salirse del lienzo.
    const p = trazado3d.find(q => q.s >= 55) || null;
    if (!p || p.escala > 14) return;
    const r = Math.max(11, Math.min(20, 3.1 * p.escala));
    const x = Math.max(r + 6, Math.min(w - r - 6, p.x + p.ancho * 0.52 + r * 0.7));
    const y = Math.max(96, p.y - r * 2.1);
    ctx3d.save();
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.beginPath(); ctx3d.arc(x, y, r, 0, Math.PI * 2); ctx3d.fill();
    ctx3d.strokeStyle = '#dc2626';
    ctx3d.lineWidth = Math.max(2.5, r * 0.16);
    ctx3d.beginPath(); ctx3d.arc(x, y, r * 0.82, 0, Math.PI * 2); ctx3d.stroke();
    ctx3d.fillStyle = '#0f172a';
    ctx3d.font = `bold ${Math.round(r * 1.02)}px sans-serif`;
    ctx3d.textAlign = 'center';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillText(String(kmh), x, y + 1);
    ctx3d.restore();
  }

  function dibujarGantry3d(w, h, horizonte, idxActual, segs, cx) {
    const r = rutaActiva();
    const s = r?.steps?.[paso] || r?.steps?.[0];
    if (!s?.name || !trazado3d.length) return;
    // Pórtico fijo a ~85 m: grande al acercarse, pero sin tapar el HUD ni
    // convertir la señal en una pared verde en primer plano.
    const p = trazado3d.find(q => q.s >= 85) || null;
    if (!p || p.escala > 12) return;
    const an = Math.min(w * 0.48, Math.max(74, 15 * p.escala + 34));
    const al = Math.max(22, an * 0.27);
    const x = Math.max(6, Math.min(w - an - 6, p.x - an / 2));
    const y = Math.max(horizonte + 6, p.y - al - 7 * p.escala);
    const poste = 7 * p.escala;
    const anchoPoste = Math.max(2, 0.07 * p.escala);
    ctx3d.fillStyle = 'rgba(120,140,160,.55)';
    ctx3d.fillRect(x + 0.05 * an, p.y - poste, anchoPoste, poste);
    ctx3d.fillRect(x + 0.95 * an - anchoPoste, p.y - poste, anchoPoste, poste);
    ctx3d.fillRect(x, y + al, an, Math.max(2, 0.06 * p.escala));
    ctx3d.fillStyle = 'rgba(8,52,40,.94)';
    ctx3d.fillRect(x, y, an, al);
    ctx3d.strokeStyle = 'rgba(230,245,255,.8)';
    ctx3d.lineWidth = 1.2;
    ctx3d.strokeRect(x, y, an, al);
    ctx3d.fillStyle = '#eaf7ff';
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.font = `bold ${Math.max(8, Math.min(13, al * 0.36))}px sans-serif`;
    ctx3d.fillText((flechaPara(s) + ' ') + recortar(s.name, 13), x + 7, y + al * 0.52);
  }

  let trazado3d = [];

  function construirTrazado3d(idxBase, w, h, horizonte, cx) {
    const segs = carretera3d;
    const FOCAL = Math.max(300, w * 1.38);
    const CAM_H = 2.35;
    const ANCHO_VIA = 8.2;
    const MAX = 230;
    const out = [];
    const proyectar = (s, latM, elevM = 0) => {
      const persp = FOCAL / Math.max(1.8, s);
      // Reparto no lineal de la profundidad: la perspectiva física aplasta
      // todo lo que pasa de 60 m contra el horizonte y las curvas de ciudad
      // desaparecen. Así el tramo cercano ocupa más pantalla y la curva se
      // ve, sin romper la continuidad del trazado.
      const depth = Math.pow(Math.max(0, 1 - s / MAX), 1.35);
      const escala = Math.min(46, persp * (0.72 + 0.28 * depth));
      return {
        s,
        x: cx + latM * escala,
        y: horizonte + (h - horizonte) * depth - elevM * escala * 0.35,
        ancho: ANCHO_VIA * escala,
        escala,
        lat: latM
      };
    };
    if (!segs.length) {
      // Sin ruta: una carretera de demostración con curvas suaves, sin fingir
      // que es la ruta del usuario.
      const lat0 = Math.sin(0.4) * 4;
      for (let s = 1.8; s <= MAX; s *= 1.055) {
        // Curva de demostración suave: se ve el trazado, pero no acaba en
        // una ese cerrada que parecía un cruce de cintas.
        const lat = Math.sin(s * 0.010) * 3 + Math.sin(s * 0.0035 + 0.4) * 4 - lat0;
        // Plano totalmente horizontal: sin elevación ficticia. La calzada y
        // las líneas sólo cambian de altura por la perspectiva de la distancia.
        out.push(proyectar(s, lat, 0));
      }
      return out;
    }
    const base = segs[Math.max(0, Math.min(segs.length - 1, idxBase))];
    const h0 = (base.heading || 0) * Math.PI / 180;
    const cosLat = Math.cos(base.lat * Math.PI / 180);
    // Sólo se pinta la carretera que queda POR DELANTE del coche. Si la ruta
    // dobla más de 90° (un cambio de sentido), su tramo de vuelta se proyecta
    // encima del de ida y parece que la calzada se bifurca. Cortamos en el
    // vértice: la curva se ve, pero el trazado nunca se cruza a sí mismo.
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
      // La carretera es un plano: no se inventan subidas ni bajadas. Así las
      // líneas no hacen picos y el eje queda recto sobre el asfalto.
      out.push(proyectar(avance, lateral, 0));
    };
    out.push(proyectar(1.8, 0, 0));
    for (let i = idxBase; i < segs.length - 1 && ultimoAvance < MAX && !cortar; i++) {
      const a = segs[i], b = segs[i + 1];
      const d = a.dist || 8;
      const pasos = Math.max(1, Math.min(14, Math.ceil(d / 3)));
      for (let k = 1; k <= pasos && ultimoAvance < MAX && !cortar; k++) {
        const t = k / pasos;
        add(a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t);
      }
    }
    // Suavizado corto: quita los dientes de sierra de los puntos de OSRM.
    for (let p = 0; p < 2; p++) {
      for (let i = 1; i < out.length - 1; i++) {
        out[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4;
      }
    }
    // Endereza los primeros 32 m bajo el coche y deja que la curva empiece
    // después: el vehículo queda siempre sobre su carril, no flotando.
    for (const p of out) {
      const k = Math.min(1, p.s / 32);
      p.x = cx + (p.x - cx) * k;
    }
    // Segundo suavizado del eje: elimina cualquier pico que quede entre dos
    // muestras de la ruta sin aplanar las curvas reales.
    for (let p = 0; p < 3; p++) {
      for (let i = 1; i < out.length - 1; i++) {
        out[i].x = (out[i - 1].x + out[i].x * 2 + out[i + 1].x) / 4;
      }
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

  function dibujarCalzada3d(w, h, horizonte) {
    const pts = trazado3d;
    if (pts.length < 3) return;
    // Un único polígono continuo para el arcén y otro para el asfalto. Antes
    // cada segmento se pintaba como un trazo ancho y en las curvas se
    // solapaban formando cintas y picos.
    ctx3d.save();
    ctx3d.lineJoin = 'round';
    const banda = (extra, color) => {
      ctx3d.fillStyle = color;
      ctx3d.beginPath();
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const x = p.x - (p.ancho + extra * p.escala) / 2;
        if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
      }
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        ctx3d.lineTo(p.x + (p.ancho + extra * p.escala) / 2, p.y);
      }
      ctx3d.closePath();
      ctx3d.fill();
    };
    banda(1.4, 'rgba(46,45,40,.95)');
    const asfalto = ctx3d.createLinearGradient(0, horizonte, 0, h);
    asfalto.addColorStop(0, '#3d526b');
    asfalto.addColorStop(0.45, '#2a3e56');
    asfalto.addColorStop(1, '#1a2a3d');
    banda(0, asfalto);
    ctx3d.restore();

    // Huellas de neumático: dan sensación de calzada usada.
    for (const off of [-2.15, 2.15]) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        ctx3d.strokeStyle = 'rgba(5,10,16,.32)';
        ctx3d.lineWidth = Math.min(16, Math.max(1, 0.55 * b.escala));
        ctx3d.beginPath();
        ctx3d.moveTo(a.x + off * a.escala, a.y);
        ctx3d.lineTo(b.x + off * b.escala, b.y);
        ctx3d.stroke();
      }
    }

    // Líneas blancas del borde: un solo trazo continuo por lado. Antes se
    // pintaba segmento a segmento y en las curvas aparecían picos y bolas.
    ctx3d.save();
    ctx3d.strokeStyle = 'rgba(235,246,255,.88)';
    ctx3d.lineCap = 'round';
    ctx3d.lineJoin = 'round';
    ctx3d.lineWidth = Math.min(3, Math.max(1, 0.10 * pts[Math.min(8, pts.length - 1)].escala));
    for (const off of [-3.36, 3.36]) {
      ctx3d.beginPath();
      pts.forEach((p, i) => {
        const x = p.x + off * p.escala;
        if (i) ctx3d.lineTo(x, p.y); else ctx3d.moveTo(x, p.y);
      });
      ctx3d.stroke();
    }

    // Eje discontinuo: también un único trazado, con guiones regulares sobre
    // el plano en vez de un pico por cada muestra.
    ctx3d.strokeStyle = 'rgba(226,240,255,.76)';
    ctx3d.lineCap = 'butt';
    ctx3d.setLineDash([16, 14]);
    ctx3d.beginPath();
    pts.forEach((p, i) => (i ? ctx3d.lineTo(p.x, p.y) : ctx3d.moveTo(p.x, p.y)));
    ctx3d.stroke();
    ctx3d.setLineDash([]);

    // Ruta azul luminosa sobre el asfalto: un solo trazado continuo.
    ctx3d.strokeStyle = 'rgba(47,140,255,.28)';
    ctx3d.shadowColor = '#2f8cff';
    ctx3d.shadowBlur = 8;
    ctx3d.lineWidth = Math.min(6, Math.max(2, 0.16 * pts[Math.min(8, pts.length - 1)].escala));
    ctx3d.beginPath();
    pts.forEach((p, i) => (i ? ctx3d.lineTo(p.x, p.y) : ctx3d.moveTo(p.x, p.y)));
    ctx3d.stroke();
    ctx3d.shadowBlur = 0;
    ctx3d.strokeStyle = 'rgba(165,226,255,.88)';
    ctx3d.lineWidth = Math.min(2.4, Math.max(1, 0.06 * pts[Math.min(8, pts.length - 1)].escala));
    ctx3d.beginPath();
    pts.forEach((p, i) => (i ? ctx3d.lineTo(p.x, p.y) : ctx3d.moveTo(p.x, p.y)));
    ctx3d.stroke();
    ctx3d.restore();

  }

  function dibujarGuardarrailes3d() {
    const pts = trazado3d;
    ctx3d.save();
    ctx3d.lineJoin = 'round';
    ctx3d.lineCap = 'round';
    for (const lado of [-1, 1]) {
      // Barandilla como trazo continuo. El relleno anterior se cruzaba en las
      // curvas y generaba los picos blancos que se veían a la derecha.
      const      rail = pts.map(p => ({
        x: p.x + lado * 4.55 * p.escala,
        // Barandilla sobre el mismo plano de la calzada: sin subir ni bajar.
        y: p.y
      }));
      ctx3d.strokeStyle = 'rgba(150,174,194,.62)';
      // Grosor en píxeles, no multiplicado por la escala: antes la barandilla
      // medía decenas de píxeles y tapaba media carretera.
      ctx3d.lineWidth = Math.max(1, Math.min(3, 0.08 * (pts[0]?.escala || 1)));
      ctx3d.beginPath();
      rail.forEach((p, i) => (i ? ctx3d.lineTo(p.x, p.y) : ctx3d.moveTo(p.x, p.y)));
      ctx3d.stroke();
      // Postes separados y verticales, sin formar dientes.
      for (let i = 8; i < pts.length; i += 10) {
        const p = pts[i];
        const x = p.x + lado * 4.55 * p.escala;
        ctx3d.strokeStyle = 'rgba(110,130,148,.5)';
        ctx3d.lineWidth = Math.max(1, 0.12 * p.escala);
        ctx3d.beginPath();
        ctx3d.moveTo(x, p.y);
        ctx3d.lineTo(x, p.y - 0.78 * p.escala);
        ctx3d.stroke();
      }
    }
    ctx3d.restore();
  }

  function dibujarHorizonte3d(w, h, horizonte) {
    // Silueta de ciudad lejana: llena el horizonte y da profundidad sin
    // depender de datos externos.
    const semilla = (n) => {
      const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return x - Math.floor(x);
    };
    const bruma = ctx3d.createLinearGradient(0, horizonte - h * 0.09, 0, horizonte + 4);
    bruma.addColorStop(0, 'rgba(30,70,110,0)');
    bruma.addColorStop(0.72, 'rgba(32,74,112,.28)');
    bruma.addColorStop(1, 'rgba(20,46,72,.55)');
    ctx3d.fillStyle = bruma;
    ctx3d.fillRect(0, horizonte - h * 0.09, w, h * 0.09 + 4);
    let x = -10;
    let i = 0;
    while (x < w + 10) {
      const ancho = 12 + semilla(i) * 38;
      const alto = 10 + semilla(i + 40) * h * 0.075;
      const y = horizonte - alto;
      ctx3d.fillStyle = i % 3 === 0 ? '#0a1926' : '#0b1b28';
      ctx3d.fillRect(x, y, ancho, alto);
      if (i % 4 === 0) {
        ctx3d.fillStyle = '#0a1926';
        ctx3d.fillRect(x + ancho * 0.45, y - alto * 0.18, ancho * 0.1, alto * 0.18);
      }
      ctx3d.fillStyle = 'rgba(120,200,255,.22)';
      for (let f = 0; f < 7; f++) {
        if (semilla(i * 13 + f) > 0.62) {
          ctx3d.fillRect(x + 3 + (f % 3) * (ancho - 8) / 3, y + 4 + Math.floor(f / 3) * (alto / 3), 2, 2);
        }
      }
      x += ancho + 3 + semilla(i + 90) * 10;
      i++;
    }
  }

  function dibujarEntorno3d(w, h, horizonte, t, idxVista) {
    const pts = trazado3d;
    // Del fondo al primer plano para que lo cercano tape lo lejano.
    for (let i = pts.length - 1; i >= 6; i -= 5) {
      const p = pts[i];
      if (p.escala < 2.2) continue;
      const lado = (i % 10 === 0) ? -1 : 1;
      const tipo = (i * 7 + Math.floor(idxVista / 8)) % 9;
      if (tipo < 6) {
        const off = (11 + (i % 5) * 2.4) * p.escala;
        const x = p.x + lado * off;
        const base = p.y;
        const alto = (6.5 + (i % 4) * 1.6) * p.escala;
        const ancho = alto * 0.36;
        ctx3d.fillStyle = '#21170f';
        ctx3d.fillRect(x - Math.max(1, ancho * 0.055), base - alto * 0.18, Math.max(2, ancho * 0.11), alto * 0.18);
        ctx3d.fillStyle = i % 2 ? '#0a2d23' : '#0c3528';
        ctx3d.beginPath();
        ctx3d.moveTo(x, base - alto);
        ctx3d.lineTo(x + ancho / 2, base - alto * 0.12);
        ctx3d.lineTo(x - ancho / 2, base - alto * 0.12);
        ctx3d.closePath();
        ctx3d.fill();
        ctx3d.fillStyle = 'rgba(34,120,92,.5)';
        ctx3d.beginPath();
        ctx3d.moveTo(x, base - alto * 0.82);
        ctx3d.lineTo(x + ancho * 0.3, base - alto * 0.3);
        ctx3d.lineTo(x - ancho * 0.3, base - alto * 0.3);
        ctx3d.closePath();
        ctx3d.fill();
      } else if (tipo < 8) {
        const off = (15 + (i % 4) * 3) * p.escala;
        const x = p.x + lado * off;
        const base = p.y;
        const alto = (9 + (i % 5) * 2.5) * p.escala;
        const ancho = alto * 0.52;
        ctx3d.fillStyle = '#0b1522';
        ctx3d.fillRect(x - ancho / 2, base - alto, ancho, alto);
        ctx3d.fillStyle = 'rgba(105,200,255,.35)';
        for (let f = 0; f < 3; f++) {
          if ((i + f) % 3 === 0) ctx3d.fillRect(x - ancho * 0.26, base - alto * (0.78 - f * 0.2), ancho * 0.16, Math.max(1, alto * 0.035));
          if ((i + f) % 4 === 0) ctx3d.fillRect(x + ancho * 0.08, base - alto * (0.78 - f * 0.2), ancho * 0.16, Math.max(1, alto * 0.035));
        }
      } else {
        // Farola.
        const x = p.x + lado * 7.2 * p.escala;
        const base = p.y;
        const alto = 7.5 * p.escala;
        ctx3d.strokeStyle = 'rgba(140,160,180,.5)';
        ctx3d.lineWidth = Math.max(1, 0.09 * p.escala);
        ctx3d.beginPath();
        ctx3d.moveTo(x, base);
        ctx3d.lineTo(x, base - alto);
        ctx3d.lineTo(x + lado * 1.1 * p.escala, base - alto);
        ctx3d.stroke();
        const halo = ctx3d.createRadialGradient(x + lado * 1.1 * p.escala, base - alto, 0, x + lado * 1.1 * p.escala, base - alto, 2.2 * p.escala);
        halo.addColorStop(0, 'rgba(255,220,150,.5)');
        halo.addColorStop(1, 'rgba(255,220,150,0)');
        ctx3d.fillStyle = halo;
        ctx3d.beginPath();
        ctx3d.arc(x + lado * 1.1 * p.escala, base - alto, 2.2 * p.escala, 0, Math.PI * 2);
        ctx3d.fill();
      }
    }
  }

  function dibujar3d() {
    if (!ctx3d || !canvas3d) return;
    const cw = canvas3d.clientWidth || window.innerWidth;
    const ch = canvas3d.clientHeight || window.innerHeight;
    if (canvas3d.width !== cw || canvas3d.height !== ch) {
      canvas3d.width = cw;
      canvas3d.height = ch;
    }
    const w = canvas3d.width, h = canvas3d.height;
    const ahora = performance.now();
    ultimoFrame3d = ahora;
    // El 3D ya no es la cámara a pantalla completa: es la escena del coche y la
    // carretera con el HUD dinámico encima. Si la imagen aún no cargó, se pinta
    // una calzada de respaldo, nunca un fotograma de cámara.
    if (!dibujarEscena3d(w, h, zoomFondo3d)) {
      const g = ctx3d.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#08111f');
      g.addColorStop(1, '#1a2a3f');
      ctx3d.fillStyle = g;
      ctx3d.fillRect(0, 0, w, h);
      ctx3d.fillStyle = '#2b3b52';
      ctx3d.beginPath();
      ctx3d.moveTo(w * 0.5, h * 0.34);
      ctx3d.lineTo(w * 0.56, h * 0.34);
      ctx3d.lineTo(w * 0.9, h);
      ctx3d.lineTo(w * 0.1, h);
      ctx3d.closePath();
      ctx3d.fill();
      ctx3d.fillStyle = 'rgba(226,232,240,.85)';
      ctx3d.font = `600 ${Math.max(13, Math.min(20, w * 0.035))}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText('Cargando escena 3D…', w / 2, h / 2);
    }
    dibujarHud3d(w, h);
  }

  // Escena base 1000×420 (coche azul de espaldas + carretera). Se cubre la
  // pantalla y se ancla abajo para no cortar el coche; el zoom del HUD escala
  // solo la escena, nunca los textos ni los botones.
  function dibujarEscena3d(w, h, zoom = 1) {
    const img = imagenEscena3d;
    if (!img || !img.complete || !img.naturalWidth) return false;
    const escala = Math.max(w / img.naturalWidth, h / img.naturalHeight) * zoom;
    const dw = img.naturalWidth * escala;
    const dh = img.naturalHeight * escala;
    const dx = (w - dw) / 2;
    const dy = Math.min(0, h - dh);
    ctx3d.drawImage(img, dx, dy, dw, dh);
    // Degradado solo para legibilidad del HUD, no es parte de la imagen.
    const sombra = ctx3d.createLinearGradient(0, 0, 0, h);
    sombra.addColorStop(0, 'rgba(3,7,18,.42)');
    sombra.addColorStop(.32, 'rgba(3,7,18,0)');
    sombra.addColorStop(.72, 'rgba(3,7,18,.10)');
    sombra.addColorStop(1, 'rgba(3,7,18,.58)');
    ctx3d.fillStyle = sombra;
    ctx3d.fillRect(0, 0, w, h);
    return true;
  }

  // Cámara a pantalla completa con cobertura tipo object-fit: cover. Se
  // conserva para el ADAS; la vista 3D ya no la usa.
  function dibujarCamara3d(w, h, v, zoom = 1) {
    const vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return false;
    const escala = Math.max(w / vw, h / vh) * zoom;
    const dw = vw * escala, dh = vh * escala;
    ctx3d.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
    return true;
  }

  function panel3d(x, y, ancho, alto, radio = 14, alpha = 0.86) {
    ctx3d.fillStyle = `rgba(10, 13, 18, ${alpha})`;
    ctx3d.beginPath();
    if (ctx3d.roundRect) ctx3d.roundRect(x, y, ancho, alto, radio);
    else ctx3d.rect(x, y, ancho, alto);
    ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(255,255,255,.08)';
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
    const m = (tipo || '').toLowerCase();
    if (m.includes('left') || m.includes('izq')) {
      ctx3d.beginPath();
      ctx3d.moveTo(8, 18); ctx3d.lineTo(8, 8); ctx3d.lineTo(-8, 8);
      ctx3d.moveTo(-2, 0); ctx3d.lineTo(-10, 8); ctx3d.lineTo(-2, 16);
      ctx3d.stroke();
    } else if (m.includes('round') || m.includes('rotonda')) {
      ctx3d.beginPath();
      ctx3d.arc(0, 2, 11, Math.PI * 0.15, Math.PI * 1.55);
      ctx3d.stroke();
      ctx3d.beginPath();
      ctx3d.moveTo(9, -6); ctx3d.lineTo(12, 2); ctx3d.lineTo(4, 2);
      ctx3d.stroke();
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

  function dibujarHud3d(w, h) {
    botones3d = [];
    const u = Math.max(0.62, h / 768);
    const ruta = rutaActiva();
    const s = ruta?.steps?.[paso] || ruta?.steps?.[0];
    const conGps = Boolean(ultimaPos);
    // Sin GPS, restante(0,0) mediría desde el golfo de Guinea y la ETA saldría
    // disparatada. Se usa la distancia total de la ruta como respaldo.
    const rest = ruta ? (conGps ? restante(ultimaPos.lat, ultimaPos.lon) : (ruta.distance || 0)) : 0;
    const segundosRestantes = segundosRestantesRuta(ruta, rest);
    const min = ruta && rest > 0 ? Math.max(1, Math.round(segundosRestantes / 60)) : 0;
    const llegada = ruta ? horaDeLlegada(segundosRestantes) : '--:--';
    const kmh = ultimaPos ? limiteActual(ultimaPos.lat, ultimaPos.lon) : null;
    const calle = s?.name || ruta?.name || 'Calle o carretera';

    // --- Tarjeta de próximo giro (arriba izquierda, escala de la referencia)
    const cw = Math.min(w * 0.50, 330 * u);
    const ch = 92 * u;
    panel3d(10 * u, 10 * u, cw, ch, 16 * u, 0.90);
    ctx3d.fillStyle = 'rgba(255,255,255,.06)';
    ctx3d.beginPath();
    if (ctx3d.roundRect) ctx3d.roundRect(10 * u, 10 * u, cw, ch, 16 * u);
    else ctx3d.rect(10 * u, 10 * u, cw, ch);
    ctx3d.fill();
    dibujarIconoGiro3d(38 * u, 42 * u, s?.maneuver || s?.modifier || '', '#f8fafc', u);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `800 ${19 * u}px system-ui, sans-serif`;
    const titulo = s ? instruccion(s) : 'Continúa recto';
    ctx3d.fillText(titulo.slice(0, 28), 64 * u, 38 * u, Math.max(40, cw - 74 * u));
    ctx3d.fillStyle = '#cbd5e1';
    ctx3d.font = `600 ${14 * u}px system-ui, sans-serif`;
    const distM = conGps && Number.isFinite(s?.lat)
      ? distancia(ultimaPos.lat, ultimaPos.lon, s.lat, s.lon)
      : (s?.distance || rest || 0);
    ctx3d.fillText(`en ${metros(distM)}`, 64 * u, 60 * u);
    ctx3d.fillStyle = 'rgba(148,163,184,.9)';
    ctx3d.font = `500 ${12 * u}px system-ui, sans-serif`;
    ctx3d.fillText(calle.slice(0, 30), 64 * u, 80 * u, Math.max(40, cw - 74 * u));

    // --- Brújula (arriba derecha)
    const cxBru = w - 48 * u;
    const cyBru = 42 * u;
    const rBru = 34 * u;
    ctx3d.fillStyle = 'rgba(10,13,18,.86)';
    ctx3d.beginPath(); ctx3d.arc(cxBru, cyBru, rBru, 0, Math.PI * 2); ctx3d.fill();
    ctx3d.strokeStyle = 'rgba(255,255,255,.14)';
    ctx3d.lineWidth = 1.5 * u; ctx3d.stroke();
    ctx3d.save();
    ctx3d.translate(cxBru, cyBru);
    ctx3d.rotate(((rumbo || 0) * Math.PI) / 180);
    ctx3d.fillStyle = '#ef4444';
    ctx3d.beginPath(); ctx3d.moveTo(0, -22 * u); ctx3d.lineTo(6 * u, 0); ctx3d.lineTo(-6 * u, 0); ctx3d.closePath(); ctx3d.fill();
    ctx3d.fillStyle = '#e2e8f0';
    ctx3d.beginPath(); ctx3d.moveTo(0, 22 * u); ctx3d.lineTo(6 * u, 0); ctx3d.lineTo(-6 * u, 0); ctx3d.closePath(); ctx3d.fill();
    ctx3d.restore();
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `800 ${13 * u}px system-ui, sans-serif`;
    ctx3d.textAlign = 'center';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillText('N', cxBru, cyBru - 24 * u);

    // --- Botonera lateral derecha
    const bx = w - 36 * u;
    let by = Math.max(76 * u, cyBru + 54 * u);
    const pasoB = 47 * u;
    const rB = 19 * u;
    const botones = ['+', '−', '🎙', '⚙', '⛽', '🌙'];
    const acciones = [
      () => { zoomFondo3d = Math.min(1.6, zoomFondo3d + 0.12); },
      () => { zoomFondo3d = Math.max(1, zoomFondo3d - 0.12); },
      () => document.getElementById('rutaMicro')?.click(),
      () => document.getElementById('menuBtn')?.click(),
      () => buscar('gasolinera'),
      () => document.getElementById('rutaNoche')?.click()
    ];
    for (let i = 0; i < botones.length; i++) {
      const b = botones[i];
      ctx3d.fillStyle = 'rgba(10,13,18,.82)';
      ctx3d.beginPath(); ctx3d.arc(bx, by, rB, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = 'rgba(255,255,255,.12)'; ctx3d.lineWidth = 1; ctx3d.stroke();
      ctx3d.fillStyle = '#e2e8f0';
      ctx3d.font = `700 ${(b.length > 1 ? 13 : 20) * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.textBaseline = 'middle';
      ctx3d.fillText(b, bx, by + (b === '+' ? -1 : 1));
      botones3d.push({ x: bx, y: by, r: Math.max(25, rB + 9), accion: acciones[i] });
      by += pasoB;
    }

    // --- Velocidad y límite (abajo izquierda)
    const vx = 14 * u, vy = h - 96 * u, vw = Math.min(w * 0.26, 170 * u), vh = 80 * u;
    panel3d(vx, vy, vw, vh, 16 * u, 0.86);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'alphabetic';
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `900 ${Math.round(vh * 0.55)}px system-ui, sans-serif`;
    ctx3d.fillText(String(Math.round(velocidad)), vx + 14 * u, vy + vh * 0.66);
    ctx3d.fillStyle = '#94a3b8';
    ctx3d.font = `700 ${Math.round(vh * 0.15)}px system-ui, sans-serif`;
    ctx3d.fillText('km/h', vx + 14 * u, vy + vh * 0.88);
    if (kmh) {
      const lx = vx + vw - 34 * u, ly = vy + vh / 2;
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.beginPath(); ctx3d.arc(lx, ly, 25 * u, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = '#dc2626'; ctx3d.lineWidth = 5 * u;
      ctx3d.beginPath(); ctx3d.arc(lx, ly, 20 * u, 0, Math.PI * 2); ctx3d.stroke();
      ctx3d.fillStyle = '#0f172a';
      ctx3d.font = `900 ${18 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText(String(kmh), lx, ly + 1);
    }

    // --- Tarjeta ETA (abajo centro)
    // En vertical no hay ancho para «02:27» y «220 m · 1 min» en la misma línea:
    // se apila la distancia/tiempo debajo. En horizontal se mantiene la fila.
    const compacto = w < 520;
    const distTxt = rest > 1000 ? `${(rest / 1000).toFixed(1)} km` : `${Math.round(rest)} m`;
    let ew, eh, ex, ey;
    if (compacto) {
      ex = Math.max(114, vx + vw + 8 * u);
      ew = w - ex - 12 * u;
      eh = 90 * u;
      ey = h - 108 * u;
    } else {
      ew = Math.min(w * 0.52, 380 * u);
      eh = 74 * u;
      ex = Math.max(114, (w - ew) / 2);
      ey = h - 90 * u;
    }
    panel3d(ex, ey, ew, eh, 18 * u, 0.88);
    ctx3d.textAlign = 'left';
    ctx3d.textBaseline = 'middle';
    ctx3d.fillStyle = '#94a3b8';
    ctx3d.font = `700 ${12 * u}px system-ui, sans-serif`;
    ctx3d.fillText('ETA', ex + 14 * u, ey + (compacto ? 18 : 15) * u);
    ctx3d.fillStyle = '#f8fafc';
    ctx3d.font = `800 ${(compacto ? 16 : 17) * u}px system-ui, sans-serif`;
    ctx3d.fillText(llegada, ex + (compacto ? 46 : 50) * u, ey + (compacto ? 18 : 15) * u);
    if (compacto) {
      ctx3d.fillStyle = '#22d3ee';
      ctx3d.font = `800 ${15 * u}px system-ui, sans-serif`;
      ctx3d.fillText(`${distTxt} · ${min ? `${min} min` : '-- min'}`, ex + 14 * u, ey + 42 * u, ew - 28 * u);
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.font = `700 ${13 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.fillText(calle.slice(0, 34), ex + ew / 2, ey + 68 * u, Math.max(40, ew - 24 * u));
    } else {
      ctx3d.fillStyle = '#22d3ee';
      ctx3d.font = `800 ${15 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'right';
      ctx3d.fillText(`${distTxt} · ${min ? `${min} min` : '-- min'}`, ex + ew - 14 * u, ey + 15 * u);
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.font = `700 ${14 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center';
      ctx3d.fillText(calle.slice(0, 34), ex + ew / 2, ey + 47 * u, Math.max(40, ew - 20 * u));
    }
    ctx3d.strokeStyle = 'rgba(34,211,238,.55)';
    ctx3d.lineWidth = 2 * u;
    ctx3d.beginPath(); ctx3d.moveTo(ex + 14 * u, ey + eh - 1); ctx3d.lineTo(ex + ew - 14 * u, ey + eh - 1); ctx3d.stroke();

    // --- Botones inferiores derecha
    const byBtn = compacto ? h - 150 * u : h - 52 * u;
    const accionesInferiores = [
      () => document.getElementById('rutaGps')?.click(),
      () => iniciarAr()
    ];
    for (const [i, icono] of ['◎', '➜'].entries()) {
      const x = w - 26 * u - i * 52 * u;
      ctx3d.fillStyle = i === 0 ? 'rgba(37,99,235,.92)' : 'rgba(10,13,18,.86)';
      ctx3d.beginPath(); ctx3d.arc(x, byBtn, 22 * u, 0, Math.PI * 2); ctx3d.fill();
      ctx3d.strokeStyle = 'rgba(255,255,255,.16)'; ctx3d.lineWidth = 1; ctx3d.stroke();
      ctx3d.fillStyle = '#f8fafc';
      ctx3d.font = `700 ${19 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText(icono, x, byBtn + 1);
      botones3d.push({ x, y: byBtn, r: Math.max(27, 25 * u), accion: accionesInferiores[i] });
    }

    // --- Avisos de estado
    const sinGps = !ultimaPos || (ultimaVez && Date.now() - ultimaVez > 20000);
    if (sinGps && ruta) {
      const txt = 'SIN SEÑAL GPS · posición no disponible';
      ctx3d.fillStyle = 'rgba(30,8,14,.9)';
      const an = Math.min(w - 30, 300 * u), x = (w - an) / 2, y = h * 0.16;
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(x, y, an, 30 * u, 10 * u); else ctx3d.rect(x, y, an, 30 * u);
      ctx3d.fill();
      ctx3d.fillStyle = '#ff8aa1';
      ctx3d.font = `700 ${12 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText(txt, w / 2, y + 15 * u);
    } else if (recalculando) {
      const txt = '↻ RECALCULANDO RUTA…';
      ctx3d.fillStyle = 'rgba(20,16,4,.9)';
      const an = Math.min(w - 30, 260 * u), x = (w - an) / 2, y = h * 0.46;
      ctx3d.beginPath();
      if (ctx3d.roundRect) ctx3d.roundRect(x, y, an, 28 * u, 10 * u); else ctx3d.rect(x, y, an, 28 * u);
      ctx3d.fill();
      ctx3d.fillStyle = '#fbbf24';
      ctx3d.font = `700 ${11 * u}px system-ui, sans-serif`;
      ctx3d.textAlign = 'center'; ctx3d.textBaseline = 'middle';
      ctx3d.fillText(txt, w / 2, y + 14 * u);
    }
  }

  function alPulsar3d(e) {
    if (!canvas3d) return;
    const rect = canvas3d.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas3d.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas3d.height / rect.height);
    for (const b of botones3d) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) {
        b.accion?.();
        return;
      }
    }
  }

  function iniciar3d() {
    if (!init3d()) return;
    idx3dSuave = null;
    // Un solo modo de vista a la vez: si AR está abierto, se cierra.
    if (typeof vistaArActiva !== 'undefined' && vistaArActiva && typeof detenerAr === 'function') detenerAr();
    vista3dActiva = true;
    zoomFondo3d = 1;
    // El 3D no pide cámara: la escena del coche y la carretera es ilustrativa y
    // los datos del HUD salen de la ruta. La cámara queda para el ADAS.
    document.getElementById('ruta3dToggle')?.classList.add('activo');
    document.getElementById('ruta3dToggle')?.setAttribute('aria-pressed', 'true');
    document.querySelector('.ruta-shell')?.classList.add('ruta-3d-activo');
    // La escena se pinta en el canvas 3D; el coche WebGL no se usa aquí.
    const canvasCoche = document.getElementById('rutaCoche3d');
    if (canvasCoche) canvasCoche.style.display = 'none';
    moduloCoche3d?.activar?.(false);
    // La imagen de referencia es 16:9: en horizontal se ve completa.
    const shell3d = document.querySelector('.ruta-shell');
    if (shell3d?.requestFullscreen && !document.fullscreenElement) {
      try { shell3d.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); } catch (_e) { /* fallback CSS */ }
    }
    try { screen.orientation?.lock?.('landscape').catch(() => {}); } catch (_e) { /* se queda como esté */ }
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
    detenerCamara3d();
    if (animacion3d) cancelAnimationFrame(animacion3d);
    animacion3d = null;
    document.getElementById('ruta3dToggle')?.classList.remove('activo');
    document.getElementById('ruta3dToggle')?.setAttribute('aria-pressed', 'false');
    document.querySelector('.ruta-shell')?.classList.remove('ruta-3d-activo');
    if (canvas3d) canvas3d.hidden = true;
    const canvasCoche = document.getElementById('rutaCoche3d');
    if (canvasCoche) canvasCoche.style.display = '';
    moduloCoche3d?.activar?.(false);
    try { screen.orientation?.unlock?.(); } catch (_e) { /* nada */ }
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
