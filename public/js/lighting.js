/**
 * Luz y multimedia: familias de producto verificadas + guías de compra.
 * Los datos viven en data/lighting-media.json y se sirven por /api/lighting-media.
 */
(() => {
  const state = { loaded: false };

  function priceDate(value) {
    const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : '';
  }

  function priceOf(product) {
    const date = priceDate(product.priceCheckedAt || product.verifiedAt);
    const caption = product.priceSource && /amazon/i.test(product.priceSource)
      ? `Precio Amazon${date ? ` · ${date}` : ''}`
      : 'Precio';
    const live = String(product.price || '').trim();
    if (/\d/.test(live)) return { text: live, caption, observed: false };
    if (live && live !== 'Consultar') return { text: live, caption: 'Precio', observed: false };
    const observed = String(product.listingPrice || '').trim();
    if (observed) return { text: observed, caption: 'Precio observado', observed: true };
    return { text: 'Consultar precio', caption: 'Precio', observed: false };
  }

  function card(product) {
    const link = /^https?:\/\//i.test(product.affiliateUrl || '') ? product.affiliateUrl : '';
    const price = priceOf(product);
    const media = product.image && product.imageStatus === 'verified'
      ? `<img class="product-photo" src="${esc(product.image)}" alt="${esc(product.name)}" loading="lazy">`
      : `<span class="product-placeholder" title="Foto pendiente"><b>Foto pendiente</b></span>`;
    return `<article class="product lm-product">
      <div class="product-media">${media}</div>
      <div class="product-body">
        <div class="product-badges">
          <span class="product-badge ${product.imageStatus === 'verified' ? 'verified' : 'pending'}">${product.imageStatus === 'verified' ? 'Foto verificada' : 'Foto pendiente'}</span>
          <span class="product-badge ${link ? 'verified' : 'pending'}">${link ? 'Enlace verificado' : 'Enlace pendiente'}</span>
        </div>
        <small class="product-cat">${esc(product.subcategory || 'Recambio')}</small>
        <h3>${esc(product.name)}</h3>
        <small class="product-brand">${esc(product.manufacturer || 'Fabricante no confirmado')}${product.asin ? ` · ASIN ${esc(product.asin)}` : ''}</small>
        <p>${esc(product.description || '')}</p>
        <div class="product-foot">
          <span class="product-price${/\d/.test(price.text) ? '' : ' pending'}" title="${esc(product.priceSource || 'Precio del catálogo')}" data-price-id="${esc(product.id)}"><small>${esc(price.caption)}</small><span class="price-value">${esc(price.text)}</span></span>
          ${link
            ? `<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener sponsored">Ver oferta ${icon('external')}</a>`
            : '<span class="btn ghost">Enlace pendiente</span>'}
        </div>
      </div>
    </article>`;
  }

  function family(fam) {
    const hasProducts = Array.isArray(fam.products) && fam.products.length > 0;
    const body = hasProducts
      ? `<div class="product-grid lm-grid">${fam.products.map(card).join('')}</div>`
      : `<div class="lm-empty"><b>Sin fichas verificadas todavía</b><p>${esc(fam.emptyNote || '')}</p></div>`;
    const criteria = (fam.criteria || []).length
      ? `<ul class="lm-criteria">${fam.criteria.map(c => `<li>${esc(c)}</li>`).join('')}</ul>`
      : '';
    const guide = fam.guide
      ? `<details class="lm-guide"><summary>${esc(fam.guide.title || 'Guía rápida')}</summary><ul>${(fam.guide.points || []).map(p => `<li>${esc(p)}</li>`).join('')}</ul></details>`
      : '';
    return `<section class="panel lm-family" id="lm-${esc(fam.id)}">
      <div class="panel-head">
        <div><span class="eyebrow">${esc(fam.eyebrow || '')}</span><h3>${esc(fam.name)}</h3></div>
        <span class="tag">${hasProducts ? `${fam.products.length} fichas verificadas` : 'Guía de compra'}</span>
      </div>
      <p class="lm-summary">${esc(fam.summary || '')}</p>
      ${criteria}
      ${body}
      ${guide}
    </section>`;
  }

  async function load() {
    if (state.loaded) return;
    const box = document.querySelector('#lmFamilies');
    const notice = document.querySelector('#lmNotice');
    const count = document.querySelector('#lmProductCount');
    if (!box) return;
    state.loaded = true;
    box.innerHTML = '<div class="skeleton" style="height:200px"></div>';
    try {
      const res = await fetch('/api/lighting-media', { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (count) count.textContent = fmtNum(data.stats?.verified || 0);
      if (notice) {
        notice.innerHTML = `<svg class="ic"><use href="#i-check"></use></svg><div><b>${fmtNum(data.stats?.products || 0)} fichas</b> en ${fmtNum(data.stats?.families || 0)} familias · actualizado ${esc(data.updated || '')}. ${esc(data.notice || '')}</div>`;
      }
      const nav = document.querySelector('#lmNav');
      if (nav) {
        nav.innerHTML = data.families.map(f => `<button class="chip" type="button" data-lm-go="${esc(f.id)}">${esc(f.name)}</button>`).join('');
        Array.from(nav.querySelectorAll('[data-lm-go]')).forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById(`lm-${btn.dataset.lmGo}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        });
      }
      box.innerHTML = data.families.map(family).join('');
    } catch (err) {
      state.loaded = false;
      box.innerHTML = `<div class="notice">No se pudieron cargar las familias: ${esc(err.message)}.</div>`;
    }
  }

  document.addEventListener('viewchange', event => {
    if (event.detail.name === 'luz') load();
  });

  window.loadLightingMedia = load;
})();
