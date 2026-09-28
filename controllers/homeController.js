const { getProjects } = require('../services/projectService');
const { techIcon, placeholderIcon } = require('../utils/icons');

/**
 * GET /
 *
 * Express 5 forwards rejected promises to the error middleware, so an async
 * handler needs no try/catch wrapper.
 */
module.exports = async function homeController(req, res, next) {
  try {
    const projects = await getProjects();

    res.render('index', {
      title: "Khushal's Portfolio",
      // Empty until a real domain is configured; head.ejs omits absolute
      // URLs rather than guessing one.
      siteUrl: process.env.SITE_URL || '',
      projects,
      // Passed in so the templates never reach into utils/ directly.
      techIcon,
      placeholderIcon,
    });
  } catch (error) {
    next(error);
  }
};
