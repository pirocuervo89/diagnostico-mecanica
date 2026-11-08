(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const STORAGE_KEY = 'dym_tutorials_v1';
  const FILTER_INPUTS = {
    category: '#tutCategory', subcategory: '#tutSubcategory', brand: '#tutBrand',
    model: '#tutModel', engine: '#tutEngine', year: '#tutYear', fuel: '#tutFuel',
    language: '#tutLanguage', level: '#tutLevel', sourceType: '#tutSource',
    duration: '#tutDuration', vehicleType: '#tutVehicleType', dtc: '#tutDtc',
    symptom: '#tutSymptom'
  };
  const FILTER_LABELS = {
    category: 'Categoría', subcategory: 'Subcategoría', brand: 'Marca', model: 'Modelo',
    engine: 'Motor', year: 'Año', fuel: 'Combustible', language: 'Idioma', level: 'Nivel',
    sourceType: 'Fuente', duration: 'Duración', vehicleType: 'Vehículo', dtc: 'DTC',
    symptom: 'Síntoma', free: 'Gratuitos', embeddable: 'Reproducible aquí', withWarnings: 'Con advertencias'
  };
  const SOURCE_LABELS = { official: 'Oficial', educational: 'Formación', community: 'Comunidad' };
  const LEVEL_LABELS = { 'no-especificado': 'Nivel no indicado', principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado', experto: 'Experto' };
  const DURATION_LABELS = { short: 'Menos de 10 min', medium: '10 a 30 min', long: 'Más de 30 min' };

  let toastTimer = null;
  let initialized = false;
  let bound = false;
  let searchTimer = null;
  let suggestTimer = null;
  let filterTimer = null;

  const state = {
    meta: null,
    session: null,
    items: [],
    total: 0,
    offset: 0,
    limit: 24,
    hasMore: false,
    sort: 'relevance',
    view: 'grid',
    q: '',
    filters: {},
    local: loadLocal(),
    library: null,
    libraryTab: 'favorites',
    activePlaylist: null,
    selected: null,
    adminReports: [],
    verifiedVideo: null,
    loaded: false,
    loading: false
  };

  function esc(value = '') {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
  }

  function icon(name, cls = '') {
    return `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  }

  function fmtNum(value) {
    return Number(value || 0).toLocaleString('es-ES');
  }

  function formatDuration(seconds) {
    const total = Number(seconds || 0);
    if (!total) return '';
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${minutes}:${String(rest).padStart(2, '0')}`;
  }

  function loadLocal() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        favorites: Array.isArray(data.favorites) ? data.favorites.filter(item => item && item.id) : [],
        history: Array.isArray(data.history) ? data.history.filter(item => item && item.id) : []
      };
    } catch {
      return { favorites: [], history: [] };
    }
  }

  function saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ favorites: state.local.favorites, history: state.local.history }));
    } catch { /* almacenamiento no disponible */ }
  }

  function snapshot(item) {
    return {
      id: item.id, title: item.title, thumbnail: item.thumbnail, categoryName: item.categoryName,
      subcategoryName: item.subcategoryName, durationLabel: item.durationLabel, durationSeconds: item.durationSeconds,
      channel: item.channel, languageLabel: item.languageLabel, level: item.level, sourceType: item.sourceType,
      verified: item.verificationStatus === 'verified', localViews: item.localViews, lastViewedAt: item.lastViewedAt || null
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Error HTTP ${response.status}`);
    return body;
  }

  function toast(message, kind = '') {
    const box = $('#tutToast');
    if (!box) return;
    box.textContent = message;
    box.className = `tut-toast show ${kind}`.trim();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.className = 'tut-toast'; }, 3800);
  }

  function showView(name) {
    if (typeof window.showView === 'function') window.showView(name);
    else if (location.hash !== `#${name}`) location.hash = name;
  }

  function goForum() {
    showView('foro');
    setTimeout(() => {
      const login = $('#forumAuthPanel');
      if (login) login.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  }

  function option(value, label, selected = false) {
    return `<option value="${esc(value)}"${selected ? ' selected' : ''}>${esc(label)}</option>`;
  }

  function updateSubcategoryOptions(select, categoryId, selected = '') {
    if (!select) return;
    const category = (state.meta?.categories || []).find(item => item.id === categoryId);
    const children = category?.children || [];
    select.innerHTML = option('', 'Todas') + children.map(child => option(child.id, child.name, child.id === selected)).join('');
    select.disabled = !children.length;
  }

  function populateMeta() {
    const meta = state.meta || {};
    const stats = meta.stats || {};
    const categories = meta.categories || [];
    const catSelect = $('#tutCategory');
    if (catSelect) catSelect.innerHTML = option('', 'Todas') + categories.map(cat => option(cat.id, cat.name)).join('');
    const verifyCat = $('#tutVerifyCategory');
    if (verifyCat) verifyCat.innerHTML = option('', 'Categoría') + categories.map(cat => option(cat.id, cat.name)).join('');
    updateSubcategoryOptions($('#tutSubcategory'), '');
    updateSubcategoryOptions($('#tutVerifySubcategory'), '');
    const fuelSelect = $('#tutFuel');
    if (fuelSelect) fuelSelect.innerHTML = option('', 'Todos') + (stats.byFuel || []).map(item => option(item.fuel, item.fuel)).join('');
    const langSelect = $('#tutLanguage');
    if (langSelect) langSelect.innerHTML = option('', 'Todos') + (stats.byLanguage || []).map(item => option(item.language, item.label)).join('');
    const brandList = $('#tutBrandList');
    if (brandList) brandList.innerHTML = (stats.byBrand || []).map(item => `<option value="${esc(item.brand)}"></option>`).join('');
    const verifyLang = $('#tutVerifyLanguage');
    if (verifyLang) {
      const languages = new Map([
        ['und', 'Idioma no determinado'], ['es', 'Español'], ['en', 'Inglés'], ['fr', 'Francés'],
        ['pt', 'Portugués'], ['it', 'Italiano'], ['de', 'Alemán']
      ]);
      for (const item of stats.byLanguage || []) {
        if (item.language && !languages.has(item.language)) languages.set(item.language, item.label || item.language);
      }
      verifyLang.innerHTML = [...languages].map(([value, label]) => option(value, label)).join('');
    }
    const total = Number(stats.total || 0);
    const categoriesCount = Number(stats.categories || 0);
    const hours = Math.max(0, Math.round(Number(stats.durationSeconds || 0) / 3600));
    if ($('#tutStatTotal')) $('#tutStatTotal').textContent = fmtNum(total);
    if ($('#tutStatCategories')) $('#tutStatCategories').textContent = fmtNum(categoriesCount);
    if ($('#tutStatHours')) $('#tutStatHours').textContent = fmtNum(hours);
    const provider = meta.providerStatus || {};
    const note = $('#tutProviderNote');
    if (note) {
      note.innerHTML = provider.youtubeApi
        ? `${icon('shield')} YouTube API configurada · metadatos y oEmbed`
        : `${icon('shield')} Biblioteca local verificada con YouTube oEmbed`;
    }
    const providerStatus = $('#tutProviderStatus');
    if (providerStatus) {
      providerStatus.innerHTML = provider.youtubeApi
        ? '<span class="ok">YouTube Data API configurada para búsquedas e importaciones.</span>'
        : '<span class="warn">Sin YOUTUBE_API_KEY.</span> La biblioteca local funciona. Las importaciones directas se verifican con oEmbed.';
    }
  }

  async function loadMeta() {
    if (state.meta) return state.meta;
    state.meta = await api('/api/tutorials/meta');
    populateMeta();
    return state.meta;
  }

  async function loadSession() {
    try {
      state.session = await api('/api/tutorials/session');
    } catch {
      state.session = { authenticated: false, user: null };
    }
    const adminButton = $('#tutOpenAdmin');
    if (adminButton) {
      const role = state.session?.user?.role;
      adminButton.classList.toggle('hidden', !['admin', 'moderator'].includes(role));
    }
    return state.session;
  }

  function readFilters() {
    const next = {};
    for (const [key, selector] of Object.entries(FILTER_INPUTS)) {
      const element = $(selector);
      const value = String(element?.value ?? '').trim();
      if (value) next[key] = value;
    }
    if ($('#tutFree')?.checked) next.free = '1';
    if ($('#tutEmbeddable')?.checked) next.embeddable = '1';
    if ($('#tutWarnings')?.checked) next.withWarnings = '1';
    state.filters = next;
    state.q = String($('#tutSearch')?.value || '').trim();
  }

  function syncFilterInputs() {
    for (const [key, selector] of Object.entries(FILTER_INPUTS)) {
      const element = $(selector);
      if (!element) continue;
      if (key === 'subcategory') {
        updateSubcategoryOptions(element, $('#tutCategory')?.value || '', state.filters.subcategory || '');
      }
      element.value = state.filters[key] || '';
    }
    if ($('#tutFree')) $('#tutFree').checked = state.filters.free === '1';
    if ($('#tutEmbeddable')) $('#tutEmbeddable').checked = state.filters.embeddable === '1';
    if ($('#tutWarnings')) $('#tutWarnings').checked = state.filters.withWarnings === '1';
    if ($('#tutSearch')) $('#tutSearch').value = state.q;
    if ($('#tutSearchClear')) $('#tutSearchClear').classList.toggle('hidden', !state.q);
  }

  function filterLabel(key, value) {
    if (key === 'category') return (state.meta?.categories || []).find(item => item.id === value)?.name || value;
    if (key === 'subcategory') {
      for (const category of state.meta?.categories || []) {
        const found = (category.children || []).find(item => item.id === value);
        if (found) return found.name;
      }
      return value;
    }
    if (key === 'language') return (state.meta?.stats?.byLanguage || []).find(item => item.language === value)?.label || value;
    if (key === 'level') return LEVEL_LABELS[value] || value;
    if (key === 'sourceType') return SOURCE_LABELS[value] || value;
    if (key === 'duration') return DURATION_LABELS[value] || value;
    if (key === 'vehicleType') return ({ coche: 'Coche', moto: 'Moto', hibrido: 'Híbrido / eléctrico' })[value] || value;
    if (key === 'free') return 'Solo gratuitos';
    if (key === 'embeddable') return 'Reproducible aquí';
    if (key === 'withWarnings') return 'Con advertencias';
    return value;
  }

  function params(offset = 0) {
    const query = new URLSearchParams();
    if (state.q) query.set('q', state.q);
    for (const [key, value] of Object.entries(state.filters)) {
      if (value) query.set(key, value);
    }
    query.set('sort', state.sort);
    query.set('limit', String(state.limit));
    query.set('offset', String(offset));
    return query;
  }

  function updateExternalSearch() {
    const link = $('#tutExternalSearch');
    if (!link) return;
    const parts = [state.q, state.filters.dtc, state.filters.symptom, state.filters.brand, state.filters.model, state.filters.engine, filterLabel('category', state.filters.category)];
    const query = parts.filter(Boolean).join(' ').trim() || 'tutorial mecánica automotriz';
    link.href = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  }

  function renderActiveFilters() {
    const box = $('#tutActiveFilters');
    if (!box) return;
    const chips = [];
    if (state.q) chips.push(`<button class="tut-filter-chip" type="button" data-tut-remove-filter="q">${icon('search')} “${esc(state.q)}” ${icon('close')}</button>`);
    for (const [key, value] of Object.entries(state.filters)) {
      if (!value) continue;
      chips.push(`<button class="tut-filter-chip" type="button" data-tut-remove-filter="${esc(key)}">${esc(FILTER_LABELS[key] || key)}: ${esc(filterLabel(key, value))} ${icon('close')}</button>`);
    }
    box.innerHTML = chips.join('');
    updateExternalSearch();
  }

  function mediaHtml(item, large = false) {
    const image = item.thumbnail
      ? `<img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.opacity='0';this.parentElement.classList.add('is-broken')">`
      : '';
    return `${image}<span class="tut-card-play">${icon('play')}</span>${item.durationLabel ? `<span class="tut-card-duration">${esc(item.durationLabel)}</span>` : ''}${large ? '' : cardFlags(item)}`;
  }

  function cardFlags(item) {
    return `<span class="tut-card-flags">${item.isFavorite ? `<span class="tut-flag fav">${icon('bookmark')}</span>` : ''}${item.warnings?.length ? `<span class="tut-flag warn">${icon('alert')} seguridad</span>` : ''}</span>`;
  }

  function renderCard(item) {
    const tags = [item.languageLabel, LEVEL_LABELS[item.level] || item.level, SOURCE_LABELS[item.sourceType] || item.sourceType].filter(Boolean);
    return `<article class="tut-card" data-tut-card="${esc(item.id)}">
      <button class="tut-card-media" type="button" data-tut-open="${esc(item.id)}" aria-label="Abrir ${esc(item.title)}">${mediaHtml(item)}</button>
      <div class="tut-card-body">
        <span class="tut-card-cat">${esc(item.categoryName || '')}${item.subcategoryName ? ` · ${esc(item.subcategoryName)}` : ''}</span>
        <h3 class="tut-card-title"><button type="button" data-tut-open="${esc(item.id)}">${esc(item.title)}</button></h3>
        <div class="tut-card-meta">${tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>
        <div class="tut-card-foot">
          <span class="tut-card-channel" title="${esc(item.channel)}">${esc(item.channel || 'Canal no indicado')}</span>
          <button class="tut-card-open" type="button" data-tut-open="${esc(item.id)}">Ver ficha</button>
        </div>
      </div>
    </article>`;
  }

  function renderItems() {
    const grid = $('#tutGrid');
    if (!grid) return;
    grid.className = `tut-grid${state.view === 'list' ? ' tut-list' : ''}`;
    grid.innerHTML = state.items.map(renderCard).join('');
    const empty = $('#tutEmpty');
    if (empty) empty.classList.toggle('hidden', state.items.length > 0);
    const more = $('#tutMore');
    if (more) more.classList.toggle('hidden', !state.hasMore);
    const count = $('#tutResultCount');
    if (count) {
      count.innerHTML = state.total
        ? `<b>${fmtNum(state.total)}</b> tutorial${state.total === 1 ? '' : 'es'} verificado${state.total === 1 ? '' : 's'}`
        : 'Sin resultados';
    }
    renderActiveFilters();
  }

  async function loadResults(reset = true) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.offset = 0;
      state.items = [];
      const count = $('#tutResultCount');
      if (count) count.textContent = 'Buscando tutoriales...';
    }
    try {
      const data = await api(`/api/tutorials?${params(state.offset).toString()}`);
      if (reset) state.items = data.items || [];
      else state.items.push(...(data.items || []));
      state.total = Number(data.total || 0);
      state.hasMore = Boolean(data.hasMore);
      state.offset = state.items.length;
      state.loaded = true;
      renderItems();
    } catch (error) {
      toast(error.message, 'error');
      const count = $('#tutResultCount');
      if (count) count.textContent = 'Error al cargar la biblioteca';
      if (reset) {
        state.items = [];
        state.total = 0;
        state.hasMore = false;
        renderItems();
      }
    } finally {
      state.loading = false;
    }
  }

  function scheduleFilterSearch() {
    readFilters();
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => loadResults(true), 280);
  }

  function scheduleSearch() {
    state.q = String($('#tutSearch')?.value || '').trim();
    if ($('#tutSearchClear')) $('#tutSearchClear').classList.toggle('hidden', !state.q);
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadResults(true), 480);
  }

  function hideSuggestions() {
    const box = $('#tutSuggestions');
    if (box) {
      box.classList.add('hidden');
      box.innerHTML = '';
    }
  }

  function showSuggestions(items) {
    const box = $('#tutSuggestions');
    if (!box) return;
    if (!items.length) return hideSuggestions();
    box.innerHTML = items.map(item => `<button class="tut-suggestion" type="button" role="option" data-tut-open="${esc(item.id)}">
      <img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.opacity='0'">
      <span><b>${esc(item.title)}</b><small>${esc(item.categoryName || '')}${item.subcategoryName ? ` · ${esc(item.subcategoryName)}` : ''}</small></span>
      <span class="tut-suggestion-time">${esc(item.durationLabel || '')}</span>
    </button>`).join('');
    box.classList.remove('hidden');
  }

  async function loadSuggestions() {
    const q = String($('#tutSearch')?.value || '').trim();
    if (q.length < 2) return hideSuggestions();
    try {
      const data = await api(`/api/tutorials/suggestions?q=${encodeURIComponent(q)}`);
      if (String($('#tutSearch')?.value || '').trim() === q) showSuggestions(data.items || []);
    } catch { hideSuggestions(); }
  }

  function scheduleSuggestions() {
    clearTimeout(suggestTimer);
    suggestTimer = setTimeout(loadSuggestions, 220);
  }

  function resetFilters(keepQuery = false) {
    state.filters = {};
    if (!keepQuery) {
      state.q = '';
      if ($('#tutSearch')) $('#tutSearch').value = '';
      if ($('#tutSearchClear')) $('#tutSearchClear').classList.add('hidden');
    }
    syncFilterInputs();
    loadResults(true);
  }

  function buildQuery() {
    return new URLSearchParams({ q: state.q || '' });
  }

  async function openTutorial(id) {
    hideSuggestions();
    const modal = $('#tutModal');
    const body = $('#tutDetailBody');
    if (!modal || !body) return;
    modal.hidden = false;
    document.body.classList.add('tut-open');
    body.innerHTML = '<div class="tut-detail-main"><div class="tut-lib-empty">Cargando ficha verificada...</div></div>';
    try {
      const data = await api(`/api/tutorials/${encodeURIComponent(id)}`);
      state.selected = data;
      renderDetail(data);
      api(`/api/tutorials/${encodeURIComponent(id)}/view`, { method: 'POST' }).then(result => {
        if (data.tutorial) data.tutorial.localViews = result.localViews;
      }).catch(() => {});
      if (!state.session?.authenticated) recordLocalHistory(data.tutorial);
      const close = $('.tut-modal-close');
      if (close) close.focus();
    } catch (error) {
      body.innerHTML = `<div class="tut-detail-main"><div class="tut-lib-empty">${esc(error.message)}</div></div>`;
    }
  }

  function closeTutorial() {
    const modal = $('#tutModal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('tut-open');
    state.selected = null;
  }

  function favoriteState(item) {
    if (state.session?.authenticated) return Boolean(item.isFavorite);
    return state.local.favorites.some(favorite => favorite.id === item.id);
  }

  function localToggleFavorite(item) {
    const index = state.local.favorites.findIndex(favorite => favorite.id === item.id);
    if (index >= 0) state.local.favorites.splice(index, 1);
    else {
      state.local.favorites.unshift({ ...snapshot(item), isFavorite: true });
      state.local.favorites = state.local.favorites.slice(0, 200);
    }
    saveLocal();
    return index < 0;
  }

  function recordLocalHistory(item) {
    const entry = { ...snapshot(item), lastViewedAt: new Date().toISOString() };
    state.local.history = state.local.history.filter(history => history.id !== item.id);
    state.local.history.unshift(entry);
    state.local.history = state.local.history.slice(0, 60);
    saveLocal();
  }

  function applyFavorite(id, favorite) {
    for (const item of state.items) if (item.id === id) item.isFavorite = favorite;
    if (state.selected?.tutorial?.id === id) state.selected.tutorial.isFavorite = favorite;
    const card = document.querySelector(`[data-tut-card="${CSS.escape(id)}"]`);
    if (card) {
      const flags = card.querySelector('.tut-card-flags');
      if (flags) flags.outerHTML = cardFlags({ ...(state.items.find(item => item.id === id) || {}), isFavorite: favorite });
    }
    const button = $('[data-tut-favorite]');
    if (button) {
      button.classList.toggle('is-fav', favorite);
      button.innerHTML = `${icon('bookmark')} ${favorite ? 'Guardado' : 'Guardar'}`;
    }
    if (!$('#tutLibrary')?.classList.contains('hidden')) loadLibrary();
  }

  async function toggleFavorite(item) {
    try {
      if (state.session?.authenticated) {
        const result = await api(`/api/tutorials/${encodeURIComponent(item.id)}/favorite`, { method: 'POST' });
        applyFavorite(item.id, Boolean(result.favorite));
        toast(result.favorite ? 'Tutorial guardado en favoritos.' : 'Tutorial eliminado de favoritos.', 'ok');
      } else {
        const favorite = localToggleFavorite(item);
        applyFavorite(item.id, favorite);
        toast(favorite ? 'Guardado en este dispositivo. Inicia sesión para sincronizarlo.' : 'Eliminado de favoritos.', 'ok');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function detailMeta(item) {
    return [
      ['Duración', item.durationLabel || formatDuration(item.durationSeconds) || 'No indicada'],
      ['Idioma', item.languageLabel || 'No determinada'],
      ['Nivel', LEVEL_LABELS[item.level] || item.level || 'No indicado'],
      ['Fuente', SOURCE_LABELS[item.sourceType] || item.sourceType || 'No indicada'],
      ['Canal', item.channel || 'No indicado'],
      ['Comprobado', item.lastCheckedAt || 'Sin fecha'],
      ['Vistas locales', fmtNum(item.localViews || 0)]
    ].map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('');
  }

  function compatibilityHtml(item) {
    const fields = [];
    if (item.brand) fields.push(['Marca', item.brand]);
    if (item.model) fields.push(['Modelo', item.model]);
    if (item.engineCode) fields.push(['Motor', item.engineCode]);
    if (item.fuel) fields.push(['Combustible', item.fuel]);
    if (item.yearFrom || item.yearTo) fields.push(['Años', `${item.yearFrom || '?'} - ${item.yearTo || '?'}`]);
    if (item.vehicleType) fields.push(['Vehículo', ({ coche: 'Coche', moto: 'Moto', hibrido: 'Híbrido / eléctrico' })[item.vehicleType] || item.vehicleType]);
    if (item.market) fields.push(['Mercado', item.market]);
    if (!fields.length) return '<p class="tut-help">No se han declarado compatibilidades específicas. Comprueba la aplicación en tu versión y motor.</p>';
    return `<dl class="tut-kv">${fields.map(([key, value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}</dl>`;
  }

  function relatedHtml(items) {
    if (!items?.length) return '<p class="tut-help">No hay tutoriales relacionados.</p>';
    return `<div class="tut-related">${items.map(item => `<button class="tut-related-item" type="button" data-tut-open="${esc(item.id)}">
      <img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.opacity='0'">
      <span><b>${esc(item.title)}</b><small>${esc(item.durationLabel || '')} · ${esc(item.languageLabel || '')}</small></span>
    </button>`).join('')}</div>`;
  }

  function videoHtml(item) {
    if (item.embeddable && item.videoId) {
      const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?rel=0&modestbranding=1`;
      // El reproductor de YouTube no se carga hasta que hay consentimiento:
      // así no se instalan cookies de terceros antes de aceptar.
      if (!window.dymConsent?.has('embeds')) {
        return `<div class="tut-video"><button class="tut-video-gate" type="button" data-tut-load-video="${esc(item.videoId)}" aria-label="Cargar el vídeo de YouTube: ${esc(item.title)}">
          <img src="${esc(item.thumbnail)}" alt="" loading="lazy">
          <span class="tut-video-gate-play" aria-hidden="true">▶</span>
          <span class="tut-video-gate-note">Cargar vídeo de YouTube<small>Se conectará con youtube-nocookie.com</small></span>
        </button></div>`;
      }
      return `<div class="tut-video"><iframe src="${esc(src)}" title="${esc(item.title)}" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    }
    return `<div class="tut-video"><div class="tut-video-fallback"><img src="${esc(item.thumbnail)}" alt=""><div><p>Este vídeo no permite reproducción integrada.</p><a class="btn primary" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external')} Abrir en YouTube</a></div></div></div>`;
  }

  function playlistSideHtml(data) {
    if (!state.session?.authenticated) {
      return `<div class="tut-side-card"><h4>${icon('list')} Listas</h4><p class="tut-help">Inicia sesión en el foro para organizar tutoriales en listas y sincronizar favoritos.</p><button class="btn ghost" type="button" data-tut-go-forum>${icon('user')} Iniciar sesión</button></div>`;
    }
    const playlists = data.playlists || [];
    const options = playlists.map(playlist => option(playlist.id, playlist.name)).join('');
    return `<div class="tut-side-card"><h4>${icon('list')} Añadir a una lista</h4>
      ${playlists.length ? `<select id="tutDetailPlaylist"><option value="">Selecciona una lista</option>${options}</select><button class="btn ghost sm" type="button" data-tut-add-playlist>${icon('plus')} Añadir</button>` : '<p class="tut-help">Todavía no tienes listas.</p>'}
      <button class="btn ghost sm" type="button" data-tut-create-playlist>${icon('plus')} Crear lista</button>
    </div>`;
  }

  function renderDetail(data) {
    const body = $('#tutDetailBody');
    const item = data.tutorial;
    if (!body || !item) return;
    const favorite = favoriteState(item);
    const warnings = item.warnings || [];
    body.innerHTML = `<div class="tut-detail-grid">
      <div class="tut-detail-main">
        ${videoHtml(item)}
        <div class="tut-detail-kicker">
          <span class="accent">${esc(item.categoryName || '')}</span>
          <span>${esc(item.subcategoryName || '')}</span>
          ${item.verificationStatus === 'verified' ? `<span>${icon('shield')} Verificado</span>` : ''}
          ${item.riskLevel ? `<span>Riesgo ${esc(item.riskLevel)}</span>` : ''}
        </div>
        <h2 id="tutDetailTitle">${esc(item.title)}</h2>
        <div class="tut-detail-channel">
          ${item.channelUrl ? `<a href="${esc(item.channelUrl)}" target="_blank" rel="noopener noreferrer">${esc(item.channel)}</a>` : `<span>${esc(item.channel)}</span>`}
          <span class="dot"></span><span>${esc(item.durationLabel || formatDuration(item.durationSeconds) || 'Duración no indicada')}</span>
          <span class="dot"></span><span>${esc(item.languageLabel || 'Idioma no determinado')}</span>
          ${item.viewCount ? `<span class="dot"></span><span>${fmtNum(item.viewCount)} vistas en YouTube</span>` : ''}
        </div>
        <div class="tut-detail-actions">
          <button class="btn ghost ${favorite ? 'is-fav' : ''}" type="button" data-tut-favorite>${icon('bookmark')} ${favorite ? 'Guardado' : 'Guardar'}</button>
          <a class="btn ghost" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">${icon('external')} Ver en YouTube</a>
          <button class="btn ghost" type="button" data-tut-report-toggle>${icon('flag')} Avisar</button>
        </div>
        <div class="tut-detail-copy">
          <p>${esc(item.description || 'Sin descripción verificada para este vídeo.')}</p>
        </div>
        ${warnings.length ? `<div class="tut-detail-section"><h4>${icon('alert')} Advertencias de seguridad</h4><div class="tut-warning-box"><ul>${warnings.map(warning => `<li>${esc(warning)}</li>`).join('')}</ul></div></div>` : ''}
        ${(item.tags || []).length ? `<div class="tut-detail-section"><h4>${icon('tag')} Etiquetas</h4><div class="tut-tag-list">${item.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div></div>` : ''}
        <div class="tut-detail-section"><h4>${icon('check')} Verificación</h4><p class="tut-help">${esc(item.verificationSource || 'Fuente no indicada')} · Comprobado ${esc(item.lastCheckedAt || 'sin fecha')} · Licencia: ${esc(item.license || 'No especificada')}</p></div>
      </div>
      <aside class="tut-detail-side">
        <div class="tut-side-card"><h4>${icon('car')} Compatibilidad declarada</h4>${compatibilityHtml(item)}</div>
        <div class="tut-side-card"><h4>${icon('clock')} Ficha técnica</h4><dl class="tut-kv">${detailMeta(item)}</dl></div>
        ${playlistSideHtml(data)}
        <div class="tut-side-card"><h4>${icon('flag')} Avisar de un problema</h4><div class="tut-report-form hidden" id="tutReportForm"><select id="tutReportReason"><option value="enlace-roto">Enlace roto</option><option value="contenido-incorrecto">Contenido incorrecto</option><option value="no-disponible">Vídeo no disponible</option><option value="publicidad">Publicidad o spam</option><option value="seguridad">Riesgo de seguridad</option><option value="otro">Otro</option></select><textarea id="tutReportDetail" rows="3" maxlength="500" placeholder="Detalle opcional"></textarea><button class="btn ghost sm" type="button" data-tut-send-report>${icon('send')} Enviar aviso</button></div><p class="tut-help">Los avisos llegan a moderación. No se publican automáticamente.</p></div>
        <div class="tut-side-card"><h4>${icon('play')} Relacionados</h4>${relatedHtml(data.related)}</div>
      </aside>
    </div>`;
    bindDetail(data);
  }

  function bindDetail(data) {
    const item = data.tutorial;
    $('[data-tut-favorite]')?.addEventListener('click', () => toggleFavorite(item));
    $('[data-tut-report-toggle]')?.addEventListener('click', () => $('#tutReportForm')?.classList.toggle('hidden'));
    $('[data-tut-send-report]')?.addEventListener('click', async () => {
      try {
        await api(`/api/tutorials/${encodeURIComponent(item.id)}/report`, {
          method: 'POST',
          body: JSON.stringify({ reason: $('#tutReportReason')?.value, detail: $('#tutReportDetail')?.value || '' })
        });
        toast('Aviso enviado a moderación.', 'ok');
        $('#tutReportForm')?.classList.add('hidden');
      } catch (error) {
        toast(error.message, 'error');
      }
    });
    $('[data-tut-go-forum]')?.addEventListener('click', goForum);
    $('[data-tut-add-playlist]')?.addEventListener('click', async () => {
      const playlistId = $('#tutDetailPlaylist')?.value;
      if (!playlistId) return toast('Selecciona una lista.', 'error');
      try {
        await api(`/api/tutorials/playlists/${encodeURIComponent(playlistId)}/items`, {
          method: 'POST', body: JSON.stringify({ tutorialId: item.id })
        });
        toast('Tutorial añadido a la lista.', 'ok');
        loadLibrary();
      } catch (error) { toast(error.message, 'error'); }
    });
    $('[data-tut-create-playlist]')?.addEventListener('click', createPlaylistFromDetail);
  }

  async function createPlaylistFromDetail() {
    const name = window.prompt('Nombre de la nueva lista:');
    if (!name) return;
    try {
      const playlist = await api('/api/tutorials/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      toast(`Lista “${playlist.name}” creada.`, 'ok');
      if (selectedId()) await openTutorial(selectedId());
    } catch (error) { toast(error.message, 'error'); }
  }

  function selectedId() {
    return state.selected?.tutorial?.id || '';
  }

  function libraryCounts() {
    if (state.session?.authenticated && state.library) {
      return {
        favorites: state.library.favorites?.total || 0,
        history: state.library.history?.total || 0,
        playlists: state.library.playlists?.length || 0
      };
    }
    return { favorites: state.local.favorites.length, history: state.local.history.length, playlists: 0 };
  }

  function updateLibraryCounts() {
    const counts = libraryCounts();
    if ($('#tutFavCount')) $('#tutFavCount').textContent = fmtNum(counts.favorites);
    if ($('#tutHistCount')) $('#tutHistCount').textContent = fmtNum(counts.history);
    if ($('#tutPlaylistCount')) $('#tutPlaylistCount').textContent = fmtNum(counts.playlists);
  }

  async function loadLibrary() {
    if (!state.session) await loadSession();
    if (state.session?.authenticated) {
      try {
        state.library = await api('/api/tutorials/library');
      } catch (error) {
        toast(error.message, 'error');
        state.library = { favorites: { items: [], total: 0 }, history: { items: [], total: 0 }, playlists: [] };
      }
    }
    updateLibraryCounts();
    renderLibrary();
  }

  function libraryRow(item, actions = '') {
    return `<div class="tut-lib-row">
      <img src="${esc(item.thumbnail)}" alt="" loading="lazy" onerror="this.style.opacity='0'">
      <div><b>${esc(item.title)}</b><small>${esc(item.categoryName || '')}${item.subcategoryName ? ` · ${esc(item.subcategoryName)}` : ''} · ${esc(item.durationLabel || formatDuration(item.durationSeconds) || '')}</small></div>
      <div class="tut-lib-row-actions"><button type="button" data-tut-open="${esc(item.id)}">Abrir</button>${actions}</div>
    </div>`;
  }

  function renderLibrary() {
    const box = $('#tutLibContent');
    const notice = $('#tutLibNotice');
    if (!box) return;
    updateLibraryCounts();
    if (!state.session?.authenticated) {
      notice.classList.remove('hidden');
      notice.innerHTML = `Favoritos e historial guardados solo en este navegador. <button type="button" data-tut-go-forum>Inicia sesión en el foro</button> para sincronizarlos y crear listas.`;
    } else {
      notice.classList.add('hidden');
      notice.innerHTML = '';
    }
    if (state.activePlaylist) {
      renderPlaylistDetail();
      return;
    }
    if (state.libraryTab === 'favorites') {
      const items = state.session?.authenticated ? state.library?.favorites?.items || [] : state.local.favorites;
      box.innerHTML = items.length
        ? `<div class="tut-lib-grid">${items.map(item => libraryRow(item, `<button type="button" data-tut-remove-favorite="${esc(item.id)}">Quitar</button>`)).join('')}</div>`
        : '<div class="tut-lib-empty">Todavía no has guardado tutoriales. Abre una ficha y pulsa “Guardar”.</div>';
      return;
    }
    if (state.libraryTab === 'history') {
      const items = state.session?.authenticated ? state.library?.history?.items || [] : state.local.history;
      box.innerHTML = items.length
        ? `<div class="tut-lib-grid">${items.map(item => libraryRow(item, `<button type="button" data-tut-remove-history="${esc(item.id)}">Quitar</button>`)).join('')}</div><div class="actions" style="margin-top:10px"><button class="btn ghost sm" type="button" data-tut-clear-history>${icon('trash')} Vaciar historial</button></div>`
        : '<div class="tut-lib-empty">Aún no hay visualizaciones registradas.</div>';
      return;
    }
    if (!state.session?.authenticated) {
      box.innerHTML = '<div class="tut-lib-empty">Las listas requieren una cuenta del foro. Los favoritos y el historial siguen guardados en este navegador.</div>';
      return;
    }
    const playlists = state.library?.playlists || [];
    box.innerHTML = `<div class="tut-playlist-create"><input id="tutNewPlaylistName" maxlength="60" placeholder="Nombre de la lista"><button class="btn primary sm" type="button" data-tut-new-playlist>${icon('plus')} Crear</button></div>${playlists.length
      ? `<div class="tut-playlists">${playlists.map(playlist => `<div class="tut-playlist-card" data-tut-playlist="${playlist.id}">${playlist.cover ? `<img class="cover" src="${esc(playlist.cover)}" alt="" loading="lazy">` : ''}<b>${esc(playlist.name)}</b><small>${fmtNum(playlist.itemCount)} tutoriales</small></div>`).join('')}</div>`
      : '<div class="tut-lib-empty">Crea una lista para agrupar procedimientos por vehículo o trabajo.</div>'}`;
  }

  async function openPlaylist(id) {
    try {
      state.activePlaylist = await api(`/api/tutorials/playlists/${encodeURIComponent(id)}`);
      renderLibrary();
    } catch (error) { toast(error.message, 'error'); }
  }

  function renderPlaylistDetail() {
    const box = $('#tutLibContent');
    const playlist = state.activePlaylist;
    if (!box || !playlist) return;
    box.innerHTML = `<div class="tut-playlist-head"><button class="btn ghost sm" type="button" data-tut-playlist-back>${icon('arrow')} Volver</button><b>${esc(playlist.name)}</b><button class="btn ghost sm" type="button" data-tut-delete-playlist="${playlist.id}">${icon('trash')} Eliminar lista</button></div>
      ${playlist.items.length ? `<div class="tut-lib-grid">${playlist.items.map(item => libraryRow(item, `<button type="button" data-tut-remove-playlist-item="${esc(item.id)}">Quitar</button>`)).join('')}</div>` : '<div class="tut-lib-empty">Esta lista está vacía.</div>'}`;
  }

  async function createPlaylist(name) {
    if (!state.session?.authenticated) return;
    try {
      await api('/api/tutorials/playlists', { method: 'POST', body: JSON.stringify({ name }) });
      toast('Lista creada.', 'ok');
      await loadLibrary();
    } catch (error) { toast(error.message, 'error'); }
  }

  async function toggleLibrary(open) {
    const panel = $('#tutLibrary');
    if (!panel) return;
    const shouldOpen = open ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !shouldOpen);
    if (shouldOpen) {
      state.activePlaylist = null;
      await loadLibrary();
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function openAdmin() {
    if (!['admin', 'moderator'].includes(state.session?.user?.role)) return toast('Se requieren permisos de moderación.', 'error');
    const panel = $('#tutAdmin');
    if (!panel) return;
    panel.classList.remove('hidden');
    updateSubcategoryOptions($('#tutVerifySubcategory'), $('#tutVerifyCategory')?.value || '');
    await loadReports();
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function loadReports() {
    const box = $('#tutReports');
    if (!box) return;
    if (!['admin', 'moderator'].includes(state.session?.user?.role)) return;
    try {
      const data = await api('/api/tutorials/admin/reports?status=pendiente');
      state.adminReports = data.reports || [];
      box.innerHTML = state.adminReports.length ? state.adminReports.map(report => `<div class="tut-report-item">
        <b>${esc(report.tutorialTitle)}</b>
        <small>${esc(report.reason)} · ${esc(report.categoryName || '')} · ${esc(report.createdAt || '')}</small>
        ${report.detail ? `<p>${esc(report.detail)}</p>` : ''}
        <div class="tut-report-actions"><button type="button" data-tut-report-action="resolver" data-report-id="${report.id}">Resolver</button><button type="button" data-tut-report-action="descartar" data-report-id="${report.id}">Descartar</button><button class="danger" type="button" data-tut-report-action="ocultar" data-report-id="${report.id}">Ocultar vídeo</button></div>
      </div>`).join('') : '<div class="tut-lib-empty">No hay avisos pendientes.</div>';
    } catch (error) {
      box.innerHTML = `<div class="tut-lib-empty">${esc(error.message)}</div>`;
    }
  }

  async function resolveReport(id, action) {
    if (action === 'ocultar' && !window.confirm('¿Ocultar este tutorial de la biblioteca pública?')) return;
    try {
      await api(`/api/tutorials/admin/reports/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      toast('Aviso actualizado.', 'ok');
      await loadReports();
      await loadResults(true);
    } catch (error) { toast(error.message, 'error'); }
  }

  async function importJson() {
    const status = $('#tutImportStatus');
    const raw = $('#tutImportJson')?.value || '';
    if (!raw.trim()) return toast('Pega un JSON o carga un archivo.', 'error');
    try {
      const data = JSON.parse(raw);
      const videos = Array.isArray(data) ? data : data.videos;
      const result = await api('/api/tutorials/admin/import', { method: 'POST', body: JSON.stringify({ videos }) });
      status.textContent = `Importados ${result.imported}. Errores: ${(result.errors || []).length}.`;
      if ((result.errors || []).length) status.textContent += ` ${result.errors.map(error => error.message).join(' · ')}`;
      toast('Importación completada.', 'ok');
      state.meta = null;
      await loadMeta();
      await loadResults(true);
    } catch (error) {
      status.textContent = error.message;
      toast(error.message, 'error');
    }
  }

  async function verifyVideo() {
    const status = $('#tutVerifyResult');
    const url = $('#tutVerifyUrl')?.value || '';
    if (!url.trim()) return toast('Introduce una URL de YouTube.', 'error');
    status.innerHTML = '<p class="tut-help">Verificando con oEmbed...</p>';
    try {
      const video = await api('/api/tutorials/admin/verify-youtube', { method: 'POST', body: JSON.stringify({ url }) });
      state.verifiedVideo = video;
      status.innerHTML = `<img src="${esc(video.thumbnail)}" alt="" loading="lazy"><b>${esc(video.title)}</b><small>${esc(video.channel)} · ${esc(video.videoId)}</small><div class="actions" style="margin-top:8px"><button class="btn primary sm" type="button" data-tut-add-verified>${icon('plus')} Añadir a la biblioteca</button></div>`;
      $('[data-tut-add-verified]')?.addEventListener('click', addVerifiedVideo);
    } catch (error) {
      status.innerHTML = `<p class="tut-error">${esc(error.message)}</p>`;
    }
  }

  async function addVerifiedVideo() {
    if (!state.verifiedVideo) return;
    const categoryId = $('#tutVerifyCategory')?.value;
    const subcategoryId = $('#tutVerifySubcategory')?.value;
    const sourceType = $('#tutVerifySource')?.value;
    const vehicleType = $('#tutVerifyVehicle')?.value;
    if (!categoryId || !subcategoryId) return toast('Selecciona categoría y subcategoría.', 'error');
    if (!sourceType) return toast('Indica el tipo de fuente del vídeo.', 'error');
    if (!vehicleType) return toast('Indica el tipo de vehículo.', 'error');
    const category = state.meta.categories.find(item => item.id === categoryId);
    const subcategory = category?.children?.find(item => item.id === subcategoryId);
    const languageSelect = $('#tutVerifyLanguage');
    const levelSelect = $('#tutVerifyLevel');
    const video = {
      ...state.verifiedVideo,
      id: `yt-${state.verifiedVideo.videoId}`,
      categoryId,
      subcategoryId,
      categoryName: category?.name,
      subcategoryName: subcategory?.name,
      language: languageSelect?.value || 'und',
      languageLabel: languageSelect?.selectedOptions?.[0]?.textContent || 'Idioma no determinado',
      level: levelSelect?.value || 'no-especificado',
      sourceType,
      vehicleType,
      tags: [],
      systems: category ? [category.name] : [],
      free: true,
      embeddable: true,
      riskLevel: 'bajo',
      warnings: []
    };
    try {
      await api('/api/tutorials/admin/import', { method: 'POST', body: JSON.stringify({ videos: [video] }) });
      toast('Vídeo verificado añadido.', 'ok');
      state.meta = null;
      state.verifiedVideo = null;
      $('#tutVerifyResult').innerHTML = '';
      $('#tutVerifyUrl').value = '';
      await loadMeta();
      await loadResults(true);
    } catch (error) { toast(error.message, 'error'); }
  }

  async function openFromContext(params = {}) {
    if (!initialized) await init();
    showView('tutoriales');
    if (params.q !== undefined) {
      state.q = String(params.q || '');
      if ($('#tutSearch')) $('#tutSearch').value = state.q;
    }
    if (params.dtc) {
      state.filters.dtc = String(params.dtc);
      if ($('#tutDtc')) $('#tutDtc').value = state.filters.dtc;
    }
    if (params.symptom) {
      state.filters.symptom = String(params.symptom);
      if ($('#tutSymptom')) $('#tutSymptom').value = state.filters.symptom;
    }
    if (params.category) state.filters.category = String(params.category);
    for (const key of ['brand', 'model', 'engine']) {
      const input = ({ brand: '#tutBrand', model: '#tutModel', engine: '#tutEngine' })[key];
      if (params[key]) {
        state.filters[key] = String(params[key]);
        if (input && $(input)) $(input).value = state.filters[key];
      }
    }
    syncFilterInputs();
    await loadResults(true);
    const panel = document.querySelector('.tut-search-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    $('#tutSearchBtn')?.addEventListener('click', () => { hideSuggestions(); loadResults(true); });
    $('#tutSearch')?.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        hideSuggestions();
        loadResults(true);
      }
      if (event.key === 'Escape') hideSuggestions();
    });
    $('#tutSearch')?.addEventListener('input', () => { scheduleSearch(); scheduleSuggestions(); });
    $('#tutSearchClear')?.addEventListener('click', () => {
      if ($('#tutSearch')) $('#tutSearch').value = '';
      state.q = '';
      $('#tutSearchClear')?.classList.add('hidden');
      hideSuggestions();
      loadResults(true);
    });
    $$('[data-tut-quick]').forEach(button => button.addEventListener('click', () => {
      state.q = button.dataset.tutQuick || '';
      if ($('#tutSearch')) $('#tutSearch').value = state.q;
      $('#tutSearchClear')?.classList.remove('hidden');
      hideSuggestions();
      loadResults(true);
    }));
    $('#tutCategory')?.addEventListener('change', () => {
      updateSubcategoryOptions($('#tutSubcategory'), $('#tutCategory')?.value || '');
      scheduleFilterSearch();
    });
    $('#tutSubcategory')?.addEventListener('change', scheduleFilterSearch);
    for (const selector of ['#tutBrand', '#tutModel', '#tutEngine', '#tutYear', '#tutDtc', '#tutSymptom']) {
      $(selector)?.addEventListener('input', scheduleFilterSearch);
    }
    for (const selector of ['#tutFuel', '#tutLanguage', '#tutLevel', '#tutSource', '#tutDuration', '#tutVehicleType', '#tutFree', '#tutEmbeddable', '#tutWarnings']) {
      $(selector)?.addEventListener('change', scheduleFilterSearch);
    }
    $('#tutApplyFilters')?.addEventListener('click', () => { readFilters(); loadResults(true); });
    $('#tutResetFilters')?.addEventListener('click', () => resetFilters());
    $('#tutEmptyReset')?.addEventListener('click', () => resetFilters());
    $('#tutSort')?.addEventListener('change', () => { state.sort = $('#tutSort')?.value || 'relevance'; loadResults(true); });
    $('#tutViewGrid')?.addEventListener('click', () => setView('grid'));
    $('#tutViewList')?.addEventListener('click', () => setView('list'));
    $('#tutMore')?.addEventListener('click', () => loadResults(false));
    $('#tutOpenLibrary')?.addEventListener('click', () => toggleLibrary(true));
    $('#tutCloseLibrary')?.addEventListener('click', () => toggleLibrary(false));
    $('#tutOpenAdmin')?.addEventListener('click', openAdmin);
    $('#tutCloseAdmin')?.addEventListener('click', () => $('#tutAdmin')?.classList.add('hidden'));
    $('#tutRefreshReports')?.addEventListener('click', loadReports);
    $('#tutImportBtn')?.addEventListener('click', importJson);
    $('#tutImportFile')?.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      $('#tutImportJson').value = await file.text();
    });
    $('#tutVerifyBtn')?.addEventListener('click', verifyVideo);
    $('#tutVerifyCategory')?.addEventListener('change', () => updateSubcategoryOptions($('#tutVerifySubcategory'), $('#tutVerifyCategory')?.value || ''));
    document.addEventListener('click', event => {
      if (!event.target.closest('.tut-search-panel')) hideSuggestions();
      const open = event.target.closest('[data-tut-open]');
      if (open) {
        event.preventDefault();
        openTutorial(open.dataset.tutOpen);
        return;
      }
      const close = event.target.closest('[data-tut-close]');
      if (close) {
        event.preventDefault();
        closeTutorial();
        return;
      }
      const remove = event.target.closest('[data-tut-remove-filter]');
      if (remove) {
        const key = remove.dataset.tutRemoveFilter;
        if (key === 'q') {
          state.q = '';
          if ($('#tutSearch')) $('#tutSearch').value = '';
          if ($('#tutSearchClear')) $('#tutSearchClear').classList.add('hidden');
        } else {
          delete state.filters[key];
          if (key === 'category') state.filters.subcategory = '';
          if (key === 'free' && $('#tutFree')) $('#tutFree').checked = false;
          if (key === 'embeddable' && $('#tutEmbeddable')) $('#tutEmbeddable').checked = false;
          if (key === 'withWarnings' && $('#tutWarnings')) $('#tutWarnings').checked = false;
        }
        syncFilterInputs();
        loadResults(true);
        return;
      }
      const libTab = event.target.closest('[data-tut-libtab]');
      if (libTab) {
        state.activePlaylist = null;
        state.libraryTab = libTab.dataset.tutLibtab;
        $$('[data-tut-libtab]').forEach(button => {
          button.classList.toggle('active', button === libTab);
          button.setAttribute('aria-selected', String(button === libTab));
        });
        renderLibrary();
        return;
      }
      const playlist = event.target.closest('[data-tut-playlist]');
      if (playlist) {
        openPlaylist(playlist.dataset.tutPlaylist);
        return;
      }
      const back = event.target.closest('[data-tut-playlist-back]');
      if (back) {
        state.activePlaylist = null;
        renderLibrary();
        return;
      }
      const removeFavorite = event.target.closest('[data-tut-remove-favorite]');
      if (removeFavorite) {
        const item = findLibraryItem(removeFavorite.dataset.tutRemoveFavorite);
        if (item) removeFavoriteItem(item);
        return;
      }
      const removeHistory = event.target.closest('[data-tut-remove-history]');
      if (removeHistory) {
        removeHistoryItem(removeHistory.dataset.tutRemoveHistory);
        return;
      }
      const clearHistory = event.target.closest('[data-tut-clear-history]');
      if (clearHistory) {
        clearHistoryItems();
        return;
      }
      const newPlaylist = event.target.closest('[data-tut-new-playlist]');
      if (newPlaylist) {
        const name = $('#tutNewPlaylistName')?.value || '';
        createPlaylist(name);
        return;
      }
      const deletePlaylist = event.target.closest('[data-tut-delete-playlist]');
      if (deletePlaylist) {
        deletePlaylistItem(deletePlaylist.dataset.tutDeletePlaylist);
        return;
      }
      const removePlaylistItem = event.target.closest('[data-tut-remove-playlist-item]');
      if (removePlaylistItem) {
        removePlaylistEntry(removePlaylistItem.dataset.tutRemovePlaylistItem);
        return;
      }
      const reportAction = event.target.closest('[data-tut-report-action]');
      if (reportAction) {
        resolveReport(reportAction.dataset.reportId, reportAction.dataset.tutReportAction);
        return;
      }
      const go = event.target.closest('[data-tut-go-forum]');
      if (go) {
        goForum();
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#tutModal')?.hidden) closeTutorial();
    });
  }

  function setView(view) {
    state.view = view === 'list' ? 'list' : 'grid';
    $('#tutViewGrid')?.classList.toggle('active', state.view === 'grid');
    $('#tutViewList')?.classList.toggle('active', state.view === 'list');
    $('#tutViewGrid')?.setAttribute('aria-pressed', String(state.view === 'grid'));
    $('#tutViewList')?.setAttribute('aria-pressed', String(state.view === 'list'));
    renderItems();
  }

  function findLibraryItem(id) {
    if (state.session?.authenticated) {
      return [...(state.library?.favorites?.items || []), ...(state.library?.history?.items || [])].find(item => item.id === id);
    }
    return [...state.local.favorites, ...state.local.history].find(item => item.id === id);
  }

  async function removeFavoriteItem(item) {
    try {
      if (state.session?.authenticated) {
        await api(`/api/tutorials/${encodeURIComponent(item.id)}/favorite`, { method: 'POST' });
      } else {
        state.local.favorites = state.local.favorites.filter(favorite => favorite.id !== item.id);
        saveLocal();
      }
      applyFavorite(item.id, false);
      await loadLibrary();
      toast('Favorito eliminado.', 'ok');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function removeHistoryItem(id) {
    if (state.session?.authenticated) {
      toast('El historial sincronizado no permite borrar una entrada suelta. Puedes vaciarlo completo.', 'error');
      return;
    }
    state.local.history = state.local.history.filter(item => item.id !== id);
    saveLocal();
    renderLibrary();
  }

  async function clearHistoryItems() {
    try {
      if (state.session?.authenticated) {
        await api('/api/tutorials/history', { method: 'DELETE' });
        state.library = await api('/api/tutorials/library');
      } else {
        state.local.history = [];
        saveLocal();
      }
      renderLibrary();
      toast('Historial vaciado.', 'ok');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function deletePlaylistItem(id) {
    if (!window.confirm('¿Eliminar esta lista? Los tutoriales no se borran de la biblioteca.')) return;
    try {
      await api(`/api/tutorials/playlists/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.activePlaylist = null;
      await loadLibrary();
      toast('Lista eliminada.', 'ok');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function removePlaylistEntry(id) {
    const playlist = state.activePlaylist;
    if (!playlist) return;
    try {
      await api(`/api/tutorials/playlists/${encodeURIComponent(playlist.id)}/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
      state.activePlaylist = await api(`/api/tutorials/playlists/${encodeURIComponent(playlist.id)}`);
      await loadLibrary();
      renderLibrary();
      toast('Tutorial quitado de la lista.', 'ok');
    } catch (error) { toast(error.message, 'error'); }
  }

  async function init() {
    if (initialized || !$('#view-tutoriales')) return;
    initialized = true;
    bindEvents();
    try {
      await loadMeta();
      await loadSession();
      state.sort = $('#tutSort')?.value || 'relevance';
      await loadResults(true);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  document.addEventListener('viewchange', event => {
    if (event.detail?.name === 'tutoriales') {
      if (!initialized) init();
      else if (!state.loaded) loadResults(true);
    }
  });

  // Carga diferida del reproductor: solo tras el consentimiento de cookies.
  function loadVideoGate(gate) {
    const id = gate?.dataset?.tutLoadVideo;
    const wrap = gate?.closest('.tut-video');
    if (!id || !wrap) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<div class="tut-video"><iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1&autoplay=1" title="Vídeo del tutorial" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`;
    wrap.replaceWith(holder.firstElementChild);
  }

  document.addEventListener('click', event => {
    const gate = event.target.closest('[data-tut-load-video]');
    if (!gate) return;
    if (!window.dymConsent?.has('embeds')) {
      if (!window.dymConsent) return;
      window.dymConsent.allowEmbeds();
    }
    loadVideoGate(gate);
  });

  window.addEventListener('dym:consent', event => {
    if (!event.detail?.embeds) return;
    document.querySelectorAll('[data-tut-load-video]').forEach(loadVideoGate);
  });

  window.openTutorialSearch = openFromContext;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
