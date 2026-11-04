// RECONOCER TESTIGOS · catálogo, foto del cuadro y análisis orientativo
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = window.esc;
  const icon = window.icon;
  const api = window.api;
  const fmtNum = window.fmtNum;

  if (!$('#view-testigos')) return;

  const COLORS = [['rojo', 'Rojo'], ['amarillo', 'Amarillo'], ['verde', 'Verde'], ['azul', 'Azul'], ['blanco', 'Blanco']];
  const state = { items: [], color: '', severity: '', dataUrl: '', busy: false, loaded: false };

  const chip = (value, label) => `<button class="tl-chip${state.color === value ? ' active' : ''}" type="button" data-tl-color="${esc(value)}"><i class="dot-${esc(value)}"></i>${esc(label)}</button>`;

  function setStatus(text, kind = '') {
    const el = $('#tlStatus');
    if (!el) return;
    el.textContent = text;
    el.className = `garage-privacy${kind ? ` ${kind}` : ''}`;
  }

  const glyph = light => `<span class="tl-glyph ${esc(light.color)}">${icon(light.glyph || 'alert')}</span>`;
  const severityTag = light => `<span class="tl-sev ${esc(light.severity)}">${esc(light.severityLabel || light.severity)}</span>`;

  // ---------------------------------------------------------------- catálogo
  async function loadCatalog() {
    const params = new URLSearchParams();
    if (state.severity) params.set('severity', state.severity);
    if (state.color) params.set('color', state.color);
    const q = $('#tlSearch')?.value.trim();
    if (q) params.set('q', q);
    try {
      const data = await api(`/api/testigos?${params.toString()}`);
      state.items = data.items || [];
      state.loaded = true;
      renderList();
      renderSeverityOptions(data.severities || []);
      if ($('#tlCount')) $('#tlCount').textContent = fmtNum(data.total || state.items.length);
    } catch (error) {
      const list = $('#tlList');
      if (list) list.innerHTML = `<p class="garage-empty-note">${esc(error.message || 'No se pudo cargar el catálogo.')}</p>`;
    }
  }

  function renderSeverityOptions(severities) {
    const select = $('#tlSeverity');
    if (!select || select.dataset.ready === '1' || !severities.length) return;
    select.innerHTML = `<option value="">Todas las gravedades</option>${severities.map(item => `<option value="${esc(item.key)}">${esc(item.label)}</option>`).join('')}`;
    select.dataset.ready = '1';
  }

  function renderList() {
    const list = $('#tlList');
    if (!list) return;
    if (!state.items.length) {
      list.innerHTML = '<p class="garage-empty-note">No hay testigos con esos filtros. Prueba otra palabra o quita el color.</p>';
      return;
    }
    list.innerHTML = state.items.map(light => `
      <button class="tl-card ${esc(light.severity)}" type="button" data-tl-open="${esc(light.id)}">
        ${glyph(light)}
        <span class="tl-card-body">
          <b>${esc(light.name)}</b>
          <small>${esc(light.system)}</small>
          <span class="tl-card-tags">${severityTag(light)}${light.actNow ? '<em class="tl-now">Detenerse</em>' : ''}</span>
        </span>
        ${icon('arrow')}
      </button>`).join('');
  }

  async function openLight(id) {
    try {
      const light = await api(`/api/testigos/${encodeURIComponent(id)}`);
      renderDetail(light);
    } catch (error) {
      setStatus(error.message || 'No se pudo abrir la ficha.', 'error');
    }
  }

  function renderDetail(light) {
    const box = $('#tlDetail');
    if (!box) return;
    const section = (title, items) => (items && items.length)
      ? `<div class="tl-block"><h4>${esc(title)}</h4><ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul></div>`
      : '';
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="tl-detail-head">
        ${glyph(light)}
        <div>
          <span class="eyebrow">${esc(light.system)}</span>
          <h3>${esc(light.name)}</h3>
          <p class="tl-card-tags">${severityTag(light)}<span class="tl-color-tag ${esc(light.color)}">${esc(light.color)}</span></p>
        </div>
        <button class="icon-btn" type="button" data-tl-close aria-label="Cerrar ficha">${icon('close')}</button>
      </div>
      <p class="tl-meaning">${esc(light.meaning)}</p>
      <div class="tl-split">
        <div class="tl-block"><h4>Qué hacer ahora</h4><p>${esc(light.driverText)}</p></div>
        <div class="tl-block"><h4>Para el taller</h4><p>${esc(light.technicalText)}</p></div>
      </div>
      ${section('Causas posibles', light.causes)}
      ${section('Averías relacionadas', light.relatedFaults)}
      ${section('Síntomas que puedes notar', light.symptoms)}
      ${section('Comprobaciones recomendadas', light.checks)}
      ${section('Soluciones posibles', light.solutions)}
      <div class="tl-block"><h4>¿Puedo seguir circulando?</h4><p>${esc(light.drivingRisk)}</p></div>
      <div class="tl-block"><h4>Diferencias entre fabricantes</h4><p>${esc(light.differences || 'Sin diferencias documentadas.')}</p><p class="micro-note">${esc(light.brands || '')}</p></div>
      <div class="tl-block"><h4>Fuentes</h4>
        <ul class="tl-sources">${(light.sources || []).map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>`).join('') || '<li>Sin fuentes registradas para esta ficha.</li>'}</ul>
        <p class="micro-note">${esc(light.imageNote || '')}</p>
      </div>`;
    box.querySelector('[data-tl-close]')?.addEventListener('click', () => {
      box.classList.add('hidden');
      box.innerHTML = '';
    });
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // ---------------------------------------------------------------- foto
  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('La imagen no se pudo leer.'));
        img.src = String(reader.result || '');
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  async function preparePhoto(file) {
    if (!/^image\//.test(file.type || '')) throw new Error('Usa una foto JPG, PNG o WebP del cuadro.');
    if (file.size > 12 * 1024 * 1024) throw new Error('La imagen supera 12 MB.');
    const img = await fileToImage(file);
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    state.dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const preview = $('#tlPreview');
    if (preview) preview.src = state.dataUrl;
    $('#tlPreviewWrap')?.classList.remove('hidden');
    setStatus(`Foto lista (${canvas.width}×${canvas.height} px). Pulsa «Analizar testigo».`);
  }

  // ---------------------------------------------------------------- análisis
  function vehicleContext() {
    return {
      brand: $('#fBrand')?.value.trim() || '',
      model: $('#fModel')?.value.trim() || '',
      year: $('#fYear')?.value.trim() || '',
      engine: $('#fEngine')?.value.trim() || ''
    };
  }

  async function analyze() {
    if (state.busy) return;
    state.busy = true;
    const button = $('#tlAnalyze');
    if (button) button.disabled = true;
    setStatus('Analizando el testigo…');
    try {
      const result = await api('/api/testigos/analizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl: state.dataUrl || undefined,
          color: state.color || undefined,
          hint: $('#tlHint')?.value.trim() || undefined,
          context: vehicleContext()
        })
      });
      renderResult(result);
    } catch (error) {
      setStatus(error.message || 'No se pudo analizar la imagen.', 'error');
    } finally {
      state.busy = false;
      if (button) button.disabled = false;
    }
  }

  function renderResult(result) {
    const box = $('#tlResult');
    if (!box) return;
    const candidates = result.candidates || [];
    const analysis = result.analysis;
    const needs = (result.needs || []).filter(Boolean);
    box.classList.remove('hidden');
    box.innerHTML = `
      <div class="tl-result-head">
        <b>${result.identified ? 'Posible identificación' : 'No hay identificación segura'}</b>
        ${analysis?.severity ? `<span class="tl-sev ${esc(analysis.severity)}">${esc(analysis.severity)}</span>` : ''}
      </div>
      <p>${esc(result.note || '')}</p>
      ${needs.length ? `<p class="micro-note">Para afinar: ${esc(needs.join(', '))}</p>` : ''}
      ${analysis?.driverText ? `<div class="tl-block"><h4>Explicación para el conductor</h4><p>${esc(analysis.driverText)}</p></div>` : ''}
      ${analysis?.technicalText ? `<div class="tl-block"><h4>Lectura técnica</h4><p>${esc(analysis.technicalText)}</p></div>` : ''}
      ${analysis?.safety ? `<div class="tl-block"><h4>Seguridad</h4><p>${esc(analysis.safety)}</p></div>` : ''}
      ${candidates.length ? `<div class="tl-block"><h4>Candidatos del catálogo</h4>
        <div class="tl-candidates">${candidates.map(item => `
          <button class="tl-candidate" type="button" data-tl-open="${esc(item.id)}">
            ${glyph(item)}
            <span><b>${esc(item.name)}</b><small>${esc(item.system)}${item.confidence ? ` · ${Math.round(item.confidence)}% de coincidencia` : ''}</small></span>
            ${icon('arrow')}
          </button>`).join('')}</div></div>` : ''}
      <p class="micro-note">${result.vision?.available
        ? `Visión con ${esc(result.vision.providerLabel || result.vision.provider)} · ${esc(result.vision.model || '')}`
        : 'Sin proveedor con visión configurado: el catálogo se filtra por color y descripción, sin inventar una identificación.'}</p>`;
  }

  function reset() {
    state.dataUrl = '';
    state.color = '';
    $('#tlPreviewWrap')?.classList.add('hidden');
    const preview = $('#tlPreview');
    if (preview) preview.removeAttribute('src');
    const hint = $('#tlHint');
    if (hint) hint.value = '';
    const result = $('#tlResult');
    if (result) { result.classList.add('hidden'); result.innerHTML = ''; }
    renderColors();
    setStatus('La imagen no se guarda en el servidor. La IA solo orienta: confirma el símbolo antes de actuar.');
  }

  function renderColors() {
    const box = $('#tlColors');
    if (!box) return;
    box.innerHTML = COLORS.map(([value, label]) => chip(value, label)).join('');
  }

  // ---------------------------------------------------------------- eventos
  $('#tlFile')?.addEventListener('change', async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try { await preparePhoto(file); } catch (error) { setStatus(error.message, 'error'); }
  });

  $('#tlClearPhoto')?.addEventListener('click', () => {
    state.dataUrl = '';
    $('#tlPreviewWrap')?.classList.add('hidden');
    const preview = $('#tlPreview');
    if (preview) preview.removeAttribute('src');
    setStatus('Foto quitada. Puedes elegir el testigo en el catálogo.');
  });

  $('#tlColors')?.addEventListener('click', event => {
    const button = event.target.closest('[data-tl-color]');
    if (!button) return;
    state.color = state.color === button.dataset.tlColor ? '' : button.dataset.tlColor;
    renderColors();
    loadCatalog();
  });

  $('#tlList')?.addEventListener('click', event => {
    const card = event.target.closest('[data-tl-open]');
    if (card) openLight(card.dataset.tlOpen);
  });

  $('#tlResult')?.addEventListener('click', event => {
    const card = event.target.closest('[data-tl-open]');
    if (card) openLight(card.dataset.tlOpen);
  });

  $('#tlAnalyze')?.addEventListener('click', analyze);
  $('#tlReset')?.addEventListener('click', reset);
  $('#tlCatalogBtn')?.addEventListener('click', () => {
    $('#tlList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#tlSearch')?.focus();
  });

  $('#tlSearch')?.addEventListener('input', () => {
    clearTimeout(loadCatalog.timer);
    loadCatalog.timer = setTimeout(loadCatalog, 240);
  });
  $('#tlSeverity')?.addEventListener('change', event => {
    state.severity = event.target.value;
    loadCatalog();
  });

  document.addEventListener('viewchange', event => {
    if (event.detail?.name !== 'testigos') return;
    if (!state.loaded) loadCatalog();
  });

  (async () => {
    renderColors();
    try {
      const stats = await api('/api/testigos/stats');
      if ($('#tlVision')) $('#tlVision').textContent = stats.vision?.available ? 'visión IA activa' : 'análisis local';
      if ($('#tlCount')) $('#tlCount').textContent = fmtNum(stats.lights || 0);
      renderSeverityOptions(stats.severities || []);
    } catch { /* el catálogo avisa del error */ }
    loadCatalog();
  })();
})();
