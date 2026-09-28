/* ============================================================
   theme.js — Light / dark toggle
   ============================================================
   The initial theme is applied by an inline script in head.ejs so it
   is on <html> before first paint (no flash). This file only owns
   the toggle button and persistence.
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY = 'theme';
  const root = document.documentElement;
  const toggle = document.getElementById('theme-toggle');

  if (!toggle) return;

  const ICONS = {
    dark: 'fa-moon',
    light: 'fa-sun',
  };
  const LABELS = {
    dark: 'Switch to light theme',
    light: 'Switch to dark theme',
  };

  function currentTheme() {
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  /** Paints the button to match the theme that is currently active. */
  function paintToggle() {
    const theme = currentTheme();
    const icon = toggle.querySelector('i');

    if (icon) {
      // Swapping the class list avoids leaving both glyphs in the DOM.
      icon.classList.remove('fa-moon', 'fa-sun');
      icon.classList.add('fas', ICONS[theme]);
    }

    toggle.setAttribute('aria-label', LABELS[theme]);
    toggle.setAttribute('title', LABELS[theme]);
    toggle.setAttribute('aria-pressed', String(theme === 'light'));
  }

  toggle.addEventListener('click', function () {
    const next = currentTheme() === 'light' ? 'dark' : 'light';

    root.setAttribute('data-theme', next);

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (error) {
      // Private browsing can block storage; the theme still applies for this page.
    }

    paintToggle();
    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });

  // Follow the OS setting only while the visitor has not chosen for themselves.
  const scheme = window.matchMedia('(prefers-color-scheme: light)');

  scheme.addEventListener('change', function (event) {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      /* storage unavailable */
    }

    if (stored) return;

    const next = event.matches ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    paintToggle();
  });

  paintToggle();
})();
