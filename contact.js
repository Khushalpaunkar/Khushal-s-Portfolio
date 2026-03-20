/* ============================================================
   contact.js — EmailJS with toast, loading state, validation
   NOTE: emailjs.init() is called here ONLY.
         Do NOT call it again anywhere else.
   ============================================================ */

window.addEventListener("load", function () {

  // ── Step 1: Initialize EmailJS ───────────────────────────
  emailjs.init("wejabhZ0rZKAtBPaX");

  // ── Step 2: Toast helper ─────────────────────────────────
  function showToast(message, type = "success") {
    const existing = document.getElementById("email-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "email-toast";
    toast.textContent = message;

    Object.assign(toast.style, {
      position:     "fixed",
      bottom:       "30px",
      left:         "50%",
      transform:    "translateX(-50%) translateY(20px)",
      background:   type === "success" ? "#ff8a00" : "#e63946",
      color:        type === "success" ? "#1a1a1a" : "#fff",
      padding:      "14px 28px",
      borderRadius: "12px",
      fontFamily:   "'Segoe UI', sans-serif",
      fontWeight:   "600",
      fontSize:     "15px",
      boxShadow:    "0 8px 30px rgba(0,0,0,0.35)",
      zIndex:       "9999",
      opacity:      "0",
      transition:   "all 0.4s ease",
      whiteSpace:   "nowrap",
    });

    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        toast.style.opacity   = "1";
        toast.style.transform = "translateX(-50%) translateY(0)";
      });
    });

    setTimeout(() => {
      toast.style.opacity   = "0";
      toast.style.transform = "translateX(-50%) translateY(20px)";
      setTimeout(() => toast.remove(), 400);
    }, 4000);
  }

  // ── Step 3: Form submission ──────────────────────────────
  const form     = document.getElementById("contact-form");
  const sendBtn  = form.querySelector(".send-btn");
  const btnLabel = form.querySelector(".btn-label");

  form.addEventListener("submit", function (e) {
    e.preventDefault();

    const name    = form.user_name?.value.trim();
    const email   = form.user_email?.value.trim();
    const message = form.user_message?.value.trim();

    if (!name) {
      showToast("⚠️ Please enter your name.", "error");
      return;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast("⚠️ Please enter a valid email address.", "error");
      return;
    }
    if (!message) {
      showToast("⚠️ Message cannot be empty.", "error");
      return;
    }

    sendBtn.disabled      = true;
    btnLabel.textContent  = "Sending...";
    sendBtn.style.opacity = "0.7";

    emailjs.sendForm(
      "service_70tx1p9",
      "template_h7d8fgl",
      form
    )
    .then(() => { 
      showToast("🚀 Message sent successfully!");
      form.reset();
    })
    .catch((error) => {
      console.error("EmailJS Error:", error);
      let msg = "❌ Failed to send. Please try again.";
      if (error?.status === 400) msg = "❌ Invalid template or form fields.";
      if (error?.status === 401) msg = "❌ Invalid Public Key.";
      if (error?.status === 403) msg = "❌ Service blocked. Check allowed origins.";
      if (error?.status === 404) msg = "❌ Service ID or Template ID not found.";
      if (error?.status === 422) msg = "❌ Template variables don't match form fields.";
      if (error?.text)            msg = `❌ EmailJS: ${error.text}`;
      showToast(msg, "error");
    })
    .finally(() => {
      sendBtn.disabled      = false;
      btnLabel.textContent  = "Send Message ➜";
      sendBtn.style.opacity = "1";
    });
  });

});
