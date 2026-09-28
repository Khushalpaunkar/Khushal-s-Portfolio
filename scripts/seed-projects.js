/**
 * scripts/seed-projects.js
 *
 * Upserts the bundled project content from data/projects.js into MongoDB.
 *
 *   npm run seed
 *
 * Idempotent: matches on `slug`, so running it repeatedly updates the existing
 * documents instead of creating duplicates. Safe by default — it never drops
 * the collection. Pass --replace to delete projects that are no longer in the
 * seed file (this removes documents, so it is opt-in and asks first).
 *
 * Requires MONGODB_URI. Without it the script explains what to do and exits
 * non-zero rather than pretending to have seeded anything.
 */

require('dotenv').config();

const mongoose = require('mongoose');
const Project = require('../models/Project');
const seedProjects = require('../data/projects');

const REPLACE = process.argv.includes('--replace');

async function run() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    console.error('[seed] MONGODB_URI is not set — nothing was seeded.');
    console.error('[seed] Add your connection string to .env, then run: npm run seed');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[seed] Connected to ${mongoose.connection.name}`);

    if (REPLACE) {
      const wanted = seedProjects.map((p) => require('../models/Project').slugify(p.title));
      const result = await Project.deleteMany({ slug: { $nin: wanted } });
      if (result.deletedCount) {
        console.log(`[seed] Removed ${result.deletedCount} project(s) no longer in the seed file.`);
      }
    }

    // Slug is derived from the title, and the schema's pre-validate hook does
    // the same, so the two paths always agree.
    const slugs = new Set();
    for (const data of seedProjects) {
      const slug = Project.slugify(data.title);
      if (slugs.has(slug)) {
        console.error(`[seed] Duplicate title in seed file: "${data.title}" (slug "${slug}")`);
        process.exit(1);
      }
      slugs.add(slug);

      await Project.findOneAndUpdate(
        { slug },
        { $set: { ...data, slug } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      console.log(`[seed] upserted ${slug}`);
    }

    const total = await Project.countDocuments();
    console.log(`[seed] Done. ${seedProjects.length} seeded, ${total} in the collection.`);
  } catch (error) {
    console.error('[seed] Failed:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
