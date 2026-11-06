/**
 * Neumáticos y llantas.
 *  - Búsqueda por medida exacta (205/55 R16) contra /api/tyres.
 *  - Calculadora de medidas equivalentes (±3 % de diámetro) contra /api/tyres/equivalents.
 *  - Comparador y llantas se montan en fases posteriores sobre este mismo estado.
 */
(() => {
  const $ = sel => document.querySelector(sel);
  const state = { meta: null, search: null, equivalents: null, loadedMeta: false, started: false, compare: [] };
  const COMPARE_MAX = 3;

  const SEASON_LABEL = { verano: 'Verano', invierno: 'Invierno', 'todo tiempo': 'Todo tiempo', allseason: 'Todo tiempo', 'all-season': 'Todo tiempo' };
  const SEASON_ICON = { verano: 'i-thermo', invierno: 'i-cloud', 'todo tiempo': 'i-cloud' };

  function esc(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(value) {
    if (!Number.isFinite(Number(value))) return 'Consultar';
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(value));
  }

  function seasonLabel(value) {
    const key = String(value || '').toLowerCase();
    return SEASON_LABEL[key] || (value ? String(value) : 'Sin especificar');
  }

  function grade(value) {
    const g = String(value || '').toUpperCase();
    return /^[A-G]$/.test(g) ? g : '';
  }

  function sizeFromInputs() {
    return {
      w: Number($('#tyreW')?.value) || 0,
      p: Number($('#tyreP')?.value) || 0,
      r: Number($('#tyreR')?.value) || 0
    };
  }

  function readForm() {
    const { w, p, r } = sizeFromInputs();
    return { w, p, r, season: $('#tyreSeason')?.value || '' };
  }

  function showError(message) {
    const box = $('#tyreError');
    if (!box) return;
    if (!message) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }
    box.classList.remove('hidden');
    box.innerHTML = `<svg class="ic"><use href="#i-alert"></use></svg><div>${esc(message)}</div>`;
  }

  function euLabel(labels) {
    if (!labels) return '<span class="tyre-label-empty">Etiqueta UE no disponible</span>';
    const fuel = grade(labels.fuel);
    const wet = grade(labels.wet);
    const noise = Number(labels.noise);
    const parts = [];
    if (fuel) parts.push(`<span class="eu-grade" data-grade="${fuel}"><small>Combustible</small><b>${fuel}</b></span>`);
    if (wet) parts.push(`<span class="eu-grade" data-grade="${wet}"><small>Mojado</small><b>${wet}</b></span>`);
    if (Number.isFinite(noise) && noise > 0) parts.push(`<span class="eu-noise"><small>Ruido</small><b>${noise} dB</b></span>`);
    return parts.length ? `<div class="tyre-labels">${parts.join('')}</div>` : '<span class="tyre-label-empty">Etiqueta UE no disponible</span>';
  }

  function card(t) {
    const photo = t.image && t.imageStatus === 'verified'
      ? `<img class="product-photo" src="${esc(t.image)}" alt="Neumático ${esc(t.brand)} ${esc(t.model)} ${esc(t.size)}" loading="lazy" referrerpolicy="no-referrer">`
      : `<span class="product-placeholder" title="Foto pendiente"><svg class="ic"><use href="#i-tire"></use></svg><b>Foto pendiente</b></span>`;
    const link = /^https?:\/\//i.test(t.url || '') ? t.url : '';
    const priceNote = t.priceSeen ? `Consultado el ${esc(t.priceSeen)}` : 'Precio orientativo';
    return `<article class="product tyre-card">
      <div class="product-media">${photo}
        <span class="tyre-size-badge">${esc(t.size)}</span>
      </div>
      <div class="product-body">
        <small class="product-cat">${esc(seasonLabel(t.season))}${t.type ? ` · ${esc(t.type)}` : ''}</small>
        <h3>${esc(t.brand)}${t.model ? ` ${esc(t.model)}` : ''}</h3>
        <small class="product-brand">${esc(t.size)}${t.load ? ` ${esc(t.load)}${esc(t.speed || '')}` : ''}${t.asin ? ` · ASIN ${esc(t.asin)}` : ''}</small>
        ${euLabel(t.labels)}
        ${t.notes ? `<p>${esc(t.notes)}</p>` : ''}
        <div class="product-foot">
          <span class="product-price"><small>${esc(priceNote)}</small>${esc(money(t.price))}</span>
          ${link
            ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener sponsored">Ver oferta <svg class="ic"><use href="#i-external"></use></svg></a>`
            : '<span class="btn ghost">Enlace pendiente</span>'}
        </div>
        <small class="tyre-shop">${esc(t.shop || 'Tienda no confirmada')}</small>
        <button class="tyre-compare-toggle" type="button" data-compare="${esc(t.id)}" aria-pressed="false">+ Comparar</button>
      </div>
    </article>`;
  }

  function resultsSummary(data) {
    const box = $('#tyreResultsHead');
    if (!box) return;
    const info = data.sizeInfo;
    if (!info) {
      box.innerHTML = `<span class="tyre-result-count">${fmt(data.count)} neumáticos en el catálogo</span>`;
      return;
    }
    box.innerHTML = `
      <span class="tyre-result-count"><b>${esc(info.size)}</b> · diámetro exterior <b>${info.diameter} mm</b> · ${fmt(data.count)} ${data.count === 1 ? 'ficha' : 'fichas'}</span>
      <span class="tyre-rim-note">Llanta orientativa ${info.rimRange.min}–${info.rimRange.max}″ · ${fmt(Math.round(info.revsPerKm))} vueltas/km</span>`;
  }

  function fmt(n) {
    return new Intl.NumberFormat('es-ES').format(Number(n) || 0);
  }

  function renderResults(data) {
    state.search = data;
    resultsSummary(data);
    const grid = $('#tyreResults');
    if (!grid) return;
    if (!data.items.length) {
      const season = $('#tyreSeason')?.value;
      grid.innerHTML = `<div class="tyre-empty">
        <svg class="ic"><use href="#i-tire"></use></svg>
        <b>Sin fichas verificadas para ${esc(data.size || 'esa medida')}${season ? ` en ${esc(seasonLabel(season))}` : ''}</b>
        <p>El catálogo solo publica neumáticos con medida, foto y enlace de vendedor comprobados, así que puede quedarse corto en medidas poco habituales. Prueba otra temporada, quita filtros o consulta las medidas equivalentes: la calculadora funciona aunque no haya fichas de esa medida exacta.</p>
        <button class="btn primary" type="button" data-tyre-equiv>Ver medidas equivalentes</button>
      </div>`;
      grid.querySelector('[data-tyre-equiv]')?.addEventListener('click', () => loadEquivalents(true));
      return;
    }
    grid.innerHTML = data.items.map(card).join('');
    state.compare = state.compare.filter(id => data.items.some(item => item.id === id));
    syncCompareButtons();
    renderCompare();
  }

  async function search(options = {}) {
    const form = readForm();
    if (!form.w || !form.p || !form.r) {
      showError('Indica anchura, perfil y diámetro de llanta.');
      return;
    }
    showError('');
    const grid = $('#tyreResults');
    if (grid) grid.innerHTML = '<div class="skeleton" style="height:180px"></div>';
    const params = new URLSearchParams({ w: form.w, p: form.p, r: form.r });
    if (form.season) params.set('season', form.season);
    try {
      const res = await fetch(`/api/tyres?${params}`, { headers: { accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const tag = $('#tyreSizeTag');
      if (tag) tag.textContent = data.size || `${form.w}/${form.p} R${form.r}`;
      renderResults(data);
      if (options.withEquivalents) loadEquivalents(false);
    } catch (error) {
      showError(`No se pudo consultar el catálogo: ${error.message}`);
      if (grid) grid.innerHTML = '';
    }
  }

  function equivalenceRow(alt) {
    const warn = alt.warnings.length
      ? `<span class="tyre-warn" title="${esc(alt.warnings.join(' '))}"><svg class="ic"><use href="#i-alert"></use></svg>${esc(alt.warnings[0])}</span>`
      : '<span class="tyre-ok"><svg class="ic"><use href="#i-check"></use></svg>Sin avisos de medida</span>';
    return `<tr>
      <td><b>${esc(alt.size)}</b><small>llanta ${alt.rimWidth?.min ?? '?'}–${alt.rimWidth?.max ?? '?'}″</small></td>
      <td>${alt.diameter} mm</td>
      <td class="${Math.abs(alt.diffPct) > 2.5 ? 'near-limit' : ''}">${alt.diffPct > 0 ? '+' : ''}${alt.diffPct} % <small>(${alt.diffMm > 0 ? '+' : ''}${alt.diffMm} mm)</small></td>
      <td>${alt.widthDelta > 0 ? '+' : ''}${alt.widthDelta} mm</td>
      <td>${warn}</td>
    </tr>`;
  }

  const GRADE_ORDER = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6 };

  function compareToggle(id) {
    const index = state.compare.indexOf(id);
    if (index >= 0) {
      state.compare.splice(index, 1);
    } else {
      if (state.compare.length >= COMPARE_MAX) {
        showError(`Puedes comparar ${COMPARE_MAX} neumáticos a la vez. Quita uno para añadir otro.`);
        return;
      }
      state.compare.push(id);
    }
    showError('');
    syncCompareButtons();
    renderCompare();
  }

  function syncCompareButtons() {
    document.querySelectorAll('[data-compare]').forEach(btn => {
      const on = state.compare.includes(btn.dataset.compare);
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'En el comparador' : '+ Comparar';
    });
  }

  function renderCompare() {
    const panel = $('#tyreCompare');
    const body = $('#compareBody');
    if (!panel || !body) return;
    const items = state.compare
      .map(id => (state.search?.items || []).find(item => item.id === id))
      .filter(Boolean);
    if (items.length < 1) {
      panel.classList.add('hidden');
      body.innerHTML = '<div class="notice">Selecciona fichas del resultado para compararlas.</div>';
      return;
    }
    panel.classList.remove('hidden');
    const prices = items.map(i => i.price).filter(Number.isFinite);
    const bestPrice = prices.length ? Math.min(...prices) : null;
    const cells = items.map(item => {
      const wet = grade(item.labels?.wet);
      const fuel = grade(item.labels?.fuel);
      const noise = Number(item.labels?.noise);
      return { item, wet, fuel, noise, isBestPrice: Number.isFinite(item.price) && item.price === bestPrice };
    });
    const bestWet = cells.reduce((best, c) => (c.wet && (!best || GRADE_ORDER[c.wet] < GRADE_ORDER[best]) ? c.wet : best), null);
    const bestFuel = cells.reduce((best, c) => (c.fuel && (!best || GRADE_ORDER[c.fuel] < GRADE_ORDER[best]) ? c.fuel : best), null);
    const noises = cells.map(c => c.noise).filter(n => Number.isFinite(n) && n > 0);
    const minNoise = noises.length ? Math.min(...noises) : null;

    const head = `<tr><th>Dato</th>${cells.map(c => `<th><span>${esc(c.item.brand)}</span><small>${esc(c.item.model || c.item.size)}</small></th>`).join('')}</tr>`;
    const row = (label, render) => `<tr><th>${label}</th>${cells.map(c => `<td>${render(c)}</td>`).join('')}</tr>`;
    body.innerHTML = `<div class="compare-wrap"><table class="compare-table">
      <thead>${head}</thead>
      <tbody>
        ${row('Precio', c => Number.isFinite(c.item.price) ? `<b class="${c.isBestPrice ? 'compare-best' : ''}">${esc(money(c.item.price))}</b>` : '—')}
        ${row('Medida', c => esc(c.item.size))}
        ${row('Temporada', c => esc(seasonLabel(c.item.season)) || '—')}
        ${row('Carga / velocidad', c => c.item.load ? `${esc(c.item.load)}${esc(c.item.speed || '')}` : '—')}
        ${row('Eficiencia (combustible)', c => c.fuel ? `<span class="eu-grade" data-grade="${c.fuel}"><b>${c.fuel}</b></span>` : 'Sin dato')}
        ${row('Agarre en mojado', c => c.wet ? `<span class="eu-grade" data-grade="${c.wet}"><b>${c.wet}</b></span>${c.wet === bestWet ? ' <small class="compare-best">mejor</small>' : ''}` : 'Sin dato')}
        ${row('Ruido', c => Number.isFinite(c.noise) && c.noise > 0 ? `${c.noise} dB${c.noise === minNoise ? ' <small class="compare-best">más bajo</small>' : ''}` : 'Sin dato')}
        ${row('Tienda', c => esc(c.item.shop || '—'))}
        ${row('Oferta', c => /^https?:\/\//i.test(c.item.url || '') ? `<a class="btn ghost sm" href="${esc(c.item.url)}" target="_blank" rel="noopener sponsored">Ver ${svgIcon()}</a>` : '—')}
      </tbody>
    </table></div>`;
  }

  function svgIcon() {
    return '<svg class="ic"><use href="#i-external"></use></svg>';
  }

  function renderEquivalents(data) {
    state.equivalents = data;
    const base = $('#equivBase');
    if (base) base.textContent = data.origin ? `${data.origin.size} · ${data.origin.diameter} mm` : '';
    const summary = $('#equivSummary');
    if (summary) {
      summary.innerHTML = data.origin ? `
        <div class="equiv-stat"><small>Medida de referencia</small><b>${esc(data.origin.size)}</b></div>
        <div class="equiv-stat"><small>Diámetro exterior</small><b>${data.origin.diameter} mm</b></div>
        <div class="equiv-stat"><small>Llanta recomendada</small><b>${data.origin.rimRange.min}–${data.origin.rimRange.max}″</b></div>
        <div class="equiv-stat"><small>Vueltas por km</small><b>${fmt(data.origin.revsPerKm)}</b></div>
        <div class="equiv-stat"><small>Tolerancia aplicada</small><b>±${data.tolerance} %</b></div>` : '';
    }
    const box = $('#equivGroups');
    if (!box) return;
    if (!data.valid || !data.groups.length) {
      box.innerHTML = `<div class="notice">No hay medidas alternativas dentro del ±${data.tolerance || 3} % para esa referencia.</div>`;
      return;
    }
    box.innerHTML = data.groups.map(group => `
      <section class="equiv-group">
        <header>
          <h4>Llanta ${group.rim}″</h4>
          <span class="tag">${group.sameRim ? 'Misma llanta' : `Cambio de llanta ${group.rim > data.origin.rim ? '+' : ''}${group.rim - data.origin.rim}″`} · ${group.items.length} medidas</span>
        </header>
        <div class="equiv-table-wrap">
          <table class="equiv-table">
            <thead><tr><th>Medida</th><th>Diámetro</th><th>Diferencia</th><th>Anchura</th><th>Comprobación</th></tr></thead>
            <tbody>${group.items.map(equivalenceRow).join('')}</tbody>
          </table>
        </div>
      </section>`).join('');
  }

  async function loadEquivalents(scroll) {
    const form = readForm();
    if (!form.w || !form.p || !form.r) {
      showError('Indica anchura, perfil y llanta para calcular equivalencias.');
      return;
    }
    showError('');
    const box = $('#equivGroups');
    if (box) box.innerHTML = '<div class="skeleton" style="height:160px"></div>';
    try {
      const res = await fetch(`/api/tyres/equivalents?w=${form.w}&p=${form.p}&r=${form.r}`, { headers: { accept: 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderEquivalents(data);
      if (scroll) $('#tyreEquivalents')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
      if (box) box.innerHTML = `<div class="notice">No se pudieron calcular las equivalencias: ${esc(error.message)}</div>`;
    }
  }

  function fillRims() {
    const select = $('#tyreR');
    if (!select) return;
    const current = Number(select.value) || 16;
    let html = '';
    for (let r = 13; r <= 24; r += 1) html += `<option value="${r}"${r === current ? ' selected' : ''}>${r}″</option>`;
    select.innerHTML = html;
  }

  async function loadMeta() {
    if (state.loadedMeta) return;
    state.loadedMeta = true;
    try {
      const res = await fetch('/api/tyres/meta', { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      state.meta = await res.json();
      const count = $('#tyreCount');
      if (count) count.textContent = fmt(state.meta.stats?.verified ?? 0);
      const updated = $('#tyreUpdated');
      if (updated && state.meta.updated) updated.textContent = `Datos consultados el ${state.meta.updated}`;
    } catch {
      /* el buscador funciona igual sin metadatos */
    }
  }

  function readWheel(prefix) {
    return {
      width: $('#w' + prefix + 'Width')?.value,
      diameter: $('#w' + prefix + 'Dia')?.value,
      pcd: $('#w' + prefix + 'Pcd')?.value,
      et: $('#w' + prefix + 'Et')?.value,
      bore: $('#w' + prefix + 'Bore')?.value
    };
  }

  const VERDICT_TEXT = {
    compatible: 'Encaja en las cotas comprobadas',
    revisar: 'Requiere comprobación antes de montar',
    incompatible: 'No es compatible'
  };
  const CHECK_ICON = { ok: 'i-check', warn: 'i-alert', fail: 'i-close' };

  function renderWheelResult(data) {
    const box = $('#wheelResult');
    if (!box) return;
    box.innerHTML = `<div class="wheel-verdict" data-verdict="${esc(data.verdict)}">
        <span class="wheel-verdict-label">${esc(VERDICT_TEXT[data.verdict] || data.verdict)}</span>
        ${Number.isFinite(data.trackChange) ? `<span class="wheel-track">Vía ${data.trackChange > 0 ? '+' : ''}${data.trackChange} mm</span>` : ''}
      </div>
      <ul class="wheel-checks">
        ${data.checks.map(check => `<li data-status="${esc(check.status)}">
          <svg class="ic"><use href="#${CHECK_ICON[check.status] || 'i-alert'}"></use></svg>
          <b>${esc(check.label)}</b>
          <span>${esc(check.detail)}</span>
        </li>`).join('')}
      </ul>
      <p class="wheel-notes">${(data.notes || []).map(n => esc(n)).join(' ')}</p>`;
  }

  async function checkWheels(event) {
    event.preventDefault();
    const box = $('#wheelResult');
    if (box) box.innerHTML = '<div class="skeleton" style="height:120px"></div>';
    try {
      const res = await fetch('/api/wheels/fit', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ current: readWheel('Cur'), candidate: readWheel('New') })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      renderWheelResult(data);
    } catch (error) {
      if (box) box.innerHTML = `<div class="notice">${esc(error.message)}</div>`;
    }
  }

  function bind() {
    const form = $('#tyreForm');
    if (!form) return;
    fillRims();
    form.addEventListener('submit', event => {
      event.preventDefault();
      search({ withEquivalents: true });
    });
    $('#tyreEquivBtn')?.addEventListener('click', () => loadEquivalents(true));
    $('#wheelForm')?.addEventListener('submit', checkWheels);
    $('#compareClear')?.addEventListener('click', () => {
      state.compare = [];
      syncCompareButtons();
      renderCompare();
    });
    $('#tyreResults')?.addEventListener('click', event => {
      const btn = event.target.closest('[data-compare]');
      if (btn) compareToggle(btn.dataset.compare);
    });
    ['#tyreW', '#tyreP', '#tyreR'].forEach(sel => {
      const input = $(sel);
      if (!input) return;
      input.addEventListener('change', () => {
        const tag = $('#tyreSizeTag');
        const f = sizeFromInputs();
        if (tag && f.w && f.p && f.r) tag.textContent = `${f.w}/${f.p} R${f.r}`;
      });
    });
  }

  document.addEventListener('viewchange', event => {
    if (event.detail.name !== 'neumaticos') return;
    if (!state.started) {
      state.started = true;
      bind();
    }
    loadMeta();
    if (!state.search) search({ withEquivalents: true });
  });

  window.tyresInit = () => {
    if (!state.started) {
      state.started = true;
      bind();
    }
    loadMeta();
  };
})();
