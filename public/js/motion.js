/* ============================================================
   motion.js — Phase 5 background & motion
   - Scroll reveal for [data-reveal]
   - Pointer-follow glow
   - Particle field on <canvas>

   Design rules for this file:
   * Never hide content as a side effect of JS. Reveal styles are gated
     behind `html.js`, which is set in the inline head script and only
     when IntersectionObserver exists, so a failure here cannot leave
     the page blank.
   * Only transform/opacity-style properties are touched, never layout
     properties, so scrolling stays cheap.
   * Every animation loop stops when it is not needed: reduced motion,
     a hidden tab, or a coarse pointer.
   ============================================================ */

(function () {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ============================================================
     SCROLL REVEAL
     ============================================================ */
  function initReveal() {
    const items = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!items.length) return;

    // With reduced motion the CSS already forces these visible; adding
    // the class keeps the DOM honest for anything that inspects it.
    if (reduceMotion.matches || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }

    /* Siblings that reveal together are offset slightly so a grid
       cascades instead of appearing in one block. */
    function staggerFor(el) {
      const parent = el.parentElement;
      if (!parent) return 0;

      const pending = Array.prototype.slice.call(parent.children).filter(function (child) {
        return child.hasAttribute('data-reveal') && !child.classList.contains('is-in');
      });

      // Cap the ramp: a long list should not take seconds to finish.
      return Math.min(pending.indexOf(el), 5) * 70;
    }

    const observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;

        const el = entry.target;
        el.style.setProperty('--reveal-delay', staggerFor(el) + 'ms');
        el.classList.add('is-in');

        // Observed once: scrolling back up must not replay the animation.
        observer.unobserve(el);
      });
    }, {
      threshold: 0.12,
      // Start the reveal slightly before the element reaches the fold.
      rootMargin: '0px 0px -8% 0px',
    });

    items.forEach(function (el) { observer.observe(el); });

    // A late layout shift (web font swap) can leave a revealed element
    // mis-measured; recompute once everything has settled.
    window.addEventListener('load', function () {
      items.forEach(function (el) {
        if (el.classList.contains('is-in')) el.style.removeProperty('--reveal-delay');
      });
    });
  }

  /* ============================================================
     POINTER GLOW
     ============================================================ */
  function initGlow() {
    const glow = document.getElementById('bg-glow');
    if (!glow || !finePointer.matches || reduceMotion.matches) return;

    let queued = false;
    let x = 0;
    let y = 0;

    function paint() {
      queued = false;
      glow.style.setProperty('--gx', x + 'px');
      glow.style.setProperty('--gy', y + 'px');
    }

    window.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;

      x = event.clientX;
      y = event.clientY;
      glow.classList.add('is-on');

      if (queued) return;
      queued = true;
      requestAnimationFrame(paint);
    }, { passive: true });

    glow.style.setProperty('--gx', window.innerWidth / 2 + 'px');
    glow.style.setProperty('--gy', window.innerHeight / 2 + 'px');
  }

  /* ============================================================
     PARTICLE FIELD
     ============================================================ */
  function initParticles() {
    const canvas = document.getElementById('bg-particles');
    if (!canvas || !canvas.getContext) return;

    // Nothing to gain from animating for someone who asked us not to,
    // or on hardware that is already struggling.
    if (reduceMotion.matches) return;
    if (navigator.connection && navigator.connection.saveData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* Density scales with area but is capped, and drops on small
       screens where the effect is barely visible anyway. */
    function targetCount() {
      const area = window.innerWidth * window.innerHeight;
      const base = Math.round(area / 26000);
      return Math.max(18, Math.min(70, window.innerWidth < 640 ? base * 0.5 : base));
    }

    const LINK_DISTANCE = 132;
    let particles = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = false;

    function readThemeColors() {
      const styles = getComputedStyle(root);
      return {
        // --accent is the brand orange; the cyan accent reads as a cool
        // counterpoint, so the field is not monochrome.
        dot: styles.getPropertyValue('--accent').trim() || '#ff8a00',
        cool: styles.getPropertyValue('--accent-3').trim() || '#38bdf8',
      };
    }

    let colors = readThemeColors();

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Cap the device pixel ratio: a 3x buffer costs 9x the fill rate for
      // no visible gain on soft blurred dots.
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      seed();
    }

    function seed() {
      const count = targetCount();
      particles = [];
      for (let i = 0; i < count; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.16,
          vy: (Math.random() - 0.5) * 0.16,
          r: 0.7 + Math.random() * 1.7,
          // Roughly a third of the field uses the cool accent.
          cool: Math.random() < 0.34,
        });
      }
    }

    function step() {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        // Wrap rather than bounce: bouncing makes particles clump.
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
      }

      // Faint links between near neighbours. This is the only O(n^2) work
      // in the file, and it is bounded by the particle cap above.
      ctx.lineWidth = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const sq = dx * dx + dy * dy;
          if (sq > LINK_DISTANCE * LINK_DISTANCE) continue;

          // Fade with distance so links appear and dissolve smoothly.
          ctx.globalAlpha = 0.13 * (1 - Math.sqrt(sq) / LINK_DISTANCE);
          ctx.strokeStyle = colors.cool;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = p.cool ? colors.cool : colors.dot;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(step);
    }

    function start() {
      if (running || reduceMotion.matches) return;
      running = true;
      frame = requestAnimationFrame(step);
    }

    function stop() {
      running = false;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }

    // Repaint on resize, debounced, because resizing re-seeds everything.
    let resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 180);
    });

    // Repaint in the new theme, otherwise the dots keep the old accent.
    root.addEventListener('themechange', function () {
      colors = readThemeColors();
    });

    // A background tab does not need a running animation.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });

    // Respect a mid-session change to the motion preference.
    const onMotionChange = function () {
      if (reduceMotion.matches) stop();
    };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onMotionChange);

    resize();
    start();
  }

  /* ============================================================
     FAILSAFES
     `html.js` is set in the head, before this file runs. If anything
     below threw, the reveal rules would stay applied with nothing left
     to undo them, and 16 elements would sit at opacity 0. So every
     section is isolated, and any failure reveals the page immediately.
     ============================================================ */
  function revealAll() {
    Array.prototype.slice.call(document.querySelectorAll('[data-reveal]')).forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  function safely(name, fn) {
    try {
      fn();
    } catch (error) {
      if (window.console && window.console.error) {
        window.console.error('[motion] ' + name + ' failed to start', error);
      }
      revealAll();
    }
  }

  /* ============================================================ */
  safely('reveal', initReveal);
  safely('glow', initGlow);
  safely('particles', initParticles);

  /* Last line of defence. The observer should have revealed anything
     already on screen by the time the page settles. If something is
     still hidden and is genuinely in view, show it rather than trust
     the observer. */
  function revealStragglers() {
    Array.prototype.slice.call(document.querySelectorAll('[data-reveal]:not(.is-in)')).forEach(function (el) {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) el.classList.add('is-in');
    });
  }

  window.addEventListener('load', revealStragglers);
  setTimeout(revealStragglers, 2500);
})();
