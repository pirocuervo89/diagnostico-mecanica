/**
 * Maya · aviso de incidencia.
 *
 * Cuando el coche avisa (códigos DTC leídos por el OBD o un testigo del cuadro),
 * sale un panel compacto tipo chat donde Maya explica la avería por escrito y en
 * voz alta, con enlaces directos a la ficha del DTC, los tutoriales y los
 * productos. Es autónomo: si algo falla, no toca el resto de la app.
 */
(function () {
  'use strict';

  const STORE_VISTOS = 'dm_maya_inc_vistos';
  const PANEL_ID = 'mayaIncidente';

  let panel = null;
  let ultimaFirma = '';
  let ocupado = false;

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function leerVistos() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_VISTOS) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_e) { return []; }
  }

  function guardarVistos(lista) {
    try { localStorage.setItem(STORE_VISTOS, JSON.stringify(lista.slice(-60))); } catch (_e) { /* sin espacio */ }
  }

  function vozActiva() {
    try { return (localStorage.getItem('dm_voz_leer') ?? '1') === '1'; } catch (_e) { return true; }
  }

  // Resumen hablado: el aviso y lo que hay que hacer, no el informe entero.
  function resumenHablado(texto) {
    const plano = String(texto || '')
      .replace(/[*_`#>|]/g, ' ')
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return plano.length > 320 ? `${plano.slice(0, 317).trim()}…` : plano;
  }

  function hablar(texto) {
    if (!vozActiva()) return;
    if (!('speechSynthesis' in window)) return;
    try {
      speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(resumenHablado(texto));
      utter.lang = 'es-ES';
      utter.rate = 1.02;
      utter.pitch = 0.95;
      const voces = speechSynthesis.getVoices().filter(v => /^es/i.test(v.lang || ''));
      if (voces.length) utter.voice = voces.find(v => /^es[-_]es/i.test(v.lang || '')) || voces[0];
      speechSynthesis.speak(utter);
    } catch (_e) { /* sin voz */ }
  }

  function vehiculoContexto() {
    try {
      if (typeof currentVehicle !== 'undefined' && currentVehicle) {
        return {
          vehicleId: currentVehicle.id || '',
          brand: currentVehicle.brand || '',
          model: currentVehicle.model || '',
          engine: currentVehicle.engine || ''
        };
      }
    } catch (_e) { /* nada */ }
    return {};
  }

  function montarPanel() {
    if (panel) return panel;
    panel = document.createElement('aside');
    panel.id = PANEL_ID;
    panel.className = 'maya-inc';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-live', 'polite');
    panel.setAttribute('aria-label', 'Aviso de Maya sobre el coche');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="maya-inc-head">
        <span class="maya-inc-avatar" aria-hidden="true">M</span>
        <div>
          <b>Maya · aviso del coche</b>
          <small>Te lo explico aquí y en voz alta</small>
        </div>
        <button type="button" class="maya-inc-close" aria-label="Cerrar aviso">✕</button>
      </div>
      <div class="maya-inc-body"></div>
      <div class="maya-inc-actions"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('.maya-inc-close')?.addEventListener('click', ocultar);
    return panel;
  }

  function ocultar() {
    if (panel) panel.hidden = true;
    try { speechSynthesis.cancel(); } catch (_e) { /* nada */ }
  }

  function accion(etiqueta, handler) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'maya-inc-btn';
    btn.textContent = etiqueta;
    btn.addEventListener('click', handler);
    return btn;
  }

  function abrirVista(nombre) {
    try { showView(nombre); } catch (_e) {
      document.querySelector(`[data-view="${nombre}"]`)?.click();
    }
  }

  function render(datos) {
    const el = montarPanel();
    const body = el.querySelector('.maya-inc-body');
    const actions = el.querySelector('.maya-inc-actions');
    const dtcs = Array.isArray(datos.dtcs) ? datos.dtcs.filter(Boolean) : [];
    const titulo = datos.titulo || (dtcs.length ? `Avería detectada: ${dtcs.join(', ')}` : 'Aviso del coche');

    body.innerHTML = `
      <p class="maya-inc-title">${esc(titulo)}</p>
      ${dtcs.length ? `<div class="maya-inc-chips">${dtcs.slice(0, 6).map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
      <div class="maya-inc-text">${datos.html || `<p>${esc(datos.texto || 'Estoy revisando el aviso…')}</p>`}</div>
    `;

    actions.innerHTML = '';
    if (dtcs.length) {
      actions.appendChild(accion('Ver la avería', () => {
        abrirVista('dtc');
        setTimeout(() => {
          const input = document.getElementById('dtcSearch') || document.getElementById('dtcQuery');
          if (input) {
            input.value = dtcs[0];
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }, 350);
      }));
    }
    if (!dtcs.length && /testigo/i.test(titulo)) {
      actions.appendChild(accion('Ver el testigo', () => abrirVista('testigos')));
    }
    if (Array.isArray(datos.tutorials) && datos.tutorials.length) {
      actions.appendChild(accion('Tutoriales', () => abrirVista('tutoriales')));
    }
    if (Array.isArray(datos.productos) && datos.productos.length) {
      actions.appendChild(accion('Ver productos', () => abrirVista('productos')));
    }
    actions.appendChild(accion('Hablar con Maya', () => {
      abrirVista('chat');
      ocultar();
    }));
    actions.appendChild(accion('🔊 Escuchar', () => hablar(datos.texto || '')));

    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('visible'));
  }

  async function pedirExplicacion({ dtcs, titulo }) {
    const mensaje = dtcs && dtcs.length
      ? `El coche ha dado estos códigos de avería: ${dtcs.join(', ')}. Explícame qué significan, si puedo seguir circulando y qué debo comprobar primero.`
      : `Se ha encendido un testigo en el cuadro: ${titulo || 'testigo de avería'}. Explícame qué significa y qué hago.`;
    const payload = {
      message: mensaje,
      context: { ...vehiculoContexto(), dtcs: dtcs || [], gps: window.Ruta?.estado?.() || null },
      history: []
    };
    const res = await fetch('/api/chat/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`chat ${res.status}`);
    return res.json();
  }

  async function mostrar(datos = {}) {
    if (ocupado) return;
    const dtcs = Array.isArray(datos.dtcs) ? datos.dtcs.filter(c => /^[PCBU]\d{4}$/i.test(String(c))).slice(0, 6) : [];
    const titulo = String(datos.titulo || '').trim();
    if (!dtcs.length && !titulo) return;

    const firma = `${dtcs.join(',')}|${titulo}`;
    const vistos = leerVistos();
    if (datos.forzar !== true && (firma === ultimaFirma || vistos.includes(firma))) return;
    ultimaFirma = firma;

    ocupado = true;
    render({ dtcs, titulo, texto: 'Estoy revisando el aviso con la ficha del coche…' });
    try {
      const res = await pedirExplicacion({ dtcs, titulo });
      const texto = String(res.reply || '').trim();
      const html = window.formatMarkdown ? formatMarkdown(texto) : `<p>${esc(texto)}</p>`;
      render({
        dtcs,
        titulo: titulo || (dtcs.length ? `Avería detectada: ${dtcs.join(', ')}` : 'Aviso del coche'),
        texto,
        html,
        tutorials: res.tutorials || [],
        productos: res.productos_recomendados || []
      });
      hablar(texto);
      guardarVistos([...vistos, firma]);
    } catch (_e) {
      render({
        dtcs,
        titulo: titulo || 'Aviso del coche',
        texto: 'No he podido conectar con el servidor para explicarte la avería. Abre el chat y pregúntame cuando tengas conexión.'
      });
    } finally {
      ocupado = false;
    }
  }

  // Códigos nuevos del OBD: solo se avisa de lo que no se había visto antes.
  window.addEventListener('obd:dtcs', event => {
    const detalle = event?.detail || {};
    const dtcs = Array.isArray(detalle.dtcs) ? detalle.dtcs : [];
    if (!dtcs.length) return;
    const vistos = leerVistos();
    const nuevos = dtcs.filter(c => !vistos.includes(`${c}|`));
    const firma = `${dtcs.join(',')}|`;
    if (!nuevos.length && firma === ultimaFirma) return;
    mostrar({ dtcs, forzar: false });
  });

  window.MayaIncidente = { mostrar, ocultar };

  // Estilos propios: no dependen de las hojas compartidas.
  const style = document.createElement('style');
  style.textContent = `
    .maya-inc {
      position: fixed; left: 10px; right: 10px; bottom: calc(84px + env(safe-area-inset-bottom, 0px));
      z-index: 9995; max-width: 430px; margin: 0 auto;
      background: rgba(10, 14, 22, .97); color: #eaf1ff;
      border: 1px solid rgba(148, 172, 208, .28); border-radius: 18px;
      box-shadow: 0 28px 70px -30px rgba(0, 0, 0, .95), 0 0 0 1px rgba(56, 225, 255, .06) inset;
      backdrop-filter: blur(16px) saturate(130%); -webkit-backdrop-filter: blur(16px) saturate(130%);
      overflow: hidden; opacity: 0; transform: translateY(14px);
      transition: opacity .22s ease, transform .22s ease;
    }
    .maya-inc.visible { opacity: 1; transform: translateY(0); }
    .maya-inc[hidden] { display: none; }
    .maya-inc-head { display: flex; align-items: center; gap: 10px; padding: 11px 12px;
      background: linear-gradient(120deg, rgba(56, 225, 255, .14), rgba(139, 92, 246, .12));
      border-bottom: 1px solid rgba(148, 172, 208, .16); }
    .maya-inc-avatar { width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%;
      display: grid; place-items: center; font-weight: 800; font-size: 13px; color: #04121c;
      background: radial-gradient(circle at 35% 30%, #d9fbff, #38e1ff 60%, #1d7dff); }
    .maya-inc-head b { display: block; font-size: 13px; letter-spacing: .01em; }
    .maya-inc-head small { display: block; font-size: 10.5px; color: #9fb0c8; }
    .maya-inc-close { margin-left: auto; width: 30px; height: 30px; border-radius: 9px;
      border: 1px solid rgba(148, 172, 208, .24); background: rgba(148, 172, 208, .08);
      color: inherit; font: inherit; cursor: pointer; }
    .maya-inc-body { padding: 11px 13px 4px; max-height: min(42vh, 300px); overflow-y: auto; }
    .maya-inc-title { margin: 0 0 7px; font-size: 13.5px; font-weight: 700; color: #ffe0a3; }
    .maya-inc-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
    .maya-inc-chips span { padding: 2px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 700;
      color: #04121c; background: linear-gradient(120deg, #ffd166, #ff9f6b); }
    .maya-inc-text { font-size: 12.8px; line-height: 1.5; color: #dfe8f6; }
    .maya-inc-text p { margin: 0 0 8px; }
    .maya-inc-text ul, .maya-inc-text ol { margin: 0 0 8px; padding-left: 18px; }
    .maya-inc-text b { color: #eaf6ff; }
    .maya-inc-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 9px 12px 12px;
      border-top: 1px solid rgba(148, 172, 208, .12); }
    .maya-inc-btn { min-height: 32px; padding: 6px 11px; border-radius: 999px; font: inherit;
      font-size: 11.5px; font-weight: 600; cursor: pointer; color: #bff0ff;
      border: 1px solid rgba(56, 225, 255, .32); background: rgba(56, 225, 255, .09); }
    .maya-inc-btn:hover, .maya-inc-btn:focus-visible { background: rgba(56, 225, 255, .18); }
    @media (min-width: 600px) { .maya-inc { left: auto; right: 22px; margin: 0; bottom: 22px; } }
  `;
  (document.head || document.documentElement).appendChild(style);
})();
