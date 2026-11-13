/**
 * Botón único de voz, estilo WhatsApp.
 *
 *   · Mantienes pulsado → graba (se ve el tiempo y un aviso flotante).
 *   · Sueltas → deja de grabar, transcribe y envía la consulta sola.
 *   · Un toque rápido → se queda grabando; otro toque → envía.
 *
 * El audio se manda a /api/transcribe y el texto rellena el chat. No se guarda
 * nada en el móvil. Si el navegador no puede grabar (DuckDuckGo Android, por
 * ejemplo) se avisa con un panel que ofrece abrir la página en Chrome.
 */
(function () {
  'use strict';

  const soportado = Boolean(
    navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === 'function'
    && typeof window.MediaRecorder === 'function'
  );

  const $ = id => document.getElementById(id);

  // --------------------------------------------------------------- estilos
  function injectStyles() {
    if (document.getElementById('pushTalkStyles')) return;
    const style = document.createElement('style');
    style.id = 'pushTalkStyles';
    style.textContent = `
      .push-talk-wrap { display: flex; flex-direction: column; align-items: center; margin: 14px 0 2px; }
      /* Botón redondo que palpita, como el de una llamada. */
      .push-talk {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        width: 96px; height: 96px; padding: 8px; border-radius: 50%;
        border: 2px solid rgba(245, 165, 36, .75);
        background: radial-gradient(circle at 50% 35%, rgba(245, 165, 36, .30), rgba(245, 165, 36, .10));
        color: #ffd58a; font: inherit; font-size: 13px; font-weight: 700; letter-spacing: .2px;
        cursor: pointer; user-select: none; -webkit-user-select: none;
        touch-action: none; -webkit-tap-highlight-color: transparent;
        transition: transform .1s ease, background .2s ease, border-color .2s ease, color .2s ease;
        animation: pushTalkPulse 2.4s ease-in-out infinite;
      }
      .push-talk:active { transform: scale(.96); }
      .push-talk.grabando {
        background: radial-gradient(circle at 50% 35%, #e74c3c, #a92a1c);
        border-color: #ff6b5a; color: #fff;
        animation: pushTalkPulseFast .8s ease-in-out infinite;
      }
      .push-talk svg { width: 30px; height: 30px; }
      .push-talk-time { font-variant-numeric: tabular-nums; font-weight: 700; font-size: 11px; }
      .push-talk-help { margin: 8px 2px 0; font-size: 12px; line-height: 1.4; color: #94a3b8; text-align: center; }
      @keyframes pushTalkPulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(245, 165, 36, .45); }
        55% { box-shadow: 0 0 0 14px rgba(245, 165, 36, 0); }
      }
      @keyframes pushTalkPulseFast {
        0%, 100% { box-shadow: 0 0 0 0 rgba(231, 76, 60, .65); }
        55% { box-shadow: 0 0 0 18px rgba(231, 76, 60, 0); }
      }
      @media (prefers-reduced-motion: reduce) {
        .push-talk, .push-talk.grabando { animation: none; }
      }
      [data-home-voice], .mic-big {
        user-select: none; -webkit-user-select: none;
        -webkit-touch-callout: none; touch-action: none;
      }
      @media (max-width: 420px) { .push-talk { width: 88px; height: 88px; } }

      .push-talk-bar {
        position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
        z-index: 9000; display: flex; align-items: center; gap: 10px;
        max-width: calc(100vw - 24px); padding: 12px 16px; border-radius: 999px;
        background: #1b1d22; color: #fff; border: 1px solid rgba(231, 76, 60, .6);
        box-shadow: 0 12px 30px rgba(0, 0, 0, .45); font-size: 14px; font-weight: 600;
      }
      .push-talk-bar[hidden] { display: none; }
      .push-talk-dot {
        width: 11px; height: 11px; border-radius: 50%; background: #e74c3c; flex: 0 0 auto;
        animation: pushTalkPulse 1s ease-in-out infinite;
      }
      @keyframes pushTalkPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.8); } }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------------ avisos
  function hint(msg, ms = 8000) {
    const el = $('vozHint');
    if (el) { el.textContent = msg; el.hidden = false; }
    clearTimeout(hint.t);
    hint.t = setTimeout(() => { if (el) el.hidden = true; }, ms);
  }

  function pedirAyuda() {
    if (typeof window.AvisoMicro === 'function') window.AvisoMicro();
    else hint('Este navegador no puede grabar. Abre la página en Chrome.', 12000);
  }

  // ---------------------------------------------------------------- grabación
  let stream = null;
  let streamAt = 0;
  let rec = null;
  let chunks = [];
  let estado = 'idle'; // idle | pidiendo | grabando | enviando
  let bloqueado = false; // grabando con un toque (sin mantener pulsado)
  let inicio = 0;
  let ultimoGesto = 0;
  let timer = null;
  let barra = null;

  function boton() { return $('vozMic'); }

  function pintar(activo) {
    const b = boton();
    if (b) {
      b.classList.toggle('grabando', activo);
      b.setAttribute('aria-pressed', activo ? 'true' : 'false');
      const t = b.querySelector('.push-talk-text');
      if (t) t.textContent = activo ? 'Escuchando' : 'Hablar';
      const time = b.querySelector('.push-talk-time');
      if (time) time.hidden = !activo;
    }
    const big = document.querySelector('[data-home-voice]');
    if (big) {
      big.classList.toggle('listening', activo);
      const span = big.querySelector('span');
      if (span) span.textContent = activo ? 'Grabando… suelta para enviar' : 'Mantén pulsado';
    }
    pintarBarra(activo);
  }

  function pintarBarra(activo) {
    if (!activo) {
      if (barra) { barra.hidden = true; }
      clearInterval(timer);
      timer = null;
      return;
    }
    if (!barra) {
      barra = document.createElement('div');
      barra.className = 'push-talk-bar';
      barra.setAttribute('role', 'status');
      barra.setAttribute('aria-live', 'polite');
      barra.innerHTML = '<span class="push-talk-dot"></span><span data-txt>Grabando</span><span data-time>0:00</span>';
      document.body.appendChild(barra);
    }
    barra.hidden = false;
    const txt = barra.querySelector('[data-txt]');
    const time = barra.querySelector('[data-time]');
    const tick = () => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      if (time) time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (txt) txt.textContent = bloqueado ? 'Grabando · toca el botón para enviar' : 'Grabando · suelta para enviar';
    };
    tick();
    clearInterval(timer);
    timer = setInterval(tick, 250);
  }

  async function conseguirMicro() {
    // Reutiliza el micro unos segundos: así el segundo mensaje empieza al
    // instante y no vuelve a pedir permiso ni a encender el micrófono.
    if (stream && stream.getAudioTracks().some(t => t.readyState === 'live') && Date.now() - streamAt < 45000) {
      return stream;
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    streamAt = Date.now();
    return stream;
  }

  function tipoAudio() {
    const candidatos = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const tipo of candidatos) {
      try { if (MediaRecorder.isTypeSupported(tipo)) return tipo; } catch { /* probar siguiente */ }
    }
    return '';
  }

  async function empezar() {
    if (estado === 'grabando' || estado === 'pidiendo' || estado === 'enviando') return;
    estado = 'pidiendo';
    try {
      const media = await conseguirMicro();
      chunks = [];
      const tipo = tipoAudio();
      rec = new MediaRecorder(media, tipo ? { mimeType: tipo, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
      rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = terminar;
      rec.start(200);
      inicio = Date.now();
      estado = 'grabando';
      // Se pide a Android que confirme con una vibración corta (si lo permite).
      try { navigator.vibrate?.(18); } catch { /* sin vibración */ }
      pintar(true);
    } catch (error) {
      estado = 'idle';
      pintar(false);
      const nombre = error && error.name;
      if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
        bloqueado = false;
        pedirAyuda();
        hint('Micrófono bloqueado. Toca «Activar micrófono» y acepta el aviso.', 12000);
      } else if (nombre === 'NotFoundError' || nombre === 'DevicesNotFoundError') {
        hint('El teléfono no encuentra ningún micrófono.', 10000);
      } else if (nombre === 'NotReadableError' || nombre === 'TrackStartError') {
        hint('Otra aplicación está usando el micrófono. Ciérrala y prueba otra vez.', 10000);
      } else {
        hint('No se pudo abrir el micrófono. Prueba otra vez.', 10000);
      }
    }
  }

  function parar(enviar = true) {
    if (estado !== 'grabando' || !rec) return;
    estado = 'enviando';
    rec._enviar = enviar;
    try { rec.stop(); } catch { terminar(); }
  }

  function terminar() {
    const enviar = rec?._enviar !== false;
    const tipo = rec?.mimeType || 'audio/webm';
    rec = null;
    pintar(false);
    // El micro se queda encendido unos segundos por si sigue la conversación.
    setTimeout(() => {
      if (estado !== 'grabando' && stream) {
        stream.getTracks().forEach(t => t.stop());
        stream = null;
      }
    }, 20000);
    if (!enviar) { estado = 'idle'; return; }
    const blob = new Blob(chunks, { type: tipo });
    if (blob.size < 1200) {
      estado = 'idle';
      hint('No te he oído. Mantén pulsado y habla cerca del micrófono.', 8000);
      return;
    }
    subir(blob);
  }

  async function subir(blob) {
    const input = $('chatInput');
    hint('Entendiendo lo que has dicho…', 15000);
    let texto = '';
    try {
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.text) {
        estado = 'idle';
        hint(r.status === 503
          ? 'El dictado no está activado en el servidor. Escribe la consulta.'
          : 'No se pudo entender el audio. Mantén pulsado y habla más claro.', 9000);
        return;
      }
      texto = String(data.text).trim();
    } catch {
      estado = 'idle';
      hint('Sin conexión para transcribir. Escribe la consulta.', 9000);
      return;
    }
    estado = 'idle';
    // Marca de "esto viene del micrófono": el modo conversación la usa para
    // volver a abrir el micro cuando la IA termine de contestar.
    window.__dictadoEnviado = Date.now();
    if (input) {
      input.value = texto;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    hint(`Te he entendido: «${texto}»`);
    // Abre el chat si el botón se pulsó desde la portada y envía solo.
    const form = $('chatForm');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }

  function alternar() {
    if (estado === 'grabando') { parar(true); return; }
    if (estado === 'pidiendo' || estado === 'enviando') return;
    bloqueado = true;
    empezar();
  }

  // ------------------------------------------------------------ interacción
  // Un solo gesto: bajar = empezar, soltar = enviar salvo que haya sido un
  // toque muy corto, que deja la grabación fija (estilo WhatsApp).
  function esBotonDeVoz(target) {
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest('#vozMic, [data-home-voice], .mic-big'));
  }

  function esBotonDePortada(target) {
    return target instanceof Element && Boolean(target.closest('[data-home-voice], .mic-big'));
  }

  document.addEventListener('pointerdown', event => {
    if (!esBotonDeVoz(event.target)) return;
    if (event.button !== undefined && event.button > 0) return;
    // En la portada NO se cancela el gesto: su clic cambia a la vista del chat.
    if (!esBotonDePortada(event.target)) event.preventDefault();
    event.stopImmediatePropagation();
    ultimoGesto = Date.now();
    if (!soportado) { pedirAyuda(); return; }
    if (estado === 'grabando') { parar(true); return; }
    if (estado === 'pidiendo' || estado === 'enviando') return;
    bloqueado = false;
    empezar();
  }, true);

  document.addEventListener('pointerup', () => {
    if (estado !== 'grabando') return;
    const duracion = Date.now() - inicio;
    if (bloqueado) return;
    if (duracion < 450) { bloqueado = true; pintar(true); return; }
    parar(true);
  }, true);

  document.addEventListener('pointercancel', () => {
    if (estado === 'grabando' && !bloqueado) parar(true);
  }, true);

  // El teclado (Enter/espacio) y los clics que no vienen de un dedo. En la
  // portada se deja pasar el clic para que la app abra la vista del chat.
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element) || !event.target.closest('#vozMic')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (Date.now() - ultimoGesto < 800) return; // ya lo gestionó el puntero
    alternar();
  }, true);

  // Si pulsa Enviar mientras graba, se corta y se manda lo hablado.
  $('chatForm')?.addEventListener('submit', event => {
    if (estado === 'grabando') {
      event.preventDefault();
      event.stopImmediatePropagation();
      parar(true);
    }
  }, true);

  // La portada y quien llame por código acaban aquí.
  window.DictadoHablar = alternar;
  // Para el modo conversación: abrir el micro sin pasar por el puntero.
  window.DictadoEscuchar = () => { ultimoGesto = 0; alternar(); };
  window.DictadoParar = () => { if (estado === 'grabando') parar(false); };
  window.VozHablar = () => {
    if (Date.now() - ultimoGesto < 800) return; // ya lo gestionó el puntero
    alternar();
  };

  if (soportado) {
    window.DictadoDisponible = true;
    injectStyles();
    // Mantiene al día el texto del botón si el DOM se redibuja.
    setTimeout(() => { if (estado === 'idle') pintar(false); }, 600);
  } else {
    // Sin grabadora: se avisa al pulsar en vez de no hacer nada.
    window.DictadoHablar = pedirAyuda;
    window.VozHablar = pedirAyuda;
    window.DictadoEscuchar = pedirAyuda;
    window.DictadoParar = () => {};
    injectStyles();
  }
})();
