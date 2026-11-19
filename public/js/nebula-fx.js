(function () {
  'use strict';
  if (window.__nebulaFx) return;
  window.__nebulaFx = true;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cursor glow global
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      document.documentElement.style.setProperty('--nb-cx', e.clientX + 'px');
      document.documentElement.style.setProperty('--nb-cy', e.clientY + 'px');
      const card = e.target && e.target.closest && e.target.closest('.shop-card, .nx-tile, .panel, .shop-special-card, .tp-card, .lm-product');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--nmx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--nmy', ((e.clientY - r.top) / r.height * 100) + '%');
      }
    }, { passive: true });
  }

  // Reveal nebula
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('nb-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.06, rootMargin: '0px 0px -18px 0px' }) : null;
  const observeAll = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li, .shop-how span, .tp-card, .lm-product, .page-head').forEach(el => {
      if (el.classList.contains('nb-reveal')) return;
      el.classList.add('nb-reveal');
      if (io) io.observe(el); else el.classList.add('nb-in');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAll);
  else observeAll();
  document.addEventListener('viewchange', () => setTimeout(observeAll, 120));
  setTimeout(() => document.querySelectorAll('.nb-reveal').forEach(el => el.classList.add('nb-in')), 2000);

  // Re-trigger animaciones al cambiar de vista
  document.addEventListener('viewchange', function () {
    document.querySelectorAll('.view.active .shop-card, .view.active .nx-tile, .view.active .tp-card').forEach((el, i) => {
      el.style.animationDelay = (i % 16) * 24 + 'ms';
    });
  });

  // Ripple sutil en categorías y botones
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.shop-cat, .shop-sub, .btn, .nx-tile-btn');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = 'position:absolute;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.45);width:12px;height:12px;left:' + (e.clientX - r.left - 6) + 'px;top:' + (e.clientY - r.top - 6) + 'px;transform:scale(0);animation:nbRipple .6s ease-out forwards;';
      btn.style.position = btn.style.position || 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes nbRipple { to { transform: scale(28); opacity: 0; } }';
  document.head.appendChild(style);
})();
