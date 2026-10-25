// Diagnóstico y Mecánica - Script Principal
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

// Utilidad segura para llamadas API
async function api(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || err.detalle || `Error HTTP ${res.status}`);
  }
  return res.json();
}

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

function formatMarkdown(text = '') {
  return esc(text)
    .replace(/^### (.*$)/gim, '<h4 style="color:var(--accent);margin:12px 0 6px 0;">$1</h4>')
    .replace(/^## (.*$)/gim, '<h3 style="color:var(--accent);margin:14px 0 8px 0;">$1</h3>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^- (.*$)/gim, '<li style="margin-left:18px;">$1</li>')
    .replace(/^\d+\. (.*$)/gim, '<li style="margin-left:18px;">$1</li>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString('es-ES').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function sourceCountLabel(n) {
  return `${fmtNum(n)} ${Number(n) === 1 ? 'fuente' : 'fuentes'}`;
}

function icon(name, cls = '') {
  return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function symptomIcon(name = '') {
  const n = String(name).toLowerCase();
  if (/fren|abs|pastilla|disco/.test(n)) return 'brake';
  if (/bater|el[eé]ctric|alternador|arranque|fusible/.test(n)) return 'battery';
  if (/temper|calent|refriger|radiador|termostato/.test(n)) return 'thermo';
  if (/aceite|lubric|filtro/.test(n)) return 'oil';
  if (/rueda|neum[aá]tic|llanta|vibra|alineaci/.test(n)) return 'tire';
  if (/humo|fuga|escape|fap|dpf|part[ií]cula/.test(n)) return 'cloud';
  if (/turbo|potencia|tir[oó]n|inyec|encend|motor|combusti/.test(n)) return 'engine';
  if (/direcci|suspensi|amortigu|direcc/.test(n)) return 'car';
  if (/luz|luces|bombilla/.test(n)) return 'zap';
  if (/aire|clima|ventil/.test(n)) return 'cloud';
  if (/cambio|transmis|embrague/.test(n)) return 'engine';
  return 'alert';
}

function productIcon(cat = '') {
  const c = String(cat).toLowerCase();
  if (c.includes('herramient')) return 'wrench';
  if (c.includes('diag')) return 'cpu';
  if (c.includes('maquin')) return 'engine';
  if (c.includes('quim') || c.includes('aceit') || c.includes('liquid')) return 'oil';
  if (c.includes('repuest') || c.includes('piez')) return 'tire';
  return 'cart';
}

function severityClass(value) {
  const v = String(value || 'media').toLowerCase();
  if (v.includes('alta')) return 'alta';
  if (v.includes('baja')) return 'baja';
  return 'media';
}

// -------------------------------------------------------------
// NAVEGACIÓN Y VISTAS
// -------------------------------------------------------------
function showView(name) {
  if (!name || !document.getElementById(`view-${name}`)) name = 'home';
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
  $$('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  const nav = $('#nav');
  if (nav) nav.classList.remove('open');
  if (menuBtn) {
    menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', 'Abrir menú');
  }
  if (location.hash.slice(1) !== name) {
    history.replaceState(null, '', `#${name}`);
  }
  document.dispatchEvent(new CustomEvent('viewchange', { detail: { name } }));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

$$('[data-view]').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

function goToTutorials(params = {}) {
  if (typeof window.openTutorialSearch === 'function') window.openTutorialSearch(params);
  else showView('tutoriales');
}

const menuBtn = $('#menuBtn');
if (menuBtn) {
  menuBtn.addEventListener('click', () => {
    const nav = $('#nav');
    if (!nav) return;
    const open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  });
}

// -------------------------------------------------------------
// BASE DE DATOS DE VEHÍCULOS (Selector interactivo fiable)
// -------------------------------------------------------------
const VEHICLE_DB = {
  Audi: {
    A3: ['1.6 TDI 105/115 CV', '2.0 TDI 140/150/184 CV', '1.4 TFSI 125/150 CV', '2.0 TFSI 190 CV'],
    A4: ['2.0 TDI 120/143/177/190 CV', '3.0 TDI V6 240/272 CV', '2.0 TFSI 180/211/252 CV'],
    A6: ['2.0 TDI 177/190 CV', '3.0 TDI V6 204/245/313 CV', '2.0 TFSI 252 CV']
  },
  BMW: {
    'Serie 1': ['116d 1.5/2.0d', '118d 2.0d 143/150 CV', '120d 2.0d 177/190 CV', '118i 1.5 Turbo'],
    'Serie 3': ['318d 2.0d 143/150 CV', '320d 2.0d 163/177/184/190 CV', '330d 3.0d 6L', '320i 2.0 Turbo'],
    'Serie 5': ['520d 2.0d 177/184/190 CV', '530d 3.0d 235/245/258 CV', '530i 2.0/3.0 Turbo']
  },
  Citroën: {
    C3: ['1.4 HDi 70 CV', '1.6 BlueHDi 75/100 CV', '1.2 PureTech 82/110 CV'],
    C4: ['1.6 HDi 92/110/115 CV', '2.0 HDi 136/150 CV', '1.2 PureTech 130 CV'],
    Berlingo: ['1.6 HDi 75/90/115 CV', '1.5 BlueHDi 100/130 CV', '1.2 PureTech 110 CV']
  },
  Ford: {
    Fiesta: ['1.4 TDCi 68 CV', '1.5 TDCi 75/85/120 CV', '1.0 EcoBoost 100/125 CV'],
    Focus: ['1.5 TDCi 95/120 CV', '1.6 TDCi 90/109/115 CV', '2.0 TDCi 136/150/185 CV', '1.0 EcoBoost 125 CV'],
    Mondeo: ['2.0 TDCi 130/140/150/180 CV', '2.2 TDCi 175/200 CV', '1.5 EcoBoost 160 CV']
  },
  'Mercedes-Benz': {
    'Clase A': ['A 180 CDI 109 CV', 'A 200 CDI 136 CV', 'A 220 CDI 170 CV', 'A 200 Gasolina 156 CV'],
    'Clase C': ['C 200 CDI 136 CV', 'C 220 CDI 170 CV', 'C 250 CDI 204 CV', 'C 200 Gasolina 184 CV'],
    'Clase E': ['E 220 CDI 170/194 CV', 'E 250 CDI 204 CV', 'E 350 CDI V6 231/258 CV']
  },
  Opel: {
    Corsa: ['1.3 CDTI 75/90/95 CV', '1.2 Gasolina 75/85 CV', '1.4 Gasolina 90/100 CV'],
    Astra: ['1.6 CDTI 110/136 CV', '1.7 CDTI 100/110/125 CV', '1.4 Turbo 125/140 CV'],
    Insignia: ['2.0 CDTI 130/160/170 CV', '1.6 CDTI 120/136 CV', '1.5 Turbo 165 CV']
  },
  Peugeot: {
    '208': ['1.4 HDi 68 CV', '1.6 BlueHDi 75/100 CV', '1.2 PureTech 82/100 CV'],
    '308': ['1.6 HDi 92/115/120 CV', '2.0 BlueHDi 150/180 CV', '1.2 PureTech 110/130 CV'],
    Partner: ['1.6 HDi 75/90/115 CV', '1.5 BlueHDi 100/130 CV']
  },
  Renault: {
    Clio: ['1.5 dCi 68/75/85/90 CV', '0.9 TCe 90 CV', '1.2 16V 75 CV'],
    Mégane: ['1.5 dCi 85/105/110 CV', '1.6 dCi 130 CV', '1.9 dCi 120/130 CV', '1.3 TCe 140 CV'],
    Captur: ['1.5 dCi 90/110 CV', '0.9 TCe 90 CV', '1.3 TCe 130/150 CV']
  },
  SEAT: {
    Ibiza: ['1.4 TDI 75/80/90 CV', '1.6 TDI 90/95/105 CV', '1.9 TDI 100/130 CV', '1.0 TSI 95/115 CV'],
    León: ['1.6 TDI 105/110/115 CV', '1.9 TDI 105/150 CV', '2.0 TDI 140/150/184 CV', '1.4 TSI 125/150 CV', '1.5 TSI 130/150 CV'],
    Ateca: ['1.6 TDI 115 CV', '2.0 TDI 150/190 CV', '1.4 TSI 150 CV', '1.5 TSI 150 CV']
  },
  Toyota: {
    Yaris: ['1.4 D-4D 90 CV', '1.5 Hybrid 100/116 CV', '1.33 VVT-i 99 CV'],
    'Auris / Corolla': ['1.4 D-4D 90 CV', '2.0 D-4D 126 CV', '1.8 Hybrid 122/136 CV', '2.0 Hybrid 180 CV'],
    RAV4: ['2.0 D-4D 116/124/143 CV', '2.2 D-4D 136/150/177 CV', '2.5 Hybrid 197/218 CV']
  },
  Volkswagen: {
    Golf: ['1.6 TDI 105/110/115 CV', '1.9 TDI 90/105/130/150 CV', '2.0 TDI 140/150/184 CV', '1.4 TSI 122/140/150 CV', '2.0 TSI GTI 200/220/230/245 CV'],
    Polo: ['1.4 TDI 70/75/80/90 CV', '1.6 TDI 75/90/95 CV', '1.0 TSI 95/110 CV'],
    Passat: ['1.6 TDI 105/120 CV', '1.9 TDI 105/130 CV', '2.0 TDI 140/170/177/190/240 CV', '1.5 TSI 150 CV']
  }
};

let currentVehicle = { id: '', brand: '', model: '', engine: '' };

function setOptions(select, values, placeholder, selected = '') {
  if (!select) return;
  select.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  select.disabled = values.length === 0;
  if (selected && values.includes(selected)) select.value = selected;
}

function populateVehicleSelectors(brandSel, modelSel, engineSel, vehicle = {}) {
  if (!brandSel) return;
  setOptions(brandSel, Object.keys(VEHICLE_DB), 'Selecciona marca', vehicle.brand || '');
  const models = vehicle.brand && VEHICLE_DB[vehicle.brand] ? Object.keys(VEHICLE_DB[vehicle.brand]) : [];
  setOptions(modelSel, models, 'Selecciona modelo', vehicle.model || '');
  const engines = vehicle.brand && vehicle.model && VEHICLE_DB[vehicle.brand]?.[vehicle.model]
    ? VEHICLE_DB[vehicle.brand][vehicle.model]
    : [];
  setOptions(engineSel, engines, 'Selecciona motorización', vehicle.engine || '');
}

function wireVehicleSelectors(brandSel, modelSel, engineSel) {
  if (!brandSel || !modelSel || !engineSel) return;
  brandSel.addEventListener('change', () => {
    populateVehicleSelectors(brandSel, modelSel, engineSel, { brand: brandSel.value });
  });
  modelSel.addEventListener('change', () => {
    populateVehicleSelectors(brandSel, modelSel, engineSel, {
      brand: brandSel.value,
      model: modelSel.value
    });
  });
}

function setVehicleState(vehicle, origin = 'catalog') {
  if (!vehicle?.brand) return false;
  currentVehicle = {
    id: vehicle.id || '',
    brand: vehicle.brand || '',
    model: vehicle.model || '',
    engine: vehicle.engine || ''
  };

  const txt = [currentVehicle.brand, currentVehicle.model, currentVehicle.engine].filter(Boolean).join(' ');
  if (!txt) return false;

  const homeName = $('#homeVehicleName');
  if (homeName) homeName.textContent = txt;
  const homeHint = $('#homeVehicleHint');
  if (homeHint) homeHint.textContent = `Vehículo aplicado: ${txt}. Se usará en chat, informe y diagnóstico.`;

  const badge = $('#activeVehicleBadge');
  if (badge) {
    badge.textContent = `Vehículo activo para diagnóstico: ${txt}`;
    badge.classList.remove('hidden');
  }

  populateVehicleSelectors($('#catBrand'), $('#catModel'), $('#catEngine'), currentVehicle);
  populateVehicleSelectors($('#homeBrand'), $('#homeModel'), $('#homeEngine'), currentVehicle);

  const chatInfo = $('#chatVehicleInfo');
  if (chatInfo) {
    chatInfo.style.display = 'block';
    chatInfo.innerHTML = `<b>Vehículo seleccionado:</b> ${esc(txt)} <small>(se enviará automáticamente como contexto al Asistente IA)</small>`;
  }
  if ($('#fBrand') && currentVehicle.brand) $('#fBrand').value = currentVehicle.brand;
  if ($('#fModel') && currentVehicle.model) $('#fModel').value = currentVehicle.model;
  if ($('#fEngine') && currentVehicle.engine) $('#fEngine').value = currentVehicle.engine;

  if (origin === 'home') {
    const hint = $('#homeVehicleHint');
    if (hint) hint.textContent = `Vehículo fijado: ${txt}. Ya está disponible en toda la plataforma.`;
  }
  return true;
}

function initVehicleSelector() {
  const brandSel = $('#catBrand');
  const modelSel = $('#catModel');
  const engineSel = $('#catEngine');
  const filterBtn = $('#btnFiltrarCoche');
  if (!brandSel) return;

  populateVehicleSelectors(brandSel, modelSel, engineSel);
  wireVehicleSelectors(brandSel, modelSel, engineSel);

  filterBtn?.addEventListener('click', () => {
    const ok = setVehicleState({
      brand: brandSel.value,
      model: modelSel.value,
      engine: engineSel.value
    }, 'catalog');
    if (!ok) {
      const badge = $('#activeVehicleBadge');
      if (badge) {
        badge.textContent = 'Selecciona al menos la marca del vehículo.';
        badge.classList.remove('hidden');
      }
    }
  });
}

function initHomeVehicleSelector() {
  const brandSel = $('#homeBrand');
  const modelSel = $('#homeModel');
  const engineSel = $('#homeEngine');
  if (!brandSel) return;

  populateVehicleSelectors(brandSel, modelSel, engineSel);
  wireVehicleSelectors(brandSel, modelSel, engineSel);

  $('#homeApplyVehicle')?.addEventListener('click', () => {
    const ok = setVehicleState({
      brand: brandSel.value,
      model: modelSel.value,
      engine: engineSel.value
    }, 'home');
    const hint = $('#homeVehicleHint');
    if (!ok && hint) hint.textContent = 'Selecciona al menos la marca para fijar el vehículo.';
  });
}

// -------------------------------------------------------------
// ESTADÍSTICAS GLOBALES
// -------------------------------------------------------------
async function loadStats() {
  try {
    const s = await api('/api/stats');
    const setStat = (key, value) => {
      $$(`[data-stat="${key}"]`).forEach(el => {
        el.textContent = fmtNum(value);
      });
    };
    setStat('dtc', s.dtc || 9201);
    setStat('symptoms', s.symptoms || 0);
    setStat('products', s.products || 235);
    renderDataCharts(s);
  } catch (err) {
    console.warn('Error cargando estadísticas:', err.message);
  }
}

function renderDataCharts(s) {
  const severity = s.severity || {};
  const total = Number(s.dtc || 0) || 1;
  const high = Number(severity.Alta || 0);
  const mid = Number(severity.Media || 0);
  const low = Number(severity.Baja || 0);
  const pct = n => Math.round((n / total) * 100);

  const donut = $('#severityDonut');
  if (donut) {
    donut.style.background = `conic-gradient(
      #ff5d6c 0 ${pct(high)}%,
      #f39c12 ${pct(high)}% ${pct(high + mid)}%,
      #22d3ee ${pct(high + mid)}% 100%
    )`;
  }

  const legend = $('#severityLegend');
  if (legend) {
    legend.innerHTML = [
      ['#ff5d6c', 'Alta', high],
      ['#f39c12', 'Media', mid],
      ['#22d3ee', 'Baja', low]
    ].map(([color, label, count]) => `
      <div class="legend-row"><i style="background:${color}"></i><span>${label}</span><b>${fmtNum(count)}</b></div>
    `).join('');
  }

  const hero = $('#heroSeverity');
  if (hero) {
    hero.innerHTML = [
      ['Gravedad alta', high, '#ff5d6c'],
      ['Gravedad media', mid, '#f39c12'],
      ['Gravedad baja', low, '#22d3ee']
    ].map(([label, count]) => `
      <div class="hud-bar"><span>${label}</span><i style="--v:${pct(count)}%"></i><b>${fmtNum(count)}</b></div>
    `).join('');
  }

  const systems = Array.isArray(s.systems) ? s.systems.slice(0, 7) : [];
  const systemBox = $('#systemBars');
  if (systemBox && systems.length) {
    const max = Math.max(...systems.map(x => x.count)) || 1;
    systemBox.innerHTML = systems.map(x => `
      <div class="bar-row">
        <span>${esc(x.name)}</span><b>${fmtNum(x.count)}</b>
        <i style="--v:${Math.max(4, Math.round((x.count / max) * 100))}%"></i>
      </div>
    `).join('');
  }

  const cats = Array.isArray(s.productCategories) ? s.productCategories : [];
  const catBox = $('#productCats');
  if (catBox && cats.length) {
    catBox.innerHTML = cats.map(c => `
      <span class="cat-pill">${esc(c.name)} <b>${fmtNum(c.count)}</b></span>
    `).join('');
  }
}

// -------------------------------------------------------------
// BUSCADOR UNIVERSAL Y EXPLORADOR DE SISTEMAS
// -------------------------------------------------------------
let componentsCache = [];
let universalTimer = null;
let universalRequest = 0;

async function loadComponents() {
  const box = $('#componentHotspots');
  if (!box) return;
  try {
    componentsCache = await api('/api/components');
    const count = $('#diagSystemCount');
    if (count) count.textContent = componentsCache.length;
    renderComponentHotspots();
  } catch (err) {
    console.warn('No se pudieron cargar los sistemas del vehículo:', err.message);
  }
}

function renderComponentHotspots() {
  const box = $('#componentHotspots');
  if (!box) return;
  box.innerHTML = componentsCache.map(c => {
    const spot = c.hotspot || { x: 50, y: 50 };
    return `<button class="component-hotspot" type="button" data-component="${esc(c.id)}"
      style="--x:${Number(spot.x) || 50}%;--y:${Number(spot.y) || 50}%"
      aria-label="Explorar ${esc(c.name)}"><span>${esc(c.name)}</span></button>`;
  }).join('');

  $$('.component-hotspot').forEach(btn => {
    btn.addEventListener('click', () => openComponentPanel(btn.dataset.component));
  });
}

function closeComponentPanel() {
  const panel = $('#componentPanel');
  if (panel) panel.classList.add('hidden');
  panel?.closest('.hero')?.classList.remove('component-open');
  $$('.component-hotspot').forEach(b => b.classList.remove('active'));
}

function openComponentPanel(id) {
  const component = componentsCache.find(c => c.id === id);
  const panel = $('#componentPanel');
  if (!component || !panel) return;

  $('#componentName').textContent = component.name;
  $('#componentFunction').textContent = component.function || '';
  $('#componentSystem').textContent = component.system || 'Sistema';
  $('#componentSymptoms').innerHTML = (component.symptoms || []).map(s => `<li>${esc(s)}</li>`).join('');
  $('#componentChecks').innerHTML = (component.checks || []).map(s => `<li>${esc(s)}</li>`).join('');

  panel.classList.remove('hidden');
  panel.closest('.hero')?.classList.add('component-open');
  $$('.component-hotspot').forEach(b => b.classList.toggle('active', b.dataset.component === id));

  const symptomBtn = $('#componentSymptomBtn');
  if (symptomBtn) symptomBtn.onclick = () => {
    showView('diagnostico');
    openSymptomSearch(component.name);
  };

  const tutorialBtn = $('#componentTutorialBtn');
  if (tutorialBtn) tutorialBtn.onclick = () => {
    goToTutorials({ q: component.tutorialQuery || component.name, component: component.name });
  };

  const iaBtn = $('#componentIaBtn');
  if (iaBtn) iaBtn.onclick = () => {
    showView('chat');
    if (chatInput) {
      chatInput.value = `Quiero revisar el sistema ${component.name} del vehículo. ${component.function} ¿Qué comprobaciones debo hacer antes de sustituir piezas?`;
      chatInput.focus();
    }
  };
}

function filterSymptoms(query) {
  setDiagTab('symptoms');
  symptomQuery = String(query || '');
  applySymptomFilters();
}

function openSymptomSearch(term) {
  symptomCategory = 'Todos';
  renderSymptomFilters();
  const input = $('#symptomSearch');
  if (input) input.value = term;
  filterSymptoms(term);
}

function setDiagTab(tab = 'symptoms') {
  const solutions = tab === 'solutions';
  $('#diagSymptoms')?.classList.toggle('hidden', solutions);
  $('#diagSolutions')?.classList.toggle('hidden', !solutions);
  $$('.diag-tab').forEach(b => {
    const active = b.dataset.diagTab === (solutions ? 'solutions' : 'symptoms');
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  });
  if (solutions) renderSolutions($('#solutionSearch')?.value || '');
}

function solutionSearchText(c) {
  return [
    c.name, c.system, c.function,
    ...(c.symptoms || []),
    ...(c.commonFaults || []),
    ...(c.checks || []),
    ...(c.tools || [])
  ].join(' ').toLowerCase();
}

async function renderSolutions(query = '') {
  const grid = $('#solutionGrid');
  if (!grid) return;
  if (!componentsCache.length) {
    try {
      componentsCache = await api('/api/components');
    } catch (err) {
      grid.innerHTML = `<div class="notice" style="grid-column:1/-1;">No se pudieron cargar las soluciones: ${esc(err.message)}</div>`;
      return;
    }
  }
  const q = String(query || '').toLowerCase().trim();
  const list = q ? componentsCache.filter(c => solutionSearchText(c).includes(q)) : componentsCache;
  const count = $('#solutionCount');
  if (count) count.textContent = `${list.length} de ${componentsCache.length} sistemas`;
  if (!list.length) {
    grid.innerHTML = '<div class="notice" style="grid-column:1/-1;">No hay sistemas que coincidan con la búsqueda.</div>';
    return;
  }
  grid.innerHTML = list.map(c => {
    const faults = (c.commonFaults || []).slice(0, 4);
    const checks = (c.checks || []).slice(0, 4);
    const dtcs = (c.relatedDtc || []).slice(0, 4);
    return `
      <article class="solution-card">
        <div class="solution-card-head">
          <span class="solution-ico">${icon(symptomIcon(c.name))}</span>
          <div>
            <span class="solution-system">${esc(c.system || 'Sistema')}</span>
            <h3>${esc(c.name)}</h3>
          </div>
        </div>
        <p class="solution-function">${esc(c.function || '')}</p>
        <div class="solution-cols">
          <section>
            <h4>Averías habituales</h4>
            <ul>${faults.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
          </section>
          <section>
            <h4>Comprobaciones</h4>
            <ol>${checks.map(x => `<li>${esc(x)}</li>`).join('')}</ol>
          </section>
        </div>
        ${dtcs.length ? `<div class="solution-dtc"><span>DTC de referencia</span>${dtcs.map(code => `<button class="chip" data-solution-dtc="${esc(code)}" type="button">${esc(code)}</button>`).join('')}</div>` : ''}
        <div class="solution-actions">
          <button class="btn primary sm" data-solution-symptoms="${esc(c.id)}" type="button">Ver síntomas</button>
          <button class="btn ghost sm" data-solution-tutorial="${esc(c.id)}" type="button">Tutoriales</button>
          <button class="btn ghost sm" data-solution-ai="${esc(c.id)}" type="button">Consultar IA</button>
        </div>
      </article>`;
  }).join('');

  $$('[data-solution-symptoms]').forEach(b => b.addEventListener('click', () => {
    const c = componentsCache.find(x => x.id === b.dataset.solutionSymptoms);
    if (!c) return;
    openSymptomSearch(c.name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $$('[data-solution-tutorial]').forEach(b => b.addEventListener('click', () => {
    const c = componentsCache.find(x => x.id === b.dataset.solutionTutorial);
    if (c) goToTutorials({ q: c.tutorialQuery || c.name, component: c.name });
  }));
  $$('[data-solution-ai]').forEach(b => b.addEventListener('click', () => {
    const c = componentsCache.find(x => x.id === b.dataset.solutionAi);
    if (!c) return;
    showView('chat');
    const value = `Explícame las comprobaciones para el sistema ${c.name} y cómo interpretar sus averías habituales.`;
    if (chatInput) chatInput.value = value;
    submitChat(value);
  }));
  $$('[data-solution-dtc]').forEach(b => b.addEventListener('click', () => {
    showView('dtc');
    const input = $('#dtcSearch');
    if (input) input.value = b.dataset.solutionDtc;
    searchDtc();
  }));
}

$$('.diag-tab').forEach(b => b.addEventListener('click', () => setDiagTab(b.dataset.diagTab)));
const solutionSearch = $('#solutionSearch');
if (solutionSearch) solutionSearch.addEventListener('input', e => renderSolutions(e.target.value));

function closeUniversalResults() {
  const box = $('#universalResults');
  const input = $('#universalSearch');
  if (box) box.classList.add('hidden');
  if (input) input.setAttribute('aria-expanded', 'false');
}

function positionUniversalResults() {
  const box = $('#universalResults');
  const wrap = $('.universal-search');
  if (!box || !wrap || box.classList.contains('hidden')) return;
  const rect = wrap.getBoundingClientRect();
  const width = Math.min(rect.width, window.innerWidth - 24);
  const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
  const below = window.innerHeight - rect.bottom - 16;
  const above = rect.top - 16;
  const openAbove = below < 220 && above > below;
  const maxHeight = Math.min(460, Math.max(180, openAbove ? above : below));
  box.style.left = `${left}px`;
  box.style.width = `${width}px`;
  box.style.maxHeight = `${maxHeight}px`;
  box.style.top = openAbove
    ? `${Math.max(12, rect.top - maxHeight - 8)}px`
    : `${rect.bottom + 8}px`;
}

function universalIcon(type) {
  return ({
    dtc: 'search',
    symptom: 'pulse',
    product: 'cart',
    tutorial: 'play',
    component: 'car',
    vehicle: 'car',
    tuning: 'zap',
    library: 'file',
    technical: 'file'
  })[type] || 'spark';
}

function renderUniversalResults(data) {
  const box = $('#universalResults');
  const input = $('#universalSearch');
  if (!box || !input) return;
  const groups = [
    ['dtc', 'Códigos DTC'],
    ['symptoms', 'Síntomas'],
    ['vehicles', 'Vehículos'],
    ['components', 'Sistemas del vehículo'],
    ['tutorials', 'Tutoriales'],
    ['products', 'Productos'],
    ['tuning', 'Tuning'],
    ['library', 'Dossiers de vehículo'],
    ['technical', 'Biblioteca técnica']
  ];
  const html = groups.map(([key, label]) => {
    const items = data.groups?.[key] || [];
    if (!items.length) return '';
    return `<div class="us-group">
      <div class="us-group-title"><span>${label}</span><span>${items.length}</span></div>
      ${items.map(item => `<button class="us-item" type="button" role="option" data-type="${esc(item.type)}" data-id="${esc(item.id)}" data-title="${esc(item.title)}">
        ${icon(universalIcon(item.type))}
        <span><b>${esc(item.title)}</b><small>${esc(item.subtitle || '')}</small></span>
        <em>${esc(item.meta || '')}</em>
      </button>`).join('')}
    </div>`;
  }).join('');

  box.innerHTML = html
    ? `${html}<div class="us-hint">Pulsa un resultado para abrirlo. Enter analiza la consulta completa.</div>`
    : '<div class="us-empty">Sin coincidencias en las bases locales. Prueba con un código, síntoma o nombre de sistema.</div>';
  box.classList.remove('hidden');
  input.setAttribute('aria-expanded', 'true');
  positionUniversalResults();

  [...box.querySelectorAll('.us-item')].forEach(btn => {
    btn.addEventListener('click', () => openUniversalResult(btn.dataset.type, btn.dataset.id, btn.dataset.title));
  });
}

async function runUniversalSearch(forceOpen = false) {
  const input = $('#universalSearch');
  if (!input) return;
  const q = input.value.trim();
  if (q.length < 2) {
    closeUniversalResults();
    return;
  }
  const request = ++universalRequest;
  try {
    const data = await api(`/api/search?q=${encodeURIComponent(q)}&limit=5`);
    if (request !== universalRequest) return;
    renderUniversalResults(data);
  } catch (err) {
    if (request !== universalRequest) return;
    const box = $('#universalResults');
    if (box && forceOpen) {
      box.innerHTML = `<div class="us-empty">No se pudo completar la búsqueda: ${esc(err.message)}</div>`;
      box.classList.remove('hidden');
    }
  }
}

async function openUniversalResult(type, id, title = '') {
  closeUniversalResults();
  if (type === 'dtc') {
    showView('dtc');
    const input = $('#dtcSearch');
    if (input) input.value = id;
    await searchDtc(id);
    return;
  }
  if (type === 'symptom') {
    showView('diagnostico');
    if (!symptomsCache.length) await loadSymptoms();
    const item = symptomsCache.find(s => s.id === id);
    const input = $('#symptomSearch');
    if (input) input.value = item?.name || title;
    if (item) renderSymptomDetail(item);
    else filterSymptoms(title);
    return;
  }
  if (type === 'component') {
    showView('home');
    if (!componentsCache.length) await loadComponents();
    openComponentPanel(id);
    return;
  }
  if (type === 'tutorial') {
    goToTutorials({ q: title });
    return;
  }
  if (type === 'vehicle') {
    showView('vehiculos');
    await loadVehicles();
    await openVehicleSheet(id, { scroll: true });
    return;
  }
  if (type === 'tuning') {
    showView('tuning');
    await loadTuning();
    openTuningPackage(id);
    return;
  }
  if (type === 'library') {
    showView('biblioteca');
    await loadLibrary();
    await openLibraryEntry(id, { scroll: true });
    return;
  }
  if (type === 'technical') {
    showView('biblioteca');
    await switchLibraryMode('technical');
    await openTechnicalEntry(id, { scroll: true });
    return;
  }
  if (type === 'product') {
    showView('productos');
    if (!productsCache.length) await loadProducts();
    renderProducts('Todos');
    const cards = $$('#productGrid .product');
    const target = cards.find(card => (card.querySelector('h3')?.textContent || '').trim() === title);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('search-hit');
      setTimeout(() => target.classList.remove('search-hit'), 2200);
    }
  }
}

function initUniversalSearch() {
  const input = $('#universalSearch');
  const button = $('#universalSearchBtn');
  const results = $('#universalResults');
  if (!input) return;
  if (results) document.body.appendChild(results);
  input.addEventListener('input', () => {
    clearTimeout(universalTimer);
    universalTimer = setTimeout(() => runUniversalSearch(false), 220);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) runUniversalSearch(false);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.trim();
      if (/^[PBCU]\d{4}$/i.test(q)) openUniversalResult('dtc', q.toUpperCase(), q);
      else runUniversalSearch(true);
    }
    if (e.key === 'Escape') closeUniversalResults();
  });
  button?.addEventListener('click', () => {
    const q = input.value.trim();
    if (/^[PBCU]\d{4}$/i.test(q)) openUniversalResult('dtc', q.toUpperCase(), q);
    else runUniversalSearch(true);
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.universal-search') && !e.target.closest('#universalResults')) closeUniversalResults();
  });
  window.addEventListener('resize', positionUniversalResults);
  window.addEventListener('scroll', closeUniversalResults, { passive: true });
  const close = $('#componentClose');
  if (close) close.addEventListener('click', closeComponentPanel);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeComponentPanel();
  });
}

// -------------------------------------------------------------
// VISTA: DIAGNÓSTICO POR SÍNTOMAS
// -------------------------------------------------------------
// -------------------------------------------------------------
let symptomsCache = [];
let symptomCategory = 'Todos';
let symptomQuery = '';

async function loadSymptoms() {
  const grid = $('#symptomGrid');
  if (!grid) return;
  try {
    grid.innerHTML = '<div style="color:var(--muted);grid-column:1/-1;">Cargando catálogo de síntomas...</div>';
    symptomsCache = await api('/api/symptoms');
    renderSymptomFilters();
    applySymptomFilters();
  } catch (err) {
    grid.innerHTML = `<div class="notice" style="grid-column:1/-1;">Error cargando síntomas: ${esc(err.message)}</div>`;
  }
}

function renderSymptomFilters() {
  const wrap = $('#symptomFilters');
  if (!wrap) return;
  const categories = [...new Map(symptomsCache.map(s => [s.categoryId, s.category])).entries()]
    .filter(([id, label]) => id && label);
  const options = [['Todos', 'Todos'], ...categories];
  wrap.innerHTML = options.map(([id, label]) => {
    const count = id === 'Todos' ? symptomsCache.length : symptomsCache.filter(s => s.categoryId === id).length;
    return `<button class="symptom-filter${symptomCategory === id ? ' active' : ''}" data-category="${esc(id)}" type="button" aria-pressed="${symptomCategory === id}">${esc(label)} <b>${count}</b></button>`;
  }).join('');
  wrap.querySelectorAll('.symptom-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      symptomCategory = btn.dataset.category || 'Todos';
      renderSymptomFilters();
      applySymptomFilters();
    });
  });
}

function applySymptomFilters() {
  const q = symptomQuery.toLowerCase().trim();
  let list = symptomsCache;
  if (symptomCategory !== 'Todos') list = list.filter(s => s.categoryId === symptomCategory);
  if (q) {
    list = list.filter(s =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.description || '').toLowerCase().includes(q) ||
      String(s.category || '').toLowerCase().includes(q) ||
      String(s.group || '').toLowerCase().includes(q) ||
      String(s.system || '').toLowerCase().includes(q)
    );
  }
  renderSymptomsGrid(list);
  const count = $('#symptomCount');
  const label = symptomCategory !== 'Todos' ? symptomsCache.find(s => s.categoryId === symptomCategory)?.category || symptomCategory : '';
  if (count) count.textContent = `${list.length} de ${symptomsCache.length} síntomas${label ? ` · ${label}` : ''}`;
  const detail = $('#symptomDetail');
  if (detail) detail.classList.add('hidden');
}

function renderSymptomsGrid(list) {
  const grid = $('#symptomGrid');
  if (!grid) return;

  if (!list.length) {
    const label = symptomCategory !== 'Todos' ? symptomsCache.find(s => s.categoryId === symptomCategory)?.category || symptomCategory : '';
    const scope = label ? ` en ${label}` : '';
    grid.innerHTML = `<div class="notice" style="grid-column:1/-1;">No se han encontrado síntomas coincidentes${esc(scope)}. Prueba con otra búsqueda o cambia de categoría.</div>`;
    return;
  }

  grid.innerHTML = list.map(s => `
    <button class="symptom" data-id="${esc(s.id)}" type="button">
      <span class="ico">${icon(symptomIcon(s.name || s.group))}</span>
      <em class="symptom-cat">${esc(s.area || s.category || s.group || 'Mecánica general')}</em>
      <b>${esc(s.name)}</b>
      <small>${esc(s.description)}</small>
    </button>
  `).join('');

  $$('.symptom').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = symptomsCache.find(x => x.id === btn.dataset.id);
      if (item) renderSymptomDetail(item);
    });
  });
}

