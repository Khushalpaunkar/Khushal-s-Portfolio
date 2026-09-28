/**
 * utils/icons.js
 *
 * Icon lookups for the view layer.
 *
 * This is presentation, not content, so it lives outside the data layer: the
 * database stores "React" and "sprout", never "fab fa-react" or "fa fa-seedling".
 * Keeping the two apart means the icon set can be changed without a data
 * migration, and a typo degrades to a neutral glyph instead of an empty box.
 */

const TECH_ICONS = {
  html: 'fab fa-html5',
  css: 'fab fa-css3-alt',
  javascript: 'fab fa-js',
  js: 'fab fa-js',
  typescript: 'fab fa-js',
  ejs: 'fa-solid fa-file-code',
  'node.js': 'fab fa-node-js',
  node: 'fab fa-node-js',
  express: 'fas fa-server',
  'express.js': 'fas fa-server',
  mongodb: 'fas fa-leaf',
  react: 'fab fa-react',
  'gemini api': 'fas fa-robot',
  'ai model api': 'fas fa-robot',
};

/* Shown in place of a screenshot while a project has none. Keyed by a
   semantic kind so the data file never holds a CSS class. */
const PLACEHOLDER_ICONS = {
  sprout: 'fas fa-seedling',
  document: 'fas fa-file-lines',
  search: 'fas fa-magnifying-glass',
  joke: 'fas fa-face-laugh',
  chart: 'fas fa-chart-line',
  code: 'fas fa-code',
};

const FALLBACK = 'fas fa-circle';
const PLACEHOLDER_FALLBACK = 'fas fa-code';

/** Icon class for a technology name, or a neutral fallback. */
function techIcon(name) {
  if (!name) return FALLBACK;
  return TECH_ICONS[String(name).trim().toLowerCase()] || FALLBACK;
}

/** Icon class for a placeholder kind, or a neutral fallback. */
function placeholderIcon(kind) {
  if (!kind) return PLACEHOLDER_FALLBACK;
  return PLACEHOLDER_ICONS[String(kind).trim().toLowerCase()] || PLACEHOLDER_FALLBACK;
}

module.exports = { techIcon, placeholderIcon, TECH_ICONS, PLACEHOLDER_ICONS };
