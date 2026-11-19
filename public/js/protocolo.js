/* ==========================================================================
   protocolo.js — HUD de protocolo de diagnosis + efectos futuristas.
   - Sincroniza el HUD con #obdStatus y #obdSourceLabel mediante MutationObserver.
   - La secuencia "Simular" es una DEMO visual: no abre puertos ni lee la ECU.
   - Un único listener global de puntero para luz ambiental y tilt suave.
   - Respeta prefers-reduced-motion. Sin sonido. Sin canvas.
   ========================================================================== */
(function () {
  'use strict';
  if (window.__pdxProtocol) return;
  window.__pdxProtocol = true;

  var reduce = false;
  try {
    reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* navegador sin matchMedia */ }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  /* ---------------------------------------------------------------- *
   * Efectos globales: luz ambiental + tilt suave con UN listener.
   * ---------------------------------------------------------------- */
  function initPointerFx() {
    if (reduce) return;
    var fine = false;
    try { fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) { fine = false; }
    if (!fine) return;

    var ambient = document.createElement('div');
    ambient.id = 'pdxAmbient';
    ambient.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ambient);

    var SEL = '.pdx-hud, .panel, .nx-tile, .shop-card, .shop-special-card, .tp-card, .home-scanner, .btn, .nx-tile-btn';
    var raf = 0;
    var lastEvent = null;
    var current = null;

    function clearCurrent() {
      if (!current) return;
      current.classList.remove('pdx-lit');
      current.removeAttribute('data-pdx-axis');
      current.style.removeProperty('--pdx-rot');
      current = null;
    }

    function apply() {
      raf = 0;
      var e = lastEvent;
      if (!e) return;

      ambient.style.transform = 'translate3d(' + (e.clientX - 180) + 'px,' + (e.clientY - 180) + 'px,0)';

      var target = e.target && e.target.closest ? e.target.closest(SEL) : null;
      if (target !== current) {
        clearCurrent();
        current = target;
        if (current) current.classList.add('pdx-lit');
      }

      if (!target) {
        ambient.style.opacity = '0';
        return;
      }

      var r = target.getBoundingClientRect();
      if (!r.width || !r.height) return;

      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      var dominant = Math.abs(x) > Math.abs(y) ? x : y;
      var rot = Math.max(-1.6, Math.min(1.6, dominant * 3.2));

      ambient.style.opacity = '.6';
      target.setAttribute('data-pdx-axis', Math.abs(x) > Math.abs(y) ? 'y' : 'x');
      target.style.setProperty('--pdx-rot', rot.toFixed(2) + 'deg');
    }

    document.addEventListener('pointermove', function (e) {
      lastEvent = e;
      if (raf) return;
      raf = window.requestAnimationFrame(apply);
    }, { passive: true });
  }

  /* ---------------------------------------------------------------- *
   * Transición de vistas tipo warp.
   * ---------------------------------------------------------------- */
  function initWarp() {
    if (reduce) return;
    document.addEventListener('viewchange', function (e) {
      var name = e && e.detail && e.detail.name;
      var view = name ? document.getElementById('view-' + name) : null;
      if (!view) return;
      document.querySelectorAll('.view.pdx-warp').forEach(function (el) {
        if (el !== view) el.classList.remove('pdx-warp');
      });
      view.classList.remove('pdx-warp');
      /* Fuerza un reflow para reiniciar la animación al volver a la vista. */
      void view.offsetWidth;
      view.classList.add('pdx-warp');
    });
  }

  /* ---------------------------------------------------------------- *
   * HUD de protocolo.
   * ---------------------------------------------------------------- */
  function initHud() {
    var hud = document.getElementById('pdxHud');
    if (!hud) return;

    var statusEl = document.getElementById('obdStatus');
    var sourceEl = document.getElementById('obdSourceLabel');
    var liveEl = document.getElementById('pdxLiveState');
    var liveText = document.getElementById('pdxLiveStateText');
    var sourceText = document.getElementById('pdxSourceText');
    var badge = document.getElementById('pdxDemoBadge');
    var demoBtn = document.getElementById('pdxDemoBtn');
    var trace = document.getElementById('pdxTrace');
    var traceMode = document.getElementById('pdxTraceMode');
    var steps = Array.prototype.slice.call(hud.querySelectorAll('.pdx-step'));
    var nodes = Array.prototype.slice.call(hud.querySelectorAll('.pdx-node'));
    var chips = Array.prototype.slice.call(hud.querySelectorAll('.pdx-chip'));

    if (!liveEl || !liveText || !sourceText || !trace) return;

    var TRACE_MAX = 40;
    var traceLines = trace.textContent.trim() ? trace.textContent.split('\n') : [];
    var demoTimers = [];
    var demoRunning = false;
    var lastSig = '';
    var lastState = '';
    var lastText = '';
    var lastSource = '';

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function stamp() {
      var d = new Date();
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    function log(kind, message) {
      traceLines.push('[' + stamp() + '] ' + kind + ' · ' + message);
      if (traceLines.length > TRACE_MAX) traceLines.shift();
      trace.textContent = traceLines.join('\n');
      trace.scrollTop = trace.scrollHeight;
    }

    function setLive(state, text, source) {
      liveEl.dataset.state = state;
      liveText.textContent = text;
      sourceText.textContent = source ? 'Fuente: ' + source : 'Panel OBD sin conexión';
    }

    function setStep(index, mode) {
      var el = steps[index];
      if (!el) return;
      var small = el.querySelector('small');
      el.classList.toggle('is-active', mode === 'active');
      el.classList.toggle('is-done', mode === 'done');
      if (small) small.textContent = mode === 'done' ? 'OK' : (mode === 'active' ? 'En curso' : 'Espera');
    }

    function resetSteps() {
      steps.forEach(function (_, i) { setStep(i, ''); });
    }

    function setNodes(list) {
      nodes.forEach(function (node) {
        node.classList.toggle('is-live', list.indexOf(node.getAttribute('data-node')) > -1);
      });
    }

    function clearDemoTimers() {
      demoTimers.forEach(function (id) { window.clearTimeout(id); });
      demoTimers = [];
    }

    function stopDemo() {
      clearDemoTimers();
      demoRunning = false;
      hud.removeAttribute('data-mode');
      if (badge) badge.hidden = true;
      setNodes([]);
      resetSteps();
      if (demoBtn) {
        demoBtn.disabled = false;
        demoBtn.textContent = 'Simular secuencia';
      }
    }

    function startDemo() {
      if (demoRunning) return;
      var state = statusEl ? statusEl.dataset.state : 'disconnected';
      if (state === 'connected' || state === 'reading' || state === 'connecting') return;

      demoRunning = true;
      clearDemoTimers();
      traceLines = [];
      trace.textContent = '';
      resetSteps();
      setNodes([]);
      hud.setAttribute('data-mode', 'demo');
      if (badge) badge.hidden = false;
      if (traceMode) traceMode.textContent = 'DEMO · EN CURSO';
      if (demoBtn) {
        demoBtn.disabled = true;
        demoBtn.textContent = 'Simulando…';
      }
      setLive('demo', 'DEMO · SECUENCIA VISUAL', 'Sin adaptador · solo animación del HUD');
      log('DEMO', 'Inicio de la secuencia visual. No se abre ningún puerto ni se contacta con la ECU.');

      var plan = [
        { at: 0, step: 0, msg: 'Enlace: canal representado en el HUD.' },
        { at: 800, step: 1, msg: 'Handshake: intercambio simulado, sin adaptador.' },
        { at: 1600, step: 2, msg: 'Negociación: CAN 11 bits · 500 kbit/s representado.' },
        { at: 2500, step: 3, msg: 'ECU: nodo motor iluminado en el radar.' },
        { at: 3400, step: 4, msg: 'DTC: consulta representada; no se lee ningún código.' }
      ];

      plan.forEach(function (item) {
        demoTimers.push(window.setTimeout(function () {
          if (!demoRunning) return;
          steps.forEach(function (_, i) {
            if (i < item.step) setStep(i, 'done');
            else if (i > item.step) setStep(i, '');
          });
          setStep(item.step, 'active');
          if (item.step === 3) setNodes(['ECU']);
          if (item.step === 4) setNodes(['ECU', 'ABS', 'SRS', 'TCU']);
          log('DEMO', item.msg);
        }, 300 + item.at));
      });

      demoTimers.push(window.setTimeout(function () {
        if (!demoRunning) return;
        steps.forEach(function (_, i) { setStep(i, 'done'); });
        if (traceMode) traceMode.textContent = 'DEMO · FIN';
        setLive('demo', 'DEMO · SECUENCIA COMPLETA', 'Sin adaptador · solo animación del HUD');
        log('DEMO', 'Demo completada. Ningún dato real de la ECU.');
        demoRunning = false;
        if (demoBtn) {
          demoBtn.disabled = false;
          demoBtn.textContent = 'Repetir demo';
        }
      }, 300 + 4300));
    }

    function applyRealSteps(state) {
      resetSteps();
      if (state === 'connecting') {
        setStep(0, 'active');
      } else if (state === 'connected') {
        setStep(0, 'done');
        setStep(1, 'done');
        setStep(2, 'done');
        setStep(3, 'active');
      } else if (state === 'reading') {
        setStep(0, 'done');
        setStep(1, 'done');
        setStep(2, 'done');
        setStep(3, 'done');
        setStep(4, 'active');
      }
    }

    function liveStateFor(state) {
      if (state === 'connected') return 'ok';
      if (state === 'connecting' || state === 'reading') return 'busy';
      if (state === 'error') return 'error';
      return 'offline';
    }

    /* Copia el estado real del panel OBD. Guarda los valores previos antes de
       actualizarlos para no inventar líneas de traza. */
    function syncFromPanel(force) {
      if (!statusEl && !sourceEl) return;

      var state = statusEl ? (statusEl.dataset.state || 'disconnected') : 'disconnected';
      var statusText = statusEl ? (statusEl.textContent || '').trim() : 'SIN CONEXIÓN';
      var source = sourceEl ? (sourceEl.textContent || '').trim() : '';
      var sig = state + '|' + statusText + '|' + source;

      if (!force && sig === lastSig) return;

      var first = !lastSig;
      var prevState = lastState;
      var prevText = lastText;
      var prevSource = lastSource;

      lastSig = sig;
      lastState = state;
      lastText = statusText;
      lastSource = source;

      if (demoRunning || hud.hasAttribute('data-mode')) stopDemo();

      setLive(liveStateFor(state), statusText || 'SIN CONEXIÓN', source);
      applyRealSteps(state);

      if (traceMode) traceMode.textContent = (state === 'disconnected' || state === 'error') ? 'EN ESPERA' : 'REAL · SINCRONIZADO';
      if (demoBtn) {
        var busy = state === 'connected' || state === 'reading' || state === 'connecting';
        demoBtn.disabled = busy;
        demoBtn.textContent = 'Simular secuencia';
        demoBtn.title = busy
          ? 'Hay una conexión OBD activa. Desconecta para ver la demo del HUD.'
          : 'Anima la secuencia del HUD. No conecta con la ECU.';
      }

      if (first) return;
      if (statusText !== prevText || state !== prevState) {
        log(state === 'error' ? 'ERROR' : 'OBD', statusText || state);
      }
      if (source !== prevSource) {
        log('FUENTE', source || 'SIN CONEXIÓN');
      }
    }

    if (demoBtn) demoBtn.addEventListener('click', startDemo);

    /* Chips de protocolo: reflejan la selección real de #obdProtocol. */
    var protocolSelect = document.getElementById('obdProtocol');
    function paintChips() {
      var code = protocolSelect ? protocolSelect.value : '';
      chips.forEach(function (chip) {
        var codes = (chip.getAttribute('data-proto') || '').split(' ');
        var on = !!code && codes.indexOf(code) > -1;
        chip.classList.toggle('is-on', on);
        if (on) chip.setAttribute('aria-current', 'true');
        else chip.removeAttribute('aria-current');
      });
    }
    paintChips();
    if (protocolSelect) protocolSelect.addEventListener('change', paintChips);

    /* Observa el panel OBD real, sin escribir en él. */
    if ('MutationObserver' in window) {
      var observer = new MutationObserver(function () { syncFromPanel(false); });
      [statusEl, sourceEl].forEach(function (el) {
        if (!el) return;
        observer.observe(el, {
          attributes: true,
          attributeFilter: ['data-state'],
          childList: true,
          characterData: true,
          subtree: true
        });
      });
    }

    syncFromPanel(true);
  }

  ready(function () {
    initPointerFx();
    initWarp();
    initHud();
  });
})();