const symptomSearch = $('#symptomSearch');
if (symptomSearch) {
  symptomSearch.addEventListener('input', e => {
    symptomQuery = e.target.value;
    applySymptomFilters();
  });
}

function likelihoodBadge(l) {
  const v = String(l || 'posible').toLowerCase();
  const cls = v.includes('frecuente') ? 'frecuente' : (v.includes('confirm') ? 'confirmada' : 'posible');
  return `<span class="badge-likelihood ${cls}">${esc(v)}</span>`;
}

function renderSymptomDetail(s) {
  const detail = $('#symptomDetail');
  if (!detail) return;

  const info = Array.isArray(s.relatedDtcInfo) && s.relatedDtcInfo.length
    ? s.relatedDtcInfo
    : (s.relatedDtc || []).map(code => ({ code, severity: '', title: '' }));

  const dtcChips = info.map(d => `
    <button class="chip dtc-chip-action" data-code="${esc(d.code)}" type="button" title="${esc(d.title || '')}">
      ${icon('search')} ${esc(d.code)}${d.severity ? ` · ${esc(d.severity)}` : ''}
    </button>
  `).join('');

  const causes = Array.isArray(s.causeDetails) && s.causeDetails.length
    ? s.causeDetails
    : (s.commonCauses || []).map(c => ({ likelihood: 'posible', text: c }));

  detail.classList.remove('hidden');
  detail.innerHTML = `
    <div class="detail-head">
      <div class="detail-title">
        <span class="detail-ico">${icon(symptomIcon(s.name))}</span>
        <div>
          <span class="eyebrow">DIAGNÓSTICO POR SÍNTOMA</span>
          <h3>${esc(s.name)}</h3>
        </div>
      </div>
      <span class="sev-pill ${severityClass(s.urgency)}">Urgencia ${esc(s.urgency || 'Media')}</span>
    </div>

    <p class="detail-desc">${esc(s.description)}</p>
    <div class="detail-meta">
      <span class="tag">${icon('shield')} Riesgo al volante: ${esc(s.driveRisk || 'No determinado')}</span>
      ${s.area ? `<span class="tag">${icon('filter')} ${esc(s.area)}</span>` : ''}
      ${s.category ? `<span class="tag">${icon('filter')} ${esc(s.category)}</span>` : ''}
      <span class="tag">${icon('alert')} Comprueba antes de sustituir</span>
    </div>
    <p class="detail-note">${esc(s.referenceNote || 'Ámbito genérico del síntoma. Las relaciones DTC se derivan de la base local y no confirman compatibilidad por marca, modelo o motor.')}</p>
    ${s.source ? `<p class="detail-note">Fuente: ${esc(s.source)}${s.validationStatus ? ` · Estado: ${esc(s.validationStatus.replaceAll('_', ' '))}` : ''}</p>` : ''}

    <div class="detail-grid">
      <section class="detail-block">
        <h4>${icon('alert')} Posibles causas / averías</h4>
        <p class="detail-note">Las causas son hipótesis hasta confirmarse con una prueba física. El código DTC solo confirma que la ECU registró el fallo.</p>
        <ul class="cause-list">
          ${causes.map(c => `<li>${likelihoodBadge(c.likelihood)}<span>${esc(c.text || c)}</span></li>`).join('')}
        </ul>
      </section>
      <section class="detail-block">
        <h4>${icon('pulse')} Comprobaciones paso a paso</h4>
        <ol class="check-list">
          ${(s.quickChecks || []).map(c => `<li>${esc(c)}</li>`).join('')}
        </ol>
      </section>
    </div>

    ${Array.isArray(s.tools) && s.tools.length ? `
      <section class="detail-block">
        <h4>${icon('wrench')} Herramientas necesarias</h4>
        <ul class="check-list">${s.tools.map(t => `<li>${esc(t)}</li>`).join('')}</ul>
      </section>
    ` : ''}

    <section class="detail-block">
      <h4>${icon('wrench')} Solución recomendada</h4>
      <ul class="check-list">
        ${(s.solutions || []).map(c => `<li>${esc(c)}</li>`).join('')}
      </ul>
    </section>

    ${dtcChips ? `
      <div class="detail-dtc">
        <strong>Códigos OBD/DTC comúnmente asociados · pulsa para abrirlos</strong>
        <div class="chips">${dtcChips}</div>
      </div>
    ` : ''}

    <div class="detail-actions">
      <button class="btn primary btn-consultar-ia-sintoma" type="button">
        ${icon('chat')} Consultar este síntoma con el Asistente IA
      </button>
      <button class="btn ghost btn-tutorial-sintoma" type="button">
        ${icon('play')} Ver tutoriales de este síntoma
      </button>
      <button class="btn ghost btn-informe-sintoma" type="button">
        ${icon('file')} Traspasar a Informe
      </button>
    </div>
  `;

  $$('.dtc-chip-action').forEach(b => {
    b.addEventListener('click', () => {
      showView('dtc');
      const dtcIn = $('#dtcSearch');
      if (dtcIn) dtcIn.value = b.dataset.code;
      searchDtc();
    });
  });

  const btnIa = detail.querySelector('.btn-consultar-ia-sintoma');
  if (btnIa) {
    btnIa.addEventListener('click', () => {
      showView('chat');
      if (chatInput) chatInput.value = `Tengo este síntoma en el coche: ${s.name}. ${s.description}`;
      submitChat(chatInput?.value || `Tengo este síntoma en el coche: ${s.name}`);
    });
  }

  const btnTutoriales = detail.querySelector('.btn-tutorial-sintoma');
  if (btnTutoriales) {
    btnTutoriales.addEventListener('click', () => {
      goToTutorials({ q: s.name, symptom: s.name });
    });
  }

  const btnInf = detail.querySelector('.btn-informe-sintoma');
  if (btnInf) {
    btnInf.addEventListener('click', () => {
      showView('informe');
      const fSym = $('#fSymptoms');
      if (fSym) fSym.value = `${s.name}: ${s.description}`;
    });
  }

  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// -------------------------------------------------------------
// VISTA: BUSCADOR DE CÓDIGOS DTC
// -------------------------------------------------------------
async function searchDtc(overrideQ = null, overridePrefix = null) {
  const resultsContainer = $('#dtcResults');
  if (!resultsContainer) return;

  const q = overrideQ !== null ? overrideQ : ($('#dtcSearch')?.value || '').trim();
  const prefix = overridePrefix || '';

  resultsContainer.innerHTML = '<div style="color:var(--muted);padding:15px;">Buscando en la base de datos de 9.201 códigos...</div>';

  try {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (prefix) params.set('prefix', prefix);
    params.set('limit', '80');

    const list = await api(`/api/dtc?${params.toString()}`);

    if (!list.length) {
      resultsContainer.innerHTML = `
        <div class="notice">
          No se ha encontrado ningún código DTC con el criterio <b>"${esc(q || prefix)}"</b>.<br>
          <small>Prueba buscando por código sin espacios (ej. P0300) o términos generales como turbo, inyección, lambda, ABS...</small>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = list.map(d => `
      <article class="result">
        <div class="result-head">
          <div class="result-id">
            <span class="code">${esc(d.code)}</span>
            <span class="tag">${icon('cpu')} ${esc(d.system || 'Gestión del motor')}</span>
          </div>
          <span class="sev-pill ${severityClass(d.severity)}">Gravedad ${esc(d.severity || 'Media')}</span>
        </div>
        <b class="result-title">${esc(d.title)}</b>
        <p class="result-desc">${esc(d.description)}</p>

        <details>
          <summary>Ver procedimiento de comprobación y causas</summary>
          <div class="result-details">
            <div>
              <h5>${icon('pulse')} Comprobaciones</h5>
              <ol>
                ${(d.checks || []).map(c => `<li>${esc(c.text || c)}</li>`).join('')}
              </ol>
            </div>
            <div>
              <h5>${icon('alert')} Causas más frecuentes</h5>
              <ul>
                ${(d.causes || []).map(c => `<li>${likelihoodBadge(c.likelihood)}${esc(c.text || c)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </details>

        <div class="result-actions">
          <button class="btn ghost btn-dtc-to-chat" data-code="${esc(d.code)}" data-title="${esc(d.title)}" type="button">
            ${icon('chat')} Analizar ${esc(d.code)} con IA
          </button>
          <button class="btn ghost btn-dtc-to-tutorials" data-code="${esc(d.code)}" data-title="${esc(d.title)}" type="button">
            ${icon('play')} Ver tutoriales
          </button>
          <button class="btn ghost btn-dtc-to-report" data-code="${esc(d.code)}" type="button">
            ${icon('file')} Agregar a Informe
          </button>
        </div>
      </article>
    `).join('');

    $$('.btn-dtc-to-chat').forEach(b => {
      b.addEventListener('click', () => {
        showView('chat');
        submitChat(`¿Cómo solucionar el código ${b.dataset.code} (${b.dataset.title})?`);
      });
    });

    $$('.btn-dtc-to-tutorials').forEach(b => {
      b.addEventListener('click', () => {
        goToTutorials({ q: b.dataset.code, dtc: b.dataset.code });
      });
    });

    $$('.btn-dtc-to-report').forEach(b => {
      b.addEventListener('click', () => {
        showView('informe');
        const dtcField = $('#fDtc');
        if (dtcField) {
          dtcField.value = dtcField.value ? `${dtcField.value}, ${b.dataset.code}` : b.dataset.code;
        }
      });
    });

  } catch (err) {
    resultsContainer.innerHTML = `<div class="notice">Error al consultar códigos DTC: ${esc(err.message)}</div>`;
  }
}

const dtcBtn = $('#dtcSearchBtn');
if (dtcBtn) dtcBtn.addEventListener('click', () => searchDtc());

const dtcInput = $('#dtcSearch');
if (dtcInput) {
  dtcInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchDtc();
  });
}

$$('.dtc-quick').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.q) {
      if (dtcInput) dtcInput.value = b.dataset.q;
      searchDtc(b.dataset.q);
    } else if (b.dataset.prefix) {
      if (dtcInput) dtcInput.value = '';
      searchDtc('', b.dataset.prefix);
    }
  });
});

