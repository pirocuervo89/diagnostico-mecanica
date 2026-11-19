/* cosmos-fx.js — efectos visuales: orbes, parallax, magnético, progress, reveal */
(function () {
  'use strict';
  if (window.__cosmosFx) return;
  window.__cosmosFx = true;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Orbes flotantes
  if (!reduce) {
    const wrap = document.createElement('div');
    wrap.className = 'c-orb-wrap';
    wrap.setAttribute('aria-hidden', 'true');
    ['o1', 'o2', 'o3'].forEach(cls => {
      const o = document.createElement('span');
      o.className = 'c-orb ' + cls;
      wrap.appendChild(o);
    });
    document.body.appendChild(wrap);
  }

  // Cursor glow variables (refuerzo)
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const x = (e.clientX / window.innerWidth * 100).toFixed(2) + '%';
      const y = (e.clientY / window.innerHeight * 100).toFixed(2) + '%';
      document.body.style.setProperty('--mx', x);
      document.body.style.setProperty('--my', y);
    }, { passive: true });
  }

  // Parallax suave del hero car
  if (!reduce) {
    const car = document.querySelector('.nx-car');
    if (car) {
      document.addEventListener('pointermove', (e) => {
        const x = (e.clientX / window.innerWidth - 0.5) * 12;
        const y = (e.clientY / window.innerHeight - 0.5) * 8;
        car.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
      }, { passive: true });
    }
  }

  // Botones magnéticos
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const btn = e.target.closest('.btn, .nx-tile-btn, .shop-card-buy');
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      btn.style.transform = `translate(${(x * 0.18).toFixed(2)}px, ${(y * 0.18).toFixed(2)}px)`;
    }, { passive: true });
    document.addEventListener('pointerleave', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.btn, .nx-tile-btn, .shop-card-buy');
      if (btn) btn.style.transform = '';
    }, true);
  }

  // Scroll progress
  const bar = document.querySelector('.scroll-progress span');
  if (bar) {
    const update = () => {
      const h = document.documentElement;
      const scrolled = (h.scrollTop || document.body.scrollTop) / Math.max(1, (h.scrollHeight - h.clientHeight));
      bar.style.width = (scrolled * 100).toFixed(2) + '%';
    };
    document.addEventListener('scroll', update, { passive: true });
    update();
  }

  // Reveal cósmico
  const revealTargets = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li, .home-scanner').forEach((el) => {
      if (el.classList.contains('c-reveal') || el.classList.contains('q-reveal')) return;
      el.classList.add('c-reveal');
    });
  };
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }) : null;
  const observeAll = () => {
    revealTargets();
    if (!io) {
      document.querySelectorAll('.c-reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    document.querySelectorAll('.c-reveal:not(.is-visible)').forEach(el => io.observe(el));
  };

  const init = () => {
    observeAll();
    document.addEventListener('viewchange', () => setTimeout(observeAll, 150));
    if ('MutationObserver' in window) {
      const mo = new MutationObserver(() => {
        if (window.__cMoTimer) return;
        window.__cMoTimer = setTimeout(() => {
          window.__cMoTimer = null;
          observeAll();
        }, 220);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
