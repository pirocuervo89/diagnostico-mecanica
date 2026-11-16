(function () {
  'use strict';
  if (window.__neonFx) return;
  window.__neonFx = true;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Partículas neon
  if (!reduce) {
    const box = document.createElement('div');
    box.className = 'n-particles';
    box.setAttribute('aria-hidden', 'true');
    const n = window.innerWidth < 768 ? 16 : 32;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      const size = 2 + Math.random() * 3;
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = Math.random() * 100 + 'vh';
      s.style.background = ['#22d3ee', '#a78bfa', '#f59e0b'][Math.floor(Math.random() * 3)];
      s.style.animationDuration = (12 + Math.random() * 18) + 's';
      s.style.animationDelay = (Math.random() * 18) + 's';
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  // Cursor glow variable
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      document.documentElement.style.setProperty('--cursor-x', e.clientX + 'px');
      document.documentElement.style.setProperty('--cursor-y', e.clientY + 'px');
    }, { passive: true });
  }

  // Reveal neon
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('n-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }) : null;
  const observeAll = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li').forEach(el => {
      if (el.classList.contains('n-reveal')) return;
      el.classList.add('n-reveal');
      if (io) io.observe(el); else el.classList.add('n-in');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAll);
  else observeAll();
  document.addEventListener('viewchange', () => setTimeout(observeAll, 80));
  setTimeout(() => document.querySelectorAll('.n-reveal').forEach(el => el.classList.add('n-in')), 1500);
})();