// -------------------------------------------------------------
// VISTA: CATÁLOGO DE PRODUCTOS Y HERRAMIENTAS
// -------------------------------------------------------------
let productsCache = [];

async function loadProducts() {
  const grid = $('#productGrid');
  if (!grid) return;
  try {
    grid.innerHTML = '<div style="color:var(--muted);grid-column:1/-1;">Cargando catálogo de herramientas...</div>';
    productsCache = await api('/api/products');
    renderProducts('Todos');
  } catch (err) {
    grid.innerHTML = `<div class="notice" style="grid-column:1/-1;">Error cargando productos: ${esc(err.message)}</div>`;
  }
}

function renderProducts(category) {
  const grid = $('#productGrid');
  if (!grid) return;

  let list = productsCache;
  if (category && category !== 'Todos') {
    list = list.filter(p => String(p.category || '').toLowerCase() === category.toLowerCase());
  }

  if (!list.length) {
    grid.innerHTML = '<div class="notice" style="grid-column:1/-1;">No hay artículos disponibles en este departamento.</div>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const link = (p.linkStatus === 'verified' && p.affiliateUrl) ? p.affiliateUrl : '';
    const hasRealLink = /^https?:\/\//i.test(link);
    const hasImage = p.imageStatus === 'verified' && !!p.image;

    const media = hasImage
      ? `<img class="product-photo" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
      : `<span class="product-placeholder" title="Foto pendiente: no hay imagen verificada del vendedor">${icon(productIcon(p.category))}<b>Foto pendiente</b></span>`;

    const cta = hasRealLink
      ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Ver oferta ${icon('external')}</a>`
      : `<span class="btn ghost" title="Enlace pendiente: no se localizó una ficha de vendedor verificada">Enlace pendiente ${icon('search')}</span>`;

    return `
      <article class="product">
        <div class="product-media">${media}</div>
        <div class="product-body">
          <div class="product-badges">
            <span class="product-badge ${hasImage ? 'verified' : 'pending'}">${hasImage ? 'Foto verificada' : 'Foto pendiente'}</span>
            <span class="product-badge ${hasRealLink ? 'verified' : 'pending'}">${hasRealLink ? 'Enlace verificado' : 'Enlace pendiente'}</span>
          </div>
          <small class="product-cat">${esc(p.category || 'Taller')}${p.subcategory ? ` · ${esc(p.subcategory)}` : ''}</small>
          <h3>${esc(p.name)}</h3>
          <small class="product-brand">${esc(p.manufacturer || 'Fabricante no confirmado')}${p.asin ? ` · ASIN ${esc(p.asin)}` : ''}</small>
          <p>${esc(p.description)}</p>
          <div class="product-foot">
            <span class="product-price"><small>Precio</small>${esc(p.price || 'Consultar')}</span>
            ${cta}
          </div>
          <button class="product-sheet-link" type="button" data-product-id="${esc(p.id)}">Ver ficha y compatibilidad ${icon('arrow')}</button>
        </div>
      </article>
    `;
  }).join('');

  const status = $('#catalogStatus');
  if (status) {
    const photos = productsCache.filter(p => p.imageStatus === 'verified' && p.image).length;
    const links = productsCache.filter(p => p.linkStatus === 'verified' && /^https?:\/\//i.test(p.affiliateUrl || '')).length;
    const pending = productsCache.length - Math.max(photos, links);
    status.innerHTML = `<span><b>${fmtNum(productsCache.length)}</b> artículos</span>
      <span class="ok"><i></i><b>${fmtNum(photos)}</b> fotos verificadas</span>
      <span class="ok"><i></i><b>${fmtNum(links)}</b> enlaces verificados</span>
      <span class="warn"><i></i><b>${fmtNum(Math.max(0, pending))}</b> fichas pendientes de verificación</span>`;
  }

  $$('#productGrid [data-product-id]').forEach(btn => {
    btn.addEventListener('click', () => openProductSheet(btn.dataset.productId));
  });
}

$$('.cat-tab').forEach(b => {
  b.addEventListener('click', () => {
    $$('.cat-tab').forEach(x => {
      x.classList.remove('active');
      x.setAttribute('aria-selected', 'false');
    });
    b.classList.add('active');
    b.setAttribute('aria-selected', 'true');
    renderProducts(b.dataset.cat);
  });
});

// -------------------------------------------------------------
// VISTA: CHAT DE DIAGNÓSTICO IA
// -------------------------------------------------------------
const chatForm = $('#chatForm');
const chatInput = $('#chatInput');
const chatBox = $('#chatBox');
const chatRecomendados = $('#chatRecomendados');
const chatForumRefs = $('#chatForumRefs');
const chatTechnicalRefs = $('#chatTechnicalRefs');
let chatBusy = false;

function addBubble(content, type = 'assistant', isHtml = false) {
  if (!chatBox) return null;
  const bubble = document.createElement('div');
  bubble.className = `bubble ${type}`;
  if (isHtml) {
    bubble.innerHTML = content;
  } else {
    bubble.textContent = content;
  }
  chatBox.appendChild(bubble);
  chatBox.scrollTop = chatBox.scrollHeight;
  return bubble;
}

