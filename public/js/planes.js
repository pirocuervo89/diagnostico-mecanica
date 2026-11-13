/**
 * Planes: Gratis (30 días), Pro 4,99 €/mes y Full 9,99 €/mes.
 * Contratar abre Stripe Checkout en modo suscripción mensual.
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
  let cargado = false;
  let ocupado = false;

  function aviso(texto, malo) {
    const box = $('plansState');
    if (!box) return;
    box.textContent = texto || '';
    box.classList.toggle('malo', Boolean(malo));
  }

  function tarjeta(p) {
    const esFull = p.id === 'full';
    const esPro = p.id === 'pro';
    const destacado = esFull ? ' destacado' : '';
    const boton = p.id === 'free'
      ? `<button class="plan-btn ghost" type="button" disabled>${p.current ? 'Tu plan actual' : 'Incluido al registrarte'}</button>`
      : `<button class="plan-btn${esFull ? ' primary' : ''}" type="button" data-plan="${p.id}">${p.current ? 'Renovar' : `Contratar ${p.name}`}</button>`;
    const extras = (p.missing || []).length
      ? `<ul class="plan-missing">${p.missing.map(m => `<li>No incluye: ${esc(m)}</li>`).join('')}</ul>`
      : '';
    return `
      <article class="plan-card${destacado}${p.current ? ' actual' : ''}">
        ${esFull ? '<span class="plan-badge">El más completo</span>' : (esPro ? '<span class="plan-badge pro">Recomendado</span>' : '')}
        <header>
          <h3>${esc(p.name)}</h3>
          <p class="plan-tagline">${esc(p.tagline)}</p>
          <div class="plan-price"><b>${esc(p.priceLabel)}</b><span>${esc(p.period)}</span></div>
        </header>
        <ul class="plan-features">${p.features.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
        ${extras}
        ${boton}
      </article>`;
  }

  function pintar(data) {
    const grid = $('plansGrid');
    if (!grid) return;
    grid.innerHTML = data.plans.map(tarjeta).join('');
    grid.querySelectorAll('[data-plan]').forEach(btn => {
      btn.addEventListener('click', () => contratar(btn.dataset.plan, btn));
    });

    let estado = '';
    if (!data.loggedIn) estado = 'Entra en Mi garaje para contratar un plan; sin cuenta solo puedes ver la web.';
    else if (data.blocked) estado = 'Tu prueba de 30 días ha terminado. Elige un plan para seguir usando el garaje y el asistente.';
    else if (data.trialActive) estado = `Estás en prueba: te quedan ${data.trialDaysLeft} día${data.trialDaysLeft === 1 ? '' : 's'}.`;
    else estado = `Tu plan actual es ${data.currentLabel}.`;
    aviso(estado);
  }

  async function cargar() {
    try {
      const res = await fetch('/api/payments/plans');
      const data = await res.json();
      pintar(data);
      cargado = true;
    } catch {
      const grid = $('plansGrid');
      if (grid) grid.innerHTML = '<div class="notice">No se han podido cargar los planes. Recarga la página.</div>';
    }
  }

  async function contratar(plan, btn) {
    if (ocupado) return;
    ocupado = true;
    const texto = btn.textContent;
    btn.textContent = 'Abriendo pago…';
    btn.disabled = true;
    try {
      const res = await fetch('/api/payments/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        aviso('Entra en Mi garaje (o crea la cuenta) y vuelve a intentarlo.', true);
        document.querySelector('[data-view="garaje"]')?.click();
        return;
      }
      if (!res.ok || !data.url) {
        aviso(data.error || data.detail || 'No se ha podido abrir el pago. Inténtalo en un minuto.', true);
        return;
      }
      window.location.href = data.url;
    } catch {
      aviso('Sin conexión con el pago. Revisa tu internet y prueba otra vez.', true);
    } finally {
      ocupado = false;
      btn.textContent = texto;
      btn.disabled = false;
    }
  }

  async function init() {
    if (!$('view-planes')) return;
    if ($('view-planes').classList.contains('active') || /#planes$/.test(location.hash)) cargar();
    document.addEventListener('viewchange', event => {
      if (event.detail?.name === 'planes') cargar();
    });
    const params = new URLSearchParams(location.search);
    if (params.get('plan') && params.get('pago') === 'ok') {
      aviso('Pago recibido. En unos segundos tu plan estará activo; si no lo ves, recarga la página.');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
