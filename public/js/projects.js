/* ============================================================
   projects.js — Projects section enhancements
   ------------------------------------------------------------
   Two things the stylesheet alone cannot do:

     1. Swap a screenshot that fails to load for its labelled
        placeholder. The markup always renders the placeholder
        and hides it, so a 404 or a typo in an admin-entered
        path degrades to a clean frame instead of a broken image
        icon and an empty box.

     2. Track the pointer across a panel so the hover zoom
        scales from where the cursor is, which reads as
        inspecting the screenshot rather than tilting a card.

   Both are progressive. Without this file the screenshots still
   render, still letterbox instead of cropping, and still lift on
   hover — they just zoom from the centre.
   ============================================================ */

(function () {
  'use strict';

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  /* ============================================================
     BROKEN SCREENSHOT FALLBACK
     `error` does not bubble, so it is caught on the stage in the
     capture phase. One listener covers every screenshot, including
     any added later.
     ============================================================ */
  function initFallbacks() {
    const stages = document.querySelectorAll('[data-shot]');
    if (!stages.length) return;

    stages.forEach(function (stage) {
      const shot = stage.querySelector('.work__shot');
      // Already marked server-side: no image was configured at all.
      if (!shot) { stage.classList.add('is-empty'); return; }

      function fail() {
        stage.classList.add('is-failed');
      }

      if (shot.complete) {
        // Cached before this ran: complete with no natural width means
        // the load already failed.
        if (shot.naturalWidth === 0) fail();
        return;
      }
      shot.addEventListener('error', fail);
    });
  }

  /* ============================================================
     POINTER-TRACKED ZOOM ORIGIN
     Writes --mx/--my (the panel spotlight, same custom properties
     .skill-panel uses) and --px/--py (the zoom origin) as
     percentages, coalesced into one animation frame per move.
     Touch and reduced-motion devices are skipped entirely.
     ============================================================ */
  function initPointerOrigins() {
    if (!finePointer.matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const panels = document.querySelectorAll('.work');
    if (!panels.length) return;

    panels.forEach(function (panel) {
      let queued = false;
      let x = 0;
      let y = 0;

      function paint() {
        queued = false;
        const rect = panel.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const mx = ((x - rect.left) / rect.width) * 100;
        const my = ((y - rect.top) / rect.height) * 100;
        panel.style.setProperty('--mx', mx.toFixed(2) + '%');
        panel.style.setProperty('--my', my.toFixed(2) + '%');
        panel.style.setProperty('--px', mx.toFixed(2) + '%');
        panel.style.setProperty('--py', my.toFixed(2) + '%');
      }

      panel.addEventListener('pointermove', function (event) {
        if (event.pointerType === 'touch') return;
        x = event.clientX;
        y = event.clientY;
        if (queued) return;
        queued = true;
        requestAnimationFrame(paint);
      }, { passive: true });
    });
  }

  /* Both are cosmetic. If either throws the page is unaffected. */
  function safely(name, fn) {
    try {
      fn();
    } catch (error) {
      if (window.console && window.console.error) {
        window.console.error('[projects] ' + name + ' failed to start', error);
      }
    }
  }

  safely('fallbacks', initFallbacks);
  safely('pointerOrigins', initPointerOrigins);
})();