async function submitChat(text) {
  const query = String(text || '').trim();
  if (!query || chatBusy) return;
  chatBusy = true;
  const chatSubmit = chatForm?.querySelector('button[type="submit"]');
  if (chatSubmit) chatSubmit.disabled = true;
  if (chatInput) chatInput.value = '';

  addBubble(query, 'user');
  if (chatRecomendados) chatRecomendados.innerHTML = '';
  if (chatForumRefs) chatForumRefs.innerHTML = '';
  if (chatTechnicalRefs) chatTechnicalRefs.innerHTML = '';

  const thinkingBubble = addBubble('<i></i><i></i><i></i>', 'assistant typing', true);

  try {
    const reqStart = Date.now();
    const payload = {
      message: query,
      context: {
        vehicleId: currentVehicle.id,
        brand: currentVehicle.brand,
        model: currentVehicle.model,
        engine: currentVehicle.engine
      }
    };

    const res = await api('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (thinkingBubble) thinkingBubble.remove();
    const fromAI = res.source === 'ai_provider' || res.source === 'gemini_ai';
    const aiLabel = res.provider_label ? `Respuesta generada por IA (${esc(res.provider_label)}).` : 'Respuesta generada por IA.';
    const meta = fromAI
      ? `<small style="color:var(--muted);display:block;margin-top:6px;">${aiLabel}</small>`
      : '<small style="color:var(--muted);display:block;margin-top:6px;">Respuesta del motor experto local.</small>';
    addBubble(formatMarkdown(res.reply) + meta, 'assistant', true);

    if (Array.isArray(res.forum_references) && res.forum_references.length && chatForumRefs) {
      chatForumRefs.innerHTML = `
        <div class="panel recommended-panel">
          <div class="panel-head">
            <div><span class="eyebrow">CONOCIMIENTO DEL FORO</span><h3>Casos reales relacionados</h3></div>
            <span class="tag">${icon('forum')} Referencias internas</span>
          </div>
          <div class="forum-reference-list">
            ${res.forum_references.map(ref => `
              <button class="forum-reference" type="button" data-forum-ref="${ref.id}">
                <span class="forum-ref">${esc(ref.ref)} · ${esc(ref.confidence)}</span>
                <strong>${esc(ref.title)}</strong>
                <small>${esc(ref.vehicle || 'Vehículo no indicado')} · ${(ref.dtcs || []).map(esc).join(', ') || 'Sin DTC'}</small>
              </button>`).join('')}
          </div>
          <p class="forum-note">Solo se muestran casos guardados en esta instalación. La confianza depende de la coincidencia y de si la solución está verificada.</p>
        </div>`;
    }

    if (Array.isArray(res.technical_references) && res.technical_references.length && chatTechnicalRefs) {
      chatTechnicalRefs.innerHTML = `
        <div class="panel recommended-panel">
          <div class="panel-head">
            <div><span class="eyebrow">BIBLIOTECA TÉCNICA</span><h3>Referencias locales consultadas</h3></div>
            <span class="tag">${icon('db')} ${res.technical_references.length} referencias</span>
          </div>
          <div class="forum-reference-list">
            ${res.technical_references.map(ref => `
              <button class="forum-reference" type="button" data-chat-tech="${esc(ref.id)}">
                <span class="forum-ref">${esc(ref.category || 'Biblioteca')} · ${esc(ref.type || 'Documento')}</span>
                <strong>${esc(ref.title)}</strong>
                <small>${technicalStatusBadge(ref.status)} ${(ref.sourceNames || []).map(esc).join(', ') || 'Sin fuente externa registrada'}</small>
              </button>`).join('')}
          </div>
          <p class="forum-note">Referencias trazables de la biblioteca local. Su estado indica si el dato está verificado, revisado, es genérico o solo enlaza a una fuente externa.</p>
        </div>`;
      chatTechnicalRefs.querySelectorAll('[data-chat-tech]').forEach(button => {
        button.addEventListener('click', async () => {
          showView('biblioteca');
          await switchLibraryMode('technical');
          await openTechnicalEntry(button.dataset.chatTech, { scroll: true });
        });
      });
    }

    if (Array.isArray(res.productos_recomendados) && res.productos_recomendados.length && chatRecomendados) {
      const groupLabels = {
        herramienta: 'Herramientas y equipos',
        diagnostico: 'Diagnóstico',
        repuesto: 'Repuestos',
        limpieza_quimico: 'Limpieza y químicos',
        mantenimiento: 'Mantenimiento'
      };
      const groups = {};
      res.productos_recomendados.forEach(prod => {
        const key = prod.group || prod.productType || 'herramienta';
        if (!groups[key]) groups[key] = [];
        groups[key].push(prod);
      });
      const order = ['herramienta', 'diagnostico', 'repuesto', 'limpieza_quimico', 'mantenimiento'];
      const grouped = order.filter(k => groups[k] && groups[k].length).map(k => `
        <div class="recommended-group">
          <h4>${groupLabels[k] || 'Productos'}</h4>
          ${groups[k].map(prod => {
            const link = (prod.linkStatus === 'verified' && prod.affiliateUrl) ? prod.affiliateUrl : '';
            const hasLink = /^https?:\/\//i.test(link);
            const hasImage = prod.imageStatus === 'verified' && !!prod.image;
            const media = hasImage
              ? `<img class="recommended-photo" src="${esc(prod.image)}" alt="${esc(prod.name)}" loading="lazy">`
              : `<span class="recommended-ico" title="Foto pendiente">${icon(productIcon(prod.category))}</span>`;
            const note = prod.compatibilityNote || prod.reason || 'Comprueba la compatibilidad antes de comprar.';
            const inner = `
              ${media}
              <span class="recommended-info">
                <b>${esc(prod.name)}</b>
                <small>${esc(prod.price || 'Consultar')}${hasLink ? '' : ' · Enlace pendiente'}</small>
                <em>${esc(note)}</em>
              </span>
              ${hasLink ? icon('external') : icon('search')}
            `;
            return hasLink
              ? `<a class="recommended-item" href="${esc(link)}" target="_blank" rel="noopener noreferrer" title="${esc(note)}">${inner}</a>`
              : `<span class="recommended-item pending" title="${esc(note)}">${inner}</span>`;
          }).join('')}
        </div>
      `).join('');
      chatRecomendados.innerHTML = `
        <div class="panel recommended-panel">
          <div class="panel-head">
            <div><span class="eyebrow">PRODUCTOS RECOMENDADOS</span><h3>Según la avería y el vehículo</h3></div>
            <span class="tag">${icon('wrench')} Del catálogo</span>
          </div>
          <div class="recommended-list">
            ${grouped}
          </div>
        </div>
      `;
    }
  } catch (err) {
    if (thinkingBubble) thinkingBubble.remove();
    addBubble(`No se pudo completar la consulta (${err.message}). Comprueba la conexión e inténtalo de nuevo.`, 'assistant');
  } finally {
    chatBusy = false;
    if (chatSubmit) chatSubmit.disabled = false;
  }
}

if (chatForm) {
  chatForm.addEventListener('submit', e => {
    e.preventDefault();
    submitChat(chatInput?.value || '');
  });
}

$$('.chat-suggestions .chip[data-prompt]').forEach(btn => {
  btn.addEventListener('click', () => submitChat(btn.dataset.prompt));
});

// -------------------------------------------------------------
// VISTA: GENERADOR DE INFORMES TÉCNICOS
// -------------------------------------------------------------
const generateReportBtn = $('#generateReport');
const printReportBtn = $('#printReport');
const reportArticle = $('#report');

if (generateReportBtn) {
  generateReportBtn.addEventListener('click', () => {
    const brand = ($('#fBrand')?.value || currentVehicle.brand || '').trim();
    const model = ($('#fModel')?.value || currentVehicle.model || '').trim();
    const year = ($('#fYear')?.value || '').trim();
    const engine = ($('#fEngine')?.value || currentVehicle.engine || '').trim();
    const km = ($('#fKm')?.value || '').trim();
    const dtc = ($('#fDtc')?.value || '').trim();
    const symptoms = ($('#fSymptoms')?.value || '').trim();

    const vehicleTitle = [brand, model, year].filter(Boolean).join(' ') || 'Vehículo no especificado';
    const now = new Date().toLocaleString('es-ES', {
      dateStyle: 'full',
      timeStyle: 'short'
    });

    if (reportArticle) {
      const reportId = `DM-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Date.now()).slice(-4)}`;
      reportArticle.style.display = 'block';
      reportArticle.innerHTML = `
        <div class="report-head">
          <div class="report-brand">
            <span class="report-logo">${icon('logo')}</span>
            <div>
              <h2>INFORME TÉCNICO DE DIAGNÓSTICO</h2>
              <small>Diagnóstico y Mecánica · Plataforma automotriz profesional</small>
            </div>
          </div>
          <div class="report-ref">
            <b>${esc(reportId)}</b>
            <span>${esc(now)}</span>
          </div>
        </div>

        <div class="report-meta">
          <div><b>Vehículo</b><span>${esc(vehicleTitle)}</span></div>
          <div><b>Motorización</b><span>${esc(engine || 'No indicada')}</span></div>
          <div><b>Kilómetros</b><span>${esc(km || 'No indicados')}</span></div>
          <div><b>Códigos DTC</b><span>${esc(dtc || 'Sin código registrado')}</span></div>
        </div>

        <section class="report-sec">
          <h3>01 · Síntomas y observaciones</h3>
          <p>${esc(symptoms || 'No se detallaron síntomas.')}</p>
        </section>

        <section class="report-sec">
          <h3>02 · Códigos de avería registrados</h3>
          <p>${dtc
            ? `Se han comunicado los siguientes códigos: ${esc(dtc)}. Cada código debe interpretarse junto con los parámetros en vivo y las comprobaciones físicas del sistema afectado.`
            : 'No se han comunicado códigos DTC. El diagnóstico se basa en los síntomas descritos y requiere lectura OBD para confirmar el sistema afectado.'}</p>
        </section>

        <section class="report-sec">
          <h3>03 · Protocolo de verificación recomendado</h3>
          <ol class="report-checks">
            <li>Lectura de códigos DTC y parámetros en vivo con escáner OBD.</li>
            <li>Inspección visual del sistema afectado y de sus conexiones.</li>
            <li>Medición de alimentación, masas y señales con multímetro u osciloscopio.</li>
            <li>Confirmación de la causa con una prueba física antes de sustituir piezas.</li>
            <li>Prueba final tras la reparación y borrado controlado de códigos.</li>
          </ol>
        </section>

        <section class="report-sec report-dictamen">
          <h3>04 · Dictamen de comprobación técnica</h3>
          <p>Este documento refleja una valoración técnica orientativa basada en los datos comunicados. Las causas y anomalías indicadas deben verificarse mediante pruebas físicas de taller (medición con multímetro, parámetros OBD en vivo y comprobación mecánica de componentes) antes de proceder a la sustitución de piezas.</p>
        </section>

        <div class="report-sign">
          <div><span>Firma del técnico responsable / taller</span></div>
          <div><span>Firma del cliente</span></div>
        </div>

        <div class="report-foot">
          <span>Diagnóstico y Mecánica · ${esc(reportId)}</span>
          <span>Documento generado el ${esc(now)}</span>
        </div>
      `;

      reportArticle.scrollIntoView({ behavior: 'smooth' });
    }
  });
}

if (printReportBtn) {
  printReportBtn.addEventListener('click', () => {
    if (!reportArticle || reportArticle.style.display === 'none') {
      if (generateReportBtn) generateReportBtn.click();
    }
    window.print();
  });
}

// -------------------------------------------------------------
// VISTA: LECTURA OBD-II / ELM327
// -------------------------------------------------------------
const obdState = { connected: false, reading: false, live: false, dtcs: [], telemetry: {}, mode: 'simulated' };
let obdManager = null;

const telemetryHistory = { points: [], max: 48 };

function telemetrySource() {
  if (!obdState.connected) return { label: 'SIN CONEXIÓN', state: 'offline' };
  if (obdState.mode === 'simulated') return { label: 'SIMULADOR VIRTUAL', state: 'sim' };
  return { label: obdState.mode === 'bluetooth' ? 'ELM327 · BLUETOOTH' : 'ELM327 · USB', state: 'live' };
}

function paintSourceBadge(el, info) {
  if (!el) return;
  el.dataset.state = info.state;
  el.innerHTML = `<i></i> ${info.label}`;
}

function numericValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const match = String(value ?? '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function paintGauge(prefix, key, value, min, max, decimals = 0) {
  const ring = $(`#${prefix}Gauge${key}`);
  const number = $(`#${prefix}${key}`);
  const numeric = numericValue(value);
  if (!ring || !number) return;
  if (numeric === null) {
    number.textContent = '--';
    ring.style.setProperty('--p', 0);
    ring.dataset.state = 'offline';
    return;
  }
  const pct = Math.max(0, Math.min(100, ((numeric - min) / (max - min)) * 100));
  ring.style.setProperty('--p', pct.toFixed(1));
  ring.dataset.state = 'live';
  number.textContent = numeric.toFixed(decimals);
}

function chartPoints(points, key, min, max) {
  const usable = points
    .map((p, i) => ({ value: numericValue(p[key]), i }))
    .filter(p => p.value !== null);
  if (usable.length < 2) return '';
  const span = Math.max(1, usable[usable.length - 1].i);
  return usable.map(p => {
    const x = (p.i / span) * 600;
    const y = 180 - ((Math.max(min, Math.min(max, p.value)) - min) / (max - min)) * 160;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

function paintChart(prefix) {
  const points = telemetryHistory.points;
  const rpmLine = $(`#${prefix}ChartRpm`);
  const coolantLine = $(`#${prefix}ChartCoolant`);
  const empty = $(`#${prefix}ChartEmpty`);
  const stateLabel = $(`#${prefix}ChartState`);
  const source = telemetrySource();
  const hasData = points.length > 1;

  if (rpmLine) rpmLine.setAttribute('points', chartPoints(points, 'rpm', 0, 8000));
  if (coolantLine) coolantLine.setAttribute('points', chartPoints(points, 'coolant', 40, 120));
  empty?.classList.toggle('hidden', hasData);
  if (stateLabel) stateLabel.textContent = hasData
    ? (source.state === 'sim' ? 'SIMULACIÓN EN VIVO' : 'REGISTRO EN VIVO')
    : (source.state === 'live' ? 'SIN MUESTRAS' : 'ESPERANDO CONEXIÓN');

  const last = points[points.length - 1] || {};
  const rpmValue = $(`#${prefix}ChartRpmValue`);
  const coolantValue = $(`#${prefix}ChartCoolantValue`);
  if (rpmValue) rpmValue.textContent = numericValue(last.rpm) === null ? '--' : `${Math.round(numericValue(last.rpm))} rpm`;
  if (coolantValue) coolantValue.textContent = numericValue(last.coolant) === null ? '--' : `${numericValue(last.coolant).toFixed(0)} °C`;
}

function renderTelemetry(data = {}) {
  const source = telemetrySource();
  paintSourceBadge($('#homeTelemetrySource'), source);
  paintSourceBadge($('#obdSourceLabel'), source);

  const note = $('#homeTelemetryNotice');
  if (note) {
    note.textContent = source.state === 'live'
      ? 'Datos leídos de la ECU a través del adaptador ELM327. La sesión no se almacena.'
      : source.state === 'sim'
        ? 'Datos generados por el simulador virtual, identificados como simulación. No proceden de un vehículo real.'
        : 'Los indicadores permanecen vacíos hasta recibir datos de la ECU. El simulador se identifica siempre como simulación.';
  }

  paintGauge('home', 'Rpm', data.rpm, 0, 8000);
  paintGauge('home', 'Coolant', data.coolant, 40, 120);
  paintGauge('home', 'Voltage', data.voltage, 10, 16, 1);

  paintGauge('obd', 'Rpm', data.rpm, 0, 8000);
  paintGauge('obd', 'Coolant', data.coolant, 40, 120);
  paintGauge('obd', 'Load', data.load, 0, 100);
  paintGauge('obd', 'Voltage', data.voltage, 10, 16, 1);
  paintGauge('obd', 'Speed', data.speed, 0, 240);
  paintGauge('obd', 'Oil', data.oil, 40, 150);
  paintGauge('obd', 'Boost', data.boost, 0, 200);
  paintGauge('obd', 'Lambda', data.lambda, 0.7, 1.3, 2);

  const rpm = numericValue(data.rpm);
  const coolant = numericValue(data.coolant);
  if (rpm !== null || coolant !== null) {
    telemetryHistory.points.push({ rpm, coolant });
    if (telemetryHistory.points.length > telemetryHistory.max) telemetryHistory.points.shift();
  }
  paintChart('home');
  paintChart('obd');
}

function resetTelemetry() {
  telemetryHistory.points = [];
  ['home', 'obd'].forEach(prefix => {
    paintGauge(prefix, 'Rpm', null, 0, 8000);
    paintGauge(prefix, 'Coolant', null, 40, 120);
    paintGauge(prefix, 'Voltage', null, 10, 16);
    paintGauge(prefix, 'Load', null, 0, 100);
    paintGauge(prefix, 'Speed', null, 0, 240);
    paintGauge(prefix, 'Oil', null, 40, 150);
    paintGauge(prefix, 'Boost', null, 0, 200);
    paintGauge(prefix, 'Lambda', null, 0.7, 1.3, 2);
    paintChart(prefix);
  });
  const lastRead = $('#obdLastRead');
  if (lastRead) lastRead.textContent = 'Sin lectura';
  renderTelemetry({});
}

function obdSetStatus(text, state = 'disconnected') {
  const el = $('#obdStatus');
  if (!el) return;
  el.textContent = text;
  el.dataset.state = state;
}

function obdSetButtons({ connect, disconnect, read, live, vin, clear }) {
  const set = (id, val) => { const b = $(id); if (b) b.disabled = !val; };
  set('#obdConnect', connect);
  set('#obdDisconnect', disconnect);
  set('#obdRead', read);
  set('#obdLive', live);
  set('#obdVin', vin);
  set('#obdClear', clear);
}

function appendObdTerminal(direction, text) {
  const term = $('#obdTerminal');
  if (!term) return;
  const line = `[${direction}] ${text}`;
  term.textContent += (term.textContent ? '\n' : '') + line;
  term.scrollTop = term.scrollHeight;
}

function renderLiveGrid(data) {
  const grid = $('#obdLiveGrid');
  if (!grid) return;
  const cells = [];
  const add = (label, value, unit) => {
    if (value === undefined || value === null || value === '' || value === 'N/A') return;
    cells.push(`<div class="live-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(unit || '')}</span></div>`);
  };
  add('RPM', data.rpm, 'RPM');
  add('Velocidad', data.speed, 'km/h');
  add('Refrigerante', data.coolant, '°C');
  add('Aceite', data.oil, '°C');
  add('Carga motor', data.load, '%');
  add('Acelerador', data.throttle, '%');
  add('Pedal', data.pedal, '%');
  add('Temp. admisión', data.iat, '°C');
  add('Temp. ambiente', data.ambient, '°C');
  add('MAF', data.maf, 'g/s');
  add('Presión colector', data.map, 'kPa');
  add('Presión turbo', data.boost, 'kPa');
  add('Barométrica', data.baro, 'kPa');
  add('Avance', data.timing, '°');
  add('Corrección corto', data.stft, '%');
  add('Corrección largo', data.ltft, '%');
  add('Lambda', data.lambda, 'λ');
  add('Sonda B1S1', data.o2, 'V');
  add('Nivel combustible', data.fuelLevel, '%');
  add('Presión rail', data.railBar, 'bar');
  add('Consumo', data.fuelRate, 'L/h');
  add('Temp. catalizador', data.catalyst, '°C');
  add('Temp. DPF', data.dpf, '°C');
  add('Par real', data.torque, '%');
  add('Tensión', data.voltage, 'V');
  grid.innerHTML = cells.join('') || '<div class="muted" style="grid-column:1/-1;font-size:13px;">Sin datos en vivo. Conecta e inicia la monitorización.</div>';
  const lastRead = $('#obdLastRead');
  if (lastRead && data.timestamp) {
    const stamp = data.timestamp instanceof Date ? data.timestamp : new Date(data.timestamp);
    lastRead.textContent = Number.isNaN(stamp.getTime()) ? 'Última lectura recibida' : `Última lectura ${stamp.toLocaleTimeString('es-ES')}`;
  }
  renderTelemetry(data);
}

function renderObdDtcs(codes) {
  const wrap = $('#obdDtcWrap');
  const box = $('#obdDtcResults');
  if (!wrap || !box) return;
  wrap.classList.remove('hidden');

  if (!codes.length) {
    box.innerHTML = '<div class="notice">No se detectaron códigos de avería almacenados ni pendientes en la ECU.</div>';
  } else {
    box.innerHTML = codes.map(code => `
      <article class="result">
        <div class="result-head">
          <div><div class="code">${esc(code)}</div></div>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn ghost obd-dtc-search" data-code="${esc(code)}" style="padding:6px 12px;font-size:12px;" type="button">🔍 Ver en la base DTC</button>
          <button class="btn ghost obd-dtc-tutorials" data-code="${esc(code)}" style="padding:6px 12px;font-size:12px;" type="button">▶ Ver tutoriales</button>
          <button class="btn ghost obd-dtc-report" data-code="${esc(code)}" style="padding:6px 12px;font-size:12px;" type="button">📋 Al informe</button>
        </div>
      </article>
    `).join('');

    $$('.obd-dtc-search').forEach(b => b.addEventListener('click', () => {
      showView('dtc');
      const inp = $('#dtcSearch');
      if (inp) inp.value = b.dataset.code;
      searchDtc(b.dataset.code);
    }));
    $$('.obd-dtc-tutorials').forEach(b => b.addEventListener('click', () => {
      goToTutorials({ q: b.dataset.code, dtc: b.dataset.code });
    }));
    $$('.obd-dtc-report').forEach(b => b.addEventListener('click', () => {
      const field = $('#fDtc');
      if (field) field.value = field.value ? `${field.value}, ${b.dataset.code}` : b.dataset.code;
      showView('informe');
    }));
  }

  const analyze = $('#obdAnalyze');
  const toReport = $('#obdToReport');
  if (analyze) analyze.disabled = codes.length === 0;
  if (toReport) toReport.disabled = codes.length === 0;
}

function initOBD() {
  if (!window.ELM327Manager) {
    const sup = $('#obdBrowserSupport');
    if (sup) {
      sup.textContent = 'No se pudo cargar el módulo OBD-II (obd.js). La lectura por hardware no está disponible, pero el resto de la plataforma funciona con normalidad.';
      sup.style.borderColor = 'var(--danger)';
    }
    return;
  }

  const support = ELM327Manager.checkBrowserSupport();
  const sup = $('#obdBrowserSupport');
  if (sup) {
    sup.innerHTML = `<div>Compatibilidad detectada en este navegador — <b>Web Serial (USB):</b> ${support.serial ? '✅ disponible' : '❌ no disponible'} · ` +
      `<b>Web Bluetooth (BLE):</b> ${support.bluetooth ? '✅ disponible' : '❌ no disponible'}. ` +
      (support.serial || support.bluetooth
        ? 'Puedes conectar tu adaptador ELM327.'
        : 'Puedes usar el Simulador Virtual y probar todas las funciones.') + '</div>';
    sup.style.borderColor = (support.serial || support.bluetooth) ? 'var(--line)' : 'var(--accent)';
  }

  const modeSel = $('#obdMode');
  if (modeSel) {
    [...modeSel.options].forEach(opt => {
      if (opt.value === 'serial' && !support.serial) opt.disabled = true;
      if (opt.value === 'bluetooth' && !support.bluetooth) opt.disabled = true;
    });
  }

  obdManager = new ELM327Manager();

  obdManager.on('status', d => {
    obdState.connected = d.status === 'connected' || d.status === 'reading';
    obdSetStatus(d.info || d.status, d.status);
    if (d.status === 'connected') obdSetButtons({ connect: false, disconnect: true, read: true, live: true, vin: true, clear: true });
    else if (d.status === 'connecting') obdSetButtons({ connect: false, disconnect: true, read: false, live: false, vin: false, clear: false });
    else if (d.status === 'reading') { /* mantiene botones */ }
    else if (d.status === 'disconnected' || d.status === 'error') obdSetButtons({ connect: true, disconnect: false, read: false, live: false, vin: false, clear: false });
  });

  obdManager.on('telemetry', data => {
    obdState.telemetry = data;
    renderLiveGrid(data);
  });

  obdManager.on('terminal', d => appendObdTerminal(d.direction, d.text));

  $('#obdConnect')?.addEventListener('click', async () => {
    const mode = modeSel?.value || 'simulated';
    const baud = Number($('#obdBaud')?.value) || 38400;
    obdState.mode = mode;
    obdState.connected = false;
    resetTelemetry();
    obdSetStatus(`Iniciando conexión ${mode.toUpperCase()}...`, 'connecting');
    obdSetButtons({ connect: false, disconnect: true, read: false, live: false, vin: false, clear: false });
    try {
      const info = await obdManager.connect(mode, baud);
      obdState.connected = true;
      obdSetStatus(`Conectado (${info.version}) · Protocolo: ${info.protocol} · Batería: ${info.voltage}`, 'connected');
      renderLiveGrid({ voltage: info.voltage });
    } catch (err) {
      obdSetStatus(`Error de conexión: ${err.message}`, 'error');
      obdSetButtons({ connect: true, disconnect: false, read: false, live: false, vin: false, clear: false });
    }
  });

  $('#obdDisconnect')?.addEventListener('click', async () => {
    obdManager.stopLiveMonitoring();
    obdState.live = false;
    obdState.connected = false;
    const lb = $('#obdLive');
    if (lb) lb.textContent = '▶️ Datos en vivo';
    await obdManager.disconnect();
    resetTelemetry();
  });

  $('#obdRead')?.addEventListener('click', async () => {
    if (obdState.reading) return;
    obdState.reading = true;
    obdSetStatus('Leyendo códigos DTC (Modo 03 y Modo 07)...', 'reading');
    try {
      const result = await obdManager.readDTCs();
      obdState.dtcs = result.all || [];
      renderObdDtcs(obdState.dtcs);
      obdSetStatus(`Lectura finalizada: ${obdState.dtcs.length} código(s) detectado(s).`, 'connected');
    } catch (err) {
      obdSetStatus(`No se pudieron leer los códigos: ${err.message}`, 'error');
    } finally {
      obdState.reading = false;
    }
  });

  $('#obdLive')?.addEventListener('click', () => {
    const btn = $('#obdLive');
    if (obdState.live) {
      obdManager.stopLiveMonitoring();
      obdState.live = false;
      if (btn) btn.textContent = '▶️ Datos en vivo';
      obdSetStatus('Monitorización en vivo detenida.', 'connected');
    } else {
      obdManager.startLiveMonitoring(1200);
      obdState.live = true;
      if (btn) btn.textContent = '⏸️ Detener datos en vivo';
      obdSetStatus('Monitorizando parámetros en vivo (PID Modo 01)...', 'reading');
      obdManager.readSingleTelemetry().then(renderLiveGrid).catch(() => {});
    }
  });

  $('#obdVin')?.addEventListener('click', async () => {
    obdSetStatus('Solicitando VIN (Modo 09 02)...', 'reading');
    const vin = await obdManager.readVIN();
    obdSetStatus(`VIN: ${vin}`, 'connected');
  });

  $('#obdClear')?.addEventListener('click', async () => {
    const ok = window.confirm('⚠️ Vas a BORRAR los códigos de avería y reiniciar los monitores de la ECU.\n\nEsta acción NO repara la avería y solo debe hacerse tras resolver la causa raíz. ¿Deseas continuar?');
    if (!ok) {
      obdSetStatus('Borrado cancelado por el usuario. No se ha modificado la ECU.', obdState.connected ? 'connected' : 'disconnected');
      return;
    }
    try {
      await obdManager.clearDTCs();
      obdState.dtcs = [];
      renderObdDtcs([]);
      obdSetStatus('Códigos borrados. Recuerda: la avería mecánica puede persistir.', 'connected');
    } catch (err) {
      obdSetStatus(`No se pudieron borrar los códigos: ${err.message}`, 'error');
    }
  });

  const buildVehicleContext = () => {
    const raw = ($('#obdVehicle')?.value || '').trim();
    const parts = raw.split(/\s+/).filter(Boolean);
    return { brand: parts[0] || '', model: parts.slice(1).join(' ') || '', year: '' };
  };

  const buildLiveData = () => {
    const t = obdState.telemetry || {};
    const ld = {};
    const volt = parseFloat(t.voltage);
    if (!isNaN(volt)) ld.VOLTAGE = { value: volt, unit: 'V' };
    if (t.rpm !== undefined) ld.RPM = { value: t.rpm, unit: 'RPM' };
    if (t.speed !== undefined) ld.SPEED = { value: t.speed, unit: 'km/h' };
    if (t.coolant !== undefined) ld.COOLANT_TEMP = { value: t.coolant, unit: '°C' };
    if (t.load !== undefined) ld.ENGINE_LOAD = { value: t.load, unit: '%' };
    if (t.throttle !== undefined) ld.THROTTLE = { value: t.throttle, unit: '%' };
    return ld;
  };

  $('#obdAnalyze')?.addEventListener('click', async () => {
    if (!obdState.dtcs.length) return;
    const report = $('#obdReport');
    if (report) {
      report.style.display = 'block';
      report.innerHTML = '<p class="muted">Generando informe de diagnóstico con IA y motor experto local...</p>';
      report.scrollIntoView({ behavior: 'smooth' });
    }
    try {
      const res = await api('/api/obd/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dtcs: obdState.dtcs,
          liveData: buildLiveData(),
          vehicle: buildVehicleContext(),
          symptoms: ($('#obdSymptoms')?.value || '').trim()
        })
      });
      if (report) {
        report.innerHTML = '<h2 style="color:var(--accent);margin-top:0;">Informe de diagnóstico OBD-II</h2>' +
          formatMarkdown(res.reply) +
          ((res.source === 'ai_provider' || res.source === 'gemini_ai')
            ? `<p class="muted" style="font-size:12px;">Generado con IA${res.provider_label ? ` (${esc(res.provider_label)})` : ''}. Las causas son hipótesis hasta confirmarse con pruebas físicas.</p>`
            : '<p class="muted" style="font-size:12px;">Generado con el motor experto local. Las causas son hipótesis hasta confirmarse con pruebas físicas.</p>');
      }
    } catch (err) {
      if (report) report.innerHTML = `<div class="notice">No se pudo generar el informe: ${esc(err.message)}</div>`;
    }
  });

  $('#obdToReport')?.addEventListener('click', () => {
    if (!obdState.dtcs.length) return;
    const field = $('#fDtc');
    if (field) {
      const joined = obdState.dtcs.join(', ');
      field.value = field.value ? `${field.value}, ${joined}` : joined;
    }
    showView('informe');
  });

  renderLiveGrid({});
}

// -------------------------------------------------------------
// VISTA: CONTACTO
// -------------------------------------------------------------
const contactForm = $('#contactForm');
if (contactForm) {
  contactForm.addEventListener('submit', async e => {
    e.preventDefault();
    const status = $('#contactStatus');
    const submit = contactForm.querySelector('button[type="submit"]');
    const name = ($('#contactName')?.value || '').trim();
    const email = ($('#contactEmail')?.value || '').trim();
    const topic = ($('#contactTopic')?.value || 'Consulta general').trim();
    const message = ($('#contactMessage')?.value || '').trim();

    if (status) {
      status.className = 'form-status';
      status.textContent = '';
    }
    if (submit) submit.disabled = true;

    try {
      const res = await api('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, topic, message })
      });
      contactForm.reset();
      if (status) {
        status.className = 'form-status ok';
        status.textContent = res.message || 'Mensaje registrado. Gracias por contactar.';
      }
    } catch (err) {
      if (status) {
        status.className = 'form-status error';
        status.textContent = err.message || 'No se pudo enviar el mensaje.';
      }
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

const footerYear = $('#footerYear');
if (footerYear) footerYear.textContent = new Date().getFullYear();

// Atajo: "/" enfoca el buscador de síntomas cuando no se está escribiendo.
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.target.matches('input, textarea, select')) return;
  const search = $('#symptomSearch');
  if (search && $('#view-diagnostico')?.classList.contains('active')) {
    e.preventDefault();
    search.focus();
  }
});


// -------------------------------------------------------------
// VISTA: FICHAS DE VEHÍCULOS
// -------------------------------------------------------------
let vehiclesCache = [];
let currentVehicleSheet = '';

function vehicleImage(v) {
  return v?.image?.src || '';
}

function creditLine(image) {
  if (!image?.credit) return '';
  return `Foto: ${esc(image.credit)} · ${esc(image.license || 'Licencia no indicada')}${image.sourceUrl ? ` · <a href="${esc(image.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons ${icon('external')}</a>` : ''}`;
}

async function loadVehicles(force = false) {
  const list = $('#vehicleList');
  if (!list) return;
  if (vehiclesCache.length && !force) {
    renderVehicleIndex();
    return;
  }
  list.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
  try {
    vehiclesCache = await api('/api/vehicles');
    renderVehicleIndex();
    const count = $('#vehicleCount');
    if (count) count.textContent = fmtNum(vehiclesCache.length);
    if (!currentVehicleSheet && vehiclesCache[0]) openVehicleSheet(vehiclesCache[0].id);
  } catch (err) {
    list.innerHTML = `<div class="notice">No se pudieron cargar las fichas: ${esc(err.message)}</div>`;
  }
}

function renderVehicleIndex() {
  const list = $('#vehicleList');
  if (!list) return;
  list.innerHTML = vehiclesCache.map(v => `
    <button class="vehicle-index-item${v.id === currentVehicleSheet ? ' active' : ''}" type="button" data-vehicle-id="${esc(v.id)}">
      <img src="${esc(vehicleImage(v))}" alt="" loading="lazy">
      <span><b>${esc(v.brand)} ${esc(v.model)}</b><small>${esc(v.version)} · ${esc(v.years)}</small></span>
      <em>${esc(v.engine?.powerPs || '—')} CV</em>
    </button>
  `).join('');
  $$('.vehicle-index-item').forEach(btn => {
    btn.addEventListener('click', () => openVehicleSheet(btn.dataset.vehicleId, { scroll: true }));
  });
}

function specCell(label, value, note = '') {
  return `<div class="spec-cell"><small>${esc(label)}</small><b>${esc(value || 'No verificado')}</b>${note ? `<em>${esc(note)}</em>` : ''}</div>`;
}

async function openVehicleSheet(id, { scroll = false } = {}) {
  if (!id) return;
  currentVehicleSheet = id;
  renderVehicleIndex();
  const detail = $('#vehicleDetail');
  if (!detail) return;
  detail.innerHTML = '<div class="notice">Cargando ficha, relaciones y guía de compra…</div>';
  try {
    const [v, rel] = await Promise.all([
      api(`/api/vehicles/${encodeURIComponent(id)}`),
      api(`/api/vehicles/${encodeURIComponent(id)}/related`)
    ]);
    renderVehicleSheet(v, rel);
    if (scroll && window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => {
        const top = detail.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  } catch (err) {
    detail.innerHTML = `<div class="notice">No se pudo abrir la ficha: ${esc(err.message)}</div>`;
  }
}

function renderVehicleSheet(v, rel) {
  const detail = $('#vehicleDetail');
  if (!detail) return;
  const e = v.engine || {};
  const t = v.transmission || {};
  const img = v.image || {};
  const inspection = (v.inspection || []).map(i => `
    <li><span class="insp-level ${severityClass(i.level)}">${esc(i.level || 'media')}</span><div><b>${esc(i.area)}</b><p>${esc(i.check)}</p><small>${esc(i.why)}</small></div></li>`).join('');
  const sources = (v.sources || []).map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ${icon('external')}</a><small>${esc(x.publisher)} · ${esc(x.type)} · consultado ${esc(x.accessed)}</small></li>`).join('');
  const symptoms = (rel.symptoms || []).map(s => `<button class="rel-chip" type="button" data-rel-symptom="${esc(s.id)}"><b>${esc(s.name)}</b><small>${esc(s.area || s.category)} · ${esc(s.urgency)}</small></button>`).join('');
  const dtcs = (rel.dtc || []).map(d => `<button class="rel-chip dtc" type="button" data-rel-dtc="${esc(d.code)}"><b>${esc(d.code)}</b><small>${esc(d.title)}</small></button>`).join('');
  const products = (rel.products || []).map(p => `<button class="rel-product" type="button" data-rel-product="${esc(p.id)}" title="${esc(p.relationNote || '')}"><img src="${esc(p.image)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b><small>${esc(p.manufacturer)} · ${esc(p.category)} · verificar compatibilidad</small></span>${icon('arrow')}</button>`).join('');
  const tutorials = (rel.tutorials || []).map(tut => `<a class="rel-link" href="${esc(tut.url || '#')}" data-tutorial-id="${esc(tut.id)}" target="_blank" rel="noopener noreferrer"><b>${esc(tut.title)}</b><small>${esc(tut.channel || tut.categoryName || 'Tutorial')}</small>${icon('external')}</a>`).join('');
  const tuning = rel.tuning ? `<div class="related-tuning"><span class="tag">${esc(rel.tuning.level)}</span><b>${esc(rel.tuning.name)}</b><p>${esc(rel.tuning.tagline)}</p><button class="btn ghost sm" type="button" data-open-tuning="${esc(rel.tuning.id)}">Abrir guía de tuning ${icon('arrow')}</button></div>` : '<p class="micro-note">No hay una guía de tuning específica para esta versión.</p>';
  const buy = v.buyingGuide || {};
  detail.innerHTML = `
    <div class="vehicle-sheet-head">
      <div class="vehicle-photo">
        <img src="${esc(img.src || '')}" alt="${esc(v.brand)} ${esc(v.model)}">
        <span class="vehicle-credit">${creditLine(img)}</span>
      </div>
      <div class="vehicle-sheet-copy">
        <span class="eyebrow">${esc(v.brand)} · ${esc(v.generation)}</span>
        <h2>${esc(v.model)} <span>${esc(v.version)}</span></h2>
        <p>${esc(v.years)} · ${esc(v.body)}</p>
        <div class="vehicle-sheet-tags">
          <span class="tag">${icon('shield')} Confianza ${esc(v.confidence || 'media')}</span>
          <span class="tag">${icon('db')} ${fmtNum((v.sources || []).length)} ${(v.sources || []).length === 1 ? 'fuente' : 'fuentes'}</span>
          <span class="tag">${icon('car')} ${esc(t.drive || 'Tracción no verificada')}</span>
        </div>
        <div class="vehicle-actions">
          <button class="btn primary" type="button" data-use-vehicle="${esc(v.id)}">Usar en diagnóstico ${icon('arrow')}</button>
          <button class="btn ghost" type="button" data-vehicle-ai="${esc(v.id)}">Consultar con IA ${icon('chat')}</button>
        </div>
        <p class="micro-note">${esc(v.notes || '')}</p>
      </div>
    </div>

    <div class="spec-grid">
      ${specCell('Potencia', e.powerPs ? `${e.powerPs} CV / ${e.powerKw} kW` : '', e.notes)}
      ${specCell('Par máximo', e.torqueNm ? `${e.torqueNm} Nm` : '')}
      ${specCell('Cilindrada', e.displacementCc ? `${e.displacementCc} cc` : '')}
      ${specCell('Combustible', e.fuel)}
      ${specCell('Distribución', e.distribution)}
      ${specCell('Cambio', t.gears || t.type)}
    </div>

    <div class="sheet-section-grid">
      <section class="sheet-section">
        <h3>${icon('engine')} Motor y arquitectura</h3>
        <dl class="spec-list">
          <div><dt>Código de motor</dt><dd>${esc(e.code || 'No verificado')}</dd></div>
          <div><dt>Alimentación</dt><dd>${esc(e.injection || 'No verificada')}</dd></div>
          <div><dt>Sobrealimentación</dt><dd>${esc(e.aspiration || 'No verificada')}</dd></div>
          <div><dt>Sistemas relevantes</dt><dd>${esc((v.systems || []).join(' · '))}</dd></div>
          <div><dt>Emisiones</dt><dd>${esc(v.emissions?.standard || 'No verificado')} · ${esc(v.emissions?.aftertreatment || 'Postratamiento no verificado')}</dd></div>
        </dl>
      </section>
      <section class="sheet-section">
        <h3>${icon('pulse')} Puntos de inspección</h3>
        <ul class="inspection-list">${inspection || '<li>No hay puntos específicos documentados.</li>'}</ul>
      </section>
    </div>

    <section class="sheet-section">
      <h3>${icon('file')} Guía de compra</h3>
      <div class="buy-grid">
        <div><small>Ideal para</small><p>${esc(buy.idealFor || 'No definido')}</p></div>
        <div><small>Menos adecuado para</small><p>${esc(buy.notIdealFor || 'No definido')}</p></div>
        <div><small>Presupuesto</small><p>${esc(buy.budgetNote || 'Consultar mercado.')}</p></div>
        <div><small>Riesgo editorial</small><p>${esc(buy.riskLevel || 'No determinado')}</p></div>
      </div>
      <p class="sheet-verdict"><b>Veredicto:</b> ${esc(buy.verdict || 'Sin veredicto editorial.')}</p>
      <h4>Comprobaciones prioritarias antes de comprar</h4>
      <ol class="check-list">${(buy.priorityChecks || []).map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    </section>

    <section class="sheet-section">
      <h3>${icon('search')} Contenido relacionado</h3>
      <h4>Síntomas genéricos por sistema</h4>
      <div class="rel-chips">${symptoms || '<p class="micro-note">Sin síntomas genéricos aplicables a los sistemas de esta versión.</p>'}</div>
      <h4>Códigos DTC genéricos orientativos</h4>
      <p class="micro-note">No son códigos específicos de esta versión: orientan la comprobación del sistema indicado.</p>
      <div class="rel-chips">${dtcs || '<p class="micro-note">Sin DTC genéricos aplicables sin datos específicos de la versión.</p>'}</div>
      <h4>Productos genéricos de mantenimiento</h4>
      <div class="rel-products">${products || '<p class="micro-note">Sin productos genéricos aplicables en el catálogo.</p>'}</div>
      <p class="micro-note">Selección por tipo de artículo y sistema, no por referencia OEM. Confirma la compatibilidad con tu VIN antes de comprar.</p>
      <h4>Tutoriales</h4>
      <div class="rel-links">${tutorials || '<p class="micro-note">Sin tutoriales coincidentes.</p>'}</div>
      <div class="related-tuning">${tuning}</div>
      <p class="micro-note">${esc(rel.relationDisclaimer || '')}</p>
    </section>

    <section class="sheet-section">
      <h3>${icon('db')} Fuentes y trazabilidad</h3>
      <ul class="source-list">${sources || '<li>Sin fuentes registradas.</li>'}</ul>
      <p class="micro-note">Datos de la versión indicada. No se garantiza que todas las unidades del mercado compartan motor, caja, emisiones o equipamiento. Verifique el VIN y la documentación del fabricante.</p>
    </section>
  `;
  detail.querySelector('[data-use-vehicle]')?.addEventListener('click', () => {
    setVehicleState({ id: v.id, brand: v.brand, model: v.model, engine: v.version }, 'vehicle');
    const badge = $('#activeVehicleBadge');
    if (badge) badge.textContent = `Vehículo activo: ${v.brand} ${v.model} ${v.version} (${v.years})`;
  });
  detail.querySelector('[data-vehicle-ai]')?.addEventListener('click', () => {
    showView('chat');
    const input = $('#chatInput');
    if (input) {
      input.value = `Revisa este vehículo: ${v.brand} ${v.model} ${v.version} (${v.years}). Quiero un plan de comprobaciones y mantenimiento preventivo.`;
      input.focus();
    }
  });
  detail.querySelectorAll('[data-rel-symptom]').forEach(b => b.addEventListener('click', async () => {
    showView('diagnostico');
    if (!symptomsCache.length) await loadSymptoms();
    const item = symptomsCache.find(s => s.id === b.dataset.relSymptom);
    if (item) renderSymptomDetail(item);
  }));
  detail.querySelectorAll('[data-rel-dtc]').forEach(b => b.addEventListener('click', async () => {
    showView('dtc');
    const input = $('#dtcSearch');
    if (input) input.value = b.dataset.relDtc;
    await searchDtc(b.dataset.relDtc);
  }));
  detail.querySelectorAll('[data-rel-product]').forEach(b => b.addEventListener('click', () => openProductSheet(b.dataset.relProduct)));
  detail.querySelectorAll('[data-open-tuning]').forEach(b => b.addEventListener('click', async () => {
    showView('tuning');
    await loadTuning();
    openTuningPackage(b.dataset.openTuning);
  }));
  detail.querySelectorAll('[data-tutorial-id]').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') {
      e.preventDefault();
      goToTutorials({ q: a.querySelector('b')?.textContent || '' });
    }
  }));
}

