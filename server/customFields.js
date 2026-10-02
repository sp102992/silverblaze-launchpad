// ─────────────────────────────────────────────────────────────────────────
// DESIGNER-DEFINED CUSTOM FIELDS (VENDOR TEMPLATE FIELDS)
//
// Lets a Designer add ad-hoc fields to any intake section ("vendor
// template") without a code deployment. Two full copies live on disk:
//   - server/data/customFields.json       — PUBLISHED / live. This is the
//     only copy every real form (manager dashboard, customer share-link
//     page) and Smartsheet column provisioning ever reads from.
//   - server/data/customFieldsDraft.json  — DRAFT. This is the only copy
//     the Designer's Manage Fields admin UI reads from and writes to. It
//     starts as a copy of whatever is currently published, then diverges as
//     the Designer adds/edits/deletes/reorders fields. None of that is
//     visible anywhere else until the Designer explicitly publishes.
//   - server/data/customFieldsMeta.json   — just { lastPublishedAt,
//     lastPublishedBy }, written only by publishDraft().
//
// Every function below takes an optional trailing `store` argument
// ('draft' | 'published', defaults to 'published') so the exact same
// create/update/deactivate/reorder logic serves both the live app and the
// Designer's draft — the only difference is which JSON file it touches.
//
// STABLE IDS, NOT LABELS: every field gets a permanent internal id the
// moment it's created (e.g. "cf_site_contact_a1b2c3"). The Smartsheet column
// this field writes to is always titled `Custom: <id>` — never the display
// label. That's deliberate:
//   - Renaming a field only changes `label` here; the Smartsheet column
//     title never changes, so no data is ever orphaned by a rename.
//   - Re-running/refreshing never creates a duplicate column, because
//     smartsheetClient.addColumnIfMissing() checks for that exact
//     "Custom: <id>" title before creating anything.
//   - Deleting a field only sets `active: false` here. The Smartsheet
//     column and any values already in it are left alone — this app never
//     issues a delete-column call, so there's no risk of taking unrelated
//     data with it.
//   - Because a draft field keeps the exact same id all the way through to
//     publish, publishing never creates a second Smartsheet column for what
//     is really the same field.
// ─────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fieldSlots = require('./fieldSlots');

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILES = {
  published: path.join(DATA_DIR, 'customFields.json'),
  draft: path.join(DATA_DIR, 'customFieldsDraft.json'),
};
const META_FILE = path.join(DATA_DIR, 'customFieldsMeta.json');

const FIELD_TYPES = ['text', 'dropdown', 'date'];

function ensureStore(store) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = STORE_FILES[store];
  if (!fs.existsSync(file)) {
    // A brand-new draft starts as a copy of whatever is already published,
    // so a Designer's first visit shows the real current state rather than
    // an empty list they'd have to rebuild from scratch.
    if (store === 'draft' && fs.existsSync(STORE_FILES.published)) {
      fs.writeFileSync(file, fs.readFileSync(STORE_FILES.published, 'utf8'));
    } else {
      fs.writeFileSync(file, '[]');
    }
  }
}

