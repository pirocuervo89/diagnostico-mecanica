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

function foldText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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
    tuning: 'zap'  })[type] || 'spark';
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
    ['tuning', 'Tuning']  ];
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

// Etiqueta del precio: indica la tienda y la fecha en que se consultó.
function priceCaption(p) {
  if (!/\d/.test(String(p.price || ''))) return 'Precio';
  const source = String(p.priceSource || '');
  const date = String(p.priceCheckedAt || '');
  if (!source && !date) return 'Precio';
  return `Precio${/amazon/i.test(source) ? ' Amazon' : ''}${date ? ` · ${priceDate(date)}` : ''}`;
}

function priceDate(value) {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : String(value || '');
}

// El servidor refresca los precios de Amazon por su cuenta; aquí se aplican a
// las tarjetas visibles sin recargar ni volver a pintar la rejilla.
function priceCaptionFrom(info) {
  if (!/\d/.test(String(info?.price || ''))) return 'Precio';
  const source = String(info.source || '');
  const m = String(info.checkedAt || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
  return `Precio${/amazon/i.test(source) ? ' Amazon' : ''}${date ? ` · ${date}` : ''}`;
}

async function refreshVisiblePrices() {
  if (document.hidden) return;
  const cards = $$('[data-price-id]');
  if (!cards.length) return;
  try {
    const data = await api('/api/prices/current');
    const map = data.prices || {};
    cards.forEach(card => {
      const next = map[card.dataset.priceId];
      if (!next || !next.price) return;
      const value = card.querySelector('.price-value');
      const label = card.querySelector('small');
      if (value && value.textContent.trim() !== next.price) value.textContent = next.price;
      if (label) label.textContent = priceCaptionFrom(next);
      card.classList.toggle('pending', !/\d/.test(next.price));
      const cached = productsCache.find(x => x.id === card.dataset.priceId);
      if (cached) {
        cached.price = next.price;
        cached.priceCheckedAt = next.checkedAt;
        cached.priceSource = next.source;
      }
    });
  } catch { /* sin conexión: se mantiene el precio que ya se ve */ }
}
setInterval(refreshVisiblePrices, 120000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) refreshVisiblePrices();
});

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
      ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Ver oferta ${icon('external')}</a>`
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
            <span class="product-price${/\d/.test(String(p.price || '')) ? '' : ' pending'}" title="${esc(p.priceSource || 'Precio del catálogo')}" data-price-id="${esc(p.id)}"><small>${esc(priceCaption(p))}</small><span class="price-value">${esc(p.price || 'Consultar precio')}</span></span>
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
              ? `<a class="recommended-item" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener noreferrer" title="${esc(note)}">${inner}</a>`
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
// PAGOS: informe técnico descargable (Stripe Checkout)
// -------------------------------------------------------------
const payState = { status: null };

function payNote(text) {
  const note = $('#payNote');
  if (note) note.textContent = text;
}

function payBadge(text) {
  const badge = $('#payBadge');
  if (badge) badge.textContent = text;
}

function reportFormData() {
  return {
    brand: $('#fBrand')?.value || '',
    model: $('#fModel')?.value || '',
    year: $('#fYear')?.value || '',
    engine: $('#fEngine')?.value || '',
    km: $('#fKm')?.value || '',
    dtc: $('#fDtc')?.value || '',
    symptoms: $('#fSymptoms')?.value || ''
  };
}

async function verifyPaySession(sessionId) {
  const download = $('#payDownload');
  try {
    const result = await api(`/api/payments/session/${encodeURIComponent(sessionId)}`);
    if (result.paid && result.downloadUrl) {
      payBadge('Pagado');
      if (download) {
        download.href = result.downloadUrl;
        download.classList.remove('hidden');
      }
      payNote(`Pago confirmado · referencia ${result.orderId}. El informe está listo para descargar o imprimir.`);
    } else {
      payNote('El pago todavía no consta como completado. Si acabas de pagar, espera unos segundos y recarga la página.');
    }
  } catch (err) {
    payNote(`No se pudo verificar el pago: ${err.message}`);
  }
}

async function buyReport() {
  const buy = $('#payBuy');
  const report = reportFormData();
  if (!report.brand.trim() || !report.model.trim()) {
    payNote('Indica marca y modelo antes de comprar: aparecen en el informe.');
    $('#fBrand')?.focus();
    return;
  }
  const original = buy ? buy.textContent : '';
  if (buy) {
    buy.disabled = true;
    buy.textContent = 'Abriendo Stripe…';
  }
  try {
    const result = await api('/api/payments/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report, email: '' })
    });
    if (result.url) {
      window.location.href = result.url;
      return;
    }
    throw new Error('Stripe no devolvió la dirección de pago.');
  } catch (err) {
    payNote(`No se pudo iniciar el pago: ${err.message}`);
    if (buy) {
      buy.disabled = false;
      buy.textContent = original || 'Comprar informe';
    }
  }
}

async function initPayments() {
  const buy = $('#payBuy');
  if (!buy) return;
  try {
    payState.status = await api('/api/payments/status');
  } catch (err) {
    payBadge('No disponible');
    payNote(`No se pudo consultar la pasarela de pago: ${err.message}`);
    return;
  }
  const status = payState.status;
  buy.textContent = status.configured ? `Comprar informe · ${status.priceLabel}` : 'Pago no configurado';
  buy.disabled = !status.configured;
  payBadge(status.configured ? (status.mode === 'test' ? 'Stripe · pruebas' : 'Stripe · activo') : 'Sin configurar');
  payNote(status.note || '');
  buy.addEventListener('click', buyReport);

  const params = new URLSearchParams(window.location.search);
  if (params.get('pago') === 'ok' && params.get('session_id')) {
    await verifyPaySession(params.get('session_id'));
  } else if (params.get('pago') === 'cancelado') {
    payNote('Compra cancelada. No se ha realizado ningún cargo.');
  }
}

// -------------------------------------------------------------
// VISTA: LECTURA OBD-II / ELM327
// -------------------------------------------------------------
const obdState = { connected: false, reading: false, live: false, dtcs: [], telemetry: {}, mode: 'simulated' };
let obdManager = null;

const telemetryHistory = { points: [], max: 60 };

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
  paintSourceBadge($('#obdSourceLabel'), telemetrySource());

  paintGauge('obd', 'Rpm', data.rpm, 0, 8000);
  paintGauge('obd', 'Coolant', data.coolant, 40, 120);
  paintGauge('obd', 'Load', data.load, 0, 100);
  paintGauge('obd', 'Voltage', data.voltage, 10, 16, 1);
  paintGauge('obd', 'Speed', data.speed, 0, 240);
  paintGauge('obd', 'Oil', data.oil, 40, 150);
  paintGauge('obd', 'Boost', data.boost, 0, 200);
  paintGauge('obd', 'Lambda', data.lambda, 0.7, 1.3, 2);

  const sample = { at: Date.now() };
  let hasSample = false;
  for (const key of SALA_GAUGE_KEYS) {
    const value = numericValue(data[key]);
    if (value !== null) {
      sample[key] = value;
      hasSample = true;
    }
  }
  if (hasSample) {
    telemetryHistory.points.push(sample);
    if (telemetryHistory.points.length > telemetryHistory.max) telemetryHistory.points.shift();
    salaState.samples += 1;
    salaState.lastAt = sample.at;
  }
  paintChart('obd');
  salaPaintGauges(data);
  salaPaintCharts();
  salaSyncControls();
}

