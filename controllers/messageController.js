/**
 * controllers/messageController.js
 * Admin inbox: read, filter, page, and manage contact messages.
 *
 * The inbox is inherently database-bound — unlike the public portfolio there
 * is no bundled fallback for messages. So when MongoDB is offline the pages
 * render empty with a clear notice, and every action is a no-op with a flash.
 *
 * Phase 13 added pagination (20 per page) plus per-status counts, so an inbox
 * that outgrows one screen stays navigable and the filters show what is
 * waiting.
 */

const mongoose = require('mongoose');
const Contact = require('../models/Contact');
const db = require('../config/db');
const csrf = require('../utils/csrf');

const STATUSES = ['new', 'read', 'archived'];
const PAGE_SIZE = 20;

/** Any junk in ?page= falls back to page 1; only whole pages >= 1 are legal. */
function parsePage(value) {
  const page = Number.parseInt(value, 10);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function renderFlash(req, type, message) {
  req.session.flash = { type, message };
}

async function listMessages(req, res) {
  const filter = STATUSES.includes(req.query.filter) ? req.query.filter : 'all';
  const page = parsePage(req.query.page);
  const messages = [];
  const counts = { new: 0, read: 0, archived: 0 };
  let total = 0;
  let source = 'offline';

  if (db.isDbReady()) {
    try {
      const query = filter === 'all' ? {} : { status: filter };
      const [docs, count, newCount, readCount, archivedCount] = await Promise.all([
        Contact.find(query)
          .sort({ status: 1, createdAt: -1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .exec(),
        Contact.countDocuments(query),
        Contact.countDocuments({ status: 'new' }),
        Contact.countDocuments({ status: 'read' }),
        Contact.countDocuments({ status: 'archived' }),
      ]);
      messages.push(...docs);
      total = count;
      counts.new = newCount;
      counts.read = readCount;
      counts.archived = archivedCount;
      source = 'database';
    } catch (error) {
      console.error('[messages] List failed:', error.message);
      source = 'error';
    }
  }

  const flash = req.session.flash || null;
  delete req.session.flash;

  return res.render('admin/messages', {
    title: 'Messages',
    messages,
    filter,
    page,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    counts,
    source,
    statuses: STATUSES,
    csrfToken: csrf.issue(req),
    flash,
  });
}

async function showMessage(req, res) {
  const { id } = req.params;
  const flash = req.session.flash || null;
  delete req.session.flash;

  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).render('admin/error', {
      title: 'Not Found',
      status: 404,
      message: 'That message does not exist.',
    });
  }

  let message = null;
  if (db.isDbReady()) {
    try {
      message = await Contact.findById(id).exec();
    } catch (error) {
      console.error('[messages] Read failed:', error.message);
    }
  }

  if (!message) {
    return res.status(404).render('admin/error', {
      title: 'Not Found',
      status: 404,
      message: db.isDbReady()
        ? 'That message does not exist.'
        : 'Cannot open a message while MongoDB is offline.',
    });
  }

  return res.render('admin/message', {
    title: 'Message',
    message,
    csrfToken: csrf.issue(req),
    flash,
  });
}

async function setMessageStatus(req, res) {
  const { id } = req.params;
  const status = STATUSES.includes(req.body.status) ? req.body.status : null;

  if (!status) {
    renderFlash(req, 'error', 'That status is not valid.');
    return res.redirect('/admin/messages');
  }

  if (!db.isDbReady()) {
    renderFlash(req, 'error', 'Cannot update messages while MongoDB is offline.');
    return res.redirect(`/admin/messages/${id}`);
  }

  try {
    const updated = await Contact.findByIdAndUpdate(id, { status }, { new: true }).exec();
    if (!updated) {
      renderFlash(req, 'error', 'That message does not exist.');
    } else {
      renderFlash(req, 'ok', 'Message status updated.');
    }
  } catch (error) {
    console.error('[messages] Status update failed:', error.message);
    renderFlash(req, 'error', 'Could not update the message.');
  }

  return res.redirect(`/admin/messages/${id}`);
}

async function deleteMessage(req, res) {
  const { id } = req.params;

  // Destructive action: requires an explicit check by the human.
  if (req.body.confirm !== 'on') {
    renderFlash(req, 'error', 'Tick the confirmation box before deleting.');
    return res.redirect(`/admin/messages/${id}`);
  }

  if (!db.isDbReady()) {
    renderFlash(req, 'error', 'Cannot delete messages while MongoDB is offline.');
    return res.redirect(`/admin/messages/${id}`);
  }

  try {
    const removed = await Contact.findByIdAndDelete(id).exec();
    if (!removed) {
      renderFlash(req, 'error', 'That message does not exist.');
    } else {
      renderFlash(req, 'ok', 'Message deleted.');
    }
  } catch (error) {
    console.error('[messages] Delete failed:', error.message);
    renderFlash(req, 'error', 'Could not delete the message.');
  }

  return res.redirect('/admin/messages');
}

module.exports = { listMessages, showMessage, setMessageStatus, deleteMessage };