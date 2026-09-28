/**
 * controllers/projectController.js
 * Admin: manage the project collection.
 *
 * Honesty rule carried over from the rest of the site: the public portfolio
 * serves bundled seed data whenever MongoDB is offline, so the admin list
 * shows that same data with a notice, and every write refuses with a clear
 * message until the database is reachable.
 *
 * The fallback is reserved for exactly that case. When the database is
 * reachable but holds no projects, the editor reports the true empty state —
 * a phantom seed entry would make a fresh create look like a twin, then vanish
 * the moment other rows arrive (Phase 16).
 *
 * Validation is delegated to the Project schema — the same single source of
 * truth that guards the seed data and the API.
 */

const mongoose = require('mongoose');
const Project = require('../models/Project');
const { fromSeed } = require('../services/projectService');
const db = require('../config/db');
const csrf = require('../utils/csrf');
const validation = require('../utils/validation');

const { stringField, hasText, mapValidationErrors } = validation;
const PLACEHOLDER_KINDS = Object.keys(require('../utils/icons').PLACEHOLDER_ICONS);

/** Fields the admin is allowed to set. Everything else is ignored. */
const ALLOWED_FIELDS = [
  'title',
  'shortDescription',
  'description',
  'problem',
  'solution',
  'category',
  'year',
  'image',
  'imageAlt',
  'placeholderIcon',
  'githubUrl',
  'liveUrl',
  'featured',
  'order',
];

function renderFlash(req, type, message) {
  req.session.flash = { type, message };
}

function readFlash(req) {
  const flash = req.session.flash || null;
  delete req.session.flash;
  return flash;
}

/** Splits a textarea/input into cleaned list values. */
function toList(value) {
  return String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Builds a plain payload from the form body, exactly the schema's field set. */
function buildPayload(body) {
  const payload = {};
  for (const field of ALLOWED_FIELDS) {
    payload[field] = body[field];
  }

  payload.shortDescription = stringField(payload.shortDescription);
  payload.description = stringField(payload.description);
  payload.problem = stringField(payload.problem);
  payload.solution = stringField(payload.solution);
  payload.category = stringField(payload.category) || 'Other';
  payload.imageAlt = stringField(payload.imageAlt);
  payload.features = toList(body.features);
  payload.technologies = toList(body.technologies);
  payload.tags = toList(body.tags);
  payload.featured = body.featured === 'on';
  payload.order = Number(body.order) || 0;

  const year = body.year;
  if (year === '' || year === null || year === undefined) {
    payload.year = null;
  } else {
    const parsedYear = Number(year);
    payload.year = Number.isNaN(parsedYear) ? null : parsedYear;
  }

  // Everything is white-listed, so a stray form field cannot widen the schema.
  return payload;
}

/** Ordered flat list for the admin table (seed only while the DB is offline). */
async function adminList() {
  const projects = [];
  let source = 'offline';

  if (db.isDbReady()) {
    try {
      const docs = await Project.find().sort({ featured: -1, order: 1 }).exec();
      projects.push(...docs);
      source = 'database';
    } catch (error) {
      console.error('[projects] Admin list failed:', error.message);
      source = 'error';
    }
  }

  // Offline or a failed read is the only time the bundled fallback belongs in
  // the editor. A reachable-but-empty collection is reported as empty: seeding
  // phantom rows here would resurrect the admin's own deletions and would
  // mislabel them as an offline state.
  if (!projects.length && source !== 'database') {
    const { featured, others } = fromSeed();
    projects.push(...[...featured, ...others]);
  }

  return { projects, source };
}

async function listProjects(req, res) {
  const { projects, source } = await adminList();
  return res.render('admin/projects', {
    title: 'Projects',
    projects,
    source,
    csrfToken: csrf.issue(req),
    flash: readFlash(req),
  });
}

function formView(res, req, project, errors, status) {
  return res.status(status || 200).render('admin/project-form', {
    title: project && project._id ? 'Edit project' : 'New project',
    project: project || {},
    errors,
    kinds: PLACEHOLDER_KINDS,
    csrfToken: req.session.csrfToken,
    flash: readFlash(req),
  });
}

async function projectForm(req, res, { editing }) {
  if (!editing) {
    return formView(res, req, {}, null);
  }

  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) {
    return res.status(404).render('admin/error', {
      title: 'Not Found',
      status: 404,
      message: 'That project does not exist.',
    });
  }

  let project = null;
  if (db.isDbReady()) {
    try {
      project = await Project.findById(id).exec();
    } catch (error) {
      console.error('[projects] Read failed:', error.message);
    }
  }

  if (!project) {
    return res.status(404).render('admin/error', {
      title: 'Not Found',
      status: 404,
      message: db.isDbReady()
        ? 'That project does not exist.'
        : 'Cannot edit a project while MongoDB is offline.',
    });
  }

  return formView(res, req, project, null);
}

