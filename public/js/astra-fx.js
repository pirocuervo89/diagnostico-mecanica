(function () {
  'use strict';
  if (window.__astraFx) return;
  window.__astraFx = true;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Partículas astra
  if (!reduce) {
    const box = document.createElement('div');
    box.className = 'a-particles';
    box.setAttribute('aria-hidden', 'true');
    const n = window.innerWidth < 768 ? 20 : 40;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      const size = 1.2 + Math.random() * 3.2;
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = Math.random() * 100 + 'vh';
      s.style.background = ['#00f5ff', '#ff2bd6', '#7cff6b', '#ffd166', '#7c5cff'][Math.floor(Math.random() * 5)];
      s.style.animationDuration = (12 + Math.random() * 18) + 's';
      s.style.animationDelay = (Math.random() * 18) + 's';
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  // Cursor glow variables
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      document.documentElement.style.setProperty('--ax', e.clientX + 'px');
      document.documentElement.style.setProperty('--ay', e.clientY + 'px');
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile, .panel, .shop-special-card');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      }
    }, { passive: true });
  }

  // Tilt 3D suave
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile, .shop-special-card, .tp-card, .lm-product');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg) translateY(-7px)`;
    }, { passive: true });
    document.addEventListener('pointerleave', (e) => {
      const card = e.target && e.target.closest && e.target.closest('.shop-card, .nx-tile, .shop-special-card, .tp-card, .lm-product');
      if (card) card.style.transform = '';
    }, true);
  }

  // Reveal astra
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('a-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.07, rootMargin: '0px 0px -20px 0px' }) : null;
  const observeAll = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li, .shop-how span, .tp-card, .lm-product').forEach(el => {
      if (el.classList.contains('a-reveal')) return;
      el.classList.add('a-reveal');
      if (io) io.observe(el); else el.classList.add('a-in');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAll);
  else observeAll();
  document.addEventListener('viewchange', () => setTimeout(observeAll, 100));
  setTimeout(() => document.querySelectorAll('.a-reveal').forEach(el => el.classList.add('a-in')), 1800);

  // Ripple en botones
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.btn, .nx-tile-btn, .shop-card-buy, .shop-cat, .shop-sub, .shop-related-card');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.5);width:14px;height:14px;left:${e.clientX - r.left - 7}px;top:${e.clientY - r.top - 7}px;transform:scale(0);animation:aRipple .65s ease-out forwards;`;
      btn.style.position = btn.style.position || 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    });
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes aRipple { to { transform: scale(30); opacity: 0; } }';
  document.head.appendChild(style);

  // Re-trigger animaciones al cambiar de vista
  document.addEventListener('viewchange', function () {
    document.querySelectorAll('.view.active .nx-tile, .view.active .shop-card, .view.active .tp-card').forEach((el, i) => {
      el.style.animationDelay = (i % 14) * 30 + 'ms';
    });
  });
})();
