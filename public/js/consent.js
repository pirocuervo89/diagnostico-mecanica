/**
 * Consentimiento de cookies.
 *
 * - Las cookies necesarias funcionan siempre; las demás no se cargan hasta que
 *   el usuario las acepta.
 * - La decisión se guarda en localStorage y se puede cambiar en cualquier momento
 *   con cualquier elemento que lleve [data-consent-open].
 * - API pública: window.dymConsent.has('embeds' | 'preferences' | 'analytics'),
 *   open(), allowEmbeds(), reset().
 */
(() => {
  const KEY = 'dym_consent_v1';
  const VERSION = 1;
  const defaults = () => ({ necessary: true, preferences: false, embeds: false, analytics: false, version: VERSION, date: null });
  let state = null;

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!raw || raw.version !== VERSION) return null;
      return { ...defaults(), ...raw, necessary: true };
    } catch {
      return null;
    }
  }

  function save(next) {
    state = { ...defaults(), ...next, necessary: true, version: VERSION, date: new Date().toISOString() };
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* modo privado: la decisión vale solo para esta visita */
    }
    document.documentElement.dataset.consent = state.embeds ? 'all' : 'necessary';
    window.dispatchEvent(new CustomEvent('dym:consent', { detail: { ...state } }));
    hideBar();
    return state;
  }

  state = read();
  if (!state) state = defaults();
  document.documentElement.dataset.consent = state.date ? (state.embeds ? 'all' : 'necessary') : 'pending';

  const has = category => Boolean(state?.[category]);
  const get = () => ({ ...state });

  // ---------------------------------------------------------------
  // Interfaz
  // ---------------------------------------------------------------
  const bar = document.createElement('div');
  bar.className = 'consent-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Aviso de cookies');
  bar.innerHTML = `
    <p><strong>Cookies.</strong> Usamos cookies necesarias para que la web funcione y, solo si lo aceptas,
    vídeos de YouTube. No hacemos publicidad ni analítica. Puedes cambiar tu decisión cuando quieras.
    <a href="/legal/cookies.html">Más información</a>.</p>
    <div class="consent-actions">
      <button class="consent-btn" type="button" data-consent="necessary">Solo necesarias</button>
      <button class="consent-btn" type="button" data-consent="configure">Configurar</button>
      <button class="consent-btn primary" type="button" data-consent="all">Aceptar todas</button>
    </div>`;

  const modal = document.createElement('div');
  modal.className = 'consent-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consentTitle">
      <h2 id="consentTitle">Preferencias de cookies</h2>
      <p>Elige qué quieres permitir. Las necesarias no se pueden desactivar porque sin ellas no funciona el inicio de sesión.</p>
      <div class="consent-row fixed">
        <div><h3>Necesarias</h3><p>Sesión del foro y garaje, y el recuerdo de esta misma decisión.</p></div>
        <span>Siempre activas</span>
      </div>
      <label class="consent-row">
        <div><h3>Preferencias</h3><p>Guarda tus tutoriales favoritos y el historial de vistos en este dispositivo.</p></div>
        <input type="checkbox" data-cat="preferences">
      </label>
      <label class="consent-row">
        <div><h3>Vídeos de YouTube</h3><p>Permite cargar los reproductores de los tutoriales. Hasta que lo actives, el vídeo no se descarga.</p></div>
        <input type="checkbox" data-cat="embeds">
      </label>
      <div class="consent-row fixed">
        <div><h3>Analítica y publicidad</h3><p>Ahora mismo no usamos ninguna herramienta de este tipo.</p></div>
        <span>No se usan</span>
      </div>
      <div class="consent-actions">
        <button class="consent-btn" type="button" data-consent="necessary">Solo necesarias</button>
        <button class="consent-btn primary" type="button" data-consent="save">Guardar preferencias</button>
      </div>
      <p class="consent-saved" hidden>Preferencias guardadas.</p>
    </div>`;

  function showBar() {
    if (!document.body.contains(bar)) document.body.appendChild(bar);
    bar.hidden = false;
    bar.style.display = '';
  }

  function hideBar() {
    bar.hidden = true;
    bar.style.display = 'none';
  }

  function open() {
    modal.querySelector('[data-cat="preferences"]').checked = has('preferences');
    modal.querySelector('[data-cat="embeds"]').checked = has('embeds');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('[data-consent="save"]')?.focus();
  }

  function close() {
    modal.hidden = true;
    document.body.style.overflow = '';
  }

  modal.addEventListener('click', event => {
    if (event.target === modal) close();
    const action = event.target.closest('[data-consent]')?.dataset.consent;
    if (!action) return;
    if (action === 'necessary') {
      save({ preferences: false, embeds: false, analytics: false });
      close();
    }
    if (action === 'save') {
      save({
        preferences: modal.querySelector('[data-cat="preferences"]').checked,
        embeds: modal.querySelector('[data-cat="embeds"]').checked,
        analytics: false
      });
      close();
    }
  });

  bar.addEventListener('click', event => {
    const action = event.target.closest('[data-consent]')?.dataset.consent;
    if (!action) return;
    if (action === 'all') save({ preferences: true, embeds: true, analytics: false });
    if (action === 'necessary') save({ preferences: false, embeds: false, analytics: false });
    if (action === 'configure') open();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) close();
  });

  document.addEventListener('click', event => {
    if (event.target.closest('[data-consent-open]')) {
      event.preventDefault();
      open();
    }
  });

  function mount() {
    if (!document.body.contains(modal)) document.body.appendChild(modal);
    if (!state.date) showBar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();

  window.dymConsent = {
    get,
    has,
    open,
    reset() {
      try { localStorage.removeItem(KEY); } catch { /* nada */ }
      state = defaults();
      showBar();
    },
    allowEmbeds() {
      save({ ...state, embeds: true });
    }
  };
})();