// -------------------------------------------------------------
// VISTA: TUNING
// -------------------------------------------------------------
let tuningCache = null;

async function loadTuning(force = false) {
  const box = $('#tuningPackages');
  if (!box) return;
  if (tuningCache && !force) {
    renderTuning();
    return;
  }
  box.innerHTML = '<div class="notice">Cargando guías de preparación…</div>';
  try {
    tuningCache = await api('/api/tuning');
    renderTuning();
    const count = $('#tuningCount');
    if (count) count.textContent = fmtNum((tuningCache.packages || []).length);
  } catch (err) {
    box.innerHTML = `<div class="notice">No se pudieron cargar las guías: ${esc(err.message)}</div>`;
  }
}

function renderTuning() {
  if (!tuningCache) return;
  const stages = $('#tuningStages');
  if (stages) {
    stages.innerHTML = (tuningCache.stages || []).map(s => `
      <article class="stage-card">
        <span class="eyebrow">${esc(s.name.split('—')[0])}</span>
        <h3>${esc(s.name)}</h3>
        <p>${esc(s.summary)}</p>
        <h4>Requiere</h4><ul>${(s.requires || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        <h4>Evita</h4><ul class="danger-list">${(s.avoid || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      </article>
    `).join('');
  }
  const box = $('#tuningPackages');
  if (!box) return;
  box.innerHTML = (tuningCache.packages || []).map(pkg => {
    const vehicle = pkg.vehicle;
    const products = (pkg.relatedProducts || []).map(p => `<button class="rel-product" type="button" data-tuning-product="${esc(p.id)}"><img src="${esc(p.image)}" alt="" loading="lazy"><span><b>${esc(p.name)}</b><small>${esc(p.manufacturer)} · ${esc(p.category)}</small></span>${icon('arrow')}</button>`).join('');
    return `
      <article class="tuning-card panel" id="tuning-${esc(pkg.id)}">
        <div class="tuning-card-head">
          ${vehicle ? `<img src="${esc(vehicle.image?.src || '')}" alt="${esc(vehicle.brand)} ${esc(vehicle.model)}">` : '<span class="tuning-generic">' + icon('zap') + '</span>'}
          <div>
            <span class="eyebrow">${esc(pkg.level)}</span>
            <h3>${esc(pkg.name)}</h3>
            <p>${esc(pkg.tagline)}</p>
            ${vehicle ? `<button class="btn ghost sm" type="button" data-tuning-vehicle="${esc(vehicle.id)}">Abrir ficha del vehículo ${icon('arrow')}</button>` : ''}
          </div>
        </div>
        <div class="tuning-cols">
          <div><h4>Ideal para</h4><p>${esc(pkg.idealFor)}</p><h4>No es para</h4><p>${esc(pkg.notFor)}</p></div>
          <div><h4>Hardware y verificaciones</h4><ul>${(pkg.hardware || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>Comprobaciones antes/después</h4><ul>${(pkg.checks || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
        <div class="tuning-notes">${(pkg.notes || []).map(x => `<p>${esc(x)}</p>`).join('')}</div>
        <div class="tuning-legal"><b>${icon('shield')} Legalidad:</b> ${esc(pkg.legal)}</div>
        <h4>Productos relacionados</h4>
        <div class="rel-products">${products || '<p class="micro-note">Sin productos verificados para esta guía.</p>'}</div>
      </article>`;
  }).join('');
  box.querySelectorAll('[data-tuning-vehicle]').forEach(b => b.addEventListener('click', () => {
    showView('vehiculos');
    openVehicleSheet(b.dataset.tuningVehicle, { scroll: true });
  }));
  box.querySelectorAll('[data-tuning-product]').forEach(b => b.addEventListener('click', () => openProductSheet(b.dataset.tuningProduct)));
}

