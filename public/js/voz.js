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

  const store = {
    get(key, fallback) {
      try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch { /* modo privado */ }
    }
  };

  let autoRead = store.get(STORE_READ, '0') === '1';
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
  const MALE_HINTS = /\b(jorge|diego|carlos|pablo|raul|raúl|miguel|juan|enrique|andres|andrés|antonio|manuel|alvaro|álvaro|gonzalo|sebastian|sebastián|ricardo|javier|pedro|luis|arturo|gerardo|hombre|male|masculin)\b/i;
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

  function stopSpeaking() {
    if (synth) synth.cancel();
    if (speakingBubble) {
      speakingBubble.classList.remove('voz-speaking');
      const btn = speakingBubble.querySelector('.voz-btn');
      if (btn) btn.setAttribute('aria-pressed', 'false');
      speakingBubble = null;
    }
  }

  function speak(bubble) {
    if (!canRead || !bubble) return;
    if (speakingBubble === bubble && synth.speaking) { stopSpeaking(); return; }
    stopSpeaking();
    const text = plainText(bubble);
    if (!text) return;

    const parts = text.match(/[\s\S]{1,220}(?:[.!?]|$)/g) || [text];
    const utter = new SpeechSynthesisUtterance(parts.join(' '));
    utter.lang = lang;
    const { voice, male } = pickSpanishVoice();
    utter.voice = voice || null;
    // Voz de hombre con seguridad: tono grave pero natural y ritmo algo vivo.
    // Un ritmo demasiado lento suena a robot y hace que la gente desconecte.
    utter.pitch = male ? 0.88 : 0.72;
    utter.rate = 1.06;
    utter.volume = 1;
    speakingBubble = bubble;
    bubble.classList.add('voz-speaking');
    const btn = bubble.querySelector('.voz-btn');
    if (btn) btn.setAttribute('aria-pressed', 'true');
    utter.onend = utter.onerror = () => {
      bubble.classList.remove('voz-speaking');
      if (btn) btn.setAttribute('aria-pressed', 'false');
      if (speakingBubble === bubble) speakingBubble = null;
    };
    synth.speak(utter);
  }

  // ---------------------------------------------------------------- botón leer

  function addReadButton(bubble) {
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

    if (autoRead) {
      const isHero = bubble.classList.contains('voz-no-auto');
      if (!isHero) setTimeout(() => speak(bubble), 250);
    }
  }

  function scanBubbles() {
    document.querySelectorAll('#chatBox .bubble.assistant').forEach(addReadButton);
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

  function addMicButton() {
    const form = document.getElementById('chatForm');
    const input = document.getElementById('chatInput');
    if (!form || !input || document.getElementById('vozMic')) return;
    const submit = form.querySelector('button[type="submit"]');

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'vozMic';
    btn.className = 'btn ghost voz-mic';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Hablar en vez de escribir');
    btn.title = 'Hablar en vez de escribir';
    btn.textContent = '🎤';
    btn.addEventListener('click', () => {
      if (listening && recognition) {
        try { recognition.stop(); } catch { /* ya parado */ }
        return;
      }
      startRecognition();
    });
    if (submit) form.insertBefore(btn, submit);
    else form.appendChild(btn);
  }

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
    `;
    document.head.appendChild(style);
  }

  function boot() {
    injectStyles();
    buildBar();
    addMicButton();
    scanBubbles();
    const box = document.getElementById('chatBox');
    if (box) {
      new MutationObserver(mutations => {
        let added = false;
        mutations.forEach(m => m.addedNodes.forEach(node => {
          if (node.nodeType === 1 && node.classList?.contains('bubble')) {
            added = true;
            addReadButton(node);
          }
        }));
        if (added) scanBubbles();
      }).observe(box, { childList: true, subtree: true });
    }
    // Chrome carga las voces de forma asíncrona: se refresca el idioma elegido.
    if (synth) synth.onvoiceschanged = () => pickSpanishVoice();
  }

  // La portada usa este botón para abrir el chat y dictar en un solo toque.
  window.VozHablar = () => {
    if (listening && recognition) {
      try { recognition.stop(); } catch { /* ya parado */ }
      return;
    }
    startRecognition();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
