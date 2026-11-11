/**
 * Diagnóstico del scroll táctil.
 *
 * No se activa solo: hay que pedirlo.
 *  - En Chrome: añadir `?debugscroll=1` a la URL.
 *  - Dentro de la app instalada (TWA), sin barra de direcciones: mantener
 *    pulsado el logo de la barra superior 1,5 s.
 *
 * Muestra en pantalla qué elemento recibe el dedo donde empieza el gesto, su
 * touch-action, su overflow y si el documento se mueve. Sirve para saber si el
 * gesto muere en una capa concreta o si simplemente la página no tiene scroll.
 * Se cierra con la ✕. No envía nada a ningún sitio y no altera el diseño.
 */
(() => {
  const forced = /[?&]debugscroll=1/.test(location.search);
  let panel = null;
  let active = false;
  let lastTouch = null;
  let scrolled = 0;

  const label = el => {
    if (!el || el === document) return 'document';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
      : '';
    return el.tagName.toLowerCase() + id + cls;
  };

  const describe = el => {
    if (!el || el === document || el === window) return 'viewport';
    const s = getComputedStyle(el);
    return `${label(el)} [ta:${s.touchAction} ov:${s.overflowY} pos:${s.position} z:${s.zIndex}]`;
  };

  function build() {
    panel = document.createElement('div');
    panel.id = 'scrollDebug';
    panel.setAttribute('role', 'status');
    panel.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:2147483000',
      'max-height:46vh', 'overflow:auto', 'pointer-events:auto',
      'background:rgba(3,3,12,.94)', 'color:#d8e2ea',
      'font:11px/1.45 ui-monospace,Menlo,Consolas,monospace',
      'padding:10px 34px 12px 10px', 'border-top:1px solid #22d3ee',
      'white-space:pre-wrap', 'word-break:break-word'
    ].join(';');

    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Cerrar diagnóstico');
    close.style.cssText = 'position:absolute;top:4px;right:6px;background:none;border:0;color:#22d3ee;font-size:18px;padding:6px;cursor:pointer';
    close.addEventListener('click', () => toggle(false));

    const out = document.createElement('div');
    out.id = 'scrollDebugOut';
    panel.append(close, out);
    document.body.appendChild(panel);
    render();
  }

  function render(text) {
    const out = panel && panel.querySelector('#scrollDebugOut');
    if (!out) return;
    const scroller = document.scrollingElement || document.documentElement;
    const room = scroller.scrollHeight - scroller.clientHeight;
    const head = [
      `scroll: ${Math.round(scroller.scrollTop)} / ${Math.max(0, room)} px   gestos: ${scrolled}`,
      `viewport: ${innerWidth}x${innerHeight}   scrollHeight: ${scroller.scrollHeight}`,
      `html ov:${getComputedStyle(document.documentElement).overflowY}  body ov:${getComputedStyle(document.body).overflowY}  body.overflow:${document.body.style.overflow || '—'}`,
      room <= 2 ? '⚠ Este documento NO tiene recorrido: el problema es de altura, no de gesto.' : ''
    ].filter(Boolean).join('\n');
    out.textContent = text || head + '\n\nArrastra el dedo por la zona que falla.';
  }

  function dump(el, x, y) {
    const chain = [];
    let node = el;
    while (node && node !== document.body && chain.length < 3) {
      chain.push('  ' + describe(node));
      node = node.parentElement;
    }
    const stack = (document.elementsFromPoint?.(x, y) || [])
      .slice(0, 4)
      .map(describe);

    const scroller = document.scrollingElement || document.documentElement;
    render([
      `dedo en: ${describe(el)}`,
      'padres:',
      ...chain,
      'capas en ese punto (arriba → abajo):',
      ...stack.map(line => '  ' + line),
      '',
      `scrollTop: ${Math.round(scroller.scrollTop)}  recorrido: ${Math.max(0, scroller.scrollHeight - scroller.clientHeight)} px  gestos: ${scrolled}`,
      lastTouch ? `último gesto: Δy ${Math.round(lastTouch.dy)} px` : ''
    ].filter(Boolean).join('\n'));
  }

  const root = () => document.scrollingElement || document.documentElement;

  function onTouchStart(event) {
    if (!active) return;
    const t = event.touches && event.touches[0];
    if (!t) return;
    lastTouch = { x: t.clientX, y: t.clientY, dy: 0 };
    requestAnimationFrame(() => dump(event.target, t.clientX, t.clientY));
  }

  function onTouchMove(event) {
    if (!active || !lastTouch) return;
    const t = event.touches && event.touches[0];
    if (!t) return;
    lastTouch.dy = t.clientY - lastTouch.y;
  }

  function onTouchEnd() {
    if (!active) return;
    scrolled += 1;
    render();
  }

  function toggle(on = !active) {
    active = on;
    if (active && !panel) build();
    if (panel) panel.hidden = !active;
    if (active) render();
  }

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('scroll', () => { if (active) render(); }, { capture: true, passive: true });

  // En la app instalada no hay barra de direcciones: pulsación larga en la
  // barra superior, sin mover el dedo, para abrir y cerrar el diagnóstico.
  let holdTimer = null;
  let hold = null;
  document.addEventListener('pointerdown', event => {
    if (!event.target.closest || !event.target.closest('.topbar')) return;
    hold = { x: event.clientX, y: event.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => { holdTimer = null; toggle(); }, 1500);
  }, { passive: true });
  document.addEventListener('pointermove', event => {
    if (!holdTimer || !hold) return;
    if (Math.abs(event.clientX - hold.x) > 10 || Math.abs(event.clientY - hold.y) > 10) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }, { passive: true });
  const cancelHold = () => { clearTimeout(holdTimer); holdTimer = null; hold = null; };
  document.addEventListener('pointerup', cancelHold, { passive: true });
  document.addEventListener('pointercancel', cancelHold, { passive: true });

  if (forced) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => toggle(true));
    else toggle(true);
  }
})();
