/* ============================================================
   contact.js — Contact form
   - Inline validation wired to aria-invalid / aria-describedby
   - POSTs to /api/contact (Express + MongoDB, Phase 7)
   - Renders server validation errors into the same fields, so the
     client and the server speak one language.

   The origin check runs server-side; this file only sends the form the
   visitor filled in, including the empty honeypot.
   ============================================================ */

(function () {
  'use strict';

  const form = document.getElementById('contact-form');
  const toastEl = document.getElementById('toast');

  if (!form) return;

  const submitBtn = document.getElementById('cf-submit');
  const statusEl = document.getElementById('cf-status');

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- Toast ---------- */
  let toastTimer = null;

  function showToast(message, type) {
    if (!toastEl) return;

    clearTimeout(toastTimer);
    toastEl.className = 'toast';
    toastEl.innerHTML = '';

    const icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    icon.className = type === 'ok' ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation';
    toastEl.appendChild(icon);

    const text = document.createElement('span');
    text.textContent = message;
    toastEl.appendChild(text);

    // Force a reflow so the class change always triggers a transition.
    void toastEl.offsetWidth;
    toastEl.classList.add('is-on', type === 'ok' ? 'toast--ok' : 'toast--err');

    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-on');
    }, 4500);
  }

  /* ---------- Field validation ---------- */
  const fields = [
    {
      input: document.getElementById('cf-name'),
      error: document.getElementById('cf-name-err'),
      test: function (value) {
        if (value.length < 2) return 'Please enter at least 2 characters.';
        return '';
      },
    },
    {
      input: document.getElementById('cf-email'),
      error: document.getElementById('cf-email-err'),
      test: function (value) {
        if (!EMAIL_PATTERN.test(value)) return 'Please enter a valid email address.';
        return '';
      },
    },
    {
      input: document.getElementById('cf-message'),
      error: document.getElementById('cf-message-err'),
      test: function (value) {
        if (value.length < 10) return 'Message must be at least 10 characters.';
        return '';
      },
    },
  ];

  function showFieldError(field, message) {
    if (!field.error) return;
    field.error.textContent = message;
    field.error.classList.add('is-on');
    if (field.input) field.input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(field) {
    if (!field.error) return;
    field.error.textContent = '';
    field.error.classList.remove('is-on');
    if (field.input) field.input.removeAttribute('aria-invalid');
  }

  // Clear a field's error as soon as the visitor starts fixing it.
  fields.forEach(function (field) {
    if (!field.input) return;
    field.input.addEventListener('input', function () {
      if (field.input.getAttribute('aria-invalid') === 'true') {
        const message = field.test(field.input.value.trim());
        if (!message) clearFieldError(field);
      }
    });
  });

  function setStatus(message, ok) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'form__status is-on ' + (ok ? 'form__status--ok' : 'form__status--err');
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.textContent = '';
    statusEl.className = 'form__status';
  }

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    submitBtn.style.opacity = loading ? '0.65' : '1';
    submitBtn.innerHTML = loading
      ? '<i class="fas fa-circle-notch fa-spin"></i> Sending'
      : '<i class="fas fa-paper-plane"></i> Send Message';
  }

  /* Renders a server-side { fieldName: message } map into the same fields.
     Subject has no inline error slot, so a subject complaint lands up top. */
  function applyServerErrors(errors) {
    const byId = {
      name: 'cf-name-err',
      email: 'cf-email-err',
      message: 'cf-message-err',
    };

    let firstInvalid = null;
    Object.keys(errors || {}).forEach(function (key) {
      const target = byId[key];

      if (target) {
        const field = fields.find(function (f) {
          return f.error && f.error.id === target;
        });
        if (field) {
          showFieldError(field, errors[key]);
          if (!firstInvalid) firstInvalid = field;
          return;
        }
      }

      // No slot for this key — surface it as the status message.
      if (!firstInvalid) setStatus(errors[key], false);
    });

    if (firstInvalid) firstInvalid.input.focus();
  }

  function showTransportError(message) {
    setStatus(message, false);
    showToast(message, 'err');
  }

  /* ---------- Submit ---------- */
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    let firstInvalid = null;

    fields.forEach(function (field) {
      if (!field.input) return;
      const value = field.input.value.trim();
      const message = field.test(value);

      if (message) {
        showFieldError(field, message);
        if (!firstInvalid) firstInvalid = field.input;
      } else {
        clearFieldError(field);
      }
    });

    if (firstInvalid) {
      setStatus('Please fix the highlighted fields.', false);
      firstInvalid.focus();
      return;
    }

    clearStatus();
    setLoading(true);

    const payload = {
      name: document.getElementById('cf-name').value.trim(),
      email: document.getElementById('cf-email').value.trim(),
      subject: document.getElementById('cf-subject').value.trim(),
      message: document.getElementById('cf-message').value.trim(),
      // Honeypot — normally empty. Sent so the server can recognise a bot.
      website: document.getElementById('cf-website').value.trim(),
    };

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (response) {
        return response.json().catch(function () {
          // Non-JSON body (e.g. a proxy error page). Preserve the status.
          return { ok: false, message: 'Unexpected server response.' };
        }).then(function (data) {
          return { status: response.status, ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.data.ok) {
          form.reset();
          clearStatus();
          showToast(result.data.message || 'Message sent successfully.', 'ok');
          return;
        }

        if (result.status === 400 && result.data.errors) {
          const first = result.data.errors.name || result.data.errors.email || result.data.errors.message;
          applyServerErrors(result.data.errors);
          setStatus(first || result.data.message, false);
          return;
        }

        const messages = {
          413: 'Message is too long. Please shorten it and try again.',
          429: 'Too many messages. Please wait a few minutes and try again.',
          503: 'The message service is offline right now. Please try again later.',
          403: 'Request origin was rejected.',
        };

        showTransportError(messages[result.status] || result.data.message || 'Could not send your message.');
      })
      .catch(function () {
        showTransportError('Could not reach the server. Check your connection and try again.');
      })
      .finally(function () {
        setLoading(false);
      });
  });
})();