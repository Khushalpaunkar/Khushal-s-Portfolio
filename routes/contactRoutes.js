/**
 * routes/contactRoutes.js
 * Contact form API.
 */

const express = require('express');
const contactController = require('../controllers/contactController');
const contactLimiter = require('../middleware/contactLimiter');

const router = express.Router();

// The limiter is scoped to this single route, so it cannot affect page loads
// or the static assets a visitor downloads.
router.post('/api/contact', contactLimiter, contactController);

module.exports = router;