function readAll(store = 'published') {
  ensureStore(store);
  try {
    return JSON.parse(fs.readFileSync(STORE_FILES[store], 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeAll(list, store = 'published') {
  ensureStore(store);
  fs.writeFileSync(STORE_FILES[store], JSON.stringify(list, null, 2));
}

// Meta is keyed per-section — { [sectionKey]: { lastPublishedAt, lastPublishedBy } }
// — since Publish is now a per-vendor action (see publishSection below), not
// a single global "publish everything" action like the old Manage Fields page.
function readAllMeta() {
  try {
    return JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}
function readMeta(sectionKey) {
  const all = readAllMeta();
  return all[sectionKey] || { lastPublishedAt: null, lastPublishedBy: null };
}

// True the moment a Designer's draft differs from what's actually live —
// drives the "Draft changes — not published" badge and the unsaved-changes
// leave-page warning. A brand-new draft is seeded as an exact copy of
// published (see ensureStore above), so this correctly starts out false.
function hasPendingChanges() {
  return JSON.stringify(readAll('draft')) !== JSON.stringify(readAll('published'));
}

// Same idea, scoped to one vendor/section — powers the per-vendor draft
// badge and Publish button in the inline Designer editing UI. Compares only
// that section's slice of each store, so an in-progress draft on one vendor
// never shows as "pending" on an unrelated vendor's page.
function hasPendingChangesForSection(sectionKey) {
  const draftSlice = readAll('draft').filter((f) => f.sectionKey === sectionKey);
  const publishedSlice = readAll('published').filter((f) => f.sectionKey === sectionKey);
  return JSON.stringify(draftSlice) !== JSON.stringify(publishedSlice);
}

// Copies the draft over the published file verbatim — this is the ONE
// moment a Designer's changes become globally live. Records who/when for
// the "Last published by/at" indicator.
function publishDraft(publishedBy) {
  const draft = readAll('draft');
  writeAll(draft, 'published');
  const meta = { lastPublishedAt: new Date().toISOString(), lastPublishedBy: publishedBy || null };
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
  return { fields: draft, meta };
}

// Publishes ONLY one vendor/section's draft fields — every other section's
// published data is left completely untouched, including any of ITS OWN
// still-unpublished draft changes (those simply stay in draft until that
// section is published separately). This is what makes Publish a per-vendor
// action: working on Payment Vendor and publishing it never touches
// whatever a Designer has half-finished on CIS Integration.
function publishSection(sectionKey, publishedBy) {
  const draftAll = readAll('draft');
  const publishedAll = readAll('published');
  const sectionDraftFields = draftAll.filter((f) => f.sectionKey === sectionKey);
  const otherPublished = publishedAll.filter((f) => f.sectionKey !== sectionKey);
  const newPublished = [...otherPublished, ...sectionDraftFields];
  writeAll(newPublished, 'published');
  const sectionMeta = { lastPublishedAt: new Date().toISOString(), lastPublishedBy: publishedBy || null };
  const allMeta = readAllMeta();
  allMeta[sectionKey] = sectionMeta;
  fs.writeFileSync(META_FILE, JSON.stringify(allMeta, null, 2));
  return { fields: sectionDraftFields, meta: sectionMeta };
}

function slug(label) {
  return (label || 'field').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'field';
}

// The one and only place that decides a custom field's Smartsheet column
// title — always derived from the stable id, never the label.
function columnTitleFor(field) {
  return `Custom: ${field.id}`;
}

function smartsheetTypeFor(field) {
  return field.type === 'date' ? 'DATE' : 'TEXT_NUMBER';
}

function listAll(store = 'published') {
  return readAll(store);
}

// Sorted by `order` ascending so a section's fields (and the slot they're
// placed in) render in a stable, Designer-controlled sequence — see
// reorderSection() below. Fields without an order yet (shouldn't normally
// happen) sort last, by creation time, rather than randomly.
function listForSection(sectionKey, { includeInactive } = {}, store = 'published') {
  return readAll(store)
    .filter((f) => f.sectionKey === sectionKey && (includeInactive || f.active !== false))
    .sort((a, b) => {
      const ao = a.order === undefined ? Infinity : a.order;
      const bo = b.order === undefined ? Infinity : b.order;
      if (ao !== bo) return ao - bo;
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    });
}

function getById(id, store = 'published') {
  return readAll(store).find((f) => f.id === id) || null;
}

function createField({ sectionKey, label, type, options, required, slot }, store = 'published') {
  if (!sectionKey || !String(sectionKey).trim()) throw new Error('A section is required.');
  if (!label || !label.trim()) throw new Error('A field label is required.');
  if (!FIELD_TYPES.includes(type)) throw new Error(`Unsupported field type "${type}". Use one of: ${FIELD_TYPES.join(', ')}.`);

  const list = readAll(store);
  const id = `cf_${slug(label)}_${crypto.randomBytes(3).toString('hex')}`;
  // New fields go to the end of their section's current order (append),
  // same visible effect as before — reordering afterward is what
  // reorderSection() is for.
  const sectionOrders = list.filter((f) => f.sectionKey === sectionKey).map((f) => (f.order === undefined ? -1 : f.order));
  const nextOrder = sectionOrders.length ? Math.max(...sectionOrders) + 1 : 0;
  const resolvedSlot = fieldSlots.isValidSlot(sectionKey, slot) ? slot : fieldSlots.defaultSlot(sectionKey);
  const field = {
    id,
    sectionKey,
    label: label.trim(),
    type,
    options: type === 'dropdown' ? (options || []).map((o) => String(o).trim()).filter(Boolean) : undefined,
    required: !!required,
    slot: resolvedSlot,
    order: nextOrder,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  list.push(field);
  writeAll(list, store);
  return field;
}

// Renaming/retyping/moving only ever touches this JSON record — the
// Smartsheet column (keyed by id) is completely unaffected, so existing
// values in it are never lost, and the field's position (slot/order) has no
// bearing whatsoever on its Smartsheet column mapping.
function updateField(id, { label, type, options, required, slot }, store = 'published') {
  const list = readAll(store);
  const field = list.find((f) => f.id === id);
  if (!field) throw new Error('Field not found: ' + id);
  if (label !== undefined) {
    if (!label.trim()) throw new Error('Label cannot be empty.');
    field.label = label.trim();
  }
  if (type !== undefined) {
    if (!FIELD_TYPES.includes(type)) throw new Error(`Unsupported field type "${type}".`);
    field.type = type;
  }
  if (options !== undefined) field.options = (options || []).map((o) => String(o).trim()).filter(Boolean);
  if (required !== undefined) field.required = !!required;
  if (slot !== undefined) {
    if (!fieldSlots.isValidSlot(field.sectionKey, slot)) throw new Error('Unknown slot "' + slot + '" for section ' + field.sectionKey);
    field.slot = slot;
  }
  field.updatedAt = new Date().toISOString();
  writeAll(list, store);
  return field;
}

// Bulk-persists a Designer's drag-and-drop reorder of a section's custom
// fields — `orderedIds` is the full list of that section's active custom
// field ids in the new desired order. Order is stored on the same stable
// JSON record used for Smartsheet mapping, so it has zero effect on that
// mapping, and survives refresh/logout/retrieve exactly like every other
// field property.
function reorderSection(sectionKey, orderedIds, store = 'published') {
  const list = readAll(store);
  const byId = {};
  list.filter((f) => f.sectionKey === sectionKey).forEach((f) => { byId[f.id] = f; });
  orderedIds.forEach((id, idx) => {
    if (byId[id]) { byId[id].order = idx; byId[id].updatedAt = new Date().toISOString(); }
  });
  writeAll(list, store);
  return listForSection(sectionKey, {}, store);
}

// Soft-delete only. The field disappears from every form immediately once
// published, but its Smartsheet column and any data already in it are
// deliberately left in place — this app never calls Smartsheet's
// delete-column endpoint, so a mistaken delete can't take unrelated data
// with it.
function deactivateField(id, store = 'published') {
  const list = readAll(store);
  const field = list.find((f) => f.id === id);
  if (!field) throw new Error('Field not found: ' + id);
  field.active = false;
  field.updatedAt = new Date().toISOString();
  writeAll(list, store);
  return field;
}

// Called right before a section's sheet is read/written — idempotently
// makes sure every active custom field for that section already has a
// column on THIS project's sheet (handles both brand-new projects and ones
// created before the field existed).
async function ensureColumnsForSection(smartsheet, sheetId, sectionKey) {
  const fields = listForSection(sectionKey);
  for (const field of fields) {
    await smartsheet.addColumnIfMissing(sheetId, columnTitleFor(field), smartsheetTypeFor(field));
  }
}

module.exports = {
  FIELD_TYPES,
  listAll,
  listForSection,
  getById,
  createField,
  updateField,
  deactivateField,
  reorderSection,
  columnTitleFor,
  ensureColumnsForSection,
  hasPendingChanges,
  hasPendingChangesForSection,
  publishDraft,
  publishSection,
  readMeta,
};
