// ─────────────────────────────────────────────────────────────────────────
// HARDCODED FIELD OVERRIDES
//
// Lets a Designer rename the display label of, or hide, one of a vendor
// section's pre-existing ("hardcoded") fields — the same inline, per-vendor,
// draft-until-published editing experience server/customFields.js already
// gives for Designer-ADDED fields, but for fields that already exist in the
// real HTML markup and Smartsheet schema.
//
// Deliberately narrow. A hardcoded field's type, its Smartsheet column
// (defined by its stable field id in server/sectionSchemas.js), and its
// required-ness are never touched here — changing those would mean the
// static HTML input no longer matches what the schema/column expects. Only
// two things can ever be overridden:
//   - label  — the text shown next to the field. Renaming never changes the
//              Smartsheet column, which is keyed off the field's id, not
//              its label — exactly like renaming a custom field.
//   - hidden — true hides the field's wrapper on every real form (manager
//              dashboard + customer share-link) and, because the existing
//              required-field check already skips anything with no visible
//              layout box, it's automatically skipped by validation too.
//              It is NEVER removed from Smartsheet — the column and any
//              data already in it are left completely alone, the same
//              guarantee deleting a custom field already gives.
//
// Same draft/published/per-section-publish shape as customFields.js: two
// JSON files on disk, keyed by "sectionKey:fieldId", and
// hasPendingChangesForSection()/publishSection() so a single vendor's
// existing Publish button (server/routes/customFields.js) covers overrides
// too — there is still only one Publish action per vendor, never a second
// one bolted on for "renamed/hidden fields".
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILES = {
  published: path.join(DATA_DIR, 'fieldOverrides.json'),
  draft: path.join(DATA_DIR, 'fieldOverridesDraft.json'),
};

function ensureStore(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = STORE_FILES[store];
  if (!fs.existsSync(file)) {
    // A brand-new draft starts as a copy of whatever is already published,
    // exactly like customFields.js's draft — a Designer's first visit shows
    // the real current state, not an empty slate.
    if (store === 'draft' && fs.existsSync(STORE_FILES.published)) {
      fs.writeFileSync(file, fs.readFileSync(STORE_FILES.published, 'utf8'));
    } else {
      fs.writeFileSync(file, '{}');
    }
  }
}

function readStore(store) {
  ensureStore(store);
  try {
    return JSON.parse(fs.readFileSync(STORE_FILES[store], 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeStore(store, data) {
  ensureStore(store);
  fs.writeFileSync(STORE_FILES[store], JSON.stringify(data, null, 2));
}

function keyFor(sectionKey, fieldId) {
  return sectionKey + ':' + fieldId;
}

// All overrides for one section, keyed by bare fieldId (not the combined
// "sectionKey:fieldId" key) since that's what every caller already
// addresses a field by — e.g. { biz_name: { label, hidden }, ... }.
function listForSection(sectionKey, store = 'published') {
  const all = readStore(store);
  const out = {};
  Object.keys(all).forEach((k) => {
    if (k.startsWith(sectionKey + ':')) out[k.slice(sectionKey.length + 1)] = all[k];
  });
  return out;
}

// Sets (or clears) the override for one field. Passing an empty label
// clears just the rename; passing hidden:false clears just the hide. Once a
// field has neither a label override nor hidden:true, its entry is removed
// entirely rather than left behind as a no-op — keeps the file from
// accumulating dead entries for fields a Designer touched and then put
// back the way they were.
function setOverride(sectionKey, fieldId, { label, hidden } = {}, store = 'draft') {
  const all = readStore(store);
  const key = keyFor(sectionKey, fieldId);
  const existing = all[key] || {};
  const next = { ...existing };
  if (label !== undefined) {
    if (label) next.label = label;
    else delete next.label;
  }
  if (hidden !== undefined) {
    if (hidden) next.hidden = true;
    else delete next.hidden;
  }
  if (!next.label && !next.hidden) {
    delete all[key];
  } else {
    all[key] = next;
  }
  writeStore(store, all);
  return all[key] || null;
}

function hasPendingChangesForSection(sectionKey) {
  const draft = listForSection(sectionKey, 'draft');
  const published = listForSection(sectionKey, 'published');
  return JSON.stringify(draft) !== JSON.stringify(published);
}

// Copies just this section's draft overrides over published — every other
// section's published overrides are left completely untouched, same
// per-vendor isolation as customFields.js's publishSection().
function publishSection(sectionKey) {
  const draftAll = readStore('draft');
  const pubAll = readStore('published');
  Object.keys(pubAll).forEach((k) => {
    if (k.startsWith(sectionKey + ':')) delete pubAll[k];
  });
  Object.keys(draftAll).forEach((k) => {
    if (k.startsWith(sectionKey + ':')) pubAll[k] = draftAll[k];
  });
  writeStore('published', pubAll);
  return listForSection(sectionKey, 'published');
}

module.exports = { listForSection, setOverride, hasPendingChangesForSection, publishSection };