function openTuningPackage(id) {
  const el = document.getElementById(`tuning-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('search-hit');
  setTimeout(() => el.classList.remove('search-hit'), 2200);
}

// -------------------------------------------------------------
// BIBLIOTECA TÉCNICA
// -------------------------------------------------------------
let libraryData = null;
let librarySelected = null;
let libraryRequest = 0;

function libraryMatches(item, q, brand, system) {
  if (brand && item.brand !== brand) return false;
  if (system && !(item.systems || []).includes(system)) return false;
  if (!q) return true;
  const text = foldText([item.title, item.brand, item.model, item.generation, item.version, item.engine?.code, (item.systems || []).join(' ')].join(' '));
  return q.split(/\s+/).filter(Boolean).every(term => text.includes(term));
}

function foldText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function libraryFilteredItems() {
  if (!libraryData) return [];
  const q = foldText($('#librarySearch')?.value || '').trim();
  const brand = $('#libraryBrand')?.value || '';
  const system = $('#librarySystem')?.value || '';
  return libraryData.items.filter(item => libraryMatches(item, q, brand, system));
}

function renderLibraryIndex() {
  const list = $('#libraryList');
  if (!list || !libraryData) return;
  const items = libraryFilteredItems();
  if (!items.length) {
    list.innerHTML = '<div class="notice">No hay dossiers que coincidan con los filtros.</div>';
    return;
  }
  list.innerHTML = items.map(item => `
    <button class="library-index-item vehicle-index-item${item.id === librarySelected ? ' active' : ''}" type="button" data-library-id="${esc(item.id)}">
      ${item.image?.src ? `<img src="${esc(item.image.src)}" alt="" loading="lazy">` : `<span class="library-index-icon">${icon('file')}</span>`}
      <span><b>${esc(item.brand)} ${esc(item.model)}</b><small>${esc(item.version)} · ${esc(item.years)}</small></span>
      <em>${sourceCountLabel(item.sourceCount)}</em>
    </button>
  `).join('');
  list.querySelectorAll('[data-library-id]').forEach(btn => {
    btn.addEventListener('click', () => openLibraryEntry(btn.dataset.libraryId, { scroll: true }));
  });
}

function renderLibraryMeta() {
  if (!libraryData) return;
  const count = $('#libraryCount');
  if (count) count.textContent = fmtNum(libraryData.total);
  const gaps = $('#libraryGapCount');
  if (gaps) gaps.textContent = fmtNum((libraryData.documentationGaps || []).length);
  const dossierTab = $('#libraryDossierTabCount');
  if (dossierTab) dossierTab.textContent = fmtNum(libraryData.total);
  const brandSel = $('#libraryBrand');
  if (brandSel && brandSel.options.length === 1) {
    brandSel.insertAdjacentHTML('beforeend', (libraryData.brands || []).map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join(''));
  }
  const systemSel = $('#librarySystem');
  if (systemSel && systemSel.options.length === 1) {
    systemSel.insertAdjacentHTML('beforeend', (libraryData.systems || []).map(s => `<option value="${esc(s)}">${esc(s)}</option>`).join(''));
  }
}

async function loadLibrary(force = false) {
  const list = $('#libraryList');
  if (!list) return;
  if (libraryData && !force) {
    renderLibraryMeta();
    renderLibraryIndex();
    return;
  }
  try {
    libraryData = await api('/api/library');
    renderLibraryMeta();
    renderLibraryIndex();
    if (!librarySelected && libraryData.items[0]) openLibraryEntry(libraryData.items[0].id);
  } catch (err) {
    list.innerHTML = `<div class="notice">No se pudo cargar la biblioteca: ${esc(err.message)}</div>`;
  }
}

function renderLibraryDetail(item) {
  const detail = $('#libraryDetail');
  if (!detail) return;
  const e = item.engine || {};
  const t = item.transmission || {};
  const em = item.emissions || {};
  const sources = (item.sources || []).map(x => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)} ${icon('external')}</a><small>${esc(x.publisher)} · ${esc(x.type)} · consultado ${esc(x.accessed)}</small></li>`).join('');
  const systems = (item.systems || []).map(s => `<span class="tag">${esc(s)}</span>`).join('');
  const inspection = (item.inspection || []).map(i => `<li><span class="insp-level ${severityClass(i.level)}">${esc(i.level || 'media')}</span><div><b>${esc(i.area)}</b><p>${esc(i.check)}</p><small>${esc(i.why)}</small></div></li>`).join('');
  const covered = (item.covered || []).map(c => `<li>${esc(c.title)}</li>`).join('');
  const pending = (item.pending || []).map(p => `<li><b>${esc(p.title)}</b><small>${esc(p.note)}</small></li>`).join('');
  detail.innerHTML = `
    <div class="library-detail-head">
      <div>
        <span class="eyebrow">${esc(item.brand)} · ${esc(item.generation)}</span>
        <h2>${esc(item.model)} <span>${esc(item.version)}</span></h2>
        <p>${esc(item.years)} · ${esc(item.body || 'Carrocería no verificada')} · ${esc(e.code || 'Motor no verificado')}</p>
      </div>
      <div class="library-detail-tags">
        <span class="tag">${icon('shield')} Confianza ${esc(item.confidence || 'media')}</span>
        <span class="tag">${icon('db')} ${sourceCountLabel((item.sources || []).length)}</span>
        <span class="tag">${icon('file')} ${esc(item.statusLabel || 'Dossier parcial')}</span>
      </div>
    </div>
    <div class="library-actions">
      <button class="btn primary" type="button" data-library-vehicle="${esc(item.id)}">Abrir ficha del vehículo ${icon('arrow')}</button>
      <button class="btn ghost" type="button" data-library-tutorials="${esc(item.id)}">Ver tutoriales ${icon('play')}</button>
      <button class="btn ghost" type="button" data-library-diagnose="${esc(item.id)}">Diagnosticar ${icon('pulse')}</button>
    </div>
    <p class="library-notice">${esc(item.notice || '')}</p>
    <div class="sheet-section-grid">
      <section class="sheet-section">
        <h3>${icon('engine')} Motor y transmisión</h3>
        <dl class="spec-list">
          <div><dt>Cilindrada</dt><dd>${esc(e.displacementCc ? `${e.displacementCc} cc` : 'No verificado')}</dd></div>
          <div><dt>Potencia / par</dt><dd>${esc(e.powerPs ? `${e.powerPs} CV` : 'No verificado')}${e.torqueNm ? ` · ${esc(e.torqueNm)} Nm` : ''}</dd></div>
          <div><dt>Combustible</dt><dd>${esc(e.fuel || 'No verificado')}</dd></div>
          <div><dt>Distribución</dt><dd>${esc(e.distribution || 'No verificado')}</dd></div>
          <div><dt>Alimentación</dt><dd>${esc(e.injection || 'No verificado')}</dd></div>
          <div><dt>Cambio / tracción</dt><dd>${esc(t.gears || t.type || 'No verificado')} · ${esc(t.drive || 'No verificado')}</dd></div>
        </dl>
      </section>
      <section class="sheet-section">
        <h3>${icon('shield')} Emisiones y sistemas</h3>
        <dl class="spec-list">
          <div><dt>Norma</dt><dd>${esc(em.standard || 'No verificado')}</dd></div>
          <div><dt>Postratamiento</dt><dd>${esc(em.aftertreatment || 'No verificado')}</dd></div>
        </dl>
        <div class="library-systems">${systems || '<span class="micro-note">Sistemas no documentados.</span>'}</div>
      </section>
    </div>
    <section class="sheet-section">
      <h3>${icon('pulse')} Puntos de inspección</h3>
      <ul class="inspection-list">${inspection || '<li>No hay puntos de inspección documentados.</li>'}</ul>
    </section>
    <div class="library-doc-grid">
      <section class="sheet-section library-covered">
        <h3>${icon('check')} Cobertura documental</h3>
        <ul>${covered || '<li>Sin apartados cubiertos.</li>'}</ul>
      </section>
      <section class="sheet-section library-pending">
        <h3>${icon('alert')} Pendiente de documentación oficial</h3>
        <ul>${pending || '<li>No hay carencias declaradas.</li>'}</ul>
        <p class="micro-note">No se completan con valores genéricos de otros motores o versiones.</p>
      </section>
    </div>
    <section class="sheet-section">
      <h3>${icon('db')} Fuentes y trazabilidad</h3>
      <ul class="source-list">${sources || '<li>Sin fuentes registradas.</li>'}</ul>
    </section>
  `;
  detail.querySelector('[data-library-vehicle]')?.addEventListener('click', async () => {
    showView('vehiculos');
    await loadVehicles();
    await openVehicleSheet(item.id, { scroll: true });
  });
  detail.querySelector('[data-library-tutorials]')?.addEventListener('click', () => {
    goToTutorials({ q: `${item.brand} ${item.model} ${item.version}` });
  });
  detail.querySelector('[data-library-diagnose]')?.addEventListener('click', () => {
    setVehicleState({ id: item.id, brand: item.brand, model: item.model, engine: item.version }, 'library');
    showView('diagnostico');
  });
}

async function openLibraryEntry(id, { scroll = false } = {}) {
  if (!id) return;
  librarySelected = id;
  renderLibraryIndex();
  const detail = $('#libraryDetail');
  if (!detail) return;
  detail.innerHTML = '<div class="notice">Cargando dossier técnico…</div>';
  const request = ++libraryRequest;
  try {
    const item = await api(`/api/library/${encodeURIComponent(id)}`);
    if (request !== libraryRequest) return;
    renderLibraryDetail(item);
    if (scroll && window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => {
        const top = detail.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  } catch (err) {
    if (request === libraryRequest) detail.innerHTML = `<div class="notice">No se pudo abrir el dossier: ${esc(err.message)}</div>`;
  }
}

function initLibraryFilters() {
  const search = $('#librarySearch');
  const brand = $('#libraryBrand');
  const system = $('#librarySystem');
  const reset = $('#libraryReset');
  let timer = null;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(renderLibraryIndex, 140);
  });
  brand?.addEventListener('change', renderLibraryIndex);
  system?.addEventListener('change', renderLibraryIndex);
  reset?.addEventListener('click', () => {
    if (search) search.value = '';
    if (brand) brand.value = '';
    if (system) system.value = '';
    renderLibraryIndex();
  });
}


// -------------------------------------------------------------
// BIBLIOTECA TÉCNICA: 27 CATEGORÍAS
// -------------------------------------------------------------
const TECHNICAL_GROUP_LABELS = {
  vehiculos: 'Vehículos y motores',
  manuales: 'Manuales y documentación',
  electricidad: 'Electricidad, ECU y redes',
  motor: 'Motor y gestión',
  chasis: 'Chasis y transmisión',
  diagnostico: 'Diagnóstico y datos',
  taller: 'Procedimientos de taller',
  normativa: 'Campañas, seguridad y fuentes'
};
const TECHNICAL_TYPE_LABELS = {
  vehicle_spec: 'Especificación de modelo',
  vehicle_dossier: 'Dossier de vehículo',
  inspection: 'Punto de inspección',
  symptom: 'Patrón genérico',
  tutorial: 'Vídeo técnico',
  pid: 'PID OBD-II',
  source: 'Fuente externa',
  guide: 'Guía genérica',
  dtc: 'Código DTC',
  recall: 'Campaña de seguridad',
  document: 'Documento'
};
const TECHNICAL_STATUS_LABELS = {
  verified: 'Verificado',
  reviewed: 'Revisado',
  generic: 'Genérico',
  metadata_only: 'Metadatos',
  source_only: 'Fuente'
};

