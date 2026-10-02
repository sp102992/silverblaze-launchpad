// ─────────────────────────────────────────────────────────────────────────
// DESIGNER-DEFINED CUSTOM FIELDS (VENDOR TEMPLATE FIELDS) — routes
//
// Two audiences hit this file:
//   1. Designers, editing fields inline directly within each vendor's real
//      intake form (public/app.js renderDesignerSection()) — full CRUD,
//      requires a signed-in session with role === 'designer'. Managers are
//      explicitly blocked here at the API level (403), not just hidden in
//      the UI — see requireDesigner() below. Everything a Designer does
//      through these routes operates on the DRAFT copy
//      (server/customFields.js) and only becomes globally live once that
//      one vendor is published via POST /publish/:sectionKey.
//   2. Anyone rendering a section's form (manager dashboard OR the public,
//      token-based customer link page) — just needs the list of active
//      PUBLISHED custom fields for ONE section, so the form can draw the
//      right extra inputs. This half is intentionally unauthenticated,
//      mirroring how the built-in field list for a section is already
//      public information exposed through routes/customer.js, and it never
//      sees draft/unpublished fields.
// ─────────────────────────────────────────────────────────────────────────
const express = require('express');
const { requireAuth } = require('../authMiddleware');
const { SECTIONS } = require('../sectionSchemas');
const customFields = require('../customFields');
const fieldSlots = require('../fieldSlots');
const fieldOverrides = require('../fieldOverrides');

const router = express.Router();

function requireDesigner(req, res, next) {
  if (!req.session || !req.session.loggedIn) return res.status(401).json({ error: 'Not signed in.' });
  if (req.session.role !== 'designer') return res.status(403).json({ error: 'Only a Designer can manage vendor template fields.' });
  next();
}

// Public: active PUBLISHED custom fields for one section (used by both the
// manager dashboard and the public customer-link form to render extra
// inputs, already sorted into the Designer-configured display order). This
// never reflects a Designer's unpublished draft.
router.get('/section/:sectionKey', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  res.json({ fields: customFields.listForSection(sectionKey, {}, 'published') });
});

// Public: the slots (existing cards) a field can be placed into for a given
// section — needed by the "Add a field" form's placement dropdown.
router.get('/slots/:sectionKey', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  res.json({ slots: fieldSlots.slotsFor(sectionKey) });
});

// Public: PUBLISHED rename/hide overrides for one section's pre-existing
// (hardcoded) fields, keyed by fieldId — e.g. { biz_name: { label: "Legal
// business name" }, biz_fax: { hidden: true } }. Read by the manager
// dashboard and the customer share-link page right after they render a
// section's built-in fields, so a Designer's rename/hide shows up the same
// way on every real form. Never reflects a Designer's unpublished draft.
router.get('/overrides/section/:sectionKey', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  res.json({ overrides: fieldOverrides.listForSection(sectionKey, 'published') });
});

// Designer-only from here down. A manager (or team member) hitting any of
// these directly gets a 403 — the restriction is enforced here, not just by
// hiding the nav item client-side.
router.use(requireAuth, requireDesigner);

// Draft copy of one section's fields, for the inline "manage fields directly
// within the vendor's intake form" editing experience — every real form
// (manager dashboard, customer share link) only ever reads the PUBLISHED
// copy via the public /section/:sectionKey route above; this is the one
// route that lets a Designer see their own not-yet-published edits.
router.get('/section/:sectionKey/draft', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  res.json({ fields: customFields.listForSection(sectionKey, { includeInactive: true }, 'draft') });
});

// Draft rename/hide overrides for one section's hardcoded fields — the
// Designer-only counterpart to the public route above, so the inline editor
// can show a field's already-drafted (but not yet published) rename or
// hidden state when the Designer revisits the section.
router.get('/overrides/section/:sectionKey/draft', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  res.json({ overrides: fieldOverrides.listForSection(sectionKey, 'draft') });
});

// Sets (or clears) the rename/hide override for one hardcoded field. Body:
// { label } to rename (empty string clears the rename back to the field's
// original wording), and/or { hidden } to hide/restore it. This never
// touches server/sectionSchemas.js, the actual HTML input, or the
// Smartsheet column that field's id maps to — only how it displays.
router.put('/overrides/:sectionKey/:fieldId', (req, res) => {
  const { sectionKey, fieldId } = req.params;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  const { label, hidden } = req.body || {};
  try {
    const override = fieldOverrides.setOverride(sectionKey, fieldId, { label, hidden }, 'draft');
    res.json({ ok: true, override });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Per-vendor draft status — powers that vendor's "Draft changes — not
// published" badge and the unsaved-changes leave-page warning. Scoped to one
// sectionKey so working on Payment Vendor never shows as "pending" on CIS
// Integration's page, or vice versa.
// Pending covers BOTH Designer-added custom fields AND rename/hide
// overrides on hardcoded fields for this vendor — a Designer sees one
// combined "Draft changes — not published" badge per vendor, not two.
router.get('/status/:sectionKey', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  const meta = customFields.readMeta(sectionKey);
  const pending = customFields.hasPendingChangesForSection(sectionKey) || fieldOverrides.hasPendingChangesForSection(sectionKey);
  res.json({ pending, lastPublishedAt: meta.lastPublishedAt, lastPublishedBy: meta.lastPublishedBy });
});

// Publishes ONE vendor's current draft — the one moment that vendor's field
// changes become globally live for every project's forms and Smartsheet
// columns. Every other vendor's draft/published state is untouched (see
// customFields.publishSection) — this is deliberately a per-vendor action,
// not a single "publish everything" button. Also publishes this same
// vendor's hardcoded-field overrides in the same call, so there is still
// only one Publish button per vendor, covering both Designer-added fields
// and renamed/hidden built-in ones.
router.post('/publish/:sectionKey', (req, res) => {
  const sectionKey = req.params.sectionKey;
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  const { fields, meta } = customFields.publishSection(sectionKey, req.session.username);
  fieldOverrides.publishSection(sectionKey);
  res.json({ ok: true, fields, lastPublishedAt: meta.lastPublishedAt, lastPublishedBy: meta.lastPublishedBy });
});

// Full DRAFT list (including inactive), grouped by nothing in particular —
// the admin UI groups client-side by sectionKey.
router.get('/', (req, res) => {
  res.json({
    fields: customFields.listAll('draft'),
    sections: Object.keys(SECTIONS).map((key) => ({ key, label: SECTIONS[key].label })),
    slots: fieldSlots.SECTION_SLOTS,
  });
});

router.post('/', (req, res) => {
  const { sectionKey, label, type, options, required, slot } = req.body || {};
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  try {
    const field = customFields.createField({ sectionKey, label, type, options, required, slot }, 'draft');
    res.json({ ok: true, field });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { label, type, options, required, slot } = req.body || {};
  try {
    const field = customFields.updateField(req.params.id, { label, type, options, required, slot }, 'draft');
    res.json({ ok: true, field });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const field = customFields.deactivateField(req.params.id, 'draft');
    res.json({ ok: true, field });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Bulk-persist a Designer's drag-and-drop reorder of one section's custom
// fields. Body: { sectionKey, orderedIds: [id, id, ...] }.
router.post('/reorder', (req, res) => {
  const { sectionKey, orderedIds } = req.body || {};
  if (!SECTIONS[sectionKey]) return res.status(400).json({ error: 'Unknown section: ' + sectionKey });
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array.' });
  try {
    const fields = customFields.reorderSection(sectionKey, orderedIds, 'draft');
    res.json({ ok: true, fields });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
