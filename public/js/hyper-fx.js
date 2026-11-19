(function () {
  'use strict';
  if (window.__hyperFx) return;
  window.__hyperFx = true;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Partículas hyper
  if (!reduce) {
    const box = document.createElement('div');
    box.className = 'h-particles';
    box.setAttribute('aria-hidden', 'true');
    const n = window.innerWidth < 768 ? 18 : 36;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      const size = 1.5 + Math.random() * 3.5;
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      s.style.left = Math.random() * 100 + 'vw';
      s.style.top = Math.random() * 100 + 'vh';
      s.style.background = ['#00e5ff', '#b388ff', '#ffab40', '#ff4081'][Math.floor(Math.random() * 4)];
      s.style.animationDuration = (14 + Math.random() * 20) + 's';
      s.style.animationDelay = (Math.random() * 20) + 's';
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  // Cursor glow variables
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      document.documentElement.style.setProperty('--hx', e.clientX + 'px');
      document.documentElement.style.setProperty('--hy', e.clientY + 'px');
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile, .panel');
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
      }
    }, { passive: true });
  }

  // Tilt 3D suave en tarjetas
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile, .shop-special-card');
      if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-6px)`;
    }, { passive: true });
    document.addEventListener('pointerleave', (e) => {
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile, .shop-special-card');
      if (card) card.style.transform = '';
    }, true);
  }

  // Reveal hyper
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('h-in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }) : null;
  const observeAll = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li, .shop-how span').forEach(el => {
      if (el.classList.contains('h-reveal')) return;
      el.classList.add('h-reveal');
      if (io) io.observe(el); else el.classList.add('h-in');
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAll);
  else observeAll();
  document.addEventListener('viewchange', () => setTimeout(observeAll, 90));
  setTimeout(() => document.querySelectorAll('.h-reveal').forEach(el => el.classList.add('h-in')), 1600);

  // Ripple en botones
  if (!reduce) {
    document.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.btn, .nx-tile-btn, .shop-card-buy, .shop-cat, .shop-sub');
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.style.cssText = `position:absolute;border-radius:50%;pointer-events:none;background:rgba(255,255,255,.45);width:12px;height:12px;left:${e.clientX - r.left - 6}px;top:${e.clientY - r.top - 6}px;transform:scale(0);animation:hRipple .6s ease-out forwards;`;
      btn.style.position = btn.style.position || 'relative';
      btn.style.overflow = 'hidden';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 650);
    });
  }
  const style = document.createElement('style');
  style.textContent = '@keyframes hRipple { to { transform: scale(28); opacity: 0; } }';
  document.head.appendChild(style);
})();
