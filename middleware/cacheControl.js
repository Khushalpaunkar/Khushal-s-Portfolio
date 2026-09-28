/**
 * middleware/cacheControl.js
 * Explicit caching policy for dynamic responses.
 *
 * Static assets already receive their long `Cache-Control` from
 * express.static, so anything that still lacks a header by the time this runs
 * is a dynamic response. HTML/XML/text pages must revalidate (`no-cache`);
 * the admin area, the health probe and the API must never be cached at all
 * (session state + live system data).
 */

function cacheControl(req, res, next) {
  if (res.get('Cache-Control')) return next();

  const path = req.path;
  if (path === '/health' || path.startsWith('/admin') || path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'no-cache');
  }

  next();
}

module.exports = cacheControl;