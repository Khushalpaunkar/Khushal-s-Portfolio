/* ============================================================
   main.js — Page behaviour
   - Typewriter role animation
   - Scroll progress bar
   - Back-to-top button

   Scroll-driven section reveal is added in Phase 5. Until then
   `data-reveal` elements render normally, so nothing depends on JS
   to become visible.
   ============================================================ */

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ============================================================
     TYPEWRITER
     ============================================================ */
  const roleEl = document.getElementById('role');

  if (roleEl) {
    const roles = [
      'Full-Stack Developer',
      'AI Builder',
      'Problem Solver',
      'CSE Student',
    ];

    // With reduced motion there is no animation, so show a single role.
    if (prefersReducedMotion.matches) {
      roleEl.textContent = roles[0];
    } else {
      let roleIndex = 0;
      let charIndex = 0;
      let isDeleting = false;

      const TYPE_SPEED = 75;
      const DELETE_SPEED = 40;
      const PAUSE_END = 1700;
      const PAUSE_START = 400;

      function type() {
        const current = roles[roleIndex];

        if (!isDeleting) {
          roleEl.textContent = current.slice(0, charIndex + 1);
          charIndex += 1;

          if (charIndex === current.length) {
            isDeleting = true;
            setTimeout(type, PAUSE_END);
            return;
          }
          setTimeout(type, TYPE_SPEED);
          return;
        }

        roleEl.textContent = current.slice(0, charIndex - 1);
        charIndex -= 1;

        if (charIndex === 0) {
          isDeleting = false;
          roleIndex = (roleIndex + 1) % roles.length;
          setTimeout(type, PAUSE_START);
          return;
        }
        setTimeout(type, DELETE_SPEED);
      }

      setTimeout(type, 700);
    }
  }

  /* ============================================================
     SCROLL PROGRESS + BACK TO TOP
     One passive listener drives both.
     ============================================================ */
  const progressBar = document.getElementById('scroll-progress');
  const backBtn = document.getElementById('back-to-top');

  let ticking = false;

  function onScrollFrame() {
    const scrollTop = window.scrollY;
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;

    if (progressBar) {
      const ratio = scrollable > 0 ? scrollTop / scrollable : 0;
      progressBar.style.width = Math.min(100, Math.max(0, ratio * 100)).toFixed(2) + '%';
    }

    if (backBtn) {
      backBtn.classList.toggle('is-visible', scrollTop > 420);
    }

    ticking = false;
  }

  window.addEventListener(
    'scroll',
    function () {
      // rAF-throttled: one update per frame no matter how fast the user scrolls.
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(onScrollFrame);
    },
    { passive: true }
  );

  if (backBtn) {
    backBtn.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
    });
  }

  onScrollFrame();
})();
