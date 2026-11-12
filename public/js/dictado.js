(function () {
  'use strict';
  // Sin grabadora o sin micrófono se deja el dictado normal de voz.js.
  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') return;
  const $ = id => document.getElementById(id);
  let rec = null, chunks = [], stream = null, busy = false;
  function hint(msg) {
    const el = $('vozHint');
    if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(hint.t); hint.t = setTimeout(() => { el.hidden = true; }, 8000);
  }
  function setUi(on) {
    const b = $('vozMic'); if (b) { b.classList.toggle('listening', on); b.textContent = on ? '⏹' : '🎤'; }
    const m = document.querySelector('.mic-big');
    if (m) { m.classList.toggle('listening', on); m.querySelector('span').textContent = on ? 'Pulsa para parar' : 'Pulsa y habla'; }
    const i = $('chatInput'); if (i) i.placeholder = on ? 'Te escucho… habla y vuelve a pulsar' : 'Escribe o pulsa el micrófono…';
  }
  async function start() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      hint(denied ? 'Permiso de micrófono denegado. Actívalo en Ajustes › Aplicaciones › Permisos › Micrófono.' : 'No se pudo abrir el micrófono.');
      return;
    }
    chunks = [];
    const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
      setUi(false);
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size < 1200) { hint('No te he oído. Pulsa el micrófono y habla más cerca.'); return; }
      subir(blob);
    };
    rec.start();
    busy = true;
    setUi(true);
    hint('Grabando… habla normal y pulsa ⏹ al terminar.');
  }
  async function subir(blob) {
    const input = $('chatInput');
    hint('Entendiendo lo que has dicho…');
    try {
      const r = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': blob.type || 'audio/webm' },
        body: blob
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.text) {
        hint(r.status === 503 ? 'El dictado no está activado en el servidor. Escribe la consulta.' : 'No se pudo entender el audio. Prueba otra vez.');
        return;
      }
      input.value = data.text;
      hint('Te he entendido. Enviando…');
      document.getElementById('chatForm')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    } catch {
      hint('Sin conexión para transcribir. Escribe la consulta.');
    } finally {
      busy = false;
    }
  }
  function toggle() {
    if (busy && rec && rec.state === 'recording') { rec.stop(); return; }
    if (busy) return;
    start();
  }
  window.VozHablar = toggle;
  window.DictadoDisponible = true;
  document.addEventListener('click', event => {
    const el = event.target instanceof Element ? event.target.closest('#vozMic') : null;
    if (!el) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggle();
  }, true);
})();
