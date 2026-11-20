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
  const elInfo = $('#rutaInfo');

  let mapa = null;
  let yo = null;
  let halo = null;
  let destino = null;
  let capaRadares = null;
  let capaRuta = null;
  let capaRutaGlow = null;
  let ruta = null;
  let paso = 0;
  let navegando = false;
  let siguiendo = false;
  let ultimaPos = null;
  let ultimaVez = 0;
  let velocidad = 0;
  let avisados = new Set();
  let temporizadorBusqueda = 0;

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

  function pitido() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gan.gain.setValueAtTime(.0001, ctx.currentTime);
      gan.gain.exponentialRampToValueAtTime(.25, ctx.currentTime + .03);
      gan.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .45);
      osc.connect(gan).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + .5);
      setTimeout(() => ctx.close?.(), 800);
    } catch (_e) { /* sin audio */ }
  }

  function decir(texto) {
    try { window.MayaHablar?.(texto); } catch (_e) { /* la voz es opcional */ }
  }

  function avisar(texto, tono = 'info', ms = 6000) {
    if (!elAviso) return;
    elAviso.textContent = texto;
    elAviso.dataset.tono = tono;
    elAviso.hidden = false;
    clearTimeout(avisar._t);
    avisar._t = setTimeout(() => { elAviso.hidden = true; }, ms);
  }

  // ------------------------------------------------------------ mapa
  function cuandoLeaflet(cb, intentos = 0) {
    if (window.L) { cb(); return; }
    if (intentos > 40) {
      elMapa.innerHTML = '<div class="ruta-sin-mapa"><b>No se pudo cargar el mapa</b><a href="https://www.google.com/maps" target="_blank" rel="noopener">Abrir en Google Maps</a></div>';
      return;
    }
    setTimeout(() => cuandoLeaflet(cb, intentos + 1), 250);
  }

  function initMapa() {
    if (mapa || !window.L) return;
    mapa = L.map(elMapa, {
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true
    }).setView([40.4168, -3.7038], 6);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap &copy; CARTO'
    }).addTo(mapa);

    capaRadares = L.layerGroup().addTo(mapa);
    mapa.on('dragstart', () => { siguiendo = false; });
    setTimeout(() => mapa.invalidateSize(), 250);
  }

  function iconoYo() {
    return L.divIcon({
      className: 'ruta-punto',
      html: '<span class="ruta-punto-halo"></span><span class="ruta-punto-coche"></span>',
      iconSize: [34, 34],
      iconAnchor: [17, 17]
    });
  }

  function iconoDestino() {
    return L.divIcon({
      className: 'ruta-destino',
      html: '<span></span>',
      iconSize: [26, 26],
      iconAnchor: [13, 24]
    });
  }

  function iconoRadar(r) {
    return L.divIcon({
      className: 'ruta-radar',
      html: `<span>${r.maxspeed ? String(r.maxspeed).replace(/[^0-9]/g, '') : '📷'}</span>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  }

  // ------------------------------------------------------------ GPS
  function pintarVelocidad(v) {
    if (!elVel) return;
    elVel.hidden = false;
    elVel.querySelector('b').textContent = String(Math.max(0, Math.round(v)));
  }

  function alMover(pos) {
    const { latitude: lat, longitude: lon, accuracy, speed } = pos.coords;
    ultimaPos = { lat, lon };
    const ahora = Date.now();
    if (Number.isFinite(speed) && speed !== null) velocidad = speed * 3.6;
    else if (ultimaVez) {
      const dt = (ahora - ultimaVez) / 1000;
      if (dt > .8) velocidad = distancia(mapa._ultLat, mapa._ultLon, lat, lon) / dt * 3.6;
    }
    ultimaVez = ahora;
    mapa._ultLat = lat;
    mapa._ultLon = lon;
    pintarVelocidad(Math.min(velocidad, 260));

    if (!yo) {
      yo = L.marker([lat, lon], { icon: iconoYo(), zIndexOffset: 500 }).addTo(mapa);
      halo = L.circle([lat, lon], {
        radius: Math.min(accuracy || 25, 200),
        color: '#38e1ff', weight: 1, fillColor: '#38e1ff', fillOpacity: .12
      }).addTo(mapa);
      if (!destino) mapa.setView([lat, lon], 15);
    } else {
      yo.setLatLng([lat, lon]);
      halo.setLatLng([lat, lon]);
      halo.setRadius(Math.min(accuracy || 25, 200));
    }

    if (siguiendo || navegando) mapa.setView([lat, lon], navegando ? 17 : 16, { animate: true });
    if (navegando) seguirRuta(lat, lon);
    vigilarRadares(lat, lon);
  }

  function errorGps(err) {
    const texto = err && err.code === 1
      ? 'Dale permiso de ubicación al navegador para ver dónde estás.'
      : 'No se pudo leer el GPS. Sal al exterior y vuelve a intentarlo.';
    avisar(texto, 'aviso', 8000);
  }

  function arrancarGps() {
    if (!navigator.geolocation) { avisar('Este navegador no tiene GPS disponible.', 'aviso', 8000); return; }
    navigator.geolocation.watchPosition(alMover, errorGps, {
      enableHighAccuracy: true,
      maximumAge: 4000,
      timeout: 20000
    });
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

  elBuscar?.addEventListener('submit', e => {
    e.preventDefault();
    buscar(elDestino.value);
  });

  elDestino?.addEventListener('input', () => {
    clearTimeout(temporizadorBusqueda);
    const valor = elDestino.value;
    if (valor.trim().length < 3) { elResultados.hidden = true; return; }
    temporizadorBusqueda = setTimeout(() => buscar(valor), 550);
  });

  elResultados?.addEventListener('click', e => {
    const btn = e.target.closest('[data-lat]');
    if (!btn) return;
    elResultados.hidden = true;
    elDestino.value = btn.dataset.nombre || 'Destino';
    fijarDestino(Number(btn.dataset.lat), Number(btn.dataset.lon));
  });

  // ------------------------------------------------------------ ruta
  async function fijarDestino(lat, lon) {
    if (!mapa) return;
    if (destino) mapa.removeLayer(destino);
    destino = L.marker([lat, lon], { icon: iconoDestino() }).addTo(mapa);
    mapa.fitBounds(L.latLngBounds([lat, lon], ultimaPos ? [ultimaPos.lat, ultimaPos.lon] : [lat + .01, lon + .01]), { padding: [50, 50] });

    const desde = ultimaPos || { lat: mapa.getCenter().lat, lon: mapa.getCenter().lng };
    elPanel.hidden = false;
    elPanel.innerHTML = '<div class="ruta-calc"><i></i><span>Calculando la mejor ruta…</span></div>';

    try {
      const r = await fetch(`/api/ruta/route?from=${desde.lat},${desde.lon}&to=${lat},${lon}`);
      const datos = await r.json();
      if (!r.ok || !datos.route) throw new Error(datos.error || 'Sin ruta');
      ruta = datos.route;
      paso = 0;
      pintarRuta();
      pintarPanel();
      cargarRadares();
    } catch (err) {
      elPanel.innerHTML = `<p class="ruta-error">${err.message || 'No se pudo calcular la ruta.'}</p>`;
    }
  }

  function pintarRuta() {
    if (!ruta || !mapa) return;
    if (capaRuta) mapa.removeLayer(capaRuta);
    if (capaRutaGlow) mapa.removeLayer(capaRutaGlow);
    const puntos = ruta.geometry;
    capaRutaGlow = L.polyline(puntos, { color: '#38e1ff', weight: 16, opacity: .16, lineCap: 'round' }).addTo(mapa);
    capaRuta = L.polyline(puntos, { color: '#5ce6ff', weight: 5, opacity: .95, lineCap: 'round' }).addTo(mapa);
    mapa.fitBounds(capaRuta.getBounds(), { padding: [40, 40] });
  }

  function pintarPanel() {
    if (!ruta || !elPanel) return;
    const s = ruta.steps[paso] || ruta.steps[0];
    elPanel.innerHTML = `
      <div class="ruta-resumen">
        <div><b>${metros(ruta.distance)}</b><span>${minutos(ruta.duration)}</span></div>
        <div class="ruta-sig"><small>SIGUIENTE</small><strong>${instruccion(s)}</strong></div>
      </div>
      <div class="ruta-pasos-preview">
        ${ruta.steps.slice(1, 4).map(p => `<span>${instruccion(p)} · ${metros(p.distance)}</span>`).join('')}
      </div>
      <button type="button" class="ruta-empezar" id="rutaEmpezar">${navegando ? 'Detener navegación' : 'Iniciar navegación'}</button>`;
    elPanel.querySelector('#rutaEmpezar')?.addEventListener('click', alternarNavegacion);
  }

  function alternarNavegacion() {
    navegando = !navegando;
    if (navegando) {
      siguiendo = true;
      paso = 0;
      avisar('Navegación iniciada. Te aviso de los radares del camino.', 'ok', 5000);
      if (ultimaPos) mapa.setView([ultimaPos.lat, ultimaPos.lon], 17);
      decir('Navegación iniciada');
    } else {
      decir('Navegación detenida');
      avisar('Navegación detenida.', 'info', 3000);
    }
    pintarPanel();
  }

  function restante(lat, lon) {
    if (!ruta) return 0;
    let total = 0;
    for (let i = paso; i < ruta.steps.length; i += 1) total += ruta.steps[i].distance || 0;
    const s = ruta.steps[paso];
    if (s && Number.isFinite(s.lat)) total += distancia(lat, lon, s.lat, s.lon);
    return total;
  }

  function seguirRuta(lat, lon) {
    const s = ruta?.steps[paso];
    if (!s) return;
    const d = Number.isFinite(s.lat) ? distancia(lat, lon, s.lat, s.lon) : 0;
    if (d < 40 && paso < ruta.steps.length - 1) {
      paso += 1;
      const siguiente = ruta.steps[paso];
      decir(instruccion(siguiente));
      if (siguiente.type === 'arrive') avisar('Has llegado a tu destino.', 'ok', 9000);
      pintarPanel();
    }
    const quedan = restante(lat, lon);
    const resumen = elPanel.querySelector('.ruta-resumen div b');
    if (resumen) resumen.textContent = metros(quedan);
  }

  // ------------------------------------------------------------ radares
  async function cargarRadares() {
    if (!ruta || !mapa || !capaRadares) return;
    const puntos = ruta.geometry;
    const lat = puntos.reduce((a, p) => a + p[0], 0) / puntos.length;
    const lon = puntos.reduce((a, p) => a + p[1], 0) / puntos.length;
    try {
      const r = await fetch(`/api/ruta/radares?lat=${lat}&lon=${lon}&radio=9000`);
      const datos = await r.json();
      const lista = Array.isArray(datos.radares) ? datos.radares : [];
      capaRadares.clearLayers();
      lista.forEach(rad => {
        L.marker([rad.lat, rad.lon], { icon: iconoRadar(rad), title: rad.maxspeed ? `Radar ${rad.maxspeed}` : 'Radar' })
          .bindPopup(`${rad.kind === 'radar' ? 'Radar de velocidad' : 'Cámara'}${rad.maxspeed ? ` · ${rad.maxspeed}` : ''}`)
          .addTo(capaRadares);
      });
      if (lista.length && elInfo) elInfo.textContent = `${lista.length} radares conocidos en la zona`;
    } catch (_e) { /* sin radares se navega igual */ }
  }

  function vigilarRadares(lat, lon) {
    if (!capaRadares) return;
    capaRadares.eachLayer(capa => {
      const p = capa.getLatLng();
      const d = distancia(lat, lon, p.lat, p.lng);
      const id = `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
      if (d < 650 && !avisados.has(id)) {
        avisados.add(id);
        capa.setZIndexOffset(800);
        avisar(`Radar a ${metros(d)}${/^\d+$/.test(String(capa.options.title || '').replace(/\D/g, '')) ? '' : ''}`, 'radar', 8000);
        pitido();
        try { navigator.vibrate?.([60, 40, 60]); } catch (_e) {}
        decir(`Atención, radar a ${metros(Math.round(d / 50) * 50)}`);
      }
    });
  }

  // ------------------------------------------------------------ arranque
  function iniciarVista() {
    cuandoLeaflet(() => {
      initMapa();
      mapa?.invalidateSize();
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        () => { if (!navegando) arrancarGps(); },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  elGps?.addEventListener('click', () => {
    siguiendo = true;
    if (ultimaPos) mapa?.setView([ultimaPos.lat, ultimaPos.lon], 16);
    else avisar('Esperando al GPS…', 'info', 4000);
  });

  document.addEventListener('viewchange', e => {
    if (e.detail?.name !== 'ruta') return;
    iniciarVista();
    setTimeout(() => mapa?.invalidateSize(), 200);
  });

  document.addEventListener('click', ev => {
    if (ev.target.closest('[data-home-ruta]')) {
      window.showView?.('ruta') || document.querySelector('[data-view="ruta"]')?.click();
    }
  });

  if (document.querySelector('.view.active')?.id === 'view-ruta') iniciarVista();

  window.Ruta = {
    ir: (lat, lon) => { window.showView?.('ruta'); setTimeout(() => fijarDestino(lat, lon), 700); }
  };
})();
