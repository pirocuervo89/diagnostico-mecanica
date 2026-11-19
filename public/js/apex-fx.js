(function () {
  'use strict';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  }

  ready(() => document.documentElement.classList.add('ax-ready', 'ox-ready'));

  // Cursor spotlight variables.
  if (!reduced) {
    window.addEventListener('pointermove', (e) => {
      const x = (e.clientX / window.innerWidth) * 100;
      const y = (e.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty('--cursor-x', x + '%');
      document.documentElement.style.setProperty('--cursor-y', y + '%');
    }, { passive: true });
  }

  // Scroll progress bar.
  ready(() => {
    const bar = document.createElement('div');
    bar.id = 'oxScrollProgress';
    document.body.appendChild(bar);
    const update = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? (window.scrollY / h) * 100 : 0;
      bar.style.width = Math.min(100, Math.max(0, p)) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  });

  // Hero parallax.
  const hero = document.querySelector('.nx-hero, .shop-hero, .hero');
  if (hero && !reduced) {
    window.addEventListener('scroll', () => {
      const y = window.scrollY || 0;
      hero.style.transform = `translate3d(0, ${Math.min(y * 0.14, 48)}px, 0)`;
    }, { passive: true });
  }

  // Re-observe cards on view change for entrance.
  function staggerCards() {
    const cards = document.querySelectorAll('.view.active .shop-card, .view.active .tp-card, .view.active .lm-product, .view.active .home-scanner, .view.active .nx-tile');
    cards.forEach((c, i) => {
      c.style.animationDelay = `${Math.min(i, 40) * 22}ms`;
      c.classList.add('ax-in', 'ox-in');
    });
  }
  document.addEventListener('viewchange', () => setTimeout(staggerCards, 80));
  ready(() => setTimeout(staggerCards, 200));

  // Glow trail.
  if (!reduced) {
    ready(() => {
      const trail = document.createElement('div');
      trail.className = 'ox-cursor-trail';
      document.body.appendChild(trail);
      window.addEventListener('pointermove', (e) => {
        trail.style.transform = `translate3d(${e.clientX - 17}px, ${e.clientY - 17}px, 0)`;
        trail.style.opacity = '1';
      }, { passive: true });
      window.addEventListener('pointerleave', () => { trail.style.opacity = '0'; });
    });
  }

  // Animated counters.
  function animateNumber(el, target) {
    if (!el || el.dataset.oxAnimated) return;
    el.dataset.oxAnimated = '1';
    const dur = 900;
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('es-ES');
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

  // Tilt on cards.
  if (!reduced) {
    ready(() => {
      document.addEventListener('pointermove', (e) => {
        const card = e.target && e.target.closest && e.target.closest('.shop-card, .tp-card, .nx-tile, .home-scanner');
        if (!card) return;
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `translateY(-6px) rotateX(${(-py * 6).toFixed(2)}deg) rotateY(${(px * 6).toFixed(2)}deg)`;
      }, { passive: true });
      document.addEventListener('pointerleave', (e) => {
        const card = e.target && e.target.closest && e.target.closest('.shop-card, .tp-card, .nx-tile, .home-scanner');
        if (card) card.style.transform = '';
      }, true);
    });
  }

  // Ripple on buttons.
  if (!reduced) {
    ready(() => {
      document.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('.btn, .nx-tile-btn, .shop-card-buy, .shop-cat, .shop-sub');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.style.position = 'absolute';
        ripple.style.borderRadius = '50%';
        ripple.style.pointerEvents = 'none';
        ripple.style.left = (e.clientX - r.left - 6) + 'px';
        ripple.style.top = (e.clientY - r.top - 6) + 'px';
        ripple.style.width = '12px';
        ripple.style.height = '12px';
        ripple.style.background = 'rgba(255,255,255,.45)';
        ripple.style.transform = 'scale(0)';
        ripple.style.animation = 'oxRipple .55s ease-out forwards';
        btn.style.position = btn.style.position || 'relative';
        btn.style.overflow = 'hidden';
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
    });
    const style = document.createElement('style');
    style.textContent = '@keyframes oxRipple { to { transform: scale(18); opacity: 0; } }';
    document.head.appendChild(style);
  }

  // Floating help button toggles quick guide.
  ready(() => {
    if (document.getElementById('oxHelpFab')) return;
    const fab = document.createElement('button');
    fab.id = 'oxHelpFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Guía rápida de uso');
    fab.textContent = '?';
    fab.addEventListener('click', () => {
      const g = document.querySelector('.nx-quickguide, .shop-how');
      if (g) {
        g.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
        g.classList.add('ox-highlight');
        setTimeout(() => g.classList.remove('ox-highlight'), 1400);
      }
    });
    document.body.appendChild(fab);
    const hl = document.createElement('style');
    hl.textContent = '.ox-highlight { outline: 2px solid rgba(0,245,255,.9); box-shadow: 0 0 0 6px rgba(0,245,255,.18), 0 0 40px rgba(0,245,255,.45) !important; transition: box-shadow .25s ease, outline .25s ease; }';
    document.head.appendChild(hl);
  });
})();
