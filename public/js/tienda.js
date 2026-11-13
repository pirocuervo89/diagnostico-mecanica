/**
 * Tienda única: recambios, aceites, filtros, frenos, luces, tuning, neumáticos…
 *
 * Carga el catálogo ligero (/api/products?lite=1), lo agrupa en secciones
 * entendedoras (no por la categoría interna del dato) y lo pinta en tarjetas
 * con foto, marca y precio. Todo se filtra en el móvil: no hay viajes al
 * servidor al cambiar de sección, así que responde al instante.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const PAGE = 24;
  const fold = text => String(text || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Secciones de la tienda, en el orden en que se muestran. La primera regla
  // que encaja manda, así que lo específico va antes que lo general.
  const SECCIONES = [
    { id: 'filtros', label: 'Filtros', ico: '🧽', match: p => /^filtro|^kit de filtros/i.test(s(p.subcategory)) },
    { id: 'aceites', label: 'Aceites y líquidos', ico: '🛢️', match: p => s(p.category) === 'liquidos y quimicos' },
    { id: 'frenos', label: 'Frenos y ABS', ico: '🛑', match: p => /freno|pastilla|disco|abs|pinza/.test(s(p.subcategory)) },
    { id: 'suspension', label: 'Suspensión y dirección', ico: '🔧', match: p => /amortiguador|rotula|suspension|direccion|silentblock|brazo|muelle|barra/.test(s(p.subcategory)) },
    { id: 'iluminacion', label: 'Iluminación', ico: '💡', match: p => /bombilla|luz|led|xenon|faro|matricula/.test(s(p.subcategory)) },
    { id: 'motor', label: 'Motor y distribución', ico: '⚙️', match: p => /bujia|distribucion|correa|bomba|turbo|inyector|culata|junta|termostato|radiador|embrague|valvula|sensor de cigue|manguito/.test(s(p.subcategory)) },
    { id: 'electricidad', label: 'Baterías y electricidad', ico: '🔋', match: p => /bateria|alternador|arranque|sensor|fusible|bobina/.test(s(p.subcategory)) },
    { id: 'limpieza', label: 'Limpieza y cuidado', ico: '🧴', match: p => /limpieza|limpia|escobilla|aditivo|sellador/.test(s(p.subcategory)) },
    { id: 'tuning', label: 'Tuning y accesorios', ico: '🏁', match: p => s(p.category) === 'tuning' },
    { id: 'diagnosis', label: 'Diagnosis y OBD', ico: '📡', match: p => s(p.category) === 'diagnosis' },
    { id: 'herramientas', label: 'Herramientas', ico: '🧰', match: p => s(p.category) === 'herramientas' },
    { id: 'maquinaria', label: 'Maquinaria de taller', ico: '🏗️', match: p => s(p.category) === 'maquinaria' }
  ];

  function s(value) { return fold(value).trim(); }

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  const precio = value => {
    const n = Number(String(value || '').replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3})/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 999999;
  };

  const state = {
    all: [],
    section: 'todo',
    sub: 'todas',
    query: '',
    sort: 'relevant',
    shown: PAGE,
    loaded: false,
    loading: null
  };

  function seccionDe(p) {
    for (const sec of SECCIONES) if (sec.match(p)) return sec.id;
    return 'otros';
  }

  function cargar() {
    if (state.loaded) return Promise.resolve(state.all);
    if (state.loading) return state.loading;
    state.loading = fetch('/api/products?lite=1')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('No se pudo cargar la tienda'))))
      .then(list => {
        state.all = (Array.isArray(list) ? list : []).map(p => ({
          ...p,
          sec: seccionDe(p),
          priceNum: precio(p.price)
        }));
        state.loaded = true;
        pintarTodo();
        return state.all;
      })
      .catch(error => {
        const grid = $('shopGrid');
        if (grid) grid.innerHTML = `<div class="notice">No se ha podido cargar la tienda: ${esc(error.message)}. Recarga la página.</div>`;
        state.loading = null;
        throw error;
      });
    return state.loading;
  }

  function listado() {
    let list = state.all;
    if (state.section !== 'todo') list = list.filter(p => p.sec === state.section);
    if (state.sub !== 'todas') list = list.filter(p => s(p.subcategory) === state.sub);
    const q = s(state.query);
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const text = s(`${p.name} ${p.manufacturer} ${p.subcategory} ${p.category}`);
        return terms.every(t => text.includes(t));
      });
    }
    const orden = [...list];
    if (state.sort === 'price-asc') orden.sort((a, b) => a.priceNum - b.priceNum);
    else if (state.sort === 'price-desc') orden.sort((a, b) => b.priceNum - a.priceNum);
    else if (state.sort === 'name') orden.sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
    return orden;
  }

  function pintarTodo() {
    pintarCifras();
    pintarCategorias();
    pintarSubcategorias();
    pintarGrid();
  }

  function pintarCifras() {
    const total = $('shopStats');
    if (!total) return;
    const sections = new Set(state.all.map(p => p.sec)).size;
    const brands = new Set(state.all.map(p => s(p.manufacturer)).filter(Boolean)).size;
    total.querySelector('[data-shop-total]').textContent = state.all.length.toLocaleString('es-ES');
    total.querySelector('[data-shop-sections]').textContent = sections;
    total.querySelector('[data-shop-brands]').textContent = brands;
    const hint = document.querySelector('.shop-search-hint');
    if (hint) hint.textContent = `${state.all.length.toLocaleString('es-ES')} productos con precio y foto`;
  }

  function pintarCategorias() {
    const box = $('shopCats');
    if (!box) return;
    const counts = {};
    for (const p of state.all) counts[p.sec] = (counts[p.sec] || 0) + 1;
    const secciones = [
      { id: 'todo', label: 'Todo', ico: '🛒', count: state.all.length },
      ...SECCIONES.map(sec => ({ ...sec, count: counts[sec.id] || 0 })),
      { id: 'otros', label: 'Más recambios', ico: '📦', count: counts.otros || 0 }
    ].filter(sec => sec.count > 0);

    box.innerHTML = secciones.map(sec => `
      <button class="shop-cat${state.section === sec.id ? ' active' : ''}" data-section="${sec.id}" type="button" aria-pressed="${state.section === sec.id}">
        <span class="shop-cat-ico" aria-hidden="true">${sec.ico}</span>
        <span class="shop-cat-label">${esc(sec.label)}</span>
        <span class="shop-cat-count">${sec.count}</span>
      </button>`).join('');

    box.querySelectorAll('[data-section]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.section = btn.dataset.section;
        state.sub = 'todas';
        state.shown = PAGE;
        pintarCategorias();
        pintarSubcategorias();
        pintarGrid();
      });
    });
  }

  function pintarSubcategorias() {
    const box = $('shopSubs');
    if (!box) return;
    const base = state.section === 'todo' ? state.all : state.all.filter(p => p.sec === state.section);
    const subs = new Map();
    for (const p of base) {
      const key = s(p.subcategory);
      if (!key) continue;
      const entry = subs.get(key) || { label: p.subcategory, count: 0 };
      entry.count += 1;
      subs.set(key, entry);
    }
    if (subs.size < 2) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    const orden = [...subs.entries()].sort((a, b) => b[1].count - a[1].count);
    box.innerHTML = `
      <button class="shop-sub${state.sub === 'todas' ? ' active' : ''}" data-sub="todas" type="button">Todas</button>
      ${orden.map(([key, info]) => `<button class="shop-sub${state.sub === key ? ' active' : ''}" data-sub="${esc(key)}" type="button">${esc(info.label)} <b>${info.count}</b></button>`).join('')}`;
    box.querySelectorAll('[data-sub]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sub = btn.dataset.sub;
        state.shown = PAGE;
        pintarSubcategorias();
        pintarGrid();
      });
    });
  }

  function tarjeta(p) {
    const imagen = p.image
      ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" decoding="async" onerror="this.classList.add('rota')">`
      : '';
    const precioTxt = /€/.test(p.price || '') ? p.price : (p.price ? `${p.price} €` : 'Ver precio');
    const enlace = p.affiliateUrl || '#';
    return `
      <article class="shop-card">
        <a class="shop-card-media" href="${esc(enlace)}" target="_blank" rel="sponsored nofollow noopener noreferrer" aria-label="${esc(p.name)}">
          ${imagen}
          <span class="shop-card-brand">${esc(p.manufacturer || p.seller || 'Recambio')}</span>
        </a>
        <div class="shop-card-body">
          <h3>${esc(p.name)}</h3>
          <span class="shop-card-cat">${esc(p.subcategory || p.category || '')}</span>
          <div class="shop-card-foot">
            <b class="shop-card-price">${esc(precioTxt)}</b>
            <a class="shop-card-buy" href="${esc(enlace)}" target="_blank" rel="sponsored nofollow noopener noreferrer">Ver oferta</a>
          </div>
        </div>
      </article>`;
  }

  function pintarGrid() {
    const grid = $('shopGrid');
    const count = $('shopCount');
    const more = $('shopMore');
    if (!grid) return;
    const list = listado();
    if (!list.length) {
      grid.innerHTML = '<div class="notice">No hay productos con ese filtro. Prueba otra palabra o cambia de sección.</div>';
      if (count) count.textContent = '0 productos';
      if (more) more.hidden = true;
      return;
    }
    const visible = list.slice(0, state.shown);
    grid.innerHTML = visible.map(tarjeta).join('');
    if (count) {
      const secLabel = state.section === 'todo' ? 'todos' : (SECCIONES.find(x => x.id === state.section)?.label || 'más recambios');
      count.textContent = `${list.length.toLocaleString('es-ES')} producto${list.length === 1 ? '' : 's'} en ${secLabel}${state.query ? ` · «${state.query}»` : ''}`;
    }
    if (more) more.hidden = list.length <= state.shown;
  }

  function buscar(term) {
    state.query = term;
    state.shown = PAGE;
    pintarGrid();
  }

  function init() {
    if (!$('view-tienda')) return;
    // Solo se descarga el catálogo al entrar en la tienda: 168 KB que no deben
    // viajar si el usuario viene a preguntar por una luz.
    if ($('view-tienda').classList.contains('active')) cargar().catch(() => {});

    const input = $('shopQuery');
    const clear = $('shopClearQuery');
    if (input) {
      let t;
      input.addEventListener('input', () => {
        if (clear) clear.hidden = !input.value;
        clearTimeout(t);
        t = setTimeout(() => buscar(input.value), 180);
      });
    }
    if (clear) {
      clear.addEventListener('click', () => {
        if (input) input.value = '';
        clear.hidden = true;
        buscar('');
        input?.focus();
      });
    }
    $('shopSort')?.addEventListener('change', event => {
      state.sort = event.target.value;
      state.shown = PAGE;
      pintarGrid();
    });
    $('shopMore')?.addEventListener('click', () => {
      state.shown += PAGE;
      pintarGrid();
    });
  }

  document.addEventListener('viewchange', event => {
    if (event.detail?.name === 'tienda') cargar().catch(() => {});
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.Tienda = { recargar: () => { state.loaded = false; state.loading = null; return cargar(); } };
})();
