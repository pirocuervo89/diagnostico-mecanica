(function () {
  'use strict';

  // Orbes de luz ambiente
  function orbs() {
    if (document.querySelector('.aurora-orb')) return;
    const wrap = document.createElement('div');
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = '<div class="aurora-orb o1"></div><div class="aurora-orb o2"></div><div class="aurora-orb o3"></div>';
    document.body.appendChild(wrap);
  }

  // Reveal con stagger
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    const scan = () => {
      document.querySelectorAll('.panel, .nx-tile, .shop-card, .tp-card, .lm-product, .product, .shop-special-card, .home-scanner, .shop-how, .stage-card, .tuning-card, header.page-head, .shop-hero')
        .forEach((el, i) => {
          if (!el.classList.contains('reveal')) {
            el.classList.add('reveal');
            el.style.transitionDelay = (i % 8) * 45 + 'ms';
            io.observe(el);
          }
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
    else scan();
    setTimeout(() => document.querySelectorAll('.reveal').forEach((el) => el.classList.add('in')), 1800);
    document.addEventListener('viewchange', () => setTimeout(scan, 90));
  }

  // Tilt 3D suave en tarjetas
  const TILT = '.shop-card, .tp-card, .lm-product, .product, .nx-tile, .shop-special-card';
  document.addEventListener('pointermove', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(TILT) : null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${(px * 8).toFixed(2)}deg) rotateX(${(-py * 8).toFixed(2)}deg) translateY(-4px)`;
  }, { passive: true });
  document.addEventListener('pointerleave', (e) => {
    const el = e.target && e.target.closest ? e.target.closest(TILT) : null;
    if (el) el.style.transform = '';
  }, true);

  // Contadores animados
  function animateNumber(el, target) {
    if (!el || el.dataset.auroraCounted) return;
    el.dataset.auroraCounted = '1';
    const start = 0;
    const dur = 1200;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(start + (target - start) * eased);
      el.textContent = val.toLocaleString('es-ES');
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function scanCounters() {
    document.querySelectorAll('[data-stat], [data-shop-total], [data-shop-sections], [data-shop-brands]').forEach((el) => {
      const raw = el.textContent.replace(/[^\d]/g, '');
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0 && n < 1000000) {
        const io2 = new IntersectionObserver((entries) => {
          entries.forEach((en) => {
            if (en.isIntersecting) { animateNumber(en.target, n); io2.unobserve(en.target); }
          });
        }, { threshold: 0.4 });
        io2.observe(el);
      }
    });
  }

  // Ripple en botones
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('.btn, .shop-cat, .shop-sub, .tp-tab, .chip') : null;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'aurora-ripple';
    ripple.style.left = (e.clientX - r.left) + 'px';
    ripple.style.top = (e.clientY - r.top) + 'px';
    btn.style.position = btn.style.position || 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 650);
  });

  function init() {
    orbs();
    scanCounters();
    document.addEventListener('viewchange', () => setTimeout(scanCounters, 120));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
