/* ============================================================
   navigation.js — Navbar behaviour
   - Mobile sheet open / close (button, outside click, Escape, link click)
   - Active section highlighting on scroll
   - Sliding pill indicator behind the active link
   ============================================================ */

(function () {
  'use strict';

  const nav = document.getElementById('nav');
  const menu = document.getElementById('navul');
  const burger = document.getElementById('menu-btn');
  const indicator = document.getElementById('nav-indicator');
  const links = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  const desktop = window.matchMedia('(min-width: 901px)');

  /* ---------- Mobile sheet ---------- */
  function setMenu(open) {
    if (!menu || !burger) return;
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  }

  function isMenuOpen() {
    return menu && menu.classList.contains('is-open');
  }

  if (burger) {
    burger.addEventListener('click', function (event) {
      event.stopPropagation();
      setMenu(!isMenuOpen());
    });
  }

  // Close after choosing a destination.
  links.forEach(function (link) {
    link.addEventListener('click', function () {
      setMenu(false);
    });
  });

  // Close when tapping outside the sheet or the button.
  document.addEventListener('click', function (event) {
    if (!isMenuOpen()) return;
    if (menu.contains(event.target) || burger.contains(event.target)) return;
    setMenu(false);
  });

  // Close on Escape and return focus to the button.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !isMenuOpen()) return;
    setMenu(false);
    burger.focus();
  });

  // Returning to desktop width must not leave a locked body behind.
  desktop.addEventListener('change', function (event) {
    if (event.matches) setMenu(false);
    moveIndicator(activeLink);
  });

  /* ---------- Sliding indicator ---------- */
  let activeLink = null;

  function moveIndicator(link) {
    if (!indicator || !menu || !link) return;

    // The pill has no meaning once the links are stacked vertically.
    if (!desktop.matches) {
      indicator.classList.remove('is-on');
      return;
    }

    const menuRect = menu.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();

    indicator.style.width = linkRect.width + 'px';
    indicator.style.height = linkRect.height + 'px';
    indicator.style.transform = 'translateX(' + (linkRect.left - menuRect.left) + 'px)';
    indicator.style.top = linkRect.top - menuRect.top + 'px';
    indicator.classList.add('is-on');
  }

  function setActive(link) {
    if (link === activeLink) return;

    links.forEach(function (item) {
      item.classList.remove('is-active');
      if (link) item.setAttribute('aria-current', 'true');
      else item.removeAttribute('aria-current');
    });

    if (link) link.classList.add('is-active');
    activeLink = link;
    moveIndicator(link);
  }

  /* ---------- Active section on scroll ---------- */
  const sections = links
    .map(function (link) {
      const id = link.getAttribute('href');
      if (!id || id.charAt(0) !== '#') return null;
      const section = document.querySelector(id);
      return section ? { link: link, section: section } : null;
    })
    .filter(Boolean);

  function updateActive() {
    if (!sections.length) return;

    // Contact is the last section: treat the bottom of the page as "contact".
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80) {
      setActive(sections[sections.length - 1].link);
      return;
    }

    const marker = window.scrollY + window.innerHeight * 0.4;
    let current = null;

    for (let i = 0; i < sections.length; i++) {
      if (marker >= sections[i].section.offsetTop) current = sections[i];
    }

    setActive(current ? current.link : null);
  }

  window.addEventListener('scroll', updateActive, { passive: true });
  window.addEventListener('resize', function () {
    moveIndicator(activeLink);
  });

  // Web fonts or a late layout shift can move the pill after first paint.
  window.addEventListener('load', function () {
    updateActive();
    moveIndicator(activeLink);
  });

  updateActive();
})();
