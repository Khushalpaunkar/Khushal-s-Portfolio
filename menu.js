/* ============================================================
   menu.js — Hamburger menu fix
   ============================================================ */

const menuBtn  = document.getElementById("menu-btn");
const navul    = document.getElementById("navul");
const menuNavLinks = document.querySelectorAll(".navlist a");  // renamed to avoid conflict with app.js

// Toggle open/close
menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = navul.classList.toggle("active");
  menuBtn.classList.toggle("open", isOpen);
  menuBtn.setAttribute("aria-expanded", String(isOpen));
});

// Close when a nav link is clicked (mobile)
menuNavLinks.forEach(link => {
  link.addEventListener("click", () => {
    navul.classList.remove("active");
    menuBtn.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  });
});

// Close when tapping outside the menu
document.addEventListener("click", (e) => {
  if (!navul.contains(e.target) && !menuBtn.contains(e.target)) {
    navul.classList.remove("active");
    menuBtn.classList.remove("open");
    menuBtn.setAttribute("aria-expanded", "false");
  }
});
