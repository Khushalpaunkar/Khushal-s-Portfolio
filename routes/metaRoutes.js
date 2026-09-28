/**
 * routes/metaRoutes.js
 * robots.txt and sitemap.xml.
 *
 * The <Sitemap:> line and the sitemap itself are only emitted once a real
 * domain exists. Until then SITE_URL is blank, so robots.txt ships without a
 * sitemap reference and /sitemap.xml is deliberately a 404 — an empty sitemap
 * would be worse than none. No URL is ever guessed.
 */

const express = require('express');
const router = express.Router();

const siteUrl = () => String(process.env.SITE_URL || '').trim().replace(/\/+$/, '');

router.get('/robots.txt', (req, res) => {
  const url = siteUrl();
  const lines = ['User-agent: *', 'Allow: /'];
  if (url) lines.push(`Sitemap: ${url}/sitemap.xml`);
  lines.push(''); // trailing newline
  res.type('text/plain').send(lines.join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const url = siteUrl();
  if (!url) {
    return res.status(404).type('text/plain').send('Sitemap is not configured (SITE_URL is unset).');
  }

  const urls = ['/'];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map((u) => `  <url><loc>${url}${u}</loc></url>`)
      .join('\n') +
    '\n</urlset>\n';

  res.type('application/xml').send(xml);
});

module.exports = router;