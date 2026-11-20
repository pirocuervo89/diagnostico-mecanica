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

  let mapa = null;
  let capaTiles = null;
  let yo = null;
  let halo = null;
  let destino = null;
  let capaAvisos = null;
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

  const CLAVE_NOCHE = 'dm_ruta_noche';
  const CLAVE_OBD = 'dm_obd_ultimo';
  const CLAVE_POS = 'dm_ruta_ultima';

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
    const nombre = s.name ? ` en ${s.name}` : '';
    if (s.type === 'depart') return `Sal${nombre}`;
    if (s.type === 'arrive') return 'Llegas a tu destino';
    if (s.type === 'roundabout' || s.type === 'rotary') return `Toma la rotonda${nombre}`;
    if (s.type === 'merge') return `Incorpórate${nombre}`;
    if (s.type === 'fork') return `Coge el desvío ${m === 'left' ? 'izquierdo' : 'derecho'}${nombre}`;
    if (s.type === 'end of road') return `Al final de la vía, ${m === 'left' ? 'izquierda' : 'derecha'}${nombre}`;
    if (s.type === 'continue' || s.type === 'new name') return `Continúa${nombre}`;
    const giro = m === 'left' || m === 'slight left' || m === 'sharp left'
      ? 'a la izquierda'
      : m === 'right' || m === 'slight right' || m === 'sharp right' ? 'a la derecha' : 'recto';
    return `Gira ${giro}${nombre}`;
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
    try { window.MayaHablar?.(texto); } catch (_e) { /* opcional */ }
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
    if (window.L) { cb(); return; }
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
    mapa = L.map(elMapa, { zoomControl: false, attributionControl: true, preferCanvas: true })
      .setView([40.4168, -3.7038], 6);
    aplicarTema(temaInicial());
    capaAvisos = L.layerGroup().addTo(mapa);
    mapa.on('dragstart', () => { siguiendo = false; });
    setTimeout(() => mapa.invalidateSize(), 250);
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

  const ICONO_AVISO = { radar: '🚨', camara: '📷', obra: '🚧', senal: '🚦', peligro: '⚠️' };

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

    if (siguiendo || navegando) mapa.setView([lat, lon], navegando ? 17 : 16, { animate: true });
    if (navegando) seguirRuta(lat, lon);
    vigilarAvisos(lat, lon);
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
    if (navegando) {
      siguiendo = true;
      paso = 0;
      avisar('Navegación iniciada. Te aviso de radares, obras y averías.', 'ok', 5000);
      if (ultimaPos) mapa.setView([ultimaPos.lat, ultimaPos.lon], 17);
      decir('Navegación iniciada. Nos vamos.');
      revisarOBD(true);
    } else {
      decir('Navegación detenida');
      avisar('Navegación detenida.', 'info', 3000);
    }
    pintarPanel();
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

  // Metros entre el coche y la línea de la ruta. Si se separa de forma
  // sostenida, el usuario se ha desviado y hay que trazar otra.
  function distanciaARuta(lat, lon) {
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
      avisos.filter(a => a.kind !== 'limite').forEach(a => {
        L.marker([a.lat, a.lon], { icon: iconoAviso(a), title: `${a.kind}${a.maxspeed ? ` ${a.maxspeed}` : ''}` })
          .bindPopup(`${a.label}${a.maxspeed ? ` · ${a.maxspeed}` : ''}${a.name ? ` · ${a.name}` : ''}`)
          .addTo(capaAvisos);
      });
      const visibles = avisos.filter(a => a.kind !== 'limite');
      if (elInfo) {
        elInfo.textContent = visibles.length
          ? `${visibles.length} avisos en la zona (${visibles.filter(a => a.kind === 'radar').length} radares)`
          : 'Sin avisos conocidos en esta zona';
      }
    } catch (_e) { /* sin avisos se navega igual */ }
  }

  function vigilarAvisos(lat, lon) {
    if (!capaAvisos) return;
    const pendientes = avisos.filter(a => !avisados.has(a.id));
    for (const a of pendientes) {
      const d = distancia(lat, lon, a.lat, a.lon);
      const radio = a.kind === 'senal' ? 180 : a.kind === 'radar' ? 700 : 450;
      if (d > radio) continue;
      avisados.add(a.id);
      const texto = a.kind === 'radar'
        ? `Radar a ${metros(d)}${a.maxspeed ? `, límite ${a.maxspeed}` : ''}`
        : `${a.label} a ${metros(d)}`;
      avisar(texto, a.kind === 'radar' ? 'radar' : 'aviso', 9000);
      pitido(a.kind === 'radar' ? 980 : 700);
      try { navigator.vibrate?.([60, 40, 60]); } catch (_e) {}
      decir(texto);
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

  elMicro?.addEventListener('click', dictarDestino);
  $('#rutaMas')?.addEventListener('click', () => mapa?.zoomIn());
  $('#rutaMenos')?.addEventListener('click', () => mapa?.zoomOut());
  elNoche?.addEventListener('click', () => aplicarTema(!noche));
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
    irA
  };
})();
