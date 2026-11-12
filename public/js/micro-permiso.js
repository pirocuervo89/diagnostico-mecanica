(function () {
  'use strict';

  const canRequest = Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  let granted = false;
  let asking = false;
  let panel = null;

  // Hay navegadores que no pueden usar el micrófono en webs: DuckDuckGo en
  // Android va sobre WebView y no lo permite, por muchos permisos que se den.
  // En esos casos lo mejor es ofrecer Chrome o la app en un solo toque.
  const UA = navigator.userAgent || '';
  const isAndroid = /Android/i.test(UA);
  const isDuckDuckGo = /DuckDuckGo/i.test(UA);
  const isSamsung = /SamsungBrowser/i.test(UA);
  const isFirefox = /Firefox|FxiOS/i.test(UA);
  const isRealChrome = /Chrome\//.test(UA) && !isDuckDuckGo && !isSamsung && !isFirefox && !/OPR|EdgA|Edg\//i.test(UA);
  const browserName = isDuckDuckGo ? 'DuckDuckGo' : isSamsung ? 'Samsung Internet' : isFirefox ? 'Firefox' : isRealChrome ? 'Chrome' : 'Este navegador';

  function openInChrome() {
    const url = new URL(window.location.href);
    if (!isAndroid) { window.open(url.href, '_blank'); return; }
    const fallback = encodeURIComponent(url.href);
    window.location.href = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
  }

  function injectStyles() {
    if (document.getElementById('micPermissionStyles')) return;
    const style = document.createElement('style');
    style.id = 'micPermissionStyles';
    style.textContent = `
      .mic-permission {
        display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
        gap: 12px; margin: 0 0 10px; padding: 13px 14px;
        border: 1px solid rgba(245, 165, 36, .48);
        background: linear-gradient(135deg, rgba(245, 165, 36, .14), rgba(245, 165, 36, .04));
        color: #f8e7c4;
      }
      .mic-permission[hidden] { display: none; }
      .mic-permission-copy { min-width: 200px; flex: 1 1 260px; }
      .mic-permission-copy b { display: block; margin-bottom: 3px; color: #ffd58a; font-size: 13px; }
      .mic-permission-copy p { margin: 0; font-size: 12.5px; line-height: 1.5; }
      .mic-permission-copy small { display: block; margin-top: 4px; color: #c9b98f; font-size: 11px; }
      .mic-permission-actions { display: flex; flex-wrap: wrap; gap: 7px; }
      .mic-permission-actions .btn { min-height: 40px; }
      .mic-permission-actions .btn[hidden] { display: none !important; }
      @media (max-width: 560px) {
        .mic-permission { align-items: stretch; flex-direction: column; }
        .mic-permission-actions { display: grid; grid-template-columns: 1fr 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function setHint(message, ms = 5000) {
    const el = document.getElementById('vozHint');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(setHint._timer);
    setHint._timer = setTimeout(() => { el.hidden = true; }, ms);
  }

  function ensurePanel() {
    if (panel) return panel;
    const form = document.getElementById('chatForm');
    if (!form || !form.parentNode) return null;
    panel = document.createElement('div');
    panel.id = 'micPermission';
    panel.className = 'mic-permission';
    panel.hidden = true;
    panel.setAttribute('role', 'status');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML = `
      <div class="mic-permission-copy">
        <b data-mic-title>Micrófono desactivado</b>
        <p data-mic-text>Para dictar tienes que dar permiso al micrófono.</p>
        <small>El dictado lo procesa Chrome; la web no guarda ni envía el audio.</small>
      </div>
      <div class="mic-permission-actions">
        <button type="button" class="btn primary sm" data-mic-activate>Activar micrófono</button>
        <button type="button" class="btn primary sm" data-mic-chrome hidden>Abrir en Chrome</button>
        <button type="button" class="btn ghost sm" data-mic-close>Escribiré la consulta</button>
      </div>
    `;
    form.parentNode.insertBefore(panel, form);
    panel.querySelector('[data-mic-activate]').addEventListener('click', () => requestMic());
    panel.querySelector('[data-mic-chrome]').addEventListener('click', openInChrome);
    panel.querySelector('[data-mic-close]').addEventListener('click', hidePanel);
    return panel;
  }

  function showPanel(kind) {
    const box = ensurePanel();
    if (!box) return;
    const denied = kind === 'denied';
    const unsupported = kind === 'unsupported';
    const title = box.querySelector('[data-mic-title]');
    const text = box.querySelector('[data-mic-text]');
    const chromeBtn = box.querySelector('[data-mic-chrome]');
    const activateBtn = box.querySelector('[data-mic-activate]');
    // Sin soporte (DuckDuckGo, WebView...) o con el permiso bloqueado fuera de
    // Chrome, el camino corto es abrir la misma página en Chrome.
    const offerChrome = isAndroid && !isRealChrome;
    if (chromeBtn) chromeBtn.hidden = !offerChrome;
    if (activateBtn) activateBtn.hidden = unsupported;
    title.textContent = unsupported ? 'Aquí el micrófono no funciona' : denied ? 'Micrófono bloqueado' : 'No se pudo activar el micrófono';
    text.innerHTML = unsupported
      ? (offerChrome
        ? `<b>${browserName}</b> no deja usar el micrófono en las webs, aunque des todos los permisos. Pulsa <b>Abrir en Chrome</b> (o entra en la app) y el dictado funciona igual, con tu misma cuenta.`
        : 'Este navegador no permite dictar. Abre la web en Chrome para usar el micrófono.')
      : denied
        ? (offerChrome
          ? `El micrófono está bloqueado en <b>${browserName}</b>. Lo más rápido es pulsar <b>Abrir en Chrome</b>. Si prefieres seguir aquí, revisa los permisos del micrófono en los ajustes del navegador.`
          : 'Pulsa <b>Activar micrófono</b> y acepta el aviso. Si antes lo bloqueaste, entra en el candado junto a la dirección (o Ajustes › Aplicaciones › Chrome › Permisos) y activa <b>Micrófono</b>.')
        : 'Comprueba que el teléfono tenga micrófono y que otra aplicación no lo esté usando. Después pulsa <b>Activar micrófono</b>.';
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hidePanel() {
    if (panel) panel.hidden = true;
  }

  async function requestMic() {
    if (!canRequest) { showPanel('unsupported'); return false; }
    if (asking) return false;
    asking = true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      granted = true;
      hidePanel();
      setHint('Micrófono activado. Habla ahora.', 6000);
      return true;
    } catch (error) {
      granted = false;
      const denied = error && (error.name === 'NotAllowedError' || error.name === 'SecurityError');
      showPanel(denied ? 'denied' : 'error');
      return false;
    } finally {
      asking = false;
    }
  }

  function watchVoiceHint() {
    const hint = document.getElementById('vozHint');
    if (!hint) { setTimeout(watchVoiceHint, 400); return; }
    new MutationObserver(() => {
      if (!hint.hidden && /(permiso.*micr[oó]fono|micr[oó]fono.*permiso|not-allowed|bloquead)/i.test(hint.textContent || '')) {
        showPanel('denied');
      }
    }).observe(hint, { childList: true, characterData: true, subtree: true });
  }

  async function boot() {
    injectStyles();
    ensurePanel();
    watchVoiceHint();
    if (!canRequest) {
      showPanel('unsupported');
      return;
    }
    try {
      const status = await navigator.permissions?.query?.({ name: 'microphone' });
      if (status?.state === 'granted') granted = true;
      // No se avisa antes de pulsar: el panel sale solo si el permiso falla al
      // intentar grabar, para no asustar con un "bloqueado" prematuro.
    } catch { /* Permission API no disponible: se pedirá al pulsar. */ }
  }

  // El dictado (voz.js) pide el permiso y arranca en el mismo toque. Aquí solo
  // se muestra el panel de ayuda cuando el navegador lo tiene bloqueado.

  // La portada llama aquí cuando el navegador no puede grabar: así el usuario
  // ve el motivo y el botón en vez de un micrófono que no hace nada.
  window.AvisoMicro = () => showPanel(canRequest ? 'denied' : 'unsupported');

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
