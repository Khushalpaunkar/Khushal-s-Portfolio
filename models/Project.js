/**
 * models/Project.js
 *
 * A single project shown in the portfolio. `featured` projects are rendered in
 * the large, visually dominant cards; everything else goes in the smaller grid.
 *
 * Link policy: `githubUrl` and `liveUrl` are optional and may be empty. An
 * empty URL means "no link exists" and the UI hides the button entirely — it
 * must never render a dead or invented link.
 */

const mongoose = require('mongoose');
const { isDbReady } = require('../config/db');

/** Lowercase, hyphenated, ASCII-safe slug. */
function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Accepts only empty or a well-formed http(s) URL. */
function urlValidator(value) {
  if (!value) return true; // empty is valid: the link simply will not be shown
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const projectSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      maxlength: [120, 'Title cannot exceed 120 characters'],
    },

    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    shortDescription: {
      type: String,
      trim: true,
      maxlength: [200, 'Short description cannot exceed 200 characters'],
      default: '',
    },

    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
      default: '',
    },

    problem: {
      type: String,
      trim: true,
      maxlength: [2000, 'Problem cannot exceed 2000 characters'],
      default: '',
    },

    solution: {
      type: String,
      trim: true,
      maxlength: [2000, 'Solution cannot exceed 2000 characters'],
      default: '',
    },

    features: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.length <= 12,
        message: 'A project cannot have more than 12 features',
      },
    },

    technologies: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.length <= 20,
        message: 'A project cannot have more than 20 technologies',
      },
    },

    category: {
      type: String,
      trim: true,
      maxlength: [60, 'Category cannot exceed 60 characters'],
      default: 'Other',
      index: true,
    },

    /* Short contextual labels shown as badges, e.g. "4th Sem". Distinct from
       `category`, which names the kind of project. */
    tags: {
      type: [String],
      default: [],
      validate: {
        validator: (list) => list.length <= 5,
        message: 'A project cannot have more than 5 tags',
      },
    },

    year: {
      type: Number,
      min: [1990, 'Year looks invalid'],
      max: [2100, 'Year looks invalid'],
      default: null,
    },

    image: {
      type: String,
      trim: true,
      default: '',
    },

    /* Descriptive alt text for `image`. Falls back to the title when empty,
       so a screenshot is never announced as an unlabelled image. */
    imageAlt: {
      type: String,
      trim: true,
      maxlength: [160, 'Image alt text cannot exceed 160 characters'],
      default: '',
    },

    /* Semantic kind of the icon shown in place of a screenshot, e.g. "sprout".
       The Font Awesome class is resolved by utils/icons.js, so no CSS class is
       ever stored. Unknown kinds fall back to a neutral glyph. */
    placeholderIcon: {
      type: String,
      trim: true,
      default: 'code',
    },

    githubUrl: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: urlValidator,
        message: 'GitHub URL must be a valid http(s) URL or left empty',
      },
    },

    liveUrl: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator: urlValidator,
        message: 'Live URL must be a valid http(s) URL or left empty',
      },
    },

    featured: {
      type: Boolean,
      default: false,
      index: true,
    },

    order: {
      type: Number,
      default: 0,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Featured projects first, then by manual ordering.
projectSchema.index({ featured: -1, order: 1 });

/**
 * Generates a slug from the title before every validation pass.
 *
 * The base slug is assigned synchronously, so it is always present even when
 * the database is offline. The uniqueness lookup only runs when a connection is
 * actually available; if a genuine collision is ever saved offline, the unique
 * index is the final backstop.
 */
projectSchema.pre('validate', async function generateSlug() {
  if (this.slug || !this.title) return;

  const base = slugify(this.title) || `project-${Date.now()}`;
  this.slug = base;

  if (!isDbReady()) return;

  let suffix = 1;
  for (;;) {
    const clash = await this.constructor
      .findOne({ slug: this.slug, _id: { $ne: this._id } })
      .exec();

    if (!clash) return;

    suffix += 1;
    this.slug = `${base}-${suffix}`;
  }
});

module.exports = mongoose.model('Project', projectSchema);
module.exports.slugify = slugify;
