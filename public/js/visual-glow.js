(function () {
  'use strict';
  const SEL = '.shop-card, .nx-tile, .shop-special-card, .panel, .tp-card, .lm-product, .product';
  const TILT_SEL = '.shop-card, .nx-tile, .shop-special-card, .tp-card, .lm-product, .product';

  // Cursor glow
  let cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  function moveCursor(e) {
    cx = e.clientX; cy = e.clientY;
    document.documentElement.style.setProperty('--cursor-x', `${cx}px`);
    document.documentElement.style.setProperty('--cursor-y', `${cy}px`);
    const el = e.target && e.target.closest ? e.target.closest(SEL) : null;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${((e.clientY - r.top) / r.height * 100).toFixed(1)}%`);
    }
  }
  document.addEventListener('mousemove', moveCursor, { passive: true });

  // Tilt 3D
  document.addEventListener('mousemove', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(TILT_SEL) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `translateY(-6px) scale(1.012) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 6).toFixed(2)}deg)`;
  }, { passive: true });
  document.addEventListener('mouseleave', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(TILT_SEL) : null;
    if (el) el.style.transform = '';
  }, true);

  // Reset tilt on mouseout
  document.addEventListener('mouseout', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(TILT_SEL) : null;
    if (el && !el.contains(e.relatedTarget)) el.style.transform = '';
  }, true);

  // Ripple on click
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.btn, .nx-tile-btn, .shop-card-buy, .shop-cat, .shop-sub, .tp-tab, .chip, .shop-card-media') : null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height);
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - r.left - size / 2}px`;
    ripple.style.top = `${e.clientY - r.top - size / 2}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  }, true);

  // Scroll reveal
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    const observeAll = () => {
      document.querySelectorAll('.panel, .nx-tile, .shop-card, .tp-card, .lm-product, .product, .shop-special-card').forEach(el => {
        if (!el.classList.contains('reveal')) {
          el.classList.add('reveal');
          io.observe(el);
        }
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observeAll);
    else observeAll();
    setTimeout(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')), 1200);
    // Re-observe on view changes
    document.addEventListener('viewchange', () => setTimeout(observeAll, 60));
  }

  // Parallax hero
  const hero = document.querySelector('.nx-hero');
  if (hero) {
    document.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 8;
      const y = (e.clientY / window.innerHeight - 0.5) * 8;
      hero.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }, { passive: true });
  }

  // Barra de progreso de scroll
  const sp = document.querySelector('.scroll-progress > span');
  if (sp) {
    const updateProgress = () => {
      const h = document.documentElement;
      const max = h.scrollHeight - h.clientHeight;
      const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
      sp.style.width = pct + '%';
    };
    document.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    updateProgress();
  }
})();
