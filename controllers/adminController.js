/**
 * controllers/adminController.js
 * The protected admin landing page.
 *
 * Phase 8 added authentication; Phase 9 added the inbox and project editor.
 * The dashboard now hands off to those sections with counts per message
 * status (guarded by isDbReady — “—” when MongoDB is offline) and the five
 * most recent messages so an admin sees at a glance what needs attention.
 */

const Contact = require('../models/Contact');
const Project = require('../models/Project');
const db = require('../config/db');

const STATUSES = ['new', 'read', 'archived'];

async function dashboard(req, res) {
  const stats = { messages: null, newMessages: null, read: null, archived: null, projects: null };
  let recent = [];

  if (db.isDbReady()) {
    try {
      const [messages, newMessages, read, archived, projects, docs] = await Promise.all([
        Contact.countDocuments(),
        Contact.countDocuments({ status: 'new' }),
        Contact.countDocuments({ status: 'read' }),
        Contact.countDocuments({ status: 'archived' }),
        Project.countDocuments(),
        Contact.find().sort({ createdAt: -1 }).limit(5).exec(),
      ]);
      stats.messages = messages;
      stats.newMessages = newMessages;
      stats.read = read;
      stats.archived = archived;
      stats.projects = projects;
      recent = docs;
    } catch (error) {
      console.error('[admin] Stats query failed:', error.message);
    }
  }

  const flash = req.session.flash || null;
  delete req.session.flash;

  return res.render('admin/dashboard', { title: 'Admin', stats, recent, statuses: STATUSES, flash });
}

module.exports = { dashboard };