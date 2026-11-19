(function () {
  'use strict';
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  // Marca el documento como listo para activar animaciones.
  ready(() => document.documentElement.classList.add('nf-ready'));

  // Parallax suave en el hero.
  const hero = document.querySelector('.nx-hero, .shop-hero, .hero');
  if (hero) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY || 0;
      hero.style.transform = `translate3d(0, ${Math.min(y * 0.18, 60)}px, 0)`;
    }, { passive: true });
  }

  // Animación de contadores en stats.
  function animateNumber(el, target) {
    if (!el || el.dataset.nfAnimated) return;
    el.dataset.nfAnimated = '1';
    const start = 0;
    const dur = 900;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(start + (target - start) * eased).toLocaleString('es-ES');
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  ready(() => {
    document.querySelectorAll('[data-stat]').forEach(el => {
      const n = parseInt(String(el.textContent).replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(n) && n > 0) {
        el.textContent = '0';
        const io = new IntersectionObserver(entries => {
          entries.forEach(e => {
            if (e.isIntersecting) { animateNumber(el, n); io.unobserve(el); }
          });
        }, { threshold: 0.4 });
        io.observe(el);
      }
    });
  });

  // Re-observa tarjetas al cambiar de vista para efecto de entrada.
  function staggerCards() {
    const cards = document.querySelectorAll('.view.active .shop-card, .view.active .tp-card, .view.active .lm-product');
    cards.forEach((c, i) => {
      c.style.animationDelay = `${Math.min(i, 24) * 28}ms`;
      c.classList.add('nf-in');
    });
  }
  document.addEventListener('viewchange', () => setTimeout(staggerCards, 80));
  ready(() => setTimeout(staggerCards, 200));

  // Glow trail ligero siguiendo el cursor.
  let trail = null;
  ready(() => {
    trail = document.createElement('div');
    trail.className = 'nf-cursor-trail';
    document.body.appendChild(trail);
    window.addEventListener('pointermove', (e) => {
      trail.style.transform = `translate3d(${e.clientX - 12}px, ${e.clientY - 12}px, 0)`;
      trail.style.opacity = '1';
    }, { passive: true });
    window.addEventListener('pointerleave', () => { if (trail) trail.style.opacity = '0'; });
  });
})();
