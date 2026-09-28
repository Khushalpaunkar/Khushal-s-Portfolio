/**
 * utils/validation.js
 * Small shared validation helpers.
 */

/** Shapes a Mongoose ValidationError into a per-field errors map. */
function mapValidationErrors(error) {
  const errors = {};
  for (const key of Object.keys(error.errors || {})) {
    errors[key] = error.errors[key].message;
  }
  return errors;
}

/** Trims to a plain string ('' when not one). */
function stringField(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** True when a plain string is non-empty after trimming. */
function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { mapValidationErrors, stringField, hasText };