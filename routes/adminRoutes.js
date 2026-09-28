/**
 * routes/adminRoutes.js
 * Admin area: login, logout, protected dashboard, message inbox, and project
 * management. Every state-changing POST requires a valid CSRF token.
 */

const express = require('express');
const authController = require('../controllers/authController');
const adminController = require('../controllers/adminController');
const messageController = require('../controllers/messageController');
const projectController = require('../controllers/projectController');
const settingsController = require('../controllers/settingsController');
const loginLimiter = require('../middleware/loginLimiter');
const requireAdminCsrf = require('../middleware/adminCsrf');
const { requireAdmin, adminLocals } = require('../middleware/auth');

const router = express.Router();

router.use(adminLocals);

/* -------- Authentication -------- */
router.get('/admin', requireAdmin, adminController.dashboard);
router.get('/admin/login', authController.loginForm);
router.post('/admin/login', loginLimiter, authController.login);
router.post('/admin/logout', requireAdmin, requireAdminCsrf, authController.logout);
router.get('/admin/password', requireAdmin, authController.passwordForm);
router.post('/admin/password', requireAdmin, requireAdminCsrf, authController.changePassword);

/* -------- Site settings -------- */
router.get('/admin/settings', requireAdmin, settingsController.settingsForm);
router.post('/admin/settings', requireAdmin, requireAdminCsrf, settingsController.saveSettings);

/* -------- Inbox -------- */
router.get('/admin/messages', requireAdmin, messageController.listMessages);
router.get('/admin/messages/:id', requireAdmin, messageController.showMessage);
router.post('/admin/messages/:id/status', requireAdmin, requireAdminCsrf, messageController.setMessageStatus);
router.post('/admin/messages/:id/delete', requireAdmin, requireAdminCsrf, messageController.deleteMessage);

/* -------- Projects -------- */
router.get('/admin/projects', requireAdmin, projectController.listProjects);
router.get('/admin/projects/new', requireAdmin, (req, res) => projectController.projectForm(req, res, { editing: false }));
router.post('/admin/projects', requireAdmin, requireAdminCsrf, (req, res) => projectController.saveProject(req, res, { editing: false }));
router.get('/admin/projects/:id/edit', requireAdmin, (req, res) => projectController.projectForm(req, res, { editing: true }));
router.post('/admin/projects/:id/edit', requireAdmin, requireAdminCsrf, (req, res) => projectController.saveProject(req, res, { editing: true }));
router.post('/admin/projects/:id/delete', requireAdmin, requireAdminCsrf, projectController.deleteProject);

module.exports = router;