async function saveProject(req, res, { editing }) {
  const payload = buildPayload(req.body);
  const id = editing ? req.params.id : null;

  if (editing && !mongoose.isValidObjectId(id)) {
    return res.status(404).render('admin/error', {
      title: 'Not Found',
      status: 404,
      message: 'That project does not exist.',
    });
  }

  if (!db.isDbReady()) {
    return res.status(503).render('admin/error', {
      title: 'Unavailable',
      status: 503,
      message: 'Projects cannot be saved while MongoDB is offline.',
    });
  }

  let existing = null;
  if (editing) {
    existing = await Project.findById(id).exec().catch(() => null);
    if (!existing) {
      return res.status(404).render('admin/error', {
        title: 'Not Found',
        status: 404,
        message: 'That project does not exist.',
      });
    }
  }

  const doc = editing ? existing : new Project(payload);
  if (editing) {
    existing.set(payload);
    // A changed title should give a fresh slug; the pre('validate') hook only
    // kicks in when slug is empty, so normalise it here.
    if (existing.isModified('title')) existing.slug = undefined;
  }

  try {
    await doc.validate();
  } catch (error) {
    const entered = { ...payload, _id: editing ? existing._id : undefined };
    return formView(res, req, entered, mapValidationErrors(error), 400);
  }

  try {
    await doc.save();
  } catch (error) {
    // Unique slug collision (rare — the hook defers to the index).
    if (error && error.code === 11000) {
      const entered = { ...payload, _id: editing ? existing._id : undefined };
      return formView(res, req, entered, { slug: 'A project with this title already exists.' }, 409);
    }
    console.error('[projects] Save failed:', error.message);
    const entered = { ...payload, _id: editing ? existing._id : undefined };
    return formView(res, req, entered, { _form: 'Could not save the project.' }, 500);
  }

  renderFlash(req, 'ok', editing ? 'Project updated.' : 'Project created.');
  return res.redirect('/admin/projects');
}

async function deleteProject(req, res) {
  const { id } = req.params;

  if (req.body.confirm !== 'on') {
    renderFlash(req, 'error', 'Tick the confirmation box before deleting.');
    return res.redirect(`/admin/projects/${id}/edit`);
  }

  if (!db.isDbReady()) {
    renderFlash(req, 'error', 'Cannot delete projects while MongoDB is offline.');
    return res.redirect('/admin/projects');
  }

  try {
    const removed = await Project.findByIdAndDelete(id).exec();
    if (!removed) {
      renderFlash(req, 'error', 'That project does not exist.');
    } else {
      renderFlash(req, 'ok', 'Project deleted.');
    }
  } catch (error) {
    console.error('[projects] Delete failed:', error.message);
    renderFlash(req, 'error', 'Could not delete the project.');
  }

  return res.redirect('/admin/projects');
}

module.exports = { listProjects, projectForm, saveProject, deleteProject, buildPayload, ALLOWED_FIELDS };