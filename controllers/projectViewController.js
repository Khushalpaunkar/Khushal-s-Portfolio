const projectService = require('../services/projectService');
const { techIcon, placeholderIcon } = require('../utils/icons');

/**
 * controllers/projectViewController.js
 * Public single-project page (GET /projects/:slug).
 *
 * The detail page gives every project a permalink, a canonical URL, and a
 * long-form surface for the write-up the admin edits — while cards stay as
 * the index view. Unknown slugs get the site's standard 404 view.
 */
module.exports = async function projectViewController(req, res, next) {
  try {
    const project = await projectService.getBySlug(req.params.slug);

    if (!project) {
      return res.status(404).render('404', {
        title: '404 — Page Not Found',
        attemptedPath: req.originalUrl,
      });
    }

    const siteUrl = process.env.SITE_URL || '';

    // Canonical + Open Graph tags only become meaningful once a real domain is
    // configured; nothing is guessed until then (same rule as head.ejs).
    res.render('project', {
      title: project.title,
      siteUrl,
      project,
      pageUrl: `projects/${project.slug}`,
      pageDescription: project.shortDescription || [project.problem, project.solution].filter(Boolean).join(' '),
      pageImage: project.image || "",
      techIcon,
      placeholderIcon,
    });
  } catch (error) {
    next(error);
  }
};