/**
 * routes/indexRoutes.js
 * Public page routes.
 */

const express = require('express');
const homeController = require('../controllers/homeController');
const projectViewController = require('../controllers/projectViewController');

const router = express.Router();

router.get('/', homeController);
router.get('/projects/:slug', projectViewController);

module.exports = router;