let technicalMeta = null;
let technicalData = null;
let technicalItems = [];
let technicalSelectedCategory = '';
let technicalSelectedId = '';
let technicalLoaded = false;
let technicalRequest = 0;
let technicalLimit = 40;
let libraryMode = 'dossiers';

function technicalStatusBadge(status) {
  const key = Object.prototype.hasOwnProperty.call(TECHNICAL_STATUS_LABELS, status) ? status : 'generic';
  return `<span class="tech-status ${key}">${esc(TECHNICAL_STATUS_LABELS[key])}</span>`;
}

function technicalTypeLabel(type) {
  return TECHNICAL_TYPE_LABELS[type] || type || 'Documento';
}

function technicalCoverageLabel(coverage) {
  return ({ data: 'Con datos', source: 'Solo fuentes', pending: 'Pendiente' })[coverage] || coverage;
}

function technicalCoverageDot(coverage) {
  return `<i class="tech-cat-dot ${esc(coverage)}"></i>`;
}

function fillTechnicalSelect(select, values, labels = {}) {
  if (!select || select.options.length > 1) return;
  select.insertAdjacentHTML('beforeend', (values || []).map(value => `<option value="${esc(value)}">${esc(labels[value] || value)}</option>`).join(''));
}

function technicalCategoryCount() {
  return technicalMeta?.categories?.length || 27;
}

async function loadTechnicalMeta(force = false) {
  if (technicalMeta && !force) return technicalMeta;
  const meta = await api('/api/technical/meta');
  technicalMeta = meta;
  const tabCount = $('#libraryTechnicalTabCount');
  if (tabCount) tabCount.textContent = fmtNum(meta.counts.total);
  const coverage = $('#technicalCoverage');
  if (coverage) {
    const data = meta.categories.filter(c => c.coverage === 'data').length;
    const source = meta.categories.filter(c => c.coverage === 'source').length;
    coverage.innerHTML = `${technicalCoverageDot('data')} ${data} datos · ${technicalCoverageDot('source')} ${source} fuentes`;
  }
  fillTechnicalSelect($('#technicalType'), meta.types, TECHNICAL_TYPE_LABELS);
  fillTechnicalSelect($('#technicalStatus'), meta.statuses, TECHNICAL_STATUS_LABELS);
  const facets = meta.facets || {};
  fillTechnicalSelect($('#technicalBrand'), facets.brands);
  fillTechnicalSelect($('#technicalModel'), facets.models);
  fillTechnicalSelect($('#technicalGeneration'), facets.generations);
  fillTechnicalSelect($('#technicalYear'), (facets.years || []).map(String));
  fillTechnicalSelect($('#technicalEngine'), facets.engines);
  fillTechnicalSelect($('#technicalSystem'), facets.systems);
  renderTechnicalCategories();
  renderTechnicalCategoryHead();
  return meta;
}

function renderTechnicalCategories() {
  const list = $('#technicalCategoryList');
  if (!list || !technicalMeta) return;
  const groups = [...new Set(technicalMeta.categories.map(c => c.group))];
  const allActive = !technicalSelectedCategory;
  const allCount = technicalMeta.counts.total;
  let html = `<button class="tech-cat-btn${allActive ? ' active' : ''}" type="button" data-tech-cat="" title="Ver todas las entradas">
    <span class="tech-cat-num">Σ</span>
    <span class="tech-cat-name">Todas las categorías</span>
    <span class="tech-cat-count">${fmtNum(allCount)}</span>
  </button>`;
  for (const group of groups) {
    const categories = technicalMeta.categories.filter(c => c.group === group);
    html += `<div class="tech-group-label">${esc(TECHNICAL_GROUP_LABELS[group] || group)}</div>`;
    html += categories.map(category => {
      const count = category.total + category.relatedTotal;
      const active = technicalSelectedCategory === category.id;
      return `<button class="tech-cat-btn${active ? ' active' : ''}" type="button" data-tech-cat="${esc(category.id)}" title="${esc(category.title)}: ${category.total} propias y ${category.relatedTotal} relacionadas">
        <span class="tech-cat-num">${String(category.number).padStart(2, '0')}</span>
        <span class="tech-cat-name">${esc(category.title)}</span>
        <span class="tech-cat-count">${technicalCoverageDot(category.coverage)}${fmtNum(count)}</span>
      </button>`;
    }).join('');
  }
  list.innerHTML = html;
  list.querySelectorAll('[data-tech-cat]').forEach(button => {
    button.addEventListener('click', () => {
      technicalSelectedCategory = button.dataset.techCat || '';
      renderTechnicalCategories();
      renderTechnicalCategoryHead();
      fetchTechnicalEntries(true);
    });
  });
}

function renderTechnicalCategoryHead() {
  const head = $('#technicalCategoryHead');
  if (!head || !technicalMeta) return;
  const category = technicalMeta.categories.find(c => c.id === technicalSelectedCategory);
  if (!category) {
    const counts = technicalMeta.counts;
    head.innerHTML = `
      <div class="tech-head-top">
        <div>
          <span class="eyebrow">${technicalCategoryCount()} CATEGORÍAS · MAPA COMPLETO</span>
          <h3>Documentación técnica organizada por sistema</h3>
          <p>Selecciona una categoría a la izquierda o busca por PID, DTC, sistema, avería, vehículo o fuente. Cada ficha indica si el dato está verificado, revisado, es genérico o solo enlaza a una fuente externa.</p>
        </div>
        <span class="tag">${icon('db')} ${fmtNum(counts.total)} entradas</span>
      </div>
      <div class="tech-cat-stats">
        <span class="tag">${technicalStatusBadge('verified')} ${fmtNum(counts.byStatus.verified || 0)}</span>
        <span class="tag">${technicalStatusBadge('reviewed')} ${fmtNum(counts.byStatus.reviewed || 0)}</span>
        <span class="tag">${technicalStatusBadge('generic')} ${fmtNum(counts.byStatus.generic || 0)}</span>
        <span class="tag">${technicalStatusBadge('metadata_only')} ${fmtNum(counts.byStatus.metadata_only || 0)}</span>
        <span class="tag">${technicalStatusBadge('source_only')} ${fmtNum(counts.byStatus.source_only || 0)}</span>
        <span class="tag">${fmtNum(counts.byAvailability.full || 0)} completos</span>
        <span class="tag">${fmtNum(counts.byAvailability.partial || 0)} parciales</span>
        <span class="tag">${fmtNum(counts.byAvailability.link || 0)} solo enlaces</span>
        <span class="tag">${fmtNum(counts.byAvailability.metadata || 0)} metadatos</span>
      </div>`;
    return;
  }
  const related = category.dataCount + category.sourceCount;
  const status = category.status || {};
  head.innerHTML = `
    <div class="tech-head-top">
      <div>
        <span class="eyebrow">CATEGORÍA ${String(category.number).padStart(2, '0')} · ${esc(TECHNICAL_GROUP_LABELS[category.group] || category.group)}</span>
        <h3>${esc(category.title)}</h3>
        <p>${esc(category.description)}</p>
      </div>
      <span class="tag">${technicalCoverageDot(category.coverage)} ${esc(technicalCoverageLabel(category.coverage))}</span>
    </div>
    <div class="tech-cat-stats">
      <span class="tag">${fmtNum(category.total)} propias</span>
      <span class="tag">${fmtNum(category.relatedTotal)} relacionadas</span>
      <span class="tag">${fmtNum(related)} referencias totales</span>
      <span class="tag">${technicalStatusBadge('verified')} ${fmtNum(status.verified || 0)}</span>
      <span class="tag">${technicalStatusBadge('reviewed')} ${fmtNum(status.reviewed || 0)}</span>
      <span class="tag">${technicalStatusBadge('metadata_only')} ${fmtNum(status.metadata_only || 0)}</span>
      <span class="tag">${technicalStatusBadge('source_only')} ${fmtNum(status.source_only || 0)}</span>
      <span class="tag">${fmtNum(category.availability.full || 0)} completos</span>
      <span class="tag">${fmtNum(category.availability.partial || 0)} parciales</span>
      <span class="tag">${fmtNum(category.availability.link || 0)} solo enlaces</span>
      <span class="tag">${fmtNum(category.availability.metadata || 0)} metadatos</span>
    </div>
    ${category.coverage === 'source'
      ? '<p class="tech-inline-warning">Esta categoría no tiene todavía documentos propios. Las entradas disponibles son fuentes externas localizadas: su contenido no se ha copiado ni validado.</p>'
      : ''}`;
}

function technicalFilters() {
  return {
    q: ($('#technicalSearch')?.value || '').trim(),
    type: $('#technicalType')?.value || '',
    status: $('#technicalStatus')?.value || '',
    brand: $('#technicalBrand')?.value || '',
    model: $('#technicalModel')?.value || '',
    generation: $('#technicalGeneration')?.value || '',
    year: $('#technicalYear')?.value || '',
    engine: $('#technicalEngine')?.value || '',
    system: $('#technicalSystem')?.value || ''
  };
}

async function fetchTechnicalEntries(reset = true) {
  if (!technicalMeta) await loadTechnicalMeta();
  const list = $('#technicalList');
  if (!list) return;
  const request = ++technicalRequest;
  if (reset) {
    technicalItems = [];
    setTechnicalDetailMode(false);
    list.innerHTML = `<div class="notice">Buscando en las ${technicalCategoryCount()} categorías…</div>`;
  }
  const filters = technicalFilters();
  const params = new URLSearchParams();
  params.set('limit', String(technicalLimit));
  params.set('offset', String(reset ? 0 : technicalItems.length));
  if (filters.q) params.set('q', filters.q);
  if (filters.type) params.set('type', filters.type);
  if (filters.status) params.set('status', filters.status);
  if (filters.brand) params.set('brand', filters.brand);
  if (filters.model) params.set('model', filters.model);
  if (filters.generation) params.set('generation', filters.generation);
  if (filters.year) params.set('year', filters.year);
  if (filters.engine) params.set('engine', filters.engine);
  if (filters.system) params.set('system', filters.system);
  if (technicalSelectedCategory) params.set('category', technicalSelectedCategory);
  try {
    const data = await api(`/api/technical?${params.toString()}`);
    if (request !== technicalRequest) return;
    technicalData = data;
    technicalItems = reset ? data.items : technicalItems.concat(data.items);
    technicalLoaded = true;
    renderTechnicalList();
  } catch (err) {
    if (request !== technicalRequest) return;
    technicalLoaded = false;
    list.innerHTML = `<div class="notice">No se pudo cargar la biblioteca técnica: ${esc(err.message)}</div>`;
    const more = $('#technicalMore');
    if (more) more.classList.add('hidden');
  }
}

function renderTechnicalList() {
  const list = $('#technicalList');
  if (!list || !technicalData) return;
  const count = $('#technicalResultCount');
  if (count) count.innerHTML = `<b>${fmtNum(technicalData.total)}</b> resultado${technicalData.total === 1 ? '' : 's'}${technicalSelectedCategory ? ` en ${esc(technicalMeta?.categories.find(c => c.id === technicalSelectedCategory)?.title || 'la categoría')}` : ` en ${technicalCategoryCount()} categorías`}`;
  const pageInfo = $('#technicalPageInfo');
  if (pageInfo) pageInfo.textContent = technicalData.total ? `${fmtNum(technicalItems.length)} de ${fmtNum(technicalData.total)} visibles` : '';
  if (!technicalItems.length) {
    list.innerHTML = '<div class="notice">No hay resultados con esos filtros. Prueba otra categoría o limpia la búsqueda.</div>';
    const more = $('#technicalMore');
    if (more) more.classList.add('hidden');
    return;
  }
  list.innerHTML = technicalItems.map(entry => {
    const tags = (entry.tags || []).slice(0, 3).map(tag => `<span class="tag">${esc(tag)}</span>`).join('');
    const vehicle = entry.vehicleLabel ? `<span>${icon('car')} ${esc(entry.vehicleLabel)}</span>` : '';
    const sources = entry.sourceCount ? `<span>${icon('db')} ${sourceCountLabel(entry.sourceCount)}</span>` : '';
    return `<button class="technical-card" type="button" data-tech-id="${esc(entry.id)}">
      <div class="technical-card-top">
        ${technicalStatusBadge(entry.status)}
        <span class="technical-type">${esc(technicalTypeLabel(entry.type))}</span>
        <span class="technical-cat">· ${esc(entry.categoryTitle)}</span>
      </div>
      <h3>${esc(entry.title)}</h3>
      <p>${esc(entry.summary || '')}</p>
      <div class="technical-card-foot">
        ${vehicle}${sources}${tags}
        <span class="arrow">${icon('arrow')}</span>
      </div>
    </button>`;
  }).join('');
  list.querySelectorAll('[data-tech-id]').forEach(button => {
    button.addEventListener('click', () => openTechnicalEntry(button.dataset.techId));
  });
  const more = $('#technicalMore');
  if (more) more.classList.toggle('hidden', !technicalData.hasMore);
}

function setTechnicalDetailMode(open) {
  const detail = $('#technicalDetail');
  const wrap = $('#technicalListWrap');
  const bar = $('.technical-results-bar');
  if (detail) detail.classList.toggle('hidden', !open);
  if (wrap) wrap.classList.toggle('hidden', open);
  if (bar) bar.classList.toggle('hidden', open);
}

function closeTechnicalDetail() {
  technicalSelectedId = '';
  setTechnicalDetailMode(false);
}

