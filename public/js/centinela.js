(function () {
  'use strict';

  const view = document.getElementById('view-centinela');
  if (!view) return;
  const $ = s => view.querySelector(s);

  const el = {
    shell: $('#centShell'),
    video: $('#centVideo'),
    cover: $('#centCover'),
    coverTitle: $('#centCoverTitle'),
    coverText: $('#centCoverText'),
    pill: $('#centEstadoPill'),
    pillTexto: $('#centEstadoTexto'),
    live: $('#centLive'),
    rec: $('#centRec'),
    recTime: $('#centRecTime'),
    alerta: $('#centAlerta'),
    alertaTitulo: $('#centAlertaTitulo'),
    alertaTexto: $('#centAlertaTexto'),
    full: $('#centFull'),
    armar: $('#centArmar'),
    armarTexto: $('#centArmarTexto'),
    armarSub: $('#centArmarSub'),
    status: $('#centStatus'),
    uso: $('#centUso'),
    mantener: $('#centMantener'),
    avisos: $('#centAvisos'),
    sensibilidad: $('#centSensibilidad'),
    duracion: $('#centDuracion'),
    audio: $('#centAudio'),
    notificar: $('#centNotificar'),
    mostrarMenu: $('#centMostrarMenu'),
    borrarTodo: $('#centBorrarTodo'),
    gallery: $('#centGallery'),
    count: $('#centCount')
  };

  // Un único sitio para los límites. Se pueden acortar por query para QA.
  const LIMITES = {
    MAX_BYTES: 1024 * 1024 * 1024,
    MAX_DIAS: 5,
    PRE_ROLL: 5,
    POST_ROLL: 10,
    MAX_CLIP: 60,
    MERGE_WINDOW: 10 * 1000,
    COOLDOWN: 8 * 1000,
    // 3 fotogramas/s bastan para detectar una persona o un golpe y ahorran
    // CPU/batería frente a analizar 5 veces por segundo.
    MOTION_MS: 340,
    MOTION_CONFIRM: 2,
    COCO_MS: 1600,
    AUDIO_MS: 250,
    DEFAULT_DURATION: 15
  };
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('centMaxBytes')) LIMITES.MAX_BYTES = Math.max(64 * 1024, Number(q.get('centMaxBytes')) || LIMITES.MAX_BYTES);
    if (q.has('centMaxDias')) LIMITES.MAX_DIAS = Math.max(0, Number(q.get('centMaxDias')) || 0);
    if (q.has('centDur')) LIMITES.DEFAULT_DURATION = [15, 30, 60].includes(Number(q.get('centDur'))) ? Number(q.get('centDur')) : 15;
  } catch (_e) { /* sin query */ }

  const DB_NOMBRE = 'dm-centinela';
  const DB_VERSION = 1;
  const STORE = 'clips';
  const CLAVE_CFG = 'dm_centinela_cfg';
  const CLASES = new Set(['person', 'car', 'motorcycle', 'bicycle', 'truck', 'bus']);
  const ETIQUETAS = {
    person: 'Persona', car: 'Coche', motorcycle: 'Moto',
    bicycle: 'Bicicleta', truck: 'Camión', bus: 'Autobús'
  };
  const RANGO_SEVERIDAD = { baja: 1, media: 2, alta: 3 };

  let armado = false;
  // Dos armados a la vez pedirían dos cámaras; el token permite cancelar
  // mientras Android aún está mostrando el permiso.
  let armando = false;
  let armarToken = 0;
  let stream = null;
  let audioTrack = null;
  let audioCtx = null;
  let audioAnalyser = null;
  let audioBuf = null;
  let audioTimer = 0;
  let audioBase = 0.008;
  let ultimoSonido = 0;
  // El pitido y la vibración del propio centinela pueden colarse por el
  // micrófono y abrir otra grabación. Se ignora el audio unos segundos.
  let ignorarAudioHasta = 0;

  let motionCanvas = null;
  let motionCtx = null;
  let motionTimer = 0;
  let prevLuma = null;
  let motionLuma = null;
  let motionBloques = null;
  let motionRacha = 0;

  let modeloCoco = null;
  let cargandoCoco = null;
  let ultimoCoco = 0;

  let grabador = null;
  let grabando = false;
  let chunks = [];
  let clipInicio = 0;
  let clipFin = 0;
  let clipTimer = 0;
  let clipTic = 0;
  let clipRazones = new Set();
  let clipSeveridad = 'baja';
  let clipActualId = null;
  let resolverGrabacion = null;
  let deteniendoClip = null;
  let clipThumb = '';
  let mimeActual = '';

  let ultimoEvento = 0;
  let ultimaAcel = null;
  let ultimoImpacto = 0;
  let impactoAttached = false;
  let objectUrls = [];
  let clipsCache = new Map();
  let inicializado = false;

  function mmss(segundos) {
    const s = Math.max(0, Math.round(segundos));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  function bytes(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 MB';
    if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fechaCorta(ts) {
    try {
      return new Date(ts).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch (_e) { return new Date(ts).toLocaleString(); }
  }

  function aviso(texto, tono = 'info', ms = 5200) {
    if (!texto) return;
    el.status.textContent = texto;
    el.status.dataset.tono = tono;
    clearTimeout(aviso._t);
    aviso._t = setTimeout(() => {
      if (armado) el.status.textContent = 'Vigilando. La cámara está activa, sin escribir hasta que haya un evento.';
    }, ms);
  }

  function setEstado(estado, texto) {
    view.dataset.estado = estado;
    el.shell.dataset.estado = estado;
    el.pill.dataset.estado = estado;
    const textos = {
      desarmado: ['Centinela desarmado', 'Arma la vigilancia para activar la cámara.'],
      conectando: ['Activando cámara…', 'Acepta cámara y micrófono si Android te lo pide.'],
      vigilando: ['Vigilando', 'La cámara está activa; la previsualización permanece oculta.'],
      evento: ['Evento detectado', 'Grabando y mostrando la cámara.'],
      error: ['No se pudo armar', 'Revisa los permisos de cámara y micrófono.'],
      detenido: ['Centinela detenido', 'Se paró al pasar a segundo plano o al salir de la vista.']
    };
    const cfg = textos[estado] || textos.desarmado;
    if (el.coverTitle) el.coverTitle.textContent = cfg[0];
    if (el.coverText) el.coverText.textContent = texto || cfg[1];
    if (el.pillTexto) el.pillTexto.textContent = cfg[0];
    el.live.hidden = !(armado && estado === 'vigilando');
    el.rec.hidden = !(armado && grabando);
    el.armar.setAttribute('aria-pressed', String(armado));
    el.armarTexto.textContent = armado ? 'Desarmar centinela' : 'Activar modo Centinela';
    el.armarSub.textContent = armado ? 'Cámara y micrófono activos' : 'Cámara y micrófono locales';
  }

  function leerConfig() {
    let cfg = {};
    try { cfg = JSON.parse(localStorage.getItem(CLAVE_CFG) || '{}') || {}; } catch (_e) { cfg = {}; }
    const sens = ['baja', 'media', 'alta'].includes(cfg.sensibilidad) ? cfg.sensibilidad : 'media';
    const dur = [15, 30, 60].includes(Number(cfg.duracion)) ? Number(cfg.duracion) : LIMITES.DEFAULT_DURATION;
    el.sensibilidad.value = sens;
    el.duracion.value = String(dur);
    el.audio.checked = cfg.audio !== false;
    el.notificar.checked = Boolean(cfg.notificar);
    if (el.mostrarMenu) el.mostrarMenu.checked = cfg.menu !== false;
  }

  // Centinela es una sección independiente del GPS, pero quien no la use puede
  // quitarla de los menús sin perder los clips ni el acceso directo.
  function aplicarVisibilidadMenu() {
    const visible = el.mostrarMenu ? el.mostrarMenu.checked : true;
    document.querySelectorAll('[data-cent-menu]').forEach(n => { n.hidden = !visible; });
    document.querySelectorAll('#appMenuGrid [data-view="centinela"]').forEach(n => { n.hidden = !visible; });
  }

  function guardarConfig() {
    try {
      localStorage.setItem(CLAVE_CFG, JSON.stringify({
        sensibilidad: el.sensibilidad.value,
        duracion: Number(el.duracion.value),
        audio: el.audio.checked,
        notificar: el.notificar.checked,
        menu: el.mostrarMenu ? el.mostrarMenu.checked : true
      }));
    } catch (_e) { /* sin almacenamiento */ }
  }

  // ------------------------------------------------------------ IndexedDB
  function abrirDB() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB no disponible')); return; }
      const req = indexedDB.open(DB_NOMBRE, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('fecha', 'fecha', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('No se pudo abrir IndexedDB'));
    });
  }

  function pedir(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Error de IndexedDB'));
    });
  }

  async function listarClips() {
    try {
      const db = await abrirDB();
      const tx = db.transaction(STORE, 'readonly');
      const lista = await pedir(tx.objectStore(STORE).getAll());
      db.close();
      return (lista || []).sort((a, b) => b.fecha - a.fecha);
    } catch (_e) {
      return [];
    }
  }

  async function guardarClip(clip) {
    const db = await abrirDB();
    const tx = db.transaction(STORE, 'readwrite');
    await pedir(tx.objectStore(STORE).put(clip));
    db.close();
  }

  async function borrarClip(id) {
    const db = await abrirDB();
    const tx = db.transaction(STORE, 'readwrite');
    await pedir(tx.objectStore(STORE).delete(id));
    db.close();
  }

  async function borrarTodo(exceptoId = null) {
    const clips = await listarClips();
    for (const c of clips) {
      if (c.id !== exceptoId) await borrarClip(c.id);
    }
  }

  async function purgar() {
    const clips = await listarClips();
    const corte = Date.now() - LIMITES.MAX_DIAS * 24 * 60 * 60 * 1000;
    let total = clips.reduce((n, c) => n + (c.blob?.size || 0), 0);
    const orden = [...clips].sort((a, b) => a.fecha - b.fecha);
    let borrados = 0;
    for (const c of orden) {
      const viejo = c.fecha < corte;
      const excede = total > LIMITES.MAX_BYTES;
      if ((viejo || excede) && c.id !== clipActualId) {
        await borrarClip(c.id);
        total -= c.blob?.size || 0;
        borrados++;
      }
    }
    await actualizarUso();
    return borrados;
  }

  async function actualizarUso() {
    const clips = await listarClips();
    const total = clips.reduce((n, c) => n + (c.blob?.size || 0), 0);
    el.count.textContent = String(clips.length);
    let persistido = false;
    try { persistido = await navigator.storage?.persisted?.(); } catch (_e) { /* opcional */ }
    el.uso.textContent = `${clips.length} clip${clips.length === 1 ? '' : 's'} · ${bytes(total)} / ${bytes(LIMITES.MAX_BYTES)} · retención ${LIMITES.MAX_DIAS} días${persistido ? ' · almacenamiento persistente' : ''}`;
  }

  // ------------------------------------------------------------ galería
  function limpiarUrls() {
    for (const u of objectUrls) { try { URL.revokeObjectURL(u); } catch (_e) { /* nada */ } }
    objectUrls = [];
  }

  function crearBoton(texto, accion, clase = 'btn ghost sm') {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = clase;
    b.dataset.centAccion = accion;
    b.textContent = texto;
    return b;
  }

  async function renderGaleria() {
    const clips = await listarClips();
    clipsCache = new Map(clips.map(c => [c.id, c]));
    limpiarUrls();
    el.gallery.replaceChildren();
    if (!clips.length) {
      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Todavía no hay clips. Al detectar un evento se guardará aquí, solo en este dispositivo.';
      el.gallery.appendChild(p);
      el.count.textContent = '0';
      return;
    }
    for (const clip of clips) {
      const art = document.createElement('article');
      art.className = 'cent-clip';
      art.dataset.id = clip.id;

      const v = document.createElement('video');
      v.controls = true;
      v.playsInline = true;
      v.preload = 'metadata';
      v.muted = false;
      if (clip.thumb) v.poster = clip.thumb;
      const url = URL.createObjectURL(clip.blob);
      objectUrls.push(url);
      v.src = url;
      art.appendChild(v);

      const info = document.createElement('div');
      info.className = 'cent-clip-info';
      const h = document.createElement('b');
      h.textContent = clip.motivo || 'Evento';
      const meta = document.createElement('small');
      meta.textContent = `${fechaCorta(clip.fecha)} · ${mmss(clip.duracion)} · ${bytes(clip.blob?.size || 0)} · ${clip.severidad || 'baja'}`;
      const acts = document.createElement('div');
      acts.className = 'cent-clip-actions';

      const dl = document.createElement('a');
      dl.className = 'btn ghost sm';
      dl.dataset.centAccion = 'descargar';
      dl.dataset.id = clip.id;
      dl.href = url;
      dl.download = `centinela-${new Date(clip.fecha).toISOString().replace(/[:.]/g, '-')}.webm`;
      dl.textContent = 'Descargar';
      acts.appendChild(dl);

      if (navigator.share) {
        const sh = crearBoton('Compartir', 'compartir');
        sh.dataset.id = clip.id;
        acts.appendChild(sh);
      }
      const del = crearBoton('Borrar', 'borrar');
      del.dataset.id = clip.id;
      del.classList.add('danger');
      acts.appendChild(del);
      info.append(h, meta, acts);
      art.appendChild(info);
      el.gallery.appendChild(art);
    }
    el.count.textContent = String(clips.length);
  }

  async function compartirClip(id) {
    const clip = clipsCache.get(id);
    if (!clip || !navigator.share) { aviso('Este navegador no permite compartir archivos.', 'aviso'); return; }
    try {
      const file = new File([clip.blob], `centinela-${id}.webm`, { type: clip.mime || 'video/webm' });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) {
        aviso('El clip no se puede compartir desde este navegador.', 'aviso');
        return;
      }
      await navigator.share({ files: [file], title: 'Clip del centinela', text: clip.motivo || '' });
    } catch (e) {
      if (e?.name !== 'AbortError') aviso('No se pudo compartir el clip.', 'aviso');
    }
  }

  async function eliminarClip(id) {
    if (!window.confirm('¿Borrar este clip del dispositivo?')) return;
    await borrarClip(id);
    await renderGaleria();
    await actualizarUso();
  }

  // ------------------------------------------------------------ cámara
  async function pedirStream() {
    // 20 fps son suficientes para un clip de vigilancia y reducen el trabajo
    // del codificador y el consumo frente a 30 fps.
    const baseVideo = {
      facingMode: { ideal: 'environment' },
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 20, max: 24 }
    };
    const quiereAudio = el.audio.checked;
    try {
      return await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: quiereAudio });
    } catch (e) {
      if (!quiereAudio) throw e;
      // Si el micrófono falla, no se pierde la cámara: se avisa y se graba sin audio.
      const soloVideo = await navigator.mediaDevices.getUserMedia({ video: baseVideo, audio: false });
      aviso('No se pudo abrir el micrófono. El centinela grabará sin audio.', 'aviso', 7000);
      return soloVideo;
    }
  }

  async function armar() {
    // `stream`/`grabador` siguen vivos mientras desarmar() guarda el último
    // clip: no se puede armar otra cámara en esa ventana.
    if (armado || armando || stream || grabador) return;
    armando = true;
    const token = ++armarToken;
    if (!navigator.mediaDevices?.getUserMedia) {
      armando = false;
      setEstado('error', 'Este navegador no tiene acceso a cámara. Usa Chrome Android actualizado.');
      return;
    }
    setEstado('conectando');
    aviso('Solicitando cámara y micrófono…', 'info', 5000);
    try {
      stream = await pedirStream();
      if (token !== armarToken) {
        if (stream) {
          stream.getTracks().forEach(t => { try { t.stop(); } catch (_e) { /* nada */ } });
          stream = null;
        }
        return;
      }
      if (!stream.getVideoTracks().length) throw new Error('La cámara no devolvió vídeo');
      el.video.srcObject = stream;
      await el.video.play().catch(() => {});
      if (token !== armarToken) {
        if (stream) {
          stream.getTracks().forEach(t => { try { t.stop(); } catch (_e) { /* nada */ } });
          stream = null;
        }
        try { el.video.srcObject = null; } catch (_e) { /* nada */ }
        return;
      }
      // El permiso puede llegar con la app ya en segundo plano: no se arma a
      // ciegas una cámara que el usuario no ve. Se cancela y se limpia.
      if (document.hidden) {
        await desarmar({ porFondo: true });
        return;
      }
      armado = true;
      armando = false;
      audioTrack = stream.getAudioTracks()[0] || null;
      el.shell.classList.add('armado');
      el.shell.classList.remove('evento');
      setEstado('vigilando', 'La cámara está activa; la previsualización permanece oculta.');
      aviso('Centinela armado. No se escribe nada hasta que haya un evento.', 'ok', 5000);
      iniciarMovimiento();
      iniciarAudio();
      iniciarImpacto();
      // El detector de objetos se descarga solo cuando el movimiento confirma
      // que hay algo. Así no se gastan datos, CPU ni batería en una vigilancia
      // tranquila (garaje, aparcamiento de noche o cámara tapada).
      try { await navigator.storage?.persist?.(); } catch (_e) { /* opcional */ }
      window.CentinelaPantalla?.mantener?.('centinela');
      if (el.notificar.checked) pedirAvisos(true);
      const borrados = await purgar();
      if (borrados) await renderGaleria();
      await actualizarUso();
    } catch (e) {
      armando = false;
      if (token !== armarToken) return;
      if (stream) {
        try { stream.getTracks().forEach(t => t.stop()); } catch (_e) { /* nada */ }
        stream = null;
      }
      armado = false;
      audioTrack = null;
      try { el.video.srcObject = null; } catch (_e) { /* nada */ }
      const detalle = e?.name === 'NotAllowedError'
        ? 'Permiso denegado. Abre los ajustes del sitio en Chrome y permite cámara y micrófono.'
        : `No se pudo activar la cámara${e?.message ? ` (${e.message})` : ''}.`;
      setEstado('error', detalle);
      aviso(detalle, 'error', 9000);
      window.CentinelaPantalla?.soltar?.();
    }
  }

  async function desarmar(opciones = {}) {
    // Cancela también un armado que aún está pidiendo permisos.
    armando = false;
    armarToken++;
    // Se apaga antes de esperar al clip: si no, movimiento/audio siguen
    // activos durante la purga y pueden abrir una grabación nueva.
    armado = false;
    detenerMovimiento();
    detenerAudio();
    detenerImpacto();
    if (grabando) {
      const parada = detenerGrabacion();
      // Con la pantalla bloqueada Android congela el encoder: esperar aquí
      // dejaría la cámara encendida en segundo plano. El clip se cierra solo
      // cuando el navegador vuelve a darle CPU.
      if (!opciones.porFondo) await parada;
    }
    if (stream) {
      try { stream.getTracks().forEach(t => t.stop()); } catch (_e) { /* nada */ }
      stream = null;
    }
    audioTrack = null;
    try { el.video.pause(); } catch (_e) { /* nada */ }
    try { el.video.srcObject = null; } catch (_e) { /* nada */ }
    el.shell.classList.remove('armado', 'evento');
    el.alerta.hidden = true;
    el.rec.hidden = true;
    window.CentinelaPantalla?.soltar?.();
    const texto = opciones.porFondo
      ? 'La cámara se detuvo al pasar a segundo plano. Vuelve a armar cuando estés delante.'
      : opciones.porSalida
        ? 'Se detuvo al salir de la vista. Vuelve a armar para vigilar.'
        : 'Desarmado. No se está grabando ni escribiendo.';
    setEstado(opciones.porFondo || opciones.porSalida ? 'detenido' : 'desarmado', texto);
    aviso(texto, 'info', 6500);
  }

  // ------------------------------------------------------------ movimiento
  // Lienzo pequeño y buffers reutilizados: el análisis de movimiento pasa de
  // ~58.000 píxeles por frame a ~20.000 y deja de crear arrays en cada vuelta.
  const MOTION_W = 192;
  const MOTION_H = 108;
  const MOTION_BX = 16;
  const MOTION_BY = 18;
  const MOTION_COLS = MOTION_W / MOTION_BX;
  const MOTION_ROWS = MOTION_H / MOTION_BY;

  function iniciarMovimiento() {
    if (motionTimer) return;
    motionCanvas = document.createElement('canvas');
    motionCanvas.width = MOTION_W;
    motionCanvas.height = MOTION_H;
    motionCtx = motionCanvas.getContext('2d', { willReadFrequently: true });
    motionLuma = new Uint8Array(MOTION_W * MOTION_H);
    motionBloques = new Float32Array(MOTION_COLS * MOTION_ROWS);
    prevLuma = null;
    motionRacha = 0;
    motionTimer = setInterval(analizarMovimiento, LIMITES.MOTION_MS);
  }

  function detenerMovimiento() {
    clearInterval(motionTimer);
    motionTimer = 0;
    prevLuma = null;
    motionLuma = null;
    motionBloques = null;
    motionRacha = 0;
    motionCtx = null;
    motionCanvas = null;
  }

  function analizarMovimiento() {
    if (!armado || !motionCtx || !el.video.videoWidth) return;
    try {
      motionCtx.drawImage(el.video, 0, 0, MOTION_W, MOTION_H);
      const data = motionCtx.getImageData(0, 0, MOTION_W, MOTION_H).data;
      const luma = motionLuma;
      for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        luma[p] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
      }
      if (!prevLuma) { prevLuma = luma.slice(); return; }
      const bloques = motionBloques;
      bloques.fill(0);
      let total = 0;
      for (let y = 0; y < MOTION_H; y++) {
        const by = (y / MOTION_BY) | 0;
        for (let x = 0; x < MOTION_W; x++) {
          const p = y * MOTION_W + x;
          const d = Math.abs(luma[p] - prevLuma[p]);
          total += d;
          bloques[by * MOTION_COLS + ((x / MOTION_BX) | 0)] += d;
        }
      }
      prevLuma.set(luma);
      const mediaGlobal = total / (MOTION_W * MOTION_H);
      const umbral = { baja: 26, media: 17, alta: 10 }[el.sensibilidad.value] || 17;
      let cambios = 0;
      for (let b = 0; b < bloques.length; b++) {
        const mediaBloque = bloques[b] / (MOTION_BX * MOTION_BY);
        // Se resta la variación global de luz: un cambio de exposición no debe
        // disparar el centinela; una silueta que entra en la escena, sí.
        if (mediaBloque - mediaGlobal > umbral) cambios++;
      }
      // Dos frames seguidos evitan que un coche que pasa lejos, una mosca o
      // una racha de ruido abran una grabación de 15 segundos.
      if (cambios >= 2) {
        motionRacha += 1;
        if (motionRacha >= LIMITES.MOTION_CONFIRM) {
          dispararEvento('Movimiento', cambios >= 8 ? 'media' : 'baja');
          if (!modeloCoco && !cargandoCoco) cargarCoco();
          else if (modeloCoco) analizarCoco();
        }
      } else {
        motionRacha = 0;
      }
    } catch (_e) { /* frame no disponible */ }
  }

  // ------------------------------------------------------------ COCO-SSD
  function cargarScript(src, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const ya = [...document.scripts].find(s => s.src === src);
      if (ya && ya.dataset.cargado === '1') { resolve(); return; }
      let s = ya;
      if (!s) {
        s = document.createElement('script');
        s.src = src;
        s.async = true;
        document.head.appendChild(s);
      }
      const reloj = setTimeout(() => reject(new Error('tiempo agotado')), timeout);
      s.addEventListener('load', () => { clearTimeout(reloj); s.dataset.cargado = '1'; resolve(); }, { once: true });
      s.addEventListener('error', () => { clearTimeout(reloj); reject(new Error('no se pudo cargar')); }, { once: true });
    });
  }

  async function cargarCoco() {
    if (modeloCoco) return modeloCoco;
    if (cargandoCoco) return cargandoCoco;
    cargandoCoco = (async () => {
      try {
        if (typeof window.cocoSsd === 'undefined') {
          if (typeof window.tf === 'undefined') {
            await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js');
          }
          await cargarScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js');
        }
        if (typeof window.cocoSsd === 'undefined') throw new Error('COCO-SSD no disponible');
        modeloCoco = await window.cocoSsd.load();
        aviso('Detección de personas y vehículos activada.', 'ok', 3500);
      } catch (_e) {
        aviso('Sin detección de objetos: el movimiento y el sonido siguen activos.', 'info', 7000);
        modeloCoco = null;
      } finally {
        cargandoCoco = null;
      }
    })();
    return cargandoCoco;
  }

  function analizarCoco() {
    if (!modeloCoco || !armado || !el.video.videoWidth) return;
    const ahora = Date.now();
    if (ahora - ultimoCoco < LIMITES.COCO_MS) return;
    ultimoCoco = ahora;
    modeloCoco.detect(el.video).then(preds => {
      if (!armado) return;
      for (const p of preds || []) {
        if (!CLASES.has(p.class) || Number(p.score) < 0.52) continue;
        const b = p.bbox || [];
        const areaRel = (b[2] * b[3]) / ((el.video.videoWidth || 1) * (el.video.videoHeight || 1));
        const sev = areaRel > 0.12 ? 'alta' : areaRel > 0.05 ? 'media' : 'baja';
        dispararEvento(`${ETIQUETAS[p.class] || p.class} cerca`, sev);
        break;
      }
    }).catch(() => {});
  }

  // ------------------------------------------------------------ audio e impacto
  function iniciarAudio() {
    if (!audioTrack || audioTimer) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      audioCtx.resume?.().catch(() => {});
      const source = audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 512;
      source.connect(audioAnalyser);
      audioBuf = new Float32Array(audioAnalyser.fftSize);
      audioTimer = setInterval(analizarAudio, LIMITES.AUDIO_MS);
    } catch (_e) {
      audioCtx = null;
      audioAnalyser = null;
    }
  }

  function analizarAudio() {
    if (!armado || !audioAnalyser || !audioBuf) return;
    if (Date.now() < ignorarAudioHasta) return;
    try {
      audioAnalyser.getFloatTimeDomainData(audioBuf);
      let suma = 0;
      for (let i = 0; i < audioBuf.length; i++) suma += audioBuf[i] * audioBuf[i];
      const rms = Math.sqrt(suma / audioBuf.length);
      audioBase = audioBase * 0.98 + rms * 0.02;
      const ahora = Date.now();
      const umbral = Math.max(0.055, audioBase * 2.4);
      if (rms > umbral && rms > 0.09 && ahora - ultimoSonido > 6000) {
        ultimoSonido = ahora;
        dispararEvento('Sonido fuerte', rms > 0.22 ? 'alta' : 'media');
      }
    } catch (_e) { /* analizador cerrado */ }
  }

  function detenerAudio() {
    clearInterval(audioTimer);
    audioTimer = 0;
    try { audioCtx?.close?.(); } catch (_e) { /* nada */ }
    audioCtx = null;
    audioAnalyser = null;
    audioBuf = null;
    audioBase = 0.008;
    ignorarAudioHasta = 0;
  }

  function iniciarImpacto() {
    if (!('DeviceMotionEvent' in window)) return;
    const attach = () => {
      if (impactoAttached) return;
      impactoAttached = true;
      window.addEventListener('devicemotion', alMoverDispositivo, { passive: true });
    };
    const pedir = window.DeviceMotionEvent?.requestPermission;
    if (typeof pedir === 'function') {
      pedir().then(r => { if (r === 'granted') attach(); }).catch(() => {});
    } else {
      attach();
    }
  }

  function detenerImpacto() {
    if (!impactoAttached) return;
    impactoAttached = false;
    window.removeEventListener('devicemotion', alMoverDispositivo);
    ultimaAcel = null;
  }

  function alMoverDispositivo(e) {
    if (!armado) return;
    const a = e.accelerationIncludingGravity;
    if (!a) return;
    const mag = Math.hypot(Number(a.x) || 0, Number(a.y) || 0, Number(a.z) || 0);
    const ahora = Date.now();
    if (ultimaAcel != null && Math.abs(mag - ultimaAcel) > 18 && ahora - ultimoImpacto > 4000) {
      ultimoImpacto = ahora;
      dispararEvento('Impacto o sacudida', 'alta');
    }
    ultimaAcel = mag;
  }

  // ------------------------------------------------------------ eventos
  function subirSeveridad(sev) {
    return (RANGO_SEVERIDAD[sev] || 0) > (RANGO_SEVERIDAD[clipSeveridad] || 0) ? sev : clipSeveridad;
  }

  function dispararEvento(motivo, severidad = 'baja') {
    if (!armado) return;
    const sev = RANGO_SEVERIDAD[severidad] ? severidad : 'baja';
    const ahora = Date.now();
    if (grabando) {
      clipRazones.add(motivo);
      clipSeveridad = subirSeveridad(sev);
      const max = clipInicio + LIMITES.MAX_CLIP * 1000;
      const margen = sev === 'alta' ? 20 : LIMITES.POST_ROLL;
      clipFin = Math.min(max, Math.max(clipFin, ahora + margen * 1000));
      programarFin();
      actualizarAlerta();
      return;
    }
    if (ahora - ultimoEvento < LIMITES.COOLDOWN) return;
    ultimoEvento = ahora;
    iniciarGrabacion(motivo, sev);
  }

  function actualizarAlerta() {
    if (!el.alerta) return;
    el.alerta.hidden = false;
    el.alertaTitulo.textContent = clipSeveridad === 'alta' ? '⚠ Peligro detectado' : 'Evento detectado';
    el.alertaTexto.textContent = `${[...clipRazones].join(' · ') || 'Evento'} · grabando`;
  }

  function mimePreferido(conAudio) {
    const lista = conAudio
      ? ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    for (const m of lista) {
      try { if (window.MediaRecorder?.isTypeSupported?.(m)) return m; } catch (_e) { /* siguiente */ }
    }
    return '';
  }

  function iniciarGrabacion(motivo, severidad) {
    clipThumb = '';
    if (!stream || typeof window.MediaRecorder === 'undefined') {
      aviso('Este navegador no permite grabar vídeo. El evento se muestra, pero no se guarda.', 'error', 8000);
      return;
    }
    const conAudio = Boolean(audioTrack);
    mimeActual = mimePreferido(conAudio);
    const opciones = { videoBitsPerSecond: 1200000 };
    if (conAudio) opciones.audioBitsPerSecond = 64000;
    if (mimeActual) opciones.mimeType = mimeActual;
    try {
      grabador = new MediaRecorder(stream, opciones);
    } catch (e) {
      aviso(`No se pudo iniciar la grabación${e?.message ? `: ${e.message}` : ''}.`, 'error', 7000);
      return;
    }
    chunks = [];
    clipRazones = new Set([motivo]);
    clipSeveridad = severidad;
    clipInicio = Date.now();
    // La alarma del evento no debe convertirse en un segundo evento.
    ignorarAudioHasta = clipInicio + 4500;
    const base = Math.max(5, Number(el.duracion.value) || LIMITES.DEFAULT_DURATION);
    const duracion = severidad === 'alta' ? Math.min(LIMITES.MAX_CLIP, Math.max(base, 30)) : base;
    clipFin = clipInicio + duracion * 1000;
    grabando = true;
    grabador.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
    grabador.onstop = finalizarClip;
    try {
      grabador.start(1000);
    } catch (e) {
      grabando = false;
      grabador = null;
      aviso('No se pudo iniciar la grabación del clip.', 'error', 7000);
      return;
    }
    el.shell.classList.add('evento');
    setEstado('evento', 'Mostrando la cámara y grabando el evento.');
    el.alerta.hidden = false;
    actualizarAlerta();
    el.rec.hidden = false;
    programarFin();
    clearInterval(clipTic);
    clipTic = setInterval(actualizarRec, 500);
    actualizarRec();
    try { navigator.vibrate?.([220, 90, 260]); } catch (_e) { /* sin vibración */ }
    pitido();
    notificar(motivo, severidad);
  }

  function actualizarRec() {
    if (!grabando) return;
    const transcurrido = (Date.now() - clipInicio) / 1000;
    const total = Math.max(1, (clipFin - clipInicio) / 1000);
    el.recTime.textContent = `${mmss(transcurrido)} / ${mmss(total)}`;
  }

  function programarFin() {
    clearTimeout(clipTimer);
    const espera = Math.max(0, clipFin - Date.now());
    clipTimer = setTimeout(() => {
      if (grabando) detenerGrabacion();
    }, espera);
    actualizarRec();
  }

  function detenerGrabacion() {
    // Varias rutas pueden pedir la parada casi a la vez (clic, pantalla
    // bloqueada, pagehide). Debe haber una sola parada y un solo guardado.
    if (deteniendoClip) return deteniendoClip;
    if (!grabador) return Promise.resolve();
    // La miniatura se toma con la cámara aún viva; al pasar a segundo plano
    // los tracks se apagan de inmediato y ya no habría fotograma.
    clipThumb = capturarMiniatura();
    deteniendoClip = new Promise(resolve => {
      resolverGrabacion = resolve;
      clearTimeout(clipTimer);
      clearInterval(clipTic);
      const rec = grabador;
      if (rec.state === 'inactive') {
        finalizarClip();
        return;
      }
      try { rec.stop(); } catch (_e) { finalizarClip(); }
    });
    return deteniendoClip;
  }

  async function finalizarClip() {
    // Un `stop` tardío no puede volver a cerrar un clip ya guardado.
    if (!grabador && !grabando) return;
    const rec = grabador;
    grabador = null;
    grabando = false;
    clearTimeout(clipTimer);
    clearInterval(clipTic);
    el.rec.hidden = true;
    el.alerta.hidden = true;
    el.shell.classList.remove('evento');
    const tipo = rec?.mimeType || mimeActual || 'video/webm';
    const blob = new Blob(chunks, { type: tipo });
    chunks = [];
    const duracion = Math.max(1, Math.round((Date.now() - clipInicio) / 1000));
    if (blob.size) {
      const id = (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const clip = {
        id,
        fecha: clipInicio,
        duracion,
        motivo: [...clipRazones].join(' · ') || 'Evento',
        severidad: clipSeveridad,
        mime: tipo,
        blob,
        thumb: clipThumb || capturarMiniatura()
      };
      clipThumb = '';
      clipActualId = id;
      try {
        await guardarClip(clip);
        aviso(`Clip guardado (${mmss(duracion)}).`, 'ok', 4500);
      } catch (_e) {
        aviso('El clip se grabó, pero no se pudo guardar en el dispositivo.', 'error', 8000);
      }
      // Se protege el clip recién grabado: si el tope está lleno, la purga
      // debe borrar los antiguos, no el que acaba de guardarse.
      await purgar();
      clipActualId = null;
      await renderGaleria();
      await actualizarUso();
    } else {
      aviso('El evento no produjo un clip válido.', 'aviso', 5000);
    }
    // Si ya empezó otro evento mientras se guardaba el anterior, su estado
    // manda: no se puede volver a «vigilando» con la grabación en marcha.
    if (armado && !grabando) setEstado('vigilando', 'La cámara sigue activa; la previsualización vuelve a ocultarse.');
    deteniendoClip = null;
    if (resolverGrabacion) { resolverGrabacion(); resolverGrabacion = null; }
  }

  function capturarMiniatura() {
    try {
      if (!el.video.videoWidth) return '';
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      c.getContext('2d').drawImage(el.video, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.68);
    } catch (_e) { return ''; }
  }

  function pitido() {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      // Si el analizador de audio ya tiene un contexto, se reutiliza. Crear uno
      // nuevo en cada evento despierta el hardware de audio y gasta batería.
      const reutilizar = audioCtx && audioCtx.state !== 'closed';
      const ctx = reutilizar ? audioCtx : new Ctx();
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      gan.gain.setValueAtTime(0.0001, ctx.currentTime);
      gan.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gan.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.connect(gan).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      if (!reutilizar) setTimeout(() => ctx.close?.(), 800);
    } catch (_e) { /* sin audio */ }
  }

  // ------------------------------------------------------------ avisos locales
  async function pedirAvisos(silencioso = false) {
    if (!('Notification' in window)) {
      if (!silencioso) aviso('Este navegador no soporta avisos locales.', 'aviso');
      el.notificar.checked = false;
      return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
      el.notificar.checked = false;
      if (!silencioso) aviso('Los avisos están bloqueados en los ajustes del sitio.', 'aviso');
      return false;
    }
    try {
      const permiso = await Notification.requestPermission();
      el.notificar.checked = permiso === 'granted';
      guardarConfig();
      if (!silencioso) aviso(permiso === 'granted' ? 'Avisos locales activados.' : 'Avisos no concedidos.', permiso === 'granted' ? 'ok' : 'aviso');
      return permiso === 'granted';
    } catch (_e) {
      el.notificar.checked = false;
      if (!silencioso) aviso('No se pudieron activar los avisos.', 'aviso');
      return false;
    }
  }

  function notificar(motivo, severidad) {
    if (!el.notificar.checked || !('Notification' in window) || Notification.permission !== 'granted') return;
    const titulo = severidad === 'alta' ? 'Centinela: peligro detectado' : 'Centinela: evento detectado';
    const cuerpo = `${motivo}. Clip local en la galería.`;
    const opciones = {
      body: cuerpo,
      tag: 'centinela-evento',
      icon: '/img/app/icon-192.png',
      badge: '/img/app/icon-192.png',
      silent: false
    };
    let mostrado = false;
    const directa = () => {
      if (mostrado) return;
      mostrado = true;
      try { new Notification(titulo, opciones); } catch (_e) { /* sin permiso */ }
    };
    try {
      if (!navigator.serviceWorker?.ready) { directa(); return; }
      // Sin service worker activo `ready` no resuelve nunca y el aviso se
      // perdía en silencio: a los 1,5 s se muestra directamente.
      const reloj = setTimeout(directa, 1500);
      navigator.serviceWorker.ready
        .then(reg => {
          if (mostrado) return;
          if (typeof reg.showNotification !== 'function') { directa(); return; }
          mostrado = true;
          clearTimeout(reloj);
          return reg.showNotification(titulo, opciones)
            .catch(() => { mostrado = false; directa(); });
        })
        .catch(directa);
    } catch (_e) { /* sin permiso */ }
  }

  // ------------------------------------------------------------ eventos de UI
  function configurarEventos() {
    el.armar.addEventListener('click', () => { if (armado || armando) desarmar(); else armar(); });
    el.sensibilidad.addEventListener('change', guardarConfig);
    el.duracion.addEventListener('change', guardarConfig);
    el.audio.addEventListener('change', () => {
      guardarConfig();
      if (armado) aviso('Desarma y vuelve a armar para aplicar el cambio de audio.', 'aviso', 6000);
    });
    el.notificar.addEventListener('change', () => {
      guardarConfig();
      if (el.notificar.checked) pedirAvisos();
    });
    el.mostrarMenu?.addEventListener('change', () => {
      guardarConfig();
      aplicarVisibilidadMenu();
      if (!el.mostrarMenu.checked) aviso('Centinela oculto de los menús. Puedes volver con ?centinela=1.', 'info', 7000);
    });
    el.mantener.addEventListener('click', () => {
      if (window.CentinelaPantalla?.mantener) {
        window.CentinelaPantalla.mantener('centinela');
        aviso('Pantalla encendida solicitada. Si Android la apaga, el centinela se detiene.', 'info', 5500);
      } else {
        aviso('Este navegador no permite mantener la pantalla encendida.', 'aviso', 6000);
      }
    });
    el.avisos.addEventListener('click', () => pedirAvisos());
    el.borrarTodo.addEventListener('click', async () => {
      if (grabando) { aviso('Espera a que termine el clip antes de borrar la galería.', 'aviso', 5000); return; }
      if (!window.confirm('¿Borrar todos los clips guardados en este dispositivo?')) return;
      await borrarTodo(clipActualId);
      await renderGaleria();
      await actualizarUso();
      aviso('Galería local vacía.', 'ok', 4500);
    });
    el.full.addEventListener('click', async () => {
      try {
        if (!document.fullscreenElement) await el.shell.requestFullscreen?.({ navigationUI: 'hide' });
        else await document.exitFullscreen?.();
      } catch (_e) { aviso('Este navegador no permite pantalla completa.', 'aviso', 4500); }
    });
    document.addEventListener('fullscreenchange', () => {
      el.full.textContent = document.fullscreenElement ? '⤢' : '⛶';
      el.full.setAttribute('aria-label', document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa');
    });
    el.gallery.addEventListener('click', e => {
      const b = e.target.closest('[data-cent-accion]');
      if (!b) return;
      const id = b.dataset.id;
      if (b.dataset.centAccion === 'compartir') compartirClip(id);
      else if (b.dataset.centAccion === 'borrar') eliminarClip(id);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (armado || armando)) desarmar({ porFondo: true });
    });
    window.addEventListener('pagehide', () => {
      if (armado || armando) desarmar({ porFondo: true });
    });
    document.addEventListener('viewchange', e => {
      if (e.detail?.name !== 'centinela' && (armado || armando)) desarmar({ porSalida: true });
    });
  }

  async function init() {
    if (inicializado) return;
    inicializado = true;
    leerConfig();
    aplicarVisibilidadMenu();
    if (!('Notification' in window)) {
      el.avisos.disabled = true;
      el.notificar.disabled = true;
      el.notificar.checked = false;
    }
    configurarEventos();
    // Purgar antes de pintar: si no, la galería enseña clips que se borran
    // justo después y quedan como vídeos muertos hasta recargar.
    await purgar();
    await renderGaleria();
    await actualizarUso();
    setEstado('desarmado');
    try { await navigator.storage?.persist?.(); } catch (_e) { /* opcional */ }
    const q = new URLSearchParams(location.search);
    if (q.get('centinela') === '1') {
      const abrir = () => {
        if (typeof window.showView === 'function') window.showView('centinela');
        else document.querySelector('[data-view="centinela"]')?.click();
      };
      setTimeout(abrir, 0);
    }
    // Hook de QA: no se expone en la UI normal, solo con ?centinelaQa=1.
    if (q.get('centinelaQa') === '1') {
      window.CentinelaQA = {
        LIMITES,
        dispararEvento,
        guardarClip,
        purgar,
        listar: listarClips,
        borrarTodo,
        renderGaleria,
        actualizarUso,
        estado: () => ({
          armado, grabando, clipInicio, clipFin, clipSeveridad, razones: [...clipRazones],
          modelo: Boolean(modeloCoco),
          motionRacha,
          tracks: stream ? stream.getTracks().filter(t => t.readyState === 'live').length : 0,
          menu: el.mostrarMenu ? el.mostrarMenu.checked : true
        })
      };
    }
  }

  window.Centinela = {
    LIMITES,
    armar,
    desarmar,
    purgar,
    listar: listarClips,
    borrarTodo,
    renderGaleria,
    actualizarUso,
    estado: () => ({
      armado, grabando, clipInicio, clipFin, clipSeveridad,
      razones: [...clipRazones], modelo: Boolean(modeloCoco),
      motionRacha,
      tracks: stream ? stream.getTracks().filter(t => t.readyState === 'live').length : 0
    })
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
