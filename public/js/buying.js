(() => {
  const $ = selector => document.querySelector(selector);
  const list = $('#buyingList');
  if (!list) return;
  let data = null;
  let loaded = false;

  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));

  function matches(item, q, brand, verdict) {
    if (brand && item.brand !== brand) return false;
    if (verdict && item.recommendation?.level !== verdict) return false;
    if (!q) return true;
    const text = fold([
      item.brand, item.model, item.version, item.generation, item.years,
      item.engine?.code, item.engine?.fuel, item.buyingGuide?.riskLevel,
      item.buyingGuide?.verdict,
      ...(item.knownIssues || []).map(issue => `${issue.title || ''} ${issue.detail || ''}`),
      ...(item.buyingGuide?.priorityChecks || [])
    ].join(' '));
    return q.split(/\s+/).filter(Boolean).every(term => text.includes(term));
  }

  function render() {
    if (!data) return;
    const q = fold($('#buyingSearch')?.value || '');
    const brand = $('#buyingBrand')?.value || '';
    const verdict = $('#buyingVerdict')?.value || '';
    const items = data.items.filter(item => matches(item, q, brand, verdict));
    if (!items.length) {
      list.innerHTML = '<div class="notice">No hay fichas que coincidan con los filtros. Prueba con otra marca, motor o problema.</div>';
      return;
    }
    list.innerHTML = items.map(item => {
      const guide = item.buyingGuide || {};
      const recommendation = item.recommendation || {};
      const engine = item.engine || {};
      const known = (item.knownIssues || []).slice(0, 3).map(issue => `<li><b>${esc(issue.title || 'Punto documentado')}</b><p>${esc(issue.detail || '')}</p><small>${esc(issue.source || 'Fuente no indicada')}</small></li>`).join('');
      const checks = (guide.priorityChecks || []).slice(0, 6).map(check => `<li>${esc(check)}</li>`).join('');
      const specs = [
        engine.displacementCc ? `${engine.displacementCc} cc` : '',
        engine.powerPs ? `${engine.powerPs} CV` : '',
        engine.fuel || '',
        item.transmission?.gears || item.transmission?.type || ''
      ].filter(Boolean);
      return `<article class="buying-card panel">
        <div class="buying-media">
          <img src="${esc(item.image?.src || '')}" alt="${esc(item.brand)} ${esc(item.model)}" loading="lazy">
          <span class="buying-verdict ${esc(recommendation.level || '')}">${esc(recommendation.label || 'Sin veredicto')}</span>
        </div>
        <div class="buying-body">
          <span class="eyebrow">${esc(item.brand)} · ${esc(item.generation)}</span>
          <h3>${esc(item.model)} <span>${esc(item.version)}</span></h3>
          <p class="buying-years">${esc(item.years)} · ${esc(item.body)}</p>
          <div class="buying-specs">${specs.map(spec => `<span>${esc(spec)}</span>`).join('')}</div>
          <div class="buying-risk"><b>Riesgo documentado</b><p>${esc(guide.riskLevel || 'No determinado')}</p></div>
          <p class="buying-verdict-text"><b>Veredicto:</b> ${esc(guide.verdict || 'Sin veredicto editorial.')}</p>
          <details class="buying-details">
            <summary>Problemas y puntos conocidos <span>${(item.knownIssues || []).length}</span></summary>
            <ul class="buying-issues">${known || '<li>No hay problemas específicos documentados en esta ficha.</li>'}</ul>
          </details>
          <h4>Comprobaciones antes de comprar</h4>
          <ol class="buying-checks">${checks || '<li>No hay comprobaciones específicas registradas.</li>'}</ol>
          <p class="micro-note">${esc(recommendation.note || '')}</p>
          <div class="buying-actions">
            <button class="btn primary sm" type="button" data-buying-sheet="${esc(item.id)}">Ver ficha completa ${svgArrow()}</button>
            <button class="btn ghost sm" type="button" data-buying-diagnose="${esc(item.id)}">Diagnosticar esta versión</button>
          </div>
          <p class="buying-sources">${esc(String(item.sourceCount || 0))} ${Number(item.sourceCount) === 1 ? 'fuente' : 'fuentes'} · confianza ${esc(item.confidence || 'no indicada')}</p>
        </div>
      </article>`;
    }).join('');

    list.querySelectorAll('[data-buying-sheet]').forEach(button => {
      button.addEventListener('click', async () => {
        window.showView('vehiculos');
        if (typeof window.loadVehicles === 'function') await window.loadVehicles();
        if (typeof window.openVehicleSheet === 'function') await window.openVehicleSheet(button.dataset.buyingSheet, { scroll: true });
      });
    });
    list.querySelectorAll('[data-buying-diagnose]').forEach(button => {
      button.addEventListener('click', async () => {
        const item = data.items.find(entry => entry.id === button.dataset.buyingDiagnose);
        if (!item) return;
        const engine = [
          item.engine?.code,
          item.engine?.displacementCc ? `${item.engine.displacementCc} cc` : '',
          item.engine?.powerPs ? `${item.engine.powerPs} CV` : '',
          item.engine?.fuel
        ].filter(Boolean).join(' · ');
        const ok = window.setVehicleState?.({ id: item.id, brand: item.brand, model: item.model, engine }, 'buying');
        if (!ok) return;
        window.showView('diagnostico');
      });
    });
  }

  function svgArrow() {
    return '<svg class="ic" aria-hidden="true"><use href="#i-arrow"></use></svg>';
  }

  function renderBrands() {
    const select = $('#buyingBrand');
    if (!select || !data || select.options.length > 1) return;
    const brands = [...new Set(data.items.map(item => item.brand))].sort((a, b) => a.localeCompare(b, 'es'));
    select.insertAdjacentHTML('beforeend', brands.map(brand => `<option value="${esc(brand)}">${esc(brand)}</option>`).join(''));
  }

  async function load() {
    if (loaded && data) return;
    list.innerHTML = '<div class="notice">Cargando fichas de compra…</div>';
    try {
      const response = await fetch('/api/buying');
      if (!response.ok) throw new Error(`Error HTTP ${response.status}`);
      data = await response.json();
      loaded = true;
      renderBrands();
      render();
    } catch (error) {
      list.innerHTML = `<div class="notice">No se pudieron cargar las fichas de compra: ${esc(error.message)}</div>`;
    }
  }

  let timer = null;
  $('#buyingSearch')?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(render, 140);
  });
  $('#buyingBrand')?.addEventListener('change', render);
  $('#buyingVerdict')?.addEventListener('change', render);
  $('#buyingReset')?.addEventListener('click', () => {
    const search = $('#buyingSearch');
    const brand = $('#buyingBrand');
    const verdict = $('#buyingVerdict');
    if (search) search.value = '';
    if (brand) brand.value = '';
    if (verdict) verdict.value = '';
    render();
  });

  document.addEventListener('viewchange', event => {
    if (event.detail?.name === 'compra') load();
  });
  if (location.hash === '#compra') load();
})();
