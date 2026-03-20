/* ============================================================
   app.js — Full feature set:
   - Real typewriter animation (type + erase char by char)
   - Dark / Light mode toggle (persists via localStorage)
   - Scroll progress bar
   - Back-to-top button
   - Active nav highlight on scroll
   - Scroll reveal: skill boxes & edu items
   ============================================================ */


// ═══════════════════════════════════════════════════════════
//  TYPEWRITER ANIMATION
// ═══════════════════════════════════════════════════════════
const roles = [
  "Web Developer",
  "Programmer",
  "Data Analytics Enthusiast",
  "B.Tech CSE Student"
];

const roleEl  = document.getElementById("role");

let roleIndex  = 0;
let charIndex  = 0;
let isDeleting = false;

const TYPE_SPEED   = 80;
const DELETE_SPEED = 45;
const PAUSE_END    = 1800;
const PAUSE_START  = 400;

function typeWriter() {
  const currentRole = roles[roleIndex];

  if (!isDeleting) {
    roleEl.textContent = currentRole.slice(0, charIndex + 1);
    charIndex++;
    if (charIndex === currentRole.length) {
      isDeleting = true;
      setTimeout(typeWriter, PAUSE_END);
      return;
    }
    setTimeout(typeWriter, TYPE_SPEED);
  } else {
    roleEl.textContent = currentRole.slice(0, charIndex - 1);
    charIndex--;
    if (charIndex === 0) {
      isDeleting = false;
      roleIndex  = (roleIndex + 1) % roles.length;
      setTimeout(typeWriter, PAUSE_START);
      return;
    }
    setTimeout(typeWriter, DELETE_SPEED);
  }
}

setTimeout(typeWriter, 800);







// ═══════════════════════════════════════════════════════════
//  SCROLL PROGRESS BAR
// ═══════════════════════════════════════════════════════════
const progressBar = document.getElementById("scroll-progress");

function updateScrollProgress() {
  const docHeight = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = (docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0) + "%";
}


// ═══════════════════════════════════════════════════════════
//  BACK TO TOP
// ═══════════════════════════════════════════════════════════
const backBtn = document.getElementById("back-to-top");

function handleBackToTop() {
  backBtn.classList.toggle("visible", window.scrollY > 400);
}

backBtn.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});


// ═══════════════════════════════════════════════════════════
//  ACTIVE NAV ON SCROLL
// ═══════════════════════════════════════════════════════════
const sections = document.querySelectorAll("section[id]");
const navLinks = document.querySelectorAll(".navlist a.nav-link");

function updateActiveNav() {
  const mid = window.scrollY + window.innerHeight * 0.45;
  sections.forEach(section => {
    if (mid >= section.offsetTop && mid < section.offsetTop + section.offsetHeight) {
      navLinks.forEach(a => a.classList.remove("active"));
      const match = document.querySelector(`.navlist a[href="#${section.id}"]`);
      if (match) match.classList.add("active");
    }
  });
}


// ═══════════════════════════════════════════════════════════
//  COMBINED SCROLL LISTENER
// ═══════════════════════════════════════════════════════════
window.addEventListener("scroll", () => {
  updateScrollProgress();
  handleBackToTop();
  updateActiveNav();
}, { passive: true });

updateActiveNav();


// ═══════════════════════════════════════════════════════════
//  SKILL BOX SCROLL REVEAL
// ═══════════════════════════════════════════════════════════
const skillBoxes = document.querySelectorAll(".skill_box");

const skillObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("active");
      skillObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.18 });

skillBoxes.forEach((box, i) => {
  box.classList.add("scroll-reveal");
  box.style.transitionDelay = `${i * 0.12}s`;
  skillObserver.observe(box);
});


// ═══════════════════════════════════════════════════════════
//  EDUCATION ITEM SCROLL REVEAL
// ═══════════════════════════════════════════════════════════
const eduItems = document.querySelectorAll(".edu-item");

const eduObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("show");
      eduObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.22 });

eduItems.forEach(item => eduObserver.observe(item));
