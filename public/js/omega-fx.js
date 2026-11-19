(function () {
  'use strict';
  // Efecto magnético suave en botones principales
  const MAG = '.btn.primary, .nx-btn-ask, .shop-card-buy, .shop-special-card';
  document.addEventListener('mousemove', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(MAG) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left - r.width / 2) * 0.18;
    const y = (e.clientY - r.top - r.height / 2) * 0.18;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }, { passive: true });
  document.addEventListener('mouseout', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(MAG) : null;
    if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
  }, true);

  // Resplandor de cursor global (CSS var)
  document.addEventListener('pointermove', (e) => {
    document.documentElement.style.setProperty('--cursor-x', e.clientX + 'px');
    document.documentElement.style.setProperty('--cursor-y', e.clientY + 'px');
  }, { passive: true });

  // Re-observar revelado al cambiar de vista
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' });
    const scan = () => {
      document.querySelectorAll('.panel, .nx-tile, .shop-card, .tp-card, .lm-product, .product, .shop-special-card, .home-scanner, .shop-how')
        .forEach((el) => {
          if (!el.classList.contains('reveal')) { el.classList.add('reveal'); io.observe(el); }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
    else scan();
    setTimeout(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')), 1500);
    document.addEventListener('viewchange', () => setTimeout(scan, 80));
  }
})();
