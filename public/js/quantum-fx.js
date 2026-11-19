/* quantum-fx.js — efectos visuales: partículas, reveal, ripple, tilt, count-up */
(function () {
  'use strict';
  if (window.__quantumFx) return;
  window.__quantumFx = true;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Fondo que sigue el cursor
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const x = (e.clientX / window.innerWidth * 100).toFixed(2) + '%';
      const y = (e.clientY / window.innerHeight * 100).toFixed(2) + '%';
      document.body.style.setProperty('--mx', x);
      document.body.style.setProperty('--my', y);
    }, { passive: true });
  }

  // Partículas flotantes
  if (!reduce) {
    const box = document.createElement('div');
    box.className = 'q-particles';
    box.setAttribute('aria-hidden', 'true');
    const n = window.innerWidth < 768 ? 14 : 28;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('span');
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDelay = (Math.random() * 18) + 's';
      s.style.animationDuration = (14 + Math.random() * 14) + 's';
      const size = 2 + Math.random() * 3;
      s.style.width = size + 'px';
      s.style.height = size + 'px';
      if (Math.random() > .5) s.style.background = '#f59e0b';
      if (Math.random() > .75) s.style.background = '#a78bfa';
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  // Scroll reveal
  const revealTargets = () => {
    document.querySelectorAll('.panel, .nx-tile, .shop-card, .shop-special-card, .nx-quickguide li').forEach((el, i) => {
      if (el.classList.contains('q-reveal')) return;
      el.classList.add('q-reveal');
      el.style.transitionDelay = (i % 8) * 40 + 'ms';
    });
  };
  const io = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }) : null;
  const observeAll = () => {
    revealTargets();
    if (!io) {
      document.querySelectorAll('.q-reveal').forEach(el => el.classList.add('is-visible'));
      return;
    }
    document.querySelectorAll('.q-reveal:not(.is-visible)').forEach(el => io.observe(el));
  };

  // Ripple en botones
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn, .nx-tile-btn, .shop-cat, .shop-sub, .shop-special-card');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const r = document.createElement('span');
    r.className = 'q-ripple';
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + 'px';
    r.style.left = (e.clientX - rect.left - size / 2) + 'px';
    r.style.top = (e.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(r);
    setTimeout(() => r.remove(), 650);
  }, true);

  // Tilt suave en tarjetas
  if (!reduce) {
    document.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.shop-card, .nx-tile');
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-y * 6).toFixed(2)}deg) rotateY(${(x * 8).toFixed(2)}deg) translateY(-4px)`;
    }, { passive: true });
    document.addEventListener('pointerleave', (e) => {
      const card = e.target.closest && e.target.closest('.shop-card, .nx-tile');
      if (card) card.style.transform = '';
    }, true);
  }

  // Count-up en stats
  const animateCount = (el) => {
    const target = parseInt((el.textContent || '').replace(/[^\d]/g, ''), 10);
    if (!Number.isFinite(target) || target < 2) return;
    const start = performance.now();
    const dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toLocaleString('es-ES');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const countIO = ('IntersectionObserver' in window) ? new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCount(e.target);
        countIO.unobserve(e.target);
      }
    });
  }, { threshold: 0.5 }) : null;

  const init = () => {
    observeAll();
    document.querySelectorAll('[data-shop-total], [data-shop-sections], [data-shop-brands], [data-stat]').forEach(el => {
      if (countIO) countIO.observe(el); else animateCount(el);
    });
    // Re-observe on view changes
    document.addEventListener('viewchange', () => {
      setTimeout(observeAll, 120);
    });
    // Mutation observer to reveal new cards
    if ('MutationObserver' in window) {
      const mo = new MutationObserver(() => {
        // throttle
        if (window.__qMoTimer) return;
        window.__qMoTimer = setTimeout(() => {
          window.__qMoTimer = null;
          observeAll();
        }, 200);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