function resetTelemetry() {
  telemetryHistory.points = [];
  ['obd'].forEach(prefix => {
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

// -------------------------------------------------------------
// VISTA: SALA DE MÁQUINAS (banco de instrumentos y osciloscopio)
// -------------------------------------------------------------
const SALA_GAUGES = [
  { group: 'Motor', key: 'rpm', label: 'Revoluciones', unit: 'rpm', min: 0, max: 8000, dec: 0, color: 'var(--accent)' },
  { group: 'Motor', key: 'load', label: 'Carga motor', unit: '%', min: 0, max: 100, dec: 0, color: '#ffd166' },
  { group: 'Motor', key: 'throttle', label: 'Mariposa', unit: '%', min: 0, max: 100, dec: 0, color: 'var(--cyan)' },
  { group: 'Motor', key: 'pedal', label: 'Pedal', unit: '%', min: 0, max: 100, dec: 0, color: 'var(--ok)' },
  { group: 'Motor', key: 'torque', label: 'Par real', unit: '%', min: 0, max: 100, dec: 0, color: 'var(--accent)' },
  { group: 'Motor', key: 'driverDemand', label: 'Demanda conductor', unit: '%', min: 0, max: 100, dec: 0, color: '#38efa4' },
  { group: 'Motor', key: 'refTorque', label: 'Par de referencia', unit: 'Nm', min: 0, max: 400, dec: 0, color: 'var(--cyan)' },
  { group: 'Motor', key: 'injTiming', label: 'Avance inyección', unit: '°', min: -20, max: 40, dec: 1, color: '#ffd166' },
  { group: 'Motor', key: 'speed', label: 'Velocidad', unit: 'km/h', min: 0, max: 240, dec: 0, color: 'var(--cyan)' },
  { group: 'Temperaturas', key: 'coolant', label: 'Refrigerante', unit: '°C', min: 20, max: 130, dec: 0, color: 'var(--cyan)' },
  { group: 'Temperaturas', key: 'oil', label: 'Aceite', unit: '°C', min: 20, max: 160, dec: 0, color: '#ffd166' },
  { group: 'Temperaturas', key: 'iat', label: 'Admisión', unit: '°C', min: -20, max: 90, dec: 0, color: 'var(--ok)' },
  { group: 'Temperaturas', key: 'intercooler', label: 'Aire tras intercooler', unit: '°C', min: -20, max: 90, dec: 0, color: 'var(--accent)' },
  { group: 'Temperaturas', key: 'ambient', label: 'Ambiente', unit: '°C', min: -20, max: 60, dec: 0, color: 'var(--ok)' },
  { group: 'Temperaturas', key: 'catalyst', label: 'Catalizador', unit: '°C', min: 0, max: 1000, dec: 0, color: '#ff5d6c' },
  { group: 'Temperaturas', key: 'dpf', label: 'DPF / FAP', unit: '°C', min: 0, max: 900, dec: 0, color: '#ff5d6c' },
  { group: 'Presiones', key: 'boost', label: 'Turbo', unit: 'kPa', min: 0, max: 200, dec: 0, color: 'var(--accent)' },
  { group: 'Presiones', key: 'map', label: 'Colector', unit: 'kPa', min: 0, max: 250, dec: 0, color: 'var(--cyan)' },
  { group: 'Presiones', key: 'baro', label: 'Barométrica', unit: 'kPa', min: 80, max: 110, dec: 0, color: '#7f8c97' },
  { group: 'Presiones', key: 'railBar', label: 'Rail', unit: 'bar', min: 0, max: 1600, dec: 0, color: '#ffd166' },
  { group: 'Combustible', key: 'fuelPressure', label: 'Presión de combustible', unit: 'kPa', min: 0, max: 600, dec: 0, color: 'var(--cyan)' },
  { group: 'Combustible', key: 'railAbsBar', label: 'Rail absoluto', unit: 'bar', min: 0, max: 1600, dec: 0, color: 'var(--accent)' },
  { group: 'Combustible', key: 'evap', label: 'Vapor del depósito', unit: 'Pa', min: -6000, max: 2000, dec: 0, color: '#38efa4' },
  { group: 'Combustible', key: 'ethanol', label: 'Etanol', unit: '%', min: 0, max: 100, dec: 0, color: '#ffd166' },
  { group: 'Mezcla y encendido', key: 'maf', label: 'MAF', unit: 'g/s', min: 0, max: 120, dec: 1, color: 'var(--cyan)' },
  { group: 'Mezcla y encendido', key: 'lambda', label: 'Lambda', unit: 'λ', min: 0.7, max: 1.3, dec: 3, color: 'var(--ok)' },
  { group: 'Mezcla y encendido', key: 'o2', label: 'Sonda B1S1', unit: 'V', min: 0, max: 1, dec: 2, color: '#ffd166' },
  { group: 'Mezcla y encendido', key: 'stft', label: 'Corrección corta', unit: '%', min: -25, max: 25, dec: 1, color: 'var(--ok)' },
  { group: 'Mezcla y encendido', key: 'ltft', label: 'Corrección larga', unit: '%', min: -25, max: 25, dec: 1, color: '#ff5d6c' },
  { group: 'Mezcla y encendido', key: 'timing', label: 'Avance', unit: '°', min: -10, max: 50, dec: 1, color: 'var(--accent)' },
  { group: 'Escape y turbo', key: 'egt', label: 'Gases de escape', unit: '°C', min: 0, max: 900, dec: 0, color: '#ff5d6c' },
  { group: 'Escape y turbo', key: 'turboRpm', label: 'Régimen del turbo', unit: 'rpm', min: 0, max: 200000, dec: 0, color: 'var(--accent)' },
  { group: 'Eléctrico', key: 'voltage', label: 'Tensión', unit: 'V', min: 10, max: 16, dec: 1, color: 'var(--ok)' },
  { group: 'Eléctrico', key: 'hvBattery', label: 'Batería HV', unit: '%', min: 0, max: 100, dec: 0, color: '#38efa4' },
  { group: 'Eléctrico', key: 'fuelLevel', label: 'Nivel', unit: '%', min: 0, max: 100, dec: 0, color: '#ffd166' },
  { group: 'Eléctrico', key: 'fuelRate', label: 'Consumo', unit: 'L/h', min: 0, max: 40, dec: 2, color: 'var(--cyan)' },
  { group: 'Uso y mantenimiento', key: 'runHours', label: 'Horas de motor', unit: 'h', min: 0, max: 200, dec: 1, color: 'var(--cyan)' },
  { group: 'Uso y mantenimiento', key: 'sinceClear', label: 'Desde el borrado', unit: 'km', min: 0, max: 20000, dec: 0, color: 'var(--ok)' },
  { group: 'Uso y mantenimiento', key: 'distanceMil', label: 'Con testigo encendido', unit: 'km', min: 0, max: 20000, dec: 0, color: '#ff5d6c' }
];
const SALA_GAUGE_KEYS = SALA_GAUGES.map(g => g.key);

const SALA_CHARTS = [
  {
    id: 'motor', wide: true, title: 'RÉGIMEN Y VELOCIDAD · SESIÓN ACTUAL',
    series: [
      { key: 'rpm', label: 'RPM', unit: 'rpm', min: 0, max: 8000, dec: 0, color: 'var(--accent)', cls: 'rpm' },
      { key: 'speed', label: 'Velocidad', unit: 'km/h', min: 0, max: 240, dec: 0, color: '#38efa4', cls: 'speed' }
    ]
  },
  {
    id: 'escape', wide: true, title: 'ESCAPE Y ADMISIÓN · °C / rpm',
    series: [
      { key: 'egt', label: 'Gases de escape', unit: '°C', min: 0, max: 900, dec: 0, color: '#ff5d6c', cls: 'egt' },
      { key: 'intercooler', label: 'Aire intercooler', unit: '°C', min: -20, max: 90, dec: 0, color: '#22d3ee', cls: 'intercooler' },
      { key: 'turboRpm', label: 'Régimen turbo', unit: 'rpm', min: 0, max: 200000, dec: 0, color: 'var(--accent)', cls: 'turbo' }
    ]
  },
  {
    id: 'temps', title: 'TEMPERATURAS · °C',
    series: [
      { key: 'coolant', label: 'Refrigerante', unit: '°C', min: 0, max: 150, dec: 0, color: 'var(--cyan)', cls: 'coolant' },
      { key: 'oil', label: 'Aceite', unit: '°C', min: 0, max: 160, dec: 0, color: '#ffd166', cls: 'oil' },
      { key: 'iat', label: 'Admisión', unit: '°C', min: -20, max: 90, dec: 0, color: '#38efa4', cls: 'iat' },
      { key: 'catalyst', label: 'Catalizador', unit: '°C', min: 0, max: 1000, dec: 0, color: '#ff5d6c', cls: 'catalyst' }
    ]
  },
  {
    id: 'press', title: 'PRESIONES · kPa / bar',
    series: [
      { key: 'boost', label: 'Turbo', unit: 'kPa', min: 0, max: 200, dec: 0, color: 'var(--accent)', cls: 'boost' },
      { key: 'map', label: 'Colector', unit: 'kPa', min: 0, max: 250, dec: 0, color: 'var(--cyan)', cls: 'map' },
      { key: 'baro', label: 'Barométrica', unit: 'kPa', min: 80, max: 110, dec: 0, color: '#7f8c97', cls: 'baro' },
      { key: 'railBar', label: 'Rail', unit: 'bar', min: 0, max: 1600, dec: 0, color: '#ffd166', cls: 'rail' }
    ]
  },
  {
    id: 'mix', title: 'MEZCLA Y ELÉCTRICO',
    series: [
      { key: 'lambda', label: 'Lambda', unit: 'λ', min: 0.7, max: 1.3, dec: 3, color: '#ffd166', cls: 'lambda' },
      { key: 'o2', label: 'Sonda', unit: 'V', min: 0, max: 1, dec: 2, color: '#38efa4', cls: 'o2' },
      { key: 'stft', label: 'Corrección corta', unit: '%', min: -25, max: 25, dec: 1, color: '#38efa4', cls: 'stft' },
      { key: 'ltft', label: 'Corrección larga', unit: '%', min: -25, max: 25, dec: 1, color: '#ff5d6c', cls: 'ltft' },
      { key: 'voltage', label: 'Tensión', unit: 'V', min: 10, max: 16, dec: 1, color: 'var(--accent)', cls: 'voltage' }
    ]
  }
];

const SCOPE_CHANNELS = {
  inyector: {
    label: 'Inyector · pulso de mando',
    voltsPerDiv: 5,
    note: '2 impulsos por vuelta en un 4 cilindros de 4 tiempos',
    sample: ph => (ph < 0.1 ? 0.9 : ph < 0.118 ? 13.8 + (ph - 0.1) * 1400 : 13.8 + Math.sin(ph * 90) * 0.25)
  },
  encendido: {
    label: 'Primario de encendido',
    voltsPerDiv: 10,
    note: 'Dwell, salto de chispa y pico inductivo',
    sample: ph => (ph > 0.62 && ph < 0.88 ? 0.6 : ph >= 0.88 && ph < 0.9 ? 0.6 + (ph - 0.88) * 1400 : 13.6)
  },
  lambda: {
    label: 'Sonda lambda (zirconio)',
    voltsPerDiv: 0.5,
    slow: 8,
    note: 'Oscilación entre 0,1 y 0,9 V según la mezcla',
    sample: ph => 0.5 + 0.4 * Math.sin(ph * Math.PI * 2)
  },
  map: {
    label: 'Sensor MAP · analógico',
    voltsPerDiv: 2,
    note: 'Tensión proporcional a la presión del colector',
    sample: (ph, ctx) => 1.1 + (ctx.load / 100) * 2.6 + 0.25 * Math.sin(ph * Math.PI * 2)
  },
  ckp: {
    label: 'Sensor de cigüeñal · inductivo',
    voltsPerDiv: 2,
    note: 'Señal alterna generada por la rueda dentada',
    sample: ph => 2.5 + 2 * Math.sin(ph * Math.PI * 2)
  }
};

const salaState = { ready: false, group: 'Todos', samples: 0, lastAt: 0 };
const scopeState = { channel: 'inyector', channel2: 'ckp', msDiv: 5, voltDiv: 5, trigger: true, running: true };
let salaRaf = null;
function salaCapKey(key) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function salaRenderGauges() {
  const box = $('#salaGauges');
  if (!box) return;
  const groups = ['Todos', ...new Set(SALA_GAUGES.map(g => g.group))];
  const filter = $('#salaFilter');
  if (filter) {
    filter.innerHTML = groups.map(g => `<button class="chip${g === salaState.group ? ' active' : ''}" type="button" data-sala-group="${esc(g)}">${esc(g)}</button>`).join('');
    $$('#salaFilter .chip').forEach(btn => btn.addEventListener('click', () => {
      salaState.group = btn.dataset.salaGroup;
      $$('#salaFilter .chip').forEach(b => b.classList.toggle('active', b.dataset.salaGroup === salaState.group));
      salaRenderGauges();
      salaPaintGauges(obdState.telemetry || {});
    }));
  }

  let html = '';
  let current = '';
  for (const gauge of SALA_GAUGES) {
    if (salaState.group !== 'Todos' && gauge.group !== salaState.group) continue;
    if (gauge.group !== current) {
      html += `<div class="sala-group-head">${esc(gauge.group)}</div>`;
      current = gauge.group;
    }
    const cap = salaCapKey(gauge.key);
    html += `<article class="gauge-ring" id="salaGauge${cap}" style="--p:0;--ring:${gauge.color}" aria-label="${esc(gauge.label)}">
      <div class="gauge-value"><b id="sala${cap}">--</b><span>${esc(gauge.unit)}</span></div>
      <small>${esc(gauge.label)}</small>
    </article>`;
  }
  box.innerHTML = html;
}

function salaRenderCharts() {
  const box = $('#salaCharts');
  if (!box) return;
  box.innerHTML = SALA_CHARTS.map(chart => `
    <article class="signal-chart sala-chart${chart.wide ? ' wide' : ''}">
      <div class="chart-head"><span>${esc(chart.title)}</span><span data-chart-state="${chart.id}">SIN DATOS</span></div>
      <div class="chart-canvas">
        <svg viewBox="0 0 600 190" preserveAspectRatio="none" role="img" aria-label="${esc(chart.title)}">
          <g class="chart-grid">
            <path d="M0 20h600M0 65h600M0 110h600M0 155h600"/>
            <path d="M100 0v190M200 0v190M300 0v190M400 0v190M500 0v190"/>
          </g>
          ${chart.series.map(s => `<polyline class="chart-line ${s.cls}" data-line="${chart.id}-${s.key}" points=""></polyline>`).join('')}
        </svg>
      </div>
      <div class="chart-legend">
        ${chart.series.map(s => `<span><i style="background:${s.color}"></i> ${esc(s.label)} <b data-val="${chart.id}-${s.key}">--</b></span>`).join('')}
      </div>
    </article>`).join('');
}

function salaPaintGauges(data = {}) {
  for (const gauge of SALA_GAUGES) {
    paintGauge('sala', salaCapKey(gauge.key), data[gauge.key], gauge.min, gauge.max, gauge.dec);
  }
  const rpm = numericValue(data.rpm);
  const rpmRead = $('#salaRpmRead');
  if (rpmRead) rpmRead.textContent = rpm === null ? '--' : `${Math.round(rpm)} rpm`;
  paintSourceBadge($('#salaSource'), telemetrySource());
}

function salaPaintCharts() {
  const points = telemetryHistory.points;
  const source = telemetrySource();
  const last = points[points.length - 1] || {};

  for (const chart of SALA_CHARTS) {
    for (const s of chart.series) {
      const line = document.querySelector(`[data-line="${chart.id}-${s.key}"]`);
      if (line) line.setAttribute('points', chartPoints(points, s.key, s.min, s.max));
      const value = document.querySelector(`[data-val="${chart.id}-${s.key}"]`);
      const numeric = numericValue(last[s.key]);
      if (value) value.textContent = numeric === null ? '--' : `${numeric.toFixed(s.dec)} ${s.unit}`;
    }
    const state = document.querySelector(`[data-chart-state="${chart.id}"]`);
    if (state) {
      state.textContent = points.length > 1
        ? (source.state === 'sim' ? 'SIMULACIÓN EN VIVO' : 'REGISTRO EN VIVO')
        : 'SIN DATOS';
    }
  }

  const samples = $('#salaSamples');
  if (samples) samples.textContent = fmtNum(salaState.samples);
  const windowLabel = $('#salaWindow');
  if (windowLabel) {
    const span = points.length > 1 && points[0].at ? (points[points.length - 1].at - points[0].at) / 1000 : 0;
    windowLabel.textContent = span > 0 ? `${span.toFixed(0)} s` : '--';
  }
  const lastRead = $('#salaLastRead');
  if (lastRead) lastRead.textContent = salaState.lastAt ? new Date(salaState.lastAt).toLocaleTimeString('es-ES') : 'Sin lectura';
}

function salaSetNotice(text) {
  const note = $('#salaNotice');
  if (note) note.textContent = text;
}

function salaSyncControls() {
  const start = $('#salaStart');
  const demo = $('#salaDemo');
  const pause = $('#salaPause');
  const stop = $('#salaStop');
  if (start) start.disabled = obdState.connected;
  if (demo) demo.disabled = obdState.connected;
  if (pause) {
    pause.disabled = !obdState.connected;
    pause.textContent = obdState.live ? 'Pausar' : 'Reanudar';
  }
  if (stop) stop.disabled = !obdState.connected;
  const empty = $('#scopeEmpty');
  if (empty) empty.classList.toggle('hidden', obdState.connected);
  salaUpdateScopeReadout();
}
function salaRenderScopeSelects() {
  const options = Object.entries(SCOPE_CHANNELS)
    .map(([key, channel]) => `<option value="${key}">${esc(channel.label)}</option>`)
    .join('');
  const first = $('#scopeChannel');
  const second = $('#scopeChannel2');
  if (first) {
    first.innerHTML = options;
    first.value = scopeState.channel;
  }
  if (second) {
    second.innerHTML = `<option value="">Ninguno</option>${options}`;
    second.value = scopeState.channel2;
  }
  const volts = $('#scopeVolt');
  if (volts) volts.value = String(scopeState.voltDiv);
  const time = $('#scopeTime');
  if (time) time.value = String(scopeState.msDiv);
}

function salaScopeDraw(now) {
  const canvas = $('#scopeCanvas');
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(240, Math.round(rect.width));
  const height = Math.max(140, Math.round(rect.height || 300));
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = '#07090c';
  context.fillRect(0, 0, width, height);

  context.lineWidth = 1;
  context.strokeStyle = 'rgba(188, 204, 218, .09)';
  for (let i = 1; i < 10; i += 1) {
    const x = Math.round((width / 10) * i) + 0.5;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let i = 1; i < 8; i += 1) {
    const y = Math.round((height / 8) * i) + 0.5;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.strokeStyle = 'rgba(34, 211, 238, .3)';
  context.beginPath();
  context.moveTo(0, height - 0.5);
  context.lineTo(width, height - 0.5);
  context.stroke();

  const connected = obdState.connected;
  const data = obdState.telemetry || {};
  const rpm = Math.max(600, numericValue(data.rpm) || 0);
  const load = Math.min(100, Math.max(0, numericValue(data.load) || 0));
  const eventSec = 30 / rpm;
  const windowSec = (scopeState.msDiv * 10) / 1000;

  if (connected) {
    if (scopeState.trigger) {
      const x = Math.round(width * 0.2) + 0.5;
      context.strokeStyle = 'rgba(255, 209, 102, .35)';
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    const drawTrace = (key, color, alpha) => {
      const channel = SCOPE_CHANNELS[key];
      if (!channel) return;
      const maxVolts = scopeState.voltDiv * 8;
      const period = channel.slow ? eventSec * channel.slow : eventSec;
      const drift = scopeState.trigger ? 0 : (now / 1000) * period * 0.15;
      const steps = Math.min(900, Math.max(240, Math.round(width)));
      context.beginPath();
      context.globalAlpha = alpha;
      context.strokeStyle = color;
      context.lineWidth = 1.8;
      context.lineJoin = 'round';
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * windowSec;
        const phase = (((t + drift) / period) % 1 + 1) % 1;
        const volts = Math.max(0, Math.min(maxVolts, channel.sample(phase, { rpm, load })));
        const x = (i / steps) * width;
        const y = height - (volts / maxVolts) * (height - 2);
        if (i === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
      context.globalAlpha = 1;
    };
    drawTrace(scopeState.channel, '#ffd166', 1);
    if (scopeState.channel2) drawTrace(scopeState.channel2, '#22d3ee', 0.85);
  }

  salaUpdateScopeReadout();
}

function salaUpdateScopeReadout() {
  const readout = $('#scopeReadout');
  const connected = obdState.connected;
  const rpm = Math.max(600, numericValue(obdState.telemetry?.rpm) || 0);
  const eventSec = 30 / rpm;
  if (readout) {
    const eventMs = (eventSec * 1000).toFixed(1).replace('.', ',');
    const base = String(scopeState.msDiv).replace('.', ',');
    const amplitude = String(scopeState.voltDiv).replace('.', ',');
    readout.textContent = connected
      ? `${Math.round(rpm)} rpm · evento cada ${eventMs} ms · ${base} ms/div · ${amplitude} V/div · ${scopeState.trigger ? 'disparo activo' : 'barrido libre'}`
      : 'Sin señal: arranca el simulador o conecta la ECU para trazar la forma de onda.';
  }
  const legend = $('#scopeLegend');
  if (legend) {
    const labels = [scopeState.channel, scopeState.channel2].filter(Boolean).map(key => SCOPE_CHANNELS[key]?.label).filter(Boolean);
    legend.textContent = `${labels.join(' + ')} · ${telemetrySource().label}`;
  }
}

function salaStartLoop() {
  if (salaRaf) return;
  const step = () => {
    const view = document.getElementById('view-sala');
    if (!view || !view.classList.contains('active')) {
      salaRaf = null;
      return;
    }
    if (scopeState.running) salaScopeDraw(performance.now());
    salaRaf = requestAnimationFrame(step);
  };
  salaRaf = requestAnimationFrame(step);
}

function salaSetBusy(busy) {
  const start = $('#salaStart');
  const demo = $('#salaDemo');
  if (start) start.disabled = busy || obdState.connected;
  if (demo) demo.disabled = busy || obdState.connected;
}

function salaPreferredAdapter() {
  const configured = $('#obdMode')?.value;
  const support = window.ELM327Manager?.checkBrowserSupport?.() || {};
  if (configured === 'serial' && support.serial) return 'serial';
  if (configured === 'bluetooth' && support.bluetooth) return 'bluetooth';
  if (support.serial) return 'serial';
  if (support.bluetooth) return 'bluetooth';
  return '';
}

async function salaBeginLive(notice) {
  obdState.connected = true;
  obdState.live = true;
  telemetryHistory.points = [];
  salaState.samples = 0;
  salaState.lastAt = 0;
  obdManager.startLiveMonitoring(1000);
  obdManager.readSingleTelemetry().then(renderLiveGrid).catch(() => {});
  salaSetNotice(notice);
}

async function salaStartAdapter() {
  if (obdState.connected) return;
  if (!obdManager) {
    salaSetNotice('La consola OBD aún se está inicializando. Espera un segundo y vuelve a intentarlo.');
    return;
  }
  const mode = salaPreferredAdapter();
  if (!mode) {
    salaSetNotice('Este navegador no puede abrir un adaptador ELM327 (necesita Web Serial o Web Bluetooth). Usa Chrome o Edge, o pulsa Modo demostración.');
    return;
  }
  const baud = Number($('#obdBaud')?.value) || 38400;
  const protocol = $('#obdProtocol')?.value || 'ATSP0';
  obdState.mode = mode;
  salaSetBusy(true);
  salaSetNotice(`Esperando permiso del adaptador ${mode === 'bluetooth' ? 'Bluetooth' : 'USB'}… selecciona tu ELM327 en la ventana del navegador.`);
  try {
    await obdManager.connect(mode, baud, protocol);
    await salaBeginLive('Adaptador conectado: los relojes, las gráficas y el osciloscopio leen de la ECU del vehículo.');
  } catch (err) {
    obdState.connected = false;
    obdState.live = false;
    salaSetNotice(`No se pudo conectar el adaptador: ${err.message}. Revisa la configuración en la pestaña OBD o usa el Modo demostración.`);
  } finally {
    salaSyncControls();
  }
}

async function salaStartDemo() {
  if (obdState.connected) return;
  if (!obdManager) {
    salaSetNotice('La consola OBD aún se está inicializando. Espera un segundo y vuelve a intentarlo.');
    return;
  }
  obdState.mode = 'simulated';
  salaSetBusy(true);
  salaSetNotice('Conectando el modo demostración…');
  try {
    await obdManager.connect('simulated', 38400, 'ATSP0');
    await salaBeginLive('Demostración en marcha: los valores los genera el simulador virtual y se identifican siempre como simulación. Para datos reales, conecta un adaptador ELM327.');
  } catch (err) {
    salaSetNotice(`No se pudo iniciar la demostración: ${err.message}`);
  } finally {
    salaSyncControls();
  }
}

async function salaStopSimulator() {
  if (!obdManager) return;
  obdManager.stopLiveMonitoring();
  obdState.live = false;
  await obdManager.disconnect();
  obdState.connected = false;
  resetTelemetry();
  salaPaintGauges({});
  salaPaintCharts();
  salaSetNotice('Lectura detenida. Los relojes, las gráficas y el osciloscopio quedan a la espera de una nueva conexión.');
  salaSyncControls();
}

function salaBindControls() {
  $('#salaStart')?.addEventListener('click', salaStartAdapter);
  $('#salaDemo')?.addEventListener('click', salaStartDemo);
  $('#salaStop')?.addEventListener('click', salaStopSimulator);
  $('#salaPause')?.addEventListener('click', () => {
    if (!obdManager || !obdState.connected) return;
    if (obdState.live) {
      obdManager.stopLiveMonitoring();
      obdState.live = false;
      salaSetNotice('Lectura pausada. Los instrumentos conservan la última muestra recibida.');
    } else {
      obdManager.startLiveMonitoring(1000);
      obdState.live = true;
      obdManager.readSingleTelemetry().then(renderLiveGrid).catch(() => {});
      salaSetNotice('Lectura reanudada desde la ECU conectada.');
    }
    salaSyncControls();
  });
  $('#salaReset')?.addEventListener('click', () => {
    telemetryHistory.points = [];
    salaState.samples = 0;
    salaState.lastAt = 0;
    salaPaintGauges({});
    salaPaintCharts();
    salaSetNotice('Registro borrado. La conexión sigue activa y las gráficas vuelven a llenarse con las próximas muestras.');
  });

  $('#scopeChannel')?.addEventListener('change', event => {
    scopeState.channel = event.target.value;
    scopeState.voltDiv = SCOPE_CHANNELS[scopeState.channel]?.voltsPerDiv || 5;
    const volts = $('#scopeVolt');
    if (volts) volts.value = String(scopeState.voltDiv);
    salaUpdateScopeReadout();
  });
  $('#scopeChannel2')?.addEventListener('change', event => {
    scopeState.channel2 = event.target.value;
    salaUpdateScopeReadout();
  });
  $('#scopeTime')?.addEventListener('change', event => {
    scopeState.msDiv = Number(event.target.value) || 5;
    salaUpdateScopeReadout();
  });
  $('#scopeVolt')?.addEventListener('change', event => {
    scopeState.voltDiv = Number(event.target.value) || 5;
    salaUpdateScopeReadout();
  });
  $('#scopeTrigger')?.addEventListener('change', event => {
    scopeState.trigger = event.target.checked;
    salaUpdateScopeReadout();
  });
  $('#scopeRun')?.addEventListener('click', event => {
    scopeState.running = !scopeState.running;
    event.currentTarget.textContent = scopeState.running ? 'Pausar barrido' : 'Reanudar barrido';
    if (scopeState.running) salaStartLoop();
  });
}

function salaInit() {
  if (!salaState.ready) {
    salaRenderGauges();
    salaRenderCharts();
    salaRenderScopeSelects();
    salaBindControls();
    const count = $('#salaGaugeCount');
    if (count) count.textContent = String(SALA_GAUGES.length);
    salaState.ready = true;
  }
  salaPaintGauges(obdState.telemetry || {});
  salaPaintCharts();
  salaSyncControls();
  salaStartLoop();
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

async function initObdProtocols() {
  const box = $('#obdProtocolList');
  if (!box) return;
  try {
    const data = await api('/api/obd/protocols');
    const notice = $('#obdProtocolNotice');
    if (notice) notice.textContent = data.notice || '';
    const select = $('#obdProtocol');
    if (select) {
      const current = select.value;
      select.innerHTML = '';
      for (const p of data.protocols || []) {
        const opt = document.createElement('option');
        opt.value = p.code;
        opt.textContent = p.state === 'recomendado' ? `${p.label} (recomendado)` : p.label;
        select.appendChild(opt);
      }
      select.value = (data.protocols || []).some(p => p.code === current) ? current : (data.recommended || 'ATSP0');
    }
    const labels = { recomendado: 'Recomendado', estandar: 'Estándar OBD-II', especial: 'Vehículo pesado' };
    box.innerHTML = (data.protocols || []).map(p => `
      <article class="obd-protocol ${esc(p.state)}">
        <div class="obd-protocol-head">
          <b>${esc(p.label)}</b>
          <code>${esc(p.code)}</code>
        </div>
        <p>${esc(p.note)}</p>
        <dl>
          <div><dt>Bus</dt><dd>${esc(p.bus)}</dd></div>
          <div><dt>Pines OBD</dt><dd>${esc(p.pins)}</dd></div>
          <div><dt>Uso habitual</dt><dd>${esc(p.era)}</dd></div>
        </dl>
        <span class="obd-protocol-badge">${esc(labels[p.state] || p.state)}</span>
      </article>`).join('');
  } catch (err) {
    box.innerHTML = `<div class="notice">No se pudieron cargar los protocolos: ${esc(err.message)}.</div>`;
  }
}


let obdScannersCache = [];

function renderObdScanners() {
  const box = $('#obdScannerList');
  if (!box) return;
  const items = obdScannersCache
    .filter(item => item.forWeb && /adaptador/i.test(item.type))
    .sort((a, b) => a.price - b.price);
  if (!items.length) {
    box.innerHTML = '<div class="notice">No hay adaptadores compatibles disponibles.</div>';
    return;
  }
  box.innerHTML = items.map((item, index) => {
    const tags = [
      item.protocolSupport?.label,
      item.connection,
      'Sin pantalla ni app',
      'Compatible con esta web'
    ].filter(Boolean);
    return `
      <article class="obd-scanner for-web${index === 0 ? ' cheapest' : ''}">
        <div class="scanner-media">
          <img class="scanner-img" src="${esc(item.image)}" alt="${esc(item.imageAlt)}" loading="lazy">
          ${index === 0 ? '<span class="scanner-cheapest">Más barato</span>' : ''}
        </div>
        <div class="scanner-body">
          <div class="scanner-head">
            <b>${esc(item.name)}</b>
            <span class="scanner-price">${esc(item.priceText)}</span>
          </div>
          <div class="scanner-meta">${esc(item.brand)} · ${esc(item.type)} · ${esc(item.coverage)}</div>
          <p class="scanner-best">${esc(item.bestFor)}</p>
          <div class="scanner-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
          <p class="scanner-stock">${esc(item.availability)}</p>
          <details>
            <summary>Puntos fuertes y límites</summary>
            <ul class="scanner-pros">${(item.highlights || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <ul class="scanner-cons">${(item.limits || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
            <p class="micro-note">${esc(item.protocolSupport?.note || '')}</p>
            <p class="micro-note">${esc(item.verification?.note || '')}</p>
          </details>
          <a class="btn btn-ghost scanner-buy" href="${esc(item.url)}" target="_blank" rel="noopener sponsored">Ver ficha y precio en Amazon</a>
        </div>
      </article>`;
  }).join('');
}

async function initObdScanners() {
  const box = $('#obdScannerList');
  if (!box) return;
  try {
    const data = await api('/api/obd/scanners');
    obdScannersCache = data.items || [];
    const items = obdScannersCache
      .filter(item => item.forWeb && /adaptador/i.test(item.type))
      .sort((a, b) => a.price - b.price);
    const count = $('#obdAdapterCount');
    if (count) {
      count.textContent = items.length
        ? `${items.length} adaptadores · desde ${items[0].priceText}`
        : 'Sin adaptadores';
    }
    const notice = $('#obdScannerNotice');
    if (notice) {
      notice.textContent = `${data.notice} ${data.compatibilityNote || ''} Precios comprobados: ${data.priceCheckedAt || ''}.`.trim();
    }
    const coverage = $('#obdScannerModeNote');
    if (coverage) coverage.textContent = data.protocolCoverageNote || '';
    renderObdScanners();
  } catch (err) {
    box.innerHTML = `<div class="notice">No se pudieron cargar los equipos: ${esc(err.message)}.</div>`;
  }
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

  initObdProtocols();
  initObdScanners();
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
    const protocol = $('#obdProtocol')?.value || 'ATSP0';
    obdState.mode = mode;
    obdState.connected = false;
    resetTelemetry();
    obdSetStatus(`Iniciando conexión ${mode.toUpperCase()}...`, 'connecting');
    obdSetButtons({ connect: false, disconnect: true, read: false, live: false, vin: false, clear: false });
    try {
      const info = await obdManager.connect(mode, baud, protocol);
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
      <article class="stage-card" id="${esc(s.id)}">
        <header class="stage-head">
          <div>
            <span class="eyebrow">${esc(s.name.split('—')[0].trim())}</span>
            <h3>${esc(s.name.split('—')[1]?.trim() || s.name)}</h3>
          </div>
          <span class="stage-cost" title="Coste orientativo">${esc(s.cost || '€')}</span>
        </header>
        <p class="stage-goal">${esc(s.goal || '')}</p>
        <p class="stage-summary">${esc(s.summary || '')}</p>

        <h4>${icon('zap')} Qué da potencia de verdad</h4>
        <ul class="stage-levers">
          ${(s.powerLevers || []).map(l => `<li><div><b>${esc(l.title)}</b><em>${esc(l.effect)}</em></div><p>${esc(l.detail)}</p></li>`).join('')}
        </ul>

        <div class="stage-cols">
          <div><h4>Hardware necesario</h4><ul>${(s.hardware || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>Software y medición</h4><ul>${(s.software || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>Límites a respetar</h4><ul class="danger-list">${(s.limits || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>

        <div class="stage-checks">
          <div><h4>Comprobaciones</h4><ul>${(s.checks || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>Mitos que cuestan dinero</h4><ul class="danger-list">${(s.myths || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>

        <p class="tuning-legal"><b>${icon('shield')} Legalidad:</b> ${esc(s.legality || '')}</p>
        ${(s.sources || []).length ? `<p class="stage-sources">Fuentes: ${(s.sources || []).map(id => {
          const src = (tuningCache.sources || []).find(x => x.id === id);
          return src ? `<a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">${esc(src.publisher)}</a>` : '';
        }).filter(Boolean).join(' · ')}</p>` : ''}
      </article>
    `).join('');
  }

  const box = $('#tuningPackages');
  if (!box) return;
  box.innerHTML = (tuningCache.packages || []).map(pkg => {
    const cats = (pkg.productCategories || []).map(c =>
      `<button class="btn ghost sm" type="button" data-tp-open="${esc(c.id)}">${esc(c.name)} <span class="tp-mini-count">${c.count}</span></button>`
    ).join('');
    return `
      <article class="tuning-card panel" id="tuning-${esc(pkg.id)}">
        <div class="tuning-card-head">
          <span class="tuning-generic">${icon('zap')}</span>
          <div>
            <span class="eyebrow">${esc(pkg.level)}</span>
            <h3>${esc(pkg.name)}</h3>
            <p>${esc(pkg.tagline)}</p>
          </div>
        </div>
        <div class="tuning-cols">
          <div><h4>Ideal para</h4><p>${esc(pkg.idealFor)}</p><h4>No es para</h4><p>${esc(pkg.notFor)}</p></div>
          <div><h4>Hardware por etapa</h4><ul>${(pkg.hardware || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
          <div><h4>Comprobaciones antes/después</h4><ul>${(pkg.checks || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>
        </div>
        <div class="tuning-notes"><p>${esc(pkg.notes || '')}</p></div>
        <h4>Piezas para esta ruta</h4>
        <div class="tp-quick">${cats || '<p class="micro-note">Sin categorías asociadas.</p>'}</div>
      </article>`;
  }).join('');
  box.querySelectorAll('[data-tp-open]').forEach(b => b.addEventListener('click', () => openTuningProducts(b.dataset.tpOpen)));
}

function setTuningTab(name = 'guias') {
  const tabs = $$('[data-tuning-tab]');
  if (!tabs.length) return;
  const panes = {
    guias: $('#tuningPaneGuias'),
    accesorios: $('#tuningPaneAccesorios')
  };
  tabs.forEach(tab => {
    const active = tab.dataset.tuningTab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  Object.entries(panes).forEach(([key, pane]) => {
    if (pane) pane.hidden = key !== name;
  });
  if (name === 'accesorios') loadTuningProducts();
}

function openTuningProducts(category = 'all') {
  tpCategory = category;
  showView('tuning');
  setTuningTab('accesorios');
}

$$('[data-tuning-tab]').forEach(tab => {
  tab.addEventListener('click', () => setTuningTab(tab.dataset.tuningTab));
});

// -------------------------------------------------------------
// CATÁLOGO DE ACCESORIOS DE TUNING
// -------------------------------------------------------------
// De dónde sale la foto de cada ficha: la del vendedor, una foto libre de esa
// pieza concreta o, si Commons no tiene ninguna, la imagen de su categoría.
const TP_PHOTO_LABEL = {
  tienda: 'Foto del vendedor',
  referencia: 'Foto de referencia',
  categoria: 'Imagen de categoría'
};

let tpCache = null;
let tpCategory = 'all';
let tpCar = 'all';
let tpQuery = '';

async function loadTuningProducts(force = false) {
  const grid = $('#tpGrid');
  if (!grid) return;
  if (tpCache && !force) {
    renderTpTabs();
    renderTpGrid();
    return;
  }
  grid.innerHTML = '<div class="notice">Cargando accesorios…</div>';
  try {
    const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('el servidor tarda demasiado en responder')), 15000));
    tpCache = await Promise.race([api('/api/tuning-products'), slow]);
    const tabs = $('#tpTabs');
    if (tabs) tabs.hidden = false;
    const count = $('#tpCount');
    if (count) count.textContent = fmtNum(tpCache.stats?.items || tpCache.items.length);
    const cats = $('#tpCats');
    if (cats) cats.textContent = fmtNum((tpCache.categories || []).length);
    const select = $('#tpCar');
    if (select && select.options.length <= 1) {
      (tpCache.cars || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.name} · ${c.engine}`;
        select.appendChild(opt);
      });
    }
    const legal = $('#tpLegal');
    if (legal) legal.textContent = tpCache.disclaimer || '';
    renderTpTabs();
    renderTpGrid();
  } catch (err) {
    grid.innerHTML = `<div class="tp-empty">No se pudieron cargar los accesorios: ${esc(err.message)}. <button class="btn ghost sm" type="button" id="tpRetry">Reintentar</button></div>`;
    grid.querySelector('#tpRetry')?.addEventListener('click', () => loadTuningProducts(true));
  }
}

function tpCounts() {
  const counts = {};
  for (const item of tpCache?.items || []) counts[item.category] = (counts[item.category] || 0) + 1;
  return counts;
}

function renderTpTabs() {
  const box = $('#tpTabs');
  if (!box || !tpCache) return;
  const counts = tpCounts();
  const total = (tpCache.items || []).length;
  box.innerHTML = [{ id: 'all', name: 'Todo' }, ...(tpCache.categories || [])].map(c => {
    const n = c.id === 'all' ? total : counts[c.id] || 0;
    return `<button class="tp-tab${tpCategory === c.id ? ' active' : ''}" type="button" role="tab" aria-selected="${tpCategory === c.id}" data-tp-cat="${esc(c.id)}">${esc(c.name)}<span>${n}</span></button>`;
  }).join('');
  box.querySelectorAll('[data-tp-cat]').forEach(b => b.addEventListener('click', () => {
    tpCategory = b.dataset.tpCat;
    renderTpTabs();
    renderTpGrid();
  }));
}

function tpMatches(item) {
  if (tpCategory !== 'all' && item.category !== tpCategory) return false;
  if (tpCar !== 'all' && (item.cars || []).length && !item.cars.includes(tpCar)) return false;
  if (!tpQuery) return true;
  const text = foldText([item.name, item.brand, item.note, (item.fitment || []).join(' ')].join(' '));
  return tpQuery.split(/\s+/).filter(Boolean).every(term => text.includes(term));
}

function renderTpGrid() {
  const grid = $('#tpGrid');
  if (!grid || !tpCache) return;
  const items = (tpCache.items || []).filter(tpMatches);
  const counter = $('#tpResults');
  if (counter) counter.textContent = `${items.length} de ${tpCache.items.length} accesorios`;
  if (!items.length) {
    grid.innerHTML = '<div class="tp-empty">No hay accesorios con esos filtros. Prueba otra categoría o quita el filtro de coche.</div>';
    return;
  }
  grid.innerHTML = items.map((item, index) => {
    const links = (item.links || []).map(l => `<a class="tp-link" href="${esc(l.url)}" target="_blank" rel="sponsored nofollow noopener noreferrer">${esc(l.shop)} ${icon('arrow')}</a>`).join('');
    const fits = (item.fitment || []).slice(0, 2).map(f => `<span class="tp-fit">${esc(f)}</span>`).join('');
    const more = (item.fitment || []).length > 2 ? `<span class="tp-fit more">+${item.fitment.length - 2}</span>` : '';
    return `
      <article class="tp-card">
        <div class="tp-media">
          <img src="${esc(item.image)}" alt="${esc(item.name)}" loading="${index < 6 ? 'eager' : 'lazy'}" decoding="async" style="object-position:${50 + (index % 3) * 5}% ${50 + (index % 2) * 6}%">
          <span class="tp-price" title="Coste orientativo">${esc(item.price || '€')}</span>
          <span class="tp-ref" title="${item.photoKind === 'tienda' ? 'Foto del vendedor' : item.photoKind === 'referencia' ? 'Foto libre de esa pieza (Wikimedia Commons)' : 'Commons no tiene foto libre de esta pieza concreta: se muestra la de su categoría'}">${TP_PHOTO_LABEL[item.photoKind] || 'Foto de referencia'}</span>
        </div>
        <div class="tp-body">
          <span class="tp-cat-label">${esc(catName(item.category))}</span>
          <h3 title="${esc(item.name)}">${esc(item.name)}</h3>
          <p class="tp-brand">${esc(item.brand)}</p>
          <p class="tp-note">${esc(item.note)}</p>
          <div class="tp-fits" title="${esc((item.fitment || []).join(' · '))}">${fits}${more}</div>
          <div class="tp-links">${links}</div>
        </div>
      </article>`;
  }).join('');
}

function catName(id) {
  return (tpCache?.categories || []).find(c => c.id === id)?.name || id;
}

const tpSearchInput = $('#tpSearch');
if (tpSearchInput) {
  let timer = 0;
  tpSearchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      tpQuery = foldText(tpSearchInput.value.trim());
      renderTpGrid();
    }, 120);
  });
}
const tpCarSelect = $('#tpCar');
if (tpCarSelect) {
  tpCarSelect.addEventListener('change', () => {
    tpCar = tpCarSelect.value;
    renderTpGrid();
  });
}

function openTuningPackage(id) {
  const el = document.getElementById(`tuning-${id}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.add('search-hit');
  setTimeout(() => el.classList.remove('search-hit'), 2200);
}

// -------------------------------------------------------------
// FICHA DE PRODUCTO
// -------------------------------------------------------------
function autodocSearchUrl(product) {
  const id = (document.querySelector('meta[name="awin-publisher-id"]')?.getAttribute('content') || '').trim();
  if (!id) return '';
  const brand = product?.manufacturer && !/no confirmado/i.test(product.manufacturer) ? product.manufacturer : '';
  const query = [brand, product?.reference, product?.name].filter(Boolean).join(' ').slice(0, 120);
  if (!query) return '';
  const destination = `https://www.autodoc.es/search?keyword=${encodeURIComponent(query)}`;
  return `https://www.awin1.com/cread.php?awinmid=120163&awinaffid=${encodeURIComponent(id)}&ued=${encodeURIComponent(destination)}`;
}

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
  const autodoc = p.autodocUrl || autodocSearchUrl(p);
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
          <div><small>Precio</small><b>${esc(p.price || 'Consultar precio')}</b></div>
          <div><small>Verificado</small><b>${esc(p.verifiedAt || 'No indicado')}</b></div>
        </div>
        ${/\d/.test(String(p.price || '')) ? `<p class="micro-note">Precio de ${esc((p.priceSource || 'la tienda').replace(/\s*·\s*[A-Z0-9]{10}$/i, ''))} consultado el ${esc(priceDate(p.priceCheckedAt || p.verifiedAt))}. Puede variar: confirma el importe final en la ficha del vendedor.</p>` : `<p class="micro-note">${esc(p.priceNote || 'Sin precio publicado por el vendedor: no se muestra una cifra sin verificar.')}</p>`}
        ${features.length ? `<h4>Características publicadas por el vendedor</h4><ul class="check-list">${features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
        <div class="compat-note"><b>${icon('alert')} Compatibilidad</b><p>${esc(p.compatibility?.note || 'No verificada para un vehículo concreto.')}</p></div>
        ${p.verificationNote ? `<p class="micro-note">${esc(p.verificationNote)}</p>` : ''}
        <div class="product-sheet-actions">
          ${link ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Abrir en la tienda ${icon('external')}</a>` : '<span class="btn ghost">Enlace no disponible</span>'}
          ${autodoc ? `<a class="btn ghost" href="${esc(autodoc)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Buscar en Autodoc ${icon('external')}</a>` : ''}
          <a class="btn ghost" href="/producto/${encodeURIComponent(p.id)}">Ver ficha completa</a>
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

// -------------------------------------------------------------
// FIABILIDAD POR MOTOR Y GENERACIÓN
// -------------------------------------------------------------
const REL_STATUS_LABEL = {
  confirmada: 'Confirmada',
  reportada: 'Incidencia reportada',
  hipotesis: 'Hipótesis de taller'
};

let relData = null;
let relOptionsReady = false;
let relSeq = 0;

function relFilters() {
  return {
    q: $('#relQ')?.value.trim() || '',
    brand: $('#relBrand')?.value || '',
    engine: $('#relEngine')?.value || '',
    year: $('#relYear')?.value.trim() || '',
    status: $('#relStatus')?.value || ''
  };
}

function relQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const text = params.toString();
  return text ? `?${text}` : '';
}

function relSourceLinks(sources = []) {
  return sources.map(s => {
    const label = s.publisher || s.title || s.url;
    return `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
  }).join(' ');
}

async function loadReliability() {
  const grid = $('#relGrid');
  if (!grid) return;
  const seq = ++relSeq;
  const filters = relFilters();
  const sinFiltros = !filters.q && !filters.brand && !filters.engine && !filters.year && !filters.status;
  grid.innerHTML = '<div class="notice">Cargando base de fiabilidad…</div>';
  try {
    const slow = new Promise((_, reject) => setTimeout(() => reject(new Error('el servidor tarda demasiado en responder')), 15000));
    const data = await Promise.race([api(`/api/reliability${relQuery(filters)}`), slow]);
    if (seq !== relSeq) return;
    relData = data;
    if (!relOptionsReady) {
      fillRelOptions(data);
      relOptionsReady = sinFiltros;
    }
    renderRelLegend(data);
    renderReliability();
  } catch (err) {
    if (seq !== relSeq) return;
    grid.innerHTML = `<div class="tp-empty">No se pudo cargar la base de fiabilidad: ${esc(err.message)}. <button class="btn ghost sm" type="button" id="relRetry">Reintentar</button></div>`;
    grid.querySelector('#relRetry')?.addEventListener('click', loadReliability);
  }
}

function fillRelOptions(data) {
  const results = data.results || [];
  const brandSelect = $('#relBrand');
  if (brandSelect && brandSelect.options.length <= 1) {
    const brands = [...new Set(results.flatMap(e => String(e.brand || '').split('/').map(b => b.trim()).filter(Boolean)))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    for (const brand of brands) {
      const opt = document.createElement('option');
      opt.value = brand;
      opt.textContent = brand;
      brandSelect.appendChild(opt);
    }
  }
  const engineSelect = $('#relEngine');
  if (engineSelect && engineSelect.options.length <= 1) {
    for (const e of [...results].sort((a, b) => String(a.family).localeCompare(String(b.family), 'es'))) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = `${e.family} · ${e.commercial}`;
      engineSelect.appendChild(opt);
    }
  }
  const count = $('#relCount');
  if (count) count.textContent = fmtNum(data.stats?.engines || results.length);
  const issues = $('#relIssues');
  if (issues) issues.textContent = fmtNum(data.stats?.issues || 0);
  const legal = $('#relLegal');
  if (legal) {
    const types = (data.sourceTypes || []).map(s => s.label).join(', ');
    legal.textContent = `${data.notice || ''} Fuentes admitidas: ${types}.`;
  }
}

function renderRelLegend(data) {
  const legend = $('#relLegend');
  if (!legend) return;
  legend.innerHTML = (data.statusLegend || []).map(s =>
    `<span class="rel-status ${esc(s.id)}" title="${esc(s.detail)}">${esc(s.label)}</span>`
  ).join('');
}

function renderReliability() {
  const grid = $('#relGrid');
  if (!grid || !relData) return;
  const results = relData.results || [];
  const totalEngines = relData.stats?.engines ?? results.length;
  const totalIssues = relData.stats?.issues ?? 0;
  const counter = $('#relResults');
  if (counter) counter.textContent = `${results.length} de ${totalEngines} motores · ${fmtNum(totalIssues)} averías documentadas`;
  if (!results.length) {
    grid.innerHTML = '<div class="tp-empty">No hay motores con esos filtros. Prueba otra marca, otro año o quita el término de búsqueda.</div>';
    return;
  }
  grid.innerHTML = results.map(e => {
    const dist = e.distribution || {};
    const verdict = e.reliability?.verdict || 'sin valorar';
    return `
      <article class="rel-card">
        <h3>${esc(e.family)}</h3>
        <p class="rel-brand">${esc(e.brand)}</p>
        <p class="rel-line"><b>${esc(e.commercial)}</b> · ${esc(e.years)}</p>
        <p class="rel-line">${esc(e.fuel || '')}${e.powerPs ? ` · ${esc(e.powerPs)}` : ''} · ${esc(dist.type || 'Distribución sin dato')}${dist.interval ? ` (${esc(dist.interval)})` : ''}</p>
        <div class="rel-pills">
          <span class="rel-pill verdict">Fiabilidad ${esc(verdict)}</span>
          <span class="rel-pill">${fmtNum(e.issueCount)} de ${fmtNum(e.issuesTotal)} averías</span>
        </div>
        ${e.reliability?.note ? `<p class="rel-line">${esc(e.reliability.note)}</p>` : ''}
        <div class="rel-actions">
          <button class="btn ghost sm" type="button" data-rel-open="${esc(e.id)}">Ver averías y comprobaciones ${icon('arrow')}</button>
        </div>
      </article>`;
  }).join('');
  grid.querySelectorAll('[data-rel-open]').forEach(b => b.addEventListener('click', () => openReliability(b.dataset.relOpen)));
}

function relIssueHTML(issue) {
  const cost = issue.cost || {};
  const costRows = [
    ['Diagnóstico', cost.diagnosis],
    ['Piezas', cost.parts],
    ['Mano de obra', cost.labour],
    ['Coste típico', cost.typical]
  ].filter(([, value]) => value);
  const list = (items) => `<ul>${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `
    <article class="rel-issue">
      <div class="rel-actions">
        <span class="rel-status ${esc(issue.status)}">${esc(REL_STATUS_LABEL[issue.status] || issue.status)}</span>
        <span class="rel-pill">Gravedad: ${esc(issue.severity || '—')}</span>
      </div>
      <h4>${esc(issue.title)}</h4>
      ${issue.symptom?.length ? `<p><b>Síntomas:</b></p>${list(issue.symptom)}` : ''}
      ${issue.cause ? `<p><b>Causa:</b> ${esc(issue.cause)}</p>` : ''}
      ${issue.checks?.length ? `<p><b>Comprobaciones:</b></p>${list(issue.checks)}` : ''}
      ${issue.solution ? `<p><b>Solución:</b> ${esc(issue.solution)}</p>` : ''}
      ${issue.risk ? `<p><b>Riesgo si no se atiende:</b> ${esc(issue.risk)}</p>` : ''}
      ${costRows.length ? `<p class="rel-cost"><b>Coste orientativo en España:</b> ${costRows.map(([k, v]) => `${k}: ${esc(v)}`).join(' · ')}${cost.note ? `<br><small>${esc(cost.note)}</small>` : ''}</p>` : ''}
      ${issue.sources?.length ? `<p class="rel-src"><b>Fuentes:</b> ${relSourceLinks(issue.sources)}</p>` : ''}
    </article>`;
}

function relDetailHTML(e) {
  const dist = e.distribution || {};
  const issues = e.issues || [];
  const maintenance = e.maintenance || [];
  return `
    <header class="page-head">
      <div>
        <span class="eyebrow">${esc(e.brand)}</span>
        <h2>${esc(e.family)}</h2>
        <p><b>${esc(e.commercial)}</b> · ${esc(e.years)}${e.codes ? ` · Códigos: ${esc(e.codes)}` : ''}</p>
      </div>
      <button class="btn ghost sm" type="button" id="relDetailClose">Cerrar ficha</button>
    </header>
    ${e.summary ? `<p>${esc(e.summary)}</p>` : ''}
    <div class="rel-pills">
      <span class="rel-pill verdict">Fiabilidad ${esc(e.reliability?.verdict || 'sin valorar')}</span>
      <span class="rel-pill">${esc(dist.type || 'Distribución sin dato')}${dist.interval ? ` · ${esc(dist.interval)}` : ''}</span>
      <span class="rel-pill">${fmtNum(issues.length)} averías documentadas</span>
    </div>
    ${dist.note ? `<p><b>Distribución:</b> ${esc(dist.note)}</p>` : ''}
    ${e.reliability?.note ? `<p><b>Valoración:</b> ${esc(e.reliability.note)}</p>` : ''}
    ${e.confidenceNote ? `<p class="micro-note">Confianza ${esc(e.confidence || '')}: ${esc(e.confidenceNote)}</p>` : ''}
    <div class="rel-actions"><button class="btn primary sm" type="button" data-rel-ai>Preguntar a la IA por este motor ${icon('chat')}</button></div>
    <div class="rel-detail">${issues.map(relIssueHTML).join('')}</div>
    ${maintenance.length ? `<h3>Mantenimiento preventivo</h3>${maintenance.map(m => `
      <article class="rel-issue">
        <h4>${esc(m.item)}</h4>
        <p><b>Intervalo:</b> ${esc(m.interval)}</p>
        ${m.note ? `<p>${esc(m.note)}</p>` : ''}
        ${m.sources?.length ? `<p class="rel-src"><b>Fuentes:</b> ${relSourceLinks(m.sources)}</p>` : ''}
      </article>`).join('')}` : ''}
    ${e.sources?.length ? `<p class="rel-src"><b>Fuentes del motor:</b> ${relSourceLinks(e.sources)}</p>` : ''}`;
}

async function openReliability(id) {
  const box = $('#relDetail');
  if (!box) return;
  box.classList.remove('hidden');
  box.innerHTML = '<div class="notice">Cargando ficha del motor…</div>';
  box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    const engine = await api(`/api/reliability/${encodeURIComponent(id)}`);
    if (!engine || !engine.id) throw new Error('ficha no encontrada');
    box.innerHTML = relDetailHTML(engine);
    box.querySelector('#relDetailClose')?.addEventListener('click', closeReliability);
    box.querySelector('[data-rel-ai]')?.addEventListener('click', () => askAIAboutEngine(engine));
  } catch (err) {
    box.innerHTML = `<div class="tp-empty">No se pudo cargar la ficha: ${esc(err.message)}.</div>`;
  }
}

function closeReliability() {
  const box = $('#relDetail');
  if (!box) return;
  box.classList.add('hidden');
  box.innerHTML = '';
}

function askAIAboutEngine(engine) {
  const issue = (engine.issues || [])[0];
  const query = `Tengo un ${String(engine.brand || '').split('/')[0].trim()} con motor ${engine.family} (${engine.commercial}, ${engine.years}). ${issue ? `Síntoma descrito: ${issue.title}. ` : ''}¿Qué comprobaciones debo hacer antes de sustituir piezas y qué coste orientativo tiene en España?`;
  showView('chat');
  if (chatInput) {
    chatInput.value = query;
    chatInput.focus();
  }
  submitChat(query);
}

const relSearchInput = $('#relQ');
if (relSearchInput) {
  let timer = 0;
  relSearchInput.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(loadReliability, 220);
  });
}
['#relBrand', '#relEngine', '#relStatus', '#relYear'].forEach(selector => {
  const el = $(selector);
  if (el) el.addEventListener('change', loadReliability);
});

// Carga bajo demanda y enlaces desde el buscador universal.
document.addEventListener('viewchange', e => {
  if (e.detail.name === 'vehiculos') loadVehicles();
  if (e.detail.name === 'tuning') {
    loadTuning();
    if (document.querySelector('[data-tuning-tab="accesorios"].active')) loadTuningProducts();
  }
  if (e.detail.name === 'fiabilidad') loadReliability();
  if (e.detail.name === 'sala') salaInit();
});

// -------------------------------------------------------------
// INICIALIZACIÓN
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initPayments();
  initVehicleSelector();
  initHomeVehicleSelector();
  initUniversalSearch();
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
    searchDtc('P0300')
  ]).catch(err => console.error('Error en inicialización:', err));
});

window.addEventListener('hashchange', () => showView(location.hash.slice(1)));
