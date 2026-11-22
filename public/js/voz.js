/**
 * Modo voz del chat de diagnóstico.
 *
 * Dos cosas, independientes entre sí:
 *  1. Escuchar: lee en alto las respuestas de la IA con la voz del teléfono
 *     (Web Speech Synthesis). Botón en cada respuesta y modo automático.
 *  2. Hablar: dictado con el micrófono (Web Speech Recognition, es-ES) que
 *     rellena el campo y envía la consulta, para usar el chat sin escribir.
 *
 * Va en su propio archivo y se engancha al DOM existente: no toca app.js, así
 * dos agentes pueden trabajar sin sobrescribirse. Si el navegador no soporta
 * alguna de las dos APIs (o el usuario deniega el micrófono), los botones
 * simplemente no aparecen y el chat sigue funcionando igual que antes.
 */
(function () {
  'use strict';

  const synth = window.speechSynthesis;
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const STORE_READ = 'dm_voz_leer';
  const STORE_LANG = 'dm_voz_idioma';

  const canRead = Boolean(synth && typeof SpeechSynthesisUtterance === 'function');
  const canHear = Boolean(Recognition);

  // La portada llama a esta función. Tiene que existir SIEMPRE: si el navegador
  // no soporta dictado, debe explicarlo en pantalla en vez de no hacer nada.
  window.VozHablar = function () {
    const el = document.getElementById('vozHint');
    if (el) {
      el.textContent = 'Este navegador no permite dictado. Usa el micrófono del teclado o escribe tu consulta.';
      el.hidden = false;
    }
    const input = document.getElementById('chatInput');
    if (input) { input.placeholder = 'Escribe aquí tu avería…'; input.focus(); }
  };

  if (!canRead && !canHear) return;

  // Chrome en Android devuelve getVoices() vacío hasta que el motor de voz
  // arranca, y entonces no se puede elegir una voz española: se habla con la
  // que haya por defecto. Se pide al cargar y se refresca cuando llega.
  if (canRead) {
    try { synth.getVoices(); } catch (_) {}
    if (typeof synth.addEventListener === 'function') {
      synth.addEventListener('voiceschanged', () => {
        try { synth.getVoices(); } catch (_) {}
      });
    }
  }

  const store = {
    get(key, fallback) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* modo privado */ }
    }
  };

  // Por defecto la IA contesta en voz alta: así se puede hablar sin mirar.
  let autoRead = store.get(STORE_READ, '1') === '1';

  let lang = store.get(STORE_LANG, 'es-ES');
  let speakingBubble = null;
  let recognition = null;
  let listening = false;
  let permissionGranted = false;

  // ---------------------------------------------------------------- utilidades

  // Texto limpio: fuera etiquetas, fuera la nota de "generado por IA", fuera
  // URLs (leer una URL en alto es insufrible) y sin markdown.
  function plainText(node) {
    if (!node) return '';
    const clone = node.cloneNode(true);
    clone.querySelectorAll('script, style, .chat-meta, .chat-ai-head, .voz-btn, .voz-bar, .web-reference-list, .forum-reference-list').forEach(el => el.remove());
    clone.querySelectorAll('a').forEach(a => { a.textContent = ` ${a.textContent} `; });
    let text = clone.textContent || '';
    text = text
      .replace(/\[Vehículo:[^\]]*\]/gi, ' ')
      .replace(/^\s*>.*$/gm, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/\s*\n\s*/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\.\s*\./g, '.')
      .trim();
    return text.slice(0, 5000);
  }

  // Voz de hombre, española y con empaque de mecánico veterano: grave, pausada
  // y sin tono comercial. El orden de preferencia está por nombres reales de
  // voces conocidas (Windows, Apple, Android, Chrome) porque las APIs no dicen
  // el sexo; cuando solo hay voces femeninas se baja el tono para que no suene
  // a asistente de móvil.
  const MALE_HINTS = /\b(jorge|diego|carlos|pablo|raul|raúl|miguel|juan|enrique|andres|andrés|antonio|manuel|alvaro|álvaro|gonzalo|sebastian|sebastián|ricardo|javier|pedro|luis|arturo|gerardo|hombre|male|masculin|ernesto|esteban|hugo|ivan|iván|mateo|nicolas|nicolás|tomas|tomás|dario|darío|jaime|sergio|ramiro|felipe|emilio|julio|alonso|bruno|gabriel|agustin|agustín|joaquin|joaquín|rodrigo|german|germán|mauricio|cristian|benjamin|benjamín|alberto|alfonso|ramon|ramón|marcos|victor|víctor|norberto|nestor|néstor|wenceslao|standard-b)\b/i;
  const FEMALE_HINTS = /\b(monica|mónica|paulina|helena|lucia|lucía|carmen|laura|isabel|maria|maría|sofia|sofía|sabina|elena|esperanza|ximena|catalina|lupe|penelope|penélope|ines|inés|triana|vera|abril|dalia|elvira|irene|larissa|teresa|lola|female|mujer|femenin)\b/i;

  function pickSpanishVoice() {
    const voices = (synth.getVoices() || []).filter(v => /^es/i.test(v.lang || ''));
    if (!voices.length) return { voice: null, male: false };

    const score = voice => {
      const name = `${voice.name || ''} ${voice.voiceURI || ''}`;
      let points = 0;
      // La variante de España es la que suena natural aquí.
      if (/^es[-_]es/i.test(voice.lang || '')) points += 6;
      if (MALE_HINTS.test(name)) points += 10;
      if (FEMALE_HINTS.test(name)) points -= 8;
      // Las voces de red (Google/Microsoft) suenan bastante mejor que las robóticas locales.
      if (!voice.localService) points += 2;
      if (/google|microsoft|natural|neural|premium|enhanced/i.test(name)) points += 3;
      return points;
    };

    const ranked = voices
      .map(voice => ({ voice, points: score(voice), male: MALE_HINTS.test(`${voice.name || ''} ${voice.voiceURI || ''}`) }))
      .sort((a, b) => b.points - a.points);
    const best = ranked[0];
    return { voice: best?.voice || null, male: Boolean(best?.male) };
  }

  // Lo que se lee en alto tiene que ser corto: si se lee todo el informe, el
  // usuario se pasa medio minuto sin poder hablar. Se queda con la explicación
  // sencilla y, como mucho, tres frases.
  // Se lee UNA vez y muy corto: qué le pasa y qué hacer, nada más. Todo lo
  // demás queda escrito en pantalla para quien lo quiera leer.
  function resumenHablado(texto) {
    const plano = String(texto || '')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (!plano) return '';

    // Se lee lo que de verdad importa a quien está con el coche delante:
    // primero si puede circular, después qué tiene que hacer. El resto del
    // informe se queda escrito en pantalla para quien quiera leerlo.
    const partes = [];
    const riesgo = plano.match(/riesgo\s*:?\s*([\s\S]{5,220}?)(?=\s(?:qu[eé] hacer|qu[eé] puede ser|en f[aá]cil)\b|$)/i);
    if (riesgo && riesgo[1]) partes.push(riesgo[1].trim());

    const hacer = plano.match(/qu[eé] hacer\s*:?\s*([\s\S]{0,320}?)(?=\s(?:qu[eé] puede ser|en f[aá]cil)\b|$)/i);
    if (hacer && hacer[1]) {
      const pasos = hacer[1]
        .split(/(?:\d+[).]\s*|·)/)
        .map(s => s.trim().replace(/\.$/, ''))
        .filter(Boolean)
        .slice(0, 3);
      if (pasos.length) partes.push(pasos.join('. '));
    }

    let salida = partes.join('. ').replace(/\s{2,}/g, ' ').trim();
    if (!salida) {
      // Respuestas antiguas o sin formato: lo de siempre, en fácil.
      const facil = plano.match(/en f[aá]cil[:,]?\s*([^\n]{10,200})/i);
      salida = facil ? facil[1].trim() : plano.slice(0, 220);
    }
    return salida.length > 340 ? `${salida.slice(0, 337).trim()}…` : salida;
  }

  // Trocea el texto en frases de como mucho ~150 caracteres. Ni una frase
  // cortada por la mitad al oído ni una locución tan larga que el motor la
  // abandone.
  function trocear(texto) {
    const frases = (texto.match(/[^.!?]+[.!?]*/g) || [texto])
      .map(s => s.trim())
      .filter(Boolean);
    const trozos = [];
    let buf = '';
    for (const frase of frases) {
      const junto = buf ? `${buf} ${frase}` : frase;
      if (buf && junto.length > 150) {
        trozos.push(buf);
        buf = frase;
      } else {
        buf = junto;
      }
    }
    if (buf) trozos.push(buf);
    return trozos.length ? trozos : [texto];
  }

  function stopSpeaking() {
    hablandoSenal = false;
    pararAudio();
    if (synth) synth.cancel();
    if (speakingBubble) {
      speakingBubble.classList.remove('voz-speaking');
      const btn = speakingBubble.querySelector('.voz-btn');
      if (btn) btn.setAttribute('aria-pressed', 'false');
      speakingBubble = null;
    }
    // cancel() no siempre dispara «end»: sin esto la señal podía quedarse
    // congelada en «Maya está hablando» aunque ya estuviera escuchando.
    setTimeout(pintarSenal, 0);
  }

  function speak(bubble) {
    if (!canRead || !bubble) return;
    if (speakingBubble === bubble && (synth.speaking || audioActual)) { stopSpeaking(); return; }
    // Si el motor aún no ha publicado sus voces, se le da un instante antes de
    // hablar: así se elige la voz española en vez de la que venga por defecto.
    if (!synth.getVoices().length && bubble.dataset.vozRetry !== '1') {
      bubble.dataset.vozRetry = '1';
      try { synth.getVoices(); } catch (_) {}
      setTimeout(() => speak(bubble), 250);
      return;
    }
    stopSpeaking();
    const text = resumenHablado(plainText(bubble));
    if (!text) return;

    // Sin voces en el teléfono, la voz llega ya sintetizada del servidor: se
    // oye igual y no hay que mandar a nadie a instalar datos de voz.
    if (!synth.getVoices().length) {
      speakingBubble = bubble;
      bubble.classList.add('voz-speaking');
      const btnVoz = bubble.querySelector('.voz-btn');
      if (btnVoz) btnVoz.setAttribute('aria-pressed', 'true');
      hablarPorAudio(text, () => {
        bubble.classList.remove('voz-speaking');
        if (btnVoz) btnVoz.setAttribute('aria-pressed', 'false');
        if (speakingBubble === bubble) speakingBubble = null;
      });
      return;
    }

    // Chrome en Android corta las locuciones largas a media frase (bug conocido
    // del motor de voz). Se habla por trozos cortos encadenados: así no se
    // queda a medias aunque la respuesta sea larga.
    const trozos = trocear(text);
    const { voice, male } = pickSpanishVoice();

    speakingBubble = bubble;
    bubble.classList.add('voz-speaking');
    hablandoSenal = true;
    pintarSenal();
    const btn = bubble.querySelector('.voz-btn');
    if (btn) btn.setAttribute('aria-pressed', 'true');

    const terminar = () => {
      hablandoSenal = false;
      pintarSenal();
      bubble.classList.remove('voz-speaking');
      if (btn) btn.setAttribute('aria-pressed', 'false');
      if (speakingBubble === bubble) speakingBubble = null;
    };

    const decir = i => {
      if (i >= trozos.length) { terminar(); return; }
      if (speakingBubble !== bubble) return; // se ha cancelado
      const utter = new SpeechSynthesisUtterance(trozos[i]);
      utter.lang = lang;
      // Un motor con voces rotas no puede tumbar la conversación: si la voz
      // elegida no vale, se sigue con la del sistema.
      try { utter.voice = voice || null; } catch (_e) { /* voz no válida */ }
      // Bajar el tono a 0,58 convertía la voz de Google TTS en un dibujo
      // animado: forzado y difícil de entender. Casi natural, y el tono grave
      // solo se insinúa cuando de verdad hay una voz masculina.
      utter.pitch = male ? 0.9 : 1;
      utter.rate = 1.02;
      utter.volume = 1;
      utter.onend = () => decir(i + 1);
      utter.onerror = () => decir(i + 1);
      try { synth.speak(utter); } catch (_e) { terminar(); }
    };
    decir(0);
  }

  // ---------------------------------------------------------------- botón leer

  function addReadButton(bubble, autoSpeak = false) {
    if (!canRead || bubble.dataset.vozReady === '1') return;
    if (!bubble.classList.contains('assistant')) return;
    if (bubble.classList.contains('typing')) return;
    if (!plainText(bubble)) return;
    bubble.dataset.vozReady = '1';
    bubble.style.position = bubble.style.position || 'relative';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'voz-btn';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Escuchar esta respuesta en voz alta');
    btn.title = 'Escuchar la respuesta';
    btn.textContent = '🔊 Escuchar';
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      speak(bubble);
    });
    bubble.appendChild(btn);

    // Solo se lee sola la respuesta que acaba de llegar. Las que ya estaban en
    // el chat (al abrirlo o cambiar de vista) nunca se leen: si no, el móvil se
    // pone a hablar solo con todo el historial.
    if (autoSpeak && autoRead && !bubble.classList.contains('voz-no-auto')) {
      clearTimeout(addReadButton.timer);
      addReadButton.timer = setTimeout(() => {
        const todas = document.querySelectorAll('#chatBox .bubble.assistant:not(.typing)');
        const ultima = todas[todas.length - 1];
        if (ultima === bubble) speak(bubble);
      }, 120);
    }
  }

  function scanBubbles() {
    // Ojo: forEach pasa el índice como segundo argumento, y ese valor acababa
    // en `autoSpeak`: por eso el historial se leía solo al abrir el chat.
    document.querySelectorAll('#chatBox .bubble.assistant').forEach(bubble => addReadButton(bubble, false));
  }

  // --------------------------------------------------------------- barra de voz

  function buildBar() {
    const host = document.querySelector('#chatBox')?.closest('.view') || document.querySelector('#view-chat');
    if (!host || document.getElementById('vozBar')) return;

    const bar = document.createElement('div');
    bar.id = 'vozBar';
    bar.className = 'voz-bar';
    bar.innerHTML = `
      ${canRead ? `<button type="button" class="voz-chip" id="vozAuto" aria-pressed="${autoRead ? 'true' : 'false'}" title="Leer automáticamente cada respuesta">🔊 Que me lo lea: <b>${autoRead ? 'sí' : 'no'}</b></button>` : ''}

      ${canRead ? `<button type="button" class="voz-chip" id="vozStop" hidden>⏹ Parar</button>` : ''}
      <span class="voz-hint" id="vozHint" hidden></span>
    `;
    const form = document.getElementById('chatForm');
    if (form && form.parentNode) form.parentNode.insertBefore(bar, form);
    else host.appendChild(bar);

    const autoBtn = bar.querySelector('#vozAuto');
    autoBtn?.addEventListener('click', () => {
      autoRead = !autoRead;
      store.set(STORE_READ, autoRead ? '1' : '0');
      autoBtn.setAttribute('aria-pressed', String(autoRead));
      autoBtn.innerHTML = `🔊 Que me lo lea: <b>${autoRead ? 'sí' : 'no'}</b>`;
      if (!autoRead) stopSpeaking();
      else {
        const bubbles = document.querySelectorAll('#chatBox .bubble.assistant');
        const last = bubbles[bubbles.length - 1];
        if (last) speak(last);
      }
    });

    bar.querySelector('#vozStop')?.addEventListener('click', stopSpeaking);
    if (canRead) {
      synth.addEventListener?.('speaking', () => { const s = bar.querySelector('#vozStop'); if (s) s.hidden = false; });
      synth.addEventListener?.('end', () => { const s = bar.querySelector('#vozStop'); if (s) s.hidden = true; });
    }
  }

  // ------------------------------------------------------------------- dictado

  function hint(message, ms = 4000) {
    const el = document.getElementById('vozHint');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(hint._t);
    hint._t = setTimeout(() => { el.hidden = true; }, ms);
  }

  function setListening(value) {
    listening = value;
    const btn = document.getElementById('vozMic');
    if (!btn) return;
    btn.classList.toggle('listening', value);
    btn.setAttribute('aria-pressed', String(value));
    btn.title = value ? 'Escuchando… pulsa para parar' : 'Hablar en vez de escribir';
    const input = document.getElementById('chatInput');
    if (input) input.placeholder = value ? 'Te escucho… habla con naturalidad' : 'Ej.: Seat León 2.0 TDI da tirones en baja y marca código P0299...';
  }

  // Pide el permiso de micrófono de verdad antes de dictar. Sin esto, en
  // Android el aviso del sistema no aparecía y el dictado fallaba en silencio.
  async function ensureMicPermission() {
    if (permissionGranted) return true;
    if (!window.isSecureContext) {
      hint('El micrófono necesita HTTPS. Abre la web con https:// o usa la app.', 8000);
      return false;
    }
    try {
      const status = await navigator.permissions?.query?.({ name: 'microphone' });
      if (status && status.state === 'denied') {
        hint('Micrófono bloqueado. Toca el candado de la barra y permite el micrófono.', 9000);
        return false;
      }
    } catch { /* Safari/Firefox no soportan esta consulta */ }
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      hint('Acepta el permiso de micrófono que acaba de aparecer en tu teléfono…', 6000);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      permissionGranted = true;
      return true;
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      hint(denied
        ? 'Micrófono denegado. Ajustes › Aplicaciones › Diagnóstico y Mecánica › Permisos › Micrófono.'
        : 'No se pudo abrir el micrófono. Cierra la app que lo esté usando y reinténtalo.', 9000);
      return false;
    }
  }

  async function startRecognition() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    if (!form || !input) return;
    if (!Recognition) {
      hint('Este navegador no permite dictado. Usa el micrófono del teclado o escribe la consulta.', 9000);
      input.focus();
      return;
    }
    hint('Pidiendo permiso de micrófono…', 3000);
    input.placeholder = 'Pidiendo permiso de micrófono…';
    const allowed = await ensureMicPermission();
    if (!allowed) { input.placeholder = 'Escribe tu avería o pulsa el micrófono'; return; }
    hint('Te escucho. Habla ahora.', 5000);

    recognition = new Recognition();
    recognition.lang = lang;
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalText = '';

    recognition.onstart = () => setListening(true);

    recognition.onresult = event => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalText += `${chunk} `;
        else interim += chunk;
      }
      input.value = `${finalText}${interim}`.trim().slice(0, 4000);
    };

    recognition.onerror = event => {
      setListening(false);
      const map = {
        'not-allowed': 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador o de la app.',
        'service-not-allowed': 'El dictado no está disponible en este navegador.',
        'no-speech': 'No te he oído. Pulsa el micrófono y vuelve a hablar.',
        'audio-capture': 'No se encuentra el micrófono.',
        network: 'Sin conexión para el dictado de voz.'
      };
      hint(map[event.error] || 'No se pudo dictar. Prueba otra vez.', 6000);
    };

    recognition.onend = () => {
      setListening(false);
      const text = input.value.trim();
      if (text) {
        // Se envía solo: el usuario ha hablado para no tener que tocar nada.
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    };

    try {
      stopSpeaking();
      recognition.start();
    } catch {
      setListening(false);
      hint('El dictado no está disponible ahora mismo.', 5000);
    }
  }

  // El dictado por micrófono se ha retirado: no funcionaba igual en todos los
  // móviles y la conversación se volvía lenta. Para preguntar se escribe o se
  // usa el micrófono del teclado del teléfono; la IA solo responde en voz alta.
  function addMicButton() { /* sin botón de dictado */ }

  // ------------------------------------------------------------------- arranque

  // Los estilos van dentro del propio archivo para que el modo voz funcione sin
  // tocar las hojas de estilo compartidas (que otro agente está editando).
  function injectStyles() {
    if (document.getElementById('vozStyles')) return;
    const style = document.createElement('style');
    style.id = 'vozStyles';
    style.textContent = `
      .voz-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 10px; }
      .voz-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 6px 11px;
        border-radius: 999px; border: 1px solid rgba(148, 163, 184, .3); background: rgba(148, 163, 184, .08);
        color: inherit; font: inherit; font-size: 12.5px; cursor: pointer; }
      .voz-chip[aria-pressed="true"] { border-color: var(--accent, #f5a524); color: var(--accent, #f5a524); background: rgba(245, 165, 36, .12); }
      .voz-hint { font-size: 12px; color: var(--muted, #94a3b8); }
      .voz-btn { position: absolute; top: 6px; right: 8px; padding: 3px 8px; border-radius: 999px;
        border: 1px solid rgba(148, 163, 184, .3); background: rgba(8, 9, 11, .55); color: inherit;
        font: inherit; font-size: 11px; line-height: 1.4; cursor: pointer; opacity: .75; }
      .voz-btn:hover, .voz-btn:focus-visible { opacity: 1; }
      .voz-btn[aria-pressed="true"] { border-color: var(--accent, #f5a524); color: var(--accent, #f5a524); opacity: 1; }
      .bubble.voz-speaking { box-shadow: 0 0 0 1px var(--accent, #f5a524) inset; }
      .voz-mic.listening { border-color: #ef4444; color: #ef4444; box-shadow: 0 0 0 3px rgba(239, 68, 68, .18); }
      @media (max-width: 560px) { .voz-btn { position: static; margin-top: 8px; } .voz-chip { font-size: 12px; } }

      /* Señal de escucha: marco en los bordes de la pantalla, visible de reojo
         sin tener que mirar el chat, y pastilla con el estado en palabras. */
      #mayaSenal { position: fixed; inset: 0; pointer-events: none; z-index: 9998; }
      #mayaSenal[hidden] { display: none; }
      #mayaSenal .maya-marco { position: absolute; inset: 0; border: 0 solid transparent;
        transition: border-color .25s ease, box-shadow .25s ease; }
      /* Abajo a la IZQUIERDA: centrada tapaba el chat y a la derecha chocaba
         con el botón flotante de «Instalar app». */
      #mayaSenal .maya-pastilla { position: absolute; left: 10px; bottom: calc(96px + env(safe-area-inset-bottom, 0px));
        display: flex; align-items: center; gap: 7px; padding: 6px 11px; border-radius: 999px;
        font-size: 12px; line-height: 1.2; white-space: nowrap; color: #e5e7eb; background: rgba(8, 9, 11, .9);
        border: 1px solid rgba(148, 163, 184, .35); box-shadow: 0 6px 20px rgba(0, 0, 0, .35); }
      #mayaSenal .maya-pastilla i { width: 9px; height: 9px; border-radius: 50%; background: #f5a524; flex: 0 0 auto; }
      #mayaSenal[data-estado="escucha"] .maya-marco { border-width: 5px; border-color: rgba(245, 165, 36, .8);
        animation: mayaPulso 2.4s ease-in-out infinite; }
      #mayaSenal[data-estado="escucha"] .maya-pastilla i { animation: mayaPunto 1.2s ease-in-out infinite; }
      #mayaSenal[data-estado="atenta"] .maya-marco { border-width: 6px; border-color: rgba(34, 197, 94, .9);
        animation: mayaPulso 1s ease-in-out infinite; }
      #mayaSenal[data-estado="atenta"] .maya-pastilla { border-color: rgba(34, 197, 94, .6); color: #bbf7d0; }
      #mayaSenal[data-estado="atenta"] .maya-pastilla i { background: #22c55e; animation: mayaPunto .7s ease-in-out infinite; }
      #mayaSenal[data-estado="habla"] .maya-marco { border-width: 4px; border-color: rgba(96, 165, 250, .65); }
      #mayaSenal[data-estado="habla"] .maya-pastilla i { background: #60a5fa; border-radius: 2px; }
      #mayaSenal[data-estado="piensa"] .maya-marco { border-width: 2px; border-color: rgba(148, 163, 184, .4); }
      #mayaSenal[data-estado="piensa"] .maya-pastilla i { background: #94a3b8; }
      @keyframes mayaPulso {
        0%, 100% { box-shadow: inset 0 0 26px rgba(245, 165, 36, .12), 0 0 14px rgba(245, 165, 36, .25); opacity: .6; }
        50% { box-shadow: inset 0 0 52px rgba(245, 165, 36, .30), 0 0 26px rgba(245, 165, 36, .55); opacity: 1; }
      }
      @keyframes mayaPunto { 0%, 100% { transform: scale(.75); opacity: .55; } 50% { transform: scale(1.15); opacity: 1; } }
      @media (prefers-reduced-motion: reduce) {
        #mayaSenal .maya-marco, #mayaSenal .maya-pastilla i { animation: none !important; opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------ voz por audio (TTS)
  // Android sin datos de voz: se pide el MP3 al servidor y se reproduce. Es la
  // misma voz de Google, solo que ya sintetizada, así que suena siempre.
  let audioActual = null;
  let audioUrl = null;

  function pararAudio() {
    if (!audioActual) return;
    const a = audioActual;
    audioActual = null;
    try { a.pause(); } catch (_e) { /* ya parado */ }
    a.onended = null;
    a.onerror = null;
    try { a.src = ''; } catch (_e) { /* nada */ }
    if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (_e) {} audioUrl = null; }
    hablandoSenal = false;
    pintarSenal();
  }

  async function hablarPorAudio(texto, alTerminar) {
    pararAudio();
    hablandoSenal = true;
    pintarSenal();
    const cerrar = () => {
      hablandoSenal = false;
      pintarSenal();
      if (typeof alTerminar === 'function') alTerminar();
    };
    try {
      const respuesta = await fetch(`/api/tts?tl=es&q=${encodeURIComponent(texto)}`);
      if (!respuesta.ok) throw new Error(`voz ${respuesta.status}`);
      const blob = await respuesta.blob();
      audioUrl = URL.createObjectURL(blob);
      audioActual = new Audio(audioUrl);
      audioActual.onended = () => { pararAudio(); cerrar(); };
      audioActual.onerror = () => { pararAudio(); cerrar(); };
      await audioActual.play();
    } catch (_e) {
      pararAudio();
      cerrar();
      hint('No se pudo cargar la voz. Comprueba la conexión.', 5000);
    }
  }

  // ------------------------------------------------- modo llamada ("Di Maya")

  const STORE_LLAMADA = 'dm_voz_llamada';
  const SALUDO = 'Hola, soy Maya. ¿Qué quieres hacer?';
  let llamadaActiva = false;
  let wakeRec = null;
  let dictando = false;
  let saludoHecho = false;
  let timerSilencio = 0;
  let escuchando = false;
  // Se marca a mano: en este móvil el motor de voz falla antes de emitir
  // eventos y `synth.speaking` se queda en falso, así que el marco nunca se
  // ponía azul mientras Maya hablaba.
  let hablandoSenal = false;

  // La pantalla no puede apagarse mientras Maya acompaña al conductor: con el
  // móvil en el soporte, apagarse significa perder micrófono y voz aunque el
  // usuario haya pedido manos libres. Se libera al colgar y al ocultar la app.
  let wakeLock = null;
  let videoRespaldo = null;
  let avisoWake = false;
  let ultimaVibracion = 0;
  // Vistas en las que el móvil está haciendo algo activo y no debe apagarse.
  // El chat solo se mantiene encendido durante una llamada de voz; si no,
  // gastaría batería con la pantalla fija. Al salir se libera el wake lock.
  const VISTAS_PANTALLA = new Set(['ruta', 'testigos', 'garaje', 'obd', 'diagnostico']);
  let vistaPantalla = 'home';

  function vibrar(patron) {
    // Solo Android/Chrome vibra; en iPhone y escritorio no hace nada.
    try { navigator.vibrate?.(patron); } catch (_e) { /* sin vibración */ }
  }

  // Respaldo para navegadores sin Wake Lock (o cuando el permiso falla): un
  // vídeo mudo de 1 píxel en bucle mantiene despierta la pantalla en muchos
  // Android. No es tan fiable como la API, pero evita quedarse a oscuras en
  // mitad de una prueba; se libera al salir igual que el wake lock real.
  function iniciarVideoRespaldo() {
    if (videoRespaldo) return;
    try {
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.setAttribute('aria-hidden', 'true');
      v.style.cssText = 'position:fixed;left:-10px;bottom:-10px;width:1px;height:1px;opacity:0;pointer-events:none;';
      v.src = '/video/wake-loop.webm';
      document.body.appendChild(v);
      videoRespaldo = v;
      v.play().catch(() => {});
    } catch (_e) { videoRespaldo = null; }
    if (!avisoWake) {
      avisoWake = true;
      hint('Este navegador no permite mantener la pantalla encendida; uso un vídeo de respaldo. Si aun así se apaga, activa «Mantener pantalla encendida» en Ajustes de desarrollo.', 9000);
    }
  }

  function pararVideoRespaldo() {
    if (!videoRespaldo) return;
    try { videoRespaldo.pause(); } catch (_e) {}
    try { videoRespaldo.remove(); } catch (_e) {}
    videoRespaldo = null;
  }

  async function pedirPantallaEncendida() {
    if (wakeLock) return;
    if (!navigator.wakeLock?.request) { iniciarVideoRespaldo(); return; }
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
      pararVideoRespaldo();
    } catch (_e) {
      wakeLock = null;
      iniciarVideoRespaldo();
    }
  }

  function soltarPantallaEncendida() {
    try { wakeLock?.release?.(); } catch (_e) { /* ya liberado */ }
    wakeLock = null;
    pararVideoRespaldo();
  }

  function mantenerPantalla(vista = vistaPantalla) {
    vistaPantalla = String(vista || '').replace(/^view-/, '');
    const activa = llamadaActiva || (vistaPantalla !== 'chat' && VISTAS_PANTALLA.has(vistaPantalla));
    if (activa) pedirPantallaEncendida();
    else if (!llamadaActiva) soltarPantallaEncendida();
  }

  // Señal de estado: se ve de reojo sin dejar de mirar al coche. El marco
  // rodea toda la pantalla (ámbar = escuchando, verde = te oigo ahora,
  // azul = está hablando, gris = pensando) y la pastilla lo dice en palabras.
  const SENAL_TEXTO = {
    escucha: 'Escuchando',
    atenta: 'Te oigo',
    habla: 'Hablando',
    piensa: 'Conectando…'
  };

  function crearSenal() {
    if (document.getElementById('mayaSenal')) return;
    const el = document.createElement('div');
    el.id = 'mayaSenal';
    el.hidden = true;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.innerHTML = '<span class="maya-marco"></span><span class="maya-pastilla"><i></i><b></b></span>';
    document.body.appendChild(el);
  }

  function pintarSenal() {
    const el = document.getElementById('mayaSenal');
    if (!el) return;
    let estado = 'off';
    if (llamadaActiva) {
      if (hablandoSenal) estado = 'habla';
      else if (dictando) estado = 'atenta';
      else if (escuchando) estado = 'escucha';
      else estado = 'piensa';
    }
    if (estado === 'off') {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (el.dataset.estado !== estado) {
      el.dataset.estado = estado;
      const texto = el.querySelector('.maya-pastilla b');
      if (texto) texto.textContent = SENAL_TEXTO[estado] || '';
      // Aviso háptico: se nota al empezar a escuchar y al oír «Maya», sin
      // mirar la pantalla ni soltar el volante. Los reinicios del micrófono
      // (que repiten «escucha» cada pocos segundos) no vibran.
      const ahora = Date.now();
      if (estado === 'atenta' && ahora - ultimaVibracion > 800) {
        vibrar([40, 60, 40]);
        ultimaVibracion = ahora;
      }
    }
  }

  // Habla un texto suelto (saludo, aviso) con la misma voz que las respuestas.
  function hablarTexto(texto) {
    if (!canRead || !texto) return;
    stopSpeaking();
    // Se marca «hablando» ya, antes de que el motor publique sus voces: el modo
    // conversación consulta esta señal para no abrir el micrófono mientras
    // suena el saludo (si no, Maya se oye a sí misma y se envía su propio texto).
    hablandoSenal = true;
    pintarSenal();
    // Una sola locución: el saludo no depende del troceo en frases. Si el motor
    // aún no ha publicado voces, se espera un poco antes de tirar del audio del
    // servidor (así se usa la voz del sistema cuando existe).
    const decir = (intento = 0) => {
      if (!synth.getVoices().length) {
        if (intento < 2) { setTimeout(() => decir(intento + 1), 250); return; }
        hablarPorAudio(texto);
        return;
      }
      const { voice, male } = pickSpanishVoice();
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = lang;
      try { u.voice = voice || null; } catch (_e) { /* voz no válida */ }
      u.pitch = male ? 0.9 : 1;
      u.rate = 1.02;
      u.volume = 1;
      // Con el motor sin voces instaladas no llega ningún evento: el estado se
      // cierra igual por `onend`, por `onerror` o por el reloj de seguridad.
      const cerrar = () => {
        if (!hablandoSenal) return;
        hablandoSenal = false;
        pintarSenal();
      };
      u.onend = cerrar;
      u.onerror = cerrar;
      clearTimeout(hablarTexto._t);
      hablarTexto._t = setTimeout(cerrar, 20000);
      hablandoSenal = true;
      pintarSenal();
      // Si el motor falla al arrancar, se cierra el estado y el micrófono puede
      // tomar el turno; nunca se queda la app esperando una voz que no llega.
      try { synth.speak(u); } catch (_e) { cerrar(); }
    };
    decir(0);
  }

  function pintarBurbujaMaya(texto) {
    // Primero por la vía normal de la app; si el chat aún no tiene su caja
    // creada, se escribe la burbuja a mano: el saludo no puede depender de eso.
    try {
      if (typeof window.addBubble === 'function' && window.addBubble(`<p>${texto}</p>`, 'assistant', true)) return;
    } catch (_e) { /* se sigue por el plan B */ }
    const box = document.getElementById('chatBox');
    if (!box) return;
    const burbuja = document.createElement('div');
    burbuja.className = 'bubble assistant';
    burbuja.innerHTML = `<p>${texto}</p>`;
    box.appendChild(burbuja);
    box.scrollTop = box.scrollHeight;
  }

  // Saludo de bienvenida: una vez por sesión, con texto y voz.
  function saludarMaya(hablar = true) {
    if (saludoHecho) return;
    if (document.querySelector('.view.active')?.id !== 'view-chat') return;
    saludoHecho = true;
    // Si la app ya había escrito su bienvenida, se sustituye por la de Maya:
    // un solo saludo y con su nombre.
    const box = document.getElementById('chatBox');
    const yaSaluda = /qu[eé] le pasa a tu coche|qu[eé] quieres hacer|soy maya/i;
    const previa = box && yaSaluda.test(box.innerText || '')
      ? [...box.querySelectorAll('.bubble.assistant')].find(b => yaSaluda.test(b.innerText || ''))
      : null;
    if (previa) previa.innerHTML = `<p>${SALUDO}</p>`;
    else pintarBurbujaMaya(SALUDO);
    if (hablar) hablarTexto(SALUDO);
  }

  function setBotonLlamada(pulsado) {
    const btn = document.getElementById('vozLlamada');
    if (!btn) return;
    btn.setAttribute('aria-pressed', String(pulsado));
    btn.innerHTML = pulsado ? '🎙️ Maya te escucha' : '🎙️ Di «Maya»';
  }

  function añadirBotonLlamada() {
    if (document.getElementById('vozLlamada') || !canHear) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vozLlamada';
    btn.className = 'voz-chip';
    btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = '🎙️ Di «Maya»';
    btn.title = 'Maya escucha y responde cuando la llamas por su nombre';
    btn.addEventListener('click', () => {
      if (llamadaActiva) pararLlamada();
      else activarLlamada();
    });
    const barra = document.querySelector('.voz-bar');
    const form = document.getElementById('chatForm');
    if (barra) barra.appendChild(btn);
    else if (form && form.parentNode) form.parentNode.insertBefore(btn, form);
  }

  function enviarDictado() {
    const input = document.getElementById('chatInput');
    const form = document.getElementById('chatForm');
    const texto = (input?.value || '').trim();
    const inicioEspera = Date.now();
    dictando = false;
    escuchando = false;
    pintarSenal();
    try { wakeRec?.stop?.(); } catch (_e) {}
    if (!texto || !form) return;
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    // Se vuelve a escuchar en cuanto Maya TERMINA de hablar, no con una espera
    // fija de 16 s: antes la conversación tenía un hueco muerto enorme y ahora
    // el micrófono se reabre solo un instante después de la última palabra.
    const reanudar = () => { if (llamadaActiva) abrirEscucha(); };
    let hablo = false;
    const vigilante = setInterval(() => {
      if (!llamadaActiva) { clearInterval(vigilante); return; }
      // Incluye el audio TTS del servidor: en Android sin voces instaladas
      // `synth` puede estar callado mientras el MP3 sigue sonando. Si solo se
      // mira synth, el micrófono se reabre y Maya se oye a sí misma.
      if (hablandoSenal || audioActual || (synth && (synth.speaking || synth.pending))) { hablo = true; return; }
      if (hablo) { clearInterval(vigilante); setTimeout(reanudar, 120); return; }
      // Sin voz instalada nunca llega a hablar: no se deja al usuario colgado.
      if (Date.now() - inicioEspera > 6000) { clearInterval(vigilante); reanudar(); }
    }, 250);
    setTimeout(() => { clearInterval(vigilante); reanudar(); }, 22000);
  }

  async function abrirEscucha(directo = false) {
    if (!llamadaActiva || dictando || !canHear) return;
    const permitido = await ensureMicPermission();
    if (!permitido) { pararLlamada(); return; }
    if (directo) {
      // Maya acaba de preguntar: lo que conteste el usuario es la consulta, sin
      // tener que volver a llamarla por su nombre delante del coche.
      dictando = true;
      const campo = document.getElementById('chatInput');
      if (campo) { campo.value = ''; campo.placeholder = 'Te escucho…'; }
    }
    try { wakeRec?.abort?.(); } catch (_e) {}
    wakeRec = new Recognition();
    wakeRec.lang = lang;
    wakeRec.continuous = true;
    wakeRec.interimResults = true;
    wakeRec.maxAlternatives = 1;

    // El estado «escuchando» solo se pinta cuando el micrófono está de verdad
    // abierto: si el permiso está bloqueado no se puede decir que te escucha.
    // Si el micrófono arranca de verdad, el aviso de «bloqueado» que pudiera
    // haber quedado en pantalla ya no tiene sentido: se retira.
    // El aviso de «acepta el permiso» ya no tiene sentido cuando el micrófono
    // está abierto: se retira en el acto para no dejar un cartel encima del chat.
    const microAbierto = () => {
      escuchando = true;
      pintarSenal();
      window.MicPermiso?.ocultar?.();
      const aviso = document.getElementById('vozHint');
      if (aviso) { clearTimeout(hint._t); aviso.hidden = true; }
    };
    wakeRec.onstart = microAbierto;
    wakeRec.onaudiostart = microAbierto;

    wakeRec.onresult = event => {
      let trozo = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        trozo += `${event.results[i][0].transcript} `;
      }
      const oido = trozo.toLowerCase();
      const input = document.getElementById('chatInput');

      if (!dictando) {
        if (/\bmaya\b/.test(oido)) {
          dictando = true;
          pintarSenal();
          if (document.querySelector('.view.active')?.id !== 'view-chat' && window.Maya?.ver) {
            window.Maya.ver('chat');
          }
          hint('Te escucho, dime qué le pasa al coche.', 6000);
          hablarTexto('Dime.');
          if (input) { input.value = ''; input.placeholder = 'Te escucho…'; }
        }
        return;
      }

      // Si el usuario empieza a hablar mientras Maya habla, Maya se calla:
      // es una conversación, no dos monólogos a la vez.
      if (hablandoSenal) stopSpeaking();
      if (input) input.value = `${input.value} ${trozo}`.trim().slice(0, 4000);
      clearTimeout(timerSilencio);
      // 2,6 s de silencio antes de contestar: el tiempo que necesita una
      // persona para pensar la siguiente palabra. Con 1 s se cortaba a quien
      // hablaba despacio o hacía una pausa para respirar.
      timerSilencio = setTimeout(enviarDictado, 2600);
    };

    wakeRec.onend = () => {
      escuchando = false;
      // Sin repintar: entre que se cierra y se reabre el micrófono el marco se
      // ponía gris y parpadeaba cada pocos segundos.
      if (!llamadaActiva) return;
      if (!dictando) { setTimeout(() => abrirEscucha(), 500); return; }
      // Se abrió para conversar y el motor cerró el micro sin captar nada: se
      // reabre para que el modo voz no se quede mudo esperando un toque.
      const campo = document.getElementById('chatInput');
      if (!campo || !campo.value.trim()) {
        dictando = false;
        setTimeout(() => abrirEscucha(), 500);
      }
    };
    wakeRec.onerror = event => {
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(event.error)) {
        pararLlamada();
      }
    };

    try { wakeRec.start(); } catch (_e) { /* ya estaba en marcha */ }
  }

  // Espera a que Maya termine de hablar (o de leer) antes de devolver el turno
  // al micrófono. `hablandoSenal` cubre el TTS; el reloj de seguridad evita
  // quedarse esperando si el motor no avisa nunca de que ha terminado.
  function esperarFinVoz(alTerminar, maxMs = 30000) {
    const inicio = Date.now();
    const esperar = () => {
      if (!llamadaActiva) return;
      const hablando = hablandoSenal || Boolean(synth && (synth.speaking || synth.pending)) || Boolean(audioActual);
      if (!hablando || Date.now() - inicio > maxMs) {
        // Un respiro de medio segundo: el micro no debe capturar el final de la
        // última palabra ni el eco de la habitación.
        setTimeout(() => { if (llamadaActiva) alTerminar(); }, 550);
        return;
      }
      setTimeout(esperar, 180);
    };
    setTimeout(esperar, 250);
  }

  async function activarLlamada(opciones = {}) {
    const directo = opciones.directo === true;
    if (!canHear) { hint('Este navegador no permite escuchar. Escríbele a Maya.', 7000); return; }
    // El mismo gesto puede llegar por dos caminos (barra inferior y portada):
    // se queda con el primero y no se ponen dos micrófonos a competir.
    if (llamadaActiva) { pintarSenal(); return; }
    llamadaActiva = true;
    store.set(STORE_LLAMADA, '1');
    autoRead = true;
    store.set(STORE_READ, '1');
    setBotonLlamada(true);
    const auto = document.getElementById('vozAuto');
    if (auto) auto.setAttribute('aria-pressed', 'true');
    // Se muestra el estado ya y se pide la pantalla encendida dentro del toque:
    // el permiso del micrófono puede tardar y el usuario necesita saber que sí.
    pintarSenal();
    pedirPantallaEncendida();
    // Doble pulso suave: confirma que Maya ya escucha sin mirar la pantalla.
    vibrar([18, 80, 18]);
    ultimaVibracion = Date.now();
    // Con el saludo aún sonando, el micrófono espera su turno: si se abre antes,
    // Maya se oye a sí misma y manda su propia presentación como consulta.
    if (hablandoSenal) {
      esperarFinVoz(() => abrirEscucha(directo));
    } else {
      await abrirEscucha(directo);
    }
    pintarSenal();
    hint(directo ? 'Te escucho. Dime qué le pasa al coche.' : 'Maya está escuchando. Llámala por su nombre.', 5000);
  }

  function pararLlamada() {
    llamadaActiva = false;
    dictando = false;
    store.set(STORE_LLAMADA, '0');
    try { wakeRec?.abort?.(); } catch (_e) {}
    wakeRec = null;
    escuchando = false;
    mantenerPantalla(vistaPantalla);
    pintarSenal();
    setBotonLlamada(false);
    stopSpeaking();
    hint('Maya deja de escuchar.', 2500);
  }

  // Al entrar en el chat, Maya saluda y abre el micrófono sola. El saludo va
  // primero y el micro espera a que termine, para no oírse a sí misma.
  function abrirChatVoz() {
    const arrancar = () => {
      if (document.querySelector('.view.active')?.id !== 'view-chat') return;
      saludarMaya(true);
      if (canHear) activarLlamada({ directo: true });
    };
    arrancar();
    // La vista puede cambiar en otro listener del mismo clic: se reintenta una
    // sola vez, y el guardia de `activarLlamada` evita duplicar el micrófono.
    setTimeout(arrancar, 120);
  }

  function initLlamada() {
    añadirBotonLlamada();
    // Saludo y escucha al entrar en el chat, tanto por la barra inferior como
    // por el menú (que crea sus propios botones después): se escucha el clic en
    // cualquier botón que lleve al chat, aunque se añada más tarde.
    document.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('[data-view="chat"]')) abrirChatVoz();
    }, true);
    if (document.querySelector('.view.active')?.id === 'view-chat') {
      setTimeout(() => saludarMaya(true), 150);
    }
    if (store.get(STORE_LLAMADA) === '1') {
      // El micrófono necesita un gesto: se arranca al primer toque.
      const arranque = () => { document.removeEventListener('pointerdown', arranque); activarLlamada(); };
      document.addEventListener('pointerdown', arranque, { once: true });
      setBotonLlamada(true);
    }
  }

  function boot() {
    injectStyles();
    crearSenal();
    buildBar();
    addMicButton();
    initLlamada();
    // El micrófono pertenece al chat: al cambiar a GPS, tienda o garaje se
    // cierra. Si no, seguía grabando en segundo plano (batería, privacidad y
    // riesgo de mandar una conversación del taller como consulta).
    document.addEventListener('viewchange', event => {
      const vista = event.detail?.name || 'home';
      if (vista !== 'chat' && llamadaActiva) pararLlamada();
      mantenerPantalla(vista);
    });
    scanBubbles();
    const box = document.getElementById('chatBox');
    if (box) {
      new MutationObserver(mutations => {
        let added = false;
        mutations.forEach(m => m.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList?.contains('bubble')) {
            added = true;
            addReadButton(node, true);
          }
        }));
        // Sin volver a recorrer el historial: cada respuesta se lee una vez.
      }).observe(box, { childList: true, subtree: true });
    }
    // Chrome carga las voces de forma asíncrona: se refresca el idioma elegido.
    if (synth) {
      // La señal también refleja cuándo habla Maya: así se sabe sin mirar que
      // toca esperar y no hablar encima de ella.
      ['start', 'end', 'error'].forEach(ev => synth.addEventListener?.(ev, pintarSenal));
      synth.onvoiceschanged = () => pickSpanishVoice();
    }
    // Al volver a la app (o al desbloquear el móvil) se recupera la pantalla
    // encendida; el navegador la suelta sola cuando la pestaña se oculta.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        soltarPantallaEncendida();
        return;
      }
      mantenerPantalla(vistaPantalla);
      if (llamadaActiva) pintarSenal();
    });
    mantenerPantalla(document.querySelector('.view.active')?.id || 'home');
  }

  // Desde cualquier punto de la app: saludar y ponerse a escuchar. La portada
  // usa esto en "Preguntar" para que Maya arranque sola.
  window.MayaSaludo = (hablar = true) => saludarMaya(hablar);
  // Voz para el resto de la app (avisos de ruta, radares): usa el mismo motor
  // del sistema o la voz del servidor cuando el móvil no trae ninguna.
  window.MayaHablar = (texto = '') => hablarTexto(String(texto).slice(0, 300));
  // La portada pregunta y escucha la respuesta directamente (sin «Maya»).
  window.MayaEscuchar = () => activarLlamada({ directo: true });

  // Sin dictado: si algo llama aquí, se abre el teclado del chat.
  window.VozHablar = () => {
    const input = document.getElementById('chatInput');
    if (input) { input.focus(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