function technicalRows(rows) {
  const filtered = rows.filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '');
  if (!filtered.length) return '';
  return `<dl class="tech-data-list">${filtered.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
}

function technicalTextList(items, ordered = false) {
  const values = (items || []).map(item => typeof item === 'string' ? item : (item?.text || '')).filter(Boolean);
  if (!values.length) return '<p class="micro-note">Sin datos registrados.</p>';
  const tag = ordered ? 'ol' : 'ul';
  return `<${tag}>${values.map(value => `<li>${esc(value)}</li>`).join('')}</${tag}>`;
}

function technicalDataHtml(entry) {
  const data = entry.data || {};
  if (entry.type === 'vehicle_spec') {
    const specs = data.specs || {};
    const years = data.yearFrom ? `${data.yearFrom}–${data.yearTo || 'actualidad'}` : '';
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Modelo</h4>${technicalRows([
        ['Marca', data.brand], ['Modelo', data.model], ['Generación', data.generation], ['Años', years],
        ['Combustibles', (data.fuels || []).join(', ')], ['Estado comercial', data.status]
      ])}</section>
      <section class="tech-block"><h4>Especificaciones publicadas</h4>${technicalRows([
        ['Carrocería', specs.carrosserie], ['Plazas', specs.zitplaatsen], ['Puertas', specs.deuren],
        ['Potencia', specs.vermogen_pk ? `${specs.vermogen_pk} CV` : ''],
        ['0–100 km/h', specs.acceleratie_0_100_s ? `${specs.acceleratie_0_100_s} s` : ''],
        ['Velocidad máxima', specs.topsnelheid_kmh ? `${specs.topsnelheid_kmh} km/h` : ''],
        ['Longitud', specs.lengte_mm ? `${specs.lengte_mm} mm` : ''], ['Anchura', specs.breedte_mm ? `${specs.breedte_mm} mm` : ''],
        ['Altura', specs.hoogte_mm ? `${specs.hoogte_mm} mm` : ''], ['Masa en orden de marcha', specs.massa_rijklaar_kg ? `${specs.massa_rijklaar_kg} kg` : ''],
        ['Remolque frenado', specs.trekgewicht_geremd_kg ? `${specs.trekgewicht_geremd_kg} kg` : ''],
        ['Maletero', specs.kofferbak_liter ? `${specs.kofferbak_liter} l` : '']
      ])}</section>
    </div><p class="tech-inline-warning">${esc(data.note || 'Especificaciones indicativas del fabricante/WLTP. Verificar la ficha oficial de la versión y el mercado antes de usarlas para una reparación.')}</p>`;
  }
  if (entry.type === 'vehicle_dossier') {
    const engine = data.engine || {};
    const transmission = data.transmission || {};
    const emissions = data.emissions || {};
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Identificación</h4>${technicalRows([
        ['Marca', data.brand], ['Modelo', data.model], ['Generación', data.generation], ['Versión', data.version], ['Años', data.years], ['Carrocería', data.body]
      ])}</section>
      <section class="tech-block"><h4>Motor</h4>${technicalRows([
        ['Código', engine.code], ['Cilindrada', engine.displacementCc ? `${engine.displacementCc} cc` : ''], ['Combustible', engine.fuel],
        ['Potencia', engine.powerPs ? `${engine.powerPs} CV / ${engine.powerKw || '—'} kW` : ''], ['Par', engine.torqueNm ? `${engine.torqueNm} Nm` : ''],
        ['Alimentación', engine.injection], ['Sobrealimentación', engine.aspiration], ['Distribución', engine.distribution], ['Notas', engine.notes]
      ])}</section>
      <section class="tech-block"><h4>Transmisión y emisiones</h4>${technicalRows([
        ['Cambio', transmission.type], ['Relaciones', transmission.gears], ['Tracción', transmission.drive],
        ['Norma', emissions.standard], ['Postratamiento', emissions.aftertreatment], ['Notas del dossier', data.notes]
      ])}</section>
      <section class="tech-block"><h4>Sistemas documentados</h4>${(data.systems || []).length ? `<div class="library-systems">${data.systems.map(s => `<span class="tag">${esc(s)}</span>`).join('')}</div>` : '<p class="micro-note">Sin sistemas registrados.</p>'}</section>
    </div><p class="tech-inline-warning">${esc(data.documentationScope || 'Dossier editorial: no sustituye al manual del fabricante.')}</p>`;
  }
  if (entry.type === 'dtc') {
    const causes = (data.causes || []).map(cause => `${cause.likelihoodLabel || cause.likelihood || 'Posible'}: ${cause.text || ''}`).filter(Boolean);
    const symptoms = data.symptoms || [];
    const repair = data.repair || {};
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Identificación</h4>${technicalRows([
        ['Código', data.code], ['Familia', data.family], ['Categoría OBDex', data.category], ['Componentes', (data.components || []).join(', ')]
      ])}</section>
      <section class="tech-block"><h4>Descripción</h4><p>${esc(data.descriptionEn || entry.summary || '')}</p></section>
      <section class="tech-block"><h4>Causas posibles</h4>${technicalTextList(causes)}</section>
      <section class="tech-block"><h4>Síntomas descritos</h4>${technicalTextList(symptoms)}</section>
      <section class="tech-block"><h4>Reparación estimada</h4>${technicalRows([
        ['Dificultad', repair.difficultyLabel], ['Posible por cuenta propia', repair.diyPossible ? 'Sí' : 'No indicado'],
        ['Coste estimado', repair.costLabel], ['Horas estimadas', repair.hoursLabel]
      ])}</section>
      <section class="tech-block"><h4>Códigos relacionados</h4>${technicalTextList(data.relatedCodes)}</section>
    </div><p class="tech-inline-warning">${esc(data.scopeNote || 'Código genérico. La definición y las causas pueden variar según fabricante y motor.')}</p>`;
  }
  if (entry.type === 'recall') {
    const labels = (data.labels || []).join(', ');
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Campaña</h4>${technicalRows([
        ['Campaña', data.campaign], ['Fabricante', data.manufacturer], ['Componente', data.component],
        ['Fecha', data.reportDate], ['Mercado', data.market], ['Años', (data.years || []).join(', ')],
        ['Modelos', data.models], ['Versiones afectadas', labels]
      ])}</section>
      <section class="tech-block"><h4>Aviso</h4><p>${esc(data.summary || '')}</p><p>${esc(data.consequence || '')}</p></section>
      <section class="tech-block"><h4>Remedio publicado</h4><p>${esc(data.remedy || 'No indicado en la fuente.')}</p>${technicalRows([
        ['Parar el vehículo', data.parkIt ? 'Sí' : 'No'], ['Aparcar al aire libre', data.parkOutside ? 'Sí' : 'No'],
        ['Actualización remota', data.overTheAirUpdate ? 'Sí' : 'No']
      ])}</section>
      <section class="tech-block"><h4>Código de campaña</h4><p>${esc(data.campaign || '')}</p></section>
    </div><p class="tech-inline-warning">${esc(data.scopeNote || 'Campaña del mercado estadounidense. Comprobar el VIN en el fabricante u organismo oficial correspondiente.')}</p>`;
  }
  if (entry.type === 'document') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Documento</h4>${technicalRows([
        ['Archivo', data.fileName], ['Formato', data.mimeType], ['Páginas', data.pages],
        ['Fragmentos indexados', data.chunkCount], ['Importado', data.importedAt], ['Licencia', data.license]
      ])}</section>
      <section class="tech-block"><h4>Uso</h4><p>${esc(data.note || 'Documento importado con licencia declarada.')}</p></section>
    </div>`;
  }
  if (entry.type === 'inspection') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Comprobación</h4><p>${esc(data.check || entry.summary)}</p></section>
      <section class="tech-block"><h4>Motivo y prioridad</h4><p>${esc(data.why || '')}</p>${technicalRows([['Nivel', data.level]])}</section>
    </div><p class="tech-inline-warning">${esc(data.note || 'Punto de revisión editorial; no es un procedimiento oficial del fabricante.')}</p>`;
  }
  if (entry.type === 'pid') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Lectura OBD-II</h4>${technicalRows([
        ['Modo', data.mode || '01'], ['PID', data.pid], ['Bytes', data.bytes], ['Fórmula', data.formula], ['Unidad', data.unit],
        ['Rango', Array.isArray(data.range) ? `${data.range[0]} … ${data.range[1]} ${data.unit || ''}` : (data.range ? `${data.range.min} … ${data.range.max} ${data.unit || ''}` : '')]
      ])}</section>
      <section class="tech-block"><h4>Interpretación</h4><p>${esc(data.note || 'PID estándar. La ECU debe declararlo y el valor real depende del motor y del protocolo.')}</p></section>
    </div>`;
  }
  if (entry.type === 'tutorial') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Vídeo</h4>${technicalRows([
        ['Canal', data.channel], ['Duración', data.duration], ['Idioma', data.language], ['Nivel', data.level], ['DTC relacionados', (data.dtcs || []).join(', ')]
      ])}</section>
      <section class="tech-block"><h4>Alcance</h4><p>${esc(data.sourceNote || '')}</p></section>
    </div>`;
  }
  if (entry.type === 'source') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Fuente</h4>${technicalRows([
        ['Editor', data.publisher], ['Acceso', data.access], ['Licencia', data.license],
        ['HTTP', data.httpStatus ? String(data.httpStatus) : ''], ['Comprobada', data.lastCheckedAt], ['Idioma', data.language], ['Mercado', data.market]
      ])}</section>
      <section class="tech-block"><h4>Uso</h4><p>${esc(data.note || '')}</p>${data.httpStatus !== 200 ? `<p class="tech-inline-warning">La comprobación automatizada devolvió ${esc(String(data.httpStatus))}. No se presenta como contenido verificado.</p>` : ''}</section>
    </div>`;
  }
  if (entry.type === 'symptom') {
    const causes = (data.commonCauses || []).map(cause => `${cause.likelihood ? `[${cause.likelihood}] ` : ''}${cause.text}`).join('\n');
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Contexto</h4>${technicalRows([
        ['Sistema', data.category], ['Área', data.area], ['Urgencia', data.urgency], ['Alcance', data.vehicleScope], ['Riesgo', data.driveRisk]
      ])}</section>
      <section class="tech-block"><h4>Causas posibles</h4>${technicalTextList(causes ? causes.split('\n') : [])}</section>
      <section class="tech-block"><h4>Comprobaciones rápidas</h4>${technicalTextList(data.quickChecks, true)}</section>
      <section class="tech-block"><h4>Herramientas y DTC</h4>${technicalTextList([...(data.tools || []), ...(data.relatedDtc || [])])}</section>
    </div><p class="tech-inline-warning">${esc(data.scopeNote || '')}</p>`;
  }
  if (entry.type === 'guide') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Pasos</h4>${technicalTextList(data.steps, true)}</section>
      <section class="tech-block"><h4>Advertencias</h4>${technicalTextList(data.warnings)}</section>
    </div><p class="tech-inline-warning">${esc(data.note || '')}</p>`;
  }
  if (entry.type === 'dtc_index') {
    return `<div class="tech-detail-grid">
      <section class="tech-block"><h4>Base local</h4>${technicalRows([['Códigos', fmtNum(data.count)], ['Consulta', 'Vista de diagnosis DTC']])}</section>
      <section class="tech-block"><h4>Uso</h4><p>${esc(data.note || '')}</p></section>
    </div>`;
  }
  return `<p class="micro-note">Tipo de documento sin ficha específica.</p>`;
}

function renderTechnicalDetail(entry) {
  const detail = $('#technicalDetail');
  if (!detail) return;
  const category = entry.category || {};
  const actions = [];
  if (entry.refType === 'vehicle') actions.push(`<button class="btn primary sm" type="button" data-tech-action="vehicle" data-tech-id="${esc(entry.refId)}">Abrir ficha del vehículo ${icon('arrow')}</button>`);
  if (entry.refType === 'symptom') actions.push(`<button class="btn primary sm" type="button" data-tech-action="symptom" data-tech-id="${esc(entry.refId)}">Abrir síntoma ${icon('pulse')}</button>`);
  if (entry.refType === 'tutorial') actions.push(`<button class="btn primary sm" type="button" data-tech-action="tutorials">Buscar en tutoriales ${icon('play')}</button>`);
  if (entry.refType === 'pid') actions.push(`<button class="btn primary sm" type="button" data-tech-action="obd">Abrir consola OBD ${icon('cpu')}</button>`);
  if (entry.refType === 'dtc') actions.push(`<button class="btn primary sm" type="button" data-tech-action="dtc">Abrir base DTC ${icon('search')}</button>`);
  if (entry.url && entry.type !== 'source') actions.push(`<a class="btn ghost sm" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Abrir original ${icon('external')}</a>`);
  if (entry.url && entry.type === 'source' && entry.data?.httpStatus === 200) actions.push(`<a class="btn ghost sm" href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Abrir fuente ${icon('external')}</a>`);
  let sources = (entry.sources || []).map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)} ${icon('external')}</a><small>${esc(source.publisher)} · ${esc(source.type)} · ${esc(source.access)} · ${esc(source.license)}</small></li>`).join('');
  if (!sources && entry.type === 'tutorial' && entry.url) {
    sources = `<li><a href="${esc(entry.url)}" target="_blank" rel="noopener noreferrer">Vídeo original en YouTube ${icon('external')}</a><small>Metadatos verificados mediante oEmbed; el contenido técnico del vídeo no se ha validado.</small></li>`;
  }
  const related = (entry.relatedCategories || []).map(cat => `<button class="tech-related-btn" type="button" data-tech-related="${esc(cat.id)}">${esc(cat.title)}</button>`).join('');
  detail.innerHTML = `
    <div class="tech-detail-actions">
      <button class="btn ghost sm tech-back" type="button" data-tech-back>${icon('arrow')} Volver al listado</button>
      ${actions.join('')}
    </div>
    <div class="tech-detail-head">
      <div>
        <span class="eyebrow">${category.number ? `CATEGORÍA ${String(category.number).padStart(2, '0')} · ` : ''}${esc(category.title || entry.categoryTitle || '')}</span>
        <h3>${esc(entry.title)}</h3>
        <p>${esc(entry.summary || '')}</p>
      </div>
      <div class="library-detail-tags">${technicalStatusBadge(entry.status)}<span class="tag">${esc(technicalTypeLabel(entry.type))}</span></div>
    </div>
    ${technicalDataHtml(entry)}
    ${related ? `<div class="tech-cat-related"><small>Categorías relacionadas</small>${related}</div>` : ''}
    <section class="sheet-section">
      <h3>${icon('db')} Fuentes y trazabilidad</h3>
      <ul class="tech-sources">${sources || `<li>Sin fuente externa registrada. ${esc(entry.status === 'generic' ? 'Contenido genérico, no específico de un modelo.' : 'Consulta el estado de la ficha antes de usarla como procedimiento.')}</li>`}</ul>
    </section>`;
  setTechnicalDetailMode(true);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  detail.querySelector('[data-tech-back]')?.addEventListener('click', closeTechnicalDetail);
  detail.querySelectorAll('[data-tech-related]').forEach(button => {
    button.addEventListener('click', () => {
      technicalSelectedCategory = button.dataset.techRelated;
      renderTechnicalCategories();
      renderTechnicalCategoryHead();
      closeTechnicalDetail();
      fetchTechnicalEntries(true);
      window.scrollTo({ top: detail.getBoundingClientRect().top + window.scrollY - 90, behavior: 'smooth' });
    });
  });
  detail.querySelectorAll('[data-tech-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.dataset.techAction;
      if (action === 'vehicle') {
        showView('vehiculos');
        await loadVehicles();
        await openVehicleSheet(button.dataset.techId, { scroll: true });
      } else if (action === 'symptom') {
        await openUniversalResult('symptom', button.dataset.techId, entry.title);
      } else if (action === 'tutorials') {
        goToTutorials({ q: entry.title });
      } else if (action === 'obd') {
        showView('obd');
      } else if (action === 'dtc') {
        showView('dtc');
        const input = $('#dtcSearch');
        if (input) input.focus();
      }
    });
  });
}

async function openTechnicalEntry(id, { scroll = false } = {}) {
  if (!id) return;
  technicalSelectedId = id;
  const detail = $('#technicalDetail');
  if (!detail) return;
  setTechnicalDetailMode(true);
  detail.innerHTML = '<div class="notice">Cargando ficha técnica…</div>';
  try {
    const entry = await api(`/api/technical/${encodeURIComponent(id)}`);
    renderTechnicalDetail(entry);
    if (scroll && window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => {
        const top = detail.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top, behavior: 'smooth' });
      });
    }
  } catch (err) {
    detail.innerHTML = `<div class="tech-detail-actions"><button class="btn ghost sm" type="button" data-tech-back>${icon('arrow')} Volver al listado</button></div><div class="notice">No se pudo abrir la ficha: ${esc(err.message)}</div>`;
    detail.querySelector('[data-tech-back]')?.addEventListener('click', closeTechnicalDetail);
  }
}

async function ensureTechnical() {
  if (!technicalMeta) await loadTechnicalMeta();
  if (!technicalLoaded) await fetchTechnicalEntries(true);
}

async function switchLibraryMode(mode) {
  libraryMode = mode === 'technical' ? 'technical' : 'dossiers';
  $$('.library-switch-btn').forEach(button => {
    const active = button.dataset.libraryMode === libraryMode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
  });
  $('#libraryDossiers')?.classList.toggle('hidden', libraryMode !== 'dossiers');
  $('#libraryTechnical')?.classList.toggle('hidden', libraryMode !== 'technical');
  if (libraryMode === 'technical') {
    try {
      await ensureTechnical();
    } catch (err) {
      const list = $('#technicalList');
      if (list) list.innerHTML = `<div class="notice">No se pudo cargar la biblioteca técnica: ${esc(err.message)}</div>`;
    }
  }
}

function initTechnicalLibrary() {
  $$('.library-switch-btn').forEach(button => {
    button.addEventListener('click', () => switchLibraryMode(button.dataset.libraryMode));
  });
  const search = $('#technicalSearch');
  const type = $('#technicalType');
  const status = $('#technicalStatus');
  const reset = $('#technicalReset');
  let timer = null;
  search?.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => fetchTechnicalEntries(true), 220);
  });
  ['#technicalType', '#technicalStatus', '#technicalBrand', '#technicalModel', '#technicalGeneration', '#technicalYear', '#technicalEngine', '#technicalSystem'].forEach(selector => {
    $(selector)?.addEventListener('change', () => fetchTechnicalEntries(true));
  });
  reset?.addEventListener('click', () => {
    if (search) search.value = '';
    ['#technicalType', '#technicalStatus', '#technicalBrand', '#technicalModel', '#technicalGeneration', '#technicalYear', '#technicalEngine', '#technicalSystem'].forEach(selector => {
      const select = $(selector);
      if (select) select.value = '';
    });
    technicalSelectedCategory = '';
    renderTechnicalCategories();
    renderTechnicalCategoryHead();
    closeTechnicalDetail();
    fetchTechnicalEntries(true);
  });
  $('#technicalMore')?.addEventListener('click', () => fetchTechnicalEntries(false));
  loadTechnicalMeta().catch(() => { /* la pestaña mostrará el error al abrirse */ });
}

// -------------------------------------------------------------
// FICHA DE PRODUCTO
// -------------------------------------------------------------
async function openProductSheet(id) {
  const modal = $('#productModal');
  const body = $('#productSheetBody');
  if (!modal || !body) return;
  let p = productsCache.find(x => x.id === id);
  if (!p) {
    try {
      p = await api(`/api/products/${encodeURIComponent(id)}`);
    } catch (err) {
      return;
    }
  }
  const link = p.linkStatus === 'verified' ? p.affiliateUrl : '';
  const features = Array.isArray(p.features) ? p.features : [];
  body.innerHTML = `
    <div class="product-sheet-grid">
      <div class="product-sheet-media">
        ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">` : `<span class="product-placeholder">${icon(productIcon(p.category))}<b>Foto pendiente</b></span>`}
        <div class="product-badges">
          <span class="product-badge ${p.imageStatus === 'verified' ? 'verified' : 'pending'}">${p.imageStatus === 'verified' ? 'Foto verificada' : 'Foto pendiente'}</span>
          <span class="product-badge ${p.linkStatus === 'verified' ? 'verified' : 'pending'}">${p.linkStatus === 'verified' ? 'Enlace verificado' : 'Enlace pendiente'}</span>
        </div>
      </div>
      <div class="product-sheet-copy">
        <span class="eyebrow">${esc(p.category || 'Catálogo')}${p.subcategory ? ' · ' + esc(p.subcategory) : ''}</span>
        <h2 id="productSheetTitle">${esc(p.name)}</h2>
        <p class="product-sheet-brand">${esc(p.manufacturer || 'Fabricante no confirmado')}${p.asin ? ` · ASIN ${esc(p.asin)}` : ''}</p>
        <p>${esc(p.description || 'Sin descripción verificada.')}</p>
        <div class="product-sheet-facts">
          <div><small>Referencia</small><b>${esc(p.reference || 'No publicada en la ficha')}</b></div>
          <div><small>Vendedor</small><b>${esc(p.seller || 'No indicado')}</b></div>
          <div><small>Precio</small><b>${esc(p.price || 'Consultar')}</b></div>
          <div><small>Verificado</small><b>${esc(p.verifiedAt || 'No indicado')}</b></div>
        </div>
        ${p.listingPrice ? `<p class="micro-note">Precio observado en la búsqueda: ${esc(p.listingPrice)}. No es una oferta garantizada; consulta la ficha del vendedor.</p>` : ''}
        ${features.length ? `<h4>Características publicadas por el vendedor</h4><ul class="check-list">${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <div class="compat-note"><b>${icon('alert')} Compatibilidad</b><p>${esc(p.compatibility?.note || 'No verificada para un vehículo concreto.')}</p></div>
        ${p.verificationNote ? `<p class="micro-note">${esc(p.verificationNote)}</p>` : ''}
        <div class="product-sheet-actions">
          ${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Abrir en la tienda ${icon('external')}</a>` : '<span class="btn ghost">Enlace no disponible</span>'}
          <button class="btn ghost" type="button" data-product-close>Cerrar</button>
        </div>
        ${p.listingTitle && p.listingTitle !== p.name ? `<p class="micro-note">Título de la ficha: ${esc(p.listingTitle)}</p>` : ''}
      </div>
    </div>`;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  body.querySelector('[data-product-close]')?.addEventListener('click', closeProductSheet);
}

function closeProductSheet() {
  const modal = $('#productModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
}

$$('[data-product-close]').forEach(el => el.addEventListener('click', closeProductSheet));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeProductSheet();
});

// Carga bajo demanda y enlaces desde el buscador universal.
document.addEventListener('viewchange', e => {
  if (e.detail.name === 'vehiculos') loadVehicles();
  if (e.detail.name === 'tuning') loadTuning();
  if (e.detail.name === 'biblioteca') loadLibrary();
});

// -------------------------------------------------------------
// INICIALIZACIÓN
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initVehicleSelector();
  initHomeVehicleSelector();
  initUniversalSearch();
  initLibraryFilters();
  initTechnicalLibrary();
  initOBD();
  const initial = location.hash.slice(1);
  if (initial) showView(initial);
  Promise.all([
    loadStats(),
    loadSymptoms(),
    loadProducts(),
    loadComponents(),
    loadVehicles(),
    loadTuning(),
    loadLibrary(),
    searchDtc('P0300')
  ]).catch(err => console.error('Error en inicialización:', err));
});

window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
